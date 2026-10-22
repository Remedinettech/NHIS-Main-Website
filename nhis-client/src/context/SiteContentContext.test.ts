import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteContentLoad } from '../services/siteContent.api';
import { previewState } from './SiteContentContext';

const load = (source: SiteContentLoad['source'], previewDenied = false): SiteContentLoad => ({ data: {}, source, previewDenied, signature: '{}' });

test('without ?preview=1 nothing is a preview, whatever was answered', () => {
  assert.deepEqual(previewState(false, undefined), { preview: false, previewDenied: false });
  assert.deepEqual(previewState(false, { load: load('published') }), { preview: false, previewDenied: false });
  assert.deepEqual(previewState(false, { load: load('preview') }), { preview: false, previewDenied: false }, 'a leftover answer for the other mode is never called a preview');
});

test('while the first answer is pending, or when nothing could be loaded, no banner and no administration image address is used', () => {
  assert.deepEqual(previewState(true, undefined), { preview: false, previewDenied: false });
  assert.deepEqual(previewState(true, {}), { preview: false, previewDenied: false });
});

test('the preview is on exactly when the administration answered with the pending drafts', () => {
  assert.deepEqual(previewState(true, { load: load('preview') }), { preview: true, previewDenied: false });
});

test('published content on screen while preview was asked for is reported as denied, for a refusal and for any other failure', () => {
  assert.deepEqual(previewState(true, { load: load('published', true) }), { preview: false, previewDenied: true });
  assert.deepEqual(previewState(true, { load: load('published', false) }), { preview: false, previewDenied: true });
});
