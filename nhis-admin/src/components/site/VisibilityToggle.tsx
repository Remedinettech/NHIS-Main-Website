import { useId } from 'react';
import { cx } from '../../utils/classNames';
import { useSiteForm } from './SiteFormContext';
import './site.css';

interface VisibilityToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text. Default "Shown on the website". */
  label?: string;
  /** Names the thing the switch belongs to for screen readers ("Shown on the website (helpline 2)"). */
  subject?: string;
  /** Short help text under the switch. */
  hint?: string;
  /** Id of another element that describes the switch (for example the reason why it is locked). */
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A checkbox drawn as a switch (role="switch"). The state is read from the control itself, not only from its colour:
 * the thumb moves and screen readers announce "on" or "off". The whole label is the click and touch target (at least 44px high).
 */
export function VisibilityToggle({ checked, onChange, label = 'Shown on the website', subject, hint, describedBy, disabled, className }: VisibilityToggleProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const { readOnly } = useSiteForm();
  const off = disabled || readOnly;
  return (
    <div className={cx('ff', className)}>
      <label className={cx('switch', off && 'switch--disabled')}>
        <input
          type="checkbox" role="switch" className="switch__input" checked={checked} disabled={off} aria-describedby={[hintId, describedBy].filter(Boolean).join(' ') || undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
        <span className="switch__text">
          {label}
          {subject && <span className="visually-hidden"> ({subject})</span>}
        </span>
      </label>
      {hint && <p className="ff__hint" id={hintId}>{hint}</p>}
    </div>
  );
}
