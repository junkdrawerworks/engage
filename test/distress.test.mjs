// The distress call's rules, and the star chart's sums, checked without a browser:  node --test test/distress.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AIR, CLUE_ORDER, EYE_MAG, OPEN, REACH_LY, breathe, candidates, clean, clueText, colourOf, daySeed, debrief, earthMag,
  lockOn, lyForSunMag, newCall, record, skyFromStar, skyOf, standing, sunMagFrom, whyNot,
} from '../js/distress-sim.js';
import { angleBetween, basis, dragged, projector } from '../js/skychart.js';
import { LY_PER_PC } from '../js/physics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const cat = await loadCatalog();
const { titleFor } = await import('../js/log.js');
// A star by its catalogue name, or the name the log gives it (Tau Ceti for τ Ceti).
const at = name => cat.byName.get(name) ?? cat.names.findIndex((_, i) => titleFor(cat, i) === name);
const list = candidates(cat);

test('a call comes from a star you can see from a suburb, near enough to still see our Sun', () => {
  assert.ok(list.length >= 75 && list.length <= 85, `${list.length} stars`);
  for (const i of list) {
    const ly = Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
    assert.ok(ly <= REACH_LY && earthMag(cat, i) <= EYE_MAG && !cat.unmeasured[i], cat.names[i]);
    assert.ok(skyOf(cat, i).sunMag < 6.3, `our Sun is too faint to see from ${cat.names[i]}`);
  }
  for (const name of ['Sirius', 'Procyon', 'Altair', 'Vega', 'Fomalhaut', 'Arcturus', 'Pollux', 'Tau Ceti', '40 Eridani']) assert.ok(list.includes(at(name)), name);
  // Not the Sun, not a fainter star of a pair, not Capella (whose companion the charts have 0.6 ly off, as if it were
  // the brightest star in its sky at magnitude −8), and nothing too far or too faint.
  for (const name of ['Sol', 'Castor B', 'Capella', 'Deneb', 'Rigel', 'Proxima Centauri', "Barnard's Star"]) assert.ok(!list.includes(at(name)), name);
});

test('every call has its own clues: no two stars give the same set', () => {
  const seen = new Map();
  for (const i of list) {
    const s = skyOf(cat, i), key = CLUE_ORDER.map(k => s[k]).join('|');
    assert.ok(!seen.has(key), `${cat.names[i]} and ${seen.get(key)} give the same clues`);
    seen.set(key, cat.names[i]);
  }
});

test('the clues are worked out from the catalogue: Procyon sees Sirius, and our Sun in Aquila at 2.6', () => {
  const s = skyOf(cat, at('Procyon'));
  assert.equal(s.colour, 'yellow-white');
  assert.equal(s.sunIn, 'Aquila');
  assert.equal(s.sunMag, 2.6);
  assert.equal(cat.names[s.brightest], 'Sirius');
  assert.equal(s.years, 11);
  assert.equal(clueText(cat, 'sunMag', s), '…your Sun shines at magnitude 2.6 here…');
  assert.match(clueText(cat, 'brightest', s), /^…the brightest star in our night is Sirius, magnitude −2\.\d…$/);
  assert.equal(clueText(cat, 'colour', skyOf(cat, at('Pollux'))), '…our sun is an orange star…');
  // From Alpha Centauri's neighbour Tau Ceti, as the log says it, and from Sirius our Sun is in Hercules.
  assert.equal(skyOf(cat, at('Sirius')).sunIn, 'Hercules');
  assert.equal(colourOf(5772), 'yellow');
  assert.equal(colourOf(3000), 'red');
  assert.equal(colourOf(9600), 'white');
  assert.equal(colourOf(20000), 'blue-white');
});

test('our Sun’s brightness says how far: magnitude 2 at about 9 light years, 6 at about 56', () => {
  assert.ok(Math.abs(lyForSunMag(2) - 8.9) < 0.1);
  assert.ok(Math.abs(lyForSunMag(4) - 22) < 0.5);
  assert.ok(Math.abs(lyForSunMag(6) - 56) < 2);
  assert.ok(Math.abs(sunMagFrom(lyForSunMag(4.2)) - 4.2) < 1e-9);
});

test('a call opens two clues, cleaning opens one more for air, and the air runs down', () => {
  const c = newCall(cat, list, 7);
  assert.ok(list.includes(c.star));
  assert.equal(c.open, OPEN);
  assert.equal(c.air, AIR.start);
  assert.deepEqual(newCall(cat, list, 7).star, c.star, 'the same seed gave another star');
  breathe(c, 10);
  assert.equal(c.air, AIR.start - 10 * AIR.perSecond);
  assert.ok(clean(c));
  assert.equal(c.open, OPEN + 1);
  assert.equal(c.air, AIR.start - 10 * AIR.perSecond - AIR.clean);
  while (clean(c)) { /* every clue */ }
  assert.equal(c.open, CLUE_ORDER.length);
  assert.equal(clean(c), false, 'cleaned past the last clue');
  breathe(c, 1000);
  assert.equal(c.over, 'lost');
  assert.equal(c.air, 0);
  assert.deepEqual(lockOn(cat, c, c.star), { right: false, why: '' }, 'a lost call was found');
});

test('a wrong lock costs air and says which open clue rules it out; the right one ends the call', () => {
  const c = newCall(cat, [at('Procyon')], 1);
  const r = lockOn(cat, c, at('Vega'));
  assert.equal(r.right, false);
  assert.equal(r.why, 'Not Vega: its light is white, and theirs is yellow-white.');
  assert.equal(c.air, AIR.start - AIR.wrong);
  assert.equal(whyNot(cat, c, at('Tabit')), 'Not Tabit: from there our Sun would sit in Ophiuchus, not Aquila.');
  assert.match(whyNot(cat, c, at('Deneb')), /^Not Deneb: /);
  assert.equal(whyNot(cat, c, 0), 'That is our own Sun.');
  // A star that matches every open clue is said to, not ruled out by a clue still hidden.
  const twin = list.find(i => i !== c.star && skyOf(cat, i).colour === c.sky.colour && skyOf(cat, i).sunIn === c.sky.sunIn);
  if (twin) assert.match(whyNot(cat, c, twin), /nothing they have said yet rules it out/);
  assert.deepEqual(lockOn(cat, c, at('Procyon')), { right: true });
  assert.equal(c.over, 'found');
  const [head, sky] = debrief(cat, c);
  assert.equal(head, 'Found: they were at Procyon, 11 light years out. A rescue ship is on its way, with 80% of their air left (2 of 5 clues, 1 wrong lock).');
  assert.match(sky, /^From Procyon the brightest star in the night is Sirius, and our Sun is a magnitude 2\.6 star in Aquila/);
});

test('a day’s call is the same for everyone that day, and differs from day to day', () => {
  const a = newCall(cat, list, daySeed('2026-11-19'), '2026-11-19');
  assert.equal(newCall(cat, list, daySeed('2026-11-19')).star, a.star);
  const days = new Set(Array.from({ length: 30 }, (_, k) => newCall(cat, list, daySeed(`2026-12-${String(k + 1).padStart(2, '0')}`)).star));
  assert.ok(days.size >= 20, `${days.size} stars in 30 days`);
});

test('the record counts every call and keeps the latest 50', () => {
  let saved = null;
  const c = newCall(cat, [at('Procyon')], 1, '2026-11-19');
  lockOn(cat, c, at('Procyon'));
  saved = record(saved, c, 'Procyon');
  assert.equal(standing(saved, '2026-11-19'), 'Rescued 1 of 1 call. Today’s call: found at Procyon with 100% of their air left.');
  for (let k = 0; k < 60; k++) { const l = newCall(cat, list, k); breathe(l, 1e4); saved = record(saved, l, 'x'); }
  assert.equal(saved.calls.length, 50);
  assert.equal(standing(saved, '2026-11-20'), 'Rescued 1 of 61 calls.');
  assert.equal(standing({}, '2026-11-20'), '');
  assert.equal(standing({ calls: 'nonsense' }, '2026-11-20'), '');
});

test('their sky: our Sun where the clue says, and their own companions left out', () => {
  const p = at('Procyon'), sky = skyFromStar(cat, p, 6);
  const sun = sky.find(s => s.i === 0);
  assert.ok(Math.abs(sun.mag - 2.6) < 0.06);
  assert.equal(cat.constellationToward(sun.dir), 'Aquila');
  assert.equal(sky[0].i, at('Sirius'));
  assert.ok(!sky.some(s => cat.names[s.i] === 'Gliese 280B'), 'Procyon B was drawn as a star of its sky');
  for (let k = 1; k < sky.length; k++) assert.ok(sky[k].mag >= sky[k - 1].mag);
  // Our Sun is in their sky even where it is fainter than the chart's limit (magnitude 6.1 from Menkent).
  for (const i of list) assert.ok(skyFromStar(cat, i, 5).some(s => s.i === 0), `no Sun in the sky from ${cat.names[i]}`);
});

test('the chart: north up, east on the left, and a drag follows the finger', () => {
  const B = basis([1, 0, 0]);
  assert.deepEqual(B.u.map(v => Math.round(v) + 0), [0, 0, 1]);
  assert.deepEqual(B.r.map(v => Math.round(v) + 0), [0, -1, 0]);
  const P = projector([1, 0, 0], Math.PI / 2, 400, 400);
  assert.deepEqual(P.at([1, 0, 0]), { x: 200, y: 200 });
  assert.ok(P.at([0.9, 0.1, 0]).x < 200, 'east is not on the left');
  assert.ok(P.at([0.9, 0, 0.1]).y < 200, 'north is not up');
  assert.equal(P.at([-1, 0, 0]), null);
  // Drag 100 px to the right: what was 100 px left of the middle comes to the middle.
  const left = [0.9, 0.1, 0], before = P.at(left);
  const moved = projector(dragged([1, 0, 0], 200 - before.x, 0, P.S), Math.PI / 2, 400, 400).at(left);
  assert.ok(Math.abs(moved.x - 200) < 3, `${moved.x}`);
  assert.ok(Math.abs(angleBetween([1, 0, 0], [0, 1, 0]) - Math.PI / 2) < 1e-12);
});
