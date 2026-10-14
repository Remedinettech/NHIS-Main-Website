import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { cx } from '../../utils/classNames';
import './brand-logo.css';

export type BrandLogoVariant = 'header' | 'footer';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** Renders the wordmark as a link to this route. */
  to?: string;
  className?: string;
}

/**
 * TN-NHIS text wordmark (real HTML text, no image). The subtitle is the scheme name in the
 * current language: English text, or the existing Tamil scheme name.
 */
export function BrandLogo({ variant = 'header', to, className }: BrandLogoProps) {
  const { t, locale } = useLanguage();
  const mark = (
    <>
      <span className="brand-logo__name" translate="no">
        <span className="brand-logo__tn">TN</span>
        <span className="brand-logo__dash" aria-hidden="true">-</span>
        <span className="brand-logo__nhis">NHIS</span>
      </span>
      <span className="brand-logo__sub" lang={locale}>{t('site.name')}</span>
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
