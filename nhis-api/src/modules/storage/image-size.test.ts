import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE_CONTENT, mapSiteImages, SITE_CONTENT_KEYS, type SiteContentKey } from '@nhis/shared-types';
import { repoRoot } from '../../test/helpers';
import { readImageSize } from './image-size';

/* ------------------------------------------------------------------ hand-built images */

const bytes = (...parts: Array<number | number[] | Uint8Array>): Uint8Array => Uint8Array.from(parts.flatMap((p) => (typeof p === 'number' ? [p] : Array.from(p))));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const segment = (marker: number, payload: number[]) => [0xff, marker, ...be16(payload.length + 2), ...payload];
/** SOI, a JFIF header, a quantisation table, the frame header, then a scan header (the image data itself is not needed). */
function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  return bytes(
    0xff, 0xd8,
    segment(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    segment(0xdb, [0, ...new Array<number>(64).fill(16)]),
    segment(sof, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    segment(0xc4, [0x00, ...new Array<number>(16).fill(0)]),
    segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    0x12, 0x34, 0xff, 0xd9,
  );
}

function png(width: number, height: number): Uint8Array {
  return bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, be32(13), text('IHDR'), be32(width), be32(height), 8, 6, 0, 0, 0, be32(0));
}

const riff = (chunk: string, data: number[]) => bytes(text('RIFF'), le32(4 + 8 + data.length), text('WEBP'), text(chunk), le32(data.length), data);
const webpLossy = (w: number, h: number) => riff('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), 0, 0, 0, 0]);
const webpLossless = (w: number, h: number) => riff('VP8L', [0x2f, ...le32((w - 1) | ((h - 1) << 14)), 0, 0, 0, 0]);
const webpExtended = (w: number, h: number) => riff('VP8X', [0x10, 0, 0, 0, ...le24(w - 1), ...le24(h - 1), 0, 0, 0, 0]);

const size = (width: number, height: number) => ({ width, height });

/* ------------------------------------------------------------------ JPEG */

describe('readImageSize: JPEG', () => {
  test('reads the frame header after other segments', () => {
    assert.deepEqual(readImageSize(jpeg(640, 480), 'image/jpeg'), size(640, 480));
    assert.deepEqual(readImageSize(jpeg(1, 1), 'image/jpeg'), size(1, 1));
    assert.deepEqual(readImageSize(jpeg(65535, 65535), 'image/jpeg'), size(65535, 65535));
  });

  test('accepts every frame type (baseline, extended, progressive, lossless, arithmetic) but not DHT, JPG or DAC markers', () => {
    for (const sof of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      assert.deepEqual(readImageSize(jpeg(300, 200, sof), 'image/jpeg'), size(300, 200), `SOF marker ${sof.toString(16)}`);
    }
    for (const notFrame of [0xc4, 0xc8, 0xcc]) {
      assert.equal(readImageSize(jpeg(300, 200, notFrame), 'image/jpeg'), null, `marker ${notFrame.toString(16)} is not a frame header`);
    }
  });

  test('tolerates fill bytes and padding between segments', () => {
    const plain = Array.from(jpeg(321, 123));
    const withFill = [...plain.slice(0, 2), 0xff, 0xff, 0xff, ...plain.slice(2)];
    assert.deepEqual(readImageSize(bytes(withFill), 'image/jpeg'), size(321, 123));
    const withPadding = [...plain.slice(0, 2), 0x00, 0x00, ...plain.slice(2)];
    assert.deepEqual(readImageSize(bytes(withPadding), 'image/jpeg'), size(321, 123));
  });

  test('a scan or the end of the image before any frame header gives null', () => {
    assert.equal(readImageSize(bytes(0xff, 0xd8, segment(0xda, [0, 0]), 0xff, 0xd9), 'image/jpeg'), null);
    assert.equal(readImageSize(bytes(0xff, 0xd8, 0xff, 0xd9), 'image/jpeg'), null);
  });

  test('zero dimensions, short frame headers and overlong segments give null', () => {
    assert.equal(readImageSize(jpeg(0, 10), 'image/jpeg'), null);
    assert.equal(readImageSize(jpeg(10, 0), 'image/jpeg'), null);
    assert.equal(readImageSize(bytes(0xff, 0xd8, segment(0xc0, [8, 0, 1])), 'image/jpeg'), null);
    assert.equal(readImageSize(bytes(0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2, 3), 'image/jpeg'), null);
    assert.equal(readImageSize(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00), 'image/jpeg'), null, 'length below 2');
    assert.equal(readImageSize(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xc0), 'image/jpeg'), null);
  });
});

/* ------------------------------------------------------------------ PNG */

describe('readImageSize: PNG', () => {
  test('reads IHDR', () => {
    assert.deepEqual(readImageSize(png(794, 862), 'image/png'), size(794, 862));
    assert.deepEqual(readImageSize(png(1, 1), 'image/png'), size(1, 1));
    assert.deepEqual(readImageSize(png(0x7fffffff, 2), 'image/png'), size(0x7fffffff, 2));
  });

  test('rejects zero, oversized, wrongly typed and wrongly sized headers', () => {
    assert.equal(readImageSize(png(0, 5), 'image/png'), null);
    assert.equal(readImageSize(png(5, 0), 'image/png'), null);
    assert.equal(readImageSize(png(0x80000000, 5), 'image/png'), null);
    const notIhdr = Array.from(png(10, 10));
    notIhdr.splice(12, 4, ...text('IDAT'));
    assert.equal(readImageSize(bytes(notIhdr), 'image/png'), null);
    const wrongLength = Array.from(png(10, 10));
    wrongLength.splice(8, 4, ...be32(12));
    assert.equal(readImageSize(bytes(wrongLength), 'image/png'), null);
    const badSignature = Array.from(png(10, 10));
    badSignature[1] = 0x51;
    assert.equal(readImageSize(bytes(badSignature), 'image/png'), null);
  });
});

/* ------------------------------------------------------------------ WebP */

describe('readImageSize: WebP', () => {
  test('lossy (VP8)', () => {
    assert.deepEqual(readImageSize(webpLossy(1600, 900), 'image/webp'), size(1600, 900));
    // The two top bits of each field are scaling hints and are not part of the size.
    assert.deepEqual(readImageSize(webpLossy(0x4000 | 321, 0x8000 | 123), 'image/webp'), size(321, 123));
  });

  test('lossless (VP8L)', () => {
    assert.deepEqual(readImageSize(webpLossless(1, 1), 'image/webp'), size(1, 1));
    assert.deepEqual(readImageSize(webpLossless(2000, 600), 'image/webp'), size(2000, 600));
    assert.deepEqual(readImageSize(webpLossless(16384, 16384), 'image/webp'), size(16384, 16384));
  });

  test('extended (VP8X) canvas size', () => {
    assert.deepEqual(readImageSize(webpExtended(1, 1), 'image/webp'), size(1, 1));
    assert.deepEqual(readImageSize(webpExtended(4096, 3000), 'image/webp'), size(4096, 3000));
    assert.deepEqual(readImageSize(webpExtended(0x1000000, 7), 'image/webp'), size(0x1000000, 7));
  });

  test('rejects a missing or wrong signature, start code and unknown chunk', () => {
    const lossy = Array.from(webpLossy(10, 10));
    assert.equal(readImageSize(bytes(lossy.slice(0, 11), 0x58, lossy.slice(12)), 'image/webp'), null, 'not WEBP');
    const startCode = [...lossy];
    startCode[23] = 0;
    assert.equal(readImageSize(bytes(startCode), 'image/webp'), null);
    const lossless = Array.from(webpLossless(10, 10));
    lossless[20] = 0x2e;
    assert.equal(readImageSize(bytes(lossless), 'image/webp'), null);
    assert.equal(readImageSize(riff('ALPH', new Array<number>(20).fill(0)), 'image/webp'), null);
  });
});

/* ------------------------------------------------------------------ hostile input */

describe('readImageSize: malformed input', () => {
  const samples: Array<[string, Uint8Array, string]> = [
    ['jpeg', jpeg(640, 480), 'image/jpeg'],
    ['png', png(640, 480), 'image/png'],
    ['webp lossy', webpLossy(640, 480), 'image/webp'],
    ['webp lossless', webpLossless(640, 480), 'image/webp'],
    ['webp extended', webpExtended(640, 480), 'image/webp'],
  ];

  test('every truncation of a valid image gives null or the true size, never an error or a wrong size', () => {
    for (const [name, data, mime] of samples) {
      const expected = readImageSize(data, mime);
      assert.deepEqual(expected, size(640, 480), name);
      for (let length = 0; length < data.length; length += 1) {
        const got = readImageSize(data.subarray(0, length), mime);
        assert.ok(got === null || (got.width === 640 && got.height === 480), `${name} cut at ${length}`);
      }
    }
  });

  test('empty input, a type mismatch and an unknown type give null', () => {
    assert.equal(readImageSize(new Uint8Array(0), 'image/jpeg'), null);
    assert.equal(readImageSize(new Uint8Array(0), 'image/png'), null);
    assert.equal(readImageSize(new Uint8Array(0), 'image/webp'), null);
    assert.equal(readImageSize(png(10, 10), 'image/jpeg'), null);
    assert.equal(readImageSize(jpeg(10, 10), 'image/webp'), null);
    assert.equal(readImageSize(webpLossy(10, 10), 'image/png'), null);
    assert.equal(readImageSize(png(10, 10), 'image/gif'), null);
    assert.equal(readImageSize(png(10, 10), ''), null);
    assert.equal(readImageSize(png(10, 10), 'IMAGE/PNG')?.width, 10, 'the type name is case-insensitive');
  });

  test('random bytes and bit-flipped images neither throw nor hang', () => {
    let seed = 0x2545f491;
    const next = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed;
    };
    const started = Date.now();
    for (let round = 0; round < 3000; round += 1) {
      const [, data, mime] = samples[round % samples.length];
      const copy = Uint8Array.from(data);
      for (let flips = 0; flips < 1 + (round % 5); flips += 1) copy[next() % copy.length] = next() & 0xff;
      const noise = new Uint8Array(next() % 200);
      for (let i = 0; i < noise.length; i += 1) noise[i] = next() & 0xff;
      for (const input of [copy, noise]) {
        const got = readImageSize(input, mime);
        assert.ok(got === null || (Number.isInteger(got.width) && Number.isInteger(got.height) && got.width >= 1 && got.height >= 1));
      }
    }
    assert.ok(Date.now() - started < 5000, 'fuzzing finished quickly');
  });

  test('a long run of fill bytes or padding is handled in linear time', () => {
    const fill = bytes(0xff, 0xd8, new Array<number>(2_000_000).fill(0xff));
    const padding = bytes(0xff, 0xd8, new Array<number>(2_000_000).fill(0x00));
    const started = Date.now();
    assert.equal(readImageSize(fill, 'image/jpeg'), null);
    assert.equal(readImageSize(padding, 'image/jpeg'), null);
    assert.ok(Date.now() - started < 2000);
  });
});

/* ------------------------------------------------------------------ real files */

describe('readImageSize: files shipped with the Client', () => {
  const assets = path.join(repoRoot(), 'nhis-client', 'public', 'assets');
  const mimeOf = (file: string) => (file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

  test('every built-in image of the default site content has the pixel size recorded in the content', () => {
    const found = new Map<string, { width: number | null; height: number | null }>();
    for (const key of SITE_CONTENT_KEYS as readonly SiteContentKey[]) {
      mapSiteImages(key, structuredClone(DEFAULT_SITE_CONTENT[key]) as never, (image) => {
        if (image.builtIn) found.set(image.builtIn, { width: image.width, height: image.height });
        return image;
      });
    }
    assert.ok(found.size >= 6, 'the defaults use the emblem, the portrait and the partner logos');
    for (const [builtIn, expected] of found) {
      const data = fs.readFileSync(path.join(repoRoot(), 'nhis-client', 'public', builtIn));
      assert.deepEqual(readImageSize(data, mimeOf(builtIn)), { width: expected.width, height: expected.height }, builtIn);
    }
  });

  test('known sizes', () => {
    const expected: Record<string, [number, number]> = {
      'tn-government-emblem.png': [794, 862],
      'hitpa-logo.png': [1469, 1071],
      'medi-assist-logo.png': [1600, 629],
      'vidal-health-logo.png': [2000, 600],
      'united-india-insurance-logo.png': [1012, 763],
      'header-portrait.jpg': [960, 1200],
    };
    for (const [file, [width, height]] of Object.entries(expected)) {
      assert.deepEqual(readImageSize(fs.readFileSync(path.join(assets, file)), mimeOf(file)), size(width, height), file);
    }
  });

  test('every image file in the assets folder is readable', () => {
    const files = fs.readdirSync(assets).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    assert.ok(files.length > 0);
    for (const file of files) assert.ok(readImageSize(fs.readFileSync(path.join(assets, file)), mimeOf(file)), file);
  });
});
