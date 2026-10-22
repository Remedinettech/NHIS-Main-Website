import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_USER_MANUAL, MANUAL_PDF, MANUAL_VIDEO_FILES, SITE_ID_PATTERN, validateSiteContent } from '@nhis/shared-types';
import { MANUAL_VIDEO_LIMIT, builtInSource, builtInVideoSource, manualPreviewAddress, manualSourceOptions, newManualVideo, startingSource } from './manualSource';

test('a row without a file has nothing to preview: no empty <video src> request is made for it', () => {
  // The defect: a new "Uploaded MP4" row asked the server for ".../admin/files/" before any file existed.
  assert.equal(manualPreviewAddress({ type: 'upload', assetId: '' }, '/TNNHIS/'), null);
  assert.equal(manualPreviewAddress({ type: 'upload', assetId: '   ' }, '/TNNHIS/'), null);
  assert.equal(manualPreviewAddress({ type: 'external', url: '' }, '/TNNHIS/'), null);
  assert.equal(manualPreviewAddress({ type: 'builtIn', path: '' }, '/TNNHIS/'), null);
});

test('a half-typed or malformed asset ID is not previewed, a real one is read through the admin session', () => {
  for (const typed of ['abc', 'abcdefg', 'has space 123456', '../../etc/passwd', 'a/b/c/d/e/f/g/h', 'x'.repeat(65)]) {
    assert.equal(manualPreviewAddress({ type: 'upload', assetId: typed }, '/'), null, typed);
  }
  assert.equal(manualPreviewAddress({ type: 'upload', assetId: 'AbCd1234' }, '/'), '/api/v1/admin/files/AbCd1234');
  assert.equal(manualPreviewAddress({ type: 'upload', assetId: ` ${'a1'.repeat(32)} ` }, '/'), `/api/v1/admin/files/${'a1'.repeat(32)}`);
});

test('a built-in file is read from the public site, with or without a slash at the end of its address', () => {
  const source = { type: 'builtIn' as const, path: MANUAL_PDF };
  assert.equal(manualPreviewAddress(source, '/TNNHIS/'), `/TNNHIS/${MANUAL_PDF}`);
  assert.equal(manualPreviewAddress(source, '/TNNHIS'), `/TNNHIS/${MANUAL_PDF}`);
  assert.equal(manualPreviewAddress(source, 'http://127.0.0.1:5173'), `http://127.0.0.1:5173/${MANUAL_PDF}`);
  assert.equal(manualPreviewAddress(source, '/'), `/${MANUAL_PDF}`);
});

test('every file that the shipped manual uses has a preview', () => {
  assert.ok(manualPreviewAddress(DEFAULT_USER_MANUAL.manual.source, '/TNNHIS/'));
  for (const video of DEFAULT_USER_MANUAL.videos) assert.ok(manualPreviewAddress(video.source, '/TNNHIS/'), video.id);
});

test('the PDF offers no web address (the validator refuses it) and a video offers three kinds', () => {
  assert.deepEqual(manualSourceOptions(false).map((option) => option.value), ['builtIn', 'upload']);
  assert.deepEqual(manualSourceOptions(true).map((option) => option.value), ['builtIn', 'upload', 'external']);
  assert.equal(manualSourceOptions(false)[1]?.label, 'Uploaded PDF');
  assert.equal(manualSourceOptions(true)[1]?.label, 'Uploaded MP4');
});

test('choosing a kind starts with an empty upload or address, or with the built-in file', () => {
  assert.deepEqual(startingSource('upload', true), { type: 'upload', assetId: '' });
  assert.deepEqual(startingSource('external', true), { type: 'external', url: '' });
  assert.deepEqual(startingSource('builtIn', false), { type: 'builtIn', path: MANUAL_PDF });
  assert.deepEqual(startingSource('external', false), { type: 'builtIn', path: MANUAL_PDF }, 'the PDF cannot be a web address');
});

test('reset to the built-in file gives a video its own shipped file, not always the first', () => {
  assert.deepEqual(builtInVideoSource('claims-approved'), { type: 'builtIn', path: MANUAL_VIDEO_FILES[3] });
  assert.deepEqual(builtInVideoSource('preauth-approval'), { type: 'builtIn', path: MANUAL_VIDEO_FILES[1] });
  assert.deepEqual(builtInVideoSource('video-added-later'), { type: 'builtIn', path: MANUAL_VIDEO_FILES[0] });
  assert.deepEqual(builtInVideoSource(undefined), { type: 'builtIn', path: MANUAL_VIDEO_FILES[0] });
  assert.deepEqual(builtInSource(true, 'claims-submission'), { type: 'builtIn', path: MANUAL_VIDEO_FILES[2] });
  assert.deepEqual(startingSource('builtIn', true, 'claims-approved'), { type: 'builtIn', path: MANUAL_VIDEO_FILES[3] });
});

test('every starting source is accepted by the shared validator once its value is filled in', () => {
  const content = structuredClone(DEFAULT_USER_MANUAL);
  content.manual.source = startingSource('builtIn', false);
  assert.equal(validateSiteContent('manual', content).ok, true);
  content.videos[0]!.source = startingSource('upload', true);
  assert.equal(validateSiteContent('manual', content).ok, false, 'an empty upload is reported until a file is chosen');
  content.videos[0]!.source = { type: 'upload', assetId: 'AbCd1234' };
  assert.equal(validateSiteContent('manual', content).ok, true);
  content.videos[0]!.source = startingSource('external', true);
  assert.equal(validateSiteContent('manual', content).ok, false, 'an empty address is reported until it is typed');
  content.videos[0]!.source = { type: 'external', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
  assert.equal(validateSiteContent('manual', content).ok, true);
});

test('a new video has a unique valid id, no content yet, and is refused by the validator until it is filled in', () => {
  const taken = DEFAULT_USER_MANUAL.videos.map((video) => video.id);
  const video = newManualVideo(taken);
  assert.match(video.id, SITE_ID_PATTERN);
  assert.ok(!taken.includes(video.id));
  assert.deepEqual(video.source, { type: 'external', url: '' });
  assert.equal(video.visible, true);
  const content = structuredClone(DEFAULT_USER_MANUAL);
  content.videos.push(video);
  const result = validateSiteContent('manual', content);
  assert.equal(result.ok, false);
  const fields = result.ok ? [] : result.issues.map((issue) => issue.field);
  assert.ok(fields.some((field) => field.startsWith(`videos[${content.videos.length - 1}].title`)), fields.join(', '));
  assert.ok(fields.some((field) => field.startsWith(`videos[${content.videos.length - 1}].source`)), fields.join(', '));
});

test('many new videos never share an id, and the list limit is the one of the validator', () => {
  const ids: string[] = [];
  for (let index = 0; index < MANUAL_VIDEO_LIMIT; index++) ids.push(newManualVideo(ids).id);
  assert.equal(new Set(ids).size, MANUAL_VIDEO_LIMIT);
  const content = structuredClone(DEFAULT_USER_MANUAL);
  content.videos = ids.map((id) => ({ ...newManualVideo([]), id, title: { en: id, ta: '' }, source: { type: 'external' as const, url: 'https://example.org/video' } }));
  assert.equal(validateSiteContent('manual', content).ok, true);
  content.videos.push({ ...content.videos[0]!, id: 'one-too-many' });
  assert.equal(validateSiteContent('manual', content).ok, false, 'one more than the limit is refused');
});
