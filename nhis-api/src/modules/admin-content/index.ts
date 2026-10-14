import type { AdminContactDirectory, ContactColumn } from '@nhis/shared-types';
import { Readable } from 'node:stream';
import {
  AdminHttpError, adminJson, getDb, invalid, notFound, parseIdParam, requireCapability, withAdmin, writeAudit,
} from '../../common/admin';
import { loadStorageConfig } from '../../config/storage';
import { contentDisposition, FileValidationError, getStorage, StorageNotFoundError, validateUpload, type UploadKind } from '../storage';
import { announcementAdapter, announcementModule } from './announcements.admin';
import { contactAdapter, contactModule } from './contacts.admin';
import { documentAdapter, documentModule } from './documents.admin';
import { toRecord } from './engine';
import { galleryAdapter, galleryModule } from './gallery.admin';
import { hospitalAdapter, hospitalModule } from './hospitals.admin';
import { moduleRoutes } from './module-routes';
import { pageAdapter, pageModule } from './pages.admin';
import { toAsset } from './shared';

export const hospitalRoutes = moduleRoutes(hospitalAdapter, hospitalModule);
export const pageRoutes = moduleRoutes(pageAdapter, pageModule, { creatable: false, deletable: false });
export const documentRoutes = moduleRoutes(documentAdapter, documentModule);
export const contactRoutes = moduleRoutes(contactAdapter, contactModule);
export const announcementRoutes = moduleRoutes(announcementAdapter, announcementModule);
export const galleryRoutes = moduleRoutes(galleryAdapter, galleryModule);

/** GET /admin/contacts/directories */
export const listContactDirectories = withAdmin(async () => {
  const db = getDb();
  const directories = await db.contactDirectory.findMany({ orderBy: { sortOrder: 'asc' } });
  const counts = await db.contact.groupBy({ by: ['directoryId'], where: { status: { not: 'ARCHIVED' } }, _count: { _all: true } });
  const data: AdminContactDirectory[] = directories.map((d) => ({
    id: d.id,
    labelEn: d.labelEn,
    labelTa: d.labelTa,
    columns: d.columns as unknown as ContactColumn[],
    total: counts.find((c) => c.directoryId === d.id)?._count._all ?? 0,
  }));
  return adminJson({ data });
});

/** GET /admin/pages/:id/preview: the page as the public site would show it with the pending draft applied. */
export const previewPage = withAdmin<{ id: string }>(async (ctx) => {
  const row = await pageAdapter.find(getDb() as never, parseIdParam(ctx.params.id));
  if (!row) throw notFound();
  const record = await toRecord(pageAdapter, getDb(), row);
  return adminJson({
    data: {
      slug: row.slug,
      legacyPaths: row.legacyPaths,
      sourceUrl: row.sourceUrl ?? '',
      capturedAt: '',
      en: record.values.en,
      ta: record.values.ta,
      documentIds: row.documentIds,
      reviewNotes: [],
    },
  });
});

/** POST /admin/uploads (multipart: kind=document|image, file). Stores the file privately; it is public only once a published record uses it. */
export const uploadFile = withAdmin(async (ctx) => {
  requireCapability(ctx, 'editContent');
  const limits = loadStorageConfig();
  const type = (ctx.request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) throw invalid('Send the file as multipart/form-data.');
  const declared = Number(ctx.request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > Math.max(limits.maxDocumentBytes, limits.maxImageBytes) + 1024 * 1024) {
    throw new AdminHttpError('FILE_TOO_LARGE', 'The upload is too large.');
  }
  const form = await ctx.request.formData();
  const kind = form.get('kind');
  const file = form.get('file');
  if (kind !== 'document' && kind !== 'image') throw invalid('kind must be "document" or "image".', [{ field: 'kind', message: 'Choose document or image.' }]);
  if (!(file instanceof File)) throw invalid('A file is required.', [{ field: 'file', message: 'Choose a file.' }]);
  const data = new Uint8Array(await file.arrayBuffer());
  let validated;
  try {
    validated = validateUpload({ kind: kind as UploadKind, fileName: file.name, data }, limits);
  } catch (error) {
    if (error instanceof FileValidationError) throw new AdminHttpError(error.code, error.message);
    throw error;
  }
  const storage = getStorage();
  const stored = await storage.put(data, validated.extension);
  const db = getDb();
  try {
    const asset = await db.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          kind: validated.assetKind, storageKey: stored.key, originalName: validated.originalName, mimeType: validated.mimeType,
          bytes: validated.bytes, sha256: stored.sha256, createdById: ctx.user.id,
        },
      });
      await writeAudit(tx, ctx, { action: 'UPLOAD', entityType: 'asset', entityId: created.id, summary: `Uploaded ${validated.assetKind.toLowerCase()} "${validated.originalName}"`, detail: { bytes: validated.bytes, mimeType: validated.mimeType } });
      return created;
    });
    return adminJson({ data: toAsset(asset) }, { status: 201 });
  } catch (error) {
    await storage.delete(stored.key).catch(() => undefined);
    throw error;
  }
});

/** GET /admin/files/:assetId: any asset (including drafts) for signed-in staff. Never cached, never sniffed. */
export const adminFile = withAdmin<{ assetId: string }>(async (ctx) => {
  const id = parseIdParam(ctx.params.assetId, 'assetId');
  const asset = await getDb().mediaAsset.findUnique({ where: { id } });
  if (!asset) throw notFound('File not found');
  let stream: Readable;
  try {
    stream = await getStorage().get(asset.storageKey);
  } catch (error) {
    if (error instanceof StorageNotFoundError) throw notFound('File not found');
    throw error;
  }
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.bytes),
      'Content-Disposition': contentDisposition(asset.originalName, 'inline'),
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
