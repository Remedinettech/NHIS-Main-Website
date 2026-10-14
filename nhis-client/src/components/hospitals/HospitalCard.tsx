import type { Hospital } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { safeMapUrl } from '../../utils/safeUrl';
import { tidy } from '../../utils/text';
import { Badge } from '../common/Badge';
import { ExternalLink } from '../common/ExternalLink';
import { Icon } from '../common/Icon';
import './hospitals.css';

/**
 * One source hospital record. Tamil and English names/addresses are always shown together
 * (the source cards are bilingual independently of the language selector); the selected language leads.
 */
export function HospitalCard({ hospital }: { hospital: Hospital }) {
  const { t, locale } = useLanguage();
  const second = locale === 'en' ? 'ta' : 'en';
  const mapUrl = safeMapUrl(hospital.mapUrl);
  const specialty = tidy(hospital.specialty);
  const contact = hospital.contact.trim();
  const headingId = `hospital-${hospital.id}`;
  const district = (lang: 'en' | 'ta') => tidy(hospital.district[lang]);

  return (
    <li className="hospital">
      <article aria-labelledby={headingId}>
        <header className="hospital__head">
          <h3 id={headingId} className="hospital__name" lang={locale}>{tidy(hospital.name[locale])}</h3>
          <p className="hospital__name hospital__name--alt" lang={second}>{tidy(hospital.name[second])}</p>
          <p className="hospital__tags">
            {district(locale) && <Badge tone="info" lang={locale}>{district(locale)}</Badge>}
            {hospital.type.trim() && <Badge>{tidy(hospital.type)}</Badge>}
          </p>
        </header>

        <dl className="hospital__details">
          <div className="hospital__row">
            <dt>{t('hospitals.address')}</dt>
            <dd>
              <span lang={locale}>{tidy(hospital.address[locale])}</span>
              <span lang={second} className="hospital__alt">{tidy(hospital.address[second])}</span>
              <span className="hospital__place">
                <span lang={locale}>{[district(locale), tidy(hospital.state[locale])].filter(Boolean).join(', ')}</span>
                {hospital.postcode.trim() && <> · {t('hospitals.pin')} {tidy(hospital.postcode)}</>}
              </span>
            </dd>
          </div>
          <div className="hospital__row">
            <dt>{t('hospitals.specialties')}</dt>
            <dd lang="en">{specialty || <span className="text-muted" lang={locale}>{t('hospitals.noSpecialty')}</span>}</dd>
          </div>
          <div className="hospital__row">
            <dt>{t('hospitals.contact')}</dt>
            <dd className="hospital__contact">{contact || <span className="text-muted">{t('hospitals.noContact')}</span>}</dd>
          </div>
        </dl>

        <footer className="hospital__foot">
          {mapUrl ? (
            <ExternalLink href={mapUrl} variant="secondary" showIcon={false} className="hospital__map">
              <Icon name="pin" size={18} /> {t('hospitals.viewMap')}
            </ExternalLink>
          ) : (
            <span className="text-muted">{t('hospitals.noMap')}</span>
          )}
        </footer>
      </article>
    </li>
  );
}
