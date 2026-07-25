/**
 * Session store — the single source of truth for the auth token and the
 * principal it represents. Deliberately framework-free (no React) so that
 * api.ts can read the token and clear the session on 401 without importing the
 * component tree (which would create an import cycle). The AuthProvider
 * subscribes via onSessionChange() to mirror this into React state.
 *
 * The token is persisted to localStorage so a refresh keeps you signed in; it
 * is the verbatim JWT minted by POST /auth/login. We never decode or trust it
 * client-side — it is an opaque bearer credential the backend re-verifies on
 * every request.
 */

const TOKEN_KEY = 'infraco.token';
const USER_KEY = 'infraco.user';

/** Mirrors LoginResult.user from the backend (auth.service.ts). */
export interface SessionUser {
  userId: string;
  username: string;
  roles: string[];
  mfaEnabled: boolean;
  /** Forced first-login password change pending — gates the app to the reset screen. */
  mustChangePassword?: boolean;
  /** Role-mandated MFA enrolment pending — gates the app to the enrol screen. */
  mustEnrolMfa?: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null; // corrupt entry — treat as signed out
  }
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
}

/** Subscribe to session changes (login/logout/expiry). Returns an unsubscribe. */
export function onSessionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}
