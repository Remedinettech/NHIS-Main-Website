import type { ReactNode } from 'react';
import { safeExternalUrl } from '../../utils/safeUrl';
import { Icon } from './Icon';
import './common.css';

/** Link to an http(s) destination taken from data. Renders plain text when the URL is not safe. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeExternalUrl(href);
  if (!safe) return <>{children}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="ext-link">
      {children}
      <Icon name="external" size={14} className="ext-link__icon" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
