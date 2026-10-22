import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cx } from '../../utils/classNames';
import { Icon } from './Icon';
import './common.css';

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> {
  href: string;
  children: ReactNode;
  /** Render as a button-style link. */
  variant?: 'link' | 'primary' | 'secondary' | 'ghost';
  showIcon?: boolean;
  /** What kind of destination this is, announced before "opens in a new tab" (for example "PDF" for a document file). */
  note?: string;
}

/** Link to another site or file: opens in a new tab and says so to assistive technology. */
export function ExternalLink({ children, className, variant = 'link', showIcon = true, note, ...rest }: Props) {
  const { t } = useLanguage();
  return (
    <a
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(variant === 'link' ? 'ext-link' : `btn btn--${variant}`, className)}
    >
      {children}
      {showIcon && <Icon name="external" size={16} className="ext-link__icon" />}
      <span className="visually-hidden"> ({note ? `${note}, ` : ''}{t('common.opensInNewTab')})</span>
    </a>
  );
}
