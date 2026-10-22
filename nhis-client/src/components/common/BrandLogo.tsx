import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteContent } from '../../hooks/useSiteContent';
import { cx } from '../../utils/classNames';
import { pickBilingual } from '../../utils/locale';
import './brand-logo.css';

export type BrandLogoVariant = 'header' | 'footer';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** Renders the wordmark as a link to this route. */
  to?: string;
  className?: string;
}

/**
 * Splits the website title at its first hyphen into the dark part and the blue part ("TN-NHIS" -> "TN" and "NHIS").
 * A title without a hyphen (or with one at either end) is shown in one colour.
 */
export function splitWordmark(title: string): { head: string; tail: string } {
  const hyphen = title.indexOf('-');
  if (hyphen <= 0 || hyphen === title.length - 1) return { head: title, tail: '' };
  return { head: title.slice(0, hyphen), tail: title.slice(hyphen + 1) };
}

/** Tamil letters in the text: it is then written in the page language, otherwise (Latin letters, such as "TN-NHIS") in English. */
export const wordmarkLanguage = (text: string, lang: 'en' | 'ta'): 'en' | 'ta' => (/[஀-௿]/.test(text) ? lang : 'en');

/**
 * Text wordmark (real HTML text, no image): the header's website title ("TN-NHIS", the part after the hyphen in blue)
 * with the scheme name (the header's subtitle) in the current language beneath it.
 */
export function BrandLogo({ variant = 'header', to, className }: BrandLogoProps) {
  const { t, locale } = useLanguage();
  const { header } = useSiteContent().content;
  const title = pickBilingual(header.title, locale);
  const subtitle = pickBilingual(header.subtitle, locale);
  const { head, tail } = splitWordmark(title.text);
  const mark = (
    <>
      <span className="brand-logo__name" translate="no" lang={wordmarkLanguage(title.text, title.lang)}>
        <span className="brand-logo__tn">{head}</span>
        {tail && <span className="brand-logo__dash" aria-hidden="true">-</span>}
        {tail && <span className="brand-logo__nhis">{tail}</span>}
      </span>
      {subtitle.text && <span className="brand-logo__sub" lang={subtitle.lang}>{subtitle.text}</span>}
    </>
  );
  const classes = cx('brand-logo', `brand-logo--${variant}`, className);
  if (to) {
    return (
      <Link to={to} className={classes}>
        {mark}
        <span className="visually-hidden"> – {t('site.homeLink')}</span>
      </Link>
    );
  }
  return <div className={classes}>{mark}</div>;
}
