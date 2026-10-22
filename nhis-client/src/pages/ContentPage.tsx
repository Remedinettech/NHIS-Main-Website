import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PageSlug } from '@nhis/shared-types';
import { ErrorState, LoadingState } from '../components/common/StateViews';
import { PageHeader } from '../components/common/PageHeader';
import { ContentPageView } from '../components/content/ContentPageView';
import { useLanguage } from '../context/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePage } from '../hooks/useContent';
import type { MessageKey } from '../locales';
import { displayedPageContent } from '../utils/pageContent';

export interface RelatedLink { to: string; labelKey: MessageKey }

interface ContentPageProps {
  slug: PageSlug;
  /** Interface label used for the heading and tab title until (and if) the source title loads. */
  titleKey: MessageKey;
  related?: ReadonlyArray<RelatedLink>;
  toc?: boolean;
  /** Extra content shown inside the article after the source sections. */
  children?: ReactNode;
}

/** Route-level wrapper for a source page served by the API: loading, error, content. */
export default function ContentPage({ slug, titleKey, related, toc = true, children }: ContentPageProps) {
  const { t, locale, hasOverride } = useLanguage();
  const { data, error, loading, reload } = usePage(slug);
  // The route element is reused when the visitor goes from one page to another, so `data` still holds the previous page
  // while the next one loads: only the requested page is shown.
  const page = data?.data.slug === slug ? data.data : undefined;
  const content = page ? displayedPageContent(page, locale)?.content : undefined;
  // A title written under "Page text" in the Admin replaces the title of the page content (empty = keep the page's own title).
  const written = hasOverride(titleKey) ? t(titleKey) : undefined;
  useDocumentTitle(written ?? content?.title ?? t(titleKey));

  if (error && !page) {
    return (
      <div className="page container">
        <PageHeader title={t(titleKey)} />
        <ErrorState error={error} titleKey="pages.loadError" onRetry={reload} />
      </div>
    );
  }
  if (loading || !page) {
    return (
      <div className="page container">
        <PageHeader title={t(titleKey)} />
        <LoadingState rows={3} />
      </div>
    );
  }

  return (
    <ContentPageView page={page} toc={toc} title={written}>
      {children}
      {related && related.length > 0 && (
        <nav className="related" aria-label={t('pages.relatedLinks')}>
          <h2>{t('pages.relatedLinks')}</h2>
          <ul>
            {related.map((item) => <li key={item.to}><Link to={item.to}>{t(item.labelKey)}</Link></li>)}
          </ul>
        </nav>
      )}
    </ContentPageView>
  );
}
