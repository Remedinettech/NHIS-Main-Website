import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import type { PrismaClient } from '@prisma/client';
import { ctx as routeCtx } from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let fixture: AdminTestDb; let db: PrismaClient;
let api: typeof import('../modules/imports/imports');
let cookie: string; let csrf: string;
let storageDir: string;
let savedSigningKey: string | undefined;
before(async () => {
  // Previews are signed with ADMIN_IMPORT_SIGNING_KEY; the import fails closed without it (there is no default key).
  savedSigningKey = process.env.ADMIN_IMPORT_SIGNING_KEY;
  process.env.ADMIN_IMPORT_SIGNING_KEY = 'excel-import-test-signing-key-0123456789';
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-import-test-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  fixture = await createAdminTestDb(); db = fixture.client;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { hashPassword } = await import('../common/admin');
  await db.adminUser.create({ data: { id: 'import-editor', email: 'import@test.example', name: 'Importer', role: 'EDITOR', passwordHash: await hashPassword('Import-Password-123456') } });
  const { POST } = await import('../app/api/v1/admin/auth/login/route');
  const response = await POST(new Request('http://localhost/api/v1/admin/auth/login', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5174', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'import@test.example', password: 'Import-Password-123456' }) }));
  assert.equal(response.status, 200); cookie = response.headers.get('set-cookie')!.split(';')[0]; csrf = (await response.json()).csrfToken;
  api = await import('../modules/imports/imports');
});
after(async () => { if (savedSigningKey === undefined) delete process.env.ADMIN_IMPORT_SIGNING_KEY; else process.env.ADMIN_IMPORT_SIGNING_KEY = savedSigningKey; await fixture?.cleanup(); if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true }); });
async function send(handler: Function, path: string, body?: object | FormData, params?: { id: string }, auth = true, useCsrf = true) {
  const headers: Record<string, string> = { Origin: 'http://127.0.0.1:5174' };
  if (auth) { headers.Cookie = cookie; if (useCsrf) headers['X-CSRF-Token'] = csrf; }
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response: Response = await handler(new Request(`http://localhost/api/v1/admin/imports${path}`, { method: body ? 'POST' : 'GET', headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }), params ? routeCtx(params) : undefined);
  return { status: response.status, body: await response.json() };
}
async function preview(rows: string[][], mode = 'create', module = 'hospitals', directoryId = '') {
  const { columns } = await import('../modules/imports/workbook');
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Records');
  const headers = module === 'contacts' ? ['id', 'directoryId', 'sortOrder', 'cell.name'] : columns[module as keyof typeof columns];
  sheet.addRow(headers); rows.forEach(r => sheet.addRow(r)); const form = new FormData();
  form.set('module', module); form.set('mode', mode); form.set('directoryId', directoryId); form.set('file', new File([new Uint8Array(await book.xlsx.writeBuffer())], 'import.xlsx'));
  return send(api.previewImport, '/preview', form);
}
const hospital = (id: string, name = 'Hospital', ta = 'மருத்துவமனை') => [id, name, ta, 'Address', '', 'Chennai'];
async function confirm(token: string) { const res = await send(api.confirmImport, '/confirm', { token }); assert.equal(res.status, 200, JSON.stringify(res.body)); return res.body.data.id as string; }
async function processJob(id: string) { return send(api.processImport, `/${id}/process`, {}, { id }); }
test('preview does not write; duplicates and invalid rows cannot be confirmed', async () => {
  const before = await db.hospital.count(); const result = await preview([hospital('duplicate'), hospital('duplicate'), hospital('bad', '')]);
  assert.equal(result.status, 200); assert.equal(result.body.valid, false); assert.equal(result.body.rows[0].kind, 'duplicate'); assert.equal(result.body.rows[1].kind, 'duplicate'); assert.equal(result.body.rows[2].kind, 'invalid'); assert.equal(result.body.token, null);
  assert.equal(await db.hospital.count(), before); assert.equal(await db.contentImport.count(), 0);
});
test('create, retries and bounded batches create only drafts and one job; progress survives retries', async () => {
  const result = await preview(Array.from({ length: 23 }, (_, i) => hospital(`bulk_${i}`))); assert.equal(result.body.valid, true, JSON.stringify(result.body));
  const id = await confirm(result.body.token); assert.equal(await confirm(result.body.token), id);
  const first = await processJob(id); assert.equal(first.body.data.cursor, 10);
  await Promise.all([processJob(id), processJob(id)]);
  const last = await processJob(id); assert.equal(last.body.data.state, 'DONE'); assert.equal(last.body.data.counts.created, 23); assert.equal(await db.hospital.count(), 23);
  assert.equal(await db.hospital.count({ where: { status: 'PUBLISHED' } }), 0);
  assert.equal((await db.hospital.findUniqueOrThrow({ where: { id: 'bulk_0' } })).nameTa, 'மருத்துவமனை');
  assert.equal(await db.auditLog.count({ where: { action: 'IMPORT_COMPLETE', entityId: id } }), 1);
});
test('updates preserve published values and blanks; stale snapshots fail and report partial results', async () => {
  await db.hospital.update({ where: { id: 'bulk_0' }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  const update = await preview([['bulk_0', 'Updated'], ['bulk_1', 'Conflicting']], 'update'); assert.equal(update.body.valid, true);
  await db.hospital.update({ where: { id: 'bulk_1' }, data: { version: { increment: 1 } } });
  const id = await confirm(update.body.token); const res = await processJob(id);
  assert.equal(res.body.data.counts.updated, 1); assert.equal(res.body.data.counts.failed, 1);
  const row = await db.hospital.findUniqueOrThrow({ where: { id: 'bulk_0' } }); assert.equal(row.nameEn, 'Hospital'); assert.equal((row.draft as { nameEn: string }).nameEn, 'Updated'); assert.equal((row.draft as { addressEn: string }).addressEn, 'Address');
});
test('IDs required on updates; confirmation rejects tampering, wrong actor, missing CSRF and unauthenticated access', async () => {
  assert.equal((await preview([hospital('')], 'update')).body.valid, false);
  const result = await preview([hospital('secure')]);
  assert.equal((await send(api.confirmImport, '/confirm', { token: result.body.token + 'x' })).status, 400);
  assert.equal((await send(api.confirmImport, '/confirm', { token: result.body.token }, undefined, false)).status, 401);
  assert.equal((await send(api.confirmImport, '/confirm', { token: result.body.token }, undefined, true, false)).status, 403);
  assert.throws(() => api.decodePlan(result.body.token, 'someone-else'));
});
test('directory cells reuse contact validation; no names matching; metadata assets must exist', async () => {
  await db.contactDirectory.create({ data: { id: 'import-dir', labelEn: 'Directory', labelTa: '', columns: [{ key: 'name', label: { en: 'Name', ta: '' }, kind: 'text' }], sortOrder: 0 } });
  const valid = await preview([['ct_import', 'import-dir', '1', 'தமிழ்']], 'create', 'contacts', 'import-dir'); assert.equal(valid.body.valid, true, JSON.stringify(valid.body));
  const id = await confirm(valid.body.token); assert.equal((await processJob(id)).body.data.counts.created, 1);
  const bad = await preview([['doc_import', 'enrolment-form', 'all', '0', 'Label', '', 'Title', '', '', '', 'unknown_asset']], 'create', 'documents'); assert.equal(bad.body.valid, false);
});
test('announcements and document metadata imports reuse drafts and validate referenced PDF assets', async () => {
  const notice = await preview([['notice_import', 'general', 'notice', 'Notice', 'அறிவிப்பு', '', '', '0']], 'create', 'announcements');
  assert.equal(notice.body.valid, true, JSON.stringify(notice.body)); assert.equal((await processJob(await confirm(notice.body.token))).body.data.counts.created, 1);
  assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: 'notice_import' } })).status, 'DRAFT');
  const doc = await preview([['metadata_doc', 'enrolment-form', 'all', '0', 'Label', '', 'Title']], 'create', 'documents');
  assert.equal(doc.body.valid, true); assert.equal((await processJob(await confirm(doc.body.token))).body.data.counts.created, 1);
  assert.equal((await db.document.findUniqueOrThrow({ where: { id: 'metadata_doc' } })).status, 'DRAFT');
});
test('partners update and reorder preserves published document, validates logos and detects conflicting edits', async () => {
  const { DEFAULT_SITE_CONTENT } = await import('@nhis/shared-types');
  await db.siteContent.create({ data: { id: 'partners', status: 'PUBLISHED', version: 1, value: JSON.parse(JSON.stringify(DEFAULT_SITE_CONTENT.partners)), publishedAt: new Date() } });
  const update = await preview([['medi-assist', '', 'Updated partner', 'தமிழ்', '', '', '', '', 'false', '1']], 'update', 'partners');
  assert.equal(update.body.valid, true, JSON.stringify(update.body));
  const result = await processJob(await confirm(update.body.token)); assert.equal(result.body.data.counts.updated, 1, JSON.stringify(result.body));
  const row = await db.siteContent.findUniqueOrThrow({ where: { id: 'partners' } });
  assert.deepEqual(row.value, DEFAULT_SITE_CONTENT.partners);
  const draft = row.draft as unknown as { partners: { id: string; visible: boolean; name: { ta: string } }[] };
  assert.equal(draft.partners[1].id, 'medi-assist'); assert.equal(draft.partners[1].visible, false); assert.equal(draft.partners[1].name.ta, 'தமிழ்');
  const invalid = await preview([['new-partner', 'service', 'Partner', '', 'missing_asset', 'Logo']], 'create', 'partners'); assert.equal(invalid.body.valid, false);
  const stale = await preview([['medi-assist', '', 'Stale']], 'update', 'partners');
  await db.siteContent.update({ where: { id: 'partners' }, data: { version: { increment: 1 } } });
  assert.equal((await processJob(await confirm(stale.body.token))).body.data.counts.failed, 1);
});
