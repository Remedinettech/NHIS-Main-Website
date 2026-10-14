import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailAddress, mailtoHref, safeMapUrl, telHref } from './safeUrl';
import { matchesAllWords, normalizeForSearch } from './text';
import { pageItems } from './pagination';
import { parseLocale } from './locale';
import { formatBytes } from './format';

test('search matching normalises whitespace, case and Tamil text', () => {
  assert.equal(normalizeForSearch('  ARUN   MEDICAL '), 'arun medical');
  assert.ok(matchesAllWords('ARUN  MEDICAL  CENTRE', 'arun medical'));
  assert.ok(matchesAllWords('அருண் மருத்துவ மையம்', 'அருண்'));
  assert.ok(!matchesAllWords('ARUN MEDICAL', 'zzz'));
  assert.ok(matchesAllWords('anything', '   '));
});

test('regular-expression characters are matched literally', () => {
  assert.ok(matchesAllWords('Ward [A] (ICU)', '[a]'));
  assert.ok(!matchesAllWords('Ward A', '[a]'));
});

test('mailto and tel links are built only from unambiguous values', () => {
  assert.equal(mailtoHref('tnnhis_grievance@Mdindia.com'), 'mailto:tnnhis_grievance@Mdindia.com');
  assert.equal(mailtoHref('not an email'), undefined);
  assert.equal(isEmailAddress('010600@uiic.co.in'), true);
  assert.equal(telHref('78239 33929'), 'tel:7823933929');
  assert.equal(telHref('044-27426638'), 'tel:04427426638');
  assert.equal(telHref('04366-\n24057996269\n10700'), undefined);
  assert.equal(telHref('ext 5'), undefined);
});

test('only https Google Maps links are accepted for map destinations', () => {
  assert.ok(safeMapUrl('https://maps.google.com/?q=13.1,80.3'));
  assert.equal(safeMapUrl('javascript:alert(1)'), undefined);
  assert.equal(safeMapUrl('https://evil.example/?q=1'), undefined);
});

test('pagination shows first, last and a window around the current page', () => {
  assert.deepEqual(pageItems(1, 3), [1, 2, 3]);
  assert.deepEqual(pageItems(1, 102), [1, 2, 'gap-end', 102]);
  assert.deepEqual(pageItems(50, 102), [1, 'gap-start', 49, 50, 51, 'gap-end', 102]);
  assert.deepEqual(pageItems(1, 0), []);
});

test('legacy language values migrate', () => {
  assert.equal(parseLocale('tam'), 'ta');
  assert.equal(parseLocale('eng'), 'en');
  assert.equal(parseLocale('fr'), undefined);
  assert.equal(formatBytes(2048), '2 KB');
});
