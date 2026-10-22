import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGACY_ALIASES, ROUTES } from './routes';

/*
 * IIS serves the build as the application /TNNHIS/ (public/web.config is copied into the build). A page of the site may
 * share its name with a folder of the build: the page /user-manual and the folder user-manual that holds the manual PDF
 * and the videos. The URL Rewrite rule that gives every page address the application's index.html must therefore treat
 * only an existing FILE as "serve as it is": with an "is not a directory" condition, the address /TNNHIS/user-manual
 * (typed, bookmarked, or reloaded with F5) would reach IIS as a folder request and be refused (403.14) instead of
 * showing the page. IIS itself cannot be run here, so these tests read the configuration.
 */

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const webConfig = readFileSync(here('../../public/web.config'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** The first rule element of the configuration, as text. */
const fallbackRule = /<rule name="TNNHIS SPA fallback"[\s\S]*?<\/rule>/.exec(webConfig)?.[0] ?? '';

test('the page fallback rule rewrites every request that is not an existing file to index.html', () => {
  assert.notEqual(fallbackRule, '', 'the rule exists');
  assert.match(fallbackRule, /<match url="\.\*"\s*\/>/);
  assert.match(fallbackRule, /<add input="\{REQUEST_FILENAME\}" matchType="IsFile" negate="true"\s*\/>/);
  assert.match(fallbackRule, /<action type="Rewrite" url="index\.html"\s*\/>/, 'application-relative target: works under any sub-path');
});

test('a folder is not excluded from the fallback, so a page that shares its name with a folder of the build is served', () => {
  assert.ok(!/IsDirectory/.test(fallbackRule), 'no "is not a directory" condition');
  const folders = readdirSync(here('../../public'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const pages = new Set([
    ...Object.values(ROUTES).map((path) => path.slice(1)),
    ...LEGACY_ALIASES.map(([legacy]) => legacy.toLowerCase()),
  ]);
  const shared = folders.filter((folder) => pages.has(folder.toLowerCase()));
  assert.ok(shared.includes('user-manual'), 'the manual folder is the reason for the rule');
  // Whatever the folders are called, none of the shared ones may be a problem: the rule has no directory exclusion at all.
  assert.ok(shared.length >= 1);
});

test('video files of the manual are served with their media type', () => {
  assert.match(webConfig, /<mimeMap fileExtension="\.mp4" mimeType="video\/mp4"\s*\/>/);
});
