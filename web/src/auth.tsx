import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import {
  clearSession,
  getUser,
  onSessionChange,
  setSession,
  type SessionUser,
} from './session';

/**
 * Auth context — exposes the current principal plus login()/logout() to the
 * component tree. State is seeded from (and kept in sync with) the framework-
 * free session store, so a 401 anywhere in api.ts can clearSession() and this
 * provider will react by dropping the user, bouncing the app back to login.
 */
interface AuthState {
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  enrollMfa: () => Promise<{ secret: string; otpauthUri: string }>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getUser);

  // Mirror external session changes (login on another tab, 401-triggered
  // clears in api.ts) into React state.
  useEffect(() => onSessionChange(() => setUser(getUser())), []);

  // Merge the top-level forced-flow flags onto the stored principal so the App
  // gate (change-password / MFA-enrol) can read them off `user`.
  function persist(res: {
    accessToken: string;
    user: SessionUser;
    mustChangePassword: boolean;
    mustEnrolMfa: boolean;
  }): void {
    setSession(res.accessToken, {
      ...res.user,
      mustChangePassword: res.mustChangePassword,
      mustEnrolMfa: res.mustEnrolMfa,
    });
  }

  async function login(username: string, password: string): Promise<void> {
    persist(await api.login(username, password));
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    persist(await api.changePassword(currentPassword, newPassword));
  }

  function enrollMfa(): Promise<{ secret: string; otpauthUri: string }> {
    return api.mfaEnroll();
  }

  async function verifyMfa(code: string): Promise<void> {
    persist(await api.mfaVerify(code));
  }

  function logout(): void {
    clearSession();
  }

  return (
    <AuthContext.Provider
      value={{ user, login, changePassword, enrollMfa, verifyMfa, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
