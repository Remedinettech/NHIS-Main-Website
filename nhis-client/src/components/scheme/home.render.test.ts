import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, type DocumentRecord, type Locale, type SiteContentMap, type SiteImage } from '@nhis/shared-types';
import type { SiteContentValue } from '../../context/SiteContentContext';

/*
 * Renders the homepage sections with the built-in content on the server and compares texts, addresses and markup with the
 * homepage as it was before the content became editable (baseline of the home page, English and Tamil), then drives the
 * same components with edited content: hidden and reordered sections, empty sections, links that cannot be resolved, the
 * Gallery rule, Tamil fallback to English and partner logos of any proportions. CSS imports are stubbed for Node.
 */
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return nextLoad(url, context); }",
));

const { SiteContentContext } = await import('../../context/SiteContentContext');
const { LanguageProvider } = await import('../../context/LanguageContext');
const { DocumentsContext } = await import('../../context/DocumentsContext');
const { SiteLinkContext } = await import('../../hooks/useVisibleNav');
const { ManagedHero, ManagedQuickAccess, ManagedPathways, ManagedDocuments, ManagedHelplines, ManagedHighlights } = await import('./ManagedHome');
const { Partners, visiblePartnerGroups } = await import('./Partners');
const { default: HomePage } = await import('../../pages/HomePage');

/* ---------------------------------------------------------------- harness */

const doc = (id: string, category: DocumentRecord['category'], audience: DocumentRecord['audience'], order: number, title: string, available = true): DocumentRecord => ({
  id, category, audience, order, label: { en: title, ta: '' }, title: { en: title, ta: '' }, dateLabel: { en: null, ta: null },
  sourceUrl: 'https://tn-nhis.com/x', localPath: available ? `/api/v1/files/${id}` : null, availability: available ? 'available' : 'unavailable', notes: [],
});
const DOCS: DocumentRecord[] = [
  doc('form-annexure-vi', 'enrolment-form', 'employee', 1, 'ANNEXURE - VI'),
  doc('form-annexure-iii', 'enrolment-form', 'pensioner', 2, 'ANNEXURE - III'),
  doc('policy-1', 'policy-non-payable', 'all', 1, 'Non payable list'),
  doc('guide-1', 'enrolment-guide', 'all', 1, 'A guide'),
];

interface Options {
  locale?: Locale;
  content?: SiteContentMap;
  docs?: DocumentRecord[];
  galleryAvailable?: boolean;
  preview?: boolean;
}

function render(node: ReactElement, { locale = 'en', content = DEFAULT_SITE_CONTENT, docs = DOCS, galleryAvailable = false, preview = false }: Options = {}): string {
  const value: SiteContentValue = { content, status: 'ready', preview, previewDenied: false };
  const byId = new Map(docs.map((entry) => [entry.id, entry]));
  const registry = { state: { data: { data: docs, total: docs.length, source: 'snapshot' as const, capturedAt: '' }, error: undefined, loading: false, refreshing: false, reload: () => undefined }, byId };
  return renderToString(
    createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(SiteContentContext.Provider, { value },
        createElement(LanguageProvider, {
          initialLocale: locale,
          children: createElement(DocumentsContext.Provider, { value: registry },
            createElement(SiteLinkContext.Provider, { value: { documentsById: byId, preview, galleryAvailable } }, node)),
        }))),
  );
}

const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textOf = (html: string) => decode(
  html.replace(/<!-- -->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ''),
).replace(/\s+/g, ' ').trim();
const texts = (html: string, pattern: RegExp) => Array.from(html.matchAll(pattern), (match) => textOf(match[1]));

interface Anchor { text: string; href: string; attrs: string; html: string }
const anchors = (html: string): Anchor[] => Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), (match) => ({
  text: textOf(match[2]), href: decode(/ href="([^"]*)"/.exec(match[1])?.[1] ?? ''), attrs: match[1], html: match[2],
}));
const pairs = (html: string) => anchors(html).map(({ text, href }) => [text, href]);
/** A copy of the built-in content with the given change applied. */
const edited = (change: (content: SiteContentMap) => void): SiteContentMap => {
  const content = structuredClone(DEFAULT_SITE_CONTENT);
  change(content);
  return content;
};
const PORTAL = 'https://tn-nhis.com/?Pagename=';
const upload = (id: string, width: number | null, height: number | null, alt = 'Logo'): SiteImage => ({ assetId: id, builtIn: null, alt: { en: alt, ta: '' }, width, height });

/* ---------------------------------------------------------------- baseline: hero */

test('English hero: eyebrow, scheme name, coverage statement, actions and hospital search as before', () => {
  const html = render(createElement(ManagedHero));
  assert.deepEqual(texts(html, /<p class="eyebrow">(.*?)<\/p>/g), ['Health insurance for government employees and pensioners']);
  assert.match(html, /<h1 id="page-title" tabindex="-1">Tamil Nadu New Health Insurance Scheme<\/h1>/);
  assert.deepEqual(texts(html, /<p class="hero__coverage-label">(.*?)<\/p>/g), ['Coverage']);
  assert.deepEqual(texts(html, /<p class="hero__coverage-text">(.*?)<\/p>/g), ['Upto 5 Lakh Health Cover per Employee / Pensioner Family']);
  assert.deepEqual(pairs(html).filter(([, href]) => href !== '/hospitals'), [['Read coverage details', '/coverage'], ['Forms Download', '/forms']]);
  assert.match(html, /<a class="btn btn--secondary" href="\/coverage"[ >]/);
  assert.match(html, /<a class="btn btn--ghost" href="\/forms"[ >]/);
  assert.match(html, /<form class="hero__search panel" role="search" aria-labelledby="hero-search-title">/);
  assert.match(html, /<h2 id="hero-search-title">Find a network hospital<\/h2>/);
  assert.ok(html.includes('Search by hospital name, address, district or specialty in English or Tamil.'));
  assert.ok(html.includes('placeholder="Hospital name, address or specialty"'));
  assert.deepEqual(texts(html, /<button type="submit" class="btn btn--primary">(.*?)<\/button>/g), ['Search hospitals']);
  assert.ok(pairs(html).some(([text, href]) => text === 'Browse all network hospitals' && href === '/hospitals'));
  assert.ok(!html.includes('hero__banner') && !html.includes('hero__description'), 'the new banner and paragraph are empty by default');
});

test('Tamil hero keeps the settings spelling of the scheme name and every Tamil text of today', () => {
  const html = render(createElement(ManagedHero), { locale: 'ta' });
  assert.match(html, /<h1 id="page-title" tabindex="-1">தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டு திட்டம்<\/h1>/);
  assert.deepEqual(texts(html, /<p class="eyebrow">(.*?)<\/p>/g), ['அரசு ஊழியர்கள் மற்றும் ஓய்வூதியதாரர்களுக்கான மருத்துவக் காப்பீடு']);
  assert.deepEqual(texts(html, /<p class="hero__coverage-label">(.*?)<\/p>/g), ['காப்பீடு']);
  assert.deepEqual(texts(html, /<p class="hero__coverage-text">(.*?)<\/p>/g), ['அரசு ஊழியர் / ஓய்வூதியதாரர் குடும்பத்திற்கு ரூபாய் 5 லட்சம் வரை மருத்துவக் காப்பீடு']);
  assert.deepEqual(pairs(html).slice(0, 2).map(([text]) => text), ['காப்பீட்டு விவரங்களைப் படிக்க', 'படிவங்கள் பதிவிறக்கம்']);
  assert.ok(html.includes('<h2 id="hero-search-title">அங்கீகரிக்கப்பட்ட மருத்துவமனையைக் கண்டறிக</h2>'));
  assert.ok(!html.includes('lang="en"'), 'nothing falls back to English');
});

test('hero: optional paragraph and banner picture, hidden actions, English shown (and marked) where Tamil is empty', () => {
  const content = edited((c) => {
    c.home.hero.description = { en: 'A short paragraph.', ta: '' };
    c.home.hero.banner = upload('banner_1200x400', 1200, 400, 'Hero banner');
    c.home.hero.actions[0].visible = false;
    c.home.hero.actions[1].target = { type: 'document', documentId: 'does-not-exist' };
    c.home.hero.eyebrow = { en: 'English only eyebrow', ta: '' };
  });
  const en = render(createElement(ManagedHero), { content });
  assert.ok(!en.includes('hero__actions'), 'no visible action: no empty container');
  assert.match(en, /<p class="hero__description">A short paragraph\.<\/p>/);
  assert.match(en, /<img[^>]*class="hero__banner"[^>]*src="\/api\/v1\/files\/banner_1200x400"[^>]*alt="Hero banner"/);
  assert.match(en, /width="1200"/);
  assert.match(en, /height="400"/);
  const ta = render(createElement(ManagedHero), { content, locale: 'ta' });
  assert.match(ta, /<p class="eyebrow"><span lang="en">English only eyebrow<\/span><\/p>/);
  assert.match(ta, /<p class="hero__description"><span lang="en">A short paragraph\.<\/span><\/p>/);
  assert.match(ta, /<img[^>]*alt="Hero banner"[^>]*lang="en"|<img[^>]*lang="en"[^>]*alt="Hero banner"/);
});

test('hero search: the hospital count line follows the setting and the placeholder follows the language', () => {
  const content = edited((c) => { c.home.hero.search.placeholder = { en: 'Type here', ta: '' }; });
  assert.ok(render(createElement(ManagedHero), { content }).includes('placeholder="Type here"'));
  assert.ok(render(createElement(ManagedHero), { content, locale: 'ta' }).includes('placeholder="Type here"'), 'English when there is no Tamil placeholder');
  // the count needs the statistics request (not made on the server): without data nothing is drawn, with showCount off neither
  assert.ok(!render(createElement(ManagedHero)).includes('hero__search-note'));
});

/* ---------------------------------------------------------------- baseline: quick access */

test('English quick access: six tiles with their addresses; only the claim tile leaves the site', () => {
  const html = render(createElement(ManagedQuickAccess));
  assert.match(html, /<section class="quick" aria-labelledby="quick-title"><h2 id="quick-title">Quick access<\/h2>/);
  assert.deepEqual(pairs(html), [
    ['Network Hospital', '/hospitals'],
    ['Coverage', '/coverage'],
    ['Eligibility', '/eligibility'],
    ['How to Enroll', '/enrollment'],
    ['Forms Download', '/forms'],
    ['Track ClaimNHIS portal', `${PORTAL}TNportal`],
  ]);
  const claim = anchors(html)[5];
  assert.match(claim.attrs, /target="_blank"/);
  assert.match(claim.attrs, /rel="noopener noreferrer"/);
  assert.ok(claim.html.includes('<span class="quick__hint text-muted">NHIS portal</span>'));
  assert.ok(claim.html.includes('opens in a new tab'));
  assert.equal((html.match(/quick__hint/g) ?? []).length, 1, 'only the claim tile has a hint');
  // the icon of a tile is 22 px, its arrow 18 px; a tile that leaves the site shows the external-link arrow
  assert.equal((html.match(/<svg[^>]*width="22"/g) ?? []).length, 6);
  assert.equal((html.match(/<svg[^>]*class="quick__arrow"/g) ?? []).length, 6);
  assert.ok(/<svg[^>]*width="18"[^>]*class="quick__arrow"[^>]*><path d="M14 4h6v6M20 4l-9 9/.test(claim.html), 'external arrow on the claim tile');
  assert.ok(/<svg[^>]*width="18"[^>]*class="quick__arrow"[^>]*><path d="M5 12h14m-6-6 6 6-6 6/.test(anchors(html)[0].html), 'plain arrow on the others');
});

test('Tamil quick access uses the Tamil labels of today', () => {
  const html = render(createElement(ManagedQuickAccess), { locale: 'ta' });
  assert.deepEqual(anchors(html).map((anchor) => anchor.text), [
    'அங்கிகரிக்கபட்ட மருத்துவமனைகள்', 'காப்புறு', 'தகுதி', 'பதிவு செய்வது எப்படி', 'படிவங்கள் பதிவிறக்கம்', 'உரிமைகோரலைக் கண்காணிக்கவும்NHIS தளம்',
  ]);
  assert.ok(html.includes('<h2 id="quick-title">விரைவு அணுகல்</h2>'));
});

test('quick tiles: hidden tiles, unknown routes and the Gallery while it is empty are left out, an empty section renders nothing', () => {
  const content = edited((c) => {
    c.home.quickAccess.tiles[0].visible = false;
    c.home.quickAccess.tiles[1].target = { type: 'route', path: '/no-such-page' };
    c.home.quickAccess.tiles[2].target = { type: 'route', path: '/gallery' };
    c.home.quickAccess.tiles[3].target = { type: 'external', url: 'http://not-https.example/' };
  });
  assert.deepEqual(pairs(render(createElement(ManagedQuickAccess), { content })).map(([text]) => text), ['Forms Download', 'Track ClaimNHIS portal']);
  assert.ok(pairs(render(createElement(ManagedQuickAccess), { content, galleryAvailable: true })).some(([, href]) => href === '/gallery'), 'the Gallery tile returns with the first published item');
  const none = edited((c) => { c.home.quickAccess.tiles.forEach((tile) => { tile.visible = false; }); });
  assert.equal(render(createElement(ManagedQuickAccess), { content: none }), '');
});

/* ---------------------------------------------------------------- baseline: pathways */

test('English pathways: policy, orders, enrolment form with its title, portal and helpline for both audiences', () => {
  const html = render(createElement(ManagedPathways));
  assert.match(html, /<section class="pathways" aria-labelledby="pathways-title"><h2 id="pathways-title">Choose your pathway<\/h2>/);
  assert.deepEqual(texts(html, /<h3[^>]*>(.*?)<\/h3>/g), ['For employees', 'For pensioners']);
  assert.deepEqual(pairs(html).filter(([, href]) => !href.startsWith('tel:')), [
    ['Employee policy details', '/employee-policy'],
    ['Government orders', '/government-orders#employee-orders'],
    ['Enrolment annexure form: ANNEXURE - VI', '/api/v1/files/form-annexure-vi'],
    ['Employee portal', `${PORTAL}TNportal`],
    ['Pensioner policy details', '/pensioner-policy'],
    ['Government orders', '/government-orders#pensioner-orders'],
    ['Enrolment annexure form: ANNEXURE - III', '/api/v1/files/form-annexure-iii'],
    ['Pensioner portal', `${PORTAL}Pensioners`],
  ]);
  assert.deepEqual(pairs(html).filter(([, href]) => href.startsWith('tel:')), [['1800-233-5666', 'tel:18002335666'], ['1800-233-5544', 'tel:18002335544']]);
  assert.deepEqual(texts(html, /<p class="pathway__helpline">(.*?)<\/p>/g), ['Employee: 1800-233-5666', 'Pensioner: 1800-233-5544']);
  assert.ok(html.includes('aria-labelledby="pathway-employee"') && html.includes('id="pathway-pensioner"'));
  // the form link is a file: new tab, PDF note for assistive technology, external-link arrow
  const form = anchors(html)[2];
  assert.match(form.attrs, /target="_blank"/);
  assert.match(form.attrs, /rel="noopener noreferrer"/);
  assert.ok(form.html.replace(/<!-- -->/g, '').includes('PDF, opens in a new tab'));
  assert.ok(form.html.includes('M14 4h6v6M20 4l-9 9'), 'external-link arrow');
  assert.ok(anchors(html)[0].html.includes('M5 12h14m-6-6 6 6-6 6'), 'plain arrow for pages of this site');
});

test('Tamil pathways: Tamil texts, the document title stays as published and is marked as English', () => {
  const html = render(createElement(ManagedPathways), { locale: 'ta' });
  assert.deepEqual(texts(html, /<h3[^>]*>(.*?)<\/h3>/g), ['ஊழியர்களுக்கு', 'ஓய்வூதியதாரர்களுக்கு']);
  assert.ok(anchors(html).some((anchor) => anchor.text === 'பதிவுப் படிவ இணைப்பு: ANNEXURE - VI' && anchor.href === '/api/v1/files/form-annexure-vi'));
  assert.ok(html.includes('<span lang="en">ANNEXURE - VI</span>'));
  assert.deepEqual(texts(html, /<p class="pathway__helpline">(.*?)<\/p>/g), ['பணியாளர்: 1800-233-5666', 'ஓய்வூதியம் பெறுபவர்: 1800-233-5544']);
});

test('a pathway link to a missing, unpublished or file-less document is left out; the rest of the pathway stays', () => {
  const content = edited((c) => { c.home.pathways.groups[0].links[2].target = { type: 'document', documentId: 'no-such-document' }; });
  const html = render(createElement(ManagedPathways), { content });
  assert.ok(!html.includes('ANNEXURE - VI'));
  assert.ok(html.includes('Employee policy details') && html.includes('Employee portal'));
  const unavailable = render(createElement(ManagedPathways), { docs: DOCS.map((entry) => (entry.id === 'form-annexure-iii' ? doc(entry.id, entry.category, entry.audience, entry.order, 'ANNEXURE - III', false) : entry)) });
  assert.ok(!unavailable.includes('ANNEXURE - III') && unavailable.includes('ANNEXURE - VI'));
  const none = render(createElement(ManagedPathways), { docs: [] });
  assert.ok(!none.includes('Enrolment annexure form'));
});

test('pathways: hidden groups, a helpline that is hidden in the header and a group with nothing to show', () => {
  const content = edited((c) => {
    c.home.pathways.groups[1].visible = false;
    c.header.helplines[0].visible = false;
  });
  const html = render(createElement(ManagedPathways), { content });
  assert.deepEqual(texts(html, /<h3[^>]*>(.*?)<\/h3>/g), ['For employees']);
  assert.ok(!html.includes('pathway__helpline'), 'the helpline of the group is hidden in the header');
  const empty = edited((c) => {
    for (const group of c.home.pathways.groups) { group.links.forEach((link) => { link.visible = false; }); group.helplineId = null; }
  });
  assert.equal(render(createElement(ManagedPathways), { content: empty }), '');
});

/* ---------------------------------------------------------------- baseline: documents */

test('English documents section: heading, introduction, both links and the forms and policy lists in the order of today', () => {
  const html = render(createElement(ManagedDocuments));
  assert.match(html, /<section class="home-docs" aria-labelledby="home-docs-title">/);
  assert.deepEqual(texts(html, /<h2 id="home-docs-title">(.*?)<\/h2>/g), ['Documents and forms']);
  assert.ok(html.includes('<p class="text-muted">Enrolment forms and policy lists for download.</p>'));
  assert.deepEqual(pairs(html).slice(0, 2), [['View all government orders', '/government-orders'], ['All forms and downloads', '/forms']]);
  assert.deepEqual(texts(html, /<h3 class="doc-row__title"[^>]*>(.*?)<\/h3>/g), ['ANNEXURE - VI', 'ANNEXURE - III', 'Non payable list']);
  assert.ok(!html.includes('A guide'), 'enrolment guides are not on the homepage');
  assert.match(html, /<ul class="doc-list" aria-labelledby="home-docs-title">/);
});

test('documents: chosen documents in the editor\'s order, other categories, hidden links, and nothing at all when empty', () => {
  const chosen = edited((c) => { c.home.documents.documentIds = ['guide-1', 'form-annexure-iii', 'missing']; });
  assert.deepEqual(texts(render(createElement(ManagedDocuments), { content: chosen }), /<h3 class="doc-row__title"[^>]*>(.*?)<\/h3>/g), ['A guide', 'ANNEXURE - III']);
  const guides = edited((c) => { c.home.documents.categories = ['enrolment-guide']; c.home.documents.links[0].visible = false; });
  const html = render(createElement(ManagedDocuments), { content: guides });
  assert.deepEqual(texts(html, /<h3 class="doc-row__title"[^>]*>(.*?)<\/h3>/g), ['A guide']);
  assert.deepEqual(pairs(html).slice(0, 1), [['All forms and downloads', '/forms']]);
  const onlyLinks = render(createElement(ManagedDocuments), { docs: [] });
  assert.ok(onlyLinks.includes('All forms and downloads') && !onlyLinks.includes('doc-list'), 'links without documents: no empty list');
  const nothing = edited((c) => { c.home.documents.links.forEach((link) => { link.visible = false; }); });
  assert.equal(render(createElement(ManagedDocuments), { content: nothing, docs: [] }), '');
  const noIntro = edited((c) => { c.home.documents.intro = { en: '', ta: '' }; });
  assert.ok(!render(createElement(ManagedDocuments), { content: noIntro }).includes('<p class="text-muted"></p>'));
});

/* ---------------------------------------------------------------- baseline: helplines */

test('English help and support panel: every helpline with its tel link and the availability text as before', () => {
  const html = render(createElement(ManagedHelplines));
  assert.match(html, /<section class="helplines panel" aria-labelledby="helplines-title"><h2 id="helplines-title">Help and support<\/h2>/);
  assert.ok(html.includes('<p class="text-muted">Toll-free helplines for employees and pensioners.</p>'));
  assert.deepEqual(texts(html, /<span class="helplines__label"[^>]*>(.*?)<\/span>/g), ['Employee', 'Pensioner', 'For any login issues in Website/Mobile app please call']);
  assert.deepEqual(pairs(html), [['1800-233-5666', 'tel:18002335666'], ['1800-233-5544', 'tel:18002335544'], ['044 40115088', 'tel:04440115088']]);
  assert.ok(html.includes('aria-label="Call Employee on 1800-233-5666"'));
  assert.ok(html.includes('<p class="text-muted helplines__hours">Available 24/7</p>'), 'the availability reads "Available 24/7", not just "24/7"');
  const ta = render(createElement(ManagedHelplines), { locale: 'ta' });
  assert.ok(ta.includes('<p class="text-muted helplines__hours">24/7 கிடைக்கும்</p>'));
  assert.ok(ta.includes('உதவி மற்றும் ஆதரவு'));
});

test('the helpline panel follows the header: hidden helplines and availability disappear, with none the panel is not drawn', () => {
  const some = edited((c) => { c.header.helplines[1].visible = false; c.header.availability = ''; });
  const html = render(createElement(ManagedHelplines), { content: some });
  assert.ok(!html.includes('1800-233-5544') && !html.includes('helplines__hours'));
  const none = edited((c) => { c.header.helplines.forEach((line) => { line.visible = false; }); });
  assert.equal(render(createElement(ManagedHelplines), { content: none }), '');
});

/* ---------------------------------------------------------------- highlights */

test('scheme highlights: nothing is drawn while the list is empty or hidden, no empty paragraphs when there is no text', () => {
  assert.equal(render(createElement(ManagedHighlights)), '');
  const hidden = edited((c) => { c.home.highlights.items = [{ id: 'a', value: { en: '5', ta: '' }, label: { en: 'x', ta: '' }, note: { en: '', ta: '' }, visible: false }]; });
  assert.equal(render(createElement(ManagedHighlights), { content: hidden }), '');
  const content = edited((c) => {
    c.home.highlights = {
      heading: { en: 'Scheme highlights', ta: 'திட்ட சிறப்புகள்' }, intro: { en: '', ta: '' },
      items: [
        { id: 'a', value: { en: '₹5,00,000', ta: '' }, label: { en: 'Cover per family', ta: '' }, note: { en: '', ta: '' }, visible: true },
        { id: 'b', value: { en: '1 year', ta: '' }, label: { en: 'Policy period', ta: '' }, note: { en: 'Renewed every year', ta: '' }, visible: true },
        { id: 'c', value: { en: 'Hidden', ta: '' }, label: { en: 'Hidden', ta: '' }, note: { en: '', ta: '' }, visible: false },
      ],
    };
  });
  const html = render(createElement(ManagedHighlights), { content });
  assert.match(html, /<section class="highlights" aria-labelledby="highlights-title"><h2 id="highlights-title">Scheme highlights<\/h2>/);
  assert.equal((html.match(/<li class="highlights__item panel">/g) ?? []).length, 2);
  assert.ok(!html.includes('Hidden'));
  assert.ok(!html.includes('highlights__intro'), 'no empty introduction');
  assert.equal((html.match(/highlights__note/g) ?? []).length, 1, 'only the item with a note has a note paragraph');
  assert.ok(html.includes('<p class="highlights__value">₹5,00,000</p>'));
  assert.ok(render(createElement(ManagedHighlights), { content, locale: 'ta' }).includes('<span lang="en">Cover per family</span>'), 'English text marked as English');
});

/* ---------------------------------------------------------------- partners */

test('partners: the four logos of today with their alt text, files, sizes, classes and groups', () => {
  const html = render(createElement(Partners));
  assert.match(html, /<section class="partners" aria-labelledby="partners-title"><h2 id="partners-title">Partners<\/h2>/);
  assert.deepEqual(texts(html, /<figcaption>(.*?)<\/figcaption>/g), ['Insurance Partner', 'Service Partner']);
  const images = Array.from(html.matchAll(/<img\b([^>]*)>/g), (match) => match[1]);
  const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];
  assert.deepEqual(images.map((tag) => [attr(tag, 'src'), attr(tag, 'alt'), attr(tag, 'class'), attr(tag, 'width'), attr(tag, 'height'), attr(tag, 'loading')]), [
    ['/assets/united-india-insurance-logo.png', 'United India Insurance', 'partner-logo partner-logo--emblem', '1012', '763', 'lazy'],
    ['/assets/vidal-health-logo.png', 'Vidal Health', 'partner-logo partner-logo--banner', '2000', '600', 'lazy'],
    ['/assets/medi-assist-logo.png', 'Medi Assist', 'partner-logo partner-logo--wide', '1600', '629', 'lazy'],
    ['/assets/hitpa-logo.png', 'Health Insurance TPA of India Ltd.', 'partner-logo partner-logo--stacked', '1469', '1071', 'lazy'],
  ]);
  assert.equal(anchors(html).length, 0, 'no partner has a web address today');
  assert.ok(!/ style=/.test(html), 'no inline size that could stretch a logo');
  const ta = render(createElement(Partners), { locale: 'ta' });
  assert.deepEqual(texts(ta, /<figcaption>(.*?)<\/figcaption>/g), ['காப்பீட்டு நிறுவனம்', 'சேவை நிறுவனங்கள்']);
  assert.ok(ta.includes('alt="United India Insurance"'), 'the partner name is the alt text in both languages');
});

test('partner logos of any proportions get a height class from their shape and always keep both size attributes', () => {
  const content = edited((c) => {
    c.partners.partners.push(
      { id: 'sq', categoryId: 'service', name: { en: 'Square', ta: '' }, logo: upload('sq1', 300, 300, 'Square'), url: null, visible: true },
      { id: 'wide', categoryId: 'service', name: { en: 'Strip', ta: '' }, logo: upload('wide1', 2000, 200, 'Strip'), url: null, visible: true },
      { id: 'tall', categoryId: 'service', name: { en: 'Tall', ta: '' }, logo: upload('tall1', 200, 600, 'Tall'), url: null, visible: true },
      { id: 'nosize', categoryId: 'service', name: { en: 'No size', ta: '' }, logo: upload('nosize1', null, null, 'No size'), url: null, visible: true },
    );
  });
  const html = render(createElement(Partners), { content });
  const tag = (alt: string) => Array.from(html.matchAll(/<img\b[^>]*>/g), (match) => match[0]).find((image) => image.includes(`alt="${alt}"`)) ?? '';
  assert.match(tag('Square'), /partner-logo--emblem/);
  assert.match(tag('Strip'), /partner-logo--banner/);
  assert.match(tag('Tall'), /partner-logo--stacked/);
  assert.match(tag('No size'), /partner-logo--emblem/);
  assert.match(tag('Strip'), /src="\/api\/v1\/files\/wide1"/);
  assert.ok(/ width="2000"/.test(tag('Strip')) && / height="200"/.test(tag('Strip')));
  assert.ok(!/ width=| height=/.test(tag('No size')), 'an unknown size sets no attribute that could distort the logo');
  // an uploaded replacement of a shipped logo takes its shape from its own proportions, not from the old file
  const replaced = edited((c) => { c.partners.partners[3].logo = upload('hitpa-new', 1000, 100, 'Health Insurance TPA of India Ltd.'); });
  assert.match(Array.from(render(createElement(Partners), { content: replaced }).matchAll(/<img\b[^>]*>/g), (match) => match[0]).find((image) => image.includes('hitpa-new')) ?? '', /partner-logo--banner/);
});

test('partners: a web address is a safe new-tab link; an unsafe address, a hidden partner, a hidden group and a logo without an address are left out', () => {
  const content = edited((c) => {
    c.partners.partners[0].url = 'https://www.uiic.co.in/';
    c.partners.partners[1].url = 'javascript:alert(1)';
    c.partners.partners[2].url = 'http://plain-http.example/';
    c.partners.partners[3].visible = false;
  });
  const html = render(createElement(Partners), { content });
  const links = anchors(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://www.uiic.co.in/');
  assert.match(links[0].attrs, /target="_blank"/);
  assert.match(links[0].attrs, /rel="noopener noreferrer"/);
  assert.ok(links[0].html.includes('alt="United India Insurance"'));
  assert.ok(links[0].html.includes('opens in a new tab'));
  assert.ok(!html.includes('javascript:') && !html.includes('plain-http'));
  assert.ok(!html.includes('hitpa-logo'));
  assert.ok(!/<span[^>]* aria-label=/.test(html), 'no aria-label on a plain span');

  const noLogo = edited((c) => {
    c.partners.partners[0].logo = { assetId: null, builtIn: 'assets/../x.png', alt: { en: 'Broken', ta: '' }, width: 10, height: 10 };
    c.partners.categories[1].visible = false;
  });
  const groups = visiblePartnerGroups(noLogo.partners);
  assert.deepEqual(groups, [], 'the only visible group has no logo that can be shown');
  assert.equal(render(createElement(Partners), { content: noLogo }), '');
  assert.equal(visiblePartnerGroups(DEFAULT_SITE_CONTENT.partners).length, 2);
  const unknownGroup = edited((c) => { c.partners.partners[0].categoryId = 'nowhere'; });
  assert.deepEqual(visiblePartnerGroups(unknownGroup.partners).map((group) => group.category.id), ['service']);
});

test('partner names: the name is the tooltip of the logo, in the visitor language with English as fallback, and the alt text of a logo that has none', () => {
  const content = edited((c) => {
    c.partners.partners[0].name = { en: 'United India Insurance', ta: 'யுனைடெட் இந்தியா இன்சூரன்ஸ்' };
    c.partners.partners[0].url = 'https://www.uiic.co.in/';
    c.partners.partners[1].name = { en: 'Vidal Health Services', ta: '' };
    c.partners.partners[1].logo.alt = { en: 'Vidal logo', ta: '' };
    c.partners.partners[2].logo.alt = { en: '', ta: '' };
    c.partners.partners[2].name = { en: 'Medi Assist India', ta: 'மெடி அசிஸ்ட்' };
    c.partners.partners[3].name = { en: '', ta: '' };
  });
  const html = render(createElement(Partners), { content });
  const tag = (marker: string) => Array.from(html.matchAll(/<(?:a|span) class="partner-link"[^>]*>/g), (match) => match[0]).find((entry) => entry.includes(marker)) ?? '';
  assert.match(tag('uiic'), / title="United India Insurance"/, 'the link has the name as its tooltip');
  assert.match(tag('title="Vidal Health Services"'), /^<span class="partner-link"/, 'a partner without an address gets the tooltip too');
  assert.ok(html.includes('alt="Vidal logo"'), 'the alt text of the logo comes first');
  assert.ok(html.includes('alt="Medi Assist India"'), 'a logo without alt text is named by the partner name');
  assert.ok(!/<(?:a|span) class="partner-link" title=""/.test(html), 'no empty tooltip when a partner has no name');

  const ta = render(createElement(Partners), { content, locale: 'ta' });
  assert.match(ta, /<a class="partner-link" href="https:\/\/www\.uiic\.co\.in\/" title="யுனைடெட் இந்தியா இன்சூரன்ஸ்"/);
  assert.ok(ta.includes('title="Vidal Health Services"'), 'no Tamil name: the English name is shown');
  assert.ok(ta.includes('alt="மெடி அசிஸ்ட்"'));
});

test('in preview mode an uploaded logo comes from the administration, a published one from the public files', () => {
  const content = edited((c) => { c.partners.partners[0].logo = upload('up1', 400, 300, 'Uploaded'); });
  assert.ok(render(createElement(Partners), { content, preview: true }).includes('src="/api/v1/admin/files/up1"'));
  assert.ok(render(createElement(Partners), { content }).includes('src="/api/v1/files/up1"'));
});

/* ---------------------------------------------------------------- the homepage as a whole */

/** Position of each section marker in the page, in order of appearance. */
const MARKERS: Array<[string, string]> = [
  ['hero', 'class="hero"'], ['quickAccess', 'class="quick"'], ['pathways', 'class="pathways"'], ['documents', 'class="home-docs"'],
  ['helplines', 'class="helplines panel"'], ['highlights', 'class="highlights"'], ['partners', 'class="partners"'],
];
const orderOf = (html: string) => MARKERS.map(([name, marker]) => [name, html.indexOf(marker)] as const).filter(([, index]) => index >= 0).sort((a, b) => a[1] - b[1]).map(([name]) => name);

const withHighlight = (change: (content: SiteContentMap) => void = () => undefined): SiteContentMap => edited((c) => {
  c.home.highlights.items = [{ id: 'a', value: { en: '5', ta: '' }, label: { en: 'Lakh', ta: '' }, note: { en: '', ta: '' }, visible: true }];
  change(c);
});

test('the homepage draws the sections in the built-in order, coverage and help in one band, and nothing for the empty highlights', () => {
  const html = render(createElement(HomePage));
  assert.deepEqual(orderOf(html), ['hero', 'quickAccess', 'pathways', 'documents', 'helplines', 'partners']);
  assert.match(html, /<div class="home-section home-band">/);
  assert.match(html, /<div class="container page home"><div><section class="quick"/, 'the quick access section follows the hero without a top margin, as before');
  assert.ok(!html.includes('highlights'));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.deepEqual(texts(html, /<h2[^>]*>(.*?)<\/h2>/g), ['Find a network hospital', 'Quick access', 'Choose your pathway', 'Documents and forms', 'Help and support', 'Partners']);
});

test('hidden sections are skipped and the order of the editor is followed', () => {
  const content = withHighlight((c) => {
    c.home.sections = [
      { id: 'hero', visible: true }, { id: 'partners', visible: true }, { id: 'highlights', visible: true }, { id: 'documents', visible: false },
      { id: 'pathways', visible: true }, { id: 'quickAccess', visible: true }, { id: 'coverage', visible: false }, { id: 'helplines', visible: true },
    ];
  });
  const html = render(createElement(HomePage), { content });
  assert.deepEqual(orderOf(html), ['hero', 'partners', 'highlights', 'pathways', 'quickAccess', 'helplines']);
  assert.ok(!html.includes('home-band'), 'helplines no longer follow the coverage panel');
  assert.ok(html.includes('<div class="home-section"><section class="helplines panel"'));
  assert.ok(html.includes('<div class="home-section"><section class="quick"'), 'a section that is not first has its top margin');
});

test('coverage and helplines share a band only when they are neighbours; an unknown or repeated section is ignored', () => {
  const apart = edited((c) => {
    c.home.sections = [
      { id: 'hero', visible: true }, { id: 'coverage', visible: true }, { id: 'quickAccess', visible: true }, { id: 'helplines', visible: true },
      { id: 'surprise' as never, visible: true }, { id: 'quickAccess', visible: true }, { id: 'toString' as never, visible: true },
    ];
  });
  const html = render(createElement(HomePage), { content: apart });
  assert.ok(!html.includes('home-band'));
  assert.deepEqual(orderOf(html), ['hero', 'quickAccess', 'helplines']);
  assert.equal((html.match(/class="quick"/g) ?? []).length, 1);
});

test('the hero stays first and visible whatever the sections say', () => {
  const content = edited((c) => { c.home.sections = [{ id: 'quickAccess', visible: true }, { id: 'hero', visible: false }]; });
  assert.deepEqual(orderOf(render(createElement(HomePage), { content })), ['hero', 'quickAccess']);
});

test('the homepage in Tamil shows English, marked as English, only for texts that have no Tamil', () => {
  const content = edited((c) => {
    c.home.quickAccess.heading = { en: 'Quick access', ta: '' };
    c.home.pathways.groups[0].heading = { en: 'Staff', ta: '' };
  });
  const html = render(createElement(HomePage), { content, locale: 'ta' });
  assert.ok(html.includes('<h2 id="quick-title"><span lang="en">Quick access</span></h2>'));
  assert.ok(html.includes('<h3 id="pathway-employee"><span lang="en">Staff</span></h3>'));
  assert.ok(html.includes('<h2 id="pathways-title">உங்கள் வழியைத் தேர்ந்தெடுக்கவும்</h2>'));
});

test('the Gallery link of a managed home link returns once the gallery has an item', () => {
  const content = edited((c) => { c.home.documents.links.push({ id: 'gal', label: { en: 'Gallery', ta: '' }, target: { type: 'route', path: '/gallery' }, visible: true }); });
  assert.ok(!render(createElement(ManagedDocuments), { content }).includes('/gallery'));
  assert.ok(render(createElement(ManagedDocuments), { content, galleryAvailable: true }).includes('href="/gallery"'));
});
