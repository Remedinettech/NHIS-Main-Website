/**
 * Resumed security review, stored validator rules of the User Manual document: a web address of an external video is stored
 * in its normalised form (URL.href), exactly like every other address of the site-content documents, so that what is stored
 * is what a browser reads. No database needed.
 *
 * On the code as it was, the text as typed was stored after a syntax check: a backslash (read as "/" by browsers and as part of
 * a user name by other parsers), upper-case scheme and host, and invisible bidi controls inside the address stayed in the
 * published document and in GET /api/v1/site-content.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_USER_MANUAL, validateSiteContent, type UserManualContent } from '@nhis/shared-types';

const withVideoSource = (source: unknown): unknown => {
  const doc = structuredClone(DEFAULT_USER_MANUAL) as unknown as { videos: Array<{ source: unknown }> };
  doc.videos[0].source = source;
  return doc;
};
const storedUrl = (url: string): string | null => {
  const result = validateSiteContent('manual', withVideoSource({ type: 'external', url }));
  if (!result.ok) return null;
  const source = (result.value as UserManualContent).videos[0].source;
  return source.type === 'external' ? source.url : null;
};

test('an external video address is stored normalised: trimmed, lower-case scheme and host, backslash as "/", no raw bidi controls', () => {
  assert.equal(storedUrl('  HTTPS://Example.ORG/v?a=1  '), 'https://example.org/v?a=1');
  assert.equal(storedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(storedUrl('https://example.org'), 'https://example.org/');
  const backslash = String.raw`https://www.youtube.com\@evil.example/watch?v=dQw4w9WgXcQ`;
  const normalised = storedUrl(backslash);
  assert.ok(normalised === null || (!normalised.includes('\\') && new URL(normalised).hostname === 'www.youtube.com' && new URL(normalised).username === ''), `stored ${normalised}`);
  const bidi = storedUrl('https://example.org/a‮b​c');
  assert.ok(bidi === null || !/[‪-‮​-‏⁠-⁩﻿]/.test(bidi), `stored ${JSON.stringify(bidi)}`);
});

test('the same rules still refuse what is not an https address', () => {
  for (const url of ['http://youtu.be/x', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'https://user:pw@youtube.com/x', '//evil.example/x', 'https://exa mple.com', `https://example.org/${'a'.repeat(600)}`, 'ftp://example.org/x', 'https://']) {
    assert.equal(storedUrl(url), null, url);
  }
});
