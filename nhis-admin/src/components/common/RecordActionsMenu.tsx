import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../utils/classNames';
import type { RecordAction } from '../../utils/capabilities';
import { Icon } from './Icon';
import './forms.css';

export const ACTION_LABELS: Record<RecordAction, string> = {
  edit: 'Edit',
  publish: 'Publish',
  unpublish: 'Unpublish',
  archive: 'Archive',
  restore: 'Restore',
  'discard-draft': 'Discard draft',
  delete: 'Delete',
};

interface RecordActionsMenuProps {
  /** Pass the result of `allowedRecordActions(role, state)`; the menu renders nothing when the list is empty. */
  actions: readonly RecordAction[];
  onSelect: (action: RecordAction) => void;
  /** Name of the record, used in the accessible name: "Actions for <name>". */
  recordName: string;
  disabled?: boolean;
}

/**
 * Menu button following the WAI-ARIA menu-button pattern: Enter/Space/ArrowDown opens, arrows move, Home/End jump,
 * Esc closes and returns focus, Tab closes. The popup is rendered in a portal so table scrolling never clips it.
 */
export function RecordActionsMenu({ actions, onSelect, recordName, disabled }: RecordActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [focusIndex, setFocusIndex] = useState(0);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 208;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[focusIndex]?.focus();
  }, [open, focusIndex, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onDismiss = () => close(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [open, close]);

  if (actions.length === 0) return null;

  const openAt = (index: number) => { setFocusIndex(index); setOpen(true); };

  const onButtonKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); openAt(0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); openAt(actions.length - 1); }
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const last = actions.length - 1;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); setFocusIndex((i) => (i >= last ? 0 : i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setFocusIndex((i) => (i <= 0 ? last : i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setFocusIndex(0); }
    else if (event.key === 'End') { event.preventDefault(); setFocusIndex(last); }
  };

  return (
    <>
      <button
        ref={buttonRef} type="button" className="menu-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={`Actions for ${recordName}`} disabled={disabled} onKeyDown={onButtonKey}
        onClick={() => (open ? close(false) : openAt(0))}
      >
        <Icon name="more" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label={`Actions for ${recordName}`} className="menu-popup" style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          {actions.map((action, index) => (
            <button
              key={action} type="button" role="menuitem" tabIndex={index === focusIndex ? 0 : -1}
              className={cx('menu-popup__item', (action === 'delete' || action === 'archive') && 'menu-popup__item--danger')}
              onClick={() => { close(true); onSelect(action); }}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
