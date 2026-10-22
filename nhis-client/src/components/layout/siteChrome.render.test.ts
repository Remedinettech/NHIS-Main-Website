import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, type Locale, type SiteContentMap } from '@nhis/shared-types';
import type { SiteContentValue } from '../../context/SiteContentContext';

/*
 * Renders the header, strip, login menu, navigation and footer with the built-in content on the server (no browser, no
 * dependencies beyond React) and compares texts and addresses with the Client as it was before the content became
 * editable (baseline of the home page, English and Tamil). CSS imports are stubbed for Node.
 */
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return nextLoad(url, context); }",
));

const { SiteContentContext } = await import('../../context/SiteContentContext');
const { LanguageProvider } = await import('../../context/LanguageContext');
const { SiteLinkContext } = await import('../../hooks/useVisibleNav');
const { SiteHeader } = await import('./SiteHeader');
const { SiteFooter } = await import('./SiteFooter');
const { SupportStrip } = await import('./SupportStrip');
const { LoginMenu } = await import('./LoginMenu');
const { PrimaryNav } = await import('./PrimaryNav');
const { BrandLogo, splitWordmark, wordmarkLanguage } = await import('../common/BrandLogo');
const { PreviewBanner } = await import('../common/PreviewBanner');
const { ContentBlocks } = await import('../content/ContentBlocks');

test('managed grievance tables escape text and keep phone/email links safe', () => {
  const html = render(createElement(ContentBlocks, { lang: 'en', blocks: [{ type: 'table', headers: ['Name', 'Contact'], rows: [[
    [{ type: 'text', text: '<script>unsafe()</script>' }],
    [{ type: 'phone', number: '9789055837', text: '9789055837' }, { type: 'mail', address: 'office@example.org' }],
  ]] }] }));
  assert.ok(html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('tel:9789055837') && html.includes('mailto:office@example.org'));
});

/* ---------------------------------------------------------------- harness */

interface Options {
  locale?: Locale;
  content?: SiteContentMap;
  galleryAvailable?: boolean;
  preview?: boolean;
  previewDenied?: boolean;
}

function render(node: ReactElement, { locale = 'en', content = DEFAULT_SITE_CONTENT, galleryAvailable = false, preview = false, previewDenied = false }: Options = {}): string {
  const value: SiteContentValue = { content, status: 'ready', preview, previewDenied };
  return renderToString(
    createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(SiteContentContext.Provider, { value },
        createElement(LanguageProvider, {
          initialLocale: locale,
          children: createElement(SiteLinkContext.Provider, { value: { documentsById: new Map(), preview, galleryAvailable } }, node),
        }))),
  );
}

const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Visible text of a piece of HTML: no tags, no icons, no screen-reader-only notes. */
const textOf = (html: string) => decode(
  html.replace(/<!-- -->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ''),
).replace(/\s+/g, ' ').trim();

interface Anchor { text: string; href: string; attrs: string }
const anchors = (html: string): Anchor[] => Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), (match) => ({
  text: textOf(match[2]),
  href: decode(/ href="([^"]*)"/.exec(match[1])?.[1] ?? ''),
  attrs: match[1],
}));
const pairs = (html: string) => anchors(html).map(({ text, href }) => [text, href]);
const texts = (html: string, pattern: RegExp) => Array.from(html.matchAll(pattern), (match) => textOf(match[1]));

const PORTAL = 'https://tn-nhis.com/?Pagename=';
/** The four user manuals (Google Drive) added to the menu on request. */
const MANUAL = [
  'https://drive.google.com/open?id=1Rrwl989SI9Hq3xH2Uj9j7YhtR9ZfCC3m&usp=drive_copy',
  'https://drive.google.com/open?id=1hqR_ebKJEExRfrBd9MhRHy73uCB6mmFd&usp=drive_copy',
  'https://drive.google.com/open?id=1zDnh-sDjUt5dBvGAblIVGi-WzO5StRIN&usp=drive_copy',
  'https://drive.google.com/open?id=1Oo159ivkoQQnDfvssKR7ZzPo1czPNY_X&usp=drive_copy',
];

/** React separates adjacent text nodes with comments in server output; the browser shows them as one text. */
const flat = (html: string) => html.replace(/<!-- -->/g, '');

/* ---------------------------------------------------------------- baseline: English */

test('English header: wordmark, scheme name, emblem and portrait as before', () => {
  const html = render(createElement(SiteHeader));
  assert.match(html, /<span class="nhis-header__name" lang="en"><span>TN<\/span><span class="nhis-header__hyphen">-<\/span><span class="nhis-header__name-blue">NHIS<\/span><\/span>/);
  assert.match(html, /<span class="nhis-header__subtitle" lang="en">Tamil Nadu New Health Insurance Scheme<\/span>/);
  assert.match(html, /aria-label="TN-NHIS — Tamil Nadu New Health Insurance Scheme"/);
  assert.match(html, /<img[^>]*class="nhis-header__emblem"[^>]*src="\/assets\/tn-government-emblem\.png"[^>]*alt="Tamil Nadu government emblem"/);
  assert.match(html, /<img[^>]*class="nhis-header__portrait"[^>]*src="\/assets\/header-portrait\.jpg"[^>]*alt="Portrait displayed in the site header"/);
  assert.ok(!/ lang="en" [^>]*alt=|alt="[^"]*" lang=/.test(html), 'images are marked with a language only on fallback');
  assert.match(html, /<div class="container nhis-header__inner">/);
  assert.match(html, /<div class="nhis-header__portrait-frame">/);
});

test('English main menu: entries, dropdown groups and addresses as before; the Gallery stays hidden while empty', () => {
  const html = render(createElement(PrimaryNav, { id: 'nav', open: false }));
  assert.deepEqual(pairs(html), [
    ['Home', '/'],
    ['Network Hospital', '/hospitals'],
    ['Employee', '/employee-policy'],
    ['Pensioner', '/pensioner-policy'],
    ['Govt Orders', '/government-orders'],
    ['Coverage', '/coverage'],
    ['Eligibility', '/eligibility'],
    ['How to Enroll', '/enrollment'],
    ['Forms Download', '/forms'],
    ['Track Claim', `${PORTAL}TNportal`],
    ['User Manual', '/user-manual'],
    ['Grievances', '/grievances'],
    ['Contact', '/contacts'],
  ]);
  assert.deepEqual(texts(html, /<button[^>]*nav__trigger[^>]*><span>(.*?)<\/span>/g), ['Scheme', 'Beneficiary']);
  assert.deepEqual(texts(html, /<li class="nav__heading"[^>]*>(.*?)<\/li>/g), ['Policy Details', 'Govt Orders', 'Scheme']);
  const external = anchors(html).filter((anchor) => anchor.href.startsWith('https:'));
  assert.equal(external.length, 1, 'Only Track Claim leaves the site');
  assert.match(external[0].attrs, /target="_blank"/);
  assert.match(external[0].attrs, /rel="noopener noreferrer"/);
  assert.match(html, /<nav id="nav" class="nav" aria-label="Main navigation">/);
  assert.ok(!html.includes('/gallery'));
});

test('the Gallery link appears in the menu once the gallery has a published item', () => {
  const html = render(createElement(PrimaryNav, { id: 'nav', open: true }), { galleryAvailable: true });
  assert.ok(pairs(html).some(([text, href]) => text === 'Gallery' && href === '/gallery'));
  assert.match(html, /class="nav is-open"/);
});

test('English Login menu: label, heading, items and the forgot-password link as before', () => {
  const html = render(createElement(LoginMenu));
  assert.deepEqual(texts(html, /<button[^>]*login-menu__trigger[^>]*>([\s\S]*?)<\/button>/g), ['Login']);
  assert.deepEqual(texts(html, /<p class="login-menu__heading">(.*?)<\/p>/g), ['Sign in as']);
  assert.deepEqual(pairs(html), [
    ['Employees', `${PORTAL}TNportal`],
    ['Pensioners', `${PORTAL}Pensioners`],
    ['Hospital Login', `${PORTAL}Administrator`],
    ['Insurer', `${PORTAL}TNportal`],
  ]);
  assert.ok(anchors(html).every((anchor) => /target="_blank"/.test(anchor.attrs)));
  assert.match(html, /class="ext-link login-menu__link"/);
  assert.ok(!html.includes('login-menu__forgot'), 'upstream removed the default forgot-password link');
});

test('English helpline strip: heading, helplines with their tel links and availability as before', () => {
  const html = flat(render(createElement(SupportStrip)));
  assert.deepEqual(texts(html, /<span class="support-strip__title">([\s\S]*?)<\/span><\/span>/g), ['24*7 Help Line (Toll Free Number)']);
  // the list is rendered twice for the endless scroll; the copy is hidden from assistive technology
  assert.equal((html.match(/<ul class="support-strip__group"/g) ?? []).length, 2);
  const unique = [...new Set(pairs(html).map((pair) => pair.join('|')))];
  assert.deepEqual(unique, ['1800-233-5666|tel:18002335666', '1800-233-5544|tel:18002335544', '044 40115088|tel:04440115088']);
  assert.ok(html.includes('For any login issues in Website/Mobile app please call:'));
  assert.ok(html.includes('Employee:') && html.includes('Pensioner:'));
  assert.ok(html.includes('<span>24/7</span>'));
  assert.match(html, /aria-label="Call Employee on 1800-233-5666"/);
});

test('English footer: groups, links, helplines and legal line as before', () => {
  const html = render(createElement(SiteFooter));
  assert.deepEqual(texts(html, /<h2[^>]*>(.*?)<\/h2>/g), ['Tamil Nadu New Health Insurance Scheme', 'Project office address', 'Quick links', 'NHIS portals', 'Helplines']);
  assert.deepEqual(pairs(html).filter(([, href]) => !href.startsWith('tel:')), [
    ['TN-NHISTamil Nadu New Health Insurance Scheme', '/'], // the wordmark and the scheme name are two block elements
    ['Network Hospital', '/hospitals'],
    ['Employee', '/employee-policy'],
    ['Pensioner', '/pensioner-policy'],
    ['Govt Orders', '/government-orders'],
    ['Coverage', '/coverage'],
    ['Eligibility', '/eligibility'],
    ['How to Enroll', '/enrollment'],
    ['Forms Download', '/forms'],
    ['Grievances', '/grievances'],
    ['Contact', '/contacts'],
    ['Employees', `${PORTAL}TNportal`],
    ['Pensioners', `${PORTAL}Pensioners`],
    ['Hospital Login', `${PORTAL}Administrator`],
    ['Track Claim', `${PORTAL}TNportal`],
    ['NHIS portal (tn-nhis.com)', 'https://tn-nhis.com/'],
  ]);
  assert.deepEqual(pairs(html).filter(([, href]) => href.startsWith('tel:')), [
    ['044 28297804', 'tel:04428297804'],
    ['1800-233-5666', 'tel:18002335666'], ['1800-233-5544', 'tel:18002335544'], ['044 40115088', 'tel:04440115088'],
  ]);
  assert.ok(html.includes('Employee</span>: <a'));
  assert.ok(html.includes('Available 24/7'));
  assert.ok(html.includes('Health insurance cover for government employees, pensioners and their eligible family members'));
  assert.ok(html.includes(`© ${new Date().getFullYear()} Tamil Nadu New Health Insurance Scheme`));
  assert.match(html, /<ul class="site-footer__links">/, 'the ten quick links stay in two columns');
  assert.ok(!html.includes('site-footer__logos') && html.includes('footer-contact'), 'the supplied office address is visible');
});

/* ---------------------------------------------------------------- baseline: Tamil */

test('Tamil header uses the header subtitle (with the "ுத்" spelling) and keeps the wordmark in English', () => {
  const html = render(createElement(SiteHeader), { locale: 'ta' });
  assert.match(html, /<span class="nhis-header__name" lang="en">/);
  assert.match(html, /<span class="nhis-header__subtitle" lang="ta">தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்<\/span>/);
  assert.match(html, /aria-label="TN-NHIS — தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்"/);
  assert.match(html, /alt="தமிழ்நாடு அரசு சின்னம்"/);
  assert.match(html, /alt="தளத்தின் தலைப்புப் பகுதியில் காட்டப்படும் உருவப்படம்"/);
});

test('Tamil menu, Login menu, strip and footer have the Tamil texts of today', () => {
  const nav = render(createElement(PrimaryNav, { id: 'nav', open: false }), { locale: 'ta' });
  assert.deepEqual(anchors(nav).map((anchor) => anchor.text), [
    'முகப்பு', 'அங்கிகரிக்கபட்ட மருத்துவமனைகள்', 'ஊழியர்', 'ஓய்வூதியதாரர்', 'அரசு ஆணைகள்', 'காப்புறு', 'தகுதி',
    'பதிவு செய்வது எப்படி', 'படிவங்கள் பதிவிறக்கம்', 'உரிமைகோரலைக் கண்காணிக்கவும்',
    'பயனர் கையேடு', 'குறைதீர்ப்பு', 'தொடர்பு கொள்ளவும்',
  ]);
  assert.deepEqual(texts(nav, /<li class="nav__heading"[^>]*>(.*?)<\/li>/g), ['கொள்கை விவரங்கள்', 'அரசு ஆணைகள்', 'திட்டம்']);
  assert.deepEqual(texts(nav, /<button[^>]*nav__trigger[^>]*><span>(.*?)<\/span>/g), ['திட்டம்', 'பயனாளி']);

  const login = render(createElement(LoginMenu), { locale: 'ta' });
  assert.deepEqual(anchors(login).map((anchor) => anchor.text), ['பணியாளர்கள்', 'ஓய்வூதியம் பெறுவோர்', 'மருத்துவமனை உள்நுழைவு', 'காப்பீட்டாளர்']);
  assert.deepEqual(texts(login, /<button[^>]*login-menu__trigger[^>]*>([\s\S]*?)<\/button>/g), ['உள்நுழைய']);

  const strip = flat(render(createElement(SupportStrip), { locale: 'ta' }));
  assert.ok(strip.includes('24*7 உதவி எண் (கட்டணமில்லா எண்)'));
  assert.ok(strip.includes('பணியாளர்:') && strip.includes('ஓய்வூதியம் பெறுபவர்:'));
  assert.ok(strip.includes('இணையதளம்/மொபைல் பயன்பாட்டில் ஏதேனும் உள்நுழைவுச் சிக்கல்களுக்கு அழைக்கவும்:'));
  assert.ok(strip.includes('<span>24/7</span>'));

  const footer = render(createElement(SiteFooter), { locale: 'ta' });
  assert.deepEqual(texts(footer, /<h2[^>]*>(.*?)<\/h2>/g), ['தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்', 'திட்ட அலுவலக முகவரி', 'விரைவு இணைப்புகள்', 'NHIS தளங்கள்', 'உதவி எண்கள்']);
  assert.ok(footer.includes(`© ${new Date().getFullYear()} தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்`));
  assert.match(footer, /<span class="brand-logo__sub" lang="ta">தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம்<\/span>/);
});

/* ---------------------------------------------------------------- managed content drives the markup */

const edited = (change: (content: SiteContentMap) => void): SiteContentMap => {
  const content = structuredClone(DEFAULT_SITE_CONTENT);
  change(content);
  return content;
};

test('the header shows the managed title, subtitle and images; the portrait can be switched off', () => {
  const content = edited((c) => {
    c.header.title = { en: 'HEALTH-PLUS', ta: '' };
    c.header.subtitle = { en: 'A new subtitle', ta: '' };
    c.header.emblem = { assetId: 'abcdEFGH1234', builtIn: null, alt: { en: 'Uploaded emblem', ta: '' }, width: 400, height: 300 };
    c.header.showPortrait = false;
  });
  const html = render(createElement(SiteHeader), { content });
  assert.match(html, /<span>HEALTH<\/span><span class="nhis-header__hyphen">-<\/span><span class="nhis-header__name-blue">PLUS<\/span>/);
  assert.match(html, /<span class="nhis-header__subtitle" lang="en">A new subtitle<\/span>/);
  assert.match(html, /<img[^>]*src="\/api\/v1\/files\/abcdEFGH1234"[^>]*alt="Uploaded emblem"/);
  assert.match(html, /width="400"/);
  assert.match(html, /height="300"/);
  assert.match(html, /nhis-header__inner nhis-header__inner--no-portrait/);
  assert.ok(!html.includes('nhis-header__portrait'));
  // Tamil text is empty: English is shown and marked as English
  const tamil = render(createElement(SiteHeader), { content, locale: 'ta' });
  assert.match(tamil, /<span class="nhis-header__subtitle" lang="en">A new subtitle<\/span>/);
  assert.match(tamil, /<img[^>]*alt="Uploaded emblem"[^>]*lang="en"|<img[^>]*lang="en"[^>]*alt="Uploaded emblem"/);
});

test('in preview mode uploaded images are requested from the administration', () => {
  const content = edited((c) => { c.header.emblem = { assetId: 'abcdEFGH1234', builtIn: null, alt: { en: 'Emblem', ta: '' }, width: null, height: null }; });
  assert.match(render(createElement(SiteHeader), { content, preview: true }), /src="\/api\/v1\/admin\/files\/abcdEFGH1234"/);
  assert.match(render(createElement(SiteHeader), { content, preview: false }), /src="\/api\/v1\/files\/abcdEFGH1234"/);
  const noSize = render(createElement(SiteHeader), { content });
  assert.ok(!/<img[^>]*nhis-header__emblem[^>]*\swidth=/.test(noSize), 'no width or height attribute when the size is not known');
});

test('the strip and the footer list only visible helplines; availability and the strip disappear when empty', () => {
  const content = edited((c) => {
    c.header.helplines[1].visible = false;
    c.header.availability = '';
  });
  const strip = render(createElement(SupportStrip), { content });
  assert.ok(!strip.includes('1800-233-5544'));
  assert.ok(!strip.includes('24/7'));
  const footer = render(createElement(SiteFooter), { content });
  assert.ok(!footer.includes('1800-233-5544') && footer.includes('1800-233-5666'));
  assert.ok(!footer.includes('Available'));
  const none = edited((c) => { c.header.helplines.forEach((line) => { line.visible = false; }); });
  assert.equal(render(createElement(SupportStrip), { content: none }), '');
  assert.ok(!render(createElement(SiteFooter), { content: none }).includes('footer-help'));
});

test('the Login menu follows the managed items and is not shown without any', () => {
  const content = edited((c) => {
    c.header.loginMenu.items[1].visible = false;
    c.header.loginMenu.items[0].label = { en: 'Staff', ta: '' };
    c.header.loginMenu.items[2].target = { type: 'route', path: '/contacts' };
    c.header.loginMenu.label = { en: 'Sign in', ta: '' };
  });
  const html = render(createElement(LoginMenu), { content });
  assert.deepEqual(pairs(html).map(([text]) => text), ['Staff', 'Hospital Login', 'Insurer']);
  assert.equal(anchors(html).find((a) => a.text === 'Hospital Login')?.href, '/contacts');
  assert.deepEqual(texts(html, /<button[^>]*login-menu__trigger[^>]*>([\s\S]*?)<\/button>/g), ['Sign in']);
  const empty = edited((c) => {
    c.header.loginMenu.items.forEach((item) => { item.visible = false; });
    c.header.loginMenu.forgotPassword.visible = false;
  });
  assert.equal(render(createElement(LoginMenu), { content: empty }), '');
});

test('the menu follows the managed order, labels and visibility', () => {
  const content = edited((c) => {
    c.navigation.items.reverse();
    c.navigation.items.find((item) => item.id === 'grievances')!.visible = false;
    const menu = c.navigation.items.find((item) => item.type === 'menu' && item.id === 'scheme');
    if (menu?.type === 'menu') menu.label = { en: 'About the scheme', ta: '' };
  });
  const html = render(createElement(PrimaryNav, { id: 'nav', open: false }), { content });
  const order = texts(html, /<li class="nav__item">([\s\S]*?)<\/li>(?=<li class="nav__item">|<\/ul>)/g);
  assert.ok(order[0].startsWith('Contact'));
  assert.ok(order[order.length - 1].startsWith('Home'));
  assert.ok(!html.includes('Grievances'));
  assert.ok(html.includes('<span>About the scheme</span>'));
});

test('footer logos, contact block, link groups and the copyright year come from the footer content', () => {
  const content = edited((c) => {
    c.footer.logos = [
      { id: 'l1', image: { assetId: null, builtIn: 'assets/hitpa-logo.png', alt: { en: 'HITPA', ta: '' }, width: 1469, height: 1071 }, url: 'https://hitpa.example/', visible: true },
      { id: 'l2', image: { assetId: null, builtIn: 'assets/vidal-health-logo.png', alt: { en: 'Vidal', ta: '' }, width: 2000, height: 600 }, url: null, visible: true },
      { id: 'l3', image: { assetId: null, builtIn: 'assets/medi-assist-logo.png', alt: { en: 'Hidden', ta: '' }, width: 1600, height: 629 }, url: null, visible: false },
    ];
    c.footer.contact = { visible: true, heading: { en: 'Write to us', ta: '' }, address: { en: 'Line one\nLine two', ta: '' }, email: 'help@example.org', phone: '1800 233 5666' };
    c.footer.linkGroups[1].visible = false;
    c.footer.linkGroups[0].links = c.footer.linkGroups[0].links.slice(0, 3);
    c.footer.copyright = { en: '© {year} Test scheme, all rights reserved', ta: '' };
    c.footer.showWordmark = false;
  });
  const html = render(createElement(SiteFooter), { content });
  assert.match(html, /<ul class="site-footer__logos">/);
  assert.match(html, /<img[^>]*src="\/assets\/hitpa-logo\.png"[^>]*alt="HITPA"/);
  assert.match(html, /<img[^>]*src="\/assets\/vidal-health-logo\.png"[^>]*alt="Vidal"/);
  assert.ok(!html.includes('Hidden'));
  assert.ok(anchors(html).some((anchor) => anchor.href === 'https://hitpa.example/' && /rel="noopener noreferrer"/.test(anchor.attrs)));
  assert.ok(html.includes('>Write to us</h2>'));
  assert.ok(html.includes('Line one\nLine two'));
  assert.ok(anchors(html).some((anchor) => anchor.href === 'mailto:help@example.org' && anchor.text === 'help@example.org'));
  assert.ok(anchors(html).some((anchor) => anchor.href === 'tel:18002335666' && anchor.text === '1800 233 5666'));
  assert.ok(!html.includes('NHIS portals'), 'hidden group');
  assert.ok(!/class="site-footer__links"/.test(html), 'a short group is a single column');
  assert.ok(html.includes(`© ${new Date().getFullYear()} Test scheme, all rights reserved`));
  assert.ok(!html.includes('brand-logo'), 'wordmark switched off');
  assert.ok(!html.includes('visually-hidden">Tamil Nadu New Health Insurance Scheme</h2>'));
  assert.match(html, /<h2 id="footer-about">Tamil Nadu New Health Insurance Scheme<\/h2>/);
});

test('a footer link to a document or the empty gallery is left out, together with its group when nothing is left', () => {
  const content = edited((c) => {
    c.footer.linkGroups = [{ id: 'only', heading: { en: 'Only', ta: '' }, visible: true, links: [
      { id: 'g', label: { en: 'Gallery', ta: '' }, target: { type: 'route', path: '/gallery' }, visible: true },
      { id: 'd', label: { en: 'File', ta: '' }, target: { type: 'document', documentId: 'nope' }, visible: true },
    ] }];
  });
  const html = render(createElement(SiteFooter), { content });
  assert.ok(!html.includes('>Only<') && !html.includes('Gallery') && !html.includes('File'));
});

/* ---------------------------------------------------------------- wordmark helpers and banner */

test('the wordmark splits at the first hyphen only', () => {
  assert.deepEqual(splitWordmark('TN-NHIS'), { head: 'TN', tail: 'NHIS' });
  assert.deepEqual(splitWordmark('A-B-C'), { head: 'A', tail: 'B-C' });
  assert.deepEqual(splitWordmark('NHIS'), { head: 'NHIS', tail: '' });
  assert.deepEqual(splitWordmark('-NHIS'), { head: '-NHIS', tail: '' });
  assert.deepEqual(splitWordmark('TN-'), { head: 'TN-', tail: '' });
  assert.equal(wordmarkLanguage('TN-NHIS', 'ta'), 'en');
  assert.equal(wordmarkLanguage('தமிழ்-NHIS', 'ta'), 'ta');
});

test('the footer wordmark uses the header title and subtitle', () => {
  const html = render(createElement(BrandLogo, { variant: 'footer', to: '/' }), { content: edited((c) => { c.header.title = { en: 'AB-CD', ta: '' }; }) });
  assert.match(html, /<span class="brand-logo__tn">AB<\/span><span class="brand-logo__dash" aria-hidden="true">-<\/span><span class="brand-logo__nhis">CD<\/span>/);
  assert.match(html, /<span class="brand-logo__sub" lang="en">Tamil Nadu New Health Insurance Scheme<\/span>/);
});

test('the preview banner is a status message in preview mode and says how to sign in when the administration refused', () => {
  assert.equal(render(createElement(PreviewBanner)), '');
  const on = render(createElement(PreviewBanner), { preview: true });
  assert.match(on, /role="status"/);
  assert.equal(textOf(on), 'Preview: unpublished changes, not visible to the public');
  const denied = render(createElement(PreviewBanner), { previewDenied: true });
  assert.match(denied, /role="status"/);
  assert.equal(textOf(denied), 'Sign in to the administration in this browser to preview unpublished changes. Showing the published site.');
  assert.ok(textOf(render(createElement(PreviewBanner), { preview: true, locale: 'ta' })).startsWith('முன்னோட்டம்'));
});

test('text overrides change interface labels everywhere t() is used', () => {
  const content = edited((c) => {
    c.text.overrides['nav.openMenu'] = { en: 'Show the menu', ta: '' };
  });
  // nav.openMenu is not in the editable catalog (the API would refuse it) but proves that the provider reads the overrides
  assert.match(render(createElement(SiteHeader), { content }), /aria-label="Show the menu"/);
  assert.match(render(createElement(SiteHeader), { content, locale: 'ta' }), /aria-label="பட்டியைத் திற"/);
});
