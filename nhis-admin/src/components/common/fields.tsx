import { useId, useState, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Icon } from './Icon';
import './forms.css';

interface BaseProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  /** Inline error. When set the control is marked aria-invalid and the message is announced with the field. */
  error?: string;
  disabled?: boolean;
  /** Visually smaller label for compact groups. */
  className?: string;
}

interface ShellProps extends BaseProps { id: string; children: (aria: { 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode; lang?: string }

/** Label, required marker, hint and error wiring shared by every field. */
function FieldShell({ id, label, required, hint, error, className, children }: ShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ff', error && 'ff--invalid', className)}>
      <label htmlFor={id} className="ff__label">
        {label}
        {required && <span className="ff__req" aria-hidden="true"> *</span>}
        {required && <span className="visually-hidden"> (required)</span>}
      </label>
      {children({ 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      {error && <p className="ff__error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

interface TextProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric';
  type?: 'text' | 'email' | 'tel' | 'url' | 'datetime-local';
  /** Language of the content (use "ta" for Tamil text so the right font and spell-check apply). */
  lang?: string;
  name?: string;
  autoFocus?: boolean;
}

export function TextField({ value, onChange, maxLength, placeholder, autoComplete, inputMode, type = 'text', lang, name, disabled, autoFocus, ...shell }: TextProps) {
  const id = useId();
  return (
    <FieldShell id={id} disabled={disabled} {...shell}>
      {(aria) => (
        <input
          id={id} name={name} type={type} value={value} lang={lang} maxLength={maxLength} placeholder={placeholder}
          autoComplete={autoComplete ?? 'off'} inputMode={inputMode} disabled={disabled} required={shell.required}
          autoFocus={autoFocus} className="ff__control" {...aria}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export function UrlField(props: Omit<TextProps, 'type' | 'inputMode'>) {
  return <TextField {...props} type="url" inputMode="url" placeholder={props.placeholder ?? 'https://'} />;
}

interface TextAreaProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  lang?: string;
  placeholder?: string;
}

export function TextAreaField({ value, onChange, maxLength, rows = 4, lang, placeholder, disabled, ...shell }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} disabled={disabled} {...shell}>
      {(aria) => (
        <>
          <textarea
            id={id} value={value} rows={rows} lang={lang} maxLength={maxLength} placeholder={placeholder} disabled={disabled}
            required={shell.required} className="ff__control ff__control--area" {...aria}
            onChange={(event) => onChange(event.target.value)}
          />
          {maxLength && <p className="ff__count" aria-hidden="true">{value.length} / {maxLength}</p>}
        </>
      )}
    </FieldShell>
  );
}

interface SelectProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Shown as the first, empty option (for example "Choose a category"). */
  placeholder?: string;
}

/** Form select (the compact filter select is FilterSelect). */
export function SelectField({ value, onChange, options, placeholder, disabled, ...shell }: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} disabled={disabled} {...shell}>
      {(aria) => (
        <div className="select-box">
          <select id={id} value={value} disabled={disabled} required={shell.required} className="ff__control" {...aria} onChange={(event) => onChange(event.target.value)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Icon name="chevronDown" className="select-box__icon" />
        </div>
      )}
    </FieldShell>
  );
}

interface NumberProps extends BaseProps {
  /** Empty string while the box is empty. */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** Number input that keeps the raw text (so "12." or an empty box is not coerced); parse with `parseWholeNumber`. */
export function NumberField({ value, onChange, min, max, step = 1, disabled, ...shell }: NumberProps) {
  const id = useId();
  return (
    <FieldShell id={id} disabled={disabled} {...shell}>
      {(aria) => (
        <input
          id={id} type="number" inputMode="numeric" value={value} min={min} max={max} step={step} disabled={disabled}
          required={shell.required} className="ff__control" {...aria} onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export function parseWholeNumber(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  return Number(value);
}

interface CheckboxProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function CheckboxField({ label, checked, onChange, hint, error, disabled, className }: CheckboxProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx('ff ff--check', error && 'ff--invalid', className)}>
      <label className="ff__check" htmlFor={id}>
        <input
          id={id} type="checkbox" checked={checked} disabled={disabled} aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
      {error && <p className="ff__error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

/** Password input with a show/hide toggle. Never autofills a stored password for new passwords. */
export function PasswordField({ value, onChange, autoComplete = 'current-password', ...shell }: Omit<TextProps, 'type' | 'inputMode' | 'lang' | 'placeholder' | 'maxLength'>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <FieldShell id={id} {...shell}>
      {(aria) => (
        <div className="password-box">
          <input
            id={id} type={shown ? 'text' : 'password'} value={value} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false}
            disabled={shell.disabled} required={shell.required} maxLength={256} className="ff__control" {...aria}
            onChange={(event) => onChange(event.target.value)}
          />
          <button type="button" className="password-box__toggle" aria-pressed={shown} aria-label={`Show ${shell.label.toLowerCase()}`} onClick={() => setShown((v) => !v)}>
            <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
          </button>
        </div>
      )}
    </FieldShell>
  );
}
