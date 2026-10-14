import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { useDirectoryStats } from '../../hooks/useContent';
import { formatNumber } from '../../utils/format';
import { pickBilingual } from '../../utils/locale';
import { Button, LinkButton } from '../common/Button';
import { SearchField } from '../common/SearchField';
import './scheme.css';

/** Scheme identity, the source coverage statement, and the fastest route to a hospital search. */
export function HomeHero() {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const { data: site } = useSiteSettings();
  const { data: stats } = useDirectoryStats();
  const [query, setQuery] = useState('');

  const name = site ? pickBilingual(site.data.schemeName, locale) : { text: t('site.name'), lang: locale };
  const coverage = site ? pickBilingual(site.data.coverageStatement, locale) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `${ROUTES.hospitals}?${new URLSearchParams({ q })}` : ROUTES.hospitals);
  };

  return (
    <section className="hero" aria-labelledby="page-title">
      <div className="container hero__grid">
        <div className="hero__text">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h1 id="page-title" tabIndex={-1} lang={name.lang}>{name.text}</h1>
          {coverage && (
            <div className="hero__coverage">
              <p className="hero__coverage-label">{t('home.coverageHeading')}</p>
              <p className="hero__coverage-text" lang={coverage.lang}>{coverage.text}</p>
            </div>
          )}
          <div className="hero__actions">
            <LinkButton to={ROUTES.coverage} variant="secondary">{t('home.coverageDetails')}</LinkButton>
            <LinkButton to={ROUTES.forms} variant="ghost">{t('nav.forms')}</LinkButton>
          </div>
        </div>

        <form className="hero__search panel" role="search" aria-labelledby="hero-search-title" onSubmit={submit}>
          <h2 id="hero-search-title">{t('home.findHospital')}</h2>
          <p className="text-muted">{t('home.findHospitalHint')}</p>
          <SearchField label={t('hospitals.searchLabel')} value={query} onChange={setQuery} placeholder={t('home.searchPlaceholder')} name="q" />
          <div className="hero__search-actions">
            <Button type="submit">{t('home.searchButton')}</Button>
            <LinkButton to={ROUTES.hospitals} variant="ghost">{t('home.browseAllHospitals')}</LinkButton>
          </div>
          {stats && (
            <p className="hero__search-note text-muted">
              {t('home.hospitalCount', { count: formatNumber(stats.hospitals, locale) })}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
