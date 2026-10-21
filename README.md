# Zamzam storefront

Mobile-first React + Vite storefront and admin console. Firebase Authentication
is used for sign-in; product catalog reads and admin writes go through the
protected Node API to Firestore's MongoDB-compatible endpoint. Other Firebase
data features continue to use the Firebase SDK. Product images upload directly
to Cloudinary with an unsigned upload preset.

## Run locally

Run the API from `client_backend` and the storefront from `Client1_Frontend` in
separate terminals. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for environment and
deployment setup.

```powershell
Set-Location .\client_backend
npm install
npm run dev
```

```powershell
Set-Location .\Client1_Frontend
npm install
npm run dev
```

Set `API_BASE_URL=http://localhost:8080` in the frontend `.env`, along
with the public Firebase and Cloudinary build variables. The MongoDB URI must
only be set in `client_backend/.env` or the backend host's secret manager.

## Product catalog

The backend exposes public reads for active products and verifies Firebase
administrator ID tokens for product writes. Configure the admin UID in the
backend `ADMIN_UIDS` variable and create the Firebase admin allowlist records
described in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Import the supplied 16-product JSON list from `client_backend` with
`npm run seed:products`. Records upsert by SKU.

## Cloudinary setup

Use an unsigned preset with file type, size, and transformation restrictions.
The cloud name and preset name are public browser settings. Never expose a
Cloudinary API secret. Unsigned uploads cannot be securely deleted from the
browser; remove abandoned images in the Cloudinary console.

## Hosting and checkout

Deploy the frontend as a static site and the Node API as a separate service.
The API must remain available for product catalog reads and admin product
management; the MongoDB connection string stays server-side. Firebase and
Cloudinary may charge for usage beyond their current free quotas.

Checkout calculation still runs in the browser. Firebase rules protect order
privacy and restrict administrative writes, but cannot make browser-calculated
prices or coupon use authoritative. Orders do not reserve stock. Use trusted
server-side checkout logic if authoritative pricing, coupon limits, or stock
reservation is required.
