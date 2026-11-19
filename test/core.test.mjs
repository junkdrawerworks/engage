// Main engineering's rules, checked without a browser:  node --test test/core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEUT_TANK, HOT, LIMIT, MEGATON, ORDERS, ORDER_SECONDS, PAIR_J, TOLERANCE, costOf, flowsFor, grade, massSaid, need, newShift,
  orders, reading, recordShift, run, warpOf, yardsticks,
} from '../js/core.js';

// A whole shift flown by a careful engineer who takes `lag` seconds to answer each new order.
function fly(seed, lag = 1, ratio = 1) {
  const s = newShift(seed);
  let set = -1;
  while (!s.over) {
    const k = Math.floor(s.t / ORDER_SECONDS);
    if (k !== set && s.t - k * ORDER_SECONDS >= lag - 1e-9) { Object.assign(s, flowsFor(s.orders[k], ratio)); set = k; }
    run(s, 0.1);
  }
  return s;
}

test('the energy is real: a kilogram of antimatter and a kilogram of matter give 1.8e17 joules, about 43 megatons', () => {
  assert.ok(Math.abs(PAIR_J - 1.797e17) < 1e14, `${PAIR_J}`);
  assert.equal(Math.round(PAIR_J / MEGATON), 43);
  const y = yardsticks(1);
  assert.equal(Math.round(y.hiroshimas), 2864); // 43 megatons over 15 kilotons
  assert.ok(Math.abs(y.tsars - 0.859) < 0.001);
  assert.deepEqual(y.lines.slice(0, 2), ['43 megatons of TNT', '2,864 times the Hiroshima bomb']);
  // A year of the world's energy is about 3.3 tonnes of antimatter.
  assert.ok(Math.abs(yardsticks(3338).worldHours - 8766) < 10);
  assert.match(yardsticks(1000).lines[3], /^\d+ days of all the energy the world uses$/);
  assert.equal(massSaid(0.64), '640 g');
  assert.equal(massSaid(3.82), '3.8 kg');
});

test('what a warp factor costs this core: warp 5 a quarter of its power, warp 8 nearly two thirds', () => {
  assert.equal(need(5), 0.25);
  assert.ok(Math.abs(warpOf(need(8.5)) - 8.5) < 1e-9);
  const c = costOf(8);
  assert.ok(Math.abs(c.kg - 0.64) < 1e-9);
  assert.equal(Math.round(c.megatons), 27);
});

test('the bridge asks for eight orders, warp 3 to 9.5, each a warp and a half from the last, the same for the same seed', () => {
  for (let seed = 0; seed < 300; seed++) {
    const o = orders(seed);
    assert.equal(o.length, ORDERS);
    for (let k = 0; k < o.length; k++) {
      assert.ok(o[k] >= 3 && o[k] <= 9.5 && o[k] * 2 === Math.round(o[k] * 2));
      if (k) assert.ok(Math.abs(o[k] - o[k - 1]) >= 1.5);
    }
  }
  assert.deepEqual(orders(42), orders(42));
  // A careful engineer can hold every order the bridge gives, without running hot.
  for (let w = 3; w <= 9.5; w += 0.5) {
    const f = flowsFor(w), s = { ...newShift(1), ...f, orders: Array(ORDERS).fill(w) };
    const r = reading(s);
    assert.ok(Math.abs(r.warp - w) <= TOLERANCE / 2 && r.settle <= HOT + 1e-9 && r.spill === 0, `warp ${w}`);
  }
});

test('one to one burns everything; antimatter with nothing to meet strains containment; a rich mix runs cooler', () => {
  const s = newShift(1);
  Object.assign(s, { a: 0.5, d: 0.5, c: 0 });
  assert.deepEqual([reading(s).burn, reading(s).spill, reading(s).rich, reading(s).ratio], [0.5, 0, 0, 1]);
  const rich = { ...s, d: 1 };
  assert.ok(reading(rich).settle < reading(s).settle, 'surplus deuterium carries heat away');
  assert.equal(reading(rich).burn, 0.5, 'surplus deuterium is not burned');
  // Coolant costs power: its pumps take it from the coils.
  assert.ok(reading({ ...s, c: 1 }).power < reading(s).power);
  // Antimatter with nothing to meet ejects the core in seconds.
  const lean = Object.assign(newShift(1), { a: 0.8, d: 0.2, c: 0.4 });
  run(lean, 30);
  assert.equal(lean.over, 'ejected');
  assert.ok(lean.t < 6, `${lean.t}`);
  assert.equal(grade(lean).letter, 'F');
  // So does a core run hot past its limit with no coolant.
  const hot = Object.assign(newShift(1), { a: 1, d: 1, c: 0 });
  run(hot, 30);
  assert.equal(hot.over, 'ejected');
  assert.ok(hot.hottest > LIMIT);
  // And strain eases off once the cause is gone.
  const eased = Object.assign(newShift(1), { a: 0.6, d: 0.3, c: 0.3 });
  run(eased, 2);
  const strained = eased.strain;
  Object.assign(eased, flowsFor(6));
  run(eased, 3);
  assert.ok(strained > 0.2 && eased.strain < strained);
});

test('the deuterium tank holds six hours at full flow: run rich all shift and it runs dry, and the core with it', () => {
  const s = newShift(42);
  Object.assign(s, { a: 0.5, d: 1, c: 0 });
  run(s, ORDERS * ORDER_SECONDS);
  assert.equal(s.deut, 0);
  assert.equal(s.over, 'ejected', 'with the tank dry the antimatter has nothing to meet');
  assert.ok(Math.abs(s.t - DEUT_TANK * ORDER_SECONDS) < 6, `${s.t}`);
});

test('a careful shift holds the orders, ends clean, and burns kilograms', () => {
  for (const seed of [1, 2, 3, 42, 99, 1234]) {
    const quick = fly(seed, 1), slow = fly(seed, 4);
    assert.equal(quick.over, 'done');
    assert.equal(grade(quick).letter, 'A');
    assert.ok(grade(slow).share < grade(quick).share);
    assert.ok(quick.kg > 2 && quick.kg < 6, `${quick.kg}`);
    assert.ok(quick.deut > 0 && quick.strain === 0 && quick.hottest <= HOT + 0.01);
    assert.ok(Math.abs(quick.t - ORDERS * ORDER_SECONDS) < 1e-6);
    // Running on after the shift ends changes nothing.
    const kg = quick.kg;
    run(quick, 10);
    assert.equal(quick.kg, kg);
  }
  // Nobody holding the orders at all is an F.
  const idle = newShift(5);
  run(idle, ORDERS * ORDER_SECONDS);
  assert.deepEqual([idle.over, grade(idle).letter, idle.kg], ['done', 'F', 0]);
});

test('the record: shifts, the best share held, antimatter in all, and cores ejected', () => {
  const a = fly(1), b = fly(2, 5);
  let r = recordShift(null, a);
  r = recordShift(r, b);
  assert.equal(r.shifts, 2);
  assert.equal(r.best, grade(a).share);
  assert.ok(Math.abs(r.kg - a.kg - b.kg) < 1e-9);
  const lean = Object.assign(newShift(1), { a: 0.8, d: 0.2 });
  run(lean, 30);
  r = recordShift(r, lean);
  assert.deepEqual([r.shifts, r.ejected, r.best], [3, 1, grade(a).share]);
  assert.deepEqual(recordShift('nonsense', a).shifts, 1);
});
