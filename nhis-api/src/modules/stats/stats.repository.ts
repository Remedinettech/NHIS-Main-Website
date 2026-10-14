import type { ContactDirectoryId, DocumentCategory } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { visibleAnnouncementWhere } from '../site/site.repository';

export interface StatsCounts {
  hospitals: number;
  directories: Array<{ id: ContactDirectoryId; rows: number }>;
  documents: Array<{ category: DocumentCategory; hasFile: boolean }>;
  announcements: number;
  galleryItems: number;
}

export interface StatsRepository {
  collect(now?: Date): Promise<StatsCounts>;
}

export function createPrismaStatsRepository(client: PrismaClient = prisma): StatsRepository {
  return {
    async collect(now = new Date()) {
      const [hospitals, directories, documents, announcements, galleryItems] = await Promise.all([
        client.hospital.count({ where: { status: 'PUBLISHED' } }),
        client.contactDirectory.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, _count: { select: { contacts: { where: { status: 'PUBLISHED' } } } } },
        }),
        client.document.findMany({ where: { status: 'PUBLISHED' }, select: { category: true, assetId: true } }),
        client.announcement.count({ where: visibleAnnouncementWhere(now) }),
        client.galleryItem.count({ where: { status: 'PUBLISHED' } }),
      ]);
      return {
        hospitals,
        directories: directories.map((d) => ({ id: d.id as ContactDirectoryId, rows: d._count.contacts })),
        documents: documents.map((d) => ({ category: d.category as DocumentCategory, hasFile: d.assetId !== null })),
        announcements,
        galleryItems,
      };
    },
  };
}

export const statsRepository: StatsRepository = createPrismaStatsRepository();
