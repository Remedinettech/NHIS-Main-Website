import type { LocalizedPageContent, PageContent } from '@nhis/shared-types';

export interface PageSummary {
  slug: string;
  enSections: number | null;
  taSections: number | null;
  missing: Array<'English' | 'Tamil'>;
  notes: number;
  warnings: number;
}

export function summarisePage(page: PageContent): PageSummary {
  const missing: PageSummary['missing'] = [];
  if (!page.en) missing.push('English');
  if (!page.ta) missing.push('Tamil');
  return {
    slug: page.slug,
    enSections: page.en ? page.en.sections.length : null,
    taSections: page.ta ? page.ta.sections.length : null,
    missing,
    notes: page.reviewNotes.length,
    warnings: page.reviewNotes.filter((n) => n.severity === 'warning').length,
  };
}

export interface OutlineEntry { id: string; heading: string | undefined; blocks: number }

/** Headings and block counts only; body text is intentionally not reproduced in the admin outline. */
export function outline(content: LocalizedPageContent | null): OutlineEntry[] {
  return content ? content.sections.map((s) => ({ id: s.id, heading: s.heading?.trim() || undefined, blocks: s.blocks.length })) : [];
}
