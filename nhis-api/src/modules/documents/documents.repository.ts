import type { DocumentAudience, DocumentCategory, DocumentRecord } from '@nhis/shared-types';
import type { Document as DocumentRow, MediaAsset, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { DOCUMENT_CATEGORIES, publicFileUrl } from './documents.constants';

export interface DocumentFilter {
  category?: DocumentCategory;
  audience?: DocumentAudience;
}

/** Data-access contract for documents (PostgreSQL). Only PUBLISHED, live values are returned. */
export interface DocumentRepository {
  /** Published records in category / menu order, including those without a file (availability "unavailable"). */
  list(filter?: DocumentFilter): Promise<DocumentRecord[]>;
  findById(id: string): Promise<DocumentRecord | null>;
}

type Row = DocumentRow & { asset: MediaAsset | null };

/** Maps a stored row to the public contract. The storage key is never part of the result. */
export function toPublicDocument(row: Row): DocumentRecord {
  const record: DocumentRecord = {
    id: row.id,
    category: row.category as DocumentCategory,
    audience: row.audience as DocumentAudience,
    order: row.sortOrder,
    label: { en: row.labelEn, ta: row.labelTa },
    title: { en: row.titleEn, ta: row.titleTa },
    dateLabel: { en: row.dateLabelEn, ta: row.dateLabelTa },
    sourceUrl: row.sourceUrl ?? '',
    localPath: row.asset ? publicFileUrl(row.asset.id) : null,
    availability: row.asset ? 'available' : 'unavailable',
    notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
  };
  if (row.availabilityNote) record.availabilityNote = row.availabilityNote;
  if (row.pages !== null) record.pages = row.pages;
  if (row.asset) {
    record.bytes = row.asset.bytes;
    record.sha256 = row.asset.sha256;
  }
  if (row.hasTextIndex !== null) record.hasTextIndex = row.hasTextIndex;
  if (row.fileNameDate) record.fileNameDate = row.fileNameDate;
  if (row.language === 'en' || row.language === 'ta') record.language = row.language;
  if (row.versionGroup) record.versionGroup = row.versionGroup;
  return record;
}

const rank = (category: string) => {
  const i = (DOCUMENT_CATEGORIES as readonly string[]).indexOf(category);
  return i === -1 ? DOCUMENT_CATEGORIES.length : i;
};

export function createPrismaDocumentRepository(client: PrismaClient = prisma): DocumentRepository {
  return {
    async list(filter = {}) {
      const where: Prisma.DocumentWhereInput = { status: 'PUBLISHED' };
      if (filter.category) where.category = filter.category;
      if (filter.audience) where.audience = filter.audience;
      const rows = await client.document.findMany({ where, include: { asset: true } });
      return rows
        .sort((a, b) => rank(a.category) - rank(b.category) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map(toPublicDocument);
    },
    async findById(id) {
      const row = await client.document.findFirst({ where: { id, status: 'PUBLISHED' }, include: { asset: true } });
      return row ? toPublicDocument(row) : null;
    },
  };
}

export const documentRepository: DocumentRepository = createPrismaDocumentRepository();
