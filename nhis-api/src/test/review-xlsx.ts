import zlib from 'node:zlib';

/** Test helper: builds ZIP / XLSX archives byte by byte, so tests can lie about sizes, add hostile names and so on. */
export interface ZipEntry { name: string; data: Buffer | string; /** Declared uncompressed size override (lie). */ declaredSize?: number; encrypted?: boolean; stored?: boolean }

/** Local file records and central directory records of `entries`; local header offsets are `base` plus the position among the locals. */
export function zipParts(entries: ZipEntry[], base = 0): { locals: Buffer; central: Buffer; count: number } {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = base;
  for (const entry of entries) {
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const body = entry.stored ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const method = entry.stored ? 0 : 8;
    const name = Buffer.from(entry.name, 'utf8');
    const crc = zlib.crc32(raw);
    const flags = (entry.encrypted ? 1 : 0) | 0x800;
    const usize = entry.declaredSize ?? raw.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(usize, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(usize, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  return { locals: Buffer.concat(locals), central: Buffer.concat(centrals), count: entries.length };
}

export function endOfCentralDirectory(count: number, centralSize: number, centralOffset: number, comment = Buffer.alloc(0)): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(centralOffset, 16); end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([end, comment]);
}

export function makeZip(entries: ZipEntry[]): Buffer {
  const { locals, central, count } = zipParts(entries);
  return Buffer.concat([locals, central, endOfCentralDirectory(count, central.length, locals.length)]);
}

/**
 * An archive that two readers see differently. The end-of-central-directory record points at the central directory of
 * `benign` (what a strict reader such as yauzl follows); the record also claims the size of the hostile central directory
 * that sits right in front of it, so a reader that tolerates "extra bytes" (JSZip, used by ExcelJS) moves its origin and
 * reads `hostile` instead. Layout: benign locals, hostile locals, benign central directory, hostile central directory, record.
 */
export function makeDifferentialZip(benign: ZipEntry[], hostile: ZipEntry[]): Buffer {
  const good = zipParts(benign);
  const hostileProbe = zipParts(hostile, 0);
  const benignCentralSize = good.central.length;
  const hostileLocalsStart = good.locals.length;
  // a tolerant reader's origin is (start of the hostile central directory) - (central directory offset) = size of the benign central directory
  const hostileParts = zipParts(hostile, hostileLocalsStart - benignCentralSize);
  assertSame(hostileParts.locals.length, hostileProbe.locals.length);
  const centralOffset = good.locals.length + hostileParts.locals.length;
  return Buffer.concat([good.locals, hostileParts.locals, good.central, hostileParts.central, endOfCentralDirectory(hostile.length, hostileParts.central.length, centralOffset)]);
}
function assertSame(a: number, b: number): void { if (a !== b) throw new Error('zip layout mismatch'); }

export const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
export const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
export const WORKBOOK = (sheetName = 'Records') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
export const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';

const columnName = (n: number) => String.fromCharCode(65 + n);
/** Inline-string worksheet XML for `rows` (array of cell arrays). */
export function sheetXml(rows: string[][]): string {
  const body = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** A complete minimal workbook around a worksheet XML string. */
export function makeXlsx(sheet: string, extra: ZipEntry[] = [], options: { sheetName?: string; contentTypes?: string } = {}): Buffer {
  return makeZip([
    { name: '[Content_Types].xml', data: options.contentTypes ?? CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'xl/workbook.xml', data: WORKBOOK(options.sheetName) },
    { name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    ...extra,
  ]);
}
