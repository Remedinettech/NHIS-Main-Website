import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Validator } from '../common/admin';
import { collectDocumentIds, parseBlock } from '../modules/admin-content/content-validation';

test('page tables preserve bilingual text and validated phone/email/document links', () => {
  const v = new Validator();
  const block = parseBlock(v, { type: 'table', headers: ['பெயர்', 'Contact'], rows: [[
    [{ type: 'text', text: 'தமிழ் அலுவலர்' }],
    [{ type: 'phone', number: '9789055837', text: '9789055837' }, { type: 'mail', address: 'office@example.org' }, { type: 'document', documentId: 'guide', text: 'Manual' }],
  ]] }, 'table');
  v.throwIfInvalid();
  assert.equal(block?.type, 'table');
  assert.deepEqual(collectDocumentIds([block!]), ['guide']);
});

test('table validation rejects ragged rows, oversized tables and unsafe inline links', () => {
  for (const input of [
    { headers: ['Name'], rows: [[[], []]] },
    { headers: [], rows: [] },
    { headers: Array(9).fill('Name'), rows: [] },
    { headers: ['Name'], rows: Array(51).fill([[]]) },
    { headers: ['Name'], rows: [[[{ type: 'link', href: 'javascript:alert(1)', text: 'click' }]]] },
  ]) {
    const v = new Validator();
    parseBlock(v, { type: 'table', ...input }, 'table');
    assert.equal(v.ok, false, JSON.stringify(input).slice(0, 100));
  }
});
