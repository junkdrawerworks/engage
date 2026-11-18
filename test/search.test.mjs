// What the search in Set course finds, checked without a browser:  node --test test/search.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, chartTag, fold, pairLetters, readings, search } from '../js/search.js';
import { CHARTS } from '../js/charts.js';
import { DESTINATIONS } from '../js/destinations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(await readFile(join(root, 'data/stars.json'), 'utf8'));
const raw = new Float32Array((await readFile(join(root, 'data/stars.bin'))).buffer.slice(0));
const absmag = meta.names.map((_, i) => raw[i * 5 + 3]);
// How bright each star looks from Earth, as the bridge works it out.
const mag = i => absmag[i] + 5 * Math.log10(Math.max(Math.hypot(raw[i * 5], raw[i * 5 + 1], raw[i * 5 + 2]), 1e-6)) - 5;
const index = buildIndex(meta.names, meta.constellations);
const find = q => search(index, q, mag).map(i => meta.names[i]);
const first = q => find(q)[0];

test('names are folded to plain letters and digits', () => {
  assert.equal(fold('θ¹ Orionis'), 'theta 1 orionis');
  assert.equal(fold('Barnard’s Star'), 'barnards star');
  assert.equal(fold("Barnard's Star"), 'barnards star');
  assert.equal(fold('TRAPPIST-1'), 'trappist 1');
  assert.equal(fold('  Gliese 58.2 '), 'gliese 58.2');
});

test('Starfleet’s charts are in the index', () => {
  assert.equal(first('vulcan'), 'Keid'); // 40 Eridani
  assert.equal(first('Farpoint'), 'Deneb');
  assert.equal(first('tellar'), '61 Cygni');
  assert.equal(first('rigel vii'), 'Rigel');
  assert.equal(first('vega colony'), 'Vega');
  assert.equal(first('capella iv'), 'Capella');
  assert.equal(first('cochrane'), 'Rigil Kentaurus');
  for (const c of CHARTS) assert.equal(first(c.tag), c.star, c.tag);
});

test('names the charts don’t place find nothing', () => {
  for (const q of ['andoria', 'romulus', 'qo’nos', 'bajor']) assert.deepEqual(find(q), [], q);
});

test('the names people know still work', () => {
  assert.equal(first('north star'), 'Polaris');
  assert.equal(first('dog star'), 'Sirius');
  assert.equal(first('the dog star'), 'Sirius');
  assert.equal(first('pole star'), 'Polaris');
  assert.equal(first('seven sisters'), 'Alcyone');
  assert.equal(first('M45'), 'Alcyone');
  assert.equal(first('earth'), 'Sol');
  assert.equal(first('proxima'), 'Proxima Centauri');
  assert.equal(first('vega'), 'Vega');
  assert.equal(first('alpha centauri'), 'Rigil Kentaurus');
  assert.equal(first('barnard'), "Barnard's Star");
  assert.equal(first('pleiades'), 'Alcyone');
});

test('a letter and a constellation find the numbered stars that share them', () => {
  // The catalogue has ζ¹ and ζ² Reticuli and no plain "ζ Reticuli": the name people know finds both.
  const set = q => new Set(find(q));
  assert.deepEqual(set('zeta reticuli'), new Set(['ζ¹ Reticuli', 'ζ² Reticuli']));
  assert.deepEqual(set('zeta ret'), new Set(['ζ¹ Reticuli', 'ζ² Reticuli']));
  assert.deepEqual(set('theta orionis'), new Set(['θ¹ Orionis', 'θ² Orionis']));
  // An exact name still comes before them, and one word alone asks for no more than it did.
  assert.equal(first('sigma orionis'), 'σ Orionis');
  assert.equal(fold('ς'), 'sigma');
  assert.deepEqual(find('home star'), []);
});

test('home is Sol', () => {
  assert.equal(first('home'), 'Sol');
  assert.equal(first('Solar System'), 'Sol');
});

test('spacing, raised digits and short forms don’t matter', () => {
  assert.equal(first('wolf359'), 'Wolf 359');
  assert.equal(first('gj 581'), 'Gliese 581');
  assert.equal(first('Gl 581'), 'Gliese 581');
  assert.equal(first('GJ581'), 'Gliese 581');
  assert.equal(first('gliese581'), 'Gliese 581');
  assert.equal(first('hip3'), 'HIP 3');
  assert.equal(first('theta1 orionis'), 'θ¹ Orionis');
  assert.equal(first('theta 1 orionis'), 'θ¹ Orionis');
  assert.equal(first('kappa 1 sculptoris'), 'κ¹ Sculptoris');
  assert.equal(first('kap1 scl'), 'κ¹ Sculptoris');
  assert.equal(first('omicron2 eridani'), 'Keid');
  assert.equal(first('eps eri'), 'Ran'); // Epsilon Eridani
  assert.equal(first('eps ind'), 'ε Indi');
  assert.equal(first('alp cen'), 'Rigil Kentaurus');
  assert.equal(first('alpha UMi'), 'Polaris');
  assert.equal(first('alp lyr'), 'Vega');
  assert.equal(first('trappist 1'), 'TRAPPIST-1');
  assert.deepEqual(readings('eps eri', index.genitive), ['eps eri', 'epsilon eridani']);
  assert.deepEqual(readings('the dog star', index.genitive), ['the dog star', 'theta dog star']);
});

test('an exact name comes first, then whole words, then the rest', () => {
  const hip = find('HIP 3');
  assert.equal(hip[0], 'HIP 3');
  assert.equal(hip.length, 60);
  assert.ok(hip.slice(1).every(n => /^HIP 3\d/.test(n)), hip.slice(0, 5).join());
  assert.deepEqual(find('61 cygni'), ['61 Cygni', '61 Cygni']);
  assert.equal(first('wolf'), 'Wolf 359'); // the one with notes, before Wolf 1061
  assert.equal(first('alpha'), 'Sirius'); // every Alpha with notes, the brightest first
  assert.equal(first('sirius'), 'Sirius');
  assert.equal(first('ran'), 'Ran'); // not Aldebaran
  assert.deepEqual(find(''), []);
  assert.deepEqual(find(' - '), []);
});

test('a chart tag is offered only where it says more than the name', () => {
  assert.equal(chartTag('Keid'), 'Vulcan');
  assert.equal(chartTag('Deneb'), 'Farpoint');
  assert.equal(chartTag('Wolf 359'), null);
  assert.equal(chartTag('Antares'), null);
  assert.equal(chartTag('Sirius'), null);
});

test('stars that share a name get a letter each, the brightest first', () => {
  const letters = pairLetters(meta.names, absmag);
  const of = name => meta.names.map((n, i) => (n === name ? i : -1)).filter(i => i >= 0);
  const [a, b] = of('61 Cygni').sort((x, y) => absmag[x] - absmag[y]);
  assert.equal(letters.get(a), 'A');
  assert.equal(letters.get(b), 'B');
  assert.deepEqual(of('θ¹ Orionis').map(i => letters.get(i)).sort(), ['A', 'B', 'C']);
  assert.equal(letters.size, 37); // 17 pairs and one three
  assert.equal(letters.has(meta.names.indexOf('Sirius')), false);
});

test('every other name a destination lists finds it', () => {
  for (const d of DESTINATIONS) for (const name of [d.title, ...(d.find || [])]) assert.equal(first(name), d.star, name);
});
