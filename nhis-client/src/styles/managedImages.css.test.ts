import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Managed images are uploaded by an administrator and can have any proportions, so no style may stretch or crop them
 * (docs/site-content-management.md, section 6). These tests read the style sheets: a logo is limited by height (and by
 * the width of its box) only, its `width`/`height` attributes cannot force a size (`width: auto; height: auto`) and
 * `object-fit: contain` keeps the whole picture whatever the box is. They check the rules, not the pixels.
 */

const css = (relative: string) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every top-level or nested rule whose selector list contains exactly `selector`. */
function declarations(sheet: string, selector: string): Array<Record<string, string>> {
  const found: Array<Record<string, string>> = [];
  for (const match of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((entry) => entry.trim());
    if (!selectors.includes(selector)) continue;
    const rule: Record<string, string> = {};
    for (const line of match[2].split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) rule[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    found.push(rule);
  }
  return found;
}
const merged = (sheet: string, selector: string) => Object.assign({}, ...declarations(sheet, selector)) as Record<string, string>;

const scheme = css('components/scheme/scheme.css');
const layout = css('components/layout/layout.css');
const header = css('components/layout/SiteHeader.css');
const content = css('components/content/content.css');

test('a partner logo is only limited, never sized: natural proportions, contained, not wider than its box', () => {
  const logo = merged(scheme, '.partner-logo');
  assert.equal(logo.width, 'auto');
  assert.equal(logo.height, 'auto');
  assert.equal(logo['max-width'], '100%');
  assert.equal(logo['object-fit'], 'contain');
  assert.ok(!('min-width' in logo) && !('min-height' in logo) && !('aspect-ratio' in logo));
});

test('every height class limits the height and nothing else, on desktop and on a phone', () => {
  for (const shape of ['emblem', 'wide', 'banner', 'stacked']) {
    const rules = declarations(scheme, `.partner-logo--${shape}`);
    assert.equal(rules.length, 2, `${shape}: one rule for desktop, one for phones`);
    for (const rule of rules) {
      assert.deepEqual(Object.keys(rule), ['max-height'], `${shape} sets only max-height`);
      assert.match(rule['max-height'], /^\d+(\.\d+)?rem$/);
    }
  }
  // phones: never taller than on desktop
  for (const shape of ['emblem', 'wide', 'banner', 'stacked']) {
    const [desktop, phone] = declarations(scheme, `.partner-logo--${shape}`).map((rule) => parseFloat(rule['max-height']));
    assert.ok(phone <= desktop, `${shape} on a phone`);
  }
});

test('the box of a logo link is as wide as the logo and never wider than its group, so a long strip cannot push the page sideways', () => {
  const box = merged(scheme, '.partner-link');
  assert.equal(box['max-width'], '100%');
  assert.equal(box['min-width'], '0');
  assert.match(box.display, /flex/);
  const row = merged(scheme, '.partner-group__logos');
  assert.equal(row['flex-wrap'], 'wrap');
});

test('footer logos, the hero banner and page pictures keep their proportions too', () => {
  const footer = merged(layout, '.site-footer__logo img');
  assert.deepEqual([footer.width, footer.height, footer['max-width'], footer['object-fit']], ['auto', 'auto', '100%', 'contain']);
  assert.match(footer['max-height'], /rem$/);
  const tile = merged(layout, '.site-footer__logo');
  assert.equal(tile['max-width'], '100%');
  const banner = merged(scheme, '.hero__banner');
  assert.deepEqual([banner['max-width'], banner.height], ['100%', 'auto']);
  const figure = merged(content, '.content-figure img');
  assert.deepEqual([figure['max-width'], figure.height], ['100%', 'auto']);
});

test('the header emblem and portrait sit in a fixed box and are contained, so any upload is letterboxed, not stretched or cropped', () => {
  for (const selector of ['.nhis-header .nhis-header__emblem', '.nhis-header .nhis-header__portrait']) {
    const picture = merged(header, selector);
    assert.equal(picture['object-fit'], 'contain', selector);
    assert.match(picture.width, /px$/);
    assert.match(picture.height, /px$/);
  }
});

test('no style crops or stretches a managed image: object-fit cover and fill appear only for the Gallery photos', () => {
  const sheets: Array<[string, string]> = [['scheme', scheme], ['layout', layout], ['header', header], ['content', content]];
  for (const [name, sheet] of sheets) assert.ok(!/object-fit:\s*(cover|fill|none)/.test(sheet), `${name}.css`);
});

test('the preview banner and the new blocks wrap their text, so nothing is wider than a 360 px screen', () => {
  const banner = merged(layout, '.preview-banner p');
  assert.equal(banner['min-width'], '0');
  const inner = declarations(layout, '.preview-banner__inner')[0];
  assert.equal(inner.display, 'flex');
  const highlights = merged(scheme, '.highlights__grid');
  assert.match(highlights['grid-template-columns'], /min\(100%, \d+(\.\d+)?rem\)/, 'a column is never wider than the screen');
  assert.equal(merged(scheme, '.highlights__item')['overflow-wrap'], 'anywhere');
});
