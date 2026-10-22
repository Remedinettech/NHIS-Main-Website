/**
 * Independent review of the Excel import (preview, confirm, resumable processing) against a real PostgreSQL schema.
 * Routes are invoked in-process through the real route files with real session cookies, CSRF tokens and Origin headers.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';
import { makeXlsx, sheetXml } from './review-xlsx';

const ORIGIN = 'http://127.0.0.1:5174';
const KEY_NAME = 'ADMIN_IMPORT_SIGNING_KEY';
const TEST_KEY = 'review-signing-key-0123456789abcdef-0123456789';
const PASSWORDS = { A: 'Editor-A-Passphrase-Long-1', B: 'Editor-B-Passphrase-Long-2', P: 'Publisher-Passphrase-Long-3' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
let savedKey: string | undefined;

/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};
interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers; text: string }
const sessions = {} as Record<keyof typeof PASSWORDS, Session>;

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; params?: Record<string, string>; headers?: Record<string, string>; csrf?: boolean; origin?: string | null } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(opts.origin === null ? {} : { Origin: opts.origin ?? ORIGIN }), ...opts.headers };
  if (opts.session) {
    headers.Cookie = opts.session.cookie;
    if (opts.csrf !== false) headers['X-CSRF-Token'] = opts.session.csrf;
  }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const response = await handler(new Request(`http://localhost${url}`, { method, headers, body }), opts.params ? ctx(opts.params) : undefined);
  const text = await response.clone().text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: response.status, body: parsed, headers: response.headers, text };
}

async function login(user: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${user.toLowerCase()}@review.example`, password: PASSWORDS[user] } });
  assert.equal(res.status, 200, res.text);
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: res.body.csrfToken };
}

const route = async (p: string) => import(`../app/api/v1/${p}/route`);

before(async () => {
  savedKey = process.env[KEY_NAME];
  process.env[KEY_NAME] = TEST_KEY;
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-import-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  await client.adminUser.create({ data: { id: 'review-a', email: 'a@review.example', name: 'Editor A', role: 'EDITOR', passwordHash: await hashPassword(PASSWORDS.A) } });
  await client.adminUser.create({ data: { id: 'review-b', email: 'b@review.example', name: 'Editor B', role: 'EDITOR', passwordHash: await hashPassword(PASSWORDS.B) } });
  await client.adminUser.create({ data: { id: 'review-p', email: 'p@review.example', name: 'Publisher', role: 'PUBLISHER', passwordHash: await hashPassword(PASSWORDS.P) } });
  Object.assign(h, {
    login: await route('admin/auth/login'),
    preview: await route('admin/imports/preview'), confirm: await route('admin/imports/confirm'), history: await route('admin/imports'),
    process: await route('admin/imports/[id]/process'), template: await route('admin/imports/template'),
    uploads: await route('admin/uploads'), pubHospitals: await route('hospitals'),
    imports: await import('../modules/imports/imports'),
    workbook: await import('../modules/imports/workbook'),
  });
  for (const user of ['A', 'B', 'P'] as const) sessions[user] = await login(user);
});

after(async () => {
  if (savedKey === undefined) delete process.env[KEY_NAME]; else process.env[KEY_NAME] = savedKey;
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ fixtures */

async function sheetBytes(module: string, rows: string[][], headers?: string[]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Records');
  sheet.addRow(headers ?? (h.workbook.columns as Record<string, string[]>)[module]);
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const formFor = (bytes: Uint8Array, module: string, mode: string, extra: Record<string, string> = {}, name = 'import.xlsx') => {
  const form = new FormData();
  form.set('module', module);
  form.set('mode', mode);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set('file', new File([bytes as unknown as BlobPart], name));
  return form;
};
const preview = async (who: keyof typeof PASSWORDS, module: string, mode: string, rows: string[][], extra: Record<string, string> = {}, headers?: string[]) =>
  send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions[who], form: formFor(await sheetBytes(module, rows, headers), module, mode, extra) });
const confirm = (who: keyof typeof PASSWORDS, token: string, extra: { csrf?: boolean; origin?: string | null } = {}) =>
  send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: sessions[who], body: { token }, ...extra });
const processJob = (who: keyof typeof PASSWORDS, id: string, extra: { csrf?: boolean; origin?: string | null } = {}) =>
  send(h.process.POST, 'POST', `/api/v1/admin/imports/${id}/process`, { session: sessions[who], params: { id }, body: {}, ...extra });
const history = (who: keyof typeof PASSWORDS, query = '') => send(h.history.GET, 'GET', `/api/v1/admin/imports${query}`, { session: sessions[who] });
const hospital = (id: string, name = 'Hospital', ta = 'மருத்துவமனை') => [id, name, ta, 'Address', '', 'Chennai'];
async function runAll(who: keyof typeof PASSWORDS, token: string): Promise<{ id: string; job: any }> {
  const confirmed = await confirm(who, token);
  assert.equal(confirmed.status, 200, confirmed.text);
  const id = confirmed.body.data.id as string;
  let job = confirmed.body.data;
  for (let i = 0; i < 60 && job.state !== 'DONE'; i++) {
    const res = await processJob(who, id);
    assert.equal(res.status, 200, res.text);
    job = res.body.data;
  }
  return { id, job };
}
const validToken = async (who: keyof typeof PASSWORDS, id: string) => {
  const res = await preview(who, 'hospitals', 'create', [hospital(id)]);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.valid, true, res.text);
  return res.body.token as string;
};

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const pngBytes = (w: number, hgt: number): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(hgt), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const pdfBytes = (): Uint8Array => new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
async function upload(who: keyof typeof PASSWORDS, kind: 'image' | 'document', name: string, bytes: Uint8Array) {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new File([bytes as unknown as BlobPart], name));
  const res = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: sessions[who], form });
  assert.equal(res.status, 201, res.text);
  return res.body.data.id as string;
}

/* ------------------------------------------------------------------ signing key */

describe('signing key', () => {
  test('a missing or short ADMIN_IMPORT_SIGNING_KEY fails closed with a clear error: no token is signed, nothing falls back to a default key', async () => {
    const rows = [hospital('key-missing')];
    const jobsBefore = await client.contentImport.count();
    for (const bad of [undefined, '', 'short-key', 'x'.repeat(31), ' '.repeat(40)]) {
      if (bad === undefined) delete process.env[KEY_NAME]; else process.env[KEY_NAME] = bad;
      try {
        const res = await preview('A', 'hospitals', 'create', rows);
        assert.ok(res.status >= 400, `preview with key ${JSON.stringify(bad)} must fail, got ${res.status}: ${res.text.slice(0, 200)}`);
        assert.equal(res.body?.token ?? null, null);
        assert.match(res.body?.error?.message ?? '', /ADMIN_IMPORT_SIGNING_KEY/);
        const confirmRes = await confirm('A', 'aaaa.bbbb');
        assert.ok(confirmRes.status >= 400);
        assert.match(confirmRes.body?.error?.message ?? '', /ADMIN_IMPORT_SIGNING_KEY|Invalid import preview/);
      } finally {
        process.env[KEY_NAME] = TEST_KEY;
      }
    }
    assert.equal(await client.contentImport.count(), jobsBefore);
  });

  test('a token signed with another key is refused', async () => {
    const token = await validToken('A', 'other-key');
    process.env[KEY_NAME] = `${TEST_KEY}-rotated`;
    try {
      const res = await confirm('A', token);
      assert.equal(res.status, 400);
    } finally {
      process.env[KEY_NAME] = TEST_KEY;
    }
    assert.equal((await confirm('A', token)).status, 200);
  });
});

/* ------------------------------------------------------------------ authorization */

describe('authorization, CSRF and Origin', () => {
  test('no session: every import route answers 401', async () => {
    const form = formFor(await sheetBytes('hospitals', [hospital('x')]), 'hospitals', 'create');
    assert.equal((await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { form })).status, 401);
    assert.equal((await send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { body: { token: 'a.b' } })).status, 401);
    assert.equal((await send(h.process.POST, 'POST', '/api/v1/admin/imports/x/process', { params: { id: 'x' }, body: {} })).status, 401);
    assert.equal((await send(h.history.GET, 'GET', '/api/v1/admin/imports')).status, 401);
    assert.equal((await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=hospitals')).status, 401);
  });

  test('mutating routes need the CSRF token and an allowed Origin', async () => {
    const token = await validToken('A', 'csrf-1');
    const jobsBefore = await client.contentImport.count();
    const bytes = await sheetBytes('hospitals', [hospital('x')]);
    for (const csrf of [false]) {
      assert.equal((await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, form: formFor(bytes, 'hospitals', 'create'), csrf })).status, 403);
      assert.equal((await confirm('A', token, { csrf })).status, 403);
      assert.equal((await processJob('A', 'whatever', { csrf })).status, 403);
    }
    for (const origin of ['https://evil.example', 'http://127.0.0.1:5174.evil.example', 'null']) {
      assert.equal((await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, form: formFor(bytes, 'hospitals', 'create'), origin })).status, 403, origin);
      assert.equal((await confirm('A', token, { origin })).status, 403, origin);
      assert.equal((await processJob('A', 'whatever', { origin })).status, 403, origin);
    }
    // another user's CSRF token on my session
    const foreign = { ...sessions.A, csrf: sessions.B.csrf };
    assert.equal((await send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: foreign, body: { token } })).status, 403);
    assert.equal(await client.contentImport.count(), jobsBefore);
  });

  test('the template download needs a session; module and directory are validated', async () => {
    const res = await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=hospitals', { session: sessions.A });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="hospitals-template\.xlsx"$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=users', { session: sessions.A })).status, 400);
    assert.equal((await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=../../etc/passwd', { session: sessions.A })).status, 400);
    assert.equal((await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=contacts&directoryId=missing', { session: sessions.A })).status, 400);
    assert.equal((await send(h.template.GET, 'GET', `/api/v1/admin/imports/template?module=contacts&directoryId=${encodeURIComponent("x' OR '1'='1")}`, { session: sessions.A })).status, 400);
  });

  test('an import never publishes: created records are drafts, an update to a published record waits in its draft, and no revision or PUBLISH audit entry exists', async () => {
    await client.hospital.create({ data: { id: 'pub-1', nameEn: 'Live name', nameTa: '', addressEn: 'A', addressTa: '', districtEn: 'D', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '', searchText: 'live name', status: 'PUBLISHED', publishedAt: new Date(), version: 1 } });
    const created = await runAll('A', await validToken('A', 'draft-1'));
    assert.equal(created.job.counts.created, 1);
    const update = await preview('A', 'hospitals', 'update', [['pub-1', 'New name']]);
    assert.equal(update.body.valid, true, update.text);
    const done = await runAll('A', update.body.token);
    assert.equal(done.job.counts.updated, 1);
    const live = await client.hospital.findUniqueOrThrow({ where: { id: 'pub-1' } });
    assert.equal(live.nameEn, 'Live name');
    assert.equal((live.draft as any).nameEn, 'New name');
    assert.equal(live.status, 'PUBLISHED');
    assert.equal((await client.hospital.findUniqueOrThrow({ where: { id: 'draft-1' } })).status, 'DRAFT');
    assert.equal(await client.contentRevision.count(), 0);
    assert.equal(await client.auditLog.count({ where: { action: 'PUBLISH' } }), 0);
    // the public list still shows the live name only
    const pub = await send(h.pubHospitals.GET, 'GET', '/api/v1/hospitals?pageSize=50');
    assert.equal(pub.status, 200);
    assert.ok(!pub.text.includes('New name'));
    assert.ok(!pub.text.includes('draft-1'));
  });
});

/* ------------------------------------------------------------------ signed preview */

describe('signed preview payload', () => {
  test('tampering with any part of the token is refused (payload, signature, structure, non-ASCII signature)', async () => {
    const token = await validToken('A', 'tamper-1');
    const jobsBefore = await client.contentImport.count();
    const [data, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString());
    const reencode = (patch: Record<string, unknown>) => Buffer.from(JSON.stringify({ ...decoded, ...patch })).toString('base64url');
    const attempts = [
      `${reencode({ module: 'documents' })}.${signature}`,
      `${reencode({ mode: 'update' })}.${signature}`,
      `${reencode({ actor: 'review-b' })}.${signature}`,
      `${reencode({ expires: Date.now() + 10 ** 12 })}.${signature}`,
      `${reencode({ rows: [] })}.${signature}`,
      `${data}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`,
      `${data}.`, `.${signature}`, data, '', '.', `${token}.extra`, `${data}.${signature}.${signature}`,
      `${data}.${'é'.repeat(signature.length)}`, `${data}.${'த'.repeat(signature.length)}`, `${data}.${signature.slice(0, 10)}\u0000${signature.slice(11)}`,
    ];
    for (const attempt of attempts) {
      const res = await confirm('A', attempt);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(attempt).slice(0, 60)}..., got ${res.status}`);
    }
    for (const body of [{}, { token: 5 }, { token: null }, { token: ['a'] }, { token: { a: 1 } }]) {
      assert.equal((await send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: sessions.A, body })).status, 400);
    }
    assert.equal(await client.contentImport.count(), jobsBefore);
  });

  test('replay across users is refused: B cannot confirm A\'s token', async () => {
    const token = await validToken('A', 'replay-user');
    assert.equal((await confirm('B', token)).status, 400);
    assert.equal(await client.contentImport.count({ where: { actorId: 'review-b' } }), 0);
  });

  test('an expired preview is refused', async () => {
    const { encodePlan, decodePlan } = h.imports;
    const token = await validToken('A', 'expired-1');
    const plan = decodePlan(token, 'review-a');
    const expired = encodePlan({ ...plan, expires: Date.now() - 1000, nonce: crypto.randomUUID() });
    const res = await confirm('A', expired);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /expired/i);
  });

  test('confirming twice returns the same job and never duplicates rows', async () => {
    const token = await validToken('A', 'double-1');
    const [first, second] = await Promise.all([confirm('A', token), confirm('A', token)]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.data.id, second.body.data.id);
    assert.equal(await client.contentImport.count({ where: { id: first.body.data.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { action: 'IMPORT_START', entityId: first.body.data.id } }), 1);
    const done = await runAll('A', token);
    assert.equal(done.job.counts.created, 1);
    // a replay after completion neither re-runs nor resets the job
    const again = await confirm('A', token);
    assert.equal(again.body.data.state, 'DONE');
    assert.equal(again.body.data.counts.created, 1);
    assert.equal(await client.hospital.count({ where: { id: 'double-1' } }), 1);
  });

  test('a token made for one version of a record cannot overwrite a newer one (stale update fails per row, nothing is lost)', async () => {
    await client.hospital.create({ data: { id: 'ver-1', nameEn: 'Original', nameTa: '', addressEn: 'A', addressTa: '', districtEn: 'D', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '', searchText: 'original', status: 'DRAFT', version: 1 } });
    const update = await preview('A', 'hospitals', 'update', [['ver-1', 'Imported']]);
    assert.equal(update.body.valid, true, update.text);
    await client.hospital.update({ where: { id: 'ver-1' }, data: { nameEn: 'Edited meanwhile', version: { increment: 1 } } });
    const done = await runAll('A', update.body.token);
    assert.equal(done.job.counts.failed, 1);
    assert.equal((await client.hospital.findUniqueOrThrow({ where: { id: 'ver-1' } })).nameEn, 'Edited meanwhile');
  });
});

/* ------------------------------------------------------------------ job ownership */

describe('job ownership', () => {
  test('user B can neither see, process nor resume a job of user A', async () => {
    const { id } = await runAll('A', await validToken('A', 'owner-1'));
    const before = await client.contentImport.findUniqueOrThrow({ where: { id } });
    const asB = await processJob('B', id);
    assert.equal(asB.status, 404);
    assert.ok(!asB.text.includes('owner-1'));
    const list = await history('B');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data, []);
    assert.ok(!list.text.includes('owner-1'));
    const mine = await history('A');
    assert.ok(mine.body.data.some((job: any) => job.id === id));
    assert.deepEqual(await client.contentImport.findUniqueOrThrow({ where: { id } }), before);
    // an unfinished job of A is not advanced by B either
    const token = (await preview('A', 'hospitals', 'create', [hospital('owner-2'), hospital('owner-3')])).body.token as string;
    const jobId = (await confirm('A', token)).body.data.id as string;
    assert.equal((await processJob('B', jobId)).status, 404);
    assert.equal((await client.contentImport.findUniqueOrThrow({ where: { id: jobId } })).cursor, 0);
    assert.equal((await processJob('A', 'does-not-exist-0000')).status, 404);
    assert.equal((await processJob('A', "x'; DROP TABLE \"ContentImport\"; --")).status, 404);
  });

  test('the history filter validates the module', async () => {
    assert.equal((await history('A', '?module=hospitals')).status, 200);
    assert.equal((await history('A', '?module=nope')).status, 400);
    assert.equal((await history('A', "?module=hospitals'--")).status, 400);
  });
});

/* ------------------------------------------------------------------ upload handling */

describe('upload handling', () => {
  test('bad uploads are 400 with a clear message: wrong name, wrong mode/module, oversized, not a workbook, no file', async () => {
    const bytes = await sheetBytes('hospitals', [hospital('x')]);
    const post = (form: FormData) => send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, form });
    assert.equal((await post(formFor(bytes, 'hospitals', 'create', {}, 'import.csv'))).status, 400);
    assert.equal((await post(formFor(bytes, 'hospitals', 'create', {}, 'import.xlsx.exe'))).status, 400);
    assert.equal((await post(formFor(bytes, 'hospitals', 'merge'))).status, 400);
    assert.equal((await post(formFor(bytes, 'users', 'create'))).status, 400);
    assert.equal((await post(formFor(new TextEncoder().encode('MZ\u0090\u0000 not a workbook'), 'hospitals', 'create'))).status, 400);
    const noFile = new FormData();
    noFile.set('module', 'hospitals');
    noFile.set('mode', 'create');
    noFile.set('file', 'a string, not a file');
    assert.equal((await post(noFile)).status, 400);
    const big = new Uint8Array(2_100_000);
    const tooBig = await post(formFor(big, 'hospitals', 'create'));
    assert.equal(tooBig.status, 400);
    assert.ok(!/at .*\.ts:\d+|node_modules|[A-Z]:\\/.test(tooBig.text), 'no stack or path in the body');
    const notMultipart = await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, body: { module: 'hospitals' } });
    assert.equal(notMultipart.status, 400);
  });

  test('a hostile workbook reaches the route as a 400, never a 500, and nothing is written', async () => {
    const jobsBefore = await client.contentImport.count();
    const hospitalsBefore = await client.hospital.count();
    const form = formFor(makeXlsx(sheetXml([['id', 'nameEn'], ['x', 'y']]), [{ name: 'xl/vbaProject.bin', data: 'x' }]), 'hospitals', 'create');
    const res = await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, form });
    assert.equal(res.status, 400);
    assert.equal(await client.contentImport.count(), jobsBefore);
    assert.equal(await client.hospital.count(), hospitalsBefore);
  });
});

/* ------------------------------------------------------------------ data semantics */

describe('create and update semantics', () => {
  test('update mode on a missing id and create mode on an existing id are row errors, not writes', async () => {
    const missing = await preview('A', 'hospitals', 'update', [['no-such-hospital', 'Name']]);
    assert.equal(missing.body.valid, false);
    assert.equal(missing.body.token, null);
    assert.equal(missing.body.rows[0].kind, 'invalid');
    await client.hospital.create({ data: { id: 'exists-1', nameEn: 'E', nameTa: '', addressEn: 'A', addressTa: '', districtEn: 'D', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '', searchText: 'e', status: 'DRAFT', version: 1 } });
    const exists = await preview('A', 'hospitals', 'create', [hospital('exists-1')]);
    assert.equal(exists.body.valid, false);
    // ids with characters outside the stable-id alphabet, and over-long ids
    for (const id of ['has space', 'a/b', '../x', 'x'.repeat(65), 'tamil-ஐடி', "o'brien", 'a.b']) {
      const res = await preview('A', 'hospitals', 'create', [hospital(id)]);
      assert.equal(res.body.valid, false, id);
    }
  });

  test('#CLEAR on a required column is refused in every module, blank cells keep the stored value', async () => {
    await client.hospital.create({ data: { id: 'clear-1', nameEn: 'Name', nameTa: 'பெயர்', addressEn: 'A', addressTa: '', districtEn: 'D', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '', searchText: 'name', status: 'DRAFT', version: 1 } });
    const columns = h.workbook.columns as Record<string, string[]>;
    for (const column of ['nameEn', 'addressEn', 'districtEn']) {
      const row = columns.hospitals.map((c) => (c === 'id' ? 'clear-1' : c === column ? '#CLEAR' : ''));
      const res = await preview('A', 'hospitals', 'update', [row]);
      assert.equal(res.body.valid, false, `${column}: ${res.text.slice(0, 200)}`);
    }
    const ok = await preview('A', 'hospitals', 'update', [columns.hospitals.map((c) => (c === 'id' ? 'clear-1' : c === 'nameTa' ? '#CLEAR' : c === 'postcode' ? '600001' : ''))]);
    assert.equal(ok.body.valid, true, ok.text);
    await runAll('A', ok.body.token);
    const row = await client.hospital.findUniqueOrThrow({ where: { id: 'clear-1' } });
    assert.equal(row.nameTa, '');
    assert.equal(row.nameEn, 'Name');
    assert.equal(row.postcode, '600001');

    await client.document.create({ data: { id: 'clear-doc', category: 'enrolment-form', audience: 'all', sortOrder: 1, labelEn: 'L', labelTa: '', titleEn: 'T', titleTa: '', status: 'DRAFT', version: 1 } });
    for (const column of ['category', 'audience', 'labelEn', 'titleEn', 'sortOrder']) {
      const row2 = columns.documents.map((c) => (c === 'id' ? 'clear-doc' : c === column ? '#CLEAR' : ''));
      assert.equal((await preview('A', 'documents', 'update', [row2])).body.valid, false, `documents ${column}`);
    }
    await client.announcement.create({ data: { id: 'clear-notice', kind: 'general', severity: 'notice', messageEn: [{ type: 'text', text: 'm' }], messageTa: [], sortOrder: 0, status: 'DRAFT', version: 1 } });
    for (const column of ['kind', 'severity', 'messageEn']) {
      const row3 = columns.announcements.map((c) => (c === 'id' ? 'clear-notice' : c === column ? '#CLEAR' : ''));
      const res = await preview('A', 'announcements', 'update', [row3]);
      assert.equal(res.body.valid, false, `announcements ${column}: ${res.text.slice(0, 200)}`);
    }
  });

  test('text that looks like a formula or markup is stored as inert text; URLs in cells are validated', async () => {
    const evil = ["=HYPERLINK(\"http://evil.example\",\"x\")", '+1+1', '-2+3', '@SUM(A1)', '<img src=x onerror=alert(1)>'];
    const rows = evil.map((name, i) => {
      return hospital(`inert-${i}`, name);
    });
    const res = await preview('A', 'hospitals', 'create', rows);
    assert.equal(res.status, 200, res.text);
    // formulas are plain text: accepted and stored verbatim (the CSV report neutralises them), markup is not rejected here
    // because hospital names are plain text rendered by React; the point is that nothing is evaluated or rendered as HTML.
    for (const row of res.body.rows) assert.equal(row.errors.length, 0, JSON.stringify(row));
    const columns = h.workbook.columns as Record<string, string[]>;
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://maps.google.com/x', 'https://evil.example/maps', 'https://user:pw@maps.google.com/', 'https://maps.google.com\\@evil.example/']) {
      const row = columns.hospitals.map((c) => (c === 'id' ? 'url-1' : c === 'nameEn' ? 'N' : c === 'addressEn' ? 'A' : c === 'districtEn' ? 'D' : c === 'mapUrl' ? url : ''));
      assert.equal((await preview('A', 'hospitals', 'create', [row])).body.valid, false, url);
    }
  });
});

/* ------------------------------------------------------------------ failure atomicity and concurrency */

describe('processing', () => {
  test('two jobs creating the same id at the same time: exactly one row, the loser fails cleanly without partial rows', async () => {
    const tokenA = (await preview('A', 'hospitals', 'create', [hospital('race-1', 'From A')])).body.token as string;
    const tokenB = (await preview('B', 'hospitals', 'create', [hospital('race-1', 'From B')])).body.token as string;
    const jobA = (await confirm('A', tokenA)).body.data.id as string;
    const jobB = (await confirm('B', tokenB)).body.data.id as string;
    const [a, b] = await Promise.all([processJob('A', jobA), processJob('B', jobB)]);
    assert.equal(a.status, 200, a.text);
    assert.equal(b.status, 200, b.text);
    const results = [a.body.data.results[0], b.body.data.results[0]];
    assert.equal(results.filter((r) => r.state === 'created').length, 1, JSON.stringify(results));
    assert.equal(results.filter((r) => r.state === 'failed').length, 1, JSON.stringify(results));
    assert.equal(await client.hospital.count({ where: { id: 'race-1' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityType: 'hospital', entityId: 'race-1', action: 'CREATE' } }), 1);
    assert.equal(a.body.data.state, 'DONE');
    assert.equal(b.body.data.state, 'DONE');
  });

  test('one failing row does not stop the others and leaves no partial data; asset references are checked', async () => {
    const columns = h.workbook.columns as Record<string, string[]>;
    const keep = await upload('A', 'document', 'keep.pdf', pdfBytes());
    const gone = await upload('A', 'document', 'gone.pdf', pdfBytes());
    const imageId = await upload('A', 'image', 'logo.png', pngBytes(40, 20));
    const rowFor = (id: string, asset: string) => columns.documents.map((c) => ({ id, category: 'enrolment-form', audience: 'all', sortOrder: '1', labelEn: 'L', titleEn: 'T', assetId: asset } as Record<string, string>)[c] ?? '');
    // an IMAGE asset in a document row, an unknown asset and malformed ids are all refused at preview
    for (const bad of [imageId, 'unknown-asset-id', 'x', "a'b", '../../etc/passwd']) {
      const res = await preview('A', 'documents', 'create', [rowFor('doc-bad', bad)]);
      assert.equal(res.body.valid, false, bad);
    }
    // an asset disappears between preview and processing: that row fails, the others still run
    const three = await preview('A', 'documents', 'create', [rowFor('doc-ok-1', keep), rowFor('doc-gone', gone), rowFor('doc-ok-2', keep)]);
    assert.equal(three.body.valid, true, three.text);
    const confirmed = await confirm('A', three.body.token);
    await client.mediaAsset.deleteMany({ where: { id: gone } });
    const res = await processJob('A', confirmed.body.data.id);
    assert.equal(res.body.data.state, 'DONE');
    assert.deepEqual(res.body.data.results.map((r: any) => r.state), ['created', 'failed', 'created']);
    assert.equal(await client.document.count({ where: { id: 'doc-gone' } }), 0);
    assert.equal(await client.document.count({ where: { id: { in: ['doc-ok-1', 'doc-ok-2'] } } }), 2);
    assert.equal(await client.auditLog.count({ where: { entityType: 'document', action: 'CREATE', entityId: 'doc-gone' } }), 0);
    for (const r of res.body.data.results) assert.ok(!/prisma|invocation|\bat \w|stack|\.ts:/i.test(r.message ?? ''), r.message);
  });

  test('processing is resumable and bounded: ten rows per request, progress survives, a finished job is a no-op', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => hospital(`batch-${i}`));
    const token = (await preview('A', 'hospitals', 'create', rows)).body.token as string;
    const id = (await confirm('A', token)).body.data.id as string;
    assert.equal((await processJob('A', id)).body.data.cursor, 10);
    assert.equal((await processJob('A', id)).body.data.cursor, 20);
    const last = await processJob('A', id);
    assert.equal(last.body.data.state, 'DONE');
    assert.equal(last.body.data.counts.created, 25);
    const again = await processJob('A', id);
    assert.equal(again.body.data.cursor, 25);
    assert.equal(await client.hospital.count({ where: { id: { startsWith: 'batch-' } } }), 25);
    assert.equal(await client.auditLog.count({ where: { action: 'IMPORT_COMPLETE', entityId: id } }), 1);
  });

  test('Tamil text round-trips through workbook, preview, job and database without change', async () => {
    const text = 'சென்னை மருத்துவக் கல்லூரி மற்றும் மருத்துவமனை — 😀 க்ஷ கொ கௌ';
    const token = (await preview('A', 'hospitals', 'create', [hospital('tamil-rt', text, text)])).body.token as string;
    await runAll('A', token);
    const row = await client.hospital.findUniqueOrThrow({ where: { id: 'tamil-rt' } });
    assert.equal(row.nameEn, text);
    assert.equal(row.nameTa, text);
  });
});

/* ------------------------------------------------------------------ partners */

describe('partners import', () => {
  test('a first import into a never-saved partners document, in workbook order, with a valid logo', async () => {
    const imageId = await upload('A', 'image', 'logo.png', pngBytes(120, 60));
    const docId = await upload('A', 'document', 'doc.pdf', pdfBytes());
    const category = DEFAULT_SITE_CONTENT.partners.categories[0].id;
    const columns = h.workbook.columns as Record<string, string[]>;
    const row = (id: string, extra: Record<string, string> = {}) => columns.partners.map((c) => ({ id, categoryId: category, nameEn: `Partner ${id}`, logoAssetId: imageId, altEn: 'Logo', ...extra } as Record<string, string>)[c] ?? '');

    // a PDF is not a logo, an unknown category and a javascript: url are refused
    assert.equal((await preview('A', 'partners', 'create', [row('bad-logo', { logoAssetId: docId })])).body.valid, false);
    assert.equal((await preview('A', 'partners', 'create', [row('bad-cat', { categoryId: 'nope' })])).body.valid, false);
    assert.equal((await preview('A', 'partners', 'create', [row('bad-url', { url: 'javascript:alert(1)' })])).body.valid, false);
    assert.equal((await preview('A', 'partners', 'create', [row('bad-vis', { visible: 'yes' })])).body.valid, false);
    assert.equal((await preview('A', 'partners', 'create', [row('medi-assist')])).body.valid, false, 'an existing id cannot be created');

    const before = DEFAULT_SITE_CONTENT.partners.partners.map((p) => p.id);
    const res = await preview('A', 'partners', 'create', [row('new-a'), row('new-b'), row('new-c')]);
    assert.equal(res.body.valid, true, res.text);
    const done = await runAll('A', res.body.token);
    assert.equal(done.job.counts.created, 3, JSON.stringify(done.job.results));
    const stored = await client.siteContent.findUniqueOrThrow({ where: { id: 'partners' } });
    assert.equal(stored.status, 'DRAFT');
    const ids = (stored.value as any).partners.map((p: any) => p.id);
    assert.deepEqual(ids, [...before, 'new-a', 'new-b', 'new-c'], 'imported partners keep the order of the workbook');
    assert.equal(await client.siteContent.count({ where: { status: 'PUBLISHED' } }), 0);
  });
});

/* ------------------------------------------------------------------ deployment state */

describe('missing ContentImport table (migration not applied yet)', () => {
  test('the preview still works and writes nothing; confirm, process and history explain what to do instead of a bare 500', async () => {
    const token = await validToken('A', 'no-table-1');
    await client.$executeRawUnsafe('DROP TABLE "ContentImport"');
    const preview2 = await preview('A', 'hospitals', 'create', [hospital('no-table-2')]);
    assert.equal(preview2.status, 200);
    assert.equal(preview2.body.valid, true);
    for (const res of [
      await confirm('A', token),
      await processJob('A', 'whatever-job-id'),
      await history('A'),
    ]) {
      assert.equal(res.status, 503, res.text);
      assert.equal(res.body.error.code, 'MIGRATION_REQUIRED');
      assert.match(res.body.error.message, /migration/i);
      assert.ok(!/ContentImport|relation|prisma|SELECT/i.test(res.body.error.message.replace(/20261015110000_content_import/, '')), res.body.error.message);
    }
    assert.equal(await client.hospital.count({ where: { id: { in: ['no-table-1', 'no-table-2'] } } }), 0);
  });
});
