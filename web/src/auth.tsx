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
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getUser);

  // Mirror external session changes (login on another tab, 401-triggered
  // clears in api.ts) into React state.
  useEffect(() => onSessionChange(() => setUser(getUser())), []);

  async function login(username: string, password: string): Promise<void> {
    const { accessToken, user: principal } = await api.login(username, password);
    setSession(accessToken, principal); // notifies -> setUser via subscription
  }

  function logout(): void {
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
