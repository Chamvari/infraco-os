-- ============================================================================
--  InfraCo OS — DEV-ONLY login users  (NOT for production)
-- ============================================================================
--  These are development fixtures with a shared, publicly-known password so the
--  app is usable out of the box in dev. They are deliberately NOT part of the
--  canonical schema dump (db/infraco_os_schema.sql) — production must boot with
--  ZERO login-able accounts and create its real admin via a secure step
--  (see aws-deploy/DEPLOY-README.md, "Creating the production admin user").
--
--  Folded out of the former db/migrations/002_module_z_auth.sql and
--  003_mfa_totp.sql when the migrations were consolidated into the dump.
--
--  Apply against a dev DB (after the schema dump has loaded):
--    docker compose exec -T db psql -U infraco -d infraco_os < db/seed_dev_users.sql
--
--  All five users share the password:  demo1234
--  (scrypt$<salt>$<key>, verified by src/modules/auth/password.util.ts)
-- ============================================================================
BEGIN;

DO $$
DECLARE
  -- scrypt hash of 'demo1234' — DEV ONLY, do not reuse in production.
  v_hash text := 'scrypt$d22a98a4a265692e8d7a89340132f78f$b1050170dcd851eb8894203224fecb3fc0e4b6d1757060458f8a7176326509b4';
  v_user uuid;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('demo_admin',   'Demo Admin',         'demo_admin@lfh.test',   'sys_admin',   false),
      ('demo_agent',   'Demo Sales Agent',   'demo_agent@lfh.test',   'sales_agent', false),
      ('demo_finance', 'Demo Finance',       'demo_finance@lfh.test', 'finance',     false),
      ('demo_finmgr',  'Demo Finance Mgr',   'demo_finmgr@lfh.test',  'finance_mgr', true),
      ('demo_ops',     'Demo Operations',    'demo_ops@lfh.test',     'operations',  false)
    ) AS t(username, full_name, email, role_code, mfa)
  LOOP
    INSERT INTO core.app_user (username, full_name, email, mfa_enabled, password_hash)
    VALUES (rec.username, rec.full_name, rec.email, rec.mfa, v_hash)
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          mfa_enabled   = EXCLUDED.mfa_enabled,
          full_name     = EXCLUDED.full_name
    RETURNING user_id INTO v_user;

    INSERT INTO core.user_role (user_id, role_id)
    SELECT v_user, r.role_id FROM core.role r WHERE r.code = rec.role_code
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END LOOP;
END $$;

-- Dev-only fixed TOTP secret for the finance manager, so the @Mfa() sensitive-
-- action flow works out of the box. FIXED DEMO VALUE — never use in production;
-- real users enrol via POST /auth/mfa/enroll (random secret).
UPDATE core.app_user
   SET mfa_secret  = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
       mfa_enabled = true
 WHERE username = 'demo_finmgr';

COMMIT;
