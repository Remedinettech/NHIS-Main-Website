/**
 * Third review of the workbook reader: archives that the validating reader (yauzl) and the loading reader (JSZip, inside
 * ExcelJS) could see differently, odd entry names, and the limits that must also hold for what is really loaded. No database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { AdminHttpError } from '../common/admin/errors';
import { checkArchive, columns, packArchive, readArchive, readWorkbook } from '../modules/imports/workbook';
import {
  CONTENT_TYPES, ROOT_RELS, WORKBOOK, WORKBOOK_RELS, endOfCentralDirectory, makeDifferentialZip, makeXlsx, makeZip, sheetXml, zipParts, type ZipEntry,
} from './review-xlsx';

const headers = columns.hospitals;
const row = (id: string) => [id, 'Hospital', 'x', 'Address', '', 'Chennai', '', '', '', '', '', '', '', ''].slice(0, headers.length);
const goodSheet = sheetXml([headers, row('h1')]);
const baseEntries = (sheet: string | Buffer): ZipEntry[] => [
  { name: '[Content_Types].xml', data: CONTENT_TYPES },
  { name: '_rels/.rels', data: ROOT_RELS },
  { name: 'xl/workbook.xml', data: WORKBOOK() },
  { name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS },
  { name: 'xl/worksheets/sheet1.xml', data: sheet },
];

async function rejected(bytes: Buffer, expected = /./): Promise<void> {
  try {
    await readWorkbook(bytes, headers);
  } catch (error) {
    assert.ok(error instanceof AdminHttpError, `expected an AdminHttpError (400), got ${String(error)}`);
    assert.equal(error.status, 400);
    assert.match(error.message, expected);
    return;
  }
  assert.fail('the workbook should have been refused');
}

test('baseline: the helper builds a workbook the reader accepts', async () => {
  const rows = await readWorkbook(makeZip(baseEntries(goodSheet)), headers);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells.id, 'h1');
});

test('an archive that the validator and the loader read differently is refused (the loader would inflate what was never checked)', async () => {
  // The hostile worksheet is valid XML that expands to 40 MB: far above the 10 MB per-entry limit the validator enforces.
  const padding = '<!-- ' + 'a'.repeat(40 * 1024 * 1024) + ' -->';
  const hostileSheet = goodSheet.replace('</worksheet>', `${padding}</worksheet>`);
  const bytes = makeDifferentialZip(baseEntries(goodSheet), baseEntries(hostileSheet));
  assert.ok(bytes.length < 200_000, `the archive is only ${bytes.length} bytes`);
  const started = Date.now();
  await rejected(bytes);
  assert.ok(Date.now() - started < 3000, `refused in ${Date.now() - started} ms`);
});

test('a differential archive whose second directory only renames the sheet is refused too', async () => {
  const bytes = makeDifferentialZip(baseEntries(goodSheet), [...baseEntries(goodSheet).slice(0, 4), { name: 'xl/worksheets/sheet2.xml', data: goodSheet }]);
  await rejected(bytes);
});

test('bytes in front of the archive, after it, and an archive comment are refused or read identically by both readers', async () => {
  const plain = makeZip(baseEntries(goodSheet));
  const comment = Buffer.from('PK\u0005\u0006 not a record, just a comment');
  const withComment = Buffer.concat([plain.subarray(0, plain.length - 22), endOfCentralDirectory(5, plain.readUInt32LE(plain.length - 10), plain.readUInt32LE(plain.length - 6), comment)]);
  for (const [name, bytes] of [['prefix', Buffer.concat([Buffer.from('MZ junk in front'), plain])], ['suffix', Buffer.concat([plain, Buffer.from('trailing junk')])], ['comment', withComment]] as const) {
    try {
      const rows = await readWorkbook(bytes, headers);
      assert.equal(rows[0].cells.id, 'h1', `${name}: if it is accepted it must be read as the workbook it is`);
    } catch (error) {
      assert.ok(error instanceof AdminHttpError && error.status === 400, `${name}: ${String(error)}`);
    }
  }
});

test('zip64 markers, split archives and an entry count that disagrees with the directory are refused', async () => {
  const plain = makeZip(baseEntries(goodSheet));
  const patch = (offset: number, bytes: number[]) => { const copy = Buffer.from(plain); copy.set(bytes, plain.length - 22 + offset); return copy; };
  await rejected(patch(8, [0xff, 0xff, 0xff, 0xff]));       // entry counts 0xFFFF: zip64
  await rejected(patch(16, [0xff, 0xff, 0xff, 0xff]));      // central directory offset 0xFFFFFFFF: zip64
  await rejected(patch(4, [1, 0, 0, 0]));                   // disk number 1 / central directory on another disk
  await rejected(patch(8, [9, 0, 9, 0]));                   // 9 entries claimed, 5 present
  await rejected(patch(8, [4, 0, 4, 0]));                   // 4 entries claimed, 5 present
});

test('entry names that are object-prototype members never change the prototype, and the workbook is still read as itself', async () => {
  for (const name of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'xl/__proto__', 'xl/worksheets/__proto__.xml', 'docProps/constructor.xml']) {
    const bytes = makeZip([...baseEntries(goodSheet), { name, data: '<polluted xmlns="x"/>' }]);
    try {
      const rows = await readWorkbook(bytes, headers);
      assert.equal(rows[0].cells.id, 'h1', name);
    } catch (error) {
      assert.ok(error instanceof AdminHttpError && error.status === 400, `${name}: ${String(error)}`);
    }
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
  }
});

test('entry names with backslashes, drive letters, NUL, dot segments and over-long names are refused', async () => {
  for (const name of ['xl\\worksheets\\sheet9.xml', 'C:\\Windows\\x.xml', 'xl/worksheets/sheet9.xml\u0000.png', './xl/x.xml', 'xl/../../x.xml', 'xl//x.xml', `xl/${'a'.repeat(300)}.xml`, `xl/${'a'.repeat(65_000)}.xml`]) {
    await rejected(makeZip([...baseEntries(goodSheet), { name, data: '<x/>' }]));
  }
});

test('stored (uncompressed) and compressed entries give the same rows; odd compression methods are refused', async () => {
  const stored = makeZip(baseEntries(goodSheet).map((entry) => ({ ...entry, stored: true })));
  assert.equal((await readWorkbook(stored, headers))[0].cells.id, 'h1');
  const { locals, central, count } = zipParts(baseEntries(goodSheet));
  const bzip = Buffer.from(central);
  // method 12 (bzip2) in the first central record
  bzip.writeUInt16LE(12, 10);
  await rejected(Buffer.concat([locals, bzip, endOfCentralDirectory(count, bzip.length, locals.length)]));
});

test('a deflate stream that is much longer than the declared size is stopped, not inflated', async () => {
  const bomb = Buffer.alloc(64 * 1024 * 1024, 0x61);
  const compressed = zlib.deflateRawSync(bomb, { level: 9 });
  assert.ok(compressed.length < 100_000);
  const started = Date.now();
  await rejected(makeXlsx(goodSheet, [{ name: 'xl/media/image1.png', data: bomb, declaredSize: 100 }]));
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test('checkArchive on its own refuses the differential archive as well (it is the gate, not ExcelJS)', async () => {
  const hostileSheet = goodSheet.replace('</worksheet>', `<!-- ${'a'.repeat(30 * 1024 * 1024)} --></worksheet>`);
  await assert.rejects(checkArchive(makeDifferentialZip(baseEntries(goodSheet), baseEntries(hostileSheet))), (error: unknown) => error instanceof AdminHttpError && error.status === 400);
});

test('the library loads a canonical archive: re-packing the checked parts gives an archive that passes the same gate with identical parts', async () => {
  const original = makeZip(baseEntries(goodSheet));
  const parts = await readArchive(original);
  const packed = packArchive(parts);
  const again = await readArchive(packed);
  assert.deepEqual(again.map((part) => part.name), parts.map((part) => part.name));
  for (const [index, part] of parts.entries()) assert.ok(part.data.equals(again[index].data), part.name);
  assert.equal((await readWorkbook(packed, headers))[0].cells.id, 'h1');
});

test('directory entries of zero length are tolerated and never packed; an archive without entries or with a non-empty directory entry is refused', async () => {
  const withDirectories = makeZip([{ name: 'xl/', data: '' }, ...baseEntries(goodSheet), { name: 'docProps/', data: '' }]);
  assert.deepEqual((await readArchive(withDirectories)).map((part) => part.name).sort(), baseEntries(goodSheet).map((entry) => entry.name).sort());
  await rejected(makeZip([]));
  await rejected(makeZip([...baseEntries(goodSheet), { name: 'xl/media/', data: 'not empty' }]));
});
