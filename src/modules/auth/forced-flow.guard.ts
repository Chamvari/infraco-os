import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FORCED_FLOW_EXEMPT_KEY,
  ForcedFlowStage,
  IS_PUBLIC_KEY,
} from './auth.decorators';
import { RequestWithUser } from './auth.types';

/**
 * ForcedFlowGuard — registered globally AFTER JwtAuthGuard and BEFORE RolesGuard.
 * When the principal has a pending forced flow it hard-blocks (403) every route
 * except the ones marked @ForcedFlowExempt() that let them complete it:
 *   mustChange   → only 'password'-exempt routes (POST /auth/change-password)
 *   mustEnrolMfa → only 'mfa'-exempt routes (mfa/enroll, mfa/verify)
 * Both stages also allow always-exempt routes (e.g. /auth/me, logout).
 */
@Injectable()
export class ForcedFlowGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    if (!user) return true; // JwtAuthGuard already rejects unauthenticated requests
    if (!user.mustChange && !user.mustEnrolMfa) return true;

    const exempt =
      this.reflector.getAllAndOverride<ForcedFlowStage[] | undefined>(
        FORCED_FLOW_EXEMPT_KEY,
        [ctx.getHandler(), ctx.getClass()],
      ) ?? [];

    if (user.mustChange) {
      if (exempt.includes('password')) return true;
      throw new ForbiddenException({
        statusCode: 403,
        error: 'password_change_required',
        message: 'You must change your password before continuing.',
      });
    }

    // mustEnrolMfa — password already settled; allow MFA (and password) routes.
    if (exempt.includes('mfa') || exempt.includes('password')) return true;
    throw new ForbiddenException({
      statusCode: 403,
      error: 'mfa_enrolment_required',
      message: 'You must enrol multi-factor authentication before continuing.',
    });
  }
}
