import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_CONTENT_KEYS, SITE_ROUTES } from '@nhis/shared-types';
import { PAGE_SLUGS } from './app';
import { PUBLIC_PAGE_MAP, SITE_EDIT_PATHS, previewUrlFor } from './siteContent';

test('every public route of the Client is in the "where is it edited" table', () => {
  const listed = new Set(PUBLIC_PAGE_MAP.map((entry) => entry.route));
  for (const route of SITE_ROUTES) assert.ok(listed.has(route.path), `${route.path} is missing`);
});

test('the areas shared by all pages are in the table', () => {
  const shared = PUBLIC_PAGE_MAP.filter((entry) => entry.route === null).map((entry) => entry.page);
  assert.deepEqual(shared, ['Header', 'Navigation', 'Footer']);
});

test('every row says what can be edited and links to routes that exist in the Admin', () => {
  const fixed = new Set(['/hospitals', '/documents', '/contacts', '/announcements', '/gallery', ...Object.values(SITE_EDIT_PATHS)]);
  for (const entry of PUBLIC_PAGE_MAP) {
    assert.ok(entry.edits.length > 20, entry.page);
    assert.ok(entry.where.length > 0, entry.page);
    for (const place of entry.where) {
      const slug = /^\/pages\/(.+)$/.exec(place.to)?.[1];
      assert.ok(fixed.has(place.to) || (slug !== undefined && (PAGE_SLUGS as readonly string[]).includes(slug)), `${entry.page}: ${place.to}`);
    }
  }
  assert.equal(new Set(PUBLIC_PAGE_MAP.map((entry) => entry.page)).size, PUBLIC_PAGE_MAP.length);
});

test('every document has an editor route and a preview address', () => {
  assert.equal(new Set(Object.values(SITE_EDIT_PATHS)).size, SITE_CONTENT_KEYS.length);
  for (const key of SITE_CONTENT_KEYS) {
    assert.equal(SITE_EDIT_PATHS[key], `/site/${key}`);
    assert.match(previewUrlFor(key), /\?preview=1$/);
  }
});
