import type { ContactRow, DocumentAvailability, DocumentCategory, DocumentRecord } from '@nhis/shared-types';
import { matchesAllWords } from './text';

export interface DocumentFilter { category: DocumentCategory | ''; availability: DocumentAvailability | ''; q: string }

export function filterDocuments(documents: readonly DocumentRecord[], filter: DocumentFilter): DocumentRecord[] {
  return documents.filter((doc) => {
    if (filter.category && doc.category !== filter.category) return false;
    if (filter.availability && doc.availability !== filter.availability) return false;
    return matchesAllWords(`${doc.label.en} ${doc.label.ta} ${doc.id} ${doc.notes.join(' ')}`, filter.q);
  });
}

/** Literal word search across every cell of a contact row. */
export function filterContactRows(rows: readonly ContactRow[], q: string): ContactRow[] {
  return rows.filter((row) => matchesAllWords(Object.values(row.cells).join(' '), q));
}
