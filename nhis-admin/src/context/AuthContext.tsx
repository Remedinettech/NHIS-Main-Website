import type { AdminRole, AdminSessionInfo, AdminUserSummary } from '@nhis/shared-types';
import {
  createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { changePassword as changePasswordRequest, fetchSession, login, logout } from '../services/auth.api';
import { adminApi } from '../services/client';
import { ApiError } from '../services/http';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  authenticated: boolean;
  user: AdminUserSummary | null;
  role: AdminRole | undefined;
  /** True after a request found the session expired or revoked (cleared by the next sign-in). */
  sessionExpired: boolean;
  /** True after the user chose Sign out (cleared by the next sign-in). */
  signedOut: boolean;
  /** Signs in. Throws the ApiError so the page can show it by code. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Ends the session on the server, then confirms the session endpoint reports it gone. */
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Re-reads the session (used on focus and on a timer so idle expiry is noticed). */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Holds the signed-in user in memory only. The session itself is an HttpOnly cookie managed by the API; the CSRF
 * token returned with the session stays in this component's memory and is never written to any storage or URL.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const csrfRef = useRef<string | undefined>(undefined);
  const statusRef = useRef<AuthStatus>('loading');

  const apply = useCallback((next: AdminSessionInfo | null) => {
    csrfRef.current = next?.csrfToken;
    statusRef.current = next ? 'authenticated' : 'anonymous';
    setSession(next);
    setStatus(statusRef.current);
  }, []);

  const markExpired = useCallback(() => {
    if (statusRef.current === 'authenticated') setSessionExpired(true);
    apply(null);
  }, [apply]);

  // Wire the HTTP client before any child effect runs.
  useLayoutEffect(() => {
    adminApi.configure({ getCsrfToken: () => csrfRef.current, onUnauthenticated: markExpired });
    return () => adminApi.configure({ getCsrfToken: undefined, onUnauthenticated: undefined });
  }, [markExpired]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSession();
      if (next === null && statusRef.current === 'authenticated') setSessionExpired(true);
      apply(next);
    } catch {
      // The API could not be reached: keep what we know. If we never learned the state, treat as signed out.
      if (statusRef.current === 'loading') apply(null);
    }
  }, [apply]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(tick, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [status, refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await login({ email: email.trim(), password });
    const info = result && result.authenticated === true ? result : await fetchSession();
    if (!info) throw new Error('Sign-in did not create a session');
    setSessionExpired(false);
    setSignedOut(false);
    apply(info);
  }, [apply]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      // A 401 means the session was already gone. Any other failure leaves the user signed in so they can try again.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setSignedOut(true);
    apply(null);
    // Confirm with the server that the session is really gone.
    try { await fetchSession(); } catch { /* the state is already cleared locally */ }
  }, [apply]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await changePasswordRequest({ currentPassword, newPassword });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    authenticated: status === 'authenticated',
    user: session?.user ?? null,
    role: session?.user.role,
    sessionExpired,
    signedOut,
    signIn, signOut, changePassword, refresh,
  }), [status, session, sessionExpired, signedOut, signIn, signOut, changePassword, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
