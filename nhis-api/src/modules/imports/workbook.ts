import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { invalid } from '../../common/admin';

export const modules = ['hospitals', 'contacts', 'documents', 'announcements', 'partners'] as const;
export type ImportModule = typeof modules[number];
export const limit = (name: string, fallback: number, max: number) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 && n <= max ? n : fallback; };
export const importLimits = () => ({ bytes: limit('ADMIN_IMPORT_MAX_BYTES', 2_000_000, 5_000_000), rows: limit('ADMIN_IMPORT_MAX_ROWS', 500, 2000), batch: 10 });
export const columns: Record<ImportModule, string[]> = {
  hospitals: ['id', 'nameEn', 'nameTa', 'addressEn', 'addressTa', 'districtEn', 'districtTa', 'stateEn', 'stateTa', 'postcode', 'category', 'type', 'specialty', 'contact', 'mapUrl'],
  contacts: ['id', 'directoryId', 'sortOrder'],
  documents: ['id', 'category', 'audience', 'sortOrder', 'labelEn', 'labelTa', 'titleEn', 'titleTa', 'dateLabelEn', 'dateLabelTa', 'assetId', 'language', 'availabilityNote'],
  announcements: ['id', 'kind', 'severity', 'messageEn', 'messageTa', 'startsAt', 'endsAt', 'sortOrder'],
  partners: ['id', 'categoryId', 'nameEn', 'nameTa', 'logoAssetId', 'altEn', 'altTa', 'url', 'visible', 'sortOrder'],
};
export const required: Record<ImportModule, string[]> = {
  hospitals: ['nameEn', 'addressEn', 'districtEn'], contacts: ['directoryId'],
  documents: ['category', 'audience', 'labelEn', 'titleEn', 'sortOrder'], announcements: ['kind', 'severity', 'messageEn'],
  partners: ['id', 'categoryId', 'nameEn', 'logoAssetId', 'altEn'],
};

const LIMIT_MESSAGE = 'Workbook exceeds the row, column or structure limit.';

/** Number of start tags `<name` (followed by a space, `>`, `/` or a line break) in a text, without allocating. */
function countTags(text: string, name: string): number {
  const needle = `<${name}`;
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    const next = text.charCodeAt(at + needle.length);
    if (next === 32 || next === 62 || next === 47 || next === 9 || next === 10 || next === 13) count++;
  }
  return count;
}

/** Number of `<` characters, i.e. of tags of any kind. */
function countMarkup(text: string): number {
  let count = 0;
  for (let at = text.indexOf('<'); at !== -1; at = text.indexOf('<', at + 1)) count++;
  return count;
}

export interface ArchiveLimits { rows: number; columns: number }

/**
 * The longest start tag of a row that is looked at: a real one ("<row r="2" spans="1:15" ht="15.75" customHeight="1"
 * x14ac:dyDescent="0.25">") is a few hundred characters. The window is what keeps the scan linear: looking for the closing ">"
 * in the rest of the part for every "<row" would cost (tags x size) for a part that is full of tags that never close.
 */
const MAX_ROW_START_TAG = 2048;

/**
 * Markup (number of "<") that any part other than a worksheet may have at least (it is raised to the size of a full worksheet
 * when the configured limits are larger). The generated templates and the workbooks of
 * Excel and LibreOffice stay in the low thousands (a theme has about a thousand tags); a part above this only costs the
 * spreadsheet parser time and memory (measured: 2 million elements in a 9.6 KB docProps part took 0.8 s and 130 MB).
 */
const MAX_PART_MARKUP = 250_000;

/**
 * Structural limits checked on the XML text of the workbook parts, BEFORE the spreadsheet library builds objects for
 * every row, cell, string and style: a 1 MB archive of 10 MB of XML would otherwise cost seconds of CPU and hundreds
 * of MB of memory before the row limit is looked at. Generous for real workbooks (a worksheet is at most
 * max(rows + 1, 100) rows and 8 tags per cell), tiny compared with what a flood needs. Every check is linear in the size of the part.
 */
function structureWithinLimits(name: string, xml: string, limits: ArchiveLimits): boolean {
  const maxRows = Math.max(limits.rows + 1, 100);
  const maxCells = maxRows * Math.max(limits.columns, 4);
  if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
    if (countTags(xml, 'row') > maxRows || countTags(xml, 'c') > maxCells || countMarkup(xml) > maxCells * 8 + 10_000) return false;
    // A sparse sheet: a single row far below the limit makes the library allocate every row in between.
    for (let at = xml.indexOf('<row'); at !== -1; at = xml.indexOf('<row', at + 4)) {
      const end = xml.slice(at, at + MAX_ROW_START_TAG).indexOf('>');
      if (end === -1) return false;
      const number = /\sr=["'](\d{1,9})["']/.exec(xml.slice(at, at + end));
      if (number && Number(number[1]) > maxRows) return false;
    }
    return true;
  }
  // At least what a worksheet of the configured size may have: the shared strings of a full sheet are one entry per cell.
  if (countMarkup(xml) > Math.max(MAX_PART_MARKUP, maxCells * 8 + 10_000)) return false;
  if (/^xl\/sharedStrings\.xml$/i.test(name)) return countTags(xml, 'si') <= maxCells + 1000;
  if (/^xl\/styles\.xml$/i.test(name)) return countTags(xml, 'xf') <= 50_000;
  return true;
}

const MAX_ENTRIES = 256;
const MAX_EXPANDED_BYTES = 20_000_000;
const MAX_ENTRY_BYTES = 10_000_000;
const MAX_NAME_LENGTH = 255;
const NOT_A_WORKBOOK = 'Not a valid .xlsx ZIP workbook.';
const UNSUPPORTED_STRUCTURE = 'Unsupported or oversized workbook structure.';
/** Part names a workbook never contains: macros, external payloads, embedded objects and binary blobs. */
const FORBIDDEN_PART = /vba|macro|externalLinks|embeddings|activeX|\.bin$/i;

/** One checked part of the archive: the name as the central directory gives it and its fully inflated bytes. */
export interface ArchivePart { name: string; data: Buffer }

/**
 * The names of a workbook are plain printable ASCII paths ("xl/worksheets/sheet1.xml", "[Content_Types].xml"): no
 * backslashes, drive letters, NUL or other control characters, no empty, "." or ".." segments, no leading slash.
 */
function safePartName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_NAME_LENGTH || !/^[\x20-\x7e]+$/.test(name) || name.includes('\\') || name.includes(':')) return false;
  const segments = name.split('/');
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * The end-of-central-directory record must be the last 22 bytes of the file (no archive comment, nothing appended), the
 * archive must be a single-disk, non-ZIP64 one, and the central directory must be exactly the declared number of
 * records that end exactly where that record starts. Anything else is an archive that two readers can interpret
 * differently (bytes in front of it, a second directory behind the first, an entry count that disagrees), which is how a
 * check on one reader is bypassed by the other. Real workbooks (Excel, LibreOffice, ExcelJS) always have this shape.
 */
function checkDirectoryStructure(bytes: Buffer): void {
  const record = bytes.length - 22;
  if (record < 0 || bytes.readUInt32LE(record) !== 0x06054b50) throw invalid(NOT_A_WORKBOOK);
  const disk = bytes.readUInt16LE(record + 4);
  const directoryDisk = bytes.readUInt16LE(record + 6);
  const countHere = bytes.readUInt16LE(record + 8);
  const count = bytes.readUInt16LE(record + 10);
  const size = bytes.readUInt32LE(record + 12);
  const offset = bytes.readUInt32LE(record + 16);
  const commentLength = bytes.readUInt16LE(record + 20);
  const zip64 = count === 0xffff || countHere === 0xffff || size === 0xffffffff || offset === 0xffffffff;
  if (disk !== 0 || directoryDisk !== 0 || countHere !== count || commentLength !== 0 || zip64 || count === 0) throw invalid(NOT_A_WORKBOOK);
  if (count > MAX_ENTRIES) throw invalid(UNSUPPORTED_STRUCTURE);
  if (offset + size !== record) throw invalid(NOT_A_WORKBOOK);
  let position = offset;
  for (let index = 0; index < count; index++) {
    if (position + 46 > record || bytes.readUInt32LE(position) !== 0x02014b50) throw invalid(NOT_A_WORKBOOK);
    position += 46 + bytes.readUInt16LE(position + 28) + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
  }
  if (position !== record) throw invalid(NOT_A_WORKBOOK);
}

/**
 * Inspects the ZIP before any spreadsheet parsing and returns the checked parts: bounded expansion (every entry is
 * inflated here, against its declared size, never beyond the limits), bounded structure, no macros, encryption, embedded
 * files, external relationships, DOCTYPE or entities, duplicate or unsafe names.
 */
export async function readArchive(bytes: Buffer, limits: ArchiveLimits = { rows: importLimits().rows, columns: 60 }): Promise<ArchivePart[]> {
  checkDirectoryStructure(bytes);
  return new Promise<ArchivePart[]>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return reject(invalid(NOT_A_WORKBOOK));
      let expanded = 0;
      let finished = false;
      const names = new Set<string>();
      const parts: ArchivePart[] = [];
      const fail = (message = UNSUPPORTED_STRUCTURE) => {
        if (finished) return;
        finished = true;
        zip.close();
        reject(invalid(message));
      };
      zip.on('error', () => fail());
      zip.on('entry', (entry: yauzl.Entry) => {
        if (finished) return;
        const directory = entry.fileName.endsWith('/');
        const name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
        expanded += entry.uncompressedSize;
        // 0x1 encrypted, 0x40 strong encryption, 0x2000 masked local headers.
        const flagged = (entry.generalPurposeBitFlag & 0x2041) !== 0;
        if (names.size >= MAX_ENTRIES || expanded > MAX_EXPANDED_BYTES || entry.uncompressedSize > MAX_ENTRY_BYTES || flagged
          || names.has(name) || !safePartName(name) || FORBIDDEN_PART.test(name) || (directory && entry.uncompressedSize !== 0)) return fail();
        names.add(name);
        // Consume each stream so the declared sizes are checked against the actual decompression.
        zip.openReadStream(entry, (streamError, stream) => {
          if (finished) return;
          if (streamError || !stream) return fail();
          let actual = 0;
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            actual += chunk.length;
            if (actual > entry.uncompressedSize || actual > MAX_ENTRY_BYTES) { stream.destroy(); fail(); } else chunks.push(chunk);
          });
          stream.on('error', () => fail());
          stream.on('end', () => {
            if (finished) return;
            const data = Buffer.concat(chunks);
            const xml = /\.(xml|rels)$/i.test(name) ? data.toString('utf8') : '';
            if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(xml) || (name === '[Content_Types].xml' && /macroEnabled/i.test(xml))) return fail();
            if (!structureWithinLimits(name, xml, limits)) return fail(LIMIT_MESSAGE);
            if (!directory) parts.push({ name, data });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        if (finished) return;
        finished = true;
        if (names.has('[Content_Types].xml') && names.has('xl/workbook.xml')) resolve(parts); else reject(invalid('Missing Excel workbook structure.'));
      });
      zip.readEntry();
    });
  });
}

/** Inspect the archive (see readArchive) without keeping its parts. */
export async function checkArchive(bytes: Buffer, limits: ArchiveLimits = { rows: importLimits().rows, columns: 60 }): Promise<void> {
  await readArchive(bytes, limits);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A clean, uncompressed, single-disk archive made of the checked parts only. The spreadsheet library reads THIS archive,
 * never the uploaded bytes, so what was inspected is exactly what is loaded, whatever tricks the upload played with its
 * directory, offsets, compression or surrounding bytes.
 */
export function packArchive(parts: ArchivePart[]): Buffer {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of parts) {
    const nameBytes = Buffer.from(name, 'latin1');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

export interface WorkbookRow { row: number; cells: Record<string, string>; errors: { field: string; message: string }[] }
export async function readWorkbook(bytes: Buffer, headers: string[]): Promise<WorkbookRow[]> {
  if (bytes.length > importLimits().bytes) throw invalid('Workbook exceeds the file-size limit.');
  // The library never sees the uploaded bytes: it loads the canonical archive built from exactly the entries that were checked.
  const parts = await readArchive(bytes, { rows: importLimits().rows, columns: headers.length });
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(packArchive(parts) as unknown as ExcelJS.Buffer); } catch { throw invalid('Cannot read the Excel workbook.'); }
  const sheet = book.getWorksheet('Records');
  if (!sheet || book.worksheets.some(s => !['Records', 'Instructions'].includes(s.name))) throw invalid('Use the downloaded template with a Records sheet.');
  if (sheet.rowCount > importLimits().rows + 1 || sheet.columnCount > headers.length) throw invalid(LIMIT_MESSAGE);
  if (headers.some((h, i) => sheet.getRow(1).getCell(i + 1).value !== h)) throw invalid(`Column names/order must exactly match: ${headers.join(', ')}`);
  const rows: WorkbookRow[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const cells: Record<string, string> = {}; const errors: WorkbookRow['errors'] = [];
    headers.forEach((h, i) => {
      const v = row.getCell(i + 1).value;
      if (v == null) cells[h] = '';
      else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') cells[h] = String(v).trim();
      else { cells[h] = ''; errors.push({ field: h, message: 'Use plain text or numbers; formulas, dates, rich cells and hyperlinks are unsupported. Use ISO dates as text.' }); }
      if (cells[h].length > 5000) errors.push({ field: h, message: 'Cell exceeds 5000 characters.' });
    });
    if (Object.values(cells).some(Boolean) || errors.length) rows.push({ row: number, cells, errors });
  });
  if (!rows.length) throw invalid('The workbook has no records.');
  return rows;
}

export async function template(module: ImportModule, headers = columns[module]): Promise<Buffer> {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Records');
  sheet.columns = headers.map(h => ({ header: h, key: h, width: 24, style: { numFmt: '@' } }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.getRow(1).font = { bold: true };
  const info = book.addWorksheet('Instructions');
  const notes = [
    ['Field', 'Requirement / format'],
    ['Import', module], ['Required on create', required[module].join(', ')],
    ['id', 'Updates match exact stable record ID only; names are never used. Create: blank generates ID except partners (required).'],
    ['Blank cells', 'Updates preserve existing values. Use #CLEAR to clear an optional field. Missing rows never delete records.'],
    ['Publishing', 'Imports save drafts only. Review and explicitly publish using the existing editor.'],
    ['Limits', `${importLimits().bytes} bytes; ${importLimits().rows} rows; partners max 40 total.`],
    ['Dates', 'Plain text ISO 8601 including timezone, e.g. 2026-10-15T09:00:00+05:30; format cells as Text.'],
    ['Files', 'Existing uploaded asset IDs only. Upload PDFs/logos separately. No local paths or URL downloads.'],
    ['sortOrder', 'Integer >= 0. Partners: resulting absolute position (0 based); existing entries are kept.'],
    ['visible', 'true or false'], ['language', 'en or ta'], ['audience', 'employee, pensioner, all'],
    ['category (documents)', 'govt-order-employee, govt-order-pensioner, policy-non-payable, enrolment-guide, enrolment-form, hospital-suspension'],
    ['kind / severity', 'general, suspension, login-support / notice, warning'],
    ['Announcements', 'messageEn/messageTa are plain text; editing either replaces that language’s rich message with one text node. Blank preserves it.'],
    ['Contacts', 'Download a template for a selected directory. cell.<key> columns follow that directory schema; at least one cell is required.'],
    ['Partners categoryId', 'Use an existing category ID shown in the Partners form. Logo ID must identify an uploaded IMAGE.'],
    ['Retry', 'Confirm creates a persistent job. Continue batches or reopen history. Retries do not duplicate committed rows. Fix failed rows in a new workbook.'],
  ];
  notes.forEach(r => info.addRow(r)); info.columns = [{ width: 30 }, { width: 115 }]; info.getColumn(2).alignment = { wrapText: true };
  return Buffer.from(await book.xlsx.writeBuffer());
}
