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

/** Injects the verified principal (req.user) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    return req.user;
  },
);
