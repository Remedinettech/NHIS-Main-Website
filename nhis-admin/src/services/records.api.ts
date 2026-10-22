import type { AdminItemResponse, AdminListQuery, AdminListResponse } from '@nhis/shared-types';
import type { RecordAction } from '../utils/capabilities';
import { adminApi } from './client';

/**
 * Content modules that share the standard record routes (docs/admin-backend-design.md). "site-content" is addressed by
 * document key (header, navigation, home, partners, footer, text) and has no create or list-with-paging route.
 */
export type ModuleName = 'hospitals' | 'pages' | 'documents' | 'contacts' | 'announcements' | 'gallery' | 'site-content';

export type RecordListQuery = AdminListQuery & Record<string, string | number | undefined>;

const seg = (value: string) => encodeURIComponent(value);

export const listRecords = <T>(module: ModuleName, query: RecordListQuery, signal?: AbortSignal) =>
  adminApi.getJson<AdminListResponse<T>>(`/${module}`, { signal, query: { ...query } });

export const getRecord = async <T>(module: ModuleName, id: string, signal?: AbortSignal): Promise<T> =>
  (await adminApi.getJson<AdminItemResponse<T>>(`/${module}/${seg(id)}`, { signal })).data;

export const createRecord = async <T, V>(module: ModuleName, body: V): Promise<T> =>
  (await adminApi.postJson<AdminItemResponse<T>>(`/${module}`, body)).data;

export const saveRecord = async <T, V>(module: ModuleName, id: string, values: V, expectedVersion: number): Promise<T> =>
  (await adminApi.putJson<AdminItemResponse<T>>(`/${module}/${seg(id)}`, { values, expectedVersion })).data;

/** The standard routes for state changes. `edit` is not a request; the caller navigates to the editor. */
export type RecordRequestAction = Exclude<RecordAction, 'edit'>;

export const ACTION_PATH: Record<Exclude<RecordRequestAction, 'delete'>, string> = {
  publish: 'publish',
  unpublish: 'unpublish',
  archive: 'archive',
  restore: 'restore',
  'discard-draft': 'discard-draft',
};

/**
 * Runs publish / unpublish / archive / restore / discard-draft (POST) or delete (DELETE) with the version
 * the user was looking at. A stale version answers 409 CONFLICT. Never retried.
 */
export async function runRecordAction(module: ModuleName, id: string, action: RecordRequestAction, expectedVersion: number): Promise<void> {
  if (action === 'delete') {
    await adminApi.deleteJson<void>(`/${module}/${seg(id)}`, { expectedVersion });
    return;
  }
  await adminApi.postJson<unknown>(`/${module}/${seg(id)}/${ACTION_PATH[action]}`, { expectedVersion });
}
