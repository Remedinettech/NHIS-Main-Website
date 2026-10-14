import crypto from 'node:crypto';
import type { AdminAsset } from '@nhis/shared-types';
import type { MediaAsset, PublicationStatus } from '@prisma/client';
import { queryEnum, queryString, type Paging, type Tx, type Validator } from '../../common/admin';
import type { getDb } from '../../common/admin';

export const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/** Short random id fragment (24 hex characters). */
export const randomId = (): string => crypto.randomBytes(12).toString('hex');

/** Optional text field: '' when absent. Length-checked; multiline keeps line breaks. */
export function optionalText(v: Validator, value: unknown, field: string, max: number, multiline = false): string {
  return v.string(value, field, { max, optional: true, multiline }) ?? '';
}

export function toAsset(a: Pick<MediaAsset, 'id' | 'kind' | 'originalName' | 'mimeType' | 'bytes' | 'sha256' | 'createdAt'>): AdminAsset {
  return {
    id: a.id,
    kind: a.kind,
    originalName: a.originalName,
    mimeType: a.mimeType,
    bytes: a.bytes,
    sha256: a.sha256,
    createdAt: a.createdAt.toISOString(),
    adminUrl: `/api/v1/admin/files/${a.id}`,
  };
}

/** Common list filters: free text, status (default: every status). */
export function listFilters(params: URLSearchParams): { q: string | undefined; status: PublicationStatus | undefined } {
  const q = queryString(params, 'q', 200);
  const raw = queryEnum(params, 'status', ['ALL', ...STATUSES] as const);
  return { q, status: raw && raw !== 'ALL' ? raw : undefined };
}

/** Words of a search text (lower-cased, whitespace-normalised) for AND-matching against a searchText column. */
export function searchWords(q: string | undefined): string[] {
  if (!q) return [];
  return q.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase().split(' ').filter(Boolean).slice(0, 8);
}

export type Db = ReturnType<typeof getDb>;

/** One content module: how to parse its values and how to list it. */
export interface ModuleDefinition<F, Row> {
  parseValues(v: Validator, input: unknown, context: { db: Db | Tx; id?: string; scope?: string }): Promise<F>;
  list(db: Db, params: URLSearchParams, paging: Paging): Promise<{ rows: Row[]; total: number }>;
  /** Extracts the scope (e.g. directory id) from a create body. */
  parseScope?(v: Validator, body: Record<string, unknown>, db: Db): Promise<string>;
}
