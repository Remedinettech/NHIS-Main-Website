import { useId, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Icon } from '../common/Icon';
import { useSiteForm } from './SiteFormContext';
import type { FieldErrors } from './siteForm';
import '../common/common.css';
import '../common/forms.css';
import './site.css';

export interface SiteSelectOption { value: string; label: string }
export interface SiteSelectGroup { label: string; options: readonly SiteSelectOption[] }

export interface SiteSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Options without a group. */
  options?: readonly SiteSelectOption[];
  /** Grouped options (<optgroup>), listed after `options`. */
  groups?: readonly SiteSelectGroup[];
  /** First, empty option such as "Choose a page". */
  placeholder?: string;
  required?: boolean;
  hint?: ReactNode;
  /** Path in the document; the error is read from it. */
  path?: string;
  /** Explicit error (wins over the one found by `path`). */
  error?: string;
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
  className?: string;
}

/** Labelled select with optional groups, a hint and an inline error. Errors and read-only state come from SiteContentEditor. */
export function SiteSelect({ label, value, onChange, options = [], groups = [], placeholder, required, hint, path, error, disabled, errors, className }: SiteSelectProps) {
  const id = useId();
  const form = useSiteForm();
  const message = error ?? (path ? (errors ?? form.errors)[path] : undefined);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const off = disabled || form.readOnly;
  return (
    <div className={cx('ff', message && 'ff--invalid', className)}>
      <label htmlFor={id} className="ff__label">
        {label}
        {required && <span className="ff__req" aria-hidden="true"> *</span>}
        {required && <span className="visually-hidden"> (required)</span>}
      </label>
      <div className="select-box">
        <select
          id={id} value={value} disabled={off} required={required} className="ff__control" aria-invalid={message ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} onChange={(event) => onChange(event.target.value)}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </optgroup>
          ))}
        </select>
        <Icon name="chevronDown" className="select-box__icon" />
      </div>
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      {message && <p className="ff__error" id={errorId} role="alert">{message}</p>}
    </div>
  );
}
