import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@nhis/shared-types';
import { resolveMessage, type MessageKey, type MessageParams } from '../locales';
import { LOCALE_STORAGE_KEY, readInitialLocale } from '../utils/locale';
import { writeStorage } from '../utils/storage';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Interface label for the current language (explicit English fallback if no Tamil exists). */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Language the label for `key` is actually written in (differs from `locale` on fallback). */
  langOf: (key: MessageKey) => Locale;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

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
    t: (key, params) => resolveMessage(locale, key, params).text,
    langOf: (key) => (resolveMessage(locale, key).origin === 'fallback-en' ? 'en' : locale),
  }), [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return value;
}
