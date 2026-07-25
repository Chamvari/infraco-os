/**
 * Roles for which MFA enrolment is MANDATORY before normal use (PLAT-AUTH-005).
 * Shared by AuthService (login/change-password gating) and JwtAuthGuard
 * (per-request enforcement) so the mandate has a single source of truth.
 */
export const MFA_ENFORCED_ROLES = new Set<string>(['sys_admin', 'finance_mgr']);

/**
 * Master switch for MFA enforcement (PLAT-AUTH-005). Default OFF. When false:
 *   - no MFA enrolment is forced at login (mustEnrolMfa never set),
 *   - @Mfa-gated step-up actions pass through on their role checks alone.
 * All MFA code stays intact and dormant — arming it is a single flag flip
 * (MFA_ENFORCED=true). Read at call time so it can't be cached across a change.
 */
export function mfaEnforced(): boolean {
  return (process.env.MFA_ENFORCED ?? 'false').toLowerCase() === 'true';
}
