import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  LEGACY_DEFAULT_PASSWORD_HASH,
  decideFirebaseAdmin,
  clearAdminSessionCookie,
  createSessionToken,
  hashPassword,
  isLegacyDefaultHash,
  isRecentAuthentication,
  parseAdminUids,
  parseCookies,
  requiresAdminCsrfHeader,
  serializeAdminSessionCookie,
  verifyPassword,
  verifySessionToken
} from './adminSecurity.ts';
import { validatePasswordStrength } from '../src/utils/passwordPolicy.ts';

const TEST_PASSWORD = 'Riv3r-Stone!Lantern42';
const OTHER_PASSWORD = 'Copper$Harbor-Wind7';

test('scrypt password hashes verify and are salted', () => {
  const first = hashPassword(TEST_PASSWORD);
  const second = hashPassword(TEST_PASSWORD);
  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(first, second, 'each hash must use a fresh random salt');
  assert.deepEqual(verifyPassword(TEST_PASSWORD, first), { valid: true, needsRehash: false });
  assert.deepEqual(verifyPassword('wrong-password', first), { valid: false, needsRehash: false });
});

test('legacy SHA-256 hashes still verify once and request a rehash', () => {
  const legacyHash = crypto.createHash('sha256').update(TEST_PASSWORD).digest('hex');
  assert.deepEqual(verifyPassword(TEST_PASSWORD, legacyHash), { valid: true, needsRehash: true });
  assert.deepEqual(verifyPassword('wrong-password', legacyHash), { valid: false, needsRehash: false });
});

test('the removed default password hash is detected without storing the password', () => {
  assert.equal(isLegacyDefaultHash(LEGACY_DEFAULT_PASSWORD_HASH), true);
  assert.equal(isLegacyDefaultHash(LEGACY_DEFAULT_PASSWORD_HASH.toUpperCase()), true);
  assert.equal(isLegacyDefaultHash(hashPassword(TEST_PASSWORD)), false);
  assert.equal(isLegacyDefaultHash(null), false);
});

test('password policy accepts a strong password and rejects weak variants', () => {
  const strong = validatePasswordStrength(TEST_PASSWORD, { identifier: 'admin' });
  assert.equal(strong.ok, true);
  assert.equal(strong.errors.length, 0);
  assert.ok(strong.score >= 2);

  assert.equal(validatePasswordStrength('short', {}).ok, false);
  assert.equal(validatePasswordStrength('alllowercaseonly', {}).ok, false);
  assert.equal(validatePasswordStrength('Password123!', {}).ok, false, 'common passwords are rejected');
  assert.equal(
    validatePasswordStrength(TEST_PASSWORD, { currentPassword: TEST_PASSWORD }).ok,
    false
  );
  assert.equal(
    validatePasswordStrength('Zamzam!Stronger99', { identifier: 'zamzam' }).ok,
    false
  );
  assert.equal(validatePasswordStrength(` ${TEST_PASSWORD}`, {}).ok, false);
  assert.equal(
    validatePasswordStrength('correct horse battery staple', {}).ok,
    true,
    'long passphrases are allowed'
  );
});

test('session tokens are signed, expiring and tamper evident', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const now = 1_800_000_000_000;
  const token = createSessionToken({ username: 'admin', secret, now, ttlMs: 60_000, sid: 'session-1' });

  const payload = verifySessionToken(token, secret, now + 1_000);
  assert.ok(payload);
  assert.equal(payload?.sid, 'session-1');
  assert.equal(payload?.username, 'admin');
  assert.equal(payload?.authenticatedAt, now);
  assert.equal(verifySessionToken(token, secret, now + 60_001), null, 'expired tokens are rejected');
  assert.equal(verifySessionToken(token, 'another-secret', now), null, 'signature must match');

  const [body, signature] = token.split('.');
  const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}.${signature}`;
  assert.equal(verifySessionToken(tamperedBody, secret, now), null);
  assert.equal(verifySessionToken(`${body}.${signature.slice(0, -1)}A`, secret, now), null);
});

test('session tokens reject a future issue time and preserve authentication age', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const now = 1_800_000_000_000;
  const future = createSessionToken({ username: 'admin', secret, now: now + 10 * 60_000 });
  assert.equal(verifySessionToken(future, secret, now), null);

  const stale = createSessionToken({
    username: 'admin',
    secret,
    now,
    authenticatedAt: now - 60 * 60_000
  });
  const payload = verifySessionToken(stale, secret, now);
  assert.equal(payload?.authenticatedAt, now - 60 * 60_000);
});

test('only trusted claims or the server allowlist grant administrator access', () => {
  const allowlist = parseAdminUids('firebase-admin-1, firebase-admin-2 ,,');
  assert.deepEqual([...allowlist], ['firebase-admin-1', 'firebase-admin-2']);

  assert.deepEqual(decideFirebaseAdmin({ uid: 'claimed', admin: true }, allowlist), {
    authorized: true,
    reason: 'claim'
  });
  assert.deepEqual(decideFirebaseAdmin({ uid: 'firebase-admin-2' }, allowlist), {
    authorized: true,
    reason: 'allowlist'
  });
  assert.deepEqual(decideFirebaseAdmin({ uid: 'customer' }, allowlist), {
    authorized: false,
    reason: 'not_admin'
  });
  assert.deepEqual(decideFirebaseAdmin(null, allowlist), { authorized: false, reason: 'invalid' });
  assert.deepEqual(decideFirebaseAdmin({ uid: '' }, allowlist), { authorized: false, reason: 'invalid' });
});

test('recent authentication is enforced with a small clock tolerance', () => {
  const now = 1_800_000_000_000;
  assert.equal(isRecentAuthentication(now - 1_000, 10 * 60_000, now), true);
  assert.equal(isRecentAuthentication(now - 11 * 60_000, 10 * 60_000, now), false);
  assert.equal(isRecentAuthentication(now + 30_000, 10 * 60_000, now), true);
  assert.equal(isRecentAuthentication(Number.NaN, 10 * 60_000, now), false);
});

test('administrator session cookies are HttpOnly, SameSite=Strict and parseable', () => {
  const cookie = serializeAdminSessionCookie('token.value', { maxAgeMs: ADMIN_SESSION_TTL_MS, secure: true });
  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=token\\.value;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(serializeAdminSessionCookie('t', { secure: false }), /; Secure/);

  const cleared = clearAdminSessionCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);

  assert.deepEqual(parseCookies(`a=1; ${ADMIN_SESSION_COOKIE}=abc%2Edef; empty=`), {
    a: '1',
    [ADMIN_SESSION_COOKIE]: 'abc.def',
    empty: ''
  });
  assert.deepEqual(parseCookies(undefined), {});
});

test('CSRF protection is required for cookie-authenticated state changes', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
    assert.equal(requiresAdminCsrfHeader(method), true, method);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS', undefined]) {
    assert.equal(requiresAdminCsrfHeader(method), false, String(method));
  }
});
