-- ============================================================================
-- Migration 004 — Module Z DoA: Delegation-of-Authority dual-authorisation
--                 (PLAT-AUTH-005)
-- ============================================================================
-- NON-DESTRUCTIVE, additive-only. Contains ZERO DROP statements.
-- Idempotent: safe to re-run.
--
-- Background: core.authority_rule (the DoA matrix) already existed in
-- db/infraco_os_schema.sql but was never read — dual authorisation was
-- hard-coded in LedgerService.postManualAdjustment (FIN-LED-005). This
-- migration makes the matrix live and adds an asynchronous approval workflow:
--
--     initiate -> pending -> approved / rejected -> execute
--
-- A transaction whose amount exceeds the configured threshold for its
-- (action_code, currency) requires TWO DISTINCT authorised signatories before
-- it may execute. Every state change is captured by core.capture_audit
-- (PLAT-AUDIT-001), giving a full, immutable approval audit trail.
-- ============================================================================

-- 1. Approval lifecycle status ----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'approval_status' AND n.nspname = 'core'
  ) THEN
    CREATE TYPE core.approval_status AS ENUM
      ('pending', 'approved', 'rejected', 'executed');
  END IF;
END $$;

-- 2. Approval request workflow record ---------------------------------------
CREATE TABLE IF NOT EXISTS core.approval_request (
  approval_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code    text NOT NULL,                       -- transaction type; matches core.authority_rule.action_code
  entity_ref     text,                                -- optional pointer to the target entity
  amount         numeric(18,2) NOT NULL CHECK (amount > 0),
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  payload        jsonb,                               -- the transaction to run on execute
  threshold      numeric(18,2),                       -- the DoA threshold that applied (null = any amount)
  rule_id        uuid REFERENCES core.authority_rule(rule_id),
  status         core.approval_status NOT NULL DEFAULT 'pending',
  initiated_by   uuid NOT NULL REFERENCES core.app_user(user_id),
  initiated_at   timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid REFERENCES core.app_user(user_id),   -- the SECOND signatory (distinct from the initiator)
  decided_at     timestamptz,
  decision_note  text,
  executed_at    timestamptz,
  -- The second approver can never be the initiator (PLAT-AUTH-005). Enforced in
  -- the service AND here as a defence-in-depth DB invariant.
  CONSTRAINT approval_distinct_signatories
    CHECK (decided_by IS NULL OR decided_by <> initiated_by)
);

CREATE INDEX IF NOT EXISTS idx_approval_status       ON core.approval_request (status);
CREATE INDEX IF NOT EXISTS idx_approval_action       ON core.approval_request (action_code);
CREATE INDEX IF NOT EXISTS idx_approval_initiated_by ON core.approval_request (initiated_by);

-- 3. Audit trail: capture every approval state change (PLAT-AUDIT-001) -------
--    Second arg to capture_audit() = the PK column name for this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'aud_approval_request'
  ) THEN
    CREATE TRIGGER aud_approval_request
      AFTER INSERT OR UPDATE OR DELETE ON core.approval_request
      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('approval_id');
  END IF;
END $$;

-- 4. Seed the DoA matrix (DEV defaults) -------------------------------------
--    Thresholds per (action_code, currency). dual_auth = true means amounts
--    ABOVE max_amount require two distinct signatories; max_amount = 0 means
--    every such transaction needs dual auth. Tune per deployment.
--    required_role names the role expected to authorise (finance_mgr here).
DO $$
DECLARE
  v_finmgr uuid;
BEGIN
  SELECT role_id INTO v_finmgr FROM core.role WHERE code = 'finance_mgr';

  INSERT INTO core.authority_rule (action_code, max_amount, currency, required_role, dual_auth)
  SELECT v.action_code, v.max_amount, v.currency::fin.currency_code, v_finmgr, true
  FROM (VALUES
    ('ledger.writeoff',   0::numeric,     'USD'),   -- any write-off needs dual auth
    ('ledger.adjustment', 5000::numeric,  'USD'),   -- adjustments above 5,000 need dual auth
    ('sale.discount',     10000::numeric, 'USD')    -- discounts above 10,000 need dual auth
  ) AS v(action_code, max_amount, currency)
  WHERE NOT EXISTS (
    SELECT 1 FROM core.authority_rule r
     WHERE r.action_code = v.action_code
       AND r.currency = v.currency::fin.currency_code
  );
END $$;
