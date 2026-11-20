// The Prime Directive's rules, checked without a browser:  node --test test/directive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, GRADED, KEEP, choices, choose, heard, letter, line, newHearing, paths, recordHearing, verdict, walk } from '../js/directive-sim.js';

test('every case is whole: each step reached, each choice leading somewhere, every reason a sentence', () => {
  for (const c of CASES) {
    const reached = new Set([c.start]);
    for (const s of Object.values(c.steps)) for (const ch of s.choices) if (ch.next) { assert.ok(c.steps[ch.next], `${c.id}: ${ch.id} leads nowhere`); reached.add(ch.next); }
    assert.deepEqual([...reached].sort(), Object.keys(c.steps).sort(), `${c.id} has a step nothing reaches`);
    const ids = Object.values(c.steps).flatMap(s => s.choices.map(ch => ch.id));
    assert.equal(new Set(ids).size, ids.length, `${c.id}: two choices share an id`);
    for (const s of Object.values(c.steps)) {
      assert.ok(s.choices.length >= 2 && s.choices.length <= 4);
      for (const ch of s.choices) {
        assert.ok(ch.label && /[.!?’]$/.test(ch.said), `${ch.id}: what happened is not a sentence`);
        for (const [name, [d, why]] of Object.entries(ch.score)) assert.ok(GRADED.includes(name) && Number.isInteger(d) && d !== 0 && /[.’]$/.test(why), `${ch.id}: ${name}`);
      }
    }
    // Three or four orders a case.
    for (const p of paths(c.id)) assert.ok(p.length >= 3 && p.length <= 4, p.join(' '));
    // The captain on screen took a path the case allows.
    assert.ok(walk(c.id, c.onScreen.path), `${c.id}: the captain on screen took a path the case doesn’t have`);
  }
});

test('the board isn’t rigged: no path earns an A in all four, and every grade can be an A on some path', () => {
  for (const c of CASES) {
    const all = paths(c.id).map(p => verdict(c.id, p));
    for (const v of all) assert.ok(v.grades.some(g => g.letter !== 'A'), `${v.title}: all A`);
    for (const name of GRADED) assert.ok(all.some(v => v.grades.find(g => g.name === name).letter === 'A'), `${name} is never an A`);
    // And every grade can fall below where it starts, a B.
    for (const name of GRADED) assert.ok(all.some(v => v.grades.find(g => g.name === name).letter > 'B'), `${name} can’t be lost`);
  }
});

test('the voice on the radio: Picard’s orders in Pen Pals, and what the board says of them', () => {
  const v = verdict('voice', ['stop', 'settle', 'beam', 'erase']);
  assert.equal(v.title, 'Nothing to remember');
  assert.deepEqual(v.grades.map(g => g.letter), ['A', 'B', 'B', 'C']);
  assert.equal(v.grades[3].why, 'You took a child’s memory without asking her.');
  assert.equal(v.grades[0].why, 'You saved the continent.');
  assert.deepEqual([v.same, v.of], [4, 4]);
  assert.equal(line('voice', v), 'The voice on the radio: Nothing to remember, A B B C');
  // Leaving the planet to its fate keeps Restraint, at Compassion's cost.
  const kept = verdict('voice', ['stop', 'leave', 'silence']);
  assert.deepEqual([kept.title, kept.grades[0].letter, kept.grades[1].letter], ['The order kept', 'F', 'A']);
  // A grade nothing touched says so.
  const quiet = verdict('voice', ['listen', 'settle', 'refuse']);
  assert.equal(quiet.grades[3].why, 'Nothing you ordered tested it either way.');
  // The slope above her street is reached by settling the faults and by only warning her, so it says nothing that
  // holds for one of them alone (the faults settling).
  const valley = CASES[0].steps.quake.choices.filter(ch => ch.next === 'valley').map(ch => ch.id);
  assert.deepEqual(valley, ['settle', 'warn']);
  assert.doesNotMatch(CASES[0].steps.valley.text, /easing|slows|settled/i);
  assert.equal(letter(85), 'A');
  assert.equal(letter(84), 'B');
});

test('a hearing moves step by step, refuses an order that isn’t open, and ends', () => {
  const h = newHearing('voice');
  assert.deepEqual(choices(h).map(c => c.id), ['stop', 'listen', 'staff']);
  assert.equal(choose(h, 'beam'), null);
  assert.equal(choose(h, 'staff').next, 'quake');
  choose(h, 'settle');
  assert.equal(h.step, 'valley');
  choose(h, 'team');
  assert.deepEqual([h.over, h.path], [true, ['staff', 'settle', 'team']]);
  assert.deepEqual(choices(h), []);
  assert.equal(newHearing('nonsense'), null);
  assert.equal(walk('voice', ['stop', 'settle']), null, 'a path that stops partway is not a hearing');
  assert.equal(verdict('voice', ['stop', 'nonsense', 'x']), null);
});

test('the record keeps the last 30 hearings, newest first, and leaves out what isn’t one', () => {
  let r = null;
  for (let k = 0; k < KEEP + 5; k++) r = recordHearing(r, 'voice', ['stop', 'leave', 'answer'], 1000 + k);
  assert.equal(r.heard.length, KEEP);
  assert.equal(r.heard[0].t, 1000 + KEEP + 4);
  const odd = { heard: [{ case: 'voice', path: ['stop'], t: 1 }, 'x', { case: 'voice', path: ['listen', 'leave', 'record'], t: 2 }] };
  assert.deepEqual(heard(odd).map(h => h.t), [2]);
  assert.deepEqual(heard('nonsense'), []);
});
