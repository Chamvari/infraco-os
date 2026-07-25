import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import lfiLogo from '../assets/lfi-logo.png';

/**
 * Full-screen forced MFA enrolment — shown by App when the session principal has
 * mustEnrolMfa set (a sys_admin / finance_mgr without MFA). The backend hard-
 * blocks every other route until enrolment completes. We fetch a fresh TOTP
 * secret, the user adds it to an authenticator app, and a valid 6-digit code
 * activates MFA (session updates, App swaps to the app).
 */
export function ForceMfaEnrol() {
  const { user, enrollMfa, verifyMfa, logout } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [enrolError, setEnrolError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    enrollMfa()
      .then((r) => live && setSecret(r.secret))
      .catch((e) =>
        live && setEnrolError(e instanceof Error ? e.message : 'Could not start enrolment.'),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  const role = user?.roles?.[0] ?? 'your role';

  return (
    <div className="login">
      <div className="login-card form">
        <div className="login-logo">
          <img src={lfiLogo} alt="Land Fortune Infrastructure" />
        </div>
        <div className="brand login-brand">
          InfraCo OS <span className="brand-sub">Admin</span>
        </div>
        <p className="hint">
          Multi-factor authentication is required for <strong>{role}</strong>. Add
          this secret to an authenticator app (Google Authenticator, Authy, …),
          then enter the current 6-digit code to finish.
        </p>

        {enrolError && <div className="banner error">{enrolError}</div>}
        {!secret && !enrolError && <p className="hint">Generating your secret…</p>}
        {secret && (
          <label>
            Authenticator secret
            <input
              type="text"
              readOnly
              value={secret}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        )}

        <form className="form" onSubmit={submit}>
          <label>
            6-digit code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {error && <div className="banner error">{error}</div>}
          <button className="btn" type="submit" disabled={busy || !secret || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify & enable MFA'}
          </button>
        </form>

        <button className="btn ghost small" style={{ marginTop: 12 }} onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
