-- ============================================================================
-- Migration 001 — Module D (private-utility operator) + Module C/meter extensions
-- ============================================================================
-- NON-DESTRUCTIVE, additive-only. Contains ZERO DROP statements.
-- Idempotent: every object is guarded (IF NOT EXISTS / catch duplicate_object),
-- so the migration is safe to re-run.
--
-- Adds, against the existing schema:
--   * util.utility_type values 'power','gas'
--   * enums: meter_status, meter_adapter, token_status, token_kind,
--            lte_product_kind, provision_status, grid_direction
--   * extended util.meter (development_id, is_prepaid, adapter, tariff_id,
--     last_balance[_at], status, updated_at; serial_no NOT NULL + UNIQUE)
--   * util.tariff.fixed_charge
--   * prepaid vending  : util.token_vend, util.adapter_config            (UTIL-TKN)
--   * private LTE      : util.lte_subscriber, util.lte_product, util.lte_purchase (UTIL-LTE)
--   * grid settlement  : util.grid_exchange, util.generation_log         (UTIL-GRID)
--   * updated_at + audit triggers for the above
--
-- Onboarding (ONB-001..008) needs NO schema change — fin.customer already has
-- customer_type (incl. 'contractor'), kyc_status, dpa_consent, and core.document
-- / dev.contractor already exist.
-- ============================================================================

-- 1. utility_type new values -------------------------------------------------
--    (ADD VALUE autocommits and must not be used in the same txn; run first,
--     outside any explicit transaction.)
ALTER TYPE util.utility_type ADD VALUE IF NOT EXISTS 'power' BEFORE 'water';
ALTER TYPE util.utility_type ADD VALUE IF NOT EXISTS 'gas';

-- 2. New enum types ----------------------------------------------------------
DO $$ BEGIN CREATE TYPE util.meter_status     AS ENUM ('active','inactive','faulty');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.meter_adapter    AS ENUM ('sts','vendor_api','mock');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.token_status     AS ENUM ('issued','delivered','failed','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.token_kind       AS ENUM ('credit','key_change','clear_tamper','adjustment','free');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.lte_product_kind AS ENUM ('data_bundle','voice_bundle','subscription');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.provision_status AS ENUM ('pending','provisioned','failed','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE util.grid_direction   AS ENUM ('export','import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Extend util.meter -------------------------------------------------------
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS development_id  uuid REFERENCES sales.development(development_id);
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS is_prepaid      boolean NOT NULL DEFAULT true;
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS adapter         util.meter_adapter NOT NULL DEFAULT 'sts';
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS tariff_id       uuid;
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS last_balance    numeric(16,3);
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS last_balance_at timestamptz;
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS status          util.meter_status NOT NULL DEFAULT 'active';
ALTER TABLE util.meter ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();
ALTER TABLE util.meter ALTER COLUMN is_smart SET DEFAULT true;
-- serial_no NOT NULL + UNIQUE (table is empty — safe).
ALTER TABLE util.meter ALTER COLUMN serial_no SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE util.meter ADD CONSTRAINT meter_serial_no_key UNIQUE (serial_no);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE util.meter ADD CONSTRAINT fk_meter_tariff
    FOREIGN KEY (tariff_id) REFERENCES util.tariff(tariff_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_meter_dev ON util.meter (development_id, utility_type);

-- 4. Extend util.tariff ------------------------------------------------------
ALTER TABLE util.tariff ADD COLUMN IF NOT EXISTS fixed_charge numeric(14,4) DEFAULT 0;

-- 5. Prepaid token vending — UTIL-TKN-001..009 -------------------------------
CREATE TABLE IF NOT EXISTS util.token_vend (
  vend_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id         uuid NOT NULL REFERENCES util.meter(meter_id),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  utility_type     util.utility_type NOT NULL,
  token_kind       util.token_kind NOT NULL DEFAULT 'credit',
  amount_paid      numeric(18,2) NOT NULL CHECK (amount_paid >= 0),
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  units            numeric(16,3),
  tariff_id        uuid REFERENCES util.tariff(tariff_id),
  unit_calc        jsonb,
  token_code       text,
  adapter          util.meter_adapter NOT NULL,
  channel          pay.pay_channel,
  platform_txn_id  text,
  status           util.token_status NOT NULL DEFAULT 'issued',
  issued_by        uuid REFERENCES core.app_user(user_id),
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vend_meter    ON util.token_vend (meter_id);
CREATE INDEX IF NOT EXISTS idx_vend_customer ON util.token_vend (customer_id);
CREATE INDEX IF NOT EXISTS idx_vend_created  ON util.token_vend (created_at);
-- Idempotency (UTIL-TKN-005): one paid vend per Payments Platform transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vend_platform_txn ON util.token_vend (platform_txn_id)
  WHERE platform_txn_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS util.adapter_config (
  config_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid REFERENCES sales.development(development_id),
  utility_type     util.utility_type NOT NULL,
  adapter          util.meter_adapter NOT NULL,
  settings         jsonb,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 6. Private LTE (Easy Mobile) — UTIL-LTE-001..005 ---------------------------
CREATE TABLE IF NOT EXISTS util.lte_subscriber (
  subscriber_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  plot_id          uuid REFERENCES sales.plot(plot_id),
  premises_id      uuid REFERENCES lease.premises(premises_id),
  msisdn           text,
  sim_serial       text,
  status           util.meter_status NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lte_sub_customer ON util.lte_subscriber (customer_id);

CREATE TABLE IF NOT EXISTS util.lte_product (
  product_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref     text,
  kind             util.lte_product_kind NOT NULL,
  name             text NOT NULL,
  price            numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  validity_days    int,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS util.lte_purchase (
  purchase_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    uuid NOT NULL REFERENCES util.lte_subscriber(subscriber_id),
  product_id       uuid NOT NULL REFERENCES util.lte_product(product_id),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  amount_paid      numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  channel          pay.pay_channel,
  platform_txn_id  text,
  provision_ref    text,
  status           util.provision_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  provisioned_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lte_purchase_sub ON util.lte_purchase (subscriber_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lte_platform_txn ON util.lte_purchase (platform_txn_id)
  WHERE platform_txn_id IS NOT NULL;

-- 7. Wholesale / grid settlement (ZESA) — UTIL-GRID-001..005 -----------------
--    Wholesale plane only; never linked to a customer account.
CREATE TABLE IF NOT EXISTS util.grid_exchange (
  exchange_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  period_year      int NOT NULL,
  period_month     int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  direction        util.grid_direction NOT NULL,
  energy_kwh       numeric(16,3) NOT NULL,
  rate             numeric(14,4),
  amount           numeric(18,2),
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grid_dev_period ON util.grid_exchange (development_id, period_year, period_month);

CREATE TABLE IF NOT EXISTS util.generation_log (
  gen_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  period_year      int NOT NULL,
  period_month     int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  solar_kwh        numeric(16,3),
  battery_kwh      numeric(16,3),
  backup_kwh       numeric(16,3),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (development_id, period_year, period_month)
);

-- 8. Triggers (guarded create — no DROP) -------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_meter_upd' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_meter_upd BEFORE UPDATE ON util.meter
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='aud_meter' AND NOT tgisinternal) THEN
    CREATE TRIGGER aud_meter AFTER INSERT OR UPDATE OR DELETE ON util.meter
      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('meter_id');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='aud_tokenvend' AND NOT tgisinternal) THEN
    CREATE TRIGGER aud_tokenvend AFTER INSERT OR UPDATE OR DELETE ON util.token_vend
      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('vend_id');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='aud_ltepurchase' AND NOT tgisinternal) THEN
    CREATE TRIGGER aud_ltepurchase AFTER INSERT OR UPDATE OR DELETE ON util.lte_purchase
      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('purchase_id');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='aud_gridexchange' AND NOT tgisinternal) THEN
    CREATE TRIGGER aud_gridexchange AFTER INSERT OR UPDATE OR DELETE ON util.grid_exchange
      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('exchange_id');
  END IF;
END $$;
