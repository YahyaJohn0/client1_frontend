# Deployment

## Architecture

| Component | Directory | Deployment |
| --- | --- | --- |
| Vite storefront build | `client_frontend/` | Netlify static site |
| Storefront Express API/admin server | `client_frontend/server.ts` | Long-running Node.js host with a persistent disk |
| Optional Firebase/Firestore API | `client_backend/` | Separate Node.js service; it has a different API contract and is not a drop-in server for the storefront |

The root [`netlify.toml`](./netlify.toml) sets `client_frontend` as the build base and publishes its Vite `dist/` output. Netlify serves the static bundle only; it does not run either Express server as a permanent service. The previous `frontent/` path is not the storefront source.

## Netlify storefront

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Node.js: 22
- Set the public Vite Firebase values needed by sign-in: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL` (if used), `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`.
- Netlify's `VITE_API_BASE_URL` is set to `https://clientbackend2-qu4dpdu9.b4a.run`; the frontend appends each API path to this origin, so health checks use `/health/live` and `/health/ready`. Change this public build variable if the API host changes.
- The `client_backend/` service currently exposes a different API contract from `client_frontend/server.ts`. Its health checks can be called through this base URL, but changing the URL alone does not make every storefront or admin operation compatible; integrate/adapt the route and authentication contracts before relying on those features. For the storefront's full existing API, point `VITE_API_BASE_URL` at its compatible Express server instead.

Firebase web configuration and a Firebase project ID are public client configuration, not authentication credentials. Firebase Authentication, Firestore rules, and server-side administrator authorization still need to be configured correctly. Do not put Firebase service-account JSON/private keys, Cloudinary API secrets/`CLOUDINARY_URL`, administrator passwords, or signing/HMAC secrets in Netlify or any `VITE_*` variable.

Secrets scanning remains enabled. The narrow `SECRETS_SCAN_OMIT_KEYS` list in `netlify.toml` contains only verified non-secret configuration identifiers: normal runtime settings, the public Firebase project ID and web configuration, the public Cloudinary upload-preset identifier, and the public API URL. No paths or source directories are omitted. Do not set `SECRETS_SCAN_ENABLED=false`.

## Express service

Deploy `client_frontend/` to a long-running Node.js host that supports a persistent volume. It stores products, orders, administrator state, and local uploads in its JSON datastore and uses in-memory sessions/rate limits; do not scale it across multiple instances without replacing those storage components. Set `NODE_ENV=production`, the host-assigned `PORT`, `TRUST_PROXY=1` behind a trusted proxy, and a persistent `ZAMZAM_DATA_DIR` (plus `ZAMZAM_UPLOADS_DIR` if needed).

Configure the server-side `FIREBASE_PROJECT_ID` for ID-token verification and `ADMIN_UIDS` or trusted Firebase admin claims for authorization. The browser's `VITE_FIREBASE_PROJECT_ID` is separate and public. If Firestore mirroring is enabled, configure the non-`VITE_` `FIREBASE_API_KEY` and other `FIREBASE_*` client settings needed by that server integration. Set `CORS_ORIGINS` to the exact frontend origin when not proxying requests through Netlify.

For Cloudinary uploads, configure `CLOUDINARY_URL` as a server-side credential. The public cloud name and optional upload-preset name use `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET`. The app sends uploads to the server; the Cloudinary API secret is never needed in the browser.

## Optional Firebase backend service

`client_backend/` is a standalone Firebase Admin/Firestore API with a different endpoint and authorization model. Deploy it to Vercel only if the frontend has been deliberately integrated with its API; its admin endpoints do not replace the storefront's `/api/admin/*` interface. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, exact `CORS_ORIGINS`, and a unique random `ORDER_TRACKING_HMAC_SECRET` in the Vercel project's environment variables. Configure private Cloudinary credentials there only when signed uploads are enabled. See [`client_backend/README.md`](./client_backend/README.md) for deployment steps and the complete variable list.

## Secrets-scanning findings

The reported `LOG_LEVEL`, `NODE_ENV`, and `PORT` values are ordinary runtime configuration. `FIREBASE_PROJECT_ID` is a public identifier, not a password. `CLOUDINARY_UPLOAD_PRESET` is a public preset name; the optional Firebase backend signs uploads server-side. The Netlify omissions are limited to these verified false positives. The backend Git repository ignores its service-account JSON and `.env`. A populated local `.env` contains a Cloudinary credential URL and order-tracking HMAC secret; these were not found in tracked source or the generated bundle. Rotate those values and the service-account key if they have ever been committed, shared, or deployed to an untrusted location.

## Release checks

Configure the public client variables in Netlify and the private runtime variables in Vercel, then test `/health/ready`, Firebase sign-in/admin authorization, product image uploads, and persistent writes. No Netlify or Vercel deployment is performed by these repository changes.

The current workspace has no Git root: `client_backend/` is a separate Git checkout, while the root Netlify config and `client_frontend/` are outside it. To have Netlify use this frontend build configuration, its connected Git repository must contain both `netlify.toml` and `client_frontend/`; the backend-only Git checkout cannot build that storefront.
