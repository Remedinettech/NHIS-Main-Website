import { useEffect } from 'react';
import type { HeaderContent, Locale } from '@nhis/shared-types';
import { useLanguage } from '../context/LanguageContext';
import { pickBilingual } from '../utils/locale';
import { useSiteContent } from './useSiteContent';

/**
 * The browser tab title: "<page> | <website title>", or "<scheme name> | <website title>" when there is no page title.
 * Website title and scheme name are the header's title and subtitle (managed in the Admin under Header).
 */
export function documentTitleFor(page: string | undefined, header: Pick<HeaderContent, 'title' | 'subtitle'>, locale: Locale): string {
  const suffix = pickBilingual(header.title, locale).text;
  return `${page || pickBilingual(header.subtitle, locale).text} | ${suffix}`;
}

export function useDocumentTitle(title: string | undefined): void {
  const { locale } = useLanguage();
  const { content } = useSiteContent();
  const { title: websiteTitle, subtitle } = content.header;
  useEffect(() => {
    document.title = documentTitleFor(title, { title: websiteTitle, subtitle }, locale);
  }, [title, websiteTitle, subtitle, locale]);
}
