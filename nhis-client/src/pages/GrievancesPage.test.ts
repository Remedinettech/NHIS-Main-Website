import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_GRIEVANCE_SECTIONS, DEFAULT_SITE_CONTENT, type Locale } from '@nhis/shared-types';

register('data:text/javascript,' + encodeURIComponent("export async function load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return next(url,context)}"));
const { SiteContentContext } = await import('../context/SiteContentContext');
const { LanguageProvider } = await import('../context/LanguageContext');
const { OFFICER_SECTION_IDS, OfficerSections } = await import('./GrievancesPage');

function render(locale: Locale): string {
  return renderToString(
    createElement(MemoryRouter, {},
      createElement(SiteContentContext.Provider, { value: { content: DEFAULT_SITE_CONTENT, preview: false, previewDenied: false, status: 'ready' } },
        createElement(LanguageProvider, { initialLocale: locale, children: createElement(OfficerSections) }))),
  );
}

const rows = (html: string) => Array.from(html.matchAll(/<tr>(.*?)<\/tr>/g), (match) => Array.from(match[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g), (cell) => cell[1].replace(/<[^>]+>/g, '')));

test('the built-in officer tables are the three tables of the live Grievances page, in English', () => {
  const html = render('en');
  assert.deepEqual(Array.from(html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/g), (match) => match[1]), ['Nodal Officer for NHIS 2026 Implementation', 'Escalation Matrix 1', 'Escalation Matrix 2']);
  assert.deepEqual(rows(html).filter((row) => row[0] !== 'No.'), [
    ['1', 'Mr. V S Rajasubramaniam', 'Chief Business Manager', '9789055837', 'rajasubramanianvs@uiic.co.in'],
    ['2', 'Mr. G Ravikiran', 'Manager', '9600191013', 'ravikirang@uiic.co.in'],
    ['1', 'Mr. P. Suganesh', 'Regional Manager', '9789909967', 'psuganesh@uiic.co.in'],
    ['1', 'Mr. V N Sandeep', 'Deputy General Manager', '9489456079', 'vnsandeep@uiic.co.in'],
  ]);
  assert.equal(rows(html).filter((row) => row[0] === 'No.').length, 3, 'one header row per table');
  assert.ok(html.includes('href="mailto:psuganesh@uiic.co.in"') && html.includes('href="tel:9789909967"'));
});

test('the Tamil headings are used in Tamil', () => {
  const html = render('ta');
  assert.ok(html.includes('NHIS 2026 செயல்படுத்தலுக்கான நோடல் அலுவலர்'));
  assert.ok(html.includes('மேல்முறையீட்டு நிலை 1') && html.includes('மேல்முறையீட்டு நிலை 2'));
});

test('the ids that hide the built-in tables are the ids the Admin action adds to the page text', () => {
  assert.deepEqual([...OFFICER_SECTION_IDS].sort(), DEFAULT_GRIEVANCE_SECTIONS.en.map((section) => section.id).sort());
  assert.deepEqual([...OFFICER_SECTION_IDS].sort(), DEFAULT_GRIEVANCE_SECTIONS.ta.map((section) => section.id).sort());
});
