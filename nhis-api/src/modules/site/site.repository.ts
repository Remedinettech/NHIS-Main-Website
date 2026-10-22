import type { Announcement, InlineNode, SiteSettings } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { createPrismaSiteContentRepository, type SiteContentRepository } from '../site-content/site-content.repository';
import { siteFactsFromContent } from './site-from-content';

export type SiteContent = Omit<SiteSettings, 'capturedAt' | 'mode'>;

export interface SiteRepository {
  /** The scheme facts of the effective site content plus the announcements that are PUBLISHED and inside their start/end window at `now`. */
  getSettings(now?: Date): Promise<SiteContent>;
}

/** Announcements are public only when PUBLISHED and within their optional start/end window. */
export const visibleAnnouncementWhere = (now: Date) => ({
  status: 'PUBLISHED' as const,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
});

/**
 * The announcements come from their own table and are always served. Scheme name, coverage statement, helplines,
 * availability and portals come from the effective header / home / navigation content (see site-from-content.ts): the
 * published document, else the built-in content with the legacy settings laid over it. The retired SiteSetting rows are
 * therefore optional: when they are missing the built-in content answers, never a 503.
 */
export function createPrismaSiteRepository(
  client: PrismaClient = prisma,
  content: SiteContentRepository = createPrismaSiteContentRepository(client),
): SiteRepository {
  return {
    async getSettings(now = new Date()) {
      const [documents, announcements] = await Promise.all([
        content.getPublished(),
        client.announcement.findMany({ where: visibleAnnouncementWhere(now), orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      ]);
      return {
        ...siteFactsFromContent(documents),
        announcements: announcements.map((a): Announcement => ({
          id: a.id,
          kind: a.kind as Announcement['kind'],
          severity: a.severity as Announcement['severity'],
          message: { en: a.messageEn as unknown as InlineNode[], ta: a.messageTa as unknown as InlineNode[] },
        })),
      };
    },
  };
}

export const siteRepository: SiteRepository = createPrismaSiteRepository();
