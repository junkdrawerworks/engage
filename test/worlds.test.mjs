// Planets as places: the system view's and the away team's planet table, the temperate zone, and where a planet put
// anywhere round a star would be filed.
//   node --test test/worlds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEMS, systemFor, planetByName, widthOf, standable, temperateZone, sunlight, warmedTo, starDegrees, SUN_DEGREES,
  zoneOf, gravity, fileFor, paintedAs, orbitAngle, readout, groundReadings, placed, SIZES, yearText, lightText,
} from '../js/worlds.js';
import { DESTINATIONS } from '../js/destinations.js';
import { buildCatalog } from '../js/catalog.js';
import { worldByName } from '../js/classes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const starOf = name => { const d = DESTINATIONS.find(x => x.star === name); return { lum: d.lum, temp: d.temp, radius: d.radius }; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);

test('every system is a star in the catalogue with notes, its planets nearest first, named once', async () => {
  const cat = buildCatalog((await readFile(join(root, 'data/stars.bin'))).buffer, JSON.parse(await readFile(join(root, 'data/stars.json'), 'utf8')));
  const names = new Set();
  for (const s of SYSTEMS) {
    assert.ok(cat.byName.has(s.star), `${s.star} is not in the catalogue`);
    // (55 Cancri and Tau Boötis are stars the survey's files name, with no notes in the charts.)
    const noted = DESTINATIONS.find(d => d.star === s.star);
    assert.ok(noted ? noted.worlds : ['Copernicus', 'τ Boötis'].includes(s.star), `${s.star} has notes that don’t say it has worlds`);
    if (noted && noted.title.replace('’', "'") !== s.star) assert.equal(s.title, noted.title, `${s.star} is ${noted.title} on the charts`);
    assert.ok(s.planets.every((p, k) => k === 0 || p.au > s.planets[k - 1].au), `${s.star}'s planets are not nearest first`);
    for (const p of s.planets) {
      assert.ok(!names.has(p.name), `${p.name} is in the table twice`); names.add(p.name);
      assert.ok(p.au > 0 && p.days > 0 && p.mass > 0 && p.src, `${p.name} is missing a reading or its source`);
      assert.ok(p.width > 0 || p.least, `${p.name} has no width and is not marked as a minimum mass`);
      assert.ok(p.teq > 0 || p.meanC != null, `${p.name} has no temperature`);
      assert.equal(planetByName(p.name.toUpperCase().replace('’', "'"))?.planet, p, 'a planet is found by name whatever its capitals or apostrophe');
    }
    assert.equal(systemFor(s.star.toLowerCase()), s);
  }
  assert.equal(names.size, 35, 'the table has 35 planets');
  assert.equal(systemFor('Epsilon Eridani')?.star, 'Ran', 'a system is found by its title on the charts too');
});

test('each orbit and year agree by Kepler’s third law, a check on the figures copied from the Archive', () => {
  // The star's mass in Suns: the Sun, and the Archive's stellar masses beside each planet (pscomppars, st_mass).
  // Where the orbit comes from a paper that took another mass for the star, that paper's (the Archive's ps table):
  // 55 Cancri e's orbit is Bourrier et al.'s (0.905), its sisters' Moutou et al.'s (1.015); Pollux's 1.7 is Reffert
  // and others 2006's, which fits Hatzes et al.'s orbit (the composite's 2.0 is from a later paper).
  const MASS = {
    Sol: 1, 'Proxima Centauri': 0.1221, 'Luyten\'s Star': 0.29, 'Teegarden\'s Star': 0.097, 'TRAPPIST-1': 0.0898,
    'Barnard\'s Star': 0.162, Ran: 0.82, Copernicus: 1.015, '55 Cancri e': 0.905, Pollux: 1.7, Helvetios: 1.07, 'τ Boötis': 1.32,
  };
  assert.ok(SYSTEMS.length >= 11);
  for (const s of SYSTEMS) for (const p of s.planets) {
    const days = 365.25 * Math.sqrt(p.au ** 3 / (MASS[p.name] ?? MASS[s.star]));
    assert.ok(Math.abs(days / p.days - 1) < 0.05, `${p.name}: ${p.au} AU round ${s.star} takes ${days.toFixed(2)} days, not ${p.days}`);
  }
});

test('the planets the survey files already name have the same readings here', () => {
  for (const s of SYSTEMS) for (const p of s.planets) {
    const filed = worldByName(p.name)?.world;
    if (!filed) continue;
    // (The survey file rounds some to three figures: TRAPPIST-1 b's 1.374 masses are 1.37 there.)
    if (filed.mass) near(filed.mass / p.mass, 1, 0.005, `${p.name}'s mass against its survey file's`);
    if (filed.width) near(filed.width / p.width, 1, 0.005, `${p.name}'s width against its survey file's`);
    if (filed.teq) assert.equal(filed.teq, p.teq, `${p.name}'s temperature differs from its survey file's`);
    if (filed.least) assert.equal(p.least, true);
  }
});

test('the temperate zone: 0.99 to 1.70 AU for the Sun, as Kopparapu and others (2013) give it', () => {
  const z = temperateZone(1, 5780);
  near(z.inner, 0.99, 0.005, 'inner edge');
  near(z.outer, 1.70, 0.01, 'outer edge');
  // Their wider edges, from Venus and early Mars: 0.75 and 1.77 AU.
  near(z.venus, 0.75, 0.005, 'recent Venus');
  near(z.mars, 1.77, 0.01, 'early Mars');
  // TRAPPIST-1: three planets in the zone, e, f and g (the log's note says three).
  const t = starOf('TRAPPIST-1'), tz = temperateZone(t.lum, t.temp);
  const inside = systemFor('TRAPPIST-1').planets.filter(p => zoneOf(p.au, tz) === 'temperate').map(p => p.name);
  assert.deepEqual(inside, ['TRAPPIST-1 e', 'TRAPPIST-1 f', 'TRAPPIST-1 g']);
  // Earth is in its own zone, Venus too close and Jupiter too far.
  const sun = temperateZone(1, 5772);
  assert.deepEqual(['Venus', 'Earth', 'Mars', 'Jupiter'].map(n => zoneOf(planetByName(n).planet.au, sun)), ['hot', 'temperate', 'temperate', 'cold']);
  // Luyten b, which its discoverers put in the zone, is in the wider one and on the warm edge of the cautious one.
  const l = starOf('Luyten\'s Star');
  assert.equal(zoneOf(planetByName('Luyten b').planet.au, temperateZone(l.lum, l.temp)), 'warm edge');
});

test('the sunlight, the warmth and the width of the sun from a planet', () => {
  near(SUN_DEGREES, 0.533, 0.001, 'the Sun from Earth');
  near(warmedTo(1, 1), 255, 1, 'Earth warmed by the Sun alone');
  assert.equal(sunlight(1, 2), 0.25);
  // From Proxima b the sun is about 1.7° wide, a little over three times ours, and gives about 0.7 of Earth's light.
  const px = starOf('Proxima Centauri'), b = planetByName('Proxima b').planet;
  near(starDegrees(px.radius, b.au), 1.7, 0.03, 'Proxima from Proxima b');
  near(starDegrees(px.radius, b.au) / SUN_DEGREES, 3.2, 0.05, 'against the Sun');
  near(sunlight(px.lum, b.au), 0.72, 0.01, 'Proxima b’s sunlight');
  // From TRAPPIST-1 e, about four times ours.
  const t1 = starOf('TRAPPIST-1');
  near(starDegrees(t1.radius, planetByName('TRAPPIST-1 e').planet.au) / SUN_DEGREES, 4.07, 0.05, 'TRAPPIST-1 from e');
});

test('on the ground: gravity, and which planets have ground to stand on', () => {
  near(gravity(planetByName('Mars').planet), 0.378, 0.005, 'Mars');
  near(gravity(planetByName('Earth').planet), 1, 1e-9, 'Earth');
  assert.deepEqual(SYSTEMS[0].planets.filter(standable).map(p => p.name), ['Mercury', 'Venus', 'Earth', 'Mars']);
  assert.ok(SYSTEMS.slice(1, 5).every(s => s.planets.every(standable)), 'every planet round the first four stars is small enough to be rock');
  // Barnard's Star's four are; the giants, and 55 Cancri e at 1.9 times Earth's width, are not.
  assert.deepEqual(SYSTEMS.slice(5).flatMap(s => s.planets.filter(standable)).map(p => p.name), ['Barnard’s Star d', 'Barnard’s Star b', 'Barnard’s Star c', 'Barnard’s Star e']);
  // A giant's width is the Archive's estimate from its mass, and its readout says so.
  const aegir = Object.fromEntries(readout(planetByName('Ægir').planet, starOf('Ran')));
  assert.equal(aegir.Size, '318 times Earth’s mass; a giant that heavy is about 14 times its width');
  const thestias = Object.fromEntries(readout(planetByName('Thestias').planet, starOf('Pollux')));
  assert.match(thestias.Size, /^At least 731 times Earth’s mass; a giant that heavy/);
  // A planet with only a minimum mass is as wide as rock that heavy, and says so.
  const pb = planetByName('Proxima b').planet;
  near(widthOf(pb), 1.015, 0.01, 'Proxima b if it is rock');
  const g = Object.fromEntries(groundReadings(pb, starOf('Proxima Centauri')));
  assert.match(g.Gravity, /^about 1 g, if it is rock$/);
  assert.match(g['A day'], /^The sun never sets here/);
  assert.equal(g['A 70 kg person weighs'], 'about 72 kg');
  const mars = Object.fromEntries(groundReadings(planetByName('Mars').planet, { lum: 1, temp: 5772, radius: 1 }));
  assert.equal(mars['A day'], '24.7 hours, from noon to noon');
  assert.equal(mars['A 70 kg person weighs'], '26 kg');
});

test('a placed planet is filed by its size and where it sits against the zone', () => {
  const sun = [1, 5772];
  assert.equal(fileFor(1, 1, ...sun), 'M');
  assert.equal(fileFor(1, 0.5, ...sun), 'N');
  assert.equal(fileFor(1, 0.85, ...sun), 'H');
  assert.equal(fileFor(1, 3, ...sun), 'P');
  assert.equal(fileFor(0.53, 1.5, ...sun), 'K');
  assert.equal(fileFor(0.27, 1, ...sun), 'D');
  assert.equal(fileFor(1.4, 1.2, ...sun), 'super-earth');
  assert.equal(fileFor(1, 0.04, ...sun), 'lava-world');
  assert.equal(fileFor(11.2, 5.2, ...sun), 'J');
  assert.equal(fileFor(11.2, 0.05, ...sun), 'hot-jupiter');
  assert.equal(fileFor(3.9, 30, ...sun), 'ice-giant');
  assert.equal(fileFor(2.4, 0.3, ...sun), 'sub-neptune');
  // The Solar System's planets land on their own files.
  const filed = Object.fromEntries(SYSTEMS[0].planets.map(p => [p.name, paintedAs(p, { lum: 1, temp: 5772 }).id]));
  assert.deepEqual(filed, { Mercury: 'D', Venus: 'N', Earth: 'M', Mars: 'K', Jupiter: 'J', Saturn: 'J', Uranus: 'ice-giant', Neptune: 'ice-giant' });
  // A real planet on a survey file keeps its file (TRAPPIST-1 b is on the planetoid file, bare rock).
  assert.equal(paintedAs(planetByName('TRAPPIST-1 b').planet, starOf('TRAPPIST-1')).id, 'D');
  const p = placed(1, 1, { lum: 1, temp: 5772, radius: 1 });
  assert.equal(p.file.id, 'M');
  assert.match(p.filed, /^It would go on the Class M file, if it has air and water/);
  assert.match(placed(3.88, 30, { lum: 1, temp: 5772, radius: 1 }).filed, /^It would be an ice giant: neptune-like\.$/i);
  assert.ok(SIZES.some(s => s.id === 'earth' && s.width === 1));
});

test('the readings in words', () => {
  assert.equal(yearText(11.18465), '11 days');
  assert.equal(yearText(6.101), '6.1 days');
  assert.equal(yearText(4331), '11.9 years');
  assert.equal(lightText(0.72), '72% of what Earth gets');
  assert.equal(lightText(1), 'about what Earth gets');
  const r = Object.fromEntries(readout(planetByName('Proxima b').planet, starOf('Proxima Centauri')));
  assert.equal(r.Size, 'At least 1.1 times Earth’s mass; if it is rock, about 1 times its width');
  assert.equal(r.Temperature, '218 K (−55 °C) from its star’s light alone');
  assert.match(r['The star from here'], /^1\.7°, 3\.2 times as wide as the Sun looks from Earth$/);
  assert.equal(Object.fromEntries(readout(planetByName('Earth').planet, { lum: 1, temp: 5772, radius: 1 })).Temperature, '15 °C on average');
});

test('where each planet is on its orbit moves on at its true pace', () => {
  const b = planetByName('TRAPPIST-1 b').planet;
  const a0 = orbitAngle(b, 0, 2461000), a1 = orbitAngle(b, 0, 2461000 + b.days);
  near(a1 - a0, 2 * Math.PI, 1e-9, 'one year is one turn');
  assert.notEqual(orbitAngle(b, 0, 2461000) % (2 * Math.PI), orbitAngle(planetByName('TRAPPIST-1 c').planet, 1, 2461000) % (2 * Math.PI));
});

test('the sky from the ground: where the sun stands, the Sun from another star, and the sister planets', async () => {
  const { groundSky, altitude, positions } = await import('../js/worlds.js');
  const cat = buildCatalog((await readFile(join(root, 'data/stars.bin'))).buffer, JSON.parse(await readFile(join(root, 'data/stars.json'), 'utf8')));
  const host = name => { const i = cat.byName.get(name); return [...cat.pos.subarray(i * 3, i * 3 + 3)]; };
  const { planet, system } = planetByName('TRAPPIST-1 e');
  for (const jd of [2461364, 2461367.5, 2462000]) {
    const g = groundSky(system, planet, jd, host('TRAPPIST-1'));
    near(altitude(g.sun, g.day), 14, 1e-6, 'the sun by day');
    near(altitude(g.sun, g.night), -20, 1e-6, 'the sun by night');
    // The Sun is in the plane of the orbits (TRAPPIST-1's planets cross their star's face as seen from here).
    const pos = positions(system, jd, g.sol);
    const n = [pos[0][1] * pos[1][2] - pos[0][2] * pos[1][1], pos[0][2] * pos[1][0] - pos[0][0] * pos[1][2], pos[0][0] * pos[1][1] - pos[0][1] * pos[1][0]];
    near(n[0] * g.sol[0] + n[1] * g.sol[1] + n[2] * g.sol[2], 0, 1e-12, 'the Sun off the planets’ plane');
    assert.equal(g.sisters.length, 6);
    for (const s of g.sisters) {
      near(s.deg, 2 * Math.atan(widthOf(s.planet) * 6371 / (s.au * 149597870.7)) * 180 / Math.PI, 1e-9, `${s.planet.name}'s width`);
      assert.ok(s.lit >= 0 && s.lit <= 1 && s.au >= Math.abs(s.planet.au - planet.au) - 1e-12);
    }
  }
  // At its nearest, TRAPPIST-1 f would look about as wide as the Moon does from Earth (0.52°).
  const f = planetByName('TRAPPIST-1 f').planet;
  near(2 * Math.atan(f.width * 6371 / ((f.au - planet.au) * 149597870.7)) * 180 / Math.PI, 0.55, 0.02, 'f at its nearest');
  // From Mars, Earth is one of the sisters, and there is no Sun to mark at night.
  const mars = groundSky(SYSTEMS[0], planetByName('Mars').planet, 2461364, [0, 0, 0]);
  assert.equal(mars.sol, null);
  assert.ok(mars.sisters.some(s => s.planet.name === 'Earth' && s.au > 0.37 && s.au < 2.7));
});
