import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const tokens = new Map([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const colour = (name: string): string => {
  const value = tokens.get(name);
  assert.ok(value, `token --${name} missing`);
  return value;
};

test('brand tokens match the approved palette', () => {
  const expected: Record<string, string> = {
    'color-primary': '#0072bb', 'color-primary-hover': '#005a94', 'color-navy': '#12304a', 'color-white': '#ffffff',
    'color-bg': '#f4f8fc', 'color-highlight': '#e8f3fb', 'color-text': '#334155', 'color-border': '#d9e5ef',
  };
  for (const [name, hex] of Object.entries(expected)) assert.equal(colour(name).toLowerCase(), hex);
});

/** [foreground, background, minimum ratio, where it is used] */
const PAIRS: Array<[string, string, number, string]> = [
  ['color-text', 'color-white', 4.5, 'body text on cards'],
  ['color-text', 'color-bg', 4.5, 'body text on page background'],
  ['color-text', 'color-highlight', 4.5, 'body text on highlights'],
  ['color-navy', 'color-white', 4.5, 'headings'],
  ['color-navy', 'color-bg', 4.5, 'headings on page background'],
  ['color-navy', 'color-highlight', 4.5, 'headings on highlights'],
  ['color-text-muted', 'color-white', 4.5, 'secondary text on cards'],
  ['color-text-muted', 'color-bg', 4.5, 'secondary text on page background'],
  ['color-text-muted', 'color-highlight', 4.5, 'secondary text on highlights'],
  ['color-white', 'color-primary', 4.5, 'primary button label'],
  ['color-white', 'color-primary-hover', 4.5, 'button hover / login button label'],
  ['color-primary', 'color-white', 4.5, 'links on white'],
  ['color-primary-hover', 'color-white', 4.5, 'secondary button / eyebrow'],
  ['color-primary-hover', 'color-bg', 4.5, 'links and eyebrows on page background'],
  ['color-primary-hover', 'color-highlight', 4.5, 'active nav, secondary button hover'],
  ['color-white', 'color-navy', 4.5, 'footer and support strip text'],
  ['color-on-navy-muted', 'color-navy', 4.5, 'footer secondary text'],
  ['color-highlight', 'color-navy', 4.5, 'support strip link hover'],
  ['color-primary-on-dark', 'color-navy', 4.5, 'NHIS in the footer wordmark'],
  ['color-text-muted', 'color-white', 4.5, 'wordmark subtitle'],
  ['color-success', 'color-success-bg', 4.5, 'success status'],
  ['color-warning', 'color-warning-bg', 4.5, 'warning status'],
  ['color-danger', 'color-danger-bg', 4.5, 'danger status'],
  ['color-danger', 'color-white', 4.5, 'unavailable document text'],
  ['color-text', 'color-warning-bg', 4.5, 'text inside warning notices'],
  ['color-border-strong', 'color-white', 3, 'form control borders (non-text, 3:1)'],
  ['color-primary-hover', 'color-white', 3, 'focus ring against white (non-text, 3:1)'],
];

for (const [fg, bg, min, where] of PAIRS) {
  test(`contrast ${fg} on ${bg} >= ${min}:1 (${where})`, () => {
    const actual = ratio(colour(fg), colour(bg));
    assert.ok(actual >= min, `${where}: ${actual.toFixed(2)}:1 is below ${min}:1`);
  });
}
