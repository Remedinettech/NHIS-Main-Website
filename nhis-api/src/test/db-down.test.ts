/** When the database cannot be reached the public API reports a clear error; it never falls back to bundled JSON. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

test('public endpoints answer 5xx with the standard error body when PostgreSQL is unreachable', async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = new PrismaClient({ datasourceUrl: 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=1' });
  const hospitals = await import('../app/api/v1/hospitals/route');
  const site = await import('../app/api/v1/site/route');
  const health = await import('../app/api/v1/health/route');
  for (const [name, call] of [
    ['hospitals', () => hospitals.GET(new Request('http://localhost/api/v1/hospitals'))],
    ['site', () => site.GET(new Request('http://localhost/api/v1/site'))],
  ] as const) {
    const res = await call();
    assert.ok(res.status >= 500, `${name} returned ${res.status}`);
    const text = await res.text();
    assert.ok(text.includes('"error"'), name);
    assert.ok(!text.includes('Tamil Nadu New Health'), 'no JSON fallback content');
    assert.ok(!text.includes('postgresql://'), 'no connection string leaked');
  }
  const h = await (await health.GET()).json();
  assert.equal(h.databaseConnected, false);
});
