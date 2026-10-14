import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentRecord, PageContent } from '@nhis/shared-types';
import { documentIdsIn, formatBytes, formatIsoDate, inlineToText, truncateToken } from './format';
import { matchesAllWords, tidy } from './text';
import { safeExternalUrl, safeMapUrl } from './safeUrl';
import { pageItems } from './pagination';
import { documentsByCategory } from './documentStats';
import { outline, summarisePage } from './pageOutline';

test('format helpers', () => {
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatIsoDate('2026-10-07'), '7 October 2026');
  assert.equal(formatIsoDate('soon'), 'soon');
  assert.equal(truncateToken('f2af1906685fc1374de7', 12), 'f2af1906685f…');
  assert.equal(truncateToken('abc', 12), 'abc');
});

test('inline content is flattened to text', () => {
  const nodes = [
    { type: 'text' as const, text: 'See ' },
    { type: 'document' as const, documentId: 'd1', text: 'the list' },
    { type: 'text' as const, text: ' or call ' },
    { type: 'phone' as const, number: '04440115088', text: '044 40115088' },
  ];
  assert.equal(inlineToText(nodes), 'See the list or call 044 40115088');
  assert.deepEqual(documentIdsIn([...nodes, nodes[1]!]), ['d1']);
});

test('text helpers tidy whitespace and match Tamil literally', () => {
  assert.equal(tidy('ARUN  MEDICAL\n CENTRE '), 'ARUN MEDICAL CENTRE');
  assert.ok(matchesAllWords('அருண் மருத்துவ மையம்', 'அருண்'));
  assert.ok(matchesAllWords('Ward [A]', '[a]'));
});

test('url guards accept only expected destinations', () => {
  assert.ok(safeMapUrl('https://maps.google.com/?q=1,2'));
  assert.equal(safeMapUrl('javascript:alert(1)'), undefined);
  assert.equal(safeMapUrl('https://evil.example/'), undefined);
  assert.equal(safeExternalUrl('ftp://x'), undefined);
  assert.ok(safeExternalUrl('https://tn-nhis.com/Home/Coverage'));
});

test('pagination window', () => {
  assert.deepEqual(pageItems(50, 102), [1, 'gap-start', 49, 50, 51, 'gap-end', 102]);
});

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({
  id: 'd', category: 'govt-order-employee', audience: 'employee', order: 1,
  label: { en: 'Doc', ta: '' }, title: { en: 'Doc', ta: '' }, dateLabel: { en: null, ta: null },
  sourceUrl: 'https://example.org/a.pdf', localPath: null, availability: 'available', notes: [], ...over,
});

test('documents are counted by category with unavailable files', () => {
  const documents = [doc({ id: 'a' }), doc({ id: 'b', availability: 'unavailable', availabilityNote: 'HTTP 404' }), doc({ id: 'c' })];
  assert.deepEqual(documentsByCategory(documents), [{ category: 'govt-order-employee', total: 3, unavailable: 1 }]);
});

test('page summary reports missing languages and review notes', () => {
  const page = {
    slug: 'gallery', en: { title: 'Gallery', sections: [{ id: 's1', heading: ' Photos ', blocks: [] }] }, ta: null,
    reviewNotes: [{ id: 'n', severity: 'warning', text: 't' }],
  } as unknown as PageContent;
  assert.deepEqual(summarisePage(page), { slug: 'gallery', enSections: 1, taSections: null, missing: ['Tamil'], notes: 1, warnings: 1 });
  assert.deepEqual(outline(page.en), [{ id: 's1', heading: 'Photos', blocks: 0 }]);
  assert.deepEqual(outline(null), []);
});

test('document and contact filters match literally', async () => {
  const { filterContactRows, filterDocuments } = await import('./filters');
  const docs = [doc({ id: 'a', label: { en: 'Alpha order', ta: 'அல்பா' } }), doc({ id: 'b', category: 'enrolment-form', availability: 'unavailable' })];
  assert.deepEqual(filterDocuments(docs, { category: '', availability: '', q: 'alpha' }).map((d) => d.id), ['a']);
  assert.deepEqual(filterDocuments(docs, { category: '', availability: 'unavailable', q: '' }).map((d) => d.id), ['b']);
  assert.deepEqual(filterDocuments(docs, { category: 'enrolment-form', availability: '', q: '' }).map((d) => d.id), ['b']);
  const rows = [{ id: 'r1', sourceRow: 2, cells: { A: 'CHENNAI', B: 'Mr X' } }, { id: 'r2', sourceRow: 3, cells: { A: 'SALEM', B: 'Mr Y' } }];
  assert.deepEqual(filterContactRows(rows, 'salem y').map((r) => r.id), ['r2']);
  assert.equal(filterContactRows(rows, '').length, 2);
});
