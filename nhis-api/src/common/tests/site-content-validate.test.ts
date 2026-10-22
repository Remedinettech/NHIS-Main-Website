import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Bilingual, EditableTextEntry, FooterContent, HeaderContent, HomeContent, LinkItem, LinkTarget, NavigationContent, PartnersContent,
  SiteContentIssue, SiteContentKey, SiteContentMap, SiteImage, TextContent,
} from '@nhis/shared-types';
// Direct paths (not the package index) so that the tests do not depend on the built-in content that is edited elsewhere.
import {
  collectSiteContentRefs, isKnownSiteRoute, isSafeHttpsUrl, mapSiteImages, telHrefFor, validateSiteContent,
} from '../../../../packages/shared-types/src/site-content.validate';
import { EDITABLE_TEXT_CATALOG } from '../../../../packages/shared-types/src/site-text.catalog';
import {
  HOME_SECTION_IDS, SITE_CONTENT_KEYS, SITE_CONTENT_LIMITS, SITE_CONTENT_MAX_BYTES, SITE_ROUTES,
} from '../../../../packages/shared-types/src/site-content.constants';

/* ------------------------------------------------------------------ fixtures (minimal, valid, independent of the built-in content) */

const L = SITE_CONTENT_LIMITS;
const bi = (en: string, ta = ''): Bilingual => ({ en, ta });
const builtInImage = (alt = 'Logo'): SiteImage => ({ assetId: null, builtIn: 'assets/logo.png', alt: bi(alt), width: null, height: null });
const uploadedImage = (assetId: string, alt = 'Logo'): SiteImage => ({ assetId, builtIn: null, alt: bi(alt), width: 200, height: 100 });
const route = (path: string): LinkTarget => ({ type: 'route', path });
const external = (url: string): LinkTarget => ({ type: 'external', url });
const documentTarget = (documentId: string): LinkTarget => ({ type: 'document', documentId });
const link = (id: string, label: string, target: LinkTarget, visible = true): LinkItem => ({ id, label: bi(label), target, visible });
const many = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));

const charOf = (code: number): string => String.fromCharCode(code);
const NUL = charOf(0);
const BELL = charOf(7);
const ZWSP = charOf(0x200b);
const ZWNJ = charOf(0x200c);
const RLO = charOf(0x202e);
const COMBINING_ACUTE = charOf(0x301);

function headerDoc(): HeaderContent {
  return {
    emblem: builtInImage('Emblem'),
    portrait: builtInImage('Portrait'),
    showPortrait: true,
    title: bi('TN-NHIS', 'TN-NHIS'),
    subtitle: bi('Health insurance scheme', 'மருத்துவக் காப்பீட்டுத் திட்டம்'),
    helplineHeading: bi('Helplines'),
    helplines: [
      { id: 'general', label: bi('General', 'பொது'), number: '1800-233-5666', visible: true },
      { id: 'support', label: bi('Support'), number: '+91 44 2345 6789', visible: false },
    ],
    availability: '24/7',
    loginMenu: {
      label: bi('Login'),
      heading: bi('Choose your portal'),
      items: [link('employee', 'Employee portal', external('https://example.org/employee')), link('pensioner', 'Pensioner portal', route('/'))],
      forgotPassword: link('forgot', 'Forgot password', external('https://example.org/forgot')),
    },
  };
}

function navigationDoc(): NavigationContent {
  return {
    items: [
      { type: 'link', ...link('home', 'Home', route('/')) },
      {
        type: 'menu', id: 'policy', label: bi('Policy'), visible: true,
        children: [
          { type: 'heading', id: 'policy-head', label: bi('Policies'), visible: true },
          { type: 'link', ...link('employee-policy', 'Employee policy', route('/employee-policy')) },
          { type: 'link', ...link('orders', 'Orders', route('/government-orders#employee-orders')) },
        ],
      },
    ],
  };
}

function homeDoc(): HomeContent {
  return {
    sections: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
    hero: {
      eyebrow: bi('Eyebrow'),
      title: bi('Title'),
      description: bi(''),
      coverageHeading: bi('Coverage'),
      coverageStatement: bi('Cover for every family'),
      actions: [{ ...link('find', 'Find a hospital', route('/hospitals')), variant: 'primary' }],
      banner: null,
      search: { heading: bi('Find a hospital'), hint: bi(''), placeholder: bi('Name'), button: bi('Search'), browseAll: bi('Browse all'), showCount: true },
    },
    quickAccess: {
      heading: bi('Quick access'),
      tiles: [{ id: 'hospitals', icon: 'hospital', label: bi('Hospitals'), hint: bi(''), target: route('/hospitals'), visible: true }],
    },
    pathways: {
      heading: bi('Pathways'),
      groups: [{
        id: 'employees', heading: bi('Employees'), helplineId: 'general', visible: true,
        links: [{ ...link('policy', 'Policy', documentTarget('doc-1')), icon: 'file' }],
      }],
    },
    documents: {
      heading: bi('Documents'), intro: bi(''), documentIds: ['doc-2'], categories: ['enrolment-form'],
      links: [link('all-forms', 'All forms', route('/forms'))],
    },
    coverage: { heading: bi('Coverage'), linkLabel: bi('Read more') },
    helplines: { heading: bi('Help'), intro: bi('') },
    highlights: { heading: bi('Highlights'), intro: bi(''), items: [{ id: 'cover', value: bi('5,00,000'), label: bi('Cover'), note: bi(''), visible: true }] },
  };
}

function partnersDoc(): PartnersContent {
  return {
    heading: bi('Partners'),
    categories: [{ id: 'insurance', caption: bi('Insurance partner'), visible: true }, { id: 'service', caption: bi('Service partner'), visible: true }],
    partners: [
      { id: 'uiic', categoryId: 'insurance', name: bi('UIIC'), logo: builtInImage('UIIC logo'), url: 'https://example.org/uiic', visible: true },
      { id: 'vidal', categoryId: 'service', name: bi('Vidal'), logo: uploadedImage('abcd1234wxyz', 'Vidal logo'), url: null, visible: true },
    ],
  };
}

function footerDoc(): FooterContent {
  return {
    showWordmark: true,
    logos: [{ id: 'emblem', image: builtInImage('Emblem'), url: 'https://example.org/gov', visible: true }],
    about: { heading: bi('About'), text: bi('About the scheme.\nSecond line.') },
    linkGroups: [{ id: 'quick', heading: bi('Quick links'), visible: true, links: [link('hospitals', 'Hospitals', route('/hospitals'))] }],
    helplines: { visible: true, heading: bi('Helplines') },
    contact: { visible: true, heading: bi('Contact'), address: bi('Chennai\nTamil Nadu'), email: 'info@example.org', phone: '1800-233-5666' },
    copyright: bi('(c) {year} TN-NHIS'),
  };
}

const SINGLE_LINE_ENTRY = EDITABLE_TEXT_CATALOG.find((entry) => !entry.multiline);
const MULTI_LINE_ENTRY = EDITABLE_TEXT_CATALOG.find((entry) => entry.multiline);
const catalogSkip = (entry: EditableTextEntry | undefined): string | false => (entry ? false : 'the text catalog has no such entry');

function textDoc(): TextContent {
  return { overrides: SINGLE_LINE_ENTRY ? { [SINGLE_LINE_ENTRY.key]: bi('A new title', 'புதிய தலைப்பு') } : {} };
}

const FIXTURES: { [K in SiteContentKey]: () => SiteContentMap[K] } = {
  manual: () => ({ title: bi('User Manual'), intro: bi(''), manual: { title: bi('Manual'), buttonLabel: bi('Download'), visible: true, source: { type: 'builtIn', path: 'user-manual/NHIS_User_Manual.pdf' } }, videos: [] }),
  header: headerDoc, navigation: navigationDoc, home: homeDoc, partners: partnersDoc, footer: footerDoc, text: textDoc,
};

/* ------------------------------------------------------------------ helpers */

/** A deep copy of `doc` with the value at `path` ("loginMenu.items[0].target.url") replaced, or deleted when `value` is undefined. */
function edit<T>(doc: T, path: string, value: unknown): T {
  const copy = structuredClone(doc);
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let node = copy as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

function validate<K extends SiteContentKey>(key: K, input: unknown): ReturnType<typeof validateSiteContent<K>> {
  return validateSiteContent(key, input);
}

function accepted<K extends SiteContentKey>(key: K, input: unknown): SiteContentMap[K] {
  const result = validate(key, input);
  if (!result.ok) assert.fail(`expected ${key} to be accepted, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

function issuesOf<K extends SiteContentKey>(key: K, input: unknown): SiteContentIssue[] {
  const result = validate(key, input);
  if (result.ok) assert.fail(`expected ${key} to be rejected`);
  return result.issues;
}

function assertRejected<K extends SiteContentKey>(key: K, input: unknown, field: string, message?: RegExp): void {
  const issues = issuesOf(key, input);
  const found = issues.find((issue) => issue.field === field);
  assert.ok(found, `expected an issue at "${field}", got ${JSON.stringify(issues)}`);
  if (message) assert.match(found.message, message);
}

/** The document is rejected with exactly one issue, at `field`. */
function assertOnlyIssue<K extends SiteContentKey>(key: K, input: unknown, field: string, message?: RegExp): void {
  const issues = issuesOf(key, input);
  assert.deepEqual(issues.map((issue) => issue.field), [field], JSON.stringify(issues));
  if (message) assert.match(issues[0].message, message);
}

const navWithTarget = (target: unknown): unknown => edit(navigationDoc(), 'items[0].target', target);

/* ------------------------------------------------------------------ valid input and normalisation */

test('a minimal valid document of every kind is accepted and returned as an equal deep copy', () => {
  for (const key of SITE_CONTENT_KEYS) {
    const input = FIXTURES[key]();
    const snapshot = structuredClone(input);
    const value = accepted(key, input);
    assert.deepEqual(value, snapshot, key);
    assert.notEqual(value, input, `${key} must be a copy`);
    assert.deepEqual(input, snapshot, `${key} input must not be modified`);
  }
});

test('the result shares no object or list with the input', () => {
  const input = headerDoc();
  const value = accepted('header', input);
  value.helplines[0].label.en = 'changed';
  value.helplines.pop();
  value.loginMenu.items[0].label.en = 'changed';
  assert.equal(input.helplines.length, 2);
  assert.equal(input.helplines[0].label.en, 'General');
  assert.equal(input.loginMenu.items[0].label.en, 'Employee portal');
});

test('strings are trimmed and NFC-normalised', () => {
  const doc = edit(edit(headerDoc(), 'title.en', '   TN-NHIS \n'), 'subtitle.en', `Cafe${COMBINING_ACUTE}`);
  const value = accepted('header', doc);
  assert.equal(value.title.en, 'TN-NHIS');
  assert.equal(value.subtitle.en, 'Café');
  assert.equal(value.subtitle.en.length, 4);
});

test('phone links keep only digits and a leading plus; email links and numbers are trimmed', () => {
  const nav = accepted('navigation', navWithTarget({ type: 'phone', number: ' +91 44-2345 6789 ' }));
  assert.deepEqual(nav.items[0].type === 'link' && nav.items[0].target, { type: 'phone', number: '+914423456789' });
  const mail = accepted('navigation', navWithTarget({ type: 'email', address: '  info@example.org ' }));
  assert.deepEqual(mail.items[0].type === 'link' && mail.items[0].target, { type: 'email', address: 'info@example.org' });
  const header = accepted('header', edit(headerDoc(), 'helplines[0].number', '  1800 233-5666 '));
  assert.equal(header.helplines[0].number, '1800 233-5666');
});

test('external addresses are stored as the normalised href', () => {
  const nav = accepted('navigation', navWithTarget({ type: 'external', url: '  https://Example.ORG ' }));
  assert.deepEqual(nav.items[0].type === 'link' && nav.items[0].target, { type: 'external', url: 'https://example.org/' });
  const partners = accepted('partners', edit(partnersDoc(), 'partners[0].url', 'HTTPS://Example.org/a?b=c#d'));
  assert.equal(partners.partners[0].url, 'https://example.org/a?b=c#d');
});

test('Tamil text is accepted unchanged, an empty or missing Tamil text is accepted', () => {
  const tamil = 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம் - 5 இலட்சம்';
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', tamil)).subtitle.ta, tamil);
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', '')).subtitle.ta, '');
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', '   ')).subtitle.ta, '');
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', undefined)).subtitle.ta, '');
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', null)).subtitle.ta, '');
  const joiners = `க${ZWNJ}ஷ`;
  assert.equal(accepted('header', edit(headerDoc(), 'subtitle.ta', joiners)).subtitle.ta, joiners);
});

test('optional texts (hint, intro, note, description, address, email, phone) may be empty or missing', () => {
  const home = edit(edit(edit(homeDoc(), 'hero.description', undefined), 'hero.search.hint', undefined), 'highlights.items[0].note', undefined);
  const value = accepted('home', home);
  assert.deepEqual(value.hero.description, bi(''));
  assert.deepEqual(value.highlights.items[0].note, bi(''));
  const footer = edit(edit(edit(footerDoc(), 'contact.address', undefined), 'contact.email', ''), 'contact.phone', '');
  const out = accepted('footer', footer);
  assert.deepEqual([out.contact.address, out.contact.email, out.contact.phone], [bi(''), '', '']);
  assert.equal(accepted('header', edit(headerDoc(), 'availability', '')).availability, '');
});

/* ------------------------------------------------------------------ plain text */

test('HTML-like markup is rejected in every text field', () => {
  for (const text of ['<b>bold</b>', '<script>alert(1)</script>', 'x <img src=x onerror=1>', '<!-- hidden -->', '<?xml version="1.0"?>', '</div>', 'a<b']) {
    assertOnlyIssue('header', edit(headerDoc(), 'title.en', text), 'title.en', /HTML/);
  }
  assertOnlyIssue('header', edit(headerDoc(), 'title.ta', '<b>தமிழ்</b>'), 'title.ta', /HTML/);
  assertRejected('home', edit(homeDoc(), 'hero.coverageStatement.en', 'Cover <script>x</script>'), 'hero.coverageStatement.en');
  assertRejected('footer', edit(footerDoc(), 'about.text.en', 'line\n<iframe src=x>'), 'about.text.en');
});

test('a "<" that cannot start markup is allowed', () => {
  for (const text of ['5 < 6', 'a <3 b', 'x<', '1<2', 'A & B > C']) {
    assert.equal(accepted('header', edit(headerDoc(), 'title.en', text)).title.en, text);
  }
});

test('control characters and invisible characters are rejected', () => {
  for (const text of [`a${NUL}b`, `a${BELL}b`, 'a\tb', 'a\nb', 'a\rb', `a${ZWSP}b`, `a${RLO}b`, `a${charOf(0xd800)}b`, `a${charOf(0x85)}b`]) {
    assertOnlyIssue('header', edit(headerDoc(), 'title.en', text), 'title.en', /not allowed/);
  }
  assertRejected('header', edit(headerDoc(), 'subtitle.ta', `த${NUL}`), 'subtitle.ta');
});

test('line breaks are accepted only in long-text fields and are normalised to LF', () => {
  const about = accepted('footer', edit(footerDoc(), 'about.text.en', 'one\r\ntwo\rthree\n\nfour'));
  assert.equal(about.about.text.en, 'one\ntwo\nthree\n\nfour');
  assert.equal(accepted('footer', footerDoc()).contact.address.en, 'Chennai\nTamil Nadu');
  assertOnlyIssue('footer', edit(footerDoc(), 'about.text.en', 'one\ttwo'), 'about.text.en', /not allowed/);
  assertOnlyIssue('footer', edit(footerDoc(), 'about.text.en', `one${NUL}two`), 'about.text.en', /not allowed/);
  assertOnlyIssue('footer', edit(footerDoc(), 'copyright.en', 'one\ntwo'), 'copyright.en', /not allowed/);
  assertOnlyIssue('home', edit(homeDoc(), 'hero.title.en', 'one\ntwo'), 'hero.title.en', /not allowed/);
});

test('required texts reject empty, whitespace-only and missing values; the English text is required, not the Tamil text', () => {
  for (const value of ['', '   ', ' \n ', undefined, null]) {
    assertOnlyIssue('header', edit(headerDoc(), 'title.en', value), 'title.en', /required/);
  }
  assertOnlyIssue('header', edit(headerDoc(), 'title', undefined), 'title.en', /required/);
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[0].label.en', ''), 'items[0].label.en', /required/);
  assertOnlyIssue('footer', edit(footerDoc(), 'about.text.en', '  '), 'about.text.en', /required/);
  assertOnlyIssue('footer', edit(footerDoc(), 'copyright.en', ''), 'copyright.en', /required/);
});

test('texts must be strings and bilingual values must be objects', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'title.en', 5), 'title.en', /text/);
  assertOnlyIssue('header', edit(headerDoc(), 'title.ta', ['x']), 'title.ta', /text/);
  // A wrong shape is reported once at its own path, without noise below it.
  assertOnlyIssue('header', edit(headerDoc(), 'title', 'TN-NHIS'), 'title', /object/);
  assertOnlyIssue('header', edit(headerDoc(), 'title', ['TN-NHIS']), 'title', /object/);
});

test('length limits follow SITE_CONTENT_LIMITS (exact limit accepted, one more rejected)', () => {
  const cases: Array<{ key: 'header' | 'navigation' | 'home' | 'footer'; doc: unknown; path: string; limit: number }> = [
    { key: 'header', doc: headerDoc(), path: 'title.en', limit: L.heading },
    { key: 'header', doc: headerDoc(), path: 'helplines[0].label.en', limit: L.label },
    { key: 'navigation', doc: navigationDoc(), path: 'items[0].label.en', limit: L.label },
    { key: 'home', doc: homeDoc(), path: 'hero.description.en', limit: L.text },
    { key: 'home', doc: homeDoc(), path: 'hero.coverageStatement.en', limit: L.longText },
    { key: 'footer', doc: footerDoc(), path: 'about.text.en', limit: L.longText },
    { key: 'footer', doc: footerDoc(), path: 'copyright.en', limit: L.text },
    { key: 'footer', doc: footerDoc(), path: 'contact.address.en', limit: L.text },
    { key: 'header', doc: headerDoc(), path: 'emblem.alt.en', limit: L.alt },
    { key: 'header', doc: headerDoc(), path: 'availability', limit: L.label },
  ];
  for (const { key, doc, path, limit } of cases) {
    accepted(key, edit(doc, path, 'x'.repeat(limit)));
    assertOnlyIssue(key, edit(doc, path, 'x'.repeat(limit + 1)), path, /Too long/);
  }
  // Tamil text is measured in the same way.
  assertOnlyIssue('header', edit(headerDoc(), 'title.ta', 'த'.repeat(L.heading + 1)), 'title.ta', /Too long/);
});

/* ------------------------------------------------------------------ links */

test('route links accept SITE_ROUTES with an optional anchor and nothing else', () => {
  for (const { path } of SITE_ROUTES) {
    accepted('navigation', navWithTarget(route(path)));
    accepted('navigation', navWithTarget(route(`${path}#section-1`)));
    assert.ok(isKnownSiteRoute(path));
  }
  for (const path of ['/Hospitals', '/HOSPITALS', '/nope', '/hospitals/', '/hospitals?x=1', 'hospitals', '', '#top', '/forms#', '/forms#bad anchor',
    '/forms#a#b', `/forms#${'a'.repeat(65)}`, 'https://example.org/forms', 'javascript:alert(1)', '//example.org', '/hospitals/../x']) {
    assertOnlyIssue('navigation', navWithTarget(route(path)), 'items[0].target.path');
    assert.equal(isKnownSiteRoute(path), false, path);
  }
  accepted('navigation', navWithTarget(route(`/forms#${'a'.repeat(64)}`)));
  assertOnlyIssue('navigation', navWithTarget(route('/nope')), 'items[0].target.path', /pages of this website/);
});

test('external links must be absolute https addresses without credentials', () => {
  accepted('navigation', navWithTarget(external('https://example.org/path?x=1&y=2#frag')));
  accepted('navigation', navWithTarget(external('https://example.org:8443/')));
  const bad = [
    'javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.org', 'HTTP://example.org',
    'ftp://example.org/file', '//example.org', 'example.org', 'https:example.org', 'https:///', 'https://', 'https://user:secret@example.org/',
    'https://user@example.org/', 'https://exa mple.org/', 'https://example.org/a b', 'https://example.org/\u0007', 'https://[::1', '',
    `https://example.org/${'a'.repeat(L.url)}`,
  ];
  for (const url of bad) {
    assertOnlyIssue('navigation', navWithTarget(external(url)), 'items[0].target.url');
    assert.equal(isSafeHttpsUrl(url), false, url);
  }
  assertOnlyIssue('navigation', navWithTarget(external('javascript:alert(1)')), 'items[0].target.url', /https:\/\//);
  assertOnlyIssue('navigation', navWithTarget(external('https://user:secret@example.org/')), 'items[0].target.url', /user name or password/);
  assert.equal(isSafeHttpsUrl('https://example.org/'), true);
  assert.equal(isSafeHttpsUrl('https://tn-nhis.com/?Pagename=TNportal'), true);
});

test('partner and footer-logo addresses follow the same https rule and may be empty', () => {
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[0].url', 'http://example.org'), 'partners[0].url');
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[0].url', 'javascript:alert(1)'), 'partners[0].url');
  assertOnlyIssue('footer', edit(footerDoc(), 'logos[0].url', 'https://user:pw@example.org'), 'logos[0].url');
  assert.equal(accepted('partners', edit(partnersDoc(), 'partners[0].url', '')).partners[0].url, null);
  assert.equal(accepted('partners', edit(partnersDoc(), 'partners[0].url', null)).partners[0].url, null);
  assert.equal(accepted('footer', edit(footerDoc(), 'logos[0].url', undefined)).logos[0].url, null);
});

test('document links need a plain id', () => {
  accepted('navigation', navWithTarget(documentTarget('abc-123_X')));
  accepted('navigation', navWithTarget(documentTarget('a'.repeat(128))));
  for (const id of ['', '   ', '-abc', '_abc', 'has space', 'a/b', '../x', 'a'.repeat(129), 'é']) {
    assertOnlyIssue('navigation', navWithTarget(documentTarget(id)), 'items[0].target.documentId');
  }
  assertOnlyIssue('navigation', navWithTarget({ type: 'document', documentId: 5 }), 'items[0].target.documentId');
});

test('email links need a valid address', () => {
  accepted('navigation', navWithTarget({ type: 'email', address: 'first.last+tag@sub.example.org' }));
  for (const address of ['', 'not-an-email', 'a@b', '@example.org', 'a@@example.org', 'a b@example.org', 'a..b@example.org', `${'a'.repeat(250)}@example.org`]) {
    assertOnlyIssue('navigation', navWithTarget({ type: 'email', address }), 'items[0].target.address');
  }
});

test('phone links need 6 to 15 digits after spaces and hyphens are removed', () => {
  accepted('navigation', navWithTarget({ type: 'phone', number: '1800-233-5666' }));
  accepted('navigation', navWithTarget({ type: 'phone', number: '+123456' }));
  accepted('navigation', navWithTarget({ type: 'phone', number: '1'.repeat(15) }));
  for (const number of ['', '12345', '1'.repeat(16), '+12345', 'abc', '+', '(044) 1234567', '044.1234567', '1800-CALL-NOW', '++1234567', '12+3456789']) {
    assertOnlyIssue('navigation', navWithTarget({ type: 'phone', number }), 'items[0].target.number');
  }
});

test('link targets: unknown types, wrong shapes and unknown properties are rejected', () => {
  assertOnlyIssue('navigation', navWithTarget({ type: 'href', href: 'https://example.org' }), 'items[0].target.type');
  assertOnlyIssue('navigation', navWithTarget({ path: '/' }), 'items[0].target.type');
  assertOnlyIssue('navigation', navWithTarget('https://example.org'), 'items[0].target', /object/);
  assertOnlyIssue('navigation', navWithTarget(undefined), 'items[0].target');
  assertRejected('navigation', navWithTarget({ type: 'route', path: '/', href: 'javascript:alert(1)' }), 'items[0].target.href', /Unknown/);
  assertRejected('navigation', navWithTarget({ type: 'external', url: 'https://example.org/', path: '/' }), 'items[0].target.path', /Unknown/);
  assertOnlyIssue('navigation', navWithTarget({ type: 'route', path: 5 }), 'items[0].target.path');
});

test('helpline numbers: as displayed, 3 to 15 digits', () => {
  for (const number of ['1800-233-5666', '+91 44 2345 6789', '108', '044 2345 6789', '+9144', '1'.repeat(15)]) {
    assert.equal(accepted('header', edit(headerDoc(), 'helplines[0].number', number)).helplines[0].number, number);
  }
  for (const number of ['', '12', '1'.repeat(16), 'abc', '-1800', '1800-CALL', '(044) 2345', '+', ' - ', '1'.repeat(31)]) {
    assertOnlyIssue('header', edit(headerDoc(), 'helplines[0].number', number), 'helplines[0].number');
  }
  assertOnlyIssue('footer', edit(footerDoc(), 'contact.phone', 'phone'), 'contact.phone');
  assertOnlyIssue('footer', edit(footerDoc(), 'contact.email', 'nobody'), 'contact.email');
});

test('login menu items and the forgot-password link are validated as links', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.items[1].target.type', 'portal'), 'loginMenu.items[1].target.type');
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.items[1].target', external('http://example.org')), 'loginMenu.items[1].target.url');
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.forgotPassword.target', external('javascript:alert(1)')), 'loginMenu.forgotPassword.target.url');
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.forgotPassword', undefined), 'loginMenu.forgotPassword', /object/);
});

/* ------------------------------------------------------------------ images */

test('an image needs an upload id or a built-in path', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'emblem', { assetId: null, builtIn: null, alt: bi('x'), width: null, height: null }), 'emblem', /image/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem', { alt: bi('x') }), 'emblem', /image/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem', { assetId: '  ', builtIn: '', alt: bi('x') }), 'emblem', /image/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem', null), 'emblem', /required/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem', 'assets/logo.png'), 'emblem', /object/);
});

test('uploaded image ids and built-in paths are checked', () => {
  for (const assetId of ['short', 'has space 123', 'abc/defgh123', 'a'.repeat(65), 'abcdefg!']) {
    assertOnlyIssue('header', edit(headerDoc(), 'emblem', uploadedImage(assetId)), 'emblem.assetId');
  }
  accepted('header', edit(headerDoc(), 'emblem', uploadedImage('a'.repeat(8))));
  accepted('header', edit(headerDoc(), 'emblem', uploadedImage('A_b-1234'.repeat(8))));
  for (const builtIn of ['assets/logo.svg', 'assets/logo.gif', 'images/logo.png', '../assets/logo.png', '/assets/logo.png', 'assets/sub/logo.png', 'assets/logo', 'http://x.org/logo.png', 'data:image/png;base64,AAAA']) {
    assertOnlyIssue('header', edit(headerDoc(), 'emblem.builtIn', builtIn), 'emblem.builtIn');
  }
  accepted('header', edit(headerDoc(), 'emblem.builtIn', 'assets/tn-government-emblem.png'));
  accepted('header', edit(headerDoc(), 'emblem.builtIn', 'assets/header-portrait.jpeg'));
});

test('when both are present the upload wins and the built-in path is dropped', () => {
  const doc = edit(headerDoc(), 'emblem', { assetId: 'abcd1234efgh', builtIn: 'assets/logo.png', alt: bi('x'), width: null, height: null });
  const value = accepted('header', doc);
  assert.equal(value.emblem.assetId, 'abcd1234efgh');
  assert.equal(value.emblem.builtIn, null);
  assert.equal(accepted('header', edit(headerDoc(), 'emblem.assetId', undefined)).emblem.builtIn, 'assets/logo.png');
});

test('alt text: English required, Tamil optional, plain text only', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'emblem.alt.en', ''), 'emblem.alt.en', /alt text/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem.alt', undefined), 'emblem.alt.en', /alt text/);
  assertOnlyIssue('header', edit(headerDoc(), 'emblem.alt.en', '<b>x</b>'), 'emblem.alt.en', /HTML/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[1].logo.alt.en', '  '), 'partners[1].logo.alt.en');
  assertOnlyIssue('footer', edit(footerDoc(), 'logos[0].image.alt', { en: '', ta: 'தமிழ்' }), 'logos[0].image.alt.en');
  assert.equal(accepted('header', edit(headerDoc(), 'emblem.alt.ta', '')).emblem.alt.ta, '');
});

test('image dimensions are null or whole numbers from 1 to 20000', () => {
  for (const width of [0, -1, 1.5, 20001, '10', Number.NaN, Number.POSITIVE_INFINITY, true]) {
    assertOnlyIssue('header', edit(headerDoc(), 'emblem.width', width), 'emblem.width');
  }
  assertOnlyIssue('header', edit(headerDoc(), 'emblem.height', 0), 'emblem.height');
  for (const size of [1, 20000, null, undefined]) {
    accepted('header', edit(edit(headerDoc(), 'emblem.width', size), 'emblem.height', size));
  }
});

test('image objects reject unknown properties; the optional hero banner accepts null and is validated when present', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'emblem.src', 'https://example.org/x.png'), 'emblem.src', /Unknown/);
  assert.equal(accepted('home', edit(homeDoc(), 'hero.banner', null)).hero.banner, null);
  assert.equal(accepted('home', edit(homeDoc(), 'hero.banner', undefined)).hero.banner, null);
  const banner = accepted('home', edit(homeDoc(), 'hero.banner', uploadedImage('abcd1234efgh', 'Banner'))).hero.banner;
  assert.equal(banner?.assetId, 'abcd1234efgh');
  assertOnlyIssue('home', edit(homeDoc(), 'hero.banner', { ...uploadedImage('abcd1234efgh'), alt: bi('') }), 'hero.banner.alt.en');
  assertOnlyIssue('home', edit(homeDoc(), 'hero.banner', { assetId: null, builtIn: null, alt: bi('x') }), 'hero.banner');
});

/* ------------------------------------------------------------------ ids and structure */

test('ids follow SITE_ID_PATTERN', () => {
  for (const id of ['a', 'A1', 'a-b-c', 'a'.repeat(40)]) accepted('header', edit(headerDoc(), 'helplines[0].id', id));
  for (const id of ['', '  ', '1abc', '-abc', 'a_b', 'a b', 'a'.repeat(41), 'é', 'a.b', 5]) {
    assertOnlyIssue('header', edit(headerDoc(), 'helplines[0].id', id), 'helplines[0].id');
  }
});

test('navigation: ids are unique across top-level items and menu children', () => {
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].id', 'home'), 'items[1].id', /more than once/);
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children[1].id', 'home'), 'items[1].children[1].id', /more than once/);
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children[1].id', 'policy'), 'items[1].children[1].id', /more than once/);
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children[2].id', 'policy-head'), 'items[1].children[2].id', /more than once/);
});

test('navigation: needs a visible top-level item and a link in every menu', () => {
  assertOnlyIssue('navigation', { items: [] }, 'items', /visible/);
  assertOnlyIssue('navigation', edit(edit(navigationDoc(), 'items[0].visible', false), 'items[1].visible', false), 'items', /visible/);
  // A hidden item is fine while another one is visible.
  accepted('navigation', edit(navigationDoc(), 'items[0].visible', false));
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children', []), 'items[1].children', /at least one link/);
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children', [{ type: 'heading', id: 'only', label: bi('Only'), visible: true }]), 'items[1].children', /at least one link/);
});

test('navigation: item and child types, and their properties, are checked', () => {
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[0].type', 'heading'), 'items[0].type');
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[1].children[0].type', 'menu'), 'items[1].children[0].type');
  assertOnlyIssue('navigation', edit(navigationDoc(), 'items[0]', 'Home'), 'items[0]', /object/);
  assertRejected('navigation', edit(navigationDoc(), 'items[0].children', []), 'items[0].children', /Unknown/);
  assertRejected('navigation', edit(navigationDoc(), 'items[1].children[0].target', route('/')), 'items[1].children[0].target', /Unknown/);
  assertRejected('navigation', edit(navigationDoc(), 'items[1].children[1].children', []), 'items[1].children[1].children', /Unknown/);
});

test('header: ids are unique among helplines and among login items with the forgot-password link', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'helplines[1].id', 'general'), 'helplines[1].id', /more than once/);
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.items[1].id', 'employee'), 'loginMenu.items[1].id', /more than once/);
  assertOnlyIssue('header', edit(headerDoc(), 'loginMenu.forgotPassword.id', 'pensioner'), 'loginMenu.forgotPassword.id', /more than once/);
  // The two lists have separate id spaces (helpline ids are referenced by the homepage, login ids by the portal links).
  accepted('header', edit(headerDoc(), 'loginMenu.items[0].id', 'general'));
});

test('footer: ids are unique within each list', () => {
  const twoLogos = edit(footerDoc(), 'logos', [...footerDoc().logos, ...footerDoc().logos]);
  assertOnlyIssue('footer', twoLogos, 'logos[1].id', /more than once/);
  const twoGroups = edit(footerDoc(), 'linkGroups', [...footerDoc().linkGroups, ...footerDoc().linkGroups]);
  assertOnlyIssue('footer', twoGroups, 'linkGroups[1].id', /more than once/);
  const twoLinks = edit(footerDoc(), 'linkGroups[0].links', [...footerDoc().linkGroups[0].links, ...footerDoc().linkGroups[0].links]);
  assertOnlyIssue('footer', twoLinks, 'linkGroups[0].links[1].id', /more than once/);
  // The same id in different lists is fine.
  accepted('footer', edit(footerDoc(), 'logos[0].id', 'quick'));
});

test('partners: ids are unique per list and every category id must exist', () => {
  assertRejected('partners', edit(partnersDoc(), 'categories[1].id', 'insurance'), 'categories[1].id', /more than once/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[1].id', 'uiic'), 'partners[1].id', /more than once/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[1].categoryId', 'missing'), 'partners[1].categoryId', /partner groups/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[0].categoryId', 'Insurance'), 'partners[0].categoryId', /partner groups/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[0].categoryId', undefined), 'partners[0].categoryId', /required/);
  assert.deepEqual(issuesOf('partners', edit(partnersDoc(), 'categories', [])).map((issue) => issue.field), ['partners[0].categoryId', 'partners[1].categoryId']);
  accepted('partners', edit(edit(partnersDoc(), 'categories', []), 'partners', []));
  // A category may exist without partners; a partner may not point at a category that was renamed.
  accepted('partners', edit(partnersDoc(), 'partners', []));
  assertOnlyIssue('partners', edit(partnersDoc(), 'categories[0].id', 'insurer'), 'partners[0].categoryId', /partner groups/);
});

test('home.sections lists every section exactly once, hero first and visible', () => {
  const sections = homeDoc().sections;
  assertOnlyIssue('home', edit(homeDoc(), 'sections', sections.slice(0, 7)), 'sections', /Missing: partners/);
  assertOnlyIssue('home', edit(homeDoc(), 'sections', []), 'sections', /Missing/);
  assertRejected('home', edit(homeDoc(), 'sections[3].id', 'hero'), 'sections[3].id', /more than once/);
  assertRejected('home', edit(homeDoc(), 'sections[3].id', 'hero'), 'sections', /Missing: documents/);
  assertRejected('home', edit(homeDoc(), 'sections[3].id', 'news'), 'sections[3].id', /not a known/);
  assertRejected('home', edit(homeDoc(), 'sections', [...sections, { id: 'hero', visible: true }]), 'sections', /Too many/);
  assertOnlyIssue('home', edit(homeDoc(), 'sections', [sections[1], sections[0], ...sections.slice(2)]), 'sections[0].id', /hero.*first/);
  assertOnlyIssue('home', edit(homeDoc(), 'sections[0].visible', false), 'sections[0].visible', /hero.*hidden/);
  assertOnlyIssue('home', edit(homeDoc(), 'sections', 'hero'), 'sections', /list/);
  // Any other order and visibility is fine.
  accepted('home', edit(homeDoc(), 'sections', [sections[0], ...sections.slice(1).reverse().map((section) => ({ ...section, visible: false }))]));
});

test('home: ids are unique per list; icons, variants and categories are checked', () => {
  const tile = homeDoc().quickAccess.tiles[0];
  assertOnlyIssue('home', edit(homeDoc(), 'quickAccess.tiles', [tile, tile]), 'quickAccess.tiles[1].id', /more than once/);
  const item = homeDoc().highlights.items[0];
  assertOnlyIssue('home', edit(homeDoc(), 'highlights.items', [item, item]), 'highlights.items[1].id', /more than once/);
  assertOnlyIssue('home', edit(homeDoc(), 'quickAccess.tiles[0].icon', 'rocket'), 'quickAccess.tiles[0].icon', /icons/);
  assertOnlyIssue('home', edit(homeDoc(), 'pathways.groups[0].links[0].icon', 'rocket'), 'pathways.groups[0].links[0].icon');
  assertOnlyIssue('home', edit(homeDoc(), 'hero.actions[0].variant', 'danger'), 'hero.actions[0].variant');
  assertOnlyIssue('home', edit(homeDoc(), 'documents.categories', ['enrolment-form', 'enrolment-form']), 'documents.categories[1]', /more than once/);
  assertOnlyIssue('home', edit(homeDoc(), 'documents.categories', ['menu']), 'documents.categories[0]', /category/);
  assertOnlyIssue('home', edit(homeDoc(), 'documents.documentIds', ['doc-2', 'doc-2']), 'documents.documentIds[1]', /more than once/);
  assertOnlyIssue('home', edit(homeDoc(), 'documents.documentIds', ['bad id']), 'documents.documentIds[0]');
  assert.equal(accepted('home', edit(homeDoc(), 'pathways.groups[0].helplineId', null)).pathways.groups[0].helplineId, null);
  assert.equal(accepted('home', edit(homeDoc(), 'pathways.groups[0].helplineId', '')).pathways.groups[0].helplineId, null);
  assertOnlyIssue('home', edit(homeDoc(), 'pathways.groups[0].helplineId', 'bad id'), 'pathways.groups[0].helplineId');
  accepted('home', edit(homeDoc(), 'documents.documentIds', []));
});

/* ------------------------------------------------------------------ list limits */

test('lists are bounded by SITE_CONTENT_LIMITS (the limit is accepted, one more is rejected)', () => {
  const helplines = (n: number) => many(n, (i) => ({ id: `h-${i}`, label: bi('Line'), number: '1800-233-5666', visible: true }));
  const links = (n: number) => many(n, (i) => link(`l-${i}`, 'Link', route('/')));
  const navLinks = (n: number) => many(n, (i) => ({ type: 'link' as const, ...link(`n-${i}`, 'Link', route('/')) }));
  const cases: Array<{ key: SiteContentKey; doc: unknown; path: string; limit: number; make: (n: number) => unknown }> = [
    { key: 'header', doc: headerDoc(), path: 'helplines', limit: L.helplines, make: helplines },
    { key: 'header', doc: headerDoc(), path: 'loginMenu.items', limit: L.loginItems, make: links },
    { key: 'navigation', doc: navigationDoc(), path: 'items', limit: L.navItems, make: navLinks },
    { key: 'navigation', doc: navigationDoc(), path: 'items[1].children', limit: L.navChildren, make: navLinks },
    { key: 'home', doc: homeDoc(), path: 'hero.actions', limit: L.homeActions, make: (n) => links(n).map((item) => ({ ...item, variant: 'ghost' })) },
    { key: 'home', doc: homeDoc(), path: 'quickAccess.tiles', limit: L.quickTiles, make: (n) => many(n, (i) => ({ id: `t-${i}`, icon: 'home', label: bi('Tile'), hint: bi(''), target: route('/'), visible: true })) },
    { key: 'home', doc: homeDoc(), path: 'pathways.groups', limit: L.pathwayGroups, make: (n) => many(n, (i) => ({ id: `g-${i}`, heading: bi('Group'), links: [], helplineId: null, visible: true })) },
    { key: 'home', doc: homeDoc(), path: 'pathways.groups[0].links', limit: L.pathwayLinks, make: (n) => links(n).map((item) => ({ ...item, icon: 'file' })) },
    { key: 'home', doc: homeDoc(), path: 'documents.documentIds', limit: L.documentIds, make: (n) => many(n, (i) => `doc-${i}`) },
    { key: 'home', doc: homeDoc(), path: 'documents.links', limit: L.footerLinks, make: links },
    { key: 'home', doc: homeDoc(), path: 'highlights.items', limit: L.highlights, make: (n) => many(n, (i) => ({ id: `i-${i}`, value: bi('1'), label: bi('Item'), note: bi(''), visible: true })) },
    { key: 'partners', doc: partnersDoc(), path: 'categories', limit: L.partnerCategories, make: (n) => many(n, (i) => ({ id: ['insurance', 'service'][i] ?? `c-${i}`, caption: bi('Group'), visible: true })) },
    { key: 'partners', doc: partnersDoc(), path: 'partners', limit: L.partners, make: (n) => many(n, (i) => ({ id: `p-${i}`, categoryId: 'insurance', name: bi('Partner'), logo: builtInImage(), url: null, visible: true })) },
    { key: 'footer', doc: footerDoc(), path: 'logos', limit: L.footerLogos, make: (n) => many(n, (i) => ({ id: `f-${i}`, image: builtInImage(), url: null, visible: true })) },
    { key: 'footer', doc: footerDoc(), path: 'linkGroups', limit: L.footerGroups, make: (n) => many(n, (i) => ({ id: `g-${i}`, heading: bi('Group'), links: [], visible: true })) },
    { key: 'footer', doc: footerDoc(), path: 'linkGroups[0].links', limit: L.footerLinks, make: links },
  ];
  for (const { key, doc, path, limit, make } of cases) {
    accepted(key, edit(doc, path, make(limit)));
    assertOnlyIssue(key, edit(doc, path, make(limit + 1)), path, /Too many/);
  }
});

test('lists must be lists', () => {
  assertOnlyIssue('header', edit(headerDoc(), 'helplines', {}), 'helplines', /list/);
  assertOnlyIssue('header', edit(headerDoc(), 'helplines', undefined), 'helplines', /required/);
  assertOnlyIssue('navigation', { items: 'Home' }, 'items', /list/);
  assertOnlyIssue('partners', edit(partnersDoc(), 'partners[0]', null), 'partners[0]', /object/);
});

/* ------------------------------------------------------------------ interface texts */

test('text: an override for a catalogued key is accepted; an empty language means "no override"', { skip: catalogSkip(SINGLE_LINE_ENTRY) }, () => {
  const key = SINGLE_LINE_ENTRY!.key;
  const both = accepted('text', { overrides: { [key]: bi('  New title ', 'புதிய தலைப்பு') } });
  assert.deepEqual(both.overrides, { [key]: bi('New title', 'புதிய தலைப்பு') });
  assert.deepEqual(accepted('text', { overrides: { [key]: bi('Only English') } }).overrides, { [key]: bi('Only English') });
  assert.deepEqual(accepted('text', { overrides: { [key]: bi('', 'தமிழ் மட்டும்') } }).overrides, { [key]: bi('', 'தமிழ் மட்டும்') });
  assert.deepEqual(accepted('text', { overrides: { [key]: { en: '   ', ta: '' } } }).overrides, {});
  assert.deepEqual(accepted('text', { overrides: { [key]: { en: '' } } }).overrides, {});
  assert.deepEqual(accepted('text', { overrides: {} }).overrides, {});
});

test('text: keys that are not in the catalog are rejected', () => {
  for (const key of ['nope.key', 'hospitals', '', '__proto__', 'constructor', 'hasOwnProperty', 'nav.home']) {
    const overrides = JSON.parse(`{${JSON.stringify(key)}: {"en": "x", "ta": ""}}`) as Record<string, unknown>;
    assertOnlyIssue('text', { overrides }, `overrides.${key}`, /cannot be changed/);
  }
});

test('text: structure and unknown properties', () => {
  assertOnlyIssue('text', {}, 'overrides', /required/);
  assertOnlyIssue('text', { overrides: [] }, 'overrides', /object/);
  assertOnlyIssue('text', { overrides: null }, 'overrides', /required/);
  assertRejected('text', { overrides: {}, extra: true }, 'extra', /Unknown/);
});

test('text: length and plain-text rules follow the catalog entry', { skip: catalogSkip(SINGLE_LINE_ENTRY) }, () => {
  const { key, maxLength } = SINGLE_LINE_ENTRY!;
  accepted('text', { overrides: { [key]: bi('x'.repeat(maxLength)) } });
  assertOnlyIssue('text', { overrides: { [key]: bi('x'.repeat(maxLength + 1)) } }, `overrides.${key}.en`, /Too long/);
  assertOnlyIssue('text', { overrides: { [key]: bi('ok', 'த'.repeat(maxLength + 1)) } }, `overrides.${key}.ta`, /Too long/);
  assertOnlyIssue('text', { overrides: { [key]: bi('<b>x</b>') } }, `overrides.${key}.en`, /HTML/);
  assertOnlyIssue('text', { overrides: { [key]: bi('a\nb') } }, `overrides.${key}.en`, /not allowed/);
  assertOnlyIssue('text', { overrides: { [key]: bi(`a${NUL}b`) } }, `overrides.${key}.en`, /not allowed/);
  assertOnlyIssue('text', { overrides: { [key]: { en: 'ok', ta: '', extra: 'x' } } }, `overrides.${key}.extra`, /Unknown/);
  assertOnlyIssue('text', { overrides: { [key]: 'ok' } }, `overrides.${key}`, /object/);
});

test('text: line breaks are accepted only for multiline catalog entries', { skip: catalogSkip(MULTI_LINE_ENTRY) }, () => {
  const { key } = MULTI_LINE_ENTRY!;
  assert.equal(accepted('text', { overrides: { [key]: bi('one\r\ntwo') } }).overrides[key].en, 'one\ntwo');
  assertOnlyIssue('text', { overrides: { [key]: bi('one\ttwo') } }, `overrides.${key}.en`, /not allowed/);
});

test('text: placeholders of the built-in text must be kept, and no other placeholder may be added', () => {
  const catalog = EDITABLE_TEXT_CATALOG as EditableTextEntry[];
  const synthetic: EditableTextEntry = {
    key: 'test.synthetic.count', group: 'Test', label: 'Test', multiline: false, maxLength: 100,
    defaults: { en: '{count} of {total} hospitals', ta: '{total} இல் {count}' },
  };
  const noTamil: EditableTextEntry = { ...synthetic, key: 'test.synthetic.noTamil', defaults: { en: 'Found {count}', ta: '' } };
  const plain: EditableTextEntry = { ...synthetic, key: 'test.synthetic.plain', defaults: { en: 'No placeholders', ta: '' } };
  catalog.push(synthetic, noTamil, plain);
  try {
    const key = synthetic.key;
    assert.deepEqual(accepted('text', { overrides: { [key]: bi('Showing {count} out of {total}', '{total} இல் {count} காட்டுகிறது') } }).overrides[key].en, 'Showing {count} out of {total}');
    accepted('text', { overrides: { [key]: bi('{total} {count} {count}') } });
    assertOnlyIssue('text', { overrides: { [key]: bi('Showing {count}') } }, `overrides.${key}.en`, /\{total\}/);
    assertOnlyIssue('text', { overrides: { [key]: bi('Showing everything') } }, `overrides.${key}.en`, /\{count\}, \{total\}/);
    assertOnlyIssue('text', { overrides: { [key]: bi('{count} of {all}') } }, `overrides.${key}.en`, /\{total\}/);
    assertOnlyIssue('text', { overrides: { [key]: bi('{count} {total} {extra}') } }, `overrides.${key}.en`, /\{extra\}/);
    assertOnlyIssue('text', { overrides: { [key]: bi('{ count } and {total}') } }, `overrides.${key}.en`, /\{count\}/);
    assertOnlyIssue('text', { overrides: { [key]: bi('{count} {total}', '{count}') } }, `overrides.${key}.ta`, /\{total\}/);
    // The Tamil override is compared with the Tamil built-in text, or with the English one when there is none.
    accepted('text', { overrides: { [noTamil.key]: bi('Got {count}', 'கிடைத்தது {count}') } });
    assertOnlyIssue('text', { overrides: { [noTamil.key]: bi('Got {count}', 'கிடைத்தது') } }, `overrides.${noTamil.key}.ta`, /\{count\}/);
    assertOnlyIssue('text', { overrides: { [plain.key]: bi('Found {count}') } }, `overrides.${plain.key}.en`, /\{count\}/);
    assertOnlyIssue('text', { overrides: { [plain.key]: bi('Fine', 'சரி {x}') } }, `overrides.${plain.key}.ta`, /\{x\}/);
    // Single braces that are not placeholders are ordinary text.
    accepted('text', { overrides: { [plain.key]: bi('Use { and } carefully') } });
  } finally {
    for (const entry of [synthetic, noTamil, plain]) catalog.splice(catalog.indexOf(entry), 1);
  }
  assert.equal(EDITABLE_TEXT_CATALOG.some((entry) => entry.key.startsWith('test.synthetic')), false);
});

/* ------------------------------------------------------------------ whole-document rules */

test('unknown properties are rejected at every object level', () => {
  const cases: Array<{ key: SiteContentKey; doc: unknown; path: string }> = [
    { key: 'header', doc: headerDoc(), path: '' },
    { key: 'header', doc: headerDoc(), path: 'title' },
    { key: 'header', doc: headerDoc(), path: 'emblem' },
    { key: 'header', doc: headerDoc(), path: 'emblem.alt' },
    { key: 'header', doc: headerDoc(), path: 'helplines[0]' },
    { key: 'header', doc: headerDoc(), path: 'loginMenu' },
    { key: 'header', doc: headerDoc(), path: 'loginMenu.items[0]' },
    { key: 'header', doc: headerDoc(), path: 'loginMenu.items[0].target' },
    { key: 'header', doc: headerDoc(), path: 'loginMenu.forgotPassword' },
    { key: 'navigation', doc: navigationDoc(), path: '' },
    { key: 'navigation', doc: navigationDoc(), path: 'items[0]' },
    { key: 'navigation', doc: navigationDoc(), path: 'items[1]' },
    { key: 'navigation', doc: navigationDoc(), path: 'items[1].children[0]' },
    { key: 'navigation', doc: navigationDoc(), path: 'items[1].children[1]' },
    { key: 'home', doc: homeDoc(), path: '' },
    { key: 'home', doc: homeDoc(), path: 'sections[0]' },
    { key: 'home', doc: homeDoc(), path: 'hero' },
    { key: 'home', doc: homeDoc(), path: 'hero.actions[0]' },
    { key: 'home', doc: homeDoc(), path: 'hero.search' },
    { key: 'home', doc: homeDoc(), path: 'quickAccess' },
    { key: 'home', doc: homeDoc(), path: 'quickAccess.tiles[0]' },
    { key: 'home', doc: homeDoc(), path: 'pathways' },
    { key: 'home', doc: homeDoc(), path: 'pathways.groups[0]' },
    { key: 'home', doc: homeDoc(), path: 'pathways.groups[0].links[0]' },
    { key: 'home', doc: homeDoc(), path: 'documents' },
    { key: 'home', doc: homeDoc(), path: 'documents.links[0]' },
    { key: 'home', doc: homeDoc(), path: 'coverage' },
    { key: 'home', doc: homeDoc(), path: 'helplines' },
    { key: 'home', doc: homeDoc(), path: 'highlights' },
    { key: 'home', doc: homeDoc(), path: 'highlights.items[0]' },
    { key: 'partners', doc: partnersDoc(), path: '' },
    { key: 'partners', doc: partnersDoc(), path: 'categories[0]' },
    { key: 'partners', doc: partnersDoc(), path: 'partners[0]' },
    { key: 'partners', doc: partnersDoc(), path: 'partners[0].logo' },
    { key: 'footer', doc: footerDoc(), path: '' },
    { key: 'footer', doc: footerDoc(), path: 'logos[0]' },
    { key: 'footer', doc: footerDoc(), path: 'about' },
    { key: 'footer', doc: footerDoc(), path: 'linkGroups[0]' },
    { key: 'footer', doc: footerDoc(), path: 'linkGroups[0].links[0]' },
    { key: 'footer', doc: footerDoc(), path: 'helplines' },
    { key: 'footer', doc: footerDoc(), path: 'contact' },
    { key: 'footer', doc: footerDoc(), path: 'copyright' },
    { key: 'text', doc: textDoc(), path: '' },
  ];
  for (const { key, doc, path } of cases) {
    const field = path === '' ? 'surprise' : `${path}.surprise`;
    const input = path === '' ? { ...(doc as object), surprise: 1 } : edit(doc, field, 1);
    assertOnlyIssue(key, input, field, /Unknown/);
  }
});

test('a __proto__ property from JSON.parse is rejected and never copied', () => {
  const parsed = JSON.parse('{"items":[{"type":"link","id":"home","label":{"en":"Home","ta":""},"target":{"type":"route","path":"/"},"visible":true}],"__proto__":{"polluted":true}}');
  assertOnlyIssue('navigation', parsed, '__proto__', /Unknown/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('every problem is reported, in document order, with its own path', () => {
  let doc = headerDoc();
  doc = edit(doc, 'emblem.alt.en', '');
  doc = edit(doc, 'title.en', '<b>x</b>');
  doc = edit(doc, 'helplines[1].number', 'abc');
  doc = edit(doc, 'loginMenu.items[0].target.url', 'http://example.org');
  doc = edit(doc, 'loginMenu.items[1].id', 'employee');
  const issues = issuesOf('header', doc);
  assert.deepEqual(issues.map((issue) => issue.field), [
    'emblem.alt.en', 'title.en', 'helplines[1].number', 'loginMenu.items[0].target.url', 'loginMenu.items[1].id',
  ]);
  for (const issue of issues) {
    assert.ok(issue.message.length > 0 && issue.message.length < 200, issue.message);
    assert.doesNotMatch(issue.message, /undefined|\[object|NaN/);
  }
});

test('the number of reported issues is capped', () => {
  const doc = edit(partnersDoc(), 'partners', many(L.partners, (i) => ({ id: `p-${i}`, categoryId: 'nope', name: bi(''), logo: { alt: bi('') }, url: 'x', visible: 'yes' })));
  const issues = issuesOf('partners', doc);
  assert.ok(issues.length >= 100 && issues.length <= 101, String(issues.length));
});

test('JSON larger than SITE_CONTENT_MAX_BYTES is rejected before anything else', () => {
  const huge = edit(headerDoc(), 'title.en', 'x'.repeat(SITE_CONTENT_MAX_BYTES));
  const issues = issuesOf('header', huge);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '');
  assert.match(issues[0].message, /too large/);
  // The limit counts UTF-8 bytes, not characters: three bytes per Tamil letter.
  const tamil = edit(headerDoc(), 'title.ta', 'த'.repeat(Math.ceil(SITE_CONTENT_MAX_BYTES / 3)));
  assert.deepEqual(issuesOf('header', tamil).map((issue) => issue.field), ['']);
  // Just below the limit the normal rules apply (and report the length of the text instead).
  const near = edit(headerDoc(), 'title.en', 'x'.repeat(SITE_CONTENT_MAX_BYTES - 5000));
  assert.deepEqual(issuesOf('header', near).map((issue) => issue.field), ['title.en']);
});

test('inputs that are not documents are rejected with one issue for the whole document', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const key of SITE_CONTENT_KEYS) {
    for (const input of [null, undefined, 'text', 5, true, [], [{}], circular, { n: BigInt(1) }]) {
      const issues = issuesOf(key, input);
      assert.equal(issues.length, 1, `${key} ${String(typeof input)}`);
      assert.equal(issues[0].field, '');
    }
    assert.equal(issuesOf(key, {}).length > 0, true);
  }
  assert.deepEqual(issuesOf('header' as SiteContentKey, 'x').map((issue) => issue.field), ['']);
  const unknownKey = validateSiteContent('settings' as SiteContentKey, {});
  assert.equal(unknownKey.ok, false);
});

test('booleans must be booleans', () => {
  for (const value of ['true', 1, 0, null, undefined]) {
    assertOnlyIssue('header', edit(headerDoc(), 'showPortrait', value), 'showPortrait');
    assertOnlyIssue('navigation', edit(navigationDoc(), 'items[0].visible', value), 'items[0].visible');
  }
  assertOnlyIssue('home', edit(homeDoc(), 'hero.search.showCount', 'yes'), 'hero.search.showCount', /true or false/);
});

/* ------------------------------------------------------------------ helpers for other code */

test('collectSiteContentRefs: document ids and asset ids, de-duplicated, in document order', () => {
  const header = edit(edit(edit(headerDoc(), 'emblem', uploadedImage('emblem-asset-1')), 'portrait', uploadedImage('portrait-asset')), 'loginMenu.items', [
    link('a', 'A', documentTarget('doc-b')), link('b', 'B', external('https://example.org/')), link('c', 'C', documentTarget('doc-a')),
  ]);
  assert.deepEqual(collectSiteContentRefs('header', header), { documentIds: ['doc-b', 'doc-a'], assetIds: ['emblem-asset-1', 'portrait-asset'] });
  const sameImage = edit(edit(headerDoc(), 'emblem', uploadedImage('shared-asset-1')), 'portrait', uploadedImage('shared-asset-1'));
  assert.deepEqual(collectSiteContentRefs('header', sameImage).assetIds, ['shared-asset-1']);
  assert.deepEqual(collectSiteContentRefs('header', headerDoc()), { documentIds: [], assetIds: [] });

  const nav = edit(navigationDoc(), 'items', [
    { type: 'link', ...link('x', 'X', documentTarget('doc-1')) },
    { type: 'menu', id: 'm', label: bi('Menu'), visible: false, children: [
      { type: 'heading', id: 'h', label: bi('Heading'), visible: true },
      { type: 'link', ...link('y', 'Y', documentTarget('doc-2')) },
      { type: 'link', ...link('z', 'Z', documentTarget('doc-1')) },
    ] },
  ]);
  assert.deepEqual(collectSiteContentRefs('navigation', nav), { documentIds: ['doc-1', 'doc-2'], assetIds: [] });

  let home = homeDoc();
  home = edit(home, 'hero.actions[0].target', documentTarget('doc-a'));
  home = edit(home, 'hero.banner', uploadedImage('banner-asset-1'));
  home = edit(home, 'quickAccess.tiles[0].target', documentTarget('doc-b'));
  home = edit(home, 'pathways.groups[0].links[0].target', documentTarget('doc-c'));
  home = edit(home, 'documents.documentIds', ['doc-d', 'doc-a']);
  home = edit(home, 'documents.links[0].target', documentTarget('doc-e'));
  assert.deepEqual(collectSiteContentRefs('home', home), { documentIds: ['doc-a', 'doc-b', 'doc-c', 'doc-d', 'doc-e'], assetIds: ['banner-asset-1'] });
  assert.deepEqual(collectSiteContentRefs('home', edit(homeDoc(), 'hero.banner', null)).assetIds, []);

  const partners = edit(edit(partnersDoc(), 'partners[0].logo', uploadedImage('logo-asset-1')), 'partners[1].logo', uploadedImage('logo-asset-2'));
  assert.deepEqual(collectSiteContentRefs('partners', partners), { documentIds: [], assetIds: ['logo-asset-1', 'logo-asset-2'] });
  assert.deepEqual(collectSiteContentRefs('partners', edit(partnersDoc(), 'partners[1].logo', uploadedImage('abcd1234wxyz'))).assetIds, ['abcd1234wxyz']);

  const footer = edit(edit(footerDoc(), 'logos[0].image', uploadedImage('footer-logo-1')), 'linkGroups[0].links[0].target', documentTarget('doc-f'));
  assert.deepEqual(collectSiteContentRefs('footer', footer), { documentIds: ['doc-f'], assetIds: ['footer-logo-1'] });

  assert.deepEqual(collectSiteContentRefs('text', textDoc()), { documentIds: [], assetIds: [] });
});

test('collectSiteContentRefs works on frozen documents', () => {
  const frozen = structuredClone(headerDoc());
  Object.freeze(frozen);
  Object.freeze(frozen.emblem);
  assert.deepEqual(collectSiteContentRefs('header', frozen), { documentIds: [], assetIds: [] });
});

test('mapSiteImages replaces every image in a copy and leaves the input untouched', () => {
  const widen = (image: SiteImage): SiteImage => ({ ...image, width: 11, height: 22 });
  const header = headerDoc();
  const snapshot = structuredClone(header);
  const mapped = mapSiteImages('header', header, widen);
  assert.deepEqual([mapped.emblem.width, mapped.emblem.height, mapped.portrait.width, mapped.portrait.height], [11, 22, 11, 22]);
  assert.deepEqual({ ...mapped, emblem: header.emblem, portrait: header.portrait }, header);
  assert.deepEqual(header, snapshot);
  assert.notEqual(mapped.helplines, header.helplines);
  assert.notEqual(mapped.emblem.alt, header.emblem.alt);

  const partners = mapSiteImages('partners', partnersDoc(), widen);
  assert.deepEqual(partners.partners.map((partner) => [partner.logo.width, partner.logo.height]), [[11, 22], [11, 22]]);
  assert.deepEqual(partners.categories, partnersDoc().categories);

  const footer = mapSiteImages('footer', footerDoc(), widen);
  assert.deepEqual([footer.logos[0].image.width, footer.logos[0].image.height], [11, 22]);

  const withBanner = mapSiteImages('home', edit(homeDoc(), 'hero.banner', uploadedImage('banner-asset-1')), widen);
  assert.equal(withBanner.hero.banner?.width, 11);
  assert.equal(mapSiteImages('home', homeDoc(), widen).hero.banner, null);
});

test('mapSiteImages visits images in document order and leaves documents without images alone', () => {
  const seen: string[] = [];
  const spy = (image: SiteImage): SiteImage => {
    seen.push(image.alt.en);
    return image;
  };
  mapSiteImages('header', headerDoc(), spy);
  mapSiteImages('partners', partnersDoc(), spy);
  assert.deepEqual(seen, ['Emblem', 'Portrait', 'UIIC logo', 'Vidal logo']);

  let calls = 0;
  const count = (image: SiteImage): SiteImage => {
    calls++;
    return image;
  };
  const nav = mapSiteImages('navigation', navigationDoc(), count);
  const text = mapSiteImages('text', textDoc(), count);
  assert.equal(calls, 0);
  assert.deepEqual(nav, navigationDoc());
  assert.deepEqual(text, textDoc());
  assert.notEqual(nav, navigationDoc());
});

test('isKnownSiteRoute and isSafeHttpsUrl', () => {
  assert.equal(isKnownSiteRoute('/'), true);
  assert.equal(isKnownSiteRoute('/#main'), true);
  assert.equal(isKnownSiteRoute('/forms#policy-lists'), true);
  assert.equal(isKnownSiteRoute('/forms#'), false);
  assert.equal(isKnownSiteRoute('/FORMS'), false);
  assert.equal(isKnownSiteRoute(' /forms'), false);
  assert.equal(isSafeHttpsUrl('https://example.org'), true);
  assert.equal(isSafeHttpsUrl('  https://example.org/a  '), true);
  assert.equal(isSafeHttpsUrl('http://example.org'), false);
  assert.equal(isSafeHttpsUrl('https://u:p@example.org'), false);
  assert.equal(isSafeHttpsUrl(''), false);
  assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false);
});

test('telHrefFor keeps digits and a leading plus', () => {
  assert.equal(telHrefFor('1800-233-5666'), 'tel:18002335666');
  assert.equal(telHrefFor('+91 44 2345 6789'), 'tel:+914423456789');
});
