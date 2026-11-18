// What the search in Set course finds, checked without a browser:  node --test test/search.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, chartTag, fold, litBy, named, pairLetters, readings, search, yearAsked } from '../js/search.js';
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

test('a link names one star, however it is spelled, or none', () => {
  const star = q => meta.names[named(index, q, mag)];
  assert.equal(star('Vega'), 'Vega');
  assert.equal(star('vega'), 'Vega');
  assert.equal(star('  VEGA '), 'Vega');
  assert.equal(star('The Pleiades'), 'Alcyone');
  assert.equal(star('pleiades'), 'Alcyone');
  assert.equal(star('40 eridani'), 'Keid');
  assert.equal(star('Vulcan'), 'Keid');
  assert.equal(star('proxima centauri'), 'Proxima Centauri');
  assert.equal(star('barnards star'), "Barnard's Star");
  // Part of a name, or no star's name at all, is not a course: Set course shows what it might have meant instead.
  assert.equal(star('veg'), undefined);
  assert.equal(star('centauri'), undefined);
  assert.equal(star('Narnia'), undefined);
  assert.equal(star(''), undefined);
  assert.equal(star('%'), undefined);
});

test('a year finds the stars its light is reaching now', () => {
  const NOW = 2026.88; // 18 November 2026
  // Only a year on its own, from 1900 to this one.
  assert.equal(yearAsked('1987', NOW), 1987);
  assert.equal(yearAsked(' 1987 ', NOW), 1987);
  assert.equal(yearAsked('1900', NOW), 1900);
  assert.equal(yearAsked('2026', NOW), 2026);
  for (const q of ['1899', '2027', '987', '19870', 'hip 1987', '1987 b', '', '19.87']) assert.equal(yearAsked(q, NOW), null, q);
  // The catalogue as the bridge reads it: a star parked at exactly 1,000 parsecs has no measured distance.
  const pc = i => Math.hypot(raw[i * 5], raw[i * 5 + 1], raw[i * 5 + 2]);
  const ly = i => (Math.abs(pc(i) - 1000) < 0.01 ? null : pc(i) * 3.26156);
  const lit = (year, n) => litBy(year, NOW, meta.names.length, ly, mag, n);
  // '1987' used to find only HIP 19878 and HIP 91987, for the digits in their names.
  assert.deepEqual(find('1987'), ['HIP 19878', 'HIP 91987']);
  assert.deepEqual(lit(1987).map(i => meta.names[i]), ['λ Serpentis', 'ζ Trianguli Australis', 'ζ² Reticuli']);
  // Each is within half a light year of the middle of that year's light, and the brightest come first.
  for (const year of [1987, 1966, 1969, 2001, 1936, 1900]) {
    const stars = lit(year, 50);
    assert.ok(stars.length >= 3, `${year}: ${stars.length}`);
    for (const i of stars) assert.ok(Math.abs(ly(i) - (NOW - year - 0.5)) <= 0.5, `${meta.names[i]} for ${year}`);
    assert.ok(stars.every((i, k) => !k || mag(i) >= mag(stars[k - 1])), String(year));
    assert.deepEqual(lit(year), stars.slice(0, 3));
  }
  // The stars people know: light from 2018 is at Sirius, from 2015 at Procyon, from 2001 at Vega.
  assert.equal(meta.names[lit(2018, 1)[0]], 'Sirius');
  assert.equal(meta.names[lit(2015, 1)[0]], 'Procyon');
  assert.equal(meta.names[lit(2001, 1)[0]], 'Vega');
  assert.deepEqual(lit(2022).map(i => meta.names[i]), ['Rigil Kentaurus', 'Toliman', 'Proxima Centauri']);
  // Nothing is nearer than Proxima, 4.2 light years out: light from 2023 on has reached no star. Never the Sun,
  // and never a star nobody has measured.
  for (const year of [2023, 2024, 2025, 2026]) assert.deepEqual(lit(year), [], String(year));
  assert.ok(!lit(1987, 50).includes(0));
  assert.ok(!litBy(Math.floor(NOW - 3261.56), NOW, meta.names.length, ly, mag, 5000).some(i => ly(i) === null));
});
