import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TokenService } from './token.service';
import { verifyPassword } from './password.util';

export interface LoginResult {
  accessToken: string;
  user: {
    userId: string;
    username: string;
    roles: string[];
    mfaEnabled: boolean;
  };
}

interface UserRow {
  user_id: string;
  username: string;
  password_hash: string | null;
  mfa_enabled: boolean;
  roles: string[] | null;
}

/**
 * AuthService — credential verification + token issue (PLAT-AUTH-001/004).
 * Looks the user up in core.app_user, verifies the scrypt password, loads the
 * granted role codes from core.user_role → core.role, and mints a JWT carrying
 * user id + roles + MFA flag. The token is the ONLY way identity enters the
 * system thereafter (PLAT-AUTH-003).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      throw new BadRequestException('username and password are required.');
    }

    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT u.user_id::text AS user_id,
              u.username,
              u.password_hash,
              u.mfa_enabled,
              COALESCE(
                array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),
                ARRAY[]::text[]
              ) AS roles
         FROM core.app_user u
         LEFT JOIN core.user_role ur ON ur.user_id = u.user_id
         LEFT JOIN core.role r       ON r.role_id  = ur.role_id
        WHERE u.username = $1
          AND u.status   = 'active'
        GROUP BY u.user_id, u.username, u.password_hash, u.mfa_enabled`,
      username,
    );

    const user = rows[0];
    // Same generic error whether the user is missing or the password is wrong.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const roles = user.roles ?? [];
    const primaryRole = roles[0] ?? '';

    const accessToken = this.tokens.sign({
      sub: user.user_id,
      role: primaryRole,
      roles,
      mfa: user.mfa_enabled,
      username: user.username,
    });

    // Audited last-login stamp, attributed to the user themselves.
    await this.prisma.withActor(user.user_id, primaryRole, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE core.app_user SET last_login_at = now() WHERE user_id = $1::uuid`,
        user.user_id,
      );
    });

    return {
      accessToken,
      user: {
        userId: user.user_id,
        username: user.username,
        roles,
        mfaEnabled: user.mfa_enabled,
      },
    };
  }
}
