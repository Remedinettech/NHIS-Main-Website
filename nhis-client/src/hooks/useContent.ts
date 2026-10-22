import type {
  ContactDirectoryId, DirectoryStats, ContactDirectoryIndexResponse, ContactDirectoryResponse, DocumentListResponse,
  GalleryResponse, PageResponse, PageSlug, SiteSettingsResponse,
} from '@nhis/shared-types';
import { getContactDirectory, getContactIndex, getDocuments, getGallery, getPage, getSiteSettings } from '../services/content.api';
import { getStats } from '../services/hospital.api';
import type { AsyncState } from '../types/async';
import { useAsyncData, type AsyncDataOptions } from './useAsyncData';
import { usePreviewMode } from './usePreviewMode';

/**
 * Everything the administration publishes (pages, documents, announcements, gallery, contacts) is asked for again when
 * the visitor returns to an open tab, so a publish appears without a reload (see useAsyncData and utils/refocus.ts).
 */
const PUBLISHED: AsyncDataOptions = { revalidateOnFocus: true };

/**
 * A page of the Pages module. In preview mode it is the administration's draft, so the mode is an input of the request: a
 * visitor who leaves preview (?preview=0) on the same page gets the published page at once, not the draft that was loaded.
 */
export function usePage(slug: PageSlug): AsyncState<PageResponse> {
  const preview = usePreviewMode();
  return useAsyncData((signal) => getPage(slug, signal), [slug, preview], PUBLISHED);
}

export const useDocuments = (): AsyncState<DocumentListResponse> =>
  useAsyncData((signal) => getDocuments(signal), [], PUBLISHED);

export const useContactIndex = (): AsyncState<ContactDirectoryIndexResponse> =>
  useAsyncData((signal) => getContactIndex(signal), [], PUBLISHED);

export const useContactDirectory = (id: ContactDirectoryId): AsyncState<ContactDirectoryResponse> =>
  useAsyncData((signal) => getContactDirectory(id, signal), [id], PUBLISHED);

export const useSiteSettingsData = (): AsyncState<SiteSettingsResponse> =>
  useAsyncData((signal) => getSiteSettings(signal), [], PUBLISHED);

export const useGallery = (): AsyncState<GalleryResponse> =>
  useAsyncData((signal) => getGallery(signal), [], PUBLISHED);

export const useDirectoryStats = (): AsyncState<DirectoryStats> =>
  useAsyncData((signal) => getStats(signal), []);
