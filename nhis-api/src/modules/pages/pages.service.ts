import type { PageResponse } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { NotFoundError } from '../../common/utils/errors';
import { parseSlugParam } from '../../common/utils/validation';
import { pageRepository, toPageContent, type PageRepository } from './pages.repository';

export function createPagesService(repository: PageRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  /** Malformed slug -> ValidationError (400); unknown or unpublished slug -> NotFoundError (404). */
  async function getPage(rawSlug: string): Promise<PageResponse> {
    const slug = parseSlugParam(rawSlug, 'slug');
    const page = await repository.findPublishedBySlug(slug);
    if (!page) throw new NotFoundError('Page not found');
    const date = capturedAt();
    return { data: toPageContent(page, date), source: 'snapshot', capturedAt: date };
  }
  return { getPage };
}

export const pagesService = createPagesService(pageRepository);
