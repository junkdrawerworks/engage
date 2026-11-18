// The long missions' numbers, checked without a browser:  node --test test/missions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jdOf, dateOf, readings, stateAt, earthAt, planetAt, heading, whenAbove, lastCrossing, milestones, jwstFromEarth, jwstAroundL2, trackUntil, LIGHT_DAY_AU, AU_KM } from '../js/ephemeris.js';
import { SHIPS, byId, hailState, milestoneText } from '../js/ships.js';

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
