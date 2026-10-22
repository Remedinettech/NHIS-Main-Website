import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readWorkbook, template, columns, checkArchive } from './workbook';

test('all module templates have exact headers and instructions, no executable cells', async () => {
  for (const module of Object.keys(columns) as (keyof typeof columns)[]) {
    const bytes = await template(module); await checkArchive(bytes);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    assert.deepEqual((book.getWorksheet('Records')!.getRow(1).values as unknown[]).slice(1), columns[module]);
    assert.ok(book.getWorksheet('Instructions'));
  }
});
test('bilingual data is preserved, formulas rejected, unsupported files and limits rejected', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Records');
  sheet.addRow(['id', 'nameEn', 'nameTa']); sheet.addRow(['h1', 'Hospital', 'மருத்துவமனை']); sheet.addRow(['h2', { formula: '1+1', result: 2 }, '']);
  const bytes = Buffer.from(await book.xlsx.writeBuffer()); const rows = await readWorkbook(bytes, ['id', 'nameEn', 'nameTa']);
  assert.equal(rows[0].cells.nameTa, 'மருத்துவமனை'); assert.equal(rows[1].errors[0].field, 'nameEn');
  await assert.rejects(readWorkbook(Buffer.from('not excel'), []));
  process.env.ADMIN_IMPORT_MAX_ROWS = '1'; await assert.rejects(readWorkbook(bytes, ['id', 'nameEn', 'nameTa'])); delete process.env.ADMIN_IMPORT_MAX_ROWS;
  process.env.ADMIN_IMPORT_MAX_BYTES = '10'; await assert.rejects(readWorkbook(bytes, ['id', 'nameEn', 'nameTa'])); delete process.env.ADMIN_IMPORT_MAX_BYTES;
});
