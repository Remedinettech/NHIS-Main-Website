import type { AdminFieldError, SiteContentKey, SiteContentMap, UserManualContent } from '@nhis/shared-types';
import { collectSiteContentRefs } from '@nhis/shared-types';
import type { Prisma } from '@prisma/client';
import type { Readable } from 'node:stream';
import { getStorage, InvalidStorageKeyError, readImageSize, StorageNotFoundError, type ImageSize } from '../storage';

/** What the referential checks need: the client or a transaction client. */
export type ReferenceReader = Pick<Prisma.TransactionClient, 'document' | 'mediaAsset'>;
type AssetReader = Pick<Prisma.TransactionClient, 'mediaAsset'>;

/** Same upper bound as the shared validator applies to `width` and `height`. */
export const MAX_IMAGE_PIXELS = 20000;
/** Uploaded images are at most a few MB (UPLOAD_MAX_IMAGE_BYTES); a header is found long before this. */
const MAX_HEADER_SCAN_BYTES = 8 * 1024 * 1024;

const at = (base: string, key: string): string => (base ? `${base}.${key}` : key);

/** A reference to an uploaded image together with the field that holds it, as the Admin addresses it. */
export interface ImageRef { assetId: string; field: string }
export interface DocumentRef { documentId: string; field: string }

/* ------------------------------------------------------------------ finding references in a site-content document */

/** Field paths of every Documents-module id and uploaded image in a (validated) site-content document. */
export function siteContentRefFields(value: unknown): { documents: DocumentRef[]; images: ImageRef[] } {
  const documents: DocumentRef[] = [];
  const images: ImageRef[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    // A link target of type "document", and a SiteImage (which always carries both `builtIn` and `alt`).
    if (record.type === 'document' && typeof record.documentId === 'string') documents.push({ documentId: record.documentId, field: at(path, 'documentId') });
    if (typeof record.assetId === 'string' && 'builtIn' in record && 'alt' in record) images.push({ assetId: record.assetId, field: at(path, 'assetId') });
    for (const [name, child] of Object.entries(record)) {
      if (name === 'documentIds' && Array.isArray(child)) {
        child.forEach((id, index) => { if (typeof id === 'string') documents.push({ documentId: id, field: `${at(path, name)}[${index}]` }); });
      } else {
        visit(child, at(path, name));
      }
    }
  };
  visit(value, '');
  return { documents, images };
}

/* ------------------------------------------------------------------ database checks */

/**
 * True when the live value or the pending draft of any SiteContent document links to the Documents-module file (a
 * `document` link target, or the homepage list of document ids). Used to refuse hard-deleting a linked document. The
 * table may not exist yet (migration pending): it is looked up first, because a failing statement would abort the
 * caller's transaction.
 */
export async function isDocumentLinkedFromSiteContent(db: Pick<Prisma.TransactionClient, '$queryRaw'>, documentId: string): Promise<boolean> {
  const [table] = await db.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('"SiteContent"') IS NOT NULL AS "present"`;
  if (table?.present !== true) return false;
  const [row] = await db.$queryRaw<Array<{ used: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "SiteContent" c
      WHERE jsonb_path_exists(c."value", '$.** ? (@.documentId == $id || @.documentIds[*] == $id)', jsonb_build_object('id', ${documentId}::text))
         OR (c."draft" IS NOT NULL AND jsonb_path_exists(c."draft", '$.** ? (@.documentId == $id || @.documentIds[*] == $id)', jsonb_build_object('id', ${documentId}::text)))
    ) AS "used"`;
  return row?.used === true;
}

/** Documents that are referenced but do not exist in the Documents module. */
export async function checkDocuments(db: Pick<Prisma.TransactionClient, 'document'>, refs: readonly DocumentRef[]): Promise<AdminFieldError[]> {
  const ids = Array.from(new Set(refs.map((ref) => ref.documentId)));
  if (ids.length === 0) return [];
  const found = new Set((await db.document.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((row) => row.id));
  return refs.filter((ref) => !found.has(ref.documentId)).map((ref) => ({ field: ref.field, message: 'This document does not exist. Choose a document from the list.' }));
}

async function readStoredSize(storageKey: string, mimeType: string): Promise<ImageSize | null> {
  let stream: Readable;
  try {
    stream = await getStorage().get(storageKey);
  } catch (error) {
    if (error instanceof StorageNotFoundError || error instanceof InvalidStorageKeyError) return null;
    throw error;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let nextAttempt = 0;
  try {
    // The header is parsed as soon as enough bytes have arrived; a large file is never read to the end for its size.
    // Parsing is retried each time the amount read has doubled (a JPEG frame header can follow large metadata segments).
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      chunks.push(buffer);
      total += buffer.length;
      if (total >= nextAttempt) {
        const size = readImageSize(Buffer.concat(chunks, total), mimeType);
        if (size) return size;
        nextAttempt = Math.max(total * 2, 128 * 1024);
      }
      if (total > MAX_HEADER_SCAN_BYTES) return null;
    }
  } finally {
    stream.destroy();
  }
  return total > 0 ? readImageSize(Buffer.concat(chunks, total), mimeType) : null;
}

/** Stored files never change (a new upload gets a new random key), so a measured size is remembered; failures are not. */
const measured = new Map<string, ImageSize>();
const MEASURED_LIMIT = 500;

async function sizeOfStoredImage(storageKey: string, mimeType: string): Promise<ImageSize | null> {
  const known = measured.get(storageKey);
  if (known) return known;
  const size = await readStoredSize(storageKey, mimeType);
  if (size) {
    if (measured.size >= MEASURED_LIMIT) measured.delete(measured.keys().next().value as string);
    measured.set(storageKey, size);
  }
  return size;
}

/**
 * Checks uploaded images: each must exist and have kind IMAGE. With `measure`, the pixel size of every image is also
 * read from its stored file (never taken from the browser) and returned by asset id; an unreadable or absurdly large
 * image is reported against its field.
 */
export async function checkImages(
  db: AssetReader, refs: readonly ImageRef[], options: { measure: boolean },
): Promise<{ problems: AdminFieldError[]; sizes: Map<string, ImageSize> }> {
  const problems: AdminFieldError[] = [];
  const sizes = new Map<string, ImageSize>();
  const ids = Array.from(new Set(refs.map((ref) => ref.assetId)));
  if (ids.length === 0) return { problems, sizes };
  const assets = new Map((await db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, storageKey: true, mimeType: true } })).map((a) => [a.id, a]));

  const unusable = new Set<string>();
  for (const ref of refs) {
    const asset = assets.get(ref.assetId);
    if (!asset) {
      problems.push({ field: ref.field, message: 'This image does not exist. Upload it again.' });
      unusable.add(ref.assetId);
    } else if (asset.kind !== 'IMAGE') {
      problems.push({ field: ref.field, message: 'This file is not an image.' });
      unusable.add(ref.assetId);
    }
  }
  if (!options.measure) return { problems, sizes };

  const failure = new Map<string, string>();
  for (const id of ids) {
    const asset = assets.get(id);
    if (!asset || unusable.has(id)) continue;
    const size = await sizeOfStoredImage(asset.storageKey, asset.mimeType);
    if (!size) failure.set(id, 'The size of this image could not be read. Upload a JPEG, PNG or WebP picture.');
    else if (size.width > MAX_IMAGE_PIXELS || size.height > MAX_IMAGE_PIXELS) failure.set(id, `This image is too large (${size.width} x ${size.height}). The limit is ${MAX_IMAGE_PIXELS} pixels on each side.`);
    else sizes.set(id, size);
  }
  for (const ref of refs) {
    const message = failure.get(ref.assetId);
    if (message) problems.push({ field: ref.field, message });
  }
  return { problems, sizes };
}

/**
 * Referential checks of a validated site-content document: documents exist, images exist and are images (and, with
 * `measure`, readable). Returns the problems with their field paths and the measured sizes.
 */
export async function checkSiteContentReferences<K extends SiteContentKey>(
  db: ReferenceReader, key: K, value: SiteContentMap[K], options: { measure: boolean },
): Promise<{ problems: AdminFieldError[]; sizes: Map<string, ImageSize> }> {
  if (key === 'manual') {
    const manual = value as UserManualContent;
    const entries = [{ source: manual.manual.source, kind: 'DOCUMENT', field: 'manual.source' }, ...manual.videos.map((v, i) => ({ source: v.source, kind: 'VIDEO', field: `videos[${i}].source` }))];
    const problems: AdminFieldError[] = [];
    for (const entry of entries) if (entry.source.type === 'upload') {
      const asset = await db.mediaAsset.findUnique({ where: { id: entry.source.assetId }, select: { kind: true, storageKey: true } });
      if (!asset || asset.kind !== entry.kind) problems.push({ field: `${entry.field}.assetId`, message: `Choose an existing uploaded ${entry.kind === 'VIDEO' ? 'MP4 video' : 'PDF document'}.` });
      else if (!(await getStorage().exists(asset.storageKey))) problems.push({ field: `${entry.field}.assetId`, message: 'The uploaded file is missing from storage.' });
    }
    return { problems, sizes: new Map<string, ImageSize>() };
  }
  const fields = siteContentRefFields(value);
  // collectSiteContentRefs is the shared definition of "what the document references"; the walk only adds field paths.
  const refs = collectSiteContentRefs(key, value);
  const documents = fields.documents.filter((ref) => refs.documentIds.includes(ref.documentId));
  const images = fields.images.filter((ref) => refs.assetIds.includes(ref.assetId));
  for (const documentId of refs.documentIds) if (!documents.some((ref) => ref.documentId === documentId)) documents.push({ documentId, field: '' });
  for (const assetId of refs.assetIds) if (!images.some((ref) => ref.assetId === assetId)) images.push({ assetId, field: '' });
  const [documentProblems, imageResult] = await Promise.all([checkDocuments(db, documents), checkImages(db, images, options)]);
  return { problems: [...documentProblems, ...imageResult.problems], sizes: imageResult.sizes };
}
