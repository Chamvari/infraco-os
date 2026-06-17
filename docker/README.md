# infraco-os — production Docker stack

Adapts the "scaling layer" delivery to this repo's actual layout (flat repo:
NestJS API at the root, Vite/React SPA in `web/`). All files in this directory
are referenced relative to `docker/`; build contexts point at the repo root.

## Services

| Service     | Image                       | Notes |
|-------------|-----------------------------|-------|
| `db`        | `postgis/postgis:16-3.4`    | PostGIS required — Prisma datasource declares `postgis`, `btree_gist`, `pg_trgm`, `pgcrypto` |
| `pgbouncer` | `edoburu/pgbouncer:1.22.1`  | Transaction-mode pooler. **Verify before deploy** (see below) |
| `redis`     | `redis:7.2-alpine`          | Password-protected; BullMQ queues + cache |
| `api`       | built from `api.Dockerfile` | NestJS, scalable: `--scale api=N` |
| `web`       | built from `web.Dockerfile` | Nginx: HTTPS, SPA, reverse proxy |

## Deploy

```bash
cp docker/.env.production.example docker/.env   # then fill in every <CHANGE_ME>
./docker/install.sh                             # build + start (self-signed cert if none)
./docker/install.sh --seed-demo                 # also load db/seed_demo.sql
```

Or manually:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --build
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --scale api=3
```

Put real TLS certs at `docker/ssl/infraco.crt` and `docker/ssl/infraco.key`
(install.sh generates a self-signed pair if absent). `docker/.env` and
`docker/ssl/` are gitignored.

## Routing (Nginx → API)

The API uses an **empty global prefix**; controllers own their full paths, so
Nginx forwards the request URI unchanged (no prefix rewriting). Proxied edges
mirror `web/vite.config.ts` plus the Africa's Talking webhooks:

| Edge path                       | Goes to | Why |
|---------------------------------|---------|-----|
| `/auth/*`                       | API     | login etc. — stricter rate limit |
| `/plots*`, `/leases*`           | API     | `@Controller()` root routes the SPA calls |
| `/api/*`                        | API     | `@Controller('api/finance')`, `api/payments`, `api/leases/*` |
| `/notifications/*`              | API     | AT webhooks: `POST /notifications/ussd`, `/notifications/sms/dlr` |
| everything else                 | SPA     | `index.html` fallback (client routes like `/leasing`) |

## Database schema

First boot of an **empty** `pg_data` volume loads `db/infraco_os_schema.sql`
via `/docker-entrypoint-initdb.d` (mirrors the dev `docker-compose.yml`). The
dump creates the `core`/`fin`/`sales` schemas and required extensions.

For schema changes **after** first boot, run Prisma migrations manually — note
they must **bypass PgBouncer** (transaction pooling breaks migrations). Add a
`directUrl = env("DIRECT_DATABASE_URL")` to `prisma/schema.prisma`'s datasource
pointing at `db:5432`, then `DIRECT_DATABASE_URL=... npx prisma migrate deploy`.

## PgBouncer — verify before deploy

This was reconciled but **not live-tested** in this pass. Confirm against the
`edoburu/pgbouncer` docs:

- **Env-var names** (`DB_HOST`, `AUTH_TYPE`, `POOL_MODE`, …) match the image.
- **Listen port** is `5432` (the `api` `DATABASE_URL` and healthcheck assume it).
- **`AUTH_TYPE=scram-sha-256`** works with the Postgres 16 backend; if auth
  fails, fall back to `md5`/`plain` (internal `backend` network only).
- **Healthcheck** (`pg_isready` inside the pgbouncer container) actually passes.
  The `api` service depends on pgbouncer with `service_started` (not
  `service_healthy`) so a flaky healthcheck won't wedge startup — tighten to
  `service_healthy` once verified.
