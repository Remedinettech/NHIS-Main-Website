import type { AdminPageValues, LocalizedPageContent, PageSection } from '@nhis/shared-types';
import type { Page, PageTranslation, Prisma } from '@prisma/client';
import { invalid } from '../../common/admin';
import { checkImages, type ImageRef } from '../site-content/references';
import type { ImageSize } from '../storage';
import { collectDocumentIds, parseLocalizedPage } from './content-validation';
import type { EntityAdapter } from './engine';
import { listFilters, type ModuleDefinition } from './shared';

type PageRow = Page & { translations: PageTranslation[] };

const asLocalized = (t: PageTranslation | undefined): LocalizedPageContent | null =>
  t ? { title: t.title, sections: t.sections as unknown as PageSection[] } : null;

const documentIdsOf = (values: AdminPageValues): string[] =>
  collectDocumentIds([...(values.en?.sections ?? []), ...(values.ta?.sections ?? [])]);

/** Image blocks of both languages with the field path the Admin addresses them by (e.g. `en.sections[1].blocks[0].assetId`). */
function imageRefsOf(values: AdminPageValues): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const locale of ['en', 'ta'] as const) {
    values[locale]?.sections.forEach((section, s) => section.blocks.forEach((block, b) => {
      if (block.type === 'image') refs.push({ assetId: block.assetId, field: `${locale}.sections[${s}].blocks[${b}].assetId` });
    }));
  }
  return refs;
}

/** A copy of the values in which every image block carries the pixel size read from its stored file. */
function withImageSizes(values: AdminPageValues, sizes: ReadonlyMap<string, ImageSize>): AdminPageValues {
  const fill = (content: LocalizedPageContent | null): LocalizedPageContent | null => content && {
    ...content,
    sections: content.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        const size = block.type === 'image' ? sizes.get(block.assetId) : undefined;
        return block.type === 'image' && size ? { ...block, width: size.width, height: size.height } : block;
      }),
    })),
  };
  return { en: fill(values.en), ta: fill(values.ta) };
}

/**
 * Pages are the fixed site routes (employee-policy, coverage, ...). They are edited and published, never created,
 * archived, unpublished or deleted: the public navigation depends on them. `id` in the admin API is the slug.
 */
export const pageAdapter: EntityAdapter<AdminPageValues, PageRow> = {
  entityType: 'page',
  label: (v) => v.en?.title ?? v.ta?.title ?? 'Page',
  find: (tx, idOrSlug) =>
    tx.page.findFirst({ where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] }, include: { translations: true } }),
  live: (r) => ({
    en: asLocalized(r.translations.find((t) => t.locale === 'en')),
    ta: asLocalized(r.translations.find((t) => t.locale === 'ta')),
  }),
  draftValues: (r) => (r.draft as AdminPageValues | null) ?? null,
  columnData: (v) => ({ documentIds: documentIdsOf(v) }),
  async afterLiveWrite(tx, row, values) {
    for (const locale of ['en', 'ta'] as const) {
      const content = values[locale];
      if (content === null) {
        await tx.pageTranslation.deleteMany({ where: { pageId: row.id, locale } });
      } else {
        const sections = content.sections as unknown as Prisma.InputJsonValue;
        await tx.pageTranslation.upsert({
          where: { pageId_locale: { pageId: row.id, locale } },
          create: { pageId: row.id, locale, title: content.title, sections },
          update: { title: content.title, sections },
        });
      }
    }
  },
  async verify(tx, values) {
    const ids = documentIdsOf(values);
    if (ids.length > 0) {
      const found = await tx.document.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const missing = ids.filter((id) => !found.some((f) => f.id === id));
      if (missing.length) throw invalid('A linked document does not exist.', [{ field: 'values', message: `Unknown document: ${missing.join(', ')}` }]);
    }
    // Pictures: every referenced asset must exist and be an image (the size was filled in when the values were parsed).
    const { problems } = await checkImages(tx, imageRefsOf(values), { measure: false });
    if (problems.length > 0) throw invalid('A picture on this page is not available.', problems);
  },
  update: async (tx, id, version, data) => (await tx.page.updateMany({ where: { id, version }, data: data as Prisma.PageUpdateManyMutationInput })).count,
  create: () => { throw invalid('Pages cannot be created.'); },
  newId: () => { throw invalid('Pages cannot be created.'); },
  remove: async () => { throw invalid('Pages cannot be deleted.'); },
  extras: async (_db, row) => ({ slug: row.slug, legacyPaths: row.legacyPaths, documentIds: row.documentIds }),
  allowUnpublish: false,
  allowArchive: false,
  allowDelete: false,
};

export const pageModule: ModuleDefinition<AdminPageValues, PageRow> = {
  async parseValues(v, input, { db }) {
    const obj = v.object(input, 'values');
    if (!obj) return { en: null, ta: null };
    v.noUnknownKeys(obj, ['en', 'ta']);
    const en = parseLocalizedPage(v, obj.en ?? null, 'en');
    const ta = parseLocalizedPage(v, obj.ta ?? null, 'ta');
    if (v.ok && en === null && ta === null) v.fail('values', 'A page needs content in at least one language.');
    v.throwIfInvalid();
    const values: AdminPageValues = { en: en ?? null, ta: ta ?? null };
    // Pictures: each asset must exist and be an image; its pixel size is read from the stored file (never from the browser).
    const { problems, sizes } = await checkImages(db, imageRefsOf(values), { measure: true });
    for (const problem of problems) v.fail(problem.field, problem.message);
    v.throwIfInvalid();
    return withImageSizes(values, sizes);
  },

  async list(db, params, paging) {
    const { q, status } = listFilters(params);
    const where: Prisma.PageWhereInput = {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ slug: { contains: q, mode: 'insensitive' } }, { translations: { some: { title: { contains: q, mode: 'insensitive' } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      db.page.count({ where }),
      db.page.findMany({ where, include: { translations: true }, orderBy: [{ slug: 'asc' }], skip: paging.skip, take: paging.pageSize }),
    ]);
    return { rows, total };
  },
};
