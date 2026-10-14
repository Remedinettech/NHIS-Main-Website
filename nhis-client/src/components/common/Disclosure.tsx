import { useId, useState, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Icon } from './Icon';
import './common.css';

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/** Button-controlled show/hide region (aria-expanded), used for notes and mobile section lists. */
export function Disclosure({ summary, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={cx('disclosure', open && 'is-open', className)}>
      <button type="button" className="disclosure__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span>{summary}</span>
        <Icon name="chevronDown" size={18} className="disclosure__icon" />
      </button>
      <div id={panelId} className="disclosure__panel" hidden={!open}>{children}</div>
    </div>
  );
}
