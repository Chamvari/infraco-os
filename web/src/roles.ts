import type { SessionUser } from './session';

/**
 * Client-side mirror of the API role groups (src/common/roles.ts). These decide
 * only what the UI SHOWS — the backend remains the source of truth and still
 * enforces 403 on every route. The goal is purely UX: never offer an action the
 * API would reject. Keep these subsets in sync with ROLE_GROUPS for the routes
 * the web app actually calls.
 */
const GROUPS = {
  /** Finance reads — arrears ageing, top debtors, rent roll, lease statements. */
  read_finance: [
    'finance', 'finance_mgr', 'operations', 'exec', 'internal_audit', 'sys_admin',
  ],
  /** Inventory reads — plot list / map. */
  read_sales: [
    'registrar', 'sales_agent', 'sales_manager', 'exec', 'internal_audit', 'sys_admin',
  ],
  /** Plot reservation (write). */
  sales: ['registrar', 'sales_agent', 'sales_manager', 'sys_admin'],
} as const;

export type Capability = keyof typeof GROUPS;

/** True if the user holds any role granting the capability. */
export function can(user: SessionUser | null, cap: Capability): boolean {
  if (!user) return false;
  const allowed = GROUPS[cap] as readonly string[];
  return user.roles.some((role) => allowed.includes(role));
}
