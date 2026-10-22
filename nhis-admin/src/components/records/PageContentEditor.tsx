import type { AdminPageValues, ContentBlock, InlineNode, ListBlock, ListItem, LocalizedPageContent, PageSection, TableBlock } from '@nhis/shared-types';
import { useId, useRef, useState } from 'react';
import { cx } from '../../utils/classNames';
import { Button } from '../common/Button';
import { CheckboxField, SelectField, TextField } from '../common/fields';
import { describeAddition, describeMove, describeRemoval } from '../site/siteForm';
import { InlineNodesEditor, type DocumentOption } from './InlineNodesEditor';
import { PageImageBlock } from './PageImageBlock';
import { moveFocusTargets, useFocusRequest } from './useFocusRequest';
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

/**
 * Stable React keys for the blocks of a section, which have no ids of their own. Index keys would hand the state of one block
 * (an upload in progress, a half-typed asset id) to its neighbour after a move or a removal. The keys travel with the blocks.
 */
function useBlockKeys(count: number) {
  const counter = useRef(0);
  const fresh = () => `block-${counter.current++}`;
  const [keys, setKeys] = useState<string[]>(() => Array.from({ length: count }, fresh));
  let current = keys;
  // The list changed length from outside (the record was reloaded): pad or cut instead of showing a wrong key.
  if (keys.length !== count) {
    current = count > keys.length ? [...keys, ...Array.from({ length: count - keys.length }, fresh)] : keys.slice(0, count);
    setKeys(current);
  }
  return {
    keys: current,
    add: () => setKeys((list) => [...list, fresh()]),
    remove: (index: number) => setKeys((list) => list.filter((_, i) => i !== index)),
    move: (from: number, to: number) => setKeys((list) => move(list, from, to)),
  };
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
  /** Tells screen-reader users what a move, addition or removal did. */
  announce: (text: string) => void;
}

function ListEditor({ list, onChange, documents, errors, path, lang, disabled, depth, announce }: ListEditorProps) {
  const uid = useId();
  const focus = useFocusRequest();
  const setItem = (index: number, item: ListItem) => onChange({ ...list, items: list.items.map((it, i) => (i === index ? item : it)) });
  const moveItem = (index: number, to: number) => {
    // The item keeps the keyboard: the button it was moved with, or the other one when that is now disabled at an end.
    focus(...moveFocusTargets(`${uid}-${to}`, index, to));
    onChange({ ...list, items: move(list.items, index, to) });
    announce(describeMove('item', index, to, list.items.length));
  };
  const removeItem = (index: number) => {
    focus(`${uid}-add`);
    onChange({ ...list, items: list.items.filter((_, i) => i !== index) });
    announce(describeRemoval('item', index, list.items.length - 1));
  };
  const addItem = () => {
    onChange({ ...list, items: [...list.items, { content: newText() }] });
    announce(describeAddition('item', list.items.length + 1, list.items.length + 1));
  };
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
              path={`${path}.items.${index}.children`} lang={lang} disabled={disabled} depth={depth + 1} announce={announce} />
          )}
          <div className="node-row__tools">
            {depth < 3 && !item.children && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setItem(index, { ...item, children: emptyList() })}>Add a sub-list</Button>}
            {item.children && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setItem(index, { content: item.content })}>Remove sub-list</Button>}
            <Button size="sm" variant="ghost" data-focus={`${uid}-${index}-up`} disabled={disabled || index === 0} onClick={() => moveItem(index, index - 1)}>Move up<span className="visually-hidden"> item {index + 1}</span></Button>
            <Button size="sm" variant="ghost" data-focus={`${uid}-${index}-down`} disabled={disabled || index === list.items.length - 1} onClick={() => moveItem(index, index + 1)}>Move down<span className="visually-hidden"> item {index + 1}</span></Button>
            <Button size="sm" variant="ghost" disabled={disabled || list.items.length === 1} onClick={() => removeItem(index)}>Remove item<span className="visually-hidden"> {index + 1}</span></Button>
          </div>
        </div>
      ))}
      <div className="node-row__tools">
        <Button size="sm" variant="secondary" data-focus={`${uid}-add`} disabled={disabled} onClick={addItem}>Add item</Button>
      </div>
    </div>
  );
}

const BLOCK_TYPES = [
  { value: 'table', label: 'Table (officers or other records)' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'list', label: 'List' },
  { value: 'documentLink', label: 'Document download button' },
  { value: 'image', label: 'Picture' },
];

/**
 * Table of a page: columns (headings) and rows of cells. Rows keep stable keys, so what is being typed or uploaded in a row
 * moves with it. Like the other lists of the page editor, a move keeps the keyboard on the moved row, a removal moves it to the
 * "Add" button of that kind, and every change is announced.
 */
function TableEditor({ block, onChange, documents, errors, path, lang, disabled }: {
  block: TableBlock; onChange: (value: TableBlock) => void; documents: DocumentOption[];
  errors: Record<string, string>; path: string; lang: Locale; disabled?: boolean;
}) {
  const uid = useId();
  const focus = useFocusRequest();
  const keys = useBlockKeys(block.rows.length);
  const [announcement, setAnnouncement] = useState('');

  const moveRow = (index: number, to: number) => {
    if (to < 0 || to >= block.rows.length) return;
    focus(...moveFocusTargets(`${uid}-${keys.keys[index] ?? index}`, index, to));
    keys.move(index, to);
    onChange({ ...block, rows: move(block.rows, index, to) });
    setAnnouncement(describeMove('row', index, to, block.rows.length));
  };
  const removeRow = (index: number) => {
    focus(`${uid}-add-row`);
    keys.remove(index);
    onChange({ ...block, rows: block.rows.filter((_, i) => i !== index) });
    setAnnouncement(describeRemoval('row', index, block.rows.length - 1));
  };
  const addRow = () => {
    keys.add();
    onChange({ ...block, rows: [...block.rows, block.headers.map(() => newText())] });
    setAnnouncement(describeAddition('row', block.rows.length + 1, block.rows.length + 1));
  };
  const removeColumn = (column: number) => {
    focus(`${uid}-add-column`);
    onChange({ ...block, headers: block.headers.filter((_, j) => j !== column), rows: block.rows.map((row) => row.filter((_, j) => j !== column)) });
    setAnnouncement(describeRemoval('column', column, block.headers.length - 1));
  };
  const addColumn = () => {
    onChange({ ...block, headers: [...block.headers, 'New column'], rows: block.rows.map((row) => [...row, newText()]) });
    setAnnouncement(describeAddition('column', block.headers.length + 1, block.headers.length + 1));
  };

  return <div className="stack">
    <p>Up to 8 columns and 50 rows. Each cell supports text, email, phone and document links.</p>
    {block.headers.map((header, column) => <div key={column} className="node-row__fields">
      <TextField label={`Column ${column + 1} heading`} value={header} lang={lang} maxLength={150} disabled={disabled}
        error={errors[`${path}.headers.${column}`]} onChange={(value) => onChange({ ...block, headers: block.headers.map((h, j) => j === column ? value : h) })} />
      <Button size="sm" variant="ghost" disabled={disabled || block.headers.length === 1} onClick={() => removeColumn(column)}>Remove column {column + 1}</Button>
    </div>)}
    <Button size="sm" variant="secondary" data-focus={`${uid}-add-column`} disabled={disabled || block.headers.length >= 8} onClick={addColumn}>Add column</Button>
    {errors[`${path}.rows`] && <p className="ff__error" role="alert">{errors[`${path}.rows`]}</p>}
    {block.rows.map((row, index) => <fieldset key={keys.keys[index]} className="block-card">
      <legend>Row {index + 1}</legend>
      {row.map((cell, column) => <InlineNodesEditor key={column} label={block.headers[column] || `Column ${column + 1}`}
        path={`${path}.rows.${index}.${column}`} nodes={cell} documents={documents} errors={errors} lang={lang} disabled={disabled}
        onChange={(value) => onChange({ ...block, rows: block.rows.map((r, i) => i === index ? r.map((c, j) => j === column ? value : c) : r) })} />)}
      <div className="node-row__tools">
        <Button size="sm" variant="ghost" data-focus={`${uid}-${keys.keys[index] ?? index}-up`} disabled={disabled || index === 0} onClick={() => moveRow(index, index - 1)}>Move up row {index + 1}</Button>
        <Button size="sm" variant="ghost" data-focus={`${uid}-${keys.keys[index] ?? index}-down`} disabled={disabled || index === block.rows.length - 1} onClick={() => moveRow(index, index + 1)}>Move down row {index + 1}</Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => removeRow(index)}>Remove row {index + 1}</Button>
      </div>
    </fieldset>)}
    <Button size="sm" variant="secondary" data-focus={`${uid}-add-row`} disabled={disabled || block.rows.length >= 50} onClick={addRow}>Add row</Button>
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
  </div>;
}

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
  announce: (text: string) => void;
}

function SectionEditor({ section, index, count, onChange, onMove, onRemove, documents, errors, path, lang, disabled, announce }: SectionProps) {
  const uid = useId();
  const focus = useFocusRequest();
  const [adding, setAdding] = useState('paragraph');
  const blockKeys = useBlockKeys(section.blocks.length);
  // Moving or removing a block keeps the keyboard on it (or on "Add") and tells screen-reader users what happened.
  const moveBlock = (from: number, to: number) => {
    const key = blockKeys.keys[from] ?? from;
    focus(...moveFocusTargets(`${uid}-${key}`, from, to));
    blockKeys.move(from, to);
    onChange({ ...section, blocks: move(section.blocks, from, to) });
    announce(describeMove('block', from, to, section.blocks.length));
  };
  const removeBlock = (at: number) => {
    focus(`${uid}-add`);
    blockKeys.remove(at);
    onChange({ ...section, blocks: section.blocks.filter((_, j) => j !== at) });
    announce(describeRemoval('block', at, section.blocks.length - 1));
  };
  const setBlock = (i: number, block: ContentBlock) => onChange({ ...section, blocks: section.blocks.map((b, j) => (j === i ? block : b)) });
  const addBlock = () => {
    const block: ContentBlock = adding === 'table' ? { type: 'table', headers: ['Name', 'Designation'], rows: [[newText(), newText()]] } : adding === 'image' ? { type: 'image', assetId: '', alt: '', caption: '' } : adding === 'list' ? emptyList() : adding === 'documentLink' ? { type: 'documentLink', documentId: '', text: '' } : { type: 'paragraph', content: newText() };
    blockKeys.add();
    onChange({ ...section, blocks: [...section.blocks, block] });
    announce(describeAddition('block', section.blocks.length + 1, section.blocks.length + 1));
  };
  return (
    <section className="section-card" aria-label={`Section ${index + 1}${section.heading ? `: ${section.heading}` : ''}`}>
      <div className="section-card__head">
        <h3>Section {index + 1}</h3>
        <div className="node-row__tools">
          <Button size="sm" variant="ghost" data-focus={`${uid}-up`} disabled={disabled || index === 0} onClick={() => { focus(`${uid}-up`, `${uid}-down`); onMove(index - 1); }}>Move up<span className="visually-hidden"> section {index + 1}</span></Button>
          <Button size="sm" variant="ghost" data-focus={`${uid}-down`} disabled={disabled || index === count - 1} onClick={() => { focus(`${uid}-down`, `${uid}-up`); onMove(index + 1); }}>Move down<span className="visually-hidden"> section {index + 1}</span></Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>Remove section<span className="visually-hidden"> {index + 1}</span></Button>
        </div>
      </div>
      <TextField label="Section heading" value={section.heading ?? ''} lang={lang} maxLength={300} disabled={disabled} onChange={(x) => onChange({ ...section, heading: x.trim() ? x : undefined })}
        error={errors[`${path}.heading`]} hint="Shown as a heading and in the page’s section list. Leave empty for no heading." />
      {errors[`${path}.id`] && <p className="ff__error" role="alert">{errors[`${path}.id`]}</p>}
      {section.blocks.map((block, i) => {
        const blockName = `${BLOCK_TYPES.find((t) => t.value === block.type)?.label ?? 'Block'} ${i + 1}`;
        return (
        <div className="block-card" key={blockKeys.keys[i] ?? i}>
          <div className="block-card__head">
            <p className="block-card__title">{blockName}</p>
            <div className="node-row__tools">
              <Button size="sm" variant="ghost" data-focus={`${uid}-${blockKeys.keys[i] ?? i}-up`} disabled={disabled || i === 0} onClick={() => moveBlock(i, i - 1)}>Move up<span className="visually-hidden"> {blockName}</span></Button>
              <Button size="sm" variant="ghost" data-focus={`${uid}-${blockKeys.keys[i] ?? i}-down`} disabled={disabled || i === section.blocks.length - 1} onClick={() => moveBlock(i, i + 1)}>Move down<span className="visually-hidden"> {blockName}</span></Button>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => removeBlock(i)}>Remove<span className="visually-hidden"> {blockName}</span></Button>
            </div>
          </div>
          {block.type === 'table' && <TableEditor block={block} onChange={(next) => setBlock(i, next)} documents={documents} errors={errors} path={`${path}.blocks.${i}`} lang={lang} disabled={disabled} />}
          {block.type === 'image' && (
            <PageImageBlock
              block={block} onChange={(next) => setBlock(i, next)} path={`${path}.blocks.${i}`} errors={errors} lang={lang} disabled={disabled}
              name={`${blockName} in section ${index + 1}`}
            />
          )}
          {block.type === 'paragraph' && (
            <InlineNodesEditor label="Paragraph text" path={`${path}.blocks.${i}.content`} nodes={block.content} documents={documents} errors={errors} lang={lang} disabled={disabled}
              onChange={(content) => setBlock(i, { ...block, content })} />
          )}
          {block.type === 'list' && (
            <ListEditor list={block} onChange={(list) => setBlock(i, list)} documents={documents} errors={errors} path={`${path}.blocks.${i}`} lang={lang} disabled={disabled} depth={1} announce={announce} />
          )}
          {block.type === 'documentLink' && (
            <div className="node-row__fields">
              <SelectField label="Document" value={block.documentId} placeholder="Choose a document" options={documents} disabled={disabled}
                onChange={(documentId) => setBlock(i, { ...block, documentId })} error={errors[`${path}.blocks.${i}.documentId`]} />
              <TextField label="Button text" value={block.text} lang={lang} maxLength={500} disabled={disabled} onChange={(text) => setBlock(i, { ...block, text })} error={errors[`${path}.blocks.${i}.text`]} />
            </div>
          )}
        </div>
        );
      })}
      <div className="node-row__tools">
        <SelectField label="Add content" value={adding} options={BLOCK_TYPES} onChange={setAdding} disabled={disabled} />
        <Button size="sm" variant="secondary" data-focus={`${uid}-add`} disabled={disabled} onClick={addBlock}>Add<span className="visually-hidden"> the chosen content to section {index + 1}</span></Button>
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
  const uid = useId();
  const focus = useFocusRequest();
  const [announcement, setAnnouncement] = useState('');
  const [locale, setLocale] = useState<Locale>('en');
  const content = values[locale];
  const other: Locale = locale === 'en' ? 'ta' : 'en';
  const setContent = (next: LocalizedPageContent | null) => onChange({ ...values, [locale]: next });

  const addSection = (c: LocalizedPageContent) => {
    const used = new Set(c.sections.map((s) => s.id));
    let n = c.sections.length + 1;
    while (used.has(`${locale === 'ta' ? 'ta-s' : 's'}${n}`)) n += 1;
    setContent({ ...c, sections: [...c.sections, { id: `${locale === 'ta' ? 'ta-s' : 's'}${n}`, heading: '', blocks: [{ type: 'paragraph', content: newText() }] }] });
    setAnnouncement(describeAddition('section', c.sections.length + 1, c.sections.length + 1));
  };
  const moveSection = (c: LocalizedPageContent, from: number, to: number) => {
    setContent({ ...c, sections: move(c.sections, from, to) });
    setAnnouncement(describeMove('section', from, to, c.sections.length));
  };
  const removeSection = (c: LocalizedPageContent, at: number) => {
    focus(`${uid}-add-section`);
    setContent({ ...c, sections: c.sections.filter((_, i) => i !== at) });
    setAnnouncement(describeRemoval('section', at, c.sections.length - 1));
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
              // A section id can be the same in both languages. The language belongs to the key so that the state of a section
              // (an upload under way, the kind of block chosen) is never handed to the section of the other language.
              key={`${locale}:${section.id}`}
              section={section}
              index={index}
              count={content.sections.length}
              documents={documents}
              errors={errors}
              path={`${locale}.sections.${index}`}
              lang={locale}
              disabled={disabled}
              announce={setAnnouncement}
              onChange={(next) => setContent({ ...content, sections: content.sections.map((s, i) => (i === index ? next : s)) })}
              onMove={(to) => moveSection(content, index, to)}
              onRemove={() => removeSection(content, index)}
            />
          ))}
          <div className="node-row__tools">
            <Button variant="secondary" data-focus={`${uid}-add-section`} disabled={disabled} onClick={() => addSection(content)}>Add a section</Button>
            {values[other] && <Button variant="ghost" disabled={disabled} onClick={() => setContent(null)}>Remove this language</Button>}
          </div>
        </>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}
