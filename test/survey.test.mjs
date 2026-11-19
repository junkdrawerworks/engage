// The planetary survey's rules: the globe drawn smaller on a slow phone.
//   node --test test/survey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pace, STEPS, SLOW_MS } from '../js/pace.js';

test('a globe that draws in time stays full size', () => {
  const pace = new Pace();
  for (let i = 0; i < 600; i++) pace.took(4 + (i % 7));
  assert.equal(pace.scale, 1);
});

test('a slow globe steps down to three-quarters and then three-fifths, and never back up', () => {
  assert.deepEqual(STEPS, [1, 0.75, 0.6]);
  assert.equal(SLOW_MS, 10);
  const pace = new Pace();
  const changes = [];
  for (let i = 0; i < 6; i++) changes.push(pace.took(40));
  assert.deepEqual(changes, [false, false, false, false, false, true]);
  assert.equal(pace.scale, 0.75);
  for (let i = 0; i < 6; i++) pace.took(25);
  assert.equal(pace.scale, 0.6);
  for (let i = 0; i < 60; i++) pace.took(i % 2 ? 1 : 90);
  assert.equal(pace.scale, 0.6, 'there is no step below three-fifths');
  for (let i = 0; i < 60; i++) pace.took(1);
  assert.equal(pace.scale, 0.6, 'a globe that got faster went back up, and would flicker between sizes');
});

test('one slow picture among quick ones is not a slow phone', () => {
  const pace = new Pace();
  for (let i = 0; i < 120; i++) pace.took(i % 6 === 0 ? 200 : 6);
  assert.equal(pace.scale, 1);
  for (let i = 0; i < 120; i++) pace.took(NaN);
  assert.equal(pace.scale, 1, 'a time that is not a number was counted');
});
