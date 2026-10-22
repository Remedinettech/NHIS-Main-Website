import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportJob, ImportPreviewRow } from '../../services/imports.api';
import {
  IMPORT_MAX_BYTES, IMPORT_MODULES, IMPORT_MODULE_LABELS, buildCsv, checkImportFile, countPreviewKinds, csvCell, describeJob, errorReportRows, isFinished,
  knownDirectory, madeProgress, parseImportModule, resultReportRows, unfinishedJob,
} from './importHelpers';

/* ------------------------------------------------------------------ modules and files */

test('the module of the address is used when it is known, else Hospitals', () => {
  assert.equal(parseImportModule('partners'), 'partners');
  assert.equal(parseImportModule('contacts'), 'contacts');
  assert.equal(parseImportModule('unknown'), 'hospitals');
  assert.equal(parseImportModule(''), 'hospitals');
  assert.equal(parseImportModule(null), 'hospitals');
  assert.equal(parseImportModule(undefined), 'hospitals');
  assert.equal(parseImportModule('__proto__'), 'hospitals');
});

test('every module has a readable name', () => {
  for (const module of IMPORT_MODULES) assert.ok(IMPORT_MODULE_LABELS[module].length > 3, module);
});

test('only .xlsx workbooks of a sensible size pass the pre-check', () => {
  assert.equal(checkImportFile({ name: 'hospitals.xlsx', size: 1234 }), null);
  assert.equal(checkImportFile({ name: 'HOSPITALS.XLSX', size: 1234 }), null, 'the extension is not case sensitive');
  assert.match(checkImportFile({ name: 'hospitals.xls', size: 1234 }) ?? '', /\.xlsx/);
  assert.match(checkImportFile({ name: 'hospitals.csv', size: 1234 }) ?? '', /\.xlsx/);
  assert.match(checkImportFile({ name: 'macro.xlsm', size: 1234 }) ?? '', /\.xlsx/);
  assert.match(checkImportFile({ name: 'hospitals.xlsx.exe', size: 1234 }) ?? '', /\.xlsx/);
  assert.match(checkImportFile({ name: 'hospitals', size: 1234 }) ?? '', /\.xlsx/);
  assert.match(checkImportFile({ name: 'a.xlsx', size: 0 }) ?? '', /empty/);
  assert.equal(checkImportFile({ name: 'a.xlsx', size: IMPORT_MAX_BYTES }), null);
  assert.match(checkImportFile({ name: 'a.xlsx', size: IMPORT_MAX_BYTES + 1 }) ?? '', /too large/);
});

/* ------------------------------------------------------------------ CSV reports */

test('cells are quoted and quotes are doubled', () => {
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a,b\nc'), '"a,b\nc"');
  assert.equal(csvCell(12), '"12"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell('தமிழ்'), '"தமிழ்"');
});

test('a cell that a spreadsheet would run as a formula is turned into plain text', () => {
  for (const text of ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://evil","x")', "=cmd|' /C calc'!A0"]) {
    assert.ok(csvCell(text).startsWith('"\''), text);
  }
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});

test('a formula hidden behind spaces, tabs, line breaks or control characters is caught too', () => {
  for (const text of [' =1+1', '\t=1+1', '\r=1+1', '\n+1', '  -1', '\u0000=1', '​=1', '﻿=1', '＝1+1', '＋1', '＠SUM(A1)']) {
    assert.ok(csvCell(text).startsWith('"\'') || csvCell(text).startsWith('"\'\''), JSON.stringify(text));
    assert.ok(csvCell(text).includes("'"), JSON.stringify(text));
  }
});

test('text with a formula character inside, or ordinary text, is left alone', () => {
  assert.equal(csvCell('a=b'), '"a=b"');
  assert.equal(csvCell('Row 5 - failed'), '"Row 5 - failed"');
  assert.equal(csvCell('x@y.org'), '"x@y.org"');
  assert.equal(csvCell(''), '""');
  assert.equal(csvCell('0'), '"0"');
});

test('a whole report is safe, line by line', () => {
  const csv = buildCsv([['Row', 'Message'], [2, '=1+1'], [3, 'fine']]);
  assert.equal(csv, '"Row","Message"\r\n"2","\'=1+1"\r\n"3","fine"');
  assert.equal(buildCsv([]), '');
});

test('the error report has one line per problem and a header', () => {
  const rows: ImportPreviewRow[] = [
    { row: 2, id: 'a', kind: 'new', values: {}, errors: [] },
    { row: 3, id: 'b', kind: 'invalid', values: {}, errors: [{ field: 'nameEn', message: 'Required.' }, { field: 'mapUrl', message: '=bad' }] },
  ];
  assert.deepEqual(errorReportRows(rows), [['Row', 'ID', 'Field', 'Problem'], [3, 'b', 'nameEn', 'Required.'], [3, 'b', 'mapUrl', '=bad']]);
  assert.deepEqual(errorReportRows([]), [['Row', 'ID', 'Field', 'Problem']]);
  assert.ok(buildCsv(errorReportRows(rows)).includes('"\'=bad"'));
});

test('the results report keeps failed rows with their message', () => {
  const job = { results: [{ row: 2, id: 'a', state: 'created' as const }, { row: 3, id: 'b', state: 'failed' as const, message: '-1 bad' }] };
  assert.deepEqual(resultReportRows(job), [['Row', 'ID', 'Result', 'Message'], [2, 'a', 'created', ''], [3, 'b', 'failed', '-1 bad']]);
});

/* ------------------------------------------------------------------ previews and jobs */

test('rows of a checked workbook are counted by kind', () => {
  const row = (kind: ImportPreviewRow['kind']): ImportPreviewRow => ({ row: 2, id: 'x', kind, values: {}, errors: [] });
  assert.deepEqual(countPreviewKinds([row('new'), row('new'), row('invalid'), row('update'), row('duplicate'), row('duplicate')]), { invalid: 1, duplicate: 2, new: 2, update: 1 });
  assert.deepEqual(countPreviewKinds([]), { invalid: 0, duplicate: 0, new: 0, update: 0 });
});

const job = (state: string, cursor: number, total: number, counts: ImportJob['counts'] = {}): ImportJob => ({
  id: 'j', module: 'hospitals', mode: 'create', state, cursor, total, createdAt: '2026-10-15T00:00:00Z', counts, results: [],
});

test('a job is described by its progress, with counts the server left out taken as zero', () => {
  assert.equal(describeJob(job('RUNNING', 10, 25, { created: 9, failed: 1 })), 'Not finished: 10 of 25 rows processed (created 9, updated 0, skipped 0, failed 1).');
  assert.match(describeJob(job('DONE', 25, 25, { created: 25 })), /^Finished: 25 of 25/);
  assert.match(describeJob({ ...job('RUNNING', 0, 3), counts: undefined as never }), /created 0, updated 0, skipped 0, failed 0/);
});

test('the newest unfinished job is found for the resume notice', () => {
  const jobs = [job('DONE', 5, 5), job('RUNNING', 2, 5), job('RUNNING', 1, 5)];
  assert.equal(unfinishedJob(jobs), jobs[1]);
  assert.equal(unfinishedJob([job('DONE', 5, 5)]), undefined);
  assert.equal(unfinishedJob([]), undefined);
  assert.equal(isFinished(job('DONE', 1, 1)), true);
  assert.equal(isFinished(job('RUNNING', 1, 2)), false);
});

test('the page stops asking the server when a batch moves nothing', () => {
  assert.equal(madeProgress(job('RUNNING', 0, 25), job('RUNNING', 10, 25)), true);
  assert.equal(madeProgress(job('RUNNING', 10, 25), job('RUNNING', 10, 25)), false);
  assert.equal(madeProgress(job('RUNNING', 10, 25), job('RUNNING', 9, 25)), false);
  assert.equal(madeProgress(job('RUNNING', 20, 25), job('DONE', 25, 25)), true);
  assert.equal(madeProgress(job('DONE', 25, 25), job('DONE', 25, 25)), true, 'a finished job needs no further batch');
});

/* ------------------------------------------------------------------ directory of the address */

test('a directory named by the address counts only when the select can show it', () => {
  const directories = [{ value: 'coordinators', label: 'TPA coordinators' }, { value: 'uiic-nodal-officers', label: 'UIIC Nodal Officers' }];
  assert.equal(knownDirectory('coordinators', directories), 'coordinators');
  // The defect: ?directory=bogus stayed as the choice while the select showed "Choose a directory", so the template and the check used it.
  assert.equal(knownDirectory('bogus', directories), '');
  assert.equal(knownDirectory('', directories), '');
  assert.equal(knownDirectory('Coordinators', directories), '', 'the match is exact');
  assert.equal(knownDirectory('coordinators', []), '', 'nothing is chosen while the list is not loaded or empty');
});
