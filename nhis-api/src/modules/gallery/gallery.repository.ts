import type { GalleryItem } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { publicFileUrl } from '../documents/documents.constants';

export interface GalleryRepository {
  /** PUBLISHED items in order. `imageUrl` is the public file route of the live asset. */
  listPublished(): Promise<GalleryItem[]>;
}

export function createPrismaGalleryRepository(client: PrismaClient = prisma): GalleryRepository {
  return {
    async listPublished() {
      const rows = await client.galleryItem.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, titleEn: true, titleTa: true, assetId: true },
      });
      return rows.map((r) => ({ id: r.id, title: { en: r.titleEn, ta: r.titleTa }, imageUrl: publicFileUrl(r.assetId), sourceUrl: '' }));
    },
  };
}

export const galleryRepository: GalleryRepository = createPrismaGalleryRepository();
