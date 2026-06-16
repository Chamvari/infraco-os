-- ============================================================================
--  InfraCo OS — DEMO seed data (NOT for production)
--  Populates customers, accounts, arrears snapshots, a small ledger, and a set
--  of available plots so the admin frontend (Finance dashboard + reservation
--  flow) shows real data. Idempotent: re-running replaces the DEMO-* rows.
--  Apply with:  docker compose exec -T db psql -U infraco -d infraco_os -f - < db/seed_demo.sql
-- ============================================================================
BEGIN;

-- Demo actor (audit context) + a demo sales agent.
INSERT INTO core.app_user (username, full_name, email)
VALUES ('demo_admin','Demo Admin','demo_admin@lfh.test')
ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name
RETURNING user_id \gset
SET LOCAL infraco.actor_id = :'user_id';
SET LOCAL infraco.actor_role = 'sys_admin';

INSERT INTO core.app_user (username, full_name, email)
VALUES ('demo_agent','Demo Agent','demo_agent@lfh.test')
ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name
RETURNING user_id AS agent_id \gset

-- Idempotency: clear prior DEMO rows (children first).
DELETE FROM fin.arrears       WHERE account_id IN (SELECT account_id FROM fin.account WHERE reference LIKE 'ACC-DEMO%');
DELETE FROM fin.ledger_entry  WHERE account_id IN (SELECT account_id FROM fin.account WHERE reference LIKE 'ACC-DEMO%');
DELETE FROM fin.invoice       WHERE account_id IN (SELECT account_id FROM fin.account WHERE reference LIKE 'ACC-DEMO%');
DELETE FROM sales.reservation WHERE plot_id IN (SELECT plot_id FROM sales.plot WHERE plot_number LIKE 'DEMO-%');
DELETE FROM fin.account       WHERE reference LIKE 'ACC-DEMO%';
DELETE FROM sales.plot        WHERE plot_number LIKE 'DEMO-%';
DELETE FROM fin.customer      WHERE id_number LIKE 'DEMO-%';

-- Customers (mix of local + diaspora).
INSERT INTO fin.customer (customer_type, first_name, last_name, id_number, phone, email, country, kyc_status, dpa_consent, dpa_consent_at, created_by)
VALUES ('residential_buyer','Tendai','Moyo','DEMO-63-111','+263771000001','tendai@demo.test','Zimbabwe','verified',true,now(),:'user_id'::uuid)
RETURNING customer_id AS c1 \gset
INSERT INTO fin.customer (customer_type, first_name, last_name, id_number, phone, email, country, kyc_status, dpa_consent, dpa_consent_at, created_by)
VALUES ('residential_buyer','Chipo','Ncube','DEMO-63-222','+263771000002','chipo@demo.test','Zimbabwe','verified',true,now(),:'user_id'::uuid)
RETURNING customer_id AS c2 \gset
INSERT INTO fin.customer (customer_type, first_name, last_name, id_number, phone, email, country, kyc_status, dpa_consent, dpa_consent_at, created_by)
VALUES ('agro_buyer','Farai','Dube','DEMO-UK-333','+447700000003','farai@demo.test','United Kingdom','verified',true,now(),:'user_id'::uuid)
RETURNING customer_id AS c3 \gset
INSERT INTO fin.customer (customer_type, first_name, last_name, id_number, phone, email, country, kyc_status, dpa_consent, dpa_consent_at, created_by)
VALUES ('agro_buyer','Rudo','Sibanda','DEMO-ZA-444','+27820000004','rudo@demo.test','South Africa','submitted',true,now(),:'user_id'::uuid)
RETURNING customer_id AS c4 \gset
INSERT INTO fin.customer (customer_type, first_name, last_name, id_number, phone, email, country, kyc_status, dpa_consent, dpa_consent_at, created_by)
VALUES ('tenant','Kuda','Mlambo','DEMO-63-555','+263771000005','kuda@demo.test','Zimbabwe','verified',true,now(),:'user_id'::uuid)
RETURNING customer_id AS c5 \gset

-- Accounts with outstanding balances.
INSERT INTO fin.account (customer_id, account_type, reference, status, balance, currency) VALUES (:'c1'::uuid,'stand_purchase','ACC-DEMO-1','active',12000,'USD') RETURNING account_id AS a1 \gset
INSERT INTO fin.account (customer_id, account_type, reference, status, balance, currency) VALUES (:'c2'::uuid,'stand_purchase','ACC-DEMO-2','active', 8000,'USD') RETURNING account_id AS a2 \gset
INSERT INTO fin.account (customer_id, account_type, reference, status, balance, currency) VALUES (:'c3'::uuid,'agro_purchase','ACC-DEMO-3','active',15000,'USD') RETURNING account_id AS a3 \gset
INSERT INTO fin.account (customer_id, account_type, reference, status, balance, currency) VALUES (:'c4'::uuid,'agro_purchase','ACC-DEMO-4','active', 5000,'USD') RETURNING account_id AS a4 \gset
INSERT INTO fin.account (customer_id, account_type, reference, status, balance, currency) VALUES (:'c5'::uuid,'rental','ACC-DEMO-5','active', 0,'USD') RETURNING account_id AS a5 \gset

-- Arrears snapshots spread across the ageing buckets (FIN-ARR-001).
INSERT INTO fin.arrears (account_id, total_outstanding, days_overdue, risk_category, last_payment_date) VALUES
  (:'a1'::uuid, 12000, 120, 'd90_plus', current_date - 40),
  (:'a2'::uuid,  8000,  75, 'd61_90',  current_date - 30),
  (:'a3'::uuid, 15000,  45, 'd31_60',  NULL),
  (:'a4'::uuid,  5000,  20, 'd1_30',   current_date - 10),
  (:'a5'::uuid,     0,   0, 'current', current_date - 2);

-- A small consistent ledger on account 1 (one paid + one overdue instalment).
INSERT INTO fin.invoice (account_id, invoice_type, reference, amount, amount_paid, currency, due_date, status, description, source_table) VALUES
  (:'a1'::uuid,'instalment','INV-DEMO-1-001',2000,2000,'USD', current_date - 90,'paid',   'Instalment 1 of 6','instalment_plan'),
  (:'a1'::uuid,'instalment','INV-DEMO-1-002',2000,   0,'USD', current_date - 60,'overdue','Instalment 2 of 6','instalment_plan');
INSERT INTO fin.ledger_entry (account_id, invoice_id, txn_type, amount, currency, payment_method, platform_txn_id, narrative, posted_by)
SELECT :'a1'::uuid, invoice_id, 'credit', 2000, 'USD'::fin.currency_code, 'wallet'::fin.payment_method, 'DEMO-TX-1', 'Demo payment via wallet', :'user_id'::uuid
  FROM fin.invoice WHERE reference = 'INV-DEMO-1-001';

-- Available plots in the Kwekwe estate for the reservation flow + GIS map
-- (STND-INV-003, GIS-003). Distinct GPS coords so the map shows separate plots.
INSERT INTO sales.plot (development_id, plot_number, plot_type, area_sqm, price, currency, status, gps_lat, gps_lng)
SELECT d.development_id, v.num, 'residential', v.area, v.price, 'USD', 'available', v.lat, v.lng
  FROM sales.development d,
       (VALUES ('DEMO-A-001',400,15000, -18.92800, 29.81400),
               ('DEMO-A-002',450,16000, -18.92855, 29.81480),
               ('DEMO-A-003',500,17000, -18.92905, 29.81350),
               ('DEMO-A-004',350,14000, -18.92760, 29.81520),
               ('DEMO-A-005',600,21000, -18.92980, 29.81290),
               ('DEMO-A-006',420,15500, -18.92710, 29.81360),
               ('DEMO-A-007',480,16500, -18.92930, 29.81470)) AS v(num, area, price, lat, lng)
 WHERE d.name LIKE 'Kwekwe%';

-- Status variety so the map shows colour coding (sold / reserved alongside available).
UPDATE sales.plot SET status = 'sold'     WHERE plot_number = 'DEMO-A-006';
UPDATE sales.plot SET status = 'reserved' WHERE plot_number = 'DEMO-A-007';

-- Plot polygons (GIS-004): a rectangle around each plot's GPS point, sized by
-- type (~20x15 m residential, larger for business/hospitality). Metres are
-- converted to degrees at the plot's latitude. Re-runnable (UPDATE).
UPDATE sales.plot AS p
   SET geom = ST_MakeEnvelope(
        p.gps_lng - (s.w / 2.0) / (111320.0 * cos(radians(p.gps_lat))),
        p.gps_lat - (s.h / 2.0) / 111320.0,
        p.gps_lng + (s.w / 2.0) / (111320.0 * cos(radians(p.gps_lat))),
        p.gps_lat + (s.h / 2.0) / 111320.0,
        4326)
  FROM (
    SELECT plot_id,
           CASE plot_type WHEN 'business' THEN 40 WHEN 'hospitality' THEN 50
                          WHEN 'agro' THEN 224 ELSE 20 END AS w,
           CASE plot_type WHEN 'business' THEN 30 WHEN 'hospitality' THEN 40
                          WHEN 'agro' THEN 224 ELSE 15 END AS h
      FROM sales.plot
     WHERE plot_number LIKE 'DEMO-%' AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL
  ) s
 WHERE p.plot_id = s.plot_id;

COMMIT;

\echo ''
\echo '=== Demo plots (use a plot_id in the reservation form) ==='
SELECT plot_id::text AS plot_id, plot_number, price FROM sales.plot WHERE plot_number LIKE 'DEMO-%' ORDER BY plot_number;
\echo '=== Demo customers (use a customer_id as the prospect) ==='
SELECT customer_id::text AS customer_id, first_name || ' ' || last_name AS name FROM fin.customer WHERE id_number LIKE 'DEMO-%' ORDER BY first_name;
\echo '=== Demo agent (use as actorId / agentId) ==='
SELECT user_id::text AS agent_user_id, username FROM core.app_user WHERE username = 'demo_agent';
