import { isSafeHttpsUrl } from '@nhis/shared-types';
import { UrlField } from '../common/fields';
import { useSiteForm } from './SiteFormContext';
import { firstError } from './siteForm';

export interface OptionalUrlFieldProps {
  label?: string;
  /** Path of the address in the document ("partners.2.url"); the server error is read from it. */
  path: string;
  /** The address, or null for none. */
  value: string | null;
  /** An empty box stores null. */
  onChange: (next: string | null) => void;
  hint?: string;
  disabled?: boolean;
}

/** An optional https:// address (a partner's website, a footer logo's link). An empty box is stored as null (no link). */
export function OptionalUrlField({ label = 'Link address (optional)', path, value, onChange, hint, disabled }: OptionalUrlFieldProps) {
  const { errors, readOnly } = useSiteForm();
  const typed = value ?? '';
  return (
    <UrlField
      label={label} value={typed} disabled={disabled || readOnly} maxLength={500}
      error={firstError(errors, path) ?? (typed.trim() !== '' && !isSafeHttpsUrl(typed) ? 'Enter a full web address that starts with https:// (no spaces, no user name or password).' : undefined)}
      hint={hint ?? 'Must start with https://. Leave empty for no link.'}
      onChange={(next) => onChange(next.trim() === '' ? null : next)}
    />
  );
}
