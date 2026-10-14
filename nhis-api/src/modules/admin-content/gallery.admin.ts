import type { AdminGalleryValues } from '@nhis/shared-types';
import type { GalleryItem, Prisma } from '@prisma/client';
import { invalid } from '../../common/admin';
import { orphanedKeys } from './documents.admin';
import type { EntityAdapter } from './engine';
import { listFilters, optionalText, randomId, searchWords, toAsset, type ModuleDefinition } from './shared';

const columnData = (v: AdminGalleryValues) => ({ ...v });

export const galleryAdapter: EntityAdapter<AdminGalleryValues, GalleryItem> = {
  entityType: 'gallery',
  label: (v) => v.titleEn.trim() || v.titleTa.trim(),
  find: (tx, id) => tx.galleryItem.findUnique({ where: { id } }),
  live: (r) => ({ titleEn: r.titleEn, titleTa: r.titleTa, assetId: r.assetId, sortOrder: r.sortOrder }),
  draftValues: (r) => (r.draft as AdminGalleryValues | null) ?? null,
  columnData,
  async verify(tx, values) {
    const asset = await tx.mediaAsset.findUnique({ where: { id: values.assetId }, select: { kind: true } });
    if (!asset) throw invalid('The image does not exist.', [{ field: 'assetId', message: 'Image not found. Upload it again.' }]);
    if (asset.kind !== 'IMAGE') throw invalid('Gallery items must use an image.', [{ field: 'assetId', message: 'This file is not an image.' }]);
  },
  update: async (tx, id, version, data) => (await tx.galleryItem.updateMany({ where: { id, version }, data: data as Prisma.GalleryItemUpdateManyMutationInput })).count,
  create: (tx, { id, values, userId }) =>
    tx.galleryItem.create({ data: { id, ...columnData(values), status: 'DRAFT', version: 1, createdById: userId, updatedById: userId } }),
  newId: () => `gal_${randomId()}`,
  remove: async (tx, row) => { await tx.galleryItem.delete({ where: { id: row.id } }); },
  collectOrphans: (tx, row) => orphanedKeys(tx, [row.assetId]),
  async extras(db, row, values) {
    const ids = [...new Set([row.assetId, values.assetId])];
    const assets = await db.mediaAsset.findMany({ where: { id: { in: ids } } });
    const asset = assets.find((a) => a.id === values.assetId) ?? assets.find((a) => a.id === row.assetId);
    return { asset: asset ? toAsset(asset) : null };
  },
};

export const galleryModule: ModuleDefinition<AdminGalleryValues, GalleryItem> = {
  async parseValues(v, input, { db }) {
    const obj = v.object(input, 'values');
    if (!obj) return { titleEn: '', titleTa: '', assetId: '', sortOrder: 0 };
    v.noUnknownKeys(obj, ['titleEn', 'titleTa', 'assetId', 'sortOrder']);
    const assetId = v.string(obj.assetId, 'assetId', { max: 64 }) ?? '';
    if (assetId && !/^[A-Za-z0-9_-]{8,64}$/.test(assetId)) v.fail('assetId', 'Not a valid image reference.');
    let sortOrder = v.int(obj.sortOrder, 'sortOrder', 0, 100_000, true);
    if (sortOrder === undefined) {
      const max = await db.galleryItem.aggregate({ _max: { sortOrder: true } });
      sortOrder = (max._max.sortOrder ?? 0) + 1;
    }
    const values: AdminGalleryValues = {
      titleEn: v.string(obj.titleEn, 'titleEn', { max: 200 }) ?? '',
      titleTa: optionalText(v, obj.titleTa, 'titleTa', 200),
      assetId,
      sortOrder,
    };
    v.throwIfInvalid();
    return values;
  },

  async list(db, params, paging) {
    const { q, status } = listFilters(params);
    const words = searchWords(q);
    const where: Prisma.GalleryItemWhereInput = {
      ...(status ? { status } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ titleEn: { contains: w, mode: 'insensitive' as const } }, { titleTa: { contains: w } }] })) } : {}),
    };
    const [total, rows] = await Promise.all([
      db.galleryItem.count({ where }),
      db.galleryItem.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize }),
    ]);
    return { rows, total };
  },
};
