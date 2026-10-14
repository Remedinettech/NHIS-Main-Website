import { useId, useRef } from 'react';
import { Icon } from './Icon';
import './common.css';

interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  maxLength?: number;
}

/** Labelled search box: a plain controlled input, so typing (including Tamil IME input) behaves natively. */
export function SearchField({ label, value, onChange, placeholder, help, maxLength = 200 }: SearchFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="field field--search">
      <label htmlFor={id} className="field__label">{label}</label>
      <div className="search-box">
        <Icon name="search" className="search-box__icon" />
        <input
          ref={inputRef}
          id={id}
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
          <button type="button" className="search-box__clear" aria-label="Clear search" onClick={() => { onChange(''); inputRef.current?.focus(); }}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {help && <p className="field__help" id={helpId}>{help}</p>}
    </div>
  );
}
