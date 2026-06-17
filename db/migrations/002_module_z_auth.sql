-- ============================================================================
-- Migration 002 — Module Z (authentication & RBAC), PLAT-AUTH-001..005
-- ============================================================================
-- NON-DESTRUCTIVE, additive-only. Contains ZERO DROP statements.
-- Idempotent: safe to re-run.
--
-- Adds, against the existing schema:
--   * core.app_user.password_hash  (scrypt; verified by Module Z AuthService)
--   * demo login users mapped to seeded core.role rows (dev credentials only)
--
-- The 12 RBAC roles themselves are already seeded in db/infraco_os_schema.sql.
-- ============================================================================

-- 1. Credential column -------------------------------------------------------
ALTER TABLE core.app_user
  ADD COLUMN IF NOT EXISTS password_hash text;

-- 2. Demo users (DEV ONLY) ---------------------------------------------------
--    All share password 'demo1234' (scrypt$<salt>$<key>). NOT for production.
--    finance_mgr user has MFA enabled to exercise the @Mfa() sensitive-action
--    gate (e.g. POST /ledger/adjustment).
DO $$
DECLARE
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
    -- Upsert the user, set the credential + MFA flag.
    INSERT INTO core.app_user (username, full_name, email, mfa_enabled, password_hash)
    VALUES (rec.username, rec.full_name, rec.email, rec.mfa, v_hash)
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          mfa_enabled   = EXCLUDED.mfa_enabled,
          full_name     = EXCLUDED.full_name
    RETURNING user_id INTO v_user;

    -- Grant the matching role (idempotent).
    INSERT INTO core.user_role (user_id, role_id)
    SELECT v_user, r.role_id FROM core.role r WHERE r.code = rec.role_code
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END LOOP;
END $$;
