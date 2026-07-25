import { useAuth } from '../auth';
import { ChangePasswordForm } from './ChangePasswordForm';
import lfiLogo from '../assets/lfi-logo.png';

/**
 * Full-screen forced password change — shown by App when the session principal
 * has mustChangePassword set (first login on an admin-issued temporary password).
 * The backend hard-blocks every other route until this completes; on success the
 * session updates (mustChangePassword=false) and App swaps to the next gate/app.
 */
export function ForcePasswordChange() {
  const { user, logout } = useAuth();

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
          Set a new password for <strong>{user?.username}</strong> before continuing.
        </p>

        <ChangePasswordForm submitLabel="Set new password" />

        <button className="btn ghost small" style={{ marginTop: 12 }} onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
