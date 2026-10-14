import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

/** Sets the browser tab title: "<page> | TN-NHIS". */
export function useDocumentTitle(title: string | undefined): void {
  const { t } = useLanguage();
  useEffect(() => {
    const suffix = t('site.shortName');
    document.title = title ? `${title} | ${suffix}` : `${t('site.name')} | ${suffix}`;
  }, [title, t]);
}
