import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TokenService } from './token.service';
import { verifyPassword } from './password.util';
import { generateSecret, otpauthUri, verifyTotp } from './totp.util';

export interface LoginResult {
  accessToken: string;
  /**
   * True when the user has MFA enabled: the access token is issued mfa:false and
   * the client must call POST /auth/mfa/verify to obtain a stepped-up token
   * before performing @Mfa() sensitive actions (PLAT-AUTH-003).
   */
  mfaRequired: boolean;
  user: {
    userId: string;
    username: string;
    roles: string[];
    mfaEnabled: boolean;
  };
}

export interface MfaEnrolResult {
  secret: string;
  otpauthUri: string;
}

interface UserRow {
  user_id: string;
  username: string;
  password_hash: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  roles: string[] | null;
}

/**
 * AuthService — credential verification + token issue (PLAT-AUTH-001/003/004).
 * Looks the user up in core.app_user, verifies the scrypt password, loads the
 * granted role codes from core.user_role → core.role, and mints a JWT carrying
 * user id + roles. The token is the ONLY way identity enters the system
 * thereafter (PLAT-AUTH-003).
 *
 * MFA is a real TOTP second factor (RFC 6238), not a passive flag: login issues
 * an mfa:false token; stepping up to mfa:true requires presenting a valid
 * authenticator code via verifyMfa(). The @Mfa() guard checks the mfa claim, so
 * sensitive actions genuinely require the second factor.
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
      this.userSelect('u.username = $1'),
      username,
    );

    const user = rows[0];
    // Same generic error whether the user is missing or the password is wrong.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const roles = user.roles ?? [];
    const primaryRole = roles[0] ?? '';

    // The session is authenticated but NOT yet MFA-satisfied — a second factor
    // is presented separately (verifyMfa). First-factor login never sets mfa.
    const accessToken = this.tokens.sign({
      sub: user.user_id,
      role: primaryRole,
      roles,
      mfa: false,
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
      mfaRequired: user.mfa_enabled,
      user: {
        userId: user.user_id,
        username: user.username,
        roles,
        mfaEnabled: user.mfa_enabled,
      },
    };
  }

  /**
   * PLAT-AUTH-003 — begin TOTP enrolment for the authenticated user: generate
   * and store a fresh base32 secret and return the otpauth:// URI to add to an
   * authenticator app. Enrolment is confirmed (and mfa_enabled set) when the
   * first code is verified via verifyMfa().
   */
  async enrollMfa(userId: string): Promise<MfaEnrolResult> {
    const user = await this.loadById(userId);
    const secret = generateSecret();
    const primaryRole = (user.roles ?? [])[0] ?? '';

    await this.prisma.withActor(userId, primaryRole, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE core.app_user SET mfa_secret = $1 WHERE user_id = $2::uuid`,
        secret,
        userId,
      );
    });

    return { secret, otpauthUri: otpauthUri(secret, user.username) };
  }

  /**
   * PLAT-AUTH-003 — verify a TOTP code and mint a stepped-up mfa:true token.
   * Activates MFA (mfa_enabled = true) on the first successful verification.
   * The token carries the user's current roles, re-read server-side.
   */
  async verifyMfa(userId: string, code: string): Promise<LoginResult> {
    if (!code) {
      throw new BadRequestException('An MFA code is required.');
    }
    const user = await this.loadById(userId);
    if (!user.mfa_secret) {
      throw new BadRequestException('MFA is not enrolled. Call /auth/mfa/enroll first.');
    }
    if (!verifyTotp(user.mfa_secret, code)) {
      throw new UnauthorizedException('Invalid MFA code.');
    }

    const roles = user.roles ?? [];
    const primaryRole = roles[0] ?? '';

    // Activate MFA on first successful verification (confirms the authenticator).
    if (!user.mfa_enabled) {
      await this.prisma.withActor(userId, primaryRole, async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE core.app_user SET mfa_enabled = true WHERE user_id = $1::uuid`,
          userId,
        );
      });
    }

    const accessToken = this.tokens.sign({
      sub: user.user_id,
      role: primaryRole,
      roles,
      mfa: true,
      username: user.username,
    });

    return {
      accessToken,
      mfaRequired: false,
      user: {
        userId: user.user_id,
        username: user.username,
        roles,
        mfaEnabled: true,
      },
    };
  }

  private async loadById(userId: string): Promise<UserRow> {
    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      this.userSelect('u.user_id = $1::uuid'),
      userId,
    );
    if (!rows[0]) {
      throw new UnauthorizedException('User not found or inactive.');
    }
    return rows[0];
  }

  /** Shared user projection (credential + MFA state + role codes). */
  private userSelect(whereClause: string): string {
    return `SELECT u.user_id::text AS user_id,
                   u.username,
                   u.password_hash,
                   u.mfa_enabled,
                   u.mfa_secret,
                   COALESCE(
                     array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),
                     ARRAY[]::text[]
                   ) AS roles
              FROM core.app_user u
              LEFT JOIN core.user_role ur ON ur.user_id = u.user_id
              LEFT JOIN core.role r       ON r.role_id  = ur.role_id
             WHERE ${whereClause}
               AND u.status = 'active'
             GROUP BY u.user_id, u.username, u.password_hash, u.mfa_enabled, u.mfa_secret`;
  }
}
