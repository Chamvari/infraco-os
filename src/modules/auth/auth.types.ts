import { Role } from '../../common/roles';

/**
 * The authenticated principal, derived SERVER-SIDE from a verified JWT by the
 * JwtAuthGuard and attached to req.user. Controllers read actorId/actorRole from
 * here and pass them to prisma.withActor() — client-supplied identity in the
 * request body is never trusted (PLAT-AUTH-003).
 */
export interface AuthPrincipal {
  /** core.app_user.user_id — fed to the audit context as actorId. */
  actorId: string;
  /** primary role code — fed to the audit context as actorRole. */
  actorRole: Role | string;
  /** every role granted to the user (for RBAC checks). */
  roles: Array<Role | string>;
  /** MFA satisfied for this session (PLAT-AUTH-005 sensitive actions). */
  mfa: boolean;
  username?: string;
  /** Forced first-login password change pending (set by JwtAuthGuard from DB). */
  mustChange?: boolean;
  /** Role-mandated MFA enrolment pending (set by JwtAuthGuard from DB). */
  mustEnrolMfa?: boolean;
}

export interface RequestWithUser {
  user?: AuthPrincipal;
  headers: Record<string, string | string[] | undefined>;
}
