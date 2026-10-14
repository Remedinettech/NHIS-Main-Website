import type { ReactNode } from 'react';
import { Button } from './Button';
import './forms.css';

interface FormActionsProps {
  /** Submit button label. */
  saveLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  /** Disable Save without a busy state (nothing to save, or not allowed). */
  saveDisabled?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Extra buttons placed after Cancel (for example "Save and publish"). */
  extra?: ReactNode;
  /** Hide Save entirely (read-only view). */
  readOnly?: boolean;
}

/** Save (form submit), Cancel and optional extras. Save is disabled while busy, which prevents double submit. */
export function FormActions({
  saveLabel = 'Save', busyLabel = 'Saving…', busy, saveDisabled, onCancel, cancelLabel = 'Cancel', extra, readOnly,
}: FormActionsProps) {
  return (
    <div className="form-actions">
      {!readOnly && (
        <Button type="submit" disabled={busy || saveDisabled} aria-busy={busy || undefined}>
          {busy ? busyLabel : saveLabel}
        </Button>
      )}
      {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>}
      {extra}
    </div>
  );
}
