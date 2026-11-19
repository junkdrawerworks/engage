// The planetary survey's rules: the globe drawn smaller on a slow phone.
//   node --test test/survey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pace, STEPS, SLOW_MS } from '../js/pace.js';

test('a globe that draws in time stays full size', () => {
  const pace = new Pace();
  for (let i = 0; i < 600; i++) pace.took(4 + (i % 7));
  assert.equal(pace.scale, 1);
});

test('a slow globe steps down to three-quarters and then three-fifths, and never back up', () => {
  assert.deepEqual(STEPS, [1, 0.75, 0.6]);
  assert.equal(SLOW_MS, 10);
  const pace = new Pace();
  const changes = [];
  for (let i = 0; i < 6; i++) changes.push(pace.took(40));
  assert.deepEqual(changes, [false, false, false, false, false, true]);
  assert.equal(pace.scale, 0.75);
  for (let i = 0; i < 6; i++) pace.took(25);
  assert.equal(pace.scale, 0.6);
  for (let i = 0; i < 60; i++) pace.took(i % 2 ? 1 : 90);
  assert.equal(pace.scale, 0.6, 'there is no step below three-fifths');
  for (let i = 0; i < 60; i++) pace.took(1);
  assert.equal(pace.scale, 0.6, 'a globe that got faster went back up, and would flicker between sizes');
});

test('one slow picture among quick ones is not a slow phone', () => {
  const pace = new Pace();
  for (let i = 0; i < 120; i++) pace.took(i % 6 === 0 ? 200 : 6);
  assert.equal(pace.scale, 1);
  for (let i = 0; i < 120; i++) pace.took(NaN);
  assert.equal(pace.scale, 1, 'a time that is not a number was counted');
});

// ---------- Moons and dwarf planets ----------
import { MOONS } from '../js/moons.js';
import { CLASSES, byId, grows, worldByName } from '../js/classes.js';
import { growFor } from '../js/xeno-gen.js';
import { STYLE_NAMES } from '../js/planet-art.js';

test('the nine moons and dwarf planets, each with readings that agree with themselves', () => {
  assert.deepEqual(MOONS.map(m => m.name), ['The Moon', 'Io', 'Europa', 'Ganymede', 'Titan', 'Enceladus', 'Triton', 'Ceres', 'Pluto']);
  for (const m of MOONS) {
    // The width against Earth's is the width in kilometres over Earth's 12,742.
    assert.ok(Math.abs(m.width * 12742 / m.km - 1) < 0.005, `${m.name}: ${m.width} × Earth is not ${m.km} km`);
    // Densities from ice (Enceladus, 1.6) to rock (Io, 3.5) times water's; Earth is 5.51.
    const density = 5.514 * m.mass / m.width ** 3;
    assert.ok(density > 1.5 && density < 3.6, `${m.name}: ${density.toFixed(2)} times water`);
    assert.ok(byId.has(m.cls) && byId.get(m.cls).letter, `${m.name} is filed under ${m.cls}`);
    assert.ok(STYLE_NAMES.includes(m.art), `${m.name} has no painting`);
    assert.ok(m.temp[0] <= m.temp[1] && m.temp[0] > 20 && m.temp[1] < 400);
    assert.ok((m.of ? m.orbit : m.year) > 0, `${m.name} goes round nothing`);
    assert.ok(!CLASSES.some(c => c.id === m.id), `${m.name}'s link would open a class`);
    for (const k of ['about', 'fits', 'air', 'water', 'life', 'short']) assert.match(m[k], /^[A-Z].*[^ ]$/, `${m.name}: ${k}`);
  }
  // Titan as Huygens found it on landing, Fulchignoni and others 2005: 93.65 K.
  assert.deepEqual(MOONS.find(m => m.id === 'titan').temp, [94, 94]);
});

test('only Europa and Enceladus grow a creature, and it lives under the ice', () => {
  assert.deepEqual(MOONS.filter(grows).map(m => m.name), ['Europa', 'Enceladus']);
  assert.equal(worldByName('europa').cls.id, 'P');
  assert.equal(worldByName('Titan'), null, 'Titan grows a creature from rules for water');
  for (const name of ['Europa', 'Enceladus']) {
    for (let seed = 1; seed <= 400; seed++) {
      const c = growFor(name, seed);
      assert.equal(c.env.habitat, 'under-ice');
      for (const n of c.notes) assert.doesNotMatch(n.text, / 0 times|yellow star like the Sun|planet’s core|undefined|NaN/, `${name} ${seed}: ${n.text}`);
    }
  }
});

test('Cover your tracks draws only from the planet classes', () => {
  assert.equal(CLASSES.length, 17);
  assert.ok(CLASSES.every(c => c.of === undefined));
});

// ---------- Cover your tracks: the files used and the slip made most often ----------
import { tallies, isFile, isSlip, record, filesUsed, caughtOut, caughtOutLine } from '../js/quiz.js';
import { plan } from '../js/records.js';

test('each answer goes on the record: a file used, or a slip', () => {
  const saved = { filed: {}, mixed: {} };
  record(saved, 'M', 'M'); record(saved, 'K', 'D'); record(saved, 'K', 'D'); record(saved, 'ice-giant', 'ice-giant');
  assert.deepEqual(saved, { filed: { M: 1, 'ice-giant': 1 }, mixed: { 'K>D': 2 } });
  assert.deepEqual(filesUsed(saved.filed), ['M', 'ice-giant']);
  assert.equal(caughtOutLine(saved.mixed), 'Most often caught out: Class K, mistaken for Class D (2 times)');
});

test('one slip is nothing to say, and a tie always names the same pair', () => {
  assert.equal(caughtOut({ 'K>D': 1, 'M>L': 1 }), null);
  assert.equal(caughtOutLine({}), '');
  assert.deepEqual(caughtOut({ 'sub-neptune>ice-giant': 3, 'P>D': 3, 'M>L': 2 }), { truth: 'P', picked: 'D', times: 3 });
  assert.deepEqual(caughtOut({ 'P>K': 3, 'P>D': 3 }), { truth: 'P', picked: 'K', times: 3 });
  assert.equal(caughtOutLine({ 'super-earth>M': 4 }), 'Most often caught out: Super-Earth, mistaken for Class M (4 times)');
});

test('a saved record that was tampered with or is from before keeps only what makes sense', () => {
  assert.deepEqual(tallies(undefined, isFile), {});
  assert.deepEqual(tallies([3], isFile), {});
  assert.deepEqual(tallies({ M: 2, Z: 4, K: -1, D: 1.5, H: '3', europa: 2 }, isFile), { M: 2 });
  assert.deepEqual(tallies({ 'K>D': 2, 'K>K': 3, 'K>Z': 1, KD: 5 }, isSlip), { 'K>D': 2 });
});

test('a restored copy adds its files used and slips without doubling them', () => {
  const here = { best: 3, seen: 5, filed: { M: 2 }, mixed: { 'K>D': 1 } };
  const theirs = { best: 2, seen: 9, filed: { M: 1, O: 4 }, mixed: { 'K>D': 3 } };
  const merged = plan({ keys: { 'engage.survey.v1': theirs } }, { 'engage.survey.v1': here }, 'add').write['engage.survey.v1'];
  assert.deepEqual([merged.filed, merged.mixed, merged.best, merged.seen], [{ M: 2, O: 4 }, { 'K>D': 3 }, 3, 9]);
  const again = plan({ keys: { 'engage.survey.v1': theirs } }, { 'engage.survey.v1': merged }, 'add').write['engage.survey.v1'];
  assert.deepEqual([again.filed, again.mixed], [merged.filed, merged.mixed]);
});

// ---------- Cover your tracks: the rounds and today's exam ----------
import { question, exam, examLine, examSaved, rng, ROUNDS, EXAM, GROUPS } from '../js/quiz.js';

test('each round asks a fair question: four files, or four worlds of different files, with the answer among them', () => {
  assert.deepEqual(ROUNDS, ['files', 'sensors', 'reverse']);
  const r = rng(7);
  for (let n = 0; n < 600; n++) {
    const kind = ROUNDS[n % 3];
    const q = question(kind, r, ['M']);
    assert.notEqual(q.cls.id, 'M', 'a file it was told to avoid came up');
    const offered = kind === 'reverse' ? q.worlds.map(w => w.cls.id) : q.choices.map(c => c.id);
    assert.equal(new Set(offered).size, 4);
    assert.ok(offered.includes(q.cls.id));
    // At least one look-alike from its own group, so it can't be told by a glance at the kind of world.
    assert.ok(offered.some(id => id !== q.cls.id && GROUPS.find(g => g.includes(q.cls.id)).includes(id)), `${kind} ${q.cls.id}: ${offered}`);
    if (kind === 'reverse') for (const w of q.worlds) assert.ok(w.width > 0 && w.mass > 0 && w.temp > 0);
    else assert.ok(q.width > 0 && q.seed >= 1 && q.seed <= 9999 && /Sector \d{3}$/.test(q.survey));
  }
});

test('today’s exam is the same five worlds for everyone that day, each of a different file', () => {
  const a = exam('2026-11-19'), b = exam('2026-11-19'), c = exam('2026-11-20');
  assert.equal(a.length, EXAM);
  assert.deepEqual(a.map(q => [q.kind, q.cls.id, q.seed, q.width]), b.map(q => [q.kind, q.cls.id, q.seed, q.width]));
  assert.notDeepEqual(a.map(q => q.cls.id), c.map(q => q.cls.id));
  for (const day of ['2026-11-19', '2026-11-20', '2027-01-01', '2026-02-28']) {
    const e = exam(day);
    assert.equal(new Set(e.map(q => q.cls.id)).size, 5, day);
    assert.deepEqual(e.map(q => q.kind).sort(), ['files', 'files', 'reverse', 'sensors', 'sensors'], day);
  }
  assert.equal(examLine('2026-11-19', [true, false, true, true, true]), 'Cover your tracks, 19 Nov: 4 of 5 filed');
});

test('a saved exam that makes no sense is dropped', () => {
  assert.deepEqual(examSaved({ day: '2026-11-19', marks: [true, false] }), { day: '2026-11-19', marks: [true, false] });
  for (const bad of [null, 3, { day: 'today', marks: [] }, { day: '2026-11-19', marks: [1] }, { day: '2026-11-19', marks: [true, true, true, true, true, true] }, { day: '2026-11-19' }]) assert.equal(examSaved(bad), null);
});

// ---------- Long-range sensors: Planet hunt ----------
import * as H from '../js/hunt.js';
import { fileFor } from '../js/worlds.js';
import { DESTINATIONS } from '../js/destinations.js';
import { buildCatalog } from '../js/catalog.js';
import { readFileSync } from 'node:fs';

test('the hunt’s planets are real, with their sources, each on the file the survey would put it on', () => {
  assert.equal(H.PLANETS.length, 14);
  const lum = { 'TRAPPIST-1': [10 ** -3.25727, 2566], 'π Mensae c': [10 ** 0.15836, 5998], 'HD 209458 b': [10 ** 0.23086, 6091], 'HD 189733 b': [10 ** -0.46119, 5052] };
  const names = new Set(JSON.parse(readFileSync(new URL('../data/stars.json', import.meta.url))).names);
  for (const p of H.PLANETS) {
    assert.ok(byId.has(p.file), `${p.name}: no file ${p.file}`);
    assert.match(p.src, /\d{4}/, `${p.name} has no source`);
    assert.match(p.found, /^[A-Z].*\.$/);
    if (p.star) assert.ok(names.has(p.star), `${p.name}: ${p.star} isn't in the catalogue, so Set course would find nothing`);
    if (p.kms) continue;
    // A crossing lasts from half an hour to four hours for these, as the papers have it.
    const hours = H.duration(p) * 24;
    assert.ok(hours > 0.4 && hours < 4.5, `${p.name}: ${hours} h`);
    // The survey's own file where it has one, else the rule a placed planet is filed by.
    const filed = worldByName(p.name);
    const width = p.k * p.rs * H.SUN_EARTHS;
    if (filed) assert.equal(p.file, filed.cls.id, `${p.name} is on another file in the survey`);
    else { const [l, t] = lum[p.system || p.name]; assert.equal(p.file, fileFor(width, p.au, l, t), p.name); }
  }
  // TRAPPIST-1 e is Earth-sized (Agol and others 2021: 0.920 Earths); HD 209458 b is 1.4 Jupiters.
  assert.ok(Math.abs(H.sizeFrom(H.depthOf(H.planetByName('TRAPPIST-1 e')), 0.1192).earths - 0.92) < 0.01);
  assert.ok(Math.abs(H.sizeFrom(H.depthOf(H.planetByName('HD 209458 b')), 1.19).earths / 11.21 - 1.4) < 0.05);
});

test('51 Pegasi b’s wobble gives about half Jupiter’s mass, as Mayor and Queloz found (0.47, Nature 378, 355)', () => {
  const p = H.planetByName('51 Pegasi b');
  assert.ok(Math.abs(H.leastMass(p.kms, p.days, p.ms) - 0.46) < 0.01);
  assert.equal(H.massLine(55.77, p.days, p.ms), 'The star swings 56 m/s each way, so the planet weighs at least 0.46 times as much as Jupiter.');
});

test('every curve has three of its planet’s dips (or tops) to tap, and the same seed draws the same curve', () => {
  for (const level of [1, 2, 3, 4]) {
    for (let seed = 1; seed <= 60; seed++) {
      const c = H.curve(level, seed);
      assert.deepEqual(Array.from(H.curve(level, seed).y.slice(0, 50)), Array.from(c.y.slice(0, 50)));
      const ev = H.events(c);
      const most = Math.max(...c.planets.map(p => ev.filter(e => e.planet === p).length));
      assert.ok(most >= 3, `level ${level} seed ${seed}: at most ${most}`);
      assert.ok(c.t.every(t => t >= 0 && t < c.days));
    }
  }
});

test('three dips of one planet give its year; dips of two give nothing but a warning', () => {
  const c = H.curve(3, 9);
  const ev = H.events(c);
  const b = ev.filter(e => e.planet.name === 'TRAPPIST-1 b').slice(0, 3);
  const year = H.yearFrom([b[0], b[2], b[1]]);
  assert.equal(year.planet.name, 'TRAPPIST-1 b');
  assert.ok(Math.abs(year.days - 1.510826) < 1e-9);
  const c1 = ev.find(e => e.planet.name === 'TRAPPIST-1 c');
  assert.deepEqual(H.yearFrom([b[0], c1, b[1]]), { mixed: true });
  assert.deepEqual(H.eventAt(c, b[1].at + 0.01, 0.05), b[1]);
  assert.notEqual(H.eventAt(c, b[1].at + 0.3, 0.05)?.n, b[1].n);
  assert.equal(H.yearLine(1.510826), 'One every 36.3 hours: that is its year.');
  assert.equal(H.yearLine(3.52474859), 'One every 3.52 days: that is its year.');
});

test('passes too faint to see make a dip when added up on the right year, and only then', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const c = H.curve(2, seed), p = c.planets[0];
    assert.equal(H.tried(c, p.days), 'found');
    assert.equal(H.tried(c, p.days + H.tolerance(c) * 0.9), 'found');
    assert.equal(H.tried(c, p.days * 2), 'double');
    assert.equal(H.tried(c, p.days * 1.05), null);
    // No single pass shows: the scatter is half the dip.
    assert.ok(Math.abs(c.noise / H.depthOf(p) - 0.5) < 1e-9);
    // Added up, the deepest slice is at least half as deep as the dip, and deeper than at a wrong year.
    const low = d => 1 - Math.min(...H.fold(c, d, H.binsFor(c)).filter(x => !Number.isNaN(x)));
    assert.ok(low(p.days) > H.depthOf(p) * 0.5, `seed ${seed}: ${low(p.days)}`);
    assert.ok(low(p.days) > low(p.days * 1.07), `seed ${seed}`);
  }
});

test('a reading by hand counts within a third; the lines it gives; links that travel', () => {
  assert.ok(H.near(0.011, 0.015) && !H.near(0.009, 0.015) && H.near(70, 56) && !H.near(80, 56));
  assert.equal(H.sizeLine(0.00501, 0.1192), '0.5% dimmer, so the planet is about 7.1% of its star’s width: about Earth’s size.');
  assert.equal(H.sizeLine(0.0146, 1.19), '1.5% dimmer, so the planet is about 12.1% of its star’s width: about 1.4 times Jupiter’s width.');
  assert.equal(H.sizeLine(0.000331, 0.943), '0.03% dimmer, so the planet is about 1.8% of its star’s width: about 1.9 times Earth’s width.');
  const c = H.curve(2, 4187);
  assert.equal(H.linkOf(c), 'hunt=2.4187');
  assert.deepEqual(H.fromLink('hunt=2.4187'), { level: 2, seed: 4187 });
  for (const bad of ['hunt=5.3', 'hunt=2.', 'hunt=2.0', 'hunt=1.123456', 'hunt', 'hunt=2.12x']) assert.equal(H.fromLink(bad), null, bad);
});
