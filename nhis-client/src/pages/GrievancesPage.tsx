import { Notice } from '../components/common/Notice';
import { useLanguage } from '../context/LanguageContext';
import ContentPage from './ContentPage';

/** Grievance instructions are the source TPA text; addresses open mailto: links. There is deliberately no submission form. */
export default function GrievancesPage() {
  const { t } = useLanguage();
  return (
    <ContentPage slug="grievances" titleKey="pages.grievancesTitle" toc={false}>
      <Notice tone="info" role="note" className="grievance-note">
        <p>{t('grievances.guidance')}</p>
      </Notice>
    </ContentPage>
  );
}
