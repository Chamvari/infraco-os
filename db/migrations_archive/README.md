# Archived migrations

These four migrations have been **folded into the canonical schema dump**
(`db/infraco_os_schema.sql`) as of 2026-06-26. They are kept here for historical
reference only — **do not apply them to a fresh database**; the dump already
contains everything they added.

| Migration | What it added | Now in… |
|-----------|---------------|---------|
| `001_module_d_utilities.sql` | `util` Module-D types + tables (`token_vend`, `adapter_config`, `lte_*`, `grid_exchange`, `generation_log`), `util.meter`/`util.tariff` columns | `db/infraco_os_schema.sql` |
| `002_module_z_auth.sql` | `core.app_user.password_hash` column; **dev demo users** | column → dump; **users → `db/seed_dev_users.sql`** |
| `003_mfa_totp.sql` | `core.app_user.mfa_secret` column; demo MFA secret | column → dump; **secret → `db/seed_dev_users.sql`** |
| `004_doa_dual_auth.sql` | `core.approval_status` type, `core.approval_request` table + indexes, `core.authority_rule` reference rows | `db/infraco_os_schema.sql` |

## Why

Previously the database was built from the dump at first boot (docker initdb /
CloudFormation bootstrap) but the migrations were **never applied**, so columns
like `core.app_user.password_hash` did not exist and `POST /auth/login` returned
HTTP 500. Consolidating the migrations into the dump makes it the single,
complete source of truth — a fresh boot now has the full schema.

## Important

The demo users (`demo_admin` etc., password `demo1234`) were **deliberately
excluded** from the canonical dump — production must boot with zero
known-password accounts. They live in `db/seed_dev_users.sql` (dev only). See
`aws-deploy/DEPLOY-README.md` → "Creating the production admin user".
