import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';
import { ROLES_KEY, MFA_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { AuthPrincipal } from './auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Module Z guard tests (PLAT-AUTH-002/003/005). Proves the three required
 * outcomes at the HTTP boundary:
 *   • no / invalid token            → 401 (JwtAuthGuard)
 *   • valid token, insufficient role → 403 (RolesGuard)
 *   • valid token, authorised        → allowed
 * Plus the MFA gate for sensitive actions.
 */
describe('Module Z auth guards', () => {
  let tokens: TokenService;

  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = 'test-secret-key';
    tokens = new TokenService();
  });

  /** Build an ExecutionContext around a fixed request object. */
  const ctxFor = (req: { headers: Record<string, unknown>; user?: AuthPrincipal }) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  // ----- JwtAuthGuard: authentication (401) --------------------------------

  describe('JwtAuthGuard', () => {
    // Not public for these tests.
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === IS_PUBLIC_KEY ? false : undefined)),
    } as unknown as Reflector;
    // Built in beforeAll so `tokens` (set by the outer beforeAll) is ready.
    let guard: JwtAuthGuard;
    beforeAll(() => {
      guard = new JwtAuthGuard(reflector, tokens);
    });

    it('rejects a request with NO token (401)', () => {
      const ctx = ctxFor({ headers: {} });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rejects a request with an INVALID token (401)', () => {
      const ctx = ctxFor({ headers: { authorization: 'Bearer not.a.real.jwt' } });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rejects a token signed with the WRONG secret (401)', () => {
      const forged = new TokenService();
      (forged as unknown as { secret: string }).secret = 'attacker-secret';
      const token = forged.sign({ sub: 'u1', role: 'finance', roles: ['finance'], mfa: false });
      const ctx = ctxFor({ headers: { authorization: `Bearer ${token}` } });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('accepts a VALID token and injects the principal into req.user', () => {
      const token = tokens.sign({
        sub: 'user-123',
        role: 'finance',
        roles: ['finance'],
        mfa: true,
        username: 'fin1',
      });
      const req: { headers: Record<string, unknown>; user?: AuthPrincipal } = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ok = guard.canActivate(ctxFor(req));
      expect(ok).toBe(true);
      // Identity is now SERVER-SIDE on the request, derived from the token.
      expect(req.user).toEqual({
        actorId: 'user-123',
        actorRole: 'finance',
        roles: ['finance'],
        mfa: true,
        username: 'fin1',
      });
    });
  });

  // ----- RolesGuard: authorisation (403 / allow) ---------------------------

  describe('RolesGuard', () => {
    const makeGuard = (required?: string[], requiresMfa?: boolean) => {
      const reflector = {
        getAllAndOverride: jest.fn((key: string) =>
          key === ROLES_KEY ? required : key === MFA_KEY ? requiresMfa : undefined,
        ),
      } as unknown as Reflector;
      return new RolesGuard(reflector);
    };

    const principal = (roles: string[], mfa = false): AuthPrincipal => ({
      actorId: 'u1',
      actorRole: roles[0],
      roles,
      mfa,
    });

    it('denies a valid token with INSUFFICIENT role (403)', () => {
      const guard = makeGuard(['finance_mgr']);
      const ctx = ctxFor({ headers: {}, user: principal(['sales_agent']) });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows a valid token with a SUFFICIENT role', () => {
      const guard = makeGuard(['finance', 'finance_mgr']);
      const ctx = ctxFor({ headers: {}, user: principal(['finance']) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows an authenticated request when the route has NO @Roles/@Mfa', () => {
      const guard = makeGuard(undefined, undefined);
      const ctx = ctxFor({ headers: {}, user: principal(['exec']) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('denies a sensitive @Mfa action when MFA is NOT satisfied (403)', () => {
      const guard = makeGuard(['finance_mgr'], true);
      const ctx = ctxFor({ headers: {}, user: principal(['finance_mgr'], false) });
      expect(() => guard.canActivate(ctx)).toThrow(/MFA/);
    });

    it('allows a sensitive @Mfa action when MFA IS satisfied', () => {
      const guard = makeGuard(['finance_mgr'], true);
      const ctx = ctxFor({ headers: {}, user: principal(['finance_mgr'], true) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    // ----- Read-side RBAC: the read_* groups gate GET endpoints -------------

    it('read_finance: allows an oversight role (exec) to read', () => {
      const guard = makeGuard(ROLE_GROUPS.read_finance);
      const ctx = ctxFor({ headers: {}, user: principal(['exec']) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('read_finance: allows internal_audit to read', () => {
      const guard = makeGuard(ROLE_GROUPS.read_finance);
      const ctx = ctxFor({ headers: {}, user: principal(['internal_audit']) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('read_finance: denies an unrelated role (field_team) reading finance (403)', () => {
      const guard = makeGuard(ROLE_GROUPS.read_finance);
      const ctx = ctxFor({ headers: {}, user: principal(['field_team']) });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('read_sales: denies a finance-only user reading sales inventory (403)', () => {
      const guard = makeGuard(ROLE_GROUPS.read_sales);
      const ctx = ctxFor({ headers: {}, user: principal(['finance']) });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
