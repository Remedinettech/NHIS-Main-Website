import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, type InlineNode } from '@nhis/shared-types';

/*
 * Page text (Admin: Pages) is structured, never HTML. Its links must stay inside what the content rules allow: pages of
 * this site, https addresses of other sites, one plain mail address, one plain phone number. Anything else is shown as
 * the text it is, without a link. Rendered on the server like the other component tests; CSS imports are stubbed.
 */
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, nextLoad) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return nextLoad(url, context); }",
));

const { SiteContentContext } = await import('../../context/SiteContentContext');
const { LanguageProvider } = await import('../../context/LanguageContext');
const { InlineContent } = await import('./InlineContent');

function render(nodes: InlineNode[]): string {
  return renderToString(
    createElement(MemoryRouter, {},
      createElement(SiteContentContext.Provider, { value: { content: DEFAULT_SITE_CONTENT, status: 'ready', preview: false, previewDenied: false } },
        createElement(LanguageProvider, { initialLocale: 'en', children: createElement(InlineContent, { nodes }) }))),
  );
}

const anchors = (html: string) => Array.from(html.matchAll(/<a\b([^>]*)>/g), (match) => match[1]);

test('a link to another site is an https address that opens in a new tab with noopener noreferrer', () => {
  const html = render([{ type: 'link', href: 'https://example.org/help', text: 'Help page' }]);
  const [anchor] = anchors(html);
  assert.ok(anchor.includes('href="https://example.org/help"'));
  assert.ok(anchor.includes('target="_blank"') && anchor.includes('rel="noopener noreferrer"'));
});

test('addresses that are not plain https stay text: http, javascript:, data:, protocol-relative, with credentials, relative', () => {
  for (const href of ['http://example.org/help', 'javascript:alert(1)', 'data:text/html,x', '//evil.example/x', 'https://user:secret@example.org/', 'example.org/help', 'ftp://example.org/']) {
    const html = render([{ type: 'link', href, text: 'Shown as text' }]);
    assert.deepEqual(anchors(html), [], href);
    assert.ok(html.includes('Shown as text'), href);
  }
});

test('a path of this site is a router link', () => {
  const [anchor] = anchors(render([{ type: 'link', href: '/hospitals', text: 'Hospitals' }]));
  assert.ok(anchor.includes('href="/hospitals"'));
  assert.ok(!anchor.includes('target='));
});

test('a mail address is a mailto: link only when it is one plain address', () => {
  assert.ok(anchors(render([{ type: 'mail', address: 'office@example.org' }]))[0].includes('href="mailto:office@example.org"'));
  for (const address of ['office@example.org?cc=other@example.org&subject=hi', 'a@b.org,c@d.org', 'not an address']) {
    const html = render([{ type: 'mail', address }]);
    assert.deepEqual(anchors(html), [], address);
  }
});

test('a phone number is a tel: link only for one plain number', () => {
  assert.ok(anchors(render([{ type: 'phone', number: '044 28297804', text: '044 28297804' }]))[0].includes('href="tel:04428297804"'));
  assert.deepEqual(anchors(render([{ type: 'phone', number: '044 28297804 / 044 28297805', text: 'two numbers' }])), []);
});

test('text is escaped, never interpreted as markup', () => {
  const html = render([{ type: 'text', text: '<img src=x onerror=alert(1)> & more' }, { type: 'strong', text: '<b>bold</b>' }]);
  assert.ok(!html.includes('<img') && !html.includes('<b>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; more'));
});
