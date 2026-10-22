import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, EDITABLE_TEXT_CATALOG, type Locale, type PageContent, type SiteContentMap } from '@nhis/shared-types';
import type { SiteContentValue } from './SiteContentContext';
import type { MessageKey } from '../locales';

/*
 * "Page text" overrides (docs/site-content-management.md, section 1): every key of EDITABLE_TEXT_CATALOG must be a text
 * that the Client really draws through `t()` / <T>, because that is the only place that applies an override. The first
 * tests prove the plumbing for every key; the scan proves that every key is used by the user interface and that no
 * module looks up a message in the locale files directly (which would ignore the override).
 */

// CSS imports of the components are stubbed for Node.
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return nextLoad(url, context); }",
));

const { SiteContentContext } = await import('./SiteContentContext');
const { LanguageProvider, useLanguage } = await import('./LanguageContext');
const { T } = await import('../components/common/T');
const { ContentPageView } = await import('../components/content/ContentPageView');

/* ---------------------------------------------------------------- plumbing for every key */

function Probe({ messageKey }: { messageKey: MessageKey }) {
  const { t } = useLanguage();
  return createElement('p', null, t(messageKey));
}

function render(node: ReturnType<typeof createElement>, locale: Locale, overrides: SiteContentMap['text']['overrides']): string {
  const content: SiteContentMap = { ...DEFAULT_SITE_CONTENT, text: { overrides } };
  const value: SiteContentValue = { content, status: 'ready', preview: false, previewDenied: false };
  return renderToString(
    createElement(MemoryRouter, null,
      createElement(SiteContentContext.Provider, { value }, createElement(LanguageProvider, { initialLocale: locale, children: node }))),
  );
}

const inner = (html: string) => html.replace(/^<p>/, '').replace(/<\/p>$/, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

test('an override of every catalog key reaches t() in the language it is written for', () => {
  assert.ok(EDITABLE_TEXT_CATALOG.length >= 40, 'the catalog is not empty');
  for (const entry of EDITABLE_TEXT_CATALOG) {
    const key = entry.key as MessageKey;
    const overrides = { [entry.key]: { en: `EN override of ${entry.key}`, ta: `TA override of ${entry.key}` } };
    assert.equal(inner(render(createElement(Probe, { messageKey: key }), 'en', overrides)), `EN override of ${entry.key}`);
    assert.equal(inner(render(createElement(Probe, { messageKey: key }), 'ta', overrides)), `TA override of ${entry.key}`);
    // the shipped text comes back when the override is empty, and for a key nobody changed
    const blank = { [entry.key]: { en: '', ta: '' } };
    assert.equal(inner(render(createElement(Probe, { messageKey: key }), 'en', blank)), entry.defaults.en, `${entry.key} (en)`);
    assert.equal(inner(render(createElement(Probe, { messageKey: key }), 'ta', {})), entry.defaults.ta || entry.defaults.en, `${entry.key} (ta)`);
  }
});

test('<T> draws the override too, and marks English as English when Tamil has none', () => {
  const overrides = { 'common.notFoundTitle': { en: 'Nothing here', ta: '' } };
  assert.equal(render(createElement(T, { k: 'common.notFoundTitle' }), 'en', overrides), 'Nothing here');
  assert.equal(render(createElement(T, { k: 'common.notFoundTitle' }), 'ta', overrides), render(createElement(T, { k: 'common.notFoundTitle' }), 'ta', {}), 'an English override is never shown for Tamil');
  const ta = { 'common.notFoundTitle': { en: 'Nothing here', ta: 'இங்கே எதுவும் இல்லை' } };
  assert.equal(render(createElement(T, { k: 'common.notFoundTitle' }), 'ta', ta), 'இங்கே எதுவும் இல்லை');
});

test('a page title written under "Page text" replaces the title of the page content, in the language it is written in', () => {
  const page: PageContent = {
    slug: 'coverage', legacyPaths: [], sourceUrl: '', capturedAt: '', documentIds: [], reviewNotes: [],
    en: { title: 'Coverage from the Pages module', sections: [] }, ta: null,
  };
  const withoutTitle = render(createElement(ContentPageView, { page }), 'en', {});
  assert.match(withoutTitle, /<h1 id="page-title" tabindex="-1" lang="en">Coverage from the Pages module<\/h1>/);
  const withTitle = render(createElement(ContentPageView, { page, title: 'Our coverage' }), 'en', {});
  assert.match(withTitle, /<h1 id="page-title" tabindex="-1" lang="en">Our coverage<\/h1>/);
  const tamil = render(createElement(ContentPageView, { page, title: 'எங்கள் காப்பீடு' }), 'ta', {});
  assert.match(tamil, /<h1 id="page-title" tabindex="-1" lang="ta">எங்கள் காப்பீடு<\/h1>/);
  assert.match(tamil, /class="notice notice--info content-fallback"/, 'the notice about the missing Tamil text stays');
});

/* ---------------------------------------------------------------- the scan */

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory = SRC): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const posix = (path: string) => relative(SRC, path).split(sep).join('/');
const files = sourceFiles().map((path) => ({ path: posix(path), text: readFileSync(path, 'utf8') }));
/** Files of the user interface: everything but the locale files themselves. */
const ui = files.filter((file) => !file.path.startsWith('locales/'));

/** Files that name the message key as a string, or build it from a template with the given static prefix. */
const usesKey = (key: string): string[] => ui.filter((file) => file.text.includes(`'${key}'`) || file.text.includes(`"${key}"`)).map((file) => file.path);
const usesTemplate = (prefix: string): string[] => ui.filter((file) => file.text.includes('`' + prefix + '${')).map((file) => file.path);

const DYNAMIC_FAMILIES = ['contacts.directories.'];

test('every catalog key is a text that the user interface draws (the scan itself is checked against a key nobody uses)', () => {
  assert.deepEqual(usesKey('no.such.key.anywhere'), []);
  assert.deepEqual(usesTemplate('no.such.family.'), []);
  const unused = EDITABLE_TEXT_CATALOG
    .map((entry) => entry.key)
    .filter((key) => usesKey(key).length === 0 && !DYNAMIC_FAMILIES.some((prefix) => key.startsWith(prefix) && usesTemplate(prefix).length > 0));
  assert.deepEqual(unused, [], 'an override of these keys would change nothing on the website');
  for (const prefix of DYNAMIC_FAMILIES) assert.ok(usesTemplate(prefix).length >= 2, `${prefix}<id> is built in the tabs and in the panel`);
});

test('the four contact directories have a catalog entry each, matching the ids of the directories', () => {
  const ids = ['coordinators', 'uiic-nodal-officers', 'hospital-nodal-officers', 'treasury-offices', 'project-office-officials'];
  const keys = EDITABLE_TEXT_CATALOG.map((entry) => entry.key).filter((key) => key.startsWith('contacts.directories.'));
  assert.deepEqual(keys.sort(), ids.map((id) => `contacts.directories.${id}`).sort());
});

/** True when a module imports a value (not only types) from the locale files: that is a message lookup outside `t()`. */
function importsLocaleValues(text: string): boolean {
  const statements = text.matchAll(/import\s+([^;]*?)\s+from\s+['"]([^'"]*\/locales(?:\/[\w.]+)?)['"]/g);
  return Array.from(statements).some(([, clause]) => {
    if (/^type\s/.test(clause)) return false;
    const named = /^\{([^}]*)\}$/.exec(clause)?.[1];
    return named === undefined || named.split(',').map((name) => name.trim()).filter(Boolean).some((name) => !name.startsWith('type '));
  });
}

test('the check for message lookups outside t() recognises them', () => {
  assert.equal(importsLocaleValues("import { translate } from '../locales';"), true);
  assert.equal(importsLocaleValues("import { type MessageKey, resolveMessage } from '../../locales';"), true);
  assert.equal(importsLocaleValues("import * as locales from '../locales/index';"), true);
  assert.equal(importsLocaleValues("import { en } from '../locales/en';"), true);
  assert.equal(importsLocaleValues("import type { MessageKey } from '../locales';"), false);
  assert.equal(importsLocaleValues("import { type MessageKey, type MessageParams } from '../locales';"), false);
  assert.equal(importsLocaleValues("import { useState } from 'react';"), false);
});

test('no module outside the language provider looks up a message in the locale files (that would ignore the overrides)', () => {
  const offenders = ui.filter((file) => file.path !== 'context/LanguageContext.tsx' && importsLocaleValues(file.text)).map((file) => file.path);
  assert.deepEqual(offenders, []);
});

test('keys that reach t() through a property are consumed by components that call t()', () => {
  const read = (path: string) => files.find((file) => file.path === path)?.text ?? '';
  assert.match(read('pages/ContentPage.tsx'), /t\(titleKey\)/, 'page titles of the routes');
  assert.match(read('pages/ContentPage.tsx'), /hasOverride\(titleKey\)/, 'a written page title replaces the title of the page content');
  assert.match(read('components/contacts/ContactDirectoryPanel.tsx'), /t\(column\.labelKey\)|t\(col\.labelKey\)|labelKey/, 'column headings');
  assert.match(read('routes/index.tsx'), /titleKey="pages\.coverageTitle"/);
  assert.match(read('components/contacts/ContactTabs.tsx'), /t\(`contacts\.directories\.\$\{directory\.id\}` as MessageKey\)/);
});
