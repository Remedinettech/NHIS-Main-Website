import { Link } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useDocumentRegistry } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { DocumentList } from '../documents/DocumentList';
import './scheme.css';

/** Enrolment forms and policy lists for quick download, with links to the full document pages. */
export function HomeDocuments() {
  const { t } = useLanguage();
  const { state } = useDocumentRegistry();
  const docs = (state.data?.data ?? [])
    .filter((doc) => doc.category === 'enrolment-form' || doc.category === 'policy-non-payable')
    .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  if (docs.length === 0) return null;
  return (
    <section className="home-docs" aria-labelledby="home-docs-title">
      <div className="home-docs__head">
        <div>
          <h2 id="home-docs-title">{t('home.documentsHeading')}</h2>
          <p className="text-muted">{t('home.documentsIntro')}</p>
        </div>
        <p className="home-docs__links">
          <Link to={ROUTES.governmentOrders}>{t('home.allOrders')}</Link>
          <Link to={ROUTES.forms}>{t('home.allForms')}</Link>
        </p>
      </div>
      <DocumentList documents={docs} labelledBy="home-docs-title" />
    </section>
  );
}
