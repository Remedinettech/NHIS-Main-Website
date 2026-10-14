import { useId, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from './Icon';
import './common.css';

interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  maxLength?: number;
  /** Visually hide the label (it is always present for assistive technology). */
  hideLabel?: boolean;
  name?: string;
}

/**
 * Labelled search box. It is a plain controlled input, so typing (including Tamil IME input),
 * pasting and clearing all behave natively.
 */
export function SearchField({ label, value, onChange, placeholder, help, maxLength = 200, hideLabel, name }: SearchFieldProps) {
  const { t } = useLanguage();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="field field--search">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>{label}</label>
      <div className="search-box">
        <Icon name="search" className="search-box__icon" />
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="search"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.value)}
        />
        {value && (
          <button
            type="button"
            className="search-box__clear"
            aria-label={t('common.clear')}
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {help && <p className="field__help" id={helpId}>{help}</p>}
    </div>
  );
}
