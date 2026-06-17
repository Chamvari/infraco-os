import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from './token.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { JwtError } from './jwt.util';
import { RequestWithUser } from './auth.types';

/**
 * JwtAuthGuard — registered globally (PLAT-AUTH-003). Validates the Bearer token
 * on every request except those marked @Public(), and attaches the verified
 * principal to req.user so controllers can source identity server-side. A
 * missing or invalid/expired token is rejected with 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
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
    try {
      const claims = this.tokens.verify(token);
      req.user = {
        actorId: claims.sub,
        actorRole: claims.role,
        roles: claims.roles?.length ? claims.roles : [claims.role],
        mfa: !!claims.mfa,
        username: claims.username,
      };
    } catch (err) {
      if (err instanceof JwtError) {
        throw new UnauthorizedException('Invalid or expired token.');
      }
      throw err;
    }
    return true;
  }
}
