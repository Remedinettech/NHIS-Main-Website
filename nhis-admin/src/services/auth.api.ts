import type { AdminChangePasswordRequest, AdminLoginRequest, AdminSessionAbsent, AdminSessionInfo } from '@nhis/shared-types';
import { adminApi } from './client';
import { ApiError } from './http';

export type SessionResponse = AdminSessionInfo | AdminSessionAbsent;

/** Reads the session. A 401 here simply means "not signed in", so it never triggers the expired-session handler. */
export async function fetchSession(signal?: AbortSignal): Promise<AdminSessionInfo | null> {
  try {
    const body = await adminApi.getJson<SessionResponse>('/auth/session', { signal, skipUnauthenticatedHandler: true });
    return body && body.authenticated === true ? body : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const login = (body: AdminLoginRequest): Promise<AdminSessionInfo> =>
  adminApi.postJson<AdminSessionInfo>('/auth/login', body, { skipUnauthenticatedHandler: true });

export const logout = (): Promise<void> => adminApi.postJson<void>('/auth/logout', {}, { skipUnauthenticatedHandler: true });

export const changePassword = (body: AdminChangePasswordRequest): Promise<void> => adminApi.postJson<void>('/auth/change-password', body);
