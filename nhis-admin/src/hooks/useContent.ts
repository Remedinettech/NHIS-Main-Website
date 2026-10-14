import type {
  ContactDirectoryId, ContactDirectoryIndexResponse, ContactDirectoryResponse, DocumentListResponse,
  GalleryResponse, PageResponse, PageSlug, SiteSettingsResponse,
} from '@nhis/shared-types';
import { PAGE_SLUGS } from '../config/app';
import {
  getContactDirectories, getContactDirectory, getDocuments, getGallery, getPage, getSite,
} from '../services/content.api';
import { getStats } from '../services/hospital.api';
import type { AsyncState } from '../types/async';
import { useAsyncData } from './useAsyncData';

export const useDocuments = (): AsyncState<DocumentListResponse> => useAsyncData((s) => getDocuments(s), []);
export const useSite = (): AsyncState<SiteSettingsResponse> => useAsyncData((s) => getSite(s), []);
export const useGallery = (): AsyncState<GalleryResponse> => useAsyncData((s) => getGallery(s), []);
export const useContactIndex = (): AsyncState<ContactDirectoryIndexResponse> => useAsyncData((s) => getContactDirectories(s), []);
export const usePage = (slug: PageSlug): AsyncState<PageResponse> => useAsyncData((s) => getPage(slug, s), [slug]);

export function useContactDirectory(id: ContactDirectoryId | undefined): AsyncState<ContactDirectoryResponse | null> {
  return useAsyncData(async (s) => (id ? getContactDirectory(id, s) : null), [id]);
}

export function useAllPages(): AsyncState<PageResponse[]> {
  return useAsyncData((s) => Promise.all(PAGE_SLUGS.map((slug) => getPage(slug, s))), []);
}

/** Everything the dashboard needs, loaded together so the numbers agree with each other. */
export function useDashboardData() {
  return useAsyncData(async (s) => {
    const [stats, documents, directories, site, gallery] = await Promise.all([
      getStats(s), getDocuments(s), getContactDirectories(s), getSite(s), getGallery(s),
    ]);
    return { stats, documents, directories, site, gallery };
  }, []);
}
