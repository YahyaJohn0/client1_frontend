/**
 * Administrator authentication primitives for the bundled API server.
 *
 * Responsibilities are deliberately small and dependency-free so the security
 * decisions can be unit tested without Express, Firebase or a database:
 *  - scrypt password hashing with transparent migration from legacy SHA-256
 *  - HMAC-signed administrator session tokens (cookie transport)
 *  - httpOnly/SameSite cookie serialisation and parsing
 *  - CSRF header rules for cookie-authenticated writes
 *  - the trusted decision "is this verified Firebase identity an administrator?"
 */
import crypto from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'zamzam_admin_session';
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Sensitive account operations require authentication this recent. */
export const ADMIN_RECENT_AUTH_MS = 10 * 60 * 1000;
export const ADMIN_CSRF_HEADER = 'x-zamzam-admin';
export const ADMIN_CSRF_VALUE = '1';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * SHA-256 of the password that older builds shipped as the default. The
 * plaintext is not present anywhere in the codebase; this fingerprint is only
 * used to detect an unrotated legacy account and force a password change.
 */
export const LEGACY_DEFAULT_PASSWORD_HASH =
  '41e5653fc7aeb894026d6bb7b2db7f65902b454945fa8fd65a6327047b5277fb';

export interface AdminPasswordVerification {
  valid: boolean;
  /** The stored hash uses weaker/legacy parameters and should be upgraded. */
  needsRehash: boolean;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEM
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url')
  ].join('$');
}

function safeEqualHex(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies a password against a stored hash. Supports the legacy unsalted
 * SHA-256 format so an existing administrator can sign in once and have the
 * hash transparently upgraded to scrypt.
 */
export function verifyPassword(password: string, storedHash: string): AdminPasswordVerification {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return { valid: false, needsRehash: false };
    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (
      !Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) ||
      n < 4096 || n > 65536 || r < 1 || r > 16 || p < 1 || p > 4
    ) {
      return { valid: false, needsRehash: false };
    }
    try {
      const salt = Buffer.from(saltRaw, 'base64url');
      const expected = Buffer.from(hashRaw, 'base64url');
      if (salt.length < 8 || expected.length < 16) return { valid: false, needsRehash: false };
      const actual = crypto.scryptSync(password, salt, expected.length, {
        N: n,
        r,
        p,
        maxmem: SCRYPT_MAX_MEM
      });
      const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
      const needsRehash = valid && (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P);
      return { valid, needsRehash };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  if (LEGACY_SHA256_PATTERN.test(storedHash)) {
    const actual = crypto.createHash('sha256').update(password).digest('hex');
    const valid = safeEqualHex(actual, storedHash);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

/** True when the account still uses the removed default password hash. */
export function isLegacyDefaultHash(storedHash: string | null | undefined): boolean {
  return typeof storedHash === 'string' && storedHash.toLowerCase() === LEGACY_DEFAULT_PASSWORD_HASH;
}

/**
 * A real scrypt hash used to equalise the cost of an unknown-username login,
 * so response timing does not reveal whether the local administrator exists.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(24).toString('hex'));

export interface AdminSessionPayload {
  /** Unique session id, used for server-side logout/revocation. */
  sid: string;
  username: string;
  issuedAt: number;
  expiresAt: number;
  /** When the administrator last proved possession of the password. */
  authenticatedAt: number;
}

export interface CreateSessionTokenOptions {
  username: string;
  secret: string;
  ttlMs?: number;
  authenticatedAt?: number;
  now?: number;
  /** Test hook; production callers should let the token generate its own id. */
  sid?: string;
}

export function createSessionToken(options: CreateSessionTokenOptions): string {
  const { username, secret, ttlMs = ADMIN_SESSION_TTL_MS, now = Date.now() } = options;
  if (!username || typeof username !== 'string' || !secret) {
    throw new Error('Unable to issue an administrator session.');
  }
  const authenticatedAt = Math.min(options.authenticatedAt ?? now, now);
  const sid = options.sid || crypto.randomBytes(16).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ v: 1, sid, u: username, iat: now, aat: authenticatedAt, exp: now + ttlMs }),
    'utf8'
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now()
): AdminSessionPayload | null {
  if (!token || typeof token !== 'string' || token.length > 4096 || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const providedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const sid = typeof parsed.sid === 'string' ? parsed.sid : '';
    const username = typeof parsed.u === 'string' ? parsed.u : '';
    const issuedAt = typeof parsed.iat === 'number' ? parsed.iat : NaN;
    const expiresAt = typeof parsed.exp === 'number' ? parsed.exp : NaN;
    const authenticatedAt = typeof parsed.aat === 'number' ? parsed.aat : NaN;
    if (parsed.v !== 1 || !username || username.length > 200) return null;
    if (!sid || sid.length > 128) return null;
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(authenticatedAt)) {
      return null;
    }
    const clockToleranceMs = 60_000;
    if (issuedAt > now + clockToleranceMs || authenticatedAt > now + clockToleranceMs) return null;
    if (expiresAt <= now) return null;
    return { sid, username, issuedAt, expiresAt, authenticatedAt };
  } catch {
    return null;
  }
}

export interface FirebaseAdminClaims {
  uid: string;
  email?: string;
  admin?: boolean;
  auth_time?: number;
}

export type FirebaseAdminDecisionReason = 'claim' | 'allowlist' | 'not_admin' | 'invalid';

export interface FirebaseAdminDecision {
  authorized: boolean;
  reason: FirebaseAdminDecisionReason;
}

/**
 * Trusted administrator decision. A verified Firebase identity is an
 * administrator only when the token carries the server-issued `admin: true`
 * custom claim or its UID is in the server-side ADMIN_UIDS allowlist.
 */
export function decideFirebaseAdmin(
  claims: FirebaseAdminClaims | null | undefined,
  allowedUids: Set<string>
): FirebaseAdminDecision {
  if (!claims || typeof claims.uid !== 'string' || !claims.uid) {
    return { authorized: false, reason: 'invalid' };
  }
  if (claims.admin === true) return { authorized: true, reason: 'claim' };
  if (allowedUids.has(claims.uid)) return { authorized: true, reason: 'allowlist' };
  return { authorized: false, reason: 'not_admin' };
}

/** Parses the server-side ADMIN_UIDS allowlist. */
export function parseAdminUids(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw || '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );
}

export function isRecentAuthentication(
  authenticatedAt: number,
  maxAgeMs: number = ADMIN_RECENT_AUTH_MS,
  now: number = Date.now()
): boolean {
  if (!Number.isFinite(authenticatedAt) || maxAgeMs <= 0) return false;
  const clockToleranceMs = 60_000;
  return authenticatedAt <= now + clockToleranceMs && now - authenticatedAt <= maxAgeMs;
}

export function serializeAdminSessionCookie(
  token: string,
  options: { maxAgeMs?: number; secure?: boolean } = {}
): string {
  const maxAgeSeconds = Math.max(1, Math.floor((options.maxAgeMs ?? ADMIN_SESSION_TTL_MS) / 1000));
  const secure = options.secure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearAdminSessionCookie(options: { secure?: boolean } = {}): string {
  const secure = options.secure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header || typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

/** State-changing requests authenticated by cookie must carry the CSRF header. */
export function requiresAdminCsrfHeader(method: string | undefined): boolean {
  const normalized = (method || 'GET').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}
