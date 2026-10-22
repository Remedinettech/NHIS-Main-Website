import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearApiCache, REVALIDATE_TTL_MS } from './http';
import { getContactDirectory, getContactIndex, getDocuments, getGallery, getPage, getSiteSettings } from './content.api';
import { resetPreviewModeForTests, SITE_CONTENT_TTL_MS } from './siteContent.api';

/*
 * Everything the administration publishes is reused for REVALIDATE_TTL_MS only, so that an open tab which the visitor
 * returns to (utils/refocus.ts, hooks/useAsyncData.ts) picks up a publish, and a visitor who keeps switching tabs makes
 * at most one request per endpoint in that time.
 */

const realFetch = globalThis.fetch;
const realNow = Date.now;
let urls: string[] = [];
let answerOf: (url: string) => unknown = () => ({});
let now = 0;

beforeEach(() => {
  clearApiCache();
  resetPreviewModeForTests();
  urls = [];
  now = realNow();
  Date.now = () => now;
  globalThis.fetch = (async (input: unknown) => {
    urls.push(String(input));
    return Response.json(answerOf(String(input)));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
});

const ENDPOINTS: Array<[name: string, call: () => Promise<unknown>, url: string]> = [
  ['documents', () => getDocuments(), '/api/v1/documents'],
  ['announcements and settings', () => getSiteSettings(), '/api/v1/site'],
  ['gallery', () => getGallery(), '/api/v1/gallery'],
  ['a page', () => getPage('gallery'), '/api/v1/pages/gallery'],
  ['the contact index', () => getContactIndex(), '/api/v1/contacts'],
  ['a contact directory', () => getContactDirectory('hospital-tpa' as never), '/api/v1/contacts/hospital-tpa'],
];

test('the freshness time of published content is the one of the site content', () => {
  assert.equal(REVALIDATE_TTL_MS, SITE_CONTENT_TTL_MS);
  assert.ok(REVALIDATE_TTL_MS <= 15_000, 'an open tab is never more than 15 seconds behind at the moment the visitor returns to it');
});

for (const [name, call, url] of ENDPOINTS) {
  test(`${name}: repeated returns to the tab share one request, and the first return after the freshness time asks again`, async () => {
    answerOf = () => ({ version: 1 });
    assert.deepEqual(await call(), { version: 1 });
    now += REVALIDATE_TTL_MS - 1;
    assert.deepEqual(await call(), { version: 1 });
    assert.deepEqual(urls, [url], 'inside the freshness time nothing is requested');

    answerOf = () => ({ version: 2 });
    now += 1;
    assert.deepEqual(await call(), { version: 2 }, 'a publish is picked up');
    assert.deepEqual(urls, [url, url]);
  });
}

test('a burst of returns while a request is running shares that request', async () => {
  answerOf = () => ({ data: [] });
  await Promise.all(Array.from({ length: 8 }, () => getDocuments()));
  assert.equal(urls.length, 1);
});

test('the draft of a page (preview) is shared only for the events of one switch to the tab', async () => {
  const storage = new Map<string, string>([['nhis.client.preview', '1']]);
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: () => undefined, removeItem: () => undefined },
    location: { search: '' },
  };
  try {
    answerOf = () => ({ data: { slug: 'gallery', version: 1 } });
    await getPage('gallery');
    await getPage('gallery');
    assert.deepEqual(urls, ['/api/v1/admin/pages/gallery/preview'], 'two events of one switch, one request');
    now += 2_000;
    await getPage('gallery');
    assert.equal(urls.length, 2, 'the next switch to the tab reads the draft again');
    assert.ok(urls.every((url) => url.includes('/admin/pages/')), 'the public page is not read in preview mode');
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});
