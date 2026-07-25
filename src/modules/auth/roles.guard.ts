import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, MFA_KEY } from './auth.decorators';
import { mfaEnforced } from './auth.constants';
import { RequestWithUser } from './auth.types';

/**
 * RolesGuard — registered globally AFTER JwtAuthGuard (PLAT-AUTH-002/005). Reads
 * the @Roles() / @Mfa() metadata on the handler and:
 *   • denies (403) a valid principal whose roles don't intersect the allow-list;
 *   • denies (403) a sensitive (@Mfa) action when the principal hasn't satisfied
 *     MFA.
 * Routes with no @Roles()/@Mfa() metadata only require authentication, which the
 * JwtAuthGuard has already enforced.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const requiresMfa = this.reflector.getAllAndOverride<boolean | undefined>(
      MFA_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // Nothing to enforce beyond authentication.
    if ((!required || required.length === 0) && !requiresMfa) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    if (!user) {
      // Reachable only if a protected route lacks the JwtAuthGuard; fail closed.
      throw new UnauthorizedException('Authentication required.');
    }

    if (required && required.length > 0) {
      const granted = new Set(user.roles);
      if (!required.some((r) => granted.has(r))) {
        throw new ForbiddenException(
          `Insufficient role. Requires one of: ${required.join(', ')}.`,
        );
      }
    }

    // @Mfa step-up only bites when MFA is enforced; otherwise the action passes
    // on its role check alone (MFA code stays intact, just dormant).
    if (requiresMfa && mfaEnforced() && !user.mfa) {
      throw new ForbiddenException('MFA is required for this action.');
    }

    return true;
  }
}
