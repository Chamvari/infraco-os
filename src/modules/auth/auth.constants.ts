/**
 * Roles for which MFA enrolment is MANDATORY before normal use (PLAT-AUTH-005).
 * Shared by AuthService (login/change-password gating) and JwtAuthGuard
 * (per-request enforcement) so the mandate has a single source of truth.
 */
export const MFA_ENFORCED_ROLES = new Set<string>(['sys_admin', 'finance_mgr']);
