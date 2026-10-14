import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { pickBilingual } from '../../utils/locale';
import { Icon } from '../common/Icon';
import { Notice } from '../common/Notice';
import './scheme.css';

/** Helplines exactly as published by the source (availability is the source's statement, not verified). */
export function HelplinePanel() {
  const { t, locale } = useLanguage();
  const { data, error } = useSiteSettings();
  return (
    <section className="helplines panel" aria-labelledby="helplines-title">
      <h2 id="helplines-title">{t('home.helplineHeading')}</h2>
      <p className="text-muted">{t('home.helplineIntro')}</p>
      {data ? (
        <>
          <ul className="helplines__list">
            {data.data.helplines.map((line) => {
              const label = pickBilingual(line.label, locale);
              return (
                <li key={line.id}>
                  <span className="helplines__label" lang={label.lang}>{label.text}</span>
                  <a className="helplines__number" href={line.telHref} aria-label={t('support.callAria', { label: label.text, number: line.number })}>
                    <Icon name="phone" size={20} /> {line.number}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="text-muted helplines__hours">{t('support.availability', { hours: data.data.availability })}</p>
        </>
      ) : error ? (
        <Notice tone="warning" role="note">{t('support.unavailable')}</Notice>
      ) : null}
    </section>
  );
}
