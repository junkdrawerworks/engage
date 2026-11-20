// The shipyard's rules, checked without a browser:  node --test test/shipyard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HULLS, ALL, stats, split, rebalance, warpOf, requisition, meets, shortOf, encodeDesign, decodeDesign, tidyDesign, tidyYard, suggestName, TOP, MAX_DESIGNS } from '../js/shipyard-sim.js';
import { warpSpeed } from '../js/physics.js';

test('warpOf runs the warp scale backward', () => {
  for (const w of [1.5, 3, 6, 8, 9, 9.5, 9.9]) assert.ok(Math.abs(warpOf(warpSpeed(w)) - w) < 1e-3, `warp ${w}`); // the scale's curve has a step of a hair at warp 9
  assert.equal(warpOf(0.5), 1);
});

test('more engines, more speed; more science, longer sensors; more defence, a stronger ship; and nothing passes warp 9.975', () => {
  for (const h of HULLS) {
    const slow = stats({ hull: h.id, e: 20, s: 40 }), fast = stats({ hull: h.id, e: 60, s: 20 });
    assert.ok(fast.top > slow.top && fast.cruise > slow.cruise, `${h.id}: engines did nothing`);
    assert.ok(stats({ hull: h.id, e: 30, s: 50 }).sensors > stats({ hull: h.id, e: 30, s: 20 }).sensors, `${h.id}: science did nothing`);
    assert.ok(stats({ hull: h.id, e: 30, s: 10 }).defence > stats({ hull: h.id, e: 30, s: 40 }).defence, `${h.id}: defence did nothing`);
    for (const d of ALL.filter(x => x.hull === h.id)) {
      const st = stats(d);
      assert.ok(st.top <= TOP && st.cruise < st.top && st.cruise >= 1, `${h.id} ${d.e}/${d.s}: ${st.top}, ${st.cruise}`);
      assert.ok(st.crew >= 5 && st.sensors >= 1 && st.defence >= 0 && st.defence <= 100);
    }
  }
  // Each hull at a middling split is near the class she is said to be like.
  assert.equal(stats({ hull: 'cruiser', e: 40, s: 30 }).top, 8, 'the Constitution class: warp 8 in an emergency');
  assert.ok(Math.abs(stats({ hull: 'cruiser', e: 40, s: 30 }).crew - 430) <= 30, 'the Constitution class: 430 aboard');
  assert.ok(Math.abs(stats({ hull: 'escort', e: 40, s: 30 }).crew - 50) <= 10, 'the Defiant: about 50');
  assert.ok(stats({ hull: 'flagship', e: 40, s: 30 }).crew >= 900, 'the Galaxy class: a thousand or so');
});

test('the split stays whole: multiples of five, at least ten each, adding to 100', () => {
  for (const [key, v] of [['e', 80], ['e', 95], ['s', 5], ['d', 60], ['s', 47], ['d', 10]]) {
    for (const cur of [{ e: 40, s: 30 }, { e: 10, s: 10 }, { e: 80, s: 10 }, { e: 20, s: 70 }]) {
      const r = rebalance(cur, key, v);
      assert.equal(r.e + r.s + r.d, 100);
      for (const x of [r.e, r.s, r.d]) assert.ok(x >= 10 && x % 5 === 0, JSON.stringify([cur, key, v, r]));
    }
  }
  assert.deepEqual(rebalance({ e: 40, s: 30 }, 'e', 60), { e: 60, s: 20, d: 20 });
  assert.deepEqual(split(200, 3), { e: 80, s: 10, d: 10 });
});

test('a design goes into a link and comes back the same, and a bad link is nothing', () => {
  const d = { hull: 'explorer', e: 45, s: 35, registry: 'NCC-74656', name: 'St. Louis Bay' };
  const back = decodeDesign(encodeDesign(d));
  assert.deepEqual([back.hull, back.e, back.s, back.registry, back.name], [d.hull, d.e, d.s, d.registry, d.name]);
  assert.ok(!encodeDesign(d).slice(2).includes(' '));
  for (const bad of ['', '2.scout.40.30..A', '1.warbird.40.30..A', '1.scout.43.30..A', '1.scout.80.20..A', '1.scout.40.30..', '1.scout.40.30..%E0%A4%A']) assert.equal(decodeDesign(bad), null, bad);
});

test('the record is read back tidily, and keeps at most forty designs', () => {
  const many = Array.from({ length: 45 }, (_, k) => ({ id: `d${k}`, name: `Ship ${k}`, hull: 'scout', e: 40, s: 30, at: '2026-11-20T10:00:00.000Z' }));
  const y = tidyYard({ designs: [...many, { id: 'x', name: '', hull: 'scout', e: 40, s: 30 }, { name: 'B', hull: 'nope', e: 40, s: 30 }], filled: { '2026-11-20': 'd44', nonsense: 'd1' } });
  assert.equal(y.designs.length, MAX_DESIGNS);
  assert.equal(y.designs.at(-1).id, 'd44');
  assert.deepEqual(y.filled, { '2026-11-20': 'd44' });
  assert.deepEqual(tidyYard(null), { designs: [], filled: {} });
  assert.equal(tidyDesign({ name: 'uss calypso', hull: 'scout', e: 40, s: 30 }).name, 'USS calypso');
  assert.ok(!['Resolute'].includes(suggestName(['Resolute'], () => 0)));
});

test('a requisition a day, the same for everyone, that some designs meet and most don’t', () => {
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const day = new Date(Date.UTC(2026, 10, 20 + k)).toISOString().slice(0, 10);
    const r = requisition(day);
    assert.deepEqual(requisition(day), r);
    const share = ALL.filter(d => meets(stats(d), r.needs)).length / ALL.length;
    assert.ok(share > 0 && share <= 0.35, `${day}: ${share}`);
    assert.ok(r.asks.length === Object.keys(r.needs).length && r.says.endsWith('.'));
    seen.add(r.kind);
    const one = ALL.find(d => meets(stats(d), r.needs));
    assert.deepEqual(shortOf(stats(one), r.needs), []);
  }
  assert.ok(seen.size >= 5, 'the requisitions hardly vary');
  assert.match(shortOf(stats({ hull: 'scout', e: 10, s: 10 }), { top: 9.9, crew: 500 }).join('; '), /^top speed warp [\d.]+, not 9.9; room for \d+, not 500$/);
});
