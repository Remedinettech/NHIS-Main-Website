import type { ReactNode } from 'react';
import './common.css';

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  intro?: ReactNode;
  /** Language of the title text when it differs from the interface language. */
  lang?: string;
}

/** Page title block. The h1 is the focus target after route changes (see SiteLayout). */
export function PageHeader({ title, eyebrow, intro, lang }: PageHeaderProps) {
  return (
    <header className="page-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id="page-title" tabIndex={-1} lang={lang}>{title}</h1>
      {intro && <p>{intro}</p>}
    </header>
  );
}
