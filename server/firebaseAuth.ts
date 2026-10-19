import crypto from 'node:crypto';

/**
 * Minimal verification of Firebase ID tokens (RS256, Google secure-token
 * certificates). Used by the bundled API server to identify a signed-in
 * customer without requiring a Firebase Admin service account.
 *
 * Only public certificates and the Firebase project ID are needed, so the
 * storefront keeps working with a pure client-side Firebase configuration.
 */

const SECURE_TOKEN_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CERT_CACHE_MS = 60 * 60 * 1000;

let certificateCache: { fetchedAt: number; certificates: Record<string, string> } | null = null;
let trustedTimeCache: { fetchedAt: number; seconds: number } | null = null;
let lastTimeWarningAt = 0;

/**
 * Returns the current time according to Google. A machine clock that runs
 * ahead of real time makes every Firebase ID token look "issued in the future"
 * or "expired"; TLS-verified server time keeps token checks correct without
 * weakening the signature validation.
 */
export async function getTrustedNowSeconds(): Promise<number> {
  const cacheTtlMs = 5 * 60 * 1000;
  if (trustedTimeCache && Date.now() - trustedTimeCache.fetchedAt < cacheTtlMs) {
    return trustedTimeCache.seconds;
  }
  try {
    const res = await fetch('https://www.googleapis.com/generate_204', {
      method: 'GET',
      signal: AbortSignal.timeout(4000)
    });
    const header = res.headers.get('date');
    const parsed = header ? Date.parse(header) : NaN;
    if (Number.isFinite(parsed)) {
      const seconds = Math.floor(parsed / 1000);
      trustedTimeCache = { fetchedAt: Date.now(), seconds };
      return seconds;
    }
  } catch {
    // Fall back to the local clock below.
  }
  if (Date.now() - lastTimeWarningAt > 60 * 60 * 1000) {
    lastTimeWarningAt = Date.now();
    console.warn('[Firebase Auth] Could not read trusted time; using the local system clock.');
  }
  return Math.floor(Date.now() / 1000);
}

/** Raised when Firebase's public signing keys cannot be fetched. */
export class FirebaseAuthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseAuthUnavailableError';
  }
}

async function getSigningCertificates(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certificateCache && now - certificateCache.fetchedAt < CERT_CACHE_MS) {
    return certificateCache.certificates;
  }

  let res: Response;
  try {
    res = await fetch(SECURE_TOKEN_CERT_URL, { signal: AbortSignal.timeout(8000) });
  } catch (err: any) {
    throw new FirebaseAuthUnavailableError(
      `Could not reach Firebase to verify the sign-in token (${err?.message || 'network error'}).`
    );
  }
  if (!res.ok) {
    throw new FirebaseAuthUnavailableError(
      `Could not load Firebase signing certificates (HTTP ${res.status}).`
    );
  }

  const certificates = (await res.json()) as Record<string, string>;
  certificateCache = { fetchedAt: now, certificates };
  return certificates;
}

function decodeJsonSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export interface VerifiedFirebaseClaims {
  uid: string;
  email?: string;
  emailVerified: boolean;
  /** Server-issued Firebase custom claim; never set by a public API. */
  admin: boolean;
  /** Unix seconds of the user's last real authentication. */
  authTime?: number;
  signInProvider?: string;
}

/**
 * Verifies signature, issuer, audience and lifetime of a Firebase ID token.
 * Throws a descriptive Error when the token cannot be trusted.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<VerifiedFirebaseClaims> {
  if (!projectId) {
    throw new Error('Firebase project ID is not configured for the API server.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token.');
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = decodeJsonSegment<{ alg?: string; kid?: string }>(headerSegment);
  const payload = decodeJsonSegment<Record<string, any>>(payloadSegment);
  if (!header || !payload) throw new Error('Malformed identity token.');
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported identity token algorithm.');
  }

  let certificates = await getSigningCertificates();
  let certificate = certificates[header.kid];
  if (!certificate) {
    certificates = await getSigningCertificates(true);
    certificate = certificates[header.kid];
  }
  if (!certificate) throw new Error('Unknown identity token signing key.');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  const publicKey = new crypto.X509Certificate(certificate).publicKey;
  if (!verifier.verify(publicKey, Buffer.from(signatureSegment, 'base64url'))) {
    throw new Error('Invalid identity token signature.');
  }

  const now = await getTrustedNowSeconds();
  const clockToleranceSeconds = 60;
  if (typeof payload.exp !== 'number' || payload.exp < now - clockToleranceSeconds) {
    throw new Error('The identity token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) {
    throw new Error('The identity token was issued in the future.');
  }
  if (payload.aud !== projectId) {
    throw new Error('The identity token audience does not match this store.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('The identity token issuer is invalid.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('The identity token is missing a subject.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
    admin: payload.admin === true,
    authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
    signInProvider:
      typeof payload.firebase?.sign_in_provider === 'string'
        ? payload.firebase.sign_in_provider
        : undefined
  };
}
