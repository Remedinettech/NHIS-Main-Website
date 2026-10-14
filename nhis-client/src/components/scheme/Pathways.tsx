import { Link } from 'react-router-dom';
import type { DocumentAudience, DocumentRecord } from '@nhis/shared-types';
import { usePortalHrefs } from '../../hooks/usePortals';
import { ROUTES } from '../../config/routes';
import { useDocumentRegistry } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { pickBilingual } from '../../utils/locale';
import { Icon, type IconName } from '../common/Icon';
import './scheme.css';
import { resolveApiUrl } from '../../utils/urls';

type Audience = Extract<DocumentAudience, 'employee' | 'pensioner'>;

function PathwayPanel({ audience }: { audience: Audience }) {
  const { t, locale } = useLanguage();
  const { byId } = useDocumentRegistry();
  const { data: site } = useSiteSettings();
  const hrefs = usePortalHrefs();

  const form: DocumentRecord | undefined = [...byId.values()].find((doc) => doc.category === 'enrolment-form' && doc.audience === audience);
  const helpline = site?.data.helplines.find((line) => line.id === audience);
  const helplineLabel = helpline ? pickBilingual(helpline.label, locale) : undefined;

  const employee = audience === 'employee';
  const headingId = `pathway-${audience}`;
  const rows: Array<{ icon: IconName; label: string; to: string }> = [
    { icon: 'clipboard', label: employee ? t('home.employeePolicy') : t('home.pensionerPolicy'), to: employee ? ROUTES.employeePolicy : ROUTES.pensionerPolicy },
    { icon: 'scale', label: t('home.govOrders'), to: `${ROUTES.governmentOrders}#${audience}-orders` },
  ];

  return (
    <section className="pathway" aria-labelledby={headingId}>
      <h3 id={headingId}>{employee ? t('home.employeePath') : t('home.pensionerPath')}</h3>
      <ul className="pathway__list">
        {rows.map((row) => (
          <li key={row.to}>
            <Link to={row.to}><Icon name={row.icon} size={20} /><span>{row.label}</span><Icon name="arrowRight" size={16} className="pathway__arrow" /></Link>
          </li>
        ))}
        {form && form.localPath && (
          <li>
            <a href={resolveApiUrl(form.localPath)} target="_blank" rel="noopener noreferrer">
              <Icon name="file" size={20} />
              <span>{t('home.enrolForm')}: <span lang={pickBilingual(form.label, locale).lang}>{pickBilingual(form.title, locale).text}</span></span>
              <Icon name="external" size={16} className="pathway__arrow" />
              <span className="visually-hidden"> ({t('common.pdf')}, {t('common.opensInNewTab')})</span>
            </a>
          </li>
        )}
        <li>
          <a href={employee ? hrefs.employee : hrefs.pensioner} target="_blank" rel="noopener noreferrer">
            <Icon name="login" size={20} />
            <span>{employee ? t('home.employeeLogin') : t('home.pensionerLogin')}</span>
            <Icon name="external" size={16} className="pathway__arrow" />
            <span className="visually-hidden"> ({t('nav.external')})</span>
          </a>
        </li>
      </ul>
      {helpline && helplineLabel && (
        <p className="pathway__helpline">
          <Icon name="phone" size={18} />
          <span lang={helplineLabel.lang}>{helplineLabel.text}</span>:{' '}
          <a href={helpline.telHref}>{helpline.number}</a>
        </p>
      )}
    </section>
  );
}

/** Employee and pensioner pathways side by side. */
export function Pathways() {
  const { t } = useLanguage();
  return (
    <section className="pathways" aria-labelledby="pathways-title">
      <h2 id="pathways-title">{t('home.pathwaysHeading')}</h2>
      <div className="pathways__grid">
        <PathwayPanel audience="employee" />
        <PathwayPanel audience="pensioner" />
      </div>
    </section>
  );
}
