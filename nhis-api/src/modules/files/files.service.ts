import { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { etagMatches, notModified } from '../../common/utils/http';
import { NotFoundError } from '../../common/utils/errors';
import { contentDisposition, getStorage, StorageNotFoundError, type StorageAdapter } from '../storage';

const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Public file delivery. An asset is served only when it is the LIVE asset of a PUBLISHED document or of a
 * PUBLISHED gallery item; anything else (drafts, unreferenced uploads, archived items, unknown ids) is a 404 with
 * no hint about why. Storage keys never appear in a response.
 */
export function createFilesService(client: PrismaClient = prisma, storage: () => StorageAdapter = getStorage) {
  async function serve(rawAssetId: string, request?: Request): Promise<Response> {
    if (!ASSET_ID.test(rawAssetId)) throw new NotFoundError('File not found');
    const asset = await client.mediaAsset.findFirst({
      where: {
        id: rawAssetId,
        OR: [{ documents: { some: { status: 'PUBLISHED' } } }, { gallery: { some: { status: 'PUBLISHED' } } }],
      },
      select: { id: true, storageKey: true, originalName: true, mimeType: true, bytes: true, sha256: true },
    });
    if (!asset) throw new NotFoundError('File not found');

    const etag = `"${asset.sha256}"`;
    const common = {
      'Content-Type': asset.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': contentDisposition(asset.originalName, 'inline'),
    };
    if (request && etagMatches(request.headers.get('if-none-match'), etag)) return notModified(etag, common);

    let stream: Readable;
    try {
      stream = await storage().get(asset.storageKey);
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        console.error('Published asset is missing from storage', asset.id);
        throw new NotFoundError('File not found');
      }
      throw error;
    }
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: { ...common, 'Content-Length': String(asset.bytes), 'Cache-Control': 'no-cache', ETag: etag },
    });
  }
  return { serve };
}

export const filesService = createFilesService();
