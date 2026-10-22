import {
  SITE_CONTENT_LIMITS, SITE_ICON_NAMES, editableTextEntry,
  type Bilingual, type DocumentCategory, type EditableTextEntry, type HelplineEntry, type HighlightItem, type HomeActionLink, type HomeSectionSetting,
  type LinkItem, type LinkTarget, type NavHeading, type NavLink, type NavMenu, type PartnerCategory, type PartnerEntry, type PathwayGroup,
  type PathwayLink, type QuickTile, type SiteIconName,
} from '@nhis/shared-types';
import { emptyLinkTarget } from '../../utils/siteContentLinks';
import { emptySiteImage, makeSiteId } from './siteForm';

/*
 * Pure helpers of the Navigation, Homepage, Partners and Page text editors (no React, no `import.meta`, so they run in
 * the node tests). The forms in pages/site/* only draw controls; the rules that decide what a list looks like after an
 * edit live here, so that they can be tested.
 */

const emptyBilingual = (): Bilingual => ({ en: '', ta: '' });

/* ------------------------------------------------------------------ partners */

/** The partners of one group, in the order they are shown. */
export function partnersInGroup(partners: readonly PartnerEntry[], categoryId: string): PartnerEntry[] {
  return partners.filter((partner) => partner.categoryId === categoryId);
}

/** Partners whose group does not exist (a group was removed elsewhere, or the content was imported). They are never lost silently. */
export function partnersWithoutGroup(categories: readonly PartnerCategory[], partners: readonly PartnerEntry[]): PartnerEntry[] {
  const known = new Set(categories.map((category) => category.id));
  return partners.filter((partner) => !known.has(partner.categoryId));
}

/**
 * Puts the edited list of one group back into the list of all partners. The partners of the group keep the positions they
 * occupied in the whole list, so other groups are not disturbed: a reordered, shortened or renamed group is written into
 * the same slots, and partners added at the end of the group go after its last partner (or at the end when it had none).
 */
export function applyGroupList(partners: readonly PartnerEntry[], categoryId: string, next: readonly PartnerEntry[]): PartnerEntry[] {
  const out: PartnerEntry[] = [];
  let used = 0;
  let lastSlot = -1;
  for (const partner of partners) {
    if (partner.categoryId !== categoryId) {
      out.push(partner);
    } else if (used < next.length) {
      out.push(next[used] as PartnerEntry);
      used += 1;
      lastSlot = out.length - 1;
    }
  }
  if (used < next.length) out.splice(lastSlot === -1 ? out.length : lastSlot + 1, 0, ...next.slice(used));
  return out;
}

/** Moves a partner to another group: it becomes the last partner of that group. Returns the same list when nothing changes. */
export function regroupPartner(partners: readonly PartnerEntry[], partnerId: string, categoryId: string): PartnerEntry[] {
  const moved = partners.find((partner) => partner.id === partnerId);
  if (!moved || moved.categoryId === categoryId) return partners as PartnerEntry[];
  const rest = partners.filter((partner) => partner.id !== partnerId);
  let after = -1;
  rest.forEach((partner, index) => { if (partner.categoryId === categoryId) after = index; });
  const at = after === -1 ? rest.length : after + 1;
  return [...rest.slice(0, at), { ...moved, categoryId }, ...rest.slice(at)];
}

/** A new, empty partner at the end of a group. The logo and its alt text are required, so the form asks for them. */
export function newPartner(categoryId: string, takenIds: Iterable<string>): PartnerEntry {
  return { id: makeSiteId('partner', takenIds), categoryId, name: emptyBilingual(), logo: emptySiteImage(), url: null, visible: true };
}

export function newPartnerGroup(takenIds: Iterable<string>): PartnerCategory {
  return { id: makeSiteId('group', takenIds), caption: emptyBilingual(), visible: true };
}

/** Why a group cannot be removed yet, or null. A group with partners must be emptied first, or those partners would lose their group. */
export function groupRemovalBlock(partners: readonly PartnerEntry[], categoryId: string): string | null {
  const count = partnersInGroup(partners, categoryId).length;
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'partner is' : 'partners are'} in this group. Move ${count === 1 ? 'it' : 'them'} to another group or remove ${count === 1 ? 'it' : 'them'} first.`;
}

/** Partners that may still be added (the document holds at most SITE_CONTENT_LIMITS.partners). */
export const partnersLeft = (partners: readonly PartnerEntry[]): number => Math.max(0, SITE_CONTENT_LIMITS.partners - partners.length);

/* ------------------------------------------------------------------ navigation */

export type NavEntry = NavLink | NavMenu;
export type NavChild = NavLink | NavHeading;

/** Every id of the menu: entries and the entries of dropdowns share one list of ids, which the validator wants unique. */
export function navigationIds(items: readonly NavEntry[]): string[] {
  return items.flatMap((item) => (item.type === 'menu' ? [item.id, ...item.children.map((child) => child.id)] : [item.id]));
}

const routeTarget = (): LinkTarget => emptyLinkTarget('route');

export function newNavLink(takenIds: Iterable<string>): NavLink {
  return { type: 'link', id: makeSiteId('link', takenIds), label: emptyBilingual(), target: routeTarget(), visible: true };
}

export function newNavHeading(takenIds: Iterable<string>): NavHeading {
  return { type: 'heading', id: makeSiteId('heading', takenIds), label: emptyBilingual(), visible: true };
}

/** A dropdown starts with one empty link: the validator wants at least one link in every dropdown. */
export function newNavMenu(takenIds: Iterable<string>): NavMenu {
  const taken = new Set(takenIds);
  const id = makeSiteId('menu', taken);
  taken.add(id);
  return { type: 'menu', id, label: emptyBilingual(), visible: true, children: [newNavLink(taken)] };
}

/** True for a link to the Gallery page (with or without an anchor). The website hides it while the Gallery is empty. */
export function isGalleryLink(target: LinkTarget): boolean {
  return target.type === 'route' && (target.path === '/gallery' || target.path.startsWith('/gallery#'));
}

/**
 * What the website will not show, as plain sentences keyed by the path of the entry (`items.2`, `items.2.children.0`).
 * These are warnings, not errors: the content is valid and can be saved. They repeat the rules of the Client's menu
 * (nhis-client/src/utils/siteLinks.ts resolveNavigation): a dropdown with no visible link and a heading with no visible
 * link below it (before the next heading) are left out.
 */
export function navigationWarnings(items: readonly NavEntry[]): Record<string, string> {
  const warnings: Record<string, string> = {};
  items.forEach((item, index) => {
    const path = `items.${index}`;
    if (item.type === 'link') {
      if (isGalleryLink(item.target)) warnings[path] = 'The website hides this link while the Gallery has no published picture.';
      return;
    }
    const visibleLinks = item.children.filter((child) => child.type === 'link' && child.visible);
    if (item.visible && visibleLinks.length === 0) warnings[path] = 'This dropdown has no visible link, so the website does not show it.';
    item.children.forEach((child, childIndex) => {
      const childPath = `${path}.children.${childIndex}`;
      if (child.type === 'link') {
        if (isGalleryLink(child.target)) warnings[childPath] = 'The website hides this link while the Gallery has no published picture.';
        return;
      }
      if (!child.visible) return;
      let hasLink = false;
      for (let next = childIndex + 1; next < item.children.length; next++) {
        const entry = item.children[next] as NavChild;
        if (entry.type === 'heading') break;
        if (entry.visible) { hasLink = true; break; }
      }
      if (!hasLink) warnings[childPath] = 'No visible link follows this heading, so the website does not show it.';
    });
  });
  return warnings;
}

/** Number of top-level entries a visitor can see (visible entries; a dropdown counts when it has a visible link). */
export function visibleNavigationCount(items: readonly NavEntry[]): number {
  return items.filter((item) => item.visible && (item.type === 'link' || item.children.some((child) => child.type === 'link' && child.visible))).length;
}

/* ------------------------------------------------------------------ homepage */

/**
 * Why the visibility switch of a homepage section is locked, or null. The hero is always shown and always first. A hero
 * that is hidden (content from before the rule) can still be switched on, and one that is not first can still be moved up.
 */
export function sectionVisibilityLock(section: HomeSectionSetting): string | null {
  return section.id === 'hero' && section.visible ? 'The hero section is always shown and always comes first.' : null;
}

/** The hero section stays where it is while it is first: nothing moves it and nothing moves above it. */
export const isLockedSection = (section: HomeSectionSetting, index: number): boolean => index === 0 && section.id === 'hero';

export function setSectionVisible(section: HomeSectionSetting, visible: boolean): HomeSectionSetting {
  return section.id === 'hero' ? { ...section, visible: true } : { ...section, visible };
}

/* ---- new rows of the homepage lists: empty on purpose (the validator asks for the text) but valid in shape */

export function newQuickTile(takenIds: Iterable<string>): QuickTile {
  return { id: makeSiteId('tile', takenIds), icon: 'file', label: emptyBilingual(), hint: emptyBilingual(), target: emptyLinkTarget('route'), visible: true };
}

export function newLink(takenIds: Iterable<string>): LinkItem {
  return { id: makeSiteId('link', takenIds), label: emptyBilingual(), target: emptyLinkTarget('route'), visible: true };
}

export function newHomeAction(takenIds: Iterable<string>): HomeActionLink {
  return { ...newLink(takenIds), variant: 'secondary' };
}

export function newPathwayLink(takenIds: Iterable<string>): PathwayLink {
  return { ...newLink(takenIds), icon: 'file' };
}

export function newPathwayGroup(takenIds: Iterable<string>): PathwayGroup {
  return { id: makeSiteId('pathway', takenIds), heading: emptyBilingual(), links: [], helplineId: null, visible: true };
}

export function newHighlight(takenIds: Iterable<string>): HighlightItem {
  return { id: makeSiteId('highlight', takenIds), value: emptyBilingual(), label: emptyBilingual(), note: emptyBilingual(), visible: true };
}

/** Choices for the helpline shown under a pathway: "None" is the empty value; an id that no longer exists stays selectable so the form tells the truth. */
export function helplineChoices(helplines: readonly HelplineEntry[], current: string | null): Array<{ value: string; label: string }> {
  const choices = helplines.map((helpline) => ({ value: helpline.id, label: `${helpline.label.en || helpline.id} (${helpline.number || 'no number'})${helpline.visible ? '' : ', hidden'}` }));
  if (current && !helplines.some((helpline) => helpline.id === current)) choices.unshift({ value: current, label: `Unknown helpline (${current})` });
  return choices;
}

/** Document categories a homepage list can show, in the order of the Documents module. */
export const HOME_DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'govt-order-employee', 'govt-order-pensioner', 'policy-non-payable', 'enrolment-guide', 'enrolment-form', 'hospital-suspension',
];

/** Adds or removes a category and keeps the canonical order (the website sorts by category anyway). */
export function toggleCategory(selected: readonly DocumentCategory[], category: DocumentCategory, on: boolean): DocumentCategory[] {
  const next = new Set(selected);
  if (on) next.add(category); else next.delete(category);
  return HOME_DOCUMENT_CATEGORIES.filter((entry) => next.has(entry));
}

/** The first value of `all` that is not in `used`, or undefined when all are used (a new row then has nothing to start with). */
export function firstUnused<T>(all: readonly T[], used: readonly T[]): T | undefined {
  return all.find((value) => !used.includes(value));
}

/** Names of the icons with a readable label ("hospital" -> "Hospital"). */
export const ICON_CHOICES: ReadonlyArray<{ value: SiteIconName; label: string }> = SITE_ICON_NAMES.map((name) => ({
  value: name,
  label: name === 'scale' ? 'Scales (orders)' : name === 'login' ? 'Sign in' : name === 'pin' ? 'Location pin' : `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
}));

/* ------------------------------------------------------------------ page text */

/** Names of the `{placeholders}` of a text, once each, in order of appearance. The website fills them in and they must stay. */
export function placeholdersOf(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\{([A-Za-z0-9_]+)\}/g), (match) => match[1] as string)));
}

const NO_OVERRIDE: Bilingual = Object.freeze({ en: '', ta: '' });

/** The override of one text, or an empty pair when the built-in wording is used. */
export function overrideOf(overrides: Readonly<Record<string, Bilingual>>, key: string): Bilingual {
  return Object.prototype.hasOwnProperty.call(overrides, key) ? (overrides[key] as Bilingual) : NO_OVERRIDE;
}

/** True when the pair holds nothing the website would use (both languages empty or blank). */
export const isEmptyOverride = (value: Bilingual): boolean => value.en.trim() === '' && value.ta.trim() === '';

/**
 * Sets the override of one text. A pair that is empty in both languages removes the entry (the validator drops them too,
 * so the form never holds a value that differs from what is saved). Other texts are untouched; the input is not modified.
 */
export function setOverride(overrides: Readonly<Record<string, Bilingual>>, key: string, value: Bilingual): Record<string, Bilingual> {
  const next: Record<string, Bilingual> = {};
  for (const [name, entry] of Object.entries(overrides)) if (name !== key) next[name] = entry;
  if (!isEmptyOverride(value)) next[key] = value;
  return next;
}

/** Number of texts that are overridden. */
export const countOverrides = (overrides: Readonly<Record<string, Bilingual>>): number => Object.values(overrides).filter((value) => !isEmptyOverride(value)).length;

/** Keys that are no longer in the catalog (for example from an older release): the server rejects them on save. */
export const unknownOverrideKeys = (overrides: Readonly<Record<string, Bilingual>>): string[] => Object.keys(overrides).filter((key) => !editableTextEntry(key));

/** Removes the overrides of the given keys. */
export function withoutOverrides(overrides: Readonly<Record<string, Bilingual>>, keys: readonly string[]): Record<string, Bilingual> {
  const next: Record<string, Bilingual> = {};
  for (const [name, entry] of Object.entries(overrides)) if (!keys.includes(name)) next[name] = entry;
  return next;
}

export interface TextGroup { group: string; entries: EditableTextEntry[] }

/** The catalog grouped by page, in catalog order, keeping only the entries that match the filter (page, label, key or built-in wording). */
export function groupTextCatalog(catalog: readonly EditableTextEntry[], filter = ''): TextGroup[] {
  const query = filter.trim().toLowerCase();
  const groups = new Map<string, TextGroup>();
  for (const entry of catalog) {
    if (query !== '') {
      const haystack = `${entry.group} ${entry.label} ${entry.key} ${entry.defaults.en} ${entry.defaults.ta}`.toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    const existing = groups.get(entry.group);
    if (existing) existing.entries.push(entry);
    else groups.set(entry.group, { group: entry.group, entries: [entry] });
  }
  return Array.from(groups.values());
}
