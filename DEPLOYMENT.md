# Storefront and API deployment

The Vite storefront is static, but the product catalog uses the existing Node
API. The API connects to Firestore's MongoDB-compatible endpoint using a private
`FIRESTORE_URL`; the browser never receives that URL or its credentials. Other
Firebase-backed features continue to use Firebase Authentication and Firestore.
Product images upload directly to Cloudinary using the configured unsigned
preset.

## Configure the backend

1. In `client_backend`, install dependencies and copy `.env.example` to `.env`.
2. Set `FIRESTORE_URL` to the real connection string from Firestore's MongoDB
   compatibility page. Keep it in `client_backend/.env` or the backend host's
   secret manager. Never put it in the frontend `.env`, a `VITE_*` variable, or
   source control.
3. Set the existing Firebase server configuration, including
   `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`,
   `ORDER_TRACKING_HMAC_SECRET`, and `ADMIN_UIDS`. Add the Firebase administrator
   UID to `ADMIN_UIDS`, separated by commas if there is more than one.
4. Set `CORS_ORIGINS` to the exact deployed storefront origin(s).
5. Start the API with `npm run dev` locally or `npm run build && npm start` on a
   Node.js 22 host. Use that host's secret/environment settings for production;
   a local `.env` is not deployed with the server.

The browser admin still signs in through Firebase Authentication. Product
write endpoints verify the Firebase ID token and require the UID to be in
`ADMIN_UIDS`. Keep the backend API online for the storefront's catalog reads
and admin product management.

## Import the supplied product list

From `client_backend`, after setting a working `FIRESTORE_URL` in its `.env`, run:

```powershell
npm run seed:products
```

The importer validates `products.json`, converts each Cloudinary `imageUrl` to
the product image metadata format, and upserts records by SKU into the
`products` collection. It is safe to rerun: the 16 `SEED-SK-*` records update
in place rather than creating duplicates. The import does not delete unrelated
records. It requires an actual Mongo-compatible Firestore username and
password; the placeholder URI in `.env.example` is not usable.

## Configure the frontend

Set these public build variables:

- `API_BASE_URL`: backend origin, for example
  `https://your-api.example.com` (or `http://localhost:8080` locally).
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`,
  `FIREBASE_PROJECT_ID`, and `FIREBASE_APP_ID`.
- `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET`.

`API_BASE_URL` is a public API address, not a secret. Never place
`FIRESTORE_URL`, a Firebase service-account key, or a Cloudinary API secret in
the frontend environment. Rebuild the frontend after changing build variables.
The backend uses `FIRESTORE_URL` to connect to the Firestore
MongoDB-compatible endpoint and store product documents in the `products`
collection. The Firebase web SDK still uses the Firebase project configuration
for authentication and other Firebase-backed features.

## Firebase and Cloudinary

Deploy `database.rules.json` as Realtime Database rules and `firestore.rules` as
Firestore rules. Review and merge them with existing rules before deployment.
Create a Firestore document `admins/{FIREBASE_UID}` with
`{ "enabled": true }` and a Realtime Database entry `/admins/{FIREBASE_UID}`
with value `true`; use the same UID in backend `ADMIN_UIDS`.

Configure the Cloudinary unsigned preset with strict file type and size
restrictions. Unsigned uploads are public, and the browser cannot securely
delete Cloudinary assets.

## Browser-only checkout tradeoffs

Checkout still submits orders through the Firebase client SDK. A modified
browser can submit altered prices; coupon usage limits are not authoritative,
and orders do not reserve inventory. Use trusted server-side checkout logic if
you need server-authoritative pricing, coupon use, or inventory reservation.

## Local development

Run the API and frontend in separate terminals:

```powershell
# Terminal 1
Set-Location .\client_backend
npm install
npm run dev

# Terminal 2
Set-Location .\Client1_Frontend
npm install
npm run dev
```

Set `API_BASE_URL=http://localhost:8080` in the frontend `.env`, along
with the public Firebase and Cloudinary variables.
