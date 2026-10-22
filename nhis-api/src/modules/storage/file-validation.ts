import { loadStorageConfig } from '../../config/storage';
import type { StoredExtension } from './storage.types';

export type UploadKind = 'document' | 'image' | 'video';
export type DetectedType = 'pdf' | 'jpeg' | 'png' | 'webp' | 'mp4';

export interface ValidatedUpload {
  assetKind: 'DOCUMENT' | 'IMAGE' | 'VIDEO';
  /** Canonical extension used for the storage key. */
  extension: StoredExtension;
  mimeType: string;
  /** Sanitised display name (metadata only, never used as a path). */
  originalName: string;
  bytes: number;
}

export class FileValidationError extends Error {
  constructor(
    readonly code: 'UNSUPPORTED_FILE' | 'FILE_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'FileValidationError';
  }
}

const TYPE_INFO: Record<DetectedType, { extension: StoredExtension; mimeType: string; assetKind: 'DOCUMENT' | 'IMAGE' | 'VIDEO'; fileExtensions: readonly string[] }> = {
  mp4: { extension: 'mp4', mimeType: 'video/mp4', assetKind: 'VIDEO', fileExtensions: ['mp4'] },
  pdf: { extension: 'pdf', mimeType: 'application/pdf', assetKind: 'DOCUMENT', fileExtensions: ['pdf'] },
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg', assetKind: 'IMAGE', fileExtensions: ['jpg', 'jpeg'] },
  png: { extension: 'png', mimeType: 'image/png', assetKind: 'IMAGE', fileExtensions: ['png'] },
  webp: { extension: 'webp', mimeType: 'image/webp', assetKind: 'IMAGE', fileExtensions: ['webp'] },
};

const ALLOWED_BY_KIND: Record<UploadKind, readonly DetectedType[]> = {
  document: ['pdf'],
  video: ['mp4'],
  image: ['jpeg', 'png', 'webp'],
};

const startsWith = (data: Uint8Array, signature: readonly number[], offset = 0) =>
  data.byteLength >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte);

/** Detects the file type from its leading bytes (`%PDF-`, FFD8FF, 89504E47 0D0A1A0A, RIFF....WEBP). */
export function detectFileType(data: Uint8Array): DetectedType | null {
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (isMp4Video(data)) return 'mp4';
  return null;
}

/** Last extension of the name, lower-cased, without the dot ('' when there is none). */
export function fileExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Characters that are removed from a display name: control characters, no-break space, line and paragraph separators,
 * characters that hide or reorder text (zero-width space, bidi embeddings and overrides, word joiner and invisible
 * operators, BOM: the set the site-content validator refuses too; the zero-width joiners that Tamil needs stay) and
 * characters that are unsafe in headers or file systems.
 */
const UNSAFE_NAME_CHARS = new RegExp(
  '[\u0000-\u001f\u007f-\u009f\u00a0\u2028\u2029\u200b\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff"<>|:*?]',
  'g',
);

/**
 * Display-safe version of a client supplied file name: directory parts, control characters and quotes are removed
 * and the length is capped. The result is metadata only; storage keys never contain it.
 */
export function sanitizeOriginalName(name: string, maxLength = 120): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .replace(UNSAFE_NAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!base) return 'file';
  if (base.length <= maxLength) return base;
  const ext = fileExtensionOf(base);
  const suffix = ext ? `.${ext.slice(0, 10)}` : '';
  return `${base.slice(0, maxLength - suffix.length)}${suffix}`;
}

export interface UploadLimits {
  maxDocumentBytes: number;
  maxImageBytes: number;
  maxVideoBytes?: number;
}

/**
 * Validates an uploaded file: size limit for the kind, extension allow-list and magic bytes that must agree with the
 * extension. Throws `FileValidationError`. Returns what the caller needs to store the asset.
 */
export function validateUpload(
  input: { kind: UploadKind; fileName: string; data: Uint8Array },
  limits: UploadLimits = loadStorageConfig(),
): ValidatedUpload {
  const allowed = ALLOWED_BY_KIND[input.kind];
  if (!allowed) throw new FileValidationError('UNSUPPORTED_FILE', 'Unknown upload kind');
  const max = input.kind === 'video' ? Math.min(limits.maxVideoBytes ?? 25 * 1024 * 1024, 25 * 1024 * 1024) : input.kind === 'document' ? limits.maxDocumentBytes : limits.maxImageBytes;
  if (input.data.byteLength === 0) throw new FileValidationError('UNSUPPORTED_FILE', 'The file is empty');
  if (input.data.byteLength > max) {
    throw new FileValidationError('FILE_TOO_LARGE', `The file is larger than the ${Math.floor(max / (1024 * 1024))} MB limit`);
  }
  const extension = fileExtensionOf(input.fileName);
  const permittedExtensions = allowed.flatMap((type) => TYPE_INFO[type].fileExtensions);
  if (!permittedExtensions.includes(extension)) {
    throw new FileValidationError('UNSUPPORTED_FILE', `Only ${permittedExtensions.map((e) => `.${e}`).join(', ')} files are accepted`);
  }
  const detected = detectFileType(input.data);
  if (!detected || !allowed.includes(detected)) throw new FileValidationError('UNSUPPORTED_FILE', 'The file content is not an accepted type');
  if (!TYPE_INFO[detected].fileExtensions.includes(extension)) {
    throw new FileValidationError('UNSUPPORTED_FILE', 'The file content does not match its extension');
  }
  const info = TYPE_INFO[detected];
  return {
    assetKind: info.assetKind,
    extension: info.extension,
    mimeType: info.mimeType,
    originalName: sanitizeOriginalName(input.fileName),
    bytes: input.data.byteLength,
  };
}

/** `Content-Disposition` value with an ASCII fallback and an RFC 5987 UTF-8 name; header injection is impossible. */
export function contentDisposition(name: string, disposition: 'inline' | 'attachment' = 'inline'): string {
  const safe = sanitizeOriginalName(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"%;]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Brands (the "major brand" of the ftyp box) of the MP4 family that browsers play. QuickTime ("qt  ") and 3GPP are not accepted. */
const MP4_BRANDS = /^(isom|iso[2-9]|mp4[12]|avc1|dash|M4V )$/;

/** A real file has a handful of top-level boxes (a fragmented one a few thousand); a flood of tiny boxes is only a way to burn CPU. */
const MAX_TOP_LEVEL_BOXES = 100_000;

/**
 * ISO BMFF video only. The top level of the file must be a complete sequence of boxes that ends exactly at the end of the
 * data (no truncation, no trailing bytes), starting with an `ftyp` box of a known MP4 brand, and it must contain a `moov`
 * box that names a video handler and a non-empty `mdat`. Box sizes are bounded by the data that is really there, so size
 * fields that overflow or lie cannot make the walk run off the buffer or loop. This is a gate on the container, not a
 * decoder: the file is stored privately and only ever served as video/mp4 with nosniff.
 */
export function isMp4Video(data: Uint8Array): boolean {
  if (data.length < 32) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const type = (at: number) => String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3]);
  let offset = 0;
  let boxes = 0;
  let brand = false;
  let movie = false;
  let media = false;
  while (offset + 8 <= data.length) {
    if (++boxes > MAX_TOP_LEVEL_BOXES) return false;
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      // A 64-bit size follows the type. It must be a safe integer that is at least the 16 header bytes.
      if (offset + 16 > data.length) return false;
      const large = view.getBigUint64(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = data.length - offset; // "extends to the end of the file"
    }
    if (size < header || offset + size > data.length) return false;
    const kind = type(offset + 4);
    if (kind === 'ftyp') {
      if (offset !== 0 || size < 16) return false;
      brand = MP4_BRANDS.test(type(offset + header));
    } else if (kind === 'moov') {
      movie = Buffer.from(data.buffer, data.byteOffset + offset + header, size - header).includes('vide');
    } else if (kind === 'mdat' && size > header) {
      media = true;
    }
    offset += size;
  }
  return offset === data.length && brand && movie && media;
}
