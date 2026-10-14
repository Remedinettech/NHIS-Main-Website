import type { Announcement, InlineNode, SiteSettings } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { UnavailableError } from '../../common/utils/errors';
import { SETTING_KEYS, type HelplinesSettingValue, type PortalsSettingValue, type SchemeSettingValue } from './site-settings';

export type SiteContent = Omit<SiteSettings, 'capturedAt' | 'mode'>;

export interface SiteRepository {
  /** Live settings plus the announcements that are PUBLISHED and inside their start/end window at `now`. */
  getSettings(now?: Date): Promise<SiteContent>;
}

/** Announcements are public only when PUBLISHED and within their optional start/end window. */
export const visibleAnnouncementWhere = (now: Date) => ({
  status: 'PUBLISHED' as const,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
});

export function createPrismaSiteRepository(client: PrismaClient = prisma): SiteRepository {
  return {
    async getSettings(now = new Date()) {
      const [settingRows, announcements] = await Promise.all([
        client.siteSetting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } }),
        client.announcement.findMany({ where: visibleAnnouncementWhere(now), orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      ]);
      const byKey = new Map(settingRows.map((r) => [r.key, r.value]));
      const scheme = byKey.get(SETTING_KEYS.scheme) as SchemeSettingValue | undefined;
      const helplines = byKey.get(SETTING_KEYS.helplines) as HelplinesSettingValue | undefined;
      const portals = byKey.get(SETTING_KEYS.portals) as PortalsSettingValue | undefined;
      if (!scheme || !Array.isArray(helplines)) throw new UnavailableError('Site settings are not available');
      const content: SiteContent = {
        schemeName: { en: scheme.schemeNameEn, ta: scheme.schemeNameTa },
        coverageStatement: { en: scheme.coverageStatementEn, ta: scheme.coverageStatementTa },
        helplines: helplines.map((h) => ({ id: h.id, label: { en: h.labelEn, ta: h.labelTa }, number: h.number, telHref: h.telHref })),
        availability: scheme.availability,
        announcements: announcements.map((a) => ({
          id: a.id,
          kind: a.kind as Announcement['kind'],
          severity: a.severity as Announcement['severity'],
          message: { en: a.messageEn as unknown as InlineNode[], ta: a.messageTa as unknown as InlineNode[] },
        })),
      };
      if (Array.isArray(portals) && portals.length > 0) {
        content.portals = portals.map((p) => ({ id: p.id, label: { en: p.label, ta: p.labelTa }, href: p.href }));
      }
      return content;
    },
  };
}

export const siteRepository: SiteRepository = createPrismaSiteRepository();
