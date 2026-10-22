import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAV_ITEMS } from './navigation';

test('sidebar labels distinguish page bodies, website layout, contacts and history', () => {
  const labels = Object.fromEntries(NAV_ITEMS.map((item) => [item.to, item.label]));
  assert.equal(labels['/pages'], 'Website pages');
  assert.equal(labels['/site'], 'Website content');
  assert.equal(labels['/contacts'], 'Contact directories');
  assert.equal(labels['/activity'], 'Change history');
  assert.equal(labels['/users'], 'Staff accounts');
  assert.equal(labels['/imports'], 'Import Excel');
  assert.equal(new Set(NAV_ITEMS.map((item) => item.to)).size, NAV_ITEMS.length);
  assert.equal(NAV_ITEMS.find((item) => item.to === '/users')?.requires, 'users.manage');
});
