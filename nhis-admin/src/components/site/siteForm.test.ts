import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONTENT, EDITABLE_TEXT_CATALOG, SITE_CONTENT_KEYS, SITE_ID_PATTERN, defaultSiteContent } from '@nhis/shared-types';
import {
  adminAssetPath, builtInFileName, builtInImageUrl, characterCount, describeAddition, describeFieldPath, describeMove, describeRemoval, emptySiteImage,
  firstError, hasErrorUnder, issuesToFieldErrors, makeSiteId, moveItem, removeItem, replaceItem, slugify, validateSiteValues,
} from './siteForm';

/* ------------------------------------------------------------------ error paths */

test('issues become field errors with dotted list indexes and the first message per path', () => {
  const errors = issuesToFieldErrors([
    { field: 'helplines[2].label.en', message: 'The English text is required.' },
    { field: 'helplines[2].label.en', message: 'Second message is ignored.' },
    { field: 'values.title.en', message: 'Too long.' },
    { field: '', message: 'The content is too large.' },
  ]);
  assert.deepEqual(errors, {
    'helplines.2.label.en': 'The English text is required.',
    'title.en': 'Too long.',
    '': 'The content is too large.',
  });
});

test('the built-in content of every document is valid, so a fresh editor shows no error', () => {
  for (const key of SITE_CONTENT_KEYS) assert.deepEqual(validateSiteValues(key, DEFAULT_SITE_CONTENT[key] as never), {}, key);
});

test('validation maps to the paths the header form reads', () => {
  const header = defaultSiteContent('header');
  header.title.en = '';
  header.helplines.push({ id: 'new-1', label: { en: '', ta: '' }, number: 'call me', visible: true });
  header.loginMenu.items.push({ id: 'new-2', label: { en: '', ta: '' }, target: { type: 'external', url: 'http://insecure.example' }, visible: true });
  header.loginMenu.forgotPassword.target = { type: 'external', url: '' };
  header.emblem = emptySiteImage();
  const errors = validateSiteValues('header', header);
  const last = header.helplines.length - 1;
  assert.ok(errors['title.en']);
  assert.ok(errors[`helplines.${last}.label.en`]);
  assert.ok(errors[`helplines.${last}.number`]);
  assert.ok(errors[`loginMenu.items.${header.loginMenu.items.length - 1}.label.en`]);
  assert.ok(errors[`loginMenu.items.${header.loginMenu.items.length - 1}.target.url`]);
  assert.ok(errors['loginMenu.forgotPassword.target.url']);
  assert.ok(errors.emblem, 'an image slot without a picture reports on the image itself');
  assert.ok(errors['emblem.alt.en'], 'and on its alt text');
});

test('validation maps to the paths the footer form reads', () => {
  const footer = defaultSiteContent('footer');
  footer.logos.push({ id: 'logo-1', image: emptySiteImage(), url: 'ftp://x', visible: true });
  footer.linkGroups.push({ id: 'group-9', heading: { en: '', ta: '' }, visible: true, links: [{ id: 'l-1', label: { en: '', ta: '' }, target: { type: 'route', path: '' }, visible: true }] });
  footer.contact.email = 'not-an-address';
  footer.contact.phone = 'abc';
  footer.copyright.en = '';
  const errors = validateSiteValues('footer', footer);
  const group = footer.linkGroups.length - 1;
  assert.ok(errors['logos.0.image']);
  assert.ok(errors['logos.0.url']);
  assert.ok(errors[`linkGroups.${group}.heading.en`]);
  assert.ok(errors[`linkGroups.${group}.links.0.label.en`]);
  assert.ok(errors[`linkGroups.${group}.links.0.target.path`]);
  assert.ok(errors['contact.email']);
  assert.ok(errors['contact.phone']);
  assert.ok(errors['copyright.en']);
});

test('HTML in text is reported on the English field', () => {
  const header = defaultSiteContent('header');
  header.subtitle.en = '<b>Scheme</b>';
  assert.match(validateSiteValues('header', header)['subtitle.en'] ?? '', /HTML/);
});

test('hasErrorUnder and firstError', () => {
  const errors = { 'helplines.2.label.en': 'x', 'helplines.20.number': 'y', title: 'z' };
  assert.equal(hasErrorUnder(errors, 'helplines.2'), true);
  assert.equal(hasErrorUnder(errors, 'helplines.20'), true);
  assert.equal(hasErrorUnder(errors, 'helplines.1'), false);
  assert.equal(hasErrorUnder(errors, 'helplines.2.label'), true);
  assert.equal(hasErrorUnder(errors, 'title'), true);
  assert.equal(hasErrorUnder(errors, 'tit'), false);
  assert.equal(firstError(errors, 'missing', 'title', 'helplines.2.label.en'), 'z');
  assert.equal(firstError(errors, 'missing'), undefined);
});

test('field paths are described for people', () => {
  assert.equal(describeFieldPath('loginMenu.items.2.label.en'), 'Login menu > Items > 3 > Label > English');
  assert.equal(describeFieldPath('partners.0.logo.alt.ta'), 'Partners > 1 > Logo > Alt > Tamil');
  assert.equal(describeFieldPath(''), 'The content');
  assert.equal(describeFieldPath('emblem.assetId'), 'Emblem > Asset id');
});

test('every interface text is named by its page and label, whatever the last word of its key is', () => {
  for (const entry of EDITABLE_TEXT_CATALOG) {
    for (const suffix of ['', '.en', '.ta']) {
      const path = `overrides.${entry.key}${suffix}`;
      assert.ok(describeFieldPath(path).startsWith(`${entry.group}: ${entry.label}`), path);
    }
  }
  // A key ending in "en" or "ta" must not lose those letters: the dots of the path are literal.
  assert.equal(describeFieldPath('overrides.unknown.ten'), 'Overrides > Unknown > Ten');
});

test('characters are counted like the shared validator does', () => {
  assert.equal(characterCount('  abc  '), 3);
  assert.equal(characterCount('a\r\nb'), 3);
  assert.equal(characterCount('தமிழ்'), 'தமிழ்'.length);
  assert.equal(characterCount('é'), 1, 'NFC composes e + combining acute');
});

/* ------------------------------------------------------------------ ids */

test('slugify keeps ASCII letters and digits only', () => {
  assert.equal(slugify('Employee Helpline!'), 'employee-helpline');
  assert.equal(slugify('  --A  B--'), 'a-b');
  assert.equal(slugify('தமிழ்'), '');
  assert.equal(slugify('Café'), 'cafe');
});

test('generated ids match the id pattern, are unique and are not repeated', () => {
  const taken = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const id = makeSiteId('Helpline', taken);
    assert.match(id, SITE_ID_PATTERN);
    assert.ok(id.startsWith('helpline-'));
    assert.ok(!taken.has(id));
    taken.add(id);
  }
});

test('ids from Tamil, empty, numeric or very long text still match the pattern', () => {
  for (const base of ['', 'தமிழ்', '123', '9 lives', '---', 'x'.repeat(200), 'Quick Links & Portals (2026)']) {
    const id = makeSiteId(base, []);
    assert.match(id, SITE_ID_PATTERN, base);
    assert.ok(id.length <= 40, base);
  }
  assert.ok(makeSiteId('', []).startsWith('item-'));
  assert.ok(makeSiteId('123', []).startsWith('item-123-'));
});

test('an id that is already taken is not generated again', () => {
  // The random source returns the same suffix twice, then a different one.
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
  let call = 0;
  const random = () => values[call++] ?? 0.9;
  const first = makeSiteId('link', [], () => 0);
  assert.equal(first, 'link-aaaa');
  const second = makeSiteId('link', [first], random);
  assert.notEqual(second, first);
  assert.match(second, SITE_ID_PATTERN);
});

/* ------------------------------------------------------------------ list operations */

test('moving items', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(items, 1, 0), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moveItem(items, 1, 2), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveItem(items, 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd'], 'the input is not modified');
});

test('moving outside the list changes nothing', () => {
  const items = ['a', 'b'];
  assert.equal(moveItem(items, 0, -1), items);
  assert.equal(moveItem(items, 1, 2), items);
  assert.equal(moveItem(items, 1, 1), items);
  assert.equal(moveItem(items, 5, 0), items);
});

test('removing and replacing items', () => {
  assert.deepEqual(removeItem(['a', 'b', 'c'], 1), ['a', 'c']);
  assert.deepEqual(removeItem(['a'], 3), ['a']);
  assert.deepEqual(replaceItem(['a', 'b', 'c'], 2, 'z'), ['a', 'b', 'z']);
});

test('announcements name the row, the direction and the position', () => {
  assert.equal(describeMove('helpline', 1, 0, 3), 'Helpline 2 moved up to position 1 of 3.');
  assert.equal(describeMove('helpline', 0, 1, 3), 'Helpline 1 moved down to position 2 of 3.');
  assert.equal(describeRemoval('helpline', 1, 2), 'Helpline 2 removed. 2 helplines left.');
  assert.equal(describeRemoval('helpline', 0, 1), 'Helpline 1 removed. 1 helpline left.');
  assert.equal(describeRemoval('helpline', 0, 0), 'Helpline 1 removed. No helplines left.');
  assert.equal(describeAddition('logo', 3, 3), 'Logo added at position 3 of 3.');
});

/* ------------------------------------------------------------------ images */

test('uploaded images are previewed through the admin file route', () => {
  assert.equal(adminAssetPath('abc_DEF-123456'), '/api/v1/admin/files/abc_DEF-123456');
  assert.equal(builtInFileName('assets/tn-government-emblem.png'), 'tn-government-emblem.png');
  assert.equal(builtInFileName('logo.png'), 'logo.png');
});

test('a new image slot has no picture, no size and empty alt text', () => {
  assert.deepEqual(emptySiteImage(), { assetId: null, builtIn: null, alt: { en: '', ta: '' }, width: null, height: null });
  assert.notEqual(emptySiteImage().alt, emptySiteImage().alt, 'every call returns its own object');
});

test('a built-in image is previewed from the public site, with or without a slash at the end of its address', () => {
  assert.equal(builtInImageUrl('/TNNHIS/', 'assets/hitpa-logo.png'), '/TNNHIS/assets/hitpa-logo.png');
  assert.equal(builtInImageUrl('/TNNHIS', 'assets/header-portrait.jpg'), '/TNNHIS/assets/header-portrait.jpg');
  assert.equal(builtInImageUrl('http://127.0.0.1:5173///', 'assets/a.webp'), 'http://127.0.0.1:5173/assets/a.webp');
  assert.equal(builtInImageUrl('/', 'assets/a.png'), '/assets/a.png');
});

test('every image that ships with the website in the built-in content has a preview address', () => {
  const images = [
    DEFAULT_SITE_CONTENT.header.emblem, DEFAULT_SITE_CONTENT.header.portrait,
    ...DEFAULT_SITE_CONTENT.partners.partners.map((partner) => partner.logo),
    ...DEFAULT_SITE_CONTENT.footer.logos.map((logo) => logo.image),
  ];
  for (const image of images) assert.ok(image.builtIn && builtInImageUrl('/TNNHIS/', image.builtIn), String(image.builtIn));
});

test('a path that is not a file of the assets folder never becomes a request address', () => {
  const stray = ['', 'logo.png', '../assets/a.png', 'assets/../a.png', '/assets/a.png', 'assets/a.svg', 'assets/a/b.png', 'https://example.org/a.png', 'javascript:alert(1)', 'assets/a.png?x=1'];
  for (const path of stray) assert.equal(builtInImageUrl('/TNNHIS/', path), null, path);
});
