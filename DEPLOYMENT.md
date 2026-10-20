# Deployment

## Architecture

| Component | Directory | Deployment |
| --- | --- | --- |
| Vite storefront build | `client_frontend/` | Netlify static site |
| Storefront Express API/admin server | `client_frontend/server.ts` | Long-running Node.js host with a persistent disk |
| Optional Firebase/Firestore API | `client_backend/` | Separate Node.js service; it has a different API contract and is not a drop-in server for the storefront |

Netlify can serve the storefront's static Vite bundle; it does not run either Express server as a permanent service. Configure the build settings below in the Netlify site dashboard; this repository does not include a Netlify configuration file.

## Netlify storefront

- Build command: `bun run build`
- Publish directory: `dist`
- Node.js: 22
- Set these public build-time variables for sign-in and product reads: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, and `FIREBASE_APP_ID`.
- The storefront reads published product records directly from Realtime Database at `/demoProducts`, using an `isActive == true` query. Each product must have `isActive: true`; image fields use Cloudinary HTTPS URLs.
- Configure Realtime Database rules to allow only the public active-product query and deny browser writes. For example, merge this path into the existing rules (do not replace other paths):
  ```json
  {
    "rules": {
      "demoProducts": {
        ".indexOn": ["isActive"],
        ".read": "query.orderByChild == 'isActive' && query.equalTo == true"
      }
    }
  }
  ```
  This rule grants only filtered public reads; admin writes continue through Firebase Admin on the authenticated backend. Never enable unrestricted public reads or writes.
- Set Netlify's `API_BASE_URL` to `https://clientbackend-taxt7mcy.b4a.run`; the frontend appends each API path to this origin, so health checks use `/health/live` and `/health/ready`. Trigger a fresh deployment after changing it.
- Product listing no longer calls this API. Categories, settings, checkout, orders, and administrator operations still use the API, so this change reduces backend traffic but does not remove the backend dependency for those features. The `client_backend/` service currently exposes a different API contract from `Client1_Frontend/server.ts`; changing the URL alone does not make every storefront or admin operation compatible.

Firebase web configuration and a Firebase project ID are public client configuration, not authentication credentials. Vite explicitly embeds only the Firebase web values and `API_BASE_URL`; do not put Firebase service-account JSON/private keys, Cloudinary API secrets/`CLOUDINARY_URL`, administrator passwords, or signing/HMAC secrets in frontend build variables. Firebase Authentication, Realtime Database rules, Firestore rules for private commerce data, and server-side administrator authorization still need to be configured correctly.

Keep Netlify secrets scanning enabled. Do not set `SECRETS_SCAN_ENABLED=false` or omit paths or source directories from scanning.

## Express service

Deploy `client_frontend/` to a long-running Node.js host that supports a persistent volume. It stores products, orders, administrator state, and local uploads in its JSON datastore and uses in-memory sessions/rate limits; do not scale it across multiple instances without replacing those storage components. Set `NODE_ENV=production`, the host-assigned `PORT`, `TRUST_PROXY=1` behind a trusted proxy, and a persistent `ZAMZAM_DATA_DIR` (plus `ZAMZAM_UPLOADS_DIR` if needed).

Configure the server-side `FIREBASE_PROJECT_ID` for ID-token verification and `ADMIN_UIDS` or trusted Firebase admin claims for authorization. `FIREBASE_PROJECT_ID` is also used by the browser as public configuration. If Firestore mirroring is enabled, configure `FIREBASE_API_KEY` and the other `FIREBASE_*` client settings needed by that server integration. The API currently permits cross-origin browser requests from all origins (without credentialed cookies); authorization must still be enforced by each API route. Set `CORS_ORIGINS` to exact additional origins only if you later remove the wildcard.

For Cloudinary uploads, configure `CLOUDINARY_URL` as a server-side credential. The public cloud name and optional upload-preset name use `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET`. The app sends uploads to the server; the Cloudinary API secret is never needed in the browser.

## Optional Firebase backend service

`client_backend/` is a standalone Firebase Admin/Firestore API with a different endpoint and authorization model. Deploy it to Vercel only if the frontend has been deliberately integrated with its API; its admin endpoints do not replace the storefront's `/api/admin/*` interface. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, exact `CORS_ORIGINS`, and a unique random `ORDER_TRACKING_HMAC_SECRET` in the Vercel project's environment variables. Configure private Cloudinary credentials there only when signed uploads are enabled. See [`client_backend/README.md`](./client_backend/README.md) for deployment steps and the complete variable list.

## Secrets-scanning findings

The reported `LOG_LEVEL`, `NODE_ENV`, and `PORT` values are ordinary runtime configuration. `FIREBASE_PROJECT_ID` is a public identifier, not a password. `CLOUDINARY_UPLOAD_PRESET` is a public preset name; the optional Firebase backend signs uploads server-side. The backend Git repository ignores its service-account JSON and `.env`. A populated local `.env` contains a Cloudinary credential URL and order-tracking HMAC secret; these were not found in tracked source or the generated bundle. Rotate those values and the service-account key if they have ever been committed, shared, or deployed to an untrusted location.

## Release checks

Configure the public client variables in Netlify and the private runtime variables in Vercel, then test `/health/ready`, Firebase sign-in/admin authorization, product image uploads, and persistent writes. No Netlify or Vercel deployment is performed by these repository changes.

The current workspace has no Git root: `client_backend/` is a separate Git checkout, while `Client1_Frontend/` is outside it. To deploy the storefront from Git, connect a repository containing this frontend and configure the build settings in the Netlify site dashboard; the backend-only Git checkout cannot build that storefront.
