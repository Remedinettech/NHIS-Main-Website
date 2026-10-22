import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SITE_CONTENT, type DocumentRecord, type FooterLinkGroup, type LinkItem, type LinkTarget, type NavigationContent,
} from '@nhis/shared-types';
import {
  isGalleryTarget, linkLabel, resolveFooterGroups, resolveLink, resolveNavigation, routePathOf, visibleLinks, type LinkContext,
} from './siteLinks';

const document = (patch: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'form-annexure-vi',
  category: 'enrolment-form',
  audience: 'employee',
  order: 1,
  label: { en: 'Employees: ANNEXURE - VI', ta: '' },
  title: { en: 'Employees: ANNEXURE - VI', ta: '' },
  dateLabel: { en: null, ta: null },
  sourceUrl: 'https://tn-nhis.com/x.pdf',
  localPath: '/api/v1/files/doc123456',
  availability: 'available',
  notes: [],
  ...patch,
});

const context = (documents: DocumentRecord[] = [], extra: Partial<LinkContext> = {}): LinkContext => ({
  documentsById: new Map(documents.map((doc) => [doc.id, doc])),
  galleryAvailable: true,
  ...extra,
});

const link = (id: string, target: LinkTarget, visible = true): LinkItem => ({ id, label: { en: id, ta: '' }, target, visible });

/* ---------------------------------------------------------------- resolveLink */

test('a route target becomes a router link; hash anchors are kept and an unknown route is refused', () => {
  assert.deepEqual(resolveLink({ type: 'route', path: '/hospitals' }, context()), { kind: 'route', href: '/hospitals', newTab: false });
  assert.deepEqual(
    resolveLink({ type: 'route', path: '/government-orders#employee-orders' }, context()),
    { kind: 'route', href: '/government-orders#employee-orders', newTab: false },
  );
  assert.equal(resolveLink({ type: 'route', path: '/admin' }, context()), null);
  assert.equal(resolveLink({ type: 'route', path: 'hospitals' }, context()), null);
  assert.equal(routePathOf('/forms#policy-lists'), '/forms');
  assert.equal(routePathOf('/forms'), '/forms');
});

test('an external target opens in a new tab and only https addresses are accepted', () => {
  assert.deepEqual(
    resolveLink({ type: 'external', url: 'https://tn-nhis.com/?Pagename=TNportal' }, context()),
    { kind: 'external', href: 'https://tn-nhis.com/?Pagename=TNportal', newTab: true },
  );
  for (const url of ['http://tn-nhis.com/', 'javascript:alert(1)', 'data:text/html,x', '//tn-nhis.com/', 'https://user:pw@tn-nhis.com/', '/relative']) {
    assert.equal(resolveLink({ type: 'external', url }, context()), null, url);
  }
});

test('a document target resolves to the public file of an available document, else it cannot be shown', () => {
  const found = resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document()]));
  assert.ok(found);
  assert.equal(found.kind, 'file');
  assert.equal(found.href, '/api/v1/files/doc123456');
  assert.equal(found.newTab, true);
  assert.equal(found.document?.id, 'form-annexure-vi');
  assert.equal(resolveLink({ type: 'document', documentId: 'x' }, context()), null, 'unknown document');
  assert.equal(resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document({ availability: 'unavailable' })])), null);
  assert.equal(resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document({ localPath: null })])), null);
});

test('email and phone targets become mailto: and tel: links, malformed ones are refused', () => {
  assert.deepEqual(resolveLink({ type: 'email', address: 'help@example.org' }, context()), { kind: 'mailto', href: 'mailto:help@example.org', newTab: false });
  assert.equal(resolveLink({ type: 'email', address: 'not an address' }, context()), null);
  assert.equal(resolveLink({ type: 'email', address: 'a@b.org?bcc=evil@c.org' }, context()), null);
  assert.deepEqual(resolveLink({ type: 'phone', number: '+914440115088' }, context()), { kind: 'tel', href: 'tel:+914440115088', newTab: false });
  assert.deepEqual(resolveLink({ type: 'phone', number: '18002335666' }, context()), { kind: 'tel', href: 'tel:18002335666', newTab: false });
  assert.equal(resolveLink({ type: 'phone', number: 'call me' }, context()), null);
  assert.equal(resolveLink({ type: 'phone', number: '12' }, context()), null);
});

test('the gallery cannot be linked while it has no published item', () => {
  const gallery: LinkTarget = { type: 'route', path: '/gallery' };
  assert.equal(isGalleryTarget(gallery), true);
  assert.equal(isGalleryTarget({ type: 'route', path: '/gallery#top' }), true);
  assert.equal(isGalleryTarget({ type: 'route', path: '/forms' }), false);
  assert.ok(resolveLink(gallery, context([], { galleryAvailable: true })));
  assert.equal(resolveLink(gallery, context([], { galleryAvailable: false })), null);
  assert.ok(resolveLink(gallery, { documentsById: new Map() }), 'no rule when availability is not given');
});

/* ---------------------------------------------------------------- labels */

test('a document label replaces {title} with the document title', () => {
  const label = { en: 'Enrolment annexure form: {title}', ta: 'பதிவுப் படிவ இணைப்பு: {title}' };
  const resolved = resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document()]));
  const english = linkLabel(label, resolved, 'en');
  assert.equal(english.text, 'Enrolment annexure form: Employees: ANNEXURE - VI');
  assert.equal(english.lang, 'en');
  const tamil = linkLabel(label, resolved, 'ta');
  assert.equal(tamil.text, 'பதிவுப் படிவ இணைப்பு: Employees: ANNEXURE - VI');
  assert.equal(tamil.lang, 'ta');
  // The title has no Tamil text: it stays English and is marked as such, the rest of the label is Tamil.
  assert.deepEqual(tamil.segments, [
    { text: 'பதிவுப் படிவ இணைப்பு: ', lang: 'ta' },
    { text: 'Employees: ANNEXURE - VI', lang: 'en' },
  ]);
});

test('{title} is only replaced for document files; other labels are used as written', () => {
  const label = { en: 'Form {title}', ta: '' };
  assert.equal(linkLabel(label, resolveLink({ type: 'external', url: 'https://example.org/' }, context()), 'en').text, 'Form {title}');
  assert.equal(linkLabel(label, null, 'en').text, 'Form {title}');
  assert.equal(linkLabel({ en: 'Forms', ta: '' }, resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document()])), 'en').text, 'Forms');
});

test('a label without Tamil text falls back to English and says so', () => {
  const label = linkLabel({ en: 'Contact', ta: '' }, null, 'ta');
  assert.deepEqual(label, { text: 'Contact', lang: 'en', segments: [{ text: 'Contact', lang: 'en' }] });
});

test('{title} falls back to the document label when the record has no title, and several tokens are all replaced', () => {
  const resolved = resolveLink({ type: 'document', documentId: 'form-annexure-vi' }, context([document({ title: { en: '', ta: '' }, label: { en: 'Label text', ta: '' } })]));
  assert.equal(linkLabel({ en: '{title} / {title}', ta: '' }, resolved, 'en').text, 'Label text / Label text');
});

/* ---------------------------------------------------------------- lists */

test('visibleLinks keeps order and drops hidden items and targets that cannot be shown', () => {
  const items = [
    link('a', { type: 'route', path: '/hospitals' }),
    link('hidden', { type: 'route', path: '/forms' }, false),
    link('doc', { type: 'document', documentId: 'missing' }),
    link('bad', { type: 'external', url: 'http://insecure.example/' }),
    link('b', { type: 'external', url: 'https://example.org/' }),
  ];
  assert.deepEqual(visibleLinks(items, context()).map((view) => view.item.id), ['a', 'b']);
});

const navLink = (id: string, target: LinkTarget, visible = true) => ({ type: 'link' as const, ...link(id, target, visible) });
const heading = (id: string, visible = true) => ({ type: 'heading' as const, id, label: { en: id, ta: '' }, visible });
const menu = (id: string, children: Array<ReturnType<typeof navLink> | ReturnType<typeof heading>>, visible = true) =>
  ({ type: 'menu' as const, id, label: { en: id, ta: '' }, visible, children });

test('the built-in navigation resolves to the entries of today, in order, without the empty gallery', () => {
  const shape = (galleryAvailable: boolean) => resolveNavigation(DEFAULT_SITE_CONTENT.navigation, context([], { galleryAvailable })).map((entry) => (
    entry.kind === 'link' ? entry.id : `${entry.id}[${entry.children.map((child) => child.id).join(',')}]`));
  assert.deepEqual(shape(false), [
    'home', 'hospitals',
    'scheme[policy,employee-policy,pensioner-policy,orders,government-orders,about,coverage,eligibility,enroll,forms]',
    'beneficiary[track-claim]',
    'user-manual',
    'grievances', 'contacts',
  ]);
  assert.deepEqual(shape(true), [
    'home', 'hospitals',
    'scheme[policy,employee-policy,pensioner-policy,orders,government-orders,about,coverage,eligibility,enroll,forms]',
    'beneficiary[track-claim]',
    'user-manual',
    'gallery', 'grievances', 'contacts',
  ]);
});

test('navigation drops hidden entries, empty dropdowns and headings that have no link below them', () => {
  const navigation: NavigationContent = {
    items: [
      navLink('home', { type: 'route', path: '/' }),
      navLink('hidden-link', { type: 'route', path: '/forms' }, false),
      menu('a', [
        heading('h1'),
        navLink('doc', { type: 'document', documentId: 'missing' }),
        heading('h2'),
        navLink('x', { type: 'route', path: '/forms' }),
        heading('h3', false),
        navLink('y', { type: 'route', path: '/coverage' }),
        heading('h4'),
      ]),
      menu('only-hidden', [navLink('z', { type: 'route', path: '/forms' }, false)]),
      menu('hidden-menu', [navLink('w', { type: 'route', path: '/forms' })], false),
    ],
  };
  const entries = resolveNavigation(navigation, context());
  assert.deepEqual(entries.map((entry) => entry.id), ['home', 'a']);
  const [, menuEntry] = entries;
  assert.equal(menuEntry.kind, 'menu');
  assert.deepEqual(menuEntry.kind === 'menu' && menuEntry.children.map((child) => `${child.kind}:${child.id}`), ['heading:h2', 'link:x', 'link:y']);
});

test('footer groups keep their order and drop hidden groups, hidden links and groups left without links', () => {
  const groups: FooterLinkGroup[] = [
    { id: 'one', heading: { en: 'One', ta: '' }, visible: true, links: [link('a', { type: 'route', path: '/forms' }), link('b', { type: 'route', path: '/forms' }, false)] },
    { id: 'two', heading: { en: 'Two', ta: '' }, visible: false, links: [link('c', { type: 'route', path: '/forms' })] },
    { id: 'three', heading: { en: 'Three', ta: '' }, visible: true, links: [link('d', { type: 'document', documentId: 'missing' })] },
  ];
  const views = resolveFooterGroups(groups, context());
  assert.deepEqual(views.map((view) => [view.group.id, view.links.map((entry) => entry.item.id)]), [['one', ['a']]]);
});
