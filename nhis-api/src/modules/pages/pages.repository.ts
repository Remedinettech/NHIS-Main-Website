import type { LocalizedPageContent, PageContent, PageSlug } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

/** A published page as stored: live values only (never the pending draft or the review notes). */
export interface PublishedPage {
  slug: string;
  legacyPaths: string[];
  sourceUrl: string | null;
  documentIds: string[];
  translations: Array<{ locale: string; title: string; sections: unknown }>;
}

export interface PageRepository {
  findPublishedBySlug(slug: string): Promise<PublishedPage | null>;
}

export function toPageContent(page: PublishedPage, capturedAt: string): PageContent {
  const localized = (locale: 'en' | 'ta'): LocalizedPageContent | null => {
    const t = page.translations.find((x) => x.locale === locale);
    return t ? { title: t.title, sections: t.sections as LocalizedPageContent['sections'] } : null;
  };
  return {
    slug: page.slug as PageSlug,
    legacyPaths: page.legacyPaths,
    sourceUrl: page.sourceUrl ?? '',
    capturedAt,
    en: localized('en'),
    ta: localized('ta'),
    documentIds: page.documentIds,
    // Review notes are for administrators only and are never part of the public response.
    reviewNotes: [],
  };
}

export function createPrismaPageRepository(client: PrismaClient = prisma): PageRepository {
  return {
    async findPublishedBySlug(slug) {
      const page = await client.page.findFirst({
        where: { slug, status: 'PUBLISHED' },
        select: {
          slug: true,
          legacyPaths: true,
          sourceUrl: true,
          documentIds: true,
          translations: { select: { locale: true, title: true, sections: true } },
        },
      });
      return page;
    },
  };
}

export const pageRepository: PageRepository = createPrismaPageRepository();
