import type { AdminDocument, InlineNode } from '@nhis/shared-types';
import { useId, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listRecords } from '../../services/records.api';
import { Button } from '../common/Button';
import { SelectField, TextAreaField, TextField } from '../common/fields';
import './records.css';

export interface DocumentOption { value: string; label: string }

/** Document choices for linking (all statuses except archived are fine to link; the server checks the id exists). */
export function useDocumentOptions(): DocumentOption[] {
  const { data } = useAsyncData((signal) => listRecords<AdminDocument>('documents', { pageSize: 100, status: 'ALL' }, signal), []);
  return (data?.data ?? []).map((d) => ({ value: d.id, label: `${d.values.titleEn || d.values.labelEn}${d.meta.status === 'PUBLISHED' ? '' : ` (${d.meta.status.toLowerCase()})`}` }));
}

const TYPE_LABELS: Record<InlineNode['type'], string> = {
  text: 'Text',
  strong: 'Bold text',
  document: 'Document link',
  link: 'Web link',
  phone: 'Phone number',
  mail: 'E-mail address',
};
const ADDABLE = Object.keys(TYPE_LABELS) as InlineNode['type'][];

export function emptyNode(type: InlineNode['type']): InlineNode {
  switch (type) {
    case 'text': case 'strong': return { type, text: '' };
    case 'document': return { type, documentId: '', text: '' };
    case 'link': return { type, href: '', text: '' };
    case 'phone': return { type, number: '', text: '' };
    case 'mail': return { type, address: '' };
  }
}

interface Props {
  label: string;
  nodes: InlineNode[];
  onChange: (nodes: InlineNode[]) => void;
  documents: DocumentOption[];
  /** Field errors keyed like `messageEn.0.text`. */
  errors?: Record<string, string>;
  /** Path used to look up errors (for example `messageEn`). */
  path: string;
  lang?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Edits a run of inline content (text, bold, links, phone numbers, e-mail addresses, document links) as an ordered list.
 * Everything is stored as structured nodes and rendered by the public site as elements, never as raw HTML.
 */
export function InlineNodesEditor({ label, nodes, onChange, documents, errors = {}, path, lang, required, disabled, hint }: Props) {
  const headingId = useId();
  const [adding, setAdding] = useState<InlineNode['type']>('text');
  const update = (index: number, patch: Partial<InlineNode>) => onChange(nodes.map((n, i) => (i === index ? ({ ...n, ...patch } as InlineNode) : n)));
  const err = (index: number, field: string) => errors[`${path}.${index}.${field}`];

  return (
    <fieldset className="node-editor" disabled={disabled} aria-labelledby={headingId}>
      <legend id={headingId} className="bilingual__legend">{label}{required && <span className="ff__req" aria-hidden="true"> *</span>}</legend>
      {hint && <p className="ff__hint">{hint}</p>}
      {errors[path] && <p className="ff__error" role="alert">{errors[path]}</p>}
      {nodes.map((node, index) => (
        <div className="node-row" key={index}>
          <p className="block-card__title">{index + 1}. {TYPE_LABELS[node.type]}</p>
          <div className="node-row__fields">
            {(node.type === 'text' || node.type === 'strong') && (
              <TextAreaField label="Text" value={node.text} rows={2} lang={lang} maxLength={20000} onChange={(x) => update(index, { text: x })} error={err(index, 'text')} />
            )}
            {node.type === 'document' && (
              <>
                <SelectField label="Document" value={node.documentId} placeholder="Choose a document" options={documents} onChange={(x) => update(index, { documentId: x })} error={err(index, 'documentId')} />
                <TextField label="Link text" value={node.text} lang={lang} maxLength={500} onChange={(x) => update(index, { text: x })} error={err(index, 'text')} />
              </>
            )}
            {node.type === 'link' && (
              <>
                <TextField label="Address" value={node.href} maxLength={2048} onChange={(x) => update(index, { href: x })} error={err(index, 'href')} hint="https://… or a page on this site such as /hospitals" />
                <TextField label="Link text" value={node.text} lang={lang} maxLength={500} onChange={(x) => update(index, { text: x })} error={err(index, 'text')} />
              </>
            )}
            {node.type === 'phone' && (
              <>
                <TextField label="Number to dial" value={node.number} maxLength={20} inputMode="tel" onChange={(x) => update(index, { number: x })} error={err(index, 'number')} hint="Digits only, for example 04440115088" />
                <TextField label="Number as shown" value={node.text} maxLength={100} onChange={(x) => update(index, { text: x })} error={err(index, 'text')} hint="For example 044 40115088" />
              </>
            )}
            {node.type === 'mail' && (
              <TextField label="E-mail address" value={node.address} maxLength={254} type="email" onChange={(x) => update(index, { address: x })} error={err(index, 'address')} />
            )}
          </div>
          <div className="node-row__tools">
            <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onChange(move(nodes, index, index - 1))}>Move up<span className="visually-hidden"> part {index + 1}</span></Button>
            <Button size="sm" variant="ghost" disabled={index === nodes.length - 1} onClick={() => onChange(move(nodes, index, index + 1))}>Move down<span className="visually-hidden"> part {index + 1}</span></Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(nodes.filter((_, i) => i !== index))}>Remove<span className="visually-hidden"> part {index + 1}</span></Button>
          </div>
        </div>
      ))}
      <div className="node-row__tools">
        <SelectField label="Add a part" value={adding} onChange={(x) => setAdding(x as InlineNode['type'])} options={ADDABLE.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
        <Button size="sm" variant="secondary" onClick={() => onChange([...nodes, emptyNode(adding)])}>Add</Button>
      </div>
    </fieldset>
  );
}
