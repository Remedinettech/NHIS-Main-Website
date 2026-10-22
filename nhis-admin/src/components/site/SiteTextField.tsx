import type { ReactNode } from 'react';
import { CountedControl } from './CountedControl';
import { useSiteForm } from './SiteFormContext';
import type { FieldErrors } from './siteForm';

export interface SiteTextFieldProps {
  label: string;
  /** Path of the value in the document ("availability", "contact.email"); the error is read from it. */
  path: string;
  value: string;
  onChange: (next: string) => void;
  /** Maximum length, a SITE_CONTENT_LIMITS value. */
  limit: number;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  type?: 'text' | 'email' | 'tel' | 'url';
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric';
  placeholder?: string;
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
  className?: string;
}

/** A single language-neutral text value (number, address, e-mail, availability) with counter, hint and inline error. */
export function SiteTextField({ label, path, value, onChange, limit, required, multiline, rows, hint, type, inputMode, placeholder, disabled, errors, className }: SiteTextFieldProps) {
  const form = useSiteForm();
  const errs = errors ?? form.errors;
  return (
    <CountedControl
      label={label} value={value} onChange={onChange} limit={limit} required={required} multiline={multiline} rows={rows} hint={hint}
      type={type} inputMode={inputMode} placeholder={placeholder} disabled={disabled || form.readOnly} error={errs[path]} className={className}
    />
  );
}
