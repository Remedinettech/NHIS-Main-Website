/**
 * Fourth review of the workbook reader (resumed security review): CPU and memory floods that a few KB of upload can cause
 * BEFORE the structural limits stop them. No database needed.
 *
 * Measured on the code as it was: a 10 KB workbook whose worksheet holds 500 start tags "<row " that never close made
 * the structure gate scan the rest of the 9 MB part once per tag (about 1.7 s of blocked event loop at the default row
 * limit, several times that at ADMIN_IMPORT_MAX_ROWS=2000), and the gate then accepted the file. Parts other than worksheets had
 * no markup limit at all (a 9.6 KB docProps/app.xml of 2 million elements cost 0.8 s and 130 MB in the spreadsheet parser).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { AdminHttpError } from '../common/admin/errors';
import { checkArchive, columns, readArchive, readWorkbook, template } from '../modules/imports/workbook';
import { makeXlsx, sheetXml } from './review-xlsx';

const headers = columns.hospitals;
const goodRow = ['h1', 'Hospital', 'மருத்துவமனை', 'Address', '', 'Chennai', '', '', '', '', '', '', '', '', ''].slice(0, headers.length);
const goodSheet = sheetXml([[...headers], goodRow]);
const sheetHead = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
const LIMIT = /exceeds the row, column or structure limit/i;
/** Generous for a loaded CI machine, far below the 1.5 s the flood cost before. */
const CHEAP_MS = 600;

async function refusedQuickly(bytes: Buffer, label: string): Promise<void> {
  const started = Date.now();
  try {
    await readArchive(bytes, { rows: 500, columns: headers.length });
  } catch (error) {
    assert.ok(error instanceof AdminHttpError, `${label}: expected an AdminHttpError, got ${String(error)}`);
    assert.equal(error.status, 400, label);
    assert.match(error.message, LIMIT, label);
    const took = Date.now() - started;
    assert.ok(took < CHEAP_MS, `${label}: must be refused cheaply, took ${took} ms`);
    return;
  }
  assert.fail(`${label}: the archive should have been refused by the structure gate`);
}

test('start tags that never close do not make the gate scan the rest of the part once per tag, and the part is refused', async () => {
  await refusedQuickly(makeXlsx(sheetHead + '<row '.repeat(500) + ' '.repeat(9_000_000)), '500 unclosed <row tags, 9 MB of blanks');
  await refusedQuickly(makeXlsx(sheetHead + '<row '.repeat(500) + ' r='.repeat(3_000_000)), '500 unclosed <row tags, 9 MB of "r=" noise');
  // one start tag whose attributes run on for megabytes is not a row of a workbook either
  await refusedQuickly(makeXlsx(sheetHead + '<row r="1" x="' + 'y'.repeat(9_000_000) + '"></row></sheetData></worksheet>'), 'one row start tag of 9 MB');
});

test('ordinary row start tags (many attributes, namespaced attributes, a line break inside) are still read', async () => {
  const attributes = 'r="2" spans="1:15" s="0" customFormat="0" ht="15.75" hidden="0" customHeight="1" outlineLevel="0" collapsed="0" thickBot="0" thickTop="0" ph="0" x14ac:dyDescent="0.25"';
  const cells = goodRow.map((value, index) => `<c r="${String.fromCharCode(65 + index)}2" t="inlineStr"><is><t>${value}</t></is></c>`).join('');
  const headerCells = headers.map((name, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${name}</t></is></c>`).join('');
  const sheet = `${sheetHead}<row r="1">${headerCells}</row><row\n${attributes}>${cells}</row></sheetData></worksheet>`;
  const rows = await readWorkbook(makeXlsx(sheet), headers);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells.id, 'h1');
  assert.equal(rows[0].cells.nameTa, 'மருத்துவமனை');
});

test('parts other than worksheets are limited by their markup too, and a normal workbook is not affected', async () => {
  const flood = (root: string, namespace: string, element: string, count: number) =>
    `<?xml version="1.0"?><${root} xmlns="${namespace}">${element.repeat(count)}</${root}>`;
  const cases: Array<{ label: string; entry: { name: string; data: string } }> = [
    { label: 'docProps/app.xml with 2 million elements', entry: { name: 'docProps/app.xml', data: flood('Properties', 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', '<a/>', 2_000_000) } },
    { label: 'a theme with 1.5 million elements', entry: { name: 'xl/theme/theme1.xml', data: flood('a:theme', 'http://schemas.openxmlformats.org/drawingml/2006/main', '<a:x/>', 1_500_000) } },
    { label: 'comments that no sheet links to', entry: { name: 'xl/comments1.xml', data: flood('comments', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', '<comment ref="A1" authorId="0"><text><t>x</t></text></comment>', 120_000) } },
    { label: 'a styles part with 150,000 fonts', entry: { name: 'xl/styles.xml', data: flood('styleSheet', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', '<font><sz val="11"/><name val="Calibri"/></font>', 150_000) } },
    { label: 'shared strings of 2,000 entries with 300 runs each', entry: { name: 'xl/sharedStrings.xml', data: flood('sst', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', `<si>${'<r><t>a</t></r>'.repeat(300)}</si>`, 2_000) } },
  ];
  for (const { label, entry } of cases) {
    const archive = makeXlsx(goodSheet, [entry]); // built before the clock starts: compressing the fixture is not what is measured
    const started = Date.now();
    await assert.rejects(readWorkbook(archive, headers), (error: unknown) => {
      assert.ok(error instanceof AdminHttpError, `${label}: expected an AdminHttpError`);
      assert.equal(error.status, 400, label);
      assert.match(error.message, LIMIT, label);
      return true;
    }, label);
    assert.ok(Date.now() - started < CHEAP_MS, `${label}: must be refused cheaply, took ${Date.now() - started} ms`);
  }
  // what real tools write stays well below the limit: the generated templates, a hand-made workbook with a small theme
  for (const module of ['hospitals', 'documents', 'announcements', 'partners'] as const) await checkArchive(await template(module));
  const theme = flood('a:theme', 'http://schemas.openxmlformats.org/drawingml/2006/main', '<a:x/>', 3_000);
  assert.equal((await readWorkbook(makeXlsx(goodSheet, [{ name: 'xl/theme/theme1.xml', data: theme }]), headers)).length, 1);
});

test('a full workbook at the largest configured size (2000 rows, every cell a different string, written by ExcelJS) is not refused by the markup limits', async () => {
  const saved = { rows: process.env.ADMIN_IMPORT_MAX_ROWS, bytes: process.env.ADMIN_IMPORT_MAX_BYTES };
  process.env.ADMIN_IMPORT_MAX_ROWS = '2000';
  process.env.ADMIN_IMPORT_MAX_BYTES = '5000000';
  try {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Records');
    sheet.addRow([...headers]);
    for (let row = 1; row <= 2000; row++) sheet.addRow(headers.map((name, column) => (column === 0 ? `h${row}` : `${name} ${row} மருத்துவமனை ${row * 31 + column}`)));
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    assert.ok(bytes.length < 5_000_000, `fixture is ${bytes.length} bytes`);
    const rows = await readWorkbook(bytes, headers);
    assert.equal(rows.length, 2000);
    assert.equal(rows[1999].cells.id, 'h2000');
  } finally {
    for (const [name, value] of [['ADMIN_IMPORT_MAX_ROWS', saved.rows], ['ADMIN_IMPORT_MAX_BYTES', saved.bytes]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
