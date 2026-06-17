import { signJwt, verifyJwt, JwtError } from './jwt.util';

/** HS256 token primitives (PLAT-AUTH-004): roundtrip, tamper, expiry. */
describe('jwt.util', () => {
  const secret = 'unit-secret';
  const claims = { sub: 'u1', role: 'finance', roles: ['finance'], mfa: false };

  it('signs and verifies a token roundtrip with its claims intact', () => {
    const now = 1_000_000;
    const token = signJwt(claims, secret, 3600, now);
    const decoded = verifyJwt(token, secret, now + 10);
    expect(decoded.sub).toBe('u1');
    expect(decoded.roles).toEqual(['finance']);
    expect(decoded.exp).toBe(now + 3600);
  });

  it('rejects a token whose payload was tampered with', () => {
    const token = signJwt(claims, secret, 3600, 1000);
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...claims, roles: ['sys_admin'], exp: 9_999_999_999 }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => verifyJwt(`${h}.${forgedPayload}.${s}`, secret)).toThrow(JwtError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt(claims, secret, 3600, 1000);
    expect(() => verifyJwt(token, 'other-secret', 1010)).toThrow(/signature/i);
  });

  it('rejects an expired token', () => {
    const now = 1000;
    const token = signJwt(claims, secret, 60, now);
    expect(() => verifyJwt(token, secret, now + 61)).toThrow(/expired/i);
  });
});
