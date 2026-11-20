// What the search in Set course finds, checked without a browser:  node --test test/search.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, chartTag, fold, litBy, named, pairLetters, readings, search, yearAsked } from '../js/search.js';
import { CHARTS } from '../js/charts.js';
import { DESTINATIONS } from '../js/destinations.js';
import { ask, question } from '../js/computer.js';
import { buildCatalog } from '../js/catalog.js';
import { kindOf } from '../js/log.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The catalogue as the bridge builds it, with the stars the deep sky adds (js/deepsky.js) and moves.
const stored = JSON.parse(await readFile(join(root, 'data/stars.json'), 'utf8'));
const built = buildCatalog((await readFile(join(root, 'data/stars.bin'))).buffer.slice(0), stored);
const meta = { ...stored, names: built.names, spect: built.spect };
const raw = new Float32Array(built.count * 5);
for (let i = 0; i < built.count; i++) raw.set([built.pos[i * 3], built.pos[i * 3 + 1], built.pos[i * 3 + 2], built.absmag[i]], i * 5);
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
  // The other names a chart lists find its star too, and the worlds Star Trek put round the stars people can find.
  for (const c of CHARTS) for (const f of c.find || []) assert.equal(first(f), c.star, f);
  assert.equal(first('mintaka iii'), 'Mintaka');
  assert.equal(first('merak ii'), 'Merak');
  assert.equal(first('regulus v'), 'Regulus');
  assert.equal(first('sigma draconis'), 'Alsafi');
  assert.equal(first('gamma hydra'), 'γ Hydrae');
  assert.equal(first('garth of izar'), 'Izar');
  assert.ok(CHARTS.length >= 28, `${CHARTS.length} charted stars`);
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

// ---------- The ship's computer ----------

const bin = await readFile(join(root, 'data/stars.bin'));
const cat = buildCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), stored);
const charted = DESTINATIONS.map(d => cat.byName.get(d.star));
const shipAt = (name, extra = {}) => ({
  at: cat.byName.get(name), warp: 9, visited: new Set(), charted, worlds: i => !!DESTINATIONS.find(d => d.star === cat.names[i])?.worlds,
  find: q => search(index, q, mag, 1)[0], ...extra,
});
const names = a => a.stars.map(i => cat.names[i]);

test('the computer hears a question however it is put', () => {
  assert.equal(question('Computer, how far is Vega?'), 'how far is vega');
  assert.equal(question('show me the red giants'), 'red giants');
  assert.equal(question('  Nearest  '), 'nearest');
});

test('the computer answers from where the ship is', () => {
  const home = ask(cat, 'nearest', shipAt('Sol'));
  assert.match(home.line, /^The five stars nearest our position, nearest first\. Proxima Centauri is 4\.2 light years away\.$/);
  assert.equal(names(home)[0], 'Proxima Centauri');
  // The brightest from Earth is Sirius; from Vega it is not, and Sol's own light is counted where it is bright.
  const fromHere = ask(cat, 'brightest from here', shipAt('Sol'));
  assert.equal(names(fromHere)[0], 'Sirius');
  assert.match(fromHere.line, /^The brightest stars in this sky, brightest first\. Sirius shines at magnitude −1\.4/);
  const fromVega = ask(cat, 'brightest', shipAt('Vega'));
  assert.notEqual(names(fromVega)[0], 'Sirius');
  assert.ok(!names(fromVega).includes('Vega'), 'the star the ship is at is in its own sky');
  // Far out, the catalogue can't know every star that might be bright, and says so.
  assert.match(ask(cat, 'brightest', shipAt('Deneb')).line, /^Going by the charts/);
  // Within a distance, in light years or parsecs, nearest first, every one inside it.
  const near = ask(cat, 'within 5 ly', shipAt('Sol'));
  assert.deepEqual(names(near).slice(0, 3), ['Proxima Centauri', 'Toliman', 'Rigil Kentaurus']);
  assert.ok(near.stars.every(i => cat.distanceFrom(i, [0, 0, 0]) * 3.26156 <= 5));
  assert.match(near.line, /^Three stars on the charts lie within 5 light years of us, nearest first\.$/);
  assert.equal(ask(cat, 'within 1.5 parsecs', shipAt('Sol')).stars.length, near.stars.length);
  assert.match(ask(cat, 'within 200 ly', shipAt('Sol')).line, /The nearest 60 are listed\.$/);
  assert.equal(ask(cat, 'within 200 ly', shipAt('Sol')).stars.length, 60);
});

test('the computer finds kinds of star, planets, and the destinations still to visit', () => {
  const giants = ask(cat, 'red giants', shipAt('Sol'));
  assert.ok(giants.stars.length === 60 && /^[0-9,]+ red giants on the charts, nearest us first\. The nearest 60 are listed\.$/.test(giants.line), giants.line);
  for (const i of giants.stars) {
    const noted = DESTINATIONS.find(d => d.star === cat.names[i])?.kind;
    if (noted) { assert.match(noted, /^Red giant/, cat.names[i]); continue; }
    const k = kindOf(cat.spect[i], cat.temp[i], cat.absmag[i]);
    assert.deepEqual([k.letter, k.size], ['M', 'giant'], cat.names[i]);
  }
  // A star with notes is the kind they say: Capella's two yellow giants, not the catalogue's "M1".
  assert.ok(!giants.stars.includes(cat.byName.get('Capella')), 'Capella is called a red giant');
  assert.ok(names(ask(cat, 'yellow giants', shipAt('Sol'))).includes('Capella'));
  assert.ok(!names(ask(cat, 'white dwarfs', shipAt('Sol'))).includes('Sirius'), 'Sirius A is called a white dwarf');
  assert.ok(names(ask(cat, 'red supergiants', shipAt('Sol'))).includes('Betelgeuse'));
  assert.ok(ask(cat, 'white dwarfs', shipAt('Sol')).stars.every(i => kindOf(cat.spect[i], cat.temp[i], cat.absmag[i]).special === 'white dwarf'));
  // A catalogue class that says giant on a star as faint as a dwarf isn't believed: the nearest giants are Pollux and
  // Arcturus, not Guniibuu (an orange dwarf listed K2:III:) or HIP 58910 (listed a supergiant at absolute magnitude 8.9).
  assert.deepEqual(names(ask(cat, 'giants', shipAt('Sol'))).slice(0, 2), ['Pollux', 'Arcturus']);
  assert.ok(!names(ask(cat, 'supergiants', shipAt('Sol'))).includes('HIP 58910'), 'a faint star is called a supergiant');
  const planets = ask(cat, 'nearest with planets', shipAt('Sol'));
  assert.equal(names(planets)[0], 'Proxima Centauri');
  assert.ok(planets.stars.every(i => DESTINATIONS.find(d => d.star === cat.names[i])?.worlds));
  const prox = cat.byName.get('Proxima Centauri');
  const left = ask(cat, 'unvisited', shipAt('Sol', { visited: new Set([0, prox]) }));
  assert.match(left.line, /^Of the 34 destinations with notes, 33 are still unvisited, nearest us first\.$/);
  assert.ok(!left.stars.includes(prox) && !left.stars.includes(0));
});

test('the computer says how far a star is and how long it takes', () => {
  assert.equal(ask(cat, 'how far is vega', shipAt('Sol')).line, 'Vega is 25 light years from us: 6 days at warp 9.');
  assert.deepEqual(names(ask(cat, 'Computer, how far to Proxima?', shipAt('Sol'))), ['Proxima Centauri']);
  assert.equal(ask(cat, 'how far is vega', shipAt('Vega')).line, 'We’re holding at Vega now.');
  assert.match(ask(cat, 'how far is zzqx', shipAt('Sol')).line, /^No star called zzqx/);
});

test('anything else is a name for the search, and a guessed position is said', () => {
  for (const q of ['vega', 'red', 'wolf 359', '1987', 'gamma hydra', 'the dog star', 'nearest star to vega']) assert.equal(ask(cat, q, shipAt('Sol')), null, q);
  const lost = cat.unmeasured.findIndex(u => u);
  const nowhere = { ...shipAt('Sol'), at: lost };
  for (const q of ['nearest', 'within 20 ly']) assert.match(ask(cat, q, nowhere).line, /only the charts’ guess/, q);
});

// ---------- Computer, report ----------
import { report, flightLine } from '../js/computer.js';

// How the bridge points the viewscreen: yaw round the pole and pitch above the equator (js/sky.js's basis), on a
// phone's screen, 390 by 844, with a 60° field.
function viewOf(yawDeg, pitchDeg, cam, at, target = null, covered = []) {
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180, cp = Math.cos(pitch);
  const f = [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch)];
  const rl = Math.hypot(f[1], f[0]), r = [f[1] / rl, -f[0] / rl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const k = Math.tan(Math.PI / 6) / Math.sqrt(390 * 844);
  return { cam, f, r, u, tanX: 390 * k, tanY: 844 * k, at, target, covered };
}
const earthOrbit = viewOf(83, 3, [0, 0, 0], 0).f.map(v => v / 206265); // one AU out, on the night side

test('the computer reports what is on the viewscreen: where it looks, the brightest stars, the Sun and the destination', () => {
  const home = report(cat, viewOf(83, 3, earthOrbit, 0));
  assert.equal(home.line, 'Looking toward Orion. Brightest in view: Sirius, Rigel and Betelgeuse. The Sun is behind you, magnitude −26.7.');
  assert.deepEqual(home.brightest.map(i => cat.names[i]), ['Sirius', 'Rigel', 'Betelgeuse']);
  // A destination is said wherever it is: Proxima, far in the south, is below the view of Orion.
  assert.match(report(cat, viewOf(83, 3, earthOrbit, 0, cat.byName.get('Proxima Centauri'))).line, / Your destination, Proxima Centauri, is below\.$/);
  // A star under the helm isn't in view: with the bottom third of the screen covered, Sirius drops out.
  const k = viewOf(83, 3, earthOrbit, 0).tanY;
  assert.ok(!report(cat, viewOf(83, 3, earthOrbit, 0, null, [{ left: -9, right: 9, top: -k / 3, bottom: -9 }])).line.includes('Sirius'));
  // From Vega, 25 light years out, looking back home: the Sun is in view, at magnitude 4.3.
  const v = cat.byName.get('Vega'), vp = [cat.pos[v * 3], cat.pos[v * 3 + 1], cat.pos[v * 3 + 2]];
  const yaw = Math.atan2(-vp[1], -vp[0]) * 180 / Math.PI, pitch = Math.asin(-vp[2] / Math.hypot(...vp)) * 180 / Math.PI;
  const back = report(cat, viewOf(yaw, pitch, vp.map(x => x * (1 - 1e-6)), v));
  assert.match(back.line, /The Sun is in view, magnitude 4\.3\./);
  assert.ok(!back.brightest.includes(v), 'the star the ship holds at is among the brightest in view');
  // Far out, the Sun is too faint to see, and the report says so.
  const d = cat.byName.get('Deneb'), dp = [cat.pos[d * 3], cat.pos[d * 3 + 1], cat.pos[d * 3 + 2]];
  assert.match(report(cat, viewOf(0, 0, dp, d)).line, /The Sun is [a-z ,]+, magnitude \d+\.\d, too faint to see without help\./);
  // Facing the star it holds at, it says so.
  const facing = report(cat, viewOf(Math.atan2(vp[1], vp[0]) * 180 / Math.PI, Math.asin(vp[2] / Math.hypot(...vp)) * 180 / Math.PI, vp.map(x => x * (1 - 1e-6)), v));
  assert.match(facing.line, /^Looking toward Lyra\. Vega, where we are holding, fills the view at magnitude −\d/);
  // And the computer in Set course answers "report" with the same line, when the bridge gives it the view.
  assert.equal(ask(cat, 'Computer, report', shipAt('Sol', { view: viewOf(83, 3, earthOrbit, 0) })).line, home.line);
  assert.equal(ask(cat, 'what am I looking at?', shipAt('Sol', { view: viewOf(83, 3, earthOrbit, 0) })).stars.length, 3);
  assert.equal(ask(cat, 'report', shipAt('Sol')), null, 'without the view it is a name to search for');
});

test('a flight is told in a few lines: setting out, halfway, closing in, and dropping out of warp', () => {
  const s = cat.byName.get('Sirius');
  const trip = { from: 'Sol', to: s, warp: 9, ly: 8.6, left: 4.3, nominal: false, view: viewOf(101, -16.7, [0, 0, 0], null) };
  assert.equal(flightLine(cat, 'out', trip), 'Leaving Sol at warp 9 for Sirius, 8.6 light years away.');
  assert.equal(flightLine(cat, 'half', trip), 'Halfway: 4.3 light years to go, Sirius now the brightest star ahead.');
  assert.equal(flightLine(cat, 'near', { ...trip, left: 1.2 }), 'Closing on Sirius: 1.2 light years to go.');
  assert.equal(flightLine(cat, 'near', { ...trip, left: 0.0037 }), 'Closing on Sirius: 234 AU to go.');
  assert.equal(flightLine(cat, 'drop', trip), 'Dropping out of warp at Sirius.');
  assert.equal(flightLine(cat, 'out', { ...trip, nominal: true }), 'Leaving Sol at warp 9 for Sirius. Its distance has never been measured.');
  assert.match(flightLine(cat, 'half', { ...trip, nominal: true }), /^Halfway: the rest unmeasured/);
});

// ---------- The Sun says hello ----------
import { SUN_LINE, sunSaysHello } from '../js/computer.js';

test('looking for the Sun from more than 100 light years out says hello once, and nowhere nearer', () => {
  assert.equal(SUN_LINE, 'Everyone you have ever met is in that dot.');
  assert.equal(sunSaysHello(101, false), true);
  assert.equal(sunSaysHello(101, true), false, 'it said hello twice');
  assert.equal(sunSaysHello(100, false), false);
  assert.equal(sunSaysHello(8.6, false), false);
  assert.equal(sunSaysHello(NaN, false), false);
});

import { SHORE_LEAVE, shoreLeave, shoreLeaveLine } from '../js/computer.js';
test('shore leave is suggested by the arrival that makes ten different stars since home, once each time out', () => {
  const log = stars => stars.map(star => ({ star })); // newest first
  assert.equal(SHORE_LEAVE, 10);
  assert.equal(shoreLeave(log([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])), true, 'the tenth star of a first time out');
  assert.equal(shoreLeave(log([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 55, 0])), true, 'the tenth since the last time home');
  assert.equal(shoreLeave(log([10, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1])), true, 'a star visited twice counts once');
  assert.equal(shoreLeave(log([9, 8, 7, 6, 5, 4, 3, 2, 1])), false, 'nine');
  assert.equal(shoreLeave(log([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])), false, 'it asked at the tenth, and doesn’t ask again');
  assert.equal(shoreLeave(log([3, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])), false, 'back to a star of this time out');
  assert.equal(shoreLeave(log([0, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])), false, 'home is no time for shore leave');
  assert.equal(shoreLeave(log([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 10, 9, 8, 7, 6, 5, 4, 3, 2])), true, 'home and out again, ten more');
  for (const bad of [undefined, [], [{}], [null], 'log']) assert.equal(shoreLeave(bad), false);
  assert.equal(shoreLeaveLine(340.2), 'Ten stars since the ship was last home. Starfleet would call shore leave earned: Earth is 340 light years off, whenever the crew want it.');
});
