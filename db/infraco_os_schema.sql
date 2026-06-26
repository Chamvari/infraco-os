--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: dev; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA dev;


--
-- Name: fin; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA fin;


--
-- Name: lease; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA lease;


--
-- Name: pay; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pay;


--
-- Name: sales; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sales;


--
-- Name: tiger; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger;


--
-- Name: tiger_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA tiger_data;


--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: util; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA util;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: EXTENSION fuzzystrmatch; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION fuzzystrmatch IS 'determine similarities and distance between strings';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_tiger_geocoder; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder WITH SCHEMA tiger;


--
-- Name: EXTENSION postgis_tiger_geocoder; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_tiger_geocoder IS 'PostGIS tiger geocoder and reverse geocoder';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: approval_status; Type: TYPE; Schema: core; Owner: -
--

CREATE TYPE core.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'executed'
);


--
-- Name: audit_action; Type: TYPE; Schema: core; Owner: -
--

CREATE TYPE core.audit_action AS ENUM (
    'insert',
    'update',
    'delete',
    'status_change',
    'approve',
    'reject',
    'login',
    'override'
);


--
-- Name: user_status; Type: TYPE; Schema: core; Owner: -
--

CREATE TYPE core.user_status AS ENUM (
    'active',
    'suspended',
    'disabled'
);


--
-- Name: cert_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.cert_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'paid',
    'rejected'
);


--
-- Name: milestone_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.milestone_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'delayed'
);


--
-- Name: po_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.po_status AS ENUM (
    'draft',
    'issued',
    'part_received',
    'received',
    'closed',
    'cancelled'
);


--
-- Name: project_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.project_status AS ENUM (
    'planning',
    'active',
    'on_hold',
    'completed',
    'cancelled'
);


--
-- Name: rfq_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.rfq_status AS ENUM (
    'draft',
    'issued',
    'evaluating',
    'awarded',
    'cancelled'
);


--
-- Name: variation_status; Type: TYPE; Schema: dev; Owner: -
--

CREATE TYPE dev.variation_status AS ENUM (
    'proposed',
    'approved',
    'rejected'
);


--
-- Name: account_class; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.account_class AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'cogs',
    'opex',
    'capex',
    'finance_cost'
);


--
-- Name: account_status; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.account_status AS ENUM (
    'active',
    'settled',
    'suspended',
    'closed'
);


--
-- Name: account_type; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.account_type AS ENUM (
    'stand_purchase',
    'agro_purchase',
    'rental',
    'utility'
);


--
-- Name: arrears_risk; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.arrears_risk AS ENUM (
    'current',
    'd1_30',
    'd31_60',
    'd61_90',
    'd90_plus'
);


--
-- Name: asset_class; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.asset_class AS ENUM (
    'residential',
    'agro',
    'commercial',
    'utilities',
    'projects',
    'group'
);


--
-- Name: currency_code; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.currency_code AS ENUM (
    'USD',
    'ZIG',
    'GBP',
    'ZAR',
    'EUR',
    'AUD'
);


--
-- Name: customer_type; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.customer_type AS ENUM (
    'residential_buyer',
    'agro_buyer',
    'tenant',
    'contractor',
    'other'
);


--
-- Name: invoice_status; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.invoice_status AS ENUM (
    'draft',
    'issued',
    'partially_paid',
    'paid',
    'overdue',
    'cancelled'
);


--
-- Name: invoice_type; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.invoice_type AS ENUM (
    'instalment',
    'rent',
    'solar',
    'water',
    'fibre',
    'penalty',
    'other'
);


--
-- Name: kyc_status; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.kyc_status AS ENUM (
    'pending',
    'submitted',
    'verified',
    'rejected'
);


--
-- Name: payment_method; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.payment_method AS ENUM (
    'wallet',
    'cash',
    'bank_transfer',
    'remittance',
    'agent',
    'merchant',
    'adjustment'
);


--
-- Name: period_status; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.period_status AS ENUM (
    'open',
    'locked',
    'closed'
);


--
-- Name: txn_type; Type: TYPE; Schema: fin; Owner: -
--

CREATE TYPE fin.txn_type AS ENUM (
    'debit',
    'credit'
);


--
-- Name: lease_status; Type: TYPE; Schema: lease; Owner: -
--

CREATE TYPE lease.lease_status AS ENUM (
    'draft',
    'signed',
    'active',
    'renewal',
    'expired',
    'terminated'
);


--
-- Name: maint_priority; Type: TYPE; Schema: lease; Owner: -
--

CREATE TYPE lease.maint_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: maint_status; Type: TYPE; Schema: lease; Owner: -
--

CREATE TYPE lease.maint_status AS ENUM (
    'logged',
    'assigned',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: bill_status; Type: TYPE; Schema: pay; Owner: -
--

CREATE TYPE pay.bill_status AS ENUM (
    'created',
    'sent',
    'paid',
    'part_paid',
    'failed',
    'cancelled'
);


--
-- Name: callback_status; Type: TYPE; Schema: pay; Owner: -
--

CREATE TYPE pay.callback_status AS ENUM (
    'received',
    'matched',
    'unmatched',
    'duplicate',
    'error'
);


--
-- Name: pay_channel; Type: TYPE; Schema: pay; Owner: -
--

CREATE TYPE pay.pay_channel AS ENUM (
    'ussd',
    'app',
    'qr',
    'agent',
    'remittance',
    'merchant'
);


--
-- Name: development_type; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.development_type AS ENUM (
    'residential',
    'agro'
);


--
-- Name: plot_status; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.plot_status AS ENUM (
    'available',
    'reserved',
    'sold',
    'transferred',
    'withheld'
);


--
-- Name: plot_type; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.plot_type AS ENUM (
    'residential',
    'hospitality',
    'business',
    'agro'
);


--
-- Name: reservation_status; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.reservation_status AS ENUM (
    'active',
    'converted',
    'expired',
    'cancelled'
);


--
-- Name: sale_status; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.sale_status AS ENUM (
    'pending_approval',
    'active',
    'cancelled',
    'completed'
);


--
-- Name: title_stage; Type: TYPE; Schema: sales; Owner: -
--

CREATE TYPE sales.title_stage AS ENUM (
    'agreement',
    'cession_prepared',
    'deeds_lodged',
    'title_registered',
    'transferred'
);


--
-- Name: asset_status; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.asset_status AS ENUM (
    'active',
    'maintenance',
    'decommissioned'
);


--
-- Name: fault_status; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.fault_status AS ENUM (
    'logged',
    'assigned',
    'in_progress',
    'resolved',
    'closed'
);


--
-- Name: grid_direction; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.grid_direction AS ENUM (
    'export',
    'import'
);


--
-- Name: lte_product_kind; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.lte_product_kind AS ENUM (
    'data_bundle',
    'voice_bundle',
    'subscription'
);


--
-- Name: meter_adapter; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.meter_adapter AS ENUM (
    'sts',
    'vendor_api',
    'mock'
);


--
-- Name: meter_status; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.meter_status AS ENUM (
    'active',
    'inactive',
    'faulty'
);


--
-- Name: provision_status; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.provision_status AS ENUM (
    'pending',
    'provisioned',
    'failed',
    'reversed'
);


--
-- Name: token_kind; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.token_kind AS ENUM (
    'credit',
    'key_change',
    'clear_tamper',
    'adjustment',
    'free'
);


--
-- Name: token_status; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.token_status AS ENUM (
    'issued',
    'delivered',
    'failed',
    'reversed'
);


--
-- Name: utility_type; Type: TYPE; Schema: util; Owner: -
--

CREATE TYPE util.utility_type AS ENUM (
    'solar',
    'power',
    'water',
    'fibre',
    'gas'
);


--
-- Name: audit_immutable(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.audit_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only and cannot be % ', TG_OP;
END;
$$;


--
-- Name: capture_audit(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.capture_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: reserve_plot(uuid, uuid, uuid, integer); Type: FUNCTION; Schema: sales; Owner: -
--

CREATE FUNCTION sales.reserve_plot(p_plot_id uuid, p_customer_id uuid, p_agent_id uuid, p_expiry_mins integer DEFAULT 1440) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_user; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.app_user (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    status core.user_status DEFAULT 'active'::core.user_status NOT NULL,
    mfa_enabled boolean DEFAULT false NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    mfa_secret text
);


--
-- Name: approval_request; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.approval_request (
    approval_id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_code text NOT NULL,
    entity_ref text,
    amount numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    payload jsonb,
    threshold numeric(18,2),
    rule_id uuid,
    status core.approval_status DEFAULT 'pending'::core.approval_status NOT NULL,
    initiated_by uuid NOT NULL,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    executed_at timestamp with time zone,
    CONSTRAINT approval_distinct_signatories CHECK (((decided_by IS NULL) OR (decided_by <> initiated_by))),
    CONSTRAINT approval_request_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: audit_log; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.audit_log (
    audit_id bigint NOT NULL,
    actor_id uuid,
    actor_role text,
    action core.audit_action NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    entity_id text,
    before_val jsonb,
    after_val jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.audit_log ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: authority_rule; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.authority_rule (
    rule_id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_code text NOT NULL,
    max_amount numeric(18,2),
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code,
    required_role uuid,
    dual_auth boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.document (
    document_id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_schema text NOT NULL,
    entity_table text NOT NULL,
    entity_id text NOT NULL,
    doc_type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    storage_ref text NOT NULL,
    access_tag text DEFAULT 'internal'::text NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_kind text NOT NULL,
    recipient_id uuid NOT NULL,
    channel text NOT NULL,
    template_code text NOT NULL,
    payload jsonb,
    status text DEFAULT 'queued'::text NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permission; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.permission (
    permission_id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text
);


--
-- Name: role; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.role (
    role_id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permission; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.role_permission (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: user_role; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_role (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: boq; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.boq (
    boq_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boq_item; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.boq_item (
    boq_item_id uuid DEFAULT gen_random_uuid() NOT NULL,
    boq_id uuid NOT NULL,
    item_code text,
    description text NOT NULL,
    unit text,
    quantity numeric(16,3) DEFAULT 0 NOT NULL,
    rate numeric(18,4) DEFAULT 0 NOT NULL,
    amount numeric(18,2) GENERATED ALWAYS AS ((quantity * rate)) STORED
);


--
-- Name: budget; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.budget (
    budget_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_baseline boolean DEFAULT false NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: budget_line; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.budget_line (
    line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    cost_head text NOT NULL,
    budget_amount numeric(18,2) DEFAULT 0 NOT NULL,
    committed numeric(18,2) DEFAULT 0 NOT NULL,
    actual numeric(18,2) DEFAULT 0 NOT NULL
);


--
-- Name: contract; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.contract (
    contract_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    rfq_id uuid,
    title text NOT NULL,
    contract_value numeric(18,2) DEFAULT 0 NOT NULL,
    retention_pct numeric(5,2) DEFAULT 0 NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contractor; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.contractor (
    contractor_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    reg_number text,
    tax_clearance text,
    category text,
    prequalified boolean DEFAULT false NOT NULL,
    performance_score numeric(4,2),
    customer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: goods_received; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.goods_received (
    grn_id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    received_qty numeric(16,3),
    inspected_by uuid,
    inspected_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: milestone; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.milestone (
    milestone_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    is_gate boolean DEFAULT false NOT NULL,
    tranche_amount numeric(18,2),
    required_evidence text,
    planned_date date,
    actual_date date,
    status dev.milestone_status DEFAULT 'not_started'::dev.milestone_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_certificate; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.payment_certificate (
    cert_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    project_id uuid NOT NULL,
    cert_number text NOT NULL,
    gross_amount numeric(18,2) NOT NULL,
    retention_held numeric(18,2) DEFAULT 0 NOT NULL,
    net_amount numeric(18,2) NOT NULL,
    status dev.cert_status DEFAULT 'draft'::dev.cert_status NOT NULL,
    payable_ref text,
    prepared_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.project (
    project_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid,
    name text NOT NULL,
    status dev.project_status DEFAULT 'planning'::dev.project_status NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_order; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.purchase_order (
    po_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    contract_id uuid,
    contractor_id uuid NOT NULL,
    po_number text NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    status dev.po_status DEFAULT 'draft'::dev.po_status NOT NULL,
    budget_line_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.resource (
    resource_id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    rate numeric(14,2),
    rate_unit text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_allocation; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.resource_allocation (
    allocation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    milestone_id uuid,
    resource_id uuid NOT NULL,
    planned_qty numeric(14,2),
    planned_days numeric(8,2),
    actual_qty numeric(14,2),
    actual_days numeric(8,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rfq; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.rfq (
    rfq_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    boq_id uuid,
    title text NOT NULL,
    status dev.rfq_status DEFAULT 'draft'::dev.rfq_status NOT NULL,
    issued_at timestamp with time zone,
    awarded_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rfq_response; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.rfq_response (
    response_id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfq_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    total_amount numeric(18,2),
    score numeric(6,2),
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: variation; Type: TABLE; Schema: dev; Owner: -
--

CREATE TABLE dev.variation (
    variation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    description text NOT NULL,
    amount numeric(18,2) NOT NULL,
    status dev.variation_status DEFAULT 'proposed'::dev.variation_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acc_period; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.acc_period (
    period_id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status fin.period_status DEFAULT 'open'::fin.period_status NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT acc_period_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: account; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.account (
    account_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    account_type fin.account_type NOT NULL,
    reference text NOT NULL,
    status fin.account_status DEFAULT 'active'::fin.account_status NOT NULL,
    balance numeric(18,2) DEFAULT 0 NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: arrears; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.arrears (
    arrears_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    total_outstanding numeric(18,2) DEFAULT 0 NOT NULL,
    days_overdue integer DEFAULT 0 NOT NULL,
    risk_category fin.arrears_risk DEFAULT 'current'::fin.arrears_risk NOT NULL,
    last_payment_date date,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: arrears_action; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.arrears_action (
    action_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    action_type text NOT NULL,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    performed_by uuid
);


--
-- Name: coa_account; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.coa_account (
    coa_id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    account_class fin.account_class NOT NULL,
    asset_class fin.asset_class DEFAULT 'group'::fin.asset_class NOT NULL,
    parent_id uuid,
    is_postable boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.customer (
    customer_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_type fin.customer_type NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    id_number text,
    phone text,
    email text,
    address text,
    country text,
    wallet_id text,
    kyc_status fin.kyc_status DEFAULT 'pending'::fin.kyc_status NOT NULL,
    dpa_consent boolean DEFAULT false NOT NULL,
    dpa_consent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instalment_plan; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.instalment_plan (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    total_price numeric(18,2) NOT NULL,
    deposit numeric(18,2) DEFAULT 0 NOT NULL,
    num_instalments integer NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    structure text DEFAULT 'equal'::text NOT NULL,
    start_date date NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instalment_plan_num_instalments_check CHECK ((num_instalments > 0))
);


--
-- Name: invoice; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.invoice (
    invoice_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    invoice_type fin.invoice_type NOT NULL,
    reference text NOT NULL,
    amount numeric(18,2) NOT NULL,
    amount_paid numeric(18,2) DEFAULT 0 NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    due_date date NOT NULL,
    status fin.invoice_status DEFAULT 'draft'::fin.invoice_status NOT NULL,
    description text,
    platform_bill_id text,
    source_table text,
    source_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT invoice_amount_paid_check CHECK ((amount_paid >= (0)::numeric))
);


--
-- Name: journal; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.journal (
    journal_id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid,
    journal_date date DEFAULT CURRENT_DATE NOT NULL,
    narrative text,
    source_table text,
    source_id text,
    reversed_by uuid,
    posted_by uuid,
    posted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_line; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.journal_line (
    line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    coa_id uuid NOT NULL,
    asset_class fin.asset_class DEFAULT 'group'::fin.asset_class NOT NULL,
    debit numeric(18,2) DEFAULT 0 NOT NULL,
    credit numeric(18,2) DEFAULT 0 NOT NULL,
    CONSTRAINT journal_line_check CHECK (((debit = (0)::numeric) OR (credit = (0)::numeric))),
    CONSTRAINT journal_line_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT journal_line_debit_check CHECK ((debit >= (0)::numeric))
);


--
-- Name: ledger_entry; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.ledger_entry (
    ledger_id bigint NOT NULL,
    account_id uuid NOT NULL,
    invoice_id uuid,
    txn_type fin.txn_type NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    payment_method fin.payment_method,
    platform_txn_id text,
    narrative text,
    posted_by uuid,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entry_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: ledger_entry_ledger_id_seq; Type: SEQUENCE; Schema: fin; Owner: -
--

ALTER TABLE fin.ledger_entry ALTER COLUMN ledger_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME fin.ledger_entry_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: statement; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.statement (
    statement_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    opening_balance numeric(18,2) NOT NULL,
    closing_balance numeric(18,2) NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suspense_item; Type: TABLE; Schema: fin; Owner: -
--

CREATE TABLE fin.suspense_item (
    suspense_id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_txn_id text NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    channel pay.pay_channel,
    raw_payload jsonb,
    resolved boolean DEFAULT false NOT NULL,
    resolved_to_account uuid,
    resolved_by uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lease; Type: TABLE; Schema: lease; Owner: -
--

CREATE TABLE lease.lease (
    lease_id uuid DEFAULT gen_random_uuid() NOT NULL,
    premises_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid,
    start_date date NOT NULL,
    end_date date NOT NULL,
    rent_amount numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    escalation_pct numeric(6,3),
    escalation_anniv date,
    deposit numeric(18,2) DEFAULT 0 NOT NULL,
    market_rate numeric(18,2),
    status lease.lease_status DEFAULT 'draft'::lease.lease_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lease_check CHECK ((end_date > start_date))
);


--
-- Name: maintenance_request; Type: TABLE; Schema: lease; Owner: -
--

CREATE TABLE lease.maintenance_request (
    request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    premises_id uuid,
    lease_id uuid,
    raised_by uuid,
    category text,
    priority lease.maint_priority DEFAULT 'medium'::lease.maint_priority NOT NULL,
    description text,
    status lease.maint_status DEFAULT 'logged'::lease.maint_status NOT NULL,
    assigned_to uuid,
    sla_due timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: premises; Type: TABLE; Schema: lease; Owner: -
--

CREATE TABLE lease.premises (
    premises_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid,
    name text NOT NULL,
    description text,
    area_sqm numeric(14,2),
    geom public.geometry(Polygon,4326),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_log; Type: TABLE; Schema: pay; Owner: -
--

CREATE TABLE pay.api_log (
    api_log_id bigint NOT NULL,
    direction text NOT NULL,
    endpoint text NOT NULL,
    correlation_id text,
    payload_hash text,
    http_status integer,
    status text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_log_api_log_id_seq; Type: SEQUENCE; Schema: pay; Owner: -
--

ALTER TABLE pay.api_log ALTER COLUMN api_log_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pay.api_log_api_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bill; Type: TABLE; Schema: pay; Owner: -
--

CREATE TABLE pay.bill (
    bill_id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    bill_ref text NOT NULL,
    platform_bill_id text,
    amount numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    channels text[] DEFAULT '{ussd,app,qr,agent,remittance,merchant}'::text[] NOT NULL,
    status pay.bill_status DEFAULT 'created'::pay.bill_status NOT NULL,
    short_code text,
    qr_payload text,
    callback_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: callback; Type: TABLE; Schema: pay; Owner: -
--

CREATE TABLE pay.callback (
    callback_id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_txn_id text NOT NULL,
    platform_bill_id text,
    bill_ref text,
    amount_paid numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    channel pay.pay_channel,
    status pay.callback_status DEFAULT 'received'::pay.callback_status NOT NULL,
    signature_valid boolean,
    raw_payload jsonb,
    ledger_id bigint,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: commission; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.commission (
    commission_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    basis text NOT NULL,
    rate numeric(6,4),
    amount numeric(18,2),
    earned_milestone text,
    earned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: development; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.development (
    development_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    dev_type sales.development_type NOT NULL,
    total_area_ha numeric(12,2),
    boundary public.geometry(MultiPolygon,4326),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: infra_feature; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.infra_feature (
    feature_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid NOT NULL,
    feature_type text NOT NULL,
    name text,
    geom public.geometry(Geometry,4326),
    asset_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.lead (
    lead_id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text,
    email text,
    country text,
    source text,
    interest jsonb,
    agent_id uuid,
    converted_customer uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phase; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.phase (
    phase_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid NOT NULL,
    name text NOT NULL,
    planned_units integer,
    boundary public.geometry(Polygon,4326),
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plot; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.plot (
    plot_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid NOT NULL,
    phase_id uuid,
    plot_number text NOT NULL,
    plot_type sales.plot_type NOT NULL,
    area_sqm numeric(14,2),
    area_ha numeric(12,4),
    price numeric(18,2),
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    status sales.plot_status DEFAULT 'available'::sales.plot_status NOT NULL,
    customer_id uuid,
    gps_lat numeric(10,7),
    gps_lng numeric(10,7),
    geom public.geometry(Polygon,4326),
    utilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reservation; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.reservation (
    reservation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plot_id uuid NOT NULL,
    customer_id uuid,
    agent_id uuid,
    status sales.reservation_status DEFAULT 'active'::sales.reservation_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: sale; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.sale (
    sale_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plot_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    agent_id uuid,
    account_id uuid,
    price numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    status sales.sale_status DEFAULT 'pending_approval'::sales.sale_status NOT NULL,
    title_stage sales.title_stage DEFAULT 'agreement'::sales.title_stage NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    cancelled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: title_event; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.title_event (
    title_event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    stage sales.title_stage NOT NULL,
    event_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: adapter_config; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.adapter_config (
    config_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid,
    utility_type util.utility_type NOT NULL,
    adapter util.meter_adapter NOT NULL,
    settings jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.asset (
    asset_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid,
    asset_type text NOT NULL,
    make_model text,
    serial_no text,
    install_date date,
    warranty_until date,
    location_lat numeric(10,7),
    location_lng numeric(10,7),
    status util.asset_status DEFAULT 'active'::util.asset_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fault; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.fault (
    fault_id uuid DEFAULT gen_random_uuid() NOT NULL,
    utility_type util.utility_type NOT NULL,
    development_id uuid,
    asset_id uuid,
    reported_by uuid,
    category text,
    description text,
    status util.fault_status DEFAULT 'logged'::util.fault_status NOT NULL,
    assigned_to uuid,
    sla_due timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generation_log; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.generation_log (
    gen_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    solar_kwh numeric(16,3),
    battery_kwh numeric(16,3),
    backup_kwh numeric(16,3),
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT generation_log_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: grid_exchange; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.grid_exchange (
    exchange_id uuid DEFAULT gen_random_uuid() NOT NULL,
    development_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    direction util.grid_direction NOT NULL,
    energy_kwh numeric(16,3) NOT NULL,
    rate numeric(14,4),
    amount numeric(18,2),
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grid_exchange_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: lte_product; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.lte_product (
    product_id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_ref text,
    kind util.lte_product_kind NOT NULL,
    name text NOT NULL,
    price numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    validity_days integer,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lte_purchase; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.lte_purchase (
    purchase_id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscriber_id uuid NOT NULL,
    product_id uuid NOT NULL,
    customer_id uuid,
    amount_paid numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    channel pay.pay_channel,
    platform_txn_id text,
    provision_ref text,
    status util.provision_status DEFAULT 'pending'::util.provision_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provisioned_at timestamp with time zone
);


--
-- Name: lte_subscriber; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.lte_subscriber (
    subscriber_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    plot_id uuid,
    premises_id uuid,
    msisdn text,
    sim_serial text,
    status util.meter_status DEFAULT 'active'::util.meter_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: maintenance_schedule; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.maintenance_schedule (
    schedule_id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    frequency_days integer NOT NULL,
    next_due date NOT NULL,
    last_done date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meter; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.meter (
    meter_id uuid DEFAULT gen_random_uuid() NOT NULL,
    utility_type util.utility_type NOT NULL,
    customer_id uuid,
    premises_id uuid,
    plot_id uuid,
    development_id uuid,
    serial_no text NOT NULL,
    is_smart boolean DEFAULT true NOT NULL,
    is_prepaid boolean DEFAULT true NOT NULL,
    adapter util.meter_adapter DEFAULT 'sts'::util.meter_adapter NOT NULL,
    tariff_id uuid,
    last_balance numeric(16,3),
    last_balance_at timestamp with time zone,
    status util.meter_status DEFAULT 'active'::util.meter_status NOT NULL,
    installed_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meter_read; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.meter_read (
    read_id uuid DEFAULT gen_random_uuid() NOT NULL,
    meter_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    read_value numeric(16,3) NOT NULL,
    is_estimated boolean DEFAULT false NOT NULL,
    billed boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    read_by uuid,
    CONSTRAINT meter_read_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: tariff; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.tariff (
    tariff_id uuid DEFAULT gen_random_uuid() NOT NULL,
    utility_type util.utility_type NOT NULL,
    development_id uuid,
    name text NOT NULL,
    structure text DEFAULT 'flat'::text NOT NULL,
    rate numeric(14,4),
    tiers jsonb,
    fixed_charge numeric(14,4) DEFAULT 0,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: token_vend; Type: TABLE; Schema: util; Owner: -
--

CREATE TABLE util.token_vend (
    vend_id uuid DEFAULT gen_random_uuid() NOT NULL,
    meter_id uuid NOT NULL,
    customer_id uuid,
    utility_type util.utility_type NOT NULL,
    token_kind util.token_kind DEFAULT 'credit'::util.token_kind NOT NULL,
    amount_paid numeric(18,2) NOT NULL,
    currency fin.currency_code DEFAULT 'USD'::fin.currency_code NOT NULL,
    units numeric(16,3),
    tariff_id uuid,
    unit_calc jsonb,
    token_code text,
    adapter util.meter_adapter NOT NULL,
    channel pay.pay_channel,
    platform_txn_id text,
    status util.token_status DEFAULT 'issued'::util.token_status NOT NULL,
    issued_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_vend_amount_paid_check CHECK ((amount_paid >= (0)::numeric))
);


--
-- Data for Name: app_user; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: approval_request; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: authority_rule; Type: TABLE DATA; Schema: core; Owner: -
--

INSERT INTO core.authority_rule VALUES ('8f6946ce-98b1-4734-a0ce-f1a9e5cfc8d8', 'ledger.adjustment', 5000.00, 'USD', '3e4277a4-96e2-4117-bef6-dcd1f27bcb73', true, '2026-06-26 21:01:39.912853+00');
INSERT INTO core.authority_rule VALUES ('7fcd2370-764d-45cc-a9df-7b05345f27c7', 'sale.discount', 10000.00, 'USD', '3e4277a4-96e2-4117-bef6-dcd1f27bcb73', true, '2026-06-26 21:01:39.912853+00');
INSERT INTO core.authority_rule VALUES ('6278e905-e220-49cd-a1a6-18abd98756f9', 'ledger.writeoff', 0.00, 'USD', '3e4277a4-96e2-4117-bef6-dcd1f27bcb73', true, '2026-06-26 21:01:39.912853+00');


--
-- Data for Name: document; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: notification; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: permission; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: role; Type: TABLE DATA; Schema: core; Owner: -
--

INSERT INTO core.role VALUES ('94252aee-e91d-4121-95c8-12945381c616', 'registrar', 'Registrar', 'Sole authority over stand/plot allocation, sales and transfer approvals', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('6041b794-dac6-4cad-ae26-b2515b5a9667', 'sales_agent', 'Sales Agent', 'Reserve and sell plots; own pipeline and commissions', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('4be03086-ad4c-4b2b-9416-75ba0e44997e', 'sales_manager', 'Sales Manager', 'Oversight of inventory, sales velocity, approvals above thresholds', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('5c556c36-e07d-42bc-89b1-fdb18245b682', 'finance', 'Finance Officer', 'Invoicing, ledger, reconciliation, arrears, accounting', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('3e4277a4-96e2-4117-bef6-dcd1f27bcb73', 'finance_mgr', 'Finance Manager', 'Write-offs, dual-authorisation approvals, period close', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('0bb1a2eb-07ee-45fe-b3b3-3b2d48e7b11e', 'operations', 'Operations Officer', 'Leasing, maintenance, utilities operations', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('4c661560-e328-42d6-b8df-7a629cc139a5', 'field_team', 'Field Team', 'Meter reads, fault logging, site capture', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('2d97bc9c-a668-4698-b0fa-348525100701', 'project_mgr', 'Project Manager', 'Development projects, milestones, certificates', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('3927ed0e-71f0-4268-82ae-aef7be17cad1', 'quantity_surv', 'Quantity Surveyor', 'BOQ, measured quantities, payment certificates', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('91f7d76a-8395-4fc6-8c68-9da1690b2098', 'exec', 'Executive', 'Read-only group dashboards', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('088d67a9-56dd-4b11-b574-13569513ac97', 'internal_audit', 'Internal Audit', 'Read-only access to records and audit trail', '2026-06-26 21:01:33.273912+00');
INSERT INTO core.role VALUES ('7230039d-886c-488d-8c1f-83c658103d82', 'sys_admin', 'System Administrator', 'User/role management, configuration, integrations', '2026-06-26 21:01:33.273912+00');


--
-- Data for Name: role_permission; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: user_role; Type: TABLE DATA; Schema: core; Owner: -
--



--
-- Data for Name: boq; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: boq_item; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: budget; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: budget_line; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: contract; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: contractor; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: goods_received; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: milestone; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: payment_certificate; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: project; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: purchase_order; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: resource; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: resource_allocation; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: rfq; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: rfq_response; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: variation; Type: TABLE DATA; Schema: dev; Owner: -
--



--
-- Data for Name: acc_period; Type: TABLE DATA; Schema: fin; Owner: -
--

INSERT INTO fin.acc_period VALUES ('f33fe1a4-057b-4899-86ca-83e9faf65270', 2026, 6, 'open', NULL);


--
-- Data for Name: account; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: arrears; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: arrears_action; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: coa_account; Type: TABLE DATA; Schema: fin; Owner: -
--

INSERT INTO fin.coa_account VALUES ('f7d5d5c6-ebad-4b8c-b785-dd682d8da03d', '1000', 'Land & Development Assets', 'asset', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('9cee72e7-00f8-4685-8d9a-1883803ebd69', '1100', 'Infrastructure Assets', 'asset', 'utilities', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('59cc34f6-dcd7-4489-bd7c-51b70361f223', '1200', 'Trade & Instalment Receivables', 'asset', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('718671fd-42b2-4b98-9454-755b1215b85e', '1300', 'Cash & Bank', 'asset', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('82baa475-0960-4e8b-9c16-8ccb37d5d690', '2000', 'Deferred Revenue (Instalments)', 'liability', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('1628c913-a74e-41ab-8682-6115050c8e4e', '2100', 'Trade & Contractor Payables', 'liability', 'projects', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('2de721ae-4faf-41f4-885f-de87e6a16a7d', '2200', 'Retention Held', 'liability', 'projects', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('98e54278-3856-4e19-a118-d6d5f2b13aaa', '3000', 'Share Capital & Reserves', 'equity', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('8952b812-e93a-4280-9f7c-86ef95c41503', '4000', 'Revenue — Stand Sales', 'revenue', 'residential', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('0020823b-738c-4faf-b814-504074f37ccc', '4100', 'Revenue — Agro-Plot Sales', 'revenue', 'agro', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('7cd9acae-86ce-424d-8070-34fd7bdfa3c7', '4200', 'Revenue — Rentals', 'revenue', 'commercial', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('7e5c4221-cedb-487b-a823-98147728a79d', '4300', 'Revenue — Utilities', 'revenue', 'utilities', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('d185fafb-be82-4764-a097-959fbcb4f1eb', '4400', 'Revenue — Instalment Interest', 'revenue', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('8e9c87c3-fce7-48a0-9272-449c37e173fd', '5000', 'Cost of Sales — Land & Servicing', 'cogs', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('eb8b750d-de91-443b-b093-864a313b6c2f', '6000', 'Operating Expenses', 'opex', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('760b7eb5-12cd-4730-b947-441a93adb4da', '7000', 'Capital Expenditure — Infrastructure', 'capex', 'utilities', NULL, true, true, '2026-06-26 21:01:33.273912+00');
INSERT INTO fin.coa_account VALUES ('aef99718-863a-4cc9-8e47-5cedcf780e32', '8000', 'Finance Costs', 'finance_cost', 'group', NULL, true, true, '2026-06-26 21:01:33.273912+00');


--
-- Data for Name: customer; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: instalment_plan; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: invoice; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: journal; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: journal_line; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: ledger_entry; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: statement; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: suspense_item; Type: TABLE DATA; Schema: fin; Owner: -
--



--
-- Data for Name: lease; Type: TABLE DATA; Schema: lease; Owner: -
--



--
-- Data for Name: maintenance_request; Type: TABLE DATA; Schema: lease; Owner: -
--



--
-- Data for Name: premises; Type: TABLE DATA; Schema: lease; Owner: -
--



--
-- Data for Name: api_log; Type: TABLE DATA; Schema: pay; Owner: -
--



--
-- Data for Name: bill; Type: TABLE DATA; Schema: pay; Owner: -
--



--
-- Data for Name: callback; Type: TABLE DATA; Schema: pay; Owner: -
--



--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: commission; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: development; Type: TABLE DATA; Schema: sales; Owner: -
--

INSERT INTO sales.development VALUES ('b8c77d0d-8f6a-4e36-8e87-e26d83adf055', 'Kwekwe Mixed-Use Estate (33ha)', 'residential', 33.00, NULL, '2026-06-26 21:01:33.273912+00');
INSERT INTO sales.development VALUES ('829beb58-e562-4a6e-9cfa-cd055f52d69b', 'Agro-Industrial Diaspora Estate (4,500ha)', 'agro', 4500.00, NULL, '2026-06-26 21:01:33.273912+00');


--
-- Data for Name: infra_feature; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: lead; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: phase; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: plot; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: reservation; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: sale; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: title_event; Type: TABLE DATA; Schema: sales; Owner: -
--



--
-- Data for Name: geocode_settings; Type: TABLE DATA; Schema: tiger; Owner: -
--



--
-- Data for Name: pagc_gaz; Type: TABLE DATA; Schema: tiger; Owner: -
--



--
-- Data for Name: pagc_lex; Type: TABLE DATA; Schema: tiger; Owner: -
--



--
-- Data for Name: pagc_rules; Type: TABLE DATA; Schema: tiger; Owner: -
--



--
-- Data for Name: topology; Type: TABLE DATA; Schema: topology; Owner: -
--



--
-- Data for Name: layer; Type: TABLE DATA; Schema: topology; Owner: -
--



--
-- Data for Name: adapter_config; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: asset; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: fault; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: generation_log; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: grid_exchange; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: lte_product; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: lte_purchase; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: lte_subscriber; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: maintenance_schedule; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: meter; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: meter_read; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Data for Name: tariff; Type: TABLE DATA; Schema: util; Owner: -
--

INSERT INTO util.tariff VALUES ('e31bae2f-0aa5-40b0-ad13-69663488554a', 'solar', NULL, 'Solar flat (default)', 'flat', 35.0000, NULL, 0.0000, 'USD', '2026-06-26', true);
INSERT INTO util.tariff VALUES ('601415d4-1bb5-4f62-930b-c83d3fcf1a09', 'water', NULL, 'Water flat (default)', 'flat', 15.0000, NULL, 0.0000, 'USD', '2026-06-26', true);
INSERT INTO util.tariff VALUES ('9725c50e-c94a-47ed-85ff-215ec6fa574e', 'fibre', NULL, 'Fibre flat (default)', 'flat', 45.0000, NULL, 0.0000, 'USD', '2026-06-26', true);


--
-- Data for Name: token_vend; Type: TABLE DATA; Schema: util; Owner: -
--



--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE SET; Schema: core; Owner: -
--

SELECT pg_catalog.setval('core.audit_log_audit_id_seq', 1, false);


--
-- Name: ledger_entry_ledger_id_seq; Type: SEQUENCE SET; Schema: fin; Owner: -
--

SELECT pg_catalog.setval('fin.ledger_entry_ledger_id_seq', 1, false);


--
-- Name: api_log_api_log_id_seq; Type: SEQUENCE SET; Schema: pay; Owner: -
--

SELECT pg_catalog.setval('pay.api_log_api_log_id_seq', 1, false);


--
-- Name: topology_id_seq; Type: SEQUENCE SET; Schema: topology; Owner: -
--

SELECT pg_catalog.setval('topology.topology_id_seq', 1, false);


--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (user_id);


--
-- Name: app_user app_user_username_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.app_user
    ADD CONSTRAINT app_user_username_key UNIQUE (username);


--
-- Name: approval_request approval_request_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_request
    ADD CONSTRAINT approval_request_pkey PRIMARY KEY (approval_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);


--
-- Name: authority_rule authority_rule_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.authority_rule
    ADD CONSTRAINT authority_rule_pkey PRIMARY KEY (rule_id);


--
-- Name: document document_entity_schema_entity_table_entity_id_doc_type_vers_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.document
    ADD CONSTRAINT document_entity_schema_entity_table_entity_id_doc_type_vers_key UNIQUE (entity_schema, entity_table, entity_id, doc_type, version);


--
-- Name: document document_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.document
    ADD CONSTRAINT document_pkey PRIMARY KEY (document_id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- Name: permission permission_code_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.permission
    ADD CONSTRAINT permission_code_key UNIQUE (code);


--
-- Name: permission permission_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.permission
    ADD CONSTRAINT permission_pkey PRIMARY KEY (permission_id);


--
-- Name: role role_code_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_code_key UNIQUE (code);


--
-- Name: role_permission role_permission_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (role_id);


--
-- Name: user_role user_role_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: boq_item boq_item_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.boq_item
    ADD CONSTRAINT boq_item_pkey PRIMARY KEY (boq_item_id);


--
-- Name: boq boq_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.boq
    ADD CONSTRAINT boq_pkey PRIMARY KEY (boq_id);


--
-- Name: budget_line budget_line_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget_line
    ADD CONSTRAINT budget_line_pkey PRIMARY KEY (line_id);


--
-- Name: budget budget_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget
    ADD CONSTRAINT budget_pkey PRIMARY KEY (budget_id);


--
-- Name: budget budget_project_id_version_key; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget
    ADD CONSTRAINT budget_project_id_version_key UNIQUE (project_id, version);


--
-- Name: contract contract_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contract
    ADD CONSTRAINT contract_pkey PRIMARY KEY (contract_id);


--
-- Name: contractor contractor_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contractor
    ADD CONSTRAINT contractor_pkey PRIMARY KEY (contractor_id);


--
-- Name: goods_received goods_received_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.goods_received
    ADD CONSTRAINT goods_received_pkey PRIMARY KEY (grn_id);


--
-- Name: milestone milestone_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.milestone
    ADD CONSTRAINT milestone_pkey PRIMARY KEY (milestone_id);


--
-- Name: payment_certificate payment_certificate_cert_number_key; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_cert_number_key UNIQUE (cert_number);


--
-- Name: payment_certificate payment_certificate_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_pkey PRIMARY KEY (cert_id);


--
-- Name: project project_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.project
    ADD CONSTRAINT project_pkey PRIMARY KEY (project_id);


--
-- Name: purchase_order purchase_order_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (po_id);


--
-- Name: purchase_order purchase_order_po_number_key; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_po_number_key UNIQUE (po_number);


--
-- Name: resource_allocation resource_allocation_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.resource_allocation
    ADD CONSTRAINT resource_allocation_pkey PRIMARY KEY (allocation_id);


--
-- Name: resource resource_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.resource
    ADD CONSTRAINT resource_pkey PRIMARY KEY (resource_id);


--
-- Name: rfq rfq_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq
    ADD CONSTRAINT rfq_pkey PRIMARY KEY (rfq_id);


--
-- Name: rfq_response rfq_response_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq_response
    ADD CONSTRAINT rfq_response_pkey PRIMARY KEY (response_id);


--
-- Name: variation variation_pkey; Type: CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.variation
    ADD CONSTRAINT variation_pkey PRIMARY KEY (variation_id);


--
-- Name: acc_period acc_period_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.acc_period
    ADD CONSTRAINT acc_period_pkey PRIMARY KEY (period_id);


--
-- Name: acc_period acc_period_year_month_key; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.acc_period
    ADD CONSTRAINT acc_period_year_month_key UNIQUE (year, month);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (account_id);


--
-- Name: account account_reference_key; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.account
    ADD CONSTRAINT account_reference_key UNIQUE (reference);


--
-- Name: arrears_action arrears_action_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.arrears_action
    ADD CONSTRAINT arrears_action_pkey PRIMARY KEY (action_id);


--
-- Name: arrears arrears_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.arrears
    ADD CONSTRAINT arrears_pkey PRIMARY KEY (arrears_id);


--
-- Name: coa_account coa_account_code_key; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.coa_account
    ADD CONSTRAINT coa_account_code_key UNIQUE (code);


--
-- Name: coa_account coa_account_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.coa_account
    ADD CONSTRAINT coa_account_pkey PRIMARY KEY (coa_id);


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (customer_id);


--
-- Name: instalment_plan instalment_plan_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.instalment_plan
    ADD CONSTRAINT instalment_plan_pkey PRIMARY KEY (plan_id);


--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (invoice_id);


--
-- Name: invoice invoice_reference_key; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.invoice
    ADD CONSTRAINT invoice_reference_key UNIQUE (reference);


--
-- Name: journal_line journal_line_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal_line
    ADD CONSTRAINT journal_line_pkey PRIMARY KEY (line_id);


--
-- Name: journal journal_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal
    ADD CONSTRAINT journal_pkey PRIMARY KEY (journal_id);


--
-- Name: ledger_entry ledger_entry_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.ledger_entry
    ADD CONSTRAINT ledger_entry_pkey PRIMARY KEY (ledger_id);


--
-- Name: statement statement_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.statement
    ADD CONSTRAINT statement_pkey PRIMARY KEY (statement_id);


--
-- Name: suspense_item suspense_item_pkey; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.suspense_item
    ADD CONSTRAINT suspense_item_pkey PRIMARY KEY (suspense_id);


--
-- Name: suspense_item suspense_item_platform_txn_id_key; Type: CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.suspense_item
    ADD CONSTRAINT suspense_item_platform_txn_id_key UNIQUE (platform_txn_id);


--
-- Name: lease lease_pkey; Type: CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.lease
    ADD CONSTRAINT lease_pkey PRIMARY KEY (lease_id);


--
-- Name: maintenance_request maintenance_request_pkey; Type: CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.maintenance_request
    ADD CONSTRAINT maintenance_request_pkey PRIMARY KEY (request_id);


--
-- Name: premises premises_pkey; Type: CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.premises
    ADD CONSTRAINT premises_pkey PRIMARY KEY (premises_id);


--
-- Name: api_log api_log_pkey; Type: CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.api_log
    ADD CONSTRAINT api_log_pkey PRIMARY KEY (api_log_id);


--
-- Name: bill bill_bill_ref_key; Type: CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.bill
    ADD CONSTRAINT bill_bill_ref_key UNIQUE (bill_ref);


--
-- Name: bill bill_pkey; Type: CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.bill
    ADD CONSTRAINT bill_pkey PRIMARY KEY (bill_id);


--
-- Name: bill bill_platform_bill_id_key; Type: CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.bill
    ADD CONSTRAINT bill_platform_bill_id_key UNIQUE (platform_bill_id);


--
-- Name: callback callback_pkey; Type: CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.callback
    ADD CONSTRAINT callback_pkey PRIMARY KEY (callback_id);


--
-- Name: commission commission_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.commission
    ADD CONSTRAINT commission_pkey PRIMARY KEY (commission_id);


--
-- Name: development development_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.development
    ADD CONSTRAINT development_pkey PRIMARY KEY (development_id);


--
-- Name: infra_feature infra_feature_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.infra_feature
    ADD CONSTRAINT infra_feature_pkey PRIMARY KEY (feature_id);


--
-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (lead_id);


--
-- Name: phase phase_development_id_name_key; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.phase
    ADD CONSTRAINT phase_development_id_name_key UNIQUE (development_id, name);


--
-- Name: phase phase_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.phase
    ADD CONSTRAINT phase_pkey PRIMARY KEY (phase_id);


--
-- Name: plot plot_development_id_plot_number_key; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.plot
    ADD CONSTRAINT plot_development_id_plot_number_key UNIQUE (development_id, plot_number);


--
-- Name: plot plot_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.plot
    ADD CONSTRAINT plot_pkey PRIMARY KEY (plot_id);


--
-- Name: reservation reservation_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.reservation
    ADD CONSTRAINT reservation_pkey PRIMARY KEY (reservation_id);


--
-- Name: sale sale_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_pkey PRIMARY KEY (sale_id);


--
-- Name: title_event title_event_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.title_event
    ADD CONSTRAINT title_event_pkey PRIMARY KEY (title_event_id);


--
-- Name: adapter_config adapter_config_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.adapter_config
    ADD CONSTRAINT adapter_config_pkey PRIMARY KEY (config_id);


--
-- Name: asset asset_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.asset
    ADD CONSTRAINT asset_pkey PRIMARY KEY (asset_id);


--
-- Name: fault fault_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.fault
    ADD CONSTRAINT fault_pkey PRIMARY KEY (fault_id);


--
-- Name: generation_log generation_log_development_id_period_year_period_month_key; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.generation_log
    ADD CONSTRAINT generation_log_development_id_period_year_period_month_key UNIQUE (development_id, period_year, period_month);


--
-- Name: generation_log generation_log_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.generation_log
    ADD CONSTRAINT generation_log_pkey PRIMARY KEY (gen_id);


--
-- Name: grid_exchange grid_exchange_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.grid_exchange
    ADD CONSTRAINT grid_exchange_pkey PRIMARY KEY (exchange_id);


--
-- Name: lte_product lte_product_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_product
    ADD CONSTRAINT lte_product_pkey PRIMARY KEY (product_id);


--
-- Name: lte_purchase lte_purchase_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_purchase
    ADD CONSTRAINT lte_purchase_pkey PRIMARY KEY (purchase_id);


--
-- Name: lte_subscriber lte_subscriber_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_subscriber
    ADD CONSTRAINT lte_subscriber_pkey PRIMARY KEY (subscriber_id);


--
-- Name: maintenance_schedule maintenance_schedule_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.maintenance_schedule
    ADD CONSTRAINT maintenance_schedule_pkey PRIMARY KEY (schedule_id);


--
-- Name: meter meter_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_pkey PRIMARY KEY (meter_id);


--
-- Name: meter_read meter_read_meter_id_period_year_period_month_key; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter_read
    ADD CONSTRAINT meter_read_meter_id_period_year_period_month_key UNIQUE (meter_id, period_year, period_month);


--
-- Name: meter_read meter_read_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter_read
    ADD CONSTRAINT meter_read_pkey PRIMARY KEY (read_id);


--
-- Name: meter meter_serial_no_key; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_serial_no_key UNIQUE (serial_no);


--
-- Name: tariff tariff_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.tariff
    ADD CONSTRAINT tariff_pkey PRIMARY KEY (tariff_id);


--
-- Name: token_vend token_vend_pkey; Type: CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.token_vend
    ADD CONSTRAINT token_vend_pkey PRIMARY KEY (vend_id);


--
-- Name: idx_approval_action; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_approval_action ON core.approval_request USING btree (action_code);


--
-- Name: idx_approval_initiated_by; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_approval_initiated_by ON core.approval_request USING btree (initiated_by);


--
-- Name: idx_approval_status; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_approval_status ON core.approval_request USING btree (status);


--
-- Name: idx_audit_occurred; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_audit_occurred ON core.audit_log USING btree (occurred_at);


--
-- Name: idx_audit_table_entity; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_audit_table_entity ON core.audit_log USING btree (schema_name, table_name, entity_id);


--
-- Name: idx_document_entity; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_document_entity ON core.document USING btree (entity_schema, entity_table, entity_id);


--
-- Name: idx_notif_recipient; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_notif_recipient ON core.notification USING btree (recipient_kind, recipient_id);


--
-- Name: idx_boqitem_boq; Type: INDEX; Schema: dev; Owner: -
--

CREATE INDEX idx_boqitem_boq ON dev.boq_item USING btree (boq_id);


--
-- Name: idx_budgetline_budget; Type: INDEX; Schema: dev; Owner: -
--

CREATE INDEX idx_budgetline_budget ON dev.budget_line USING btree (budget_id);


--
-- Name: idx_cert_contract; Type: INDEX; Schema: dev; Owner: -
--

CREATE INDEX idx_cert_contract ON dev.payment_certificate USING btree (contract_id);


--
-- Name: idx_milestone_project; Type: INDEX; Schema: dev; Owner: -
--

CREATE INDEX idx_milestone_project ON dev.milestone USING btree (project_id);


--
-- Name: idx_resalloc_project; Type: INDEX; Schema: dev; Owner: -
--

CREATE INDEX idx_resalloc_project ON dev.resource_allocation USING btree (project_id);


--
-- Name: idx_account_customer; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_account_customer ON fin.account USING btree (customer_id);


--
-- Name: idx_arrears_account; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_arrears_account ON fin.arrears USING btree (account_id);


--
-- Name: idx_arrears_risk; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_arrears_risk ON fin.arrears USING btree (risk_category);


--
-- Name: idx_coa_class; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_coa_class ON fin.coa_account USING btree (account_class, asset_class);


--
-- Name: idx_customer_idnum; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_customer_idnum ON fin.customer USING btree (id_number);


--
-- Name: idx_customer_name_trgm; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_customer_name_trgm ON fin.customer USING gin ((((first_name || ' '::text) || last_name)) public.gin_trgm_ops);


--
-- Name: idx_customer_phone; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_customer_phone ON fin.customer USING btree (phone);


--
-- Name: idx_invoice_account; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_invoice_account ON fin.invoice USING btree (account_id);


--
-- Name: idx_invoice_billid; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_invoice_billid ON fin.invoice USING btree (platform_bill_id);


--
-- Name: idx_invoice_due; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_invoice_due ON fin.invoice USING btree (due_date);


--
-- Name: idx_invoice_status; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_invoice_status ON fin.invoice USING btree (status);


--
-- Name: idx_jline_coa; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_jline_coa ON fin.journal_line USING btree (coa_id);


--
-- Name: idx_jline_journal; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_jline_journal ON fin.journal_line USING btree (journal_id);


--
-- Name: idx_ledger_account; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_ledger_account ON fin.ledger_entry USING btree (account_id);


--
-- Name: idx_ledger_invoice; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_ledger_invoice ON fin.ledger_entry USING btree (invoice_id);


--
-- Name: idx_plan_account; Type: INDEX; Schema: fin; Owner: -
--

CREATE INDEX idx_plan_account ON fin.instalment_plan USING btree (account_id);


--
-- Name: uq_ledger_platform_txn; Type: INDEX; Schema: fin; Owner: -
--

CREATE UNIQUE INDEX uq_ledger_platform_txn ON fin.ledger_entry USING btree (platform_txn_id) WHERE (platform_txn_id IS NOT NULL);


--
-- Name: idx_lease_premises; Type: INDEX; Schema: lease; Owner: -
--

CREATE INDEX idx_lease_premises ON lease.lease USING btree (premises_id);


--
-- Name: idx_lease_status; Type: INDEX; Schema: lease; Owner: -
--

CREATE INDEX idx_lease_status ON lease.lease USING btree (status);


--
-- Name: idx_lease_tenant; Type: INDEX; Schema: lease; Owner: -
--

CREATE INDEX idx_lease_tenant ON lease.lease USING btree (tenant_id);


--
-- Name: idx_maint_premises; Type: INDEX; Schema: lease; Owner: -
--

CREATE INDEX idx_maint_premises ON lease.maintenance_request USING btree (premises_id);


--
-- Name: idx_maint_status; Type: INDEX; Schema: lease; Owner: -
--

CREATE INDEX idx_maint_status ON lease.maintenance_request USING btree (status);


--
-- Name: uq_active_lease; Type: INDEX; Schema: lease; Owner: -
--

CREATE UNIQUE INDEX uq_active_lease ON lease.lease USING btree (premises_id) WHERE (status = 'active'::lease.lease_status);


--
-- Name: idx_bill_invoice; Type: INDEX; Schema: pay; Owner: -
--

CREATE INDEX idx_bill_invoice ON pay.bill USING btree (invoice_id);


--
-- Name: idx_bill_platform; Type: INDEX; Schema: pay; Owner: -
--

CREATE INDEX idx_bill_platform ON pay.bill USING btree (platform_bill_id);


--
-- Name: idx_callback_status; Type: INDEX; Schema: pay; Owner: -
--

CREATE INDEX idx_callback_status ON pay.callback USING btree (status);


--
-- Name: uq_callback_txn; Type: INDEX; Schema: pay; Owner: -
--

CREATE UNIQUE INDEX uq_callback_txn ON pay.callback USING btree (platform_txn_id);


--
-- Name: idx_commission_agent; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_commission_agent ON sales.commission USING btree (agent_id);


--
-- Name: idx_infra_dev; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_infra_dev ON sales.infra_feature USING btree (development_id);


--
-- Name: idx_infra_geom; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_infra_geom ON sales.infra_feature USING gist (geom);


--
-- Name: idx_plot_dev; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_plot_dev ON sales.plot USING btree (development_id, phase_id);


--
-- Name: idx_plot_geom; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_plot_geom ON sales.plot USING gist (geom);


--
-- Name: idx_plot_status; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_plot_status ON sales.plot USING btree (status);


--
-- Name: idx_reservation_plot; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_reservation_plot ON sales.reservation USING btree (plot_id);


--
-- Name: idx_sale_customer; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_sale_customer ON sales.sale USING btree (customer_id);


--
-- Name: idx_sale_plot; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_sale_plot ON sales.sale USING btree (plot_id);


--
-- Name: idx_title_sale; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX idx_title_sale ON sales.title_event USING btree (sale_id);


--
-- Name: uq_active_reservation; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX uq_active_reservation ON sales.reservation USING btree (plot_id) WHERE (status = 'active'::sales.reservation_status);


--
-- Name: uq_active_sale; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX uq_active_sale ON sales.sale USING btree (plot_id) WHERE (status = ANY (ARRAY['pending_approval'::sales.sale_status, 'active'::sales.sale_status, 'completed'::sales.sale_status]));


--
-- Name: idx_asset_dev; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_asset_dev ON util.asset USING btree (development_id, asset_type);


--
-- Name: idx_fault_status; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_fault_status ON util.fault USING btree (status);


--
-- Name: idx_grid_dev_period; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_grid_dev_period ON util.grid_exchange USING btree (development_id, period_year, period_month);


--
-- Name: idx_lte_purchase_sub; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_lte_purchase_sub ON util.lte_purchase USING btree (subscriber_id);


--
-- Name: idx_lte_sub_customer; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_lte_sub_customer ON util.lte_subscriber USING btree (customer_id);


--
-- Name: idx_meter_customer; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_meter_customer ON util.meter USING btree (customer_id);


--
-- Name: idx_meter_dev; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_meter_dev ON util.meter USING btree (development_id, utility_type);


--
-- Name: idx_read_meter; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_read_meter ON util.meter_read USING btree (meter_id);


--
-- Name: idx_vend_created; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_vend_created ON util.token_vend USING btree (created_at);


--
-- Name: idx_vend_customer; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_vend_customer ON util.token_vend USING btree (customer_id);


--
-- Name: idx_vend_meter; Type: INDEX; Schema: util; Owner: -
--

CREATE INDEX idx_vend_meter ON util.token_vend USING btree (meter_id);


--
-- Name: uq_lte_platform_txn; Type: INDEX; Schema: util; Owner: -
--

CREATE UNIQUE INDEX uq_lte_platform_txn ON util.lte_purchase USING btree (platform_txn_id) WHERE (platform_txn_id IS NOT NULL);


--
-- Name: uq_vend_platform_txn; Type: INDEX; Schema: util; Owner: -
--

CREATE UNIQUE INDEX uq_vend_platform_txn ON util.token_vend USING btree (platform_txn_id) WHERE (platform_txn_id IS NOT NULL);


--
-- Name: approval_request aud_approval_request; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER aud_approval_request AFTER INSERT OR DELETE OR UPDATE ON core.approval_request FOR EACH ROW EXECUTE FUNCTION core.capture_audit('approval_id');


--
-- Name: audit_log trg_audit_no_update; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER trg_audit_no_update BEFORE DELETE OR UPDATE ON core.audit_log FOR EACH ROW EXECUTE FUNCTION core.audit_immutable();


--
-- Name: app_user trg_user_upd; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER trg_user_upd BEFORE UPDATE ON core.app_user FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: budget aud_budget; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_budget AFTER INSERT OR DELETE OR UPDATE ON dev.budget FOR EACH ROW EXECUTE FUNCTION core.capture_audit('budget_id');


--
-- Name: payment_certificate aud_cert; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_cert AFTER INSERT OR DELETE OR UPDATE ON dev.payment_certificate FOR EACH ROW EXECUTE FUNCTION core.capture_audit('cert_id');


--
-- Name: milestone aud_milestone; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_milestone AFTER INSERT OR DELETE OR UPDATE ON dev.milestone FOR EACH ROW EXECUTE FUNCTION core.capture_audit('milestone_id');


--
-- Name: purchase_order aud_po; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_po AFTER INSERT OR DELETE OR UPDATE ON dev.purchase_order FOR EACH ROW EXECUTE FUNCTION core.capture_audit('po_id');


--
-- Name: project aud_project; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_project AFTER INSERT OR DELETE OR UPDATE ON dev.project FOR EACH ROW EXECUTE FUNCTION core.capture_audit('project_id');


--
-- Name: variation aud_variation; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER aud_variation AFTER INSERT OR DELETE OR UPDATE ON dev.variation FOR EACH ROW EXECUTE FUNCTION core.capture_audit('variation_id');


--
-- Name: project trg_project_upd; Type: TRIGGER; Schema: dev; Owner: -
--

CREATE TRIGGER trg_project_upd BEFORE UPDATE ON dev.project FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: account aud_account; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER aud_account AFTER INSERT OR DELETE OR UPDATE ON fin.account FOR EACH ROW EXECUTE FUNCTION core.capture_audit('account_id');


--
-- Name: customer aud_customer; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER aud_customer AFTER INSERT OR DELETE OR UPDATE ON fin.customer FOR EACH ROW EXECUTE FUNCTION core.capture_audit('customer_id');


--
-- Name: invoice aud_invoice; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER aud_invoice AFTER INSERT OR DELETE OR UPDATE ON fin.invoice FOR EACH ROW EXECUTE FUNCTION core.capture_audit('invoice_id');


--
-- Name: journal aud_journal; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER aud_journal AFTER INSERT OR DELETE OR UPDATE ON fin.journal FOR EACH ROW EXECUTE FUNCTION core.capture_audit('journal_id');


--
-- Name: ledger_entry aud_ledger; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER aud_ledger AFTER INSERT OR DELETE OR UPDATE ON fin.ledger_entry FOR EACH ROW EXECUTE FUNCTION core.capture_audit('ledger_id');


--
-- Name: account trg_account_upd; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER trg_account_upd BEFORE UPDATE ON fin.account FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: customer trg_customer_upd; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER trg_customer_upd BEFORE UPDATE ON fin.customer FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: invoice trg_invoice_upd; Type: TRIGGER; Schema: fin; Owner: -
--

CREATE TRIGGER trg_invoice_upd BEFORE UPDATE ON fin.invoice FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: lease aud_lease; Type: TRIGGER; Schema: lease; Owner: -
--

CREATE TRIGGER aud_lease AFTER INSERT OR DELETE OR UPDATE ON lease.lease FOR EACH ROW EXECUTE FUNCTION core.capture_audit('lease_id');


--
-- Name: lease trg_lease_upd; Type: TRIGGER; Schema: lease; Owner: -
--

CREATE TRIGGER trg_lease_upd BEFORE UPDATE ON lease.lease FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: maintenance_request trg_maint_upd; Type: TRIGGER; Schema: lease; Owner: -
--

CREATE TRIGGER trg_maint_upd BEFORE UPDATE ON lease.maintenance_request FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: bill aud_bill; Type: TRIGGER; Schema: pay; Owner: -
--

CREATE TRIGGER aud_bill AFTER INSERT OR DELETE OR UPDATE ON pay.bill FOR EACH ROW EXECUTE FUNCTION core.capture_audit('bill_id');


--
-- Name: callback aud_callback; Type: TRIGGER; Schema: pay; Owner: -
--

CREATE TRIGGER aud_callback AFTER INSERT OR DELETE OR UPDATE ON pay.callback FOR EACH ROW EXECUTE FUNCTION core.capture_audit('callback_id');


--
-- Name: bill trg_bill_upd; Type: TRIGGER; Schema: pay; Owner: -
--

CREATE TRIGGER trg_bill_upd BEFORE UPDATE ON pay.bill FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: plot aud_plot; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER aud_plot AFTER INSERT OR DELETE OR UPDATE ON sales.plot FOR EACH ROW EXECUTE FUNCTION core.capture_audit('plot_id');


--
-- Name: reservation aud_reservation; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER aud_reservation AFTER INSERT OR DELETE OR UPDATE ON sales.reservation FOR EACH ROW EXECUTE FUNCTION core.capture_audit('reservation_id');


--
-- Name: sale aud_sale; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER aud_sale AFTER INSERT OR DELETE OR UPDATE ON sales.sale FOR EACH ROW EXECUTE FUNCTION core.capture_audit('sale_id');


--
-- Name: title_event aud_title; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER aud_title AFTER INSERT OR DELETE OR UPDATE ON sales.title_event FOR EACH ROW EXECUTE FUNCTION core.capture_audit('title_event_id');


--
-- Name: plot trg_plot_upd; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER trg_plot_upd BEFORE UPDATE ON sales.plot FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: sale trg_sale_upd; Type: TRIGGER; Schema: sales; Owner: -
--

CREATE TRIGGER trg_sale_upd BEFORE UPDATE ON sales.sale FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: grid_exchange aud_gridexchange; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER aud_gridexchange AFTER INSERT OR DELETE OR UPDATE ON util.grid_exchange FOR EACH ROW EXECUTE FUNCTION core.capture_audit('exchange_id');


--
-- Name: lte_purchase aud_ltepurchase; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER aud_ltepurchase AFTER INSERT OR DELETE OR UPDATE ON util.lte_purchase FOR EACH ROW EXECUTE FUNCTION core.capture_audit('purchase_id');


--
-- Name: meter aud_meter; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER aud_meter AFTER INSERT OR DELETE OR UPDATE ON util.meter FOR EACH ROW EXECUTE FUNCTION core.capture_audit('meter_id');


--
-- Name: meter_read aud_meterread; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER aud_meterread AFTER INSERT OR DELETE OR UPDATE ON util.meter_read FOR EACH ROW EXECUTE FUNCTION core.capture_audit('read_id');


--
-- Name: token_vend aud_tokenvend; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER aud_tokenvend AFTER INSERT OR DELETE OR UPDATE ON util.token_vend FOR EACH ROW EXECUTE FUNCTION core.capture_audit('vend_id');


--
-- Name: fault trg_fault_upd; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER trg_fault_upd BEFORE UPDATE ON util.fault FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: meter trg_meter_upd; Type: TRIGGER; Schema: util; Owner: -
--

CREATE TRIGGER trg_meter_upd BEFORE UPDATE ON util.meter FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: approval_request approval_request_decided_by_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_request
    ADD CONSTRAINT approval_request_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES core.app_user(user_id);


--
-- Name: approval_request approval_request_initiated_by_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_request
    ADD CONSTRAINT approval_request_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES core.app_user(user_id);


--
-- Name: approval_request approval_request_rule_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_request
    ADD CONSTRAINT approval_request_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES core.authority_rule(rule_id);


--
-- Name: authority_rule authority_rule_required_role_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.authority_rule
    ADD CONSTRAINT authority_rule_required_role_fkey FOREIGN KEY (required_role) REFERENCES core.role(role_id);


--
-- Name: document document_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.document
    ADD CONSTRAINT document_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES core.app_user(user_id);


--
-- Name: role_permission role_permission_permission_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES core.permission(permission_id) ON DELETE CASCADE;


--
-- Name: role_permission role_permission_role_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_role_id_fkey FOREIGN KEY (role_id) REFERENCES core.role(role_id) ON DELETE CASCADE;


--
-- Name: user_role user_role_role_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES core.role(role_id) ON DELETE CASCADE;


--
-- Name: user_role user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.app_user(user_id) ON DELETE CASCADE;


--
-- Name: boq_item boq_item_boq_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.boq_item
    ADD CONSTRAINT boq_item_boq_id_fkey FOREIGN KEY (boq_id) REFERENCES dev.boq(boq_id) ON DELETE CASCADE;


--
-- Name: boq boq_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.boq
    ADD CONSTRAINT boq_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: budget budget_approved_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget
    ADD CONSTRAINT budget_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES core.app_user(user_id);


--
-- Name: budget_line budget_line_budget_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget_line
    ADD CONSTRAINT budget_line_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES dev.budget(budget_id) ON DELETE CASCADE;


--
-- Name: budget budget_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.budget
    ADD CONSTRAINT budget_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: contract contract_contractor_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contract
    ADD CONSTRAINT contract_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES dev.contractor(contractor_id);


--
-- Name: contract contract_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contract
    ADD CONSTRAINT contract_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: contract contract_rfq_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contract
    ADD CONSTRAINT contract_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES dev.rfq(rfq_id);


--
-- Name: contractor contractor_customer_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.contractor
    ADD CONSTRAINT contractor_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: goods_received goods_received_inspected_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.goods_received
    ADD CONSTRAINT goods_received_inspected_by_fkey FOREIGN KEY (inspected_by) REFERENCES core.app_user(user_id);


--
-- Name: goods_received goods_received_po_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.goods_received
    ADD CONSTRAINT goods_received_po_id_fkey FOREIGN KEY (po_id) REFERENCES dev.purchase_order(po_id);


--
-- Name: milestone milestone_approved_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.milestone
    ADD CONSTRAINT milestone_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES core.app_user(user_id);


--
-- Name: milestone milestone_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.milestone
    ADD CONSTRAINT milestone_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: payment_certificate payment_certificate_approved_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES core.app_user(user_id);


--
-- Name: payment_certificate payment_certificate_contract_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES dev.contract(contract_id);


--
-- Name: payment_certificate payment_certificate_prepared_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES core.app_user(user_id);


--
-- Name: payment_certificate payment_certificate_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.payment_certificate
    ADD CONSTRAINT payment_certificate_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: project project_development_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.project
    ADD CONSTRAINT project_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: purchase_order purchase_order_budget_line_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_budget_line_id_fkey FOREIGN KEY (budget_line_id) REFERENCES dev.budget_line(line_id);


--
-- Name: purchase_order purchase_order_contract_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES dev.contract(contract_id);


--
-- Name: purchase_order purchase_order_contractor_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES dev.contractor(contractor_id);


--
-- Name: purchase_order purchase_order_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.purchase_order
    ADD CONSTRAINT purchase_order_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: resource_allocation resource_allocation_milestone_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.resource_allocation
    ADD CONSTRAINT resource_allocation_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES dev.milestone(milestone_id);


--
-- Name: resource_allocation resource_allocation_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.resource_allocation
    ADD CONSTRAINT resource_allocation_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: resource_allocation resource_allocation_resource_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.resource_allocation
    ADD CONSTRAINT resource_allocation_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dev.resource(resource_id);


--
-- Name: rfq rfq_awarded_to_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq
    ADD CONSTRAINT rfq_awarded_to_fkey FOREIGN KEY (awarded_to) REFERENCES dev.contractor(contractor_id);


--
-- Name: rfq rfq_boq_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq
    ADD CONSTRAINT rfq_boq_id_fkey FOREIGN KEY (boq_id) REFERENCES dev.boq(boq_id);


--
-- Name: rfq rfq_project_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq
    ADD CONSTRAINT rfq_project_id_fkey FOREIGN KEY (project_id) REFERENCES dev.project(project_id);


--
-- Name: rfq_response rfq_response_contractor_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq_response
    ADD CONSTRAINT rfq_response_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES dev.contractor(contractor_id);


--
-- Name: rfq_response rfq_response_rfq_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.rfq_response
    ADD CONSTRAINT rfq_response_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES dev.rfq(rfq_id) ON DELETE CASCADE;


--
-- Name: variation variation_approved_by_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.variation
    ADD CONSTRAINT variation_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES core.app_user(user_id);


--
-- Name: variation variation_contract_id_fkey; Type: FK CONSTRAINT; Schema: dev; Owner: -
--

ALTER TABLE ONLY dev.variation
    ADD CONSTRAINT variation_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES dev.contract(contract_id);


--
-- Name: account account_customer_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.account
    ADD CONSTRAINT account_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: arrears arrears_account_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.arrears
    ADD CONSTRAINT arrears_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: arrears_action arrears_action_account_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.arrears_action
    ADD CONSTRAINT arrears_action_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: arrears_action arrears_action_performed_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.arrears_action
    ADD CONSTRAINT arrears_action_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES core.app_user(user_id);


--
-- Name: coa_account coa_account_parent_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.coa_account
    ADD CONSTRAINT coa_account_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES fin.coa_account(coa_id);


--
-- Name: customer customer_created_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.customer
    ADD CONSTRAINT customer_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.app_user(user_id);


--
-- Name: instalment_plan instalment_plan_account_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.instalment_plan
    ADD CONSTRAINT instalment_plan_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: invoice invoice_account_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.invoice
    ADD CONSTRAINT invoice_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: journal_line journal_line_coa_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal_line
    ADD CONSTRAINT journal_line_coa_id_fkey FOREIGN KEY (coa_id) REFERENCES fin.coa_account(coa_id);


--
-- Name: journal_line journal_line_journal_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal_line
    ADD CONSTRAINT journal_line_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES fin.journal(journal_id) ON DELETE CASCADE;


--
-- Name: journal journal_period_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal
    ADD CONSTRAINT journal_period_id_fkey FOREIGN KEY (period_id) REFERENCES fin.acc_period(period_id);


--
-- Name: journal journal_posted_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal
    ADD CONSTRAINT journal_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES core.app_user(user_id);


--
-- Name: journal journal_reversed_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.journal
    ADD CONSTRAINT journal_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES fin.journal(journal_id);


--
-- Name: ledger_entry ledger_entry_account_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.ledger_entry
    ADD CONSTRAINT ledger_entry_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: ledger_entry ledger_entry_invoice_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.ledger_entry
    ADD CONSTRAINT ledger_entry_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES fin.invoice(invoice_id);


--
-- Name: ledger_entry ledger_entry_posted_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.ledger_entry
    ADD CONSTRAINT ledger_entry_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES core.app_user(user_id);


--
-- Name: statement statement_customer_id_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.statement
    ADD CONSTRAINT statement_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: suspense_item suspense_item_resolved_by_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.suspense_item
    ADD CONSTRAINT suspense_item_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES core.app_user(user_id);


--
-- Name: suspense_item suspense_item_resolved_to_account_fkey; Type: FK CONSTRAINT; Schema: fin; Owner: -
--

ALTER TABLE ONLY fin.suspense_item
    ADD CONSTRAINT suspense_item_resolved_to_account_fkey FOREIGN KEY (resolved_to_account) REFERENCES fin.account(account_id);


--
-- Name: lease lease_account_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.lease
    ADD CONSTRAINT lease_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: lease lease_premises_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.lease
    ADD CONSTRAINT lease_premises_id_fkey FOREIGN KEY (premises_id) REFERENCES lease.premises(premises_id);


--
-- Name: lease lease_tenant_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.lease
    ADD CONSTRAINT lease_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES fin.customer(customer_id);


--
-- Name: maintenance_request maintenance_request_lease_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.maintenance_request
    ADD CONSTRAINT maintenance_request_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES lease.lease(lease_id);


--
-- Name: maintenance_request maintenance_request_premises_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.maintenance_request
    ADD CONSTRAINT maintenance_request_premises_id_fkey FOREIGN KEY (premises_id) REFERENCES lease.premises(premises_id);


--
-- Name: maintenance_request maintenance_request_raised_by_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.maintenance_request
    ADD CONSTRAINT maintenance_request_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES fin.customer(customer_id);


--
-- Name: premises premises_development_id_fkey; Type: FK CONSTRAINT; Schema: lease; Owner: -
--

ALTER TABLE ONLY lease.premises
    ADD CONSTRAINT premises_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: bill bill_invoice_id_fkey; Type: FK CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.bill
    ADD CONSTRAINT bill_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES fin.invoice(invoice_id);


--
-- Name: callback callback_ledger_id_fkey; Type: FK CONSTRAINT; Schema: pay; Owner: -
--

ALTER TABLE ONLY pay.callback
    ADD CONSTRAINT callback_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES fin.ledger_entry(ledger_id);


--
-- Name: commission commission_agent_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.commission
    ADD CONSTRAINT commission_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES core.app_user(user_id);


--
-- Name: commission commission_sale_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.commission
    ADD CONSTRAINT commission_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales.sale(sale_id);


--
-- Name: infra_feature infra_feature_development_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.infra_feature
    ADD CONSTRAINT infra_feature_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: lead lead_agent_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES core.app_user(user_id);


--
-- Name: lead lead_converted_customer_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_converted_customer_fkey FOREIGN KEY (converted_customer) REFERENCES fin.customer(customer_id);


--
-- Name: phase phase_development_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.phase
    ADD CONSTRAINT phase_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: plot plot_customer_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.plot
    ADD CONSTRAINT plot_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: plot plot_development_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.plot
    ADD CONSTRAINT plot_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: plot plot_phase_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.plot
    ADD CONSTRAINT plot_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES sales.phase(phase_id);


--
-- Name: reservation reservation_agent_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.reservation
    ADD CONSTRAINT reservation_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES core.app_user(user_id);


--
-- Name: reservation reservation_customer_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.reservation
    ADD CONSTRAINT reservation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: reservation reservation_plot_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.reservation
    ADD CONSTRAINT reservation_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES sales.plot(plot_id);


--
-- Name: sale sale_account_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_account_id_fkey FOREIGN KEY (account_id) REFERENCES fin.account(account_id);


--
-- Name: sale sale_agent_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES core.app_user(user_id);


--
-- Name: sale sale_approved_by_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES core.app_user(user_id);


--
-- Name: sale sale_customer_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: sale sale_plot_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sale
    ADD CONSTRAINT sale_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES sales.plot(plot_id);


--
-- Name: title_event title_event_recorded_by_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.title_event
    ADD CONSTRAINT title_event_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES core.app_user(user_id);


--
-- Name: title_event title_event_sale_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.title_event
    ADD CONSTRAINT title_event_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales.sale(sale_id);


--
-- Name: adapter_config adapter_config_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.adapter_config
    ADD CONSTRAINT adapter_config_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: asset asset_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.asset
    ADD CONSTRAINT asset_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: fault fault_asset_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.fault
    ADD CONSTRAINT fault_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES util.asset(asset_id);


--
-- Name: fault fault_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.fault
    ADD CONSTRAINT fault_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: meter fk_meter_tariff; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT fk_meter_tariff FOREIGN KEY (tariff_id) REFERENCES util.tariff(tariff_id);


--
-- Name: generation_log generation_log_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.generation_log
    ADD CONSTRAINT generation_log_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: grid_exchange grid_exchange_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.grid_exchange
    ADD CONSTRAINT grid_exchange_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: lte_purchase lte_purchase_customer_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_purchase
    ADD CONSTRAINT lte_purchase_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: lte_purchase lte_purchase_product_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_purchase
    ADD CONSTRAINT lte_purchase_product_id_fkey FOREIGN KEY (product_id) REFERENCES util.lte_product(product_id);


--
-- Name: lte_purchase lte_purchase_subscriber_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_purchase
    ADD CONSTRAINT lte_purchase_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES util.lte_subscriber(subscriber_id);


--
-- Name: lte_subscriber lte_subscriber_customer_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_subscriber
    ADD CONSTRAINT lte_subscriber_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: lte_subscriber lte_subscriber_plot_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_subscriber
    ADD CONSTRAINT lte_subscriber_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES sales.plot(plot_id);


--
-- Name: lte_subscriber lte_subscriber_premises_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.lte_subscriber
    ADD CONSTRAINT lte_subscriber_premises_id_fkey FOREIGN KEY (premises_id) REFERENCES lease.premises(premises_id);


--
-- Name: maintenance_schedule maintenance_schedule_asset_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.maintenance_schedule
    ADD CONSTRAINT maintenance_schedule_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES util.asset(asset_id);


--
-- Name: meter meter_customer_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: meter meter_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: meter meter_plot_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_plot_id_fkey FOREIGN KEY (plot_id) REFERENCES sales.plot(plot_id);


--
-- Name: meter meter_premises_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter
    ADD CONSTRAINT meter_premises_id_fkey FOREIGN KEY (premises_id) REFERENCES lease.premises(premises_id);


--
-- Name: meter_read meter_read_meter_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter_read
    ADD CONSTRAINT meter_read_meter_id_fkey FOREIGN KEY (meter_id) REFERENCES util.meter(meter_id);


--
-- Name: meter_read meter_read_read_by_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.meter_read
    ADD CONSTRAINT meter_read_read_by_fkey FOREIGN KEY (read_by) REFERENCES core.app_user(user_id);


--
-- Name: tariff tariff_development_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.tariff
    ADD CONSTRAINT tariff_development_id_fkey FOREIGN KEY (development_id) REFERENCES sales.development(development_id);


--
-- Name: token_vend token_vend_customer_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.token_vend
    ADD CONSTRAINT token_vend_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES fin.customer(customer_id);


--
-- Name: token_vend token_vend_issued_by_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.token_vend
    ADD CONSTRAINT token_vend_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES core.app_user(user_id);


--
-- Name: token_vend token_vend_meter_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.token_vend
    ADD CONSTRAINT token_vend_meter_id_fkey FOREIGN KEY (meter_id) REFERENCES util.meter(meter_id);


--
-- Name: token_vend token_vend_tariff_id_fkey; Type: FK CONSTRAINT; Schema: util; Owner: -
--

ALTER TABLE ONLY util.token_vend
    ADD CONSTRAINT token_vend_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES util.tariff(tariff_id);


--
-- PostgreSQL database dump complete
--

