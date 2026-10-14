import type { ContentBlock, ListBlock } from '@nhis/shared-types';
import { DocumentLink } from './DocumentLink';
import { InlineContent } from './InlineContent';
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
