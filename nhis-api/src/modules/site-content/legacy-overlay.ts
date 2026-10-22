import {
  isSafeHttpsUrl, validateSiteContent,
  type Bilingual, type HelplineSetting, type LinkTarget, type NavigationContent, type PortalSetting, type SiteContentKey,
  type SiteContentMap,
} from '@nhis/shared-types';
import { SETTING_KEYS, type SchemeSettingValue } from '../site/site-settings';

/*
 * Legacy settings overlay (docs/site-content-management.md, section 4).
 *
 * Before the site content became editable, the Admin "Settings" page stored the scheme name, coverage statement,
 * availability, helplines and portal links in SiteSetting rows. Those rows stay untouched; for a document that has no
 * row of its own they are laid over the built-in content, so that what was edited there is not lost and nothing
 * visible changes when the feature is switched on. Stored documents are never overlaid.
 *
 * Two rules keep the result identical to today's site while nobody has edited anything:
 *  - the seeded values equal the built-in ones and are applied as they are;
 *  - values that only exist in the SiteSetting seed but were never shown by the Client (the portal LABELS, and a scheme
 *    name that is spelled differently in the header than in the settings) count as edits only when they differ from the
 *    seed.
 * Every change is checked with the shared validator; a value of the old settings that does not satisfy the current
 * limits is skipped (and logged once) instead of making the document invalid.
 */

export interface LegacySettings {
  scheme: SchemeSettingValue | null;
  helplines: HelplineSetting[] | null;
  portals: PortalSetting[] | null;
}

export const NO_LEGACY_SETTINGS: LegacySettings = { scheme: null, helplines: null, portals: null };

/** Labels of the seeded `portals` row (prisma/import/import.ts PORTAL_SEED). The Client never showed them. */
const SEEDED_PORTAL_LABELS: Readonly<Record<string, Bilingual>> = {
  employee: { en: 'Employees', ta: 'பணியாளர்கள்' },
  pensioner: { en: 'Pensioners', ta: 'ஓய்வூதியம் பெறுவோர்' },
  administrator: { en: 'Administrator', ta: 'நிர்வாகி' },
  insurer: { en: 'Insurer', ta: 'காப்பீட்டாளர்' },
  trackClaim: { en: 'Track Claim', ta: 'உரிமைகோரலைக் கண்காணிக்கவும்' },
  forgotPassword: { en: 'Forgot Password?', ta: 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?' },
};

/* ------------------------------------------------------------------ reading the rows */

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Builds LegacySettings from SiteSetting rows. A malformed row is treated as absent. */
export function parseLegacySettings(rows: ReadonlyArray<{ key: string; value: unknown }>): LegacySettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const rawScheme = byKey.get(SETTING_KEYS.scheme);
  const rawHelplines = byKey.get(SETTING_KEYS.helplines);
  const rawPortals = byKey.get(SETTING_KEYS.portals);

  const scheme: SchemeSettingValue | null = isObject(rawScheme)
    ? {
      schemeNameEn: str(rawScheme.schemeNameEn), schemeNameTa: str(rawScheme.schemeNameTa),
      coverageStatementEn: str(rawScheme.coverageStatementEn), coverageStatementTa: str(rawScheme.coverageStatementTa),
      availability: str(rawScheme.availability),
    }
    : null;

  const helplines: HelplineSetting[] | null = Array.isArray(rawHelplines)
    ? rawHelplines.filter(isObject).map((h) => ({
      id: str(h.id), labelEn: str(h.labelEn), labelTa: str(h.labelTa), number: str(h.number), telHref: str(h.telHref),
    })).filter((h) => h.id !== '' && h.labelEn.trim() !== '' && h.number.trim() !== '')
    : null;

  const portals: PortalSetting[] | null = Array.isArray(rawPortals)
    ? rawPortals.filter(isObject).map((p) => ({ id: str(p.id), label: str(p.label), labelTa: str(p.labelTa), href: str(p.href) }))
      .filter((p) => p.id !== '' && p.href !== '')
    : null;

  return { scheme, helplines, portals };
}

/* ------------------------------------------------------------------ overlay steps */

interface OverlayStep {
  name: string;
  /** Documents the step changes (the ones that are validated afterwards). */
  keys: readonly SiteContentKey[];
  apply(content: SiteContentMap): void;
}

/** Anything with a label and a destination: links, quick tiles. */
interface Linked { label: Bilingual; target: LinkTarget }

const clean = (text: string): string => text.normalize('NFC').trim();
const bilingualOf = (en: string, ta: string): Bilingual => ({ en: clean(en), ta: clean(ta) });
const sameBilingual = (a: Bilingual, b: Bilingual): boolean => a.en === b.en && a.ta === b.ta;

function findNavLink(navigation: NavigationContent, id: string): Linked | undefined {
  for (const item of navigation.items) {
    if (item.type === 'link') {
      if (item.id === id) return item;
    } else {
      const child = item.children.find((entry) => entry.type === 'link' && entry.id === id);
      if (child) return child as Linked;
    }
  }
  return undefined;
}

/**
 * The places of the built-in content that stand for one NHIS portal (the link ids of DEFAULT_SITE_CONTENT).
 * `label` marks the links that display the portal's own name; the pathway links ("Employee portal") have a wording of
 * their own and only take the destination.
 */
function portalSlots(content: SiteContentMap, portalId: string): Array<{ link: Linked | undefined; label: boolean }> {
  const login = (id: string) => content.header.loginMenu.items.find((item) => item.id === id);
  const footer = (id: string) => content.footer.linkGroups.find((group) => group.id === 'portals')?.links.find((item) => item.id === id);
  const pathway = (id: string) => content.home.pathways.groups.flatMap((group) => group.links).find((item) => item.id === id);
  const tile = (id: string) => content.home.quickAccess.tiles.find((item) => item.id === id);
  switch (portalId) {
    case 'employee':
      return [{ link: login('employee'), label: true }, { link: footer('employee'), label: true }, { link: pathway('employee-login'), label: false }];
    case 'pensioner':
      return [{ link: login('pensioner'), label: true }, { link: footer('pensioner'), label: true }, { link: pathway('pensioner-login'), label: false }];
    case 'administrator':
      return [{ link: login('administrator'), label: true }, { link: footer('administrator'), label: true }];
    case 'insurer':
      return [{ link: login('insurer'), label: true }];
    case 'forgotPassword':
      return [{ link: content.header.loginMenu.forgotPassword, label: true }];
    case 'trackClaim':
      return [
        { link: findNavLink(content.navigation, 'track-claim'), label: true },
        { link: tile('track'), label: true },
        { link: footer('trackClaim'), label: true },
      ];
    // hospitalMediAssist and hospitalMdIndia exist in the settings but are not part of the built-in menus.
    default:
      return [];
  }
}

const ALL_LINK_DOCUMENTS: readonly SiteContentKey[] = ['header', 'navigation', 'home', 'footer'];

function overlaySteps(legacy: LegacySettings, content: SiteContentMap): OverlayStep[] {
  const steps: OverlayStep[] = [];
  const { scheme, helplines, portals } = legacy;

  if (scheme) {
    const name = bilingualOf(scheme.schemeNameEn, scheme.schemeNameTa);
    if (name.en !== '' && !sameBilingual(name, content.home.hero.title)) {
      steps.push({
        name: 'scheme name',
        keys: ['header', 'home'],
        apply: (draft) => {
          draft.header.subtitle = { ...name };
          draft.home.hero.title = { ...name };
        },
      });
    }
    const coverage = bilingualOf(scheme.coverageStatementEn, scheme.coverageStatementTa);
    if (coverage.en !== '') {
      steps.push({ name: 'coverage statement', keys: ['home'], apply: (draft) => { draft.home.hero.coverageStatement = { ...coverage }; } });
    }
    steps.push({ name: 'availability', keys: ['header'], apply: (draft) => { draft.header.availability = clean(scheme.availability); } });
  }

  if (helplines) {
    steps.push({
      name: 'helplines',
      keys: ['header', 'home'],
      apply: (draft) => {
        draft.header.helplines = helplines.map((h) => ({ id: h.id, label: bilingualOf(h.labelEn, h.labelTa), number: clean(h.number), visible: true }));
        // The pathways point at helplines by id; a helpline that no longer exists is simply not shown.
        const ids = new Set(draft.header.helplines.map((h) => h.id));
        for (const group of draft.home.pathways.groups) if (group.helplineId !== null && !ids.has(group.helplineId)) group.helplineId = null;
      },
    });
  }

  for (const portal of portals ?? []) {
    const href = portal.href.trim();
    if (!isSafeHttpsUrl(href)) continue;
    const seeded = SEEDED_PORTAL_LABELS[portal.id];
    const label = bilingualOf(portal.label, portal.labelTa);
    const labelEdited = label.en !== '' && !(seeded && sameBilingual(label, seeded));
    steps.push({
      name: `portal ${portal.id}`,
      keys: ALL_LINK_DOCUMENTS,
      apply: (draft) => {
        for (const slot of portalSlots(draft, portal.id)) {
          if (!slot.link) continue;
          slot.link.target = { type: 'external', url: new URL(href).href };
          if (slot.label && labelEdited) slot.link.label = { ...label };
        }
      },
    });
  }
  return steps;
}

const reported = new Set<string>();
function reportSkipped(step: OverlayStep): void {
  if (reported.has(step.name)) return;
  reported.add(step.name);
  console.warn(`The legacy site setting "${step.name}" does not satisfy the current content rules and is not used as the initial value.`);
}

const allValid = (content: SiteContentMap, keys: readonly SiteContentKey[]): boolean =>
  keys.every((key) => validateSiteContent(key, content[key]).ok);

/**
 * `content` (normally the built-in content) with the legacy settings laid over it. Returns a new object; the input is
 * not modified. Absent settings change nothing.
 */
export function applyLegacySettings(content: SiteContentMap, legacy: LegacySettings): SiteContentMap {
  const steps = overlaySteps(legacy, content);
  const result = structuredClone(content);
  if (steps.length === 0) return result;

  for (const step of steps) step.apply(result);
  const keys = Array.from(new Set(steps.flatMap((step) => step.keys)));
  if (allValid(result, keys)) return result;

  // Some old value does not fit today's limits: use the steps that do.
  let current = structuredClone(content);
  for (const step of steps) {
    const candidate = structuredClone(current);
    step.apply(candidate);
    if (allValid(candidate, step.keys)) current = candidate;
    else reportSkipped(step);
  }
  return current;
}
