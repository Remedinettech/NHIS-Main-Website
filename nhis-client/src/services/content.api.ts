import type {
  ContactDirectoryId, ContactDirectoryIndexResponse, ContactDirectoryResponse, DocumentListResponse,
  GalleryResponse, PageResponse, PageSlug, SiteSettingsResponse,
} from '@nhis/shared-types';
import { REVALIDATE_TTL_MS, getCached } from './http';
import { getPreviewPage, isPreviewMode } from './siteContent.api';

/*
 * Content that the administration publishes. Every request is reused for REVALIDATE_TTL_MS only, and the hooks of these
 * endpoints ask again when the visitor returns to an open tab (hooks/useContent.ts), so a publish shows up without a
 * reload and without a request for every focus event.
 */
const FRESH = { ttlMs: REVALIDATE_TTL_MS };

/** In preview mode the page comes with its pending draft from the administration (see siteContent.api.ts). */
export const getPage = (slug: PageSlug, signal?: AbortSignal): Promise<PageResponse> => {
  const published = () => getCached<PageResponse>(`/pages/${encodeURIComponent(slug)}`, signal, FRESH);
  return isPreviewMode() ? getPreviewPage(slug, published, signal) : published();
};

export const getDocuments = (signal?: AbortSignal) => getCached<DocumentListResponse>('/documents', signal, FRESH);

export const getContactIndex = (signal?: AbortSignal) =>
  getCached<ContactDirectoryIndexResponse>('/contacts', signal, FRESH);

export const getContactDirectory = (id: ContactDirectoryId, signal?: AbortSignal) =>
  getCached<ContactDirectoryResponse>(`/contacts/${encodeURIComponent(id)}`, signal, FRESH);

export const getSiteSettings = (signal?: AbortSignal) => getCached<SiteSettingsResponse>('/site', signal, FRESH);

export const getGallery = (signal?: AbortSignal) => getCached<GalleryResponse>('/gallery', signal, FRESH);
