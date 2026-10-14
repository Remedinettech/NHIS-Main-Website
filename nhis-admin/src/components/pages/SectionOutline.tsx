import type { LocalizedPageContent } from '@nhis/shared-types';
import { outline } from '../../utils/pageOutline';
import { Card } from '../common/Card';
import './pages.css';

interface SectionOutlineProps { heading: string; language: 'English' | 'Tamil'; lang: 'en' | 'ta'; content: LocalizedPageContent | null }

/** Section headings with block counts; body text is intentionally not reproduced here. */
export function SectionOutline({ heading, language, lang, content }: SectionOutlineProps) {
  const entries = outline(content);
  return (
    <Card title={heading}>
      {!content ? (
        <p className="text-muted">There is no {language} version of this page.</p>
      ) : (
        <>
          <p lang={lang} className="outline__title">{content.title}</p>
          {entries.length === 0 ? (
            <p className="text-muted">This page has a title and no sections.</p>
          ) : (
            <ol className="outline">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span lang={entry.heading ? lang : undefined}>{entry.heading ?? 'Untitled section'}</span>
                  <span className="text-muted"> · {entry.blocks} {entry.blocks === 1 ? 'block' : 'blocks'}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}
