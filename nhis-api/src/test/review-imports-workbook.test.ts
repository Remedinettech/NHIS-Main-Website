import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import ExcelJS from 'exceljs';
import { AdminHttpError } from '../common/admin/errors';
import { checkArchive, columns, readWorkbook } from '../modules/imports/workbook';
import { CONTENT_TYPES, makeXlsx, makeZip, sheetXml } from './review-xlsx';

/**
 * Independent review of the Excel workbook reader: hostile archives, formulas, limits that must hold BEFORE the heavy
 * parse, and Tamil text. No database needed.
 */

const headers = columns.hospitals;
const headerRow = [...headers];
const goodRow = (id: string) => [id, 'Hospital', 'மருத்துவமனை', 'Address', '', 'Chennai', '', '', '', '', '', '', '', ''].slice(0, headers.length);
const sheetWith = (rows: string[][]) => sheetXml([headerRow, ...rows]);
const wrap = (body: string) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
const headerCells = `<row r="1">${headers.map((h, i) => `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>${h}</t></is></c>`).join('')}</row>`;

async function rejection(bytes: Buffer, expected = /./): Promise<AdminHttpError> {
  try {
    await readWorkbook(bytes, headers);
  } catch (error) {
    assert.ok(error instanceof AdminHttpError, `expected an AdminHttpError (400), got ${String(error)}`);
    assert.equal(error.status, 400);
    assert.match(error.message, expected);
    return error;
  }
  assert.fail('the workbook should have been rejected');
}

test('baseline: a hand-built workbook is read, Tamil text survives byte for byte', async () => {
  const rows = await readWorkbook(makeXlsx(sheetWith([goodRow('h1')])), headers);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells.nameTa, 'மருத்துவமனை');
  assert.equal(Buffer.from(rows[0].cells.nameTa).toString('hex'), Buffer.from('மருத்துவமனை').toString('hex'));
});

test('Tamil with combining and composed vowel signs is not normalised by the reader', async () => {
  const decomposed = 'கொ'; // KA + VOWEL SIGN E + VOWEL SIGN AA (NFC would compose it to KA + O)
  const composed = 'கொ'; // KA + VOWEL SIGN O
  const row = goodRow('tamil');
  row[2] = `${decomposed}${composed}`;
  const rows = await readWorkbook(makeXlsx(sheetWith([row])), headers);
  assert.equal(rows[0].cells.nameTa, `${decomposed}${composed}`);
});

test('not a workbook: wrong bytes with an .xlsx name, empty buffer, truncated zip, plain zip without workbook parts', async () => {
  await rejection(Buffer.from('MZ not a zip at all'));
  await rejection(Buffer.alloc(0));
  const good = makeXlsx(sheetWith([goodRow('x')]));
  await rejection(good.subarray(0, good.length - 30));
  await rejection(makeZip([{ name: 'readme.txt', data: 'hello' }]));
  await rejection(Buffer.from(JSON.stringify({ a: 1 })));
});

test('hostile zip structure is refused before any XML is parsed', async () => {
  const sheet = sheetWith([goodRow('x')]);
  // zip slip / absolute names, macros, external payloads, embedded files, encrypted entries, duplicate names
  for (const name of ['../evil.xml', '/etc/passwd', 'xl/vbaProject.bin', 'xl/embeddings/oleObject1.bin', 'xl/externalLinks/externalLink1.xml', 'xl/activeX/activeX1.xml', 'xl/macrosheets/sheet1.xml', 'xl/payload.bin']) {
    await rejection(makeXlsx(sheet, [{ name, data: '<x/>' }]));
  }
  await rejection(makeXlsx(sheet, [{ name: 'docProps/core.xml', data: '<x/>', encrypted: true }]));
  await rejection(makeXlsx(sheet, [{ name: 'xl/workbook.xml', data: '<x/>' }]));
  await rejection(makeXlsx(sheet, [], { contentTypes: CONTENT_TYPES.replace('sheet.main+xml', 'sheet.macroEnabled.main+xml') }));
  // nested archive / many entries
  const nested = makeXlsx(sheet);
  const inner = makeZip([{ name: 'inner.xlsx', data: nested }]);
  await rejection(makeXlsx(sheet, [{ name: 'xl/media/archive.zip', data: inner }, ...Array.from({ length: 300 }, (_, i) => ({ name: `xl/media/f${i}.png`, data: 'x' }))]));
});

test('XML with a DOCTYPE or entities, or an external relationship target, is refused (also in UTF-16)', async () => {
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://evil.example/" TargetMode="External"/></Relationships>';
  await rejection(makeXlsx(sheetWith([goodRow('x')]), [{ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: rels }]));
  const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&b;</t></is></c></row></sheetData></worksheet>';
  await rejection(makeXlsx(bomb));
  await rejection(makeXlsx(bomb.toLowerCase()));
  // UTF-16LE with BOM: the DOCTYPE cannot be seen as UTF-8 text, so the reader must still refuse the workbook
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(bomb.replace('encoding="UTF-8"', ''), 'utf16le')]);
  await rejection(makeXlsx(utf16 as unknown as string));
});

test('a declared size that lies about the real expansion is caught by validating the real bytes', async () => {
  const big = Buffer.alloc(12_000_000, 0x61); // 12 MB of "a"
  const bytes = makeXlsx(sheetWith([goodRow('x')]), [{ name: 'xl/media/image1.png', data: big, declaredSize: 100 }]);
  await rejection(bytes);
  // honest large entry (over 10 MB per entry)
  await rejection(makeXlsx(sheetWith([goodRow('x')]), [{ name: 'xl/media/image2.png', data: big }]));
  // total expansion above 20 MB with every entry below 10 MB
  const nine = Buffer.alloc(9_000_000, 0x62);
  await rejection(makeXlsx(sheetWith([goodRow('x')]), [1, 2, 3].map((n) => ({ name: `xl/media/p${n}.png`, data: nine }))));
});

test('limits that count rows, cells and strings are enforced from the XML text, before the workbook is parsed', async () => {
  // The message must name a limit: these workbooks are small enough (below the 10 MB per-entry cap) to reach ExcelJS.
  const LIMIT = /exceeds the row, column or structure limit/i;
  const started = Date.now();
  // 150,000 rows of one cell: a < 1 MB zip that costs seconds and ~150 MB when it reaches the spreadsheet parser
  let rows = headerCells;
  for (let r = 2; r <= 150_000; r++) rows += `<row r="${r}"><c r="A${r}"><v>1</v></c></row>`;
  await rejection(makeXlsx(wrap(rows)), LIMIT);
  assert.ok(Date.now() - started < 1500, `row limit must be enforced cheaply, took ${Date.now() - started} ms`);

  // one row index far away (sparse sheet) and 400,000 empty cells in one row
  await rejection(makeXlsx(wrap(`${headerCells}<row r="1048576"><c r="A1048576"><v>1</v></c></row>`)), LIMIT);
  let cells = '';
  for (let c = 0; c < 400_000; c++) cells += '<c r="A1" s="0"/>';
  const t1 = Date.now();
  await rejection(makeXlsx(wrap(`<row r="1">${cells}</row>`)), LIMIT);
  assert.ok(Date.now() - t1 < 1500, `cell flood must be refused cheaply, took ${Date.now() - t1} ms`);

  // 570,000 shared strings and 300,000 merged ranges
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${'<si><t>a</t></si>'.repeat(570_000)}</sst>`;
  const t2 = Date.now();
  await rejection(makeXlsx(wrap(headerCells), [{ name: 'xl/sharedStrings.xml', data: sst }]), LIMIT);
  assert.ok(Date.now() - t2 < 1500, `string flood must be refused cheaply, took ${Date.now() - t2} ms`);
  const merges = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${headerCells}</sheetData><mergeCells count="300000">${'<mergeCell ref="A1:B1"/>'.repeat(300_000)}</mergeCells></worksheet>`;
  const t3 = Date.now();
  await rejection(makeXlsx(merges), LIMIT);
  assert.ok(Date.now() - t3 < 1500, `merge flood must be refused cheaply, took ${Date.now() - t3} ms`);
});

test('the configured row limit counts the header row, rows and columns of any sheet', async () => {
  process.env.ADMIN_IMPORT_MAX_ROWS = '3';
  try {
    const three = Array.from({ length: 3 }, (_, i) => goodRow(`r${i}`));
    assert.equal((await readWorkbook(makeXlsx(sheetWith(three)), headers)).length, 3);
    await rejection(makeXlsx(sheetWith([...three, goodRow('r4')])), /limit/i);
  } finally {
    delete process.env.ADMIN_IMPORT_MAX_ROWS;
  }
});

test('formulas, errors, dates, rich text and hyperlinks are never read as values', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Records');
  sheet.addRow(headers);
  const make = (value: ExcelJS.CellValue) => { const row = goodRow('v'); (row as unknown[])[1] = value; return row; };
  sheet.addRow(make({ formula: 'HYPERLINK("http://evil.example","x")', result: 'x' }) as string[]);
  sheet.addRow(make({ sharedFormula: 'B2', result: 1 } as unknown as ExcelJS.CellValue) as string[]);
  sheet.addRow(make({ error: '#REF!' } as ExcelJS.CellValue) as string[]);
  sheet.addRow(make(new Date()) as string[]);
  sheet.addRow(make({ richText: [{ text: 'a' }] } as ExcelJS.CellValue) as string[]);
  sheet.addRow(make('=cmd|\' /C calc\'!A0') as string[]); // plain text that merely starts with "=": data, not a formula
  const rows = await readWorkbook(Buffer.from(await book.xlsx.writeBuffer()), headers);
  assert.equal(rows.length, 6);
  for (const row of rows.slice(0, 5)) {
    assert.ok(row.errors.some((e) => e.field === 'nameEn'), `row ${row.row} must report the unsupported cell`);
    assert.equal(row.cells.nameEn, '');
  }
  assert.deepEqual(rows[5].errors, []);
  assert.equal(rows[5].cells.nameEn, '=cmd|\' /C calc\'!A0');

  // a hyperlink writes an external relationship: the whole workbook is refused
  const linked = new ExcelJS.Workbook();
  const linkSheet = linked.addWorksheet('Records');
  linkSheet.addRow(headers);
  linkSheet.addRow(make({ text: 'link', hyperlink: 'https://evil.example/' } as ExcelJS.CellValue) as string[]);
  await rejection(Buffer.from(await linked.xlsx.writeBuffer()));
});

test('over-long cells, extra columns, extra sheets and a changed header row are refused', async () => {
  const long = goodRow('long');
  long[1] = 'x'.repeat(5001);
  const rows = await readWorkbook(makeXlsx(sheetWith([long])), headers);
  assert.ok(rows[0].errors.some((e) => e.field === 'nameEn'));
  await rejection(makeXlsx(sheetXml([[...headers, 'extra'], [...goodRow('x'), 'y']])), /limit|match/i);
  await rejection(makeXlsx(sheetXml([[...headers].reverse(), ...[goodRow('x')]])), /match/i);
  await rejection(makeXlsx(sheetWith([goodRow('x')]), [], { sheetName: 'Other' }), /template|Records/i);
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Records').addRow(headers);
  book.getWorksheet('Records')!.addRow(goodRow('x'));
  book.addWorksheet('Secrets').addRow(['a']);
  await rejection(Buffer.from(await book.xlsx.writeBuffer()), /template|Records/i);
});

test('NUL and C0 controls decoded from _xHHHH_ escapes reach the value validators, they are not stripped', async () => {
  const row = goodRow('ctl');
  row[1] = 'a_x0000_b';
  const rows = await readWorkbook(makeXlsx(sheetWith([row])), headers);
  // the reader returns what Excel would show; the module validators (Validator.string) reject control characters
  const value = rows[0].cells.nameEn;
  assert.ok(value === 'a_x0000_b' || value === 'a\u0000b', `unexpected decoding: ${JSON.stringify(value)}`);
});

test('checkArchive accepts the real templates of every module', async () => {
  const { template } = await import('../modules/imports/workbook');
  for (const module of Object.keys(columns) as (keyof typeof columns)[]) await checkArchive(await template(module));
  assert.ok(zlib.crc32);
});
