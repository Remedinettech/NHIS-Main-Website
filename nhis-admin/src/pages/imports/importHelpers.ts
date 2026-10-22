import type { ImportJob, ImportPreviewRow } from '../../services/imports.api';

/*
 * Pure helpers of the Excel import page (no React, no `import.meta`, so they run in the node tests).
 */

export const IMPORT_MODULES = ['hospitals', 'contacts', 'documents', 'announcements', 'partners'] as const;
export type ImportModule = (typeof IMPORT_MODULES)[number];

export const IMPORT_MODULE_LABELS: Record<ImportModule, string> = {
  hospitals: 'Hospitals',
  contacts: 'Contacts',
  documents: 'Documents',
  announcements: 'Announcements',
  partners: 'Partners (Site content)',
};

/** The module named by `?module=`, or Hospitals when it is missing or unknown. */
export function parseImportModule(value: string | null | undefined): ImportModule {
  return (IMPORT_MODULES as readonly string[]).includes(value ?? '') ? (value as ImportModule) : 'hospitals';
}

/**
 * The directory id when it is one of the listed directories, else '' (no choice). The address (`?directory=`) can name a directory
 * that does not exist, or the list may not be loaded yet: the select shows "Choose a directory" then, and the page must act the same
 * (no template, no check) instead of sending a choice that nobody can see.
 */
export function knownDirectory(id: string, directories: ReadonlyArray<{ value: string }>): string {
  return directories.some((directory) => directory.value === id) ? id : '';
}

/** The largest workbook the server accepts at all (ADMIN_IMPORT_MAX_BYTES defaults to 2,000,000 and can be raised to this ceiling). */
export const IMPORT_MAX_BYTES = 5_000_000;

/** Message when the file should not be sent, or null. The server checks the workbook again and its own limits are authoritative. */
export function checkImportFile(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return 'Choose an Excel workbook with the extension .xlsx. Older .xls files, .csv files and macro workbooks are not accepted.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > IMPORT_MAX_BYTES) return `This file is too large (${(file.size / 1_000_000).toFixed(1)} MB). Workbooks can be at most ${IMPORT_MAX_BYTES / 1_000_000} MB; the import limit of this site may be lower.`;
  return null;
}

/* ------------------------------------------------------------------ CSV reports */

/** Characters that start a formula in a spreadsheet: = + - @ and their full-width forms. */
const FORMULA_START = /^[\s\u0000-\u001f​﻿]*[=+\-@＝＋－＠]/;

/**
 * One cell of a CSV report. Always quoted. A text that starts with = + - @ (also after spaces, a tab or a carriage return, and the
 * full-width forms of these characters) would be run as a formula when the report is opened in a spreadsheet, so it gets a
 * leading apostrophe and stays plain text.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Rows of cells as CSV text (CRLF between rows, no trailing line break). */
export function buildCsv(rows: ReadonlyArray<readonly unknown[]>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Rows of the error report: one line per problem of the checked workbook. */
export function errorReportRows(rows: readonly ImportPreviewRow[]): unknown[][] {
  return [['Row', 'ID', 'Field', 'Problem'], ...rows.flatMap((row) => row.errors.map((error) => [row.row, row.id, error.field, error.message]))];
}

/** Rows of the results report of an import job. */
export function resultReportRows(job: Pick<ImportJob, 'results'>): unknown[][] {
  return [['Row', 'ID', 'Result', 'Message'], ...job.results.map((result) => [result.row, result.id, result.state, result.message ?? ''])];
}

/* ------------------------------------------------------------------ preview and jobs */

export type PreviewKind = ImportPreviewRow['kind'];
export const PREVIEW_KINDS: readonly PreviewKind[] = ['invalid', 'duplicate', 'new', 'update'];
export const PREVIEW_KIND_LABELS: Record<PreviewKind, string> = {
  invalid: 'Rows with problems',
  duplicate: 'Rows with a repeated ID',
  new: 'Rows that create a record',
  update: 'Rows that update a record',
};

/** Number of rows of each kind of a checked workbook. */
export function countPreviewKinds(rows: readonly ImportPreviewRow[]): Record<PreviewKind, number> {
  const counts: Record<PreviewKind, number> = { invalid: 0, duplicate: 0, new: 0, update: 0 };
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}

export const isFinished = (job: Pick<ImportJob, 'state'>): boolean => job.state === 'DONE';

/** One sentence about the progress of a job. Counts the server did not send are zero. */
export function describeJob(job: Pick<ImportJob, 'state' | 'cursor' | 'total' | 'counts'>): string {
  const counts = job.counts ?? {};
  const parts = `created ${counts.created ?? 0}, updated ${counts.updated ?? 0}, skipped ${counts.skipped ?? 0}, failed ${counts.failed ?? 0}`;
  return `${isFinished(job) ? 'Finished' : 'Not finished'}: ${job.cursor} of ${job.total} rows processed (${parts}).`;
}

/** The newest job that was started but not finished, or undefined. The list is ordered newest first by the server. */
export function unfinishedJob<T extends Pick<ImportJob, 'state'>>(jobs: readonly T[]): T | undefined {
  return jobs.find((job) => !isFinished(job));
}

/**
 * True when a batch moved the job forward or finished it. The page stops repeating requests when it did not, so a server that
 * answers "running" without making progress cannot keep the browser in a loop.
 */
export function madeProgress(before: Pick<ImportJob, 'cursor'>, after: Pick<ImportJob, 'cursor' | 'state'>): boolean {
  return isFinished(after) || after.cursor > before.cursor;
}
