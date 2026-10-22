import { storedFileResponse } from '../storage/file-response';
import type { AdminContactDirectory, ContactColumn } from '@nhis/shared-types';
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
import { previewSiteContentValues, siteContentAdapter, siteContentModule } from './site-content.admin';

export const hospitalRoutes = moduleRoutes(hospitalAdapter, hospitalModule);
export const pageRoutes = moduleRoutes(pageAdapter, pageModule, { creatable: false, deletable: false });
/** The six site-content documents (header, navigation, home, partners, footer, text): edited and published, never created, unpublished, archived or deleted. */
export const siteContentRoutes = moduleRoutes(siteContentAdapter, siteContentModule, { creatable: false, deletable: false });
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

/** GET /admin/site-content/preview: all six documents as the public site would show them with the pending drafts applied (any signed-in role). */
export const previewSiteContent = withAdmin(async () => adminJson({ data: await previewSiteContentValues(getDb()) }));

/** POST /admin/uploads (multipart: kind=document|image|video, file). Stores the file privately; it is public only once a published record uses it. */
export const uploadFile = withAdmin(async (ctx) => {
  requireCapability(ctx, 'editContent');
  const limits = loadStorageConfig();
  const type = (ctx.request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) throw invalid('Send the file as multipart/form-data.');
  const declared = Number(ctx.request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > Math.max(limits.maxDocumentBytes, limits.maxImageBytes, limits.maxVideoBytes) + 1024 * 1024) {
    throw new AdminHttpError('FILE_TOO_LARGE', 'The upload is too large.');
  }
  const reader = ctx.request.body?.getReader(); if (!reader) throw invalid('A file is required.');
  const chunks: Uint8Array[] = []; let received = 0;
  const maxBody = Math.max(limits.maxDocumentBytes, limits.maxImageBytes, limits.maxVideoBytes) + 1024 * 1024;
  for (;;) { const part = await reader.read(); if (part.done) break; received += part.value.length; if (received > maxBody) { await reader.cancel(); throw new AdminHttpError('FILE_TOO_LARGE', 'The upload is too large.'); } chunks.push(part.value); }
  // A body that is not valid multipart (a missing boundary, a truncated part, garbage) is the sender's mistake: 400, not a server error.
  let form: FormData;
  try {
    form = await new Request(ctx.request.url, { method: 'POST', headers: ctx.request.headers, body: Buffer.concat(chunks) }).formData();
  } catch {
    throw invalid('The upload could not be read. Send the file as multipart/form-data.');
  }
  const kind = form.get('kind');
  const file = form.get('file');
  if (kind !== 'document' && kind !== 'image' && kind !== 'video') throw invalid('kind must be document, image or video.', [{ field: 'kind', message: 'Choose document, image or video.' }]);
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
  try { return await storedFileResponse(asset, ctx.request, getStorage()); }
  catch (error) { if (error instanceof StorageNotFoundError) throw notFound('File not found'); throw error; }
});
