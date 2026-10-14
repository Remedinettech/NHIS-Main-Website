import type { ContentBlock, InlineNode, ListBlock, LocalizedPageContent } from '@nhis/shared-types';
import { Fragment } from 'react';
import './records.css';

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text': return <Fragment key={i}>{node.text}</Fragment>;
          case 'strong': return <strong key={i}>{node.text}</strong>;
          case 'mail': return <span key={i} className="preview-link">{node.address}</span>;
          case 'phone': return <span key={i} className="preview-link">{node.text}</span>;
          default: return <span key={i} className="preview-link">{node.text}</span>;
        }
      })}
    </>
  );
}

function List({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {list.items.map((item, i) => (
        <li key={i}><Inline nodes={item.content} />{item.children && <List list={item.children} />}</li>
      ))}
    </Tag>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (block.type === 'paragraph') return <p><Inline nodes={block.content} /></p>;
  if (block.type === 'list') return <List list={block} />;
  return <p><span className="preview-button">{block.text || 'Download'}</span></p>;
}

/** Plain preview of what the page contains (links and buttons are shown as labels, not clickable). */
export function PagePreview({ content, lang }: { content: LocalizedPageContent; lang: 'en' | 'ta' }) {
  return (
    <article className="preview-frame" lang={lang}>
      <h2>{content.title || 'Untitled'}</h2>
      {content.sections.map((section) => (
        <section key={section.id}>
          {section.heading && <h3>{section.heading}</h3>}
          {section.blocks.map((block, i) => <Block key={i} block={block} />)}
        </section>
      ))}
    </article>
  );
}
