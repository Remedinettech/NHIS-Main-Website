import type { DocumentListResponse, DocumentRecord } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { NotFoundError } from '../../common/utils/errors';
import { parseEnum, parseIdParam } from '../../common/utils/validation';
import { DOCUMENT_AUDIENCES, DOCUMENT_CATEGORIES } from './documents.constants';
import { documentRepository, type DocumentRepository } from './documents.repository';

export { DOCUMENT_AUDIENCES, DOCUMENT_CATEGORIES };

export function createDocumentsService(repository: DocumentRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  /** Filters match exactly (audience=employee does not include records whose audience is "all"). Invalid values -> 400. */
  async function list(params: URLSearchParams = new URLSearchParams()): Promise<DocumentListResponse> {
    const category = parseEnum(params.get('category'), DOCUMENT_CATEGORIES, 'category');
    const audience = parseEnum(params.get('audience'), DOCUMENT_AUDIENCES, 'audience');
    const data = await repository.list({ category, audience });
    return { data, total: data.length, source: 'snapshot', capturedAt: capturedAt() };
  }

  async function getById(rawId: string): Promise<{ data: DocumentRecord; source: 'snapshot'; capturedAt: string }> {
    const id = parseIdParam(rawId, 'id');
    const record = await repository.findById(id);
    if (!record) throw new NotFoundError('Document not found');
    return { data: record, source: 'snapshot', capturedAt: capturedAt() };
  }

  return { list, getById };
}

export const documentsService = createDocumentsService(documentRepository);
