import type { SiteContentResponse } from '@nhis/shared-types';
import { siteContentRepository, type SiteContentRepository } from './site-content.repository';

export function createSiteContentService(repository: SiteContentRepository) {
  const getSiteContent = async (): Promise<SiteContentResponse> => ({ data: await repository.getPublished() });
  return { getSiteContent };
}

export const siteContentService = createSiteContentService(siteContentRepository);
