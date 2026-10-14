import { useLanguage } from '../../context/LanguageContext';
import type { MessageKey, MessageParams } from '../../locales';

/**
 * Renders an interface label. When the Tamil UI has to fall back to English for a key,
 * the span is marked lang="en" so screen readers and fonts treat it correctly.
 */
export function T({ k, params }: { k: MessageKey; params?: MessageParams }) {
  const { t, langOf, locale } = useLanguage();
  const lang = langOf(k);
  return lang === locale ? <>{t(k, params)}</> : <span lang={lang}>{t(k, params)}</span>;
}
