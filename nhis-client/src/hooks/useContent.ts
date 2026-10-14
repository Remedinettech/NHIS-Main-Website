import type {
  ContactDirectoryId, DirectoryStats, ContactDirectoryIndexResponse, ContactDirectoryResponse, DocumentListResponse,
  GalleryResponse, PageResponse, PageSlug, SiteSettingsResponse,
} from '@nhis/shared-types';
import { getContactDirectory, getContactIndex, getDocuments, getGallery, getPage, getSiteSettings } from '../services/content.api';
import { getStats } from '../services/hospital.api';
import type { AsyncState } from '../types/async';
import { useAsyncData } from './useAsyncData';

export const usePage = (slug: PageSlug): AsyncState<PageResponse> =>
  useAsyncData((signal) => getPage(slug, signal), [slug]);

export const useDocuments = (): AsyncState<DocumentListResponse> =>
  useAsyncData((signal) => getDocuments(signal), []);

export const useContactIndex = (): AsyncState<ContactDirectoryIndexResponse> =>
  useAsyncData((signal) => getContactIndex(signal), []);

export const useContactDirectory = (id: ContactDirectoryId): AsyncState<ContactDirectoryResponse> =>
  useAsyncData((signal) => getContactDirectory(id, signal), [id]);

export const useSiteSettingsData = (): AsyncState<SiteSettingsResponse> =>
  useAsyncData((signal) => getSiteSettings(signal), []);

export const useGallery = (): AsyncState<GalleryResponse> =>
  useAsyncData((signal) => getGallery(signal), []);

export const useDirectoryStats = (): AsyncState<DirectoryStats> =>
  useAsyncData((signal) => getStats(signal), []);
