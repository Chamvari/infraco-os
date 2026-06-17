import { Injectable, Logger } from '@nestjs/common';
import { JwtClaims, signJwt, verifyJwt } from './jwt.util';

/**
 * TokenService — issues and verifies the HS256 session tokens (PLAT-AUTH-001/004).
 * Secret and TTL come from the environment so production overrides the dev
 * default; a loud warning fires if the default secret is used outside tests.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor() {
    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      // Fail closed in production rather than signing with a known key.
      throw new Error('AUTH_JWT_SECRET must be set in production.');
    }
    if (!secret) {
      this.logger.warn(
        'AUTH_JWT_SECRET not set — using an insecure development secret.',
      );
    }
    this.secret = secret ?? 'dev-insecure-secret-change-me';
    this.ttlSeconds = Number(process.env.AUTH_JWT_TTL_SECONDS ?? 8 * 60 * 60); // 8h
  }

  sign(claims: Omit<JwtClaims, 'iat' | 'exp'>): string {
    return signJwt(claims, this.secret, this.ttlSeconds);
  }

  /** Throws JwtError on any invalid/expired token. */
  verify(token: string): JwtClaims {
    return verifyJwt(token, this.secret);
  }
}
