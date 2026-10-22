import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LocalizedPageContent, PageContent, PageSection } from '@nhis/shared-types';
import { displayedPageContent, hasPageContent, hasPageSection } from './pageContent';

const paragraph = { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Text' }] };
const section = (extra: Partial<PageSection> = {}): PageSection => ({ id: 's1', blocks: [], ...extra });
const localized = (title: string, sections: PageSection[] = []): LocalizedPageContent => ({ title, sections });
const page = (en: LocalizedPageContent | null, ta: LocalizedPageContent | null): PageContent => ({
  slug: 'gallery', legacyPaths: [], sourceUrl: '', capturedAt: '', documentIds: [], reviewNotes: [], en, ta,
});

test('a page is shown in the visitor language, and in the other language only when that one has no text at all', () => {
  const both = page(localized('Gallery'), localized('கேலரி'));
  assert.deepEqual([displayedPageContent(both, 'en')?.lang, displayedPageContent(both, 'ta')?.lang], ['en', 'ta']);
  const onlyEnglish = page(localized('Gallery'), null);
  assert.equal(displayedPageContent(onlyEnglish, 'ta')?.lang, 'en');
  assert.equal(displayedPageContent(onlyEnglish, 'ta')?.content.title, 'Gallery');
  assert.equal(displayedPageContent(page(null, null), 'en'), undefined);
});

test('the title alone is no content; a heading, a paragraph or any other block is', () => {
  assert.equal(hasPageContent(undefined, 'en'), false);
  assert.equal(hasPageContent(page(localized('Gallery'), localized('கேலரி')), 'en'), false);
  assert.equal(hasPageContent(page(localized('Gallery', [section({ heading: '   ' })]), null), 'en'), false, 'a blank heading is nothing');
  assert.equal(hasPageContent(page(localized('Gallery', [section({ heading: 'Events' })]), null), 'en'), true);
  assert.equal(hasPageContent(page(localized('Gallery', [section({ blocks: [paragraph] })]), null), 'en'), true);
  assert.equal(hasPageContent(page(null, null), 'en'), false);
});

test('content is judged in the text that the visitor would be shown', () => {
  const englishOnly = page(localized('Gallery', [section({ blocks: [paragraph] })]), null);
  assert.equal(hasPageContent(englishOnly, 'ta'), true, 'Tamil falls back to the English text');
  const tamilEmpty = page(localized('Gallery', [section({ blocks: [paragraph] })]), localized('கேலரி'));
  assert.equal(hasPageContent(tamilEmpty, 'ta'), false, 'the Tamil page exists and is empty: that is what is shown');
  assert.equal(hasPageContent(tamilEmpty, 'en'), true);
});

test('a section is looked for in the text that the visitor would be shown', () => {
  const withTables = page(localized('Grievances', [section({ id: 'nodal-2026', heading: 'Nodal' })]), null);
  assert.equal(hasPageSection(withTables, 'en', ['nodal-2026']), true);
  assert.equal(hasPageSection(withTables, 'ta', ['nodal-2026']), true, 'Tamil falls back to the English text');
  assert.equal(hasPageSection(withTables, 'en', ['escalation-1']), false);
  const tamilWithout = page(localized('Grievances', [section({ id: 'nodal-2026' })]), localized('குறைதீர்ப்பு', [section({ id: 'other' })]));
  assert.equal(hasPageSection(tamilWithout, 'ta', ['nodal-2026']), false, 'the Tamil page is what is shown and it has no such section');
  assert.equal(hasPageSection(undefined, 'en', ['nodal-2026']), false);
});
