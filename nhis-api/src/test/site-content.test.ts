/**
 * Admin-managed site content against a real PostgreSQL schema (created and dropped by the owner role, never `public`):
 * the public endpoint and its fallbacks, the draft / preview / publish lifecycle of the six documents, validation with
 * field paths, uploaded images (served only while a PUBLISHED document or page uses them), image blocks in pages and the
 * behaviour while the SiteContent table does not exist. Route handlers are invoked in-process with real cookies.
 */
import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT, SITE_CONTENT_KEYS, type SiteContentKey, type SiteContentMap } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORDS = { ADMIN: 'Correct-Horse-Battery-1', EDITOR: 'Editor-Passphrase-Long-2', PUBLISHER: 'Publisher-Passphrase-Long-3' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;

/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};

interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers }

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; params?: Record<string, string>; headers?: Record<string, string>; csrf?: boolean } = {}): Promise<Res> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
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
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(role: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${role.toLowerCase()}@test.example`, password: PASSWORDS[role] } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  return { cookie, csrf: res.body.csrfToken };
}

const route = async (p: string) => import(`../app/api/v1/${p}/route`);

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-sc-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;

  const { hashPassword } = await import('../common/admin');
  for (const role of ['ADMIN', 'EDITOR', 'PUBLISHER'] as const) {
    await client.adminUser.create({ data: { email: `${role.toLowerCase()}@test.example`, name: `${role} Tester`, role, passwordHash: await hashPassword(PASSWORDS[role]) } });
  }
  // The imported content provides the Documents the built-in links point at and the legacy SiteSetting rows.
  const { runImport, defaultSources } = await import('../../prisma/import/import');
  const { createStorageAdapter } = await import('../modules/storage');
  await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });

  Object.assign(h, {
    login: await route('admin/auth/login'),
    scList: await route('admin/site-content'), scItem: await route('admin/site-content/[id]'),
    scAction: await route('admin/site-content/[id]/[action]'), scPreview: await route('admin/site-content/preview'),
    page: await route('admin/pages/[id]'), pageAction: await route('admin/pages/[id]/[action]'), pagePreview: await route('admin/pages/[id]/preview'),
    documents: await route('admin/documents'), document: await route('admin/documents/[id]'),
    uploads: await route('admin/uploads'), adminFile: await route('admin/files/[assetId]'),
    pubSiteContent: await route('site-content'), pubFile: await route('files/[assetId]'), pubPage: await route('pages/[slug]'),
    adminContent: await import('../modules/admin-content'),
    siteContentAdmin: await import('../modules/admin-content/site-content.admin'),
    engine: await import('../modules/admin-content/engine'),
    filesModule: await import('../modules/files/files.service'),
    repoModule: await import('../modules/site-content/site-content.repository'),
    serviceModule: await import('../modules/site-content/site-content.service'),
    http: await import('../common/utils/http'),
  });
});

after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ fixtures */

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
/** A PNG with a real IHDR of the given size (the image data itself is not needed: only the header is read). */
const pngBytes = (w: number, hgt: number): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(hgt), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
/** A JPEG with APP0, a frame header of the given size and a scan header. */
const jpegBytes = (w: number, hgt: number): Uint8Array => new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, ...be16(hgt), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  0xff, 0xda, 0, 12, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0, 0x12, 0x34, 0xff, 0xd9,
]);
/** A JPEG whose frame header follows ~190 KB of metadata segments (the size is not in the first chunk read from storage). */
const jpegWithLargeMetadata = (w: number, hgt: number): Uint8Array => {
  const segment = [0xff, 0xe1, 0xff, 0xff, ...new Array<number>(65533).fill(0)];
  const small = Array.from(jpegBytes(w, hgt));
  return new Uint8Array([0xff, 0xd8, ...segment, ...segment, ...segment, ...small.slice(2)]);
};
const pdfBytes = (extra = ''): Uint8Array => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n${extra}\n%%EOF`);

const formWith = (kind: string, name: string, bytes: Uint8Array) => {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new File([bytes as unknown as BlobPart], name, { type: 'application/octet-stream' }));
  return form;
};

const defaults = (): SiteContentMap => structuredClone(DEFAULT_SITE_CONTENT);
const clone = <T>(value: T): T => structuredClone(value);
const bi = (en: string, ta = '') => ({ en, ta });

const publicContent = async (): Promise<SiteContentMap> => {
  const res = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};
const record = (session: Session, key: string) => send(h.scItem.GET, 'GET', `/api/v1/admin/site-content/${key}`, { session, params: { id: key } });
const save = (session: Session, key: string, values: unknown, expectedVersion: number, extra: { csrf?: boolean; headers?: Record<string, string> } = {}) =>
  send(h.scItem.PUT, 'PUT', `/api/v1/admin/site-content/${key}`, { session, params: { id: key }, body: { values, expectedVersion }, ...extra });
const act = (session: Session, key: string, action: string, expectedVersion: number, extra: { csrf?: boolean } = {}) =>
  send(h.scAction.POST, 'POST', `/api/v1/admin/site-content/${key}/${action}`, { session, params: { id: key, action }, body: { expectedVersion }, ...extra });
const fieldsOf = (res: Res): string[] => ((res.body?.error?.details ?? []) as Array<{ field: string }>).map((d) => d.field);
const upload = async (session: Session, kind: 'image' | 'document', name: string, bytes: Uint8Array) => {
  const res = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session, form: formWith(kind, name, bytes) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data as { id: string; kind: string; bytes: number };
};
const publicFile = (assetId: string, headers: Record<string, string> = {}) => send(h.pubFile.GET, 'GET', `/api/v1/files/${assetId}`, { params: { assetId }, headers });
const auditCount = () => client.auditLog.count({ where: { entityType: 'site-content' } });
const revisionCount = (key: string) => client.contentRevision.count({ where: { entityType: 'site-content', entityId: key } });

function missingTable(code: 'P2021' | 'P2010'): Error {
  return new Prisma.PrismaClientKnownRequestError(
    code === 'P2021' ? 'The table `public.SiteContent` does not exist in the current database.' : 'Raw query failed. Code: `42P01`. Message: `relation "SiteContent" does not exist`',
    { code, clientVersion: Prisma.prismaVersion.client, meta: code === 'P2021' ? { modelName: 'SiteContent', table: 'public.SiteContent' } : { code: '42P01', message: 'relation "SiteContent" does not exist' } },
  );
}

/** The real client with some members replaced (everything else, including the model delegates, is passed through). */
function proxyClient(overrides: Record<string, unknown>): PrismaClient {
  return new Proxy(client, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in overrides) return overrides[prop];
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** `$queryRaw` that fails with a missing-table error for statements that touch SiteContent and runs the others for real. */
const failingSiteContentQueries = (code: 'P2021' | 'P2010') => ({
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => (strings.join('?').includes('"SiteContent"')
    ? Promise.reject(missingTable(code))
    : (client.$queryRaw as (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>)(strings, ...values)),
});

/* ------------------------------------------------------------------ public endpoint */

describe('public endpoint: nothing saved', () => {
  test('returns the built-in content with revalidation headers; unchanged content is a 304', async () => {
    assert.equal(await client.siteSetting.count(), 3, 'the imported legacy settings are present, so equality below proves the overlay is neutral');
    assert.equal(await client.siteContent.count(), 0);
    const res = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data), [...SITE_CONTENT_KEYS]);
    assert.deepEqual(res.body.data, DEFAULT_SITE_CONTENT);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    const etag = res.headers.get('etag');
    assert.ok(etag);
    assert.equal((await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content', { headers: { 'If-None-Match': etag } })).status, 304);
    // Public reads need no session and carry no admin data.
    assert.ok(!JSON.stringify(res.body).includes('updatedById'));
  });

  test('a draft is never exposed: neither the draft of a published row nor the value of a row that was never published', async () => {
    const home = defaults().home;
    const published = clone(home);
    published.hero.title = bi('Published hero title');
    const pending = clone(home);
    pending.hero.title = bi('DRAFT-ONLY-SECRET hero title');
    const footer = defaults().footer;
    footer.about.text = bi('DRAFT-ONLY-SECRET about text');
    await client.siteContent.create({ data: { id: 'home', status: 'PUBLISHED', value: published as never, draft: pending as never, version: 3 } });
    await client.siteContent.create({ data: { id: 'footer', status: 'DRAFT', value: footer as never, version: 1 } });
    try {
      const content = await publicContent();
      assert.equal(content.home.hero.title.en, 'Published hero title');
      assert.deepEqual(content.footer, DEFAULT_SITE_CONTENT.footer, 'a document that was never published shows the built-in content');
      assert.ok(!JSON.stringify(content).includes('DRAFT-ONLY-SECRET'));
    } finally {
      await client.siteContent.deleteMany();
    }
  });

  test('a published value that does not pass validation falls back to the built-in content (never a 500)', async () => {
    const warn = mock.method(console, 'warn', () => undefined);
    await client.siteContent.create({ data: { id: 'text', status: 'PUBLISHED', value: { overrides: { 'not.a.catalog.key': bi('x') } } as never } });
    await client.siteContent.create({ data: { id: 'footer', status: 'PUBLISHED', value: { html: '<script>alert(1)</script>' } as never } });
    try {
      const res = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, DEFAULT_SITE_CONTENT);
      assert.ok(warn.mock.callCount() >= 2);
    } finally {
      warn.mock.restore();
      await client.siteContent.deleteMany();
    }
  });
});

describe('public endpoint: legacy settings overlay', () => {
  test('SiteSetting rows that differ are laid over the built-in content, but never over a stored document', async () => {
    const original = await client.siteSetting.findMany();
    const setValue = (key: string, value: unknown) => client.siteSetting.update({ where: { key }, data: { value: value as never } });
    await setValue('scheme', { schemeNameEn: 'TN Health Scheme', schemeNameTa: 'தமிழ்நாடு சுகாதாரத் திட்டம்', coverageStatementEn: 'Cover up to 6 lakh', coverageStatementTa: '6 லட்சம் வரை காப்பீடு', availability: '24x7' });
    await setValue('helplines', [
      { id: 'employee', labelEn: 'Employee desk', labelTa: 'பணியாளர் உதவி', number: '1800-111-2222', telHref: 'tel:18001112222' },
      { id: 'login-support', labelEn: 'Login help', labelTa: '', number: '044 1111 2222', telHref: 'tel:04411112222' },
    ]);
    await setValue('portals', [
      { id: 'employee', label: 'Staff', labelTa: 'பணியாளர்', href: 'https://portal.example/employee' },
      { id: 'pensioner', label: 'Pensioners', labelTa: 'ஓய்வூதியம் பெறுவோர்', href: 'http://insecure.example/pensioner' },
      { id: 'trackClaim', label: 'Track Claim', labelTa: 'உரிமைகோரலைக் கண்காணிக்கவும்', href: 'https://portal.example/track' },
      { id: 'forgotPassword', label: 'Forgot Password?', labelTa: 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?', href: 'https://portal.example/forgot' },
      { id: 'hospitalMdIndia', label: 'MD India', labelTa: 'எம்டி இந்தியா', href: 'https://mdindia.example/' },
    ]);
    try {
      const content = await publicContent();
      const external = (url: string) => ({ type: 'external', url });
      assert.deepEqual(content.header.subtitle, bi('TN Health Scheme', 'தமிழ்நாடு சுகாதாரத் திட்டம்'));
      assert.deepEqual(content.home.hero.title, content.header.subtitle);
      assert.deepEqual(content.home.hero.coverageStatement, bi('Cover up to 6 lakh', '6 லட்சம் வரை காப்பீடு'));
      assert.equal(content.header.availability, '24x7');
      assert.deepEqual(content.header.helplines.map((x) => [x.id, x.number]), [['employee', '1800-111-2222'], ['login-support', '044 1111 2222']]);
      assert.deepEqual(content.home.pathways.groups.map((g) => g.helplineId), ['employee', null], 'the pensioner helpline was removed');

      const login = (id: string) => content.header.loginMenu.items.find((item) => item.id === id)!;
      assert.deepEqual(login('employee').target, external('https://portal.example/employee'));
      assert.deepEqual(login('employee').label, bi('Staff', 'பணியாளர்'));
      assert.deepEqual(login('pensioner'), DEFAULT_SITE_CONTENT.header.loginMenu.items[1], 'an http:// address is ignored');
      assert.deepEqual(content.header.loginMenu.forgotPassword.target, external('https://portal.example/forgot'));
      const portals = content.footer.linkGroups.find((g) => g.id === 'portals')!.links;
      assert.deepEqual(portals.find((l) => l.id === 'employee')!.target, external('https://portal.example/employee'));
      assert.deepEqual(portals.find((l) => l.id === 'trackClaim')!.target, external('https://portal.example/track'));
      const pathway = content.home.pathways.groups[0].links.find((l) => l.id === 'employee-login')!;
      assert.deepEqual(pathway.target, external('https://portal.example/employee'));
      assert.deepEqual(pathway.label, DEFAULT_SITE_CONTENT.home.pathways.groups[0].links[3].label);
      assert.deepEqual(content.home.quickAccess.tiles.find((t) => t.id === 'track')!.target, external('https://portal.example/track'));
      assert.deepEqual(content.partners, DEFAULT_SITE_CONTENT.partners);
      assert.deepEqual(content.text, DEFAULT_SITE_CONTENT.text);

      // A stored (published) document is shown as stored: the overlay is only the initial value of a never-saved one.
      const stored = defaults().header;
      stored.title = bi('Stored header title');
      await client.siteContent.create({ data: { id: 'header', status: 'PUBLISHED', value: stored as never } });
      const after = await publicContent();
      assert.deepEqual(after.header, stored);
      assert.deepEqual(after.footer, content.footer, 'documents without a row keep the overlay');
    } finally {
      await client.siteContent.deleteMany();
      for (const row of original) await client.siteSetting.update({ where: { key: row.key }, data: { value: row.value as never } });
    }
    assert.deepEqual(await publicContent(), DEFAULT_SITE_CONTENT);
  });
});

/* ------------------------------------------------------------------ authentication */

describe('admin routes need a session', () => {
  test('every admin site-content route answers 401 without a session cookie; the route files expose only the intended methods', async () => {
    const calls: Array<[string, Promise<Res>]> = [
      ['list', send(h.scList.GET, 'GET', '/api/v1/admin/site-content')],
      ['get', send(h.scItem.GET, 'GET', '/api/v1/admin/site-content/header', { params: { id: 'header' } })],
      ['put', send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/header', { params: { id: 'header' }, body: { values: {}, expectedVersion: 0 } })],
      ['preview', send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview')],
      ...(['publish', 'discard-draft', 'unpublish', 'archive', 'restore'] as const).map((action): [string, Promise<Res>] =>
        [action, send(h.scAction.POST, 'POST', `/api/v1/admin/site-content/header/${action}`, { params: { id: 'header', action }, body: { expectedVersion: 0 } })]),
    ];
    for (const [name, call] of calls) assert.equal((await call).status, 401, name);
    const stale = { cookie: 'nhis-admin.session=not-a-real-session', csrf: 'x' };
    assert.equal((await send(h.scList.GET, 'GET', '/api/v1/admin/site-content', { session: stale })).status, 401);
    assert.equal((await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: stale })).status, 401);

    const methodsOf = (mod: Record<string, unknown>) => Object.keys(mod).filter((name) => /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(name)).sort();
    assert.deepEqual(methodsOf(h.scList), ['GET'], 'documents cannot be created');
    assert.deepEqual(methodsOf(h.scItem), ['GET', 'PUT'], 'no DELETE: documents cannot be deleted');
    assert.deepEqual(methodsOf(h.scAction), ['POST']);
    assert.deepEqual(methodsOf(h.scPreview), ['GET']);
    assert.equal(await client.siteContent.count(), 0);
  });

  test('every role can read; reads never create rows', async () => {
    for (const role of ['EDITOR', 'PUBLISHER', 'ADMIN'] as const) {
      const session = await login(role);
      assert.equal((await send(h.scList.GET, 'GET', '/api/v1/admin/site-content', { session })).status, 200);
      assert.equal((await record(session, 'header')).status, 200);
      assert.equal((await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session })).status, 200);
    }
    assert.equal(await client.siteContent.count(), 0);
  });
});

/* ------------------------------------------------------------------ lifecycle */

describe('lifecycle of a document (header)', () => {
  let editor: Session;
  let publisher: Session;
  let draftValues: SiteContentMap['header'];
  let version = 0;

  before(async () => {
    editor = await login('EDITOR');
    publisher = await login('PUBLISHER');
  });

  test('the list holds the six documents in fixed order as virtual rows with the built-in content', async () => {
    const res = await send(h.scList.GET, 'GET', '/api/v1/admin/site-content', { session: editor });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((r: any) => r.id), [...SITE_CONTENT_KEYS]);
    assert.equal(res.body.total, SITE_CONTENT_KEYS.length);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    for (const r of res.body.data) {
      assert.equal(r.key, r.id);
      assert.equal(r.customised, false);
      assert.equal(r.meta.version, 0);
      assert.equal(r.meta.status, 'DRAFT');
      assert.equal(r.meta.hasDraft, false);
      assert.equal(r.meta.createdAt, '1970-01-01T00:00:00.000Z');
      assert.equal(r.published, null);
      assert.deepEqual(r.values, DEFAULT_SITE_CONTENT[r.id as SiteContentKey]);
    }
    assert.equal((await record(editor, 'nope')).status, 404);
    assert.equal((await record(editor, 'bad key')).status, 400);
    assert.equal((await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: editor })).status, 200);
  });

  test('an editor saves a first draft that stays private; an editor cannot publish', async () => {
    draftValues = defaults().header;
    draftValues.title = bi('TN-NHIS Draft', 'TN-NHIS வரைவு');
    draftValues.subtitle = bi('Draft subtitle', 'புதிய துணைத் தலைப்பு');
    draftValues.helplines.push({ id: 'extra', label: bi('Extra line', 'கூடுதல் எண்'), number: '1800 000 1111', visible: true });
    const audits = await auditCount();
    const res = await save(editor, 'header', draftValues, 0);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.meta.version, 1);
    assert.equal(res.body.data.meta.status, 'DRAFT');
    assert.equal(res.body.data.meta.hasDraft, false);
    assert.equal(res.body.data.meta.updatedByEmail, 'editor@test.example');
    assert.equal(res.body.data.customised, true);
    assert.deepEqual(res.body.data.values, draftValues);
    version = res.body.data.meta.version;
    assert.equal(await auditCount(), audits + 1);

    assert.deepEqual((await publicContent()).header, DEFAULT_SITE_CONTENT.header, 'the first save is not public');
    const denied = await act(editor, 'header', 'publish', version);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
    assert.equal((await client.siteContent.findUniqueOrThrow({ where: { id: 'header' } })).status, 'DRAFT');
    assert.equal(await auditCount(), audits + 1, 'a refused action writes no audit entry');

    const list = await send(h.scList.GET, 'GET', '/api/v1/admin/site-content', { session: editor });
    assert.deepEqual(list.body.data.map((r: any) => r.customised), SITE_CONTENT_KEYS.map(key => key === 'header'));
  });

  test('a publisher publishes; the public site shows it (Tamil intact); a revision and audit entries are written', async () => {
    const audits = await auditCount();
    const res = await act(publisher, 'header', 'publish', version);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.meta.status, 'PUBLISHED');
    assert.equal(res.body.data.meta.version, version + 1);
    assert.ok(res.body.data.meta.publishedAt);
    assert.deepEqual(res.body.data.published, draftValues);
    version = res.body.data.meta.version;

    const content = await publicContent();
    assert.deepEqual(content.header, draftValues);
    assert.equal(content.header.title.ta, 'TN-NHIS வரைவு');
    assert.deepEqual({ ...content, header: DEFAULT_SITE_CONTENT.header }, DEFAULT_SITE_CONTENT, 'other documents are unaffected');

    const revisions = await client.contentRevision.findMany({ where: { entityType: 'site-content', entityId: 'header' } });
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].action, 'PUBLISH');
    assert.equal(revisions[0].version, version);
    assert.deepEqual(revisions[0].payload, draftValues);
    assert.equal(await auditCount(), audits + 1);
    const entry = await client.auditLog.findFirstOrThrow({ where: { entityType: 'site-content', action: 'PUBLISH' } });
    assert.equal(entry.entityId, 'header');
    assert.equal(entry.actorEmail, 'publisher@test.example');
  });

  test('editing published content waits in a draft: the public site keeps the previous value, the preview shows the draft, and publishing makes it public', async () => {
    const pending = clone(draftValues);
    pending.title = bi('DRAFT-ONLY title', 'வரைவு மட்டும்');
    const audits = await auditCount();
    const saved = await save(editor, 'header', pending, version);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.meta.hasDraft, true);
    assert.equal(saved.body.data.meta.status, 'PUBLISHED');
    assert.equal(saved.body.data.values.title.en, 'DRAFT-ONLY title');
    assert.equal(saved.body.data.published.title.en, 'TN-NHIS Draft');
    version = saved.body.data.meta.version;
    assert.equal(await auditCount(), audits + 1);

    const live = JSON.stringify(await publicContent());
    assert.ok(live.includes('TN-NHIS Draft') && !live.includes('DRAFT-ONLY'));
    assert.ok(!JSON.stringify((await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content')).body).includes('DRAFT-ONLY'));

    const preview = await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: editor });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('cache-control'), 'no-store');
    assert.equal(preview.body.data.header.title.en, 'DRAFT-ONLY title');
    assert.deepEqual(preview.body.data.navigation, DEFAULT_SITE_CONTENT.navigation, 'documents without a draft show their effective value');
    assert.deepEqual(Object.keys(preview.body.data), [...SITE_CONTENT_KEYS]);
    assert.equal((await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview')).status, 401);

    const published = await act(publisher, 'header', 'publish', version);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.data.meta.hasDraft, false);
    version = published.body.data.meta.version;
    assert.equal((await publicContent()).header.title.en, 'DRAFT-ONLY title');
    assert.equal(await revisionCount('header'), 2);
  });

  test('a draft can be discarded; saving the live value again leaves no draft', async () => {
    const live = (await record(editor, 'header')).body.data.values as SiteContentMap['header'];
    const pending = clone(live);
    pending.title = bi('Throwaway');
    const saved = await save(editor, 'header', pending, version);
    version = saved.body.data.meta.version;
    assert.equal(saved.body.data.meta.hasDraft, true);
    const audits = await auditCount();
    const discarded = await act(editor, 'header', 'discard-draft', version);
    assert.equal(discarded.status, 200, JSON.stringify(discarded.body));
    assert.equal(discarded.body.data.meta.hasDraft, false);
    assert.equal(discarded.body.data.values.title.en, live.title.en);
    version = discarded.body.data.meta.version;
    assert.equal(await auditCount(), audits + 1);
    assert.equal((await client.auditLog.count({ where: { entityType: 'site-content', action: 'DISCARD_DRAFT' } })), 1);

    const nothing = await act(editor, 'header', 'discard-draft', version);
    assert.equal(nothing.status, 409);
    assert.equal(nothing.body.error.code, 'INVALID_STATE');
    const same = await save(editor, 'header', live, version);
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal(same.body.data.meta.hasDraft, false, 'jsonb key order does not turn an unchanged save into a draft');
    version = same.body.data.meta.version;
    const noChange = await act(publisher, 'header', 'publish', version);
    assert.equal(noChange.status, 409, 'nothing to publish');
  });

  test('a stale expectedVersion is a conflict that returns the latest record', async () => {
    const latest = await record(editor, 'header');
    const stale = Math.max(0, latest.body.data.meta.version - 1);
    const values = latest.body.data.values;
    const edit = await save(editor, 'header', values, stale);
    assert.equal(edit.status, 409);
    assert.equal(edit.body.error.code, 'CONFLICT');
    assert.equal(edit.body.error.current.meta.version, latest.body.data.meta.version);
    assert.deepEqual(edit.body.error.current.values, values);
    const action = await act(publisher, 'header', 'publish', stale);
    assert.equal(action.status, 409);
    assert.ok(action.body.error.current);
    // A document nobody has saved has version 0; claiming another version is a conflict too.
    const virtual = await save(editor, 'partners', defaults().partners, 4);
    assert.equal(virtual.status, 409);
    assert.equal(virtual.body.error.current.meta.version, 0);
    assert.equal(await client.siteContent.count({ where: { id: 'partners' } }), 0);
  });

  test('mutations without CSRF token or from a foreign origin are refused', async () => {
    const latest = (await record(editor, 'header')).body.data;
    const audits = await auditCount();
    assert.equal((await save(editor, 'header', latest.values, latest.meta.version, { csrf: false })).status, 403);
    assert.equal((await save(editor, 'header', latest.values, latest.meta.version, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await act(publisher, 'header', 'discard-draft', latest.meta.version, { csrf: false })).status, 403);
    assert.equal((await act(publisher, 'header', 'publish', latest.meta.version, { csrf: false })).status, 403);
    assert.equal((await record(editor, 'header')).body.data.meta.version, latest.meta.version);
    assert.equal(await auditCount(), audits);
  });

  test('invalid values are refused with the field path of every problem, and nothing is written', async () => {
    const start = { version: (await record(editor, 'header')).body.data.meta.version, audits: await auditCount() };
    const published = await publicContent();
    const header = () => clone(published.header);

    const cases: Array<{ name: string; key: SiteContentKey; mutate: (doc: any) => void; field: string; message?: RegExp }> = [
      { name: 'javascript: link', key: 'header', mutate: (d) => { d.loginMenu.items[0].target = { type: 'external', url: 'javascript:alert(1)' }; }, field: 'loginMenu.items[0].target.url', message: /https/i },
      { name: 'http: link', key: 'header', mutate: (d) => { d.loginMenu.forgotPassword.target = { type: 'external', url: 'http://example.org/reset' }; }, field: 'loginMenu.forgotPassword.target.url', message: /https/i },
      { name: 'data: link on a partner', key: 'partners', mutate: (d) => { d.partners[1].url = 'data:text/html,<b>x</b>'; }, field: 'partners[1].url' },
      { name: 'HTML markup', key: 'header', mutate: (d) => { d.title.en = '<img src=x onerror=alert(1)>'; }, field: 'title.en', message: /HTML/i },
      { name: 'HTML markup in Tamil text', key: 'footer', mutate: (d) => { d.about.text.ta = 'உரை <script>alert(1)</script>'; }, field: 'about.text.ta' },
      { name: 'unknown property', key: 'header', mutate: (d) => { d.onclick = 'alert(1)'; }, field: 'onclick', message: /Unknown/ },
      { name: 'unknown property deep inside', key: 'navigation', mutate: (d) => { d.items[0].href = '/x'; }, field: 'items[0].href' },
      { name: 'unknown route', key: 'navigation', mutate: (d) => { d.items[0].target = { type: 'route', path: '/no-such-page' }; }, field: 'items[0].target.path' },
      { name: 'unknown document', key: 'footer', mutate: (d) => { d.linkGroups[0].links[0].target = { type: 'document', documentId: 'no-such-document' }; }, field: 'linkGroups[0].links[0].target.documentId', message: /document/i },
      { name: 'unknown document in the homepage list', key: 'home', mutate: (d) => { d.documents.documentIds = ['no-such-document']; }, field: 'documents.documentIds[0]' },
      { name: 'unknown uploaded image', key: 'header', mutate: (d) => { d.emblem = { assetId: 'aaaaaaaaaaaaaaaa', builtIn: null, alt: bi('Emblem'), width: null, height: null }; }, field: 'emblem.assetId', message: /exist/i },
      { name: 'invalid asset id', key: 'header', mutate: (d) => { d.emblem.assetId = '../../etc/passwd'; }, field: 'emblem.assetId' },
      { name: 'missing alt text', key: 'partners', mutate: (d) => { d.partners[0].logo.alt = bi(''); }, field: 'partners[0].logo.alt.en' },
      { name: 'unknown text key', key: 'text', mutate: (d) => { d.overrides = { 'no.such.key': bi('x') }; }, field: 'overrides.no.such.key' },
    ];
    for (const c of cases) {
      const doc: any = c.key === 'header' ? header() : clone(DEFAULT_SITE_CONTENT[c.key]);
      c.mutate(doc);
      const res = await save(editor, c.key, doc, c.key === 'header' ? start.version : 0);
      assert.equal(res.status, 400, `${c.name}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'INVALID', c.name);
      assert.ok(fieldsOf(res).includes(c.field), `${c.name}: expected ${c.field} in ${JSON.stringify(fieldsOf(res))}`);
      if (c.message) {
        const detail = (res.body.error.details as Array<{ field: string; message: string }>).find((d) => d.field === c.field);
        assert.match(detail?.message ?? '', c.message, c.name);
      }
    }

    const noValues = await send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/header', { session: editor, params: { id: 'header' }, body: { expectedVersion: start.version } });
    assert.equal(noValues.status, 400);
    assert.deepEqual(fieldsOf(noValues), ['']);
    const notAnObject = await save(editor, 'header', 'x', start.version);
    assert.equal(notAnObject.status, 400);
    const extraBody = await send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/header', { session: editor, params: { id: 'header' }, body: { values: published.header, expectedVersion: start.version, extra: true } });
    assert.equal(extraBody.status, 400);
    assert.equal((await save(editor, 'unknown-key', {}, 0)).status, 404);

    assert.equal((await record(editor, 'header')).body.data.meta.version, start.version);
    assert.equal(await client.siteContent.count({ where: { id: { in: ['partners', 'footer', 'navigation', 'home', 'text'] } } }), 0);
    assert.equal(await auditCount(), start.audits, 'refused saves write no audit entry');
  });

  test('a document that is not an image is refused as an image', async () => {
    const pdf = await upload(editor, 'document', 'not-an-image.pdf', pdfBytes('site content test'));
    const doc = defaults().header;
    doc.emblem = { assetId: pdf.id, builtIn: null, alt: bi('Emblem'), width: null, height: null };
    const res = await save(editor, 'header', doc, (await record(editor, 'header')).body.data.meta.version);
    assert.equal(res.status, 400);
    assert.ok(fieldsOf(res).includes('emblem.assetId'));
    assert.match(res.body.error.details[0].message, /not an image/i);
  });

  test('unpublish, archive, restore and delete are refused and change nothing', async () => {
    const current = (await record(publisher, 'header')).body.data;
    const row = await client.siteContent.findUniqueOrThrow({ where: { id: 'header' } });
    assert.equal(row.status, 'PUBLISHED');
    const audits = await auditCount();
    const revisions = await revisionCount('header');
    for (const action of ['unpublish', 'archive', 'restore'] as const) {
      const res = await act(publisher, 'header', action, current.meta.version);
      assert.equal(res.status, 409, action);
      assert.equal(res.body.error.code, 'INVALID_STATE', action);
    }
    const unknown = await act(publisher, 'header', 'frobnicate', current.meta.version);
    assert.equal(unknown.status, 400);
    // A never-saved document cannot be unpublished or archived either, and the attempt does not create a row.
    for (const action of ['unpublish', 'archive'] as const) {
      const res = await act(publisher, 'partners', action, 0);
      assert.equal(res.status, 409, `virtual ${action}`);
      assert.equal(res.body.error.code, 'INVALID_STATE');
    }
    // There is no DELETE route; the shared handler, if it were mounted, refuses as well.
    const del = await send(h.adminContent.siteContentRoutes.del, 'DELETE', `/api/v1/admin/site-content/header?expectedVersion=${current.meta.version}`, { session: publisher, params: { id: 'header' } });
    assert.equal(del.status, 400);
    assert.equal(del.body.error.code, 'INVALID');
    // The lifecycle engine itself refuses it too (allowDelete = false), whatever route would call it.
    const actor = await client.adminUser.findFirstOrThrow({ where: { role: 'PUBLISHER' } });
    await assert.rejects(
      () => h.engine.deleteRecord(h.siteContentAdmin.siteContentAdapter, { user: { id: actor.id, email: actor.email }, ip: null }, 'header', current.meta.version, async () => undefined),
      (error: any) => error.code === 'INVALID_STATE',
    );
    const create = await send(h.adminContent.siteContentRoutes.create, 'POST', '/api/v1/admin/site-content', { session: publisher, body: { values: {} } });
    assert.equal(create.status, 400);

    const after = await client.siteContent.findUniqueOrThrow({ where: { id: 'header' } });
    assert.equal(after.status, 'PUBLISHED');
    assert.equal(after.version, row.version);
    assert.deepEqual(after.value, row.value);
    assert.equal(await client.siteContent.count({ where: { id: 'partners' } }), 0);
    assert.equal(await auditCount(), audits);
    assert.equal(await revisionCount('header'), revisions);
  });

  test('every successful mutation is audited with the acting user', async () => {
    const entries = await client.auditLog.findMany({ where: { entityType: 'site-content', entityId: 'header' }, orderBy: { createdAt: 'asc' } });
    const actions = entries.map((e) => e.action);
    for (const wanted of ['UPDATE', 'PUBLISH', 'DISCARD_DRAFT']) assert.ok(actions.includes(wanted), `audit has ${wanted}`);
    assert.ok(!actions.includes('UNPUBLISH') && !actions.includes('ARCHIVE') && !actions.includes('DELETE'));
    assert.ok(entries.every((e) => e.actorId !== null && e.actorEmail !== null));
    const publishes = actions.filter((a) => a === 'PUBLISH').length;
    assert.equal(await revisionCount('header'), publishes, 'one revision per publish');
  });
});

describe('other documents', () => {
  let editor: Session;
  let publisher: Session;

  before(async () => {
    editor = await login('EDITOR');
    publisher = await login('PUBLISHER');
  });

  test('publishing a document nobody has saved publishes the built-in content', async () => {
    const res = await act(publisher, 'navigation', 'publish', 0);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.meta.status, 'PUBLISHED');
    assert.equal(res.body.data.meta.version, 1);
    assert.equal(res.body.data.customised, true);
    assert.deepEqual(res.body.data.values, DEFAULT_SITE_CONTENT.navigation);
    assert.deepEqual((await publicContent()).navigation, DEFAULT_SITE_CONTENT.navigation);
    assert.equal(await revisionCount('navigation'), 1);
    const nothing = await act(editor, 'home', 'discard-draft', 0);
    assert.equal(nothing.status, 409);
    assert.equal(nothing.body.error.code, 'INVALID_STATE');
    assert.equal(await client.siteContent.count({ where: { id: 'home' } }), 0);
  });

  test('two first saves at the same time: one wins, the other gets a conflict', async () => {
    const a = defaults().text;
    a.overrides['hospitals.title'] = bi('First editor', '');
    const b = defaults().text;
    b.overrides['hospitals.title'] = bi('Second editor', '');
    const results = await Promise.all([save(editor, 'text', a, 0), save(publisher, 'text', b, 0)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], JSON.stringify(results.map((r) => r.body)));
    const loser = results.find((r) => r.status === 409)!;
    assert.equal(loser.body.error.code, 'CONFLICT');
    assert.equal(loser.body.error.current.meta.version, 1);
    assert.equal(await client.siteContent.count({ where: { id: 'text' } }), 1);
  });

  test('interface text overrides keep Tamil intact and their placeholders are enforced', async () => {
    const current = (await record(editor, 'text')).body.data;
    const values = clone(current.values) as SiteContentMap['text'];
    values.overrides['hospitals.title'] = bi('Hospitals in the network', 'வலையமைப்பு மருத்துவமனைகள்');
    const saved = await save(editor, 'text', values, current.meta.version);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const published = await act(publisher, 'text', 'publish', saved.body.data.meta.version);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual((await publicContent()).text.overrides['hospitals.title'], bi('Hospitals in the network', 'வலையமைப்பு மருத்துவமனைகள்'));
  });

  test('a link to an existing Document is accepted', async () => {
    const document = await client.document.findFirstOrThrow({ select: { id: true } });
    const footer = defaults().footer;
    footer.linkGroups[0].links[0].target = { type: 'document', documentId: document.id };
    const res = await save(editor, 'footer', footer, 0);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.values.linkGroups[0].links[0].target, { type: 'document', documentId: document.id });
  });

  test('a Document that site content links to cannot be hard-deleted until the link is gone', async () => {
    const pdf = await upload(editor, 'document', 'linked-guide.pdf', pdfBytes('linked from the homepage'));
    const values = { category: 'enrolment-guide', audience: 'all', sortOrder: 98, labelEn: 'Linked guide', labelTa: '', titleEn: 'Linked guide', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId: pdf.id, language: null, availabilityNote: null };
    const created = await send(h.documents.POST, 'POST', '/api/v1/admin/documents', { session: editor, body: { values } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const documentId = created.body.data.id as string;
    const remove = () => send(h.document.DELETE, 'DELETE', `/api/v1/admin/documents/${documentId}?expectedVersion=${created.body.data.meta.version}`, { session: publisher, params: { id: documentId } });

    const home = defaults().home;
    home.documents.documentIds = [documentId];
    const linked = await save(editor, 'home', home, 0);
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    const refused = await remove();
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'REFERENCED');

    const unlinked = await save(editor, 'home', defaults().home, linked.body.data.meta.version);
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
    assert.equal((await remove()).status, 200);
  });

  test('a document that has meanwhile been removed blocks publishing with a field path', async () => {
    // The footer was saved above and links to an existing Document. Simulate the Documents module losing that document.
    const row = await client.siteContent.findUniqueOrThrow({ where: { id: 'footer' } });
    const ghost = clone(row.value) as unknown as SiteContentMap['footer'];
    ghost.linkGroups[0].links[0].target = { type: 'document', documentId: 'vanished-document' };
    await client.siteContent.update({ where: { id: 'footer' }, data: { value: ghost as never } });
    try {
      const refused = await act(publisher, 'footer', 'publish', row.version);
      assert.equal(refused.status, 400, JSON.stringify(refused.body));
      assert.equal(refused.body.error.code, 'INVALID');
      assert.ok(fieldsOf(refused).includes('linkGroups[0].links[0].target.documentId'), JSON.stringify(fieldsOf(refused)));
      const after = await client.siteContent.findUniqueOrThrow({ where: { id: 'footer' } });
      assert.equal(after.status, 'DRAFT');
      assert.equal(after.version, row.version);
    } finally {
      await client.siteContent.update({ where: { id: 'footer' }, data: { value: row.value as never } });
    }
  });
});

/* ------------------------------------------------------------------ uploaded images in documents */

describe('uploaded images in site content', () => {
  let editor: Session;
  let publisher: Session;
  let first: { id: string; kind: string; bytes: number };
  let second: { id: string; kind: string; bytes: number };
  const logo = (assetId: string, alt = 'New partner logo', width: number | null = null, height: number | null = null) =>
    ({ assetId, builtIn: null, alt: bi(alt), width, height });
  const withPartner = (doc: SiteContentMap['partners'], assetId: string, width: number | null, height: number | null): SiteContentMap['partners'] => {
    const next = clone(doc);
    next.partners = [...next.partners.filter((p) => p.id !== 'new-partner'), { id: 'new-partner', categoryId: 'service', name: bi('New Partner', 'புதிய கூட்டாளி'), logo: logo(assetId, 'New partner logo', width, height), url: null, visible: true }];
    return next;
  };
  let partnersVersion = 0;

  before(async () => {
    editor = await login('EDITOR');
    publisher = await login('PUBLISHER');
  });

  test('an uploaded image is private before it is used', async () => {
    first = await upload(editor, 'image', 'logo-one.png', pngBytes(37, 19));
    assert.equal(first.kind, 'IMAGE');
    assert.equal((await publicFile(first.id)).status, 404);
    assert.equal((await send(h.adminFile.GET, 'GET', `/api/v1/admin/files/${first.id}`, { session: editor, params: { assetId: first.id } })).status, 200);
  });

  test('saving a draft fills width and height from the stored file and ignores the browser; the draft does not publish the file', async () => {
    const doc = withPartner(defaults().partners, first.id, 5, 7);
    const res = await save(editor, 'partners', doc, 0);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    partnersVersion = res.body.data.meta.version;
    const saved = res.body.data.values.partners.find((p: any) => p.id === 'new-partner');
    assert.deepEqual([saved.logo.width, saved.logo.height], [37, 19], 'sizes come from the file, not from the browser');
    assert.equal(saved.logo.assetId, first.id);
    assert.equal(saved.logo.builtIn, null);
    const stored = await client.siteContent.findUniqueOrThrow({ where: { id: 'partners' } });
    assert.equal(stored.status, 'DRAFT');
    assert.deepEqual((stored.value as any).partners.at(-1).logo.width, 37);
    // A built-in image keeps the size it was given.
    const builtIn = res.body.data.values.partners[0].logo;
    assert.deepEqual([builtIn.builtIn, builtIn.width, builtIn.height], ['assets/united-india-insurance-logo.png', 1012, 763]);

    assert.equal((await publicFile(first.id)).status, 404, 'only a draft references it');
    assert.ok(!JSON.stringify(await publicContent()).includes(first.id));
  });

  test('publishing serves the file publicly (with validators) and exposes the partner with its size', async () => {
    const res = await act(publisher, 'partners', 'publish', partnersVersion);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    partnersVersion = res.body.data.meta.version;
    const file = await publicFile(first.id);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(file.headers.get('content-length'), String(first.bytes));
    const etag = file.headers.get('etag');
    assert.ok(etag);
    assert.equal((await publicFile(first.id, { 'If-None-Match': etag })).status, 304);
    const partner = (await publicContent()).partners.partners.find((p) => p.id === 'new-partner')!;
    assert.deepEqual([partner.logo.assetId, partner.logo.width, partner.logo.height], [first.id, 37, 19]);
  });

  test('an id that only a pending draft references stays private; once the document no longer references an image it is private again', async () => {
    second = await upload(editor, 'image', 'logo-two.jpg', jpegBytes(120, 80));
    const live = (await record(editor, 'partners')).body.data.values as SiteContentMap['partners'];
    const swapped = withPartner(live, second.id, 1, 1);
    const draft = await save(editor, 'partners', swapped, partnersVersion);
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(draft.body.data.meta.hasDraft, true);
    partnersVersion = draft.body.data.meta.version;
    const draftPartner = draft.body.data.values.partners.find((p: any) => p.id === 'new-partner');
    assert.deepEqual([draftPartner.logo.width, draftPartner.logo.height], [120, 80], 'JPEG size read from the frame header');

    assert.equal((await publicFile(first.id)).status, 200, 'the live value still uses the first image');
    assert.equal((await publicFile(second.id)).status, 404, 'the second is referenced by the draft only');
    const preview = await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: editor });
    assert.equal(preview.body.data.partners.partners.find((p: any) => p.id === 'new-partner').logo.assetId, second.id);

    const published = await act(publisher, 'partners', 'publish', partnersVersion);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    partnersVersion = published.body.data.meta.version;
    assert.equal((await publicFile(second.id)).status, 200);
    assert.equal((await publicFile(second.id)).headers.get('content-type'), 'image/jpeg');
    assert.equal((await publicFile(first.id)).status, 404, 'replaced by a document that no longer references it');
  });

  test('a JPEG whose frame header follows large metadata segments is measured', async () => {
    const large = await upload(editor, 'image', 'metadata-heavy.jpg', jpegWithLargeMetadata(77, 55));
    assert.ok(large.bytes > 190_000);
    const live = (await record(editor, 'partners')).body.data;
    const res = await save(editor, 'partners', withPartner(live.values, large.id, null, null), live.meta.version);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = res.body.data.values.partners.find((p: any) => p.id === 'new-partner');
    assert.deepEqual([saved.logo.width, saved.logo.height], [77, 55]);
    partnersVersion = res.body.data.meta.version;
  });

  test('an image whose size cannot be read is refused with the field path', async () => {
    const broken = await upload(editor, 'image', 'broken.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
    const live = (await record(editor, 'partners')).body.data.values as SiteContentMap['partners'];
    const res = await save(editor, 'partners', withPartner(live, broken.id, 10, 10), partnersVersion);
    assert.equal(res.status, 400);
    assert.ok(fieldsOf(res).includes(`partners[${live.partners.length - 1}].logo.assetId`), JSON.stringify(res.body));
    assert.match(res.body.error.details[0].message, /size/i);
    assert.equal((await publicFile(broken.id)).status, 404);
  });

  test('an image too large in pixels is refused', async () => {
    const huge = await upload(editor, 'image', 'huge.png', pngBytes(30000, 100));
    const live = (await record(editor, 'partners')).body.data.values as SiteContentMap['partners'];
    const res = await save(editor, 'partners', withPartner(live, huge.id, null, null), partnersVersion);
    assert.equal(res.status, 400);
    assert.match(res.body.error.details[0].message, /too large/i);
  });

  test('the header images and the footer logos work the same way', async () => {
    const emblem = await upload(editor, 'image', 'emblem.png', pngBytes(400, 300));
    const footerLogo = await upload(editor, 'image', 'footer-logo.png', pngBytes(64, 32));
    const header = defaults().header;
    header.emblem = { assetId: emblem.id, builtIn: null, alt: bi('New emblem'), width: 1, height: 1 };
    const footer = defaults().footer;
    footer.logos = [{ id: 'extra-logo', image: { assetId: footerLogo.id, builtIn: null, alt: bi('Footer logo'), width: null, height: null }, url: 'https://example.org/', visible: true }];
    const headerVersion = (await record(editor, 'header')).body.data.meta.version;
    const footerVersion = (await record(editor, 'footer')).body.data.meta.version;
    const h1 = await save(editor, 'header', header, headerVersion);
    const f1 = await save(editor, 'footer', footer, footerVersion);
    assert.equal(h1.status, 200, JSON.stringify(h1.body));
    assert.equal(f1.status, 200, JSON.stringify(f1.body));
    assert.deepEqual([h1.body.data.values.emblem.width, h1.body.data.values.emblem.height], [400, 300]);
    assert.deepEqual([f1.body.data.values.logos[0].image.width, f1.body.data.values.logos[0].image.height], [64, 32]);
    assert.equal((await publicFile(emblem.id)).status, 404);
    assert.equal((await act(publisher, 'header', 'publish', h1.body.data.meta.version)).status, 200);
    assert.equal((await publicFile(emblem.id)).status, 200);
    assert.equal((await publicFile(footerLogo.id)).status, 404, 'the footer is still a draft');
    assert.equal((await act(publisher, 'footer', 'publish', f1.body.data.meta.version)).status, 200);
    assert.equal((await publicFile(footerLogo.id)).status, 200);
  });

  test('only images are served through site content: a document file referenced there stays private', async () => {
    const pdf = await upload(editor, 'document', 'sneaky.pdf', pdfBytes('referenced by tampered content'));
    const tampered = defaults().footer;
    tampered.logos = [{ id: 'sneaky', image: { assetId: pdf.id, builtIn: null, alt: bi('x'), width: 10, height: 10 }, url: null, visible: true }];
    const row = await client.siteContent.findUniqueOrThrow({ where: { id: 'footer' } });
    await client.siteContent.update({ where: { id: 'footer' }, data: { value: tampered as never } });
    try {
      assert.equal((await publicFile(pdf.id)).status, 404);
    } finally {
      await client.siteContent.update({ where: { id: 'footer' }, data: { value: row.value as never } });
    }
  });

  test('existing document and gallery delivery is unchanged', async () => {
    const asset = await client.mediaAsset.findFirstOrThrow({ where: { documents: { some: { status: 'PUBLISHED' } } } });
    const res = await publicFile(asset.id);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal((await publicFile('nonexistent-asset-id')).status, 404);
    assert.equal((await publicFile('bad id!')).status, 404);
  });
});

/* ------------------------------------------------------------------ page image blocks */

describe('image blocks in pages', () => {
  const slug = 'coverage';
  let editor: Session;
  let publisher: Session;
  let image: { id: string; kind: string; bytes: number };
  let version = 0;
  let initial: any;

  const getPage = (session: Session) => send(h.page.GET, 'GET', `/api/v1/admin/pages/${slug}`, { session, params: { id: slug } });
  const putPage = (session: Session, values: unknown, expectedVersion: number) =>
    send(h.page.PUT, 'PUT', `/api/v1/admin/pages/${slug}`, { session, params: { id: slug }, body: { values, expectedVersion } });
  const publicPage = async () => (await send(h.pubPage.GET, 'GET', `/api/v1/pages/${slug}`, { params: { slug } })).body.data;
  const block = (assetId: string, extra: Record<string, unknown> = {}) => ({ type: 'image', assetId, alt: 'A chart of the coverage', caption: 'Figure 1', ...extra });

  before(async () => {
    editor = await login('EDITOR');
    publisher = await login('PUBLISHER');
  });

  test('save adds an image block with the size read from the file; the draft is private', async () => {
    image = await upload(editor, 'image', 'chart.png', pngBytes(61, 23));
    const current = await getPage(editor);
    assert.equal(current.status, 200);
    initial = current.body.data;
    version = current.body.data.meta.version;
    const values = clone(current.body.data.values);
    values.en.sections[0].blocks.push(block(image.id, { width: 1, height: 1 }));
    values.ta.sections[0].blocks.push(block(image.id, { alt: 'காப்பீட்டு வரைபடம்', caption: undefined }));
    const res = await putPage(editor, values, version);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    version = res.body.data.meta.version;
    const en = res.body.data.values.en.sections[0].blocks.at(-1);
    const ta = res.body.data.values.ta.sections[0].blocks.at(-1);
    assert.deepEqual(en, { type: 'image', assetId: image.id, alt: 'A chart of the coverage', caption: 'Figure 1', width: 61, height: 23 });
    assert.deepEqual(ta, { type: 'image', assetId: image.id, alt: 'காப்பீட்டு வரைபடம்', width: 61, height: 23 }, 'caption is optional');

    assert.ok(!JSON.stringify(await publicPage()).includes(image.id));
    assert.equal((await publicFile(image.id)).status, 404);
    const preview = await send(h.pagePreview.GET, 'GET', `/api/v1/admin/pages/${slug}/preview`, { session: editor, params: { id: slug } });
    assert.ok(JSON.stringify(preview.body).includes(image.id));
  });

  test('publishing shows the block as stored and serves the file', async () => {
    const res = await send(h.pageAction.POST, 'POST', `/api/v1/admin/pages/${slug}/publish`, { session: publisher, params: { id: slug, action: 'publish' }, body: { expectedVersion: version } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    version = res.body.data.meta.version;
    assert.deepEqual(res.body.data.documentIds, initial.documentIds, 'an image block is not a document reference');
    const page = await publicPage();
    assert.deepEqual(page.en.sections[0].blocks.at(-1), { type: 'image', assetId: image.id, alt: 'A chart of the coverage', caption: 'Figure 1', width: 61, height: 23 });
    assert.deepEqual(page.ta.sections[0].blocks.at(-1), { type: 'image', assetId: image.id, alt: 'காப்பீட்டு வரைபடம்', width: 61, height: 23 });
    const file = await publicFile(image.id);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
  });

  test('invalid image blocks are refused with field paths', async () => {
    const live = (await getPage(editor)).body.data;
    const index = live.values.en.sections[0].blocks.length;
    const cases: Array<{ name: string; block: Record<string, unknown>; field: string }> = [
      { name: 'unknown asset', block: block('aaaaaaaaaaaaaaaa'), field: 'assetId' },
      { name: 'malformed asset id', block: block('../x'), field: 'assetId' },
      { name: 'missing alt text', block: { type: 'image', assetId: image.id }, field: 'alt' },
      { name: 'over-long alt text', block: block(image.id, { alt: 'x'.repeat(251) }), field: 'alt' },
      { name: 'over-long caption', block: block(image.id, { caption: 'x'.repeat(301) }), field: 'caption' },
      { name: 'unknown key', block: block(image.id, { src: 'https://evil.example/x.png' }), field: 'src' },
    ];
    for (const c of cases) {
      const values = clone(live.values);
      values.en.sections[0].blocks.push(c.block);
      const res = await putPage(editor, values, live.meta.version);
      assert.equal(res.status, 400, `${c.name}: ${JSON.stringify(res.body)}`);
      assert.ok(fieldsOf(res).includes(`en.sections[0].blocks[${index}].${c.field}`), `${c.name}: ${JSON.stringify(fieldsOf(res))}`);
    }
    const pdf = await upload(editor, 'document', 'page-doc.pdf', pdfBytes('page block'));
    const values = clone(live.values);
    values.ta.sections[0].blocks.push(block(pdf.id));
    const res = await putPage(editor, values, live.meta.version);
    assert.equal(res.status, 400);
    assert.ok(fieldsOf(res).includes(`ta.sections[0].blocks[${live.values.ta.sections[0].blocks.length}].assetId`));
    assert.equal((await getPage(editor)).body.data.meta.version, live.meta.version, 'nothing was saved');
  });

  test('removing the block and publishing makes the file private again', async () => {
    const live = (await getPage(editor)).body.data;
    const values = clone(live.values);
    for (const lang of ['en', 'ta'] as const) {
      values[lang].sections[0].blocks = values[lang].sections[0].blocks.filter((b: any) => b.type !== 'image');
    }
    const saved = await putPage(editor, values, live.meta.version);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((await publicFile(image.id)).status, 200, 'the live page still shows it');
    const res = await send(h.pageAction.POST, 'POST', `/api/v1/admin/pages/${slug}/publish`, { session: publisher, params: { id: slug, action: 'publish' }, body: { expectedVersion: saved.body.data.meta.version } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await publicFile(image.id)).status, 404);
    assert.ok(!JSON.stringify(await publicPage()).includes(image.id));
  });
});

/* ------------------------------------------------------------------ the SiteContent table does not exist yet */

describe('missing SiteContent table', () => {
  test('simulated P2021 and P2010: the repository answers with the built-in content and warns once', async () => {
    for (const code of ['P2021', 'P2010'] as const) {
      const warn = mock.method(console, 'warn', () => undefined);
      try {
        const fake = proxyClient({ siteContent: { findMany: () => Promise.reject(missingTable(code)) } });
        const repository = h.repoModule.createPrismaSiteContentRepository(fake);
        const service = h.serviceModule.createSiteContentService(repository);
        const res: Response = await h.http.handle(() => service.getSiteContent());
        assert.equal(res.status, 200, code);
        assert.deepEqual((await res.json()).data, DEFAULT_SITE_CONTENT, code);
        await h.http.handle(() => service.getSiteContent());
        assert.equal(warn.mock.calls.filter((c) => String(c.arguments[0]).includes('SiteContent table')).length, 1, `${code}: one warning`);
      } finally {
        warn.mock.restore();
      }
    }
  });

  test('other database errors are still reported as such (the fallback is only for a missing table)', async () => {
    const failure = Object.assign(new Error('boom'), { name: 'PrismaClientKnownRequestError', code: 'P2002' });
    const logged = mock.method(console, 'error', () => undefined);
    const fake = proxyClient({ siteContent: { findMany: () => Promise.reject(failure) } });
    const service = h.serviceModule.createSiteContentService(h.repoModule.createPrismaSiteContentRepository(fake));
    try {
      const res: Response = await h.http.handle(() => service.getSiteContent());
      assert.equal(res.status, 500);
    } finally {
      logged.mock.restore();
    }
  });

  test('simulated: the files service treats the missing table as "not referenced" and keeps serving documents', async () => {
    const asset = await client.mediaAsset.findFirstOrThrow({ where: { documents: { some: { status: 'PUBLISHED' } } } });
    // The logo of the partner published earlier: referenced by a PUBLISHED site-content document only.
    const imageAsset = { id: (await publicContent()).partners.partners.find((p) => p.id === 'new-partner')!.logo.assetId as string };
    for (const code of ['P2021', 'P2010'] as const) {
      const warn = mock.method(console, 'warn', () => undefined);
      try {
        const service = h.filesModule.createFilesService(proxyClient(failingSiteContentQueries(code)));
        assert.equal((await service.serve(asset.id)).status, 200, `${code}: documents are still served`);
        await assert.rejects(() => service.serve(imageAsset.id), (error: any) => error.status === 404 && error.code === 'NOT_FOUND', `${code}: an image used only by site content is not served (404, not 500)`);
        await assert.rejects(() => service.serve(imageAsset.id), (error: any) => error.status === 404);
        assert.equal(warn.mock.calls.filter((c) => String(c.arguments[0]).includes('SiteContent table')).length, 1, `${code}: one warning`);
      } finally {
        warn.mock.restore();
      }
    }
    // With the real client the same image is served: the simulation really is what made it private.
    assert.equal((await h.filesModule.createFilesService(client).serve(imageAsset.id)).status, 200);
  });

  test('real: with the table dropped, the public endpoint, the preview and file delivery keep working', async () => {
    const editor = await login('EDITOR');
    const document = await client.mediaAsset.findFirstOrThrow({ where: { documents: { some: { status: 'PUBLISHED' } } } });
    const usedImage = (await publicContent()).partners.partners.find((p) => p.id === 'new-partner')!.logo.assetId as string;
    assert.equal((await publicFile(usedImage)).status, 200, 'served while the table exists');

    await client.$executeRawUnsafe('DROP TABLE "SiteContent"');
    const warn = mock.method(console, 'warn', () => undefined);
    try {
      const res = await send(h.pubSiteContent.GET, 'GET', '/api/v1/site-content');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, DEFAULT_SITE_CONTENT);
      assert.equal((await publicFile(document.id)).status, 200, 'document files are unaffected');
      assert.equal((await publicFile(usedImage)).status, 404, 'an image that only site content used is not served without the table');
      const preview = await send(h.scPreview.GET, 'GET', '/api/v1/admin/site-content/preview', { session: editor });
      assert.equal(preview.status, 200);
      assert.deepEqual(preview.body.data, DEFAULT_SITE_CONTENT);
      assert.ok(warn.mock.calls.some((c) => String(c.arguments[0]).includes('SiteContent table')));
    } finally {
      warn.mock.restore();
    }
  });
});
