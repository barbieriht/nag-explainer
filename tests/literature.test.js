'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../assets/data/literature.json');
const notes = require('../content/bib-notes.json');
const { latexToText, formatName, citedIds } = require('../scripts/import-literature.js');

const FIELDS = ['id', 'authors', 'year', 'title', 'venue', 'volume', 'issue', 'pages', 'doi', 'link', 'verified'];

test('literature records are complete and well-formed', () => {
  const ids = new Set();
  for (const r of data.references) {
    assert.ok(!ids.has(r.id), 'duplicate id ' + r.id);
    ids.add(r.id);
    assert.ok(r.title && r.venue && r.authors.length > 0, r.id);
    assert.ok(Number.isInteger(r.year) && r.year >= 1950 && r.year <= 2100, r.id);
    assert.ok(r.link === null || /^https:\/\//.test(r.link), r.id);
    assert.ok(!/[\\${}]/.test(r.title + r.venue + r.authors.join('')), 'LaTeX left in ' + r.id);
  }
});

// The published data must not reveal more than the pages cite: no other
// bibliography entries, and no classification of the studies.
test('literature.json holds exactly the cited references, with bibliographic fields only', () => {
  assert.deepEqual(data.references.map((r) => r.id).sort(), Array.from(citedIds()).sort());
  for (const r of data.references) assert.deepEqual(Object.keys(r).filter((k) => !FIELDS.includes(k)), [], r.id);
  assert.deepEqual(Object.keys(data).sort(), ['_about', 'references']);
});

test('unverified .bib entries are marked and never cited', () => {
  for (const id of Object.keys(notes.unverified)) {
    assert.ok(!citedIds().has(id), id + ' is cited');
    const r = data.references.find((x) => x.id === id);
    assert.ok(!r || r.verified === false, id);
  }
});

test('LaTeX and name conversion', () => {
  assert.equal(latexToText('{GAN} --- Kaiser, \\L{}ukasz \\& Sch\\"{o}ning', 't'), 'GAN — Kaiser, Łukasz & Schöning');
  assert.throws(() => latexToText('\\mbox{x}', 't'), /unhandled LaTeX/);
  assert.equal(formatName('Muhan Zhang'), 'Zhang, M.');
  assert.equal(formatName('Laurens van der Maaten'), 'van der Maaten, L.');
  assert.equal(formatName('Zhang, Muhan'), 'Zhang, M.');
});
