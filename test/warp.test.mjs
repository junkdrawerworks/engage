// The warp scale's numbers: the speeds match the bridge, the trips come out right, the places are in order, and the
// race clock gets every ship there.
import { test } from 'node:test';
import { sweep } from './sweep.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANES, REAL_SHIPS, realShip, kirkSpeed, PLACES, GROUPS, byId, distanceLy, aboutOn, laneSpeed, tripYears, raceClock, formatSpan, formatShort, formatLight, arrivalYear, lightLeft, ladderAt, customPlace, COURSE_GROUP } from '../js/warp-scale.js';
import { SHIPS } from '../js/ships.js';
import { DEEP_SKY, sightById, ADDED } from '../js/deepsky.js';
import { warpSpeed } from '../js/physics.js';
import { gamma, aberrate, doppler, halfSkyDeg, hourOnEarth, greenSeenAs, speedSaid } from '../js/impulse.js';

const DATE = new Date('2026-10-24T00:00:00Z');
const lane = id => LANES.find(l => l.id === id);

test('warp 1 is light, and the warp factors use the bridge’s scale', () => {
  assert.equal(laneSpeed(lane('w1')), 1);
  assert.equal(laneSpeed(lane('w5')), warpSpeed(5));
  assert.ok(Math.abs(laneSpeed(lane('w5')) - 213.7) < 0.1);
  assert.ok(Math.abs(laneSpeed(lane('w9975')) - 6751) < 1);
  assert.equal(laneSpeed(lane('custom'), 9), warpSpeed(9));
  const v = laneSpeed(lane('real'), 9, DATE) * 299792.458;
  assert.ok(v > 16.5 && v < 17.5, `Voyager 1 at ${v} km/s`);
});

test('the real ship in the bottom lane can be another', () => {
  const kmS = id => laneSpeed(lane('real'), 9, DATE, id) * 299792.458;
  assert.deepEqual(REAL_SHIPS.map(r => r.id), ['voyager', 'nh', 'parker', 'starshot', 'ark']);
  // Voyager 1 unless another is picked, and an id nobody knows is Voyager 1 too.
  assert.equal(kmS(), kmS('voyager'));
  assert.equal(realShip('nonsense').id, 'voyager');
  // New Horizons from her trajectory, slower than Voyager 1 (about 13.6 km/s in late 2026).
  assert.ok(kmS('nh') > 13 && kmS('nh') < 14.2, `New Horizons at ${kmS('nh')} km/s`);
  // Parker Solar Probe at 430,000 mph on 24 December 2024 (NASA): 192 km/s, 0.064% of light.
  assert.ok(Math.abs(kmS('parker') - 192.2) < 0.1);
  assert.ok(Math.abs(laneSpeed(lane('real'), 9, DATE, 'parker') - 0.000641) < 0.000002);
  assert.equal(laneSpeed(lane('real'), 9, DATE, 'starshot'), 0.2);
  assert.equal(laneSpeed(lane('real'), 9, DATE, 'ark'), 0.01);
  // Every one of them is slower than light and faster than nothing, and has its honest line.
  for (const r of REAL_SHIPS) {
    const c = laneSpeed(lane('real'), 9, DATE, r.id);
    assert.ok(c > 0 && c < 1, r.id);
    assert.ok(r.label && r.note && r.line.length > 60, r.id);
  }
  // The generation ship takes 423 years to Proxima Centauri; Starshot about 21.
  assert.equal(formatSpan(tripYears(4.23, 0.01)), '420 years');
  assert.equal(formatSpan(tripYears(4.23, 0.2)), '21 years');
});

test('Kirk’s scale: the warp factor cubed', () => {
  // The Making of Star Trek (1968): warp 6, the Enterprise's safe cruising speed, is 216 times light.
  assert.equal(kirkSpeed(6), 216);
  assert.equal(kirkSpeed(9), 729);
  assert.equal(kirkSpeed(1), 1);
  // Above warp 1 it is always slower than the Next Generation's scale.
  for (let w = 1.5; w < 10; w += 0.5) assert.ok(kirkSpeed(w) < warpSpeed(w), `warp ${w}`);
});

test('the ladder runs nearest first, and every place is described', () => {
  // The planets move about, so only the places that stay put have to be in order; the page sorts the rest each day.
  const groups = GROUPS.map(g => g[0]);
  let last = 0, lastGroup = 0;
  for (const p of PLACES) {
    const ly = distanceLy(p, DATE);
    if (!p.live) assert.ok(ly > last, `${p.name} is out of order`);
    assert.ok(groups.indexOf(p.group) >= lastGroup, `${p.name} is in the wrong group`);
    if (!p.live) last = ly;
    lastGroup = groups.indexOf(p.group);
    assert.ok(p.about && /^#[0-9a-f]{6}$/.test(p.color), p.name);
    assert.equal(byId.get(p.id), p);
  }
});

test('the Solar System’s distances are for the day', () => {
  const ls = id => distanceLy(byId.get(id), DATE) * 31557600;
  assert.ok(ls('moon') > 1.18 && ls('moon') < 1.36, `the Moon at ${ls('moon')} light-seconds`);
  assert.ok(ls('sun') > 490 && ls('sun') < 510);
  assert.ok(ls('mars') / 60 > 3 && ls('mars') / 60 < 23);
  const v = ls('voyager') / 3600;
  assert.ok(v > 23 && v < 25, `Voyager 1 is ${v} light-hours away`);
});

test('Voyager 1’s card knows which side of one light-day it is on', () => {
  const v = byId.get('voyager'), on = iso => aboutOn(v, new Date(iso));
  assert.equal(on('2026-11-10T00:00:00Z'), 'The farthest thing people have made, launched in 1977. It reaches one light-day from Earth in 9 days, on 18 November 2026.');
  assert.match(on('2026-06-01T00:00:00Z'), /It reaches one light-day from Earth on 18 November 2026\.$/);
  assert.match(on('2026-11-18T00:00:00Z'), /within a day, on 18 November 2026\.$/);
  for (const iso of ['2026-11-18T12:00:00Z', '2026-11-19T00:00:00Z', '2027-03-01T00:00:00Z', '2031-01-01T00:00:00Z']) {
    assert.equal(on(iso), 'The farthest thing people have made, launched in 1977. It has been more than a light-day from Earth since 18 November 2026.');
    assert.ok(distanceLy(v, new Date(iso)) * 365.25 > 1, `${iso}: the card says past a light-day and the distance says not`);
  }
  assert.ok(distanceLy(v, new Date('2026-11-10T00:00:00Z')) * 365.25 < 1);
  // Every other place says the same thing whatever the day.
  for (const p of PLACES.filter(p => p !== v)) assert.equal(aboutOn(p, DATE), p.about);
});

test('Jupiter and Mars are as far as their cards say', () => {
  // Earth to each planet, every day for thirty years, in light-minutes.
  const range = id => {
    let lo = Infinity, hi = 0;
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2050, 0, 1); t += 864e5) {
      const m = distanceLy(byId.get(id), new Date(t)) * 31557600 / 60;
      lo = Math.min(lo, m); hi = Math.max(hi, m);
    }
    return [lo, hi];
  };
  const said = id => byId.get(id).about.match(/(\d+) (?:and|to) (\d+) light-minutes/).slice(1).map(Number);
  for (const id of ['jupiter', 'mars']) {
    const [lo, hi] = range(id), [a, b] = said(id);
    assert.ok(Math.abs(lo - a) < 0.6 && Math.abs(hi - b) < 0.6, `${id} runs from ${lo.toFixed(1)} to ${hi.toFixed(1)} light-minutes; its card says ${a} to ${b}`);
  }
});

test('the places with Set course are stars the bridge knows', async () => {
  // (The catalogue's own names, and the stars the deep sky adds after them: the Ring Nebula's.)
  const names = new Set([...JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url))).names, ...ADDED.map(a => a.name)]);
  for (const p of PLACES.filter(p => p.course)) assert.ok(names.has(p.course), p.course);
  // Every nebula and cluster the bridge flies to has Set course on its rung, for the star the bridge flies to.
  for (const o of DEEP_SKY.filter(o => o.star)) assert.equal(byId.get(o.rung).course, o.star, `${o.name}'s rung has no Set course`);
});

// The doors out of a place card: tonight's sky opens a card for a star by its name in the catalogue, and long
// missions opens a ship's file by its id.
test('every door from a place leads somewhere: a star in the catalogue, a ship on file', async () => {
  const names = new Set(JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url))).names);
  for (const p of PLACES.filter(p => p.sky)) assert.ok(names.has(p.sky), `${p.name}: tonight's sky has no star called ${p.sky}`);
  for (const p of PLACES.filter(p => p.file)) {
    const ship = SHIPS.find(s => s.id === p.file);
    assert.ok(ship, `${p.name}: long missions has no ship ${p.file}`);
    assert.ok(p.fileText.includes(ship.name) || p.name === ship.name, `${p.name}: "${p.fileText}" does not name ${ship.name}`);
  }
  // The eight stars have tonight's sky; Voyager 1 has her own file and Pluto has New Horizons'.
  assert.deepEqual(PLACES.filter(p => p.sky).map(p => p.id), ['proxima', 'wolf', 'vulcan', 'vega', 'trappist', 'betelgeuse', 'rigel', 'deneb']);
  // Every cluster, nebula and galaxy tonight's sky knows has its rung, and opens its card there.
  assert.deepEqual(PLACES.filter(p => p.sight).map(p => p.sight).sort(), DEEP_SKY.map(o => o.id).sort());
  for (const p of PLACES.filter(p => p.sight)) {
    const o = sightById.get(p.sight);
    assert.equal(o.rung, p.id, `${o.name}'s card races to ${o.rung}, not ${p.id}`);
    if (o.ly) assert.equal(p.ly, o.ly, `${o.name}: the ladder says ${p.ly} ly and tonight's sky ${o.ly}`);
  }
  assert.deepEqual(PLACES.filter(p => p.file).map(p => [p.id, p.file]), [['pluto', 'nh'], ['voyager', 'v1']]);
});

// The helm's Warp scale link names the star chosen there and gives the catalogue's distance.
test('the helm’s course is a place of its own, or the rung the ladder already has', () => {
  const sirius = customPlace('Sirius', 8.6);
  assert.deepEqual([sirius.id, sirius.name, sirius.ly, sirius.group, sirius.course, sirius.sky, sirius.custom], ['course', 'Sirius', 8.6, 'course', 'Sirius', 'Sirius', true]);
  assert.equal(distanceLy(sirius, DATE), 8.6);
  assert.ok(sirius.about && !byId.has(sirius.id), 'the course must not be mistaken for a place on the ladder');
  assert.equal(formatSpan(tripYears(distanceLy(sirius), laneSpeed(lane('custom'), 9))), '2 days');
  const x = ladderAt(sirius.ly);
  assert.ok(x > 0 && x < 1);
  // A star that is on the ladder already is that rung, by the catalogue's name or the ladder's.
  assert.equal(customPlace('Vega', 25.04), byId.get('vega'));
  assert.equal(customPlace('Keid', 16.26), byId.get('vulcan'));
  assert.equal(customPlace('Alcyone', 403), byId.get('pleiades'));
  // The helm set for a nebula or a cluster races to its rung, not to a rung named after the star the ship flies to.
  assert.equal(customPlace('θ¹ Orionis', 1344), byId.get('orion'));
  assert.equal(customPlace('θ¹ Tauri', 154.4), byId.get('hyades'));
  assert.equal(customPlace('NGC 6720 central star', 2577), byId.get('ring'));
  assert.equal(customPlace('Vega', NaN), byId.get('vega'));
  // No measured distance (the bridge sends none), or a link that has been cut off or made up: no place.
  for (const [name, ly] of [['Sirius', NaN], ['Sirius', 0], ['Sirius', -4], ['Sirius', Infinity], ['Sirius', 3e6], ['', 8.6], ['   ', 8.6], [null, 8.6], ['x'.repeat(61), 8.6]]) {
    assert.equal(customPlace(name, ly), null, `${JSON.stringify(name)} at ${ly} light years made a place`);
  }
  assert.equal(COURSE_GROUP[1], 'Your course');
});

test('the famous numbers come out right', () => {
  const core = distanceLy(byId.get('core'));
  assert.equal(formatSpan(tripYears(core, laneSpeed(lane('w9975')))), '3 years 11 months');
  // Janeway's 75 years home, nonstop at warp 9.975.
  assert.equal(formatSpan(tripYears(70000, laneSpeed(lane('w9975')))), '10 years 4 months');
  assert.equal(formatSpan(tripYears(4.23, 1)), '4 years 3 months');
});

test('the race clock starts before the fastest arrives and ends after the slowest', () => {
  for (const p of PLACES) {
    const times = LANES.map(l => tripYears(distanceLy(p, DATE), laneSpeed(l, 9, DATE)));
    const c = raceClock(times);
    assert.ok(c.seconds >= 5 && c.seconds <= 13);
    assert.ok(c.at(0) < Math.min(...times));
    assert.ok(c.at(c.seconds) > Math.max(...times));
    for (const t of times) assert.ok(Math.abs(c.at(c.when(t)) - t) / t < 1e-9);
  }
});

test('spans and distances read naturally', () => {
  const s = 1 / 31557600;
  assert.equal(formatSpan(0.00019 * s), '190 microseconds');
  assert.equal(formatSpan(0.074 * s), '74 milliseconds');
  assert.equal(formatSpan(1.3 * s), '1.3 seconds');
  assert.equal(formatSpan(500 * s), '8 minutes');
  assert.equal(formatSpan(26 * 3600 * s), '1 day 2 hours');
  assert.equal(formatSpan(120.4), '120 years');
  assert.equal(formatSpan(473e6), '473 million years');
  assert.equal(formatSpan(4.5e10), '45 billion years');
  assert.equal(formatShort(3.95), '4 yr');
  assert.equal(formatShort(2.5e6), '2.5M yr');
  assert.equal(formatShort(1 / 365.25), '1 day'); // light's trip to Voyager 1 from November 2026
  assert.equal(formatShort(1.04 / 365.25), '1 day');
  assert.equal(formatShort(1.5 / 365.25), '1.5 days');
  assert.equal(formatShort(12 / 365.25), '12 days');
  assert.equal(formatLight(1.28 * s), '1.3 light-seconds');
  assert.equal(formatLight(26670), '26,700 light years');
  assert.equal(formatLight(2537000), '2.5 million light years');
  // At a unit's edge the number is rounded first and the unit chosen from that.
  assert.equal(formatSpan(1 * s), '1 second');
  assert.equal(formatSpan(0.001 * s), '1 millisecond');
  assert.equal(formatSpan(0.9996 * s), '1 second');
  assert.equal(formatSpan(59.6 * s), '1 minute');
  assert.equal(formatSpan(1), '1 year');
  assert.equal(formatSpan(999600), '1 million years');
  assert.equal(formatSpan(999.7e6), '1 billion years');
  assert.deepEqual([59.96 * s, 59.96 * 60 * s, 23.97 * 3600 * s, 0.999, 999600].map(formatShort), ['1 min', '1 hr', '1 day', '1 yr', '1M yr']);
  assert.deepEqual([1 * s, 60 * s, 3600 * s, 59.8 * s, 999700].map(formatLight), ['1 light-second', '1 light-minute', '1 light-hour', '1 light-minute', '1 million light years']);
  assert.equal(arrivalYear(3.95, DATE), '2031');
  assert.equal(arrivalYear(0.5, DATE), null);
  assert.equal(lightLeft(4.23, DATE), 'in 2022'); // late October 2026 less 4.23 years is July 2022: the year it left in, not the nearest
  assert.equal(lightLeft(8.6, DATE), 'in 2018');
  assert.equal(lightLeft(26670, DATE), '27,000 years ago');
  for (const p of PLACES) {
    const x = ladderAt(distanceLy(p, DATE));
    assert.ok(x > 0 && x < 1, p.name);
  }
});

// Every span from a tenth of a microsecond to a hundred billion years, and every distance from a third of a
// light-second to ten million light years, 2,000 values to a decade: nothing reads "1 seconds", "60 min", "24 hr",
// "12 months" or "1,000,000 years", and within one unit the number never goes down as the span grows.
test('spans and distances read right at every unit\'s edge', () => {
  assert.deepEqual(sweep(formatSpan, -13, 11), []);
  assert.deepEqual(sweep(formatShort, -13, 11), []);
  assert.deepEqual(sweep(formatLight, -8, 7), []);
});

// Impulse power: what special relativity does to the sky near light speed.
test('at nine tenths of light speed half the sky is squeezed within 26° of dead ahead, and an hour aboard is 2 hours 18 minutes at home', () => {
  assert.ok(Math.abs(gamma(0.9) - 2.2942) < 1e-4);
  assert.equal(Math.round(halfSkyDeg(0.9)), 26);
  assert.equal(halfSkyDeg(0), 90, 'at rest half the sky is half the sky');
  assert.ok(Math.abs(aberrate(0, 0.9) - 0.9) < 1e-12, 'a star beside the ship is not seen at cos θ′ = β');
  assert.equal(aberrate(1, 0.9), 1, 'dead ahead moved');
  assert.equal(aberrate(-1, 0.9), -1, 'dead behind moved');
  // Dead ahead the light is shifted by √((1 + β)/(1 − β)); dead behind by its inverse.
  assert.ok(Math.abs(doppler(1, 0.9) - Math.sqrt(19)) < 1e-9);
  assert.ok(Math.abs(doppler(-1, 0.9) * doppler(1, 0.9) - 1) < 1e-9);
  assert.equal(hourOnEarth(0.9), '2 hours 18 minutes');
  assert.equal(hourOnEarth(0), '1 hour');
  assert.equal(hourOnEarth(0.999), '22 hours 22 minutes');
  assert.equal(greenSeenAs(1), 'green');
  assert.equal(greenSeenAs(doppler(1, 0.9)), 'ultraviolet');
  assert.equal(greenSeenAs(doppler(-1, 0.9)), 'infrared');
  assert.equal(speedSaid(0.9), '0.9 of light speed, 269,813 km/s');
  assert.equal(speedSaid(0), 'Full stop');
});
