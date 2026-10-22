/**
 * Independent review of the site-content routes (admin and public) against a real PostgreSQL schema: hostile request
 * bodies, ids and paths, races between writers, and the behaviour while the SiteContent table does not exist.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT, type SiteContentMap } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORDS = { EDITOR: 'Editor-Passphrase-Long-2', PUBLISHER: 'Publisher-Passphrase-Long-3' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};
interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers; text: string }

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; raw?: string; params?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
  if (opts.session) { headers.Cookie = opts.session.cookie; headers['X-CSRF-Token'] = opts.session.csrf; }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.raw !== undefined) { headers['Content-Type'] = 'application/json'; body = opts.raw; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const response = await handler(new Request(`http://localhost${url}`, { method, headers, body }), opts.params ? ctx(opts.params) : undefined);
  const text = await response.clone().text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: response.status, body: parsed, headers: response.headers, text };
}
async function login(role: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${role.toLowerCase()}@review.example`, password: PASSWORDS[role] } });
  assert.equal(res.status, 200, res.text);
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: res.body.csrfToken };
}
const route = async (p: string) => import(`../app/api/v1/${p}/route`);
const sessions = {} as Record<keyof typeof PASSWORDS, Session>;

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-sc-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  for (const role of ['EDITOR', 'PUBLISHER'] as const) {
    await client.adminUser.create({ data: { email: `${role.toLowerCase()}@review.example`, name: role, role, passwordHash: await hashPassword(PASSWORDS[role]) } });
  }
  const { runImport, defaultSources } = await import('../../prisma/import/import');
  const { createStorageAdapter } = await import('../modules/storage');
  await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });
  Object.assign(h, {
    login: await route('admin/auth/login'),
    scList: await route('admin/site-content'), scItem: await route('admin/site-content/[id]'),
    scAction: await route('admin/site-content/[id]/[action]'), scPreview: await route('admin/site-content/preview'),
    pubSiteContent: await route('site-content'), pubFile: await route('files/[assetId]'),
    uploads: await route('admin/uploads'),
  });
  for (const role of ['EDITOR', 'PUBLISHER'] as const) sessions[role] = await login(role);
});
/** Every test starts without stored documents, revisions or site-content audit entries (the table may have been dropped by the last test). */
beforeEach(async () => {
  await client.siteContent.deleteMany().catch(() => undefined);
  await client.contentRevision.deleteMany({ where: { entityType: 'site-content' } });
  await client.auditLog.deleteMany({ where: { entityType: 'site-content' } });
});
after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

const defaults = (): SiteContentMap => structuredClone(DEFAULT_SITE_CONTENT);
const putRaw = (session: Session, key: string, raw: string, extraHeaders: Record<string, string> = {}) =>
  send(h.scItem.PUT, 'PUT', `/api/v1/admin/site-content/${key}`, { session, params: { id: key }, raw, headers: extraHeaders });
const save = (session: Session, key: string, values: unknown, expectedVersion: unknown) =>
  send(h.scItem.PUT, 'PUT', `/api/v1/admin/site-content/${key}`, { session, params: { id: key }, body: { values, expectedVersion } });
const act = (session: Session, key: string, action: string, expectedVersion: unknown) =>
  send(h.scAction.POST, 'POST', `/api/v1/admin/site-content/${key}/${action}`, { session, params: { id: key, action }, body: { expectedVersion } });
const noRows = async () => assert.equal(await client.siteContent.count(), 0, 'nothing may have been written');
const noLeak = (res: Res) => assert.ok(!/prisma|SELECT |INSERT |relation "|\bat \S+ \(|node_modules|[A-Z]:\\|\.ts:\d+/i.test(res.text), `leaks internals: ${res.text.slice(0, 300)}`);

describe('hostile request bodies', () => {
  test('deeply nested, oversized, malformed and mistyped bodies are 400 (never 500), with no row written', async () => {
    const { editor } = { editor: sessions.EDITOR };
    const nested = `{"values":${'{"a":'.repeat(40_000)}1${'}'.repeat(40_000)},"expectedVersion":0}`;
    const cases: Array<[string, string]> = [
      ['nested', nested],
      ['oversized', JSON.stringify({ values: { filler: 'x'.repeat(400_000) }, expectedVersion: 0 })],
      ['truncated', '{"values":{"title":'],
      ['array body', '[]'],
      ['string body', '"x"'],
      ['null body', 'null'],
      ['invalid utf-8 escape', '{"values":"\\ud800","expectedVersion":0}'],
      ['proto key', '{"values":{},"expectedVersion":0,"__proto__":{"role":"ADMIN"}}'],
      ['constructor key', '{"values":{},"expectedVersion":0,"constructor":{"prototype":{"x":1}}}'],
      ['unknown key', '{"values":{},"expectedVersion":0,"publish":true}'],
    ];
    for (const [name, raw] of cases) {
      const res = await putRaw(editor, 'header', raw);
      assert.equal(res.status, 400, `${name}: ${res.status} ${res.text.slice(0, 120)}`);
      noLeak(res);
    }
    for (const version of ['null', '"0"', '-1', '1.5', '2147483648', '{}', '[]', 'true', '99999999999999999999']) {
      const res = await putRaw(editor, 'header', `{"values":${JSON.stringify(defaults().header)},"expectedVersion":${version}}`);
      assert.equal(res.status, 400, `expectedVersion ${version}: ${res.status}`);
    }
    const missing = await putRaw(editor, 'header', `{"values":${JSON.stringify(defaults().header)}}`);
    assert.equal(missing.status, 400);
    await noRows();
    assert.equal(({} as any).role, undefined);
    assert.equal(({} as any).x, undefined);
    // the same body with a text/plain content type is refused as well
    const plain = await send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/header', { session: editor, params: { id: 'header' }, raw: '{}', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(plain.status, 400);
  });

  test('every string leaf of the header, hostile through the real PUT route: markup and scripts never reach the database', async () => {
    const editor = sessions.EDITOR;
    const header = defaults().header as any;
    const attacks: Array<[string, (doc: any) => void]> = [
      ['title markup', (d) => { d.title.en = '<img src=x onerror=alert(1)>'; }],
      ['tamil markup', (d) => { d.title.ta = '<script>alert(1)</script>'; }],
      ['login url javascript', (d) => { d.loginMenu.items[0].target = { type: 'external', url: 'javascript:alert(1)' }; }],
      ['login url data', (d) => { d.loginMenu.items[0].target = { type: 'external', url: 'data:text/html,<script>alert(1)</script>' }; }],
      ['login url uppercase scheme', (d) => { d.loginMenu.items[0].target = { type: 'external', url: 'JAVASCRIPT:alert(1)' }; }],
      ['route traversal', (d) => { d.loginMenu.items[0].target = { type: 'route', path: '/../admin' }; }],
      ['helpline number', (d) => { d.helplines[0].number = '1800<script>'; }],
      ['emblem built-in svg', (d) => { d.emblem = { assetId: null, builtIn: 'assets/x.svg', alt: { en: 'a', ta: '' }, width: null, height: null }; }],
      ['emblem asset id with quote', (d) => { d.emblem = { assetId: "x' OR '1'='1xxxxx", builtIn: null, alt: { en: 'a', ta: '' }, width: null, height: null }; }],
      ['emblem asset id jsonpath', (d) => { d.emblem = { assetId: '" || true || "', builtIn: null, alt: { en: 'a', ta: '' }, width: null, height: null }; }],
    ];
    for (const [name, mutate] of attacks) {
      const doc = structuredClone(header);
      mutate(doc);
      const res = await save(editor, 'header', doc, 0);
      assert.equal(res.status, 400, name);
      assert.ok(Array.isArray(res.body?.error?.details) && res.body.error.details.length > 0, `${name}: field paths expected`);
      noLeak(res);
    }
    await noRows();
  });

  test('document ids in the path: traversal, encoding, prototype names and long ids are 400/404, never 500', async () => {
    const editor = sessions.EDITOR;
    for (const id of ['__proto__', 'constructor', 'toString', 'header%2F..%2Fx', '../header', 'header ', 'HEADER', 'x'.repeat(300), "header'--", 'head%00er']) {
      const get = await send(h.scItem.GET, 'GET', `/api/v1/admin/site-content/${id}`, { session: editor, params: { id } });
      assert.ok([400, 404].includes(get.status), `GET ${id}: ${get.status}`);
      noLeak(get);
      const put = await save(editor, id, defaults().header, 0);
      assert.ok([400, 404].includes(put.status), `PUT ${id}: ${put.status}`);
      for (const action of ['publish', 'discard-draft', 'unpublish', 'archive', 'restore', 'delete', '__proto__', '']) {
        const res = await act(sessions.PUBLISHER, id, action, 0);
        assert.ok([400, 404, 409].includes(res.status), `POST ${id}/${action}: ${res.status}`);
      }
    }
    await noRows();
  });
});

describe('uploads that try to pass as images', () => {
  const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const png = (extra: number[] = []): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(10), ...be32(10), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...extra]);
  const text = (s: string) => new TextEncoder().encode(s);
  const post = (name: string, bytes: Uint8Array, kind = 'image') => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', new File([bytes as unknown as BlobPart], name));
    return send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: sessions.EDITOR, form } as never);
  };

  test('SVG, HTML and scripts under an image name, and real images under the wrong name, are refused; a PNG with trailing markup is stored as a PNG only', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';
    for (const [name, bytes] of [
      ['logo.png', text(svg)], ['logo.svg', text(svg)], ['logo.svg', png()], ['logo.png.svg', png()], ['logo.html', png()], ['logo.png', text('<html><script>alert(1)</script></html>')],
      ['logo.jpg', png()], ['logo.png', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], ['logo.gif', text('GIF89a')], ['logo.png', new Uint8Array(0)], ['logo', png()], ['.png', png()],
    ] as const) {
      const res = await post(name, bytes as Uint8Array);
      assert.ok([400, 413, 415].includes(res.status), `${name}: ${res.status} ${res.text.slice(0, 100)}`);
      noLeak(res);
    }
    assert.equal((await post('logo.png', png(), 'document')).status >= 400, true, 'an image is not accepted as a document');
    // a polyglot (PNG header, then HTML) is a valid upload by its magic bytes; it is served with the PNG type and nosniff
    const polyglot = await post('logo.png', png(Array.from(text('<script>alert(1)</script>'))));
    assert.equal(polyglot.status, 201, polyglot.text);
    assert.equal(polyglot.body.data.mimeType, 'image/png');
  });
});

describe('public file route', () => {
  test('hostile asset ids never reach SQL as anything but a bound parameter: 404 for all of them', async () => {
    for (const id of ['x" || true || "', "x' OR '1'='1", '$.** ? (@.assetId == "x")', 'abcdefgh" ) || (1==1', '%22%20%7C%7C', 'a'.repeat(65), 'short', '../../etc/passwd', 'abcd efgh', 'ABCDEFGH\u0000', '__proto__']) {
      const res = await send(h.pubFile.GET, 'GET', `/api/v1/files/${encodeURIComponent(id)}`, { params: { assetId: id } });
      assert.equal(res.status, 404, id);
      noLeak(res);
    }
  });
});

describe('legacy settings overlay with hostile stored values', () => {
  test('whatever the old SiteSetting rows hold, the public endpoint answers 200 with valid, markup-free documents', async () => {
    const { validateSiteContent, SITE_CONTENT_KEYS } = await import('@nhis/shared-types');
    const long = 'x'.repeat(10_000);
    const garbage: Array<Record<string, unknown>> = [
      { scheme: 'text', helplines: 'text', portals: 'text' },
      { scheme: [], helplines: {}, portals: 5 },
      { scheme: { schemeNameEn: 5, schemeNameTa: null, coverageStatementEn: [], availability: {} }, helplines: [null, 1, 'a', [], {}, { id: 5 }], portals: [null, {}, { id: 'employee' }, { id: 'employee', href: 5 }] },
      { scheme: { schemeNameEn: '<img src=x onerror=alert(1)>', schemeNameTa: '<b>', coverageStatementEn: '<script>alert(1)</script>', coverageStatementTa: long, availability: '<i>24/7</i>' },
        helplines: [{ id: 'employee', labelEn: '<b>x</b>', labelTa: '', number: '<script>', telHref: 'javascript:alert(1)' }, { id: '__proto__', labelEn: 'x', number: '1234567' }, { id: 'constructor', labelEn: 'x', number: '1234567' }],
        portals: [{ id: 'employee', label: '<b>x</b>', labelTa: '', href: 'javascript:alert(1)' }, { id: 'pensioner', label: 'ok', href: 'data:text/html,x' }, { id: 'insurer', label: long, href: 'https://example.com/' }, { id: '__proto__', label: 'x', href: 'https://example.com/' }, { id: 'forgotPassword', label: 'x', href: 'https://user:pw@example.com/' }] },
      { scheme: { schemeNameEn: 'Name', schemeNameTa: '', coverageStatementEn: 'Text', coverageStatementTa: '', availability: 'tab	here' }, helplines: [], portals: [{ id: 'employee', label: 'Staff', labelTa: 'பணி', href: 'https://example.com/staff' }] },
    ];
    for (const [index, rows] of garbage.entries()) {
      await client.siteSetting.deleteMany();
      for (const [key, value] of Object.entries(rows)) await client.siteSetting.create({ data: { key, value: value as never } });
      const res = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
      assert.equal(res.status, 200, `case ${index}: ${res.text.slice(0, 200)}`);
      for (const key of SITE_CONTENT_KEYS) assert.ok(validateSiteContent(key, res.body.data[key]).ok, `case ${index}: ${key} must validate`);
      const text = JSON.stringify(res.body.data);
      assert.ok(!/<img|<script|<b>|<i>|javascript:|data:text/i.test(text), `case ${index}: hostile value reached the public content`);
      const preview = await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: sessions.EDITOR });
      assert.equal(preview.status, 200, `case ${index}`);
      const first = await send(h.scItem.GET, 'GET', '/api/v1/admin/site-content/header', { session: sessions.EDITOR, params: { id: 'header' } });
      assert.equal(first.status, 200, `case ${index}`);
    }
    await client.siteSetting.deleteMany();
  });
});

describe('races between writers', () => {
  test('two publishes of the same version: one wins, the other is a conflict; exactly one revision is written', async () => {
    const editor = sessions.EDITOR;
    const publisher = sessions.PUBLISHER;
    assert.equal((await save(editor, 'text', { overrides: { 'hospitals.title': { en: 'Race', ta: '' } } }, 0)).status, 200);
    const [a, b] = await Promise.all([act(publisher, 'text', 'publish', 1), act(publisher, 'text', 'publish', 1)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `${a.text} / ${b.text}`);
    assert.equal(await client.contentRevision.count({ where: { entityType: 'site-content', entityId: 'text' } }), 1);
    const row = await client.siteContent.findUniqueOrThrow({ where: { id: 'text' } });
    assert.equal(row.status, 'PUBLISHED');
    assert.equal(row.version, 2);
  });

  test('a save and a publish at the same time: the version decides, nothing is half-written', async () => {
    const editor = sessions.EDITOR;
    const publisher = sessions.PUBLISHER;
    assert.equal((await save(editor, 'text', { overrides: { 'hospitals.title': { en: 'Live', ta: '' } } }, 0)).status, 200);
    assert.equal((await act(publisher, 'text', 'publish', 1)).status, 200);
    assert.equal((await save(editor, 'text', { overrides: { 'hospitals.title': { en: 'Draft 1', ta: '' } } }, 2)).status, 200);
    const current = await client.siteContent.findUniqueOrThrow({ where: { id: 'text' } });
    const [saved, published] = await Promise.all([
      save(editor, 'text', { overrides: { 'hospitals.title': { en: 'Draft 2', ta: '' } } }, current.version),
      act(publisher, 'text', 'publish', current.version),
    ]);
    assert.deepEqual([saved.status, published.status].sort(), [200, 409], `${saved.status} ${published.status}`);
    const after = await client.siteContent.findUniqueOrThrow({ where: { id: 'text' } });
    assert.equal(after.version, current.version + 1);
    // either "Draft 1" was published, or "Draft 2" is the pending draft of the still-unpublished value, never a mixture
    const live = (after.value as any).overrides['hospitals.title'].en;
    const pending = (after.draft as any)?.overrides?.['hospitals.title']?.en;
    // either "Draft 1" was published (and the save lost), or "Draft 2" replaced the pending draft (and the publish lost)
    assert.ok((published.status === 200 && saved.status === 409 && live === 'Draft 1' && pending === undefined) || (saved.status === 200 && published.status === 409 && live === 'Live' && pending === 'Draft 2'), `live=${live} pending=${pending} saved=${saved.status} published=${published.status}`);
  });

  test('two first saves of the same key at the same time: one creates the row, the other is a conflict, never a 500', async () => {
    const editor = sessions.EDITOR;
    const header = defaults().header as any;
    const other = structuredClone(header);
    other.title.en = 'Other title';
    const [a, b] = await Promise.all([save(editor, 'header', header, 0), save(editor, 'header', other, 0)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `${a.text} / ${b.text}`);
    assert.equal(await client.siteContent.count({ where: { id: 'header' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityType: 'site-content', entityId: 'header', action: 'UPDATE' } }), 1);
  });
});

describe('missing SiteContent table (migration not applied yet)', () => {
  test('public and preview paths degrade to the built-in content; admin paths explain what to do and leak nothing', async () => {
    await client.$executeRawUnsafe('DROP TABLE "SiteContent"');
    const pub = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
    assert.equal(pub.status, 200, pub.text);
    assert.ok(pub.body.data.header && pub.body.data.footer);
    const preview = await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: sessions.EDITOR });
    assert.equal(preview.status, 200, preview.text);
    for (const res of [
      await send(h.scList.GET, 'GET', '/api/v1/admin/site-content', { session: sessions.EDITOR }),
      await send(h.scItem.GET, 'GET', '/api/v1/admin/site-content/header', { session: sessions.EDITOR, params: { id: 'header' } }),
      await send(h.scItem.GET, 'GET', '/api/v1/admin/site-content/manual', { session: sessions.EDITOR, params: { id: 'manual' } }),
      await save(sessions.EDITOR, 'header', defaults().header, 0),
      await act(sessions.PUBLISHER, 'header', 'publish', 0),
    ]) {
      assert.equal(res.status, 503, res.text);
      assert.equal(res.body.error.code, 'MIGRATION_REQUIRED');
      assert.match(res.body.error.message, /migration/i);
      assert.ok(!/SiteContent|relation|prisma|SELECT/i.test(res.body.error.message), res.body.error.message);
      assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    }
  });
});
