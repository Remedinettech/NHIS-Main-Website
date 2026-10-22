import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteImage } from '@nhis/shared-types';
import { resolveApiUrl } from './urls';
import { galleryImageUrl, logoShape, siteImageAlt, siteImageSize, siteImageUrl, withAltFallback } from './siteImages';

const image = (patch: Partial<SiteImage> = {}): SiteImage => ({
  assetId: null, builtIn: null, alt: { en: 'Logo', ta: '' }, width: null, height: null, ...patch,
});

test('an uploaded image comes from the API files endpoint, and from the admin files endpoint in preview mode', () => {
  const upload = image({ assetId: 'abc123DEF456' });
  assert.equal(siteImageUrl(upload), '/api/v1/files/abc123DEF456');
  assert.equal(siteImageUrl(upload, { preview: false }), '/api/v1/files/abc123DEF456');
  assert.equal(siteImageUrl(upload, { preview: true }), '/api/v1/admin/files/abc123DEF456');
});

test('uploaded image addresses follow the API base path of an IIS deployment', () => {
  assert.equal(resolveApiUrl('/api/v1/files/abc123DEF456', '/TNNHISApi/api/v1'), '/TNNHISApi/api/v1/files/abc123DEF456');
  assert.equal(resolveApiUrl('/api/v1/admin/files/abc123DEF456', '/TNNHISApi/api/v1'), '/TNNHISApi/api/v1/admin/files/abc123DEF456');
});

test('a built-in image comes from the Client build, an uploaded image wins over it', () => {
  assert.equal(siteImageUrl(image({ builtIn: 'assets/hitpa-logo.png' })), '/assets/hitpa-logo.png');
  assert.equal(siteImageUrl(image({ builtIn: 'assets/hitpa-logo.png' }), { preview: true }), '/assets/hitpa-logo.png');
  assert.equal(siteImageUrl(image({ assetId: 'abc123DEF456', builtIn: 'assets/hitpa-logo.png' })), '/api/v1/files/abc123DEF456');
});

test('there is no address for a missing image or for a path that is not an allowed built-in file', () => {
  assert.equal(siteImageUrl(undefined), undefined);
  assert.equal(siteImageUrl(null), undefined);
  assert.equal(siteImageUrl(image()), undefined);
  for (const builtIn of ['../secrets.png', '/assets/logo.png', 'assets/logo.svg', 'https://evil.example/x.png', 'assets/../x.png', 'other/x.png']) {
    assert.equal(siteImageUrl(image({ builtIn })), undefined, builtIn);
  }
});

test('an asset id cannot change the path of the request', () => {
  assert.equal(siteImageUrl(image({ assetId: '../admin/users' })), '/api/v1/files/..%2Fadmin%2Fusers');
});

test('alt text is chosen like every bilingual text and the size is given only when both sides are known', () => {
  assert.deepEqual(siteImageAlt(image({ alt: { en: 'Logo', ta: 'சின்னம்' } }), 'ta'), { text: 'சின்னம்', lang: 'ta' });
  assert.deepEqual(siteImageAlt(image(), 'ta'), { text: 'Logo', lang: 'en' });
  assert.deepEqual(siteImageSize(image({ width: 794, height: 862 })), { width: 794, height: 862 });
  assert.deepEqual(siteImageSize(image({ width: 794 })), {});
  assert.deepEqual(siteImageSize(image()), {});
});

test('the shipped partner logos keep the heights they were balanced with', () => {
  const shipped = (file: string, width: number, height: number) => image({ builtIn: `assets/${file}`, width, height });
  assert.equal(logoShape(shipped('united-india-insurance-logo.png', 1012, 763)), 'emblem');
  assert.equal(logoShape(shipped('vidal-health-logo.png', 2000, 600)), 'banner');
  assert.equal(logoShape(shipped('medi-assist-logo.png', 1600, 629)), 'wide');
  assert.equal(logoShape(shipped('hitpa-logo.png', 1469, 1071)), 'stacked');
  assert.equal(logoShape(shipped('hitpa-logo.png', 1469, 1071)), logoShape(image({ builtIn: 'assets/hitpa-logo.png' })), 'the file decides, not the stored size');
});

test('an uploaded logo gets its height class from its proportions: strips are low, squares are medium, tall logos get room', () => {
  const upload = (width: number | null, height: number | null) => image({ assetId: 'abc123DEF456', width, height });
  assert.equal(logoShape(upload(300, 300)), 'emblem');
  assert.equal(logoShape(upload(1, 1)), 'emblem');
  assert.equal(logoShape(upload(1500, 1000)), 'emblem');
  assert.equal(logoShape(upload(2000, 200)), 'banner');
  assert.equal(logoShape(upload(3000, 1000)), 'banner');
  assert.equal(logoShape(upload(1600, 629)), 'wide');
  assert.equal(logoShape(upload(2000, 1000)), 'wide');
  assert.equal(logoShape(upload(200, 600)), 'stacked');
  assert.equal(logoShape(upload(790, 1000)), 'stacked');
  assert.equal(logoShape(upload(800, 1000)), 'emblem');
  assert.equal(logoShape(upload(null, null)), 'emblem', 'unknown size: the logo is only limited by the box');
  assert.equal(logoShape(upload(500, null)), 'emblem');
});

test('an uploaded replacement of a shipped file, or a shipped file name with an upload, is not given the old shape', () => {
  assert.equal(logoShape(image({ assetId: 'abc123DEF456', builtIn: 'assets/hitpa-logo.png', width: 1000, height: 100 })), 'banner');
  assert.equal(logoShape(image({ builtIn: 'assets/new-partner.png', width: 100, height: 300 })), 'stacked');
  assert.equal(logoShape(image({ builtIn: 'constructor' })), 'emblem', 'names of Object.prototype are not shipped logos');
});

test('a gallery picture is only taken from the public file route of the API', () => {
  assert.equal(galleryImageUrl('/api/v1/files/clx1abc2def3ghi4jkl5mno6'), '/api/v1/files/clx1abc2def3ghi4jkl5mno6');
  for (const rejected of ['https://example.com/a.png', 'http://example.com/a.png', '//evil.example/a.png', '/assets/hitpa-logo.png', '/api/v1/admin/files/clx1abc2def3ghi4jkl5mno6',
    '/api/v1/files/', '/api/v1/files/short', '/api/v1/files/../secret12345', '/api/v1/files/abc123DEF456/extra', '/api/v1/files/abc123DEF456?x=1', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '']) {
    assert.equal(galleryImageUrl(rejected), undefined, rejected);
  }
});

test('the alt text of an image comes first; its fallback (a partner name) is used only when the image has no alt text in any language', () => {
  const name = { en: 'Vidal Health', ta: 'விடல் ஹெல்த்' };
  assert.deepEqual(withAltFallback(image({ alt: { en: 'Logo', ta: '' } }), name).alt, { en: 'Logo', ta: '' });
  assert.deepEqual(withAltFallback(image({ alt: { en: '', ta: 'லோகோ' } }), name).alt, { en: '', ta: 'லோகோ' });
  assert.deepEqual(withAltFallback(image({ alt: { en: '', ta: '' } }), name).alt, name);
  assert.deepEqual(withAltFallback(image({ alt: { en: '  ', ta: ' ' } }), name).alt, name, 'blanks are no alt text');
  const original = image({ alt: { en: '', ta: '' }, assetId: 'abc123DEF456' });
  assert.equal(withAltFallback(original, name).assetId, 'abc123DEF456');
  assert.deepEqual(original.alt, { en: '', ta: '' }, 'the content itself is not changed');
});
