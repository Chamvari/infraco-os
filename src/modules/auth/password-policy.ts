/**
 * Password policy (PLAT-AUTH-001), aligned to NIST SP 800-63B:
 *   - minimum length 12
 *   - must differ from the current password
 *   - rejected if it appears in a static common/trivially-guessed blocklist
 *
 * DELIBERATELY NO composition rules (upper/lower/symbol) and NO expiry — SP
 * 800-63B §5.1.1 advises against both. This is the single source of password
 * rules; the change-password endpoint is the only caller.
 */

export const MIN_PASSWORD_LENGTH = 12;

// Static blocklist of the most common / trivially-guessed passwords. NOT
// exhaustive — a hardened deployment should additionally check a breached-
// password corpus (e.g. HaveIBeenPwned k-anonymity range API), tracked
// separately so no full password or hash ever leaves the box.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  'p@ssword', '123456', '1234567', '12345678', '123456789', '1234567890',
  '12345678910', 'qwerty', 'qwertyuiop', 'qwerty123', 'admin', 'administrator',
  'root', 'letmein', 'welcome', 'welcome1', 'welcome123', 'iloveyou', 'monkey',
  'dragon', 'sunshine', 'princess', 'football', 'baseball', 'abc123', 'abcd1234',
  'a1b2c3d4', 'changeme', 'changeme123', 'default', 'secret', 'test1234',
  'temp1234', 'infraco', 'infraco123', 'infracoos', 'zimbabwe', 'zimbabwe1',
  'harare123', 'landfortune', 'trustno1', 'whatever', 'superman', 'batman',
  'master', 'access', 'login', 'guest', 'temporary', 'temppass',
]);

export interface PasswordPolicyResult {
  ok: boolean;
  error?: string;
}

/** Validate a proposed new password. Returns { ok:false, error } on rejection. */
export function checkPasswordPolicy(
  newPassword: string,
  currentPassword?: string,
): PasswordPolicyResult {
  const pw = String(newPassword ?? '');
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (currentPassword != null && pw === currentPassword) {
    return { ok: false, error: 'New password must differ from the current password.' };
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Choose a less predictable one.' };
  }
  return { ok: true };
}
