import { Readable } from 'node:stream';
import { contentDisposition } from './file-validation';
import type { StorageAdapter } from './storage.types';

export interface ByteRange { start: number; end: number }

/**
 * Reads a Range header for a file of `bytes` bytes.
 *  - `null`: send the whole file with 200. That is the answer when there is no Range header and also when the header is
 *    one this server deliberately does not honour: a unit other than `bytes` (RFC 9110, 14.2: such a header MUST be
 *    ignored) or SEVERAL ranges (multipart/byteranges is not implemented, RFC 9110 lets a server answer a multi-range
 *    request with the whole representation, and the API contract says so).
 *  - `'invalid'`: answer 416. A single range that is malformed or starts beyond the end of the file.
 *  - `{ start, end }`: answer 206 for these bytes (inclusive; `end` is clamped to the last byte).
 * Only plain decimal digits are accepted, so signs, fractions, hex and exponents never reach Number().
 */
export function byteRange(header: string | null, bytes: number): ByteRange | null | 'invalid' {
  const text = header?.trim();
  if (!text) return null;
  const equals = text.indexOf('=');
  if (equals === -1) return 'invalid';
  if (text.slice(0, equals).trim().toLowerCase() !== 'bytes') return null;
  const spec = text.slice(equals + 1).trim();
  if (spec.includes(',')) return null;
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (!match[1] && !match[2]) || bytes <= 0) return 'invalid';
  const [, first, last] = match;
  // "bytes=a-b" is the bytes a..b, "bytes=a-" runs to the end, "bytes=-n" is the last n bytes.
  const start = first ? Number(first) : Math.max(0, bytes - Number(last));
  const end = first && last ? Math.min(Number(last), bytes - 1) : bytes - 1;
  const emptySuffix = first === '' && Number(last) === 0;
  const satisfiable = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < bytes;
  return satisfiable && !emptySuffix ? { start, end } : 'invalid';
}

/** Caller must establish public/live visibility or an authenticated Admin session BEFORE calling. */
export async function storedFileResponse(asset: { bytes: number; mimeType: string; sha256: string; storageKey: string; originalName: string }, request: Request | undefined, storage: StorageAdapter): Promise<Response> {
  const etag = `"${asset.sha256}"`;
  // If-Range: the range is honoured only when the validator is exactly our strong ETag; a weak ETag or a date means "send everything".
  const ifRange = request?.headers.get('if-range');
  const range = byteRange(ifRange && ifRange !== etag ? null : request?.headers.get('range') ?? null, asset.bytes);
  const headers: Record<string, string> = {
    'Content-Type': asset.mimeType,
    'Content-Disposition': contentDisposition(asset.originalName),
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Cache-Control': 'no-cache',
  };
  if (range === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${asset.bytes}` } });
  headers['Content-Length'] = String(range ? range.end - range.start + 1 : asset.bytes);
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${asset.bytes}`;
  const stream = await storage.get(asset.storageKey, range ?? undefined);
  if (request?.method === 'HEAD') { stream.destroy(); return new Response(null, { status: range ? 206 : 200, headers }); }
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, { status: range ? 206 : 200, headers });
}
