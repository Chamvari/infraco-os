# Backlog — deferred investigations

Engineering follow-ups that are intentionally **not** being fixed inline.
Each needs a dedicated investigation before any change.

## Prisma ↔ SQL schema drift (Postgres schemas)

**Observed:** `prisma/schema.prisma` declares fewer Postgres schemas than the
canonical SQL dump creates.

- `prisma/schema.prisma` datasource: `schemas = ["core", "fin", "sales"]`
- `db/infraco_os_schema.sql` creates: `core`, `fin`, `sales`, **`lease`**,
  **`util`**, **`dev`**, **`pay`** (4 not modelled in Prisma).

**Why it matters:** the SQL dump is the source of truth applied at first-boot
initdb (and in dev). Tables in `lease`/`util`/`dev`/`pay` exist in the DB but
are not represented in the Prisma client, so any access to them bypasses Prisma
(raw SQL only) and they are invisible to `prisma migrate`/`db pull` round-trips.
This raises drift risk if migrations are ever generated from the Prisma schema.

**Investigate later:**
- Is the omission deliberate (those schemas served only via raw SQL / not yet
  modelled), or stale?
- Should the missing schemas + their models be added to `schema.prisma`
  (`multiSchema`), or explicitly documented as raw-SQL-only?
- Reconcile so `prisma db pull` against a freshly-seeded DB is a no-op.

**Surfaced:** 2026-06-17, during the `feat/docker-deploy` work (noted, not fixed).
