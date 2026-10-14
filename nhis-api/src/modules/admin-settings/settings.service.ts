import type { AdminSettings, AdminSettingsResponse, HelplineSetting, PortalSetting } from '@nhis/shared-types';
import type { Prisma } from '@prisma/client';
import {
  adminJson, conflict, getDb, isUniqueViolation, readJsonBody, Validator, writeAudit, type AdminContext, type DbLike, type Tx,
} from '../../common/admin';

/*
 * Storage (SiteSetting rows, see docs/admin-backend-design.md "Settings storage shape"):
 *   key "scheme"     -> { schemeNameEn, schemeNameTa, coverageStatementEn, coverageStatementTa, availability }
 *   key "helplines"  -> HelplineSetting[]  ({ id, labelEn, labelTa, number, telHref })
 *   key "portals"    -> PortalSetting[]    ({ id, label, labelTa, href })
 * Combined version = sum of SiteSetting.version over the three keys (a missing row counts as 0). Only keys whose value
 * actually changed are written and each changed key's version is incremented, so the sum strictly increases on every
 * effective save; a save that changes nothing writes nothing. GET returns that sum as `version`.
 */
export const SETTING_KEYS = ['scheme', 'helplines', 'portals'] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

const EMPTY: AdminSettings = {
  schemeNameEn: '', schemeNameTa: '', coverageStatementEn: '', coverageStatementTa: '', availability: '', helplines: [], portals: [],
};

type SchemeValue = Pick<AdminSettings, 'schemeNameEn' | 'schemeNameTa' | 'coverageStatementEn' | 'coverageStatementTa' | 'availability'>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function asScheme(value: unknown): SchemeValue {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    schemeNameEn: str(o.schemeNameEn), schemeNameTa: str(o.schemeNameTa),
    coverageStatementEn: str(o.coverageStatementEn), coverageStatementTa: str(o.coverageStatementTa), availability: str(o.availability),
  };
}
function asHelplines(value: unknown): HelplineSetting[] {
  if (!Array.isArray(value)) return [];
  return value.map((h) => {
    const o = (typeof h === 'object' && h !== null ? h : {}) as Record<string, unknown>;
    return { id: str(o.id), labelEn: str(o.labelEn), labelTa: str(o.labelTa), number: str(o.number), telHref: str(o.telHref) };
  });
}
function asPortals(value: unknown): PortalSetting[] {
  if (!Array.isArray(value)) return [];
  return value.map((p) => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    return { id: str(o.id), label: str(o.label), labelTa: str(o.labelTa), href: str(o.href) };
  });
}

export function splitSettings(s: AdminSettings): Record<SettingKey, unknown> {
  return {
    scheme: {
      schemeNameEn: s.schemeNameEn, schemeNameTa: s.schemeNameTa, coverageStatementEn: s.coverageStatementEn,
      coverageStatementTa: s.coverageStatementTa, availability: s.availability,
    },
    helplines: s.helplines,
    portals: s.portals,
  };
}

/** JSON with sorted object keys, so equal values compare equal regardless of stored key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

interface Row { key: string; value: Prisma.JsonValue; version: number; updatedAt: Date }

function assemble(rows: Row[]): AdminSettingsResponse {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const version = SETTING_KEYS.reduce((sum, k) => sum + (byKey.get(k)?.version ?? 0), 0);
  const times = SETTING_KEYS.map((k) => byKey.get(k)?.updatedAt.getTime()).filter((t): t is number => t !== undefined);
  return {
    data: { ...EMPTY, ...asScheme(byKey.get('scheme')?.value), helplines: asHelplines(byKey.get('helplines')?.value), portals: asPortals(byKey.get('portals')?.value) },
    version,
    updatedAt: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
  };
}

export async function readSettings(db: DbLike = getDb()): Promise<AdminSettingsResponse> {
  const rows = await db.siteSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  return assemble(rows);
}

export async function getSettingsResponse(): Promise<Response> {
  return adminJson(await readSettings());
}

/* ------------------------------------------------------------------ validation */

const NUMBER_RE = /^\+?[0-9][0-9 -]*$/;
const ID_RE = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;

export function telHrefFor(number: string): string {
  return `tel:${number.replace(/[ -]/g, '')}`;
}

export function validateSettings(input: unknown): AdminSettings {
  const v = new Validator('values');
  const o = v.object(input, '') ?? {};
  v.noUnknownKeys(o, ['schemeNameEn', 'schemeNameTa', 'coverageStatementEn', 'coverageStatementTa', 'availability', 'helplines', 'portals']);
  const schemeNameEn = v.string(o.schemeNameEn, 'schemeNameEn', { max: 200 });
  const schemeNameTa = v.string(o.schemeNameTa, 'schemeNameTa', { max: 300 });
  const coverageStatementEn = v.string(o.coverageStatementEn, 'coverageStatementEn', { max: 500 });
  const coverageStatementTa = v.string(o.coverageStatementTa, 'coverageStatementTa', { max: 800 });
  const availability = v.string(o.availability, 'availability', { max: 100, optional: true }) ?? '';

  const helplines: HelplineSetting[] = [];
  const seenHelpline = new Set<string>();
  (v.array(o.helplines, 'helplines', 20) ?? []).forEach((item, i) => {
    const c = v.child(`helplines[${i}]`);
    const h = c.object(item, '');
    if (!h) return;
    c.noUnknownKeys(h, ['id', 'labelEn', 'labelTa', 'number', 'telHref']);
    const id = c.string(h.id, 'id', { max: 40 });
    if (id !== undefined && !ID_RE.test(id)) c.fail('id', 'Use letters, digits and hyphens only.');
    if (id !== undefined && seenHelpline.has(id)) c.fail('id', 'Helpline ids must be unique.');
    if (id !== undefined) seenHelpline.add(id);
    const labelEn = c.string(h.labelEn, 'labelEn', { max: 300 });
    const labelTa = c.string(h.labelTa, 'labelTa', { max: 500 });
    const number = c.string(h.number, 'number', { max: 30 });
    if (number !== undefined && (!NUMBER_RE.test(number) || (number.match(/[0-9]/g) ?? []).length < 3)) {
      c.fail('number', 'Use digits, spaces, hyphens and an optional leading +.');
    }
    const telHref = c.string(h.telHref, 'telHref', { max: 40 });
    if (telHref !== undefined && number !== undefined && NUMBER_RE.test(number) && telHref !== telHrefFor(number)) {
      c.fail('telHref', `Must be ${telHrefFor(number)} to match the number.`);
    } else if (telHref !== undefined && !/^tel:\+?[0-9]+$/.test(telHref)) {
      c.fail('telHref', 'Must be a tel: link containing digits only.');
    }
    if (id && labelEn !== undefined && labelTa !== undefined && number !== undefined && telHref !== undefined) {
      helplines.push({ id, labelEn, labelTa, number, telHref });
    }
  });

  const portals: PortalSetting[] = [];
  const seenPortal = new Set<string>();
  (v.array(o.portals, 'portals', 20) ?? []).forEach((item, i) => {
    const c = v.child(`portals[${i}]`);
    const p = c.object(item, '');
    if (!p) return;
    c.noUnknownKeys(p, ['id', 'label', 'labelTa', 'href']);
    const id = c.string(p.id, 'id', { max: 40 });
    if (id !== undefined && !ID_RE.test(id)) c.fail('id', 'Use letters, digits and hyphens only.');
    if (id !== undefined && seenPortal.has(id)) c.fail('id', 'Portal ids must be unique.');
    if (id !== undefined) seenPortal.add(id);
    const label = c.string(p.label, 'label', { max: 120 });
    const labelTa = c.string(p.labelTa, 'labelTa', { max: 200 });
    const href = c.url(p.href, 'href', { schemes: ['https:'], max: 500 });
    if (id && label !== undefined && labelTa !== undefined && href !== undefined) portals.push({ id, label, labelTa, href });
  });

  v.throwIfInvalid();
  return {
    schemeNameEn: schemeNameEn as string, schemeNameTa: schemeNameTa as string,
    coverageStatementEn: coverageStatementEn as string, coverageStatementTa: coverageStatementTa as string,
    availability, helplines, portals,
  };
}

/* ------------------------------------------------------------------ save */

export async function saveSettingsRequest(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const bv = new Validator();
  bv.noUnknownKeys(body, ['values', 'expectedVersion']);
  const expectedVersion = bv.int(body.expectedVersion, 'expectedVersion', 0, 2_000_000_000);
  bv.throwIfInvalid();
  const values = validateSettings(body.values);
  const next = splitSettings(values);

  try {
    const result = await getDb().$transaction(async (tx: Tx) => {
      // Lock existing rows so concurrent saves serialise; the version check below then cannot be raced.
      await tx.$queryRaw`SELECT "key" FROM "SiteSetting" WHERE "key" IN ('scheme','helplines','portals') FOR UPDATE`;
      const rows = await tx.siteSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
      const current = assemble(rows);
      if (current.version !== expectedVersion) {
        throw conflict('The settings were changed by someone else. Reload to see the latest version.', current);
      }
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const currentParts = splitSettings(current.data);
      for (const key of SETTING_KEYS) {
        const existing = byKey.get(key);
        // Compare against the normalised stored value, but treat a missing row as "changed" so it gets created.
        if (existing && canonical(currentParts[key]) === canonical(next[key])) continue;
        before[key] = existing ? currentParts[key] : null;
        after[key] = next[key];
        const json = next[key] as Prisma.InputJsonValue;
        if (existing) {
          const res = await tx.siteSetting.updateMany({
            where: { key, version: existing.version },
            data: { value: json, version: existing.version + 1, updatedById: ctx.user.id },
          });
          if (res.count !== 1) throw conflict('The settings were changed by someone else. Reload to see the latest version.');
        } else {
          await tx.siteSetting.create({ data: { key, value: json, version: 1, updatedById: ctx.user.id } });
        }
      }
      const changedKeys = Object.keys(after);
      if (changedKeys.length === 0) return current;
      await writeAudit(tx, ctx, {
        action: 'SETTINGS_UPDATE', entityType: 'SiteSetting', entityId: 'site',
        summary: `Updated site settings (${changedKeys.join(', ')})`,
        detail: { changed: changedKeys, before, after },
      });
      return assemble(await tx.siteSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } }));
    });
    return adminJson(result);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('The settings were changed by someone else. Reload to see the latest version.', await readSettings());
    throw error;
  }
}
