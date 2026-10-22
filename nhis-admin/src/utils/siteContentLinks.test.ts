import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_ROUTES, SITE_ROUTE_ANCHORS, type LinkTarget } from '@nhis/shared-types';
import {
  LINK_KINDS, ROUTE_PAGE_OPTIONS, ROUTE_SECTION_OPTIONS, buildPreviewUrl, describeLinkTarget, emptyLinkTarget, joinRoutePath, linkTargetText,
  liveLinkProblem, resolveClientBase, routeSelectValue, splitRoutePath, telLinkPreview,
} from './siteContentLinks';

/* ------------------------------------------------------------------ preview address */

test('preview address in development points at the dev server', () => {
  const base = resolveClientBase({ configured: undefined, production: false });
  assert.equal(base, 'http://127.0.0.1:5173');
  assert.equal(buildPreviewUrl(base, '/'), 'http://127.0.0.1:5173/?preview=1');
  assert.equal(buildPreviewUrl(base, '/hospitals'), 'http://127.0.0.1:5173/hospitals?preview=1');
});

test('preview address in a production build is relative to the IIS sub-path', () => {
  const base = resolveClientBase({ configured: undefined, production: true });
  assert.equal(base, '/TNNHIS/');
  assert.equal(buildPreviewUrl(base, '/'), '/TNNHIS/?preview=1');
  assert.equal(buildPreviewUrl(base, '/hospitals'), '/TNNHIS/hospitals?preview=1');
});

test('VITE_CLIENT_URL wins when it is an http(s) address or a path', () => {
  assert.equal(resolveClientBase({ configured: 'https://nhis.example.org/site/', production: true }), 'https://nhis.example.org/site/');
  assert.equal(buildPreviewUrl('https://nhis.example.org/site/', '/'), 'https://nhis.example.org/site/?preview=1');
  assert.equal(resolveClientBase({ configured: ' /TNNHIS/ ', production: false }), '/TNNHIS/');
  assert.equal(resolveClientBase({ configured: '', production: true }), '/TNNHIS/');
  assert.equal(resolveClientBase({ configured: null, production: false }), 'http://127.0.0.1:5173');
});

test('an unusable VITE_CLIENT_URL falls back to the default of the build', () => {
  // "/\evil.example" is read by browsers as "//evil.example": a path with a backslash is not a path of this host.
  for (const bad of ['javascript:alert(1)', 'ftp://example.org', 'tnnhis', 'http://', 'https://a b.example', '//evil.example/x y', '//evil.example/', '/\\evil.example', '/TNNHIS\\x']) {
    assert.equal(resolveClientBase({ configured: bad, production: false }), 'http://127.0.0.1:5173', bad);
    assert.equal(resolveClientBase({ configured: bad, production: true }), '/TNNHIS/', bad);
  }
});

test('preview address handles trailing slashes, a root base, relative paths and anchors', () => {
  assert.equal(buildPreviewUrl('http://127.0.0.1:5173/', '/'), 'http://127.0.0.1:5173/?preview=1');
  assert.equal(buildPreviewUrl('http://127.0.0.1:5173///', '/forms'), 'http://127.0.0.1:5173/forms?preview=1');
  assert.equal(buildPreviewUrl('/', '/'), '/?preview=1');
  assert.equal(buildPreviewUrl('/', '/gallery'), '/gallery?preview=1');
  assert.equal(buildPreviewUrl('/TNNHIS', 'forms'), '/TNNHIS/forms?preview=1');
  assert.equal(buildPreviewUrl('/TNNHIS/', '/forms#policy-lists'), '/TNNHIS/forms?preview=1#policy-lists');
  assert.equal(buildPreviewUrl('/TNNHIS/'), '/TNNHIS/?preview=1');
  assert.equal(buildPreviewUrl('/TNNHIS/', ''), '/TNNHIS/?preview=1');
});

/* ------------------------------------------------------------------ link targets */

test('a new target of each kind is empty and of that kind', () => {
  for (const kind of LINK_KINDS) {
    const target = emptyLinkTarget(kind);
    assert.equal(target.type, kind);
    assert.equal(linkTargetText(target), '');
  }
  assert.equal(LINK_KINDS.length, 5);
});

test('targets are described for summaries', () => {
  assert.equal(describeLinkTarget({ type: 'route', path: '/hospitals' }), 'Page of this site: /hospitals');
  assert.equal(describeLinkTarget({ type: 'external', url: 'https://tn-nhis.com/' }), 'Web address: https://tn-nhis.com/');
  assert.equal(describeLinkTarget(emptyLinkTarget('document')), 'Document: not chosen yet');
});

test('route paths split and join around the anchor', () => {
  assert.deepEqual(splitRoutePath('/forms#policy-lists'), { base: '/forms', anchor: 'policy-lists' });
  assert.deepEqual(splitRoutePath('/forms'), { base: '/forms', anchor: '' });
  assert.deepEqual(splitRoutePath(''), { base: '', anchor: '' });
  assert.equal(joinRoutePath('/forms', 'policy-lists'), '/forms#policy-lists');
  assert.equal(joinRoutePath('/forms', '#policy-lists'), '/forms#policy-lists');
  assert.equal(joinRoutePath('/forms', '  '), '/forms');
  assert.equal(joinRoutePath('/forms', ''), '/forms');
});

test('the page select shows the listed page or section, else the page of a custom anchor, else nothing', () => {
  assert.equal(routeSelectValue('/hospitals'), '/hospitals');
  assert.equal(routeSelectValue('/forms#policy-lists'), '/forms#policy-lists');
  assert.equal(routeSelectValue('/forms#my-own-anchor'), '/forms');
  assert.equal(routeSelectValue('/unknown'), '');
  assert.equal(routeSelectValue(''), '');
  assert.equal(ROUTE_PAGE_OPTIONS.length, SITE_ROUTES.length);
  assert.equal(ROUTE_SECTION_OPTIONS.length, SITE_ROUTE_ANCHORS.length);
  for (const option of [...ROUTE_PAGE_OPTIONS, ...ROUTE_SECTION_OPTIONS]) assert.equal(routeSelectValue(option.value), option.value);
});

test('live checks accept good values and stay quiet about empty ones', () => {
  const good: LinkTarget[] = [
    { type: 'route', path: '/forms#policy-lists' },
    { type: 'external', url: 'https://tn-nhis.com/?Pagename=TNportal' },
    { type: 'document', documentId: 'doc-1' },
    { type: 'email', address: 'help@example.org' },
    { type: 'phone', number: '+91 44 2345-6789' },
  ];
  for (const target of good) assert.equal(liveLinkProblem(target), null, JSON.stringify(target));
  for (const kind of LINK_KINDS) assert.equal(liveLinkProblem(emptyLinkTarget(kind)), null, kind);
});

test('live checks name the problem', () => {
  assert.match(liveLinkProblem({ type: 'route', path: '/nowhere' }) ?? '', /pages of this website/);
  assert.match(liveLinkProblem({ type: 'route', path: '/forms#bad anchor' }) ?? '', /section after #/);
  assert.match(liveLinkProblem({ type: 'external', url: 'http://tn-nhis.com' }) ?? '', /https:\/\//);
  assert.match(liveLinkProblem({ type: 'external', url: 'javascript:alert(1)' }) ?? '', /https:\/\//);
  assert.match(liveLinkProblem({ type: 'external', url: 'https://user:pw@example.org/' }) ?? '', /https:\/\//);
  assert.match(liveLinkProblem({ type: 'email', address: 'nobody' }) ?? '', /e-mail/);
  assert.match(liveLinkProblem({ type: 'phone', number: '12' }) ?? '', /6 to 15 digits/);
  assert.match(liveLinkProblem({ type: 'phone', number: 'call me' }) ?? '', /6 to 15 digits/);
});

test('the call link of a displayed number needs at least three digits', () => {
  assert.equal(telLinkPreview('1800-233-5666'), 'tel:18002335666');
  assert.equal(telLinkPreview('+91 44 2345 6789'), 'tel:+914423456789');
  assert.equal(telLinkPreview('12'), '');
  assert.equal(telLinkPreview(''), '');
});
