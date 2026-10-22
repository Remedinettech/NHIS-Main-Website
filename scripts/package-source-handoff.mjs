#!/usr/bin/env node
/**
 * Builds the clean SOURCE hand-over package (no node_modules, builds, caches, logs, secrets, database dumps, uploads,
 * tests, screenshots, AI notes or old archives) as a ZIP.
 *
 *   node scripts/package-source-handoff.mjs [--out handoff-output] [--name TN_NHIS_WEBSITE_source]
 *
 * It starts from the files git knows (tracked + untracked-but-not-ignored), removes everything on the exclusion list,
 * rewrites the package.json files so no script refers to an excluded file (the test scripts are removed from the copies),
 * verifies the result (forbidden files, credentials, script references, tsconfig/Vite/Next config references) and zips it
 * with forward-slash entries. The development repository is not modified. This script itself is development tooling and is
 * not part of the package.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = path.resolve(root, option('out', 'handoff-output'));
const baseName = option('name', 'TN_NHIS_WEBSITE_source');
if (!/^[A-Za-z0-9_-]+$/.test(baseName)) throw new Error('Package name must contain only letters, digits, underscores and hyphens.');
const stamp = new Date().toISOString().slice(0, 10);
const packageName = `${baseName}_${stamp}`;
const stage = path.join(outDir, packageName);
const zipPath = path.join(outDir, `${packageName}.zip`);

/* ------------------------------------------------------------------ what is excluded */

/** Posix-relative path patterns that never go into the package. */
const EXCLUDE = [
  [/^\.github\//, 'CI workflows (they run the excluded tests)'],
  [/^docs\//, 'documentation delivered separately'],
  [/(^|\/)zz-review-/, 'review harness'],
  [/(^|\/)(review-[^/]*|[^/]*\.scratch\.[^/]*|zz-[^/]*)$/, 'review / scratch files'],
  [/^scripts\/generate-import-templates\.ts$/, 'development tool for the import templates (the generated templates ship)'],
  [/^nhis-api\/src\/modules\/[^/]+\/README\.md$/, 'starter notes of module folders'],
  [/^\.claude\//, 'assistant workspace'],
  [/^\.verification\//, 'disposable verification files'],
  [/^(\.codex|\.agents)\//, 'assistant workspace'],
  [/(^|\/)(AGENTS|CLAUDE)\.md$/i, 'assistant notes'],
  [/^database-backup\//, 'database backup'],
  [/^deploy-package\//, 'previous deployment package'],
  [/^handoff-output\//, 'generated output'],
  [/(^|\/)node_modules\//, 'dependencies'],
  [/(^|\/)(dist|\.next|\.e2e-storage|coverage|test-results|playwright-report)\//, 'build output / reports'],
  [/^nhis-api\/(storage|uploads)\//, 'uploaded files'],
  [/^(Uploads|storage|uploads)\//, 'uploaded files'],
  [/\.tsbuildinfo$/, 'build cache'],
  [/\.(log|tmp|bak|orig|rej)$/i, 'logs / scratch'],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, 'test file'],
  [/^nhis-api\/src\/test\//, 'test support'],
  [/(^|\/)(fixtures|__fixtures__|__snapshots__|screenshots?)\//, 'test fixtures / screenshots'],
  [/^nhis-api\/tsconfig\.mine\.json$/, 'local type-check shortcut'],
  [/^PORTAL_REFINEMENT\.md$/, 'working notes'],
  [/^portal-mobile-preview\.png$/, 'screenshot'],
  [/^verification-.*\.log$/, 'test report'],
  [/^docs\/(CLAUDE-NEXT-STEPS|CONTENT_REVIEW|verification|implementation-plan)\.md$/, 'AI hand-off notes / reviews / test reports'],
  [/^scripts\/(build-snapshot|package-source-handoff)\.mjs$/, 'development tooling that needs excluded reference material'],
  [/^deploy\/tools\//, 'local IIS stand-in used only for testing'],
  [/^deploy\/sql\//, 'operator SQL: the same script ships as deploy/db/review/05-data-project-office-officials.sql'],
  [/(^|\/)\.env(\..+)?$/, 'environment file'],
  [/(^|\/)\.local-/, 'local credentials'],
  [/\.(pem|key|pfx|p12|crt|dump|backup|bak|sqlite|db)$/i, 'key / dump'],
  [/\.(zip|7z|rar|tar|gz|tgz)$/i, 'archive'],
  [/(^|\/)(Thumbs\.db|\.DS_Store)$/, 'OS file'],
];

/** Environment files that ARE shipped (templates, or public build settings without secrets). */
const KEEP_ENV = new Set([
  '.env.example', 'nhis-api/.env.example', 'nhis-client/.env.example', 'nhis-admin/.env.example',
  'nhis-client/.env.production', 'nhis-admin/.env.production',
]);
/** SQL ships only as Prisma migrations and the reviewed site-content migration pack. */
const SQL_OK = /^(nhis-api\/prisma\/migrations\/|deploy\/db\/)/;

function excludedReason(rel) {
  if (KEEP_ENV.has(rel)) return null;
  if (/\.sql$/i.test(rel)) return SQL_OK.test(rel) ? null : 'SQL outside migrations';
  for (const [pattern, reason] of EXCLUDE) if (pattern.test(rel)) return reason;
  return null;
}

/* ------------------------------------------------------------------ collect and copy */

const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const listed = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
const files = [...new Set(listed)].filter((rel) => fs.existsSync(path.join(root, rel))).sort();

const kept = [];
const dropped = new Map();
for (const rel of files) {
  const reason = excludedReason(rel);
  if (reason) dropped.set(reason, (dropped.get(reason) ?? 0) + 1);
  else kept.push(rel);
}

// Structure allow-list: anything that is not a known part of the application is a stray file and stops the build.
const ALLOWED = {
  '': ['.env.example', '.gitignore', '.nvmrc', 'README.md', 'deploy', 'nhis-admin', 'nhis-api', 'nhis-client', 'package-lock.json', 'package.json', 'packages', 'scripts'],
  'nhis-client': ['.env.example', '.env.production', 'index.html', 'package.json', 'public', 'src', 'tsconfig.json', 'vite.config.ts'],
  'nhis-admin': ['.env.example', '.env.production', 'index.html', 'package.json', 'public', 'src', 'tsconfig.json', 'vite.config.ts'],
  'nhis-api': ['.env.example', 'next-env.d.ts', 'next.config.ts', 'package.json', 'prisma', 'src', 'tsconfig.json'],
  deploy: ['build-source.ps1', 'db', 'env', 'iis', 'windows-service'],
  scripts: ['Verify-Backend.ps1', 'package-deployment.ps1'],
  packages: ['shared-types'],
};
const stray = [];
for (const rel of kept) {
  const [top, second] = rel.split('/');
  if (second === undefined) {
    if (!ALLOWED[''].includes(top)) stray.push(rel);
  } else if (!(top in ALLOWED) || top === '') {
    stray.push(rel);
  } else if (!ALLOWED[top].includes(second)) {
    stray.push(rel);
  }
}
if (stray.length) {
  console.error('Stray files that are not part of the application (move or delete them, or add them to the exclusion list):');
  for (const rel of stray) console.error(' - ' + rel);
  process.exit(1);
}

if (!outDir.startsWith(root + path.sep) || outDir === root || fs.existsSync(outDir)) throw new Error('Output must be a NEW directory beneath the repository. Choose --out with a fresh name.');
fs.mkdirSync(stage, { recursive: true });

/** package.json copies lose their test scripts (the tests are not shipped) and any script that points at an excluded file. */
function rewritePackageJson(rel, text) {
  const json = JSON.parse(text);
  const removed = [];
  if (json.scripts) {
    for (const name of Object.keys(json.scripts)) {
      const command = String(json.scripts[name]);
      const refersToTests = /\.test\.|--test|\bsrc\/test\b/.test(command);
      const refersToExcluded = (command.match(/[\w./-]+\.(?:mjs|cjs|js|ts|ps1)\b/g) ?? [])
        .some((token) => !token.startsWith('node_modules') && excludedReason(path.posix.join(path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel), token)));
      if (name === 'test' || name === 'snapshot' || refersToTests || refersToExcluded) {
        delete json.scripts[name];
        removed.push(name);
      }
    }
  }
  return { text: `${JSON.stringify(json, null, 2)}\n`, removed };
}

const rewritten = [];
for (const rel of kept) {
  const from = path.join(root, rel);
  const to = path.join(stage, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (path.posix.basename(rel) === 'package.json') {
    const { text, removed } = rewritePackageJson(rel, fs.readFileSync(from, 'utf8'));
    fs.writeFileSync(to, text);
    if (removed.length) rewritten.push(`${rel}: removed scripts ${removed.join(', ')}`);
  } else if (rel === 'nhis-api/next-env.d.ts') {
    // Next regenerates route-type imports during build; do not reference the excluded dev build in source.
    fs.writeFileSync(to, '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  } else if (rel === 'README.md') {
    fs.writeFileSync(to, '# TN-NHIS source handoff\n\nNode >=22.12. Run npm ci, npm run db:generate, npm run typecheck, npm run build. Review the separately delivered deployment guide before any migration or deployment. No tests, secrets, private uploads or generated builds are included.\n');
  } else {
    fs.copyFileSync(from, to);
  }
}

/* ------------------------------------------------------------------ verify the staged package */

const problems = [];
const staged = kept.map((rel) => rel);

// 1. nothing forbidden slipped through
for (const rel of staged) {
  const reason = excludedReason(rel);
  if (reason) problems.push(`forbidden file in package (${reason}): ${rel}`);
}

// 2. credentials: connection strings with a real-looking password, private keys, long secrets in env-like assignments
const PLACEHOLDER = /^(CHANGE_ME|PASSWORD|APP_PASSWORD|OWNER_PASSWORD|YOUR_PASSWORD|<[^>]*>|\*+|x+|scratch)$/i;
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|xml|config|sql|ps1|prisma|css|html|toml|template|example|production|txt|yml|yaml)$|\.env/;
for (const rel of staged) {
  if (!TEXT_EXT.test(rel) || rel === 'package-lock.json') continue;
  const text = fs.readFileSync(path.join(stage, rel), 'utf8');
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/([^:/\s<'"]+):([^@\s<'"]+)@/gi)) {
    if (!PLACEHOLDER.test(match[2])) problems.push(`possible database password in ${rel}: ${match[0].replace(/:[^:@]+@/, ':***@')}`);
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push(`private key material in ${rel}`);
}

// 3. every file a package script runs exists in the package
function checkScriptReferences(rel) {
  const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
  const json = JSON.parse(fs.readFileSync(path.join(stage, rel), 'utf8'));
  for (const [name, command] of Object.entries(json.scripts ?? {})) {
    for (const token of String(command).match(/[\w./\\-]+\.(?:mjs|cjs|js|ts|ps1|prisma)\b/g) ?? []) {
      if (token.includes('*') || token.startsWith('node_modules')) continue;
      const target = path.posix.join(dir, token.replace(/\\/g, '/'));
      if (!fs.existsSync(path.join(stage, target))) problems.push(`${rel} script "${name}" refers to a file that is not in the package: ${target}`);
    }
  }
}
for (const rel of staged.filter((r) => path.posix.basename(r) === 'package.json')) checkScriptReferences(rel);

// 4. tsconfig files and other config that name files
for (const rel of staged.filter((r) => /(^|\/)tsconfig[^/]*\.json$/.test(r))) {
  const json = JSON.parse(fs.readFileSync(path.join(stage, rel), 'utf8').replace(/^\uFEFF/, ''));
  const dir = path.posix.dirname(rel);
  for (const ref of [json.extends].flat().filter((x) => typeof x === 'string' && x.startsWith('.'))) {
    const target = path.posix.join(dir, ref.endsWith('.json') ? ref : `${ref}.json`);
    if (!fs.existsSync(path.join(stage, target))) problems.push(`${rel} extends a missing file: ${target}`);
  }
}

// 5. a workspace listed in the root package.json must exist
const rootPackage = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8'));
for (const workspace of rootPackage.workspaces ?? []) {
  if (workspace.endsWith('/*')) {
    if (!fs.existsSync(path.join(stage, workspace.slice(0, -2)))) problems.push(`workspace folder missing: ${workspace}`);
  } else if (!fs.existsSync(path.join(stage, workspace, 'package.json'))) problems.push(`workspace missing: ${workspace}`);
}
for (const required of ['package-lock.json', 'nhis-api/prisma/schema.prisma', 'nhis-client/public/web.config', 'nhis-admin/public/web.config', 'deploy/iis/ApiProxy/web.config']) {
  if (!fs.existsSync(path.join(stage, required))) problems.push(`required file missing: ${required}`);
}

if (problems.length) {
  console.error(`\nPackage verification FAILED (${problems.length}):`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ manifest and zip */

const manifest = [
  `TN-NHIS website - clean source hand-over (${stamp})`,
  'Only application source and the files needed to install, build and deploy it. Deployment guide is delivered separately.',
  '',
  ...staged.map((rel) => {
    const size = fs.statSync(path.join(stage, rel)).size;
    return `${String(size).padStart(10)}  ${rel}`;
  }),
  '',
];
fs.writeFileSync(path.join(stage, 'MANIFEST.txt'), manifest.join('\n'));

// bsdtar (Windows 10+) writes zip entries with forward slashes; GNU tar cannot write zip.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'zip';
if (process.platform === 'win32') {
  execFileSync(tar, ['-a', '-c', '-f', zipPath, '-C', outDir, packageName], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', zipPath, packageName], { cwd: outDir, stdio: 'inherit' });
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(`${zipPath}.sha256`, `${hash}  ${path.basename(zipPath)}\n`);

console.log(`Package folder : ${stage}`);
console.log(`ZIP            : ${zipPath} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
console.log(`SHA-256        : ${hash}`);
console.log(`Files included : ${staged.length + 1} (incl. MANIFEST.txt); excluded from git list: ${files.length - kept.length}`);
for (const [reason, count] of [...dropped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  excluded ${String(count).padStart(4)}  ${reason}`);
for (const line of rewritten) console.log(`  rewritten ${line}`);
