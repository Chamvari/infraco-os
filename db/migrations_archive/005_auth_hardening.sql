-- ============================================================================
--  005_auth_hardening.sql — Module Z auth hardening (PLAT-AUTH-001/003/004/005)
-- ----------------------------------------------------------------------------
--  - Forced password change on first login + admin-set temp-password expiry
--  - Token versioning (bump invalidates all outstanding JWTs for a user)
--  - Append-only authentication audit log (login/password/MFA/account/role)
--
--  Folded into db/infraco_os_schema.sql; kept here for history. Idempotent, so
--  safe to re-apply to a live DB:
--    docker exec -i infraco_db psql -U infraco -d infraco_os < 005_auth_hardening.sql
-- ============================================================================
BEGIN;

-- ── core.app_user: forced-change + temp expiry + token versioning ───────────
ALTER TABLE core.app_user
  ADD COLUMN IF NOT EXISTS must_change_password     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_version            integer NOT NULL DEFAULT 0;

-- ── Append-only authentication audit log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.auth_event (
  event_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  -- login_success | login_failure | password_change | mfa_enrol | mfa_reset
  --   | account_create | role_change
  event_type    text NOT NULL,
  actor_user_id uuid,          -- user the event concerns / the acting user
  username      text,          -- captured even when the user row is unknown
  ip            text,
  detail        jsonb
);

CREATE INDEX IF NOT EXISTS ix_auth_event_type_time ON core.auth_event (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_auth_event_user_time ON core.auth_event (lower(username), occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_auth_event_ip_time   ON core.auth_event (ip, occurred_at DESC);

-- Append-only: block UPDATE/DELETE (mirrors core.audit_log immutability).
CREATE OR REPLACE FUNCTION core.auth_event_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'core.auth_event is append-only and cannot be %', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_event_immutable ON core.auth_event;
CREATE TRIGGER trg_auth_event_immutable
  BEFORE UPDATE OR DELETE ON core.auth_event
  FOR EACH ROW EXECUTE FUNCTION core.auth_event_immutable();

COMMIT;
