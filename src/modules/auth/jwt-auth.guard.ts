import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { MFA_ENFORCED_ROLES, mfaEnforced } from './auth.constants';
import { JwtError } from './jwt.util';
import { RequestWithUser } from './auth.types';

interface UserState {
  status: string;
  token_version: number;
  must_change_password: boolean;
  temp_password_expires_at: Date | string | null;
  mfa_enabled: boolean;
}

/**
 * JwtAuthGuard — registered globally (PLAT-AUTH-003). Validates the Bearer token
 * on every non-@Public() request AND re-checks current account state in the DB,
 * because a signed token can outlive the state it was minted from:
 *   - token_version bump (password change / MFA reset) → token invalidated (401)
 *   - account deactivated → 401
 *   - admin-set temporary password expired → 401
 * It also resolves the live forced-flow gates (mustChange / mustEnrolMfa) onto
 * req.user for the ForcedFlowGuard. One indexed PK lookup per request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const token = value.slice('Bearer '.length).trim();
    let claims;
    try {
      claims = this.tokens.verify(token);
    } catch (err) {
      if (err instanceof JwtError) {
        throw new UnauthorizedException('Invalid or expired token.');
      }
      throw err;
    }

    const rows = await this.prisma.$queryRawUnsafe<UserState[]>(
      `SELECT status::text AS status, token_version, must_change_password,
              temp_password_expires_at, mfa_enabled
         FROM core.app_user WHERE user_id = $1::uuid`,
      claims.sub,
    );
    const state = rows[0];
    if (!state || state.status !== 'active') {
      throw new UnauthorizedException('Account is not active.');
    }
    if ((claims.tokenVersion ?? 0) !== state.token_version) {
      throw new UnauthorizedException('Session has been invalidated. Please sign in again.');
    }
    if (
      state.must_change_password &&
      state.temp_password_expires_at &&
      new Date(state.temp_password_expires_at as unknown as string).getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        'Temporary password has expired. Ask an administrator to re-issue it.',
      );
    }

    const roles = claims.roles?.length ? claims.roles : [claims.role];
    req.user = {
      actorId: claims.sub,
      actorRole: claims.role,
      roles,
      mfa: !!claims.mfa,
      username: claims.username,
      // Live gates from current DB state (authoritative over the token claims).
      mustChange: state.must_change_password,
      mustEnrolMfa:
        mfaEnforced() &&
        !state.must_change_password &&
        !state.mfa_enabled &&
        roles.some((r) => MFA_ENFORCED_ROLES.has(r)),
    };
    return true;
  }
}
