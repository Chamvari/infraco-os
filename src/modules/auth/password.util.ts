import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing for core.app_user.password_hash (PLAT-AUTH-001), using Node's
 * built-in scrypt (no external bcrypt/argon dependency). Stored format:
 *   scrypt$<saltHex>$<keyHex>
 * Verification is constant-time.
 */
const KEYLEN = 32;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(plain, salt, expected.length || KEYLEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
