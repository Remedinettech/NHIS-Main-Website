import { Link } from 'react-router-dom';
import { cx } from '../../utils/classNames';
import './brand-logo.css';

export type BrandLogoVariant = 'sidebar' | 'login' | 'compact';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** Renders the wordmark as a link to this route. */
  to?: string;
  className?: string;
}

const SUBTITLES: Record<BrandLogoVariant, string> = {
  sidebar: 'Administration',
  login: 'Tamil Nadu New Health Insurance Scheme',
  compact: 'Tamil Nadu New Health Insurance Scheme',
};

/** TN-NHIS text wordmark (real HTML text, no image). The subtitle depends on where the mark is used. */
export function BrandLogo({ variant = 'sidebar', to, className }: BrandLogoProps) {
  const mark = (
    <>
      <span className="brand-logo__name" translate="no">
        <span className="brand-logo__tn">TN</span>
        <span className="brand-logo__dash" aria-hidden="true">-</span>
        <span className="brand-logo__nhis">NHIS</span>
      </span>
      <span className="brand-logo__sub">{SUBTITLES[variant]}</span>
    </>
  );
  const classes = cx('brand-logo', `brand-logo--${variant}`, className);
  if (to) {
    return (
      <Link to={to} className={classes} aria-label={`TN-NHIS ${SUBTITLES[variant]}: go to the dashboard`}>
        {mark}
      </Link>
    );
  }
  return <div className={classes}>{mark}</div>;
}
