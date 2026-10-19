# Zamzam storefront

Mobile-first lifestyle store (React + Vite) with a bundled Express API server.
The same process serves the storefront **and** the API, so the browser talks to
the API on the same origin and no CORS/proxy setup is needed.

## Run locally

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. The admin console lives at
<http://localhost:3000/adminportal>.

Copy `.env.example` to `.env` and configure the public `VITE_FIREBASE_*` values
for the browser. Server settings use non-`VITE_` names such as
`FIREBASE_PROJECT_ID`, `ADMIN_UIDS`, and `CLOUDINARY_URL`; never put private
credentials in Vite-prefixed variables. Netlify builds only the static `dist/`
bundle. Run this directory's Express server on a separate Node.js host and
configure Netlify's API URL or same-origin proxy accordingly.

The Netlify production build and frontend default use
`https://clientbackend2-qu4dpdu9.b4a.run`. The API client targets the standalone
backend's `/api/v1` routes, translates storefront product/order data to its
contract, and sends Firebase ID tokens for administrator requests. Local
frontend ports 3000, 5173, and 8080 are allowed by the backend CORS defaults.
Set `VITE_API_BASE_URL` in a local `.env` only when targeting a different API.

The standalone API does not provide administrator management endpoints for
banners, coupons, store settings, or audit logs, nor local username/password
administrator sessions. Those controls remain unavailable when this frontend
is connected to `client_backend`; Firebase administrator email sign-in is
required.

For the deployed standalone backend, add the Firebase administrator UID to its
server-side `ADMIN_UIDS` setting. The local recovery account is only available
when running this frontend's bundled Express server; it is not accepted by
`client_backend`.

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Express + Vite middleware; storefront and API on port 3000 |
| `npm run build` | Production SPA bundle into `dist/` |
| `npm start` | Production server (`node server.ts`, Node 22.18+) serving `dist/` and the API |
| `npm run start:tsx` | Fallback start via `tsx` if the host uses an older Node and has dev dependencies |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Security, API, pricing and validation tests |
| `npm run admin:set-password` | Trusted local recovery: set the local admin password without echo |

## Administrator authentication and authorization

Administrator access is verified by the **server** on every protected request.
The browser is never trusted to decide who is an administrator.

The bundled Express server supports Firebase and local recovery accounts. When
the frontend targets the deployed `client_backend`, only Firebase administrator
accounts are supported:

1. **Firebase administrator (recommended).** Sign in at `/adminportal` with a
   Firebase Email/Password account. Authentication alone is not enough: the API
   verifies the Firebase ID token (signature, issuer, audience, lifetime) and
   then authorizes the UID through one of:
   - the server-side `ADMIN_UIDS` allowlist in `.env`, or
   - a server-issued Firebase custom claim `admin: true`.
   If a valid Firebase account is not authorized, the login screen shows its UID
   so a trusted operator can add it to `ADMIN_UIDS` and restart the API.
The bundled Express server also supports a **local recovery account**. It is a
username/password account stored in `data/store.json` as a salted **scrypt**
hash. It has **no default password**: a removed default hash is refused at
login and must be replaced with `npm run admin:set-password`. An account
explicitly flagged for rotation must change its password before admin
operations. This recovery account is not available through the standalone
`client_backend`.

Customers may use Firebase normally, but a customer Firebase token receives
`403` on every admin endpoint. Signing into the storefront does not create an
admin session, and visiting `/adminportal` does not grant access.

### Password changes

Use the **Security** tab in the admin console:

- Firebase-managed accounts: the current password is verified with Firebase
  re-authentication, then the password is updated with the Firebase client SDK.
  The password never reaches the API server.
- Local recovery account: the API verifies the current password, enforces the
  password policy, stores a new scrypt hash, rotates the session secret and
  revokes all previous administrator sessions.

In bundled-server mode, local recovery sessions use an `HttpOnly`,
`SameSite=Strict` cookie. The Netlify deployment uses Firebase bearer tokens
and does not use local recovery cookies.

If the local password is unknown, stop the API server and run
`npm run admin:set-password` from this directory. The prompt hides input and the
password is never logged or passed as an argument. Restart the server afterwards.

### Provisioning a Firebase administrator

1. Create the administrator's account in Firebase Authentication
   (Email/Password) or let them sign in once at `/adminportal`.
2. If they are not yet authorized, the login screen displays their UID.
3. Add that UID to `ADMIN_UIDS` in `.env` (comma-separated for multiple admins),
   then restart the API.
4. Verify with `GET /api/v1/auth/admin/me` while signed in, or simply reopen
   `/adminportal`.

Never prefix `ADMIN_UIDS` with `VITE_`; Vite would expose it to the browser.
Do not add a `role` field to customer accounts: roles are not accepted from the
browser, and public signup always creates a customer.

## Where data lives

- `data/store.json` — products, categories, orders, coupons, banners, settings
  and the local recovery administrator hash. Written atomically by the API.
- `data/uploads/` — product images, served from `/uploads/*`. Used when
  `CLOUDINARY_URL` is not configured; otherwise uploads go to Cloudinary.

## Configuration (`.env`)

Copy `.env.example` to `.env` and fill in what you need:

- `VITE_FIREBASE_*` — public Firebase browser values, required for customer and
  administrator sign-in.
- `FIREBASE_PROJECT_ID` — server-side project ID used to verify ID tokens.
  `FIREBASE_API_KEY` and other `FIREBASE_*` settings are needed only for
  optional server-side Firestore mirroring.
- `ADMIN_UIDS` — **server-only** allowlist of Firebase administrator UIDs.
- `ALLOW_LOCAL_ADMIN` — set to `false` to disable the local recovery account.
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` — public account and
  preset identifiers returned by the authenticated API; the server performs
  the actual upload.
- `CLOUDINARY_URL` — server-side only. Enables Cloudinary uploads.
- `CORS_ORIGINS` — extra browser origins allowed to call the API (for example
  `http://localhost:5173` when running a separate Vite dev server).
- `PORT` — defaults to `3000`.
- `ENABLE_FIRESTORE_SYNC` — optional mirroring of product writes to Firestore.

Restart the API after changing server-side environment variables.

## API base URL

`src/services/api.ts` defaults to the deployed backend origin. To point the
storefront at a different API, set `VITE_API_BASE_URL` or use the admin
console's "Backend Base URL Override". Both a bare origin
(`https://api.example.com`) and the versioned form
(`https://api.example.com/api/v1`) are accepted; the prefix is normalized so
requests never become `/api/v1/api/v1/...`.

## Deploying to production

### Recommended topology

Run this server as **one service** that serves both the SPA (`dist/`) and the API.
That keeps the administrator cookie same-origin and avoids CORS when using the
bundled Express server. The current Netlify deployment instead serves the SPA
separately and calls `client_backend` with Firebase bearer tokens.

### Build and start

- **Node.js 22.18+** (the production start runs TypeScript directly with Node's
  type stripping; `engines` in `package.json` records this).
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start` (runs `node server.ts`; set `NODE_ENV=production`)
- Most platforms provide `PORT` automatically.

`npm run start:tsx` is a fallback if the host only offers an older Node but has
dev dependencies installed. Do not expose `npm run dev` publicly: it serves Vite
middleware.

### Environment variables

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` / `HOST` | Host-provided / `0.0.0.0` |
| `TRUST_PROXY` | `1` (one proxy hop; `false` if the process is directly exposed) |
| `FORCE_HTTPS` | `true` to redirect HTTP→HTTPS if the proxy does not |
| `ADMIN_COOKIE_SECURE` | Defaults to `true` in production; only `false` for local HTTP |
| `ADMIN_UIDS` | Comma-separated Firebase administrator UIDs (server-only) |
| `ALLOW_LOCAL_ADMIN` | `false` once Firebase administrators work |
| `VITE_FIREBASE_*` | Firebase web configuration (public, build-time) |
| `FIREBASE_PROJECT_ID` | Server-side project ID for ID-token verification |
| `CLOUDINARY_URL` | Server-side Cloudinary secret (recommended for hosted images) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` | Public Cloudinary identifiers; the server performs uploads |
| `ZAMZAM_DATA_DIR` | Path to a **persistent volume** for `store.json` |
| `ZAMZAM_UPLOADS_DIR` | Path to a persistent volume for local uploads |
| `CORS_ORIGINS` | Only when the SPA is hosted on another origin |
| `API_RATE_LIMIT_PER_MIN` / `TRACKING_RATE_LIMIT_PER_MIN` | Defaults `300` / `30` |
| `BODY_LIMIT` | Default `25mb` (base64 image uploads) |
| `ENABLE_FIRESTORE_SYNC` | Optional mirroring; leave unset unless Firestore is configured |

### Persistent data (important)

The datastore is a JSON file and product images can be local files. Host
container filesystems are usually **ephemeral**: without a persistent disk, a
redeploy resets products/orders and the admin account.

- Mount a persistent volume and point `ZAMZAM_DATA_DIR` (and
  `ZAMZAM_UPLOADS_DIR`) at it.
- Run **one instance**; the JSON store is not safe for multiple concurrent
  writers.
- Back the volume up.
- Set `CLOUDINARY_URL` for images; local uploads are not durable on most hosts.
- Never bake `data/` or `.env` into an image or repository.

### HTTPS, proxy and CORS

- Terminate TLS at the hosting platform (or a CDN/load balancer). Set
  `TRUST_PROXY=1` so client IPs and the forwarded HTTPS scheme are honoured;
  administrator cookies are `Secure` in production.
- `FORCE_HTTPS=true` adds a redirect if the proxy does not.
- Same-origin deployment needs no `CORS_ORIGINS`.
- If the SPA is hosted elsewhere, set `VITE_API_BASE_URL=https://api.example.com`
  **at frontend build time** and `CORS_ORIGINS=https://www.example.com` on the
  API. Firebase administrator sign-in works cross-origin; the local admin cookie
  is `SameSite=Strict` and is **not** sent cross-origin — use Firebase admin or
  serve the SPA from this server.

### Administrator access on a hosted platform

- Recommended: create the administrator in Firebase Authentication, add the UID
  to `ADMIN_UIDS`, set `ALLOW_LOCAL_ADMIN=false`, and restart.
- The local recovery account needs shell access to the host to run
  `npm run admin:set-password`; there is deliberately no remote bootstrap
  endpoint. If you already set a local password, you can sign in with it.

### Health checks

- `GET /health/live` — process liveness.
- `GET /health/ready` — returns `200` only when the datastore directory is
  readable/writable; `503` otherwise. Point the host's health check here.

### Docker

A production `Dockerfile` and `.dockerignore` are included. `VITE_*` values are
**baked into the SPA at build time**, so pass them as build arguments; the
Firebase project ID is also needed at runtime for ID-token verification.

```bash
docker build \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=... \
  --build-arg VITE_FIREBASE_PROJECT_ID=... \
  --build-arg VITE_FIREBASE_APP_ID=... \
  -t zamzam-store .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e FIREBASE_PROJECT_ID=... \
  -e ADMIN_UIDS=... \
  -e ALLOW_LOCAL_ADMIN=false \
  -e CLOUDINARY_URL=... \
  -v zamzam-data:/app/data \
  zamzam-store
```

Mount `/app/data` (and set Cloudinary) so data/images survive container
replacement. If you mount a volume, ensure it is writable by the container user.
To recover the local administrator inside the container, run
`docker exec -it <container> npm run admin:set-password` (the production image
keeps the script and runs it with Node, not `tsx`).

### Static assets and caching

Hashed `/assets/*` files are cached for a year with `immutable`; `index.html` is
served with `no-cache` so a new deployment is picked up immediately. Missing
asset/upload paths return `404` rather than the SPA shell.

## Optional standalone Firebase API

`../backend` is a separate Firebase/Firestore implementation of the API with its
own `/api/v1` contract. It uses the same trusted mechanism: a verified Firebase
ID token plus a server-issued `admin: true` custom claim or the `ADMIN_UIDS`
allowlist. It has no local password login and no password-change endpoint
(Firebase Authentication owns the password). See its `README.md` and
`FRONTEND_INTEGRATION.md` when deploying against it.
