import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { manualPreviewAddress } from './manualSource';
import { SourcePreview } from './SourcePreview';

const html = (url: string | null, video: boolean) => renderToStaticMarkup(createElement(SourcePreview, { url, video }));

test('a row without a file draws nothing: no empty <video src>, so no request for ".../admin/files/"', () => {
  assert.equal(html(null, true), '');
  assert.equal(html('', true), '');
  assert.equal(html('   ', true), '');
  assert.equal(html(null, false), '');
});

test('what the editor passes for a new "Uploaded MP4" row (no asset yet) is a row without a file', () => {
  const address = manualPreviewAddress({ type: 'upload', assetId: '' }, '/TNNHIS/');
  assert.equal(html(address, true), '');
  assert.doesNotMatch(html(address, true), /video|admin\/files/);
});

test('a video with a file draws a player that reads only the metadata until it is played', () => {
  const markup = html('/TNNHIS/user-manual/Claims_Approved_Narrated.mp4', true);
  assert.match(markup, /^<video /);
  assert.match(markup, /src="\/TNNHIS\/user-manual\/Claims_Approved_Narrated\.mp4"/);
  assert.match(markup, /preload="metadata"/);
  assert.match(markup, /controls/);
});

test('the manual PDF is a link that opens in a new tab without giving the page to the opened one', () => {
  const markup = html('/api/v1/admin/files/AbCd1234', false);
  assert.match(markup, /^<a /);
  assert.match(markup, /href="\/api\/v1\/admin\/files\/AbCd1234"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.doesNotMatch(markup, /<video/);
});

test('an address with quotes or markup in it stays inside its attribute', () => {
  const markup = html('/x"><script>alert(1)</script>', true);
  assert.doesNotMatch(markup, /<script/);
  assert.match(markup, /&quot;/);
});
