import type { AdminDocument, AdminListResponse, AdminSiteContent, HelplineEntry, SiteContentKey } from '@nhis/shared-types';
import { CATEGORY_LABELS } from '../config/app';
import { adminApi } from './client';
import { listRecords } from './records.api';

/** GET /admin/site-content: the six documents in a fixed order (documents that were never saved are virtual rows). */
export async function listSiteContent(signal?: AbortSignal): Promise<AdminSiteContent[]> {
  const body = await adminApi.getJson<{ data: AdminSiteContent[] } | AdminSiteContent[]>('/site-content', { signal });
  return Array.isArray(body) ? body : body.data;
}

/** GET /admin/site-content/:key. The editors load it through RecordEditor; this is for other callers. */
export async function getSiteContent<K extends SiteContentKey>(key: K, signal?: AbortSignal): Promise<AdminSiteContent<K>> {
  const body = await adminApi.getJson<{ data: AdminSiteContent<K> } | AdminSiteContent<K>>(`/site-content/${encodeURIComponent(key)}`, { signal });
  return 'data' in body ? body.data : body;
}

/* ------------------------------------------------------------------ documents for the link picker */

export interface SiteDocumentOption {
  /** Documents-module id (LinkTarget `documentId`). */
  value: string;
  /** Title and category, for example "Enrolment annexure form (Enrolment form)". */
  label: string;
  /** Only published documents are shown on the website; the others are hidden until they are published. */
  published: boolean;
}

const PAGE_SIZE = 100;
/** The list is small and rarely changes, so editors that open together share one request. */
const CACHE_MS = 20_000;
const MAX_PAGES = 5;

let cached: { at: number; request: Promise<SiteDocumentOption[]> } | null = null;

async function fetchDocumentOptions(): Promise<SiteDocumentOption[]> {
  const options: SiteDocumentOption[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result: AdminListResponse<AdminDocument> = await listRecords<AdminDocument>('documents', { pageSize: PAGE_SIZE, page, status: 'ALL' });
    for (const document of result.data) {
      if (document.meta.status === 'ARCHIVED') continue;
      const title = document.values.titleEn || document.values.labelEn || document.id;
      options.push({
        value: document.id,
        label: `${title} (${CATEGORY_LABELS[document.values.category] ?? document.values.category}${document.meta.status === 'PUBLISHED' ? '' : ', not published'})`,
        published: document.meta.status === 'PUBLISHED',
      });
    }
    if (page >= result.totalPages) break;
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

/** Documents (any status except archived) that a link may point to. Cached briefly; failures are never cached. */
export function loadSiteDocumentOptions(): Promise<SiteDocumentOption[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.request;
  const request = fetchDocumentOptions().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  cached = { at: Date.now(), request };
  return request;
}

/* ------------------------------------------------------------------ helplines for the pathway picker */

let cachedHelplines: { at: number; request: Promise<HelplineEntry[]> } | null = null;

/**
 * The helplines of the header document as the editor of the header would show them (draft, else published, else built-in),
 * for the helpline picker of the homepage pathways. Cached briefly; failures are never cached.
 */
export function loadHeaderHelplines(): Promise<HelplineEntry[]> {
  if (cachedHelplines && Date.now() - cachedHelplines.at < CACHE_MS) return cachedHelplines.request;
  const request = getSiteContent('header').then((header) => header.values.helplines).catch((error: unknown) => {
    cachedHelplines = null;
    throw error;
  });
  cachedHelplines = { at: Date.now(), request };
  return request;
}
