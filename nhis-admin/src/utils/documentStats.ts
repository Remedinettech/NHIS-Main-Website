import type { DocumentCategory, DocumentRecord } from '@nhis/shared-types';

export interface CategoryCount { category: DocumentCategory; total: number; unavailable: number }

/** Fallback when /stats does not include `documentsByCategory`. */
export function documentsByCategory(documents: readonly DocumentRecord[]): CategoryCount[] {
  const map = new Map<DocumentCategory, CategoryCount>();
  for (const doc of documents) {
    const entry = map.get(doc.category) ?? { category: doc.category, total: 0, unavailable: 0 };
    entry.total += 1;
    if (doc.availability === 'unavailable') entry.unavailable += 1;
    map.set(doc.category, entry);
  }
  return [...map.values()];
}
