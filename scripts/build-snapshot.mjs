#!/usr/bin/env node
/**
 * Build-time snapshot generator for the TN NHIS redesign.
 *
 * Reads the captured source package (reference/nhis-handoff, captured 2026-10-07 from https://tn-nhis.com/)
 * and writes:
 *   nhis-api/src/data/{pages,documents,contacts,site,gallery}.json
 *   nhis-client/public/documents/**  (byte-for-byte copies of the original PDFs)
 *
 * The raw HTML is evidence only: it is parsed here with parse5 and never shipped to a browser.
 * Text fidelity rule: only runs of ASCII whitespace are collapsed to one space and trimmed. Nothing is
 * reworded, translated, reconciled or corrected.
 *
 * Idempotent: running it twice produces identical files.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'reference', 'nhis-handoff');
const OUT = path.join(ROOT, 'nhis-api', 'src', 'data');
const PUBLIC_DOCS = path.join(ROOT, 'nhis-client', 'public', 'documents');
const CAPTURED = '2026-10-07';
const ORIGIN = 'https://tn-nhis.com';

const warnings = [];
const whitespaceFindings = [];
const warn = (m) => warnings.push(m);
function must(cond, msg) {
  if (!cond) throw new Error(`Snapshot build assertion failed: ${msg}`);
}

/* ------------------------------------------------------------------ DOM helpers */
const WS = /[ \t\r\n\f]+/g;
const collapse = (s) => s.replace(WS, ' ').trim();
const isEl = (n) => typeof n.tagName === 'string';
const kids = (n) => n.childNodes ?? [];
const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const hasClass = (n, c) => (attr(n, 'class') ?? '').split(/\s+/).includes(c);
function walk(n, fn) {
  fn(n);
  for (const c of kids(n)) walk(c, fn);
}
function findAll(n, pred) {
  const out = [];
  walk(n, (x) => {
    if (isEl(x) && pred(x)) out.push(x);
  });
  return out;
}
const find = (n, pred) => findAll(n, pred)[0];
function rawText(n) {
  let s = '';
  walk(n, (x) => {
    if (x.nodeName === '#text') s += x.value;
  });
  return s;
}
const readText = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const seenOdd = new Set();
const readHtml = (id) => {
  const text = readText(path.join(SRC, 'raw', `${id}.html`));
  const odd = text.match(new RegExp('[\u00a0\u2000-\u200b\u2028\u2029\ufeff]', 'g'));
  if (odd && !seenOdd.has(id)) warn(`raw/${id}.html contains ${odd.length} non-ASCII whitespace/zero-width characters (e.g. no-break spaces; kept untouched, only ASCII whitespace is collapsed)`);
  seenOdd.add(id);
  return parse(text);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ------------------------------------------------------------------ Document registry */
const docsJson = readJson(path.join(SRC, 'documents.json'));
const inventory = readJson(path.join(SRC, 'inventory.json'));

function normPath(href) {
  let p = href.trim().replace(/^https?:\/\/tn-nhis\.com/i, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as is */
  }
  return p.replace(/\/{2,}/g, '/');
}
const docsByPath = new Map(docsJson.map((d) => [normPath(d.url), d]));
const inventoryByPath = new Map(inventory.map((d) => [normPath(d.url), d]));

/** @type {Array<any>} */
const registry = [];
/** normalised source path -> document id (used to resolve links found on pages) */
const docByPath = new Map();
function addDoc(spec) {
  must(!registry.some((d) => d.id === spec.id), `duplicate document id ${spec.id}`);
  registry.push(spec);
  docByPath.set(normPath(spec.href), spec.id);
}

const home = readHtml('9e82c4b66abc');
const employeePage = readHtml('5c648f209dbe');
const pensionerPage = readHtml('e5958dad7601');
const howTo = readHtml('113319729b30');
const formsPage = readHtml('bb421430d08b');

// 1. Government orders: Home page menu (menu order)
{
  const anchors = findAll(home, (n) => n.tagName === 'a' && /\/pdf\/govt-orders\//.test(attr(n, 'href') ?? ''));
  must(anchors.length === 30, `expected 30 govt-order anchors (15 entries x 2 languages), got ${anchors.length}`);
  const counters = { employee: 0, pensioner: 0 };
  for (let i = 0; i < anchors.length; i += 2) {
    const en = anchors[i];
    const ta = anchors[i + 1];
    must(attr(en, 'id') === 'en' && attr(ta, 'id') === 'tn' && attr(en, 'href') === attr(ta, 'href'), `govt-order anchor pair ${i} malformed`);
    const href = attr(en, 'href');
    const audience = href.includes('/employees/') ? 'employee' : href.includes('/pensioners/') ? 'pensioner' : null;
    must(audience, `cannot determine audience of ${href}`);
    const n = /go-no-(\d+)-/.exec(href)?.[1];
    must(n, `cannot read G.O. number from ${href}`);
    counters[audience] += 1;
    addDoc({
      id: `go-${audience}-${n}`,
      category: `govt-order-${audience}`,
      audience,
      order: counters[audience],
      label: { en: collapse(rawText(en)), ta: collapse(rawText(ta)) },
      href,
    });
  }
  must(counters.employee === 7 && counters.pensioner === 8, 'expected 7 employee + 8 pensioner govt orders');
}

// 2. Non-payable items PDFs (policy pages)
for (const [audience, page] of [['employee', employeePage], ['pensioner', pensionerPage]]) {
  const en = find(find(page, (n) => n.tagName === 'section' && attr(n, 'id') === 'en'), (n) => n.tagName === 'a');
  const ta = find(find(page, (n) => n.tagName === 'section' && attr(n, 'id') === 'tn'), (n) => n.tagName === 'a');
  must(attr(en, 'href') === attr(ta, 'href'), `${audience} policy page non-payable links differ`);
  addDoc({
    id: `policy-non-payable-${audience}`,
    category: 'policy-non-payable',
    audience,
    order: audience === 'employee' ? 1 : 2,
    label: { en: collapse(rawText(en)), ta: collapse(rawText(ta)) },
    href: attr(en, 'href'),
  });
}

// 3. Enrolment key-benefit guides ("Read more") and annexure forms (How to Enroll page)
{
  const guides = findAll(howTo, (n) => n.tagName === 'a' && /\/key-benefits\//.test(attr(n, 'href') ?? ''));
  must(guides.length === 2, 'expected 2 key-benefit guide links');
  guides.forEach((a, i) => {
    const href = attr(a, 'href');
    const audience = href.includes('enrolment-employee') ? 'employee' : href.includes('enrolment-pensioner') ? 'pensioner' : null;
    must(audience, `cannot determine guide audience for ${href}`);
    addDoc({ id: `enrolment-guide-${audience}`, category: 'enrolment-guide', audience, order: i + 1, label: { en: collapse(rawText(a)), ta: '' }, href });
  });

  const cards = findAll(howTo, (n) => hasClass(n, 'enrol-card'));
  const taCards = findAll(formsPage, (n) => hasClass(n, 'download-fle'));
  must(cards.length === 2 && taCards.length === 2, 'expected 2 enrolment form cards on each page');
  const ids = ['form-annexure-vi', 'form-annexure-iii'];
  const audiences = ['employee', 'pensioner'];
  cards.forEach((card, i) => {
    const label = collapse(rawText(find(card, (n) => n.tagName === 'p')));
    const taLabel = collapse(rawText(find(taCards[i], (n) => n.tagName === 'p' && attr(n, 'id') === 'tn')));
    must(i === 0 ? /ANNEXURE - VI$/.test(label) && /VI$/.test(taLabel) : /ANNEXURE - III$/.test(label) && /III$/.test(taLabel), `form card ${i} labels do not match expected annexure`);
    addDoc({ id: ids[i], category: 'enrolment-form', audience: audiences[i], order: i + 1, label: { en: label, ta: taLabel }, href: attr(find(card, (n) => n.tagName === 'a'), 'href') });
  });
}

// 4. Hospital suspension notices (home page footer)
{
  const blinks = findAll(home, (n) => n.tagName === 'div' && hasClass(n, 'blink'));
  must(blinks.length === 2, 'expected 2 suspension notice blocks');
  for (const b of blinks) {
    const lang = attr(b, 'id') === 'en' ? 'en' : 'ta';
    const a = find(b, (n) => n.tagName === 'a');
    const text = collapse(rawText(a));
    addDoc({
      id: `notice-suspension-${lang}`,
      category: 'hospital-suspension',
      audience: 'all',
      order: lang === 'en' ? 1 : 2,
      label: lang === 'en' ? { en: text, ta: '' } : { en: '', ta: text },
      href: attr(a, 'href'),
      language: lang,
      versionGroup: 'hospital-suspension-notice',
    });
  }
}

/* ------------------------------------------------------------------ Build DocumentRecord[] and copy PDFs */
const CATEGORY_ORDER = ['govt-order-employee', 'govt-order-pensioner', 'policy-non-payable', 'enrolment-guide', 'enrolment-form', 'hospital-suspension'];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function splitLabel(label, marker) {
  const m = new RegExp(`^(.*), ${marker} (.+)$`).exec(label);
  if (m && `${m[1]}, ${marker} ${m[2]}` === label) return { title: m[1], date: m[2] };
  return { title: label, date: null };
}
function isoFromLabelDate(s) {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s ?? '');
  const month = m && MONTHS[m[2].slice(0, 3).toLowerCase()];
  return m && month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function fileNameDate(href) {
  const m = /-dated-(\d{1,2})-(\d{1,2})-(\d{4})\.pdf$/i.exec(normPath(href));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function localRel(href) {
  let p = normPath(href);
  if (p.startsWith('/TNAssests/pdf/')) p = p.slice('/TNAssests/pdf/'.length);
  else if (p.startsWith('/Resources/Documents/')) p = `notices/${p.slice('/Resources/Documents/'.length)}`;
  else throw new Error(`Unexpected document path ${p}`);
  return p.replace(/\/{2,}/g, '/').replace(/ /g, '-');
}

const employeeEnglishText = textOfPolicyEnglish(employeePage);
function textOfPolicyEnglish(page) {
  return collapse(rawText(find(page, (n) => n.tagName === 'section' && attr(n, 'id') === 'en')));
}

const records = [];
for (const spec of registry) {
  const key = normPath(spec.href);
  const meta = docsByPath.get(key);
  const sourceUrl = /^https?:/i.test(spec.href) ? spec.href : `${ORIGIN}${spec.href}`;
  const en = splitLabel(spec.label.en, 'Dated');
  const ta = splitLabel(spec.label.ta, 'தேதி');
  const rec = {
    id: spec.id,
    category: spec.category,
    audience: spec.audience,
    order: spec.order,
    label: spec.label,
    title: { en: en.title, ta: ta.title },
    dateLabel: { en: en.date, ta: ta.date },
    sourceUrl,
    localPath: null,
    availability: 'unavailable',
    notes: [],
  };
  if (meta) {
    rec.localPath = `/documents/${localRel(spec.href)}`;
    rec.availability = 'available';
    rec.pages = meta.pages;
    rec.bytes = fs.statSync(path.join(SRC, meta.local_file)).size;
    rec.sha256 = meta.sha256;
    rec.hasTextIndex = meta.extracted_characters > 0;
    rec._localFile = meta.local_file;
    rec._textFile = meta.text_file;
    rec._chars = meta.extracted_characters;
  } else {
    const inv = inventoryByPath.get(key);
    must(inv && !inv.file, `${spec.id}: no file in documents.json and no failed inventory entry`);
    rec.availabilityNote = `At capture (${CAPTURED}) the source URL returned "${inv.error}"; no file could be retrieved.`;
  }
  const fnd = spec.category.startsWith('govt-order') ? fileNameDate(spec.href) : null;
  if (fnd) {
    rec.fileNameDate = fnd;
    const labelIso = isoFromLabelDate(rec.dateLabel.en);
    must(labelIso, `${spec.id}: cannot parse label date "${rec.dateLabel.en}"`);
    if (labelIso !== fnd) {
      rec.notes.push(`Label date (${rec.dateLabel.en}) differs from the date in the file name (${fnd}). The source does not say which is authoritative; the file name is shown for comparison only.`);
    }
  }
  if (spec.language) rec.language = spec.language;
  if (spec.versionGroup) rec.versionGroup = spec.versionGroup;
  records.push(rec);
}
// Source observation specific to G.O.Ms.No.160 (cited by the employee policy page)
{
  const g160 = records.find((r) => r.id === 'go-employee-160');
  if (/G\.O\.Ms\.No\.160, Finance\(Salaries\) Department, Dated:30\.06\.2021/.test(employeeEnglishText)) {
    g160.notes.push('The employee policy page cites this order as "Dated:30.06.2021".');
  } else warn('Employee policy page no longer cites G.O.Ms.No.160 as Dated:30.06.2021; note not added');
}
// Unavailable pensioner 199
{
  const r = records.find((x) => x.id === 'go-pensioner-199');
  must(r.availability === 'unavailable', 'go-pensioner-199 must be unavailable');
  r.notes.push('The employee G.O.(Rt).No.199 file (go-employee-199) has a different source URL and is not used as a substitute.');
}
// Identical bytes
{
  const groups = new Map();
  for (const r of records) if (r.sha256) groups.set(r.sha256, [...(groups.get(r.sha256) ?? []), r.id]);
  for (const [hash, ids] of groups) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const others = ids.filter((x) => x !== id);
      records.find((r) => r.id === id).notes.push(`Identical file bytes (sha256 ${hash.slice(0, 12)}...) to ${others.join(', ')}; the source lists them at distinct URLs.`);
    }
  }
  // Identical extracted text but different bytes
  const textGroups = new Map();
  for (const r of records) {
    if (!r._textFile || !r._chars) continue;
    const h = sha256(readText(path.join(SRC, r._textFile)));
    textGroups.set(h, [...(textGroups.get(h) ?? []), r]);
  }
  for (const list of textGroups.values()) {
    for (const r of list) {
      const others = list.filter((o) => o !== r && o.sha256 !== r.sha256).map((o) => o.id);
      if (others.length) r.notes.push(`Automated text extraction is identical to ${others.join(', ')} although the file bytes differ.`);
    }
  }
  // Suspension notices: different bytes, no declared authority
  const en = records.find((r) => r.id === 'notice-suspension-en');
  const ta = records.find((r) => r.id === 'notice-suspension-ta');
  must(en.sha256 !== ta.sha256, 'suspension notices were expected to differ');
  for (const [r, o] of [[en, ta], [ta, en]]) {
    r.notes.push(`File bytes differ from ${o.id} (sha256 ${r.sha256.slice(0, 12)}... vs ${o.sha256.slice(0, 12)}...; extracted text ${r._chars} vs ${o._chars} characters). The source does not declare either file authoritative; they are kept as separate versions.`);
  }
  en.notes.push('Link text in the source is the generic "Click here"; the notice sentence is "The hospitals have been temporarily suspended from the TNHIS network."');
  ta.notes.push('Link text in the source is "பார்க்க இங்கே கிளிக் செய்யவும்"; it belongs to the Tamil notice sentence on the home page.');
}
records.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.order - b.order);

// Copy PDFs byte-for-byte and verify
const verification = { copied: 0, verified: 0, failed: [] };
for (const r of records) {
  if (!r._localFile) continue;
  const srcFile = path.join(SRC, r._localFile);
  const dest = path.join(PUBLIC_DOCS, r.localPath.replace(/^\/documents\//, ''));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const srcBuf = fs.readFileSync(srcFile);
  if (sha256(srcBuf) !== r.sha256) verification.failed.push(`${r.id}: source file hash differs from documents.json`);
  if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(srcBuf)) {
    fs.copyFileSync(srcFile, dest);
    verification.copied += 1;
  }
  if (sha256(fs.readFileSync(dest)) === r.sha256) verification.verified += 1;
  else verification.failed.push(`${r.id}: copied file hash mismatch`);
}
must(verification.failed.length === 0, `PDF verification failed: ${verification.failed.join('; ')}`);
for (const r of records) for (const k of Object.keys(r)) if (k.startsWith('_')) delete r[k];

/* ------------------------------------------------------------------ Inline / block conversion */
function noteTabs(ctx, value) {
  const re = /\S\t+\S/g;
  let m;
  while ((m = re.exec(value))) {
    const from = Math.max(0, m.index - 14);
    whitespaceFindings.push({ page: ctx.slug, lang: ctx.lang, snippet: value.slice(from, m.index + m[0].length + 14), match: m[0] });
  }
}

function linkToken(a, ctx) {
  const href = (attr(a, 'href') ?? '').trim();
  const raw = rawText(a);
  if (/^(mailto:)?[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/i.test(href)) {
    const shown = collapse(raw);
    if (href.replace(/^mailto:/i, '').toLowerCase() !== shown.toLowerCase()) warn(`${ctx.slug}/${ctx.lang}: mail link target "${href}" differs from displayed text "${shown}"`);
    ctx.mails.push(shown);
    return { k: 'sp', raw, build: (t) => ({ type: 'mail', address: t }) };
  }
  if (/^tel:/i.test(href)) {
    return { k: 'sp', raw, build: (t) => ({ type: 'phone', number: href.replace(/^tel:/i, ''), text: t }) };
  }
  const id = docByPath.get(normPath(href));
  if (id) {
    ctx.docIds.add(id);
    return { k: 'sp', raw, build: (t) => ({ type: 'document', documentId: id, text: t }) };
  }
  if (/\.pdf$/i.test(normPath(href))) warn(`${ctx.slug}/${ctx.lang}: PDF link ${href} is not in the document registry`);
  return { k: 'sp', raw, build: (t) => ({ type: 'link', href, text: t }) };
}

function inlineTokens(node, ctx, out = []) {
  for (const c of kids(node)) {
    if (c.nodeName === '#text') {
      noteTabs(ctx, c.value);
      out.push({ k: 'text', s: c.value });
    } else if (isEl(c)) {
      if (c.tagName === 'br') out.push({ k: 'text', s: ' ' });
      else if (c.tagName === 'strong' || c.tagName === 'b') out.push({ k: 'sp', raw: rawText(c), build: (t) => ({ type: 'strong', text: t }) });
      else if (c.tagName === 'a') out.push(linkToken(c, ctx));
      else inlineTokens(c, ctx, out);
    }
  }
  return out;
}

function finalizeInline(tokens) {
  const flat = [];
  for (const t of tokens) {
    if (t.k === 'text') flat.push(t.s);
    else {
      const m = /^([ \t\r\n\f]*)([\s\S]*?)([ \t\r\n\f]*)$/.exec(t.raw);
      if (m[1]) flat.push(' ');
      if (collapse(m[2])) flat.push({ node: t.build(collapse(m[2])) });
      if (m[3]) flat.push(' ');
    }
  }
  const merged = [];
  let buf = null;
  for (const f of flat) {
    if (typeof f === 'string') buf = (buf ?? '') + f;
    else {
      if (buf !== null) merged.push(buf);
      buf = null;
      merged.push(f.node);
    }
  }
  if (buf !== null) merged.push(buf);
  const out = merged.map((m) => (typeof m === 'string' ? m.replace(WS, ' ') : m));
  if (typeof out[0] === 'string') out[0] = out[0].replace(/^ /, '');
  if (typeof out[out.length - 1] === 'string') out[out.length - 1] = out[out.length - 1].replace(/ $/, '');
  return out.filter((m) => typeof m !== 'string' || m.length > 0).map((m) => (typeof m === 'string' ? { type: 'text', text: m } : m));
}

const inlineOf = (node, ctx) => finalizeInline(inlineTokens(node, ctx));

function prevElementIsBr(list, i) {
  for (let j = i - 1; j >= 0; j -= 1) {
    const p = list[j];
    if (p.nodeName === '#text' && !p.value.trim()) continue;
    return isEl(p) && p.tagName === 'br';
  }
  return false;
}

function listFrom(el, ctx) {
  const hoisted = [];
  const items = [];
  for (const li of kids(el)) {
    if (!isEl(li) || li.tagName !== 'li') continue;
    const tokens = [];
    let children;
    const lc = kids(li);
    lc.forEach((c, i) => {
      if (isEl(c) && (c.tagName === 'ol' || c.tagName === 'ul')) {
        must(!children, `${ctx.slug}/${ctx.lang}: list item with more than one nested list`);
        const nested = listFrom(c, ctx);
        children = nested.list;
        hoisted.push(...nested.hoisted);
      } else if (isEl(c) && c.tagName === 'a' && docByPath.has(normPath(attr(c, 'href') ?? '')) && prevElementIsBr(lc, i)) {
        // A standalone link placed on its own line inside a list item becomes a document link block after the list.
        const [node] = finalizeInline([linkToken(c, ctx)]);
        hoisted.push({ type: 'documentLink', documentId: node.documentId, text: node.text });
      } else {
        tokens.push(...(c.nodeName === '#text' ? (noteTabs(ctx, c.value), [{ k: 'text', s: c.value }]) : isEl(c) ? inlineTokens({ childNodes: [c] }, ctx) : []));
      }
    });
    const item = { content: finalizeInline(tokens) };
    if (children) item.children = children;
    items.push(item);
  }
  return { list: { type: 'list', ordered: el.tagName === 'ol', items }, hoisted };
}

function blocksFrom(parent, ctx) {
  const blocks = [];
  let loose = [];
  const flush = () => {
    if (!loose.length) return;
    const nodes = finalizeInline(loose);
    loose = [];
    if (!nodes.length) return;
    if (nodes.length === 1 && nodes[0].type === 'document') blocks.push({ type: 'documentLink', documentId: nodes[0].documentId, text: nodes[0].text });
    else blocks.push({ type: 'paragraph', content: nodes });
  };
  for (const c of kids(parent)) {
    if (c.nodeName === '#text') {
      noteTabs(ctx, c.value);
      loose.push({ k: 'text', s: c.value });
      continue;
    }
    if (!isEl(c)) continue;
    const tag = c.tagName;
    if (tag === 'p') {
      flush();
      const nodes = inlineOf(c, ctx);
      if (nodes.length) blocks.push({ type: 'paragraph', content: nodes });
    } else if (tag === 'ol' || tag === 'ul') {
      flush();
      const { list, hoisted } = listFrom(c, ctx);
      blocks.push(list, ...hoisted);
    } else if (tag === 'div') {
      flush();
      blocks.push(...blocksFrom(c, ctx));
    } else if (/^h[1-6]$/.test(tag)) {
      flush(); // headings are consumed by the caller
    } else if (tag === 'br') {
      loose.push({ k: 'text', s: ' ' });
    } else if (['script', 'style', 'link', 'meta', 'title'].includes(tag)) {
      continue;
    } else {
      loose.push(...inlineTokens({ childNodes: [c] }, ctx));
    }
  }
  flush();
  return blocks;
}

function finishSections(sections, keys, lang, slug) {
  if (keys) must(keys.length === sections.length, `${slug}/${lang}: expected ${keys.length} sections, found ${sections.length}`);
  const ids = new Set();
  return sections.map((s, i) => {
    const key = keys?.[i] ?? undefined;
    const id = key ?? (lang === 'en' ? `s${i + 1}` : `ta-s${i + 1}`);
    must(!ids.has(id), `${slug}/${lang}: duplicate section id ${id}`);
    ids.add(id);
    const sec = { id };
    if (key) sec.key = key;
    if (s.heading !== undefined) sec.heading = s.heading;
    sec.blocks = s.blocks;
    return sec;
  });
}

const newCtx = (slug, lang, shared) => ({ slug, lang, docIds: shared.docIds, mails: shared.mails });

/* Policy pages: <section id="en|tn"> with <h3> title and <div><h4/>...</div> groups */
function policyLocalized(doc, lang, shared, slug, keys) {
  const ctx = newCtx(slug, lang, shared);
  const sec = find(doc, (n) => n.tagName === 'section' && attr(n, 'id') === lang);
  must(sec, `${slug}: section#${lang} not found`);
  const title = collapse(rawText(find(sec, (n) => n.tagName === 'h3')));
  const sections = [];
  for (const div of kids(sec)) {
    if (!isEl(div) || div.tagName !== 'div') continue;
    const h4 = kids(div).find((c) => isEl(c) && c.tagName === 'h4');
    must(h4, `${slug}/${lang}: section without h4`);
    sections.push({ heading: collapse(rawText(h4)), blocks: blocksFrom(div, ctx) });
  }
  return { title, sections: finishSections(sections, keys, lang, slug) };
}

/* Pages whose content is a flat run of elements carrying id="en" / id="tn" */
function langNodes(container, lang) {
  const out = [];
  (function rec(n) {
    for (const c of kids(n)) {
      if (!isEl(c)) continue;
      if (attr(c, 'id') === lang) out.push(c);
      else rec(c);
    }
  })(container);
  return out;
}
const contentColumn = (doc) => find(doc, (n) => hasClass(n, 'bottom40'));

function flatLocalized(doc, lang, shared, slug, keys) {
  const ctx = newCtx(slug, lang, shared);
  let title = '';
  const sections = [];
  let cur = null;
  for (const n of langNodes(contentColumn(doc), lang)) {
    if (n.tagName === 'h1') title = collapse(rawText(n));
    else if (n.tagName === 'h2') {
      cur = { heading: collapse(rawText(n)), blocks: [] };
      sections.push(cur);
    } else if (n.tagName === 'p') {
      if (!cur) {
        cur = { blocks: [] };
        sections.push(cur);
      }
      cur.blocks.push({ type: 'paragraph', content: inlineOf(n, ctx) });
    } else warn(`${slug}/${lang}: unhandled <${n.tagName}> element`);
  }
  must(title, `${slug}/${lang}: title not found`);
  return { title, sections: finishSections(sections, keys, lang, slug) };
}

function formsLocalized(doc, lang, shared) {
  const slug = 'forms';
  const ctx = newCtx(slug, lang, shared);
  const nodes = langNodes(contentColumn(doc), lang);
  let title = '';
  const sections = [{ blocks: [] }];
  const cardDocs = ['form-annexure-vi', 'form-annexure-iii'];
  let card = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.tagName === 'h1') title = collapse(rawText(n));
    else if (n.tagName === 'p' && nodes[i + 1]?.tagName === 'a') {
      const a = nodes[(i += 1)];
      const documentId = cardDocs[card++];
      must(documentId, 'more download cards than expected on forms page');
      ctx.docIds.add(documentId);
      // The source href is the relative URL "Download3" (HTTP 500 at capture); the registry document replaces it.
      must(attr(a, 'href') === 'Download3', `unexpected forms download href ${attr(a, 'href')}`);
      sections.push({ heading: collapse(rawText(n)), blocks: [{ type: 'documentLink', documentId, text: collapse(rawText(a)) }] });
    } else if (n.tagName === 'p') {
      sections[0].blocks.push({ type: 'paragraph', content: inlineOf(n, ctx) });
    } else warn(`forms/${lang}: unhandled <${n.tagName}>`);
  }
  must(card === 2, 'forms page: expected 2 download cards');
  return { title, sections: finishSections(sections, [null, 'annexure-vi', 'annexure-iii'], lang, slug) };
}

function howToLocalized(doc, shared, title) {
  const slug = 'how-to-enroll';
  const ctx = newCtx(slug, 'en', shared);
  const root = find(doc, (n) => hasClass(n, 'key-benefits'));
  must(root, 'how-to-enroll: .key-benefits not found');
  const sections = [];
  for (const panel of findAll(root, (n) => hasClass(n, 'panel-body'))) {
    const h2 = find(panel, (n) => n.tagName === 'h2');
    sections.push({ heading: collapse(rawText(h2)), blocks: blocksFrom(panel, ctx) });
  }
  const h3 = kids(root).find((c) => isEl(c) && c.tagName === 'h3');
  must(h3, 'how-to-enroll: h3 not found');
  const rest = [];
  let seen = false;
  for (const c of kids(root)) {
    if (c === h3) seen = true;
    else if (seen && isEl(c)) rest.push(c);
  }
  sections.push({ heading: collapse(rawText(h3)), blocks: rest.flatMap((c) => blocksFrom({ childNodes: [c] }, ctx)) });
  return { title, sections: finishSections(sections, null, 'en', slug) };
}

/* ------------------------------------------------------------------ Pages */
const textOfLoc = (loc) => (loc ? JSON.stringify(loc) : '');
function assertIncludes(loc, needle, label) {
  must(textOfLoc(loc).includes(JSON.stringify(needle).slice(1, -1)), `review note fact not found in source text: ${label}`);
}

const pageDefs = [];
const pages = [];
function buildPage(slug, rawId, legacyPath, build) {
  const doc = readHtml(rawId);
  const shared = { docIds: new Set(), mails: [] };
  const { en, ta, reviewNotes } = build(doc, shared);
  pages.push({
    slug,
    legacyPaths: [legacyPath],
    sourceUrl: `${ORIGIN}${legacyPath}`,
    capturedAt: CAPTURED,
    en,
    ta,
    documentIds: [...shared.docIds],
    reviewNotes,
  });
  pageDefs.push({ slug, shared });
}

// Navigation labels (home page main nav and tab lists) used for the notes below
const navLabel = (href, lang) => {
  const a = find(home, (n) => n.tagName === 'a' && attr(n, 'href') === href && attr(n, 'id') === lang);
  return a ? collapse(rawText(a)) : null;
};
const coverageDoc = readHtml('19d6f02a1507');
const tabLabel = (href, lang) => {
  const a = find(coverageDoc, (n) => n.tagName === 'a' && attr(n, 'href') === href && attr(n, 'id') === lang);
  return a ? collapse(rawText(a)) : null;
};

buildPage('employee-policy', '5c648f209dbe', '/Account/Employeesscheme', (doc, shared) => {
  const en = policyLocalized(doc, 'en', shared, 'employee-policy', ['about', null, 'eligibility', 'scope', 'eligible-expenses', 'non-payable']);
  const ta = policyLocalized(doc, 'tn', shared, 'employee-policy', ['about', 'eligibility', 'scope', 'eligible-expenses', 'non-payable']);
  assertIncludes(en, '01-07-2021 to 30-06-2025', 'employee English period');
  assertIncludes(ta, '01.07.2021. முதல் 30.06.2025', 'employee Tamil period');
  assertIncludes(en, 'attain the age of 25 years', 'employee English age 25');
  assertIncludes(ta, 'உச்ச வயது வரம்பின்றி', 'employee Tamil no upper age limit');
  assertIncludes(en, 'th e employee', 'employee English split word (tab collapsed)');
  assertIncludes(en, 'Annexure-I of G.O.Ms.No.160', 'employee English Annexure-I');
  assertIncludes(ta, 'அட்டவணை 1A', 'employee Tamil Annexure 1A');
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'employee-policy-period', severity: 'warning', text: 'The published scheme period is 01-07-2021 to 30-06-2025 (English) and 01.07.2021 to 30.06.2025 (Tamil). The capture date (2026-10-07) is after the end of that period, so the text may be outdated. No renewal period is inferred.' },
      { id: 'employee-policy-age-conflict', severity: 'warning', text: 'Material conflict, not reconciled: the English eligibility text covers children "till they get employed or married or attain the age of 25 years whichever is earlier", while the Tamil text says children are covered without an upper age limit (உச்ச வயது வரம்பின்றி). Both are preserved exactly as published.' },
      { id: 'employee-policy-structure', severity: 'warning', text: 'The English and Tamil section lists differ: English has a separate "Coverage" section that Tamil lacks; the English eligibility list has 4 numbered points (including organisations registered under the Tamil Nadu Registration of Societies Act, 1975) and the Tamil list has 3; English cites "Annexure-I" of G.O.Ms.No.160 while Tamil cites "அட்டவணை 1A". The two languages are kept as independent section lists.' },
      { id: 'employee-policy-go160-date', severity: 'info', text: 'The page cites G.O.Ms.No.160 as dated 30.06.2021; the Govt Orders menu labels it "29 June 2021" and its file name contains 15-07-2021.' },
      { id: 'employee-policy-tab', severity: 'info', text: 'The English text of the last family-member item contains a tab character inside the word "the" ("th<TAB>e employee"). Whitespace normalisation yields "th e employee"; it is preserved as normalised, not corrected.' },
    ],
  };
});

buildPage('pensioner-policy', 'e5958dad7601', '/Account/Pensionersscheme', (doc, shared) => {
  const keys = ['about', 'eligibility', 'scope', 'non-payable'];
  const en = policyLocalized(doc, 'en', shared, 'pensioner-policy', keys);
  const ta = policyLocalized(doc, 'tn', shared, 'pensioner-policy', keys);
  assertIncludes(en, '01-07-2022 to 30-06-2026', 'pensioner English period');
  assertIncludes(en, 'AAll the Pensioners', 'pensioner English AAll');
  assertIncludes(ta, '01-07-2022 முதல் 30-06-2026', 'pensioner Tamil period');
  assertIncludes(ta, 'இத்திட்டம்', 'pensioner Tamil split paragraph');
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'pensioner-policy-period', severity: 'warning', text: 'The published scheme period is 01-07-2022 to 30-06-2026 (English and Tamil). The capture date (2026-10-07) is after the end of that period, so the text may be outdated. No renewal period is inferred.' },
      { id: 'pensioner-policy-typo', severity: 'info', text: 'The English eligibility text begins "AAll the Pensioners" in the source (typo preserved).' },
      { id: 'pensioner-policy-split-paragraph', severity: 'info', text: 'The Tamil "About" text is split across two paragraphs in the source; the first ends mid-sentence with "இத்திட்டம்". Preserved as published.' },
    ],
  };
});

buildPage('coverage', '19d6f02a1507', '/Home/Coverage', (doc, shared) => {
  const en = flatLocalized(doc, 'en', shared, 'coverage', null);
  const ta = flatLocalized(doc, 'tn', shared, 'coverage', null);
  const taNav = tabLabel('/Home/Coverage', 'tn');
  must(taNav === 'காப்புறு' && ta.title === 'கவரேஜ்', 'coverage Tamil title / nav label changed');
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'coverage-tamil-title', severity: 'info', text: 'The Tamil page heading is "கவரேஜ்", while the Tamil navigation label for this page is "காப்புறு" (the same label is used as the Tamil heading of the Grievances page).' },
    ],
  };
});

buildPage('eligibility', '8ec64a96db59', '/Home/Eligibility', (doc, shared) => {
  const en = flatLocalized(doc, 'en', shared, 'eligibility', null);
  const ta = flatLocalized(doc, 'tn', shared, 'eligibility', null);
  assertIncludes(ta, 'மாவட்ட கருவூலம்/ துணை- கருவூலம்.', 'eligibility Tamil pensioner statement ending');
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'eligibility-tamil-pensioner', severity: 'info', text: 'The Tamil pensioner statement ends after the office names ("... சென்னை, மாவட்ட கருவூலம்/ துணை- கருவூலம்.") with no verb and no term corresponding to "Pension Pay Office" in the English statement. Wording is preserved as published, not corrected.' },
      { id: 'eligibility-paired-order', severity: 'info', text: 'The English and Tamil paragraphs of this page appear in the same order in the source; the page has no section headings.' },
    ],
  };
});

buildPage('how-to-enroll', '113319729b30', '/Account/HowtoEnrol', (doc, shared) => {
  const title = tabLabel('/Account/HowtoEnrol', 'en');
  must(title === 'How to Enroll', 'how-to-enroll navigation label changed');
  const en = howToLocalized(doc, shared, title);
  const bodyText = collapse(rawText(find(doc, (n) => hasClass(n, 'key-benefits'))));
  must(!/[஀-௿]/.test(bodyText), 'how-to-enroll body unexpectedly contains Tamil text');
  return {
    en,
    ta: null,
    reviewNotes: [
      { id: 'how-to-enroll-english-only', severity: 'info', text: 'The captured page body is English only; the source has no Tamil text for this page (the Tamil navigation label "பதிவு செய்வது எப்படி" exists on other pages). Nothing was translated.' },
      { id: 'how-to-enroll-title', severity: 'info', text: 'The page body has no page heading; the title "How to Enroll" is the English navigation tab label used on the Coverage, Eligibility and Forms pages.' },
      { id: 'how-to-enroll-read-more', severity: 'info', text: 'In the source each "Read more" link sits on its own line inside the last list item of the employee / pensioner eligibility lists. It is shown as a document link directly after the corresponding list.' },
    ],
  };
});

buildPage('forms', 'bb421430d08b', '/Home/Froms_Download', (doc, shared) => {
  const en = formsLocalized(doc, 'en', shared);
  const ta = formsLocalized(doc, 'tn', shared);
  const hrefs = findAll(doc, (n) => n.tagName === 'a' && attr(n, 'href') === 'Download3');
  must(hrefs.length === 4, `forms: expected 4 Download3 links, found ${hrefs.length}`);
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'forms-download3-http500', severity: 'warning', text: 'Functional correction: all four Download links on the source page (two per language) point to the relative URL "Download3", which returned HTTP 500 at capture. Here the Annexure VI and Annexure III entries link to the annexure PDFs offered on the How to Enroll page (form-annexure-vi, form-annexure-iii).' },
      { id: 'forms-repeated-sentence', severity: 'info', text: 'The second introductory sentence ("Enhanced coverage up to Rupees Ten Lakh for specified treatments and surgeries.") repeats the Coverage page text. Preserved as published.' },
      { id: 'forms-legacy-path', severity: 'info', text: 'The legacy path keeps the source spelling "Froms_Download".' },
    ],
  };
});

buildPage('grievances', '0cdc384da49f', '/Home/Grievances', (doc, shared) => {
  const keys = ['mdindia-tpa', 'medi-assist-tpa'];
  const en = flatLocalized(doc, 'en', shared, 'grievances', keys);
  const ta = flatLocalized(doc, 'tn', shared, 'grievances', keys);
  must(ta.title === 'காப்புறு', 'grievances Tamil heading changed');
  const mailLinks = findAll(doc, (n) => n.tagName === 'a' && /@/.test(attr(n, 'href') ?? ''));
  must(mailLinks.length === 8 && mailLinks.every((a) => !/^mailto:/i.test(attr(a, 'href'))), 'grievances: expected 8 email links without mailto:');
  const distinct = new Set(mailLinks.map((a) => attr(a, 'href').trim()));
  must(distinct.size === 3, 'grievances: expected 3 distinct email targets');
  const inv404 = inventory.filter((i) => /\/Home\/.*@/.test(i.url) && /404/.test(i.error ?? ''));
  must(inv404.length === 3, 'grievances: expected 3 inventoried 404 mail targets');
  const taNav = findAll(home, (n) => n.tagName === 'a' && attr(n, 'id') === 'tn' && attr(n, 'href') === '#' && collapse(rawText(n)) === 'காப்புறு');
  must(taNav.length === 1, 'grievances: Tamil nav link with "#" not found on home page');
  return {
    en,
    ta,
    reviewNotes: [
      { id: 'grievances-tamil-garbled', severity: 'warning', text: 'The Tamil body text is garbled in the source (for example "சிகிச்சசக்கு", "ச ொகை", "குகைவொை", "ைள்", "அசையாள அட்சை"). It is preserved exactly; an approved correction must be requested separately.' },
      { id: 'grievances-tamil-heading', severity: 'warning', text: 'The Tamil page heading "காப்புறு" is the same label used for Coverage in the Tamil navigation; it does not correspond to the English heading "Grievances".' },
      { id: 'grievances-tamil-block-heading', severity: 'info', text: 'The Tamil heading "மதிந்தியா டப்பா ஒரு பயனாளி" does not read as a counterpart of the English "MDIndia TPA Beneficiary" word for word; preserved as published. Each block is still paired by position with the English block of the same TPA.' },
      { id: 'grievances-mail-links', severity: 'warning', text: 'The source email links have no mailto: prefix (relative hrefs such as "tnnhis_grievance@Mdindia.com"), so they resolve to /Home/<address> and returned HTTP 404 at capture (3 distinct addresses, 8 occurrences across both languages). The displayed addresses are kept exactly, including the capitalisation in "tnnhis_grievance@Mdindia.com"; the UI builds the mailto: link (functional correction).' },
      { id: 'grievances-tamil-nav-link', severity: 'info', text: 'The Tamil navigation link to this page uses "#" in the source; the English link points to /Home/Grievances (functional correction in the redesign).' },
    ],
  };
});

buildPage('gallery', '88342f46b59f', '/Home/Gallery', (doc, shared) => {
  const en = flatLocalized(doc, 'en', shared, 'gallery', null);
  const ta = flatLocalized(doc, 'tn', shared, 'gallery', null);
  must(en.sections.length === 0 && ta.sections.length === 0, 'gallery: expected heading only');
  const videos = findAll(doc, (n) => n.tagName === 'video');
  const sources = videos.flatMap((v) => findAll(v, (n) => n.tagName === 'source').map((s) => normPath(attr(s, 'src'))));
  const galleryTaNav = findAll(home, (n) => n.tagName === 'a' && attr(n, 'id') === 'tn' && attr(n, 'href') === '#' && /புனகப்படம்/.test(rawText(n)));
  must(galleryTaNav.length === 1, 'gallery: garbled Tamil nav label not found');
  const garbled = collapse(rawText(galleryTaNav[0]));
  const notes = [
    { id: 'gallery-heading-only', severity: 'info', text: 'The captured page contains a heading only in English and Tamil and no gallery items (no images). No items were invented.' },
  ];
  if (videos.length) {
    notes.push({
      id: 'gallery-video-elements',
      severity: 'warning',
      text: `The captured HTML contains ${videos.length} <video> element(s) outside the heading block (sources: ${sources.join(' ; ')}). The video files are not part of the handoff package and the contract has no video item type, so they are not listed; the data owner should confirm whether they are intended content.`,
    });
  }
  notes.push({ id: 'gallery-tamil-nav', severity: 'info', text: `The Tamil navigation label for this page is garbled in the source ("${garbled}") and differs from the Tamil page heading "கேலரி"; the Tamil navigation link uses "#" (functional correction in the redesign).` });
  return { en, ta, reviewNotes: notes };
});

const PAGE_ORDER = ['employee-policy', 'pensioner-policy', 'coverage', 'eligibility', 'how-to-enroll', 'forms', 'grievances', 'gallery'];
pages.sort((a, b) => PAGE_ORDER.indexOf(a.slug) - PAGE_ORDER.indexOf(b.slug));
must(pages.length === 8, 'expected 8 pages');
for (const p of pages) {
  for (const id of p.documentIds) must(records.some((r) => r.id === id), `page ${p.slug} references unknown document ${id}`);
}

const grievancesMails = pageDefs.find((p) => p.slug === 'grievances').shared.mails;

/* ------------------------------------------------------------------ Contacts */
const contactPage = readHtml('9c48f91f71ee');
const tabLabels = [1, 2, 3, 4].map((i) => collapse(rawText(find(contactPage, (n) => n.tagName === 'label' && attr(n, 'for') === `contact-tab${i}`))));
const expectedTabs = ['Coordinators', 'Nodal Officers', 'Hospital nodal officers', 'District Treasury Office Mail & Phone Number'];
must(JSON.stringify(tabLabels) === JSON.stringify(expectedTabs), `contact tab labels changed: ${JSON.stringify(tabLabels)}`);

const kindOf = (header) => (/^contact (no\.|number)$/i.test(header.trim()) ? 'phone' : /e-?mail/i.test(header) ? 'email' : 'text');
const contactSpecs = [
  { id: 'coordinators', file: 'coordinators-of-the-tpa', expected: 44, label: tabLabels[0], phoneCol: 'D' },
  { id: 'uiic-nodal-officers', file: 'uiic-nodal-officers', expected: 39, label: tabLabels[1], phoneCol: 'D' },
  { id: 'hospital-nodal-officers', file: 'hospital-nodal-officers', expected: 50, label: tabLabels[2], phoneCol: 'D' },
  { id: 'treasury-offices', file: 'TO-office-Mail-ID', expected: 39, label: tabLabels[3], phoneCol: 'E' },
];
const contactDirectories = [];
const contactChanges = [];
const sheetCache = {};
for (const spec of contactSpecs) {
  const src = readJson(path.join(SRC, 'data', `${spec.file}.json`));
  must(src.sheets.length === 1, `${spec.file}: expected exactly one sheet`);
  const rows = src.sheets[0].rows;
  sheetCache[spec.id] = rows;
  const header = rows[0];
  must(header.row === 1, `${spec.file}: first row is not row 1`);
  const columns = Object.entries(header.cells).map(([key, h]) => ({ key, header: h, kind: kindOf(h) }));
  const dataRows = rows.slice(1).map((r) => {
    const cells = {};
    for (const key of columns.map((c) => c.key)) {
      must(key in r.cells && r.cells[key] !== '', `${spec.file} row ${r.row}: missing/blank cell ${key}`);
      const v = r.cells[key];
      const t = v.trim();
      if (t !== v) contactChanges.push(`${spec.id} ${key}${r.row}: ${JSON.stringify(v)} -> ${JSON.stringify(t)}`);
      cells[key] = t;
    }
    for (const k of Object.keys(r.cells)) must(columns.some((c) => c.key === k), `${spec.file} row ${r.row}: unexpected column ${k}`);
    return { id: `${spec.id}-r${r.row}`, sourceRow: r.row, cells };
  });
  if (dataRows.length !== spec.expected) warn(`${spec.file}: expected ${spec.expected} data rows, found ${dataRows.length}`);
  contactDirectories.push({
    id: spec.id,
    label: { en: spec.label, ta: '' },
    sourceFile: src.source_file,
    columns,
    rows: dataRows,
    total: dataRows.length,
    flags: [],
  });
}
{
  const dir = (id) => contactDirectories.find((d) => d.id === id);
  // Flags (only what can be demonstrated from the cells)
  for (const spec of contactSpecs) {
    const d = dir(spec.id);
    const map = new Map();
    for (const r of d.rows) map.set(r.cells[spec.phoneCol], [...(map.get(r.cells[spec.phoneCol]) ?? []), r.sourceRow]);
    const dups = [...map].filter(([, rowsOf]) => rowsOf.length > 1);
    if (dups.length) {
      d.flags.push({ id: 'duplicate-contact-numbers', severity: 'info', text: `The same contact number appears in more than one row: ${dups.map(([n, rowsOf]) => `${n} (rows ${rowsOf.join(', ')})`).join('; ')}. Rows are kept as published.` });
    }
  }
  const hn = dir('hospital-nodal-officers');
  const districtish = new Set(hn.rows.map((r) => r.cells.A));
  must(hn.columns[0].header === 'NODAL OFFICER' && hn.columns[1].header === 'DISTRICT', 'hospital-nodal header changed');
  must(districtish.size <= 20 && hn.rows.every((r) => r.cells.A === r.cells.A.toUpperCase()), 'hospital-nodal column A no longer holds district names');
  hn.flags.unshift({ id: 'header-value-swap', severity: 'warning', text: 'Header mismatch: row 1 labels column A "NODAL OFFICER" and column B "DISTRICT", but in all 50 data rows column A holds a district name (e.g. COIMBATORE) and column B holds an officer name (e.g. Aravind Kumar B). The workbook is kept unchanged; the source website page displays the two headers and values swapped. Confirm the correct labelling with the data owner.' });
  const names = new Map();
  for (const r of hn.rows) {
    const k = r.cells.C.toLowerCase();
    names.set(k, [...(names.get(k) ?? []), r.sourceRow]);
  }
  const repeated = [...names].filter(([, rowsOf]) => rowsOf.length > 1);
  if (repeated.length) hn.flags.push({ id: 'repeated-hospital-names', severity: 'info', text: `The same hospital name text appears in several rows: ${repeated.map(([n, rowsOf]) => `"${hn.rows.find((r) => r.sourceRow === rowsOf[0]).cells.C}" (rows ${rowsOf.join(', ')})`).join('; ')}. Rows are not merged.` });
  const trimmed = contactChanges.filter((c) => c.startsWith('hospital-nodal-officers'));
  if (trimmed.length) hn.flags.push({ id: 'trimmed-whitespace', severity: 'info', text: `Leading/trailing whitespace was trimmed in ${trimmed.length} cell(s): ${trimmed.map((c) => c.replace('hospital-nodal-officers ', '')).join('; ')}.` });
  const ui = dir('uiic-nodal-officers');
  const phoneFormats = new Set(ui.rows.map((r) => r.cells.D.replace(/\d/g, '9')));
  if (phoneFormats.size > 1) {
    const odd = ui.rows.filter((r) => /\s/.test(r.cells.D));
    ui.flags.push({ id: 'phone-format', severity: 'info', text: `Contact numbers are 10 digits without spaces except ${odd.map((r) => `row ${r.sourceRow} ("${r.cells.D}")`).join(', ')}. Kept as published.` });
  }
  const to = dir('treasury-offices');
  const chennai = to.rows.filter((r) => r.cells.B === 'CHENNAI');
  if (chennai.length > 1) to.flags.push({ id: 'two-chennai-rows', severity: 'info', text: `District CHENNAI has ${chennai.length} rows (workbook rows ${chennai.map((r) => r.sourceRow).join(', ')}) with different offices and e-mail addresses.` });
  const multi = to.rows.filter((r) => r.cells.E.includes('/'));
  const toFormats = new Set(to.rows.map((r) => r.cells.E.replace(/\d/g, '9')));
  if (toFormats.size > 1) to.flags.push({ id: 'phone-format', severity: 'info', text: `Contact numbers use ${toFormats.size} different formats${multi.length ? `; ${multi.map((r) => `row ${r.sourceRow}`).join(', ')} contains two numbers in one cell` : ''}. Kept as published.` });
  const spell = { kanchi: ['KANCHIPURAM', 'Kanchipuram', 'KANCHEEPURAM'], myla: ['MYLADUTHURAI', 'Mayiladuthurai', 'MYLADUDURAI'] };
  const co = dir('coordinators');
  must(co.rows.some((r) => r.cells.A === spell.kanchi[0]) && ui.rows.some((r) => r.cells.A === spell.kanchi[1]) && to.rows.some((r) => r.cells.B === spell.kanchi[2]), 'spelling flag evidence missing (Kanchipuram)');
  must(co.rows.some((r) => r.cells.A === spell.myla[0]) && ui.rows.some((r) => r.cells.A === spell.myla[1]) && to.rows.some((r) => r.cells.B === spell.myla[2]), 'spelling flag evidence missing (Mayiladuthurai)');
  to.flags.push({ id: 'district-spelling-variants', severity: 'info', text: 'District names are spelled differently across the directories, e.g. KANCHIPURAM (coordinators) / Kanchipuram (UIIC nodal officers) / KANCHEEPURAM (treasury offices), and MYLADUTHURAI / Mayiladuthurai / MYLADUDURAI. Values are kept as published; matching by district name across directories needs a mapping.' });
}

/* ------------------------------------------------------------------ Site settings */
function homeNode(tag, lang, filter = () => true) {
  const n = findAll(home, (x) => x.tagName === tag && attr(x, 'id') === lang && filter(x))[0];
  must(n, `home page: <${tag} id="${lang}"> not found`);
  return n;
}
const bottom = find(home, (n) => hasClass(n, 'bottom40'));
const inBottom = (tag, lang) => findAll(bottom, (x) => x.tagName === tag && attr(x, 'id') === lang);
const schemeName = { en: collapse(rawText(inBottom('h1', 'en')[0])), ta: collapse(rawText(inBottom('h1', 'tn')[0])) };
const coverageStatement = { en: collapse(rawText(inBottom('p', 'en')[0])), ta: collapse(rawText(inBottom('p', 'tn')[0])) };
must(schemeName.en === 'Tamil Nadu New Health Insurance Scheme' && schemeName.ta === 'தமிழ்நாடு அரசு புதிய மருத்துவக் காப்பீட்டு திட்டம்', 'scheme name changed');
must(coverageStatement.en === 'Upto 5 Lakh Health Cover per Employee / Pensioner Family', 'coverage statement (en) changed');
if (/\s{2,}/.test(rawText(inBottom('p', 'tn')[0]).trim())) warn('home page Tamil coverage statement contains a double space ("குடும்பத்திற்கு  ரூபாய்"); collapsed to a single space');

function footerHelplines() {
  const out = {};
  for (const [lang, key] of [['en', 'en'], ['tn', 'ta']]) {
    const h3 = findAll(home, (x) => x.tagName === 'h3' && attr(x, 'id') === lang && /\d{4}-\d{3}-\d{4}/.test(rawText(x)))[0];
    must(h3, `home footer helpline block (${lang}) not found`);
    const lines = [''];
    for (const c of kids(h3)) {
      if (c.nodeName === '#text') lines[lines.length - 1] += c.value;
      else if (isEl(c) && c.tagName === 'br') lines.push('');
    }
    out[key] = lines.map(collapse).filter(Boolean).map((l) => {
      const m = /^(.*?) : (\S+)$/.exec(l);
      must(m, `cannot parse helpline line "${l}"`);
      return { label: m[1], number: m[2] };
    });
    must(out[key].length === 2, 'expected 2 footer helplines');
  }
  return out;
}
const fh = footerHelplines();
const marquee = { en: collapse(rawText(homeNode('h5', 'en'))), ta: collapse(rawText(homeNode('h5', 'tn'))) };
const loginNumber = /(\d{3} \d{8})$/.exec(marquee.en)?.[1];
must(loginNumber && marquee.ta.endsWith(loginNumber), 'login support number not found at the end of both marquee texts');
const telDigits = (s) => `tel:${s.replace(/[^\d+]/g, '')}`;
const contactTel = new Map(findAll(contactPage, (n) => n.tagName === 'a' && /^tel:/.test(attr(n, 'href') ?? '')).map((a) => [collapse(rawText(a)), attr(a, 'href')]));
const helpline = (id, i) => {
  must(fh.en[i].number === fh.ta[i].number, `helpline ${id}: numbers differ between languages`);
  const number = fh.en[i].number;
  const tel = contactTel.get(number) ?? telDigits(number);
  return { id, label: { en: fh.en[i].label, ta: fh.ta[i].label }, number, telHref: tel };
};
const loginLabel = { en: marquee.en.slice(0, -loginNumber.length).trim(), ta: marquee.ta.slice(0, -loginNumber.length).trim() };

function noticeMessage(lang) {
  const b = findAll(home, (n) => n.tagName === 'div' && hasClass(n, 'blink') && attr(n, 'id') === lang)[0];
  const ctx = { slug: 'site', lang, docIds: new Set(), mails: [] };
  return inlineOf(b, ctx);
}
const loginMsg = (text, label) => [{ type: 'text', text: `${label} ` }, { type: 'phone', number: loginNumber.replace(/ /g, ''), text: loginNumber }].map((n) => n);

const site = {
  schemeName,
  coverageStatement,
  helplines: [helpline('employee', 0), helpline('pensioner', 1), { id: 'login-support', label: loginLabel, number: loginNumber, telHref: telDigits(loginNumber) }],
  availability: '24/7',
  announcements: [
    { id: 'hospital-suspension', kind: 'suspension', severity: 'warning', message: { en: noticeMessage('en'), ta: noticeMessage('tn') } },
    { id: 'login-support', kind: 'login-support', severity: 'notice', message: { en: loginMsg(marquee.en, loginLabel.en), ta: loginMsg(marquee.ta, loginLabel.ta) } },
  ],
  capturedAt: CAPTURED,
  mode: 'snapshot',
};
must(/^24\*7 Help Line/.test(collapse(rawText(homeNode('p', 'en', (x) => hasClass(x, 'footer-top-section-focus'))))), 'footer availability text changed (24*7)');
for (const lang of ['en', 'ta']) {
  const msg = site.announcements[0].message[lang];
  must(msg.some((n) => n.type === 'document' && n.documentId === `notice-suspension-${lang}`), `suspension announcement (${lang}) lacks its document node`);
}

/* ------------------------------------------------------------------ Gallery */
const gallery = {
  items: [],
  note: 'The captured Gallery page has a heading only (English and Tamil) and no gallery items. The page HTML also contains two <video> elements whose files are not part of the source package; they are not listed. No items were invented.',
};

/* ------------------------------------------------------------------ Write */
function writeJson(file, data) {
  const target = path.join(OUT, file);
  const text = `${JSON.stringify(data, null, 2)}\n`;
  fs.mkdirSync(OUT, { recursive: true });
  const same = fs.existsSync(target) && readText(target) === text;
  if (!same) fs.writeFileSync(target, text, 'utf8');
  return same ? 'unchanged' : 'written';
}
const results = {
  'pages.json': writeJson('pages.json', pages),
  'documents.json': writeJson('documents.json', records),
  'contacts.json': writeJson('contacts.json', contactDirectories),
  'site.json': writeJson('site.json', site),
  'gallery.json': writeJson('gallery.json', gallery),
};

/* ------------------------------------------------------------------ Summary */
const available = records.filter((r) => r.availability === 'available');
console.log('TN NHIS snapshot build');
console.log(`  source:      ${path.relative(ROOT, SRC)} (captured ${CAPTURED})`);
for (const [f, s] of Object.entries(results)) console.log(`  ${f.padEnd(15)} ${s}`);
console.log(`  pages:       ${pages.length} (${pages.map((p) => `${p.slug}[en:${p.en ? p.en.sections.length : '-'} ta:${p.ta ? p.ta.sections.length : '-'}]`).join(', ')})`);
console.log(`  documents:   ${records.length} records, ${available.length} available, ${records.length - available.length} unavailable (${records.filter((r) => r.availability === 'unavailable').map((r) => r.id).join(', ')})`);
console.log(`  PDFs:        ${verification.verified} verified by sha256 against documents.json, ${verification.copied} newly copied to ${path.relative(ROOT, PUBLIC_DOCS)}`);
console.log(`  contacts:    ${contactDirectories.map((d) => `${d.id}=${d.total}`).join(', ')} (total ${contactDirectories.reduce((n, d) => n + d.total, 0)})`);
console.log(`  contact cells trimmed: ${contactChanges.length}${contactChanges.length ? `\n    ${contactChanges.join('\n    ')}` : ''}`);
console.log(`  grievances email occurrences: ${grievancesMails.length} (${[...new Set(grievancesMails)].join(', ')})`);
console.log(`  whitespace runs splitting a word (tab inside a word): ${whitespaceFindings.length}`);
for (const w of whitespaceFindings) console.log(`    ${w.page}/${w.lang}: ${JSON.stringify(w.snippet)}`);
console.log(`  warnings:    ${warnings.length}`);
for (const w of warnings) console.log(`    - ${w}`);
