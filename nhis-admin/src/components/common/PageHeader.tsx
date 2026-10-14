import type { ReactNode } from 'react';
import './common.css';

interface PageHeaderProps { title: string; intro?: ReactNode; lang?: string; children?: ReactNode }

/** Page title block. The h1 is the focus target after route changes (see AdminLayout). */
export function PageHeader({ title, intro, lang, children }: PageHeaderProps) {
  return (
    <header className="page__header">
      <h1 id="page-title" tabIndex={-1} lang={lang}>{title}</h1>
      {intro && <p>{intro}</p>}
      {children}
    </header>
  );
}
