/** Read-only by default. Adds the f0b98e7 content as drafts only after explicit operator confirmation. */
import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AdminPageValues } from '@nhis/shared-types';
import { Prisma, PrismaClient } from '@prisma/client';
import { Validator, writeAudit } from '../common/admin';
import { contactAdapter, contactModule } from '../modules/admin-content/contacts.admin';
import { pageAdapter, pageModule } from '../modules/admin-content/pages.admin';
import { createRecord, saveRecord } from '../modules/admin-content/engine';

const read = (name: string) => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

export async function prepareUpstreamContent(db: PrismaClient, options: { apply?: boolean; actorId?: string } = {}) {
  const source = read('contacts').find((d: { id: string }) => d.id === 'project-office-officials');
  const pageSource = read('pages').find((p: { slug: string }) => p.slug === 'grievances');
  const sectionIds = new Set(['nodal-2026', 'escalation-1', 'escalation-2']);
  return db.$transaction(async (tx) => {
    const directory = await tx.contactDirectory.findUnique({ where: { id: source.id } });
    const existing = await tx.contact.findMany({ where: { directoryId: source.id }, select: { id: true } });
    const existingIds = new Set(existing.map((row) => row.id));
    const newRows = source.rows.filter((row: { sourceRow: number }) => !existingIds.has(`${source.id}-row-${row.sourceRow}`));
    const page = await pageAdapter.find(tx, 'grievances');
    if (!page) throw new Error('The existing grievances page is missing. No source import or reseed will be attempted.');
    const values = structuredClone(pageAdapter.draftValues(page) ?? pageAdapter.live(page));
    const added: string[] = [];
    for (const locale of ['en', 'ta'] as const) {
      const content = values[locale];
      if (!content) continue; // Preserve an intentionally absent translation.
      for (const section of pageSource[locale]?.sections ?? []) {
        if (sectionIds.has(section.id) && !content.sections.some((s) => s.id === section.id)) {
          content.sections.push(section);
          added.push(`${locale}:${section.id}`);
        }
      }
    }
    const plan = { createDirectory: !directory, createContactDrafts: newRows.length, preserveExistingContacts: existing.length,
      appendGrievanceSections: added, existingPageDraftPreserved: page.draft !== null, publishes: 0, deletes: 0 };
    if (!options.apply) return plan;
    const actor = options.actorId ? await tx.adminUser.findUnique({ where: { id: options.actorId } }) : null;
    if (!actor || actor.role !== 'ADMIN' || !actor.active) throw new Error('An active ADMIN actor ID is required.');
    const ctx = { user: { id: actor.id, email: actor.email, name: actor.name, role: actor.role }, ip: null };
    if (!directory) {
      const order = await tx.contactDirectory.aggregate({ _max: { sortOrder: true } });
      await tx.contactDirectory.create({ data: { id: source.id, labelEn: source.label.en, labelTa: source.label.ta,
        columns: source.columns, flags: source.flags, sourceFile: source.sourceFile, sortOrder: (order._max.sortOrder ?? 0) + 1 } });
      await writeAudit(tx, ctx, { action: 'CREATE', entityType: 'contact-directory', entityId: source.id,
        summary: 'Enabled the project-office directory from upstream f0b98e7' });
    }
    for (const [index, row] of newRows.entries()) {
      const id = `${source.id}-row-${row.sourceRow}`;
      if (await tx.contact.findUnique({ where: { id } })) throw new Error('A contact identifier belongs to another directory; stopped.');
      const parsed = await contactModule.parseValues(new Validator(), { cells: row.cells, sortOrder: existing.length + index }, { db: tx, scope: source.id });
      await createRecord(contactAdapter, ctx, parsed, { id, scope: source.id, transaction: tx });
    }
    if (added.length) {
      const parsed = await pageModule.parseValues(new Validator(), values as AdminPageValues, { db: tx, id: page.id });
      await saveRecord(pageAdapter, ctx, page.id, parsed, page.version, tx);
    }
    return plan;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const argument = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  const apply = process.argv.includes('--apply');
  const configured = new URL(process.env.DATABASE_URL ?? '');
  if (apply && (!process.argv.includes('--confirm-database') || argument('--confirm-database') !== decodeURIComponent(configured.pathname.slice(1)))) {
    throw new Error('Review the default read-only plan, back up the database, then specify --apply --confirm-database DATABASE_NAME --actor-id ADMIN_ID.');
  }
  const db = new PrismaClient();
  prepareUpstreamContent(db, { apply, actorId: process.argv.includes('--actor-id') ? argument('--actor-id') : undefined })
    .then((plan) => console.log(JSON.stringify({ mode: apply ? 'drafts-created' : 'read-only-plan', ...plan }, null, 2)))
    .catch(() => { console.error('Preparation failed; the transaction was rolled back. Check the target, actor ID and existing content.'); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
