import type {
  ContentBlock, ImageBlock, InlineNode, ListBlock, ListItem, LocalizedPageContent, PageSection,
} from '@nhis/shared-types';
import { Validator } from '../../common/admin';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** Same pattern as the public files route uses for asset ids. */
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const SECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_TEXT = 20_000;
const MAX_NODES = 200;
const MAX_DEPTH = 4;

function documentId(v: Validator, value: unknown, field: string): string | undefined {
  const id = v.string(value, field, { max: 128 });
  if (id !== undefined && !ID_PATTERN.test(id)) return v.fail(field, 'Not a valid document id.');
  return id;
}

/** Validates one inline node and returns a clean copy (unknown keys are rejected). */
export function parseInlineNode(v: Validator, value: unknown, field: string): InlineNode | undefined {
  const obj = v.object(value, field);
  if (!obj) return undefined;
  const type = v.enumValue(obj.type, `${field}.type`, ['text', 'strong', 'document', 'mail', 'phone', 'link'] as const);
  if (!type) return undefined;
  const sub = v.child(field);
  switch (type) {
    case 'text':
    case 'strong': {
      sub.noUnknownKeys(obj, ['type', 'text']);
      const text = sub.string(obj.text, 'text', { max: MAX_TEXT, multiline: true, keepWhitespace: true, min: 1 });
      return text === undefined ? undefined : { type, text };
    }
    case 'document': {
      sub.noUnknownKeys(obj, ['type', 'documentId', 'text']);
      const id = documentId(sub, obj.documentId, 'documentId');
      const text = sub.string(obj.text, 'text', { max: 500 });
      return id && text ? { type, documentId: id, text } : undefined;
    }
    case 'mail': {
      sub.noUnknownKeys(obj, ['type', 'address']);
      const raw = sub.string(obj.address, 'address', { max: 254 });
      if (raw === undefined) return undefined;
      const checked = sub.email(raw, 'address');
      // The address is displayed exactly as entered (case preserved); only validity is checked.
      return checked === undefined ? undefined : { type, address: raw };
    }
    case 'phone': {
      sub.noUnknownKeys(obj, ['type', 'number', 'text']);
      const number = sub.string(obj.number, 'number', { max: 20 });
      if (number !== undefined && !/^\+?\d{6,15}$/.test(number)) sub.fail('number', 'Digits only (optionally starting with +), 6 to 15 digits.');
      const text = sub.string(obj.text, 'text', { max: 100 });
      return number && text && /^\+?\d{6,15}$/.test(number) ? { type, number, text } : undefined;
    }
    case 'link': {
      sub.noUnknownKeys(obj, ['type', 'href', 'text']);
      const raw = sub.string(obj.href, 'href', { max: 2048 });
      let href: string | undefined;
      if (raw !== undefined) {
        if (raw.startsWith('/') && !raw.startsWith('//') && !/[\s\\]/.test(raw)) href = raw;
        else href = sub.url(raw, 'href', { schemes: ['https:'] });
      }
      const text = sub.string(obj.text, 'text', { max: 500 });
      return href && text ? { type, href, text } : undefined;
    }
  }
}

export function parseInlineNodes(v: Validator, value: unknown, field: string, options: { min?: number } = {}): InlineNode[] | undefined {
  const arr = v.array(value, field, MAX_NODES);
  if (!arr) return undefined;
  if (arr.length < (options.min ?? 0)) return v.fail(field, 'At least one item is required.');
  const out: InlineNode[] = [];
  arr.forEach((item, index) => {
    const node = parseInlineNode(v, item, `${field}[${index}]`);
    if (node) out.push(node);
  });
  return out;
}

function parseList(v: Validator, value: unknown, field: string, depth: number): ListBlock | undefined {
  const obj = v.object(value, field);
  if (!obj) return undefined;
  const sub = v.child(field);
  sub.noUnknownKeys(obj, ['type', 'ordered', 'items']);
  const ordered = sub.boolean(obj.ordered, 'ordered');
  const items = sub.array(obj.items, 'items', MAX_NODES);
  if (ordered === undefined || !items) return undefined;
  const out: ListItem[] = [];
  items.forEach((raw, index) => {
    const itemField = `items[${index}]`;
    const itemObj = sub.object(raw, itemField);
    if (!itemObj) return;
    const itemV = sub.child(itemField);
    itemV.noUnknownKeys(itemObj, ['content', 'children']);
    const content = parseInlineNodes(itemV, itemObj.content, 'content', { min: 1 });
    let children: ListBlock | undefined;
    if (itemObj.children !== undefined && itemObj.children !== null) {
      if (depth >= MAX_DEPTH) itemV.fail('children', 'Lists are nested too deeply.');
      else children = parseList(itemV, itemObj.children, 'children', depth + 1);
    }
    if (content) out.push(children ? { content, children } : { content });
  });
  return { type: 'list', ordered, items: out };
}

/**
 * An uploaded picture. `width` and `height` are accepted (the Admin sends back what it received) but ignored: the API
 * fills them from the stored file when the page is saved. Whether the asset exists and is an image is checked against
 * the database by the pages module.
 */
function parseImageBlock(sub: Validator, obj: Record<string, unknown>): ImageBlock | undefined {
  sub.noUnknownKeys(obj, ['type', 'assetId', 'alt', 'caption', 'width', 'height']);
  const assetId = sub.string(obj.assetId, 'assetId', { max: 64 });
  if (assetId !== undefined && !ASSET_ID_PATTERN.test(assetId)) sub.fail('assetId', 'This is not a valid uploaded image.');
  const alt = sub.string(obj.alt, 'alt', { max: 250 });
  const caption = sub.string(obj.caption, 'caption', { max: 300, optional: true });
  if (assetId === undefined || !ASSET_ID_PATTERN.test(assetId) || alt === undefined) return undefined;
  return { type: 'image', assetId, alt, ...(caption !== undefined ? { caption } : {}) };
}

export function parseBlock(v: Validator, value: unknown, field: string): ContentBlock | undefined {
  const obj = v.object(value, field);
  if (!obj) return undefined;
  const type = v.enumValue(obj.type, `${field}.type`, ['paragraph', 'list', 'documentLink', 'image', 'table'] as const);
  if (!type) return undefined;
  const sub = v.child(field);
  if (type === 'table') {
    sub.noUnknownKeys(obj, ['type', 'headers', 'rows']);
    const rawHeaders = sub.array(obj.headers, 'headers', 8);
    const headers = rawHeaders?.map((header, i) => sub.string(header, `headers[${i}]`, { max: 150 }) ?? '') ?? [];
    if (!headers.length) sub.fail('headers', 'Add at least one column.');
    const rawRows = sub.array(obj.rows, 'rows', 50);
    const rows = rawRows?.map((raw, i) => {
      const cells = sub.array(raw, `rows[${i}]`, 8) ?? [];
      if (cells.length !== headers.length) sub.fail(`rows[${i}]`, 'Each row must have one cell for every column.');
      return cells.map((cell, j) => parseInlineNodes(sub, cell, `rows[${i}][${j}]`) ?? []);
    }) ?? [];
    return { type, headers, rows };
  }
  if (type === 'paragraph') {
    sub.noUnknownKeys(obj, ['type', 'content']);
    const content = parseInlineNodes(sub, obj.content, 'content', { min: 1 });
    return content ? { type, content } : undefined;
  }
  if (type === 'list') return parseList(v, obj, field, 1);
  if (type === 'image') return parseImageBlock(sub, obj);
  sub.noUnknownKeys(obj, ['type', 'documentId', 'text']);
  const id = documentId(sub, obj.documentId, 'documentId');
  const text = sub.string(obj.text, 'text', { max: 500 });
  return id && text ? { type, documentId: id, text } : undefined;
}

export function parseSection(v: Validator, value: unknown, field: string): PageSection | undefined {
  const obj = v.object(value, field);
  if (!obj) return undefined;
  const sub = v.child(field);
  sub.noUnknownKeys(obj, ['id', 'key', 'heading', 'blocks']);
  const id = sub.string(obj.id, 'id', { max: 64 });
  if (id !== undefined && !SECTION_ID_PATTERN.test(id)) sub.fail('id', 'Use letters, digits, hyphens and underscores only.');
  const key = sub.string(obj.key, 'key', { max: 64, optional: true });
  if (key !== undefined && !SECTION_ID_PATTERN.test(key)) sub.fail('key', 'Use letters, digits, hyphens and underscores only.');
  const heading = sub.string(obj.heading, 'heading', { max: 300, optional: true });
  const blocksRaw = sub.array(obj.blocks, 'blocks', MAX_NODES);
  const blocks: ContentBlock[] = [];
  blocksRaw?.forEach((raw, index) => {
    const block = parseBlock(sub, raw, `blocks[${index}]`);
    if (block) blocks.push(block);
  });
  if (id === undefined || !blocksRaw) return undefined;
  return { id, ...(key !== undefined ? { key } : {}), ...(heading !== undefined ? { heading } : {}), blocks };
}

/** `null` means the language has no content for this page. */
export function parseLocalizedPage(v: Validator, value: unknown, field: string): LocalizedPageContent | null | undefined {
  if (value === null) return null;
  const obj = v.object(value, field);
  if (!obj) return undefined;
  const sub = v.child(field);
  sub.noUnknownKeys(obj, ['title', 'sections']);
  const title = sub.string(obj.title, 'title', { max: 300 });
  const sectionsRaw = sub.array(obj.sections, 'sections', 100);
  const sections: PageSection[] = [];
  const seen = new Set<string>();
  sectionsRaw?.forEach((raw, index) => {
    const section = parseSection(sub, raw, `sections[${index}]`);
    if (!section) return;
    if (seen.has(section.id)) sub.fail(`sections[${index}].id`, 'Section ids must be unique within a page.');
    seen.add(section.id);
    sections.push(section);
  });
  if (title === undefined || !sectionsRaw) return undefined;
  return { title, sections };
}

/** Document ids referenced anywhere in the nodes/blocks (for existence checks and the page's documentIds). */
export function collectDocumentIds(source: ReadonlyArray<InlineNode | ContentBlock | PageSection>): string[] {
  const ids: string[] = [];
  const addList = (list: ListBlock) => {
    for (const item of list.items) {
      visitNodes(item.content);
      if (item.children) addList(item.children);
    }
  };
  const visitNodes = (nodes: ReadonlyArray<InlineNode>) => {
    for (const node of nodes) if (node.type === 'document') ids.push(node.documentId);
  };
  const visitBlocks = (blocks: ReadonlyArray<ContentBlock>) => {
    for (const block of blocks) {
      if (block.type === 'paragraph') visitNodes(block.content);
      else if (block.type === 'list') addList(block);
      else if (block.type === 'documentLink') ids.push(block.documentId);
      else if (block.type === 'table') block.rows.forEach((row) => row.forEach(visitNodes));
      // An image block references an uploaded asset, never a document.
    }
  };
  for (const item of source) {
    if ('blocks' in item) visitBlocks(item.blocks);
    else if (item.type === 'paragraph') visitNodes(item.content);
    else if (item.type === 'list') addList(item);
    else if (item.type === 'table') item.rows.forEach((row) => row.forEach(visitNodes));
    else if (item.type === 'documentLink') ids.push(item.documentId);
    else if (item.type !== 'image') visitNodes([item]);
  }
  return [...new Set(ids)];
}
