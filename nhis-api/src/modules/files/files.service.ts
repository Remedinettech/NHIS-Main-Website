import { storedFileResponse } from '../storage/file-response';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { etagMatches, notModified } from '../../common/utils/http';
import { NotFoundError } from '../../common/utils/errors';
import { createMissingTableWarning, isTableUnavailableError } from '../site-content/missing-table';
import { contentDisposition, getStorage, StorageNotFoundError, type StorageAdapter } from '../storage';

const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;

const ASSET_FIELDS = { id: true, kind: true, storageKey: true, originalName: true, mimeType: true, bytes: true, sha256: true } as const;

/**
 * Public file delivery. An asset is served only when it is the LIVE asset of a PUBLISHED document or of a
 * PUBLISHED gallery item, or, for an uploaded IMAGE, when its id appears in the live value of a PUBLISHED site-content
 * document or in an image block of a PUBLISHED page; anything else (drafts, ids referenced only by a pending draft,
 * unreferenced uploads, archived items, unknown ids) is a 404 with no hint about why. Storage keys never appear in a response.
 */
export function createFilesService(client: PrismaClient = prisma, storage: () => StorageAdapter = getStorage) {
  const warnMissingTable = createMissingTableWarning('Images used by site content are not served until it is applied.');

  /**
   * True when a PUBLISHED page (image block) or a PUBLISHED SiteContent row (any image slot) refers to the asset.
   * The asset id has already been checked against ASSET_ID and is passed as a bound parameter; jsonb_path_exists looks
   * for an object with that `assetId` anywhere in the stored JSON. Only live values are searched, never `draft`.
   */
  async function usedByPublishedContent(assetId: string, kind: string): Promise<boolean> {
    if (kind !== 'IMAGE') {
      try {
        // A hidden entry is not part of the page, so its file is not served either (hiding withdraws the file at once).
        const query = kind === 'DOCUMENT'
          ? '$.manual ? (@.visible == true && @.source.type == "upload" && @.source.assetId == $id)'
          : '$.videos[*] ? (@.visible == true && @.source.type == "upload" && @.source.assetId == $id)';
        const found = await client.$queryRaw<{ used: boolean }[]>`SELECT EXISTS (SELECT 1 FROM "SiteContent" c WHERE c."id" = 'manual' AND c."status" = 'PUBLISHED' AND jsonb_path_exists(c."value", ${query}::jsonpath, jsonb_build_object('id', ${assetId}::text))) AS "used"`;
        return found[0]?.used === true;
      } catch (error) { if (!isTableUnavailableError(error)) throw error; warnMissingTable(); return false; }
    }
    const pages = await client.$queryRaw<Array<{ used: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "PageTranslation" t JOIN "Page" p ON p."id" = t."pageId"
        WHERE p."status" = 'PUBLISHED'
          AND jsonb_path_exists(t."sections", '$.** ? (@.type == "image" && @.assetId == $id)', jsonb_build_object('id', ${assetId}::text))
      ) AS "used"`;
    if (pages[0]?.used === true) return true;
    try {
      const content = await client.$queryRaw<Array<{ used: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "SiteContent" c
          WHERE c."status" = 'PUBLISHED'
            AND jsonb_path_exists(c."value", '$.** ? (@.assetId == $id)', jsonb_build_object('id', ${assetId}::text))
        ) AS "used"`;
      return content[0]?.used === true;
    } catch (error) {
      // The migration that creates SiteContent has not been applied: nothing can reference the asset through it.
      if (!isTableUnavailableError(error)) throw error;
      warnMissingTable();
      return false;
    }
  }

  async function serve(rawAssetId: string, request?: Request): Promise<Response> {
    if (!ASSET_ID.test(rawAssetId)) throw new NotFoundError('File not found');
    let asset = await client.mediaAsset.findFirst({
      where: {
        id: rawAssetId,
        OR: [{ documents: { some: { status: 'PUBLISHED' } } }, { gallery: { some: { status: 'PUBLISHED' } } }],
      },
      select: ASSET_FIELDS,
    });
    if (!asset) {
      const image = await client.mediaAsset.findFirst({ where: { id: rawAssetId }, select: ASSET_FIELDS });
      if (image && (await usedByPublishedContent(image.id, image.kind))) asset = image;
    }
    if (!asset) throw new NotFoundError('File not found');

    const etag = `"${asset.sha256}"`;
    const common = {
      'Content-Type': asset.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': contentDisposition(asset.originalName, 'inline'),
    };
    if (request && etagMatches(request.headers.get('if-none-match'), etag)) return notModified(etag, common);

    try { return await storedFileResponse(asset, request, storage()); }
    catch (error) {
      if (error instanceof StorageNotFoundError) throw new NotFoundError('File not found');
      throw error;
    }
  }
  return { serve };
}

export const filesService = createFilesService();
