/**
 * Independent review of the shared site-content validator: a systematic fuzz over EVERY leaf of the built-in documents
 * with hostile payloads, judged by what is stored (not only by what is rejected), plus structural attacks. No database.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_ASSET_PATTERN, DEFAULT_SITE_CONTENT, EDITABLE_TEXT_CATALOG, SITE_CONTENT_KEYS, SITE_ROUTES, validateSiteContent,
  type SiteContentKey,
} from '@nhis/shared-types';

const BS = String.fromCharCode(92); // a backslash, written without an escape so that no tool re-interprets it
const ch = (...codes: number[]): string => String.fromCharCode(...codes);
/** C0 (except TAB/LF handled elsewhere), DEL, C1, zero-width space, line and paragraph separators, word joiner and invisible operators, bidi controls, BOM. */
const HIDDEN = new RegExp('[' + [[0, 8], [0x0b, 0x1f], [0x7f, 0x9f], [0x200b, 0x200b], [0x2028, 0x2029], [0x2060, 0x2064], [0x2066, 0x2069], [0x202a, 0x202e], [0xfeff, 0xfeff]].map(([a, b]) => ch(a) + '-' + ch(b)).join('') + ']');
type Path = Array<string | number>;
/* eslint-disable @typescript-eslint/no-explicit-any */

function leaves(node: any, path: Path, out: Path[]): void {
  if (Array.isArray(node)) node.forEach((v, i) => leaves(v, [...path, i], out));
  else if (node && typeof node === 'object') for (const k of Object.keys(node)) leaves(node[k], [...path, k], out);
  else out.push(path);
}
function withValue(root: any, path: Path, value: unknown): any {
  const copy = structuredClone(root);
  let cur = copy;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return copy;
}
const read = (root: any, path: Path): any => path.reduce((a: any, k) => a?.[k], root);

type Kind = 'url' | 'route' | 'email' | 'number' | 'builtIn' | 'token' | 'enum' | 'text' | 'flag' | 'dimension';
function kindOf(key: SiteContentKey, path: Path): Kind {
  const last = path[path.length - 1];
  const parent = path[path.length - 2];
  if (typeof last === 'number') {
    if (parent === 'documentIds') return 'token';
    if (parent === 'categories' && key === 'home') return 'enum';
    throw new Error(`unclassified list entry ${key}:${path.join('.')}`);
  }
  switch (last) {
    case 'url': return 'url';
    case 'path': return 'route';
    case 'address': return path.includes('contact') ? 'text' : 'email';
    case 'email': return 'email';
    case 'number': return 'number';
    case 'phone': return 'number';
    case 'builtIn': return 'builtIn';
    case 'assetId': case 'documentId': case 'helplineId': case 'categoryId': case 'id': return 'token';
    case 'icon': case 'variant': case 'type': return 'enum';
    case 'visible': case 'showPortrait': case 'showWordmark': case 'showCount': return 'flag';
    case 'width': case 'height': return 'dimension';
    default: return 'text';
  }
}

const URL_PAYLOADS = [
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java' + '\t' + 'script:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd',
  'http://example.com/', '//evil.example/x', 'ftp://example.com/', 'HTTPS://EXAMPLE.COM/a', ' https://example.com/ ', 'https://exämple.com/', 'https://exa​mple.com/',
  'https:///evil.example', `https://example.com${BS}@evil.example/`, 'https://user:pw@example.com/', 'https://example.com/\nfoo', 'https://exam ple.com/', `https:${BS}${BS}evil.example`,
  'https://[::1]/', 'https://evil.example/' + '%0d%0aSet-Cookie:a=b', 'x'.repeat(600), 'https://', 'https:example.com',
];
const ROUTE_PAYLOADS = ['/hospitals?x=1', '/Hospitals', '/hospitals/', '/hospitals/../admin', '/%2e%2e/admin', `${BS}hospitals`, '//evil.example', 'hospitals', ' /hospitals', '/hospitals#', '/hospitals#a b', '/hospitals#<script>', 'https://evil.example', 'javascript:alert(1)', '/hospitals' + '\n', '/hospitals#' + 'a'.repeat(65)];
const EMAIL_PAYLOADS = ['a@b.co', 'x?bcc=evil@example.com', 'x&body=hi@example.com', 'a=b@example.com', 'a%0d%0abcc:evil@example.com@example.com', 'a#frag@example.com', 'mailto:a@example.com', 'a@example.com?subject=hi', '<a@example.com>', 'a b@example.com', 'a@exa mple.com', 'a@example', 'a@@example.com', 'a..b@example.com', 'a@example.com\n'];
const NUMBER_PAYLOADS = ['+91 44 2345 6789', '1800-233-5666', 'tel:123456', '123;ext=1', '12', '1'.repeat(40), '+', 'javascript:1', '123456\n', '١٢٣٤٥٦', '123 456 789 0123456789'];
const TOKEN_PAYLOADS = ['a/b', 'a b', '../x', '<x>', 'javascript:1', "a'b", 'a"b', 'x'.repeat(200), '', ' ', 'ä', '__proto__', 'constructor', 'a\nb', '1abc'];
const TEXT_PAYLOADS = [
  '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '</div>', '<!-- x -->', '<?php', '<svg/onload=alert(1)>', 'a<b', '&lt;script&gt;',
  ch(0xff1c) + 'script' + ch(0xff1e), 'abc' + ch(0x202e) + 'def', 'a' + ch(0x200b) + 'b', 'a' + ch(0x2028) + 'b', 'a' + ch(0x2060) + 'b', 'a' + ch(0xfeff) + 'b',
  'a' + ch(0) + 'b', 'a' + ch(7) + 'b', 'a' + ch(0x9f) + 'b', 'a' + ch(9) + 'b', 'a' + ch(10) + 'b', 'a' + ch(13, 10) + 'b', 'a' + ch(0xd800) + 'b', 'a' + ch(0xdc00) + 'b',
  'x'.repeat(5000), '  padded  ', 'javascript:alert(1)',
];

/** Are two documents equal when serialised? (normal form check) */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe('fuzz over every leaf of every built-in document', () => {
  test('machine values: whatever is accepted is safe in the form it is stored (https URL, known route, plain address, digits, id)', () => {
    let accepted = 0;
    const problems: string[] = [];
    for (const key of SITE_CONTENT_KEYS) {
      const doc = (DEFAULT_SITE_CONTENT as any)[key];
      const all: Path[] = [];
      leaves(doc, [], all);
      for (const path of all) {
        const kind = kindOf(key, path);
        const payloads = kind === 'url' ? URL_PAYLOADS : kind === 'route' ? ROUTE_PAYLOADS : kind === 'email' ? EMAIL_PAYLOADS : kind === 'number' ? NUMBER_PAYLOADS : kind === 'token' ? TOKEN_PAYLOADS : null;
        if (!payloads) continue;
        for (const payload of payloads) {
          const result = validateSiteContent(key, withValue(doc, path, payload));
          if (!result.ok) continue;
          accepted++;
          const stored = read(result.value, path);
          const where = `${key}:${path.join('.')} <- ${JSON.stringify(payload).slice(0, 50)} => ${JSON.stringify(stored)}`;
          const bad = (reason: string) => problems.push(`${reason}: ${where}`);
          if (typeof stored !== 'string') { if (!(stored === null && (kind === 'url' || kind === 'token'))) bad('not a string'); continue; }
          if (kind === 'url') {
            let parsed: URL | null = null;
            try { parsed = new URL(stored); } catch { /* handled below */ }
            if (!parsed || parsed.href !== stored || parsed.protocol !== 'https:' || parsed.username || parsed.password || /[\s\\]/.test(stored) || stored.length > 500) bad('unsafe URL');
          } else if (kind === 'route') {
            const base = stored.split('#')[0];
            if (!SITE_ROUTES.some((r) => r.path === base) || /[\s\\<>"']/.test(stored)) bad('unsafe route');
          } else if (kind === 'email') {
            if (stored !== '' && !/^[A-Za-z0-9.!$*+/^_`{|}~'-]+@[A-Za-z0-9.-]+$/.test(stored)) bad('email can carry mailto parameters or markup');
          } else if (kind === 'number') {
            if (!/^\+?[0-9][0-9 -]*$/.test(stored) && stored !== '') bad('number with other characters');
          } else if (kind === 'token') {
            if (!/^[A-Za-z0-9_-]+$/.test(stored) && stored !== '') bad('id with other characters');
          }
        }
      }
    }
    assert.ok(accepted > 100, 'the fuzz must exercise accepted values too');
    assert.deepEqual(problems, []);
  });

  test('text values: whatever is accepted holds no markup, control, hidden or bidi characters and stays within its limit', () => {
    const problems: string[] = [];
    let accepted = 0;
    for (const key of SITE_CONTENT_KEYS) {
      const doc = (DEFAULT_SITE_CONTENT as any)[key];
      const all: Path[] = [];
      leaves(doc, [], all);
      for (const path of all) {
        if (kindOf(key, path) !== 'text') continue;
        for (const payload of TEXT_PAYLOADS) {
          const result = validateSiteContent(key, withValue(doc, path, payload));
          if (!result.ok) continue;
          accepted++;
          const stored = read(result.value, path) as string;
          const where = `${key}:${path.join('.')} <- ${JSON.stringify(payload).slice(0, 40)} => ${JSON.stringify(stored).slice(0, 60)}`;
          if (/<[A-Za-z/!?]/.test(stored)) problems.push(`markup stored: ${where}`);
          if (HIDDEN.test(stored)) problems.push(`control or hidden character stored: ${where}`);
          if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(stored)) problems.push(`lone surrogate stored: ${where}`);
          if (stored !== stored.normalize('NFC') || stored !== stored.trim()) problems.push(`not normalised: ${where}`);
          if (/\r|\t/.test(stored)) problems.push(`tab or carriage return stored: ${where}`);
          if (stored.includes('\n') && !/(coverageStatement|about\.text|contact\.address|catalog)/.test(path.join('.'))) {
            if (key !== 'text' && !(key === 'manual' && /(^intro\.|^videos\.\d+\.description\.)/.test(path.join('.')))) problems.push(`line break in a single-line field: ${where}`);
          }
        }
      }
    }
    assert.ok(accepted > 500);
    assert.deepEqual(problems, []);
  });

  test('every accepted document is in normal form: validating it again changes nothing', () => {
    for (const key of SITE_CONTENT_KEYS) {
      const first = validateSiteContent(key, DEFAULT_SITE_CONTENT[key]);
      assert.ok(first.ok, `${key} built-in content must validate`);
      const second = validateSiteContent(key, first.value);
      assert.ok(second.ok);
      assert.ok(same(first.value, second.value), `${key} is not idempotent`);
      assert.ok(same(first.value, DEFAULT_SITE_CONTENT[key]), `${key}: the built-in content is not in normal form`);
    }
  });

  test('type confusion: any non-string/number/boolean/array/object/null in any leaf is rejected or normalised, never thrown', () => {
    const confusions: unknown[] = [0, 1, -1, 1.5, NaN, Infinity, true, false, null, [], ['x'], {}, { a: 1 }, [[]], 1e308, Number.MAX_SAFE_INTEGER + 2];
    let throws = 0;
    for (const key of SITE_CONTENT_KEYS) {
      const doc = (DEFAULT_SITE_CONTENT as any)[key];
      const all: Path[] = [];
      leaves(doc, [], all);
      for (const path of all) {
        for (const value of confusions) {
          try {
            const result = validateSiteContent(key, withValue(doc, path, value));
            if (result.ok) {
              const stored = read(result.value, path);
              // a boolean flag stays a boolean, a dimension stays an integer or null, text stays a string
              const kind = kindOf(key, path);
              if (kind === 'flag') assert.equal(typeof stored, 'boolean', `${key}:${path.join('.')} <- ${String(value)}`);
              if (kind === 'text' && read(doc, path) !== null) assert.equal(typeof stored, 'string', `${key}:${path.join('.')} <- ${JSON.stringify(value)}`);
              if (kind === 'dimension') assert.ok(stored === null || (Number.isSafeInteger(stored) && stored >= 1 && stored <= 20000), `${key}:${path.join('.')}`);
            }
          } catch (error) {
            throws++;
            assert.fail(`threw for ${key}:${path.join('.')} <- ${String(value)}: ${String(error)}`);
          }
        }
      }
    }
    assert.equal(throws, 0);
  });
});

describe('structure', () => {
  const objectPaths = (node: any, path: Path, out: Path[]): void => {
    if (Array.isArray(node)) node.forEach((v, i) => objectPaths(v, [...path, i], out));
    else if (node && typeof node === 'object') { out.push(path); for (const k of Object.keys(node)) objectPaths(node[k], [...path, k], out); }
  };

  test('unknown, __proto__ and constructor keys at every object are rejected and never pollute prototypes', () => {
    const injections: Array<Record<string, unknown>> = [
      JSON.parse('{"__proto__":{"polluted":"yes"}}'), JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}}}'), { extra: 1 }, { toString: 'x' }, { hasOwnProperty: 1 },
    ];
    let checks = 0;
    for (const key of SITE_CONTENT_KEYS) {
      const doc = (DEFAULT_SITE_CONTENT as any)[key];
      const objects: Path[] = [];
      objectPaths(doc, [], objects);
      for (const path of objects) {
        for (const injection of injections) {
          const copy = structuredClone(doc);
          const target = read(copy, path);
          for (const name of Object.keys(injection)) Object.defineProperty(target, name, { value: injection[name], enumerable: true, configurable: true, writable: true });
          const result = validateSiteContent(key, JSON.parse(JSON.stringify(copy)));
          checks++;
          if (key === 'text' && path.length === 1 && path[0] === 'overrides') assert.equal(result.ok, false);
          else assert.equal(result.ok, false, `${key}:${path.join('.')} accepted ${Object.keys(injection)[0]}`);
          assert.equal(({} as any).polluted, undefined);
          assert.equal((Object.prototype as any).polluted, undefined);
        }
      }
    }
    assert.ok(checks > 500);
  });

  test('text overrides: only catalog keys are accepted, prototype names and look-alike keys are not', () => {
    const accepted = EDITABLE_TEXT_CATALOG[0].key;
    const ok = validateSiteContent('text', { overrides: { [accepted]: { en: 'Changed', ta: 'மாற்றம்' } } });
    assert.ok(ok.ok);
    for (const key of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', `${accepted} `, ` ${accepted}`, accepted.toUpperCase(), `${accepted}.__proto__`, `${accepted}\u0000`, '']) {
      const input = JSON.parse(`{"overrides":{${JSON.stringify(key)}:{"en":"x","ta":"y"}}}`);
      const result = validateSiteContent('text', input);
      assert.equal(result.ok, false, JSON.stringify(key));
    }
    // a placeholder that the website would not fill in
    const withPlaceholder = validateSiteContent('text', { overrides: { [accepted]: { en: 'Hello {name}', ta: '' } } });
    assert.equal(withPlaceholder.ok, false);
  });

  test('huge or deeply nested input is refused without throwing or stack overflow', () => {
    let deep: any = {};
    let cur = deep;
    for (let i = 0; i < 50_000; i++) { cur.a = {}; cur = cur.a; }
    for (const key of SITE_CONTENT_KEYS) {
      assert.equal(validateSiteContent(key, deep).ok, false);
      assert.equal(validateSiteContent(key, { items: Array.from({ length: 200_000 }, (_, i) => i) }).ok, false);
      assert.equal(validateSiteContent(key, 'x'.repeat(1_000_000)).ok, false);
      for (const junk of [null, undefined, 5, true, [], 'text']) assert.equal(validateSiteContent(key, junk).ok, false);
    }
    const cyclic: any = { items: [] };
    cyclic.items.push(cyclic);
    assert.equal(validateSiteContent('navigation', cyclic).ok, false);
    assert.equal(validateSiteContent('nope' as SiteContentKey, {}).ok, false);
    assert.equal(validateSiteContent('__proto__' as SiteContentKey, {}).ok, false);
    // bytes are counted in UTF-8: Tamil is three bytes per character
    const tamil = structuredClone(DEFAULT_SITE_CONTENT.footer) as any;
    tamil.about.text.ta = 'அ'.repeat(2000);
    assert.equal(validateSiteContent('footer', tamil).ok, true);
    const many = structuredClone(DEFAULT_SITE_CONTENT.footer) as any;
    many.linkGroups = Array.from({ length: 5 }, () => many.linkGroups[0]);
    assert.equal(validateSiteContent('footer', many).ok, false);
  });

  test('an email link target and the footer address cannot carry mailto: parameters', () => {
    const nav = structuredClone(DEFAULT_SITE_CONTENT.navigation) as any;
    const link = nav.items.find((item: any) => item.type === 'link');
    for (const address of ['x?bcc=evil@example.com', 'x&subject=hi@example.com', 'a=b@example.com', 'a%0d%0abcc:evil@example.com', 'a#frag@example.com', 'a@example.com?subject=Win']) {
      link.target = { type: 'email', address };
      assert.equal(validateSiteContent('navigation', nav).ok, false, address);
    }
    for (const address of ['helpdesk@tn-nhis.example', 'first.last+tag@sub.example.co.in', "o'brien@example.com"]) {
      link.target = { type: 'email', address };
      const result = validateSiteContent('navigation', nav);
      assert.ok(result.ok, address);
      assert.equal((result.value.items.find((item: any) => item.type === 'link') as any).target.address, address);
    }
  });

  test('built-in image paths: only files of the assets folder, no traversal', () => {
    const trimmed = structuredClone(DEFAULT_SITE_CONTENT.header) as any;
    trimmed.emblem.assetId = null;
    trimmed.emblem.builtIn = ' assets/a.png ';
    const accepted = validateSiteContent('header', trimmed);
    assert.ok(accepted.ok);
    assert.equal((accepted.value as any).emblem.builtIn, 'assets/a.png');
    for (const bad of ['../assets/a.png', 'assets/../a.png', 'assets/a.svg', 'assets//a.png', '/assets/a.png', 'https://evil.example/assets/a.png', 'assets/a.png?x=1', `assets${BS}a.png`, 'assets/' + 'a'.repeat(200) + '.png']) {
      assert.equal(BUILT_IN_ASSET_PATTERN.test(bad), false, bad);
      const header = structuredClone(DEFAULT_SITE_CONTENT.header) as any;
      header.emblem.assetId = null;
      header.emblem.builtIn = bad;
      assert.equal(validateSiteContent('header', header).ok, false, bad);
    }
  });
});

