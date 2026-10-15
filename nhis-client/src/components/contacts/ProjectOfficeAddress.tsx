import { PROJECT_OFFICE_ADDRESS as A } from '../../config/projectOffice';
import { useLanguage } from '../../context/LanguageContext';

/** Postal address of the NHIS project office (used on the Contact page and in the footer). */
export function ProjectOfficeAddress({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <address className={className}>
      <strong>{A.company}</strong> {A.tagline}<br />
      {A.lines.map((line) => <span key={line}>{line}<br /></span>)}
      {t('footer.landline')}: <a href={A.landlineHref}>{A.landline}</a><br />
      {t('footer.gst')}: {A.gst}
    </address>
  );
}
