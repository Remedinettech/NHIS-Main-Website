import { DocumentGroup } from '../components/documents/DocumentGroup';
import { ROUTES } from '../config/routes';
import { useDocumentRegistry } from '../context/DocumentsContext';
import { useLanguage } from '../context/LanguageContext';
import ContentPage from './ContentPage';

/** Forms and downloads: the source page content plus the full document rows for every related download. */
export default function FormsPage() {
  const { t } = useLanguage();
  const { state } = useDocumentRegistry();
  const all = state.data?.data ?? [];
  const by = (category: string) => all.filter((doc) => doc.category === category).sort((a, b) => a.order - b.order);

  return (
    <ContentPage
      slug="forms"
      titleKey="pages.formsTitle"
      toc={false}
      related={[
        { to: ROUTES.enrollment, labelKey: 'nav.enroll' },
        { to: ROUTES.governmentOrders, labelKey: 'nav.governmentOrders' },
      ]}
    >
      {all.length > 0 && (
        <div className="forms-downloads">
          <DocumentGroup id="enrolment-forms" heading={t('documents.formsHeading')} documents={by('enrolment-form')} />
          <DocumentGroup id="enrolment-guides" heading={t('documents.guidesHeading')} documents={by('enrolment-guide')} />
          <DocumentGroup id="policy-lists" heading={t('documents.policyHeading')} documents={by('policy-non-payable')} />
        </div>
      )}
    </ContentPage>
  );
}
