import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../utils/classNames';
import { Button } from './Button';
import { Icon } from './Icon';
import './forms.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  title: string;
  /** Called on Esc, the close button and the backdrop (ignored while `busy`). */
  onClose: () => void;
  children: ReactNode;
  /** Footer content (buttons). */
  footer?: ReactNode;
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Element to focus first; defaults to the first focusable control in the body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Wrap body and footer in a form (Enter submits). */
  onSubmit?: () => void;
  role?: 'dialog' | 'alertdialog';
  description?: string;
}

/**
 * Modal dialog: focus moves in, Tab stays inside, Esc closes, focus returns to the opener, page scroll is locked.
 * Keep it mounted only while needed (`open`), or render it always and let `open` control it.
 */
export function Dialog({ open, title, onClose, children, footer, busy, size = 'md', initialFocusRef, onSubmit, role = 'dialog', description }: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const first = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>('.dialog__body')?.querySelector<HTMLElement>(FOCUSABLE) ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) { event.preventDefault(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || active === panelRef.current)) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && active === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const content = (
    <>
      <div className="dialog__body">
        {description && <p id={descId} className="dialog__desc">{description}</p>}
        {children}
      </div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </>
  );

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div
        ref={panelRef} className={cx('dialog', `dialog--${size}`)} role={role} aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined} aria-busy={busy || undefined} tabIndex={-1}
      >
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">{title}</h2>
          <button type="button" className="dialog__close" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" /></button>
        </div>
        {onSubmit ? (
          <form noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>{content}</form>
        ) : content}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen. Name the affected record in `subject`. */
  children?: ReactNode;
  /** The affected record, shown in bold (for example the hospital name or user email). */
  subject?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  busyLabel?: string;
  /** Error from the last attempt, shown inside the dialog. */
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for Archive/Delete/Publish and similar. Cancel receives focus first so Enter is never destructive. */
export function ConfirmDialog({
  open, title, children, subject, confirmLabel, cancelLabel = 'Cancel', destructive, busy, busyLabel, error, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open} title={title} size="sm" busy={busy} onClose={onCancel} role={destructive ? 'alertdialog' : 'dialog'} initialFocusRef={cancelRef}
      footer={(
        <>
          <button ref={cancelRef} type="button" className="btn btn--secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <Button className={destructive ? 'btn--danger' : undefined} disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>
            {busy ? (busyLabel ?? 'Working…') : confirmLabel}
          </Button>
        </>
      )}
    >
      {subject && <p className="dialog__subject">{subject}</p>}
      {children && <div className="dialog__text">{children}</div>}
      {error && <p className="ff__error" role="alert">{error}</p>}
    </Dialog>
  );
}
