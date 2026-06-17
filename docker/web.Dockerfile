# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# infraco-os  –  Web SPA (Vite/React) served by Nginx
# Build context = repo ROOT (the SPA is in web/):
#   docker build -f docker/web.Dockerfile -t infraco-web .
# The SPA calls the API with same-origin relative paths (/auth, /plots,
# /leases, /api/*), so no build-time API URL is needed — Nginx reverse-proxies.
# ─────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build            # tsc && vite build → web/dist/

# ── Runtime (Nginx) ──────────────────────────────────────────
FROM nginx:1.27-alpine

# Site config: rate-limit zones + upstream + servers (loaded inside http{} via conf.d include)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Built SPA assets
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80 443
