import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SITE_CONTENT, EDITABLE_TEXT_CATALOG, SITE_CONTENT_LIMITS, SITE_ICON_NAMES, defaultSiteContent,
  type NavigationContent, type PartnerEntry, type PartnersContent,
} from '@nhis/shared-types';
import {
  HOME_DOCUMENT_CATEGORIES, ICON_CHOICES, applyGroupList, countOverrides, firstUnused, groupRemovalBlock, groupTextCatalog, helplineChoices,
  isEmptyOverride, isGalleryLink, navigationIds, navigationWarnings, newNavHeading, newNavLink, newNavMenu, newPartner, newPartnerGroup, overrideOf,
  partnersInGroup, partnersWithoutGroup, placeholdersOf, regroupPartner, sectionVisibilityLock, setOverride, setSectionVisible, toggleCategory,
  unknownOverrideKeys, visibleNavigationCount, withoutOverrides,
} from './siteEdit';
import { validateSiteValues } from './siteForm';

const partner = (id: string, categoryId: string): PartnerEntry => ({
  id, categoryId, name: { en: id, ta: '' }, logo: { assetId: null, builtIn: 'assets/x.png', alt: { en: id, ta: '' }, width: 10, height: 10 }, url: null, visible: true,
});
const ids = (list: readonly PartnerEntry[]): string[] => list.map((p) => p.id);

/* ------------------------------------------------------------------ partners */

test('the partners of a group keep their order and the others are left out', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b'), partner('a2', 'a')];
  assert.deepEqual(ids(partnersInGroup(all, 'a')), ['a1', 'a2']);
  assert.deepEqual(ids(partnersInGroup(all, 'none')), []);
});

test('partners without an existing group are found', () => {
  const categories = [{ id: 'a', caption: { en: 'A', ta: '' }, visible: true }];
  assert.deepEqual(ids(partnersWithoutGroup(categories, [partner('a1', 'a'), partner('z1', 'gone')])), ['z1']);
});

test('a reordered group is written into the slots of that group and other groups stay where they are', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b'), partner('a2', 'a'), partner('b2', 'b'), partner('a3', 'a')];
  const next = applyGroupList(all, 'a', [all[4]!, all[0]!, all[2]!]);
  assert.deepEqual(ids(next), ['a3', 'b1', 'a1', 'b2', 'a2']);
  assert.deepEqual(ids(partnersInGroup(next, 'b')), ['b1', 'b2']);
});

test('a removed partner closes its slot and a partner added to a group goes after its last partner', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b'), partner('a2', 'a'), partner('b2', 'b')];
  assert.deepEqual(ids(applyGroupList(all, 'a', [all[2]!])), ['a2', 'b1', 'b2']);
  const added = partner('a9', 'a');
  assert.deepEqual(ids(applyGroupList(all, 'a', [all[0]!, all[2]!, added])), ['a1', 'b1', 'a2', 'a9', 'b2']);
  assert.deepEqual(ids(applyGroupList(all, 'c', [partner('c1', 'c')])), ['a1', 'b1', 'a2', 'b2', 'c1'], 'a group without partners gets its first one at the end');
  assert.deepEqual(ids(applyGroupList(all, 'a', [])), ['b1', 'b2'], 'emptying a group removes only its partners');
});

test('editing a partner of a group keeps its position', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b'), partner('a2', 'a')];
  const edited = { ...all[2]!, name: { en: 'Renamed', ta: '' } };
  const next = applyGroupList(all, 'a', [all[0]!, edited]);
  assert.deepEqual(ids(next), ['a1', 'b1', 'a2']);
  assert.equal(next[2]!.name.en, 'Renamed');
});

test('applyGroupList does not modify its input', () => {
  const all = [partner('a1', 'a'), partner('a2', 'a')];
  const copy = structuredClone(all);
  applyGroupList(all, 'a', [all[1]!, all[0]!]);
  assert.deepEqual(all, copy);
});

test('a regrouped partner becomes the last one of the new group and keeps everything else', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b'), partner('a2', 'a'), partner('b2', 'b')];
  const next = regroupPartner(all, 'a1', 'b');
  assert.deepEqual(ids(next), ['b1', 'a2', 'b2', 'a1']);
  assert.equal(next[3]!.categoryId, 'b');
  assert.deepEqual(ids(partnersInGroup(next, 'a')), ['a2']);
  assert.equal(all[0]!.categoryId, 'a', 'the input is not modified');
});

test('regrouping into an empty group, to the same group or an unknown partner', () => {
  const all = [partner('a1', 'a'), partner('b1', 'b')];
  assert.deepEqual(ids(regroupPartner(all, 'a1', 'c')), ['b1', 'a1']);
  assert.equal(regroupPartner(all, 'a1', 'a'), all);
  assert.equal(regroupPartner(all, 'nobody', 'b'), all);
});

test('a new partner and a new group have a valid unique id and no content yet', () => {
  const taken = ['partner-aaaa', 'united-india'];
  const created = newPartner('service', taken);
  assert.equal(created.categoryId, 'service');
  assert.ok(!taken.includes(created.id));
  assert.deepEqual(created.name, { en: '', ta: '' });
  assert.equal(created.logo.assetId, null);
  assert.equal(created.logo.builtIn, null);
  assert.equal(created.url, null);
  const group = newPartnerGroup(['insurance', 'service']);
  assert.match(group.id, /^group-/);
  assert.equal(group.caption.en, '');
});

test('a group with partners cannot be removed and the message counts them', () => {
  const all = [partner('a1', 'a'), partner('a2', 'a'), partner('b1', 'b')];
  assert.equal(groupRemovalBlock(all, 'c'), null);
  assert.match(groupRemovalBlock(all, 'b') ?? '', /^1 partner is in this group\. Move it/);
  assert.match(groupRemovalBlock(all, 'a') ?? '', /^2 partners are in this group\. Move them/);
});

test('every partner of the built-in content is in its group and the editor shows no orphan', () => {
  const content: PartnersContent = DEFAULT_SITE_CONTENT.partners;
  assert.deepEqual(partnersWithoutGroup(content.categories, content.partners), []);
});

/* ------------------------------------------------------------------ navigation */

const nav = (): NavigationContent => defaultSiteContent('navigation');

test('ids of the menu cover entries and the entries of dropdowns', () => {
  const all = navigationIds(nav().items);
  assert.ok(all.includes('home') && all.includes('scheme') && all.includes('employee-policy') && all.includes('policy'));
  assert.equal(new Set(all).size, all.length, 'the built-in menu has no repeated id');
});

test('new entries get ids that are not used anywhere in the menu', () => {
  const taken = navigationIds(nav().items);
  const link = newNavLink(taken);
  const heading = newNavHeading(taken);
  const menu = newNavMenu(taken);
  const created = [link.id, heading.id, menu.id, menu.children[0]!.id];
  assert.equal(new Set(created).size, 4, 'the ids of one batch differ from each other');
  for (const id of created) assert.ok(!taken.includes(id));
  assert.equal(menu.children.length, 1);
  assert.equal(menu.children[0]!.type, 'link');
  assert.deepEqual(link.label, { en: '', ta: '' });
  assert.deepEqual(link.target, { type: 'route', path: '' });
});

test('a new entry is reported by the validator as empty, never as valid by accident', () => {
  const content = nav();
  content.items.push(newNavLink(navigationIds(content.items)));
  content.items.push(newNavMenu(navigationIds(content.items)));
  const errors = validateSiteValues('navigation', content);
  const last = content.items.length - 1;
  assert.ok(errors[`items.${last - 1}.label.en`]);
  assert.ok(errors[`items.${last - 1}.target.path`]);
  assert.ok(errors[`items.${last}.label.en`]);
  assert.ok(errors[`items.${last}.children.0.target.path`]);
});

test('the built-in menu has no warnings and a hidden gallery rule is explained', () => {
  const content = nav();
  const warnings = navigationWarnings(content.items);
  const galleryPath = `items.${content.items.findIndex((item) => item.id === 'gallery')}`;
  assert.deepEqual(Object.keys(warnings), [galleryPath], 'only the Gallery link carries the "hidden while empty" note');
  assert.match(warnings[galleryPath] ?? '', /Gallery/);
});

test('a dropdown without a visible link and a heading without a link below it are reported', () => {
  const content = nav();
  const scheme = content.items.find((item) => item.type === 'menu' && item.id === 'scheme');
  assert.ok(scheme && scheme.type === 'menu');
  scheme.children.forEach((child) => { if (child.type === 'link') child.visible = false; });
  const index = content.items.indexOf(scheme);
  const warnings = navigationWarnings(content.items);
  assert.match(warnings[`items.${index}`] ?? '', /no visible link/);
  assert.match(warnings[`items.${index}.children.0`] ?? '', /No visible link follows this heading/, 'the first heading has only hidden links below it');
});

test('a heading is satisfied by a visible link before the next heading only', () => {
  const content = nav();
  const scheme = content.items.find((item) => item.type === 'menu' && item.id === 'scheme');
  assert.ok(scheme && scheme.type === 'menu');
  // policy heading, employee-policy, pensioner-policy, orders heading, ...: hide both links of the first group.
  for (const child of scheme.children) if (child.id === 'employee-policy' || child.id === 'pensioner-policy') child.visible = false;
  const index = content.items.indexOf(scheme);
  const warnings = navigationWarnings(content.items);
  assert.match(warnings[`items.${index}.children.0`] ?? '', /No visible link follows/, 'visible links after the next heading do not count');
  assert.equal(warnings[`items.${index}.children.3`], undefined, 'the second heading still has its link');
  assert.equal(warnings[`items.${index}`], undefined, 'the dropdown itself still has visible links');
});

test('a hidden dropdown or heading is not reported (the website hides it on purpose)', () => {
  const content = nav();
  const scheme = content.items.find((item) => item.type === 'menu' && item.id === 'scheme');
  assert.ok(scheme && scheme.type === 'menu');
  scheme.visible = false;
  scheme.children.forEach((child) => { child.visible = false; });
  assert.deepEqual(Object.keys(navigationWarnings(content.items)).filter((path) => path.startsWith(`items.${content.items.indexOf(scheme)}`)), []);
});

test('links to the gallery are recognised with and without an anchor', () => {
  assert.equal(isGalleryLink({ type: 'route', path: '/gallery' }), true);
  assert.equal(isGalleryLink({ type: 'route', path: '/gallery#top' }), true);
  assert.equal(isGalleryLink({ type: 'route', path: '/galleryx' }), false);
  assert.equal(isGalleryLink({ type: 'external', url: 'https://example.org/gallery' }), false);
});

test('visitors see visible links and dropdowns that have a visible link', () => {
  const content = nav();
  const total = content.items.length;
  assert.equal(visibleNavigationCount(content.items), total);
  const beneficiary = content.items.find((item) => item.id === 'beneficiary');
  assert.ok(beneficiary && beneficiary.type === 'menu');
  beneficiary.children.forEach((child) => { child.visible = false; });
  assert.equal(visibleNavigationCount(content.items), total - 1);
});

/* ------------------------------------------------------------------ homepage */

test('the hero cannot be hidden: its switch is locked and an attempt keeps it visible', () => {
  const sections = defaultSiteContent('home').sections;
  assert.ok(sectionVisibilityLock(sections[0]!));
  assert.equal(sectionVisibilityLock(sections[1]!), null);
  assert.equal(setSectionVisible(sections[0]!, false).visible, true);
  assert.equal(setSectionVisible(sections[1]!, false).visible, false);
  assert.equal(setSectionVisible(sections[1]!, false).id, sections[1]!.id);
});

test('helpline choices name the number and keep an unknown id selectable', () => {
  const helplines = DEFAULT_SITE_CONTENT.header.helplines;
  const choices = helplineChoices(helplines, 'employee');
  assert.equal(choices.length, helplines.length);
  assert.match(choices[0]!.label, /Employee \(1800-233-5666\)/);
  const unknown = helplineChoices(helplines, 'removed-line');
  assert.equal(unknown[0]!.value, 'removed-line');
  assert.match(unknown[0]!.label, /Unknown helpline/);
  assert.equal(helplineChoices(helplines, null).length, helplines.length);
  assert.match(helplineChoices([{ ...helplines[0]!, visible: false }], null)[0]!.label, /hidden/);
});

test('toggling a document category keeps the canonical order and never repeats a category', () => {
  assert.deepEqual(toggleCategory(['enrolment-form'], 'govt-order-employee', true), ['govt-order-employee', 'enrolment-form']);
  assert.deepEqual(toggleCategory(['enrolment-form'], 'enrolment-form', true), ['enrolment-form']);
  assert.deepEqual(toggleCategory(['enrolment-form', 'policy-non-payable'], 'enrolment-form', false), ['policy-non-payable']);
  assert.deepEqual(toggleCategory([], 'enrolment-guide', false), []);
});

test('every category the form offers is accepted by the shared validator', () => {
  for (const category of HOME_DOCUMENT_CATEGORIES) {
    const home = defaultSiteContent('home');
    home.documents.categories = [category];
    assert.deepEqual(validateSiteValues('home', home), {}, category);
  }
});

test('the first unused value is offered to a new row', () => {
  assert.equal(firstUnused(['a', 'b', 'c'], ['a', 'c']), 'b');
  assert.equal(firstUnused(['a'], ['a']), undefined);
  assert.equal(firstUnused(HOME_DOCUMENT_CATEGORIES, [...HOME_DOCUMENT_CATEGORIES]), undefined);
});

test('every icon of the content model has a readable name in the select', () => {
  assert.deepEqual(ICON_CHOICES.map((choice) => choice.value), [...SITE_ICON_NAMES]);
  for (const choice of ICON_CHOICES) assert.ok(choice.label.length > 2, choice.value);
});

test('the limits the forms use exist', () => {
  for (const key of ['partners', 'partnerCategories', 'navItems', 'navChildren', 'quickTiles', 'pathwayGroups', 'pathwayLinks', 'homeActions', 'highlights', 'documentIds'] as const) {
    assert.ok(SITE_CONTENT_LIMITS[key] > 0, key);
  }
});

/* ------------------------------------------------------------------ page text */

test('placeholders are found once each, in order', () => {
  assert.deepEqual(placeholdersOf('Showing {count} of {total}, {count} again'), ['count', 'total']);
  assert.deepEqual(placeholdersOf('No placeholders { here } or {}'), []);
});

test('setting an override stores it and an empty pair removes the entry', () => {
  const start = { 'hospitals.title': { en: 'Hospitals', ta: '' } };
  const added = setOverride(start, 'contacts.title', { en: 'Reach us', ta: '' });
  assert.deepEqual(Object.keys(added), ['hospitals.title', 'contacts.title']);
  assert.deepEqual(Object.keys(setOverride(added, 'contacts.title', { en: '', ta: '' })), ['hospitals.title']);
  assert.deepEqual(Object.keys(setOverride(added, 'contacts.title', { en: '   ', ta: '' })), ['hospitals.title'], 'blank counts as empty');
  assert.deepEqual(start, { 'hospitals.title': { en: 'Hospitals', ta: '' } }, 'the input is not modified');
});

test('a Tamil-only override is kept', () => {
  const next = setOverride({}, 'hospitals.title', { en: '', ta: 'மருத்துவமனைகள்' });
  assert.deepEqual(next, { 'hospitals.title': { en: '', ta: 'மருத்துவமனைகள்' } });
  assert.equal(isEmptyOverride(next['hospitals.title']!), false);
});

test('an override that was typed and then cleared leaves the document as it was saved', () => {
  const saved = { 'hospitals.title': { en: 'Hospitals', ta: '' } };
  const typed = setOverride(saved, 'contacts.title', { en: 'R', ta: '' });
  const cleared = setOverride(typed, 'contacts.title', { en: '', ta: '' });
  assert.equal(JSON.stringify(cleared), JSON.stringify(saved), 'no dirty state is left behind');
});

test('overrides of unknown keys are listed and can be removed', () => {
  const overrides = { 'hospitals.title': { en: 'A', ta: '' }, 'old.removed.key': { en: 'B', ta: '' } };
  assert.deepEqual(unknownOverrideKeys(overrides), ['old.removed.key']);
  assert.deepEqual(Object.keys(withoutOverrides(overrides, ['old.removed.key'])), ['hospitals.title']);
  assert.equal(countOverrides(overrides), 2);
  assert.equal(countOverrides({ a: { en: '', ta: '' } }), 0);
});

test('an unknown key makes the server reject the document, so the form must offer to remove it', () => {
  const errors = validateSiteValues('text', { overrides: { 'old.removed.key': { en: 'B', ta: '' } } });
  assert.ok(errors['overrides.old.removed.key']);
});

test('override of a missing key is an empty pair and never reads the prototype', () => {
  assert.deepEqual(overrideOf({}, 'hospitals.title'), { en: '', ta: '' });
  assert.deepEqual(overrideOf({}, 'constructor'), { en: '', ta: '' });
  assert.deepEqual(overrideOf({}, '__proto__'), { en: '', ta: '' });
});

test('the catalog is grouped by page in catalog order and filtered by any of its words', () => {
  const all = groupTextCatalog(EDITABLE_TEXT_CATALOG);
  assert.equal(all.reduce((sum, group) => sum + group.entries.length, 0), EDITABLE_TEXT_CATALOG.length);
  assert.equal(all[0]!.group, EDITABLE_TEXT_CATALOG[0]!.group);
  assert.equal(new Set(all.map((group) => group.group)).size, all.length, 'one group per page');
  const hits = groupTextCatalog(EDITABLE_TEXT_CATALOG, '  GALLERY ');
  assert.ok(hits.length >= 1 && hits.every((group) => group.entries.length > 0));
  assert.deepEqual(groupTextCatalog(EDITABLE_TEXT_CATALOG, 'zzzz-no-such-text'), []);
  assert.equal(groupTextCatalog(EDITABLE_TEXT_CATALOG, 'hospitals.searchLabel')[0]!.entries[0]!.key, 'hospitals.searchLabel', 'the key is searchable');
});

test('every override the form can write is valid for the validator: empty pairs never reach it, filled ones pass', () => {
  for (const entry of EDITABLE_TEXT_CATALOG) {
    const overrides = setOverride({}, entry.key, { en: entry.defaults.en, ta: entry.defaults.ta });
    assert.deepEqual(validateSiteValues('text', { overrides }), {}, entry.key);
  }
});
