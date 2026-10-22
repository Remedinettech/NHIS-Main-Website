import path from 'node:path';

/** File storage configuration (server only). Read from the environment on every call so tests can change it. */
export interface StorageConfig {
  driver: 'local';
  /** Absolute root directory of the local driver. */
  rootDir: string;
  maxDocumentBytes: number;
  maxImageBytes: number;
  maxVideoBytes: number;
}

export const DEFAULT_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Env = Record<string, string | undefined>;

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || !/^\d{1,12}$/.test(raw.trim())) return fallback;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function loadStorageConfig(env: Env = process.env, cwd: string = process.cwd()): StorageConfig {
  const driver = (env.FILE_STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (driver !== 'local') throw new Error(`Unsupported FILE_STORAGE_DRIVER "${driver}" (only "local" is implemented)`);
  const configured = env.FILE_STORAGE_DIR?.trim();
  return {
    driver: 'local',
    rootDir: path.resolve(cwd, configured && configured.length > 0 ? configured : 'storage'),
    maxDocumentBytes: positiveInt(env.UPLOAD_MAX_DOCUMENT_BYTES, DEFAULT_MAX_DOCUMENT_BYTES),
    maxVideoBytes: Math.min(positiveInt(env.UPLOAD_MAX_VIDEO_BYTES, 25 * 1024 * 1024), 25 * 1024 * 1024),
    maxImageBytes: positiveInt(env.UPLOAD_MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES),
  };
}
