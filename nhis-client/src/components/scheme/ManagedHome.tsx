import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { telHrefFor } from '@nhis/shared-types';
import { ROUTES } from '../../config/routes';
import { useDocumentRegistry } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useDirectoryStats } from '../../hooks/useContent';
import { useSiteDocument } from '../../hooks/useSiteContent';
import { useLinkContext } from '../../hooks/useVisibleNav';
import { formatNumber } from '../../utils/format';
import { pickBilingual } from '../../utils/locale';
import { visibleLinks } from '../../utils/siteLinks';
import { Button, LinkButton } from '../common/Button';
import { Icon } from '../common/Icon';
import { SearchField } from '../common/SearchField';
import { SiteImage } from '../common/SiteImage';
import { BilingualText as Text, LinkLabelText, SiteLink } from '../common/SiteLink';
import { DocumentList } from '../documents/DocumentList';
import './scheme.css';

/*
 * The homepage sections, drawn from the managed `home` content (and the header's helplines). Markup, class names and
 * heading ids are those of the built-in homepage before it became editable. A section that has nothing to show renders
 * nothing, and every link goes through `visibleLinks` / <SiteLink>, so a link that cannot be resolved is left out.
 */

/** A text that has something to show in the current language (English when no Tamil text exists). */
const hasText = (value: { en: string; ta: string }, locale: 'en' | 'ta'): boolean => pickBilingual(value, locale).text !== '';

export function ManagedHero() {
  const { hero } = useSiteDocument('home');
  const { locale, t } = useLanguage();
  const { data: stats } = useDirectoryStats();
  const context = useLinkContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `${ROUTES.hospitals}?${new URLSearchParams({ q })}` : ROUTES.hospitals);
  };

  const actions = visibleLinks(hero.actions, context);
  return (
    <section className="hero" aria-labelledby="page-title">
      <div className="container hero__grid">
        <div className="hero__text">
          <p className="eyebrow"><Text value={hero.eyebrow} /></p>
          <h1 id="page-title" tabIndex={-1}><Text value={hero.title} /></h1>
          {hasText(hero.description, locale) && <p className="hero__description"><Text value={hero.description} /></p>}
          {hasText(hero.coverageStatement, locale) && (
            <div className="hero__coverage">
              <p className="hero__coverage-label"><Text value={hero.coverageHeading} /></p>
              <p className="hero__coverage-text"><Text value={hero.coverageStatement} /></p>
            </div>
          )}
          {actions.length > 0 && (
            <div className="hero__actions">
              {actions.map(({ item }) => <SiteLink key={item.id} item={item} appearance={item.variant} />)}
            </div>
          )}
          {hero.banner && <SiteImage className="hero__banner" image={hero.banner} />}
        </div>
        <form className="hero__search panel" role="search" aria-labelledby="hero-search-title" onSubmit={submit}>
          <h2 id="hero-search-title"><Text value={hero.search.heading} /></h2>
          <p className="text-muted"><Text value={hero.search.hint} /></p>
          <SearchField
            label={t('hospitals.searchLabel')}
            value={query}
            onChange={setQuery}
            placeholder={pickBilingual(hero.search.placeholder, locale).text}
            name="q"
          />
          <div className="hero__search-actions">
            <Button type="submit"><Text value={hero.search.button} /></Button>
            <LinkButton to={ROUTES.hospitals} variant="ghost"><Text value={hero.search.browseAll} /></LinkButton>
          </div>
          {hero.search.showCount && stats && (
            <p className="hero__search-note text-muted">{t('home.hospitalCount', { count: formatNumber(stats.hospitals, locale) })}</p>
          )}
        </form>
      </div>
    </section>
  );
}

export function ManagedQuickAccess() {
  const { quickAccess } = useSiteDocument('home');
  const context = useLinkContext();
  const { locale } = useLanguage();
  const tiles = visibleLinks(quickAccess.tiles, context);
  if (tiles.length === 0) return null;

  return (
    <section className="quick" aria-labelledby="quick-title">
      <h2 id="quick-title"><Text value={quickAccess.heading} /></h2>
      <ul className="quick__list">
        {tiles.map(({ item: tile, link }) => (
          <li key={tile.id}>
            <SiteLink item={tile} appearance="bare" className="quick__link">
              <span className="quick__icon"><Icon name={tile.icon} size={22} /></span>
              <span className="quick__text">
                <span className="quick__label"><Text value={tile.label} /></span>
                {hasText(tile.hint, locale) && <span className="quick__hint text-muted"><Text value={tile.hint} /></span>}
              </span>
              <Icon name={link.newTab ? 'external' : 'arrowRight'} size={18} className="quick__arrow" />
            </SiteLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ManagedPathways() {
  const { pathways } = useSiteDocument('home');
  const header = useSiteDocument('header');
  const context = useLinkContext();
  const { locale } = useLanguage();

  const groups = pathways.groups
    .filter((group) => group.visible)
    .map((group) => ({
      group,
      links: visibleLinks(group.links, context),
      helpline: header.helplines.find((line) => line.visible && line.id === group.helplineId),
    }))
    .filter(({ links, helpline }) => links.length > 0 || helpline !== undefined);
  if (groups.length === 0) return null;

  return (
    <section className="pathways" aria-labelledby="pathways-title">
      <h2 id="pathways-title"><Text value={pathways.heading} /></h2>
      <div className="pathways__grid">
        {groups.map(({ group, links, helpline }) => {
          const helplineLabel = helpline ? pickBilingual(helpline.label, locale) : undefined;
          return (
            <section key={group.id} className="pathway" aria-labelledby={`pathway-${group.id}`}>
              <h3 id={`pathway-${group.id}`}><Text value={group.heading} /></h3>
              {links.length > 0 && (
                <ul className="pathway__list">
                  {links.map(({ item, link }) => (
                    <li key={item.id}>
                      <SiteLink item={item} appearance="bare">
                        {(label) => (
                          <>
                            <Icon name={item.icon} size={20} />
                            <span><LinkLabelText label={label} /></span>
                            <Icon name={link.newTab ? 'external' : 'arrowRight'} size={16} className="pathway__arrow" />
                          </>
                        )}
                      </SiteLink>
                    </li>
                  ))}
                </ul>
              )}
              {helpline && helplineLabel && (
                <p className="pathway__helpline">
                  <Icon name="phone" size={18} />
                  <span lang={helplineLabel.lang}>{helplineLabel.text}</span>:{' '}
                  <a href={telHrefFor(helpline.number)}>{helpline.number}</a>
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function ManagedDocuments() {
  const { documents } = useSiteDocument('home');
  const { state } = useDocumentRegistry();
  const context = useLinkContext();
  const { locale } = useLanguage();

  const all = state.data?.data ?? [];
  // Chosen documents in the editor's order; without a choice, every document of the chosen categories as listed on the Forms page.
  const docs = documents.documentIds.length > 0
    ? documents.documentIds.flatMap((id) => all.filter((doc) => doc.id === id))
    : all.filter((doc) => documents.categories.includes(doc.category)).sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  const links = visibleLinks(documents.links, context);
  if (docs.length === 0 && links.length === 0) return null;

  return (
    <section className="home-docs" aria-labelledby="home-docs-title">
      <div className="home-docs__head">
        <div>
          <h2 id="home-docs-title"><Text value={documents.heading} /></h2>
          {hasText(documents.intro, locale) && <p className="text-muted"><Text value={documents.intro} /></p>}
        </div>
        {links.length > 0 && (
          <p className="home-docs__links">
            {links.map(({ item }) => <SiteLink key={item.id} item={item} />)}
          </p>
        )}
      </div>
      {docs.length > 0 && <DocumentList documents={docs} labelledBy="home-docs-title" />}
    </section>
  );
}

export function ManagedHelplines() {
  const { helplines } = useSiteDocument('home');
  const header = useSiteDocument('header');
  const { t, locale } = useLanguage();
  const lines = header.helplines.filter((line) => line.visible);
  if (lines.length === 0) return null;

  return (
    <section className="helplines panel" aria-labelledby="helplines-title">
      <h2 id="helplines-title"><Text value={helplines.heading} /></h2>
      {hasText(helplines.intro, locale) && <p className="text-muted"><Text value={helplines.intro} /></p>}
      <ul className="helplines__list">
        {lines.map((line) => {
          const label = pickBilingual(line.label, locale);
          return (
            <li key={line.id}>
              <span className="helplines__label" lang={label.lang}>{label.text}</span>
              <a className="helplines__number" href={telHrefFor(line.number)} aria-label={t('support.callAria', { label: label.text, number: line.number })}>
                <Icon name="phone" size={20} /> {line.number}
              </a>
            </li>
          );
        })}
      </ul>
      {header.availability && <p className="text-muted helplines__hours">{t('support.availability', { hours: header.availability })}</p>}
    </section>
  );
}

/** Coverage amounts, durations and other scheme details. Nothing is drawn until the editor adds visible items. */
export function ManagedHighlights() {
  const { highlights } = useSiteDocument('home');
  const { locale } = useLanguage();
  const items = highlights.items.filter((item) => item.visible);
  if (items.length === 0) return null;

  return (
    <section className="highlights" aria-labelledby="highlights-title">
      <h2 id="highlights-title"><Text value={highlights.heading} /></h2>
      {hasText(highlights.intro, locale) && <p className="highlights__intro"><Text value={highlights.intro} /></p>}
      <ul className="highlights__grid">
        {items.map((item) => (
          <li key={item.id} className="highlights__item panel">
            <p className="highlights__value"><Text value={item.value} /></p>
            <p className="highlights__label"><Text value={item.label} /></p>
            {hasText(item.note, locale) && <p className="highlights__note text-muted"><Text value={item.note} /></p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
