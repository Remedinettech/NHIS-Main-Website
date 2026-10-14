import type { InlineNode } from '@nhis/shared-types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

/** Formats an ISO date (YYYY-MM-DD) like "7 October 2026". Falls back to the raw value when it cannot be parsed. */
export function formatIsoDate(iso: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Shortens a long token (e.g. a SHA-256 digest) for table display; the full value must stay reachable elsewhere. */
export function truncateToken(value: string, visible = 12): string {
  return value.length > visible ? `${value.slice(0, visible)}…` : value;
}

/** Flattens inline content to plain text for list views. Links and documents keep their visible text. */
export function inlineToText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'mail': return node.address;
        case 'phone': return node.text;
        default: return node.text;
      }
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Document ids referenced by inline content, in order, without duplicates. */
export function documentIdsIn(nodes: readonly InlineNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) if (node.type === 'document' && !ids.includes(node.documentId)) ids.push(node.documentId);
  return ids;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}
