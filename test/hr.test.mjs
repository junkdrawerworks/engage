// Astrometrics' rules, checked without a browser:  node --test test/hr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { temperature } from '../js/physics.js';
import { FILTERS, MAIN_SEQUENCE, SUN_LIFE, census, family, hrX, hrY, lesson, msLum, onWall, passes, wall } from '../js/hr.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const cat = await loadCatalog();
const at = name => cat.byName.get(name);
const fam = name => family(cat.temp[at(name)], cat.lum[at(name)]);

test('the wall runs hot to cool across and dim to bright up, on log scales', () => {
  assert.equal(hrX(50000, 100), 0);
  assert.equal(hrX(2000, 100), 100);
  assert.ok(hrX(5772, 100) > hrX(10000, 100));
  assert.equal(hrY(1e6, 100), 0);
  assert.equal(hrY(1e-5, 100), 100);
  assert.ok(Math.abs(hrY(1, 100) - 100 * 6 / 11) < 1e-9, 'the Sun is not six elevenths of the way down');
  assert.ok(onWall(5772, 1) && !onWall(135000, 310) && !onWall(1500, 0.001));
});

test('the main sequence runs through the Sun, and is read straight between its rows', () => {
  assert.ok(Math.abs(msLum(5770) - 10 ** 0.01) < 1e-9);
  assert.ok(Math.abs(Math.log10(msLum(9700)) - 1.58) < 1e-9);
  assert.ok(msLum(9000) > msLum(8100) && msLum(9000) < msLum(9700));
  assert.equal(msLum(99999), 10 ** 5.54);
  assert.equal(msLum(1000), 10 ** -3.28);
  assert.ok(MAIN_SEQUENCE.every((r, k) => !k || (r[0] < MAIN_SEQUENCE[k - 1][0] && r[1] < MAIN_SEQUENCE[k - 1][1])), 'the table is not in order');
});

test('stars fall in their families: dwarfs, giants, supergiants and white dwarfs', () => {
  for (const n of ['Sol', 'Proxima Centauri', 'Vega', 'Altair', "Barnard's Star", 'Sirius', 'Keid']) assert.equal(fam(n), 'dwarf', n);
  for (const n of ['Arcturus', 'Aldebaran', 'Pollux', 'Capella']) assert.equal(fam(n), 'giant', n);
  for (const n of ['Rigel', 'Betelgeuse', 'Deneb', 'Antares']) assert.equal(fam(n), 'supergiant', n);
  for (const n of ['Gliese 166B']) assert.equal(fam(n), 'white dwarf', n);
});

test('the wall leaves out, and counts, the stars with no colour or no distance', () => {
  const w = wall(cat);
  assert.equal(w.noColour, 758);
  // Redder than the colour-to-temperature rule goes (B-V past 2.0): left off too, or they stand in one false column
  // at its reddest temperature. Nothing on the wall is at that temperature.
  assert.equal(w.tooRed, 67);
  assert.equal(w.stars.filter(i => Math.round(cat.temp[i]) === Math.round(temperature(2.0))).length, 0, 'a column of stars at the rule’s reddest temperature');
  // 431 in the catalogue have no distance, less the ten that have no colour either and the twelve too red (each
  // counted once, there) and the two the deep sky moves out to the Orion Nebula's measured distance.
  assert.equal(w.noDistance, 431 - 10 - 12 - 2);
  assert.ok(w.stars.includes(0), 'the Sun is not on the wall');
  assert.equal(w.off, 1, 'only the Ring Nebula’s star, at 135,000 K, is off the wall');
  assert.equal(w.stars.length + w.noColour + w.tooRed + w.noDistance + w.off, cat.count);
  for (const i of w.stars) assert.ok(!cat.nocolour[i] && !cat.offscale[i] && !cat.unmeasured[i]);
});

test('each filter teaches what it should: the naked eye sees giants and hot stars, the neighbourhood is red dwarfs', () => {
  const w = wall(cat);
  const of = f => census(cat, w.stars.filter(i => passes(cat, i, f, new Set([at('Vega'), at('Arcturus')]))));
  const eye = of('eye'), near = of('near'), visited = of('visited');
  assert.ok((eye.giant + eye.supergiant + eye.hot) / eye.n > 0.75, 'the naked-eye stars are not mostly giants and hot stars');
  assert.ok(eye.red / eye.n < 0.02);
  assert.ok(near.red / near.n > 0.4 && (near.giant + near.supergiant) / near.n < 0.02, `only ${near.red} of ${near.n} near stars are red dwarfs`);
  assert.equal(visited.n, 3);
  assert.deepEqual([visited.dwarf, visited.giant], [2, 1]);
  assert.match(lesson('eye', eye), /^\d,\d{3} stars you can see without a telescope\. \d+% of them are giants/);
  assert.match(lesson('near', near), /^\d,\d{3} stars within 80 light years/);
  // A share that rounds to nothing isn't said as "0%".
  assert.doesNotMatch(lesson('eye', eye), /\b0%/);
  assert.match(lesson('eye', { ...eye, red: 1 }), /Only a handful are red dwarfs\.$/);
  assert.match(lesson('eye', { ...eye, red: 0 }), /Not one is a red dwarf\.$/);
  assert.equal(lesson('visited', visited), '3 stars in your log, home among them: 2 on the main sequence, 1 giant or supergiant.');
  assert.equal(lesson('visited', census(cat, [0])), 'Nothing in your log yet but home. Fly somewhere, and it lands here.');
  assert.deepEqual(FILTERS.map(f => f.id), ['all', 'eye', 'near', 'visited']);
});

test('the Sun’s life climbs to a red giant and ends among the white dwarfs', () => {
  const placed = SUN_LIFE.map(s => (s.star ? { temp: cat.temp[at(s.star)], lum: cat.lum[at(s.star)] } : s));
  for (const [k, s] of placed.entries()) assert.equal(onWall(s.temp, s.lum), !SUN_LIFE[k].off, `${s.temp} K, ${s.lum} Suns`);
  assert.equal(SUN_LIFE.filter(s => s.off).length, 1, 'only the bare core is off the hot edge');
  assert.equal(family(placed[1].temp, placed[1].lum), 'dwarf', 'the Sun today is not on the main sequence');
  assert.equal(family(placed[4].temp, placed[4].lum), 'giant');
  assert.equal(family(placed[placed.length - 1].temp, placed[placed.length - 1].lum), 'white dwarf');
  assert.ok(SUN_LIFE.slice(0, -1).every((s, k) => !k || s.age > SUN_LIFE[k - 1].age), 'the ages run backwards');
});
