/** Test helper: byte-exact ISO base media (MP4) files, so tests can build well-formed and hostile boxes. */
export const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
export const u64 = (n: bigint): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64BE(n); return b; };

/** A box with a 32-bit size. `size` overrides the real size (to lie about it). */
export const box = (type: string, payload: Buffer | string = Buffer.alloc(0), size?: number): Buffer => {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'latin1') : payload;
  return Buffer.concat([u32(size ?? 8 + body.length), Buffer.from(type, 'latin1'), body]);
};
/** A box with a 64-bit size field (size 1 plus the largesize). */
export const bigBox = (type: string, payload: Buffer, largesize?: bigint): Buffer =>
  Buffer.concat([u32(1), Buffer.from(type, 'latin1'), u64(largesize ?? BigInt(16 + payload.length)), payload]);

export const ftyp = (brand = 'isom'): Buffer => box('ftyp', Buffer.concat([Buffer.from(brand, 'latin1'), u32(512), Buffer.from('isomiso2mp41', 'latin1')]));
export const moov = (handler = 'vide'): Buffer => box('moov', Buffer.concat([Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(8)]));
export const mdat = (bytes = 64, fill = 7): Buffer => box('mdat', Buffer.alloc(bytes, fill));

/** A minimal file the validator accepts: ftyp (isom), a moov that names a video handler, a non-empty mdat. */
export const validMp4 = (mdatBytes = 64): Buffer => Buffer.concat([ftyp(), moov(), mdat(mdatBytes)]);
