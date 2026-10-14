import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { usePage } from '../../hooks/useContent';
import { ContentBlocks } from '../content/ContentBlocks';
import './scheme.css';

/** The Coverage page statements exactly as the source publishes them (no figures are added). */
export function CoverageStatement() {
  const { t, locale } = useLanguage();
  const { data } = usePage('coverage');
  const page = data?.data;
  const content = page ? (page[locale] ?? page[locale === 'en' ? 'ta' : 'en']) : null;
  const lang = page && page[locale] ? locale : locale === 'en' ? 'ta' : 'en';
  if (!content) return null;
  return (
    <section className="coverage-statement panel" aria-labelledby="coverage-title">
      <h2 id="coverage-title">{t('pages.coverageTitle')}</h2>
      {content.sections.map((section) => <ContentBlocks key={section.id} blocks={section.blocks} lang={lang} />)}
      <p><Link to={ROUTES.coverage}>{t('home.coverageDetails')}</Link></p>
    </section>
  );
}
