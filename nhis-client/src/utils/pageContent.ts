import type { Locale, LocalizedPageContent, PageContent } from '@nhis/shared-types';

/** The language other than `locale`. */
export const otherLocale = (locale: Locale): Locale => (locale === 'en' ? 'ta' : 'en');

/**
 * The text of a page that a visitor reading `locale` is shown: that language when the page has text in it, otherwise the
 * other language (the page then says so, see ContentPageView). `undefined` when the page has no text in either language.
 */
export function displayedPageContent(page: PageContent, locale: Locale): { content: LocalizedPageContent; lang: Locale } | undefined {
  const preferred = page[locale];
  if (preferred) return { content: preferred, lang: locale };
  const fallback = page[otherLocale(locale)];
  return fallback ? { content: fallback, lang: otherLocale(locale) } : undefined;
}

/**
 * Whether the page has anything to show besides its title: a section heading or a block (paragraph, list, picture or
 * document link) in the text shown for `locale`. The title alone is no content: every page has one.
 */
export function hasPageContent(page: PageContent | undefined, locale: Locale): boolean {
  const shown = page ? displayedPageContent(page, locale) : undefined;
  return shown !== undefined && shown.content.sections.some((section) => Boolean(section.heading?.trim()) || section.blocks.length > 0);
}

/**
 * Whether the text shown for `locale` contains a section with one of `ids` (for example the officer tables that an
 * administrator moved into the page text).
 */
export function hasPageSection(page: PageContent | undefined, locale: Locale, ids: ReadonlyArray<string>): boolean {
  const shown = page ? displayedPageContent(page, locale) : undefined;
  return shown !== undefined && shown.content.sections.some((section) => ids.includes(section.id));
}
