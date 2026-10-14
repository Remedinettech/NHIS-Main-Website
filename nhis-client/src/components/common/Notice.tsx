import type { ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Icon, type IconName } from './Icon';
import './common.css';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const ICONS: Record<NoticeTone, IconName> = { info: 'info', warning: 'alert', danger: 'alert', success: 'check' };

interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** `alert` interrupts assistive technology; use only for errors. */
  role?: 'status' | 'alert' | 'note';
  className?: string;
  lang?: string;
}

/** Inline message. Colour is paired with an icon and text so meaning never depends on colour alone. */
export function Notice({ tone = 'info', title, children, role, className, lang }: NoticeProps) {
  return (
    <div className={cx('notice', `notice--${tone}`, className)} role={role} lang={lang}>
      <Icon name={ICONS[tone]} className="notice__icon" />
      <div className="notice__body">
        {title && <p className="notice__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
