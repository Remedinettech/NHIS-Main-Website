import type { Bilingual, Locale } from '@nhis/shared-types';
import { readStorage } from './storage';

export const LOCALE_STORAGE_KEY = 'nhis.locale';
/** Key used by the legacy tn-nhis.com script ('eng' or 'tam'). */
export const LEGACY_LOCALE_STORAGE_KEY = 'lang';

export function parseLocale(value: string | null | undefined): Locale | undefined {
  if (value === 'en' || value === 'eng') return 'en';
  if (value === 'ta' || value === 'tam') return 'ta';
  return undefined;
}

/** Stored choice (new key first, then the legacy key), defaulting to English. */
export function readInitialLocale(): Locale {
  return parseLocale(readStorage(LOCALE_STORAGE_KEY)) ?? parseLocale(readStorage(LEGACY_LOCALE_STORAGE_KEY)) ?? 'en';
}

/** Chooses the text for a locale, falling back to the other language when the source has none. */
export function pickBilingual(value: Bilingual<string>, locale: Locale): { text: string; lang: Locale } {
  const preferred = value[locale].trim();
  if (preferred) return { text: preferred, lang: locale };
  const other: Locale = locale === 'en' ? 'ta' : 'en';
  return { text: value[other].trim(), lang: other };
}
