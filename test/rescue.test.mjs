// The rescue test's rules, checked without a browser:  node --test test/rescue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRescue, orders, act, run, best, evaluate, settle, hopeless, travel, dailySeed, shareLine, RATE, QUANTUM, SHUTTLE_SEATS, BUY, RANGE_KM, apartKm } from '../js/rescue-sim.js';

const saved = t => t.ships.reduce((n, s) => n + s.saved, 0);
const play = (t0, list) => { const t = structuredClone(t0); for (const id of list) { act(t, id); settle(t); } return t; };
const SEEDS = Array.from({ length: 25 }, (_, k) => 1000 + k * 7919);

test('every test is fair: nobody can save everyone, and the best run takes people off both ships', () => {
  for (const seed of SEEDS) {
    const t = newRescue(seed);
    assert.ok(t.most <= t.total - 40, `seed ${seed}: everyone, or nearly, can be saved`);
    const end = play(t, t.plan);
    assert.equal(saved(end), t.most, `seed ${seed}: the plan doesn't bring home what the search said`);
    assert.ok(end.ships.every(s => s.saved > 0), `seed ${seed}: the best run saves from one ship only`);
    // The answer the examiners expect, going to one ship and beaming, is always short of the best.
    assert.ok(t.plain + 20 <= t.most, `seed ${seed}: the plain answer is as good as the best`);
    assert.equal(t.total, t.ships[0].aboard + t.ships[1].aboard);
    assert.ok(apartKm(t) > 2 * RANGE_KM, 'the two ships are in transporter range of each other');
  }
});

test('the same seed is the same test, and today’s is the same for everyone that day', () => {
  assert.deepEqual(newRescue(42), newRescue(42));
  assert.equal(dailySeed('2026-11-20'), dailySeed('2026-11-20'));
  assert.notEqual(dailySeed('2026-11-20'), dailySeed('2026-11-21'));
  assert.notDeepEqual(newRescue(dailySeed('2026-11-20')).ships, newRescue(dailySeed('2026-11-21')).ships);
});

test('no run brings home more than the most the board says is possible', () => {
  // Random orders, many times over: the search is the ceiling.
  for (const seed of SEEDS.slice(0, 10)) {
    const t0 = newRescue(seed);
    let r = seed;
    for (let w = 0; w < 40; w++) {
      const t = structuredClone(t0);
      const given = [];
      while (!t.over) {
        const on = orders(t).filter(o => !o.off);
        r = (Math.imul(r, 1103515245) + 12345) >>> 0;
        const id = on[r % on.length].id;
        given.push(id);
        act(t, id);
        settle(t);
      }
      assert.ok(saved(t) <= t0.most, `seed ${seed}: ${given.join(',')} beat the best`);
      // Everyone aboard at the start is accounted for: saved, or lost with a ship.
      for (const [k, s] of t.ships.entries()) assert.equal(s.saved + (s.lost ? s.aboard : 0), t0.ships[k].aboard, 'people went missing');
      assert.ok(t.ships.every(s => s.lost || s.aboard === 0), 'the test ended with a ship still waiting');
    }
  }
});

test('the transporter reaches only the ship alongside, and closing on the other takes the trip’s minutes', () => {
  const t = newRescue(7);
  assert.equal(orders(t).find(o => o.id === 'beam').off, true, 'energize works between the ships');
  assert.equal(travel(t, 0), 1);
  act(t, 'go-0');
  assert.equal(t.minute, 1);
  assert.equal(t.at, 'a');
  const before = t.ships[0].aboard;
  act(t, 'beam');
  assert.equal(t.ships[0].aboard, before - Math.min(RATE, before));
  assert.equal(t.ships[1].saved, 0);
  assert.equal(travel(t, 1), t.apart);
  const m = t.minute;
  act(t, 'go-1');
  assert.equal(t.minute, m + t.apart);
});

test('the cargo transporters, the shuttles and a ship told to buy time each do what they say, once', () => {
  const t = newRescue(11);
  act(t, 'go-0');
  act(t, 'quantum');
  assert.equal(t.rate, RATE + QUANTUM);
  assert.ok(!orders(t).some(o => o.id === 'quantum'), 'quantum level offered twice');
  const left = t.ships[1].left;
  act(t, 'tell-1');
  assert.equal(t.ships[1].left, left + BUY - 1);
  assert.ok(!orders(t).some(o => o.id === 'tell-1'));
  const aboard = t.ships[1].aboard;
  act(t, 'shuttle-1');
  assert.ok(!orders(t).some(o => o.id.startsWith('shuttle-')), 'shuttles launched twice');
  while (!t.shuttles.done && !t.over) act(t, orders(t).find(o => !o.off).id);
  if (!t.ships[1].lost || t.ships[1].shuttled) assert.equal(t.ships[1].shuttled, Math.min(SHUTTLE_SEATS, aboard));
});

test('a test with nothing left to try ends by itself', () => {
  for (const seed of SEEDS.slice(0, 8)) {
    const t = newRescue(seed);
    // The best run's last order leaves nothing to try, and the clocks run out without another.
    for (const id of t.plan) { act(t, id); settle(t); if (t.over) break; }
    assert.ok(t.over, `seed ${seed}: the best run didn't end`);
    assert.ok(hopeless(t));
  }
});

test('the board’s verdict: commended for the most there was, and notes only on what would have helped', () => {
  const t0 = newRescue(5);
  const top = evaluate(play(t0, t0.plan), t0.plan);
  assert.equal(top.title, 'Commended');
  assert.equal(top.rescued, t0.most);
  assert.match(top.summary, /and you found it\.$/);
  assert.ok(!top.note.some(n => /never|nobody asked/.test(n)), 'the best run was told what it missed');
  assert.match(top.note.at(-1), /Paul Rice/);
  // Plain: go to one ship and beam. The board says what was missed.
  const plain = ['go-0', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam'];
  const end = structuredClone(t0);
  const given = [];
  for (const id of plain) { if (end.over) break; if (orders(end).some(o => o.id === id && !o.off)) { act(end, id); given.push(id); settle(end); } }
  while (!end.over) { act(end, orders(end).find(o => !o.off).id); settle(end); }
  const e = evaluate(end, given);
  assert.ok(e.rescued < t0.most);
  assert.notEqual(e.title, 'Commended');
  assert.ok(e.note.some(n => /cargo transporters/.test(n)));
  assert.ok(e.note.some(n => /buy time/.test(n)));
  assert.match(e.summary, /\(\d+% of it\)\.$/);
  assert.equal(shareLine(e, '2026-11-20'), `Rescue test, 20 Nov: ${e.rescued} home, of the ${t0.most} it allowed`);
});

test('the search finds the best: no other order from the plan’s states does better', () => {
  const t0 = newRescue(3);
  const t = structuredClone(t0);
  for (const id of t0.plan) {
    const here = best(t).rescued;
    for (const o of orders(t).filter(x => !x.off)) assert.ok(best(run(t, [o.id])).rescued <= here);
    act(t, id);
  }
});
