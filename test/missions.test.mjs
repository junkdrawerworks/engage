// The long missions' numbers, checked without a browser:  node --test test/missions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jdOf, dateOf, readings, stateAt, earthAt, planetAt, heading, whenAbove, lastCrossing, milestones, jwstTracked, jwstSpan, jwstFromEarth, jwstAroundL2, trackUntil, LIGHT_DAY_AU, AU_KM } from '../js/ephemeris.js';
import { SHIPS, byId, hailSent, hailState, milestoneText, GOLDEN_RECORD } from '../js/ships.js';

const at = iso => jdOf(new Date(iso));

test('the yearly states land on the Horizons values they were joined from', () => {
  // Voyager 1 on 1 January 2026, straight from Horizons.
  const { pos } = stateAt('v1', 2461041.5);
  assert.deepEqual(pos.map(v => +v.toFixed(4)), [-31.8364, -134.6785, 97.4448]);
});

test('between the yearly states, positions follow the velocity smoothly', () => {
  for (const id of ['v1', 'v2', 'nh', 'p10', 'p11']) {
    const a = stateAt(id, at('2026-06-01')), b = stateAt(id, at('2026-06-02'));
    const moved = a.pos.map((v, k) => b.pos[k] - v);
    a.vel.forEach((v, k) => assert.ok(Math.abs(moved[k] - v) < 1e-5, `${id} jumps`));
  }
});

test('the ships are where NASA says, in October 2026', () => {
  const jd = at('2026-10-10');
  const v1 = readings('v1', jd), v2 = readings('v2', jd), nh = readings('nh', jd);
  assert.ok(v1.sunAU > 171 && v1.sunAU < 173, `Voyager 1 at ${v1.sunAU} AU`);
  assert.ok(v1.speedKmS > 16.8 && v1.speedKmS < 17.1);
  assert.ok(v2.sunAU > 143 && v2.sunAU < 145);
  assert.ok(nh.sunAU > 65 && nh.sunAU < 67);
  assert.ok(v1.lightSeconds / 3600 > 23.5 && v1.lightSeconds / 3600 < 24, 'Voyager 1 is nearly a light-day out');
  const webb = readings('jwst', jd);
  assert.ok(webb.earthAU * AU_KM > 1.0e6 && webb.earthAU * AU_KM < 1.9e6, 'Webb is not near L2');
});

test('Voyager 1 passes one light-day from Earth on 18 November 2026 and stays past it', () => {
  // NASA's figure for the crossing is 18 November 2026, mid-morning UTC; this trajectory agrees to a few minutes.
  const fromEarth = jd => readings('v1', jd).earthAU;
  const t = whenAbove(fromEarth, LIGHT_DAY_AU, at('2026-10-01'));
  assert.equal(dateOf(t).toISOString().slice(0, 13), '2026-11-18T10');
  for (let jd = t + 0.01; jd < t + 3650; jd += 0.5) assert.ok(fromEarth(jd) > LIGHT_DAY_AU, `back inside a light-day on ${dateOf(jd).toISOString()}`);
  // Looking back finds the same moment, for two months and no longer.
  assert.equal(lastCrossing(fromEarth, LIGHT_DAY_AU, at('2026-11-10')), null, 'not there yet');
  assert.ok(Math.abs(lastCrossing(fromEarth, LIGHT_DAY_AU, at('2026-11-19')) - t) < 1e-6);
  assert.ok(Math.abs(lastCrossing(fromEarth, LIGHT_DAY_AU, at('2026-11-18T11:00:00Z')) - t) < 1e-6, 'within the hour');
  assert.ok(Math.abs(lastCrossing(fromEarth, LIGHT_DAY_AU, at('2027-01-15')) - t) < 1e-6);
  assert.equal(lastCrossing(fromEarth, LIGHT_DAY_AU, at('2027-03-01')), null, 'more than 60 days ago');
});

test('the milestones look both ways across the light-day', () => {
  const v1 = byId('v1');
  const day = m => dateOf(m.jd).toISOString().slice(0, 10);
  // A week before: the crossing is next, and nothing has just gone by.
  let m = milestones('v1', at('2026-11-10'));
  assert.deepEqual([m.next.kind, day(m.next), m.passed], ['earth-day', '2026-11-18', null]);
  assert.match(milestoneText(v1, m.next), /^one light-day from Earth: a hail will take a whole day/);
  // The day after: it has just been passed, and the ring on the map (a light-day from the Sun) is next.
  m = milestones('v1', at('2026-11-19'));
  assert.deepEqual([m.passed.kind, day(m.passed)], ['earth-day', '2026-11-18']);
  assert.deepEqual([m.next.kind, day(m.next)], ['sun-day', '2027-02-03']);
  assert.match(milestoneText(v1, m.passed, true), /^one light-day from Earth\. A hail now takes more than a day .*Nothing people have made has been this far$/);
  assert.match(milestoneText(v1, m.next), /light-day from the Sun, the dotted ring/);
  // March 2027: both light-day marks are behind her (the Sun's within two months), and 180 AU is next, in 2029.
  m = milestones('v1', at('2027-03-01'));
  assert.deepEqual([m.passed.kind, day(m.passed)], ['sun-day', '2027-02-03']);
  assert.deepEqual([m.next.kind, m.next.au, dateOf(m.next.jd).getUTCFullYear()], ['au', 180, 2029]);
  assert.equal(milestoneText(v1, m.next), '180 AU from the Sun, 180 times farther out than Earth');
  // Two months on from that, nothing recent; and the claim to be farthest is only ever Voyager 1's.
  assert.equal(milestones('v1', at('2027-06-01')).passed, null);
  assert.doesNotMatch(milestoneText(byId('v2'), { kind: 'earth-day' }, true), /Nothing people have made/);
  for (const s of SHIPS.filter(s => !s.near)) {
    const ms = milestones(s.id, at('2026-11-19'));
    assert.ok(ms.next && ms.next.jd > at('2026-11-19'), `${s.id} has nothing ahead`);
    assert.ok(milestoneText(s, ms.next));
  }
});

test('Earth crosses the March and September equinox points', () => {
  const lon = jd => { const e = earthAt(jd); return Math.atan2(e[1], e[0]) * 180 / Math.PI; };
  assert.ok(Math.abs(lon(at('2026-09-23'))) < 1.5);
  assert.ok(Math.abs(Math.abs(lon(at('2026-03-20'))) - 180) < 1.5);
});

test('the flybys line up with the planets', () => {
  const near = (id, planet, iso, au) => {
    const jd = at(iso);
    const ship = trackUntil(id, jd + 60).reduce((best, p) => {
      const d = Math.hypot(...p.map((v, k) => v - planetAt(planet, jd)[k]));
      return Math.min(best, d);
    }, Infinity);
    assert.ok(ship < au, `${id} misses ${planet} by ${ship.toFixed(2)} AU`);
  };
  near('v1', 'jupiter', '1979-03-05', 1);
  near('v2', 'neptune', '1989-08-25', 1);
  near('nh', 'pluto', '2015-07-14', 1);
});

test('each ship heads for the constellation its file names', () => {
  const jd = at('2026-10-10');
  const h = id => heading(id, jd);
  assert.ok(h('v1').ra > 16.5 && h('v1').ra < 18.5 && h('v1').dec > 0, 'Voyager 1 toward Ophiuchus');
  assert.ok(h('v2').dec < -50, 'Voyager 2 toward Pavo');
  assert.ok(h('p10').ra > 4 && h('p10').ra < 6, 'Pioneer 10 toward Taurus');
});

test('Webb is always beyond Earth, away from the Sun', () => {
  for (const iso of ['2026-10-15', '2027-03-01', '2027-08-01', '2029-01-01']) {
    const jd = at(iso), e = earthAt(jd), w = jwstFromEarth(jd);
    const out = (e[0] * w[0] + e[1] * w[1] + e[2] * w[2]) / Math.hypot(...e);
    assert.ok(out > 0, `Webb on the Sun's side on ${iso}`);
  }
});

test('Webb’s speed round L2 leaves out L2’s own trip round the Sun', () => {
  // After the Horizons table she is held at the L2 point, so she isn't going round it at all, though from Earth's
  // centre she would still seem to move 0.3 km/s: that is L2 itself, keeping to the line from the Sun through Earth.
  assert.ok(jwstAroundL2(at('2028-06-01')) < 0.005, `${jwstAroundL2(at('2028-06-01'))} km/s parked at L2`);
  // On 1 January 2027 she is on the quick side of her loop: 0.28 km/s round L2 (only 0.10 from Earth's centre).
  assert.ok(Math.abs(jwstAroundL2(at('2027-01-01')) - 0.28) < 0.02, `${jwstAroundL2(at('2027-01-01'))} km/s on 1 January 2027`);
});

test('Webb’s loop is charted for October 2026 to December 2027 and no other date', () => {
  assert.deepEqual(jwstSpan().map(jd => dateOf(jd).toISOString().slice(0, 10)), ['2026-10-01', '2027-12-25']);
  for (const iso of ['2026-10-01', '2026-11-19', '2027-06-01', '2027-12-25']) assert.equal(jwstTracked(at(iso)), true, iso);
  for (const iso of ['2026-09-30', '2027-12-26', '2028-02-10', '2035-01-01']) {
    assert.equal(jwstTracked(at(iso)), false, iso);
    // Off the chart she is put at L2 itself, exactly 1.5 million km out: a stand-in the room must not pass off as her place.
    assert.ok(Math.abs(Math.hypot(...jwstFromEarth(at(iso))) - 1.5e6) < 1);
  }
  // The round figures her file gives then are what the chart itself shows: 1.2 to 1.8 million km from Earth, and
  // never more than 820,000 km from L2.
  const [t0, t1] = jwstSpan();
  let lo = Infinity, hi = 0, far = 0;
  for (let jd = t0; jd <= t1; jd += 0.5) {
    const w = jwstFromEarth(jd), e = earthAt(jd), r = Math.hypot(...e), d = Math.hypot(...w);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
    far = Math.max(far, Math.hypot(...w.map((v, k) => v - e[k] / r * 1.5e6)));
  }
  assert.ok(lo > 1.15e6 && lo < 1.25e6 && hi > 1.7e6 && hi < 1.8e6, `Webb is ${lo} to ${hi} km from Earth`);
  assert.ok(far > 7.5e5 && far < 8.3e5, `Webb gets ${far} km from L2`);
});

test('every ship has a file to read', () => {
  for (const s of SHIPS) {
    assert.ok(s.name && s.tagline && s.now && s.log.length && s.bound.text, s.id);
    assert.doesNotThrow(() => readings(s.id, at('2026-10-10')));
  }
});

test('a hail goes out, waits for its answer, and only then can another be sent', () => {
  const sent = Date.UTC(2026, 10, 18, 12), lt = 23.5 * 3600e3; // Voyager 1 is about 23 and a half light-hours out
  assert.equal(hailState(undefined, lt, sent), 'idle');
  assert.equal(hailState(null, lt, sent), 'idle');
  assert.equal(hailState(NaN, lt, sent), 'idle');
  assert.equal(hailState(sent, lt, sent), 'outbound');
  assert.equal(hailState(sent, lt, sent + lt - 1), 'outbound');
  assert.equal(hailState(sent, lt, sent + lt), 'inbound');
  assert.equal(hailState(sent, lt, sent + 2 * lt - 1), 'inbound', 'the day-two visitor could wipe a hail whose answer is still due');
  assert.equal(hailState(sent, lt, sent + 2 * lt), 'done');
  assert.equal(hailState(sent, lt, sent + 400 * 864e5), 'done');
  // A silent ship never answers, so there is nothing to wait for once the hail has arrived.
  assert.equal(hailState(sent, lt, sent + lt - 1, true), 'outbound');
  assert.equal(hailState(sent, lt, sent + lt, true), 'done');
  // A hail stamped in the future (the clock was changed) doesn't lock the button.
  assert.equal(hailState(sent + 5000, lt, sent), 'idle');
  // The states come in order and never go back as time passes.
  const order = ['outbound', 'inbound', 'done'];
  let last = 0;
  for (let t = sent; t <= sent + 3 * lt; t += lt / 16) {
    const k = order.indexOf(hailState(sent, lt, t));
    assert.ok(k >= last, `went back to ${order[k]} at ${t - sent} ms`);
    last = k;
  }
  assert.equal(last, 2);
});

test('a saved hail is kept only if it left at a real moment that has already come', () => {
  const now = Date.UTC(2026, 10, 18, 12);
  assert.equal(hailSent(now - 3600e3, now), now - 3600e3);
  assert.equal(hailSent(now, now), now);
  assert.equal(hailSent(now + 30e3, now), now + 30e3, 'a clock nudged by half a minute dropped a hail just sent');
  // Three days ahead (a clock set back since): it used to read "-300.006% of the way there".
  assert.equal(hailSent(now + 3 * 864e5, now), null);
  // Past the last moment a date can hold: it used to read "sent Invalid Date at Invalid Date".
  assert.equal(hailSent(8.64e15 + 1, now), null);
  for (const t of [0, -5, NaN, Infinity, '1790000000000', null, undefined, {}]) assert.equal(hailSent(t, now), null, `kept ${String(t)}`);
});

test('the Golden Record has what NASA lists, and only the Voyagers carry it', () => {
  // NASA's Voyager pages: greetings in 55 languages from Akkadian to Wu, 27 pieces of music, 115 pictures.
  const g = GOLDEN_RECORD;
  assert.equal(g.greetings.length, 55);
  assert.equal(new Set(g.greetings.map(([l]) => l)).size, 55, 'a language is listed twice');
  assert.deepEqual([g.greetings[0][0], g.greetings.at(-1)[0]], ['Akkadian', 'Wu']);
  assert.equal(g.greetings.find(([l]) => l === 'English')[1], 'Hello from the children of planet Earth.');
  assert.equal(g.music.length, 27);
  assert.match(g.music[0][1], /^Bach, Brandenburg Concerto No. 2/);
  assert.equal(g.music[6][1], '“Johnny B. Goode”');
  assert.match(g.music.at(-1)[1], /Cavatina$/);
  for (const m of g.music) assert.match(m[3], /^\d:\d\d$/);
  assert.equal(g.pictures, 115);
  assert.deepEqual(SHIPS.filter(s => s.golden).map(s => s.id), ['v1', 'v2']);
});

test('the Deep Space Network’s dishes are where NASA’s handbook puts them', async () => {
  const { DSN, DISH_LIMIT } = await import('../js/astro.js');
  // DSN 810-005, module 301, Rev. N, Table 5: DSS 14, DSS 63 and DSS 43, the 70-metre dishes.
  const dms = (d, m, s) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);
  const want = { Goldstone: [dms(35, 25, 33.24312), dms(243, 6, 37.66244) - 360], Madrid: [dms(40, 25, 52.3551), dms(355, 45, 7.16924) - 360], Canberra: [-dms(35, 24, 8.72724), dms(148, 58, 52.56231)] };
  for (const site of DSN) {
    assert.ok(Math.abs(site.lat - want[site.name][0]) < 1e-5 && Math.abs(site.lon - want[site.name][1]) < 1e-5, `${site.name} is not where the handbook puts it`);
  }
  assert.equal(DISH_LIMIT, 6);
});

test('which dish could hear a ship follows her place in the sky', async () => {
  const { dishWatch, shipDir, frame, toLocal, altAz, DSN, gmst } = await import('../js/astro.js');
  const { dishLine } = await import('../js/ships.js');
  const now = new Date('2026-11-19T17:00:00Z'), jd = jdOf(now);
  // Voyager 1's height at Goldstone, worked out again the plain way: her right ascension and declination from Earth,
  // and the hour angle from sidereal time. The two agree to within the Earth's axis having swung since 2000.
  const d = shipDir('v1', jd), ra = Math.atan2(d[1], d[0]), dec = Math.asin(d[2]);
  const g = DSN[0], lat = g.lat * Math.PI / 180, ha = (gmst(jd) + g.lon) * Math.PI / 180 - ra;
  const plain = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
  const alt = altAz(toLocal(frame(g.lat, g.lon, jd), d)).alt;
  assert.ok(Math.abs(alt - plain) < 0.5, `Goldstone sees her ${alt.toFixed(2)}° up, the plain way ${plain.toFixed(2)}°`);
  const fmt = t => t.toISOString().slice(11, 16);
  const v1 = dishWatch('v1', now);
  assert.equal(dishLine(v1, { fmt }), 'Goldstone and Madrid could hear her now. Canberra next, 22:30.');
  // Voyager 2 is so far south that only Canberra ever sees her: Goldstone and Madrid never do, all day.
  const v2 = dishWatch('v2', now);
  assert.deepEqual(v2.slice(0, 2).map(w => w.always), ['down', 'down']);
  assert.match(dishLine(v2, { fmt, south: shipDir('v2', jd)[2] < 0 }), /^Canberra could hear her now\. She is too far south for Goldstone and Madrid\.$/);
  for (let h = 0; h < 24; h++) assert.ok(dishWatch('v2', new Date(+now + h * 3600e3)).slice(0, 2).every(w => !w.up), 'Voyager 2 rose at Goldstone or Madrid');
  // The words for the rest: nobody up, and a silent ship.
  const none = [{ name: 'Goldstone', up: false, rise: new Date('2026-11-19T20:05:00Z') }, { name: 'Madrid', up: false, rise: new Date('2026-11-20T03:00:00Z') }, { name: 'Canberra', up: false, rise: null, always: 'down' }];
  assert.equal(dishLine(none, { fmt, south: false }), 'No dish could hear her right now. Goldstone next, 20:05. She is too far north for Canberra.');
  assert.equal(dishLine(v1, { fmt, silent: true }), 'Nobody listens for her any more. Goldstone and Madrid could hear her now, if she called. Canberra next, 22:30.');
});

test('Webb’s planned fuel runs out about 20 years after her launch, and only hers', async () => {
  const { pastFuel, FUEL_LINE } = await import('../js/ships.js');
  const webb = byId('jwst');
  assert.equal(pastFuel(webb, Date.parse('2041-12-31T12:00:00Z')), false);
  assert.equal(pastFuel(webb, Date.parse('2042-01-01T12:00:00Z')), true);
  assert.equal(pastFuel(webb, Date.parse('2100-12-31T12:00:00Z')), true);
  assert.ok(Date.parse(webb.fuelOut) - Date.parse(webb.launched) > 19.9 * 365.25 * 864e5);
  for (const s of SHIPS.filter(s => s.id !== 'jwst')) assert.equal(pastFuel(s, Date.parse('2100-01-01')), false, s.id);
  assert.match(FUEL_LINE, /about 20 years .* isn’t known$/);
});

test('her answer comes in when a dish could hear her, not while she is below every dish', async () => {
  const { dishWatch, heardAt, DISH_LIMIT } = await import('../js/astro.js');
  const { hailChange } = await import('../js/ships.js');
  // Voyager 2 is heard only from Canberra, and on 20 November 2026 she sits just under its 6° limit from about 17:20
  // to 19:28 UTC. An answer reaching Earth at 18:00 waits for her to climb past it.
  const home = Date.parse('2026-11-20T18:00:00Z');
  assert.equal(dishWatch('v2', new Date(home)).some(w => w.up), false);
  const h = heardAt('v2', home);
  assert.equal(h.site, 'Canberra');
  assert.ok(h.at > home + 80 * 60000 && h.at < home + 100 * 60000, `heard at ${new Date(h.at).toISOString()}`);
  const there = dishWatch('v2', new Date(h.at + 60000))[2];
  assert.ok(there.up && there.alt < DISH_LIMIT + 0.2, `Canberra sees her ${there.alt.toFixed(2)}° up a minute after`);
  // Heard at once when a dish can hear her: the site where she stands highest.
  const now = Date.parse('2026-11-19T17:00:00Z');
  assert.deepEqual(heardAt('v2', now), { at: now, site: 'Canberra' });
  assert.equal(heardAt('v1', now).at, now);
  // The hail's stages wait for it: her answer is still on its way after it reaches Earth, until it is heard.
  const lt = 19.4 * 3600e3, sent = home - 2 * lt;
  assert.equal(hailChange(sent, lt, home + 60000, false, h.at).stage, 'arrived');
  assert.equal(hailState(sent, lt, home + 60000, false, h.at), 'inbound');
  assert.deepEqual(hailChange(sent, lt, h.at, false, h.at), { stage: 'answered', at: h.at });
  assert.equal(hailState(sent, lt, h.at, false, h.at), 'done');
  // Never earlier than the light allows, and a silent ship still sends nothing.
  assert.equal(hailChange(sent, lt, home, false, home - 3600e3).at, home);
  assert.equal(hailChange(sent, lt, h.at, true, h.at).stage, 'arrived');
});

test('each ship is in the constellation NASA names for her', async () => {
  const { readFile } = await import('node:fs/promises');
  const { constellationIn, shipDir } = await import('../js/astro.js');
  const meta = JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url), 'utf8'));
  const jd = at('2026-11-19T12:00:00Z');
  // NASA's Voyager FAQ: Voyager 1 is aiming toward Ophiuchus, Voyager 2 toward Sagittarius and Pavo. New Horizons'
  // file has her heading toward Sagittarius.
  assert.deepEqual(['v1', 'v2', 'nh'].map(id => constellationIn(meta, shipDir(id, jd))), ['Ophiuchus', 'Pavo', 'Sagittarius']);
});

test('before 2020 the ships follow their tracks from launch, through each planet they passed', () => {
  // Each flyby lands on the planet: the path is pinned there on the day of closest approach.
  for (const [id, planet, day] of [['v1', 'jupiter', '1979-03-05'], ['v2', 'uranus', '1986-01-24'], ['v2', 'neptune', '1989-08-25'], ['nh', 'pluto', '2015-07-14'], ['p11', 'saturn', '1979-09-01']]) {
    const jd = at(`${day}T12:00:00Z`), p = readings(id, jd).pos, q = planetAt(planet, jd);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.01, `${id} misses ${planet}`);
  }
  // NASA's own numbers: the Pale Blue Dot from about 6 billion km (40 AU), Voyager 1 overtaking Pioneer 10 on
  // 17 February 1998, and the heliopause at 121.6 AU and 119 AU.
  assert.ok(Math.abs(readings('v1', at('1990-02-14T12:00:00Z')).sunAU - 40.1) < 0.6);
  assert.ok(readings('v1', at('1998-01-17')).sunAU < readings('p10', at('1998-01-17')).sunAU, 'Voyager 1 passed Pioneer 10 early');
  assert.ok(readings('v1', at('1998-03-17')).sunAU > readings('p10', at('1998-03-17')).sunAU, 'Voyager 1 never passed Pioneer 10');
  assert.ok(Math.abs(readings('v1', at('2012-08-25')).sunAU - 121.6) < 0.3);
  assert.ok(Math.abs(readings('v2', at('2018-11-05')).sunAU - 119) < 0.3);
  // And on to 2100, coasting: Voyager 1 at about 432 AU.
  assert.ok(Math.abs(readings('v1', at('2100-01-01')).sunAU - 432) < 1);
  // No jumps anywhere along the way, and the curve meets the yearly states smoothly in 2020.
  for (const id of ['v1', 'v2', 'nh', 'p10', 'p11']) {
    assert.equal(trackUntil(id, at('1972-01-01')).length, 1, `${id} has a path before launch`);
    let prev = null;
    for (let jd = at('1972-03-10'); jd < at('2021-01-01'); jd += 1) {
      const p = readings(id, jd).pos;
      if (prev) assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) < 0.03, `${id} jumps on ${dateOf(jd).toISOString().slice(0, 10)}`);
      prev = p;
    }
    const a = stateAt(id, 2458849.5 - 1e-6).pos, b = stateAt(id, 2458849.5).pos;
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6, `${id} jumps in 2020`);
  }
});

test('a hail’s latest change, the line that says it landed, and her answer', async () => {
  const { hailChange, whenLanded, newsLine, replyText, typedChars } = await import('../js/ships.js');
  const H = 3600e3;
  assert.equal(hailChange(undefined, 10 * H, 0), null);
  assert.deepEqual(hailChange(0, 10 * H, 5 * H), { stage: 'sent', at: 0 });
  assert.deepEqual(hailChange(0, 10 * H, 15 * H), { stage: 'arrived', at: 10 * H });
  assert.deepEqual(hailChange(0, 10 * H, 25 * H), { stage: 'answered', at: 20 * H });
  assert.deepEqual(hailChange(0, 10 * H, 25 * H, true), { stage: 'arrived', at: 10 * H }, 'a silent ship answered');
  // Overnight is from 9 pm to 6 am, said once it's morning; otherwise the moment.
  const fmt = d => `at ${d.getHours()}`;
  const local = (d, h, m = 0) => +new Date(2026, 10, d, h, m);
  assert.equal(whenLanded(local(18, 23), local(19, 8), fmt), 'overnight');
  assert.equal(whenLanded(local(19, 3), local(19, 8), fmt), 'overnight');
  assert.equal(whenLanded(local(19, 3), local(19, 4), fmt), 'at 3');
  assert.equal(whenLanded(local(19, 14), local(19, 15), fmt), 'at 14');
  assert.equal(whenLanded(local(19, 14), local(19, 14, 1), fmt), 'just now');
  const v2 = byId('v2');
  assert.equal(newsLine(v2, { stage: 'arrived', at: local(18, 23) }, local(19, 8), fmt), 'Your hail reached Voyager 2 overnight.');
  assert.equal(newsLine(v2, { stage: 'answered', at: local(19, 14) }, local(19, 15), fmt), 'Voyager 2’s answer to your hail came in at 14.');
  // Her answer comes from her file and the numbers, at her real downlink rate: 160 bits a second is 20 letters.
  const text = replyText(v2, { when: 'today at 9:00 am', au: '144.5', km: '0', light: '20 hours', constellation: 'Pavo' });
  assert.equal(text, 'Voyager 2 to Earth. Your hail reached me today at 9:00 am, 144.5 AU from the Sun and 20 hours out from you. Seen from you, I am in Pavo. Only the big dish at Canberra can reach me this far south, so I am glad you got through. I am sending this at 160 bits a second. Voyager 2 out.');
  assert.match(replyText(byId('jwst'), { when: 'just now', km: '1,512,000', light: '5 seconds' }), /^Webb to Earth\. Your hail reached me just now, 1,512,000 km out from you\. .* 28 million bits a second\. Webb out\.$/);
  assert.equal(typedChars(160, 1000), 20);
  assert.equal(typedChars(160, -5), 0);
  // Every ship that can answer has a rate and a line; the silent ones have none.
  for (const s of SHIPS) assert.equal(!!s.reply, s.status !== 'silent', `${s.name}’s answer`);
});
