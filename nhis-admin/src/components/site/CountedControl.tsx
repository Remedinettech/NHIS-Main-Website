import { useId, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { characterCount } from './siteForm';
import './site.css';

export interface CountedControlProps {
  /** Visible label (may contain a lang="ta" span). */
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Maximum length from SITE_CONTENT_LIMITS. The counter turns red above it; the text is never cut off silently. */
  limit: number;
  /** Language of the content: "ta" gives the Tamil font and the right spell-check and input hints. */
  lang?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url';
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric';
  placeholder?: string;
  autoComplete?: string;
  className?: string;
}

/**
 * One labelled input or textarea with a character counter against its limit, a hint and an inline error. Building block
 * of BilingualInput and SiteTextField. The counter is part of the field's description; the error is announced as an alert.
 */
export function CountedControl({
  label, value, onChange, limit, lang, required, multiline, rows = 3, hint, error, disabled, type = 'text', inputMode, placeholder, autoComplete, className,
}: CountedControlProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const countId = `${id}-count`;
  const errorId = error ? `${id}-error` : undefined;
  const count = characterCount(value);
  const over = count > limit;
  const common = {
    id, value, lang, disabled, required, placeholder,
    className: cx('ff__control', multiline && 'ff__control--area'),
    'aria-invalid': error || over ? (true as const) : undefined,
    'aria-describedby': [hintId, countId, errorId].filter(Boolean).join(' '),
  };
  return (
    <div className={cx('ff', (error || over) && 'ff--invalid', className)}>
      <label htmlFor={id} className="ff__label">
        {label}
        {required && <span className="ff__req" aria-hidden="true"> *</span>}
        {required && <span className="visually-hidden"> (required)</span>}
      </label>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} type={type} inputMode={inputMode} autoComplete={autoComplete ?? 'off'} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      <p className={cx('ff__count', over && 'ff__count--over')} id={countId}>
        {count} / {limit}<span className="visually-hidden"> characters{over ? ', too long' : ''}</span>
      </p>
      {error && <p className="ff__error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
