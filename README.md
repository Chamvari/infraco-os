# InfraCo OS — Application Scaffold (Phase 1)

This is a **starting scaffold**, not a finished app. It gives Claude Code a
running foundation so it builds *forward* instead of from a blank folder. The
hard parts that are easy to get wrong — the allocation lock, the audit-actor
context, and idempotent payment callbacks — are already wired the right way.

Stack: **NestJS + Prisma + PostgreSQL 15/PostGIS**.

---

## What's here

```
infraco-os/
├── docker-compose.yml         # Postgres + PostGIS; applies db/ schema on first boot
├── package.json               # scripts incl. test:allocation
├── .env.example               # copy to .env
├── prisma/schema.prisma       # Phase 1 models (run prisma db pull for the full set)
├── db/infraco_os_schema.sql   # the full SQL schema (source of truth)
├── docs/SRS_v2.md             # the requirements
├── src/
│   ├── main.ts                # bootstrap (port 3000)
│   ├── app.module.ts
│   ├── prisma.service.ts      # withActor() sets audit session vars (PLAT-AUDIT-001)
│   └── modules/
│       ├── sales/             # reserve_plot wrapper (STND-INV-004)
│       ├── financial/         # instalment engine (FIN-INST-001/002)
│       └── payments/          # idempotent callback handler (PAY-API-003/005)
└── test/
    └── allocation-lock.e2e-spec.ts   # THE critical test (§17 acceptance)
```

---

## First run (local)

```bash
cp .env.example .env          # adjust if needed
npm install
npm run db:up                 # starts Postgres+PostGIS, applies db/ schema on first boot
npm run prisma:generate       # generate the Prisma client

# Prove the allocation lock BEFORE building anything else:
npm run test:allocation
```

If `test:allocation` is green — exactly one of 50 concurrent reservations wins —
the riskiest control in the whole system is proven. Then:

```bash
npm run start:dev             # API on http://localhost:3000
```

> If `db:up` reports the schema already applied (non-empty volume), reset with
> `npm run db:down && docker volume rm infraco-os_infraco_pgdata` then `db:up`.

---

## Claude Code prompt sequence

Open Claude Code in this folder and paste these one at a time, in order. Each
references SRS requirement IDs so Claude Code stays anchored to the spec.

**1 — Verify the foundation**
```
Read docs/SRS_v2.md and db/infraco_os_schema.sql. Then run: npm run db:up and
confirm the schema applies with no errors against Postgres+PostGIS. Fix anything
the live engine rejects (this schema was validated structurally but not run on a
real engine). Report what, if anything, you changed.
```

**2 — Prove the allocation lock (do this before any feature work)**
```
Run npm run test:allocation. It fires 50 concurrent sales.reserve_plot() calls at
one plot and asserts exactly one succeeds (SRS STND-INV-004, acceptance §17). If
it fails, diagnose whether it's the advisory lock, the partial unique index, or
the test harness, and fix it. Do not move on until this is green.
```

**3 — Finish Module A: Financial Core**
```
Using src/modules/financial as the base, implement the rest of Module A per
SRS §4: complete the instalment engine (FIN-INST-001..005 incl. balloon),
rental invoicing (FIN-RENT), the unified ledger + reconciliation (FIN-LED),
and the arrears engine (FIN-ARR). Add unit tests. Keep every write inside
prisma.withActor() so the audit trail captures the actor.
```

**4 — Finish Module H: Payments callback + bill creation**
```
Complete src/modules/payments per SRS §11 and §15. Implement the outbound
createBill() HTTP call to the Payments Platform (POST /bills, §15.1) behind a
config flag, and finish handleCallback() so matched/duplicate/unmatched all post
correctly and idempotently (PAY-API-003/005/006). Add e2e tests for each of the
six channels and for a replayed (duplicate) callback.
```

**5 — Module B sales workflow + Module Z auth**
```
Build out the reservation→sale→Registrar-approval workflow (STND-SALE-001..005)
and add RBAC + MFA guards (PLAT-AUTH-001..005). Reservations must expire via a
scheduled job that returns the plot to 'available' (STND-SALE-001).
```

**6 — Frontend**
```
Scaffold a React + TypeScript admin frontend: Finance dashboard (collections,
arrears ageing), Sales inventory with the interactive plot map (Leaflet +
PostGIS, GIS-001..009), and the reservation/sale flow. Talk to the NestJS API.
```

---

## Conventions

- Reference SRS IDs in commits: `feat(fin): arrears ageing [FIN-ARR-001]`.
- Never insert into `sales.reservation` directly — always call `sales.reserve_plot`.
- Never bypass the audit triggers; run audited writes via `prisma.withActor()`.
- Money is `numeric(18,2)`; never floats.

## Honest status

The TypeScript here compiles against the documented Prisma/Nest APIs but has
**not** been run in this environment (no Node/Postgres/network available where it
was generated). Treat step 1 and step 2 above as the real validation gate.
