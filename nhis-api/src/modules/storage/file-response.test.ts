import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { byteRange, storedFileResponse } from './file-response';
import { isMp4Video } from './file-validation';
import type { StorageAdapter } from './storage.types';

test('single ranges are bounded; malformed and zero suffix ranges are refused', () => {
  assert.deepEqual(byteRange('bytes=3-99', 10), { start: 3, end: 9 });
  assert.deepEqual(byteRange('bytes=-50', 10), { start: 0, end: 9 });
  for (const input of ['bytes=10-', 'bytes=-0', 'bytes=8-4', 'garbage']) assert.equal(byteRange(input, 10), 'invalid');
  assert.equal(isMp4Video(Buffer.from('not video')), false);
  assert.equal(isMp4Video(Buffer.from('0000ftypisom')), false);
});

test('a request for several ranges is not answered with 416: the Range header is ignored and the whole file is sent', () => {
  for (const input of ['bytes=0-1,5-6', 'bytes=0-1, 5-6', 'bytes=1-2,3-4', 'bytes=0-0,-1', 'bytes=0-,5-', 'bytes=0-1,', 'bytes=,0-1', 'BYTES=0-1,5-6', ' bytes=0-1,5-6 ']) {
    assert.equal(byteRange(input, 10), null, input);
  }
  // a single range with odd spelling is still one range
  assert.deepEqual(byteRange('Bytes=2-3', 10), { start: 2, end: 3 });
  assert.deepEqual(byteRange(' bytes=2-3 ', 10), { start: 2, end: 3 });
});

test('hostile numbers: negative, fractional, hex, exponent, signs, huge digits and out of range never throw and never leave the file', () => {
  const size = 1000;
  for (const input of ['bytes=-1-5', 'bytes=1.5-3', 'bytes=0x10-20', 'bytes=1e2-3', 'bytes=+1-2', 'bytes=1--2', 'bytes=--2', 'bytes=-', 'bytes=', 'bytes', 'bytes=a-b', 'bytes=1-2-3', 'bytes=1000-', 'bytes=99999999999999999999-', 'bytes=9007199254740993-9007199254740999', 'bytes=٣-4', 'bytes=1 -2', 'items=0-1', '=0-1', 'bytes=0-1;x=y']) {
    const result = byteRange(input, size);
    assert.ok(result === 'invalid' || result === null, `${input} -> ${JSON.stringify(result)}`);
  }
  // end beyond the file is clamped, a suffix longer than the file is the whole file, leading zeros are plain numbers
  assert.deepEqual(byteRange('bytes=0-99999999999999999999', size), { start: 0, end: 999 });
  assert.deepEqual(byteRange('bytes=-99999999999999999999', size), { start: 0, end: 999 });
  assert.deepEqual(byteRange('bytes=0005-0007', size), { start: 5, end: 7 });
  assert.deepEqual(byteRange('bytes=999-', size), { start: 999, end: 999 });
  assert.equal(byteRange('bytes=0-1', 0), 'invalid');
  assert.equal(byteRange(null, size), null);
  assert.equal(byteRange('', size), null);
});

const bytes = Buffer.from('0123456789abcdefghij');
const asset = { bytes: bytes.length, mimeType: 'video/mp4', sha256: 'f'.repeat(64), storageKey: 'a'.repeat(32) + '.mp4', originalName: 'clip.mp4' };
const storage: StorageAdapter = {
  put: async () => { throw new Error('unused'); },
  get: async (_key, range) => Readable.from([range ? bytes.subarray(range.start, range.end + 1) : bytes]),
  delete: async () => undefined,
  exists: async () => true,
};
const respond = (headers: Record<string, string>, method = 'GET') => storedFileResponse(asset, new Request('http://localhost/file', { method, headers }), storage);

test('storedFileResponse: several ranges give 200 with the whole body, no Content-Range and a Content-Length of the file', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await respond({ Range: 'bytes=0-1,5-6' }, method);
    assert.equal(response.status, 200, method);
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    if (method === 'GET') assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
});

test('storedFileResponse: single ranges, suffix ranges and unsatisfiable ranges', async () => {
  const part = await respond({ Range: 'bytes=2-4' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 2-4/${bytes.length}`);
  assert.equal(part.headers.get('content-length'), '3');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(2, 5));
  const tail = await respond({ Range: 'bytes=-4' });
  assert.deepEqual(Buffer.from(await tail.arrayBuffer()), bytes.subarray(-4));
  const beyond = await respond({ Range: `bytes=${bytes.length}-` });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('content-range'), `bytes */${bytes.length}`);
  assert.equal(beyond.headers.get('content-length'), null);
});

test('storedFileResponse: If-Range honours only the exact strong ETag; a weak ETag or a date means the whole file', async () => {
  const etag = `"${asset.sha256}"`;
  assert.equal((await respond({ Range: 'bytes=0-1', 'If-Range': etag })).status, 206);
  for (const value of [`W/${etag}`, '"other"', 'Wed, 21 Oct 2015 07:28:00 GMT', etag.slice(1, -1), `${etag}, ${etag}`]) {
    const response = await respond({ Range: 'bytes=0-1', 'If-Range': value });
    assert.equal(response.status, 200, value);
    assert.equal(response.headers.get('content-range'), null, value);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, value);
  }
});

test('storedFileResponse headers: type from the stored record only, nosniff, inline name encoded, no cookies, revalidate', async () => {
  const hostile = { ...asset, mimeType: 'video/mp4', originalName: 'a"b\r\nSet-Cookie: x=1;‮.mp4' };
  const response = await storedFileResponse(hostile, new Request('http://localhost/file'), storage);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const disposition = response.headers.get('content-disposition') ?? '';
  assert.match(disposition, /^inline; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._-]*$/);
  assert.ok(!/[\r\n]/.test(disposition));
});
