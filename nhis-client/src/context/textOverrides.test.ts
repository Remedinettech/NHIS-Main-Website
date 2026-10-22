import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TextContent } from '@nhis/shared-types';
import { languageOfWithOverrides, overrideFor, translateWithOverrides } from './LanguageContext';
import { resolveMessage } from '../locales';

const overrides: TextContent['overrides'] = {
  'hospitals.title': { en: 'Our network hospitals', ta: 'எங்கள் மருத்துவமனைகள்' },
  'hospitals.intro': { en: 'Find a hospital near you.', ta: '' },
  'contacts.title': { en: '', ta: 'தொடர்பு' },
  'common.pageOf': { en: 'Page {page} of {total}!', ta: '' },
};

test('an override wins over the locale files, in the language it is stored for', () => {
  assert.equal(translateWithOverrides(overrides, 'en', 'hospitals.title'), 'Our network hospitals');
  assert.equal(translateWithOverrides(overrides, 'ta', 'hospitals.title'), 'எங்கள் மருத்துவமனைகள்');
  assert.equal(translateWithOverrides(overrides, 'ta', 'contacts.title'), 'தொடர்பு');
});

test('an empty override text keeps the built-in text, and an English text is never used for Tamil', () => {
  assert.equal(translateWithOverrides(overrides, 'ta', 'hospitals.intro'), resolveMessage('ta', 'hospitals.intro').text);
  assert.equal(translateWithOverrides(overrides, 'en', 'contacts.title'), 'Contact');
  assert.equal(overrideFor(overrides, 'en', 'contacts.title'), undefined);
  assert.equal(overrideFor({ 'hospitals.title': { en: '   ', ta: '' } }, 'en', 'hospitals.title'), undefined);
});

test('keys without an override use the locale files, with the English fallback for missing Tamil', () => {
  assert.equal(translateWithOverrides({}, 'en', 'nav.home'), 'Home');
  assert.equal(translateWithOverrides(overrides, 'en', 'nav.home'), 'Home');
  assert.equal(translateWithOverrides(overrides, 'ta', 'nav.home'), resolveMessage('ta', 'nav.home').text);
});

test('parameters are filled into overrides like into the built-in texts', () => {
  assert.equal(translateWithOverrides(overrides, 'en', 'common.pageOf', { page: 2, total: 9 }), 'Page 2 of 9!');
  assert.equal(translateWithOverrides(overrides, 'ta', 'common.pageOf', { page: 2, total: 9 }), resolveMessage('ta', 'common.pageOf', { page: 2, total: 9 }).text);
  assert.equal(translateWithOverrides(overrides, 'en', 'common.pageOf'), 'Page {page} of {total}!', 'a missing parameter stays as written');
});

test('an override is written in the language it is stored for, so langOf reports that language', () => {
  assert.equal(languageOfWithOverrides(overrides, 'ta', 'hospitals.title'), 'ta');
  assert.equal(languageOfWithOverrides(overrides, 'en', 'hospitals.title'), 'en');
  // no override: the built-in resolution decides (every message has Tamil, so the locale is kept)
  assert.equal(languageOfWithOverrides(overrides, 'ta', 'nav.home'), 'ta');
  assert.equal(languageOfWithOverrides({}, 'ta', 'hospitals.title'), resolveMessage('ta', 'hospitals.title').origin === 'fallback-en' ? 'en' : 'ta');
});

test('keys of Object.prototype are not overrides', () => {
  assert.equal(overrideFor({}, 'en', 'constructor'), undefined);
  assert.equal(overrideFor({}, 'en', '__proto__'), undefined);
  assert.equal(overrideFor({}, 'en', 'toString'), undefined);
});
