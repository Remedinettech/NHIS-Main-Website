/**
 * Second independent review of the Excel import (see review-imports.test.ts for the first): the largest allowed workbook,
 * two workers on one job, a crash in the middle of a row, ids that collide across modules, hostile directory columns,
 * request body limits and the order of imported partners. Real routes, real sessions, real PostgreSQL schema.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT } from '@nhis/shared-types';
import { ADMIN_TEST_SCHEMA, createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

const ORIGIN = 'http://127.0.0.1:5174';
const KEY_NAME = 'ADMIN_IMPORT_SIGNING_KEY';
const TEST_KEY = 'review2-signing-key-0123456789abcdef-0123456789';
const PASSWORDS = { A: 'Editor-A-Passphrase-Long-1', B: 'Editor-B-Passphrase-Long-2' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
const saved: Record<string, string | undefined> = {};
/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};
interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers; text: string }
const sessions = {} as Record<keyof typeof PASSWORDS, Session>;

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; raw?: BodyInit; params?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
  if (opts.session) { headers.Cookie = opts.session.cookie; headers['X-CSRF-Token'] = opts.session.csrf; }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.raw !== undefined) { headers['Content-Type'] = 'application/json'; body = opts.raw; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const response = await handler(new Request(`http://localhost${url}`, { method, headers, body, ...(opts.raw !== undefined && typeof opts.raw !== 'string' ? { duplex: 'half' } : {}) } as RequestInit), opts.params ? ctx(opts.params) : undefined);
  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: response.status, body: parsed, headers: response.headers, text };
}
const route = async (p: string) => import(`../app/api/v1/${p}/route`);
async function login(user: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${user.toLowerCase()}@review2.example`, password: PASSWORDS[user] } });
  assert.equal(res.status, 200, res.text);
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: res.body.csrfToken };
}

before(async () => {
  for (const name of [KEY_NAME, 'ADMIN_IMPORT_MAX_ROWS', 'ADMIN_IMPORT_MAX_BYTES']) saved[name] = process.env[name];
  process.env[KEY_NAME] = TEST_KEY;
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review2-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  for (const user of ['A', 'B'] as const) {
    await client.adminUser.create({ data: { id: `r2-${user.toLowerCase()}`, email: `${user.toLowerCase()}@review2.example`, name: `Editor ${user}`, role: 'EDITOR', passwordHash: await hashPassword(PASSWORDS[user]) } });
  }
  Object.assign(h, {
    login: await route('admin/auth/login'), uploads: await route('admin/uploads'),
    preview: await route('admin/imports/preview'), confirm: await route('admin/imports/confirm'), history: await route('admin/imports'),
    process: await route('admin/imports/[id]/process'), template: await route('admin/imports/template'),
    workbook: await import('../modules/imports/workbook'), imports: await import('../modules/imports/imports'),
  });
  for (const user of ['A', 'B'] as const) sessions[user] = await login(user);
});
after(async () => {
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

const columns = (module: string): string[] => (h.workbook.columns as Record<string, string[]>)[module];
async function workbook(headers: string[], rows: string[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Records');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const formFor = (bytes: Uint8Array, module: string, mode: string, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.set('module', module);
  form.set('mode', mode);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set('file', new File([bytes as unknown as BlobPart], 'import.xlsx'));
  return form;
};
const preview = async (who: keyof typeof PASSWORDS, module: string, mode: string, rows: string[][], extra: Record<string, string> = {}, headers = columns(module)) =>
  send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions[who], form: formFor(await workbook(headers, rows), module, mode, extra) });
const confirm = (who: keyof typeof PASSWORDS, token: string) => send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: sessions[who], body: { token } });
const processJob = (who: keyof typeof PASSWORDS, id: string) => send(h.process.POST, 'POST', `/api/v1/admin/imports/${id}/process`, { session: sessions[who], params: { id }, body: {} });
const hospital = (id: string, name = 'Hospital'): string[] => columns('hospitals').map((c) => ({ id, nameEn: name, addressEn: 'Address', districtEn: 'Chennai' } as Record<string, string>)[c] ?? '');
async function runAll(who: keyof typeof PASSWORDS, token: string): Promise<{ id: string; job: any }> {
  const confirmed = await confirm(who, token);
  assert.equal(confirmed.status, 200, confirmed.text);
  const id = confirmed.body.data.id as string;
  let job = confirmed.body.data;
  for (let i = 0; i < 400 && job.state !== 'DONE'; i++) {
    const res = await processJob(who, id);
    assert.equal(res.status, 200, res.text);
    job = res.body.data;
  }
  return { id, job };
}

/* ------------------------------------------------------------------ limits */

describe('the largest allowed workbook', () => {
  test('2000 rows of large (but valid) text: the preview, the token and a first batch stay within time, memory and the signed-plan limit', async () => {
    process.env.ADMIN_IMPORT_MAX_ROWS = '2000';
    process.env.ADMIN_IMPORT_MAX_BYTES = '5000000';
    const text = (seed: number, length: number) => Array.from({ length: Math.ceil(length / 12) }, (_, i) => ((seed * 7919 + i * 104729) % 1_000_003).toString(36).padStart(5, '0') + ' ' + i.toString(36)).join(' ').slice(0, length);
    const rows = Array.from({ length: 2000 }, (_, i) => columns('hospitals').map((c) => ({
      id: `big-${i}`, nameEn: text(i, 190), nameTa: text(i + 1, 190), addressEn: text(i + 2, 590), addressTa: text(i + 3, 590), districtEn: 'Chennai', districtTa: text(i + 4, 90),
      stateEn: 'Tamil Nadu', specialty: text(i + 5, 1900), contact: text(i + 6, 490),
    } as Record<string, string>)[c] ?? ''));
    const bytes = await workbook(columns('hospitals'), rows);
    assert.ok(bytes.length <= 5_000_000, `fixture is ${bytes.length} bytes`);
    let peak = 0;
    const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 25);
    const base = process.memoryUsage().rss;
    const started = Date.now();
    try {
      const res = await send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.A, form: formFor(bytes, 'hospitals', 'create') });
      const elapsed = Date.now() - started;
      assert.equal(res.status, 200, res.text.slice(0, 300));
      assert.equal(res.body.rows.length, 2000);
      assert.equal(res.body.valid, true, JSON.stringify(res.body.rows.find((r: any) => r.errors.length)));
      assert.ok(res.body.token.length < 15_000_000, `token of ${res.body.token.length} characters`);
      console.log(`largest workbook: ${bytes.length} bytes in, preview ${elapsed} ms, token ${res.body.token.length} characters, peak RSS +${Math.round((peak - base) / 1048576)} MB`);
      assert.ok(elapsed < 90_000, `the preview took ${elapsed} ms`);
      const confirmStart = Date.now();
      const job = await confirm('A', res.body.token);
      assert.equal(job.status, 200, job.text.slice(0, 300));
      const batchStart = Date.now();
      const first = await processJob('A', job.body.data.id);
      assert.equal(first.status, 200, first.text.slice(0, 300));
      assert.equal(first.body.data.cursor, 10);
      console.log(`confirm ${batchStart - confirmStart} ms, first batch of 10 rows ${Date.now() - batchStart} ms`);
      assert.ok(Date.now() - batchStart < 60_000);
    } finally {
      clearInterval(sampler);
      delete process.env.ADMIN_IMPORT_MAX_ROWS;
      delete process.env.ADMIN_IMPORT_MAX_BYTES;
    }
    assert.ok(peak - base < 1_500_000_000, `peak memory grew by ${Math.round((peak - base) / 1048576)} MB`);
  });

  test('a confirm body above 16 MB is refused as such, with and without a declared length, and nothing is stored', async () => {
    const jobs = await client.contentImport.count();
    const big = 'a'.repeat(16_100_000);
    const declared = await send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: sessions.A, raw: JSON.stringify({ token: big }), headers: { 'Content-Length': String(big.length + 12) } });
    assert.equal(declared.status, 400);
    assert.match(declared.body.error.message, /too large/i);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new TextEncoder().encode('{"token":"' + 'a'.repeat(1_000_000));
        for (let i = 0; i < 17; i++) controller.enqueue(i === 0 ? chunk : new TextEncoder().encode('a'.repeat(1_000_000)));
        controller.close();
      },
    });
    const streamed = await send(h.confirm.POST, 'POST', '/api/v1/admin/imports/confirm', { session: sessions.A, raw: stream });
    assert.equal(streamed.status, 400, streamed.text.slice(0, 200));
    assert.match(streamed.body.error.message, /too large/i);
    assert.equal(await client.contentImport.count(), jobs);
  });
});

/* ------------------------------------------------------------------ workers and crashes */

describe('processing under concurrency and failure', () => {
  test('two workers on one job: every row is processed exactly once, in order, and the job never goes past its end', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => hospital(`dual-${String(i).padStart(2, '0')}`));
    const token = (await preview('A', 'hospitals', 'create', rows)).body.token as string;
    const id = (await confirm('A', token)).body.data.id as string;
    const results = await Promise.all([processJob('A', id), processJob('A', id), processJob('A', id)]);
    for (const res of results) assert.equal(res.status, 200, res.text);
    let job = (await processJob('A', id)).body.data;
    for (let i = 0; i < 5 && job.state !== 'DONE'; i++) job = (await processJob('A', id)).body.data;
    assert.equal(job.state, 'DONE');
    assert.equal(job.cursor, 25);
    assert.equal(job.results.length, 25);
    assert.deepEqual(job.results.map((r: any) => r.id), rows.map((r) => r[0]), 'results are in workbook order');
    assert.ok(job.results.every((r: any) => r.state === 'created'));
    assert.equal(await client.hospital.count({ where: { id: { startsWith: 'dual-' } } }), 25);
    assert.equal(await client.auditLog.count({ where: { action: 'CREATE', entityType: 'hospital', entityId: { startsWith: 'dual-' } } }), 25);
    assert.equal(await client.auditLog.count({ where: { action: 'IMPORT_COMPLETE', entityId: id } }), 1);
  });

  test('a failure in the middle of a row (here: the checkpoint cannot be written) leaves no partial row, no audit entry and an unchanged cursor; the job then resumes without duplicates', async () => {
    const schema = `"${ADMIN_TEST_SCHEMA}"`;
    await client.$executeRawUnsafe(`CREATE FUNCTION ${schema}.review_fail_at_three() RETURNS trigger AS $$ BEGIN IF NEW."cursor" = 3 THEN RAISE EXCEPTION 'simulated crash'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await client.$executeRawUnsafe(`CREATE TRIGGER review_fail BEFORE UPDATE ON ${schema}."ContentImport" FOR EACH ROW EXECUTE FUNCTION ${schema}.review_fail_at_three()`);
    const rows = Array.from({ length: 6 }, (_, i) => hospital(`crash-${i}`));
    const token = (await preview('A', 'hospitals', 'create', rows)).body.token as string;
    const id = (await confirm('A', token)).body.data.id as string;
    const crashed = await processJob('A', id);
    assert.equal(crashed.status, 500, crashed.text);
    assert.ok(!/simulated|prisma|ContentImport|trigger/i.test(crashed.text), 'no internals in the answer');
    const stored = await client.contentImport.findUniqueOrThrow({ where: { id } });
    assert.equal(stored.cursor, 2);
    assert.equal((stored.results as any[]).length, 2);
    assert.equal(await client.hospital.count({ where: { id: 'crash-2' } }), 0, 'the row of the failed transaction was rolled back');
    assert.equal(await client.auditLog.count({ where: { entityId: 'crash-2' } }), 0);
    assert.equal(await client.hospital.count({ where: { id: { in: ['crash-0', 'crash-1'] } } }), 2, 'rows committed earlier stay');
    await client.$executeRawUnsafe(`DROP TRIGGER review_fail ON ${schema}."ContentImport"`);
    await client.$executeRawUnsafe(`DROP FUNCTION ${schema}.review_fail_at_three()`);
    const resumed = await processJob('A', id);
    assert.equal(resumed.status, 200, resumed.text);
    assert.equal(resumed.body.data.state, 'DONE');
    assert.deepEqual(resumed.body.data.results.map((r: any) => [r.id, r.state]), rows.map((r) => [r[0], 'created']));
    assert.equal(await client.hospital.count({ where: { id: { startsWith: 'crash-' } } }), 6);
    assert.equal(await client.auditLog.count({ where: { action: 'CREATE', entityId: { startsWith: 'crash-' } } }), 6);
  });

  test('a row that fails validation at processing time leaves no trace in the data but is reported, and the later rows still run', async () => {
    const rows = [hospital('late-0'), hospital('late-1'), hospital('late-2')];
    const token = (await preview('A', 'hospitals', 'create', rows)).body.token as string;
    const id = (await confirm('A', token)).body.data.id as string;
    await client.hospital.create({ data: { id: 'late-1', nameEn: 'Taken', nameTa: '', addressEn: 'A', addressTa: '', districtEn: 'D', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '', searchText: 'taken', status: 'DRAFT', version: 1 } });
    const job = (await processJob('A', id)).body.data;
    assert.deepEqual(job.results.map((r: any) => r.state), ['created', 'failed', 'created']);
    assert.equal((await client.hospital.findUniqueOrThrow({ where: { id: 'late-1' } })).nameEn, 'Taken', 'the existing record is untouched');
    assert.equal(await client.auditLog.count({ where: { entityId: 'late-1', action: 'CREATE' } }), 0);
  });
});

/* ------------------------------------------------------------------ ids, headers, hostile directory columns */

describe('identity and naming', () => {
  test('the same id in different modules never crosses over; update mode does not find a record of another module', async () => {
    const docRow = columns('documents').map((c) => ({ id: 'same-id', category: 'enrolment-form', audience: 'all', sortOrder: '1', labelEn: 'Doc', titleEn: 'Doc title' } as Record<string, string>)[c] ?? '');
    const noticeRow = columns('announcements').map((c) => ({ id: 'same-id', kind: 'general', severity: 'notice', messageEn: 'Hello', sortOrder: '0' } as Record<string, string>)[c] ?? '');
    for (const [module, row] of [['hospitals', hospital('same-id')], ['documents', docRow], ['announcements', noticeRow]] as const) {
      const done = await runAll('A', (await preview('A', module, 'create', [row as string[]])).body.token);
      assert.equal(done.job.counts.created, 1, `${module}: ${JSON.stringify(done.job.results)}`);
    }
    assert.equal(await client.hospital.count({ where: { id: 'same-id' } }), 1);
    assert.equal(await client.document.count({ where: { id: 'same-id' } }), 1);
    assert.equal(await client.announcement.count({ where: { id: 'same-id' } }), 1);
    const update = await preview('A', 'documents', 'update', [columns('documents').map((c) => (c === 'id' ? 'same-id' : c === 'titleEn' ? 'Changed title' : ''))]);
    assert.equal(update.body.valid, true, update.text);
    await runAll('A', update.body.token);
    assert.equal((await client.document.findUniqueOrThrow({ where: { id: 'same-id' } })).titleEn, 'Changed title', 'the update reached the document of that module only');
    assert.equal((await client.hospital.findUniqueOrThrow({ where: { id: 'same-id' } })).nameEn, 'Hospital');
    assert.equal((await client.announcement.findUniqueOrThrow({ where: { id: 'same-id' } })).kind, 'general');
  });

  test('prototype-polluting names: header cells, directory column keys and cell values never reach Object.prototype', async () => {
    const dirColumns = [{ key: '__proto__', header: 'Proto', kind: 'text' }, { key: 'constructor', header: 'Ctor', kind: 'text' }, { key: 'A', header: 'Name', kind: 'text' }];
    await client.contactDirectory.create({ data: { id: 'pollute', labelEn: 'Pollute', columns: dirColumns, sortOrder: 9 } });
    const headers = [...columns('contacts'), 'cell.__proto__', 'cell.constructor', 'cell.A'];
    const rows = [['pollute-1', 'pollute', '', '{"polluted":true}', 'x', 'Real name'], ['pollute-2', 'pollute', '', '', '', 'Second']];
    const res = await preview('A', 'contacts', 'create', rows, { directoryId: 'pollute' }, headers);
    assert.equal(res.status, 200, res.text);
    assert.equal(({} as any).polluted, undefined);
    assert.equal(({} as any).x, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
    if (res.body.valid) {
      const done = await runAll('A', res.body.token);
      assert.equal(done.job.counts.failed, 0, JSON.stringify(done.job.results));
      assert.equal(({} as any).polluted, undefined);
      const stored = await client.contact.findUniqueOrThrow({ where: { id: 'pollute-2' } });
      assert.equal((stored.cells as any).A, 'Second');
    }
    // a header row that names prototype members is simply not the template
    for (const name of ['__proto__', 'constructor', 'prototype', 'toString']) {
      const bad = columns('hospitals').map((c) => (c === 'nameTa' ? name : c));
      const result = await preview('A', 'hospitals', 'create', [hospital('proto-x')], {}, bad);
      assert.equal(result.status, 400, name);
    }
    assert.equal(({} as any).polluted, undefined);
  });

  test('the template of a directory is built from its columns and the file name is fixed (no header injection through the module or the directory)', async () => {
    const res = await send(h.template.GET, 'GET', '/api/v1/admin/imports/template?module=contacts&directoryId=pollute', { session: sessions.A });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="contacts-template.xlsx"');
    assert.equal(res.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    for (const module of ['hospitals%0d%0aSet-Cookie:x=1', 'hospitals"; x="', '%00']) assert.equal((await send(h.template.GET, 'GET', `/api/v1/admin/imports/template?module=${module}`, { session: sessions.A })).status, 400, module);
  });
});

/* ------------------------------------------------------------------ partners */

describe('partners keep the order of the workbook', () => {
  const category = DEFAULT_SITE_CONTENT.partners.categories[0].id;
  const logoId = async (): Promise<string> => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 20, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
    const form = new FormData();
    form.set('kind', 'image');
    form.set('file', new File([new Uint8Array(png)], 'logo.png'));
    const res = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: sessions.A, form });
    assert.equal(res.status, 201, res.text);
    return res.body.data.id;
  };
  const partnerRow = (logo: string, id: string, extra: Record<string, string> = {}) => columns('partners').map((c) => ({ id, categoryId: category, nameEn: `Partner ${id}`, logoAssetId: logo, altEn: 'Logo', ...extra } as Record<string, string>)[c] ?? '');
  const stored = async (): Promise<string[]> => ((await client.siteContent.findUniqueOrThrow({ where: { id: 'partners' } })).value as any).partners.map((p: any) => p.id);

  test('new partners with a blank sortOrder end up in workbook order after the existing ones, whatever their number; explicit positions are applied one row after the other', async () => {
    const logo = await logoId();
    const builtIn = DEFAULT_SITE_CONTENT.partners.partners.map((p) => p.id);
    const rows = ['p-one', 'p-two', 'p-three', 'p-four'].map((id) => partnerRow(logo, id));
    const first = await preview('A', 'partners', 'create', rows);
    assert.equal(first.body.valid, true, first.text);
    // the preview already shows the final positions: each row after the previous ones
    assert.deepEqual(first.body.rows.map((r: any) => r.values.position), [0, 1, 2, 3].map((n) => builtIn.length + n));
    await runAll('A', first.body.token);
    assert.deepEqual(await stored(), [...builtIn, 'p-one', 'p-two', 'p-three', 'p-four']);

    // explicit positions are "the resulting position at that moment": p-five goes to the front, p-six after it, p-seven stays last
    const second = await preview('A', 'partners', 'create', [partnerRow(logo, 'p-five', { sortOrder: '0' }), partnerRow(logo, 'p-six', { sortOrder: '1' }), partnerRow(logo, 'p-seven')]);
    assert.equal(second.body.valid, true, second.text);
    await runAll('A', second.body.token);
    assert.deepEqual(await stored(), ['p-five', 'p-six', ...builtIn, 'p-one', 'p-two', 'p-three', 'p-four', 'p-seven']);

    // an update with a blank sortOrder keeps the place; an update with a position moves the partner
    const third = await preview('A', 'partners', 'update', [partnerRow(logo, 'p-one', { nameEn: 'Renamed one' }), partnerRow(logo, 'p-seven', { sortOrder: '0' })]);
    assert.equal(third.body.valid, true, third.text);
    await runAll('A', third.body.token);
    const after = await stored();
    assert.equal(after[0], 'p-seven');
    assert.equal(after.indexOf('p-one'), builtIn.length + 3, 'a blank sortOrder keeps the partner where it is (one place further back after p-seven moved to the front)');
    assert.equal(after.length, builtIn.length + 7);
    assert.equal(((await client.siteContent.findUniqueOrThrow({ where: { id: 'partners' } })).value as any).partners.find((p: any) => p.id === 'p-one').name.en, 'Renamed one');
    assert.equal(await client.siteContent.count({ where: { status: 'PUBLISHED' } }), 0, 'an import never publishes');
  });

  test('a position beyond the end, a repeated id and a partner changed meanwhile are refused or reported, never silently misplaced', async () => {
    const logo = await logoId();
    const beyond = await preview('A', 'partners', 'create', [partnerRow(logo, 'p-far', { sortOrder: '999' })]);
    assert.equal(beyond.body.valid, false);
    const twice = await preview('A', 'partners', 'create', [partnerRow(logo, 'p-dup'), partnerRow(logo, 'p-dup')]);
    assert.equal(twice.body.valid, false);
    const ok = await preview('A', 'partners', 'create', [partnerRow(logo, 'p-late-1'), partnerRow(logo, 'p-late-2')]);
    assert.equal(ok.body.valid, true, ok.text);
    const confirmed = (await confirm('A', ok.body.token)).body.data;
    // somebody saves the partners document between the preview and the first row
    const row = await client.siteContent.findUniqueOrThrow({ where: { id: 'partners' } });
    await client.siteContent.update({ where: { id: 'partners' }, data: { version: row.version + 1 } });
    const job = (await processJob('A', confirmed.id)).body.data;
    assert.deepEqual(job.results.map((r: any) => r.state), ['failed', 'failed']);
    assert.ok(!(await stored()).includes('p-late-1'));
  });
});

/* ------------------------------------------------------------------ history */

describe('history', () => {
  test('lists only the own jobs, newest first, at most 20, without the stored rows', async () => {
    const mine = await send(h.history.GET, 'GET', '/api/v1/admin/imports', { session: sessions.A });
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data.length <= 20);
    assert.ok(mine.body.data.every((job: any) => !('rows' in job) && !('actorId' in job)));
    const times = mine.body.data.map((job: any) => Date.parse(job.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
    assert.deepEqual((await send(h.history.GET, 'GET', '/api/v1/admin/imports', { session: sessions.B })).body.data, []);
  });
});
