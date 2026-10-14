import { loadStorageConfig } from '../../config/storage';
import type { StoredExtension } from './storage.types';

export type UploadKind = 'document' | 'image';
export type DetectedType = 'pdf' | 'jpeg' | 'png' | 'webp';

export interface ValidatedUpload {
  assetKind: 'DOCUMENT' | 'IMAGE';
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

const TYPE_INFO: Record<DetectedType, { extension: StoredExtension; mimeType: string; assetKind: 'DOCUMENT' | 'IMAGE'; fileExtensions: readonly string[] }> = {
  pdf: { extension: 'pdf', mimeType: 'application/pdf', assetKind: 'DOCUMENT', fileExtensions: ['pdf'] },
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg', assetKind: 'IMAGE', fileExtensions: ['jpg', 'jpeg'] },
  png: { extension: 'png', mimeType: 'image/png', assetKind: 'IMAGE', fileExtensions: ['png'] },
  webp: { extension: 'webp', mimeType: 'image/webp', assetKind: 'IMAGE', fileExtensions: ['webp'] },
};

const ALLOWED_BY_KIND: Record<UploadKind, readonly DetectedType[]> = {
  document: ['pdf'],
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
  return null;
}

/** Last extension of the name, lower-cased, without the dot ('' when there is none). */
export function fileExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Control characters, no-break/line/paragraph separators and characters unsafe in headers or file systems. */
const UNSAFE_NAME_CHARS = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + '-' + String.fromCharCode(159)
    + String.fromCharCode(160, 8232, 8233) + '"<>|:*?]',
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
  const max = input.kind === 'document' ? limits.maxDocumentBytes : limits.maxImageBytes;
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
