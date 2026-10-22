import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONTENT } from '@nhis/shared-types';
import { documentTitleFor } from './useDocumentTitle';

const { header } = DEFAULT_SITE_CONTENT;

test('the tab title is "<page> | <website title>", and the scheme name stands in for a missing page title', () => {
  assert.equal(documentTitleFor('Contact', header, 'en'), 'Contact | TN-NHIS');
  assert.equal(documentTitleFor(undefined, header, 'en'), 'Tamil Nadu New Health Insurance Scheme | TN-NHIS');
  assert.equal(documentTitleFor('', header, 'en'), 'Tamil Nadu New Health Insurance Scheme | TN-NHIS');
});

test('the Tamil tab title uses the header subtitle, the single Tamil spelling of the scheme name', () => {
  assert.equal(documentTitleFor(undefined, header, 'ta'), 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டுத் திட்டம் | TN-NHIS');
  assert.equal(documentTitleFor('தொடர்பு கொள்ளவும்', header, 'ta'), 'தொடர்பு கொள்ளவும் | TN-NHIS');
});

test('title and subtitle come from the managed header; missing Tamil falls back to English', () => {
  const managed = { title: { en: 'HEALTH-PLUS', ta: '' }, subtitle: { en: 'Plus scheme', ta: '' } };
  assert.equal(documentTitleFor(undefined, managed, 'en'), 'Plus scheme | HEALTH-PLUS');
  assert.equal(documentTitleFor('Forms', managed, 'ta'), 'Forms | HEALTH-PLUS');
});
