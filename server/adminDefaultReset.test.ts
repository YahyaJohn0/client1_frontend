import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LEGACY_DEFAULT_PASSWORD_HASH } from './adminSecurity.ts';

const RECOVERY_TEST_PASSWORD = 'Willow$Canyon-Breeze-64';

let server: Server | undefined;
let port = 0;
let dataDir = '';
let database: any;

async function call(pathName: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { 'X-Zamzam-Admin': '1' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
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
    // Keep raw text.
  }
  const setCookie =
    typeof (response.headers as any).getSetCookie === 'function'
      ? (response.headers as any).getSetCookie()
      : [];
  return {
    status: response.status,
    json,
    cookie: setCookie[0] ? setCookie[0].split(';')[0] : ''
  };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zamzam-admin-default-'));
  fs.writeFileSync(
    path.join(dataDir, 'store.json'),
    JSON.stringify({
      adminAuth: {
        username: 'admin',
        // The exact hash of the removed default password. The plaintext does not
        // exist in this test or in the application.
        passwordHash: LEGACY_DEFAULT_PASSWORD_HASH,
        tokenSecret: crypto.randomBytes(32).toString('hex')
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

test('a removed default password cannot authenticate, even to rotate it', async () => {
  const result = await call('/api/admin/login', {
    method: 'POST',
    body: { username: 'admin', password: 'any-attempt-value' }
  });
  assert.equal(result.status, 403);
  assert.equal(result.json.code, 'PASSWORD_RESET_REQUIRED');
  assert.equal(result.cookie, '', 'no session may be issued');
});

test('the operator recovery CLI path restores secure access', async () => {
  const recovery = database.setAdminPassword(RECOVERY_TEST_PASSWORD);
  assert.equal(recovery.success, true);

  const login = await call('/api/admin/login', {
    method: 'POST',
    body: { username: 'admin', password: RECOVERY_TEST_PASSWORD }
  });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.mustChangePassword, false);
  assert.ok(login.cookie.startsWith('zamzam_admin_session='));

  const me = await call('/api/admin/me', { cookie: login.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.provider, 'local');

  const adminData = await call('/api/admin/products', { cookie: login.cookie });
  assert.equal(adminData.status, 200);
});
