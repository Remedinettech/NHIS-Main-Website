/** Client-side pre-checks that mirror the server's upload limits. The server stays authoritative. */
export type UploadKind = 'document' | 'image';

export interface UploadRule { kind: UploadKind; maxBytes: number; mimeTypes: readonly string[]; extensions: readonly string[]; description: string }

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  document: { kind: 'document', maxBytes: 25 * 1024 * 1024, mimeTypes: ['application/pdf'], extensions: ['pdf'], description: 'PDF, up to 25 MB' },
  image: { kind: 'image', maxBytes: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], extensions: ['jpg', 'jpeg', 'png', 'webp'], description: 'JPEG, PNG or WebP, up to 5 MB' },
};

export function acceptAttribute(kind: UploadKind): string {
  const rule = UPLOAD_RULES[kind];
  return [...rule.extensions.map((e) => `.${e}`), ...rule.mimeTypes].join(',');
}

/** Returns a message when the file should not be sent, or null when it passes the pre-checks. */
export function checkUploadFile(file: { name: string; size: number; type: string }, kind: UploadKind): string | null {
  const rule = UPLOAD_RULES[kind];
  const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  if (!rule.extensions.includes(extension) || (file.type && !rule.mimeTypes.includes(file.type))) {
    return `This file type is not accepted. Choose a file of this kind: ${rule.description}.`;
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > rule.maxBytes) return `This file is too large. The limit is ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`;
  return null;
}
