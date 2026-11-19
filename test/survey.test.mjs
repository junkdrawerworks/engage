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
