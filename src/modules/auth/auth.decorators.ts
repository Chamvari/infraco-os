import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Role } from '../../common/roles';
import { AuthPrincipal, RequestWithUser } from './auth.types';

/** Marks a route as not requiring authentication (login, machine callbacks). */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the listed roles (PLAT-AUTH-002 RBAC). */
export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: Array<Role | string>) =>
  SetMetadata(ROLES_KEY, roles);

/** Requires the principal to have satisfied MFA (PLAT-AUTH-005). */
export const MFA_KEY = 'auth:mfa';
export const Mfa = () => SetMetadata(MFA_KEY, true);

/**
 * Marks a route as reachable while a forced flow is pending, so the user can
 * actually complete it. `stages` lists which forced states this route escapes:
 *   'password' — reachable while must_change_password is set (change-password)
 *   'mfa'      — reachable while MFA enrolment is mandated (mfa/enroll, mfa/verify)
 * No args ⇒ exempt from both (e.g. /auth/me, logout).
 */
export const FORCED_FLOW_EXEMPT_KEY = 'auth:forcedFlowExempt';
export type ForcedFlowStage = 'password' | 'mfa';
export const ForcedFlowExempt = (...stages: ForcedFlowStage[]) =>
  SetMetadata(FORCED_FLOW_EXEMPT_KEY, stages.length ? stages : ['password', 'mfa']);

/** Injects the verified principal (req.user) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    return req.user;
  },
);

/**
 * Injects the client IP for audit + rate-limiting. Behind Nginx the real client
 * is in X-Forwarded-For (first hop) / X-Real-IP; falls back to the socket.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<
      RequestWithUser & { ip?: string; socket?: { remoteAddress?: string } }
    >();
    const pick = (h: string | string[] | undefined) =>
      (Array.isArray(h) ? h[0] : h) || undefined;
    const fwd = pick(req.headers['x-forwarded-for']);
    if (fwd) return fwd.split(',')[0].trim();
    const real = pick(req.headers['x-real-ip']);
    if (real) return real.trim();
    return req.ip ?? req.socket?.remoteAddress ?? undefined;
  },
);
