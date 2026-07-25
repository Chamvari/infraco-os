import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TokenService } from './token.service';
import { hashPassword, verifyPassword } from './password.util';
import { checkPasswordPolicy } from './password-policy';
import { MFA_ENFORCED_ROLES, mfaEnforced } from './auth.constants';
import { generateSecret, otpauthUri, verifyTotp } from './totp.util';

export interface LoginResult {
  accessToken: string;
  /**
   * True when the user has MFA enabled: the access token is issued mfa:false and
   * the client must call POST /auth/mfa/verify to obtain a stepped-up token
   * before performing @Mfa() sensitive actions (PLAT-AUTH-003).
   */
  mfaRequired: boolean;
  /** Forced first-login password change pending — client must call change-password. */
  mustChangePassword: boolean;
  /** Role-mandated MFA enrolment pending — client must enrol before normal use. */
  mustEnrolMfa: boolean;
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
  must_change_password: boolean;
  temp_password_expires_at: Date | string | null;
  token_version: number;
  roles: string[] | null;
}

/**
 * AuthService — credential verification, token issue, and the auth hardening
 * flows (PLAT-AUTH-001/003/004/005):
 *   - forced first-login password change + admin-set temp-password 72h expiry
 *   - self-service / forced change-password with a NIST-aligned policy
 *   - token versioning: a bump invalidates every outstanding JWT for a user
 *   - role-mandated MFA enrolment (sys_admin/finance_mgr) + admin MFA reset
 *   - login rate-limiting: per-account exponential backoff + per-IP hard block
 *   - append-only auth audit log (core.auth_event)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Rate-limit config (derived from core.auth_event; all auto-expiring).
  private static readonly WINDOW_MIN = 15;
  private static readonly ACCT_BACKOFF_AFTER = 5; // failures before backoff starts
  private static readonly ACCT_BACKOFF_CAP_S = 900; // 15 min cap
  private static readonly IP_BLOCK_AFTER = 30; // per-IP hard block threshold

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  // ── Login ───────────────────────────────────────────────────

  async login(username: string, password: string, ip?: string): Promise<LoginResult> {
    if (!username || !password) {
      throw new BadRequestException('username and password are required.');
    }

    await this.enforceRateLimit(username, ip);

    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      this.userSelect('u.username = $1'),
      username,
    );
    const user = rows[0];

    // Same generic error whether the user is missing or the password is wrong.
    if (!user || !verifyPassword(password, user.password_hash)) {
      await this.recordAuthEvent('login_failure', {
        actorUserId: user?.user_id ?? null,
        username,
        ip,
        detail: { reason: user ? 'bad_password' : 'unknown_user' },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Admin-set temporary password is unusable once it has expired (72h) — the
    // admin must re-issue. Blocks even a token minted before expiry (the guard
    // re-checks too).
    if (user.must_change_password && this.tempExpired(user.temp_password_expires_at)) {
      await this.recordAuthEvent('login_failure', {
        actorUserId: user.user_id,
        username,
        ip,
        detail: { reason: 'temp_password_expired' },
      });
      throw new UnauthorizedException(
        'Temporary password has expired. Ask an administrator to re-issue it.',
      );
    }

    const roles = user.roles ?? [];
    const primaryRole = roles[0] ?? '';
    const mustChange = user.must_change_password;
    const mustEnrolMfa = !mustChange && this.mfaEnrolRequired(roles, user.mfa_enabled);

    // First-factor token: mfa:false. Carries the forced-flow gates + token version.
    const accessToken = this.tokens.sign({
      sub: user.user_id,
      role: primaryRole,
      roles,
      mfa: false,
      username: user.username,
      mustChange,
      mustEnrolMfa,
      tokenVersion: user.token_version,
    });

    await this.stampLogin(user.user_id, primaryRole);
    await this.recordAuthEvent('login_success', {
      actorUserId: user.user_id,
      username: user.username,
      ip,
    });

    return {
      accessToken,
      mfaRequired: user.mfa_enabled,
      mustChangePassword: mustChange,
      mustEnrolMfa,
      user: {
        userId: user.user_id,
        username: user.username,
        roles,
        mfaEnabled: user.mfa_enabled,
      },
    };
  }

  // ── Change password (forced reset AND everyday self-service) ────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<LoginResult> {
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current and new password are required.');
    }
    const user = await this.loadById(userId);

    if (!verifyPassword(currentPassword, user.password_hash)) {
      await this.recordAuthEvent('login_failure', {
        actorUserId: userId,
        username: user.username,
        ip,
        detail: { reason: 'change_password_bad_current' },
      });
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const policy = checkPasswordPolicy(newPassword, currentPassword);
    if (!policy.ok) {
      throw new BadRequestException(policy.error);
    }

    const roles = user.roles ?? [];
    const primaryRole = roles[0] ?? '';
    const newVersion = user.token_version + 1;
    const newHash = hashPassword(newPassword);

    // Clear the forced-change state, drop any temp expiry, and bump token_version
    // so every previously-issued JWT for this user is invalidated.
    await this.prisma.withActor(userId, primaryRole, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE core.app_user
            SET password_hash = $1,
                must_change_password = false,
                temp_password_expires_at = NULL,
                token_version = token_version + 1,
                updated_at = now()
          WHERE user_id = $2::uuid`,
        newHash,
        userId,
      );
    });

    await this.recordAuthEvent('password_change', {
      actorUserId: userId,
      username: user.username,
      ip,
    });

    const mustEnrolMfa = this.mfaEnrolRequired(roles, user.mfa_enabled);
    const accessToken = this.tokens.sign({
      sub: userId,
      role: primaryRole,
      roles,
      mfa: false,
      username: user.username,
      mustChange: false,
      mustEnrolMfa,
      tokenVersion: newVersion,
    });

    return {
      accessToken,
      mfaRequired: user.mfa_enabled,
      mustChangePassword: false,
      mustEnrolMfa,
      user: {
        userId,
        username: user.username,
        roles,
        mfaEnabled: user.mfa_enabled,
      },
    };
  }

  // ── MFA enrol / verify / admin reset ────────────────────────

  /**
   * PLAT-AUTH-003 — begin TOTP enrolment: generate and store a fresh base32
   * secret and return the otpauth:// URI. Enrolment is confirmed (mfa_enabled
   * set) when the first code is verified via verifyMfa().
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
   * Activates MFA on the first successful verification (and audits mfa_enrol).
   */
  async verifyMfa(userId: string, code: string, ip?: string): Promise<LoginResult> {
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
    const firstActivation = !user.mfa_enabled;

    if (firstActivation) {
      await this.prisma.withActor(userId, primaryRole, async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE core.app_user SET mfa_enabled = true WHERE user_id = $1::uuid`,
          userId,
        );
      });
      await this.recordAuthEvent('mfa_enrol', {
        actorUserId: userId,
        username: user.username,
        ip,
      });
    }

    const accessToken = this.tokens.sign({
      sub: user.user_id,
      role: primaryRole,
      roles,
      mfa: true,
      username: user.username,
      mustChange: false,
      mustEnrolMfa: false,
      tokenVersion: user.token_version,
    });

    return {
      accessToken,
      mfaRequired: false,
      mustChangePassword: false,
      mustEnrolMfa: false,
      user: {
        userId: user.user_id,
        username: user.username,
        roles,
        mfaEnabled: true,
      },
    };
  }

  /**
   * PLAT-AUTH-005 — admin MFA reset (lost-device recovery). Clears the target's
   * MFA secret/flag and bumps their token_version (forcing re-login), so on next
   * login the enrolment mandate re-triggers. Every reset is audited.
   */
  async resetMfa(
    adminId: string,
    adminRole: string,
    targetUserId: string,
    ip?: string,
  ): Promise<{ ok: true; targetUsername: string }> {
    const target = await this.loadById(targetUserId);

    await this.prisma.withActor(adminId, adminRole, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE core.app_user
            SET mfa_enabled = false,
                mfa_secret = NULL,
                token_version = token_version + 1,
                updated_at = now()
          WHERE user_id = $1::uuid`,
        targetUserId,
      );
    });

    await this.recordAuthEvent('mfa_reset', {
      actorUserId: adminId,
      username: target.username,
      ip,
      detail: { targetUserId, targetUsername: target.username, by: adminId },
    });

    return { ok: true, targetUsername: target.username };
  }

  // ── Rate limiting (per-account backoff + per-IP hard block) ──

  private async enforceRateLimit(username: string, ip?: string): Promise<void> {
    if (ip) {
      const ipFails = await this.countFailures('ip', ip);
      if (ipFails >= AuthService.IP_BLOCK_AFTER) {
        throw new HttpException(
          'Too many failed attempts from this network. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const acct = await this.failureStats(username);
    if (acct.count >= AuthService.ACCT_BACKOFF_AFTER && acct.lastAtMs != null) {
      // Exponential backoff: 2s, 4s, 8s … capped at 15 min. Slows brute force
      // without a hard account lock (no named-user DoS); window auto-expires.
      const overBy = acct.count - AuthService.ACCT_BACKOFF_AFTER + 1;
      const gapS = Math.min(2 ** overBy, AuthService.ACCT_BACKOFF_CAP_S);
      const elapsedS = (Date.now() - acct.lastAtMs) / 1000;
      if (elapsedS < gapS) {
        const retryAfter = Math.ceil(gapS - elapsedS);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many attempts. Please wait before trying again.',
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async countFailures(by: 'ip' | 'username', value: string): Promise<number> {
    const predicate = by === 'ip' ? 'ip = $1' : 'lower(username) = lower($1)';
    const rows = await this.prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n
         FROM core.auth_event
        WHERE event_type = 'login_failure'
          AND occurred_at > now() - interval '${AuthService.WINDOW_MIN} minutes'
          AND ${predicate}`,
      value,
    );
    return Number(rows[0]?.n ?? 0);
  }

  private async failureStats(
    username: string,
  ): Promise<{ count: number; lastAtMs: number | null }> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: string; last: Date | null }[]>(
      `SELECT count(*)::text AS n, max(occurred_at) AS last
         FROM core.auth_event
        WHERE event_type = 'login_failure'
          AND occurred_at > now() - interval '${AuthService.WINDOW_MIN} minutes'
          AND lower(username) = lower($1)`,
      username,
    );
    const count = Number(rows[0]?.n ?? 0);
    const last = rows[0]?.last ? new Date(rows[0].last as unknown as string).getTime() : null;
    return { count, lastAtMs: last };
  }

  // ── Auth audit log (append-only) ────────────────────────────

  /**
   * Append a row to core.auth_event. Never throws — an audit failure must not
   * break the auth flow (it is logged instead). Also used for account_create /
   * role_change events emitted by admin tooling.
   */
  async recordAuthEvent(
    eventType: string,
    data: {
      actorUserId?: string | null;
      username?: string | null;
      ip?: string | null;
      detail?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO core.auth_event (event_type, actor_user_id, username, ip, detail)
         VALUES ($1, $2::uuid, $3, $4, $5::jsonb)`,
        eventType,
        data.actorUserId ?? null,
        data.username ?? null,
        data.ip ?? null,
        data.detail ? JSON.stringify(data.detail) : null,
      );
    } catch (err) {
      this.logger.error(`auth_event insert failed (${eventType})`, err as Error);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private mfaEnrolRequired(roles: string[], mfaEnabled: boolean): boolean {
    return mfaEnforced() && !mfaEnabled && roles.some((r) => MFA_ENFORCED_ROLES.has(r));
  }

  private tempExpired(at: Date | string | null): boolean {
    if (!at) return false;
    return new Date(at as unknown as string).getTime() < Date.now();
  }

  private async stampLogin(userId: string, role: string): Promise<void> {
    await this.prisma.withActor(userId, role, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE core.app_user SET last_login_at = now() WHERE user_id = $1::uuid`,
        userId,
      );
    });
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

  /** Shared user projection (credentials + MFA + forced-flow + token version). */
  private userSelect(whereClause: string): string {
    return `SELECT u.user_id::text AS user_id,
                   u.username,
                   u.password_hash,
                   u.mfa_enabled,
                   u.mfa_secret,
                   u.must_change_password,
                   u.temp_password_expires_at,
                   u.token_version,
                   COALESCE(
                     array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),
                     ARRAY[]::text[]
                   ) AS roles
              FROM core.app_user u
              LEFT JOIN core.user_role ur ON ur.user_id = u.user_id
              LEFT JOIN core.role r       ON r.role_id  = ur.role_id
             WHERE ${whereClause}
               AND u.status = 'active'
             GROUP BY u.user_id, u.username, u.password_hash, u.mfa_enabled,
                      u.mfa_secret, u.must_change_password,
                      u.temp_password_expires_at, u.token_version`;
  }
}
