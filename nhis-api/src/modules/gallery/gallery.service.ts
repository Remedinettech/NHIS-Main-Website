import type { GalleryResponse } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { galleryRepository, type GalleryRepository } from './gallery.repository';

export const EMPTY_GALLERY_NOTE = 'No gallery items have been published yet.';

export function createGalleryService(repository: GalleryRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  async function getGallery(): Promise<GalleryResponse> {
    const items = await repository.listPublished();
    const response: GalleryResponse = { data: items, total: items.length, source: 'snapshot', capturedAt: capturedAt() };
    if (items.length === 0) response.note = EMPTY_GALLERY_NOTE;
    return response;
  }
  return { getGallery };
}

export const galleryService = createGalleryService(galleryRepository);
