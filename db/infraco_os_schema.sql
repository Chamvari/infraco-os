-- ============================================================================
--  InfraCo OS — PostgreSQL Database Schema
--  Land Fortune Holdings
--  Version 2.0  |  Generated from SRS v2.0 (June 2026)
--  Target: PostgreSQL 15+
--
--  Module map:
--    Z  Shared Services (identity, RBAC, audit, documents, notifications)
--    A  Financial Core (customers, accounts, invoices, ledger, accounting)
--    B  Sales Engine (developments, plots, reservations, sales, titles, agents)
--    J  GIS / Spatial (plot geometry, infrastructure layers)
--    C  Leasing & Tenancy
--    D  Utilities & Infrastructure operations
--    E  Development & Project Control (BOQ, procurement ERP, resources)
--    H  Payments API integration (bills, callbacks log)
--
--  Conventions:
--    * UUID primary keys (gen_random_uuid)
--    * snake_case identifiers
--    * created_at / updated_at on mutable tables (trigger-maintained)
--    * Soft-delete via status enums, never hard delete where history matters
--    * Every business table is covered by the generic audit trigger
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy search (duplicate detection)
CREATE EXTENSION IF NOT EXISTS postgis;       -- GIS geometry (Module J)
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- exclusion constraints

-- ----------------------------------------------------------------------------
-- 1. SCHEMAS (logical grouping; all in one DB)
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core;     -- shared services
CREATE SCHEMA IF NOT EXISTS fin;      -- financial core + accounting
CREATE SCHEMA IF NOT EXISTS sales;    -- sales engine + GIS
CREATE SCHEMA IF NOT EXISTS lease;    -- leasing & tenancy
CREATE SCHEMA IF NOT EXISTS util;     -- utilities & infrastructure
CREATE SCHEMA IF NOT EXISTS dev;      -- development & project control
CREATE SCHEMA IF NOT EXISTS pay;      -- payments API integration

-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================
-- Shared
CREATE TYPE core.user_status      AS ENUM ('active','suspended','disabled');
CREATE TYPE core.audit_action     AS ENUM ('insert','update','delete','status_change','approve','reject','login','override');

-- Customers / accounts
CREATE TYPE fin.customer_type     AS ENUM ('residential_buyer','agro_buyer','tenant','contractor','other');
CREATE TYPE fin.kyc_status        AS ENUM ('pending','submitted','verified','rejected');
CREATE TYPE fin.account_type      AS ENUM ('stand_purchase','agro_purchase','rental','utility');
CREATE TYPE fin.account_status    AS ENUM ('active','settled','suspended','closed');
CREATE TYPE fin.currency_code     AS ENUM ('USD','ZIG','GBP','ZAR','EUR','AUD');

-- Invoices / ledger
CREATE TYPE fin.invoice_type      AS ENUM ('instalment','rent','solar','water','fibre','penalty','other');
CREATE TYPE fin.invoice_status    AS ENUM ('draft','issued','partially_paid','paid','overdue','cancelled');
CREATE TYPE fin.txn_type          AS ENUM ('debit','credit');
CREATE TYPE fin.payment_method    AS ENUM ('wallet','cash','bank_transfer','remittance','agent','merchant','adjustment');
CREATE TYPE fin.arrears_risk      AS ENUM ('current','d1_30','d31_60','d61_90','d90_plus');

-- Accounting
CREATE TYPE fin.account_class     AS ENUM ('asset','liability','equity','revenue','cogs','opex','capex','finance_cost');
CREATE TYPE fin.asset_class       AS ENUM ('residential','agro','commercial','utilities','projects','group');
CREATE TYPE fin.period_status     AS ENUM ('open','locked','closed');

-- Sales
CREATE TYPE sales.development_type AS ENUM ('residential','agro');
CREATE TYPE sales.plot_type        AS ENUM ('residential','hospitality','business','agro');
CREATE TYPE sales.plot_status      AS ENUM ('available','reserved','sold','transferred','withheld');
CREATE TYPE sales.reservation_status AS ENUM ('active','converted','expired','cancelled');
CREATE TYPE sales.sale_status      AS ENUM ('pending_approval','active','cancelled','completed');
CREATE TYPE sales.title_stage      AS ENUM ('agreement','cession_prepared','deeds_lodged','title_registered','transferred');

-- Leasing
CREATE TYPE lease.lease_status     AS ENUM ('draft','signed','active','renewal','expired','terminated');
CREATE TYPE lease.maint_status     AS ENUM ('logged','assigned','in_progress','completed','cancelled');
CREATE TYPE lease.maint_priority   AS ENUM ('low','medium','high','urgent');

-- Utilities
CREATE TYPE util.utility_type      AS ENUM ('solar','power','water','fibre','gas');
CREATE TYPE util.fault_status      AS ENUM ('logged','assigned','in_progress','resolved','closed');
CREATE TYPE util.asset_status      AS ENUM ('active','maintenance','decommissioned');
CREATE TYPE util.meter_status      AS ENUM ('active','inactive','faulty');
CREATE TYPE util.meter_adapter     AS ENUM ('sts','vendor_api','mock');
CREATE TYPE util.token_status      AS ENUM ('issued','delivered','failed','reversed');
CREATE TYPE util.token_kind        AS ENUM ('credit','key_change','clear_tamper','adjustment','free');
CREATE TYPE util.lte_product_kind  AS ENUM ('data_bundle','voice_bundle','subscription');
CREATE TYPE util.provision_status  AS ENUM ('pending','provisioned','failed','reversed');
CREATE TYPE util.grid_direction    AS ENUM ('export','import');

-- Development / procurement ERP
CREATE TYPE dev.project_status     AS ENUM ('planning','active','on_hold','completed','cancelled');
CREATE TYPE dev.milestone_status   AS ENUM ('not_started','in_progress','completed','delayed');
CREATE TYPE dev.rfq_status         AS ENUM ('draft','issued','evaluating','awarded','cancelled');
CREATE TYPE dev.po_status          AS ENUM ('draft','issued','part_received','received','closed','cancelled');
CREATE TYPE dev.cert_status        AS ENUM ('draft','submitted','approved','paid','rejected');
CREATE TYPE dev.variation_status   AS ENUM ('proposed','approved','rejected');

-- Payments
CREATE TYPE pay.bill_status        AS ENUM ('created','sent','paid','part_paid','failed','cancelled');
CREATE TYPE pay.callback_status    AS ENUM ('received','matched','unmatched','duplicate','error');
CREATE TYPE pay.pay_channel        AS ENUM ('ussd','app','qr','agent','remittance','merchant');

-- ============================================================================
-- 3. SHARED HELPER FUNCTIONS
-- ============================================================================
-- updated_at maintainer
CREATE OR REPLACE FUNCTION core.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. MODULE Z — SHARED SERVICES
-- ============================================================================

-- Roles (RBAC) — PLAT-AUTH-001/002
CREATE TABLE core.role (
  role_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Users — PLAT-AUTH-001/003
CREATE TABLE core.app_user (
  user_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       text NOT NULL UNIQUE,
  full_name      text NOT NULL,
  email          text UNIQUE,
  phone          text,
  status         core.user_status NOT NULL DEFAULT 'active',
  mfa_enabled    boolean NOT NULL DEFAULT false,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.user_role (
  user_id  uuid NOT NULL REFERENCES core.app_user(user_id) ON DELETE CASCADE,
  role_id  uuid NOT NULL REFERENCES core.role(role_id)     ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Permissions (fine-grained, optional layer over roles)
CREATE TABLE core.permission (
  permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,    -- e.g. 'sales.plot.reserve'
  description   text
);
CREATE TABLE core.role_permission (
  role_id       uuid NOT NULL REFERENCES core.role(role_id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES core.permission(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Delegation-of-Authority matrix — PLAT-AUTH-005
CREATE TABLE core.authority_rule (
  rule_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code    text NOT NULL,           -- e.g. 'sale.discount','ledger.writeoff'
  max_amount     numeric(18,2),           -- threshold; null = any amount
  currency       fin.currency_code DEFAULT 'USD',
  required_role  uuid REFERENCES core.role(role_id),
  dual_auth      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Audit log — PLAT-AUDIT-001/002/003 (append-only, immutable)
CREATE TABLE core.audit_log (
  audit_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid,                       -- core.app_user; nullable for system
  actor_role   text,
  action       core.audit_action NOT NULL,
  schema_name  text NOT NULL,
  table_name   text NOT NULL,
  entity_id    text,                       -- PK value as text (PKs vary in type)
  before_val   jsonb,
  after_val    jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_table_entity ON core.audit_log (schema_name, table_name, entity_id);
CREATE INDEX idx_audit_occurred     ON core.audit_log (occurred_at);

-- Block UPDATE/DELETE on audit_log (immutability) — PLAT-AUDIT-002
CREATE OR REPLACE FUNCTION core.audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only and cannot be % ', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON core.audit_log
  FOR EACH ROW EXECUTE FUNCTION core.audit_immutable();

-- Generic audit-capture trigger function — PLAT-AUDIT-001
-- Attach to any business table; records before/after as jsonb.
CREATE OR REPLACE FUNCTION core.capture_audit() RETURNS trigger AS $$
DECLARE
  v_actor uuid := NULLIF(current_setting('infraco.actor_id', true), '')::uuid;
  v_role  text := NULLIF(current_setting('infraco.actor_role', true), '');
  v_act   core.audit_action;
  v_id    text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_act := 'insert';
    v_id  := (to_jsonb(NEW) ->> (TG_ARGV[0]));
    INSERT INTO core.audit_log(actor_id,actor_role,action,schema_name,table_name,entity_id,after_val)
      VALUES (v_actor,v_role,v_act,TG_TABLE_SCHEMA,TG_TABLE_NAME,v_id,to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_act := 'update';
    v_id  := (to_jsonb(NEW) ->> (TG_ARGV[0]));
    INSERT INTO core.audit_log(actor_id,actor_role,action,schema_name,table_name,entity_id,before_val,after_val)
      VALUES (v_actor,v_role,v_act,TG_TABLE_SCHEMA,TG_TABLE_NAME,v_id,to_jsonb(OLD),to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    v_act := 'delete';
    v_id  := (to_jsonb(OLD) ->> (TG_ARGV[0]));
    INSERT INTO core.audit_log(actor_id,actor_role,action,schema_name,table_name,entity_id,before_val)
      VALUES (v_actor,v_role,v_act,TG_TABLE_SCHEMA,TG_TABLE_NAME,v_id,to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Notifications — PLAT-NOTIF-001/002
CREATE TABLE core.notification (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_kind  text NOT NULL,           -- 'customer' | 'user' | 'contractor'
  recipient_id    uuid NOT NULL,
  channel         text NOT NULL,           -- 'sms' | 'email' | 'whatsapp'
  template_code   text NOT NULL,
  payload         jsonb,
  status          text NOT NULL DEFAULT 'queued',  -- queued|sent|failed
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_recipient ON core.notification (recipient_kind, recipient_id);

-- Documents — Module F (DOC-001..005)
CREATE TABLE core.document (
  document_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_schema text NOT NULL,             -- which table it belongs to
  entity_table  text NOT NULL,
  entity_id     text NOT NULL,
  doc_type      text NOT NULL,             -- 'sale_agreement','title','permit','certificate'...
  version       int  NOT NULL DEFAULT 1,
  storage_ref   text NOT NULL,             -- object-store key
  access_tag    text NOT NULL DEFAULT 'internal',  -- RBAC tag (DOC-002)
  uploaded_by   uuid REFERENCES core.app_user(user_id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_schema, entity_table, entity_id, doc_type, version)
);
CREATE INDEX idx_document_entity ON core.document (entity_schema, entity_table, entity_id);

-- ============================================================================
-- 5. MODULE A — FINANCIAL CORE
-- ============================================================================

-- Customers — FIN-CUST-001..004
CREATE TABLE fin.customer (
  customer_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_type fin.customer_type NOT NULL,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  id_number     text,                      -- national ID / passport
  phone         text,
  email         text,
  address       text,
  country       text,                      -- for diaspora buyers
  wallet_id     text,                      -- Payments Platform wallet (PAY-API-007)
  kyc_status    fin.kyc_status NOT NULL DEFAULT 'pending',
  dpa_consent   boolean NOT NULL DEFAULT false,   -- Data Protection Act (FIN-CUST-003)
  dpa_consent_at timestamptz,
  created_by    uuid REFERENCES core.app_user(user_id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Duplicate detection support (FIN-CUST-004)
CREATE INDEX idx_customer_name_trgm ON fin.customer USING gin ((first_name||' '||last_name) gin_trgm_ops);
CREATE INDEX idx_customer_idnum     ON fin.customer (id_number);
CREATE INDEX idx_customer_phone     ON fin.customer (phone);

-- Accounts — FIN-CUST-002 (a customer may hold multiple accounts)
CREATE TABLE fin.account (
  account_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES fin.customer(customer_id),
  account_type  fin.account_type NOT NULL,
  reference     text NOT NULL UNIQUE,       -- human-readable account no.
  status        fin.account_status NOT NULL DEFAULT 'active',
  balance       numeric(18,2) NOT NULL DEFAULT 0,   -- denormalised running balance
  currency      fin.currency_code NOT NULL DEFAULT 'USD',
  opened_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_customer ON fin.account (customer_id);

-- Invoices — FIN-INST-003, FIN-RENT-001, FIN-UTIL-003
CREATE TABLE fin.invoice (
  invoice_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES fin.account(account_id),
  invoice_type   fin.invoice_type NOT NULL,
  reference      text NOT NULL UNIQUE,      -- used as bill_ref to Payments Platform
  amount         numeric(18,2) NOT NULL CHECK (amount >= 0),
  amount_paid    numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  due_date       date NOT NULL,
  status         fin.invoice_status NOT NULL DEFAULT 'draft',
  description    text,
  platform_bill_id text,                    -- Payments Platform bill id (PAY-API-001)
  source_table   text,                      -- origin (sale instalment, lease, util)
  source_id      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_account ON fin.invoice (account_id);
CREATE INDEX idx_invoice_status  ON fin.invoice (status);
CREATE INDEX idx_invoice_due     ON fin.invoice (due_date);
CREATE INDEX idx_invoice_billid  ON fin.invoice (platform_bill_id);

-- Instalment schedule header — FIN-INST-001/002
CREATE TABLE fin.instalment_plan (
  plan_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES fin.account(account_id),
  total_price    numeric(18,2) NOT NULL,
  deposit        numeric(18,2) NOT NULL DEFAULT 0,
  num_instalments int NOT NULL CHECK (num_instalments > 0),
  frequency      text NOT NULL DEFAULT 'monthly',  -- monthly|quarterly
  structure      text NOT NULL DEFAULT 'equal',    -- equal|balloon
  start_date     date NOT NULL,
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_account ON fin.instalment_plan (account_id);

-- Unified ledger — FIN-LED-001..005 (append-only postings)
CREATE TABLE fin.ledger_entry (
  ledger_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id     uuid NOT NULL REFERENCES fin.account(account_id),
  invoice_id     uuid REFERENCES fin.invoice(invoice_id),
  txn_type       fin.txn_type NOT NULL,
  amount         numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  payment_method fin.payment_method,
  platform_txn_id text,                     -- Payments Platform tx id
  narrative      text,
  posted_by      uuid REFERENCES core.app_user(user_id),
  posted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_account ON fin.ledger_entry (account_id);
CREATE INDEX idx_ledger_invoice ON fin.ledger_entry (invoice_id);
CREATE UNIQUE INDEX uq_ledger_platform_txn ON fin.ledger_entry (platform_txn_id) WHERE platform_txn_id IS NOT NULL;  -- idempotency (PAY-API-005)

-- Suspense / unmatched payments — FIN-LED-003
CREATE TABLE fin.suspense_item (
  suspense_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_txn_id text NOT NULL UNIQUE,
  amount         numeric(18,2) NOT NULL,
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  channel        pay.pay_channel,
  raw_payload    jsonb,
  resolved       boolean NOT NULL DEFAULT false,
  resolved_to_account uuid REFERENCES fin.account(account_id),
  resolved_by    uuid REFERENCES core.app_user(user_id),
  received_at    timestamptz NOT NULL DEFAULT now()
);

-- Arrears snapshot — FIN-ARR-001..004
CREATE TABLE fin.arrears (
  arrears_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES fin.account(account_id),
  total_outstanding numeric(18,2) NOT NULL DEFAULT 0,
  days_overdue      int NOT NULL DEFAULT 0,
  risk_category     fin.arrears_risk NOT NULL DEFAULT 'current',
  last_payment_date date,
  snapshot_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_arrears_account ON fin.arrears (account_id);
CREATE INDEX idx_arrears_risk    ON fin.arrears (risk_category);

-- Arrears escalation actions log — FIN-ARR-002
CREATE TABLE fin.arrears_action (
  action_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES fin.account(account_id),
  action_type  text NOT NULL,              -- reminder|formal_notice|legal_referral
  triggered_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid REFERENCES core.app_user(user_id)
);

-- Customer statements — FIN-STMT-001
CREATE TABLE fin.statement (
  statement_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES fin.customer(customer_id),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  opening_balance numeric(18,2) NOT NULL,
  closing_balance numeric(18,2) NOT NULL,
  generated_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5b. ACCOUNTING LAYER — FIN-ACC-001..010
-- ----------------------------------------------------------------------------

-- Chart of accounts — FIN-ACC-001
CREATE TABLE fin.coa_account (
  coa_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,       -- e.g. '4000'
  name          text NOT NULL,
  account_class fin.account_class NOT NULL,
  asset_class   fin.asset_class NOT NULL DEFAULT 'group',
  parent_id     uuid REFERENCES fin.coa_account(coa_id),
  is_postable   boolean NOT NULL DEFAULT true,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coa_class ON fin.coa_account (account_class, asset_class);

-- Accounting periods — FIN-ACC-007
CREATE TABLE fin.acc_period (
  period_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year          int NOT NULL,
  month         int NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        fin.period_status NOT NULL DEFAULT 'open',
  closed_at     timestamptz,
  UNIQUE (year, month)
);

-- Journal header — FIN-ACC-002/006
CREATE TABLE fin.journal (
  journal_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     uuid REFERENCES fin.acc_period(period_id),
  journal_date  date NOT NULL DEFAULT current_date,
  narrative     text,
  source_table  text,                       -- origin transaction
  source_id     text,
  reversed_by   uuid REFERENCES fin.journal(journal_id),  -- FIN-ACC-006 (reversal only)
  posted_by     uuid REFERENCES core.app_user(user_id),
  posted_at     timestamptz NOT NULL DEFAULT now()
);

-- Journal lines (double-entry) — FIN-ACC-002
CREATE TABLE fin.journal_line (
  line_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id    uuid NOT NULL REFERENCES fin.journal(journal_id) ON DELETE CASCADE,
  coa_id        uuid NOT NULL REFERENCES fin.coa_account(coa_id),
  asset_class   fin.asset_class NOT NULL DEFAULT 'group',
  debit         numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit        numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0)            -- a line is either debit or credit
);
CREATE INDEX idx_jline_journal ON fin.journal_line (journal_id);
CREATE INDEX idx_jline_coa     ON fin.journal_line (coa_id);

-- ============================================================================
-- 6. MODULE B — SALES ENGINE  +  MODULE J — GIS / SPATIAL
-- ============================================================================

-- Developments — 33ha + 4,500ha
CREATE TABLE sales.development (
  development_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  dev_type         sales.development_type NOT NULL,
  total_area_ha    numeric(12,2),
  boundary         geometry(MultiPolygon, 4326),   -- GIS-006 estate boundary
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Phases
CREATE TABLE sales.phase (
  phase_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  name             text NOT NULL,
  planned_units    int,
  boundary         geometry(Polygon, 4326),        -- GIS-006 phase boundary
  start_date       date,
  end_date         date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (development_id, name)
);

-- Plots (stands + agro-plots) — STND-INV-001..008, GIS-003
CREATE TABLE sales.plot (
  plot_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  phase_id         uuid REFERENCES sales.phase(phase_id),
  plot_number      text NOT NULL,
  plot_type        sales.plot_type NOT NULL,
  area_sqm         numeric(14,2),                  -- residential (sqm)
  area_ha          numeric(12,4),                  -- agro (ha)
  price            numeric(18,2),
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  status           sales.plot_status NOT NULL DEFAULT 'available',
  customer_id      uuid REFERENCES fin.customer(customer_id),  -- current owner/holder
  gps_lat          numeric(10,7),                  -- GIS-003
  gps_lng          numeric(10,7),
  geom             geometry(Polygon, 4326),        -- GIS-001/004 plot polygon
  utilities        jsonb NOT NULL DEFAULT '{}',    -- {solar:true,water:true,fibre:false}
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (development_id, plot_number)
);
CREATE INDEX idx_plot_status ON sales.plot (status);
CREATE INDEX idx_plot_dev    ON sales.plot (development_id, phase_id);
CREATE INDEX idx_plot_geom   ON sales.plot USING gist (geom);     -- GIS spatial index

-- Reservations — STND-SALE-001 (time-limited hold)
CREATE TABLE sales.reservation (
  reservation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id          uuid NOT NULL REFERENCES sales.plot(plot_id),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  agent_id         uuid REFERENCES core.app_user(user_id),
  status           sales.reservation_status NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);
CREATE INDEX idx_reservation_plot ON sales.reservation (plot_id);
-- THE ALLOCATION LOCK (STND-INV-004): at most ONE active reservation per plot,
-- enforced at the data layer via a partial unique index.
CREATE UNIQUE INDEX uq_active_reservation
  ON sales.reservation (plot_id)
  WHERE (status = 'active');

-- Sales — STND-SALE-002..005
CREATE TABLE sales.sale (
  sale_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id          uuid NOT NULL REFERENCES sales.plot(plot_id),
  customer_id      uuid NOT NULL REFERENCES fin.customer(customer_id),
  agent_id         uuid REFERENCES core.app_user(user_id),
  account_id       uuid REFERENCES fin.account(account_id),  -- instalment account
  price            numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  status           sales.sale_status NOT NULL DEFAULT 'pending_approval',
  title_stage      sales.title_stage NOT NULL DEFAULT 'agreement',
  approved_by      uuid REFERENCES core.app_user(user_id),   -- Registrar sign-off
  approved_at      timestamptz,
  cancelled_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_plot     ON sales.sale (plot_id);
CREATE INDEX idx_sale_customer ON sales.sale (customer_id);
-- ALLOCATION LOCK (STND-INV-004): at most ONE active/completed sale per plot.
CREATE UNIQUE INDEX uq_active_sale
  ON sales.sale (plot_id)
  WHERE (status IN ('pending_approval','active','completed'));

-- Title / cession progress — STND-TITLE-001..004
CREATE TABLE sales.title_event (
  title_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sales.sale(sale_id),
  stage            sales.title_stage NOT NULL,
  event_date       date NOT NULL DEFAULT current_date,
  notes            text,
  recorded_by      uuid REFERENCES core.app_user(user_id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_title_sale ON sales.title_event (sale_id);

-- Leads — STND-LEAD-001/002
CREATE TABLE sales.lead (
  lead_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  phone            text,
  email            text,
  country          text,
  source           text,
  interest         jsonb,                          -- {development, type, size}
  agent_id         uuid REFERENCES core.app_user(user_id),
  converted_customer uuid REFERENCES fin.customer(customer_id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Agent commissions — STND-AGENT-001/002
CREATE TABLE sales.commission (
  commission_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sales.sale(sale_id),
  agent_id         uuid NOT NULL REFERENCES core.app_user(user_id),
  basis            text NOT NULL,                  -- 'pct_price' | 'milestone'
  rate             numeric(6,4),
  amount           numeric(18,2),
  earned_milestone text,                           -- e.g. 'deposit_received'
  earned           boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_commission_agent ON sales.commission (agent_id);

-- Infrastructure spatial layer — GIS-005 (roads, water, solar, fibre, boreholes)
CREATE TABLE sales.infra_feature (
  feature_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  feature_type     text NOT NULL,                  -- road|water_main|solar|fibre|borehole|transformer
  name             text,
  geom             geometry(Geometry, 4326),       -- line or point
  asset_id         uuid,                           -- link to util.asset (Module D)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_infra_dev  ON sales.infra_feature (development_id);
CREATE INDEX idx_infra_geom ON sales.infra_feature USING gist (geom);

-- ----------------------------------------------------------------------------
-- 6b. ALLOCATION LOCK PROCEDURE — STND-INV-004/005, STND-SALE-001
-- ----------------------------------------------------------------------------
-- Reserves a plot atomically. Uses a transaction-level advisory lock keyed on
-- the plot to serialise concurrent attempts, plus the partial unique index as
-- a hard backstop. Returns the reservation_id on success; raises on conflict.
CREATE OR REPLACE FUNCTION sales.reserve_plot(
  p_plot_id      uuid,
  p_customer_id  uuid,
  p_agent_id     uuid,
  p_expiry_mins  int DEFAULT 1440
) RETURNS uuid AS $$
DECLARE
  v_status sales.plot_status;
  v_res_id uuid;
BEGIN
  -- Serialise concurrent callers on this exact plot (STND-INV-004)
  PERFORM pg_advisory_xact_lock( hashtextextended(p_plot_id::text, 0) );

  SELECT status INTO v_status FROM sales.plot WHERE plot_id = p_plot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLOT_NOT_FOUND: %', p_plot_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'available' THEN
    RAISE EXCEPTION 'PLOT_NOT_AVAILABLE: % is %', p_plot_id, v_status USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO sales.reservation(plot_id, customer_id, agent_id, status, expires_at)
    VALUES (p_plot_id, p_customer_id, p_agent_id, 'active', now() + make_interval(mins => p_expiry_mins))
    RETURNING reservation_id INTO v_res_id;

  UPDATE sales.plot SET status = 'reserved', updated_at = now() WHERE plot_id = p_plot_id;

  RETURN v_res_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. MODULE C — LEASING & TENANCY
-- ============================================================================

-- Premises (leasable units: offices, hospitality, business space)
CREATE TABLE lease.premises (
  premises_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id uuid REFERENCES sales.development(development_id),
  name           text NOT NULL,
  description    text,
  area_sqm       numeric(14,2),
  geom           geometry(Polygon, 4326),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Leases — LEASE-001..005
CREATE TABLE lease.lease (
  lease_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  premises_id     uuid NOT NULL REFERENCES lease.premises(premises_id),
  tenant_id       uuid NOT NULL REFERENCES fin.customer(customer_id),
  account_id      uuid REFERENCES fin.account(account_id),   -- rental account
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  rent_amount     numeric(18,2) NOT NULL,
  currency        fin.currency_code NOT NULL DEFAULT 'USD',
  escalation_pct  numeric(6,3),                  -- annual escalation (LEASE-INV / FIN-RENT-002)
  escalation_anniv date,
  deposit         numeric(18,2) NOT NULL DEFAULT 0,
  market_rate     numeric(18,2),                 -- LEASE-005 benchmark
  status          lease.lease_status NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE INDEX idx_lease_premises ON lease.lease (premises_id);
CREATE INDEX idx_lease_tenant   ON lease.lease (tenant_id);
CREATE INDEX idx_lease_status   ON lease.lease (status);
-- One active lease per premises at any time (no overlapping active tenancies)
CREATE UNIQUE INDEX uq_active_lease ON lease.lease (premises_id) WHERE (status = 'active');

-- Maintenance requests — LEASE-MAINT-001..003
CREATE TABLE lease.maintenance_request (
  request_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  premises_id     uuid REFERENCES lease.premises(premises_id),
  lease_id        uuid REFERENCES lease.lease(lease_id),
  raised_by       uuid REFERENCES fin.customer(customer_id),
  category        text,
  priority        lease.maint_priority NOT NULL DEFAULT 'medium',
  description     text,
  status          lease.maint_status NOT NULL DEFAULT 'logged',
  assigned_to     uuid,                          -- contractor (fin.customer) or staff
  sla_due         timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_premises ON lease.maintenance_request (premises_id);
CREATE INDEX idx_maint_status   ON lease.maintenance_request (status);

-- ============================================================================
-- 8. MODULE D — UTILITIES & INFRASTRUCTURE OPERATIONS
-- ============================================================================

-- Meters — links a customer/premises to a utility service point — UTIL-METER-001/002
CREATE TABLE util.meter (
  meter_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_type   util.utility_type NOT NULL,
  customer_id    uuid REFERENCES fin.customer(customer_id),
  premises_id    uuid REFERENCES lease.premises(premises_id),
  plot_id        uuid REFERENCES sales.plot(plot_id),
  development_id uuid REFERENCES sales.development(development_id),
  serial_no      text NOT NULL,
  is_smart       boolean NOT NULL DEFAULT true,
  is_prepaid     boolean NOT NULL DEFAULT true,        -- prepaid token model is primary
  adapter        util.meter_adapter NOT NULL DEFAULT 'sts',  -- UTIL-TKN-003 pluggable
  tariff_id      uuid,                                 -- active tariff (FK added after tariff table)
  last_balance   numeric(16,3),                        -- UTIL-METER-004 (where reported)
  last_balance_at timestamptz,
  status         util.meter_status NOT NULL DEFAULT 'active',
  installed_at   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serial_no)
);
CREATE INDEX idx_meter_customer ON util.meter (customer_id);
CREATE INDEX idx_meter_dev      ON util.meter (development_id, utility_type);

-- Meter reads — UTIL-METER-001/003
CREATE TABLE util.meter_read (
  read_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id       uuid NOT NULL REFERENCES util.meter(meter_id),
  period_year    int NOT NULL,
  period_month   int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  read_value     numeric(16,3) NOT NULL,
  is_estimated   boolean NOT NULL DEFAULT false,
  billed         boolean NOT NULL DEFAULT false,
  read_at        timestamptz NOT NULL DEFAULT now(),
  read_by        uuid REFERENCES core.app_user(user_id),
  UNIQUE (meter_id, period_year, period_month)
);
CREATE INDEX idx_read_meter ON util.meter_read (meter_id);

-- Tariffs — UTIL-METER-003 (effective-dated, flat/tiered/stepped)
CREATE TABLE util.tariff (
  tariff_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_type   util.utility_type NOT NULL,
  development_id uuid REFERENCES sales.development(development_id),
  name           text NOT NULL,
  structure      text NOT NULL DEFAULT 'flat',   -- flat | tiered | stepped
  rate           numeric(14,4),                  -- flat rate per unit
  tiers          jsonb,                          -- [{from,to,rate}, ...] for tiered/stepped
  fixed_charge   numeric(14,4) DEFAULT 0,        -- standing charge / levy component
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  effective_from date NOT NULL DEFAULT current_date,
  active         boolean NOT NULL DEFAULT true
);

-- Now that tariff exists, link meter.tariff_id to it
ALTER TABLE util.meter
  ADD CONSTRAINT fk_meter_tariff FOREIGN KEY (tariff_id) REFERENCES util.tariff(tariff_id);

-- ----------------------------------------------------------------------------
-- PREPAID TOKEN VENDING — UTIL-TKN-001..009 (PRIMARY utility model)
-- ----------------------------------------------------------------------------
-- A vend = a prepaid purchase of utility credit that yields a token for a meter.
CREATE TABLE util.token_vend (
  vend_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id         uuid NOT NULL REFERENCES util.meter(meter_id),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  utility_type     util.utility_type NOT NULL,
  token_kind       util.token_kind NOT NULL DEFAULT 'credit',
  amount_paid      numeric(18,2) NOT NULL CHECK (amount_paid >= 0),
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  units            numeric(16,3),                 -- units purchased (kWh, kL, etc.) — UTIL-TKN-006
  tariff_id        uuid REFERENCES util.tariff(tariff_id),
  unit_calc        jsonb,                         -- audit of amount→units conversion (UTIL-TKN-006)
  token_code       text,                          -- generated token / STS 20-digit (UTIL-TKN-002)
  adapter          util.meter_adapter NOT NULL,   -- which adapter produced it (UTIL-TKN-003)
  channel          pay.pay_channel,               -- ussd/app/qr/agent/merchant (UTIL-TKN-001)
  platform_txn_id  text,                          -- Payments Platform tx id (idempotency)
  status           util.token_status NOT NULL DEFAULT 'issued',
  issued_by        uuid REFERENCES core.app_user(user_id),  -- for staff-issued adjustment/free tokens
  reason           text,                          -- required for adjustment/free tokens (UTIL-TKN-008)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vend_meter    ON util.token_vend (meter_id);
CREATE INDEX idx_vend_customer ON util.token_vend (customer_id);
CREATE INDEX idx_vend_created  ON util.token_vend (created_at);
-- Idempotency (UTIL-TKN-005): one paid vend per Payments Platform transaction.
CREATE UNIQUE INDEX uq_vend_platform_txn ON util.token_vend (platform_txn_id)
  WHERE platform_txn_id IS NOT NULL;

-- Meter adapter configuration (per development or per meter) — UTIL-TKN-003
CREATE TABLE util.adapter_config (
  config_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid REFERENCES sales.development(development_id),
  utility_type     util.utility_type NOT NULL,
  adapter          util.meter_adapter NOT NULL,
  settings         jsonb,                         -- endpoint, keys-ref, supply-group code, etc.
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- PRIVATE LTE (Easy Mobile) — UTIL-LTE-001..005
-- ----------------------------------------------------------------------------
-- Subscriber lines (MSISDN/SIM) linked to a customer and plot/premises.
CREATE TABLE util.lte_subscriber (
  subscriber_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  plot_id          uuid REFERENCES sales.plot(plot_id),
  premises_id      uuid REFERENCES lease.premises(premises_id),
  msisdn           text,                          -- phone number
  sim_serial       text,
  status           util.meter_status NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lte_sub_customer ON util.lte_subscriber (customer_id);

-- Easy Mobile product catalogue (owned by EOS; mirrored here for the storefront).
CREATE TABLE util.lte_product (
  product_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref     text,                          -- EOS/Easy Mobile product code
  kind             util.lte_product_kind NOT NULL,
  name             text NOT NULL,
  price            numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  validity_days    int,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- A purchase = a provisioning of an LTE product to a subscriber.
CREATE TABLE util.lte_purchase (
  purchase_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    uuid NOT NULL REFERENCES util.lte_subscriber(subscriber_id),
  product_id       uuid NOT NULL REFERENCES util.lte_product(product_id),
  customer_id      uuid REFERENCES fin.customer(customer_id),
  amount_paid      numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  channel          pay.pay_channel,
  platform_txn_id  text,                          -- idempotency (UTIL-LTE-003)
  provision_ref    text,                          -- reference from Easy Mobile/EOS API
  status           util.provision_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  provisioned_at   timestamptz
);
CREATE INDEX idx_lte_purchase_sub ON util.lte_purchase (subscriber_id);
CREATE UNIQUE INDEX uq_lte_platform_txn ON util.lte_purchase (platform_txn_id)
  WHERE platform_txn_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- WHOLESALE / GRID SETTLEMENT (ZESA net-metering) — UTIL-GRID-001..005
-- ----------------------------------------------------------------------------
-- Period grid exchange with ZESA — wholesale plane only, never a customer account.
CREATE TABLE util.grid_exchange (
  exchange_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  period_year      int NOT NULL,
  period_month     int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  direction        util.grid_direction NOT NULL,  -- export (credit) | import (backup draw)
  energy_kwh       numeric(16,3) NOT NULL,
  rate             numeric(14,4),                 -- credit/charge rate per kWh
  amount           numeric(18,2),                 -- value of this exchange
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_grid_dev_period ON util.grid_exchange (development_id, period_year, period_month);

-- Optional generation/storage telemetry per period (UTIL-GRID-003).
CREATE TABLE util.generation_log (
  gen_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id   uuid NOT NULL REFERENCES sales.development(development_id),
  period_year      int NOT NULL,
  period_month     int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  solar_kwh        numeric(16,3),
  battery_kwh      numeric(16,3),
  backup_kwh       numeric(16,3),                 -- drawn from ZESA backup
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (development_id, period_year, period_month)
);

-- Assets — UTIL-ASSET-001..003
CREATE TABLE util.asset (
  asset_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id uuid REFERENCES sales.development(development_id),
  asset_type     text NOT NULL,                  -- solar_panel|inverter|battery|borehole|transformer|fibre_node
  make_model     text,
  serial_no      text,
  install_date   date,
  warranty_until date,
  location_lat   numeric(10,7),
  location_lng   numeric(10,7),
  status         util.asset_status NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_dev ON util.asset (development_id, asset_type);

-- Preventive maintenance schedule — UTIL-ASSET-002
CREATE TABLE util.maintenance_schedule (
  schedule_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL REFERENCES util.asset(asset_id),
  frequency_days int NOT NULL,
  next_due       date NOT NULL,
  last_done      date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Faults / outages — UTIL-FAULT-001..003
CREATE TABLE util.fault (
  fault_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_type   util.utility_type NOT NULL,
  development_id uuid REFERENCES sales.development(development_id),
  asset_id       uuid REFERENCES util.asset(asset_id),
  reported_by    uuid,                           -- customer or staff
  category       text,
  description    text,
  status         util.fault_status NOT NULL DEFAULT 'logged',
  assigned_to    uuid,
  sla_due        timestamptz,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fault_status ON util.fault (status);

-- ============================================================================
-- 9. MODULE E — DEVELOPMENT & PROJECT CONTROL (incl. full procurement ERP)
-- ============================================================================

-- Projects — DEV-PROJ-001..004
CREATE TABLE dev.project (
  project_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id uuid REFERENCES sales.development(development_id),
  name           text NOT NULL,
  status         dev.project_status NOT NULL DEFAULT 'planning',
  start_date     date,
  end_date       date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Budget baselines (versioned) — DEV-PROJ-003
CREATE TABLE dev.budget (
  budget_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  version        int NOT NULL DEFAULT 1,
  is_baseline    boolean NOT NULL DEFAULT false,
  total_amount   numeric(18,2) NOT NULL DEFAULT 0,
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  approved_by    uuid REFERENCES core.app_user(user_id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

-- Budget lines (cost heads) — DEV-PROJ-004, DEV-COST
CREATE TABLE dev.budget_line (
  line_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id      uuid NOT NULL REFERENCES dev.budget(budget_id) ON DELETE CASCADE,
  cost_head      text NOT NULL,                  -- e.g. 'Roads','Water','Solar'
  budget_amount  numeric(18,2) NOT NULL DEFAULT 0,
  committed      numeric(18,2) NOT NULL DEFAULT 0,
  actual         numeric(18,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_budgetline_budget ON dev.budget_line (budget_id);

-- Milestones / stage gates — DEV-GATE-001..003, DEV-SCHED-001
CREATE TABLE dev.milestone (
  milestone_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  name           text NOT NULL,
  is_gate        boolean NOT NULL DEFAULT false,
  tranche_amount numeric(18,2),                  -- funding released at this gate
  required_evidence text,
  planned_date   date,
  actual_date    date,
  status         dev.milestone_status NOT NULL DEFAULT 'not_started',
  approved_by    uuid REFERENCES core.app_user(user_id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestone_project ON dev.milestone (project_id);

-- Contractors / vendors — DEV-PROC-001
CREATE TABLE dev.contractor (
  contractor_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  reg_number     text,
  tax_clearance  text,
  category       text,
  prequalified   boolean NOT NULL DEFAULT false,
  performance_score numeric(4,2),
  customer_id    uuid REFERENCES fin.customer(customer_id),  -- if paid as a customer/payee
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Bill of Quantities — DEV-PROC-002
CREATE TABLE dev.boq (
  boq_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dev.boq_item (
  boq_item_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id         uuid NOT NULL REFERENCES dev.boq(boq_id) ON DELETE CASCADE,
  item_code      text,
  description    text NOT NULL,
  unit           text,
  quantity       numeric(16,3) NOT NULL DEFAULT 0,
  rate           numeric(18,4) NOT NULL DEFAULT 0,
  amount         numeric(18,2) GENERATED ALWAYS AS (quantity * rate) STORED
);
CREATE INDEX idx_boqitem_boq ON dev.boq_item (boq_id);

-- RFQs — DEV-PROC-003
CREATE TABLE dev.rfq (
  rfq_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  boq_id         uuid REFERENCES dev.boq(boq_id),
  title          text NOT NULL,
  status         dev.rfq_status NOT NULL DEFAULT 'draft',
  issued_at      timestamptz,
  awarded_to     uuid REFERENCES dev.contractor(contractor_id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dev.rfq_response (
  response_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id         uuid NOT NULL REFERENCES dev.rfq(rfq_id) ON DELETE CASCADE,
  contractor_id  uuid NOT NULL REFERENCES dev.contractor(contractor_id),
  total_amount   numeric(18,2),
  score          numeric(6,2),
  submitted_at   timestamptz NOT NULL DEFAULT now()
);

-- Contracts — output of an award
CREATE TABLE dev.contract (
  contract_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  contractor_id  uuid NOT NULL REFERENCES dev.contractor(contractor_id),
  rfq_id         uuid REFERENCES dev.rfq(rfq_id),
  title          text NOT NULL,
  contract_value numeric(18,2) NOT NULL DEFAULT 0,
  retention_pct  numeric(5,2) NOT NULL DEFAULT 0,    -- DEV-PROC-008
  currency       fin.currency_code NOT NULL DEFAULT 'USD',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Purchase orders — DEV-PROC-003/004
CREATE TABLE dev.purchase_order (
  po_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  contract_id    uuid REFERENCES dev.contract(contract_id),
  contractor_id  uuid NOT NULL REFERENCES dev.contractor(contractor_id),
  po_number      text NOT NULL UNIQUE,
  amount         numeric(18,2) NOT NULL DEFAULT 0,
  status         dev.po_status NOT NULL DEFAULT 'draft',
  budget_line_id uuid REFERENCES dev.budget_line(line_id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Goods received / works inspected — DEV-PROC-005
CREATE TABLE dev.goods_received (
  grn_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id          uuid NOT NULL REFERENCES dev.purchase_order(po_id),
  received_qty   numeric(16,3),
  inspected_by   uuid REFERENCES core.app_user(user_id),
  inspected_at   timestamptz NOT NULL DEFAULT now(),
  notes          text
);

-- Payment certificates — DEV-PROC-006/007
CREATE TABLE dev.payment_certificate (
  cert_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    uuid NOT NULL REFERENCES dev.contract(contract_id),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  cert_number    text NOT NULL UNIQUE,
  gross_amount   numeric(18,2) NOT NULL,
  retention_held numeric(18,2) NOT NULL DEFAULT 0,
  net_amount     numeric(18,2) NOT NULL,
  status         dev.cert_status NOT NULL DEFAULT 'draft',
  payable_ref    text,                           -- reference into accounting (DEV-PROC-007)
  prepared_by    uuid REFERENCES core.app_user(user_id),
  approved_by    uuid REFERENCES core.app_user(user_id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cert_contract ON dev.payment_certificate (contract_id);

-- Contract variations — DEV-PROC-010
CREATE TABLE dev.variation (
  variation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    uuid NOT NULL REFERENCES dev.contract(contract_id),
  description    text NOT NULL,
  amount         numeric(18,2) NOT NULL,         -- +/- change to committed cost
  status         dev.variation_status NOT NULL DEFAULT 'proposed',
  approved_by    uuid REFERENCES core.app_user(user_id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Resource & labour planning — DEV-RES-001..005
CREATE TABLE dev.resource (
  resource_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL,                  -- 'labour' | 'plant'
  name           text NOT NULL,
  rate           numeric(14,2),
  rate_unit      text,                           -- per day/hour
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dev.resource_allocation (
  allocation_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES dev.project(project_id),
  milestone_id   uuid REFERENCES dev.milestone(milestone_id),
  resource_id    uuid NOT NULL REFERENCES dev.resource(resource_id),
  planned_qty    numeric(14,2),
  planned_days   numeric(8,2),
  actual_qty     numeric(14,2),
  actual_days    numeric(8,2),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resalloc_project ON dev.resource_allocation (project_id);

-- ============================================================================
-- 10. MODULE H — PAYMENTS API INTEGRATION
-- ============================================================================

-- Bills sent to the Payments Platform — PAY-API-001/002
CREATE TABLE pay.bill (
  bill_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES fin.invoice(invoice_id),
  bill_ref         text NOT NULL UNIQUE,         -- equals invoice.reference
  platform_bill_id text UNIQUE,                  -- returned by platform
  amount           numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  channels         text[] NOT NULL DEFAULT '{ussd,app,qr,agent,remittance,merchant}',
  status           pay.bill_status NOT NULL DEFAULT 'created',
  short_code       text,
  qr_payload       text,
  callback_url     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bill_invoice  ON pay.bill (invoice_id);
CREATE INDEX idx_bill_platform ON pay.bill (platform_bill_id);

-- Inbound payment callbacks — PAY-API-003/005/006/008 (idempotent log)
CREATE TABLE pay.callback (
  callback_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_txn_id  text NOT NULL,                -- unique per payment (idempotency key)
  platform_bill_id text,
  bill_ref         text,
  amount_paid      numeric(18,2) NOT NULL,
  currency         fin.currency_code NOT NULL DEFAULT 'USD',
  channel          pay.pay_channel,
  status           pay.callback_status NOT NULL DEFAULT 'received',
  signature_valid  boolean,                      -- PAY-API-008
  raw_payload      jsonb,
  ledger_id        bigint REFERENCES fin.ledger_entry(ledger_id),
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);
-- Idempotency: a platform transaction id may only be recorded once (PAY-API-005)
CREATE UNIQUE INDEX uq_callback_txn ON pay.callback (platform_txn_id);
CREATE INDEX idx_callback_status ON pay.callback (status);

-- Outbound/inbound API call log — PAY-API-008 (audit of all platform calls)
CREATE TABLE pay.api_log (
  api_log_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction      text NOT NULL,                  -- 'out' | 'in'
  endpoint       text NOT NULL,
  correlation_id text,
  payload_hash   text,
  http_status    int,
  status         text,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. TRIGGERS — updated_at maintenance
-- ============================================================================
CREATE TRIGGER trg_user_upd     BEFORE UPDATE ON core.app_user             FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_customer_upd BEFORE UPDATE ON fin.customer              FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_account_upd  BEFORE UPDATE ON fin.account               FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_invoice_upd  BEFORE UPDATE ON fin.invoice               FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_plot_upd     BEFORE UPDATE ON sales.plot                FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_sale_upd     BEFORE UPDATE ON sales.sale                FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_lease_upd    BEFORE UPDATE ON lease.lease               FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_maint_upd    BEFORE UPDATE ON lease.maintenance_request FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_fault_upd    BEFORE UPDATE ON util.fault                FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_project_upd  BEFORE UPDATE ON dev.project               FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_bill_upd     BEFORE UPDATE ON pay.bill                  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_meter_upd    BEFORE UPDATE ON util.meter                FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ============================================================================
-- 12. TRIGGERS — generic audit capture (PLAT-AUDIT-001)
--   Second arg to capture_audit() = the PK column name for that table.
-- ============================================================================
CREATE TRIGGER aud_customer     AFTER INSERT OR UPDATE OR DELETE ON fin.customer            FOR EACH ROW EXECUTE FUNCTION core.capture_audit('customer_id');
CREATE TRIGGER aud_account      AFTER INSERT OR UPDATE OR DELETE ON fin.account             FOR EACH ROW EXECUTE FUNCTION core.capture_audit('account_id');
CREATE TRIGGER aud_invoice      AFTER INSERT OR UPDATE OR DELETE ON fin.invoice             FOR EACH ROW EXECUTE FUNCTION core.capture_audit('invoice_id');
CREATE TRIGGER aud_ledger       AFTER INSERT OR UPDATE OR DELETE ON fin.ledger_entry        FOR EACH ROW EXECUTE FUNCTION core.capture_audit('ledger_id');
CREATE TRIGGER aud_journal      AFTER INSERT OR UPDATE OR DELETE ON fin.journal             FOR EACH ROW EXECUTE FUNCTION core.capture_audit('journal_id');
CREATE TRIGGER aud_plot         AFTER INSERT OR UPDATE OR DELETE ON sales.plot              FOR EACH ROW EXECUTE FUNCTION core.capture_audit('plot_id');
CREATE TRIGGER aud_reservation  AFTER INSERT OR UPDATE OR DELETE ON sales.reservation       FOR EACH ROW EXECUTE FUNCTION core.capture_audit('reservation_id');
CREATE TRIGGER aud_sale         AFTER INSERT OR UPDATE OR DELETE ON sales.sale              FOR EACH ROW EXECUTE FUNCTION core.capture_audit('sale_id');
CREATE TRIGGER aud_title        AFTER INSERT OR UPDATE OR DELETE ON sales.title_event       FOR EACH ROW EXECUTE FUNCTION core.capture_audit('title_event_id');
CREATE TRIGGER aud_lease        AFTER INSERT OR UPDATE OR DELETE ON lease.lease             FOR EACH ROW EXECUTE FUNCTION core.capture_audit('lease_id');
CREATE TRIGGER aud_meterread    AFTER INSERT OR UPDATE OR DELETE ON util.meter_read         FOR EACH ROW EXECUTE FUNCTION core.capture_audit('read_id');
CREATE TRIGGER aud_tokenvend    AFTER INSERT OR UPDATE OR DELETE ON util.token_vend         FOR EACH ROW EXECUTE FUNCTION core.capture_audit('vend_id');
CREATE TRIGGER aud_ltepurchase  AFTER INSERT OR UPDATE OR DELETE ON util.lte_purchase        FOR EACH ROW EXECUTE FUNCTION core.capture_audit('purchase_id');
CREATE TRIGGER aud_gridexchange AFTER INSERT OR UPDATE OR DELETE ON util.grid_exchange       FOR EACH ROW EXECUTE FUNCTION core.capture_audit('exchange_id');
CREATE TRIGGER aud_meter        AFTER INSERT OR UPDATE OR DELETE ON util.meter              FOR EACH ROW EXECUTE FUNCTION core.capture_audit('meter_id');
CREATE TRIGGER aud_project      AFTER INSERT OR UPDATE OR DELETE ON dev.project             FOR EACH ROW EXECUTE FUNCTION core.capture_audit('project_id');
CREATE TRIGGER aud_budget       AFTER INSERT OR UPDATE OR DELETE ON dev.budget              FOR EACH ROW EXECUTE FUNCTION core.capture_audit('budget_id');
CREATE TRIGGER aud_milestone    AFTER INSERT OR UPDATE OR DELETE ON dev.milestone           FOR EACH ROW EXECUTE FUNCTION core.capture_audit('milestone_id');
CREATE TRIGGER aud_po           AFTER INSERT OR UPDATE OR DELETE ON dev.purchase_order      FOR EACH ROW EXECUTE FUNCTION core.capture_audit('po_id');
CREATE TRIGGER aud_cert         AFTER INSERT OR UPDATE OR DELETE ON dev.payment_certificate FOR EACH ROW EXECUTE FUNCTION core.capture_audit('cert_id');
CREATE TRIGGER aud_variation    AFTER INSERT OR UPDATE OR DELETE ON dev.variation           FOR EACH ROW EXECUTE FUNCTION core.capture_audit('variation_id');
CREATE TRIGGER aud_bill         AFTER INSERT OR UPDATE OR DELETE ON pay.bill                FOR EACH ROW EXECUTE FUNCTION core.capture_audit('bill_id');
CREATE TRIGGER aud_callback     AFTER INSERT OR UPDATE OR DELETE ON pay.callback            FOR EACH ROW EXECUTE FUNCTION core.capture_audit('callback_id');

-- ============================================================================
-- 13. SEED DATA
-- ============================================================================

-- Roles — aligned to SRS user classes (Section 1.2 / Module G)
INSERT INTO core.role (code, name, description) VALUES
  ('registrar',     'Registrar',            'Sole authority over stand/plot allocation, sales and transfer approvals'),
  ('sales_agent',   'Sales Agent',          'Reserve and sell plots; own pipeline and commissions'),
  ('sales_manager', 'Sales Manager',        'Oversight of inventory, sales velocity, approvals above thresholds'),
  ('finance',       'Finance Officer',      'Invoicing, ledger, reconciliation, arrears, accounting'),
  ('finance_mgr',   'Finance Manager',      'Write-offs, dual-authorisation approvals, period close'),
  ('operations',    'Operations Officer',   'Leasing, maintenance, utilities operations'),
  ('field_team',    'Field Team',           'Meter reads, fault logging, site capture'),
  ('project_mgr',   'Project Manager',      'Development projects, milestones, certificates'),
  ('quantity_surv', 'Quantity Surveyor',    'BOQ, measured quantities, payment certificates'),
  ('exec',          'Executive',            'Read-only group dashboards'),
  ('internal_audit','Internal Audit',       'Read-only access to records and audit trail'),
  ('sys_admin',     'System Administrator', 'User/role management, configuration, integrations');

-- Utility tariffs — illustrative defaults (rates to be confirmed)
INSERT INTO util.tariff (utility_type, name, structure, rate, currency) VALUES
  ('solar', 'Solar flat (default)', 'flat', 35.00, 'USD'),
  ('water', 'Water flat (default)', 'flat', 15.00, 'USD'),
  ('fibre', 'Fibre flat (default)', 'flat', 45.00, 'USD');

-- Chart of accounts — minimal starter set across asset classes (FIN-ACC-001)
INSERT INTO fin.coa_account (code, name, account_class, asset_class, is_postable) VALUES
  ('1000','Land & Development Assets','asset','group',true),
  ('1100','Infrastructure Assets','asset','utilities',true),
  ('1200','Trade & Instalment Receivables','asset','group',true),
  ('1300','Cash & Bank','asset','group',true),
  ('2000','Deferred Revenue (Instalments)','liability','group',true),
  ('2100','Trade & Contractor Payables','liability','projects',true),
  ('2200','Retention Held','liability','projects',true),
  ('3000','Share Capital & Reserves','equity','group',true),
  ('4000','Revenue — Stand Sales','revenue','residential',true),
  ('4100','Revenue — Agro-Plot Sales','revenue','agro',true),
  ('4200','Revenue — Rentals','revenue','commercial',true),
  ('4300','Revenue — Utilities','revenue','utilities',true),
  ('4400','Revenue — Instalment Interest','revenue','group',true),
  ('5000','Cost of Sales — Land & Servicing','cogs','group',true),
  ('6000','Operating Expenses','opex','group',true),
  ('7000','Capital Expenditure — Infrastructure','capex','utilities',true),
  ('8000','Finance Costs','finance_cost','group',true);

-- Developments — the two known estates
INSERT INTO sales.development (name, dev_type, total_area_ha) VALUES
  ('Kwekwe Mixed-Use Estate (33ha)', 'residential', 33.00),
  ('Agro-Industrial Diaspora Estate (4,500ha)', 'agro', 4500.00);

-- Open the current accounting period
INSERT INTO fin.acc_period (year, month, status) VALUES
  (extract(year from current_date)::int, extract(month from current_date)::int, 'open');

COMMIT;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
