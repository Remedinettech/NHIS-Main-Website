import { Notice } from '../components/common/Notice';
import { OfficerTable } from '../components/contacts/OfficerTable';
import { ESCALATION_MATRIX_1, ESCALATION_MATRIX_2, NODAL_OFFICERS_2026 } from '../config/projectOffice';
import { useLanguage } from '../context/LanguageContext';
import { usePage } from '../hooks/useContent';
import { hasPageSection } from '../utils/pageContent';
import ContentPage from './ContentPage';

/**
 * Ids of the sections that carry the NHIS 2026 officer tables when an administrator keeps them inside the page itself
 * (Admin > Pages > Grievances > "Add supplied officer tables").
 */
export const OFFICER_SECTION_IDS = ['nodal-2026', 'escalation-1', 'escalation-2'] as const;

/** The nodal officer and the two escalation matrices supplied by UIIC (src/config/projectOffice.ts), as on the live site. */
export function OfficerSections() {
  const { t } = useLanguage();
  return (
    <section className="officer-section" aria-labelledby="nodal-2026">
      <h2 id="nodal-2026">{t('grievances.nodalHeading')}</h2>
      <OfficerTable caption={t('grievances.nodalHeading')} rows={NODAL_OFFICERS_2026} />
      <h3>{t('grievances.escalation1')}</h3>
      <OfficerTable caption={t('grievances.escalation1')} rows={ESCALATION_MATRIX_1} />
      <h3>{t('grievances.escalation2')}</h3>
      <OfficerTable caption={t('grievances.escalation2')} rows={ESCALATION_MATRIX_2} />
    </section>
  );
}

/**
 * Grievance instructions are the source TPA text (Admin > Pages > Grievances); addresses open mailto: links. There is
 * deliberately no submission form. The officer tables are built in, so the page looks like the live site whatever the
 * stored page text is; once an administrator adds them to the page text they are shown from there and not twice.
 */
export default function GrievancesPage() {
  const { t, locale } = useLanguage();
  const { data } = usePage('grievances');
  const page = data?.data.slug === 'grievances' ? data.data : undefined;
  const storedOfficerTables = hasPageSection(page, locale, OFFICER_SECTION_IDS);
  return (
    <ContentPage slug="grievances" titleKey="pages.grievancesTitle" toc={false}>
      <Notice tone="info" role="note" className="grievance-note">
        <p>{t('grievances.guidance')}</p>
      </Notice>
      {!storedOfficerTables && <OfficerSections />}
    </ContentPage>
  );
}
