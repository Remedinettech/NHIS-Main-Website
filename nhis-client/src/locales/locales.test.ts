import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_MESSAGE_KEYS, listMissingTamilKeys, listProposedTamilKeys, resolveMessage } from './index';
import { taSource } from './ta.source';
import { taProposed } from './ta.proposed';

test('Tamil resources only use keys that exist in the English resources', () => {
  const known = new Set<string>(ALL_MESSAGE_KEYS);
  for (const key of [...Object.keys(taSource), ...Object.keys(taProposed)]) assert.ok(known.has(key), `unknown key ${key}`);
});

test('a key is either source Tamil or a proposed draft, never both', () => {
  for (const key of Object.keys(taSource)) assert.ok(!(key in taProposed), `${key} in both files`);
});

test('every message has Tamil (source or proposed); anything else is reported as missing', () => {
  assert.deepEqual(listMissingTamilKeys(), []);
  assert.ok(listProposedTamilKeys().length > 100);
});

test('Tamil falls back to English explicitly and interpolates parameters', () => {
  const t = resolveMessage('ta', 'nav.home');
  assert.equal(t.origin, 'source');
  assert.equal(resolveMessage('en', 'common.pageOf', { page: 2, total: 9 }).text, 'Page 2 of 9');
  assert.equal(resolveMessage('ta', 'common.pageOf', { page: 2, total: 9 }).origin, 'proposed');
});

test('placeholders in Tamil messages match the English placeholders', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const key of ALL_MESSAGE_KEYS) {
    const en = resolveMessage('en', key).text;
    const ta = resolveMessage('ta', key).text;
    assert.equal(placeholders(ta), placeholders(en), `placeholder mismatch in ${key}`);
  }
});
