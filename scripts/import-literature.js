#!/usr/bin/env node
/*
 * Imports the references cited on the pages from the author's bibliography
 * into assets/data/literature.json, which scripts/build-page.js reads.
 *
 *   node scripts/import-literature.js "/path/to/Overleaf Project/sn-bibliography.bib"
 *
 * Only entries cited in index.html or index.pt.html (data-cite="id") are
 * exported, and only their bibliographic fields (never file paths, notes or
 * keywords), so the published data does not reveal the rest of the
 * bibliography. Keys listed in content/bib-notes.json as unverified (the
 * .bib entry is a different paper) get verified: false, and
 * scripts/build-page.js refuses to cite them.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'assets/data/literature.json');
const NOTES_FILE = path.join(ROOT, 'content/bib-notes.json');
const PAGES = ['index.html', 'index.pt.html'];

// Every id cited on the pages (inline citations and citation lists).
function citedIds() {
  const ids = new Set();
  PAGES.forEach(function (file) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of html.matchAll(/data-cite="([^"]+)"/g)) ids.add(m[1]);
    for (const m of html.matchAll(/data-cite-list="([^"]+)"/g)) {
      m[1].split(/[|\s]+/).filter(function (t) { return t.startsWith('id='); }).forEach(function (t) {
        t.slice(3).split(',').forEach(function (id) { ids.add(id); });
      });
    }
  });
  return ids;
}

// ------------------------------------------------------------- bib parsing

function readBraced(text, start) {
  // text[start] === '{'; returns [content, indexAfterClosingBrace]
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return [text.slice(start + 1, i), i + 1];
    }
  }
  throw new Error('unbalanced braces near: ' + text.slice(start, start + 60));
}

// Braced field values only; bare values (month = mar) are not needed.
function parseFields(body) {
  const fields = {};
  const pattern = /(\w+)\s*=\s*\{/g;
  let m;
  while ((m = pattern.exec(body))) {
    const [value, end] = readBraced(body, m.index + m[0].length - 1);
    const key = m[1].toLowerCase();
    if (!(key in fields)) fields[key] = value;
    pattern.lastIndex = end;
  }
  return fields;
}

function parseBib(text) {
  const entries = [];
  const pattern = /^@(\w+)\s*\{\s*([^,\s]+)\s*,/gm;
  let m;
  while ((m = pattern.exec(text))) {
    const [inner, end] = readBraced(text, text.indexOf('{', m.index));
    entries.push({ type: m[1].toLowerCase(), key: m[2], fields: parseFields(inner.slice(inner.indexOf(',') + 1)) });
    pattern.lastIndex = end;
  }
  return entries;
}

// ------------------------------------------------------------ LaTeX -> text

const ACCENTS = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź', y: 'ý', A: 'Á', E: 'É', O: 'Ó', S: 'Ś' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  '~': { a: 'ã', o: 'õ', n: 'ñ' },
  'c': { c: 'ç', C: 'Ç' },
  'v': { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž' },
  'u': { a: 'ă', g: 'ğ' },
};

const LATEX_REPLACEMENTS = [
  [/\\L\{\}/g, 'Ł'], [/\\l\{\}/g, 'ł'], [/\\L\b/g, 'Ł'], [/\\l\b/g, 'ł'],
  [/\\o\{\}/g, 'ø'], [/\\ss\{\}/g, 'ß'],
  [/\\([cvu])\s*\{\\?(\w)\}/g, function (all, cmd, ch) { return (ACCENTS[cmd] || {})[ch] || all; }],
  [/\\([cvu]) (\w)/g, function (all, cmd, ch) { return (ACCENTS[cmd] || {})[ch] || all; }],
  [/\\(['`^"~])\s*\{?\\?(\w)\}?/g, function (all, cmd, ch) { return (ACCENTS[cmd] || {})[ch] || all; }],
  [/\\textendash\b\s*/g, '–'], [/\\textemdash\b\s*/g, '—'],
  [/\\textquotesingle\b\s*/g, "'"],
  [/\$\\times\$/g, '×'],
  [/---/g, '—'],
  [/--/g, '–'],
  [/\\&/g, '&'], [/\\%/g, '%'], [/\\_/g, '_'], [/\\#/g, '#'],
  [/\\(?:emph|textit|textbf|textsc|mathrm|text)\{([^{}]*)\}/g, '$1'],
  [/``|''/g, '"'],
  [/[{}]/g, ''],
];

function latexToText(value, context) {
  const text = LATEX_REPLACEMENTS.reduce(function (s, rule) { return s.replace(rule[0], rule[1]); }, value)
    .replace(/\s+/g, ' ').trim();
  if (/[\\$]/.test(text)) throw new Error('unhandled LaTeX in ' + context + ': ' + value);
  return text;
}

function initials(given) {
  return given.split(/\s+/).filter(Boolean).map(function (part) {
    return part.split('-').map(function (p) { return /\.$/.test(p) ? p : p[0] + '.'; }).join('-');
  }).join(' ');
}

// "Last, Given" or "Given Last" -> "Last, G."; lowercase particles stay with
// the surname ("van der Ploeg"). Single names (organizations) pass through.
function formatName(name) {
  if (name.includes(',')) {
    const [last, given] = name.split(',').map(function (s) { return s.trim(); });
    return given ? last + ', ' + initials(given) : last;
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name;
  let split = parts.length - 1;
  while (split > 1 && /^[a-z]/.test(parts[split - 1])) split--;
  return parts.slice(split).join(' ') + ', ' + initials(parts.slice(0, split).join(' '));
}

function formatAuthors(raw, key) {
  const names = raw.split(/\s+and\s+/).map(function (n) { return n.trim(); })
    .filter(function (n) { return n && n !== 'others'; });
  return names.map(function (n) { return formatName(latexToText(n, key + '.author')); });
}

// ----------------------------------------------------------------- records

function cleanDoi(doi) {
  return doi ? doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : null;
}

function arxivId(f) {
  if (f.eprint && /^\d{4}\.\d{4,5}/.test(f.eprint)) return f.eprint.replace(/v\d+$/, '');
  const text = [f.journal, f.note, f.url, f.doi, f.howpublished].filter(Boolean).join(' ');
  const m = /arxiv[.:/\s]*(?:abs\/)?(\d{4}\.\d{4,5})/i.exec(text);
  return m ? m[1] : null;
}

function linkFor(f, doi) {
  if (doi) return 'https://doi.org/' + doi;
  const arxiv = arxivId(f);
  if (arxiv) return 'https://arxiv.org/abs/' + arxiv;
  return f.url && /^https?:\/\//.test(f.url) ? f.url.replace(/^http:/, 'https:') : null;
}

const THESIS_TYPES = { phdthesis: 'PhD thesis', mastersthesis: 'Master\'s thesis' };

function venueFor(f, key, type) {
  if (THESIS_TYPES[type] && f.school) return THESIS_TYPES[type] + ', ' + latexToText(f.school, key + '.school');
  const raw = f.journal || f.booktitle || f.school || f.institution ||
    (arxivId(f) || /arxiv/i.test(f.archiveprefix || f.publisher || '') ? 'arXiv preprint' : '') ||
    f.publisher || f.howpublished || '';
  const venue = latexToText(raw, key + '.venue');
  const arxiv = /^arxiv(?: preprint)?(?: arxiv:\S+)?$/i.test(venue) ? 'arXiv preprint' : venue;
  return arxiv;
}

function toRecord(entry, unverified) {
  const f = entry.fields;
  const doi = cleanDoi(f.doi);
  const record = {
    id: entry.key,
    authors: formatAuthors(f.author || f.editor || '', entry.key),
    year: Number(f.year),
    title: latexToText(f.title || '', entry.key + '.title'),
    venue: venueFor(f, entry.key, entry.type),
    volume: f.volume || null,
    issue: f.number || null,
    pages: f.pages ? latexToText(f.pages, entry.key + '.pages').replace(/-+/g, '–') : null,
    doi: doi,
    link: linkFor(f, doi),
    verified: !Object.prototype.hasOwnProperty.call(unverified, entry.key),
  };
  const problems = ['authors', 'title', 'venue'].filter(function (k) { return !record[k] || record[k].length === 0; });
  if (!Number.isInteger(record.year)) problems.push('year');
  if (problems.length) throw new Error(entry.key + ': missing ' + problems.join(', '));
  return record;
}

function main() {
  const bibPath = process.argv[2];
  if (!bibPath) {
    console.error('usage: node scripts/import-literature.js <sn-bibliography.bib>');
    process.exit(2);
  }
  const unverified = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8')).unverified;
  const cited = citedIds();
  const entries = parseBib(fs.readFileSync(bibPath, 'utf8')).filter(function (e) { return cited.has(e.key); });
  const found = new Set(entries.map(function (e) { return e.key; }));
  const missing = Array.from(cited).filter(function (id) { return !found.has(id); });
  if (missing.length) throw new Error('cited on the pages but not in the .bib: ' + missing.join(', '));

  const records = entries.map(function (e) { return toRecord(e, unverified); })
    .sort(function (a, b) { return a.year - b.year || a.id.localeCompare(b.id); });
  const payload = JSON.stringify({
    _about: 'Generated by scripts/import-literature.js: the references cited on the pages, ' +
      'bibliographic fields only.',
    references: records,
  }, null, 2);
  fs.writeFileSync(OUT_JSON, payload + '\n');
  console.log('wrote ' + records.length + ' cited references (' +
    records.filter(function (r) { return !r.verified; }).length + ' not verified)');
}

if (require.main === module) main();
module.exports = { parseBib: parseBib, latexToText: latexToText, formatName: formatName, citedIds: citedIds };
