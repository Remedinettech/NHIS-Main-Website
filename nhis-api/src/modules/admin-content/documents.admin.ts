import type { AdminDocumentValues, DocumentAudience, DocumentCategory } from '@nhis/shared-types';
import type { Document, Prisma } from '@prisma/client';
import { AdminHttpError, invalid, queryEnum, Validator, type Tx } from '../../common/admin';
import type { EntityAdapter } from './engine';
import { listFilters, optionalText, randomId, searchWords, toAsset, type ModuleDefinition } from './shared';

export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'govt-order-employee', 'govt-order-pensioner', 'policy-non-payable', 'enrolment-guide', 'enrolment-form', 'hospital-suspension',
];
export const DOCUMENT_AUDIENCES: readonly DocumentAudience[] = ['employee', 'pensioner', 'all'];

const KEYS = [
  'category', 'audience', 'sortOrder', 'labelEn', 'labelTa', 'titleEn', 'titleTa', 'dateLabelEn', 'dateLabelTa', 'assetId', 'language', 'availabilityNote',
] as const;

const columnData = (v: AdminDocumentValues) => ({ ...v });

export const documentAdapter: EntityAdapter<AdminDocumentValues, Document> = {
  entityType: 'document',
  label: (v) => v.titleEn.trim() || v.labelEn.trim(),
  find: (tx, id) => tx.document.findUnique({ where: { id } }),
  live: (r) => ({
    category: r.category as DocumentCategory,
    audience: r.audience as DocumentAudience,
    sortOrder: r.sortOrder,
    labelEn: r.labelEn, labelTa: r.labelTa, titleEn: r.titleEn, titleTa: r.titleTa,
    dateLabelEn: r.dateLabelEn, dateLabelTa: r.dateLabelTa,
    assetId: r.assetId,
    language: (r.language as 'en' | 'ta' | null) ?? null,
    availabilityNote: r.availabilityNote,
  }),
  draftValues: (r) => (r.draft as AdminDocumentValues | null) ?? null,
  columnData,
  async verify(tx, values) {
    if (!values.assetId) return;
    const asset = await tx.mediaAsset.findUnique({ where: { id: values.assetId }, select: { kind: true } });
    if (!asset) throw invalid('The attached file does not exist.', [{ field: 'assetId', message: 'File not found. Upload it again.' }]);
    if (asset.kind !== 'DOCUMENT') throw invalid('Documents must use a PDF file.', [{ field: 'assetId', message: 'This file is not a document.' }]);
  },
  update: async (tx, id, version, data) => (await tx.document.updateMany({ where: { id, version }, data: data as Prisma.DocumentUpdateManyMutationInput })).count,
  create: (tx, { id, values, userId }) =>
    tx.document.create({ data: { id, ...columnData(values), status: 'DRAFT', version: 1, createdById: userId, updatedById: userId } }),
  newId: () => `doc_${randomId()}`,
  remove: async (tx, row) => { await tx.document.delete({ where: { id: row.id } }); },
  async deleteGuard(tx, row) {
    const pages = await tx.page.count({ where: { documentIds: { has: row.id } } });
    const notices = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "Announcement" WHERE "messageEn"::text LIKE ${`%"documentId":"${row.id}"%`} OR "messageTa"::text LIKE ${`%"documentId":"${row.id}"%`}`;
    if (pages > 0 || Number(notices[0]?.n ?? 0) > 0) {
      throw new AdminHttpError('REFERENCED', 'This document is linked from a page or notice. Archive it instead of deleting it.');
    }
  },
  async collectOrphans(tx, row) {
    return orphanedKeys(tx, [row.assetId]);
  },
  async extras(db, row, values) {
    const ids = [...new Set([row.assetId, values.assetId].filter((x): x is string => !!x))];
    const assets = ids.length ? await db.mediaAsset.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    const live = row.assetId ? byId.get(row.assetId) : undefined;
    const draftId = values.assetId && values.assetId !== row.assetId ? byId.get(values.assetId) : undefined;
    return { sourceUrl: row.sourceUrl, asset: live ? toAsset(live) : null, draftAsset: draftId ? toAsset(draftId) : null };
  },
};

/** Assets from `ids` that no document or gallery item references any more are deleted; their storage keys are returned. */
export async function orphanedKeys(tx: Tx, ids: ReadonlyArray<string | null>): Promise<string[]> {
  const keys: string[] = [];
  for (const id of ids.filter((x): x is string => !!x)) {
    const used = (await tx.document.count({ where: { assetId: id } })) + (await tx.galleryItem.count({ where: { assetId: id } }));
    if (used > 0) continue;
    const asset = await tx.mediaAsset.delete({ where: { id } }).catch(() => null);
    if (asset) keys.push(asset.storageKey);
  }
  return keys;
}

export const documentModule: ModuleDefinition<AdminDocumentValues, Document> = {
  async parseValues(v, input) {
    const obj = v.object(input, 'values');
    const fallback: AdminDocumentValues = { category: 'govt-order-employee', audience: 'employee', sortOrder: 0, labelEn: '', labelTa: '', titleEn: '', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId: null, language: null, availabilityNote: null };
    if (!obj) return fallback;
    v.noUnknownKeys(obj, KEYS);
    const category = v.enumValue(obj.category, 'category', DOCUMENT_CATEGORIES) ?? fallback.category;
    const audience = v.enumValue(obj.audience, 'audience', DOCUMENT_AUDIENCES) ?? fallback.audience;
    const sortOrder = v.int(obj.sortOrder, 'sortOrder', 0, 100_000) ?? 0;
    const assetIdRaw = v.string(obj.assetId, 'assetId', { max: 64, optional: true });
    if (assetIdRaw !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(assetIdRaw)) v.fail('assetId', 'Not a valid file reference.');
    const languageRaw = obj.language === null || obj.language === undefined || obj.language === '' ? null : v.enumValue(obj.language, 'language', ['en', 'ta'] as const) ?? null;
    const values: AdminDocumentValues = {
      category, audience, sortOrder,
      labelEn: v.string(obj.labelEn, 'labelEn', { max: 300 }) ?? '',
      labelTa: optionalText(v, obj.labelTa, 'labelTa', 300),
      titleEn: v.string(obj.titleEn, 'titleEn', { max: 300 }) ?? '',
      titleTa: optionalText(v, obj.titleTa, 'titleTa', 300),
      dateLabelEn: v.string(obj.dateLabelEn, 'dateLabelEn', { max: 80, optional: true }) ?? null,
      dateLabelTa: v.string(obj.dateLabelTa, 'dateLabelTa', { max: 80, optional: true }) ?? null,
      assetId: assetIdRaw ?? null,
      language: languageRaw,
      availabilityNote: v.string(obj.availabilityNote, 'availabilityNote', { max: 300, optional: true }) ?? null,
    };
    v.throwIfInvalid();
    return values;
  },

  async list(db, params, paging) {
    const { q, status } = listFilters(params);
    const category = queryEnum(params, 'category', DOCUMENT_CATEGORIES);
    const audience = queryEnum(params, 'audience', DOCUMENT_AUDIENCES);
    const words = searchWords(q);
    const where: Prisma.DocumentWhereInput = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(audience ? { audience } : {}),
      ...(words.length
        ? { AND: words.map((w) => ({ OR: [
          { labelEn: { contains: w, mode: 'insensitive' as const } }, { labelTa: { contains: w } },
          { titleEn: { contains: w, mode: 'insensitive' as const } }, { titleTa: { contains: w } }, { id: { contains: w, mode: 'insensitive' as const } },
        ] })) }
        : {}),
    };
    const [total, rows] = await Promise.all([
      db.document.count({ where }),
      db.document.findMany({ where, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize }),
    ]);
    return { rows, total };
  },
};

