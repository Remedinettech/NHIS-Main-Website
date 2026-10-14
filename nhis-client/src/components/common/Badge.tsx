import type { ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import './common.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Small label. Semantic tones (success/warning/danger) are reserved for real status. */
export function Badge({ tone = 'neutral', children, lang }: { tone?: BadgeTone; children: ReactNode; lang?: string }) {
  return <span className={cx('badge', `badge--${tone}`)} lang={lang}>{children}</span>;
}
