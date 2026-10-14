/**
 * Server-only configuration. Imported by route handlers and services only (never by shared-types or client code).
 * Values are read from process.env with safe defaults; secrets are never read, stored or returned here.
 */
export interface ServerConfig {
  /** Date of the source capture (YYYY-MM-DD) reported as `capturedAt` (the imported content comes from that capture). */
  snapshotDate: string;
}

export const DEFAULT_SNAPSHOT_DATE = '2026-10-07';

export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const date = env.NHIS_SNAPSHOT_DATE;
  return {
    snapshotDate: date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : DEFAULT_SNAPSHOT_DATE,
  };
}

export const serverConfig: ServerConfig = loadServerConfig();
