import type {
  ContactDirectoryId, ContactDirectoryIndexResponse, ContactDirectoryResponse, DocumentListResponse,
  GalleryResponse, PageResponse, PageSlug, SiteSettingsResponse,
} from '@nhis/shared-types';
import { getCached } from './client';

export const getPage = (slug: PageSlug, signal?: AbortSignal) => getCached<PageResponse>(`/pages/${encodeURIComponent(slug)}`, signal);
export const getDocuments = (signal?: AbortSignal) => getCached<DocumentListResponse>('/documents', signal);
export const getContactDirectories = (signal?: AbortSignal) => getCached<ContactDirectoryIndexResponse>('/contacts', signal);
export const getContactDirectory = (id: ContactDirectoryId, signal?: AbortSignal) =>
  getCached<ContactDirectoryResponse>(`/contacts/${encodeURIComponent(id)}`, signal);
export const getSite = (signal?: AbortSignal) => getCached<SiteSettingsResponse>('/site', signal);
export const getGallery = (signal?: AbortSignal) => getCached<GalleryResponse>('/gallery', signal);
