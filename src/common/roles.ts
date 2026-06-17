/**
 * RBAC role codes — Module Z (PLAT-AUTH-002). Mirrors the 12 rows seeded into
 * core.role (db/infraco_os_schema.sql, aligned to SRS user classes §1.2).
 * The database is the source of truth; this array is the API-side allow-list and
 * gives us a literal string-union type for the @Roles() guard.
 */
export const ROLES = [
  'registrar',
  'sales_agent',
  'sales_manager',
  'finance',
  'finance_mgr',
  'operations',
  'field_team',
  'project_mgr',
  'quantity_surv',
  'exec',
  'internal_audit',
  'sys_admin',
] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Convenience role groups for the @Roles() decorator. sys_admin is appended to
 * every operational group so administrators are never locked out of operations.
 * Kept deliberately coarse — fine-grained checks belong in core.authority_rule
 * (the Delegation-of-Authority matrix, PLAT-AUTH-005).
 */
export const ROLE_GROUPS = {
  /** Stand/plot allocation & sales (STND-SALE / STND-INV). */
  sales: ['registrar', 'sales_agent', 'sales_manager', 'sys_admin'] as Role[],
  /** Registry mutations — customers, onboarding, KYC. */
  registry: ['operations', 'sales_agent', 'registrar', 'sys_admin'] as Role[],
  /** Finance operations — invoicing, ledger, arrears, accounts. */
  finance: ['finance', 'finance_mgr', 'sys_admin'] as Role[],
  /** Sensitive finance — write-offs, manual adjustments, dual-auth. */
  finance_senior: ['finance_mgr', 'sys_admin'] as Role[],
  /** Utilities & leasing operations (Module C / Module D). */
  operations: ['operations', 'field_team', 'sys_admin'] as Role[],
  /** Wholesale / grid settlement with ZESA. */
  wholesale: ['operations', 'finance', 'finance_mgr', 'sys_admin'] as Role[],

  // ---- Read-side groups -----------------------------------------------------
  // Reads are broader than writes and always include the read-only oversight
  // roles: exec (group dashboards) and internal_audit (records + audit trail).
  /** Inventory / sales reads. */
  read_sales: [
    'registrar', 'sales_agent', 'sales_manager',
    'exec', 'internal_audit', 'sys_admin',
  ] as Role[],
  /** Finance reads — ledger, reconciliation, accounts, arrears, dashboards. */
  read_finance: [
    'finance', 'finance_mgr', 'operations',
    'exec', 'internal_audit', 'sys_admin',
  ] as Role[],
  /** Utilities / leasing operational reads. */
  read_operations: [
    'operations', 'field_team',
    'exec', 'internal_audit', 'sys_admin',
  ] as Role[],
  /** Customer / onboarding registry reads. */
  read_registry: [
    'operations', 'sales_agent', 'registrar',
    'exec', 'internal_audit', 'sys_admin',
  ] as Role[],
} as const;
