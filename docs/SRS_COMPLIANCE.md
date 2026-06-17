# InfraCo OS — SRS v2.0 Compliance Scorecard

**Generated:** 2026-06-17
**Method:** Per-requirement-ID audit. Every requirement in `docs/SRS_v2.md` was
cross-checked against the actual codebase (`src/`, `web/`, `db/`). A requirement
is **Met** only when real application code implements it — schema tables, DTOs,
comments, and TODO scaffolding alone do **not** count as Met (they score
Partial at best). Status ∈ {Met, Partial, Unmet}.

> **Headline:** the system implements the *core revenue/operations spine*
> (onboarding, instalments, ledger, arrears, leasing, prepaid utility vending,
> auth/RBAC, audit) but is far from SRS-complete. A large amount of the schema
> exists with no application logic on top of it (Modules E, parts of B and D).

---

## 1. Scorecard summary

| Module | Met | Partial | Unmet | Total | **Musts met** |
|--------|----:|--------:|------:|------:|:-------------:|
| **A — Financial Core**        | 30 | 5  | 10 | 45 | 22 / 35 |
| **B — Sales Engine**          | 8  | 14 | 9  | 31 | 7 / 19  |
| **C — Leasing & Tenancy**     | 7  | 2  | 2  | 11 | 6 / 8   |
| **D — Utilities**             | 9  | 9  | 15 | 33 | 9 / 17  |
| **E — Development/Project**   | 0  | 16 | 13 | 29 | 0 / 19  |
| **F — Document Layer**        | 0  | 2  | 3  | 5  | 0 / 5   |
| **G — Portals**               | 0  | 3  | 13 | 16 | 0 / 10  |
| **H — Payments Integration**  | 1  | 5  | 2  | 8  | 1 / 6   |
| **Z — Platform Services**     | 7  | 4  | 2  | 13 | 6 / 7   |
| **NFRs**                      | 0  | 7  | 4  | 11 | 0 / 7   |
| **TOTAL**                     | **62** | **67** | **73** | **202** | **51 / 133** |

- **Fully met:** 62 / 202 ≈ **31%**
- **Met or partial:** 129 / 202 ≈ **64%**
- **Must-have requirements fully met:** 51 / 133 ≈ **38%**

### Maturity by SRS phase (§3.3)
| Phase | Modules | State |
|-------|---------|-------|
| 1 — revenue | A-core, B-core, H, Z-core | **Built** — A accounting + H outbound bill push now done |
| 2 — operations | B-full, C, D | **C done**, D prepaid done, B sales workflow incomplete |
| 3 — customer experience | G portals | **Not started** (staff console only) |
| 4 — development control | E, F | **Not started** (schema-only) |

---

## 2. Critical gaps & risks (act on these regardless of module choice)

1. **🔴 Payment callback signature not enforced (PAY-API-008).** HMAC is computed
   and `signature_valid` stored, but the handler posts to the ledger *even when
   the signature is invalid*. This is a money-movement security hole. Small fix.
2. **🔴 No reservation→sale conversion (STND-SALE-002/003/004).** You can reserve
   a plot but cannot convert it to a sale, generate an agreement, or wire it to
   the instalment engine. The core sales revenue path dead-ends at reservation.
3. **✅ Accounting layer built (FIN-ACC-001..009, 8/10 done).** Chart of accounts,
   real-time double-entry posting, reversal, trial balance, P&L per asset class,
   balance sheet, period close, CSV export all implemented and unit-tested.
   Remaining: cash flow statement (FIN-ACC-005) and budget-vs-actuals
   (FIN-ACC-010, blocked on Module E budgets).
4. **🟠 Outbound bill creation is a TODO (PAY-API-001/002/004).** Bills are
   written to `pay.bill` locally but never pushed to the Payments Platform.
5. **✅ MFA is a real TOTP second factor (PLAT-AUTH-003).** Login issues an
   `mfa:false` token; stepping up to `mfa:true` requires a valid RFC 6238
   authenticator code via `POST /auth/mfa/verify` (enrol via `/auth/mfa/enroll`).
   The `@Mfa()` guard gates sensitive routes on the stepped-up claim.
6. **🟡 Dev JWT fallback secret in source (NFR-SEC-003).**
   `dev-insecure-secret-change-me` ships in `token.service.ts` (prod fails closed).
7. **✅ Delegation-of-Authority now rule-driven (PLAT-AUTH-005).**
   `core.authority_rule` drives an initiate→approve/reject→execute workflow
   (`ApprovalService`); high-value ledger adjustments route through it and a
   distinct second signatory is enforced. The old hard-coded ledger dual-auth
   was consolidated into this single mechanism.

---

## 3. Per-module detail

### Module A — Financial Core  (30 Met / 5 Partial / 10 Unmet; Musts 22/35)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| FIN-CUST-001 | Must | Met | customer.service.ts:66-85 | Unique id + identity/contact/KYC/wallet |
| FIN-CUST-002 | Must | Met | account.service.ts:37-90 | Multiple accounts per customer, 4 types |
| FIN-CUST-003 | Must | Partial | customer.service.ts:57-58,128-131 | Consent+timestamp only; no retention/subject-rights |
| FIN-CUST-004 | Should | Met | customer.service.ts:187-237 | Duplicate detection id/phone + name trigram |
| ONB-001 | Must | Met | onboarding.service.ts:42-91 | Guided capture, KYC pending, DPA consent |
| ONB-002 | Must | Met | onboarding.service.ts:94-133 | Versioned doc upload to core.document |
| ONB-003 | Must | Met | onboarding.service.ts:187-189 | Optional wallet link (placeholder POST) |
| ONB-004 | Must | Met | onboarding.service.ts:141-184 | Staff verify/reject w/ reason, audited |
| ONB-005 | Must | Met | sales/lease reuse fin.customer | Customer reused, no re-key |
| ONB-006 | Must | Met | lease.service.ts:148-201,319 | Tenant flows into lease creation |
| ONB-007 | Must | Met | onboarding.service.ts:66-88 | Contractor → dev.contractor w/ reg/tax/category |
| ONB-008 | Must | Met | onboarding.service.ts | Diaspora completable online |
| FIN-INST-001 | Must | Met | financial.service.ts:56-141 | Schedule: freq/amounts/due/deposit/total |
| FIN-INST-002 | Should | Met | instalment.util.ts:48-75 | Equal + balloon structures |
| FIN-INST-003 | Must | Met | financial.service.ts:149-201 | Due-date raise → createBill (H), notify |
| FIN-INST-004 | Must | Met | ledger.service.ts:299-394 | Paid/balance/arrears/next-due per account |
| FIN-INST-005 | Must | Partial | schema 314,353 | Currency per row; no fx_rate/settlement currency |
| FIN-RENT-001 | Must | Met | lease.service.ts:345-454 | Monthly rent invoice per active lease |
| FIN-RENT-002 | Should | Met | lease.service.ts:397-402 | % escalation at anniversary (no CPI) |
| FIN-RENT-003 | Must | Met | lease.service.ts:461-554 | Utility charge separate or merged per config |
| FIN-RENT-004 | Must | Met | lease.service.ts:710-894 | Per-tenant ledger + statement on demand |
| FIN-UTIL-001 | Must | Unmet | util.meter_read table only | No meter-read recording code |
| FIN-UTIL-002 | Must | Unmet | — | No consumption-from-reads + tariff invoice |
| FIN-UTIL-003 | Must | Unmet | — | No read-based utility billing cycle |
| FIN-UTIL-004 | Should | Unmet | — | No solar allocation / capacity alerts |
| FIN-UTIL-005 | Should | Unmet | — | No unbilled-utility flagging |
| FIN-LED-001 | Must | Met | ledger.service.ts:92-127,397-443 | Postings keyed by account/invoice/txn |
| FIN-LED-002 | Must | Met | payments.service.ts:191-226 | Callback auto-posts, updates invoice, arrears |
| FIN-LED-003 | Must | Met | ledger.service.ts:133-215 | Suspense park + manual allocate |
| FIN-LED-004 | Should | Partial | ledger.service.ts:450-506 | Internal reconcile only; no external system |
| FIN-LED-005 | Must | Met | ledger.service.ts:224-291 | Dual-auth distinct authoriser + audit |
| FIN-ARR-001 | Must | Met | ledger.service.ts:366-383 | Buckets current/1-30/31-60/61-90/90+ |
| FIN-ARR-002 | Must | Met | arrears.service.ts:45-151 | Reminder/notice/legal-referral ladder |
| FIN-ARR-003 | Must | Partial | reporting.service.ts:30-105 | Ageing + top-20; no by-asset-class / MoM trend |
| FIN-ARR-004 | Must | Met | ledger.service.ts:260-264 | Write-off needs finance_mgr + audit |
| FIN-STMT-001 | Must | Unmet | fin.statement table only | No statement generation/PDF/portal |
| FIN-STMT-002 | Should | Unmet | — | No 13-week cashflow forecast |
| FIN-STMT-003 | Must | Unmet | — | No consolidated group revenue dashboard |
| FIN-ACC-001 | Must | Met | accounting.service.ts:listAccounts/createAccount | COA CRUD by account_class + asset_class |
| FIN-ACC-002 | Must | Met | accounting.service.ts:postJournalTx; ledger.service.ts:118-131,290-309; financial.service.ts:230-248 | Balanced double-entry auto-posted in real time on payment, invoice issue, adjustment/write-off (contractor cert awaits Module E) |
| FIN-ACC-003 | Must | Met | accounting.service.ts:profitAndLoss | P&L per asset class + consolidated (rev/COGS/margin/opex/EBITDA) |
| FIN-ACC-004 | Should | Met | accounting.service.ts:balanceSheet | Assets/liabilities/equity + retained earnings, equation checked |
| FIN-ACC-005 | Should | Unmet | — | No cash flow statement |
| FIN-ACC-006 | Must | Met | accounting.service.ts:reverseJournal | Counter-entry only, no delete, double-reversal blocked, reversed_by linked |
| FIN-ACC-007 | Should | Met | accounting.service.ts:closePeriod; postJournalTx period guard | Period lock + trial balance; locked/closed periods refuse posting |
| FIN-ACC-008 | Should | Met | accounting.service.ts:exportJournalsCsv | Per-line CSV journal export |
| FIN-ACC-009 | Must | Met | accounting.controller.ts:trial-balance/pnl/balance-sheet | Management accounts on demand for any period, filterable by asset class |
| FIN-ACC-010 | Must | Unmet | — | Budget-vs-actuals needs Module E budgets (no app code) |

### Module B — Sales Engine  (8 Met / 14 Partial / 9 Unmet; Musts 7/19)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| STND-INV-001 | Must | Met | schema.sql:493-511 | plot_id PK + UNIQUE(dev, plot_number) |
| STND-INV-002 | Must | Partial | schema.sql:492-511; sales.service.ts:70-100 | utilities column not surfaced |
| STND-INV-003 | Must | Met | schema.sql:75,502 | plot_status enum, single status col |
| STND-INV-004 | Must | Met | schema.sql:529-555,616-645; allocation-lock test | advisory lock + FOR UPDATE + partial unique idx |
| STND-INV-005 | Must | Met | sales.service.ts:128-137 | non-available → 409 PLOT_NOT_AVAILABLE |
| STND-INV-006 | Must | Partial | schema.sql:616-645 | available→reserved only; no full state machine |
| STND-INV-007 | Must | Unmet | — | no no-delete-with-history / withhold-reason |
| STND-INV-008 | Should | Met | MapView.tsx:109-232 | interactive map w/ live status colours |
| STND-LEAD-001 | Should | Partial | schema.sql:570-581 | lead table; no service/controller/UI |
| STND-LEAD-002 | Must | Partial | schema.sql:249-262 | doc table supports id docs; no upload/diaspora flow |
| STND-LEAD-003 | Must | Partial | schema.sql:279 | wallet_id col; no Payments API linking |
| STND-SALE-001 | Must | Partial | sales.controller.ts:23 | reserve w/ expiry works; no auto-return-on-expiry |
| STND-SALE-002 | Must | Unmet | — | no reservation→sale conversion code |
| STND-SALE-003 | Must | Unmet | — | no offer letter/agreement/schedule generation |
| STND-SALE-004 | Must | Unmet | — | no cancellation/rescission + reversal |
| STND-SALE-005 | Must | Partial | schema.sql:1211-1214 | DB audit triggers; no reason/registrar-override |
| STND-TITLE-001 | Must | Unmet | — | title_event table; no tracking code |
| STND-TITLE-002 | Should | Unmet | — | no per-stage document gating |
| STND-TITLE-003 | Should | Unmet | — | no transfer-without-title guard |
| STND-TITLE-004 | Should | Unmet | — | no title-pipeline/overdue report |
| GIS-001 | Must | Met | MapView.tsx:107-219 | per-dev map, colour-coded by live status |
| GIS-002 | Must | Met | MapView.tsx:27-47,210-214 | plot popup + in-map Reserve |
| GIS-003 | Must | Met | schema.sql:504-505 | gps stored, served, positioned |
| GIS-004 | Should | Partial | schema.sql:506; MapView.tsx:53-92 | polygons rendered; no survey/KML/CAD ingest |
| GIS-005 | Should | Partial | schema.sql:598-608 | infra_feature table; not rendered |
| GIS-006 | Should | Partial | schema.sql:474,484 | boundary geom cols; not layered |
| GIS-007 | Should | Partial | MapView.tsx:15,153-163 | status filter; no price/size filters |
| GIS-008 | Should | Unmet | — | no offline tile caching/sync |
| GIS-009 | Must | Met | auth.module.ts:24-25; sales.controller.ts:12 | endpoints gated by read_sales |
| STND-AGENT-001 | Should | Partial | schema.sql:519-595 | agent_id + commission table; no computation |
| STND-AGENT-002 | Should | Partial | schema.sql:590-592 | milestone-earned cols; no earning logic |
| STND-AGENT-003 | Should | Unmet | sales.service.ts:27-101 | no agent-own-pipeline scoping |

### Module C — Leasing & Tenancy  (7 Met / 2 Partial / 2 Unmet; Musts 6/8)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| LEASE-001 | Must | Met | lease.service.ts:148-201 | createLease persists all lease terms |
| LEASE-002 | Must | Unmet | — | no lease template table / auto-populate |
| LEASE-003 | Must | Met | lease.service.ts:45-52,210-277 | full state transition map enforced |
| LEASE-004 | Must | Met | lease.service.ts:907-984 | renewal alerts at configurable notice days |
| LEASE-005 | Should | Met | lease.service.ts:879-880 | market_rate + underRented flag |
| LEASE-INV-001 | Must | Met | lease.service.ts:345-454 | rental account + rent invoices + createBill |
| LEASE-INV-002 | Must | Met | arrears.service.ts:45-150 | escalation ladder runs over rental accounts |
| LEASE-INV-003 | Must | Met | lease.service.ts:565-702 | rent roll: billed/collected/arrears/vacancy |
| LEASE-MAINT-001 | Must | Partial | schema.sql:688-704 | table + read history; no tenant create endpoint |
| LEASE-MAINT-002 | Should | Unmet | — | no routing/SLA/auto-update logic |
| LEASE-MAINT-003 | Should | Partial | lease.service.ts:836-856 | history searchable; no contractor work-order link |

### Module D — Utilities  (9 Met / 9 Partial / 15 Unmet; Musts 9/17)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| UTIL-TKN-001 | Must | Met | utility.service.ts:223,264 | Vend via wallet callback + direct, channel enum |
| UTIL-TKN-002 | Must | Partial | utility.service.ts:322 | token returned; no SMS/notification on vend |
| UTIL-TKN-003 | Must | Partial | meter-adapter.ts:41,67 | pluggable registry; only mock wired |
| UTIL-TKN-004 | Must | Met | utility.service.ts:332-356 | token_vend records all fields |
| UTIL-TKN-005 | Must | Met | utility.service.ts:278,381; vend-idempotency test | unique idx + guard, concurrency-proven |
| UTIL-TKN-006 | Must | Partial | utility.service.ts:664-698 | flat tariff; tiered/stepped fall back to flat |
| UTIL-TKN-007 | Should | Unmet | — | no token/receipt reprint |
| UTIL-TKN-008 | Should | Partial | utility.service.ts:268 | token_kind/reason; no authorised-staff restriction |
| UTIL-TKN-009 | Should | Unmet | — | no vending dashboard |
| UTIL-METER-001 | Must | Met | utility.service.ts:87 | meter registered w/ serial/type/adapter/tariff |
| UTIL-METER-002 | Must | Met | utility.service.ts:96-110 | links plot_id + premises_id |
| UTIL-METER-003 | Must | Partial | utility.service.ts:157 | tariff structure stored; only flat applied |
| UTIL-METER-004 | Should | Partial | utility.service.ts:359-368 | balance from vend; no vendor-API feed |
| UTIL-METER-005 | Should | Unmet | — | no low/zero-credit alerts |
| UTIL-POST-001 | Should | Unmet | meter_read table only | no read-entry code |
| UTIL-POST-002 | Should | Unmet | — | no postpaid consumption/invoice |
| UTIL-POST-003 | Should | Unmet | — | no estimated-read/reconcile |
| UTIL-LTE-001 | Must | Partial | utility.service.ts:181 | products creatable; no catalogue/storefront |
| UTIL-LTE-002 | Must | Met | utility.service.ts:529-566 | calls EOS provision, records ref (stub client) |
| UTIL-LTE-003 | Must | Met | utility.service.ts:460,500,569 | idempotent; failed stays retryable via /retry |
| UTIL-LTE-004 | Must | Met | utility.service.ts:201-214 | subscriber links customer + plot/premises |
| UTIL-LTE-005 | Should | Partial | easymobile.client.ts:32 | price configurable; API endpoint stubbed |
| UTIL-GRID-001 | Must | Met | utility.service.ts:587-611 | grid_exchange records export/import/rate/amount |
| UTIL-GRID-002 | Must | Unmet | — | no net-position computation/report |
| UTIL-GRID-003 | Should | Unmet | generation_log table only | no recording code |
| UTIL-GRID-004 | Must | Unmet | — | no posting of settlement to accounting |
| UTIL-GRID-005 | Must | Met | utility.service.ts:264-368; spec:237 | grid never touches customer row (test-asserted) |
| UTIL-FAULT-001 | Must | Unmet | util.fault table only | no fault-logging code |
| UTIL-FAULT-002 | Should | Unmet | — | no routing/SLA/status code |
| UTIL-FAULT-003 | Should | Unmet | — | no outage/resolution reporting |
| UTIL-ASSET-001 | Must | Unmet | util.asset table only | no asset-registration code |
| UTIL-ASSET-002 | Should | Unmet | maintenance_schedule table only | no PM/work-order generation |
| UTIL-ASSET-003 | Should | Unmet | — | no maintenance-history linkage |

### Module E — Development & Project Control  (0 Met / 16 Partial / 13 Unmet; Musts 0/19)

> **All "Partial" here means schema DDL exists with ZERO application logic** — no
> service, controller, API, computation, workflow, or UI. Functionally unbuilt.

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| DEV-PROJ-001 | Must | Partial | schema.sql:938,950,964 | project/budget tables; no app code |
| DEV-PROJ-002 | Should | Partial | schema.sql:940 | project→development FK; no velocity logic |
| DEV-PROJ-003 | Must | Partial | schema.sql:950-961 | budget versioning cols; no enforcement |
| DEV-PROJ-004 | Must | Unmet | schema.sql:964 | no block-cost-without-approved-line rule |
| DEV-GATE-001 | Must | Partial | schema.sql:975-980 | milestone gate cols; no release logic |
| DEV-GATE-002 | Must | Partial | schema.sql:981,985 | evidence/approval cols; no workflow |
| DEV-GATE-003 | Must | Unmet | — | no funding/spend/forecast view |
| DEV-COST-001 | Must | Partial | schema.sql:969-970 | committed/actual cols; no posting logic |
| DEV-COST-002 | Must | Unmet | — | no variance / cost-to-complete |
| DEV-COST-003 | Must | Unmet | — | no breach-forecast alerting |
| DEV-PROC-001 | Must | Partial | onboarding.service.ts:73; schema:992 | contractor insert; no perf-score/register API |
| DEV-PROC-002 | Must | Partial | schema.sql:1005-1019 | boq tables; no code/budget link |
| DEV-PROC-003 | Must | Partial | schema.sql:1024-1066 | rfq/contract/po tables; no workflow |
| DEV-PROC-004 | Must | Unmet | schema.sql:1057-1065 | no PO-rate carry / variance approval |
| DEV-PROC-005 | Must | Partial | schema.sql:1070-1077 | GRN table; no GRN-before-cert enforcement |
| DEV-PROC-006 | Must | Partial | schema.sql:1080-1093 | payment_certificate; no QS/PM workflow |
| DEV-PROC-007 | Must | Unmet | schema.sql:1089 | payable_ref col; no payable creation |
| DEV-PROC-008 | Must | Partial | schema.sql:1051,1086 | retention cols; no tracking/release |
| DEV-PROC-009 | Should | Unmet | — | no back-charge logic |
| DEV-PROC-010 | Must | Partial | schema.sql:1098-1106 | variation table; no budget auto-update |
| DEV-PROC-011 | Must | Unmet | — | no procurement dashboard |
| DEV-RES-001 | Should | Partial | schema.sql:1110-1116 | resource table; no code |
| DEV-RES-002 | Should | Partial | schema.sql:1118-1127 | allocation table; no code |
| DEV-RES-003 | Should | Partial | schema.sql:1125-1126 | actual cols; no daily-diary capture |
| DEV-RES-004 | Should | Unmet | — | no labour-cost feed |
| DEV-RES-005 | Could | Unmet | — | no plant utilisation reports |
| DEV-SCHED-001 | Must | Partial | schema.sql:982-984 | milestone dates; no slippage auto-flag |
| DEV-SCHED-002 | Should | Unmet | — | no infra-layer table in dev module |
| DEV-SCHED-003 | Should | Unmet | — | no handover workflow to Module D |

### Module F — Document & Information Layer  (0 Met / 2 Partial / 3 Unmet; Musts 0/5)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| DOC-001 | Must | Partial | schema.sql:249; onboarding.service.ts:118 | versioned doc table; only customer entity wired |
| DOC-002 | Must | Unmet | — | access_tag written but never enforced |
| DOC-003 | Must | Unmet | — | no template-based generation/rendering |
| DOC-004 | Must | Partial | onboarding.service.ts:108-116 | version auto-increment; no immutability enforcement |
| DOC-005 | Must | Unmet | — | no object store; storage_ref is free text; no retention |

### Module G — Customer & Staff Portals  (0 Met / 3 Partial / 13 Unmet; Musts 0/10)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| PORT-BUYER-001 | Must | Unmet | — | no buyer portal; web app is staff-only |
| PORT-BUYER-002 | Must | Unmet | — | no buyer payment initiation |
| PORT-BUYER-003 | Must | Unmet | — | no buyer statement/agreement download |
| PORT-BUYER-004 | Should | Unmet | — | no buyer title/cession view |
| PORT-BUYER-005 | Must | Unmet | — | no diaspora portal/remittance |
| PORT-TENANT-001 | Must | Unmet | — | no tenant portal |
| PORT-TENANT-002 | Must | Unmet | — | tenants can't log maintenance |
| PORT-TENANT-003 | Should | Unmet | — | no tenant lease/statement download |
| PORT-CONT-001 | Should | Unmet | — | no contractor portal/work-order UI |
| PORT-CONT-002 | Should | Unmet | — | no completion-report/photo upload |
| PORT-CONT-003 | Should | Unmet | — | no payment-certificate view |
| PORT-STAFF-001 | Must | Partial | FinanceDashboard.tsx:26-149 | ageing + top debtors; no cashflow/reconciliation |
| PORT-STAFF-002 | Must | Partial | PlotInventory.tsx:20; ReservationFlow.tsx | inventory + reservations; no velocity/pipeline |
| PORT-STAFF-003 | Must | Partial | LeasingDashboard.tsx:325-357 | maintenance read-only; no ops dashboard |
| PORT-STAFF-004 | Must | Unmet | — | no development dashboard |
| PORT-STAFF-005 | Must | Unmet | — | no executive/consolidated dashboard |

### Module H — Payments API Integration  (1 Met / 5 Partial / 2 Unmet; Musts 1/6)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| PAY-API-001 | Must | Partial | payments.service.ts:44-67 | writes pay.bill; outbound POST /bills is TODO |
| PAY-API-002 | Must | Unmet | schema.sql:1143 | bill never pushed; no channel exposure |
| PAY-API-003 | Must | Partial | payments.service.ts:73-228 | callback updates ledger/arrears; no customer confirmation |
| PAY-API-004 | Must | Partial | payments.service.ts:59-64 | invoice_id stored; account/wallet not transmitted |
| PAY-API-005 | Must | Met | payments.service.ts:96-111,191-209 | unique idx + ledger backstop; no double-post |
| PAY-API-006 | Must | Unmet | — | no retry/backoff/scheduler/Finance alert |
| PAY-API-007 | Should | Partial | customer.service.ts:160-181 | stores wallet_id; no POST /wallets to platform |
| PAY-API-008 | Must | Partial | payments.service.ts:35-42 | **HMAC computed but never enforced**; api_log never written |

### Module Z — Shared Platform Services  (7 Met / 4 Partial / 2 Unmet; Musts 6/7)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| PLAT-AUTH-001 | Must | Met | roles.guard.ts:45-52; roles.ts:7-21 | 12 roles + global RBAC guard |
| PLAT-AUTH-002 | Must | Met | roles.guard.ts:45-52; roles.ts:33-70 | per-route grants + cross-module read groups |
| PLAT-AUTH-003 | Must | Met | auth.service.ts:115-185; auth.controller.ts:26-39; totp.util.ts | TOTP 2FA (RFC 6238): enroll→verify steps up mfa:true; @Mfa() gates on claim |
| PLAT-AUTH-004 | Should | Unmet | — | no SSO/SAML/OIDC; local scrypt+HS256 only |
| PLAT-AUTH-005 | Must | Met | approval.service.ts; approval.controller.ts; db/migrations/004_doa_dual_auth.sql; ledger.service.ts (postManualAdjustment) | DoA matrix (core.authority_rule) now drives an initiate→approve/reject→execute workflow; distinct second signatory enforced; ledger adjustments route through it |
| PLAT-AUDIT-001 | Must | Met | schema.sql:204-232; prisma.service.ts:24-39 | capture_audit trigger + actor context |
| PLAT-AUDIT-002 | Must | Met | schema.sql:178-200 | append-only/immutable (UPDATE/DELETE blocked) |
| PLAT-AUDIT-003 | Must | Partial | roles.ts:49,53 | audit roles exist; no audit-log search/export endpoint |
| PLAT-NOTIF-001 | Should | Partial | notifications.service.ts; notifications.module.ts | SMS+USSD delivery (Africa's Talking) + 13 event templates + async queue; email/WhatsApp absent, domain events not yet auto-wired |
| PLAT-NOTIF-002 | Should | Met | notifications.service.ts (recordNotification/recordDeliveryResult/recordDeliveryReport); notifications.controller.ts:DLR | writes core.notification; status queued→sent/failed via processor + AT delivery-report webhook |
| PLAT-RPT-001 | Must | Partial | reporting.service.ts:29-105 | only ageing + top debtors; most KPIs absent |
| PLAT-RPT-002 | Should | Partial | web/App.tsx; web/roles.ts | role-gated tabs hardcoded; not configurable |
| PLAT-RPT-003 | Should | Unmet | — | no CSV/PDF export |

### Non-Functional Requirements  (0 Met / 7 Partial / 4 Unmet; Musts 0/7)

| ID | Priority | Status | Evidence | Note |
|---|---|---|---|---|
| NFR-SEC-001 | Must | Unmet | main.ts:5-7 | no TLS/helmet config; PII/financial not encrypted at rest |
| NFR-SEC-002 | Must | Unmet | — | no ZDPA features (consent/rights/breach/retention) |
| NFR-SEC-003 | Must | Partial | token.service.ts:16-26 | env secrets, prod fails closed; dev fallback in source |
| NFR-CONN-001 | Must | Partial | vend-idempotency test; schema:361,614 | server-side idempotency; no client offline/sync layer |
| NFR-AVAIL-001 | Should | Unmet | — | deployment concern; no HA/health-check |
| NFR-PERF-001 | Should | Partial | schema.sql:289-360 | hot-path indexes; no load test/caching |
| NFR-SCALE-001 | Must | Partial | schema.sql indexes/gist/trgm | plausible but unbenchmarked; no audit partitioning |
| NFR-BACKUP-001 | Must | Unmet | docker-compose.yml | no backup automation/RPO/RTO/residency |
| NFR-MAINT-001 | Must | Partial | README.md; SRS comments | strong README; no ADR/OpenAPI/runbook |
| NFR-USAB-001 | Should | Partial | web/index.html:5 | viewport meta; no responsive framework/mobile test |
| NFR-AUDIT-001 | Must | Partial | schema.sql:178-200 | immutable audit log; no 7-yr retention/archival policy |

---

## 4. Recommended next build

**Done since the original scorecard** (Phase 1 revenue spine now complete):
1. ✅ Payment-callback HMAC signature enforced (PAY-API-008).
2. ✅ Module B reservation→sale workflow, agreement, cancellation (STND-SALE-002/003/004/005).
3. ✅ Module H outbound bill push to the Payments Platform (PAY-API-001/002/004).
4. ✅ Module A accounting layer (FIN-ACC-001..009): real-time double-entry posting,
   reversal, trial balance, P&L per asset class, balance sheet, period close, CSV export.
5. ✅ MFA challenge (PLAT-AUTH-003): real TOTP second factor (RFC 6238) with
   enroll/verify step-up, replacing the old passive `mfa` flag.
6. ✅ DoA-rule-driven dual-auth (PLAT-AUTH-005): `core.authority_rule`-driven
   initiate→approve/reject→execute workflow; ledger adjustments consolidated onto it.
7. ✅ Notifications delivery (PLAT-NOTIF-002): SMS/USSD via Africa's Talking with
   async queue + delivery-status logging to `core.notification`.

**Next candidates:**
1. **Customer portals (Module G)** — buyer/tenant self-service (0/10 Musts); the
   biggest remaining customer-experience gap now that the back office is solid.
2. **Read-based utility billing (FIN-UTIL-001..003, UTIL-POST)** — closes the
   postpaid half of Module D (prepaid vending already works).
3. **Accounting tail** — cash flow statement (FIN-ACC-005) and budget-vs-actuals
   (FIN-ACC-010), the latter once Module E project budgets have application code.
4. **Notifications event-wiring + email channel (PLAT-NOTIF-001)** — trigger the
   templates from payments/arrears/onboarding events and add an email channel.
