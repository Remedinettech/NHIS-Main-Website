import { useId } from 'react';
import { Icon } from './Icon';
import './common.css';

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="field field--select">
      <label htmlFor={id} className="field__label">{label}</label>
      <div className="select-box">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Icon name="chevronDown" className="select-box__icon" />
      </div>
    </div>
  );
}
