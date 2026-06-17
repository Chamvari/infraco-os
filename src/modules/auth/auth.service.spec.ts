import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma.service';
import { hashPassword } from './password.util';
import { base32Encode, totp } from './totp.util';

/**
 * AuthService (PLAT-AUTH-001/003/004) — verifies credentials against
 * core.app_user (Prisma mocked), mints a verifiable JWT, and enforces a real
 * TOTP second factor for the mfa:true step-up. No database is touched.
 */
describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  // RFC 6238 reference seed in base32 — used to mint matching codes.
  const SECRET = base32Encode(Buffer.from('12345678901234567890'));

  const USER = {
    user_id: 'user-7',
    username: 'demo_admin',
    password_hash: hashPassword('correct horse'),
    mfa_enabled: true,
    mfa_secret: null as string | null,
    roles: ['sys_admin', 'finance'],
  };

  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = 'svc-test-secret';
  });

  beforeEach(() => {
    tokens = new TokenService();
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn((_id, _role, fn) => fn({ $executeRawUnsafe: jest.fn() })),
    };
    service = new AuthService(prisma as unknown as PrismaService, tokens);
  });

  describe('login', () => {
    it('issues a verifiable token but does NOT satisfy MFA at first-factor login', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([USER]);

      const res = await service.login('demo_admin', 'correct horse');

      expect(res.user.userId).toBe('user-7');
      expect(res.user.roles).toEqual(['sys_admin', 'finance']);
      expect(res.mfaRequired).toBe(true); // user has MFA enabled → step-up needed
      const claims = tokens.verify(res.accessToken);
      expect(claims.sub).toBe('user-7');
      expect(claims.role).toBe('sys_admin');
      expect(claims.roles).toEqual(['sys_admin', 'finance']);
      expect(claims.mfa).toBe(false); // passive flag removed — never true at login
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });

    it('rejects a wrong password with 401 (no token issued)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([USER]);
      await expect(service.login('demo_admin', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('rejects an unknown user with 401', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(service.login('ghost', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('enrollMfa', () => {
    it('stores a fresh secret and returns an otpauth URI', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ ...USER, mfa_secret: null }]);

      const res = await service.enrollMfa('user-7');

      expect(res.secret).toMatch(/^[A-Z2-7]+$/);
      expect(res.otpauthUri).toContain('otpauth://totp/');
      expect(res.otpauthUri).toContain(`secret=${res.secret}`);
      // Secret persisted under the user's own audit context.
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });
  });

  describe('verifyMfa', () => {
    it('mints an mfa:true token when the TOTP code is valid', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ ...USER, mfa_secret: SECRET }]);

      const res = await service.verifyMfa('user-7', totp(SECRET));

      const claims = tokens.verify(res.accessToken);
      expect(claims.mfa).toBe(true);
      expect(claims.roles).toEqual(['sys_admin', 'finance']);
      expect(res.mfaRequired).toBe(false);
    });

    it('activates MFA on first successful verification', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        { ...USER, mfa_enabled: false, mfa_secret: SECRET },
      ]);

      await service.verifyMfa('user-7', totp(SECRET));

      // mfa_enabled flipped true under audit context.
      expect(prisma.withActor).toHaveBeenCalledWith('user-7', 'sys_admin', expect.any(Function));
    });

    it('rejects an invalid code with 401', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ ...USER, mfa_secret: SECRET }]);
      await expect(service.verifyMfa('user-7', '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects step-up when the user is not enrolled', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ ...USER, mfa_secret: null }]);
      await expect(service.verifyMfa('user-7', '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
