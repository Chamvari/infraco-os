import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

/**
 * Reusable change-password form — used by the forced first-login reset screen
 * and by the in-app "Change password" panel. Mirrors the backend policy
 * (≥12 chars; no composition rules / expiry, per NIST SP 800-63B). The server
 * remains the source of truth (blocklist, "must differ", etc.); this just gives
 * fast inline feedback.
 */
export function ChangePasswordForm({
  submitLabel = 'Update password',
  onCancel,
  onDone,
}: {
  submitLabel?: string;
  onCancel?: () => void;
  onDone?: () => void;
}) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 12;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = !busy && !!current && next.length >= 12 && next === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      setOk(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <p className="hint">
        At least 12 characters, and not a common password. No upper/symbol rules,
        no forced expiry.
      </p>

      {tooShort && <div className="banner error">New password must be at least 12 characters.</div>}
      {mismatch && <div className="banner error">The new passwords don’t match.</div>}
      {error && <div className="banner error">{error}</div>}
      {ok && <div className="banner success">Password updated.</div>}

      <div className="form-row">
        <button className="btn" type="submit" disabled={!canSubmit}>
          {busy ? 'Updating…' : submitLabel}
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
