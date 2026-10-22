import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminTestDb } from './admin-test-db';
import { prepareUpstreamContent } from '../cli/prepare-upstream-content';

test('upstream preparation is read-only until confirmed, creates drafts, preserves edits and is idempotent', async () => {
  const { client: db, cleanup } = await createAdminTestDb();
  try {
    const actor = await db.adminUser.create({ data: { email: 'upstream@test.example', name: 'Operator', role: 'ADMIN', passwordHash: 'not-a-login-fixture' } });
    const page = await db.page.create({ data: { id: 'grievances', slug: 'grievances', status: 'PUBLISHED', version: 1,
      legacyPaths: [], sourceUrl: '', documentIds: [], reviewNotes: [],
      translations: { create: [{ locale: 'en', title: 'Existing edited title', sections: [{ id: 'custom', blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep my published wording' }] }] }] },
        { locale: 'ta', title: 'தமிழ்', sections: [] }] },
    } });
    const before = await prepareUpstreamContent(db);
    assert.equal(before.createContactDrafts, 14);
    assert.equal(before.appendGrievanceSections.length, 6);
    assert.equal(await db.contactDirectory.count(), 0);
    assert.equal(await db.contact.count(), 0);
    assert.equal((await db.page.findUniqueOrThrow({ where: { id: page.id } })).draft, null);
    await assert.rejects(prepareUpstreamContent(db, { apply: true, actorId: 'unknown' }));
    assert.equal(await db.contactDirectory.count(), 0);
    await prepareUpstreamContent(db, { apply: true, actorId: actor.id });
    assert.equal(await db.contact.count({ where: { status: 'DRAFT' } }), 14);
    assert.equal(await db.contact.count({ where: { status: 'PUBLISHED' } }), 0);
    const changed = await db.page.findUniqueOrThrow({ where: { id: page.id }, include: { translations: true } });
    assert.equal(changed.translations.find(t => t.locale === 'en')?.title, 'Existing edited title');
    assert.equal((changed.translations.find(t => t.locale === 'en')?.sections as unknown[]).length, 1);
    assert.equal((changed.draft as any).en.sections[0].id, 'custom');
    assert.equal((changed.draft as any).en.sections[1].blocks[0].type, 'table');
    assert.equal((changed.draft as any).ta.sections.length, 3);
    const auditCount = await db.auditLog.count();
    const repeated = await prepareUpstreamContent(db, { apply: true, actorId: actor.id });
    assert.equal(repeated.createContactDrafts, 0);
    assert.equal(repeated.appendGrievanceSections.length, 0);
    assert.equal(await db.auditLog.count(), auditCount);
  } finally { await cleanup(); }
});
