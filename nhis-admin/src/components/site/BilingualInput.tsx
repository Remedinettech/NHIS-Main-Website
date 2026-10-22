import type { Bilingual } from '@nhis/shared-types';
import { useId, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { CountedControl } from './CountedControl';
import { useSiteForm } from './SiteFormContext';
import type { FieldErrors } from './siteForm';
import './site.css';

export interface BilingualInputProps {
  /** Name of the value, shown as the group legend ("Website title"). */
  label: string;
  /** Path of the value in the document ("title", "helplines.2.label"). Errors are read from `${path}.en` and `${path}.ta`. */
  path: string;
  value: Bilingual;
  onChange: (next: Bilingual) => void;
  /** Maximum length per language, a SITE_CONTENT_LIMITS value. */
  limit: number;
  /** English is required (marker and validation). Tamil is always optional: empty means the website shows the English text. */
  required?: boolean;
  /** Textarea instead of a single line (use for long texts and addresses). */
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
  className?: string;
}

/**
 * English and Tamil text of one value, side by side on wide screens and stacked on narrow ones. The Tamil control carries
 * lang="ta" (Tamil font, spell-check and input hints), both show a character counter against `limit`, and the English
 * one carries the required marker. Errors and read-only state come from the surrounding SiteContentEditor.
 */
export function BilingualInput({ label, path, value, onChange, limit, required, multiline, rows, hint, disabled, errors, className }: BilingualInputProps) {
  const form = useSiteForm();
  const errs = errors ?? form.errors;
  const off = disabled || form.readOnly;
  const hintId = useId();
  const groupError = errs[path];
  const shared = { limit, multiline, rows, disabled: off } as const;
  return (
    <fieldset className={cx('bilingual', className)} disabled={off} aria-describedby={hint ? hintId : undefined}>
      <legend className="bilingual__legend">{label}{required && <span className="ff__req" aria-hidden="true"> *</span>}</legend>
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      {groupError && <p className="ff__error" role="alert">{groupError}</p>}
      <div className="bilingual__grid">
        <CountedControl
          {...shared} label="English" lang="en" required={required} value={value.en} error={errs[`${path}.en`]}
          onChange={(en) => onChange({ ...value, en })}
        />
        <CountedControl
          {...shared} label={<>Tamil (<span lang="ta">தமிழ்</span>) <span className="ff__opt">optional</span></>} lang="ta" value={value.ta} error={errs[`${path}.ta`]}
          onChange={(ta) => onChange({ ...value, ta })}
        />
      </div>
    </fieldset>
  );
}
