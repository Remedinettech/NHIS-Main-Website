import type { ContentBlock, ListBlock } from '@nhis/shared-types';
import { DocumentLink } from './DocumentLink';
import { InlineContent } from './InlineContent';
import { SiteImage } from '../common/SiteImage';
import './content.css';

function List({ list, lang }: { list: ListBlock; lang?: string }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag className="prose-list">
      {list.items.map((item, index) => (
        <li key={index}>
          <InlineContent nodes={item.content} lang={lang} />
          {item.children && <List list={item.children} lang={lang} />}
        </li>
      ))}
    </Tag>
  );
}

/** Renders the blocks of a page section. `lang` is the language the source text is written in. */
export function ContentBlocks({ blocks, lang }: { blocks: ReadonlyArray<ContentBlock>; lang: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'table':
            return <div key={index} className="content-table-wrap"><table className="content-table" lang={lang}>
              <thead><tr>{block.headers.map((header, i) => <th key={i} scope="col">{header}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} data-label={block.headers[j]}><InlineContent nodes={cell} lang={lang} /></td>)}</tr>)}</tbody>
            </table></div>;
          case 'image':
            // The alt text is written in the language of the page; the picture keeps its own proportions (see .content-figure).
            return (
              <figure key={index} className="content-figure" lang={lang}>
                <SiteImage image={{ assetId: block.assetId, builtIn: null, alt: { en: block.alt, ta: block.alt }, width: block.width ?? null, height: block.height ?? null }} lazy />
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            );
          case 'paragraph':
            return <p key={index}><InlineContent nodes={block.content} lang={lang} /></p>;
          case 'list':
            return <List key={index} list={block} lang={lang} />;
          case 'documentLink':
            return (
              <p key={index} className="doc-action">
                <DocumentLink documentId={block.documentId} text={block.text} asButton lang={lang} />
              </p>
            );
        }
      })}
    </>
  );
}
