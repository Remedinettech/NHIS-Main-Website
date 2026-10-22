import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BUILT_IN_ASSET_PATTERN,
  DEFAULT_SITE_CONTENT,
  EDITABLE_TEXT_CATALOG,
  HOME_SECTION_IDS,
  SITE_CONTENT_KEYS,
  SITE_CONTENT_LIMITS,
  SITE_CONTENT_MAX_BYTES,
  SITE_ICON_NAMES,
  SITE_ID_PATTERN,
  SITE_ROUTES,
  SITE_ROUTE_ANCHORS,
  defaultSiteContent,
  editableTextEntry,
  telHrefFor,
  validateSiteContent,
  type Bilingual,
  type DocumentRecord,
  type LinkTarget,
  type SiteContentKey,
} from '@nhis/shared-types';
import { ALL_MESSAGE_KEYS, resolveMessage, type MessageKey } from '../locales';
import { taProposed } from '../locales/ta.proposed';
import { taSource } from '../locales/ta.source';

/* ---------------------------------------------------------------- data files and helpers */

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface SiteJson {
  schemeName: Bilingual;
  coverageStatement: Bilingual;
  helplines: Array<{ id: string; label: Bilingual; number: string; telHref: string }>;
  availability: string;
}
const site = readJson<SiteJson>(here('../../../nhis-api/src/data/site.json'));
const documents = readJson<DocumentRecord[]>(here('../../../nhis-api/src/data/documents.json'));
const assetsDir = here('../../public/');

/** A message as the Client shows it today: English from en.ts; Tamil from ta.source.ts, else ta.proposed.ts, else '' (English is shown). */
const msg = (key: MessageKey): Bilingual => {
  const ta = resolveMessage('ta', key);
  return { en: resolveMessage('en', key).text, ta: ta.origin === 'fallback-en' ? '' : ta.text };
};
const bi = (en: string, ta = ''): Bilingual => ({ en, ta });
const route = (path: string): LinkTarget => ({ type: 'route', path });
const external = (url: string): LinkTarget => ({ type: 'external', url });

/** Destinations of the existing NHIS portals (the former built-in portal table of the Client) with the default legacy base https://tn-nhis.com. */
const PORTAL = {
  employee: 'https://tn-nhis.com/?Pagename=TNportal',
  pensioner: 'https://tn-nhis.com/?Pagename=Pensioners',
  administrator: 'https://tn-nhis.com/?Pagename=Administrator',
  insurer: 'https://tn-nhis.com/?Pagename=TNportal',
  trackClaim: 'https://tn-nhis.com/?Pagename=TNportal',
  forgotPassword: 'https://tn-nhis.com/Account/ForgetPassword',
  site: 'https://tn-nhis.com/',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function walk(value: unknown, visit: (value: unknown, path: string) => void, path = ''): void {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
  else if (isRecord(value)) for (const [key, item] of Object.entries(value)) walk(item, visit, path ? `${path}.${key}` : key);
}

const documentEntries = (): Array<[SiteContentKey, unknown]> => SITE_CONTENT_KEYS.map((key) => [key, DEFAULT_SITE_CONTENT[key]]);

/** Every list whose items all have a string `id`, with the ids in order. */
function idLists(doc: unknown): Array<{ path: string; ids: string[] }> {
  const lists: Array<{ path: string; ids: string[] }> = [];
  walk(doc, (value, path) => {
    if (Array.isArray(value) && value.length > 0 && value.every((item) => isRecord(item) && typeof item.id === 'string')) {
      lists.push({ path, ids: value.map((item) => (item as { id: string }).id) });
    }
  });
  return lists;
}

/** Every string in a document with the path of its property, e.g. `items[2].label.en`. */
function strings(doc: unknown): Array<{ path: string; key: string; value: string }> {
  const found: Array<{ path: string; key: string; value: string }> = [];
  walk(doc, (value, path) => {
    if (typeof value === 'string') found.push({ path, key: path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '', value });
  });
  return found;
}

/** All link targets of the content (items with a `target` property), with the path of the item. */
function targets(): Array<{ path: string; target: LinkTarget }> {
  const found: Array<{ path: string; target: LinkTarget }> = [];
  for (const [key, doc] of documentEntries()) {
    walk(doc, (value, path) => {
      if (isRecord(value) && isRecord(value.target) && typeof value.target.type === 'string') {
        found.push({ path: `${key}.${path}`, target: value.target as unknown as LinkTarget });
      }
    });
  }
  return found;
}

/** Pixel size of a PNG (IHDR) or JPEG (start-of-frame marker) file, read from the bytes. */
function imageSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    assert.equal(bytes.toString('latin1', 12, 16), 'IHDR', `${file}: first PNG chunk`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    assert.fail(`${file}: no JPEG frame header`);
  }
  return assert.fail(`${file}: not a PNG or JPEG file`);
}

/* ---------------------------------------------------------------- (a) editable text catalog */

/** The editorial keys the catalog has to offer (docs/site-content-management.md, section 1: "Page text"). */
const REQUIRED_CATALOG_KEYS = [
  'hospitals.title', 'hospitals.intro', 'hospitals.searchLabel', 'hospitals.searchPlaceholder',
  'contacts.title', 'contacts.intro', 'contacts.helplines', 'contacts.timings',
  'contacts.directories.coordinators', 'contacts.directories.uiic-nodal-officers',
  'contacts.directories.hospital-nodal-officers', 'contacts.directories.treasury-offices',
  'documents.ordersTitle', 'documents.ordersIntro', 'documents.employeeGroup', 'documents.pensionerGroup',
  'documents.searchLabel', 'documents.searchPlaceholder',
  'pages.formsTitle', 'documents.formsHeading', 'documents.guidesHeading', 'documents.policyHeading',
  'pages.coverageTitle', 'pages.eligibilityTitle', 'pages.enrollTitle', 'pages.grievancesTitle', 'pages.relatedLinks',
  'grievances.guidance', 'gallery.title',
  'fallback.tamilMissing', 'fallback.englishMissing', 'announcements.region',
  'common.notFoundTitle', 'common.notFoundBody', 'common.goHome',
];

test('every editable text key exists in the English locale and its defaults are what the Client resolves today', () => {
  const known = new Set<string>(ALL_MESSAGE_KEYS);
  const seen = new Set<string>();
  for (const entry of EDITABLE_TEXT_CATALOG) {
    assert.ok(known.has(entry.key), `${entry.key} is not a message key`);
    assert.ok(!seen.has(entry.key), `${entry.key} is listed twice`);
    seen.add(entry.key);
    assert.deepEqual(entry.defaults, msg(entry.key as MessageKey), `defaults of ${entry.key}`);
    // Tamil is '' only when neither ta.source.ts nor ta.proposed.ts has the key (the Client then shows English).
    const hasTamil = entry.key in taSource || entry.key in taProposed;
    assert.equal(entry.defaults.ta === '', !hasTamil, `Tamil default of ${entry.key}`);
  }
});

test('the catalog offers the editorial keys, but none that the documents already manage', () => {
  const keys = new Set(EDITABLE_TEXT_CATALOG.map((entry) => entry.key));
  for (const key of REQUIRED_CATALOG_KEYS) assert.ok(keys.has(key), `${key} is missing from the catalog`);
  for (const key of keys) assert.ok(!/^(nav|login|support|footer|home|site)\./.test(key), `${key} is managed by a document`);
});

test('catalog entries are complete, fit their limits and carry no placeholders', () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const entry of EDITABLE_TEXT_CATALOG) {
    assert.ok(entry.group.trim() && entry.label.trim(), `${entry.key}: group and label`);
    assert.ok(entry.maxLength > 0 && entry.maxLength <= SITE_CONTENT_LIMITS.longText, `${entry.key}: maxLength`);
    for (const lang of ['en', 'ta'] as const) {
      const text = entry.defaults[lang];
      assert.ok(text.length <= entry.maxLength, `${entry.key}.${lang} is longer than ${entry.maxLength}`);
      assert.ok(!/<[A-Za-z/!?]/.test(text) && !/[\u0000-\u001f\u007f]/.test(text), `${entry.key}.${lang} is not plain text`);
      assert.equal(placeholders(text), '', `${entry.key}.${lang} has a placeholder`);
    }
    assert.ok(entry.defaults.en.trim() !== '', `${entry.key}: English default`);
  }
  // Group headings appear once each, so entries of a page stay together.
  const groups = EDITABLE_TEXT_CATALOG.map((entry) => entry.group);
  const collapsed = groups.filter((group, index) => index === 0 || group !== groups[index - 1]);
  assert.equal(new Set(collapsed).size, collapsed.length, 'entries of one group are not contiguous');
});

test('editableTextEntry finds an entry by key', () => {
  assert.equal(editableTextEntry('hospitals.title')?.defaults.en, 'Network hospitals');
  assert.equal(editableTextEntry('home.eyebrow'), undefined);
});

/* ---------------------------------------------------------------- (b) labels equal the locale messages */

type Row = [id: string, label: MessageKey, target: LinkTarget];
const expectedLinks = (rows: Row[]) => rows.map(([id, key, target]) => ({ id, label: msg(key), target, visible: true }));

test('header texts, helplines and Login menu equal the Client locale and settings', () => {
  const { header } = DEFAULT_SITE_CONTENT;
  assert.deepEqual(header.emblem.alt, msg('site.emblemAlt'));
  assert.deepEqual(header.portrait.alt, msg('site.portraitAlt'));
  assert.equal(header.showPortrait, true);
  assert.deepEqual(header.title, bi('TN-NHIS', 'TN-NHIS'));
  // SiteHeader.tsx spelled the Tamil scheme name with "ுத்"; the settings name (used by the hero) does not. Both are kept.
  assert.deepEqual(header.subtitle, bi(site.schemeName.en, 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்'));
  assert.notEqual(header.subtitle.ta, site.schemeName.ta);
  assert.deepEqual(header.helplineHeading, msg('support.helpline'));
  assert.equal(header.availability, '24/7');

  const menu = header.loginMenu;
  assert.deepEqual(menu.label, msg('login.menu'));
  assert.deepEqual(menu.heading, msg('login.roleHeading'));
  assert.deepEqual(menu.items, expectedLinks([
    ['employee', 'login.employees', external(PORTAL.employee)],
    ['pensioner', 'login.pensioners', external(PORTAL.pensioner)],
    ['administrator', 'login.administrator', external(PORTAL.administrator)],
    ['insurer', 'login.insurer', external(PORTAL.insurer)],
  ]));
  assert.deepEqual(menu.forgotPassword, { ...expectedLinks([['forgotPassword', 'login.forgotPassword', external(PORTAL.forgotPassword)]])[0], visible: false });
});

test('the hospital TPA portals stay out of the Login menu, as they are today', () => {
  const text = JSON.stringify(DEFAULT_SITE_CONTENT);
  assert.ok(!text.includes('provider.ihx.in') && !text.includes('tnnhis2016.com'));
  assert.ok(!/hospitalMediAssist|hospitalMdIndia/.test(text));
});

test('navigation has the structure, ids, order and labels of PRIMARY_NAV (plus the User Manual menu)', () => {
  const link = (id: string, key: MessageKey, target: LinkTarget) => ({ type: 'link', ...expectedLinks([[id, key, target]])[0] });
  const heading = (id: string, key: MessageKey) => ({ type: 'heading', id, label: msg(key), visible: true });
  const menu = (id: string, key: MessageKey, children: unknown[]) => ({ type: 'menu', id, label: msg(key), visible: true, children });
  assert.deepEqual(DEFAULT_SITE_CONTENT.navigation, {
    items: [
      link('home', 'nav.home', route('/')),
      link('hospitals', 'nav.hospitals', route('/hospitals')),
      menu('scheme', 'nav.scheme', [
        heading('policy', 'nav.policyDetails'),
        link('employee-policy', 'nav.employeePolicy', route('/employee-policy')),
        link('pensioner-policy', 'nav.pensionerPolicy', route('/pensioner-policy')),
        heading('orders', 'nav.governmentOrders'),
        link('government-orders', 'nav.governmentOrders', route('/government-orders')),
        heading('about', 'nav.scheme'),
        link('coverage', 'nav.coverage', route('/coverage')),
        link('eligibility', 'nav.eligibility', route('/eligibility')),
        link('enroll', 'nav.enroll', route('/enrollment')),
        link('forms', 'nav.forms', route('/forms')),
      ]),
      menu('beneficiary', 'nav.beneficiary', [link('track-claim', 'nav.trackClaim', external(PORTAL.trackClaim))]),
      { type: 'link', id: 'user-manual', label: bi('User Manual', 'பயனர் கையேடு'), visible: true, target: route('/user-manual') },
      link('gallery', 'nav.gallery', route('/gallery')),
      link('grievances', 'nav.grievances', route('/grievances')),
      link('contacts', 'nav.contact', route('/contacts')),
    ],
  });
});

test('homepage texts, quick tiles and pathways equal the Client locale', () => {
  const { home } = DEFAULT_SITE_CONTENT;
  const { hero } = home;
  assert.deepEqual(hero.eyebrow, msg('home.eyebrow'));
  assert.deepEqual(hero.title, site.schemeName);
  assert.deepEqual(hero.description, bi(''));
  assert.deepEqual(hero.coverageHeading, msg('home.coverageHeading'));
  assert.deepEqual(hero.coverageStatement, site.coverageStatement);
  assert.deepEqual(hero.actions, [
    { ...expectedLinks([['hero-coverage', 'home.coverageDetails', route('/coverage')]])[0], variant: 'secondary' },
    { ...expectedLinks([['hero-forms', 'nav.forms', route('/forms')]])[0], variant: 'ghost' },
  ]);
  assert.equal(hero.banner, null);
  assert.deepEqual(hero.search, {
    heading: msg('home.findHospital'),
    hint: msg('home.findHospitalHint'),
    placeholder: msg('home.searchPlaceholder'),
    button: msg('home.searchButton'),
    browseAll: msg('home.browseAllHospitals'),
    showCount: true,
  });

  // The former built-in quick-access tiles: the claim tile leaves the site (hint "NHIS portal"); the others have no hint.
  const tile = (id: string, icon: string, label: MessageKey, target: LinkTarget, hint = bi('')) => ({ id, icon, label: msg(label), hint, target, visible: true });
  assert.deepEqual(home.quickAccess, {
    heading: msg('home.quickHeading'),
    tiles: [
      tile('hospitals', 'hospital', 'nav.hospitals', route('/hospitals')),
      tile('coverage', 'shield', 'nav.coverage', route('/coverage')),
      tile('eligibility', 'users', 'nav.eligibility', route('/eligibility')),
      tile('enroll', 'clipboard', 'nav.enroll', route('/enrollment')),
      tile('forms', 'file', 'nav.forms', route('/forms')),
      tile('track', 'search', 'nav.trackClaim', external(PORTAL.trackClaim), msg('home.quickTrackHint')),
    ],
  });

  // The former built-in pathways: policy, government orders, enrolment annexure form (document), portal login, then the helpline.
  const enrolForm = msg('home.enrolForm');
  const group = (audience: 'employee' | 'pensioner', formId: string) => {
    const employee = audience === 'employee';
    const row = (suffix: string, icon: string, label: Bilingual, target: LinkTarget) => ({ id: `${audience}-${suffix}`, icon, label, target, visible: true });
    return {
      id: audience,
      heading: msg(employee ? 'home.employeePath' : 'home.pensionerPath'),
      links: [
        row('policy', 'clipboard', msg(employee ? 'home.employeePolicy' : 'home.pensionerPolicy'), route(employee ? '/employee-policy' : '/pensioner-policy')),
        row('orders', 'scale', msg('home.govOrders'), route(`/government-orders#${audience}-orders`)),
        row('form', 'file', bi(`${enrolForm.en}: {title}`, `${enrolForm.ta}: {title}`), { type: 'document', documentId: formId }),
        row('login', 'login', msg(employee ? 'home.employeeLogin' : 'home.pensionerLogin'), external(employee ? PORTAL.employee : PORTAL.pensioner)),
      ],
      helplineId: audience,
      visible: true,
    };
  };
  assert.deepEqual(home.pathways, {
    heading: msg('home.pathwaysHeading'),
    groups: [group('employee', 'form-annexure-vi'), group('pensioner', 'form-annexure-iii')],
  });

  assert.deepEqual(home.documents, {
    heading: msg('home.documentsHeading'),
    intro: msg('home.documentsIntro'),
    documentIds: [],
    categories: ['enrolment-form', 'policy-non-payable'],
    links: expectedLinks([
      ['all-orders', 'home.allOrders', route('/government-orders')],
      ['all-forms', 'home.allForms', route('/forms')],
    ]),
  });
  assert.deepEqual(home.coverage, { heading: msg('pages.coverageTitle'), linkLabel: msg('home.coverageDetails') });
  assert.deepEqual(home.helplines, { heading: msg('home.helplineHeading'), intro: msg('home.helplineIntro') });
  // New section: English only, and nothing renders until an administrator adds items.
  assert.deepEqual(home.highlights, { heading: bi('Scheme highlights'), intro: bi(''), items: [] });
});

test('partners are the four logos of Partners.tsx in today\'s order', () => {
  const { partners } = DEFAULT_SITE_CONTENT;
  assert.deepEqual(partners.heading, msg('home.partnersHeading'));
  assert.deepEqual(partners.categories, [
    { id: 'insurance', caption: msg('home.insurancePartner'), visible: true },
    { id: 'service', caption: msg('home.servicePartner'), visible: true },
  ]);
  const expected: Array<[id: string, categoryId: string, name: string, file: string, width: number, height: number]> = [
    ['united-india', 'insurance', 'United India Insurance', 'united-india-insurance-logo.png', 1012, 763],
    ['vidal-health', 'service', 'Vidal Health', 'vidal-health-logo.png', 2000, 600],
    ['medi-assist', 'service', 'Medi Assist', 'medi-assist-logo.png', 1600, 629],
    ['hitpa', 'service', 'Health Insurance TPA of India Ltd.', 'hitpa-logo.png', 1469, 1071],
  ];
  assert.deepEqual(partners.partners, expected.map(([id, categoryId, name, file, width, height]) => ({
    id,
    categoryId,
    name: bi(name),
    logo: { assetId: null, builtIn: `assets/${file}`, alt: bi(name), width, height },
    url: null,
    visible: true,
  })));
});

test('footer links, texts and copyright equal the Client locale', () => {
  const { footer } = DEFAULT_SITE_CONTENT;
  const rights = msg('footer.rights');
  assert.equal(footer.showWordmark, true);
  assert.deepEqual(footer.logos, []);
  assert.deepEqual(footer.about, { heading: msg('footer.about'), text: msg('footer.aboutText') });
  assert.deepEqual(footer.linkGroups, [
    {
      id: 'quick-links',
      heading: msg('footer.quickLinks'),
      // The quick links of the footer before the menus became editable (the former config/navigation.ts, now removed); the Client hides Gallery while it has no published item.
      links: expectedLinks([
        ['hospitals', 'nav.hospitals', route('/hospitals')],
        ['employee-policy', 'nav.employeePolicy', route('/employee-policy')],
        ['pensioner-policy', 'nav.pensionerPolicy', route('/pensioner-policy')],
        ['government-orders', 'nav.governmentOrders', route('/government-orders')],
        ['coverage', 'nav.coverage', route('/coverage')],
        ['eligibility', 'nav.eligibility', route('/eligibility')],
        ['enroll', 'nav.enroll', route('/enrollment')],
        ['forms', 'nav.forms', route('/forms')],
        ['gallery', 'nav.gallery', route('/gallery')],
        ['grievances', 'nav.grievances', route('/grievances')],
        ['contacts', 'nav.contact', route('/contacts')],
      ]),
      visible: true,
    },
    {
      id: 'portals',
      heading: msg('footer.portals'),
      links: expectedLinks([
        ['employee', 'login.employees', external(PORTAL.employee)],
        ['pensioner', 'login.pensioners', external(PORTAL.pensioner)],
        ['administrator', 'login.administrator', external(PORTAL.administrator)],
        ['trackClaim', 'nav.trackClaim', external(PORTAL.trackClaim)],
        ['portal-site', 'footer.portalSite', external(PORTAL.site)],
      ]),
      visible: true,
    },
  ]);
  assert.deepEqual(footer.helplines, { visible: true, heading: msg('footer.helplines') });
  // The Client footer has no contact block today: it starts hidden and empty.
  assert.equal(footer.contact.visible, true);
  assert.deepEqual(footer.contact.heading, msg('footer.projectOffice'));
  assert.ok(footer.contact.address.en.includes('No.134, Silingi Building, Greams Road,'));
  assert.ok(footer.contact.address.en.includes('33AAACU5552C1ZQ'));
  assert.equal(footer.contact.phone, '044 28297804');
  assert.deepEqual(footer.copyright, bi(`© {year} ${rights.en}`, `© {year} ${rights.ta}`));
});

test('the interface-text document starts without overrides', () => {
  assert.deepEqual(DEFAULT_SITE_CONTENT.text, { overrides: {} });
});

test('no hand-written Tamil text is invented: a text without Tamil in the locale files has Tamil \'\'', () => {
  assert.equal(DEFAULT_SITE_CONTENT.home.highlights.heading.ta, '');
  for (const partner of DEFAULT_SITE_CONTENT.partners.partners) {
    assert.equal(partner.name.ta, '');
    assert.equal(partner.logo.alt.ta, '');
  }
});

/* ---------------------------------------------------------------- (c) ids */

test('list ids match the id pattern and are unique inside each list', () => {
  for (const [key, doc] of documentEntries()) {
    for (const { path, ids } of idLists(doc)) {
      for (const id of ids) assert.match(id, SITE_ID_PATTERN, `${key}.${path}: id ${id}`);
      assert.equal(new Set(ids).size, ids.length, `${key}.${path}: duplicate ids ${ids.join(', ')}`);
    }
  }
});

test('ids are unique across a whole document (the header repeats employee and pensioner in two lists on purpose)', () => {
  for (const [key, doc] of documentEntries()) {
    if (key === 'header') continue;
    const all = idLists(doc).filter((list) => list.path !== 'sections').flatMap((list) => list.ids);
    assert.equal(new Set(all).size, all.length, `${key}: duplicate ids ${all.filter((id, i) => all.indexOf(id) !== i).join(', ')}`);
  }
  const header = DEFAULT_SITE_CONTENT.header;
  assert.deepEqual(header.helplines.map((line) => line.id), ['employee', 'pensioner', 'login-support']);
  assert.deepEqual(header.loginMenu.items.map((item) => item.id), ['employee', 'pensioner', 'administrator', 'insurer']);
});

test('references inside the documents resolve (pathway helplines, partner categories)', () => {
  const helplineIds = new Set(DEFAULT_SITE_CONTENT.header.helplines.map((line) => line.id));
  for (const group of DEFAULT_SITE_CONTENT.home.pathways.groups) {
    assert.ok(group.helplineId === null || helplineIds.has(group.helplineId), `pathway ${group.id}: helpline ${group.helplineId}`);
  }
  const categoryIds = new Set(DEFAULT_SITE_CONTENT.partners.categories.map((category) => category.id));
  for (const partner of DEFAULT_SITE_CONTENT.partners.partners) assert.ok(categoryIds.has(partner.categoryId), `partner ${partner.id}`);
  for (const [key, doc] of documentEntries()) {
    walk(doc, (value, path) => {
      if (isRecord(value) && typeof value.icon === 'string') assert.ok(SITE_ICON_NAMES.includes(value.icon as never), `${key}.${path}: icon ${value.icon}`);
    });
  }
});

/* ---------------------------------------------------------------- (d) header helplines equal site.json */

test('header helplines, availability and scheme name equal nhis-api/src/data/site.json', () => {
  const { header, home } = DEFAULT_SITE_CONTENT;
  assert.deepEqual(
    header.helplines.map(({ id, label, number }) => ({ id, label, number })),
    site.helplines.map(({ id, label, number }) => ({ id, label, number })),
  );
  for (const [index, line] of header.helplines.entries()) {
    assert.equal(telHrefFor(line.number), site.helplines[index].telHref, `tel: link of ${line.id}`);
    assert.equal(line.visible, true);
  }
  assert.equal(header.availability, site.availability);
  assert.deepEqual(header.subtitle.en, site.schemeName.en);
  assert.deepEqual(home.hero.title, site.schemeName);
  assert.deepEqual(home.hero.coverageStatement, site.coverageStatement);
});

/* ---------------------------------------------------------------- (e) built-in images */

test('every built-in image exists under nhis-client/public/assets and declares its real pixel size', () => {
  const images: Array<{ path: string; image: { assetId: string | null; builtIn: string | null; alt: Bilingual; width: number | null; height: number | null } }> = [];
  for (const [key, doc] of documentEntries()) {
    walk(doc, (value, path) => {
      if (isRecord(value) && 'builtIn' in value && 'assetId' in value) images.push({ path: `${key}.${path}`, image: value as never });
    });
  }
  const paths = images.map(({ image }) => image.builtIn);
  assert.deepEqual([...paths].sort(), [
    'assets/header-portrait.jpg',
    'assets/hitpa-logo.png',
    'assets/medi-assist-logo.png',
    'assets/tn-government-emblem.png',
    'assets/united-india-insurance-logo.png',
    'assets/vidal-health-logo.png',
  ]);
  for (const { path, image } of images) {
    assert.equal(image.assetId, null, `${path}: built-in images have no asset id`);
    assert.ok(image.builtIn !== null && BUILT_IN_ASSET_PATTERN.test(image.builtIn), `${path}: path ${image.builtIn}`);
    const file = `${assetsDir}${image.builtIn}`;
    assert.ok(existsSync(file), `${path}: ${file} does not exist`);
    const size = imageSize(file);
    assert.deepEqual({ width: image.width, height: image.height }, size, `${path}: declared size of ${image.builtIn}`);
    assert.ok(image.alt.en.trim() !== '', `${path}: English alt text is required`);
  }
  // The header images keep the pixel sizes that the Client was written for (emblem 794x862, portrait 960x1200).
  assert.deepEqual(imageSize(`${assetsDir}assets/tn-government-emblem.png`), { width: 794, height: 862 });
  assert.deepEqual(imageSize(`${assetsDir}assets/header-portrait.jpg`), { width: 960, height: 1200 });
});

/* ---------------------------------------------------------------- (f) homepage sections */

test('home.sections lists every section once, hero first, in the visual order of the page', () => {
  const ids = DEFAULT_SITE_CONTENT.home.sections.map((section) => section.id);
  assert.equal(ids[0], 'hero');
  assert.deepEqual([...ids].sort(), [...HOME_SECTION_IDS].sort());
  assert.equal(new Set(ids).size, HOME_SECTION_IDS.length);
  assert.deepEqual(ids, ['hero', 'quickAccess', 'pathways', 'documents', 'coverage', 'helplines', 'highlights', 'partners']);
  assert.ok(DEFAULT_SITE_CONTENT.home.sections.every((section) => section.visible));
});

/* ---------------------------------------------------------------- (g) links */

test('document links point at documents of nhis-api/src/data/documents.json', () => {
  const ids = new Set(documents.map((doc) => doc.id));
  const linked = targets().filter(({ target }) => target.type === 'document');
  assert.equal(linked.length, 2);
  for (const { path, target } of linked) {
    assert.ok(target.type === 'document' && ids.has(target.documentId), `${path}: unknown document`);
  }
  // The enrolment annexure form of each audience.
  const forms = new Map(documents.filter((doc) => doc.category === 'enrolment-form').map((doc) => [doc.audience, doc]));
  for (const group of DEFAULT_SITE_CONTENT.home.pathways.groups) {
    const target = group.links.find((item) => item.id === `${group.id}-form`)?.target;
    assert.deepEqual(target, { type: 'document', documentId: forms.get(group.id as 'employee' | 'pensioner')?.id }, `pathway ${group.id}`);
  }
  for (const id of DEFAULT_SITE_CONTENT.home.documents.documentIds) assert.ok(ids.has(id), `documentIds: ${id}`);
  const categories = new Set(documents.map((doc) => doc.category));
  for (const category of DEFAULT_SITE_CONTENT.home.documents.categories) assert.ok(categories.has(category), `category ${category}`);
});

test('route links use known routes, external links are https without credentials', () => {
  const routePaths = new Set(SITE_ROUTES.map((item) => item.path));
  const anchors = new Set(SITE_ROUTE_ANCHORS.map((item) => item.path));
  for (const { path, target } of targets()) {
    if (target.type === 'route') {
      const [pathname, anchor] = target.path.split('#');
      assert.ok(routePaths.has(pathname), `${path}: unknown route ${target.path}`);
      if (anchor !== undefined) assert.ok(anchors.has(target.path) && /^[A-Za-z0-9_-]{1,64}$/.test(anchor), `${path}: anchor ${target.path}`);
    } else if (target.type === 'external') {
      const url = new URL(target.url);
      assert.equal(url.protocol, 'https:', `${path}: ${target.url}`);
      assert.ok(url.username === '' && url.password === '' && target.url.length <= SITE_CONTENT_LIMITS.url, `${path}: ${target.url}`);
    } else {
      assert.equal(target.type, 'document', `${path}: link kind`);
    }
  }
});

/* ---------------------------------------------------------------- limits and plain text (what the strict validator expects) */

test('all text is plain, trimmed, NFC and within the field limits', () => {
  const limitFor = (key: string): number => {
    if (['alt'].includes(key)) return SITE_CONTENT_LIMITS.alt;
    if (['label', 'caption', 'name', 'hint', 'button', 'browseAll', 'placeholder', 'linkLabel'].includes(key)) return SITE_CONTENT_LIMITS.label;
    if (['heading', 'title', 'subtitle', 'helplineHeading', 'coverageHeading'].includes(key)) return SITE_CONTENT_LIMITS.heading;
    if (key === 'number') return SITE_CONTENT_LIMITS.number;
    if (key === 'url') return SITE_CONTENT_LIMITS.url;
    if (key === 'email') return SITE_CONTENT_LIMITS.email;
    return SITE_CONTENT_LIMITS.longText;
  };
  for (const [docKey, doc] of documentEntries()) {
    for (const { path, key, value } of strings(doc)) {
      const where = `${docKey}.${path}`;
      assert.equal(value, value.trim(), `${where}: not trimmed`);
      assert.equal(value, value.normalize('NFC'), `${where}: not NFC`);
      assert.ok(!(where.startsWith('footer.contact.address.') ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value), `${where}: control character`);
      assert.ok(!/<[A-Za-z/!?]/.test(value), `${where}: markup`);
      assert.ok(value.length <= limitFor(key), `${where}: ${value.length} characters`);
    }
  }
});

test('placeholders appear only where the contract allows them: {title} in document links, {year} in the copyright', () => {
  const found: string[] = [];
  for (const [docKey, doc] of documentEntries()) {
    for (const { path, value } of strings(doc)) if (/\{\w+\}/.test(value)) found.push(`${docKey}.${path}=${(value.match(/\{\w+\}/g) ?? []).join('')}`);
  }
  assert.deepEqual(found.sort(), [
    'footer.copyright.en={year}',
    'footer.copyright.ta={year}',
    'home.pathways.groups[0].links[2].label.en={title}',
    'home.pathways.groups[0].links[2].label.ta={title}',
    'home.pathways.groups[1].links[2].label.en={title}',
    'home.pathways.groups[1].links[2].label.ta={title}',
  ]);
});

test('lists stay within SITE_CONTENT_LIMITS and each document fits the size limit', () => {
  const L = SITE_CONTENT_LIMITS;
  const { header, navigation, home, partners, footer } = DEFAULT_SITE_CONTENT;
  assert.ok(header.helplines.length <= L.helplines);
  assert.ok(header.loginMenu.items.length <= L.loginItems);
  assert.ok(navigation.items.length <= L.navItems);
  for (const item of navigation.items) if (item.type === 'menu') assert.ok(item.children.length <= L.navChildren, item.id);
  assert.ok(home.hero.actions.length <= L.homeActions);
  assert.ok(home.quickAccess.tiles.length <= L.quickTiles);
  assert.ok(home.pathways.groups.length <= L.pathwayGroups);
  for (const group of home.pathways.groups) assert.ok(group.links.length <= L.pathwayLinks, group.id);
  assert.ok(home.highlights.items.length <= L.highlights);
  assert.ok(home.documents.documentIds.length <= L.documentIds);
  assert.ok(partners.categories.length <= L.partnerCategories);
  assert.ok(partners.partners.length <= L.partners);
  assert.ok(footer.logos.length <= L.footerLogos);
  assert.ok(footer.linkGroups.length <= L.footerGroups);
  for (const group of footer.linkGroups) assert.ok(group.links.length <= L.footerLinks, group.id);
  for (const [key, doc] of documentEntries()) assert.ok(Buffer.byteLength(JSON.stringify(doc)) <= SITE_CONTENT_MAX_BYTES, key);
});

/* ---------------------------------------------------------------- the shared validator */

test('the strict validator accepts every built-in document unchanged', () => {
  for (const key of SITE_CONTENT_KEYS) {
    const result = validateSiteContent(key, DEFAULT_SITE_CONTENT[key]);
    assert.ok(result.ok, `${key}: ${result.ok ? '' : JSON.stringify(result.issues)}`);
    assert.deepEqual(result.value, DEFAULT_SITE_CONTENT[key], `${key}: the validator changed the built-in content`);
  }
});

test('the validator accepts the catalog defaults as interface-text overrides', () => {
  const overrides = Object.fromEntries(EDITABLE_TEXT_CATALOG.map((entry) => [entry.key, entry.defaults]));
  const result = validateSiteContent('text', { overrides });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.issues));
});

/* ---------------------------------------------------------------- shape of the exports */

test('the built-in content is plain JSON where no object is shared between two places', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULT_SITE_CONTENT)), DEFAULT_SITE_CONTENT);
  const seen = new Set<unknown>();
  walk(DEFAULT_SITE_CONTENT, (value, path) => {
    if (isRecord(value) || Array.isArray(value)) {
      assert.ok(!seen.has(value), `${path} is the same object as another part of the content`);
      seen.add(value);
    }
  });
  assert.deepEqual(Object.keys(DEFAULT_SITE_CONTENT).sort(), [...SITE_CONTENT_KEYS].sort());
});

test('defaultSiteContent returns an independent copy of one document', () => {
  const copy = defaultSiteContent('navigation');
  assert.deepEqual(copy, DEFAULT_SITE_CONTENT.navigation);
  copy.items.pop();
  assert.equal(DEFAULT_SITE_CONTENT.navigation.items.length, 8);
  assert.notEqual(defaultSiteContent('header'), DEFAULT_SITE_CONTENT.header);
});
