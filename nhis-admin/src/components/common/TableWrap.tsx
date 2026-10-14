import type { ReactNode } from 'react';
import './common.css';

/** Horizontally scrollable, keyboard-focusable region for wide tables so the page itself never overflows. */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
