/**
 * Pixel size of an uploaded image, read from its header (no decoding, no dependencies).
 *
 * Supports exactly the types the upload validator accepts: JPEG (any SOFn marker), PNG (IHDR) and WebP (VP8, VP8L and
 * VP8X). The input is untrusted: every read is bounds-checked, every loop advances, and anything that is truncated or
 * does not look like the named type returns null instead of throwing.
 */
export interface ImageSize { width: number; height: number }

const u16be = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number): number => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number): number => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

const ascii = (b: Uint8Array, i: number, text: string): boolean => {
  if (i < 0 || i + text.length > b.length) return false;
  for (let k = 0; k < text.length; k += 1) if (b[i + k] !== text.charCodeAt(k)) return false;
  return true;
};

const size = (width: number, height: number): ImageSize | null => (width >= 1 && height >= 1 ? { width, height } : null);

/** SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC), which share the range but are not frame headers. */
const isSof = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  // Every iteration moves `i` forward by at least one byte, so the loop ends for any input.
  while (i < b.length) {
    if (b[i] !== 0xff) { // padding between segments is tolerated, as decoders do
      i += 1;
      continue;
    }
    while (i < b.length && b[i] === 0xff) i += 1; // fill bytes before the marker code
    if (i >= b.length) return null;
    const marker = b[i];
    i += 1;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue; // markers without a length
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or start of scan reached without a frame header
    if (i + 2 > b.length) return null;
    const length = u16be(b, i);
    if (length < 2 || i + length > b.length) return null;
    if (isSof(marker)) {
      // length(2) precision(1) height(2) width(2) components(1)
      if (length < 8) return null;
      return size(u16be(b, i + 5), u16be(b, i + 3));
    }
    i += length;
  }
  return null;
}

function pngSize(b: Uint8Array): ImageSize | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !signature.every((byte, k) => b[k] === byte)) return null;
  if (u32be(b, 8) !== 13 || !ascii(b, 12, 'IHDR')) return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  // The PNG specification limits both to 2^31 - 1.
  return width > 0x7fffffff || height > 0x7fffffff ? null : size(width, height);
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 20 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null;
  if (ascii(b, 12, 'VP8 ')) {
    // Lossy: 3-byte frame tag, start code 9D 01 2A, then 14-bit width and height (little endian).
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return size((b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
  }
  if (ascii(b, 12, 'VP8L')) {
    // Lossless: signature byte 0x2F, then 14-bit (width - 1) and 14-bit (height - 1).
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (ascii(b, 12, 'VP8X')) {
    // Extended: flags(1) reserved(3), then 24-bit (canvas width - 1) and (canvas height - 1).
    if (b.length < 30) return null;
    return size(u24le(b, 24) + 1, u24le(b, 27) + 1);
  }
  return null;
}

/** Width and height in pixels, or null when the bytes are not a readable image of the given type. Never throws. */
export function readImageSize(bytes: Uint8Array, mimeType: string): ImageSize | null {
  try {
    switch (mimeType.toLowerCase()) {
      case 'image/jpeg': return jpegSize(bytes);
      case 'image/png': return pngSize(bytes);
      case 'image/webp': return webpSize(bytes);
      default: return null;
    }
  } catch {
    return null;
  }
}
