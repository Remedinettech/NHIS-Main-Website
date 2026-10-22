/**
 * GET /api/v1/site against a real PostgreSQL schema: it must not depend on the retired SiteSetting rows, it always serves
 * the announcements, and the scheme name, coverage statement, helplines, availability and portals come from the effective
 * header / home / navigation content (the published document, else the built-in content with the legacy overlay).
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT, type HeaderContent, type HomeContent, type NavigationContent } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';

let testDb: AdminTestDb;
let client: PrismaClient;
/* eslint-disable @typescript-eslint/no-explicit-any */
let site: { GET: (request?: Request) => Promise<Response> };

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  site = await import('../app/api/v1/site/route');
});
after(async () => { await testDb?.cleanup(); });
beforeEach(async () => {
  await client.siteContent.deleteMany().catch(() => undefined);
  await client.siteSetting.deleteMany();
  await client.announcement.deleteMany();
});

const get = async (headers: Record<string, string> = {}) => {
  const response = await site.GET(new Request('http://localhost/api/v1/site', { headers }));
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null, text };
};
const publish = (id: string, value: unknown, extra: Record<string, unknown> = {}) =>
  client.siteContent.create({ data: { id, status: 'PUBLISHED', value: value as never, version: 1, publishedAt: new Date(), ...extra } });
const notice = (id: string, extra: Record<string, unknown> = {}) =>
  client.announcement.create({ data: { id, kind: 'general', severity: 'notice', messageEn: [{ type: 'text', text: `Notice ${id}` }], messageTa: [], sortOrder: 0, status: 'PUBLISHED', version: 1, ...extra } });
const header = (): HeaderContent => structuredClone(DEFAULT_SITE_CONTENT.header);
const home = (): HomeContent => structuredClone(DEFAULT_SITE_CONTENT.home);
const navigation = (): NavigationContent => structuredClone(DEFAULT_SITE_CONTENT.navigation);

describe('without the retired SiteSetting rows', () => {
  test('an empty database answers 200 with the built-in content, never 503, and keeps the response shape', async () => {
    const res = await get();
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['announcements', 'availability', 'capturedAt', 'coverageStatement', 'helplines', 'mode', 'portals', 'schemeName']);
    const d = res.body.data;
    assert.deepEqual(d.schemeName, DEFAULT_SITE_CONTENT.home.hero.title);
    assert.deepEqual(d.coverageStatement, DEFAULT_SITE_CONTENT.home.hero.coverageStatement);
    assert.equal(d.availability, '24/7');
    assert.deepEqual(d.helplines.map((h: any) => [h.id, h.number, h.telHref]), [
      ['employee', '1800-233-5666', 'tel:18002335666'], ['pensioner', '1800-233-5544', 'tel:18002335544'], ['login-support', '044 40115088', 'tel:04440115088'],
    ]);
    assert.deepEqual(d.helplines[0].label, { en: 'Employee', ta: 'பணியாளர்' });
    assert.deepEqual(d.portals.map((p: any) => p.id), ['employee', 'pensioner', 'administrator', 'insurer', 'trackClaim']);
    assert.ok(d.portals.every((p: any) => typeof p.href === 'string' && p.href.startsWith('https://') && typeof p.label.en === 'string'));
    assert.ok(!d.portals.some((p: any) => p.id === 'forgotPassword'));
    assert.deepEqual(d.announcements, []);
    assert.equal(d.mode, 'snapshot');
  });

  test('announcements are always served, only when PUBLISHED and inside their window, in their order', async () => {
    const now = Date.now();
    await notice('a-second', { sortOrder: 2 });
    await notice('a-first', { sortOrder: 1 });
    await notice('a-draft', { status: 'DRAFT' });
    await notice('a-archived', { status: 'ARCHIVED' });
    await notice('a-future', { startsAt: new Date(now + 3_600_000) });
    await notice('a-expired', { endsAt: new Date(now - 3_600_000) });
    await notice('a-current', { sortOrder: 3, startsAt: new Date(now - 3_600_000), endsAt: new Date(now + 3_600_000) });
    const res = await get();
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.data.announcements.map((a: any) => a.id), ['a-first', 'a-second', 'a-current']);
    assert.deepEqual(res.body.data.announcements[0].message.en, [{ type: 'text', text: 'Notice a-first' }]);
  });

  test('a stale or damaged SiteSetting row neither breaks the endpoint nor leaks into it', async () => {
    await client.siteSetting.create({ data: { key: 'scheme', value: 'not an object' as never } });
    await client.siteSetting.create({ data: { key: 'helplines', value: { nope: true } as never } });
    await client.siteSetting.create({ data: { key: 'portals', value: [{ id: 'employee', label: '<b>x</b>', labelTa: '', href: 'javascript:alert(1)' }] as never } });
    const res = await get();
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.helplines.length, 3);
    assert.ok(!/javascript:|<b>/.test(res.text));
  });

});

describe('derived from the effective content', () => {
  test('the legacy overlay shows through until a document is published (scheme, coverage, availability, helplines, portal destinations)', async () => {
    await client.siteSetting.create({ data: { key: 'scheme', value: { schemeNameEn: 'Legacy scheme', schemeNameTa: 'பழைய திட்டம்', coverageStatementEn: 'Legacy cover', coverageStatementTa: '', availability: 'Mon-Fri' } } });
    await client.siteSetting.create({ data: { key: 'helplines', value: [{ id: 'legacy', labelEn: 'Legacy line', labelTa: '', number: '1800 111 222', telHref: 'tel:1800111222' }] } });
    await client.siteSetting.create({ data: { key: 'portals', value: [{ id: 'employee', label: 'Staff', labelTa: '', href: 'https://example.org/staff' }] } });
    const d = (await get()).body.data;
    assert.equal(d.schemeName.en, 'Legacy scheme');
    assert.equal(d.schemeName.ta, 'பழைய திட்டம்');
    assert.equal(d.coverageStatement.en, 'Legacy cover');
    assert.equal(d.availability, 'Mon-Fri');
    assert.deepEqual(d.helplines.map((h: any) => [h.id, h.number, h.telHref]), [['legacy', '1800 111 222', 'tel:1800111222']]);
    assert.equal(d.portals.find((p: any) => p.id === 'employee').href, 'https://example.org/staff');
  });

  test('a published header replaces helplines, availability and the portal links; hidden entries and non-https targets are left out', async () => {
    const doc = header();
    doc.availability = '9 to 5';
    doc.helplines = [
      { id: 'one', label: { en: 'Line one', ta: 'ஒன்று' }, number: '+91 44 2345 6789', visible: true },
      { id: 'hidden', label: { en: 'Hidden line', ta: '' }, number: '1800 000 111', visible: false },
    ];
    doc.loginMenu.items = [
      { id: 'staff', label: { en: 'Staff login', ta: '' }, target: { type: 'external', url: 'https://staff.example.org/login' }, visible: true },
      { id: 'secret', label: { en: 'Secret', ta: '' }, target: { type: 'external', url: 'https://secret.example.org/' }, visible: false },
      { id: 'local', label: { en: 'Inside', ta: '' }, target: { type: 'route', path: '/hospitals' }, visible: true },
    ];
    await publish('header', doc);
    const d = (await get()).body.data;
    assert.equal(d.availability, '9 to 5');
    assert.deepEqual(d.helplines, [{ id: 'one', label: { en: 'Line one', ta: 'ஒன்று' }, number: '+91 44 2345 6789', telHref: 'tel:+914423456789' }]);
    assert.deepEqual(d.portals.map((p: any) => p.id), ['staff', 'trackClaim']);
    assert.equal(d.portals[0].href, 'https://staff.example.org/login');
    assert.ok(!d.portals.some((p: any) => p.id === 'secret' || p.id === 'local'));
    assert.ok(!JSON.stringify(d).includes('Hidden line'));
  });

  test('a published home replaces the scheme name and the coverage statement; a published navigation drives the Track Claim link', async () => {
    const homeDoc = home();
    homeDoc.hero.title = { en: 'Renamed scheme', ta: 'புதிய பெயர்' };
    homeDoc.hero.coverageStatement = { en: 'Cover of 10 lakh', ta: '' };
    await publish('home', homeDoc);
    const nav = navigation();
    const menu = nav.items.find((item) => item.type === 'menu' && item.id === 'beneficiary') as any;
    menu.children[0].target = { type: 'external', url: 'https://claims.example.org/track' };
    await publish('navigation', nav);
    const d = (await get()).body.data;
    assert.deepEqual(d.schemeName, { en: 'Renamed scheme', ta: 'புதிய பெயர்' });
    assert.deepEqual(d.coverageStatement, { en: 'Cover of 10 lakh', ta: '' });
    assert.equal(d.portals.find((p: any) => p.id === 'trackClaim').href, 'https://claims.example.org/track');
  });

  test('drafts are never used: a pending draft of a published header and an unpublished row do not appear', async () => {
    const live = header();
    live.availability = 'live-hours';
    const draft = header();
    draft.availability = 'draft-hours';
    await publish('header', live, { draft: draft as never });
    const unpublished = home();
    unpublished.hero.title = { en: 'Unpublished title', ta: '' };
    await client.siteContent.create({ data: { id: 'home', status: 'DRAFT', value: unpublished as never, version: 1 } });
    const res = await get();
    assert.equal(res.body.data.availability, 'live-hours');
    assert.ok(!res.text.includes('draft-hours') && !res.text.includes('Unpublished title'));
  });

  test('a stored document that no longer passes validation falls back to the built-in content instead of failing', async () => {
    await publish('header', { ...header(), helplines: 'broken' });
    const res = await get();
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.helplines.length, 3);
  });

  test('the response revalidates with an ETag and changes when the published content changes', async () => {
    const first = await get();
    assert.match(first.headers.get('cache-control') ?? '', /no-cache/);
    const etag = first.headers.get('etag') as string;
    assert.ok(etag);
    assert.equal((await get({ 'If-None-Match': etag })).status, 304);
    const doc = header();
    doc.availability = 'changed';
    await publish('header', doc);
    assert.equal((await get({ 'If-None-Match': etag })).status, 200);
  });
});

/** Last on purpose: it drops the table for good (the schema is thrown away afterwards). */
describe('missing SiteContent table (migration not applied yet)', () => {
  test('the built-in content is served and the announcements still work', async () => {
    await notice('before-drop');
    await client.$executeRawUnsafe('DROP TABLE "SiteContent"');
    const res = await get();
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.helplines.length, 3);
    assert.deepEqual(res.body.data.announcements.map((a: any) => a.id), ['before-drop']);
  });
});
