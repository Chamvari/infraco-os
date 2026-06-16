# Land Fortune Holdings — InfraCo OS
## Software Requirements Specification (v2.0)

> Real Estate • Agro-Estate • Private Utilities (Energy/Water/LTE) • Infrastructure • FinTech
> Draft for EOS Engineering • Confidential

---

# Document Control

This is Version 2.0 of the InfraCo OS SRS, substantially rescoped from Version 1.0 based on the full product-definition discussion. Version 1.0 addressed only stand-sales registry and development-works management. This version covers the complete InfraCo OS: real estate (residential and agro), utilities (solar, water, fibre), infrastructure operations, a commercial leasing module, a customer portal layer, a development and project control module, and API integration to a standalone payments and remittance platform.

| **Field**         | **Value**            | **Detail**                                                        |
|-------------------|----------------------|-------------------------------------------------------------------|
| Document owner    | Group CEO / EOS      | Petros Muchato (LFH) • EOS Engineering lead                       |
| Primary audience  | EOS Engineering      | Architecture, development, QA — and any build-vs-buy evaluation   |
| Related documents | Strategy Workstreams | WS2 (stands/dev), WS1 (treasury), WS4 (ventures), EOS Board Paper |
| Status            | Draft for review     | EOS to review, size, and confirm build/buy decision               |

# Contents

# 1. Introduction

## 1.1 Purpose

This SRS defines what the InfraCo OS must do. It enables EOS Engineering to assess build feasibility and effort, and — if the build option is chosen — to use it as the authoritative reference for design, development, and testing.

*It is solution-agnostic: it specifies requirements, not implementation. EOS owns all architecture and technology decisions.*

## 1.2 The Product in One Statement

InfraCo OS is a unified, multi-ecosystem operations platform that manages the full lifecycle of a large-scale African land, property, and agro-estate developer — from stand sales, commercial rentals, and utility billing to infrastructure operations, project management, and compliance — integrated via API to a standalone mobile-money and remittance platform (the “Payments Platform”).

It is the first system of this type purpose-built for the African InfraCo model, where a developer simultaneously owns land, infrastructure, utilities, and payment rails.

## 1.3 What Changed from Version 1.0

| **V1.0 scope**                 | **V2.0 scope (this document)**                                        |
|--------------------------------|-----------------------------------------------------------------------|
| Stand sales registry           | Stand sales registry + agro-plot sales + diaspora onboarding          |
| Development works PM           | Development works PM + infrastructure mapping + contractor management |
| Lease module — not included    | Commercial + residential leasing with arrears management              |
| Utility billing — not included | Solar, water, fibre billing (meter-to-invoice)                        |
| Payments: SaaS / buy           | Payments: standalone platform integrated via API                      |
| Scope: 33ha residential        | Scope: 33ha mixed-use + 4,500ha agro-estate                           |
| No portals                     | Buyer, tenant, agro-owner, contractor, and staff portals              |

## 1.4 Definitions

| **Term**          | **Meaning**                                                                                                                                |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Stand             | A subdivided residential, hospitality, or business plot offered for sale                                                                   |
| Agro-plot         | A 5–10 ha agricultural plot in the 4,500 ha estate, sold primarily to diaspora buyers                                                      |
| Allocation lock   | The control that ensures a stand or agro-plot can be in only one active reservation/sale at a time; enforced at the data layer, not the UI |
| Cession           | Transfer of rights in a stand before title registration, common in Zimbabwe subdivision sales                                              |
| Stage gate        | A control point at which project or development funds are released only against verified milestones                                        |
| InfraCo model     | A business that vertically integrates land, infrastructure, utilities, and payments into one operating entity                              |
| Payments Platform | The standalone mobile-money and remittance platform (separate brand/entity) that integrates via API                                        |
| MoSCoW            | Must / Should / Could / Won’t — priority classification used for all requirements                                                          |

## 1.5 Requirement ID Scheme

Every requirement has a stable, dot-separated ID: MODULE-AREA-NNN (e.g., STND-ALLOC-003). IDs are never renumbered; deprecated items are marked \[DEPRECATED\], not deleted. EOS should reference these IDs in design documents, tickets, and test cases.

# 2. System Context & Constraints

## 2.1 The Two Developments

| **Development**    | **33ha Mixed-Use Estate**                                      | **4,500ha Agro-Industrial Estate**              |
|--------------------|----------------------------------------------------------------|-------------------------------------------------|
| Location / purpose | Kwekwe — residential smart estate                              | TBC — diaspora agro-investment                  |
| Stand / plot count | 40–600 residential + hospitality + business stands (4–800 sqm) | 600–700 agro-plots (5–10 ha each)               |
| Utilities planned  | Off-grid solar, water, fibre                                   | Irrigation, boreholes, solar mini-grids         |
| Primary buyers     | Local + diaspora residential buyers                            | Diaspora investors (UK, SA, AU, USA, EU)        |
| Revenue model      | Stand sales + rentals + utility billing                        | Plot sales + long-term leases + utility billing |

## 2.2 Operating Environment

- **Connectivity:** must tolerate low or intermittent bandwidth; sales, site, and field users will be on mobile. Defined functions must work offline with reliable later sync.

- **Devices:** responsive web for desktop and mobile as minimum; native mobile app is a Should.

- **Currency:** USD primary; ZiG secondary; diaspora remittances in originating currency converted at point of settlement.

- **Jurisdiction:** Zimbabwe — Zimbabwe Data Protection Act, Deeds Registries Act (title/cession), RTCP Act, EMA (EIA), ZINWA (water), ZESA/ZETDC, POTRAZ, and RBZ payment-systems rules all apply.

- **Hosting:** EOS to decide cloud vs. on-premise; data residency and backup requirements are in Section 9.

## 2.3 Scope Clarification — Three Critical In-Scope Additions

The following three capabilities were initially considered out of scope. Based on the full product-definition review they are now explicitly IN SCOPE. Removing them from the system would leave critical operational gaps that cannot be closed by integration alone.

| **Capability**                                                     | **Why it must be built into InfraCo OS**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|--------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Full Accounting & General Ledger (Module I)                        | LFH currently has no proper accounting system. Cash collected from InfraCo and stand sales is unaccounted. With multiple unaudited revenue streams, cross-subsidised entities, and a related-party payments platform, the group cannot rely on an external accounting package alone. The OS must contain its own chart of accounts, journal engine, trial balance, and financial statements so that Finance, auditors, and ZIMRA have a single, auditable source of truth.                                                             |
| GIS / Interactive Plot Map (Module J)                              | Managing 600–700 agro-plots across 4,500 ha and 40–600 stands on the 33 ha estate is impossible without a spatial layer. Buyers — especially diaspora buyers making decisions remotely — must be able to see their plot on a map, understand its location relative to roads, water, and solar infrastructure, and select it visually. The allocation lock must be enforced on the map: a sold plot must be visually unavailable. This is a sales and trust requirement, not a nice-to-have.                                            |
| Construction ERP — Full Procurement & Resource Planning (Module K) | The 33 ha and 4,500 ha developments are city-scale programmes. Running them with only milestone tracking and budget variance (the original Module E) leaves procurement, subcontractor scheduling, Bill of Quantities management, material procurement, and resource allocation uncontrolled — the exact conditions that cause overspend. A full construction ERP layer is required so that every cost is committed before it is incurred, every subcontract is managed, and every BOQ line is tracked from estimate to final account. |

## 2.4 What the System Is NOT (Remaining Exclusions)

- The Payments Platform itself — InfraCo OS integrates to it via API. It does not issue wallets, process USSD sessions, or maintain agent float.

- An HR / payroll system — staff management and payroll are out of scope.

- A property valuation tool — market-value appraisals and investment analytics are out of scope for v1.

## 2.5 Integration Landscape

| **System**                       | **Integration requirement**                                                                                                                                                                                    |
|----------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Payments Platform (standalone)   | Bidirectional API: OS creates bills → platform exposes to USSD/App/QR/agents; platform sends payment callbacks → OS updates ledger (Module H).                                                                 |
| ZIMRA (tax authority)            | VAT and withholding-tax reporting feeds from Module I (Accounting); format per ZIMRA e-tax requirements.                                                                                                       |
| Deeds / title registry           | Document reference tracking; no live API assumed for v1 — manual status updates with document attachments (Module F).                                                                                          |
| Smart meters (power, water, gas) | Prepaid token vending via a pluggable meter-adapter (STS-compliant token generation, or a meter vendor’s token API). Optional read/balance feed (REST or MQTT) where the meter supports it. See Module D §7.1. |
| Easy Mobile / EOS (private LTE)  | Partner provisioning API: InfraCo OS sells Easy Mobile bundles/subscriptions through its storefront and calls the EOS platform to activate them on the subscriber line (Module D §7.5).                        |
| ZESA (grid net-metering)         | Wholesale reverse-billing relationship: solar export credits net off backup draw. Recorded for settlement; never exposed to customers (Module D §7.6).                                                         |
| SMS / email / WhatsApp           | Outbound notifications from Module Z for invoices, reminders, alerts, approvals.                                                                                                                               |
| Document / object storage        | S3-compatible object store with versioning and access control (Module F).                                                                                                                                      |
| Identity provider (IdP)          | SSO where available; MFA for privileged roles in any case (Module Z).                                                                                                                                          |
| GIS tile provider                | Background map tiles (e.g., OpenStreetMap or commercial) for Module J interactive plot map.                                                                                                                    |

# 3. System Architecture (Indicative)

Architecture is EOS’s decision. The following is indicative to frame requirements and integrations, not prescriptive.

## 3.1 Module Map

| **Module**                        | **Covers**                                                                                                                          |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| A — Financial Core                | Unified ledger, instalment engine, rental invoicing, utility billing (solar/water/fibre), arrears, statements, cashflow forecasting |
| B — Sales Engine                  | Lead management, stand and agro-plot sales, diaspora onboarding, payment plans, title/cession tracking, agent commissions           |
| C — Leasing & Tenancy             | Commercial and residential leases, automated invoicing, arrears escalation, maintenance ticketing                                   |
| D — Utilities & Infrastructure    | Meter reads, utility billing, outage/fault management, asset lifecycle, maintenance scheduling                                      |
| E — Development & Project Control | Project milestones, stage-gate funding, contractor and procurement management, budget vs. actual, infrastructure mapping            |
| F — Document & Information Layer  | Buyer/tenant/plot/project/permit file store; document generation; single source of truth                                            |
| G — Customer & Staff Portals      | Buyer, agro-owner, tenant, contractor, and staff portals with self-service                                                          |
| H — Payments API Integration      | Bill creation, payment callbacks, reconciliation, wallet linking; all via the Payments Platform API                                 |
| Z — Shared Platform Services      | Identity & RBAC, audit trail, notifications, reporting & dashboards, search                                                         |

## 3.2 Architectural Principles

- **Modular boundaries:** each module is a bounded context over shared platform services (Z); modules can be delivered or replaced independently.

- **Single allocation authority:** the stand/plot inventory and its status transitions are owned by one service; all reservations and sales flow through it. This is what enforces the allocation lock.

- **Payments integration layer:** Module H owns all interaction with the Payments Platform; no other module calls the payments API directly.

- **Audit by design:** an append-only log captures every state change with actor, timestamp, and before/after values. It is tamper-evident and accessible to Internal Audit.

- **API-first:** all modules expose REST APIs so portals, external systems, and the Payments Platform can integrate cleanly.

## 3.3 Phase Delivery Order

Modules are delivered in the following order, matching the business priority (revenue → operations → customer experience → project control):

| **Phase** | **Modules**              | **Business priority addressed**                                    |
|-----------|--------------------------|--------------------------------------------------------------------|
| 1         | A, B (core), H, Z (core) | Fix revenue leakage: instalments, billing, payments integration    |
| 2         | B (full), C, D           | Fix operational chaos: full sales, leasing, utilities              |
| 3         | G (portals)              | Fix customer experience: buyer, tenant, agro, contractor portals   |
| 4         | E, F (full)              | Fix development control: projects, contractors, budgets, documents |

# 4. Module A — Financial Core

The financial core is the ‘beating heart’ of InfraCo OS. It manages every money flow across all asset classes: stand instalments, agro-plot instalments, rentals, utility billing, contractor payments, and project budgets. Without this module, nothing else has a revenue foundation.

## 4.1 Customer & Account Registry

| **ID**       | **Requirement**                                                                                                                                                                                                          | **Priority** |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-CUST-001 | Every customer (buyer, tenant, agro-owner) shall have a unique system identifier, linked to: identity documents, contact details, KYC status, linked wallet ID (from the Payments Platform API), and all their accounts. | Must         |
| FIN-CUST-002 | The system shall maintain separate account types per customer: stand purchase, agro-plot purchase, rental, utility (solar/water/fibre). A customer may hold multiple accounts across types.                              | Must         |
| FIN-CUST-003 | Personal data shall be captured, stored, and processed in compliance with the Zimbabwe Data Protection Act: lawful basis, purpose limitation, data subject rights, and retention schedules.                              | Must         |
| FIN-CUST-004 | Duplicate-customer detection shall warn on likely matches at point of capture (name + ID number / phone).                                                                                                                | Should       |

## 4.1a Onboarding (Buyers, Tenants, Home-owners & Contractors)

Onboarding is the front door to the system. Every party transacting with LFH is onboarded once, KYC-verified, optionally given a Payments Platform wallet, and thereafter reused across sales, leases, utilities, and payments. There shall be a guided onboarding workflow (a screen, not just an API) for each party type.

| **ID**  | **Requirement**                                                                                                                                                                                                                         | **Priority** |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| ONB-001 | The system shall provide a guided onboarding workflow that captures, per party: full name/entity name, ID/passport or company registration, contacts, address, country (for diaspora), and DPA consent, and sets KYC status to pending. | Must         |
| ONB-002 | Onboarding shall support document upload (ID/passport, proof of address, company registration, tax clearance) stored against the party record in the Document layer.                                                                    | Must         |
| ONB-003 | On completion, the system shall optionally create or link a Payments Platform wallet for the party (via Module H), so they can transact immediately.                                                                                    | Must         |
| ONB-004 | KYC verification shall be a reviewable step: a staff role moves a party from pending to verified or rejected, with reason and audit entry. Unverified parties may be restricted from completing a purchase or lease per configuration.  | Must         |
| ONB-005 | Buyer/home-owner onboarding shall flow directly into the sales workflow (a verified buyer can be attached to a reservation/sale without re-keying).                                                                                     | Must         |
| ONB-006 | Tenant onboarding shall flow into lease creation (Module C).                                                                                                                                                                            | Must         |
| ONB-007 | Contractor onboarding shall capture company registration, tax clearance, category/trade, and prequalification status, and feed the contractor register used by procurement (Module E).                                                  | Must         |
| ONB-008 | Diaspora onboarding shall be completable entirely online (no in-person step), including document upload and wallet linking, so a diaspora buyer abroad can onboard and pay.                                                             | Must         |

## 4.2 Instalment Engine

| **ID**       | **Requirement**                                                                                                                                                  | **Priority** |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-INST-001 | The system shall generate instalment schedules for stand sales and agro-plot sales: frequency (monthly/quarterly), amounts, due dates, deposit, and total price. | Must         |
| FIN-INST-002 | Instalment schedules shall support both equal-payment and balloon-payment structures.                                                                            | Should       |
| FIN-INST-003 | On each payment due date, the system shall auto-raise an instalment invoice and send it to the Payments Platform via API (Module H), and notify the customer.    | Must         |
| FIN-INST-004 | The system shall compute, per account: amount paid, balance outstanding, arrears (days and value), and next due date.                                            | Must         |
| FIN-INST-005 | Multi-currency support: USD primary; ZiG and diaspora-remittance currencies recorded at transaction level with settlement currency and FX rate.                  | Must         |

## 4.3 Rental Invoicing

| **ID**       | **Requirement**                                                                                                                          | **Priority** |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-RENT-001 | The system shall auto-generate rental invoices on a configured schedule (monthly) for each active lease, linked to the tenant’s account. | Must         |
| FIN-RENT-002 | Escalation clauses (percentage or CPI-linked) shall be applied automatically at the configured anniversary.                              | Should       |
| FIN-RENT-003 | Utility charges (solar, water, fibre) shall be addable to the rental invoice or raised as separate invoices per configuration.           | Must         |
| FIN-RENT-004 | The system shall produce a per-tenant ledger and statement on demand.                                                                    | Must         |

## 4.4 Utility Billing (Solar, Water, Fibre)

| **ID**       | **Requirement**                                                                                                               | **Priority** |
|--------------|-------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-UTIL-001 | The system shall record meter reads (manual entry or feed from smart meter) per customer per utility type per billing period. | Must         |
| FIN-UTIL-002 | The system shall compute consumption and apply the configured tariff to produce a utility invoice.                            | Must         |
| FIN-UTIL-003 | Utility invoices shall be raised automatically on the configured billing cycle and sent to the Payments Platform.             | Must         |
| FIN-UTIL-004 | The system shall track solar-plant energy allocation per estate and alert when capacity thresholds are approached.            | Should       |
| FIN-UTIL-005 | Unbilled utilities (no meter read received) shall be flagged for Operations before bill generation.                           | Should       |

## 4.5 Unified Ledger & Reconciliation

| **ID**      | **Requirement**                                                                                                                                          | **Priority** |
|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-LED-001 | All financial transactions across all account types shall post to a unified customer ledger keyed by customer ID, account ID, and transaction reference. | Must         |
| FIN-LED-002 | Payment callbacks from the Payments Platform (Module H) shall auto-post to the ledger, update invoice status, and recalculate arrears in real time.      | Must         |
| FIN-LED-003 | Unmatched payments (no invoice reference) shall be queued in a suspense account visible to Finance for manual allocation.                                | Must         |
| FIN-LED-004 | The ledger shall reconcile to the connected accounting system; discrepancies shall be flagged and reportable.                                            | Should       |
| FIN-LED-005 | Manual ledger adjustments (credit notes, write-offs) shall require dual authorisation and full audit entry.                                              | Must         |

## 4.6 Arrears Management

| **ID**      | **Requirement**                                                                                                                                                        | **Priority** |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-ARR-001 | The system shall auto-classify accounts by arrears risk: current, 1–30 days, 31–60, 61–90, 90+ days.                                                                   | Must         |
| FIN-ARR-002 | The system shall trigger escalation actions at configured thresholds: reminder (day 7), formal notice (day 30), legal referral flag (day 90). Actions shall be logged. | Must         |
| FIN-ARR-003 | The arrears dashboard shall show: total arrears by asset class, ageing breakdown, top-20 debtors, trend vs. prior month.                                               | Must         |
| FIN-ARR-004 | The system shall never auto-write off arrears; write-offs require Finance Manager approval and audit trail.                                                            | Must         |

## 4.7 Statements & Cashflow Forecasting

| **ID**       | **Requirement**                                                                                                                                     | **Priority** |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-STMT-001 | The system shall generate per-customer statements (opening balance, invoices, payments, closing balance) in PDF and on the customer portal.         | Must         |
| FIN-STMT-002 | The system shall produce a 13-week rolling cashflow forecast per asset class based on instalment schedules, rent rolls, and utility billing cycles. | Should       |
| FIN-STMT-003 | A consolidated group revenue dashboard shall show: collected vs. billed by asset class, arrears, and month-on-month trend.                          | Must         |

## 4.8 Accounting Layer (Chart of Accounts, P&L, Balance Sheet)

The InfraCo OS includes its own accounting layer, making it the system of record for the group’s property and infrastructure financials. It does not require an external accounting system to operate, though it can post summarised journals to one for group consolidation.

| **ID**      | **Requirement**                                                                                                                                                                                                         | **Priority** |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| FIN-ACC-001 | The system shall maintain a configurable Chart of Accounts structured by asset class (residential, agro-estate, commercial, utilities, projects) and cost type (revenue, COGS, operating expense, capex, finance cost). | Must         |
| FIN-ACC-002 | Every financial transaction (invoice, payment, adjustment, write-off, contractor certificate) shall auto-post a double-entry journal to the relevant accounts in real time.                                             | Must         |
| FIN-ACC-003 | The system shall produce a monthly P&L per asset class and consolidated across the group: revenue, cost of sales, gross margin, operating expenses, EBITDA.                                                             | Must         |
| FIN-ACC-004 | The system shall produce a Balance Sheet view per entity: assets (land, infrastructure, receivables, cash), liabilities (deferred revenue, payables, retention), and equity.                                            | Should       |
| FIN-ACC-005 | The system shall produce a Cash Flow Statement (operating, investing, financing activities) on a monthly and cumulative basis.                                                                                          | Should       |
| FIN-ACC-006 | Journal entries shall be reversible only with a counter-entry; no direct deletion of posted journals is permitted. All entries carry an audit reference.                                                                | Must         |
| FIN-ACC-007 | The system shall support a financial year-end close process: locking prior periods, generating closing entries, and producing a trial balance.                                                                          | Should       |
| FIN-ACC-008 | Where an external accounting or ERP system is used for group consolidation, the system shall export summarised journals in a configurable format (CSV, API, or standard chart-of-accounts mapping).                     | Should       |
| FIN-ACC-009 | Management accounts (P&L, balance sheet, cashflow) shall be producible on demand for any period, filterable by asset class, development, or entity.                                                                     | Must         |
| FIN-ACC-010 | Budget vs. actuals reporting shall link project budgets (Module E) and operational budgets to the accounting layer for variance analysis.                                                                               | Must         |

# 5. Module B — Sales Engine (Stands & Agro-Plots)

## 5.1 Stand & Plot Inventory (Allocation Lock)

| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                                            | **Priority** |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| STND-INV-001 | Every stand and agro-plot shall have a unique, immutable system ID and a human-readable reference (development, phase, plot number).                                                                                                                                                                                       | Must         |
| STND-INV-002 | Each unit shall carry: development, phase, size/area, type, price, GPS coordinates, utility availability, and current status.                                                                                                                                                                                              | Must         |
| STND-INV-003 | A unit shall have exactly one current status at any time: Available / Reserved / Sold / Transferred / Withheld.                                                                                                                                                                                                            | Must         |
| STND-INV-004 | THE ALLOCATION LOCK: the system shall guarantee that a unit can have at most one active Reservation or Sale at any time, enforced at the data layer (transactional DB constraint), not only in the UI. Concurrent attempts to reserve the same unit shall be resolved so that at most one succeeds with no race condition. | Must         |
| STND-INV-005 | Attempting to reserve or sell a unit not in Available status shall be rejected with a clear reason, surfacing the existing record.                                                                                                                                                                                         | Must         |
| STND-INV-006 | All status transitions shall follow a defined state machine; invalid transitions shall be impossible.                                                                                                                                                                                                                      | Must         |
| STND-INV-007 | A unit shall not be deleted if it has any sale, payment, or document history; it may only be Withheld with reason.                                                                                                                                                                                                         | Must         |
| STND-INV-008 | The system shall support an interactive layout/map view of each development showing live status per unit.                                                                                                                                                                                                                  | Should       |

## 5.2 Lead Management & Diaspora Onboarding

| **ID**        | **Requirement**                                                                                                                                                            | **Priority** |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| STND-LEAD-001 | The sales engine shall capture leads with source, agent, interest (development/type/size), and contact details.                                                            | Should       |
| STND-LEAD-002 | Diaspora buyer onboarding shall support upload and storage of passport/ID, proof of address, and remittance documentation.                                                 | Must         |
| STND-LEAD-003 | The system shall link a buyer’s account to a wallet on the Payments Platform (via API), enabling diaspora buyers to pay from abroad through supported remittance channels. | Must         |

## 5.3 Reservations & Sales Workflow

| **ID**        | **Requirement**                                                                                                                                                                        | **Priority** |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| STND-SALE-001 | An agent shall be able to reserve an Available unit for a named prospect, creating a time-limited hold with configurable expiry. On expiry, the unit auto-returns to Available.        | Must         |
| STND-SALE-002 | A reservation shall be convertible to a sale on capture of buyer details, agreed price, and payment terms, subject to Registrar sign-off (configurable approval step).                 | Must         |
| STND-SALE-003 | The system shall generate: offer letter, sale agreement, and instalment schedule — from configurable templates, auto-populated with sale data.                                         | Must         |
| STND-SALE-004 | Cancellation/rescission shall require reason, return the unit to Available, preserve full history, and trigger financial reversal workflow.                                            | Must         |
| STND-SALE-005 | All state changes shall be written to the audit trail with actor, timestamp, and reason. Only the Registrar (or a logged override) may force a transition outside the normal workflow. | Must         |

## 5.4 Title & Cession Tracking

| **ID**         | **Requirement**                                                                                                                                     | **Priority** |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| STND-TITLE-001 | The system shall track title/cession progress through defined stages: Agreement → Cession prepared → Deeds lodged → Title registered → Transferred. | Must         |
| STND-TITLE-002 | Each title stage shall require upload and linking of supporting documents before progression.                                                       | Should       |
| STND-TITLE-003 | A Transferred status shall not be settable without the required title/cession evidence recorded.                                                    | Should       |
| STND-TITLE-004 | A title-pipeline report shall show units by stage and flag those overdue relative to agreed SLAs.                                                   | Should       |

## 5.5 GIS & Spatial Plot Management

Full spatial functionality is in scope. The GIS layer is the visual and geographic representation of the stand and agro-plot inventory, integrated directly with the allocation engine.

| **ID**  | **Requirement**                                                                                                                                                                                               | **Priority** |
|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| GIS-001 | The system shall display an interactive map/layout of each development phase showing every stand or agro-plot, colour-coded by live allocation status (Available / Reserved / Sold / Transferred / Withheld). | Must         |
| GIS-002 | Clicking or tapping a plot on the map shall open the plot record, enabling reservation, sale, or status inspection without leaving the map view.                                                              | Must         |
| GIS-003 | Every stand and agro-plot shall have GPS coordinates stored; these shall be used to position plots on the map and link them to field operations (utilities, maintenance, site visits).                        | Must         |
| GIS-004 | The system shall support upload and display of survey/subdivision plans (GeoJSON, KML, or CAD-derived polygon) as the base layer for the interactive map.                                                     | Should       |
| GIS-005 | An infrastructure layer shall be overlayable on the development map: roads, water mains, solar reticulation, fibre routes, boreholes, transformer positions — each linkable to an asset record in Module D.   | Should       |
| GIS-006 | Development phase boundaries shall be displayable as separate map layers, allowing a user to view the full 33ha or 4,500ha estate and zoom to individual phases.                                              | Should       |
| GIS-007 | The map shall support filter controls: show only Available plots, show only plots in a given price range, show only agro-plots of a given size band.                                                          | Should       |
| GIS-008 | The map and all spatial data shall be usable on a mobile browser in the field with limited connectivity (tiles cached; plot status syncs when online).                                                        | Should       |
| GIS-009 | Spatial data shall not be exposed to the public without explicit access control; plot coordinates and buyer information shall never appear in a public URL or unauthenticated endpoint.                       | Must         |

## 5.6 Agent & Commission Management

| **ID**         | **Requirement**                                                                                                                                                | **Priority** |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| STND-AGENT-001 | Each reservation and sale shall be attributable to an agent; commissions shall be computed per configurable rules (percentage of sale price, milestone-based). | Should       |
| STND-AGENT-002 | Commission shall be earned on confirmed milestones (e.g., deposit received, % of price paid), not on reservation alone.                                        | Should       |
| STND-AGENT-003 | Agents shall see only their own pipeline and commissions; managers see all.                                                                                    | Must         |

# 6. Module C — Leasing & Tenancy

This module addresses the existing InfraCo commercial and residential rental portfolio — the one currently suffering from multi-year arrears and undigitised leases.

## 6.1 Lease Digitisation & Management

| **ID**    | **Requirement**                                                                                                                                         | **Priority** |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| LEASE-001 | The system shall support digitisation of all existing leases: premises, tenant, start/end dates, rental amount, escalation clause, deposit, and status. | Must         |
| LEASE-002 | Standard lease templates shall be configurable and auto-populated for new leases (commercial, residential, hospitality).                                | Must         |
| LEASE-003 | The system shall track the lease lifecycle: Draft → Signed → Active → Renewal → Exit.                                                                   | Must         |
| LEASE-004 | Renewal alerts shall be sent to Operations and the tenant at configurable notice periods (e.g., 90 and 30 days before expiry).                          | Must         |
| LEASE-005 | Market-rate benchmarks shall be recordable per lease to flag under-rented properties.                                                                   | Should       |

## 6.2 Invoicing & Arrears (links to Module A)

| **ID**        | **Requirement**                                                                                                                                         | **Priority** |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| LEASE-INV-001 | On lease activation, the system shall auto-create a recurring invoice schedule (linked to FIN-RENT) and link it to the Payments Platform bill creation. | Must         |
| LEASE-INV-002 | The system shall implement the FIN-ARR arrears escalation workflow: reminder → formal notice → legal referral flag.                                     | Must         |
| LEASE-INV-003 | A rent roll report shall show: all active leases, monthly billing, collected, arrears, and vacancy, exportable for Finance.                             | Must         |

## 6.3 Maintenance & Service Requests

| **ID**          | **Requirement**                                                                                                           | **Priority** |
|-----------------|---------------------------------------------------------------------------------------------------------------------------|--------------|
| LEASE-MAINT-001 | Tenants shall be able to log maintenance requests via the portal. Requests shall have a category, priority, and status.   | Must         |
| LEASE-MAINT-002 | The system shall route requests to the responsible team with a configurable SLA and send automated updates to the tenant. | Should       |
| LEASE-MAINT-003 | Maintenance history per property shall be searchable and linkable to contractor work orders.                              | Should       |

# 7. Module D — Private Utility Operator (Energy, Water, LTE)

LFH is a private utility operator inside its developments, not merely a developer that bills for services. Every home and business on the 33ha and agro estates is a customer of LFH-owned infrastructure: a private smart grid (1.5 MW solar with large lithium storage as primary supply, ZESA grid as backup only), a private clean-water system, and a private LTE network (trading as Easy Mobile, operated by tech partner EOS). Residents buy all three — power, water, and connectivity — prepaid, from a single InfraCo wallet, through three channels: USSD, the InfraCo home-user app, and the web portal.

*There are two strictly separate billing planes. (1) The CUSTOMER plane: residents pay one simple InfraCo prepaid tariff per utility, regardless of the underlying power source. (2) The WHOLESALE plane: LFH’s settlement with ZESA (solar export credits net off backup draw) and with any other upstream supplier — the customer is never exposed to it. Keeping these planes separate is a core design rule: the meter only decrements InfraCo credit; source tracking and grid settlement live entirely in the wholesale plane (§7.6).*

*Power and water are consumption utilities fulfilled by token-to-meter. LTE is fulfilled by provisioning a bundle/subscription on the Easy Mobile platform via EOS — same storefront and wallet, different fulfilment backend (§7.5).*

## 7.1 Prepaid Vending Storefront (PRIMARY model)

| **ID**       | **Requirement**                                                                                                                                                                                                                                                                                                               | **Priority** |
|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-TKN-001 | The system shall allow a customer to buy any prepaid utility — power, water, or LTE — for their meter/line, at or above a configurable minimum, through all channels: InfraCo app, USSD, QR, web portal, and agent point of sale, paid from the InfraCo wallet via the Payments Platform.                                     | Must         |
| UTIL-TKN-002 | On confirmed payment (via Module H callback), the system shall fulfil the purchase — a meter token for power/water, or a provisioned bundle for LTE — and return the result to the customer through the channel of purchase and by SMS/notification.                                                                          | Must         |
| UTIL-TKN-003 | Power/water token generation shall use a pluggable meter-adapter interface so different meter technologies are supported without redesign: at minimum an STS-compliant adapter (20-digit token), a vendor-API adapter, and a mock adapter for testing. The active adapter shall be configurable per meter or per development. | Must         |
| UTIL-TKN-004 | Each purchase shall be recorded as a vending transaction with: customer, meter/line, utility type, amount paid, units or bundle purchased, tariff/product applied, token or provisioning reference, channel, Payments Platform transaction id, and timestamp.                                                                 | Must         |
| UTIL-TKN-005 | Vending shall be idempotent against the Payments Platform transaction id: a duplicate payment callback shall never issue two tokens or provision two bundles for the same payment.                                                                                                                                            | Must         |
| UTIL-TKN-006 | For power/water, the system shall convert the paid amount into utility units using the active InfraCo tariff (flat, tiered, or stepped, plus any fixed charge), and record the unit calculation for audit. The customer always pays the single InfraCo tariff regardless of power source.                                     | Must         |
| UTIL-TKN-007 | The system shall support token/receipt reprint and recovery: a customer or agent shall be able to retrieve the most recent token(s) or provisioning reference for a meter/line without re-charging, subject to access control.                                                                                                | Should       |
| UTIL-TKN-008 | The system shall support free/zero-rated and adjustment tokens (key-change, tamper/clear, compensation credit) issued only by authorised staff with reason and full audit entry.                                                                                                                                              | Should       |
| UTIL-TKN-009 | A vending dashboard shall show, per development and per utility: tokens/bundles issued, units sold, revenue, and channel mix, over a selectable period.                                                                                                                                                                       | Should       |

## 7.2 Meters & Customer Linkage

| **ID**         | **Requirement**                                                                                                                                                                                | **Priority** |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-METER-001 | Every meter shall be registered with: meter number/serial, utility type, technology/adapter, the customer and plot/premises it serves, the active tariff, and status (active/inactive/faulty). | Must         |
| UTIL-METER-002 | A meter shall be linkable to a stand (owner) or a premises (tenant), so prepaid purchases are attributed to the correct account and development.                                               | Must         |
| UTIL-METER-003 | The system shall support tiered, stepped, and flat tariff structures per utility type and development, with effective-dated tariff versions.                                                   | Must         |
| UTIL-METER-004 | The system shall track prepaid balance/last-token state per meter where the meter or vendor API reports it, to support customer-portal balance display and low-credit alerts.                  | Should       |
| UTIL-METER-005 | Low-credit and zero-credit alerts shall be sendable to the customer (SMS/app) where balance data is available.                                                                                 | Should       |

## 7.3 Postpaid Metering & Billing (SECONDARY model)

| **ID**        | **Requirement**                                                                                                                                  | **Priority** |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-POST-001 | For meters not on prepaid, the system shall record meter reads per customer per utility per billing period via manual entry or smart-meter feed. | Should       |
| UTIL-POST-002 | The system shall compute consumption and apply the configured tariff to produce a postpaid utility invoice (links to FIN-UTIL).                  | Should       |
| UTIL-POST-003 | Estimated reads (where actual unavailable) shall be flagged and reconciled at the next actual reading.                                           | Should       |

## 7.5 Private LTE — Easy Mobile Integration

LTE connectivity is supplied over LFH’s private network, trading as Easy Mobile, a licensed operator run by tech partner EOS. InfraCo OS does not run the mobile network; it sells Easy Mobile products through the same storefront and wallet as power and water, and provisions them via the Easy Mobile/EOS platform API — modelled like the Payments Platform integration (a partner backend).

| **ID**       | **Requirement**                                                                                                                                                                                                                                          | **Priority** |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-LTE-001 | The system shall present an Easy Mobile product catalogue (data bundles, voice bundles, and/or subscription plans — whatever EOS exposes) for purchase through the InfraCo storefront on all channels.                                                   | Must         |
| UTIL-LTE-002 | On confirmed payment, the system shall call the Easy Mobile/EOS provisioning API to activate the chosen bundle/subscription on the subscriber line (MSISDN or SIM), and record the provisioning reference.                                               | Must         |
| UTIL-LTE-003 | LTE provisioning shall be idempotent against the Payments Platform transaction id and shall reconcile success/failure from the Easy Mobile API; failed provisioning after a successful payment shall queue for retry and alert support (no silent loss). | Must         |
| UTIL-LTE-004 | A subscriber line shall be linkable to a customer and to a plot/premises so LTE purchases appear in the customer’s unified account alongside power and water.                                                                                            | Must         |
| UTIL-LTE-005 | The Easy Mobile product catalogue, pricing, and API endpoint shall be configurable, since the operator (EOS) owns the underlying products.                                                                                                               | Should       |

## 7.6 Wholesale / Grid Settlement (ZESA net-metering — customer never sees this)

The private grid is solar-primary (1.5 MW + lithium storage) with ZESA as backup. LFH exports excess solar to ZESA and earns credits under reverse billing; when backup power is drawn, those credits net it off. This is an LFH-level wholesale relationship, strictly separate from customer billing — residents always pay only the InfraCo tariff.

| **ID**        | **Requirement**                                                                                                                                                                                                 | **Priority** |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-GRID-001 | The system shall record grid exchange with ZESA: energy exported (credit earned) and energy imported as backup (credit/charge consumed), per period, with tariff/credit rates.                                  | Must         |
| UTIL-GRID-002 | The system shall maintain a running ZESA net position (export credits minus backup draw) and report the net settlement amount per period.                                                                       | Must         |
| UTIL-GRID-003 | Solar generation, battery state, and supply-source mix (solar / battery / ZESA backup) shall be recordable per period for the development, to support generation reporting and the net-metering reconciliation. | Should       |
| UTIL-GRID-004 | Grid settlement data shall post to the accounting layer (Module A) as wholesale energy cost/credit, never to a customer account.                                                                                | Must         |
| UTIL-GRID-005 | The customer billing plane and the wholesale plane shall be strictly separated: meter token value is derived solely from the InfraCo tariff and is independent of the live supply source.                       | Must         |

## 7.7 Fault & Outage Management

| **ID**         | **Requirement**                                                                                                      | **Priority** |
|----------------|----------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-FAULT-001 | Field teams and customers shall be able to log faults (power, water, LTE) with location, category, and urgency.      | Must         |
| UTIL-FAULT-002 | The system shall route faults to the responsible contractor or team with a configurable SLA and send status updates. | Should       |
| UTIL-FAULT-003 | Outage duration and resolution times shall be reportable by utility type and by estate.                              | Should       |

## 7.8 Asset Lifecycle & Preventive Maintenance

| **ID**         | **Requirement**                                                                                                                                                                           | **Priority** |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| UTIL-ASSET-001 | Solar panels, inverters, batteries, boreholes, transformers, water plant, and LTE network nodes shall be registered as assets with make/model, installation date, warranty, and location. | Must         |
| UTIL-ASSET-002 | Preventive maintenance schedules shall be configurable per asset type and generate work orders automatically.                                                                             | Should       |
| UTIL-ASSET-003 | Asset maintenance history shall be linked to the asset record and searchable.                                                                                                             | Should       |

# 8. Module E — Development & Project Control

This module controls the 33ha and 4,500ha construction and servicing programmes: budgets, milestones, stage-gated funding, contractor management, and procurement.

## 8.1 Project Setup & Phasing

| **ID**       | **Requirement**                                                                                                                            | **Priority** |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-PROJ-001 | The system shall create a development project with phases, a structured cost budget (by cost head), and a planned cash flow.               | Must         |
| DEV-PROJ-002 | Projects shall link to the stands/agro-plots they will deliver (Module B), so sales velocity can be tracked against construction progress. | Should       |
| DEV-PROJ-003 | Approved budget baselines shall be version-controlled and retained; only approved revisions supersede the baseline.                        | Must         |
| DEV-PROJ-004 | No cost shall be bookable to a project without an approved budget line.                                                                    | Must         |

## 8.2 Stage-Gate Funding

| **ID**       | **Requirement**                                                                                                                                                       | **Priority** |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-GATE-001 | Funding shall be structured as tranches, each released on verified milestone completion (the stage gate).                                                             | Must         |
| DEV-GATE-002 | Each gate shall require the configured evidence (e.g., QS certificate, inspection report) and approvals (e.g., CFO + Investment Committee) before funds are released. | Must         |
| DEV-GATE-003 | The system shall display per project: budget approved, tranches released, spent to date, balance, and forecast to complete.                                           | Must         |

## 8.3 Cost Control & Cost-to-Complete

| **ID**       | **Requirement**                                                                                                                      | **Priority** |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-COST-001 | The system shall record committed costs (purchase orders / contracts) and actual costs (certified invoices) per budget head.         | Must         |
| DEV-COST-002 | The system shall compute cost variance (actual + committed vs. budget) and estimated cost-to-complete per project and per cost head. | Must         |
| DEV-COST-003 | Alerts shall be triggered when a cost head or project is forecast to breach budget.                                                  | Must         |

## 8.4 Contractor & Procurement Management (Full ERP)

Complete procurement and contractor management is in scope — from RFQ through goods receipt, certificate, and payment. This replaces the need for a separate construction ERP.

| **ID**       | **Requirement**                                                                                                                                                                                                                    | **Priority** |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-PROC-001 | The system shall maintain a contractor and vendor register: company details, registration numbers, tax clearance, performance scores, prequalification status, and full contract history.                                          | Must         |
| DEV-PROC-002 | The system shall support a Bill of Quantities (BOQ) per project phase: line items, units, rates, and quantities. BOQs shall be the basis for cost budgets and contract valuations.                                                 | Must         |
| DEV-PROC-003 | The procurement lifecycle shall be fully supported: RFQ creation (linked to BOQ) → invitation of prequalified contractors → response capture and evaluation → award → contract generation from template → purchase order issuance. | Must         |
| DEV-PROC-004 | Purchase orders shall carry approved quantities and rates drawn from the BOQ; any variance at ordering shall require Finance approval.                                                                                             | Must         |
| DEV-PROC-005 | Goods received / works inspected records shall be capturable against a PO, with site-team sign-off. No payment certificate shall be raised without a matching GRN/inspection record.                                               | Must         |
| DEV-PROC-006 | Progress payment certificates shall be prepared by the QS against actual measured quantities, reviewed by the Project Manager, and routed for Finance approval before payment.                                                     | Must         |
| DEV-PROC-007 | Approved certificates shall create a payable in the accounting layer (Module A / FIN-ACC). The platform shall not itself disburse funds.                                                                                           | Must         |
| DEV-PROC-008 | Retention amounts (percentage held per contract) shall be tracked separately, released on practical completion and defects-liability expiry.                                                                                       | Must         |
| DEV-PROC-009 | Back-charges (cost of remedial works deducted from contractor) shall be recordable against a contract, auto-reducing the payable.                                                                                                  | Should       |
| DEV-PROC-010 | Contract variations (scope changes) shall be tracked with their own approval workflow and priced against the BOQ or a negotiated rate; they shall update the committed cost and the project budget automatically.                  | Must         |
| DEV-PROC-011 | A procurement dashboard shall show: total committed vs. budget, outstanding POs, pending certificates, overdue retentions, and contractor performance scores.                                                                      | Must         |

## 8.5 Resource & Labour Planning

Resource and labour planning is in scope for the development programme — enabling the project team to plan, schedule, and track human and plant resources against project activities.

| **ID**      | **Requirement**                                                                                                                         | **Priority** |
|-------------|-----------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-RES-001 | The system shall support a resource register: human (labour categories, rates) and plant/equipment (type, ownership, rental rate).      | Should       |
| DEV-RES-002 | Project activities (linked to milestones) shall have planned resource allocations: type, quantity, and duration.                        | Should       |
| DEV-RES-003 | Actual resource usage shall be capturable against activities (via site daily diaries), enabling planned vs. actual resource comparison. | Should       |
| DEV-RES-004 | Labour costs captured against activities shall feed into the project cost-to-complete calculation.                                      | Should       |
| DEV-RES-005 | Plant utilisation reports shall show hours worked, idle time, and cost per plant item per project.                                      | Could        |

## 8.5 Schedule & Infrastructure Mapping

| **ID**        | **Requirement**                                                                                                                                   | **Priority** |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DEV-SCHED-001 | Project milestones shall have planned and actual dates; slippage shall be flagged automatically.                                                  | Must         |
| DEV-SCHED-002 | A simple infrastructure layer (roads, water lines, solar, fibre, boreholes) shall be recordable per development, linked to project milestones.    | Should       |
| DEV-SCHED-003 | A handover workflow shall transfer completed infrastructure from the Development module to the Utilities module (Module D) on project completion. | Should       |

# 9. Module F — Document & Information Layer

| **ID**  | **Requirement**                                                                                                                                                                    | **Priority** |
|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| DOC-001 | The system shall store and version documents linked to the relevant entity (customer, stand, lease, project, permit, contractor contract).                                         | Must         |
| DOC-002 | Access control on documents shall mirror the RBAC model: Finance sees financial docs; Operations sees maintenance/utility docs; Sales sees buyer/sales docs, etc.                  | Must         |
| DOC-003 | Auto-generation of standard documents from templates shall be supported: offer letters, sale agreements, instalment schedules, statements, lease agreements, payment certificates. | Must         |
| DOC-004 | All documents shall carry a version history; prior versions shall be retrievable but not editable.                                                                                 | Must         |
| DOC-005 | Document storage shall be backed by a redundant object store (S3-compatible or equivalent) with configurable retention.                                                            | Must         |

# 10. Module G — Customer & Staff Portals

## 10.1 Buyer Portal (Residential & Agro-Plot)

| **ID**         | **Requirement**                                                                                              | **Priority** |
|----------------|--------------------------------------------------------------------------------------------------------------|--------------|
| PORT-BUYER-001 | Buyers shall be able to view their instalment schedule, payment history, balance, and arrears.               | Must         |
| PORT-BUYER-002 | Buyers shall be able to initiate payment via the Payments Platform (deep link or embedded component).        | Must         |
| PORT-BUYER-003 | Buyers shall be able to download their statement and sale agreement.                                         | Must         |
| PORT-BUYER-004 | Buyers shall be able to view the title/cession status of their stand or agro-plot.                           | Should       |
| PORT-BUYER-005 | Diaspora buyers shall have the same portal experience, accessible globally, with remittance payment options. | Must         |

## 10.2 Tenant Portal

| **ID**          | **Requirement**                                                                   | **Priority** |
|-----------------|-----------------------------------------------------------------------------------|--------------|
| PORT-TENANT-001 | Tenants shall view their rent and utility invoices, payment history, and balance. | Must         |
| PORT-TENANT-002 | Tenants shall be able to log maintenance requests and track their status.         | Must         |
| PORT-TENANT-003 | Tenants shall download their lease agreement and statements.                      | Should       |

## 10.3 Contractor Portal

| **ID**        | **Requirement**                                                                | **Priority** |
|---------------|--------------------------------------------------------------------------------|--------------|
| PORT-CONT-001 | Contractors shall receive work orders and maintenance requests via the portal. | Should       |
| PORT-CONT-002 | Contractors shall upload completion reports and photos against work orders.    | Should       |
| PORT-CONT-003 | Contractors shall view their payment certificates and payment status.          | Should       |

## 10.4 Internal Staff Dashboards

| **ID**         | **Requirement**                                                                                          | **Priority** |
|----------------|----------------------------------------------------------------------------------------------------------|--------------|
| PORT-STAFF-001 | Finance dashboard: cashflow, collections, arrears ageing, reconciliation status, revenue by asset class. | Must         |
| PORT-STAFF-002 | Sales dashboard: inventory, reservations, sales velocity, agent pipeline, commission accrual.            | Must         |
| PORT-STAFF-003 | Operations dashboard: utility faults, maintenance SLA, asset maintenance schedule, meter-read status.    | Must         |
| PORT-STAFF-004 | Development dashboard: project milestones, budget variance, cost-to-complete, gate status.               | Must         |
| PORT-STAFF-005 | Executive dashboard: consolidated group revenue, arrears, project status, cashflow forecast.             | Must         |

# 11. Module H — Payments API Integration

Module H owns all interaction with the standalone Payments Platform. No other module calls the payments API directly.

| **ID**      | **Requirement**                                                                                                                                                                                                                     | **Priority** |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| PAY-API-001 | The system shall create a bill in the Payments Platform for every invoice raised in Module A, carrying the invoice ID as the payment reference.                                                                                     | Must         |
| PAY-API-002 | The Payments Platform shall expose the bill across all its channels: USSD, mobile app, QR code, agent network, diaspora remittance, merchant payment.                                                                               | Must         |
| PAY-API-003 | On customer payment, the Payments Platform shall send a callback to the OS; the OS shall update invoice status, post to ledger, recalculate arrears, and send confirmation to the customer — within 30 seconds of callback receipt. | Must         |
| PAY-API-004 | The system shall expose its own entity references (customer ID, account ID, invoice ID) to the Payments Platform at bill creation so receipting is tagged at source.                                                                | Must         |
| PAY-API-005 | Callbacks shall be idempotent: duplicate callbacks for the same payment shall be detected and not double-posted.                                                                                                                    | Must         |
| PAY-API-006 | Failed or undelivered callbacks shall be retried with exponential backoff and logged; unresolved failures shall alert Finance within a configurable window.                                                                         | Must         |
| PAY-API-007 | The system shall support wallet linking: when a customer account is created in the OS, a wallet on the Payments Platform can be created or linked via API.                                                                          | Should       |
| PAY-API-008 | All API calls and callbacks shall be authenticated (e.g., HMAC signature or mutual TLS) and logged to the audit trail.                                                                                                              | Must         |

# 12. Module Z — Shared Platform Services

## 12.1 Identity, RBAC & Permissions

| **ID**        | **Requirement**                                                                                                                                              | **Priority** |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| PLAT-AUTH-001 | The system shall enforce role-based access control (RBAC) aligned to the user classes in Section 2.                                                          | Must         |
| PLAT-AUTH-002 | Least-privilege: users see and act only on what their role permits. Cross-module access (e.g., Finance view of project costs) shall be explicit role grants. | Must         |
| PLAT-AUTH-003 | Strong authentication (MFA) shall be required for privileged roles: Registrar, Finance, Admin, Management.                                                   | Must         |
| PLAT-AUTH-004 | The system should support SSO with the group identity provider where one exists.                                                                             | Should       |
| PLAT-AUTH-005 | A delegation-of-authority matrix shall be encodable as approval rules: amount thresholds, role requirements, and dual-authorisation requirements.            | Must         |

## 12.2 Audit Trail

| **ID**         | **Requirement**                                                                                                                                                                          | **Priority** |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| PLAT-AUDIT-001 | Every create, update, delete, and status change across all modules shall produce an audit entry with: actor, role, action, entity type, entity ID, before-value, after-value, timestamp. | Must         |
| PLAT-AUDIT-002 | The audit trail shall be append-only and tamper-evident; no user role shall be able to edit or delete audit entries.                                                                     | Must         |
| PLAT-AUDIT-003 | The audit trail shall be searchable and exportable by Internal Audit and Management.                                                                                                     | Must         |

## 12.3 Notifications

| **ID**         | **Requirement**                                                                                                                                                                                                                              | **Priority** |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| PLAT-NOTIF-001 | The system shall send configurable notifications via SMS, email, and optionally WhatsApp for: invoice due, payment received, payment overdue, reservation expiry, approval pending, budget alert, lease renewal due, and maintenance status. | Should       |
| PLAT-NOTIF-002 | All notifications shall be logged with delivery status.                                                                                                                                                                                      | Should       |

## 12.4 Reporting, Dashboards & KPIs

| **ID**       | **Requirement**                                                                                                                                                                                | **Priority** |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| PLAT-RPT-001 | The system shall produce the WS2 KPIs: double-allocations (target zero), % sales registry-verified (target 100%), sales velocity, project cost variance, rent collection rate, arrears ageing. | Must         |
| PLAT-RPT-002 | Role-based dashboards per Module G shall be configurable without code changes.                                                                                                                 | Should       |
| PLAT-RPT-003 | Any register or report shall be exportable to CSV / PDF.                                                                                                                                       | Should       |

# 13. Non-Functional Requirements

| **ID**         | **Requirement**                                                                                                                                                                                                                                             | **Priority** |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| NFR-SEC-001    | All data in transit shall be encrypted (TLS 1.2+); sensitive data at rest (PII, financial data) shall be encrypted.                                                                                                                                         | Must         |
| NFR-SEC-002    | The system shall comply with the Zimbabwe Data Protection Act: lawful basis, purpose limitation, data subject rights, breach notification, and retention schedules.                                                                                         | Must         |
| NFR-SEC-003    | Secrets (API keys, credentials) shall never be stored in source code or exposed in logs.                                                                                                                                                                    | Must         |
| NFR-CONN-001   | Defined capture functions (sales, payments, meter reads, site records) shall tolerate intermittent connectivity with offline capture and reliable sync. Sync conflicts shall be detected and resolved safely — never silently overwrite an allocation lock. | Must         |
| NFR-AVAIL-001  | Target availability: 99.5% during business hours (06:00–22:00 CAT). Planned maintenance shall be outside business hours with advance notice.                                                                                                                | Should       |
| NFR-PERF-001   | Common screens (inventory, invoicing, customer account) shall respond within 2 seconds under typical load.                                                                                                                                                  | Should       |
| NFR-SCALE-001  | The system shall scale to: 1,300+ stands/plots, 50,000+ customers, 500,000+ transactions per year without redesign.                                                                                                                                         | Must         |
| NFR-BACKUP-001 | Automated daily backups with RPO ≤24h, RTO ≤8h; restores tested quarterly; data residency in Zimbabwe or an approved jurisdiction.                                                                                                                          | Must         |
| NFR-MAINT-001  | Code shall be documented and maintainable by EOS beyond original developers: architecture decision records, API docs, deployment runbook.                                                                                                                   | Must         |
| NFR-USAB-001   | All portal and field-user screens shall be usable on a mid-range Android device without training beyond a short onboarding guide.                                                                                                                           | Should       |
| NFR-AUDIT-001  | The system shall retain the audit trail for a minimum of 7 years (legal and tax requirement).                                                                                                                                                               | Must         |

# 14. Key Data Entities (Indicative)

Indicative only — EOS owns the final data model. These entities validate scope and integration surface.

| **Entity**              | **Key attributes / relationships**                                                                                                                      |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Development             | ID, name, type (residential/agro), total area, phase list, status, budgets                                                                              |
| Phase                   | Development FK, name, planned stands/plots, start/end, status                                                                                           |
| Stand / Agro-plot       | Unique ID, development FK, phase FK, number, area, type, price, status, customer FK, GPS, utilities (jsonb). → one active Sale at most.                 |
| Customer                | Unique ID, type (buyer/tenant/agro-owner), identity docs, contact, KYC status, wallet ID (Payments Platform), GDPR/DPA consent record. → many Accounts. |
| Account                 | Customer FK, type (instalment / rental / utility), status, ledger balance, arrears. → many Invoices.                                                    |
| Reservation             | Stand FK, prospect (Customer FK), agent FK, created, expiry, status. Converts to Sale or expires.                                                       |
| Sale                    | Stand FK, Customer FK, agent FK, price, currency, payment terms, status, title stage. → one Account (instalment type).                                  |
| Lease                   | Premises FK, Tenant FK, start/end, rent, escalation, deposit, status. → one Account (rental type).                                                      |
| Invoice                 | Account FK, type, amount, currency, due date, status, Payments Platform bill ID, payment ref.                                                           |
| Ledger entry            | Account FK, Invoice FK, type (debit/credit), amount, method, Payments Platform tx ID, timestamp. Append-only.                                           |
| Meter read              | Customer FK, utility type, period, read value, estimated flag, billed flag.                                                                             |
| Project                 | Development FK, name, budget baseline (jsonb cost heads), phase list. → Milestones, Cost lines, Contractors.                                            |
| Milestone               | Project FK, description, planned date, actual date, gate (bool), required evidence, approval status.                                                    |
| Cost line / Certificate | Project FK, budget head, committed/actual amount, contractor FK, approval status.                                                                       |
| Contractor / Vendor     | ID, name, contacts, category, performance score. → Contracts, Certificates, Work orders.                                                                |
| Document                | ID, entity type, entity ID, type, version, storage ref, access-control tag, uploaded by, timestamp.                                                     |
| Audit entry             | Actor ID, role, action, entity type, entity ID, before (jsonb), after (jsonb), timestamp. Append-only, immutable.                                       |
| Payments API log        | Direction, endpoint, payload hash, status, timestamp, correlation ID. Audit of all Payments Platform calls.                                             |

# 15. Key API Contracts (Payments Integration)

These are the minimum API contracts EOS must negotiate with the Payments Platform team. The InfraCo OS holds the initiative on bill creation; the Payments Platform holds the initiative on callbacks.

## 15.1 OS → Payments Platform: Create Bill

| **Field**          | **Description**                                                              |
|--------------------|------------------------------------------------------------------------------|
| POST /bills        | Endpoint on the Payments Platform                                            |
| bill_ref           | Invoice ID from the OS (the unique matching key)                             |
| amount             | Numeric, USD (or ZiG with currency flag)                                     |
| customer_wallet_id | Wallet linked at onboarding (nullable — unlinked customers pay via USSD/QR)  |
| description        | Human-readable: e.g., “Stand A-012 Instalment 3 of 24”                       |
| due_date           | ISO date                                                                     |
| channels           | Array: \[“ussd”, “app”, “qr”, “agent”, “remittance”, “merchant”\]            |
| callback_url       | OS endpoint to receive payment notification                                  |
| Response           | { platform_bill_id, status, short_code_or_qr } — stored against the invoice. |

## 15.2 Payments Platform → OS: Payment Callback

| **Field**                   | **Description**                                                                                                           |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------|
| POST /api/payments/callback | Endpoint on the OS (authenticated, HMAC-signed)                                                                           |
| platform_bill_id            | Links back to the OS invoice                                                                                              |
| bill_ref                    | OS invoice ID (double-key for safety)                                                                                     |
| amount_paid                 | Numeric; may be partial                                                                                                   |
| currency                    | USD / ZiG / source currency for remittances                                                                               |
| channel                     | ussd / app / qr / agent / remittance / merchant                                                                           |
| transaction_id              | Payments Platform unique transaction reference                                                                            |
| timestamp                   | ISO datetime of payment                                                                                                   |
| OS actions                  | Validate signature → match to invoice → post ledger entry → update invoice status → recalculate arrears → notify customer |

## 15.3 OS → Payments Platform: Create / Link Wallet

| **Field**          | **Description**                                   |
|--------------------|---------------------------------------------------|
| POST /wallets      | Create a new wallet for an OS customer            |
| POST /wallets/link | Link an existing wallet to an OS customer account |
| customer_os_id     | OS customer ID (for correlation)                  |
| identity_ref       | National ID or passport reference                 |
| Response           | { wallet_id } — stored on the Customer entity     |

# 16. MVP Scope (Phase 1 Release)

Phase 1 must stop the live risks immediately: revenue leakage and the double-allocation liability. The following is the Phase 1 Must scope:

- **Module A (Financial Core):** customer/account registry, instalment engine, rental invoicing, utility billing, ledger, reconciliation, arrears engine, statements.

- **Module B (Sales — core):** stand and agro-plot inventory with the allocation lock enforced, reservations and sales workflow with Registrar sign-off, instalment schedule generation.

- **Module H (Payments API):** bill creation, callback processing, wallet linking, idempotency, and authenticated callback endpoint.

- **Module Z (Shared — core):** RBAC + MFA, audit trail, core KPI dashboard, SMS/email notifications.

*Phase 1 does NOT include: full portals (Phase 3), full project control (Phase 4), or agent commission processing (Phase 2 tail). Leasing and utilities follow in Phase 2.*

# 17. Acceptance Criteria (Phase 1 — Illustrative)

1.  ALLOCATION LOCK: it shall be impossible, by any normal or concurrent user action, to have two active Sales or Reservations on the same unit. Demonstrated by a concurrent-load test with documented results. Only a logged Registrar override can force a status change.

2.  PAYMENT RECONCILIATION: every payment callback from the Payments Platform either (a) auto-matches to an invoice within 30 seconds and posts to the ledger, or (b) appears in the Finance exceptions queue. No callback is silently lost. Demonstrated by end-to-end test of each payment channel.

3.  AUDIT TRAIL: every status change, financial posting, and approval in Phase 1 produces an immutable audit entry. No user role can delete or edit audit entries. Demonstrated by attempted deletion via admin role.

4.  WS2 KPIs: double-allocations = 0, % registry-verified sales = 100%, arrears report accurate to test data. Demonstrated on a seeded test dataset matching real portfolio size.

5.  DATA PROTECTION: all customer PII captured with lawful basis recorded; DPA consent fields present and enforced; PII not visible in server logs. Demonstrated by a basic DPA checklist review.

# 18. Open Questions for EOS to Resolve

- **Zimbabwe title/cession stages:** confirm exact stages and evidence required with Legal (Deeds Registries Act process for the LFH portfolio).

- **Payments Platform API spec:** the contracts in Section 15 are draft — negotiate and finalise with the Payments Platform engineering team.

- **Accounting system integration:** identify the target finance/accounting system and its integration capability (API, file, or manual).

- **Meter vendor & token standard:** the prepaid token engine is vendor-agnostic via a meter-adapter interface (UTIL-TKN-003). EOS must confirm which meters are being deployed per utility (STS-compliant vs. a specific vendor API) so the right adapter(s) are implemented; the engine, vending flow, and tariff logic can be built ahead of that decision against the mock adapter.

- **Currency / FX handling:** confirm ZiG handling rules, rounding, and FX source for diaspora remittance settlement.

- **Build vs. buy decision:** EOS to size Phase 1 (effort, team, timeline, cost) and compare against off-the-shelf options in Appendix A of the strategy document. The build option is justified if title/cession fit and WS1 integration are not achievable in any off-the-shelf tool.

- **Hosting and data residency:** EOS to confirm cloud vs. on-premise, provider, and whether data must remain in Zimbabwe.

- **GIS/map view:** confirm the mapping library and source for interactive plot layout (STND-INV-008); this affects front-end architecture.

— End of Specification —
