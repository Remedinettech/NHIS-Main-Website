import { DEFAULT_SITE_CONTENT, type SiteContentKey, type SiteContentMap } from '@nhis/shared-types';
import type { Prisma, PrismaClient } from '@prisma/client';
import { SETTING_KEYS } from '../site/site-settings';
import { applyLegacySettings, parseLegacySettings, type LegacySettings } from './legacy-overlay';

/** What `effectiveDefault` needs from the database: the client or a transaction client. */
export type SettingsReader = Pick<PrismaClient, 'siteSetting'> | Pick<Prisma.TransactionClient, 'siteSetting'>;

export async function readLegacySettings(db: SettingsReader): Promise<LegacySettings> {
  const rows = await db.siteSetting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } }, select: { key: true, value: true } });
  return parseLegacySettings(rows);
}

/** The built-in content of every document with the legacy settings laid over it (a fresh copy on every call). */
export async function effectiveDefaults(db: SettingsReader): Promise<SiteContentMap> {
  return applyLegacySettings(DEFAULT_SITE_CONTENT, await readLegacySettings(db));
}

/**
 * The content of one document while it has not been published: the built-in content plus the legacy settings
 * (docs/site-content-management.md, section 4). The public site shows it, and the admin editor starts from it.
 */
export async function effectiveDefault<K extends SiteContentKey>(key: K, db: SettingsReader): Promise<SiteContentMap[K]> {
  return (await effectiveDefaults(db))[key];
}
