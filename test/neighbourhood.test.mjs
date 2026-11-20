// Astrometrics' neighbourhood, checked without a browser:  node --test test/neighbourhood.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIRST_VIEW, PITCH_MAX, REACH, ZOOM_MAX, ZOOM_MIN, cardSaid, dotRadius, heightSaid, namedHere, neighbourhood, placeOf, placeSaid,
  linkable, progress, progressLine, project, turned,
} from '../js/neighbourhood.js';
import { LY_PER_PC } from '../js/physics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const cat = await loadCatalog();
const at = name => cat.byName.get(name);
const near = neighbourhood(cat);
const named = namedHere(cat, near);

test('the neighbourhood is every catalogued star within 80 light years, nearest first, home left out', () => {
  // Counted straight from the catalogue: every star with a measured distance of 80 light years or less, less the Sun.
  let n = 0;
  for (let i = 1; i < cat.count; i++) if (!cat.unmeasured[i] && Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC <= REACH) n++;
  assert.equal(near.length, n);
  assert.equal(near.length, 2956);
  assert.ok(near.every(s => s.star !== 0 && !cat.unmeasured[s.star] && s.ly <= REACH));
  assert.ok(near.every((s, k) => !k || s.ly >= near[k - 1].ly), 'not nearest first');
  assert.equal(near[0].star, at('Proxima Centauri'));
  // The galaxy's axes keep distances: a star is as far from the Sun on them as in the catalogue.
  for (const s of near.slice(0, 50)) assert.ok(Math.abs(Math.hypot(s.x, s.y, s.z) - s.ly) < 1e-9);
});

test('a star sits above or below the galaxy’s disc as the galactic axes say', () => {
  // 40 Eridani, Vulcan's sun, is south of the galactic plane (galactic latitude about −38°); Vega north of it (+19°).
  const vulcan = placeOf(cat, at('Keid')), vega = placeOf(cat, at('Vega'));
  assert.ok(vulcan.z < -9 && vulcan.z > -11, `40 Eridani at ${vulcan.z}`);
  assert.ok(Math.abs(Math.asin(vulcan.z / vulcan.ly) * 180 / Math.PI + 38.2) < 1);
  assert.ok(Math.abs(Math.asin(vega.z / vega.ly) * 180 / Math.PI - 19.2) < 1);
  assert.equal(heightSaid(vulcan), '10 light years below the disc');
  assert.equal(heightSaid(vega), '8.3 light years above the disc');
  assert.equal(heightSaid({ z: 0.01 }), 'on the disc itself');
  assert.equal(placeSaid(vulcan), '16 light years from Sol, 10 light years below the disc');
  assert.equal(cardSaid(vulcan), '10 light years below the disc.');
  assert.equal(cardSaid({ ly: 0, z: 0 }), 'Home: the disc is drawn through it.');
  assert.match(cardSaid(placeOf(cat, at('Deneb'))), /above the disc, far beyond the neighbourhood’s 80 light years\.$/);
});

test('the map names Starfleet’s stars by Star Trek’s names, then the others with notes', () => {
  const by = new Map(named.map(n => [n.star, n]));
  assert.deepEqual(by.get(at('Keid')), { star: at('Keid'), label: 'Vulcan', starfleet: true });
  assert.equal(by.get(at('61 Cygni')).label, 'Tellar');
  assert.equal(by.get(at('Wolf 359')).starfleet, true);
  assert.deepEqual(by.get(at('Proxima Centauri')), { star: at('Proxima Centauri'), label: 'Proxima Centauri', starfleet: false });
  assert.equal(by.get(at('TRAPPIST-1')).label, 'TRAPPIST-1');
  assert.ok(!by.has(at('Deneb')) && !by.has(at('Rigel')), 'a star past 80 light years is named');
  assert.equal(named.filter(n => n.starfleet).length, 16);
  assert.equal(new Set(named.map(n => n.star)).size, named.length, 'a star is named twice');
  const ly = new Map(near.map(s => [s.star, s.ly]));
  assert.ok(named.every((n, k) => !k || ly.get(n.star) >= ly.get(named[k - 1].star)), 'not nearest first');
});

test('the map turns: the galactic centre away up the screen at first, the lines to the disc upright, the Sun in the middle', () => {
  const W = 400, H = 420;
  assert.deepEqual(project({ x: 0, y: 0, z: 0 }, FIRST_VIEW, W, H).slice(0, 2), [W / 2, H / 2]);
  const [, yc, dc] = project({ x: REACH, y: 0, z: 0 }, FIRST_VIEW, W, H), [, ya, da] = project({ x: -REACH, y: 0, z: 0 }, FIRST_VIEW, W, H);
  assert.ok(yc < H / 2 && ya > H / 2 && dc < da, 'the galactic centre is not up and away');
  // Cygnus to the left, as on the log's chart.
  assert.ok(project({ x: 0, y: REACH, z: 0 }, FIRST_VIEW, W, H)[0] < W / 2);
  // A star and the foot of its line on the disc share an x, in any turn, and the star is higher if it is above it.
  for (const v of [FIRST_VIEW, turned(FIRST_VIEW, 1.2, -0.4), turned(FIRST_VIEW, 4, 0.5, 3)]) {
    const s = placeOf(cat, at('Vega')), [sx, sy] = project(s, v, W, H), [fx, fy] = project({ ...s, z: 0 }, v, W, H);
    assert.ok(Math.abs(sx - fx) < 1e-9 && sy < fy, 'the line from Vega to the disc is not upright');
  }
  // Seen straight down, height doesn't show; seen along the disc, it is all there is.
  const top = { yaw: 0, pitch: 0, zoom: 1 }, edge = { yaw: 0, pitch: PITCH_MAX, zoom: 1 };
  assert.ok(Math.abs(project({ x: 0, y: 0, z: 40 }, top, W, H)[1] - H / 2) < 1e-9);
  assert.ok(Math.abs(project({ x: 40, y: 0, z: 0 }, edge, W, H)[1] - H / 2) < 1e-9);
  // At the first zoom the 80-light-year ring fits the narrower side.
  const k = project({ x: 0, y: -REACH, z: 0 }, FIRST_VIEW, W, H)[0];
  assert.ok(k <= W && k > W - 30);
});

test('turning keeps the pitch between straight down and edge on, the zoom in range and the yaw in a circle', () => {
  assert.equal(turned(FIRST_VIEW, 0, 9).pitch, PITCH_MAX);
  assert.equal(turned(FIRST_VIEW, 0, -9).pitch, 0);
  assert.equal(turned(FIRST_VIEW, 0, 0, 100).zoom, ZOOM_MAX);
  assert.equal(turned(FIRST_VIEW, 0, 0, 0.01).zoom, ZOOM_MIN);
  const y = turned(FIRST_VIEW, -0.5).yaw;
  assert.ok(y > 0 && y < 2 * Math.PI && Math.abs(y - (2 * Math.PI - 0.5)) < 1e-9);
  assert.ok(Object.isFrozen(FIRST_VIEW));
  // Brighter stars draw bigger, within bounds.
  assert.ok(dotRadius(-1) > dotRadius(5) && dotRadius(5) > dotRadius(15));
  assert.ok(dotRadius(-30) <= 3.4 * 1.6 && dotRadius(30) >= 0.6);
});

test('what is still to visit: the count, Starfleet’s stars, and the nearest not yet been to', () => {
  const none = progress(near, named, new Set([0]));
  assert.equal(none.been, 0);
  assert.equal(none.nearest.star, at('Proxima Centauri'));
  assert.equal(none.nearestStarfleet.star, at('Rigil Kentaurus'));
  assert.equal(progressLine(none), '2,956 catalogued stars within 80 light years. You haven’t been to any of them yet: the nearest is a short hop.');
  const some = progress(near, named, new Set([0, at('Proxima Centauri'), at('Keid'), at('Rigil Kentaurus'), at('Deneb')]));
  assert.deepEqual([some.been, some.starfleetBeen, some.starfleet], [3, 2, 16]);
  assert.equal(some.nearest.star, near.find(s => ![at('Proxima Centauri'), at('Rigil Kentaurus')].includes(s.star)).star);
  assert.equal(some.nearestStarfleet.star, at('Wolf 359'));
  assert.equal(progressLine(some), '2,956 catalogued stars within 80 light years. You have been to 3 of them, and to 2 of the 16 that Starfleet’s charts name.');
  assert.equal(progressLine({ ...some, starfleetBeen: 0 }), '2,956 catalogued stars within 80 light years. You have been to 3 of them.');
  assert.equal(progressLine({ ...some, starfleetBeen: 16 }), '2,956 catalogued stars within 80 light years. You have been to 3 of them, and to all 16 that Starfleet’s charts name.');
  const all = progress(near, named, new Set(near.map(s => s.star)));
  assert.equal(all.nearest, null);
  assert.equal(progressLine(all), '2,956 catalogued stars within 80 light years, and you have been to every one.');
});

test('the nearest star offered is one a Set course link can reach, so following it never sends you back to the same star', () => {
  // The two of 61 Cygni share a name, and ?course=61%20Cygni sets course for one of them only. With every star nearer
  // than the other one visited, and the one the link reaches, the other is the nearest not yet visited, but a link
  // to it would land on the star already visited, time after time.
  const reach = linkable(cat);
  const pair = near.filter(s => cat.names[s.star] === '61 Cygni');
  assert.equal(pair.length, 2);
  const [one, other] = reach(pair[0].star) ? pair : [pair[1], pair[0]];
  assert.ok(reach(one.star) && !reach(other.star) && cat.byName.get('61 Cygni') === one.star);
  const visited = new Set(near.filter(s => s.ly < other.ly && s.star !== other.star).map(s => s.star).concat(one.star));
  assert.equal(progress(near, named, visited).nearest.star, other.star, 'without reach, the other of the pair is offered');
  const p = progress(near, named, visited, reach);
  assert.notEqual(p.nearest.star, other.star);
  assert.ok(reach(p.nearest.star) && !visited.has(p.nearest.star) && p.nearest.ly >= other.ly);
  assert.equal(p.been, visited.size, 'the other still counts as not yet visited');
  // Every star in the neighbourhood but a handful of such pairs can be reached by a link.
  assert.ok(near.filter(s => !reach(s.star)).length <= 6);
});
