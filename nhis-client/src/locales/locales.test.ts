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

test('the footer description names the service partners in the order of the partner logos', () => {
  const english = resolveMessage('en', 'footer.aboutText').text;
  assert.equal(
    english,
    'Health insurance cover for government employees, pensioners and their eligible family members, implemented through United India Insurance with Vidal Health, Medi Assist and Health Insurance TPA of India (HITPA) as service partners.',
  );
  const tamil = resolveMessage('ta', 'footer.aboutText').text;
  const order = ['விடல் ஹெல்த்', 'மெடி அசிஸ்ட்', 'ஹெல்த் இன்சூரன்ஸ் டிபிஏ ஆஃப் இந்தியா (HITPA)'].map((name) => tamil.indexOf(name));
  assert.ok(order.every((index) => index > 0), 'all three partners are named in Tamil');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Vidal Health, Medi Assist, HITPA');
  assert.ok(!/MDIndia|MD India|எம்டி/.test(`${english} ${tamil}`));
});

test('placeholders in Tamil messages match the English placeholders', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const key of ALL_MESSAGE_KEYS) {
    const en = resolveMessage('en', key).text;
    const ta = resolveMessage('ta', key).text;
    assert.equal(placeholders(ta), placeholders(en), `placeholder mismatch in ${key}`);
  }
});

test('the project office directory tab is named UIIC Project Office Officials', () => {
  assert.equal(resolveMessage('en', 'contacts.directories.project-office-officials').text, 'UIIC Project Office Officials');
  assert.equal(resolveMessage('ta', 'contacts.directories.project-office-officials').text, 'UIIC திட்ட அலுவலக அலுவலர்கள்');
  assert.ok(resolveMessage('en', 'contacts.intro').text.includes('UIIC project office officials'));
});
