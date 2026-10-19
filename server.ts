import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db, SESSION_TTL_MS } from './server/db.ts';
import type { Order } from './server/db.ts';
import { validateGuestCheckout } from './src/utils/orderValidation.ts';
import { calculateDiscount, calculateOrderPricing, calculateSubtotal, validateCoupon } from './src/utils/pricing.ts';
import type { CartItem } from './src/utils/pricing.ts';
import { uploadToCloudinary, deleteFromCloudinary, CLOUDINARY_CONFIG, testCloudinaryConnection } from './server/cloudinary.ts';
import { checkFirestoreStatus, syncProductToFirestore, deleteProductFromFirestore, migrateStoreToFirestore, FIREBASE_CONFIG } from './server/firebase.ts';
import { verifyFirebaseIdToken, FirebaseAuthUnavailableError } from './server/firebaseAuth.ts';
import {
  ADMIN_CSRF_HEADER,
  ADMIN_CSRF_VALUE,
  ADMIN_RECENT_AUTH_MS,
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  decideFirebaseAdmin,
  isRecentAuthentication,
  parseAdminUids,
  parseCookies,
  requiresAdminCsrfHeader,
  serializeAdminSessionCookie
} from './server/adminSecurity.ts';

const app = express();

const parsedPort = Number(process.env.PORT);
const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const BODY_LIMIT = process.env.BODY_LIMIT || '25mb';
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const DATA_DIR = process.env.ZAMZAM_DATA_DIR
  ? path.resolve(process.env.ZAMZAM_DATA_DIR)
  : path.join(process.cwd(), 'data');
const UPLOADS_DIR = process.env.ZAMZAM_UPLOADS_DIR
  ? path.resolve(process.env.ZAMZAM_UPLOADS_DIR)
  : path.join(DATA_DIR, 'uploads');
const MAX_LOCAL_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Trusted administrator authorization configuration (server-only):
 *  - ADMIN_UIDS: comma-separated Firebase UIDs allowed to administer the store.
 *  - ALLOW_LOCAL_ADMIN=false disables the local recovery account entirely.
 */
const ADMIN_UIDS = parseAdminUids(process.env.ADMIN_UIDS);
const ALLOW_LOCAL_ADMIN = process.env.ALLOW_LOCAL_ADMIN !== 'false';
const COOKIE_SECURE = isProduction || process.env.ADMIN_COOKIE_SECURE === 'true';

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const API_RATE_LIMIT_PER_MIN = positiveInteger(process.env.API_RATE_LIMIT_PER_MIN, 300);
const TRACKING_RATE_LIMIT_PER_MIN = positiveInteger(process.env.TRACKING_RATE_LIMIT_PER_MIN, 30);

/**
 * Behind a hosting platform's reverse proxy, trust exactly one hop so `req.ip`
 * is the client (rate limiting) and `req.secure` reflects the forwarded HTTPS
 * scheme. Set TRUST_PROXY=false when the process is exposed directly.
 */
const TRUST_PROXY = process.env.TRUST_PROXY ?? (isProduction ? '1' : '');
if (TRUST_PROXY && TRUST_PROXY !== 'false') {
  if (TRUST_PROXY === 'true') app.set('trust proxy', true);
  else if (/^\d+$/.test(TRUST_PROXY)) app.set('trust proxy', Number(TRUST_PROXY));
  else app.set('trust proxy', TRUST_PROXY);
}

app.disable('x-powered-by');

// Baseline browser security headers. A strict Content-Security-Policy is left to
// the host/CDN because Firebase, Google Fonts and Cloudinary need allow-listing.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Framing is blocked in production (clickjacking defence). Development keeps
  // SAMEORIGIN so local preview/iframe tooling continues to work.
  res.setHeader('X-Frame-Options', isProduction ? 'DENY' : 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Correlate production logs and error responses without exposing internals.
app.use((req: Request, res: Response, next: NextFunction) => {
  const supplied = req.header('x-request-id');
  const requestId =
    supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// Optional HTTP→HTTPS redirect for a directly exposed process. Hosting proxies
// usually terminate TLS and redirect themselves; health checks are exempt.
if (FORCE_HTTPS) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health/live' || req.path === '/health/ready') return next();
    if (req.secure) return next();
    const host = req.get('host') || `localhost:${PORT}`;
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  });
}

// CORS: development additionally allows the local Vite origins. In production
// only explicit CORS_ORIGINS entries are allowed (same-origin needs no CORS).
const EXTRA_CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOWED_CORS_ORIGINS = new Set([
  ...(isProduction
    ? []
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']),
  ...EXTRA_CORS_ORIGINS
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (ALLOWED_CORS_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Idempotency-Key, X-Zamzam-Admin, X-Request-Id'
      );
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_CORS_ORIGINS.has(origin)) {
      return res.status(403).json({ error: 'This origin is not allowed.', code: 'CORS_ORIGIN_DENIED' });
    }
    return res.sendStatus(204);
  }
  next();
});

// In-memory rate limiting is suitable for this single-instance deployment.
// Swap for a shared store (Redis) before running multiple API instances.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(options: {
  windowMs: number;
  limit: number;
  scope: string;
  message: string;
}) {
  const { windowMs, limit, scope, message } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (rateBuckets.size > 10000) {
      for (const [key, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(key);
      }
    }
    const key = `${scope}:${clientAddress(req)}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    next();
  };
}

const apiRateLimit = createRateLimiter({
  windowMs: 60_000,
  limit: API_RATE_LIMIT_PER_MIN,
  scope: 'api',
  message: 'Too many requests. Please try again shortly.'
});
const trackingRateLimit = createRateLimiter({
  windowMs: 60_000,
  limit: TRACKING_RATE_LIMIT_PER_MIN,
  scope: 'tracking',
  message: 'Too many order-tracking requests. Please try again shortly.'
});

app.use('/api', apiRateLimit);

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Images uploaded while Cloudinary is not configured are stored on disk and
// served from the same origin as the storefront.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h' }));

// Administrator responses must never be cached by the browser or a proxy.
app.use('/api/admin', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==========================================
// ADMIN AUTHORIZATION (server is the authority)
// ==========================================

interface AdminPrincipal {
  provider: 'firebase' | 'local';
  identifier: string;
  username?: string;
  uid?: string;
  email?: string;
  mustChangePassword: boolean;
  /** When the administrator last proved possession of a credential. */
  authenticatedAt: number;
  recentAuth: boolean;
}

type AdminRequest = Request & { adminPrincipal?: AdminPrincipal };

interface AdminFailure {
  status: number;
  code: string;
  message: string;
  uid?: string;
  reason: string;
}

function auditSecurity(action: string, details: string, performedBy = 'anonymous'): void {
  try {
    db.recordSecurityEvent(action, details, performedBy);
  } catch (err: any) {
    console.error('[Security Audit]', err?.message || err);
  }
}

function setAdminCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    serializeAdminSessionCookie(token, { maxAgeMs: SESSION_TTL_MS, secure: COOKIE_SECURE })
  );
  res.setHeader('Cache-Control', 'no-store');
}

function clearAdminCookie(res: Response): void {
  res.setHeader('Set-Cookie', clearAdminSessionCookie({ secure: COOKIE_SECURE }));
  res.setHeader('Cache-Control', 'no-store');
}

function localPrincipal(username: string, authenticatedAt: number): AdminPrincipal | null {
  if (!ALLOW_LOCAL_ADMIN) return null;
  const state = db.getAdminAuthState();
  if (!state.configured) return null;
  return {
    provider: 'local',
    identifier: username,
    username,
    mustChangePassword: state.mustChangePassword,
    authenticatedAt,
    recentAuth: isRecentAuthentication(authenticatedAt)
  };
}

/**
 * Resolves the administrator principal for a request.
 *
 * A Firebase ID token is verified (signature, issuer, audience, lifetime) and
 * then independently authorized via the server-side `ADMIN_UIDS` allowlist or
 * the server-issued `admin: true` custom claim. A verified customer token is
 * therefore never enough to become an administrator. Otherwise the httpOnly
 * administrator session cookie is verified.
 */
async function resolveAdminPrincipal(req: Request): Promise<{ principal: AdminPrincipal } | AdminFailure> {
  const token = bearerToken(req);

  if (token) {
    if (looksLikeFirebaseToken(token)) {
      if (!FIREBASE_PROJECT_ID) {
        return {
          status: 503,
          code: 'AUTH_UNAVAILABLE',
          message: 'Firebase administrator sign-in is not configured on this server.',
          reason: 'firebase_not_configured'
        };
      }
      let claims;
      try {
        claims = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
      } catch (err: any) {
        if (err instanceof FirebaseAuthUnavailableError) {
          return {
            status: 503,
            code: 'AUTH_UNAVAILABLE',
            message: 'Administrator sign-in verification is temporarily unavailable. Please try again.',
            reason: 'firebase_unavailable'
          };
        }
        return {
          status: 401,
          code: 'INVALID_TOKEN',
          message: 'Your administrator session is invalid or has expired. Please sign in again.',
          reason: 'invalid_firebase_token'
        };
      }

      const decision = decideFirebaseAdmin(claims, ADMIN_UIDS);
      if (!decision.authorized) {
        return {
          status: 403,
          code: 'NOT_ADMIN',
          message: 'This account is not authorized as an administrator.',
          uid: claims.uid,
          reason: `firebase_${decision.reason}`
        };
      }

      const authenticatedAt = typeof claims.authTime === 'number' ? claims.authTime * 1000 : Date.now();
      return {
        principal: {
          provider: 'firebase',
          identifier: claims.email || claims.uid,
          uid: claims.uid,
          email: claims.email,
          mustChangePassword: false,
          authenticatedAt,
          recentAuth: isRecentAuthentication(authenticatedAt)
        }
      };
    }

    // Opaque token: local recovery administrator session.
    const session = db.verifySessionToken(token);
    if (!session) {
      return {
        status: 401,
        code: 'INVALID_SESSION',
        message: 'Your administrator session has expired. Please sign in again.',
        reason: 'invalid_session'
      };
    }
    const principal = localPrincipal(session.username, session.authenticatedAt);
    if (!principal) {
      return {
        status: 401,
        code: 'LOCAL_ADMIN_DISABLED',
        message: 'Local administrator sign-in is disabled on this server.',
        reason: 'local_admin_disabled'
      };
    }
    return { principal };
  }

  const cookieToken = parseCookies(req.headers.cookie)[ADMIN_SESSION_COOKIE];
  if (cookieToken) {
    const session = db.verifySessionToken(cookieToken);
    if (!session) {
      return {
        status: 401,
        code: 'INVALID_SESSION',
        message: 'Your administrator session has expired. Please sign in again.',
        reason: 'invalid_session'
      };
    }
    const principal = localPrincipal(session.username, session.authenticatedAt);
    if (!principal) {
      return {
        status: 401,
        code: 'LOCAL_ADMIN_DISABLED',
        message: 'Local administrator sign-in is disabled on this server.',
        reason: 'local_admin_disabled'
      };
    }
    return { principal };
  }

  return {
    status: 401,
    code: 'UNAUTHENTICATED',
    message: 'Administrator authentication is required.',
    reason: 'missing_credentials'
  };
}

interface RequireAdminOptions {
  allowPasswordChange?: boolean;
  recentAuthMs?: number;
}

function requireAdmin(options: RequireAdminOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveAdminPrincipal(req);
      if (!('principal' in resolved)) {
        // A routine "am I signed in?" probe with no credentials is expected on
        // the admin login screen; do not flood the audit log with it.
        const isSessionProbe =
          req.method === 'GET' &&
          req.path === '/api/admin/me' &&
          resolved.reason === 'missing_credentials';
        if (!isSessionProbe) {
          auditSecurity(
            'Admin Authorization Denied',
            `${req.method} ${req.path} denied (${resolved.reason})`,
            resolved.uid || 'anonymous'
          );
        }
        return res.status(resolved.status).json({
          error: resolved.message,
          code: resolved.code,
          ...(resolved.uid ? { uid: resolved.uid } : {})
        });
      }

      const principal = resolved.principal;
      (req as AdminRequest).adminPrincipal = principal;

      if (principal.mustChangePassword && !options.allowPasswordChange) {
        return res.status(403).json({
          error: 'You must change the administrator password before using the console.',
          code: 'PASSWORD_CHANGE_REQUIRED'
        });
      }

      if (
        principal.provider === 'local' &&
        requiresAdminCsrfHeader(req.method) &&
        req.get(ADMIN_CSRF_HEADER) !== ADMIN_CSRF_VALUE
      ) {
        auditSecurity(
          'Admin Authorization Denied',
          `${req.method} ${req.path} denied (csrf_header_missing)`,
          principal.username || principal.identifier
        );
        return res.status(403).json({
          error: 'Missing administrator request header. Refresh the console and try again.',
          code: 'CSRF_HEADER_REQUIRED'
        });
      }

      if (options.recentAuthMs && !isRecentAuthentication(principal.authenticatedAt, options.recentAuthMs)) {
        auditSecurity(
          'Admin Reauthentication Required',
          `${req.method} ${req.path} requires recent authentication`,
          principal.uid || principal.username || principal.identifier
        );
        return res.status(403).json({
          error: 'Please re-authenticate before performing this security-sensitive action.',
          code: 'REAUTHENTICATION_REQUIRED'
        });
      }

      next();
    } catch (err: any) {
      console.error('[Admin Auth]', err?.message || err);
      res.status(500).json({ error: 'Administrator authorization failed.', code: 'AUTH_INTERNAL_ERROR' });
    }
  };
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function consumeLoginAttempt(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (loginAttempts.size > 5000) {
    for (const [entryKey, entry] of loginAttempts) {
      if (entry.resetAt <= now) loginAttempts.delete(entryKey);
    }
  }
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  current.count += 1;
  if (current.count > LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

// ==========================================
// SHARED REQUEST HELPERS
// ==========================================

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Firebase ID tokens are JWTs; administrator session tokens are opaque hex. */
function looksLikeFirebaseToken(token: string): boolean {
  return token.split('.').length === 3;
}

function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/[^\d]/g, '').slice(-10);
}

/** Resolves an order by document ID or order number and verifies the phone. */
function findTrackableOrder(identifier: string, phone: string): Order | null {
  const expected = normalizePhone(phone);
  if (!expected) return null;
  const order = db.getOrderById(identifier) ?? db.trackOrder(identifier, phone);
  if (!order) return null;
  return normalizePhone(order.customer.phone) === expected ? order : null;
}

/** Privacy-preserving projection returned to guests during tracking. */
function publicTrackingView(order: Order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.fullName,
    maskedPhone: order.customer.phone.replace(/(\d{4})\d+(\d{2})/, '$1****$2'),
    city: order.customer.city,
    address: order.customer.address,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    statusHistory: order.statusHistory,
    trackingNumber: order.trackingNumber,
    courierName: order.courierName,
    createdAt: order.createdAt
  };
}

/** Returns the verified customer UID when a valid Firebase ID token is sent. */
async function optionalCustomerUid(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token || !looksLikeFirebaseToken(token)) return null;
  try {
    const user = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    return user.uid;
  } catch (err: any) {
    console.warn('[Customer Auth] Ignoring unusable ID token:', err?.message || err);
    return null;
  }
}

/** Requires a valid Firebase ID token and returns the verified UID. */
async function requireCustomerUid(req: Request, res: Response): Promise<string | null> {
  const token = bearerToken(req);
  if (!token || !looksLikeFirebaseToken(token)) {
    res.status(401).json({ error: 'Please sign in to your customer account to continue.' });
    return null;
  }
  try {
    const user = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    return user.uid;
  } catch (err: any) {
    if (err instanceof FirebaseAuthUnavailableError) {
      console.warn('[Customer Auth] Verification unavailable:', err.message);
      res.status(503).json({
        error: 'Customer sign-in verification is temporarily unavailable. Please try again shortly.'
      });
      return null;
    }
    console.warn('[Customer Auth] Rejected ID token:', err?.message || err);
    res.status(401).json({ error: 'Your customer session has expired. Please sign in again.' });
    return null;
  }
}

function extensionForImageMime(mime: string): string {
  const normalised = mime.toLowerCase();
  if (normalised === 'image/jpeg' || normalised === 'image/jpg') return 'jpg';
  if (normalised === 'image/png') return 'png';
  if (normalised === 'image/webp') return 'webp';
  if (normalised === 'image/gif') return 'gif';
  if (normalised === 'image/avif') return 'avif';
  return 'bin';
}

/**
 * Stores a base64 image on disk when Cloudinary is not configured, so product
 * image uploads keep working in local/demo environments.
 */
function storeLocalImage(dataUri: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUri);
  if (!match) {
    throw new Error('Only image files (JPEG, PNG, WEBP, AVIF, GIF) are allowed.');
  }
  const mime = match[1]!.toLowerCase();
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0) throw new Error('The uploaded image is empty.');
  if (bytes.length > MAX_LOCAL_UPLOAD_BYTES) {
    throw new Error(`Images must be smaller than ${Math.round(MAX_LOCAL_UPLOAD_BYTES / (1024 * 1024))}MB.`);
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const fileName = `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extensionForImageMime(mime)}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), bytes);

  return {
    url: `/uploads/${fileName}`,
    secureUrl: `/uploads/${fileName}`,
    publicId: `local/${fileName}`,
    format: extensionForImageMime(mime),
    width: 0,
    height: 0,
    bytes: bytes.length
  };
}

function deleteLocalImage(publicId: string): boolean {
  const fileName = path.basename(publicId);
  const target = path.join(UPLOADS_DIR, fileName);
  // Guard against path traversal before touching the filesystem.
  if (path.dirname(target) !== UPLOADS_DIR) return false;
  if (!fs.existsSync(target)) return true;
  fs.unlinkSync(target);
  return true;
}

// ==========================================
// 0. HEALTH & READINESS ENDPOINTS
// ==========================================
app.get(['/health/live', '/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/health/ready', (_req: Request, res: Response) => {
  const readiness = db.getReadiness();
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'ready' : 'not_ready',
    database: readiness.ready,
    storage: 'json-file',
    ...(readiness.reason ? { reason: readiness.reason } : {}),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 1. PUBLIC STORE APIS (NO LOGIN REQUIRED)
// ==========================================

// Get active products with optional search, category, sort
app.get(['/api/products', '/api/v1/products'], (req: Request, res: Response) => {
  let products = db.getProducts().filter(p => p.isActive);
  const { category, search, sort, featured, trending, newArrival } = req.query;

  if (category && typeof category === 'string' && category !== 'all') {
    products = products.filter(p => p.categoryId === category);
  }

  if (featured === 'true') {
    products = products.filter(p => p.isFeatured);
  }
  if (trending === 'true') {
    products = products.filter(p => p.isTrending);
  }
  if (newArrival === 'true') {
    products = products.filter(p => p.isNewArrival);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    products = products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q)
    );
  }

  if (sort && typeof sort === 'string') {
    if (sort === 'price_asc') {
      products.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
    } else if (sort === 'price_desc') {
      products.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
    } else if (sort === 'newest') {
      products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'popular') {
      products.sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
    }
  }

  res.json({ products });
});

// Single product
app.get(['/api/products/:id', '/api/v1/products/:id'], (req: Request, res: Response) => {
  const product = db.getProductById(req.params.id);
  if (!product || !product.isActive) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ product });
});

// Categories
app.get(['/api/categories', '/api/v1/categories'], (_req: Request, res: Response) => {
  const categories = db.getCategories().filter(c => c.isActive);
  res.json({ categories });
});

// Promotional Banners
app.get(['/api/banners', '/api/v1/banners'], (_req: Request, res: Response) => {
  const banners = db.getBanners().filter(b => b.isActive);
  res.json({ banners });
});

// Public store settings
app.get(['/api/settings', '/api/v1/settings'], (_req: Request, res: Response) => {
  const settings = db.getSettings();
  res.json({ settings });
});

// Validate Coupon
app.post(['/api/coupons/validate', '/api/v1/coupons/validate'], (req: Request, res: Response) => {
  const { code, subtotal } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Coupon code is required' });
  }
  const allCoupons = db.getCoupons();
  const coupon = allCoupons.find(c => c.code.toUpperCase() === String(code).trim().toUpperCase());

  const validation = validateCoupon(coupon, Number(subtotal) || 0);
  if (!validation.valid || !coupon) {
    return res.status(400).json({ valid: false, error: validation.error || 'Invalid coupon code' });
  }

  const discountAmount = calculateDiscount(coupon, Number(subtotal) || 0);
  res.json({
    valid: true,
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      amountSaved: discountAmount
    }
  });
});

// Guest Checkout Order Placement (server-authoritative pricing)
const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

app.post(['/api/orders', '/api/v1/orders'], asyncRoute(async (req: Request, res: Response) => {
  const { customer, items, couponCode } = req.body ?? {};

  if (!customer || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'A customer and at least one cart item are required.' });
  }

  // Rebuild the cart from the catalogue: never trust client-supplied prices,
  // names, images or stock levels.
  const cartItems: CartItem[] = [];
  for (const rawItem of items) {
    const productId = String(rawItem?.productId ?? '');
    const quantity = Math.trunc(Number(rawItem?.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({
        error: 'Every cart item needs a product ID and a quantity between 1 and 99.'
      });
    }
    const product = db.getProductById(productId);
    if (!product || !product.isActive) {
      return res.status(400).json({ error: `Product "${rawItem?.name || productId}" is no longer available.` });
    }
    cartItems.push({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      salePrice: product.salePrice,
      quantity,
      image: product.images[0] || '',
      stock: product.stock
    });
  }

  const validation = validateGuestCheckout(customer, cartItems);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }

  const subtotal = calculateSubtotal(cartItems);

  // Look up and validate the coupon before applying it, so an invalid code is
  // reported instead of silently disappearing.
  let coupon = null;
  if (couponCode) {
    coupon = db.getCoupons().find(c => c.code.toUpperCase() === String(couponCode).trim().toUpperCase()) ?? null;
    const couponCheck = validateCoupon(coupon, subtotal);
    if (!couponCheck.valid) {
      return res.status(400).json({ error: couponCheck.error || 'Invalid coupon code' });
    }
  }

  const settings = db.getSettings();
  const pricing = calculateOrderPricing(cartItems, coupon, {
    standardFee: settings.standardShippingFee,
    freeShippingThreshold: settings.freeShippingThreshold
  });

  // Associate signed-in customers with their orders without requiring them.
  const customerUid = await optionalCustomerUid(req);

  const orderResult = db.createGuestOrder({
    customer,
    customerUid,
    items: cartItems.map(item => {
      const product = db.getProductById(item.productId);
      return {
        productId: item.productId,
        name: item.name,
        price: item.salePrice && item.salePrice > 0 ? item.salePrice : item.price,
        quantity: item.quantity,
        image: item.image,
        sku: product?.sku
      };
    }),
    subtotal: pricing.subtotal,
    discount: pricing.discountAmount,
    shippingFee: pricing.shippingFee,
    total: pricing.total,
    couponCode: coupon?.code
  });

  if (!orderResult.success) {
    return res.status(400).json({ error: orderResult.error || 'Could not place order' });
  }

  res.status(201).json({
    success: true,
    order: orderResult.order
  });
}));

// Guest order tracking by order number (or document ID) plus customer phone
app.get(['/api/orders/track', '/api/v1/orders/track'], trackingRateLimit, (req: Request, res: Response) => {
  const identifier = String(req.query.orderNumber || req.query.orderId || '').trim();
  const phone = String(req.query.phone || '').trim();
  if (!identifier || !phone) {
    return res.status(400).json({ error: 'Order number and phone number are required for tracking' });
  }

  const order = findTrackableOrder(identifier, phone);
  if (!order) {
    return res.status(404).json({ error: 'No order found matching this order number and phone number' });
  }

  res.json({ order: publicTrackingView(order) });
});

// Direct order tracking by document ID or order number via POST
app.post(['/api/orders/:id/track', '/api/v1/orders/:id/track'], trackingRateLimit, (req: Request, res: Response) => {
  const identifier = String(req.params.id || '').trim();
  const phone = String(req.body?.phone || req.body?.phoneNumber || '').trim();
  if (!identifier || !phone) {
    return res.status(400).json({ error: 'Order identifier and phone number are required' });
  }

  const order = findTrackableOrder(identifier, phone);
  if (!order) {
    return res.status(404).json({ error: 'No order found matching this order number and customer phone' });
  }

  res.json({ order: publicTrackingView(order) });
});

// Customer order history (requires a verified Firebase ID token).
// Ownership comes only from the server-written customerUid, never from notes or
// any identifier supplied by the browser.
app.get(['/api/orders/my', '/api/v1/orders/my'], async (req: Request, res: Response) => {
  const customerUid = await requireCustomerUid(req, res);
  if (!customerUid) return;

  const orders = db.getOrders().filter(order => order.customerUid === customerUid);

  res.json({ orders });
});

// ==========================================
// 2. ADMIN AUTHENTICATION & MANAGEMENT APIS
// ==========================================

// Admin Login (local recovery account only; Firebase administrators sign in with the SDK)
app.post('/api/admin/login', (req: Request, res: Response) => {
  if (!ALLOW_LOCAL_ADMIN) {
    clearAdminCookie(res);
    return res.status(403).json({
      error: 'Local administrator sign-in is disabled on this server. Use your Firebase administrator account.',
      code: 'LOCAL_ADMIN_DISABLED'
    });
  }

  const { username, password } = req.body ?? {};
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password ||
    username.length > 200 ||
    password.length > 256
  ) {
    return res.status(400).json({ error: 'Username and password are required.', code: 'INVALID_REQUEST' });
  }

  const cleanUsername = username.trim();
  const rateKey = `${req.ip || 'unknown'}|${cleanUsername.toLowerCase()}`;
  const rate = consumeLoginAttempt(rateKey);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
    auditSecurity('Admin Login Rate Limited', 'Too many local administrator sign-in attempts.', cleanUsername.slice(0, 80));
    return res.status(429).json({
      error: 'Too many sign-in attempts. Try again later.',
      code: 'RATE_LIMITED'
    });
  }

  const result = db.verifyAdminCredentials(cleanUsername, password);

  if (result.locked) {
    res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    auditSecurity('Admin Login Blocked', 'Local administrator account is temporarily locked.', cleanUsername.slice(0, 80));
    return res.status(423).json({
      error: 'The administrator account is temporarily locked after repeated failures. Try again later.',
      code: 'ACCOUNT_LOCKED'
    });
  }

  if (result.passwordResetRequired) {
    auditSecurity(
      'Admin Login Blocked',
      'Local administrator still uses a removed default password; operator reset required.',
      cleanUsername.slice(0, 80)
    );
    return res.status(403).json({
      error:
        'This administrator account still uses a removed default password. An operator must reset it with "npm run admin:set-password", then sign in again.',
      code: 'PASSWORD_RESET_REQUIRED'
    });
  }

  if (!result.valid) {
    db.recordAdminLoginFailure();
    auditSecurity('Admin Login Failed', 'Invalid local administrator credentials.', cleanUsername.slice(0, 80));
    return res.status(401).json({
      error: 'Invalid administrator credentials.',
      code: 'INVALID_CREDENTIALS'
    });
  }

  loginAttempts.delete(rateKey);
  db.recordAdminLoginSuccess();
  const token = db.createSessionToken(cleanUsername, Date.now());
  setAdminCookie(res, token);
  auditSecurity('Admin Login Succeeded', 'Local recovery administrator signed in.', cleanUsername.slice(0, 80));

  res.json({
    success: true,
    user: {
      identifier: cleanUsername,
      provider: 'local',
      role: 'admin',
      mustChangePassword: result.mustChangePassword
    }
  });
});

// Admin Logout: revoke the local session (if any) and clear the cookie.
app.post('/api/admin/logout', (req: Request, res: Response) => {
  const token = bearerToken(req) || parseCookies(req.headers.cookie)[ADMIN_SESSION_COOKIE];
  if (token && !looksLikeFirebaseToken(token)) {
    const session = db.verifySessionToken(token);
    if (session) {
      db.revokeAdminSession(session.sid);
      auditSecurity('Admin Logout', 'Local administrator session was revoked.', session.username);
    }
  }
  clearAdminCookie(res);
  res.json({ success: true });
});

// Validate the current administrator session and return the trusted identity.
app.get('/api/admin/me', requireAdmin({ allowPasswordChange: true }), (req: Request, res: Response) => {
  const principal = (req as AdminRequest).adminPrincipal;
  if (!principal) {
    return res.status(401).json({ error: 'Administrator authentication is required.', code: 'UNAUTHENTICATED' });
  }
  res.json({
    user: {
      identifier: principal.identifier,
      provider: principal.provider,
      role: 'admin',
      mustChangePassword: principal.mustChangePassword,
      authenticatedAt: new Date(principal.authenticatedAt).toISOString(),
      recentAuth: principal.recentAuth,
      ...(principal.email ? { email: principal.email } : {}),
      ...(principal.uid ? { uid: principal.uid } : {}),
      ...(principal.username ? { username: principal.username } : {})
    }
  });
});

// Admin Product Endpoints
app.get('/api/admin/products', requireAdmin(), (_req: Request, res: Response) => {
  const products = db.getProducts();
  res.json({ products });
});

// Check whether product appears in orders before deleting
app.get('/api/admin/products/:id/orders-check', requireAdmin(), (req: Request, res: Response) => {
  const check = db.isProductInOrders(req.params.id);
  const product = db.getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({
    productId: product.id,
    productName: product.name,
    inOrders: check.inOrders,
    orderCount: check.orderCount,
    orderNumbers: check.orderNumbers
  });
});

app.get('/api/admin/products/:id', requireAdmin(), (req: Request, res: Response) => {
  const product = db.getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
});

app.post('/api/admin/products', requireAdmin(), async (req: Request, res: Response) => {
  try {
    const { name, price, categoryId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    if (price === undefined || isNaN(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: 'Valid regular price greater than 0 is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ error: 'Category selection is required' });
    }

    const product = db.saveProduct(req.body);
    // Background sync to Firestore
    syncProductToFirestore(product).catch(err => {
      console.warn('[Firestore Background Sync Warning]', err.message);
    });

    res.status(201).json({ product });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create product' });
  }
});

app.put('/api/admin/products/:id', requireAdmin(), async (req: Request, res: Response) => {
  try {
    const { name, price, categoryId } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Product name cannot be empty' });
    }
    if (price !== undefined && (isNaN(Number(price)) || Number(price) <= 0)) {
      return res.status(400).json({ error: 'Valid regular price greater than 0 is required' });
    }

    const product = db.saveProduct({ ...req.body, id: req.params.id });
    // Background sync to Firestore
    syncProductToFirestore(product).catch(err => {
      console.warn('[Firestore Background Sync Warning]', err.message);
    });

    res.json({ product });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update product' });
  }
});

// Safe archive/deactivate product
app.post('/api/admin/products/:id/archive', requireAdmin(), async (req: Request, res: Response) => {
  const result = db.archiveProduct(req.params.id);
  if (!result.success || !result.product) {
    return res.status(404).json({ error: result.error || 'Product not found' });
  }
  syncProductToFirestore(result.product).catch(err => console.warn('[Firestore sync]', err.message));
  res.json({ success: true, product: result.product });
});

// Delete product with order check and optional force
app.delete('/api/admin/products/:id', requireAdmin(), async (req: Request, res: Response) => {
  const force = req.query.force === 'true' || req.body?.force === true;
  const result = db.deleteProduct(req.params.id, force);

  if (!result.success) {
    if (result.requiresArchive) {
      return res.status(409).json({
        error: result.error,
        requiresArchive: true,
        orderCount: result.orderCount,
        orderNumbers: result.orderNumbers
      });
    }
    return res.status(404).json({ error: result.error || 'Product not found' });
  }

  // If there are unreferenced image assets, clean them up asynchronously
  if (result.cleanupPublicIds && result.cleanupPublicIds.length > 0) {
    for (const pid of result.cleanupPublicIds) {
      try {
        if (pid.startsWith('local/')) {
          deleteLocalImage(pid);
          continue;
        }
      } catch (cleanupErr: any) {
        console.warn(`[Image Cleanup Warning] Failed to delete ${pid}:`, cleanupErr?.message || cleanupErr);
        continue;
      }
      deleteFromCloudinary(pid).catch(err => {
        console.warn(`[Cloudinary Cleanup Warning] Failed to delete ${pid}:`, err.message);
      });
    }
  }

  // Delete from Firestore if synced
  deleteProductFromFirestore(req.params.id).catch(err => console.warn('[Firestore delete]', err.message));

  res.json({ success: true, message: 'Product deleted successfully' });
});

// Bulk product actions
app.post('/api/admin/products/bulk', requireAdmin(), (req: Request, res: Response) => {
  const { productIds, action, categoryId } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: 'productIds array is required' });
  }

  if (action === 'activate') {
    const resCount = db.bulkUpdateProducts(productIds, { isActive: true });
    return res.json({ success: true, updatedCount: resCount.updatedCount });
  }
  if (action === 'deactivate') {
    const resCount = db.bulkUpdateProducts(productIds, { isActive: false });
    return res.json({ success: true, updatedCount: resCount.updatedCount });
  }
  if (action === 'set_category') {
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required for set_category' });
    const resCount = db.bulkUpdateProducts(productIds, { categoryId });
    return res.json({ success: true, updatedCount: resCount.updatedCount });
  }

  res.status(400).json({ error: 'Invalid bulk action. Supported: activate, deactivate, set_category' });
});

// Admin Category Endpoints
app.get('/api/admin/categories', requireAdmin(), (_req: Request, res: Response) => {
  const categories = db.getCategories();
  res.json({ categories });
});

app.get('/api/admin/categories/:id', requireAdmin(), (req: Request, res: Response) => {
  const category = db.getCategories().find(c => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  res.json({ category });
});

app.post('/api/admin/categories', requireAdmin(), (req: Request, res: Response) => {
  const category = db.saveCategory(req.body);
  res.status(201).json({ category });
});

app.put('/api/admin/categories/:id', requireAdmin(), (req: Request, res: Response) => {
  const category = db.saveCategory({ ...req.body, id: req.params.id });
  res.json({ category });
});

app.delete('/api/admin/categories/:id', requireAdmin(), (req: Request, res: Response) => {
  const result = db.deleteCategory(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json({ success: true });
});

// Admin Orders
app.get('/api/admin/orders', requireAdmin(), (req: Request, res: Response) => {
  let orders = db.getOrders();
  const { status, search } = req.query;

  if (status && typeof status === 'string' && status !== 'all') {
    orders = orders.filter(o => o.fulfillmentStatus === status);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    orders = orders.filter(o => 
      o.orderNumber.toLowerCase().includes(q) ||
      o.customer.fullName.toLowerCase().includes(q) ||
      o.customer.phone.includes(q) ||
      o.customer.city.toLowerCase().includes(q)
    );
  }

  res.json({ orders });
});

app.get('/api/admin/orders/:id', requireAdmin(), (req: Request, res: Response) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

app.put('/api/admin/orders/:id/status', requireAdmin(), (req: Request, res: Response) => {
  const { status, trackingNumber, courierName, cancelReason, internalNotes } = req.body;
  const result = db.updateOrderStatus(
    req.params.id,
    status,
    trackingNumber,
    courierName,
    cancelReason,
    internalNotes
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, order: result.order });
});

// Admin Coupons
app.get('/api/admin/coupons', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ coupons: db.getCoupons() });
});

app.post('/api/admin/coupons', requireAdmin(), (req: Request, res: Response) => {
  const coupon = db.saveCoupon(req.body);
  res.status(201).json({ coupon });
});

app.put('/api/admin/coupons/:id', requireAdmin(), (req: Request, res: Response) => {
  const coupon = db.saveCoupon({ ...req.body, id: req.params.id });
  res.json({ coupon });
});

app.delete('/api/admin/coupons/:id', requireAdmin(), (req: Request, res: Response) => {
  const success = db.deleteCoupon(req.params.id);
  res.json({ success });
});

// Admin Banners
app.get('/api/admin/banners', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ banners: db.getBanners() });
});

app.post('/api/admin/banners', requireAdmin(), (req: Request, res: Response) => {
  const banner = db.saveBanner(req.body);
  res.status(201).json({ banner });
});

app.put('/api/admin/banners/:id', requireAdmin(), (req: Request, res: Response) => {
  const banner = db.saveBanner({ ...req.body, id: req.params.id });
  res.json({ banner });
});

app.delete('/api/admin/banners/:id', requireAdmin(), (req: Request, res: Response) => {
  const success = db.deleteBanner(req.params.id);
  res.json({ success });
});

// Admin Settings
app.get('/api/admin/settings', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ settings: db.getSettings() });
});

app.put('/api/admin/settings', requireAdmin(), (req: Request, res: Response) => {
  const settings = db.updateSettings(req.body);
  res.json({ settings });
});

// Admin Reports, Inventory & Audit Logs
app.get('/api/admin/reports', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ reports: db.getReports() });
});

app.get('/api/admin/audit-logs', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ auditLogs: db.getAuditLogs() });
});

app.get('/api/admin/inventory', requireAdmin(), (_req: Request, res: Response) => {
  res.json({ movements: db.getInventoryMovements() });
});

// Cloudinary Management Endpoints (Admin Only)
app.get('/api/admin/cloudinary/config', requireAdmin(), async (_req: Request, res: Response) => {
  const health = await testCloudinaryConnection();
  res.json({
    cloudName: CLOUDINARY_CONFIG.cloudName,
    uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
    assetFolder: CLOUDINARY_CONFIG.assetFolder,
    configured: !!process.env.CLOUDINARY_URL,
    storage: process.env.CLOUDINARY_URL ? 'cloudinary' : 'local',
    status: health.connected ? 'ready' : 'disconnected',
    message: health.message
  });
});

app.post('/api/admin/cloudinary/upload', requireAdmin(), async (req: Request, res: Response) => {
  try {
    const { file, folder } = req.body;
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'Image file (base64 data URI) is required' });
    }

    // Validation for image format
    if (file.startsWith('data:') && !file.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Only image files (JPEG, PNG, WEBP, AVIF, GIF) are allowed.' });
    }

    // Prefer Cloudinary when configured; otherwise keep admin uploads working by
    // storing the image on this server's own disk.
    if (!process.env.CLOUDINARY_URL) {
      const image = storeLocalImage(file);
      return res.status(201).json({ success: true, storage: 'local', image });
    }

    const uploadResult = await uploadToCloudinary(file, folder || CLOUDINARY_CONFIG.assetFolder);
    res.status(201).json({
      success: true,
      storage: 'cloudinary',
      image: uploadResult
    });
  } catch (err: any) {
    console.error('[Image Upload Error]', err?.message || err);
    const isValidationError = /only image files|smaller than|empty/i.test(err?.message || '');
    res.status(isValidationError ? 400 : 500).json({ error: err.message || 'Image upload failed' });
  }
});

app.post('/api/admin/cloudinary/delete', requireAdmin(), async (req: Request, res: Response) => {
  try {
    const { publicId } = req.body;
    if (!publicId || typeof publicId !== 'string') {
      return res.status(400).json({ error: 'publicId is required' });
    }

    if (publicId.startsWith('local/')) {
      const deleted = deleteLocalImage(publicId);
      return res.json({ success: deleted, result: deleted ? 'ok' : 'not found' });
    }

    if (!process.env.CLOUDINARY_URL) {
      return res.status(400).json({
        error: 'Cloudinary is not configured; only locally stored images can be deleted.'
      });
    }

    const delResult = await deleteFromCloudinary(publicId);
    res.json({ success: true, result: delResult.result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete image' });
  }
});

// Firebase Status and Migration Endpoints (Admin Only)
app.get('/api/admin/firebase/status', requireAdmin(), async (_req: Request, res: Response) => {
  const status = await checkFirestoreStatus();
  res.json({ status });
});

app.post('/api/admin/firebase/migrate', requireAdmin({ recentAuthMs: ADMIN_RECENT_AUTH_MS }), async (_req: Request, res: Response) => {
  try {
    const allData = (db as any).data;
    const result = await migrateStoreToFirestore(allData);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Migration failed' });
  }
});

// Local recovery administrator password change.
// Firebase-managed administrators change their password with the Firebase SDK
// (re-authentication + updatePassword) and report the event below instead.
app.post('/api/admin/change-password', requireAdmin({ allowPasswordChange: true }), (req: Request, res: Response) => {
  const principal = (req as AdminRequest).adminPrincipal;
  if (!principal) {
    return res.status(401).json({ error: 'Administrator authentication is required.', code: 'UNAUTHENTICATED' });
  }
  if (principal.provider !== 'local') {
    return res.status(400).json({
      error: 'This administrator account is managed by Firebase Authentication. Use the Firebase password change flow.',
      code: 'FIREBASE_MANAGED_ACCOUNT'
    });
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    !currentPassword ||
    !newPassword ||
    currentPassword.length > 256 ||
    newPassword.length > 256
  ) {
    return res.status(400).json({
      error: 'Current password and new password are required.',
      code: 'INVALID_REQUEST'
    });
  }

  // Slow down repeated current-password guessing from an already signed-in
  // administrator session.
  const throttleKey = `pwchange|${principal.username || principal.identifier}`;
  const throttle = consumeLoginAttempt(throttleKey);
  if (!throttle.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(throttle.retryAfterMs / 1000)));
    auditSecurity(
      'Admin Password Change Denied',
      'Password change attempts were rate limited.',
      principal.username || principal.identifier
    );
    return res.status(429).json({
      error: 'Too many password change attempts. Try again later.',
      code: 'RATE_LIMITED'
    });
  }

  const result = db.changeAdminPassword(currentPassword, newPassword);
  if (!result.success) {
    auditSecurity(
      'Admin Password Change Denied',
      `Local password change rejected (${result.code || 'unknown'}).`,
      principal.username || principal.identifier
    );
    return res.status(400).json({
      error: result.error || 'The password could not be changed.',
      code: result.code || 'PASSWORD_CHANGE_FAILED',
      ...(result.errors ? { errors: result.errors } : {})
    });
  }

  loginAttempts.delete(throttleKey);

  // The signing secret rotated, so every earlier session is invalid. Issue a
  // fresh cookie so the administrator who made the change stays signed in.
  const token = db.createSessionToken(principal.username || principal.identifier, Date.now());
  setAdminCookie(res, token);

  res.json({
    success: true,
    message: 'Password updated successfully. Other administrator sessions were signed out.',
    user: {
      identifier: principal.identifier,
      provider: 'local',
      role: 'admin',
      mustChangePassword: false
    }
  });
});

// Audit hook for Firebase-managed password changes. The password itself is
// changed by the Firebase client SDK and never reaches this server.
app.post(
  '/api/admin/security/password-changed',
  requireAdmin({ recentAuthMs: ADMIN_RECENT_AUTH_MS }),
  (req: Request, res: Response) => {
    const principal = (req as AdminRequest).adminPrincipal;
    if (!principal) {
      return res.status(401).json({ error: 'Administrator authentication is required.', code: 'UNAUTHENTICATED' });
    }
    if (principal.provider !== 'firebase') {
      return res.status(400).json({
        error: 'Only Firebase-managed administrator accounts use this endpoint.',
        code: 'LOCAL_MANAGED_ACCOUNT'
      });
    }
    if (req.body && typeof req.body === 'object') {
      const sensitiveKey = Object.keys(req.body).find(key => /password|secret|token/i.test(key));
      if (sensitiveKey) {
        return res.status(400).json({
          error: 'This endpoint does not accept password or token data.',
          code: 'SENSITIVE_FIELD_REJECTED'
        });
      }
    }

    auditSecurity(
      'Admin Password Changed',
      'Firebase administrator password changed client-side after re-authentication.',
      principal.uid || principal.identifier
    );
    res.json({ success: true });
  }
);

// ==========================================
// 3. VITE INTEGRATION & STATIC SERVING
// ==========================================

// Unknown API routes must answer with JSON. Without this the SPA catch-all
// below would return index.html with HTTP 200, which clients then parse as an
// empty (but "successful") response.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found' });
});

// Central error handler for API routes: JSON only, no stack traces exposed.
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  const requestId = (req as any).requestId;
  const isJsonSyntax = error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && 'body' in error);
  const isTooLarge = error?.type === 'entity.too.large';
  const isUnsupportedEncoding = error?.type === 'encoding.unsupported';
  const status = isTooLarge
    ? 413
    : isUnsupportedEncoding
    ? 415
    : isJsonSyntax
    ? 400
    : Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  const messages: Record<number, string> = {
    400: 'The request body is not valid JSON.',
    413: 'The request body is too large.',
    415: 'The request body uses an unsupported encoding.'
  };
  const code =
    status === 400
      ? 'INVALID_JSON'
      : status === 413
      ? 'PAYLOAD_TOO_LARGE'
      : status === 415
      ? 'UNSUPPORTED_ENCODING'
      : 'INTERNAL_ERROR';

  if (status >= 500) {
    console.error(
      `[API Error] ${req.method} ${req.path} requestId=${requestId || 'none'} ${error?.message || error}`
    );
  } else {
    console.warn(
      `[API Rejected] ${req.method} ${req.path} status=${status} requestId=${requestId || 'none'}`
    );
  }

  res.status(status).json({
    error: messages[status] || 'An unexpected server error occurred.',
    code,
    ...(requestId ? { requestId } : {})
  });
});

// Keep the process alive through library-level rejections; exit on a genuinely
// uncaught exception so the hosting platform can restart a clean process.
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  process.exit(1);
});

export { app, startServer };

async function startServer() {
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (error: any) {
      throw new Error(
        `Vite is required in development. Set NODE_ENV=production to serve the built application. (${error?.message || error})`
      );
    }
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');

    // Hashed bundles are immutable; the SPA shell must always be revalidated so
    // a new deployment is picked up immediately.
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true })
    );
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (req: Request, res: Response) => {
      if (
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/uploads/') ||
        !fs.existsSync(indexPath)
      ) {
        return res.status(404).send('Not found');
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexPath);
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(
      `🚀 Zamzam store server on ${HOST}:${PORT} (${isProduction ? 'production' : 'development'})`
    );
    console.log(`   Data:       ${DATA_DIR}`);
    console.log(
      `   Uploads:    ${process.env.CLOUDINARY_URL ? 'Cloudinary' : `local disk (${UPLOADS_DIR})`}`
    );
    console.log(
      `   Admin auth: ${ADMIN_UIDS.size} allowlisted Firebase UID(s)` +
        (ALLOW_LOCAL_ADMIN ? ' + local recovery account' : ' (local recovery disabled)')
    );
    console.log(
      `   CORS:       ${
        ALLOWED_CORS_ORIGINS.size > 0
          ? [...ALLOWED_CORS_ORIGINS].join(', ')
          : 'same-origin only'
      }`
    );
    console.log(
      `   Proxy:      ${
        TRUST_PROXY && TRUST_PROXY !== 'false' ? `trust proxy=${TRUST_PROXY}` : 'disabled'
      }`
    );
    console.log(
      `   Cookie:     ${COOKIE_SECURE ? 'Secure' : 'NOT Secure'}; HttpOnly; SameSite=Strict`
    );

    if (!isProduction) {
      console.warn(
        '   WARNING: NODE_ENV is not "production"; Vite dev middleware is active. Set NODE_ENV=production on the host.'
      );
    }
    if (!FIREBASE_PROJECT_ID) {
      console.warn(
        '   WARNING: VITE_FIREBASE_PROJECT_ID is missing, so Firebase sign-in cannot be verified.'
      );
    }
    if (!ALLOW_LOCAL_ADMIN && ADMIN_UIDS.size === 0) {
      console.warn(
        '   WARNING: no administrator can sign in. Set ADMIN_UIDS or ALLOW_LOCAL_ADMIN=true.'
      );
    }
    if (isProduction && !process.env.CLOUDINARY_URL) {
      console.warn(
        '   WARNING: CLOUDINARY_URL is not set; images are written to local disk, which is usually ephemeral on a host.'
      );
    }
    if (isProduction && !COOKIE_SECURE) {
      console.warn(
        '   WARNING: administrator cookies are not Secure. Serve the app over HTTPS (or unset ADMIN_COOKIE_SECURE=false).'
      );
    }
    if (isProduction && ALLOW_LOCAL_ADMIN) {
      console.warn(
        '   NOTE: the local recovery administrator is enabled. Set ALLOW_LOCAL_ADMIN=false once Firebase administrators are configured.'
      );
    }

    const adminState = db.getAdminAuthState();
    if (adminState.passwordResetRequired) {
      console.warn(
        '   Local administrator still uses a removed default password. Run "npm run admin:set-password" (or set ADMIN_UIDS) before signing in.'
      );
    } else if (adminState.configured && adminState.mustChangePassword) {
      console.warn(
        '   Local administrator password must be changed before admin operations (open /adminportal).'
      );
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[startup] Port ${PORT} is already in use.`);
    } else {
      console.error('[startup] Server error:', error.message);
    }
    process.exitCode = 1;
  });

  const shutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received; closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (process.env.ZAMZAM_NO_LISTEN !== '1') {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exitCode = 1;
  });
}
