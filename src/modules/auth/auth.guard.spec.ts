import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ForcedFlowGuard } from './forced-flow.guard';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma.service';
import { ROLES_KEY, MFA_KEY, IS_PUBLIC_KEY, FORCED_FLOW_EXEMPT_KEY } from './auth.decorators';
import { AuthPrincipal } from './auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Module Z guard tests (PLAT-AUTH-002/003/005). Proves the boundary outcomes:
 *   • no / invalid token / stale token_version / inactive → 401 (JwtAuthGuard)
 *   • pending forced flow → 403 unless the route is exempt (ForcedFlowGuard)
 *   • valid token, insufficient role → 403 (RolesGuard); authorised → allowed
 */
describe('Module Z auth guards', () => {
  let tokens: TokenService;

  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = 'test-secret-key';
    tokens = new TokenService();
  });

  const ctxFor = (req: { headers: Record<string, unknown>; user?: AuthPrincipal }) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  // ----- JwtAuthGuard: authentication (401) --------------------------------

  describe('JwtAuthGuard', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === IS_PUBLIC_KEY ? false : undefined)),
    } as unknown as Reflector;

    const activeState = {
      status: 'active',
      token_version: 0,
      must_change_password: false,
      temp_password_expires_at: null,
      mfa_enabled: true,
    };
    const prismaReturning = (state: unknown) =>
      ({ $queryRawUnsafe: jest.fn().mockResolvedValue(state ? [state] : []) }) as unknown as PrismaService;

    const guardWith = (state: unknown = activeState) =>
      new JwtAuthGuard(reflector, tokens, prismaReturning(state));

    it('rejects a request with NO token (401)', async () => {
      await expect(guardWith().canActivate(ctxFor({ headers: {} }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request with an INVALID token (401)', async () => {
      const ctx = ctxFor({ headers: { authorization: 'Bearer not.a.real.jwt' } });
      await expect(guardWith().canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token signed with the WRONG secret (401)', async () => {
      const forged = new TokenService();
      (forged as unknown as { secret: string }).secret = 'attacker-secret';
      const token = forged.sign({ sub: 'u1', role: 'finance', roles: ['finance'], mfa: false });
      const ctx = ctxFor({ headers: { authorization: `Bearer ${token}` } });
      await expect(guardWith().canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a VALID token and injects the principal (with forced-flow gates)', async () => {
      const token = tokens.sign({
        sub: 'user-123',
        role: 'finance',
        roles: ['finance'],
        mfa: true,
        username: 'fin1',
        tokenVersion: 0,
      });
      const req: { headers: Record<string, unknown>; user?: AuthPrincipal } = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ok = await guardWith().canActivate(ctxFor(req));
      expect(ok).toBe(true);
      expect(req.user).toEqual({
        actorId: 'user-123',
        actorRole: 'finance',
        roles: ['finance'],
        mfa: true,
        username: 'fin1',
        mustChange: false,
        mustEnrolMfa: false,
      });
    });

    it('rejects a token whose tokenVersion is stale (401 — session invalidated)', async () => {
      const token = tokens.sign({
        sub: 'user-123', role: 'finance', roles: ['finance'], mfa: false, tokenVersion: 0,
      });
      const ctx = ctxFor({ headers: { authorization: `Bearer ${token}` } });
      await expect(
        guardWith({ ...activeState, token_version: 5 }).canActivate(ctx),
      ).rejects.toThrow(/invalidated/i);
    });

    it('rejects when the account is no longer active (401)', async () => {
      const token = tokens.sign({
        sub: 'user-123', role: 'finance', roles: ['finance'], mfa: false, tokenVersion: 0,
      });
      const ctx = ctxFor({ headers: { authorization: `Bearer ${token}` } });
      await expect(
        guardWith({ ...activeState, status: 'suspended' }).canActivate(ctx),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ----- ForcedFlowGuard: hard-block pending flows (403) -------------------

  describe('ForcedFlowGuard', () => {
    const ffReflector = (exempt?: string[]) =>
      ({
        getAllAndOverride: jest.fn((key: string) =>
          key === IS_PUBLIC_KEY ? false : key === FORCED_FLOW_EXEMPT_KEY ? exempt : undefined,
        ),
      }) as unknown as Reflector;

    const principal = (over: Partial<AuthPrincipal>): AuthPrincipal => ({
      actorId: 'u1', actorRole: 'registrar', roles: ['registrar'], mfa: false, ...over,
    });

    it('allows any route when no forced flow is pending', () => {
      const guard = new ForcedFlowGuard(ffReflector(undefined));
      expect(guard.canActivate(ctxFor({ headers: {}, user: principal({}) }))).toBe(true);
    });

    it('blocks a non-exempt route while a password change is pending (403)', () => {
      const guard = new ForcedFlowGuard(ffReflector(undefined));
      const ctx = ctxFor({ headers: {}, user: principal({ mustChange: true }) });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows the password-exempt route while a password change is pending', () => {
      const guard = new ForcedFlowGuard(ffReflector(['password']));
      const ctx = ctxFor({ headers: {}, user: principal({ mustChange: true }) });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks a non-exempt route while MFA enrolment is mandated (403)', () => {
      const guard = new ForcedFlowGuard(ffReflector(undefined));
      const ctx = ctxFor({ headers: {}, user: principal({ mustEnrolMfa: true }) });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows the mfa-exempt route while MFA enrolment is mandated', () => {
      const guard = new ForcedFlowGuard(ffReflector(['mfa']));
      const ctx = ctxFor({ headers: {}, user: principal({ mustEnrolMfa: true }) });
      expect(guard.canActivate(ctx)).toBe(true);
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
