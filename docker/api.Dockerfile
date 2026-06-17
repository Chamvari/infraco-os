# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# infraco-os  –  NestJS API
# Build context = repo ROOT (the API is not in an api/ subdir):
#   docker build -f docker/api.Dockerfile -t infraco-api .
# Debian (bookworm) base rather than alpine — Prisma's query engine needs glibc + openssl.
# ─────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client (prisma CLI is a devDependency, present here)
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build            # nest build → dist/

# ── Runner ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Bring in the generated Prisma client from the builder
# (the prisma CLI is a devDependency, so we can't `prisma generate` here).
COPY --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist                        ./dist
COPY prisma ./prisma

USER node                    # drop privileges (node image ships an unprivileged 'node' user)
EXPOSE 3001
CMD ["node", "dist/main.js"]
