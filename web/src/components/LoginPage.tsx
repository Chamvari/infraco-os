import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

/**
 * Sign-in screen. Shown by App whenever there is no authenticated principal.
 * Posts credentials to POST /auth/login via useAuth().login(); on success the
 * session store updates and App swaps this out for the dashboards.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card form" onSubmit={onSubmit}>
        <div className="brand login-brand">
          InfraCo OS <span className="brand-sub">Admin</span>
        </div>
        <p className="hint">Sign in to continue.</p>

        <label>
          Username
          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          className="btn"
          type="submit"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <div className="banner error">{error}</div>}
      </form>
    </div>
  );
}
