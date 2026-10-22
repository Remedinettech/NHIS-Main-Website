import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, type GalleryItem, type GalleryResponse, type Locale, type PageResponse, type PageSection, type SiteContentMap } from '@nhis/shared-types';
import { ApiRequestError } from '../services/http';
import type { AsyncState } from '../types/async';

register('data:text/javascript,' + encodeURIComponent("export async function load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return next(url,context)}"));
const { SiteContentContext } = await import('../context/SiteContentContext');
const { LanguageProvider } = await import('../context/LanguageContext');
const { GalleryPageView, galleryPageState } = await import('./GalleryPage');

/* ---------------------------------------------------------------- answers */

const noop = () => undefined;
function answer<T>(data?: T, error?: Error): AsyncState<T> {
  return { data, error, loading: data === undefined && error === undefined, refreshing: false, reload: noop };
}

const item = (id: string, imageUrl = `/api/v1/files/asset_${id}_12345`): GalleryItem => ({ id, title: { en: `Event ${id}`, ta: '' }, imageUrl, sourceUrl: '' });
const galleryOf = (...items: GalleryItem[]): GalleryResponse => ({ data: items, total: items.length, source: 'snapshot', capturedAt: '' });

const paragraph = { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Photographs of our camps' }] };
function pageOf(sections: PageSection[], tamil = false): PageResponse {
  return {
    data: {
      slug: 'gallery', legacyPaths: [], sourceUrl: '', capturedAt: '', documentIds: [], reviewNotes: [],
      en: { title: 'Gallery of camps', sections }, ta: tamil ? { title: 'கேலரி', sections: [] } : null,
    },
    source: 'snapshot', capturedAt: '',
  };
}
const EMPTY_PAGE = pageOf([]);
const TEXT_PAGE = pageOf([{ id: 'intro', heading: 'Our camps', blocks: [paragraph] }]);
const notFound = new ApiRequestError('http', 'Not found', 404, 'NOT_FOUND');
const unreachable = new ApiRequestError('network', 'The API could not be reached');

function render(gallery: AsyncState<GalleryResponse>, page: AsyncState<PageResponse>, locale: Locale = 'en', content: SiteContentMap = DEFAULT_SITE_CONTENT): string {
  return renderToString(createElement(MemoryRouter, { initialEntries: ['/gallery'] },
    createElement(SiteContentContext.Provider, { value: { content, preview: false, previewDenied: false, status: 'ready' } },
      createElement(LanguageProvider, { initialLocale: locale, children: createElement(GalleryPageView, { gallery, page }) }))));
}

/* ---------------------------------------------------------------- what the route shows */

test('nothing is decided before both answers are there', () => {
  assert.equal(galleryPageState(answer<GalleryResponse>(), answer<PageResponse>(), 'en').kind, 'loading');
  assert.equal(galleryPageState(answer(galleryOf()), answer<PageResponse>(), 'en').kind, 'loading', 'the page text is still on its way');
  assert.equal(galleryPageState(answer<GalleryResponse>(), answer(EMPTY_PAGE), 'en').kind, 'loading', 'the pictures are still on their way');
});

test('an empty gallery without page text goes back to the home page, as before', () => {
  assert.equal(galleryPageState(answer(galleryOf()), answer(EMPTY_PAGE), 'en').kind, 'redirect');
  assert.equal(galleryPageState(answer(galleryOf()), answer(EMPTY_PAGE), 'ta').kind, 'redirect');
  assert.equal(galleryPageState(answer(galleryOf()), answer<PageResponse>(undefined, notFound), 'en').kind, 'redirect', 'a missing page is a page without text');
});

test('page text alone makes the route a populated page, pictures alone too', () => {
  const textOnly = galleryPageState(answer(galleryOf()), answer(TEXT_PAGE), 'en');
  assert.equal(textOnly.kind, 'ready');
  const picturesOnly = galleryPageState(answer(galleryOf(item('a'))), answer(EMPTY_PAGE), 'en');
  assert.equal(picturesOnly.kind, 'ready');
  assert.equal(picturesOnly.kind === 'ready' && picturesOnly.page, undefined, 'a page with a title only adds nothing above the pictures');
});

test('a failure is never taken for emptiness', () => {
  const galleryDown = galleryPageState(answer<GalleryResponse>(undefined, unreachable), answer(EMPTY_PAGE), 'en');
  assert.deepEqual([galleryDown.kind, galleryDown.kind === 'error' && galleryDown.retry], ['error', 'gallery']);
  const pageDown = galleryPageState(answer(galleryOf()), answer<PageResponse>(undefined, unreachable), 'en');
  assert.deepEqual([pageDown.kind, pageDown.kind === 'error' && pageDown.retry], ['error', 'page']);
  // The page is optional once there are pictures; the pictures stay when only the page failed.
  assert.equal(galleryPageState(answer(galleryOf(item('a'))), answer<PageResponse>(undefined, unreachable), 'en').kind, 'ready');
  // With page text, a failed picture request shows the text and says that the pictures failed.
  const partial = galleryPageState(answer<GalleryResponse>(undefined, unreachable), answer(TEXT_PAGE), 'en');
  assert.equal(partial.kind === 'ready' && partial.itemsError, unreachable);
});

test('the text the visitor would be shown decides: Tamil with an empty Tamil page redirects although the English page has text', () => {
  const both = pageOf([{ id: 'intro', heading: 'Our camps', blocks: [paragraph] }], true);
  assert.equal(galleryPageState(answer(galleryOf()), answer(both), 'ta').kind, 'redirect');
  assert.equal(galleryPageState(answer(galleryOf()), answer(both), 'en').kind, 'ready');
});

/* ---------------------------------------------------------------- rendering */

test('page text is drawn above the pictures, under one h1 and with the page title', () => {
  const html = render(answer(galleryOf(item('a'), item('b'))), answer(TEXT_PAGE));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(html.includes('>Gallery of camps</h1>'), 'the title of the page text');
  assert.ok(html.indexOf('Photographs of our camps') < html.indexOf('class="gallery-grid"'));
  assert.ok(html.indexOf('<h1') < html.indexOf('<h2') && html.indexOf('<h2') < html.indexOf('class="gallery-grid"'));
  assert.equal((html.match(/<figure>/g) ?? []).length, 2);
});

test('without page text the page keeps its built-in title and only the pictures', () => {
  const html = render(answer(galleryOf(item('a'))), answer(EMPTY_PAGE));
  assert.ok(html.includes('>Gallery</h1>'));
  assert.ok(!html.includes('Gallery of camps'));
  assert.equal((html.match(/<figure>/g) ?? []).length, 1);
});

test('page text without pictures shows the text and no empty grid', () => {
  const html = render(answer(galleryOf()), answer(TEXT_PAGE));
  assert.ok(html.includes('Photographs of our camps'));
  assert.ok(!html.includes('gallery-grid'));
});

test('a title written under Page text replaces the title of the page text', () => {
  const content = structuredClone(DEFAULT_SITE_CONTENT);
  content.text.overrides['gallery.title'] = { en: 'Our pictures', ta: '' };
  assert.ok(render(answer(galleryOf(item('a'))), answer(TEXT_PAGE), 'en', content).includes('>Our pictures</h1>'));
});

test('Tamil without Tamil page text shows the English text with the notice and lang="en"', () => {
  const html = render(answer(galleryOf()), answer(TEXT_PAGE), 'ta');
  assert.ok(html.includes('Photographs of our camps'));
  assert.ok(/<article[^>]*lang="en"/.test(html));
  assert.ok(html.includes('content-fallback'));
});

test('only pictures from the file route of the API are drawn, under the API base of the deployment', () => {
  const html = render(answer(galleryOf(item('a'), item('b', 'https://example.com/x.png'), item('c', '//evil.example/x.png'), item('d', '/assets/hitpa-logo.png'))), answer(EMPTY_PAGE));
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.ok(html.includes('src="/api/v1/files/asset_a_12345"'));
  assert.ok(!html.includes('example.com') && !html.includes('evil.example'));
});

test('a failed picture request is announced next to the page text, and the loading and error views keep one h1', () => {
  const failed = render(answer<GalleryResponse>(undefined, unreachable), answer(TEXT_PAGE));
  assert.ok(failed.includes('role="alert"') && failed.includes('Photographs of our camps'));
  for (const html of [render(answer<GalleryResponse>(), answer<PageResponse>()), render(answer<GalleryResponse>(undefined, unreachable), answer(EMPTY_PAGE))]) {
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  }
});
