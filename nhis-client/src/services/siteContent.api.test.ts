import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONTENT, type PageResponse, type SiteContentMap } from '@nhis/shared-types';
import { ApiRequestError, clearApiCache } from './http';
import { getPage } from './content.api';
import {
  PREVIEW_DEDUPE_MS, PREVIEW_STORAGE_KEY, SITE_CONTENT_TTL_MS, coerceSiteContent, getPreviewPage, isPreviewMode, loadSiteContent, previewFromSearch,
  resetPreviewModeForTests,
} from './siteContent.api';

const clone = <T>(value: T): T => structuredClone(value);

/* ---------------------------------------------------------------- environment */

interface Call { url: string; credentials: RequestCredentials | undefined }
const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Answers `fetch` from a table of API paths (without the /api/v1 base); an unlisted path is a 404. */
function mockApi(routes: Record<string, () => Response>): void {
  calls = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, credentials: init?.credentials });
    const handler = routes[url.replace(/^\/api\/v1/, '')];
    return handler ? handler() : Response.json({ error: { message: 'Not found' } }, { status: 404 });
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) => () => Response.json(body, { status });
const unauthorized = (status: number) => json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, status);

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

const globals = globalThis as unknown as { window?: unknown };

beforeEach(() => {
  clearApiCache();
  resetPreviewModeForTests();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globals.window;
});

/* ---------------------------------------------------------------- preview flag */

test('?preview=1 turns preview on, ?preview=0 turns it off, anything else changes nothing', () => {
  assert.equal(previewFromSearch('?preview=1'), true);
  assert.equal(previewFromSearch('?a=b&preview=1'), true);
  assert.equal(previewFromSearch('?preview=0'), false);
  assert.equal(previewFromSearch(''), undefined);
  assert.equal(previewFromSearch('?preview=yes'), undefined);
  assert.equal(previewFromSearch('?preview='), undefined);
});

test('the preview flag is remembered in sessionStorage for the browser tab and cleared by ?preview=0', () => {
  const storage = fakeStorage();
  globals.window = { sessionStorage: storage, location: { search: '' } };
  assert.equal(isPreviewMode(''), false);
  assert.equal(isPreviewMode('?preview=1'), true);
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY), '1');
  // in-app navigation drops the query string; the tab stays in preview
  assert.equal(isPreviewMode(''), true);
  // a reload of the tab: nothing in memory, the stored flag is read
  resetPreviewModeForTests();
  assert.equal(isPreviewMode(''), true);
  assert.equal(isPreviewMode('?preview=0'), false);
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY), null);
  assert.equal(isPreviewMode(''), false);
  resetPreviewModeForTests();
  assert.equal(isPreviewMode(''), false);
});

test('the key is specific to the Client and the flag reads the URL of the window by default', () => {
  assert.match(PREVIEW_STORAGE_KEY, /^nhis\.client\./);
  globals.window = { sessionStorage: fakeStorage(), location: { search: '?preview=1' } };
  assert.equal(isPreviewMode(), true);
});

test('when sessionStorage is unavailable the flag still lasts while the page stays loaded', () => {
  globals.window = {
    get sessionStorage(): never { throw new Error('blocked'); },
    location: { search: '' },
  };
  assert.equal(isPreviewMode('?preview=1'), true);
  assert.equal(isPreviewMode(''), true);
  assert.equal(isPreviewMode('?preview=0'), false);
  assert.equal(isPreviewMode(''), false);
});

/* ---------------------------------------------------------------- shape checks */

test('a complete response is used as it is', () => {
  const data = clone(DEFAULT_SITE_CONTENT);
  data.header.title.en = 'Edited title';
  const content = coerceSiteContent(data);
  assert.equal(content.header.title.en, 'Edited title');
  assert.deepEqual(content, data);
});

test('a missing or malformed document is replaced by the built-in one, the others are kept', () => {
  const data = clone(DEFAULT_SITE_CONTENT) as unknown as Record<string, unknown>;
  delete data.footer;
  (data.header as { title: unknown }).title = { en: 42, ta: '' };
  (data.navigation as { items: unknown }).items = 'nothing';
  (data.partners as { heading: { en: string } }).heading.en = 'Our partners';
  const content = coerceSiteContent(data);
  assert.equal(content.header, DEFAULT_SITE_CONTENT.header);
  assert.equal(content.navigation, DEFAULT_SITE_CONTENT.navigation);
  assert.equal(content.footer, DEFAULT_SITE_CONTENT.footer);
  assert.equal(content.partners.heading.en, 'Our partners');
  assert.deepEqual(content.home, DEFAULT_SITE_CONTENT.home);
});

test('a link with an unknown target kind makes its document malformed', () => {
  const data = clone(DEFAULT_SITE_CONTENT);
  (data.header.loginMenu.items[0].target as unknown) = { type: 'javascript', url: 'javascript:alert(1)' };
  assert.equal(coerceSiteContent(data).header, DEFAULT_SITE_CONTENT.header);
});

test('extra properties of a newer API do not make a document malformed', () => {
  const data = clone(DEFAULT_SITE_CONTENT) as unknown as Record<string, Record<string, unknown>>;
  data.header.newField = { anything: true };
  (data.header.helplines as Array<Record<string, unknown>>)[0].colour = 'red';
  const content = coerceSiteContent(data);
  assert.notEqual(content.header, DEFAULT_SITE_CONTENT.header, 'the received document is used');
  assert.equal(content.header.helplines[0].number, '1800-233-5666');
});

test('anything that is not an object gives the built-in content', () => {
  for (const data of [undefined, null, 'x', 5, [], { data: 1 }]) {
    const content: SiteContentMap = coerceSiteContent(data);
    assert.equal(content.header, DEFAULT_SITE_CONTENT.header);
    assert.equal(content.navigation, DEFAULT_SITE_CONTENT.navigation);
    assert.deepEqual(content.text, { overrides: {} });
  }
});

test('of the interface texts only well-formed entries are kept', () => {
  const data = { ...clone(DEFAULT_SITE_CONTENT), text: { overrides: {
    'hospitals.title': { en: 'Hospitals', ta: '' },
    'hospitals.intro': { en: 5 },
    'contacts.title': 'text',
  } } };
  assert.deepEqual(coerceSiteContent(data).text, { overrides: { 'hospitals.title': { en: 'Hospitals', ta: '' } } });
  assert.deepEqual(coerceSiteContent({ ...data, text: { overrides: 'x' } }).text, { overrides: {} });
});

/* ---------------------------------------------------------------- requests */

const published = (title = 'Published'): { data: SiteContentMap } => {
  const data = clone(DEFAULT_SITE_CONTENT);
  data.header.title.en = title;
  return { data };
};

test('public mode reads /site-content only and never calls an admin endpoint', async () => {
  mockApi({ '/site-content': json(published()) });
  const load = await loadSiteContent({ preview: false });
  assert.equal(load.source, 'published');
  assert.equal(load.previewDenied, false);
  assert.deepEqual(calls.map((call) => call.url), ['/api/v1/site-content']);
  assert.equal(calls[0].credentials, undefined);
  assert.equal(coerceSiteContent(load.data).header.title.en, 'Published');
});

test('preview mode reads the administration preview with the session cookie and does not touch the public endpoint', async () => {
  mockApi({ '/admin/site-content/preview': json(published('Draft')), '/site-content': json(published()) });
  const load = await loadSiteContent({ preview: true });
  assert.equal(load.source, 'preview');
  assert.equal(load.previewDenied, false);
  assert.deepEqual(calls, [{ url: '/api/v1/admin/site-content/preview', credentials: 'same-origin' }]);
  assert.equal(coerceSiteContent(load.data).header.title.en, 'Draft');
});

test('without an administration session (401 or 403) preview shows the published site and says it was denied', async () => {
  for (const status of [401, 403]) {
    clearApiCache();
    mockApi({ '/admin/site-content/preview': unauthorized(status), '/site-content': json(published()) });
    const load = await loadSiteContent({ preview: true });
    assert.equal(load.source, 'published', String(status));
    assert.equal(load.previewDenied, true, String(status));
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/admin/site-content/preview', '/api/v1/site-content']);
  }
});

test('another failure of the preview endpoint also falls back to the published site, without claiming a refusal', async () => {
  mockApi({ '/admin/site-content/preview': json({ error: { message: 'boom' } }, 500), '/site-content': json(published()) });
  const load = await loadSiteContent({ preview: true });
  assert.equal(load.source, 'published');
  assert.equal(load.previewDenied, false);
});

test('a preview response is never served to a public request and the other way round', async () => {
  mockApi({ '/admin/site-content/preview': json(published('Draft')), '/site-content': json(published('Live')) });
  const preview = await loadSiteContent({ preview: true });
  const publicLoad = await loadSiteContent({ preview: false });
  assert.equal(coerceSiteContent(preview.data).header.title.en, 'Draft');
  assert.equal(coerceSiteContent(publicLoad.data).header.title.en, 'Live');
  assert.equal(calls.length, 2);
});

test('published content is reused for a short time, so focus events do not hit the API each time', async () => {
  mockApi({ '/site-content': json(published()) });
  const first = await loadSiteContent({ preview: false });
  const second = await loadSiteContent({ preview: false });
  assert.equal(calls.length, 1);
  assert.equal(first.signature, second.signature);
});

test('a response without content is an error, so the Client keeps its built-in content', async () => {
  mockApi({ '/site-content': json({ unexpected: true }) });
  await assert.rejects(loadSiteContent({ preview: false }), (error: unknown) => error instanceof ApiRequestError && error.kind === 'invalid-response');
  mockApi({});
  clearApiCache();
  await assert.rejects(loadSiteContent({ preview: false }), (error: unknown) => error instanceof ApiRequestError && error.status === 404);
});

test('an aborted request rejects instead of falling back', async () => {
  mockApi({ '/admin/site-content/preview': json(published()), '/site-content': json(published()) });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadSiteContent({ preview: true, signal: controller.signal }));
});

/* ---------------------------------------------------------------- pages in preview */

const page = (title: string): PageResponse['data'] => ({
  slug: 'coverage', legacyPaths: [], sourceUrl: '', capturedAt: '', documentIds: [], reviewNotes: [],
  en: { title, sections: [] }, ta: null,
});

test('a preview page is read from the administration and shaped like a public page response', async () => {
  mockApi({ '/admin/pages/coverage/preview': json({ data: page('Draft title') }) });
  const result = await getPreviewPage('coverage', () => assert.fail('published page must not be read'));
  assert.equal(result.data.en?.title, 'Draft title');
  assert.equal(result.source, 'snapshot');
  assert.deepEqual(calls, [{ url: '/api/v1/admin/pages/coverage/preview', credentials: 'same-origin' }]);
});

test('without an administration session the published page is used; other errors are reported', async () => {
  mockApi({ '/admin/pages/coverage/preview': unauthorized(401) });
  const fallback: PageResponse = { data: page('Published title'), source: 'snapshot', capturedAt: '' };
  assert.equal((await getPreviewPage('coverage', async () => fallback)).data.en?.title, 'Published title');
  mockApi({ '/admin/pages/coverage/preview': unauthorized(403) });
  assert.equal((await getPreviewPage('coverage', async () => fallback)).data.en?.title, 'Published title');
  mockApi({});
  await assert.rejects(getPreviewPage('coverage', async () => fallback), (error: unknown) => error instanceof ApiRequestError && error.status === 404);
});

/* ---------------------------------------------------------------- request volume and freshness */

/** Runs `body` with a clock that only moves when the test says so (the cache measures time with Date.now). */
async function withClock(body: (advance: (ms: number) => void) => Promise<void>): Promise<void> {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try { await body((ms) => { now += ms; }); } finally { Date.now = realNow; }
}

test('a burst of focus and visibility events shares one request, also while it is still running', async () => {
  mockApi({ '/site-content': json(published()) });
  const loads = await Promise.all(Array.from({ length: 10 }, () => loadSiteContent({ preview: false })));
  assert.equal(calls.length, 1);
  assert.equal(new Set(loads.map((load) => load.signature)).size, 1);
});

test('after the cache time a publish is picked up by the next focus, and not earlier', async () => {
  await withClock(async (advance) => {
    mockApi({ '/site-content': json(published('Before')) });
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: false })).data).header.title.en, 'Before');
    mockApi({ '/site-content': json(published('After')) });
    advance(SITE_CONTENT_TTL_MS - 1);
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: false })).data).header.title.en, 'Before', 'still inside the cache time: no request');
    assert.equal(calls.length, 0);
    advance(2);
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: false })).data).header.title.en, 'After');
    assert.equal(calls.length, 1);
  });
});

test('whenever the visitor returns to an open tab, what it shows is no older than the cache time: the tab asks again at the first return after that', async () => {
  await withClock(async (advance) => {
    let version = 0; // what the administration has published right now
    mockApi({ '/site-content': () => Response.json(published(`v${version}`)) });
    let elapsed = 0;
    let fetchedAt = -Infinity;
    let onScreen = '';
    const returnToTab = async () => {
      const before = calls.length;
      onScreen = coerceSiteContent((await loadSiteContent({ preview: false })).data).header.title.en;
      if (calls.length > before) fetchedAt = elapsed;
      assert.ok(elapsed - fetchedAt <= SITE_CONTENT_TTL_MS, `the content on screen is ${elapsed - fetchedAt} ms old at ${elapsed} ms`);
    };
    // A person who switches back and forth with a publish now and then; gaps below, at and far above the cache time.
    const steps: Array<[gap: number, publish: boolean]> = [
      [0, false], [1, false], [SITE_CONTENT_TTL_MS - 2, true], [1, false], [SITE_CONTENT_TTL_MS, false], [5, true],
      [SITE_CONTENT_TTL_MS + 1, false], [3 * SITE_CONTENT_TTL_MS, true], [SITE_CONTENT_TTL_MS - 1, false], [2, false],
    ];
    for (const [gap, publish] of steps) {
      advance(gap);
      elapsed += gap;
      if (publish) version += 1;
      await returnToTab();
    }
    assert.ok(calls.length >= 4 && calls.length < steps.length, 'it asked again after the cache time, and not at every return');
    // The first return after the cache time shows what is published: the delay is bounded by the visitor's next return, not by a deploy.
    advance(SITE_CONTENT_TTL_MS);
    elapsed += SITE_CONTENT_TTL_MS;
    await returnToTab();
    assert.equal(onScreen, `v${version}`);
  });
});

test('the cache times are short enough for the editor and the visitor: the preview is shared for moments, published content for seconds', () => {
  assert.ok(SITE_CONTENT_TTL_MS >= 5_000 && SITE_CONTENT_TTL_MS <= 30_000);
  assert.ok(PREVIEW_DEDUPE_MS <= 5_000, 'a person who edits and switches to the preview tab sees the draft at once');
});

test('a failed request is never cached: the next focus asks again, and the last good content stays with the caller', async () => {
  await withClock(async (advance) => {
    mockApi({ '/site-content': json({ error: { message: 'down' } }, 503) });
    await assert.rejects(loadSiteContent({ preview: false }), (error: unknown) => error instanceof ApiRequestError && error.status === 503);
    await assert.rejects(loadSiteContent({ preview: false }));
    assert.equal(calls.length, 2, 'no negative caching');
    mockApi({ '/site-content': json(published('Back')) });
    advance(1);
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: false })).data).header.title.en, 'Back');
  });
});

test('a network failure is reported as such and does not poison the cache', async () => {
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  await assert.rejects(loadSiteContent({ preview: false }), (error: unknown) => error instanceof ApiRequestError && error.kind === 'network');
  mockApi({ '/site-content': json(published()) });
  assert.equal((await loadSiteContent({ preview: false })).source, 'published');
});

test('preview responses live only a moment: a draft saved in the Admin shows on the next switch to the tab', async () => {
  await withClock(async (advance) => {
    mockApi({ '/admin/site-content/preview': json(published('Draft 1')) });
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: true })).data).header.title.en, 'Draft 1');
    mockApi({ '/admin/site-content/preview': json(published('Draft 2')) });
    advance(PREVIEW_DEDUPE_MS - 1);
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: true })).data).header.title.en, 'Draft 1', 'focus and visibility events of one switch share a request');
    advance(2);
    assert.equal(coerceSiteContent((await loadSiteContent({ preview: true })).data).header.title.en, 'Draft 2');
  });
});

test('public pages never touch an admin endpoint; with preview on, the draft page is requested with the session cookie', async () => {
  globals.window = { sessionStorage: fakeStorage(), location: { search: '' } };
  mockApi({ '/pages/coverage': json({ data: page('Public'), source: 'snapshot', capturedAt: '' }), '/admin/pages/coverage/preview': json({ data: page('Draft') }) });
  assert.equal((await getPage('coverage')).data.en?.title, 'Public');
  assert.deepEqual(calls.map((call) => call.url), ['/api/v1/pages/coverage']);
  assert.equal(calls[0].credentials, undefined);

  resetPreviewModeForTests();
  globals.window = { sessionStorage: fakeStorage({ [PREVIEW_STORAGE_KEY]: '1' }), location: { search: '' } };
  mockApi({ '/pages/coverage': json({ data: page('Public'), source: 'snapshot', capturedAt: '' }), '/admin/pages/coverage/preview': json({ data: page('Draft') }) });
  assert.equal((await getPage('coverage')).data.en?.title, 'Draft');
  assert.deepEqual(calls, [{ url: '/api/v1/admin/pages/coverage/preview', credentials: 'same-origin' }]);
});

test('nothing read from an administration endpoint is written to browser storage', async () => {
  const storage = fakeStorage();
  globals.window = { sessionStorage: storage, location: { search: '?preview=1' } };
  isPreviewMode();
  mockApi({ '/admin/site-content/preview': json(published('Draft')), '/admin/pages/coverage/preview': json({ data: page('Draft') }) });
  await loadSiteContent({ preview: true });
  await getPage('coverage');
  assert.deepEqual([...storage.data.keys()], [PREVIEW_STORAGE_KEY]);
  assert.equal(storage.data.get(PREVIEW_STORAGE_KEY), '1');
});
