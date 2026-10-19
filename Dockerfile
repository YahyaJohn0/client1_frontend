# syntax=docker/dockerfile:1
# Production image for the Zamzam storefront + API server.
#
# Build (Vite bakes VITE_* values into the SPA):
#   docker build \
#     --build-arg VITE_FIREBASE_API_KEY=... \
#     --build-arg VITE_FIREBASE_AUTH_DOMAIN=... \
#     --build-arg VITE_FIREBASE_PROJECT_ID=... \
#     --build-arg VITE_FIREBASE_APP_ID=... \
#     -t zamzam-store .
#
# Run (mount a persistent volume; set the same Firebase project at runtime so the
# API can verify ID tokens):
#   docker run -p 3000:3000 \
#     -e NODE_ENV=production \
#     -e FIREBASE_PROJECT_ID=... \
#     -e ADMIN_UIDS=... \
#     -e ALLOW_LOCAL_ADMIN=false \
#     -v zamzam-data:/app/data \
#     zamzam-store

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Public client configuration is embedded at build time by Vite.
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_API_BASE_URL=""
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

# Install all dependencies (Vite/TypeScript are needed to build the SPA).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Application code, built dist/ and production dependencies only.
COPY --from=build /app ./

# The datastore and local uploads must live on a mounted volume in production.
RUN mkdir -p /app/data/uploads \
  && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
