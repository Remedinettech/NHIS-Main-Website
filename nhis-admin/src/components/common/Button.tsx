import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../../utils/classNames';
import './common.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Shared { variant?: Variant; size?: 'md' | 'sm'; children: ReactNode }

export function Button({ variant = 'primary', size = 'md', className, children, type = 'button', ...rest }:
  Shared & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)} {...rest}>{children}</button>;
}

/** Internal navigation styled as a button (renders an anchor, keeps router behaviour). */
export function LinkButton({ variant = 'primary', size = 'md', className, children, ...rest }: Shared & LinkProps) {
  return <Link className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)} {...rest}>{children}</Link>;
}
