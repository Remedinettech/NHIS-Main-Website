import { adminApi } from './client';

/*
 * Excel imports (nhis-api modules/imports). Preview is a dry run that changes nothing and returns a signed token; confirm
 * creates a persistent job from that token; process runs the next batch of rows of a job (and can be repeated until DONE);
 * history lists the signed-in user's latest jobs.
 */

export interface ImportRowIssue { field: string; message: string }

export interface ImportPreviewRow {
  row: number;
  id: string;
  kind: 'new' | 'update' | 'duplicate' | 'invalid';
  values: unknown;
  errors: ImportRowIssue[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  valid: boolean;
  /** Present only when every row is valid. Valid for about 30 minutes and only for the user who previewed. */
  token: string | null;
  limits: { bytes: number; rows: number };
}

export interface ImportResult { row: number; id: string; state: 'created' | 'updated' | 'failed' | 'skipped'; message?: string }

export interface ImportJob {
  id: string;
  module: string;
  mode: string;
  /** RUNNING until every row was processed, then DONE. */
  state: string;
  /** Rows processed so far. */
  cursor: number;
  total: number;
  createdAt: string;
  counts: Partial<Record<ImportResult['state'], number>>;
  results: ImportResult[];
}

export const previewImport = (form: FormData, signal?: AbortSignal): Promise<ImportPreview> =>
  adminApi.upload<ImportPreview>('/imports/preview', form, { signal });

export const confirmImport = async (token: string): Promise<ImportJob> =>
  (await adminApi.postJson<{ data: ImportJob }>('/imports/confirm', { token })).data;

/** Runs the next batch of rows (at most 10). Rows that were already processed are never repeated by the server. */
export const processImport = async (jobId: string): Promise<ImportJob> =>
  (await adminApi.postJson<{ data: ImportJob }>(`/imports/${encodeURIComponent(jobId)}/process`, {})).data;

export const listImports = async (module: string, signal?: AbortSignal): Promise<ImportJob[]> =>
  (await adminApi.getJson<{ data: ImportJob[] }>('/imports', { signal, query: { module } })).data;

/** Path (under the API base) of the template workbook of a module. Contacts need the directory: its columns are part of the template. */
export function importTemplatePath(module: string, directoryId: string): string {
  const query = new URLSearchParams({ module });
  if (module === 'contacts') query.set('directoryId', directoryId);
  return `/admin/imports/template?${query.toString()}`;
}
