import type { AdminAnnouncementValues, InlineNode } from '@nhis/shared-types';
import type { Announcement, Prisma } from '@prisma/client';
import { invalid, queryEnum } from '../../common/admin';
import { collectDocumentIds, parseInlineNodes } from './content-validation';
import type { EntityAdapter } from './engine';
import { listFilters, randomId, searchWords, type ModuleDefinition } from './shared';

const KINDS = ['suspension', 'login-support', 'general'] as const;
const SEVERITIES = ['notice', 'warning'] as const;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const columnData = (v: AdminAnnouncementValues) => ({
  kind: v.kind,
  severity: v.severity,
  messageEn: v.messageEn as unknown as Prisma.InputJsonValue,
  messageTa: v.messageTa as unknown as Prisma.InputJsonValue,
  startsAt: v.startsAt ? new Date(v.startsAt) : null,
  endsAt: v.endsAt ? new Date(v.endsAt) : null,
  sortOrder: v.sortOrder,
});

const plain = (nodes: InlineNode[]) => nodes.map((n) => ('text' in n ? n.text : n.type === 'mail' ? n.address : '')).join('').trim();

export const announcementAdapter: EntityAdapter<AdminAnnouncementValues, Announcement> = {
  entityType: 'announcement',
  label: (v) => plain(v.messageEn).slice(0, 80) || plain(v.messageTa).slice(0, 80) || 'Announcement',
  find: (tx, id) => tx.announcement.findUnique({ where: { id } }),
  live: (r) => ({
    kind: r.kind as AdminAnnouncementValues['kind'],
    severity: r.severity as AdminAnnouncementValues['severity'],
    messageEn: r.messageEn as unknown as InlineNode[],
    messageTa: r.messageTa as unknown as InlineNode[],
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    sortOrder: r.sortOrder,
  }),
  draftValues: (r) => (r.draft as AdminAnnouncementValues | null) ?? null,
  columnData,
  async verify(tx, values) {
    const ids = collectDocumentIds([...values.messageEn, ...values.messageTa]);
    if (ids.length === 0) return;
    const found = await tx.document.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const missing = ids.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) throw invalid('A linked document does not exist.', [{ field: 'messageEn', message: `Unknown document: ${missing.join(', ')}` }]);
  },
  update: async (tx, id, version, data) => (await tx.announcement.updateMany({ where: { id, version }, data: data as Prisma.AnnouncementUpdateManyMutationInput })).count,
  create: (tx, { id, values, userId }) =>
    tx.announcement.create({ data: { id, ...columnData(values), status: 'DRAFT', version: 1, createdById: userId, updatedById: userId } }),
  newId: () => `ann_${randomId()}`,
  remove: async (tx, row) => { await tx.announcement.delete({ where: { id: row.id } }); },
};

export const announcementModule: ModuleDefinition<AdminAnnouncementValues, Announcement> = {
  async parseValues(v, input) {
    const obj = v.object(input, 'values');
    const empty: AdminAnnouncementValues = { kind: 'general', severity: 'notice', messageEn: [], messageTa: [], startsAt: null, endsAt: null, sortOrder: 0 };
    if (!obj) return empty;
    v.noUnknownKeys(obj, ['kind', 'severity', 'messageEn', 'messageTa', 'startsAt', 'endsAt', 'sortOrder']);
    const date = (value: unknown, field: string): string | null => {
      const text = v.string(value, field, { max: 40, optional: true });
      if (text === undefined) return null;
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        v.fail(field, 'Enter a valid date and time.');
        return null;
      }
      return parsed.toISOString();
    };
    const startsAt = date(obj.startsAt, 'startsAt');
    const endsAt = date(obj.endsAt, 'endsAt');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) v.fail('endsAt', 'The end must be after the start.');
    const values: AdminAnnouncementValues = {
      kind: v.enumValue(obj.kind, 'kind', KINDS) ?? 'general',
      severity: v.enumValue(obj.severity, 'severity', SEVERITIES) ?? 'notice',
      messageEn: parseInlineNodes(v, obj.messageEn, 'messageEn', { min: 1 }) ?? [],
      messageTa: parseInlineNodes(v, obj.messageTa ?? [], 'messageTa') ?? [],
      startsAt,
      endsAt,
      sortOrder: v.int(obj.sortOrder, 'sortOrder', 0, 100_000, true) ?? 0,
    };
    v.throwIfInvalid();
    return values;
  },

  async list(db, params, paging) {
    const { q, status } = listFilters(params);
    const kind = queryEnum(params, 'kind', KINDS);
    const words = searchWords(q);
    const where: Prisma.AnnouncementWhereInput = { ...(status ? { status } : {}), ...(kind ? { kind } : {}) };
    // Announcements are few; the text search over their JSON messages runs in memory, then the page is cut.
    const all = await db.announcement.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: 1000 });
    const matching = words.length
      ? all.filter((r) => words.every((w) => `${JSON.stringify(r.messageEn)} ${JSON.stringify(r.messageTa)} ${r.id}`.toLocaleLowerCase().includes(w)))
      : all;
    return { rows: matching.slice(paging.skip, paging.skip + paging.pageSize), total: matching.length };
  },
};
