// The long way home's rules, checked without a browser:  node --test test/longway.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warpSpeed } from '../js/physics.js';
import {
  COLLECT, NEBULA_FUEL, QUARTER, SHOW_YEARS, START_LY, SUSTAIN_WARP, TANK, TIRED_WARP, TOP_WARP, ahead, burn, cruise, debrief,
  newTrip, readTrip, recordHome, step, warpFor, weeksFlatOut, whenSaid, yearsSaid,
} from '../js/longway.js';

// Plays a whole trip: warp `warp` (a number, or a function of the trip), stopping at every nebula when the tanks
// have room and at a world when the stores are below half.
function play(seed, warp, { fuel = true, worlds = true } = {}) {
  const t = newTrip(seed);
  for (let n = 0; t.home == null && n < 5000; n++) {
    const a = ahead(t.seed, t.quarter);
    if (fuel && a === 'nebula' && t.fuel <= TANK - NEBULA_FUEL / 2) step(t, { stop: 'nebula' });
    else if (worlds && a === 'world' && t.supplies < 50) step(t, { stop: 'world' });
    else step(t, { warp: typeof warp === 'function' ? warp(t) : warp });
  }
  return t;
}

test('the numbers from the show and the warp scale: 70,000 light years, 75 years at warp 7.8, 10 flat out', () => {
  assert.equal(START_LY, 70000);
  assert.equal(SHOW_YEARS, 75);
  assert.ok(Math.abs(SUSTAIN_WARP - 7.78) < 0.01, `${SUSTAIN_WARP}`);
  assert.ok(Math.abs(START_LY / warpSpeed(TOP_WARP) - 10.4) < 0.2);
  assert.ok(Math.abs(warpFor(warpSpeed(8)) - 8) < 1e-6);
});

test('fuel burns faster than speed rises: warp 7.8 keeps up with the collectors, flat out empties the tanks in weeks', () => {
  assert.ok(Math.abs(burn(SUSTAIN_WARP) - COLLECT) < 1e-6);
  assert.ok(burn(9) / burn(8) > warpSpeed(9) / warpSpeed(8));
  assert.ok(weeksFlatOut() > 4 && weeksFlatOut() < 10, `${weeksFlatOut()}`);
  // A quarter flat out from full tanks: dry partway, then warp 7.8 for the rest.
  const t = newTrip(1), r = step(t, { warp: TOP_WARP });
  assert.equal(r.ran, 'dry');
  assert.equal(t.fuel, 0);
  assert.ok(r.ly > warpSpeed(SUSTAIN_WARP) * QUARTER && r.ly < warpSpeed(TOP_WARP) * QUARTER);
  // At warp 7.8 or slower the tanks never empty.
  const s = newTrip(1);
  for (let k = 0; k < 20; k++) step(s, { warp: 7 });
  assert.equal(s.fuel, TANK);
});

test('a stop is only for what is there, and costs the quarter', () => {
  const t = newTrip(7);
  step(t, { warp: TOP_WARP });
  while (ahead(t.seed, t.quarter) !== 'nebula') step(t, { warp: SUSTAIN_WARP });
  const left = t.left, q = t.quarter;
  const r = step(t, { stop: 'nebula' });
  assert.equal(r.stopped, 'nebula');
  assert.equal(t.fuel, NEBULA_FUEL);
  assert.equal(t.left, left);
  assert.equal(t.quarter, q + 1);
  // Asking to stop for a world that isn't there just flies on.
  while (ahead(t.seed, t.quarter) === 'world') step(t, { warp: 7 });
  const r2 = step(t, { stop: 'world', warp: 7 });
  assert.equal(r2.stopped, null);
});

test('with the stores empty the crew can’t run her past warp 6', () => {
  const t = newTrip(3);
  t.supplies = 2;
  const r = step(t, { warp: 9 });
  assert.equal(r.tired, true);
  assert.ok(Math.abs(r.warp - TIRED_WARP) < 0.01);
});

test('whole trips: cruising at 7.8 takes the show’s 75 years and more for its stops; a middle pace with fuel stops beats both it and flat out', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    const slow = play(seed, SUSTAIN_WARP, { fuel: false });
    const flat = play(seed, TOP_WARP);
    const nine = play(seed, 9);
    assert.ok(slow.home > SHOW_YEARS && slow.home < SHOW_YEARS + 10, `${seed}: ${slow.home}`);
    assert.ok(nine.home < slow.home - 10 && nine.home < flat.home - 10, `${seed}: ${nine.home} ${slow.home} ${flat.home}`);
    assert.ok(nine.home > 45, `${seed}: ${nine.home}`);
    assert.equal(Math.round(nine.flown), START_LY);
  }
  // Without ever stopping at a world the stores run out and the trip takes far longer.
  assert.ok(play(1, 9, { worlds: false }).home > 120);
});

test('cruising on stops for a decision: something ahead, the tanks dry, the stores low, or home', () => {
  const t = newTrip(5);
  const went = cruise(t, 7);
  assert.ok(went.length >= 1);
  assert.ok(ahead(t.seed, t.quarter) || t.supplies <= 20 || t.home != null, 'cruised past a decision');
  const u = newTrip(5);
  const dry = cruise(u, TOP_WARP);
  assert.equal(dry.at(-1).ran, 'dry');
  // With the tanks already dry, cruising on at a high warp flies on at 7.8 until the next decision, not a quarter at a
  // time.
  const on = cruise(u, TOP_WARP);
  assert.ok(on.every(r => !r.ran), 'the tanks ran dry twice');
  assert.ok(on.length > 1 || ahead(u.seed, u.quarter) || u.supplies <= 20);
});

test('the words, the debrief and the record', () => {
  assert.equal(whenSaid(0), 'Year 1, quarter 1');
  assert.equal(whenSaid(9), 'Year 3, quarter 2');
  assert.equal(yearsSaid(58.25), '58 years 3 months');
  assert.equal(yearsSaid(1), '1 year');
  const t = play(2, 9);
  const [head, why] = debrief(t);
  assert.match(head, /^Home in \d+ years( \d+ months?)?, with \d+ stops? for fuel and \d+ for shore leave\.$/);
  assert.match(why, /^Cruising at warp 7\.8, .* the 75 years Voyager’s crew were told in “Caretaker”\. Flat out at warp 9\.975 it would be 10 years \d+ months?, if the fuel lasted; full tanks last about \d weeks at that\.$/);
  let saved = recordHome({ trip: { seed: 1 } }, t);
  assert.deepEqual([saved.trip, saved.homes, saved.best], [null, 1, t.home]);
  saved = recordHome(saved, { home: t.home + 10 });
  assert.deepEqual([saved.homes, saved.best], [2, t.home]);
  // A trip under way comes back from the record; anything else doesn't.
  const u = newTrip(9); step(u, { warp: 8 });
  assert.deepEqual(readTrip(JSON.parse(JSON.stringify({ trip: u }))), u);
  assert.equal(readTrip({ trip: { seed: 'x' } }), null);
  assert.equal(readTrip(null), null);
});
