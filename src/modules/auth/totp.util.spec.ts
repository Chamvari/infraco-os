import {
  base32Decode,
  base32Encode,
  generateSecret,
  totp,
  verifyTotp,
  otpauthUri,
} from './totp.util';

/**
 * TOTP (RFC 6238) — validated against the SHA1 reference vectors in Appendix B
 * of the RFC, using the canonical seed "12345678901234567890".
 */
describe('totp.util', () => {
  // ASCII "12345678901234567890" in base32.
  const SECRET = base32Encode(Buffer.from('12345678901234567890'));

  it('encodes the RFC seed to the expected base32', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('base32 round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
  ])('matches the RFC 6238 vector at T=%i', (tSeconds, expected) => {
    expect(totp(SECRET, { nowMs: tSeconds * 1000 })).toBe(expected);
  });

  it('verifies the current code', () => {
    const nowMs = 1234567890 * 1000;
    expect(verifyTotp(SECRET, '005924', { nowMs })).toBe(true);
  });

  it('accepts a code from the previous step (clock skew, window ±1)', () => {
    const nowMs = 1234567890 * 1000;
    const prev = totp(SECRET, { nowMs: nowMs - 30_000 });
    expect(verifyTotp(SECRET, prev, { nowMs })).toBe(true);
  });

  it('rejects a code two steps away', () => {
    const nowMs = 1234567890 * 1000;
    const old = totp(SECRET, { nowMs: nowMs - 90_000 });
    expect(verifyTotp(SECRET, old, { nowMs })).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyTotp(SECRET, 'abc', {})).toBe(false);
    expect(verifyTotp(SECRET, '12345', {})).toBe(false); // too short
    expect(verifyTotp(SECRET, '', {})).toBe(false);
  });

  it('generates a usable secret that produces verifiable codes', () => {
    const secret = generateSecret();
    const nowMs = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, { nowMs }), { nowMs })).toBe(true);
  });

  it('builds an otpauth URI carrying the secret and issuer', () => {
    const uri = otpauthUri(SECRET, 'demo_finmgr@lfh.test', 'InfraCo OS');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${SECRET}`);
    expect(uri).toContain('issuer=InfraCo+OS');
  });
});
