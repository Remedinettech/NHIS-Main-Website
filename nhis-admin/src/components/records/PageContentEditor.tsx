import type { AdminPageValues, ContentBlock, InlineNode, ListBlock, ListItem, LocalizedPageContent, PageSection } from '@nhis/shared-types';
import { useState } from 'react';
import { cx } from '../../utils/classNames';
import { Button } from '../common/Button';
import { CheckboxField, SelectField, TextField } from '../common/fields';
import { InlineNodesEditor, type DocumentOption } from './InlineNodesEditor';
import './records.css';

type Locale = 'en' | 'ta';
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', ta: 'Tamil (தமிழ்)' };

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const newText = (): InlineNode[] => [{ type: 'text', text: '' }];

function emptyList(): ListBlock { return { type: 'list', ordered: false, items: [{ content: newText() }] }; }

interface ListEditorProps {
  list: ListBlock;
  onChange: (list: ListBlock) => void;
  documents: DocumentOption[];
  errors: Record<string, string>;
  path: string;
  lang: Locale;
  disabled?: boolean;
  depth: number;
}

function ListEditor({ list, onChange, documents, errors, path, lang, disabled, depth }: ListEditorProps) {
  const setItem = (index: number, item: ListItem) => onChange({ ...list, items: list.items.map((it, i) => (i === index ? item : it)) });
  return (
    <div className="list-items">
      <CheckboxField label="Numbered list" checked={list.ordered} onChange={(ordered) => onChange({ ...list, ordered })} disabled={disabled} />
      {list.items.map((item, index) => (
        <div className="node-row" key={index}>
          <p className="block-card__title">Item {index + 1}</p>
          <InlineNodesEditor label={`Item ${index + 1} text`} path={`${path}.items.${index}.content`} nodes={item.content} documents={documents} errors={errors} lang={lang} disabled={disabled}
            onChange={(content) => setItem(index, { ...item, content })} />
          {item.children && (
            <ListEditor list={item.children} onChange={(children) => setItem(index, { ...item, children })} documents={documents} errors={errors}
              path={`${path}.items.${index}.children`} lang={lang} disabled={disabled} depth={depth + 1} />
          )}
          <div className="node-row__tools">
            {depth < 3 && !item.children && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setItem(index, { ...item, children: emptyList() })}>Add a sub-list</Button>}
            {item.children && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setItem(index, { content: item.content })}>Remove sub-list</Button>}
            <Button size="sm" variant="ghost" disabled={disabled || index === 0} onClick={() => onChange({ ...list, items: move(list.items, index, index - 1) })}>Move up</Button>
            <Button size="sm" variant="ghost" disabled={disabled || index === list.items.length - 1} onClick={() => onChange({ ...list, items: move(list.items, index, index + 1) })}>Move down</Button>
            <Button size="sm" variant="ghost" disabled={disabled || list.items.length === 1} onClick={() => onChange({ ...list, items: list.items.filter((_, i) => i !== index) })}>Remove item</Button>
          </div>
        </div>
      ))}
      <div className="node-row__tools">
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange({ ...list, items: [...list.items, { content: newText() }] })}>Add item</Button>
      </div>
    </div>
  );
}

const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'list', label: 'List' },
  { value: 'documentLink', label: 'Document download button' },
];

interface SectionProps {
  section: PageSection;
  index: number;
  count: number;
  onChange: (section: PageSection) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  documents: DocumentOption[];
  errors: Record<string, string>;
  path: string;
  lang: Locale;
  disabled?: boolean;
}

function SectionEditor({ section, index, count, onChange, onMove, onRemove, documents, errors, path, lang, disabled }: SectionProps) {
  const [adding, setAdding] = useState('paragraph');
  const setBlock = (i: number, block: ContentBlock) => onChange({ ...section, blocks: section.blocks.map((b, j) => (j === i ? block : b)) });
  const addBlock = () => {
    const block: ContentBlock = adding === 'list' ? emptyList() : adding === 'documentLink' ? { type: 'documentLink', documentId: '', text: '' } : { type: 'paragraph', content: newText() };
    onChange({ ...section, blocks: [...section.blocks, block] });
  };
  return (
    <section className="section-card" aria-label={`Section ${index + 1}${section.heading ? `: ${section.heading}` : ''}`}>
      <div className="section-card__head">
        <h3>Section {index + 1}</h3>
        <div className="node-row__tools">
          <Button size="sm" variant="ghost" disabled={disabled || index === 0} onClick={() => onMove(index - 1)}>Move up</Button>
          <Button size="sm" variant="ghost" disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)}>Move down</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>Remove section</Button>
        </div>
      </div>
      <TextField label="Section heading" value={section.heading ?? ''} lang={lang} maxLength={300} disabled={disabled} onChange={(x) => onChange({ ...section, heading: x.trim() ? x : undefined })}
        error={errors[`${path}.heading`]} hint="Shown as a heading and in the page’s section list. Leave empty for no heading." />
      {errors[`${path}.id`] && <p className="ff__error" role="alert">{errors[`${path}.id`]}</p>}
      {section.blocks.map((block, i) => (
        <div className="block-card" key={i}>
          <div className="block-card__head">
            <p className="block-card__title">{BLOCK_TYPES.find((t) => t.value === block.type)?.label} {i + 1}</p>
            <div className="node-row__tools">
              <Button size="sm" variant="ghost" disabled={disabled || i === 0} onClick={() => onChange({ ...section, blocks: move(section.blocks, i, i - 1) })}>Move up</Button>
              <Button size="sm" variant="ghost" disabled={disabled || i === section.blocks.length - 1} onClick={() => onChange({ ...section, blocks: move(section.blocks, i, i + 1) })}>Move down</Button>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ ...section, blocks: section.blocks.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          </div>
          {block.type === 'paragraph' && (
            <InlineNodesEditor label="Paragraph text" path={`${path}.blocks.${i}.content`} nodes={block.content} documents={documents} errors={errors} lang={lang} disabled={disabled}
              onChange={(content) => setBlock(i, { ...block, content })} />
          )}
          {block.type === 'list' && (
            <ListEditor list={block} onChange={(list) => setBlock(i, list)} documents={documents} errors={errors} path={`${path}.blocks.${i}`} lang={lang} disabled={disabled} depth={1} />
          )}
          {block.type === 'documentLink' && (
            <div className="node-row__fields">
              <SelectField label="Document" value={block.documentId} placeholder="Choose a document" options={documents} disabled={disabled}
                onChange={(documentId) => setBlock(i, { ...block, documentId })} error={errors[`${path}.blocks.${i}.documentId`]} />
              <TextField label="Button text" value={block.text} lang={lang} maxLength={500} disabled={disabled} onChange={(text) => setBlock(i, { ...block, text })} error={errors[`${path}.blocks.${i}.text`]} />
            </div>
          )}
        </div>
      ))}
      <div className="node-row__tools">
        <SelectField label="Add content" value={adding} options={BLOCK_TYPES} onChange={setAdding} disabled={disabled} />
        <Button size="sm" variant="secondary" disabled={disabled} onClick={addBlock}>Add</Button>
      </div>
    </section>
  );
}

interface Props {
  values: AdminPageValues;
  onChange: (values: AdminPageValues) => void;
  documents: DocumentOption[];
  /** Server/client field errors keyed like `en.sections.0.blocks.1.content.0.text`. */
  errors: Record<string, string>;
  disabled?: boolean;
}

/**
 * Structured page editor: for each language a title and ordered sections (heading plus paragraphs, lists and document
 * buttons). English and Tamil are independent, as in the published content: they are not assumed to match line by line.
 */
export function PageContentEditor({ values, onChange, documents, errors, disabled }: Props) {
  const [locale, setLocale] = useState<Locale>('en');
  const content = values[locale];
  const other: Locale = locale === 'en' ? 'ta' : 'en';
  const setContent = (next: LocalizedPageContent | null) => onChange({ ...values, [locale]: next });

  const addSection = (c: LocalizedPageContent) => {
    const used = new Set(c.sections.map((s) => s.id));
    let n = c.sections.length + 1;
    while (used.has(`${locale === 'ta' ? 'ta-s' : 's'}${n}`)) n += 1;
    setContent({ ...c, sections: [...c.sections, { id: `${locale === 'ta' ? 'ta-s' : 's'}${n}`, heading: '', blocks: [{ type: 'paragraph', content: newText() }] }] });
  };

  return (
    <div className="stack">
      <div className="tabs" role="group" aria-label="Language">
        {(['en', 'ta'] as Locale[]).map((l) => (
          <button key={l} type="button" className={cx('tab', l === locale && 'is-active')} aria-pressed={l === locale} onClick={() => setLocale(l)}>
            <span className="tab__label">{LANGUAGE_NAMES[l]}</span>
            <span className="tab__meta">{values[l] ? `${values[l]?.sections.length} sections` : 'none'}</span>
          </button>
        ))}
      </div>
      {errors[locale] && <p className="ff__error" role="alert">{errors[locale]}</p>}
      {errors.values && <p className="ff__error" role="alert">{errors.values}</p>}

      {!content ? (
        <div className="section-card">
          <p className="editor-note">There is no {LANGUAGE_NAMES[locale]} version of this page yet.</p>
          <div><Button variant="secondary" disabled={disabled} onClick={() => setContent({ title: '', sections: [] })}>Add a {LANGUAGE_NAMES[locale]} version</Button></div>
        </div>
      ) : (
        <>
          <TextField label={`Page title (${LANGUAGE_NAMES[locale]})`} required value={content.title} lang={locale} maxLength={300} disabled={disabled}
            onChange={(title) => setContent({ ...content, title })} error={errors[`${locale}.title`]} />
          {content.sections.map((section, index) => (
            <SectionEditor
              key={section.id}
              section={section}
              index={index}
              count={content.sections.length}
              documents={documents}
              errors={errors}
              path={`${locale}.sections.${index}`}
              lang={locale}
              disabled={disabled}
              onChange={(next) => setContent({ ...content, sections: content.sections.map((s, i) => (i === index ? next : s)) })}
              onMove={(to) => setContent({ ...content, sections: move(content.sections, index, to) })}
              onRemove={() => setContent({ ...content, sections: content.sections.filter((_, i) => i !== index) })}
            />
          ))}
          <div className="node-row__tools">
            <Button variant="secondary" disabled={disabled} onClick={() => addSection(content)}>Add a section</Button>
            {values[other] && <Button variant="ghost" disabled={disabled} onClick={() => setContent(null)}>Remove this language</Button>}
          </div>
        </>
      )}
    </div>
  );
}
