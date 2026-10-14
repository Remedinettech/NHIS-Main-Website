import type { SiteSettingsResponse } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { siteRepository, type SiteRepository } from './site.repository';

export function createSiteService(repository: SiteRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  const getSettings = async (): Promise<SiteSettingsResponse> => ({
    data: { ...(await repository.getSettings()), capturedAt: capturedAt(), mode: 'snapshot' },
  });
  return { getSettings };
}

export const siteService = createSiteService(siteRepository);
