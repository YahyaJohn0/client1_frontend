import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const LEGACY_TEST_PASSWORD = 'LegacyTest-Passphrase!42';
const NEW_TEST_PASSWORD = 'Harbor!Copper-River-73';

let server: Server | undefined;
let port = 0;
let dataDir = '';
let database: any;

interface ApiResult {
  status: number;
  json: any;
  cookie: string;
  setCookie: string[];
  headers: Headers;
}

async function call(
  pathName: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    csrf?: boolean;
    bearer?: string;
  } = {}
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.csrf !== false) headers['X-Zamzam-Admin'] = '1';
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;

  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let json: any = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Leave the raw text for assertions on non-JSON responses.
  }
  const setCookie =
    typeof (response.headers as any).getSetCookie === 'function'
      ? (response.headers as any).getSetCookie()
      : [response.headers.get('set-cookie') || ''].filter(Boolean);
  return {
    status: response.status,
    json,
    setCookie,
    cookie: setCookie[0] ? setCookie[0].split(';')[0] : '',
    headers: response.headers
  };
}

async function login(password: string): Promise<ApiResult> {
  return call('/api/admin/login', {
    method: 'POST',
    body: { username: 'admin', password },
    csrf: false
  });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zamzam-admin-auth-'));
  const legacyHash = crypto.createHash('sha256').update(LEGACY_TEST_PASSWORD).digest('hex');
  fs.writeFileSync(
    path.join(dataDir, 'store.json'),
    JSON.stringify({
      adminAuth: {
        username: 'admin',
        passwordHash: legacyHash,
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        // Simulate an account flagged for mandatory rotation (e.g. legacy).
        mustChangePassword: true
      }
    })
  );

  process.env.ZAMZAM_DATA_DIR = dataDir;
  process.env.ZAMZAM_UPLOADS_DIR = path.join(dataDir, 'uploads');
  process.env.ZAMZAM_NO_LISTEN = '1';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.ALLOW_LOCAL_ADMIN = 'true';
  process.env.ADMIN_UIDS = '';
  process.env.FIREBASE_PROJECT_ID = 'test-project';

  const serverModule = await import('../server.ts');
  const dbModule = await import('./db.ts');
  database = dbModule.db;

  server = serverModule.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
  port = (server!.address() as AddressInfo).port;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test('public storefront endpoints stay public', async () => {
  const [health, products, categories, settings] = await Promise.all([
    call('/health/live'),
    call('/api/v1/products'),
    call('/api/v1/categories'),
    call('/api/v1/settings')
  ]);
  assert.equal(health.status, 200);
  assert.equal(products.status, 200);
  assert.ok(Array.isArray(products.json.products));
  assert.equal(categories.status, 200);
  assert.equal(settings.status, 200);
});

test('admin endpoints reject requests without credentials', async () => {
  for (const pathName of [
    '/api/admin/products',
    '/api/admin/orders',
    '/api/admin/categories',
    '/api/admin/settings',
    '/api/admin/audit-logs',
    '/api/admin/cloudinary/config',
    '/api/admin/me'
  ]) {
    const result = await call(pathName);
    assert.equal(result.status, 401, `${pathName} must require authentication`);
    assert.equal(result.json.code, 'UNAUTHENTICATED');
  }

  // Account-security endpoints are never reachable without an administrator
  // session, and never accept an arbitrary target account.
  const noAuthChange = await call('/api/admin/change-password', {
    method: 'POST',
    body: { currentPassword: 'x', newPassword: 'y', username: 'someone-else' }
  });
  assert.equal(noAuthChange.status, 401);

  const noAuthRecord = await call('/api/admin/security/password-changed', { method: 'POST', body: {} });
  assert.equal(noAuthRecord.status, 401);

  const malformedChange = await call('/api/admin/change-password', {
    method: 'POST',
    body: { currentPassword: 'x', newPassword: 'y' },
    bearer: 'not.a.token'
  });
  assert.equal(malformedChange.status, 401);
});

test('malformed Firebase ID tokens are rejected before any admin action', async () => {
  const result = await call('/api/admin/products', { bearer: 'not.a.valid-token' });
  assert.equal(result.status, 401);
  assert.equal(result.json.code, 'INVALID_TOKEN');
});

test('local recovery login sets an httpOnly SameSite=Strict cookie and no token in the body', async () => {
  const result = await login(LEGACY_TEST_PASSWORD);
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.user.provider, 'local');
  assert.equal(result.json.user.mustChangePassword, true);
  assert.equal(result.json.token, undefined, 'no bearer token may be returned');
  assert.match(result.setCookie[0], /HttpOnly/);
  assert.match(result.setCookie[0], /SameSite=Strict/);
  assert.match(result.setCookie[0], /^zamzam_admin_session=/);
});

test('a legacy/default password blocks admin operations until it is rotated', async () => {
  const session = await login(LEGACY_TEST_PASSWORD);
  assert.equal(session.status, 200);

  const me = await call('/api/admin/me', { cookie: session.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.mustChangePassword, true);

  const products = await call('/api/admin/products', { cookie: session.cookie });
  assert.equal(products.status, 403);
  assert.equal(products.json.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('password change requires the current password, a strong new password and stays authenticated', async () => {
  const session = await login(LEGACY_TEST_PASSWORD);
  assert.equal(session.status, 200);

  const wrongCurrent = await call('/api/admin/change-password', {
    method: 'POST',
    body: { currentPassword: 'definitely-not-the-password', newPassword: NEW_TEST_PASSWORD },
    cookie: session.cookie
  });
  assert.equal(wrongCurrent.status, 400);
  assert.equal(wrongCurrent.json.code, 'INVALID_CURRENT_PASSWORD');

  const weak = await call('/api/admin/change-password', {
    method: 'POST',
    body: { currentPassword: LEGACY_TEST_PASSWORD, newPassword: 'weakpass' },
    cookie: session.cookie
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.code, 'WEAK_PASSWORD');

  const changed = await call('/api/admin/change-password', {
    method: 'POST',
    body: { currentPassword: LEGACY_TEST_PASSWORD, newPassword: NEW_TEST_PASSWORD },
    cookie: session.cookie
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.user.mustChangePassword, false);
  assert.notEqual(changed.cookie, session.cookie);
  assert.match(changed.setCookie[0], /HttpOnly/);

  // The old session must be invalid after the signing secret rotates.
  const oldSession = await call('/api/admin/me', { cookie: session.cookie });
  assert.equal(oldSession.status, 401);

  // The fresh cookie from the change response remains authorised.
  const freshSession = await call('/api/admin/me', { cookie: changed.cookie });
  assert.equal(freshSession.status, 200);
  assert.equal(freshSession.json.user.mustChangePassword, false);

  // The old password no longer works and the new one does.
  const oldLogin = await login(LEGACY_TEST_PASSWORD);
  assert.equal(oldLogin.status, 401);
  const newLogin = await login(NEW_TEST_PASSWORD);
  assert.equal(newLogin.status, 200);
});

test('cookie-authenticated state changes require the CSRF header', async () => {
  const session = await login(NEW_TEST_PASSWORD);
  assert.equal(session.status, 200);

  const noCsrf = await call('/api/admin/products', {
    method: 'POST',
    body: { name: 'Should Not Exist', price: 10, categoryId: 'cat-hair' },
    cookie: session.cookie,
    csrf: false
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.json.code, 'CSRF_HEADER_REQUIRED');

  const created = await call('/api/admin/products', {
    method: 'POST',
    body: { name: 'Security Test Product', sku: 'SEC-TEST-1', price: 10, stock: 2, categoryId: 'cat-hair' },
    cookie: session.cookie
  });
  assert.equal(created.status, 201);
  assert.ok(created.json.product.id);

  const publicProduct = await call(`/api/v1/products/${created.json.product.id}`);
  assert.equal(publicProduct.status, 200);

  const deleted = await call(`/api/admin/products/${created.json.product.id}?force=true`, {
    method: 'DELETE',
    cookie: session.cookie
  });
  assert.equal(deleted.status, 200);
});

test('logout revokes the local session and the cookie stops working', async () => {
  const session = await login(NEW_TEST_PASSWORD);
  assert.equal(session.status, 200);

  const logout = await call('/api/admin/logout', {
    method: 'POST',
    cookie: session.cookie,
    csrf: false
  });
  assert.equal(logout.status, 200);

  const reuse = await call('/api/admin/me', { cookie: session.cookie });
  assert.equal(reuse.status, 401);
});

test('a customer order history is never readable without a verified customer token', async () => {
  assert.equal((await call('/api/orders/my')).status, 401);
  assert.equal((await call('/api/orders/my', { bearer: 'not.a.token' })).status, 401);
});

test('repeated invalid logins lock the local account and are audited', async () => {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await login('wrong-password-attempt');
    lastStatus = result.status;
  }
  assert.equal(lastStatus, 401, 'five failed attempts are reported as invalid credentials');

  const locked = await login(NEW_TEST_PASSWORD);
  assert.equal(locked.status, 423);
  assert.equal(locked.json.code, 'ACCOUNT_LOCKED');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);

  const events = database.getAuditLogs().filter((entry: any) => entry.entityType === 'security');
  assert.ok(events.some((entry: any) => entry.action === 'Admin Login Failed'));
  assert.ok(events.some((entry: any) => entry.action === 'Admin Login Blocked'));
  assert.ok(events.some((entry: any) => entry.action === 'Admin Password Changed'));
  assert.ok(
    events.every((entry: any) => !JSON.stringify(entry).includes(LEGACY_TEST_PASSWORD)),
    'audit entries must never contain passwords'
  );
});
