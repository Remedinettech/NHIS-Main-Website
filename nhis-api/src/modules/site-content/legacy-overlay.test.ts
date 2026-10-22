import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE_CONTENT, validateSiteContent, SITE_CONTENT_KEYS, type LinkItem, type SiteContentMap } from '@nhis/shared-types';
import { PORTAL_SEED } from '../../../prisma/import/import';
import { repoRoot } from '../../test/helpers';
import { applyLegacySettings, NO_LEGACY_SETTINGS, parseLegacySettings, type LegacySettings } from './legacy-overlay';
import { isMissingTableError } from './missing-table';

/** The SiteSetting rows exactly as the import seeds them (src/data/site.json and PORTAL_SEED). */
function seededRows() {
  const site = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'nhis-api', 'src', 'data', 'site.json'), 'utf8')) as {
    schemeName: { en: string; ta: string }; coverageStatement: { en: string; ta: string }; availability: string;
    helplines: Array<{ id: string; label: { en: string; ta: string }; number: string; telHref: string }>;
  };
  return [
    { key: 'scheme', value: { schemeNameEn: site.schemeName.en, schemeNameTa: site.schemeName.ta, coverageStatementEn: site.coverageStatement.en, coverageStatementTa: site.coverageStatement.ta, availability: site.availability } },
    { key: 'helplines', value: site.helplines.map((h) => ({ id: h.id, labelEn: h.label.en, labelTa: h.label.ta, number: h.number, telHref: h.telHref })) },
    { key: 'portals', value: PORTAL_SEED.map((p) => ({ ...p })) },
  ];
}

const seeded = (): LegacySettings => parseLegacySettings(seededRows());
const withRow = (key: string, value: unknown): LegacySettings => parseLegacySettings(seededRows().map((row) => (row.key === key ? { key, value } : row)));
const schemeRow = (over: Record<string, string>) => ({ ...(seededRows()[0].value as Record<string, string>), ...over });
const apply = (legacy: LegacySettings, base: SiteContentMap = DEFAULT_SITE_CONTENT) => applyLegacySettings(base, legacy);
const loginItem = (content: SiteContentMap, id: string): LinkItem => content.header.loginMenu.items.find((item) => item.id === id) as LinkItem;
const footerPortal = (content: SiteContentMap, id: string): LinkItem => content.footer.linkGroups.find((group) => group.id === 'portals')?.links.find((item) => item.id === id) as LinkItem;
const pathwayLink = (content: SiteContentMap, id: string): LinkItem => content.home.pathways.groups.flatMap((group) => group.links).find((item) => item.id === id) as LinkItem;

beforeEach(() => { mock.method(console, 'warn', () => undefined); });
afterEach(() => { mock.restoreAll(); });

describe('applyLegacySettings', () => {
  test('the seeded settings change nothing, so the site looks the same until someone publishes', () => {
    assert.deepEqual(apply(seeded()), DEFAULT_SITE_CONTENT);
  });

  test('no settings at all give a copy of the built-in content that shares nothing with it', () => {
    const before = JSON.stringify(DEFAULT_SITE_CONTENT);
    const result = apply(NO_LEGACY_SETTINGS);
    assert.deepEqual(result, DEFAULT_SITE_CONTENT);
    result.header.title.en = 'changed';
    result.home.hero.actions.length = 0;
    assert.equal(JSON.stringify(DEFAULT_SITE_CONTENT), before);
  });

  test('applying an edit does not modify the input', () => {
    const before = JSON.stringify(DEFAULT_SITE_CONTENT);
    apply(withRow('scheme', schemeRow({ schemeNameEn: 'Another name', coverageStatementEn: 'Other cover' })));
    assert.equal(JSON.stringify(DEFAULT_SITE_CONTENT), before);
  });

  test('every document the overlay produces still passes the shared validator', () => {
    const result = apply(withRow('scheme', schemeRow({ schemeNameEn: 'Another name', availability: '' })));
    for (const key of SITE_CONTENT_KEYS) assert.equal(validateSiteContent(key, result[key]).ok, true, key);
  });

  test('a changed scheme name goes to the header subtitle and the hero title; the seeded name keeps the header spelling', () => {
    const edited = apply(withRow('scheme', schemeRow({ schemeNameEn: '  TN Health Scheme ', schemeNameTa: 'தமிழ்நாடு சுகாதாரத் திட்டம்' })));
    assert.deepEqual(edited.header.subtitle, { en: 'TN Health Scheme', ta: 'தமிழ்நாடு சுகாதாரத் திட்டம்' });
    assert.deepEqual(edited.home.hero.title, edited.header.subtitle);
    // The seed name is spelled differently from the header's built-in subtitle; not an edit, so the header is unchanged.
    const same = apply(seeded());
    assert.deepEqual(same.header.subtitle, DEFAULT_SITE_CONTENT.header.subtitle);
    assert.notDeepEqual(same.header.subtitle, same.home.hero.title);
  });

  test('coverage statement and availability are applied; an empty availability hides it', () => {
    const edited = apply(withRow('scheme', schemeRow({ coverageStatementEn: 'Up to 6 lakh', coverageStatementTa: '6 லட்சம் வரை', availability: '' })));
    assert.deepEqual(edited.home.hero.coverageStatement, { en: 'Up to 6 lakh', ta: '6 லட்சம் வரை' });
    assert.equal(edited.header.availability, '');
    assert.equal(apply(withRow('scheme', schemeRow({ availability: '9-5' }))).header.availability, '9-5');
  });

  test('helplines replace the header list; a pathway pointing at a removed helpline loses the reference', () => {
    const edited = apply(withRow('helplines', [
      { id: 'employee', labelEn: 'Employee desk', labelTa: 'பணியாளர் உதவி', number: '1800-111-2222', telHref: 'tel:18001112222' },
      { id: 'login-support', labelEn: 'Login help', labelTa: '', number: '044 1111 2222', telHref: 'tel:04411112222' },
    ]));
    assert.deepEqual(edited.header.helplines, [
      { id: 'employee', label: { en: 'Employee desk', ta: 'பணியாளர் உதவி' }, number: '1800-111-2222', visible: true },
      { id: 'login-support', label: { en: 'Login help', ta: '' }, number: '044 1111 2222', visible: true },
    ]);
    const groups = Object.fromEntries(edited.home.pathways.groups.map((group) => [group.id, group.helplineId]));
    assert.deepEqual(groups, { employee: 'employee', pensioner: null });
  });

  test('portal links: the destination goes to every matching link, the label only where the portal name is shown and only when edited', () => {
    const portals = PORTAL_SEED.map((p) => ({ ...p }));
    const employee = portals.find((p) => p.id === 'employee')!;
    employee.href = 'https://portal.example/employee';
    employee.label = 'Staff';
    employee.labelTa = 'பணியாளர்';
    const track = portals.find((p) => p.id === 'trackClaim')!;
    track.href = 'https://portal.example/track?x=1';
    const edited = apply(withRow('portals', portals));

    for (const link of [loginItem(edited, 'employee'), footerPortal(edited, 'employee')]) {
      assert.deepEqual(link.target, { type: 'external', url: 'https://portal.example/employee' });
      assert.deepEqual(link.label, { en: 'Staff', ta: 'பணியாளர்' });
    }
    const pathway = pathwayLink(edited, 'employee-login');
    assert.deepEqual(pathway.target, { type: 'external', url: 'https://portal.example/employee' });
    assert.deepEqual(pathway.label, DEFAULT_SITE_CONTENT.home.pathways.groups[0].links[3].label, 'the pathway keeps its own wording');

    const trackTargets = [
      edited.navigation.items.flatMap((item) => (item.type === 'menu' ? item.children : [item])).find((item) => item.id === 'track-claim'),
      edited.home.quickAccess.tiles.find((tile) => tile.id === 'track'),
      footerPortal(edited, 'trackClaim'),
    ];
    for (const link of trackTargets) assert.deepEqual((link as LinkItem).target, { type: 'external', url: 'https://portal.example/track?x=1' });
    assert.deepEqual(footerPortal(edited, 'trackClaim').label, DEFAULT_SITE_CONTENT.footer.linkGroups[1].links[3].label, 'the seeded label is not an edit');

    // Untouched portals keep their built-in destination and the "Hospital Login" wording (the seed says "Administrator").
    assert.deepEqual(loginItem(edited, 'administrator'), loginItem(DEFAULT_SITE_CONTENT as SiteContentMap, 'administrator'));
    assert.deepEqual(edited.partners, DEFAULT_SITE_CONTENT.partners);
    assert.deepEqual(edited.text, DEFAULT_SITE_CONTENT.text);
  });

  test('forgotPassword and insurer and administrator are mapped to their links', () => {
    const portals = PORTAL_SEED.map((p) => ({ ...p, href: p.id === 'forgotPassword' ? 'https://id.example/reset' : p.id === 'insurer' ? 'https://insurer.example/' : p.id === 'administrator' ? 'https://admin.example/' : p.href }));
    const edited = apply(withRow('portals', portals));
    assert.deepEqual(edited.header.loginMenu.forgotPassword.target, { type: 'external', url: 'https://id.example/reset' });
    assert.deepEqual(loginItem(edited, 'insurer').target, { type: 'external', url: 'https://insurer.example/' });
    assert.deepEqual(loginItem(edited, 'administrator').target, { type: 'external', url: 'https://admin.example/' });
    assert.deepEqual(footerPortal(edited, 'administrator').target, { type: 'external', url: 'https://admin.example/' });
  });

  test('a portal link that is not a safe https address, an unknown portal and the hospital portals are ignored', () => {
    const insecure = PORTAL_SEED.map((p) => ({ ...p, href: p.id === 'pensioner' ? 'http://insecure.example/p' : p.id === 'insurer' ? 'javascript:alert(1)' : p.href }));
    const extra = [...insecure,
      { id: 'hospitalMediAssist', label: 'a', labelTa: 'b', href: 'https://provider.example/' },
      { id: 'hospitalMdIndia', label: 'a', labelTa: 'b', href: 'https://mdindia.example/' },
      { id: 'unknown-portal', label: 'a', labelTa: 'b', href: 'https://x.example/' }];
    assert.deepEqual(apply(withRow('portals', extra)), DEFAULT_SITE_CONTENT);
  });

  test('a value that no longer satisfies the content rules is skipped; the others are still applied', () => {
    const edited = apply(withRow('scheme', schemeRow({ schemeNameEn: 'x'.repeat(250), coverageStatementEn: 'Up to 7 lakh' })));
    assert.deepEqual(edited.header.subtitle, DEFAULT_SITE_CONTENT.header.subtitle, 'the over-long name is skipped');
    assert.deepEqual(edited.home.hero.title, DEFAULT_SITE_CONTENT.home.hero.title);
    assert.equal(edited.home.hero.coverageStatement.en, 'Up to 7 lakh');
    for (const key of SITE_CONTENT_KEYS) assert.equal(validateSiteContent(key, edited[key]).ok, true, key);

    const badHelplines = apply(withRow('helplines', [{ id: 'employee', labelEn: 'y'.repeat(300), labelTa: '', number: '1800-111-2222', telHref: 'tel:18001112222' }]));
    assert.deepEqual(badHelplines.header.helplines, DEFAULT_SITE_CONTENT.header.helplines);
  });
});

describe('parseLegacySettings', () => {
  test('malformed rows are treated as absent', () => {
    const parsed = parseLegacySettings([
      { key: 'scheme', value: 'text' },
      { key: 'helplines', value: { id: 'employee' } },
      { key: 'portals', value: [1, null, 'x', { id: '', href: '' }, { id: 'employee', href: '' }] },
      { key: 'other', value: 1 },
    ]);
    assert.equal(parsed.scheme, null);
    assert.equal(parsed.helplines, null);
    assert.deepEqual(parsed.portals, []);
    assert.deepEqual(parseLegacySettings([]), NO_LEGACY_SETTINGS);
  });

  test('helplines without an id, label or number are dropped', () => {
    const parsed = parseLegacySettings([{ key: 'helplines', value: [
      { id: 'a', labelEn: 'A', labelTa: '', number: '123456', telHref: '' },
      { id: '', labelEn: 'B', labelTa: '', number: '123456', telHref: '' },
      { id: 'c', labelEn: ' ', labelTa: '', number: '123456', telHref: '' },
      { id: 'd', labelEn: 'D', labelTa: '', number: '', telHref: '' },
    ] }]);
    assert.deepEqual(parsed.helplines?.map((h) => h.id), ['a']);
  });
});

describe('isMissingTableError', () => {
  const known = (code: string, meta?: unknown) => Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code, meta });

  test('recognises P2021 and P2010 wrapping 42P01 only', () => {
    assert.equal(isMissingTableError(known('P2021')), true);
    assert.equal(isMissingTableError(known('P2010', { code: '42P01', message: 'relation "SiteContent" does not exist' })), true);
    assert.equal(isMissingTableError(known('P2010', { code: '42601' })), false);
    assert.equal(isMissingTableError(known('P2010')), false);
    assert.equal(isMissingTableError(known('P2002')), false);
    assert.equal(isMissingTableError(known('P1001')), false);
    assert.equal(isMissingTableError(Object.assign(new Error('x'), { name: 'Error', code: 'P2021' })), false);
    assert.equal(isMissingTableError(null), false);
    assert.equal(isMissingTableError('P2021'), false);
    assert.equal(isMissingTableError(undefined), false);
  });
});
