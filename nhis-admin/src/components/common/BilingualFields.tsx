import { useId } from 'react';
import { TextAreaField, TextField } from './fields';
import './forms.css';

interface BilingualProps {
  /** Group name, for example "Hospital name". */
  legend: string;
  english: string;
  tamil: string;
  onEnglishChange: (value: string) => void;
  onTamilChange: (value: string) => void;
  required?: boolean;
  /** Tamil is optional unless `requireTamil` is set (defaults to the same as `required`). */
  requireTamil?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
  englishError?: string;
  tamilError?: string;
  disabled?: boolean;
}

/**
 * English and Tamil inputs for one value, side by side on wide screens and stacked on narrow ones.
 * The Tamil input carries lang="ta" so it uses the Tamil font and the right spell-check/IME hints.
 */
export function BilingualFields({
  legend, english, tamil, onEnglishChange, onTamilChange, required, requireTamil = required, multiline, rows = 4, maxLength,
  hint, englishError, tamilError, disabled,
}: BilingualProps) {
  const hintId = useId();
  const Control = multiline ? TextAreaField : TextField;
  const extra = multiline ? { rows } : {};
  return (
    <fieldset className="bilingual" aria-describedby={hint ? hintId : undefined} disabled={disabled}>
      <legend className="bilingual__legend">{legend}{required && <span className="ff__req" aria-hidden="true"> *</span>}</legend>
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      <div className="bilingual__grid">
        <Control label="English" value={english} onChange={onEnglishChange} required={required} error={englishError} maxLength={maxLength} lang="en" {...extra} />
        <Control label="Tamil (தமிழ்)" value={tamil} onChange={onTamilChange} required={requireTamil} error={tamilError} maxLength={maxLength} lang="ta" {...extra} />
      </div>
    </fieldset>
  );
}
