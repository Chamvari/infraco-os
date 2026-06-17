import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal dependency-free HS256 JSON Web Tokens (PLAT-AUTH-001/004).
 *
 * The project intentionally ships no JWT npm package; this implements the subset
 * of RFC 7519 we need (HMAC-SHA256, exp claim) on Node's built-in crypto. Tokens
 * are signed server-side at login and verified by the JwtAuthGuard on every
 * protected request — the client never supplies identity any other way.
 */
export interface JwtClaims {
  /** subject — core.app_user.user_id (becomes actorId). */
  sub: string;
  /** primary role code (becomes actorRole). */
  role: string;
  /** all role codes granted to the user (for RBAC). */
  roles: string[];
  /** MFA capability flag, from core.app_user.mfa_enabled (PLAT-AUTH-005). */
  mfa: boolean;
  username?: string;
  /** issued-at / expiry (epoch seconds) — set by sign(). */
  iat?: number;
  exp?: number;
}

const HEADER = { alg: 'HS256', typ: 'JWT' };

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function sign(signingInput: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(signingInput).digest());
}

/** Issue a signed token. `nowSec` is injectable for deterministic tests. */
export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const payload: JwtClaims = { ...claims, iat: nowSec, exp: nowSec + ttlSeconds };
  const head = b64urlJson(HEADER);
  const body = b64urlJson(payload);
  const sig = sign(`${head}.${body}`, secret);
  return `${head}.${body}.${sig}`;
}

export class JwtError extends Error {}

/**
 * Verify signature + expiry and return the claims. Throws JwtError on any
 * malformed / tampered / expired token — callers map this to HTTP 401.
 */
export function verifyJwt(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed token');
  const [head, body, sig] = parts;

  const expected = sign(`${head}.${body}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Constant-time compare; length guard first (timingSafeEqual throws on mismatch).
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new JwtError('Bad signature');
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  } catch {
    throw new JwtError('Bad payload');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
    throw new JwtError('Token expired');
  }
  return claims;
}
