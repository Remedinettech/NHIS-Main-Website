import type { DirectoryStats, DocumentCategory } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { DOCUMENT_CATEGORIES } from '../documents/documents.constants';
import { statsRepository, type StatsRepository } from './stats.repository';

/** Every number is counted in the database at request time; nothing here is hard-coded. */
export function createStatsService(repository: StatsRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  async function getStats(): Promise<DirectoryStats> {
    const counts = await repository.collect();
    const byCategory = new Map<DocumentCategory, { total: number; unavailable: number }>();
    for (const doc of counts.documents) {
      const entry = byCategory.get(doc.category) ?? { total: 0, unavailable: 0 };
      entry.total += 1;
      if (!doc.hasFile) entry.unavailable += 1;
      byCategory.set(doc.category, entry);
    }
    return {
      hospitals: counts.hospitals,
      contacts: counts.directories.reduce((sum, d) => sum + d.rows, 0),
      documents: counts.documents.length,
      capturedAt: capturedAt(),
      mode: 'snapshot',
      contactDirectories: counts.directories,
      documentsByCategory: DOCUMENT_CATEGORIES.filter((c) => byCategory.has(c)).map((category) => ({ category, ...byCategory.get(category)! })),
      announcements: counts.announcements,
      galleryItems: counts.galleryItems,
    };
  }
  return { getStats };
}

export const statsService = createStatsService(statsRepository);
