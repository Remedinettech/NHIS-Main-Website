import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Locale, PageContent } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { displayedPageContent } from '../../utils/pageContent';
import { Notice } from '../common/Notice';
import { PageHeader } from '../common/PageHeader';
import { T } from '../common/T';
import { ContentBlocks } from './ContentBlocks';
import { SectionNav } from './SectionNav';
import './content.css';

interface ContentPageViewProps {
  page: PageContent;
  /** Show the anchored section list beside long pages. */
  toc?: boolean;
  /** Extra content placed after the sections (related documents, links). */
  children?: ReactNode;
  /** Heading written by the administrator ("Page text"), in the interface language; replaces the title of the page content. */
  title?: string;
}

/**
 * Renders one captured source page in the current language. When that language has no source text
 * the other language is shown with an explicit notice (never an automatic translation).
 */
export function ContentPageView({ page, toc = true, children, title }: ContentPageViewProps) {
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const previousLocale = useRef(locale);

  const shown = displayedPageContent(page, locale);
  const content = shown?.content;
  const contentLang: Locale = shown?.lang ?? locale;

  // Keep the reader's place when the language changes: move the #anchor to the matching section.
  useEffect(() => {
    if (previousLocale.current === locale) return;
    const from = previousLocale.current;
    previousLocale.current = locale;
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    const key = page[from]?.sections.find((section) => section.id === hash)?.key;
    const target = key ? page[locale]?.sections.find((section) => section.key === key) : undefined;
    if (target) {
      navigate({ hash: `#${target.id}` }, { replace: true });
      document.getElementById(target.id)?.scrollIntoView();
    }
  }, [locale, location.hash, navigate, page]);

  if (!content) return null;

  const hasAnyHeading = content.sections.some((section) => section.heading);
  const showToc = toc && hasAnyHeading;

  return (
    <div className="page container">
      <PageHeader title={title ?? content.title} lang={title === undefined ? contentLang : locale} />
      {contentLang !== locale && (
        <Notice tone="info" role="note" className="content-fallback">
          <T k={locale === 'ta' ? 'fallback.tamilMissing' : 'fallback.englishMissing'} />
        </Notice>
      )}
      <div className={showToc ? 'content-layout has-toc' : 'content-layout'}>
        {showToc && <SectionNav sections={content.sections} lang={contentLang} />}
        <article className="content-article panel" lang={contentLang}>
          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className="content-section" aria-labelledby={section.heading ? `${section.id}-heading` : undefined}>
              {section.heading && <h2 id={`${section.id}-heading`}>{section.heading}</h2>}
              <ContentBlocks blocks={section.blocks} lang={contentLang} />
            </section>
          ))}
          {children}
        </article>
      </div>
    </div>
  );
}
