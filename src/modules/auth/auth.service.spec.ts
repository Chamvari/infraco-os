import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma.service';
import { hashPassword, verifyPassword } from './password.util';
import { base32Encode, totp } from './totp.util';

/**
 * AuthService (PLAT-AUTH-001/003/004/005) — verifies credentials against
 * core.app_user (Prisma mocked), mints a verifiable JWT, enforces a real TOTP
 * second factor, and covers the auth-hardening flows: forced/self-service
 * change-password, token versioning, rate-limiting, and admin MFA reset. No
 * database is touched — the mock routes queries by SQL shape.
 */
describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let prisma: {
    $queryRawUnsafe: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    withActor: jest.Mock;
  };

  const SECRET = base32Encode(Buffer.from('12345678901234567890'));

  let userRows: unknown[]; // what a core.app_user SELECT returns
  let failureStat: { n: string; last: Date | null }; // what an auth_event SELECT returns

  const USER = {
    user_id: 'user-7',
    username: 'demo_admin',
    password_hash: hashPassword('correct horse'),
    mfa_enabled: true,
    mfa_secret: null as string | null,
    must_change_password: false,
    temp_password_expires_at: null as Date | null,
    token_version: 0,
    roles: ['sys_admin', 'finance'],
  };

  const setUser = (overrides: Partial<typeof USER> = {}) => {
    userRows = [{ ...USER, ...overrides }];
  };

  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = 'svc-test-secret';
  });

  beforeEach(() => {
    tokens = new TokenService();
    userRows = [USER];
    failureStat = { n: '0', last: null };
    prisma = {
      $queryRawUnsafe: jest.fn((sql: string) => {
        if (/core\.auth_event/i.test(sql)) return Promise.resolve([failureStat]);
        if (/FROM core\.app_user u/i.test(sql)) return Promise.resolve(userRows);
        return Promise.resolve([]);
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      withActor: jest.fn((_id, _role, fn) =>
        fn({ $executeRawUnsafe: jest.fn().mockResolvedValue(1) }),
      ),
    };
    service = new AuthService(prisma as unknown as PrismaService, tokens);
  });

  describe('login', () => {
    it('issues a verifiable token but does NOT satisfy MFA at first-factor login', async () => {
      setUser();
      const res = await service.login('demo_admin', 'correct horse');

      expect(res.user.userId).toBe('user-7');
      expect(res.mfaRequired).toBe(true);
      expect(res.mustChangePassword).toBe(false);
      const claims = tokens.verify(res.accessToken);
      expect(claims.sub).toBe('user-7');
      expect(claims.roles).toEqual(['sys_admin', 'finance']);
      expect(claims.mfa).toBe(false);
      expect(claims.tokenVersion).toBe(0);
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });

    it('rejects a wrong password with 401 and records a login_failure', async () => {
      setUser();
      await expect(service.login('demo_admin', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.withActor).not.toHaveBeenCalled();
      const failure = prisma.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('core.auth_event'),
      );
      expect(failure?.[1]).toBe('login_failure'); // event_type
    });

    it('rejects an unknown user with 401', async () => {
      userRows = [];
      await expect(service.login('ghost', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('surfaces the forced-change flag and gates the token', async () => {
      setUser({ must_change_password: true });
      const res = await service.login('demo_admin', 'correct horse');
      expect(res.mustChangePassword).toBe(true);
      expect(tokens.verify(res.accessToken).mustChange).toBe(true);
    });

    it('rejects login when an admin-set temp password has expired', async () => {
      setUser({ must_change_password: true, temp_password_expires_at: new Date(Date.now() - 1000) });
      await expect(service.login('demo_admin', 'correct horse')).rejects.toThrow(/expired/i);
    });

    it('rate-limits an account after repeated recent failures (per-account backoff)', async () => {
      setUser();
      failureStat = { n: '6', last: new Date() }; // 6 recent failures, last just now
      await expect(service.login('demo_admin', 'correct horse', '1.2.3.4')).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(prisma.withActor).not.toHaveBeenCalled(); // no login-success side effects
    });
  });

  describe('changePassword', () => {
    it('changes the password, clears the flag, bumps token_version, issues a fresh token', async () => {
      setUser({ must_change_password: true, token_version: 3 });
      const res = await service.changePassword('user-7', 'correct horse', 'a-brand-new-passphrase');

      expect(res.mustChangePassword).toBe(false);
      const claims = tokens.verify(res.accessToken);
      expect(claims.tokenVersion).toBe(4); // bumped 3 -> 4
      expect(claims.mustChange).toBe(false);
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });

    it('rejects a wrong current password with 401', async () => {
      setUser();
      await expect(
        service.changePassword('user-7', 'nope', 'a-brand-new-passphrase'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a too-short new password (policy)', async () => {
      setUser();
      await expect(
        service.changePassword('user-7', 'correct horse', 'short'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a common new password (blocklist)', async () => {
      setUser();
      await expect(
        service.changePassword('user-7', 'correct horse', 'password123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reusing the current password', async () => {
      setUser();
      await expect(
        service.changePassword('user-7', 'correct horse', 'correct horse'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('enrollMfa', () => {
    it('stores a fresh secret and returns an otpauth URI', async () => {
      setUser({ mfa_secret: null });
      const res = await service.enrollMfa('user-7');
      expect(res.secret).toMatch(/^[A-Z2-7]+$/);
      expect(res.otpauthUri).toContain('otpauth://totp/');
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });
  });

  describe('verifyMfa', () => {
    it('mints an mfa:true token when the TOTP code is valid', async () => {
      setUser({ mfa_secret: SECRET });
      const res = await service.verifyMfa('user-7', totp(SECRET));
      const claims = tokens.verify(res.accessToken);
      expect(claims.mfa).toBe(true);
      expect(res.mfaRequired).toBe(false);
    });

    it('activates MFA and audits mfa_enrol on first verification', async () => {
      setUser({ mfa_enabled: false, mfa_secret: SECRET });
      await service.verifyMfa('user-7', totp(SECRET));
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
      const enrol = prisma.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('core.auth_event'),
      );
      expect(enrol?.[1]).toBe('mfa_enrol');
    });

    it('rejects an invalid code with 401', async () => {
      setUser({ mfa_secret: SECRET });
      await expect(service.verifyMfa('user-7', '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects step-up when the user is not enrolled', async () => {
      setUser({ mfa_secret: null });
      await expect(service.verifyMfa('user-7', '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resetMfa (admin)', () => {
    it('clears the target MFA under the admin audit context and audits mfa_reset', async () => {
      setUser({ user_id: 'target-1', username: 'itaramhike' });
      const res = await service.resetMfa('admin-1', 'sys_admin', 'target-1', '10.0.0.9');
      expect(res.ok).toBe(true);
      expect(prisma.withActor).toHaveBeenCalledWith('admin-1', 'sys_admin', expect.any(Function));
      const reset = prisma.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('core.auth_event'),
      );
      expect(reset?.[1]).toBe('mfa_reset');
    });
  });

  it('password hashing round-trips', () => {
    expect(verifyPassword('a-brand-new-passphrase', hashPassword('a-brand-new-passphrase'))).toBe(true);
  });
});
