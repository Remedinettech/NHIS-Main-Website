import type { PageSection } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { Disclosure } from '../common/Disclosure';
import './content.css';

/** Anchored table of contents. A list on wide screens, a collapsible list on small screens. */
export function SectionNav({ sections, lang }: { sections: ReadonlyArray<PageSection>; lang: string }) {
  const { t } = useLanguage();
  const items = sections.filter((section) => section.heading);
  if (items.length < 2) return null;
  const list = (
    <ul className="section-nav__list" lang={lang}>
      {items.map((section) => (
        <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>
      ))}
    </ul>
  );
  return (
    <nav className="section-nav" aria-label={t('common.onThisPage')}>
      <div className="section-nav__wide">
        <p className="section-nav__title">{t('common.onThisPage')}</p>
        {list}
      </div>
      <div className="section-nav__narrow">
        <Disclosure summary={t('common.onThisPage')}>{list}</Disclosure>
      </div>
    </nav>
  );
}
