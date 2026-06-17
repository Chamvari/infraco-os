import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma.service';
import { hashPassword } from './password.util';

/**
 * AuthService.login (PLAT-AUTH-001/004) — verifies credentials against
 * core.app_user (Prisma mocked) and mints a verifiable JWT carrying the user's
 * roles. No database is touched.
 */
describe('AuthService.login', () => {
  let service: AuthService;
  let tokens: TokenService;
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  const USER = {
    user_id: 'user-7',
    username: 'demo_admin',
    password_hash: hashPassword('correct horse'),
    mfa_enabled: true,
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

  it('issues a verifiable token carrying user id + roles + MFA on valid credentials', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([USER]);

    const res = await service.login('demo_admin', 'correct horse');

    expect(res.user.userId).toBe('user-7');
    expect(res.user.roles).toEqual(['sys_admin', 'finance']);
    // The token decodes server-side to the same identity.
    const claims = tokens.verify(res.accessToken);
    expect(claims.sub).toBe('user-7');
    expect(claims.role).toBe('sys_admin');
    expect(claims.roles).toEqual(['sys_admin', 'finance']);
    expect(claims.mfa).toBe(true);
    // last_login_at stamped under the user's own audit context.
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
