// The Bridge Officer's Test's rules, checked without a browser:  node --test test/officer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTest, orders, act, evaluate, replay, MINUTES } from '../js/officer-sim.js';

const play = list => { const t = newTest(); for (const id of list) act(t, id); return t; };
const OTHER = ['eject', 'shutdown', 'beam', 'drone', 'volunteer', 'self', 'wait'];

test('the one passing answer is to order La Forge in, and it costs his life', () => {
  const t = play(['order']);
  assert.equal(t.over, 'passed');
  const e = evaluate(t);
  assert.equal(e.title, 'Passed');
  assert.ok(e.passed);
  assert.match(e.summary, /La Forge did not/);
  assert.deepEqual(orders(t), []);
});

test('nothing else stops the breach: every other order only spends a minute', () => {
  // Every order of the other seven, tried in turn, runs out the six minutes.
  for (let start = 0; start < OTHER.length; start++) {
    const t = newTest();
    for (let k = 0; !t.over; k++) {
      const id = OTHER[(start + k) % OTHER.length];
      const before = t.minutes;
      act(t, id);
      assert.equal(t.minutes, before - 1, `${id} did not take a minute`);
    }
    assert.equal(t.over, 'breach');
    assert.equal(t.turn, MINUTES);
    assert.equal(evaluate(t).title, 'Breach');
    assert.ok(!evaluate(t).passed);
  }
  // A second try at the same thing says so, and still costs the minute.
  const t = play(['eject', 'eject']);
  assert.equal(t.minutes, MINUTES - 2);
  assert.deepEqual(t.tried, ['eject']);
  assert.ok(orders(t).find(o => o.id === 'eject').tried);
});

test('the order can be given with the last minute left, and not after', () => {
  const t = play([...OTHER.slice(0, MINUTES - 1), 'order']);
  assert.equal(t.over, 'passed');
  assert.match(evaluate(t).note[0], /^You tried five other ways first\./);
  const late = play([...OTHER.slice(0, MINUTES), 'order']);
  assert.equal(late.over, 'breach');
});

test('separating the saucer saves most of the crew, and is not a pass', () => {
  const t = play(['eject', 'separate']);
  assert.equal(t.over, 'saucer');
  const e = evaluate(t);
  assert.equal(e.title, 'The saucer');
  assert.ok(!e.passed);
  assert.match(e.note.join(' '), /cost one life/);
});

test('every verdict reads whole, and a game is played back from its orders', () => {
  for (const list of [['order'], ['eject', 'order'], ['separate'], OTHER.slice(0, 6), ['wait', 'wait', 'separate']]) {
    const e = evaluate(play(list));
    for (const line of [e.summary, ...e.note]) assert.match(line, /^[A-Z][^]*[.]$/, line);
    assert.doesNotMatch(e.note.join(' '), /undefined|NaN|\bno other ways\b/);
  }
  assert.deepEqual(replay({ orders: ['eject', 'order'] }), play(['eject', 'order']));
  assert.equal(replay({ orders: ['order', 'eject'] }), null);
  assert.equal(replay({ orders: ['fly'] }), null);
});
