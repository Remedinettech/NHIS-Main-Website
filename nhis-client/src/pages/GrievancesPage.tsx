import { OfficerTable } from '../components/contacts/OfficerTable';
import { Notice } from '../components/common/Notice';
import { useLanguage } from '../context/LanguageContext';
import { ESCALATION_MATRIX_1, ESCALATION_MATRIX_2, NODAL_OFFICERS_2026 } from '../config/projectOffice';
import ContentPage from './ContentPage';

/** Grievance instructions are the source TPA text; addresses open mailto: links. There is deliberately no submission form. */
export default function GrievancesPage() {
  const { t } = useLanguage();
  return (
    <ContentPage slug="grievances" titleKey="pages.grievancesTitle" toc={false}>
      <Notice tone="info" role="note" className="grievance-note">
        <p>{t('grievances.guidance')}</p>
      </Notice>
      <section className="officer-section" aria-labelledby="nodal-2026">
        <h2 id="nodal-2026">{t('grievances.nodalHeading')}</h2>
        <OfficerTable caption={t('grievances.nodalHeading')} rows={NODAL_OFFICERS_2026} />
        <h3>{t('grievances.escalation1')}</h3>
        <OfficerTable caption={t('grievances.escalation1')} rows={ESCALATION_MATRIX_1} />
        <h3>{t('grievances.escalation2')}</h3>
        <OfficerTable caption={t('grievances.escalation2')} rows={ESCALATION_MATRIX_2} />
      </section>
    </ContentPage>
  );
}
