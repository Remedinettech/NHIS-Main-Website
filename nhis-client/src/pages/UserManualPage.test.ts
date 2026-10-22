import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SITE_CONTENT, MANUAL_PDF, MANUAL_VIDEO_FILES, type Locale, type SiteContentMap } from '@nhis/shared-types';

register('data:text/javascript,' + encodeURIComponent("export async function load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return next(url,context)}"));
const { SiteContentContext } = await import('../context/SiteContentContext');
const { LanguageProvider } = await import('../context/LanguageContext');
const { default: UserManualPage, isSameSiteFile, manualFileUrl } = await import('./UserManualPage');

/* ---------------------------------------------------------------- harness */

function render(content: SiteContentMap = DEFAULT_SITE_CONTENT, { preview = false, locale = 'en' }: { preview?: boolean; locale?: Locale } = {}): string {
  return renderToString(
    createElement(MemoryRouter, {},
      createElement(SiteContentContext.Provider, { value: { content, preview, previewDenied: false, status: 'ready' } },
        createElement(LanguageProvider, { initialLocale: locale, children: createElement(UserManualPage) }))),
  );
}

/** A copy of the built-in content with the given change applied. */
function edited(change: (content: SiteContentMap) => void): SiteContentMap {
  const content = structuredClone(DEFAULT_SITE_CONTENT);
  change(content);
  return content;
}

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const videoSources = (html: string) => Array.from(html.matchAll(/<video[^>]+src="([^"]+)"/g), (match) => match[1]);
const tag = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g')), (match) => match[0]);
const headings = (html: string) => Array.from(html.matchAll(/<h([1-6])\b/g), (match) => Number(match[1]));
const GOOD_UPLOAD = 'clx1abc2def3ghi4jkl5mno6';

/* ---------------------------------------------------------------- the built-in manual */

test('English and Tamil show the four local videos in workflow order and the PDF download', () => {
  for (const locale of ['en', 'ta'] as const) {
    const html = render(DEFAULT_SITE_CONTENT, { locale });
    assert.ok(html.includes('/user-manual/NHIS_User_Manual.pdf'));
    assert.equal(count(html, /<video /g), 4);
    assert.deepEqual(videoSources(html), MANUAL_VIDEO_FILES.map((path) => `/${path}`));
    assert.ok(!html.includes('<iframe'));
    assert.ok(html.includes('Pre-authorisation submission'));
  }
});

test('the PDF button downloads a file of this site and says nothing about a new tab; the page has one h1 followed by h2 headings only', () => {
  const html = render();
  const [button] = tag(html, 'a').filter((anchor) => anchor.includes(MANUAL_PDF));
  assert.ok(/ download=""/.test(button), 'a same-site file is offered as a download');
  assert.ok(/target="_blank"/.test(button) && /rel="noopener noreferrer"/.test(button), 'browsers that show a PDF keep this page open');
  const levels = headings(html);
  assert.deepEqual(levels, [1, 2, 2, 2, 2, 2], 'h1, the manual, then one h2 per video');
  assert.ok(html.indexOf('<h1') < html.indexOf('<h2'));
  assert.ok(html.includes('<h1 id="page-title" tabindex="-1">User Manual</h1>'), 'the h1 is the focus target after a route change');
});

test('every file video is a plain player: controls, only metadata until play, inline on phones, never autoplay, named by its heading', () => {
  const html = render();
  const players = tag(html, 'video');
  assert.equal(players.length, 4);
  for (const player of players) {
    assert.ok(/ controls=""/.test(player));
    assert.ok(/ preload="metadata"/.test(player));
    assert.ok(/ playsinline=""/i.test(player));
    assert.ok(!/autoplay|muted|loop/i.test(player));
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(player)?.[1] ?? '';
    assert.ok(labelledBy !== '' && html.includes(`<h2 id="${labelledBy}"`), 'the heading of the card names the video');
  }
  assert.ok(!/autoplay/i.test(html));
});

test('each video has a visible link to the file with the title for screen readers, and a text for browsers without video', () => {
  const html = render();
  assert.equal(count(html, /<video\b[^>]*>This browser cannot play the video on this page\.<\/video>/g), 4);
  const links = Array.from(html.matchAll(/<a href="(\/user-manual\/[^"]+\.mp4)"([^>]*)>(.*?)<\/a>/g), (match) => ({ href: match[1], attrs: match[2], text: match[3].replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '') }));
  assert.deepEqual(links.map((link) => link.href), MANUAL_VIDEO_FILES.map((path) => `/${path}`));
  assert.deepEqual(links.map((link) => link.text), ['Download video: Pre-authorisation submission', 'Download video: Pre-authorisation approval', 'Download video: Claims submission', 'Download video: Claims approved']);
  assert.ok(links.every((link) => / download=""/.test(link.attrs)));
});

test('Tamil keeps the page texts in Tamil and marks the English titles that have no Tamil text', () => {
  const html = render(DEFAULT_SITE_CONTENT, { locale: 'ta' });
  assert.ok(html.includes('<h1 id="page-title" tabindex="-1">பயனர் கையேடு</h1>'));
  assert.ok(html.includes('<h2 id=') && html.includes('lang="en">Pre-authorisation submission</h2>'));
  assert.ok(html.includes('இந்த உலாவியால் இந்தப் பக்கத்தில் காணொளியை இயக்க இயலாது.'));
  assert.ok(html.includes('காணொளியைப் பதிவிறக்கு'));
  assert.ok(html.includes('<span lang="en">NHIS User Manual</span>'), 'the English title of the manual is marked');
  const english = render();
  assert.ok(!/ lang="en"/.test(english), 'English text on an English page needs no lang attribute');
});

/* ---------------------------------------------------------------- the managed document */

test('reordering/hiding and uploaded preview sources follow the managed document', () => {
  const content = edited((c) => {
    c.manual.manual.visible = false;
    c.manual.videos.reverse();
    c.manual.videos[1].visible = false;
    c.manual.videos[0].source = { type: 'upload', assetId: 'test_video_asset' };
  });
  const html = render(content, { preview: true });
  assert.ok(html.includes('/api/v1/admin/files/test_video_asset'));
  assert.equal(count(html, /<video /g), 3);
  assert.ok(!html.includes('NHIS_User_Manual.pdf'));
  assert.equal(videoSources(html)[0], '/api/v1/admin/files/test_video_asset', 'the editor sees the first video first');
  assert.deepEqual(videoSources(html).slice(1), [`/${MANUAL_VIDEO_FILES[1]}`, `/${MANUAL_VIDEO_FILES[0]}`]);
  assert.ok(render(content).includes('src="/api/v1/files/test_video_asset"'), 'visitors get the public file route');
  assert.ok(!render(content).includes('/admin/'), 'the public page never points at an administration endpoint');
});

test('an uploaded PDF is offered from the files of the API, in preview from the administration', () => {
  const content = edited((c) => { c.manual.manual.source = { type: 'upload', assetId: GOOD_UPLOAD }; });
  assert.ok(render(content).includes(`href="/api/v1/files/${GOOD_UPLOAD}"`));
  assert.ok(render(content, { preview: true }).includes(`href="/api/v1/admin/files/${GOOD_UPLOAD}"`));
});

test('provider URLs are embedded safely, ordinary HTTPS links stay links, unsafe sources render nothing', () => {
  const content = edited((c) => {
    c.manual.videos[0].source = { type: 'external', url: 'https://youtu.be/dQw4w9WgXcQ' };
    c.manual.videos[1].source = { type: 'external', url: 'https://example.com/watch' };
    c.manual.videos[2].source = { type: 'external', url: 'javascript:alert(1)' };
    c.manual.videos[3].source = { type: 'external', url: 'https://drive.google.com/file/d/abcDEF12345/view' };
  });
  const html = render(content);
  assert.ok(html.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  assert.ok(html.includes('https://drive.google.com/file/d/abcDEF12345/preview'));
  assert.equal(count(html, /<iframe /g), 2);
  assert.ok(html.includes('href="https://example.com/watch"'));
  assert.ok(!html.includes('javascript:'));
  assert.equal(count(html, /<article /g), 3, 'the unsafe source is left out together with its card');
});

test('an embedded player is sandboxed, sends only the origin as referrer, has a title, a 16:9 class and never autoplays; other sites are links only', () => {
  const content = edited((c) => {
    c.manual.videos[0].source = { type: 'external', url: 'https://youtu.be/dQw4w9WgXcQ' };
    c.manual.videos[1].source = { type: 'external', url: 'https://example.com/watch' };
  });
  const html = render(content);
  const [frame] = tag(html, 'iframe');
  assert.ok(frame.includes('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"'));
  assert.ok(/referrerPolicy="strict-origin-when-cross-origin"/i.test(frame), 'origin only: YouTube refuses an embed without a Referer (error 153)');
  assert.ok(/ loading="lazy"/.test(frame));
  assert.ok(/ title="Pre-authorisation submission"/.test(frame));
  assert.ok(frame.includes('class="manual-video__player"'));
  assert.ok(!/autoplay/i.test(frame));
  assert.ok(!frame.includes('allow-top-navigation') && !frame.includes('allow-forms'));
  assert.ok(!html.includes('example.com/watch"/>') && !/<iframe[^>]*example\.com/.test(html), 'another site is never embedded');
  const links = Array.from(html.matchAll(/<a href="(https:\/\/[^"]+)"([^>]*)>/g), (match) => ({ href: match[1], attrs: match[2] }));
  assert.deepEqual(links.map((link) => link.href), ['https://youtu.be/dQw4w9WgXcQ', 'https://example.com/watch']);
  assert.ok(links.every((link) => /target="_blank"/.test(link.attrs) && /rel="noopener noreferrer"/.test(link.attrs) && !/download/.test(link.attrs)), 'other sites: new tab, no download attribute');
});

test('an editor text is shown as plain text with its line breaks, never as HTML', () => {
  const content = edited((c) => {
    c.manual.videos[0].description = { en: 'First line\nSecond <b>line</b>', ta: '' };
    c.manual.intro = { en: 'Intro <script>alert(1)</script>', ta: '' };
  });
  const html = render(content);
  assert.ok(html.includes('First line\nSecond &lt;b&gt;line&lt;/b&gt;'));
  assert.ok(html.includes('Intro &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/<b>|<script/.test(html));
  const withoutTexts = render(edited((c) => { c.manual.intro = { en: '', ta: '' }; }));
  assert.ok(!/<header class="page-header">[\s\S]*<p>/.test(withoutTexts.slice(0, withoutTexts.indexOf('</header>') + 9)), 'no empty paragraph for an empty introduction');
});

/* ---------------------------------------------------------------- nothing to show */

test('when the manual and every video are hidden or unusable the page says so', () => {
  const hidden = edited((c) => { c.manual.manual.visible = false; c.manual.videos.forEach((video) => { video.visible = false; }); });
  for (const content of [hidden, edited((c) => { c.manual.manual.visible = false; c.manual.videos = []; })]) {
    const html = render(content);
    assert.ok(html.includes('The user manual is not available yet'));
    assert.ok(html.includes('appear here as soon as they are published'));
    assert.deepEqual(headings(html), [1, 2], 'the h1 and the h2 of the message');
    assert.ok(!html.includes('<video') && !html.includes('<iframe') && !html.includes('class="btn'));
  }
  const unusable = edited((c) => {
    c.manual.manual.source = { type: 'upload', assetId: '../x' };
    c.manual.videos.forEach((video) => { video.source = { type: 'external', url: 'http://plain.example/video' }; });
  });
  assert.ok(render(unusable).includes('The user manual is not available yet'));
  assert.ok(render(hidden, { locale: 'ta' }).includes('பயனர் கையேடு இன்னும் கிடைக்கவில்லை'));
});

test('one usable video or the manual alone is not an empty page', () => {
  const onlyManual = edited((c) => { c.manual.videos = []; });
  assert.ok(!render(onlyManual).includes('not available yet'));
  const onlyVideo = edited((c) => { c.manual.manual.visible = false; c.manual.videos = c.manual.videos.slice(0, 1); });
  const html = render(onlyVideo);
  assert.ok(!html.includes('not available yet'));
  assert.equal(count(html, /<video /g), 1);
});

/* ---------------------------------------------------------------- addresses */

test('only known built-in files, well-formed upload ids and safe https addresses have an address', () => {
  assert.equal(manualFileUrl({ type: 'builtIn', path: MANUAL_PDF }, false), '/user-manual/NHIS_User_Manual.pdf');
  assert.equal(manualFileUrl({ type: 'builtIn', path: 'user-manual/other.pdf' }, false), '');
  assert.equal(manualFileUrl({ type: 'builtIn', path: '../index.html' }, false), '');
  assert.equal(manualFileUrl({ type: 'upload', assetId: GOOD_UPLOAD }, false), `/api/v1/files/${GOOD_UPLOAD}`);
  assert.equal(manualFileUrl({ type: 'upload', assetId: GOOD_UPLOAD }, true), `/api/v1/admin/files/${GOOD_UPLOAD}`);
  for (const assetId of ['', 'short', '../secret/file', 'a/b/c/d/e/f/g/h', 'id with space', `${GOOD_UPLOAD}?x=1`, 'x'.repeat(65)]) {
    assert.equal(manualFileUrl({ type: 'upload', assetId }, false), '', assetId);
  }
  assert.equal(manualFileUrl({ type: 'external', url: 'https://example.com/a' }, false), 'https://example.com/a');
  for (const url of ['http://example.com/a', 'javascript:alert(1)', 'data:text/html,x', '//example.com/a', 'https://user:pass@example.com/a', '/user-manual/x.mp4', '']) {
    assert.equal(manualFileUrl({ type: 'external', url }, false), '', url);
  }
});

test('the download attribute is only used for files that the browser serves from this site', () => {
  assert.equal(isSameSiteFile('/user-manual/NHIS_User_Manual.pdf'), true);
  assert.equal(isSameSiteFile('/TNNHIS/user-manual/NHIS_User_Manual.pdf'), true);
  assert.equal(isSameSiteFile('/TNNHISApi/api/v1/files/abc'), true);
  assert.equal(isSameSiteFile('https://api.example.com/api/v1/files/abc'), false, 'an API on another host: browsers ignore download there');
  assert.equal(isSameSiteFile('//evil.example/x.pdf'), false);
  assert.equal(isSameSiteFile('https://example.com/video'), false);
});

/* ---------------------------------------------------------------- layout */

const sheet = readFileSync(fileURLToPath(new URL('./user-manual.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The style sheet without its media queries: the rules for every screen. */
const base = sheet.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
const rule = (selector: string): Record<string, string> => {
  const found: Record<string, string> = {};
  for (const match of base.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(',').map((entry) => entry.trim()).includes(selector)) continue;
    for (const line of match[2].split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) found[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return found;
};

test('the video file and the provider player share one 16:9 box, one column down to 360 px and two from 52rem', () => {
  const player = rule('.manual-video__player');
  assert.equal(player['aspect-ratio'], '16 / 9');
  assert.equal(player.width, '100%');
  assert.equal(player.display, 'block');
  assert.equal(player['object-fit'], 'contain');
  assert.equal(rule('.manual-videos')['grid-template-columns'], 'minmax(0, 1fr)', 'one column that may shrink below its content');
  assert.equal(rule('.user-manual')['grid-template-columns'], 'minmax(0, 1fr)');
  assert.ok(/@media \(min-width: 52rem\)\s*\{\s*\.manual-videos\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(sheet));
  assert.ok(!/(?<![-\w])(min-)?width:\s*\d+(\.\d+)?px/.test(sheet), 'no fixed pixel width that could overflow a 360 px screen');
  assert.ok(Number.parseFloat(rule('.manual-video__link a')['min-height']) >= 2.75, 'a comfortable tap target');
  assert.equal(rule('.manual-video')['min-width'], '0');
});
