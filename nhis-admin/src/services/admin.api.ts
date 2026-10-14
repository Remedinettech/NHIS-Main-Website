import type {
  AdminAuditEntry, AdminCreateUserRequest, AdminListResponse, AdminResetPasswordRequest, AdminRole,
  AdminSaveSettingsRequest, AdminSettingsResponse, AdminUpdateUserRequest, AdminUserRecord,
} from '@nhis/shared-types';
import { adminApi } from './client';

/* Users (ADMIN only) */

export interface UserListQuery { q?: string; role?: AdminRole | ''; active?: 'true' | 'false' | ''; page?: number; pageSize?: number }

export const listUsers = (query: UserListQuery, signal?: AbortSignal) =>
  adminApi.getJson<AdminListResponse<AdminUserRecord>>('/users', { signal, query: { ...query } });

/** The create/update responses carry the saved user (either `{ data }` or the record itself). */
type UserResponse = { data: AdminUserRecord } | AdminUserRecord;
const unwrapUser = (body: UserResponse): AdminUserRecord => ('data' in body ? body.data : body);

export const createUser = async (body: AdminCreateUserRequest) => unwrapUser(await adminApi.postJson<UserResponse>('/users', body));
export const updateUser = async (id: string, body: AdminUpdateUserRequest) =>
  unwrapUser(await adminApi.putJson<UserResponse>(`/users/${encodeURIComponent(id)}`, body));
export const resetUserPassword = (id: string, body: AdminResetPasswordRequest) =>
  adminApi.postJson<void>(`/users/${encodeURIComponent(id)}/reset-password`, body);

/* Settings */

export const getSettings = (signal?: AbortSignal) => adminApi.getJson<AdminSettingsResponse>('/settings', { signal });
export const saveSettings = (body: AdminSaveSettingsRequest) => adminApi.putJson<AdminSettingsResponse>('/settings', body);

/* Audit log */

export interface AuditQuery { entityType?: string; entityId?: string; page?: number; pageSize?: number }

export const listAudit = (query: AuditQuery, signal?: AbortSignal) =>
  adminApi.getJson<AdminListResponse<AdminAuditEntry>>('/audit', { signal, query: { ...query } });
