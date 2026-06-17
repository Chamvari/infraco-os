import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Dependency-free TOTP (RFC 6238) over HOTP (RFC 4226) — PLAT-AUTH-003.
 *
 * Like the project's hand-rolled JWT and scrypt helpers, this ships no external
 * package: HMAC-SHA1 one-time codes on Node's built-in crypto, compatible with
 * Google Authenticator / Authy / 1Password (base32 secret, 30s step, 6 digits).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648 base32
const DEFAULT_PERIOD = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1; // accept ±1 step (±30s) for clock skew

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new random base32 secret (default 20 bytes = 160 bits, per RFC). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP — RFC 4226 dynamic truncation of HMAC-SHA1(secret, counter). */
function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

interface TotpOpts {
  nowMs?: number;
  period?: number;
  digits?: number;
}

/** Current TOTP code for a base32 secret. nowMs is injectable for tests. */
export function totp(secretBase32: string, opts: TotpOpts = {}): string {
  const period = opts.period ?? DEFAULT_PERIOD;
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const nowMs = opts.nowMs ?? Date.now();
  const counter = Math.floor(nowMs / 1000 / period);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verify a user-supplied code against the secret, scanning ±window steps for
 * clock skew. Constant-time comparison; rejects malformed input.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: TotpOpts & { window?: number } = {},
): boolean {
  const period = opts.period ?? DEFAULT_PERIOD;
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const window = opts.window ?? DEFAULT_WINDOW;
  const nowMs = opts.nowMs ?? Date.now();

  const trimmed = (code ?? '').trim();
  if (!new RegExp(`^[0-9]{${digits}}$`).test(trimmed)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(nowMs / 1000 / period);
  const expected = Buffer.from(trimmed);
  for (let w = -window; w <= window; w++) {
    const candidate = Buffer.from(hotp(secret, counter + w, digits));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// provisioning URI for QR enrolment in an authenticator app. */
export function otpauthUri(
  secretBase32: string,
  account: string,
  issuer = 'InfraCo OS',
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
