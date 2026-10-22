import { Fragment, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Bilingual, LinkTarget } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { useLinkContext } from '../../hooks/useVisibleNav';
import { cx } from '../../utils/classNames';
import { pickBilingual } from '../../utils/locale';
import { linkLabel, resolveLink, type LinkLabel } from '../../utils/siteLinks';
import { ExternalLink } from './ExternalLink';

/** Text in the current language (English, marked lang="en", when no Tamil text exists). Plain text, never HTML. */
export function BilingualText({ value }: { value: Bilingual }) {
  const { locale } = useLanguage();
  const { text, lang } = pickBilingual(value, locale);
  return lang === locale ? <>{text}</> : <span lang={lang}>{text}</span>;
}

/** A link label from `linkLabel()`: pieces written in another language than the page (fallback) are marked with `lang`. */
export function LinkLabelText({ label }: { label: LinkLabel }) {
  const { locale } = useLanguage();
  return (
    <>
      {label.segments.map((segment, index) => (
        <Fragment key={index}>{segment.lang === locale ? segment.text : <span lang={segment.lang}>{segment.text}</span>}</Fragment>
      ))}
    </>
  );
}

export type SiteLinkAppearance =
  /** Text link. External addresses and files get the external-link icon (default). */
  | 'link'
  /** A plain anchor without the external-link class or icon, for components that style the anchor themselves (tiles, rows). */
  | 'bare'
  /** Button styles (the `btn` classes). */
  | 'primary' | 'secondary' | 'ghost';

export interface SiteLinkProps {
  /** A LinkItem, or any object with a bilingual `label` and a `target` (quick tiles, pathway links, ...). */
  item: { label: Bilingual; target: LinkTarget };
  className?: string;
  /** Route links become active-state aware (`is-active`), for the main menu. */
  nav?: boolean;
  appearance?: SiteLinkAppearance;
  /** Shows the external-link icon after the label of external and document links (appearance "link" and the button styles). */
  showIcon?: boolean;
  /** Replaces the default label. A function receives the resolved label (use <LinkLabelText label={label} /> for the text). */
  children?: ReactNode | ((label: LinkLabel) => ReactNode);
}

/**
 * Renders a managed link (LinkItem / LinkTarget) in the right way for what it leads to:
 * - a page of this site: react-router <Link> (hash anchors work; `nav` gives <NavLink> with `is-active`);
 * - another site or a document file: opens in a new tab and says so to assistive technology, with "PDF" for files;
 * - an email address or phone number: a plain mailto: / tel: anchor.
 * The label is the link's text in the current language, `{title}` replaced by the document title for document files.
 * Renders nothing when the target cannot be shown (missing document, unknown route, ...); lists should filter with
 * `visibleLinks()` first so that surrounding markup (list items, headings) disappears too.
 */
export function SiteLink({ item, className, nav = false, appearance = 'link', showIcon = true, children }: SiteLinkProps) {
  const { locale, t } = useLanguage();
  const context = useLinkContext();
  const link = resolveLink(item.target, context);
  if (!link) return null;

  const label = linkLabel(item.label, link, locale);
  const content = typeof children === 'function' ? children(label) : (children ?? <LinkLabelText label={label} />);
  const buttonClass = appearance === 'primary' || appearance === 'secondary' || appearance === 'ghost' ? `btn btn--${appearance}` : undefined;

  if (link.kind === 'route') {
    if (nav) {
      return (
        <NavLink to={link.href} end={link.href === '/'} className={({ isActive }) => cx(className, isActive && 'is-active')}>
          {content}
        </NavLink>
      );
    }
    return <Link to={link.href} className={cx(buttonClass, className)}>{content}</Link>;
  }
  if (link.kind === 'external' || link.kind === 'file') {
    const note = link.kind === 'file' ? t('common.pdf') : undefined;
    if (appearance === 'bare') {
      return (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
          {content}
          <span className="visually-hidden"> ({note ? `${note}, ` : ''}{t('common.opensInNewTab')})</span>
        </a>
      );
    }
    return (
      <ExternalLink href={link.href} className={className} variant={appearance} showIcon={showIcon} note={note}>
        {content}
      </ExternalLink>
    );
  }
  return <a href={link.href} className={cx(buttonClass, className)}>{content}</a>;
}
