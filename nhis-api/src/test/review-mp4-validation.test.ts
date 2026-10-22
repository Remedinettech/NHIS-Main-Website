/**
 * Independent review of the MP4 gate of video uploads (isMp4Video / validateUpload): truncated and hostile boxes, size-field
 * overflow, the brand list, zero-size boxes and floods of tiny boxes. No database needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFileType, FileValidationError, isMp4Video, validateUpload } from '../modules/storage/file-validation';
import { bigBox, box, ftyp, mdat, moov, u32, validMp4 } from './review-mp4';

const limits = { maxDocumentBytes: 25 * 1024 * 1024, maxImageBytes: 5 * 1024 * 1024, maxVideoBytes: 25 * 1024 * 1024 };
const concat = (...parts: Buffer[]) => Buffer.concat(parts);
const refused = (input: { kind: 'video' | 'document' | 'image'; fileName: string; data: Uint8Array }, code = 'UNSUPPORTED_FILE') => {
  assert.throws(() => validateUpload(input, limits), (error: unknown) => error instanceof FileValidationError && error.code === code, `${input.kind} ${input.fileName}`);
};

test('the minimal well-formed file is accepted and detected as mp4', () => {
  const file = validMp4();
  assert.equal(isMp4Video(file), true);
  assert.equal(detectFileType(file), 'mp4');
  const checked = validateUpload({ kind: 'video', fileName: 'Clip One.MP4', data: file }, limits);
  assert.deepEqual([checked.assetKind, checked.extension, checked.mimeType, checked.originalName], ['VIDEO', 'mp4', 'video/mp4', 'Clip One.MP4']);
  // a view into a larger buffer (non-zero byteOffset) is read correctly
  const padded = concat(Buffer.alloc(13, 1), file);
  assert.equal(isMp4Video(padded.subarray(13)), true);
});

test('accepted and refused major brands', () => {
  for (const brand of ['isom', 'iso2', 'iso5', 'iso9', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ']) assert.equal(isMp4Video(concat(ftyp(brand), moov(), mdat())), true, brand);
  for (const brand of ['qt  ', '3gp4', 'M4A ', 'mp43', 'mp40', 'iso1', 'ISOM', 'isox', '\u0000\u0000\u0000\u0000', 'avc2']) assert.equal(isMp4Video(concat(ftyp(brand), moov(), mdat())), false, JSON.stringify(brand));
});

test('missing or misplaced parts: no ftyp, ftyp not first, two ftyp, short ftyp, no moov, audio-only moov, no mdat, empty mdat', () => {
  assert.equal(isMp4Video(concat(moov(), mdat(), ftyp())), false);
  assert.equal(isMp4Video(concat(box('free', Buffer.alloc(16)), ftyp(), moov(), mdat())), false);
  assert.equal(isMp4Video(concat(ftyp(), ftyp(), moov(), mdat())), false);
  assert.equal(isMp4Video(concat(box('ftyp', 'isom'), moov(), mdat(), Buffer.alloc(32))), false);
  assert.equal(isMp4Video(concat(ftyp(), mdat(), box('free', Buffer.alloc(32)))), false);
  assert.equal(isMp4Video(concat(ftyp(), moov('soun'), mdat())), false);
  assert.equal(isMp4Video(concat(ftyp(), moov(), box('free', Buffer.alloc(32)))), false);
  assert.equal(isMp4Video(concat(ftyp(), moov(), box('mdat', Buffer.alloc(0)), box('free', Buffer.alloc(32)))), false);
});

test('every truncation of a valid file, and trailing bytes that do not form a box, are refused', () => {
  const file = validMp4(80);
  for (let length = 0; length < file.length; length++) assert.equal(isMp4Video(file.subarray(0, length)), false, `prefix of ${length} bytes`);
  for (const tail of [1, 4, 7]) assert.equal(isMp4Video(concat(file, Buffer.alloc(tail))), false, `${tail} trailing bytes`);
  // a trailing box whose size runs past the end
  assert.equal(isMp4Video(concat(file, box('free', Buffer.alloc(8), 200))), false);
});

test('size fields: 32-bit overflow, 64-bit overflow, sizes below the header, lying 64-bit sizes', () => {
  const head = concat(ftyp(), moov());
  assert.equal(isMp4Video(concat(head, mdat(), box('free', Buffer.alloc(8), 0xffffffff))), false);
  assert.equal(isMp4Video(concat(head, box('mdat', Buffer.alloc(40), 0xffffffff))), false);
  for (const size of [2, 4, 7]) assert.equal(isMp4Video(concat(head, mdat(), box('free', Buffer.alloc(24), size))), false, `size ${size}`);
  // size field 1 = 64-bit size: the honest form is fine, lies and absurd values are not
  const payload = Buffer.alloc(40, 3);
  assert.equal(isMp4Video(concat(head, bigBox('mdat', payload))), true);
  for (const lie of [0n, 8n, 15n, 16n + 41n, 1n << 32n, (1n << 53n), (1n << 63n), (1n << 64n) - 1n]) assert.equal(isMp4Video(concat(head, bigBox('mdat', payload, lie))), false, `largesize ${lie}`);
  assert.equal(isMp4Video(concat(head, u32(1), Buffer.from('mdat'), Buffer.alloc(4))), false, 'largesize cut short');
  assert.equal(isMp4Video(concat(head, u32(1), Buffer.from('mdat'))), false, 'largesize missing');
});

test('a zero size means "to the end of the file": only the last box may use it, and it still has to be a real box', () => {
  const head = concat(ftyp(), moov());
  assert.equal(isMp4Video(concat(head, box('mdat', Buffer.alloc(40), 0))), true);
  assert.equal(isMp4Video(concat(head, box('mdat', Buffer.alloc(0), 0))), false, 'zero-size box with no data');
  assert.equal(isMp4Video(concat(ftyp(), box('moov', Buffer.concat([Buffer.alloc(8), Buffer.from('vide'), Buffer.alloc(8)]), 0))), false, 'zero-size moov swallows everything, no mdat');
  assert.equal(isMp4Video(concat(box('ftyp', Buffer.concat([Buffer.from('isom'), u32(0), Buffer.from('isomiso2mp41vide')]), 0))), false, 'zero-size ftyp is the whole file');
});

test('box floods are refused quickly instead of being walked one by one', () => {
  const free = box('free');
  const flood = concat(ftyp(), moov(), Buffer.concat(Array.from({ length: 400_000 }, () => free)), mdat(16));
  const started = Date.now();
  assert.equal(isMp4Video(flood), false);
  assert.ok(Date.now() - started < 400, `took ${Date.now() - started} ms`);
  // a realistic fragmented file (thousands of moof + mdat pairs) is still fine
  const fragments = Buffer.concat(Array.from({ length: 5_000 }, () => concat(box('moof', Buffer.alloc(24)), mdat(32))));
  assert.equal(isMp4Video(concat(ftyp(), moov(), fragments)), true);
});

test('other upload kinds never become videos and videos never become other kinds', () => {
  const file = validMp4();
  refused({ kind: 'document', fileName: 'x.pdf', data: file });
  refused({ kind: 'image', fileName: 'x.png', data: file });
  refused({ kind: 'video', fileName: 'x.mov', data: file });
  refused({ kind: 'video', fileName: 'x.mp4.exe', data: file });
  refused({ kind: 'video', fileName: 'x', data: file });
  refused({ kind: 'video', fileName: 'x.mp4', data: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF') });
  refused({ kind: 'video', fileName: 'x.mp4', data: new Uint8Array(0) });
  refused({ kind: 'video', fileName: 'x.mp4', data: file.subarray(0, file.length - 1) });
  refused({ kind: 'video', fileName: 'x.mp4', data: concat(Buffer.from('<html><script>alert(1)</script></html>'), file) });
  refused({ kind: 'video', fileName: 'x.mp4', data: Buffer.alloc(26 * 1024 * 1024, 0), }, 'FILE_TOO_LARGE');
});

test('the video size limit can be lowered by configuration but never raised above 25 MiB', () => {
  const data = validMp4(600);
  assert.throws(() => validateUpload({ kind: 'video', fileName: 'x.mp4', data }, { ...limits, maxVideoBytes: 500 }), (e: unknown) => e instanceof FileValidationError && e.code === 'FILE_TOO_LARGE');
  const huge = concat(validMp4(), Buffer.alloc(25 * 1024 * 1024 + 1));
  assert.throws(() => validateUpload({ kind: 'video', fileName: 'x.mp4', data: huge }, { ...limits, maxVideoBytes: 10 * 1024 * 1024 * 1024 }), (e: unknown) => e instanceof FileValidationError && e.code === 'FILE_TOO_LARGE');
});

test('display names: directories, control characters, quotes and bidi controls never survive', () => {
  const name = (input: string) => validateUpload({ kind: 'video', fileName: input, data: validMp4() }, limits).originalName;
  assert.equal(name('..\\..\\evil\\clip.mp4'), 'clip.mp4');
  assert.equal(name('a/b/c.mp4'), 'c.mp4');
  assert.equal(name('cl"ip<>|:*?.mp4'), 'clip.mp4');
  assert.equal(name('c\r\nSet-Cookie x.mp4'), 'cSet-Cookie x.mp4');
  assert.equal(name('‮txt.4pm.mp4'), 'txt.4pm.mp4');
  assert.equal(name('clip⁦x⁩.mp4'), 'clipx.mp4');
});

test('the four built-in manual videos of the Client pass the same gate as an upload', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { MANUAL_VIDEO_FILES } = await import('@nhis/shared-types');
  const { repoRoot } = await import('./helpers');
  for (const file of MANUAL_VIDEO_FILES) {
    const data = fs.readFileSync(path.join(repoRoot(), 'nhis-client', 'public', file));
    assert.equal(isMp4Video(data), true, file);
    assert.equal(validateUpload({ kind: 'video', fileName: path.basename(file), data }, limits).assetKind, 'VIDEO', file);
  }
});
