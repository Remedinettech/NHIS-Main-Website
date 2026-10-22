import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Texts of the managed content (website title, menu and footer labels, tile labels, hero text) are written by editors
 * in either language and can be long. A real-browser run at 360 px with the Tamil texts of the built-in content showed
 * the whole site scrolling sideways (the footer's quick links had `white-space: nowrap` in two narrow columns), and a
 * run with long editor texts did the same for the website title, the quick tiles and the hero. These tests read the
 * style sheets and pin the rules that keep such text inside the screen. They check the rules, not the pixels.
 */

const css = (relative: string) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list contains exactly `selector`, merged in source order. */
function rule(sheet: string, selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(',').map((entry) => entry.trim()).includes(selector)) continue;
    for (const line of match[2].split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) found[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return found;
}

/** The style sheet without its media queries: the rules for every screen. */
const withoutMedia = (sheet: string) => sheet.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');

const layout = css('components/layout/layout.css');
const header = css('components/layout/SiteHeader.css');
const brand = css('components/common/brand-logo.css');
const scheme = css('components/scheme/scheme.css');
const schemeBase = withoutMedia(scheme);

test('footer link labels wrap inside their column; only phone numbers stay on one line', () => {
  assert.equal(rule(layout, '.site-footer__links')['grid-template-columns'], 'repeat(2, minmax(0, 1fr))', 'columns that may shrink below their content');
  assert.equal(rule(layout, '.site-footer a[href^="tel:"]')['white-space'], 'nowrap');
  assert.equal(rule(layout, '.site-footer__links a')['white-space'], undefined, 'a link label is never forced onto one line');
  assert.equal(rule(layout, '.site-footer p')['overflow-wrap'], 'anywhere');
  assert.equal(rule(layout, '.site-footer li')['min-width'], '0');
});

test('the website title wraps instead of widening the header, in the header and in the footer', () => {
  for (const [sheet, selector] of [[header, '.nhis-header__name'], [brand, '.brand-logo__name']] as const) {
    const declarations = rule(sheet, selector);
    assert.notEqual(declarations['white-space'], 'nowrap', `${selector} may wrap`);
    assert.equal(declarations['overflow-wrap'], 'anywhere', `${selector} breaks a word that does not fit`);
  }
});

test('hero and quick tiles shrink to the screen: single column that may be narrower than its text, long words break', () => {
  assert.equal(rule(schemeBase, '.hero__grid')['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(rule(scheme, '.hero__text')['min-width'], '0');
  assert.equal(rule(scheme, '.hero__text')['overflow-wrap'], 'anywhere');
  assert.equal(rule(scheme, '.quick__text')['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(rule(scheme, '.quick__text')['overflow-wrap'], 'anywhere');
  // the two-column hero of wide screens still follows the base rule in the style sheet
  assert.match(scheme, /@media \(min-width: 62rem\) \{ \.hero__grid \{ grid-template-columns: minmax\(0, 1\.15fr\) minmax\(0, 1fr\)/);
});

test('a homepage section with nothing to show takes no room', () => {
  assert.equal(rule(scheme, '.home-section:empty').display, 'none');
});
