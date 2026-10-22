import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale, TextContent } from '@nhis/shared-types';
import { useSiteContent } from '../hooks/useSiteContent';
import { interpolate, resolveMessage, type MessageKey, type MessageParams } from '../locales';
import { LOCALE_STORAGE_KEY, readInitialLocale } from '../utils/locale';
import { writeStorage } from '../utils/storage';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Interface label for the current language (administrator override first, then the locale files; English fallback if no Tamil exists). */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Language the label for `key` is actually written in (differs from `locale` on fallback). */
  langOf: (key: MessageKey) => Locale;
  /** True when the administrator wrote a text for `key` in the current language ("Page text" in the Admin). */
  hasOverride: (key: MessageKey) => boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

type Overrides = TextContent['overrides'];

/**
 * The administrator's text for `key` in `locale` ("Page text" in the Admin), or undefined. An empty text means "keep the
 * built-in text" and never wins, and a text stored for the other language is never used here: an override is written in
 * the language it is stored for.
 */
export function overrideFor(overrides: Overrides, locale: Locale, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(overrides, key)) return undefined;
  const text = overrides[key]?.[locale];
  return typeof text === 'string' && text.trim() !== '' ? text : undefined;
}

/** Interface label: the override when there is one, else the locale files. Parameters are filled in either way. */
export function translateWithOverrides(overrides: Overrides, locale: Locale, key: MessageKey, params?: MessageParams): string {
  const override = overrideFor(overrides, locale, key);
  return override !== undefined ? interpolate(override, params) : resolveMessage(locale, key, params).text;
}

/** Language of the label for `key`: the locale for an override, else the locale unless the label fell back to English. */
export function languageOfWithOverrides(overrides: Overrides, locale: Locale, key: MessageKey): Locale {
  if (overrideFor(overrides, locale, key) !== undefined) return locale;
  return resolveMessage(locale, key).origin === 'fallback-en' ? 'en' : locale;
}

/** Needs <SiteContentProvider> above it (the text overrides come from the managed site content). */
export function LanguageProvider({ children, initialLocale }: { children: ReactNode; /** Starting language (tests, server rendering); defaults to the stored choice. */ initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readInitialLocale());
  const { content } = useSiteContent();
  const overrides = content.text.overrides;

  // The document language drives screen-reader pronunciation and font selection.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStorage(LOCALE_STORAGE_KEY, next);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => translateWithOverrides(overrides, locale, key, params),
    langOf: (key) => languageOfWithOverrides(overrides, locale, key),
    hasOverride: (key) => overrideFor(overrides, locale, key) !== undefined,
  }), [locale, setLocale, overrides]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return value;
}
