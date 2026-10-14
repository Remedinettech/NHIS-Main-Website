import type { ContactColumn } from '@nhis/shared-types';
import { mailtoHref, telHref } from '../../utils/safeUrl';

/** One directory cell. Phone and e-mail values become links only when they are unambiguous; otherwise they stay text. */
export function ContactCell({ column, value }: { column: ContactColumn; value: string }) {
  if (!value) return <span className="text-muted" aria-hidden="true">–</span>;
  if (column.kind === 'phone') {
    const href = telHref(value);
    if (href) return <a href={href}>{value}</a>;
  }
  if (column.kind === 'email') {
    const href = mailtoHref(value);
    if (href) return <a href={href} className="mail-link">{value}</a>;
  }
  return <>{value}</>;
}
