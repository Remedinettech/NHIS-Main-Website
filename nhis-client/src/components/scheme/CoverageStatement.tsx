import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { displayedPageContent } from '../../utils/pageContent';
import { usePage } from '../../hooks/useContent';
import { ContentBlocks } from '../content/ContentBlocks';
import { useSiteDocument } from '../../hooks/useSiteContent';
import { BilingualText } from '../common/SiteLink';
import './scheme.css';

/** The Coverage page statements exactly as the source publishes them (no figures are added). */
export function CoverageStatement() {
  const { coverage } = useSiteDocument('home');
  const { locale } = useLanguage();
  const { data } = usePage('coverage');
  const page = data?.data;
  const shown = page ? displayedPageContent(page, locale) : undefined;
  if (!shown) return null;
  const { content, lang } = shown;
  return (
    <section className="coverage-statement panel" aria-labelledby="coverage-title">
      <h2 id="coverage-title"><BilingualText value={coverage.heading} /></h2>
      {content.sections.map((section) => <ContentBlocks key={section.id} blocks={section.blocks} lang={lang} />)}
      <p><Link to={ROUTES.coverage}><BilingualText value={coverage.linkLabel} /></Link></p>
    </section>
  );
}
