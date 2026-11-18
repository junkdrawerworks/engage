// The Kobayashi Maru's rules, checked without a browser:  node --test test/maru.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, orders, evaluate, replay, tactical, transcript, CREW, MARU, WARP_HULL, ENDINGS, GRADED } from '../js/maru-sim.js';

function play(plan, opts = {}) {
  const g = newGame({ seed: 7, ...opts });
  for (const id of plan) { if (g.over) break; act(g, id); }
  return g;
}
const gradeOf = (e, name) => e.grades.find(x => x.name === name);
const keepGoing = g => {
  while (!g.over && g.turn < 60) act(g, orders(g).find(o => !o.done && ['phasers', 'evade', 'hail'].includes(o.id)).id);
  return g;
};

test('staying out keeps your crew and loses the Maru', () => {
  const g = play(['hail-maru', 'leave']);
  assert.equal(g.over, 'stayed');
  const e = evaluate(g);
  assert.equal(e.title, 'By the book');
  assert.equal(e.numbers.crew, CREW);
  assert.equal(e.numbers.maruSaved, 0);
});

test('crossing the line brings three cruisers, and they hold fire for one hail', () => {
  const g = play(['enter']);
  assert.equal(g.klingons.length, 3);
  assert.equal(orders(g).find(o => o.id === 'evade').label, 'Evasive manoeuvres'); // spelt as the rest of Engage spells
  act(g, 'hail');
  assert.equal(g.hull, 100, 'they fired through the hail');
  act(g, 'hail');
  assert.ok(g.hull < 100 || g.shields < 100, 'a second hail held them off too');
});

test('the Maru is always lost: three volleys from the second turn alongside', () => {
  const g = play(['enter', 'evade', 'evade', 'evade', 'evade']);
  assert.ok(g.maru.gone);
  assert.equal(g.maru.lostTurn, 5);
});

test('beaming drops shields, so your hull takes the fire', () => {
  const g = play(['enter', 'beam']);
  assert.equal(g.aboard, 75);
  assert.equal(g.shields, 100);
  assert.ok(g.hull < 100);
});

test('two beam-overs and out is the best anyone does, and it still loses most of the Maru', () => {
  const g = play(['enter', 'beam', 'beam', 'warp']);
  assert.equal(g.over, 'warp');
  const e = evaluate(g);
  assert.equal(e.title, 'The lifeboat');
  assert.equal(e.numbers.maruSaved, 150);
  assert.ok(e.numbers.maruLost > 200);
  assert.ok(e.numbers.crew < CREW);
});

test('a third beam-over costs the warp drive or the ship', () => {
  const g = play(['enter', 'beam', 'beam', 'beam']);
  assert.ok(g.over === 'destroyed' || g.hull < WARP_HULL);
});

test('nobody wins by fighting: more cruisers keep coming', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = newGame({ seed });
    act(g, 'enter');
    keepGoing(g);
    assert.equal(g.over, 'destroyed', `seed ${seed} survived`);
    assert.ok(g.sent > g.kills);
  }
});

test('firing first is graded as starting a war', () => {
  const g = keepGoing(play(['enter', 'phasers']));
  assert.ok(g.flags.firedFirst);
  const e = evaluate(g);
  assert.equal(e.title, 'The war you started');
  assert.equal(e.grades.find(x => x.name === 'Restraint').letter, 'F');
});

test('a parting volley that destroys the ship ends the simulation', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = newGame({ seed });
    for (const id of ['enter', 'hail', 'evade', 'evade', 'evade', 'evade', 'evade']) act(g, id);
    assert.ok(g.hull >= WARP_HULL, `seed ${seed}: the warp drive was already gone`);
    const { events, lines } = act(g, 'warp');
    assert.equal(g.hull, 0, `seed ${seed}: the parting volley left the hull at ${g.hull}%`);
    assert.equal(g.over, 'destroyed', `seed ${seed}: the simulation went on at 0% hull`);
    assert.deepEqual(orders(g), []);
    assert.ok(events.some(e => e.type === 'destroyed'));
    assert.match(lines.at(-1).text, /Warp core breach/);
    assert.equal(evaluate(g).numbers.crew, 0);
  }
});

test('surrender is always refused', () => {
  const g = play(['enter', 'surrender']);
  assert.ok(g.flags.surrendered);
  assert.equal(g.over, null);
  assert.ok(orders(g).find(o => o.id === 'surrender').done);
});

test('abandoning ship saves the crew as prisoners', () => {
  const g = play(['enter', 'beam', 'beam']);
  assert.ok(orders(g).some(o => o.id === 'abandon'));
  act(g, 'abandon');
  const e = evaluate(g);
  assert.equal(e.title, 'Last off the ship');
  assert.ok(e.numbers.prisoners);
  assert.equal(e.numbers.maruSaved, 150);
});

test('the reprogrammed simulator lets everyone go home, and says so', () => {
  const g = play(['enter', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'warp'], { rewritten: true });
  assert.equal(g.over, 'warp');
  const e = evaluate(g);
  assert.equal(e.title, 'Changed the rules');
  assert.equal(e.numbers.maruSaved, MARU);
  assert.equal(e.numbers.crew, CREW);
  assert.equal(e.grades.find(x => x.name === 'Honesty').letter, 'F');
});

test('a reprogrammed run that leaves anyone behind, or fires a shot, is graded like any other', () => {
  const grade = (e, name) => e.grades.find(x => x.name === name);
  // Staying out: the Maru's signal stops, and nobody comes home from her.
  let e = evaluate(play(['leave'], { rewritten: true }));
  assert.equal(e.title, 'By the book');
  assert.equal(grade(e, 'Compassion').letter, 'F');
  assert.equal(grade(e, 'Honesty').letter, 'F');
  // Firing on cruisers that had promised not to fire.
  e = evaluate(play(['enter', 'phasers', 'phasers', 'warp'], { rewritten: true }));
  assert.equal(e.title, 'Turned back');
  assert.equal(grade(e, 'Restraint').letter, 'F');
  assert.equal(grade(e, 'Restraint').why, 'You fired the first shot.');
  // Going straight back to warp is no act of compassion.
  e = evaluate(play(['enter', 'warp'], { rewritten: true }));
  assert.notEqual(grade(e, 'Compassion').letter, 'A');
  // Leaving people aboard the Maru: they stay counted, and the log says how many.
  const g = newGame({ seed: 7, rewritten: true });
  const said = [];
  for (const id of ['enter', 'beam', 'beam', 'warp']) said.push(...act(g, id).lines.map(l => l.text));
  assert.equal(g.maru.aboard, MARU - 150, 'going to warp emptied the Maru');
  assert.ok(said.some(t => t.includes(`${MARU - 150} still aboard`)), 'the log did not say who was left aboard');
  e = evaluate(g);
  assert.equal(e.title, 'The lifeboat');
  assert.match(e.summary, new RegExp(`${MARU - 150} were lost`));
  // Everyone aboard, but a shot fired on the way out.
  e = evaluate(play(['enter', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'phasers', 'warp'], { rewritten: true }));
  assert.equal(e.title, 'The lifeboat');
  assert.equal(e.summary, `You brought all ${MARU} of the Maru’s people home.`);
  assert.equal(grade(e, 'Restraint').letter, 'F');
  for (const plan of [['leave'], ['enter', 'warp'], ['enter', 'beam', 'beam', 'warp']]) {
    const x = evaluate(play(plan, { rewritten: true }));
    assert.equal(x.grades.length, 5, `${plan}: four grades and honesty`);
    assert.notEqual(x.title, 'Changed the rules');
  }
});

test('in the reprogrammed simulator, asking first costs nobody: every careful opening still wins', () => {
  const beams = ['beam', 'beam', 'beam', 'beam', 'beam', 'beam'];
  for (const seed of [7, 9, 123]) {
    for (const opening of [['hail-maru'], ['starfleet'], ['scan'], ['hail-maru', 'starfleet', 'scan'], ['scan', 'hail-maru']]) {
      const g = newGame({ seed, rewritten: true });
      const said = [];
      for (const id of [...opening, 'enter', ...beams, 'warp']) said.push(...act(g, id).lines);
      assert.equal(g.lifeSupportLost, 0, `${opening}: the Maru lost people while the cadet waited outside`);
      assert.equal(g.aboard, MARU, `${opening}: not everyone came across`);
      const e = evaluate(g);
      assert.equal(e.outcome, 'rewritten', `seed ${seed}, ${opening}: ${e.title}, ${e.summary}`);
      assert.equal(e.title, 'Changed the rules');
      assert.ok(!said.some(l => /Life support is failing/.test(l.text)), 'the Maru still reported losses');
      if (opening.includes('hail-maru')) assert.ok(said.some(l => l.who === 'Kobayashi Maru' && /holding/.test(l.text)), 'the Maru did not say her air was holding');
    }
  }
  // Talking to the Klingons on the way doesn't spoil it either; a shot still does.
  assert.equal(evaluate(play(['hail-maru', 'enter', 'hail', 'surrender', ...beams, 'warp'], { rewritten: true })).outcome, 'rewritten');
  assert.notEqual(evaluate(play(['hail-maru', 'starfleet', 'scan', 'enter', 'phasers', ...beams, 'warp'], { rewritten: true })).outcome, 'rewritten');
  // The normal test is as it was: waiting outside costs 12 a turn.
  const n = play(['hail-maru', 'starfleet', 'scan']);
  assert.equal(n.lifeSupportLost, 36);
  assert.equal(n.maru.aboard, MARU - 36);
});

test('the reprogrammed Klingons answer a surrender in character, and Nerve does not mention guns that never fired', () => {
  const g = newGame({ seed: 7, rewritten: true });
  act(g, 'enter');
  const lines = act(g, 'surrender').lines.map(l => l.text);
  assert.ok(lines.some(t => /no quarrel/.test(t)), lines.join(' | '));
  assert.ok(!lines.some(t => /cowards/.test(t)));
  act(g, 'beam'); act(g, 'warp');
  const e = evaluate(g);
  assert.doesNotMatch(gradeOf(e, 'Nerve').why, /under their guns/);
  assert.ok(!e.note.some(t => /never accept/.test(t)));
  // In the normal test the guns do fire, and the line stays.
  assert.match(gradeOf(evaluate(play(['enter', 'beam', 'warp'])), 'Nerve').why, /under their guns/);
  assert.ok(act(play(['enter']), 'surrender').lines.some(l => /cowards/.test(l.text)));
});

test('abandoning ship with nobody beamed over doesn\'t count "0 from the Maru"', () => {
  const g = newGame({ seed: 7 });
  act(g, 'enter');
  while (!g.over && !orders(g).some(o => o.id === 'abandon')) act(g, 'evade');
  act(g, 'abandon');
  const e = evaluate(g);
  assert.equal(e.title, 'Last off the ship');
  assert.equal(e.numbers.maruSaved, 0);
  assert.match(e.summary, /^\d+ of your crew are alive, as prisoners of the Klingon Empire\. Nobody from the Maru is with them\.$/);
});

// 2,000 cadets giving orders at random. After every order, everyone who was aboard the Maru is somewhere: still
// aboard her, aboard your ship, or lost when her life support failed. And no debrief counts nothing ("and 0 from the
// Maru"), counts one in the plural, or has a hole in it.
test('nobody goes missing, and no debrief reads wrong, however the orders fall', () => {
  let a = 2026;
  const rand = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  let ended = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const g = newGame({ seed, rewritten: seed % 7 === 0 });
    while (!g.over && g.turn < 80) {
      const open = orders(g).filter(o => !o.done);
      const order = open[Math.floor(rand() * open.length)].id;
      act(g, order);
      assert.equal(g.maru.aboard + g.aboard + g.lifeSupportLost, MARU, `seed ${seed}, after ${order} on turn ${g.turn}: ${g.maru.aboard} on the Maru, ${g.aboard} aboard, ${g.lifeSupportLost} lost to life support`);
    }
    if (!g.over) continue;
    ended++;
    const e = evaluate(g);
    for (const text of [e.summary, ...e.grades.map(x => x.why), ...e.note]) {
      assert.doesNotMatch(text, /(^| )0 |undefined|NaN|\b1 (people|turns|cruisers|survivors)\b/, `seed ${seed}, ${e.title}: ${text}`);
    }
  }
  assert.ok(ended > 1900, `only ${ended} of 2,000 simulations ended`);
});

test('every ending gets four grades and a note', () => {
  for (const plan of [['leave'], ['enter', 'warp'], ['enter', 'beam', 'beam', 'warp'], ['enter', 'beam', 'beam', 'abandon']]) {
    const e = evaluate(play(plan));
    assert.equal(e.grades.length, 4);
    for (const x of e.grades) assert.match(x.letter, /^[ABCDF]$/);
    assert.ok(e.note.length >= 1);
    assert.ok(e.summary.length > 20);
  }
});

// One way to each ending, as the orders a cadet would give. (Going down fighting takes three kills without beaming
// anyone over, which the dice allow in most simulations but not all: seed 1 is one that does.)
const WAYS = {
  'By the book': [['leave']],
  'Turned back': [['enter', 'warp']],
  'The lifeboat': [['enter', 'beam', 'beam', 'warp']],
  'Last off the ship': [['enter', 'beam', 'beam', 'abandon']],
  'Held the line': [['enter', ...Array(30).fill('evade')]],
  'Died trying': [['enter', ...Array(8).fill('beam')]],
  'Went down fighting': [['enter', 'hail', 'torpedoes', 'torpedoes', 'torpedoes', ...Array(30).fill('phasers')], { seed: 1 }],
  'The war you started': [['enter', ...Array(30).fill('phasers')]],
  'Changed the rules': [['enter', ...Array(6).fill('beam'), 'warp'], { rewritten: true }],
};

test('every ending on the list can be reached, and the simulation has no ending off it', () => {
  assert.deepEqual(Object.keys(WAYS).sort(), [...ENDINGS].sort());
  assert.equal(ENDINGS.length, 9);
  for (const [title, [plan, opts]] of Object.entries(WAYS)) {
    const g = play(plan, opts);
    assert.ok(g.over, `${title}: the orders did not end the simulation`);
    assert.equal(evaluate(g).title, title);
  }
  // A few thousand cadets giving orders at random never find a tenth.
  let a = 12345;
  const rand = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let seed = 1; seed <= 3000; seed++) {
    const g = newGame({ seed, rewritten: seed % 5 === 0 });
    while (!g.over && g.turn < 80) { const open = orders(g).filter(o => !o.done); act(g, open[Math.floor(rand() * open.length)].id); }
    if (g.over) assert.ok(ENDINGS.includes(evaluate(g).title), evaluate(g).title);
  }
});

test('the record counts endings seen, best grades and runs taken, and outlives the list of runs', () => {
  assert.deepEqual(transcript(), { seen: [], best: {}, taken: 0 });
  // A save from before the record was kept: only its runs. It is filled in from them.
  const run = (title, letters) => ({ title, outcome: 'x', grades: GRADED.map((name, k) => ({ name, letter: letters[k] })), at: '2026-11-18T00:00:00Z' });
  const old = { runs: [run('The lifeboat', 'BCBD'), run('By the book', 'FCAF'), run('The lifeboat', 'CBCB')] };
  const t = transcript(old);
  assert.deepEqual(t, { seen: ['By the book', 'The lifeboat'], best: { Compassion: 'B', Judgment: 'B', Restraint: 'A', Nerve: 'B' }, taken: 3 });
  assert.equal(old.runs.length, 3, 'the runs were changed');
  // Forty runs later the page lists only the last thirty, and the record still has the rest.
  const saved = { ...old, ...t };
  for (let n = 0; n < 40; n++) {
    saved.runs.push(run(n === 0 ? 'Went down fighting' : 'Turned back', n === 0 ? 'DFCA' : 'DFBF'));
    Object.assign(saved, transcript({ ...saved, taken: saved.taken + 1 }));
    saved.runs = saved.runs.slice(-30);
  }
  const later = transcript(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(later.seen, ['By the book', 'Turned back', 'The lifeboat', 'Went down fighting']);
  assert.deepEqual(later.best, { Compassion: 'B', Judgment: 'B', Restraint: 'A', Nerve: 'A' });
  assert.equal(later.taken, 43);
  // A reprogrammed run's Honesty is not one of the four, and junk in a save is ignored rather than counted.
  const junk = transcript({ runs: [{ title: 'Changed the rules', grades: [{ name: 'Honesty', letter: 'F' }, null, { name: 'Nerve', letter: 'Z' }] }, null, { title: 'Made up' }], seen: ['Nope', 7], best: { Nerve: 'AA', Judgment: 'C' }, taken: -4 });
  assert.deepEqual(junk, { seen: ['Changed the rules'], best: { Judgment: 'C' }, taken: 2 });
});

test('a grade below an A says what cost it, and the letters are the ones they always were', () => {
  const why = (plan, name, opts) => { const x = gradeOf(evaluate(play(plan, opts)), name); return `${x.letter} ${x.why}`; };
  // Never firing is the best thing said about Restraint, and still only a B: crossing the line cost ten.
  assert.equal(why(['enter', 'beam', 'beam', 'warp'], 'Restraint'), 'B You never fired a shot, but you broke the treaty to be there.');
  assert.equal(why(['starfleet', 'enter', 'hail', 'surrender', 'warp'], 'Restraint'), 'A You talked before you shot.');
  assert.equal(why(['enter', 'phasers', 'warp'], 'Restraint'), 'F You fired the first shot.');
  assert.equal(why(['leave'], 'Restraint'), 'A You never broke the treaty.');
  assert.match(why(['enter', 'beam', 'beam', 'warp'], 'Compassion'), /^[B-F] You brought 150 people off the Maru, but 231 never left her\.$/);
  assert.match(why(['enter', 'beam', ...Array(30).fill('evade')], 'Compassion'), /^[B-F] You brought 75 people off the Maru, though they died with your ship, and 306 never left her\.$/);
  assert.equal(why(['enter', ...Array(8).fill('beam')], 'Compassion'), 'A You brought 300 people off the Maru, though they died with your ship.');
  assert.match(why(['enter', 'warp'], 'Nerve'), /^[B-F] You held for 1 turn under their guns, then ran, before you had tried anything\.$/);
  assert.match(why(['enter', 'beam', 'beam', 'warp'], 'Nerve'), /^[B-F] You held for 3 turns under their guns, then ran, sooner than the board likes\.$/);
  assert.match(why(['enter', 'beam', 'beam', 'abandon'], 'Nerve'), /^[B-F] You were the last off the ship, but you gave her up after only 3 turns\.$/);
  assert.match(why(['enter', ...Array(30).fill('evade')], 'Judgment'), /^F 0% of the 811 lives in your hands came through, and you (stayed \d+ turns after the Maru was gone|lost the ship without bringing anyone across)\.$/);
  // An A is left as it was, and so is every letter: the scores behind them have not moved.
  for (const [plan, opts] of Object.values(WAYS)) {
    for (const x of evaluate(play(plan, opts)).grades) {
      if ('score' in x) assert.equal(x.letter, x.score >= 85 ? 'A' : x.score >= 70 ? 'B' : x.score >= 55 ? 'C' : x.score >= 40 ? 'D' : 'F');
      assert.match(x.why, /^[A-Z0-9][^.]*\.$/, `${x.name}: ${x.why}`);
      if (x.letter === 'A') assert.doesNotMatch(x.why, /, (but|and you|sooner|before you|after offering)/, x.why);
    }
  }
});

test('the tactical display is described in words, turn by turn', () => {
  const g = newGame({ seed: 7 });
  assert.equal(tactical(g), 'Tactical display. Your ship is holding in Federation space, at the edge of the Neutral Zone. The Kobayashi Maru is adrift inside the zone, 381 aboard.');
  act(g, 'hail-maru');
  assert.match(tactical(g), /369 aboard\.$/, 'the people lost while waiting are not counted');
  act(g, 'enter');
  assert.equal(tactical(g), 'Tactical display. Your ship is inside the Neutral Zone, alongside the Maru, hull 100 percent, shields 100 percent. The Kobayashi Maru is adrift, 369 aboard. Three Klingon cruisers, at 100, 100 and 100 percent.');
  // Fire phasers goes for the weakest cruiser: the description is how to know which that is, and when one is gone.
  act(g, 'phasers');
  const hulls = g.klingons.map(k => k.hull);
  assert.ok(tactical(g).includes(`Three Klingon cruisers, at ${hulls[0]}, ${hulls[1]} and ${hulls[2]} percent.`), tactical(g));
  assert.ok(tactical(g).includes(`hull ${g.hull} percent, shields ${g.shields} percent`));
  while (!g.over && g.kills < 1) act(g, 'phasers');
  if (!g.over) {
    const up = g.klingons.filter(k => k.hull > 0);
    assert.match(tactical(g), new RegExp(` Klingon cruisers?, at [0-9, and]+ percent; ${g.kills} destroyed\\.$`), tactical(g));
    assert.equal((tactical(g).match(/at ([0-9, and]+) percent;/)[1].match(/\d+/g) || []).length, up.length);
  }
  // Every ending reads as a sentence, with no blanks in it.
  for (const plan of [['leave'], ['enter', 'warp'], ['enter', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'warp']]) {
    const end = play(plan);
    assert.doesNotMatch(tactical(end), /undefined|NaN|null| {2}/, tactical(end));
    assert.match(tactical(end), /The Kobayashi Maru is (lost|adrift)/);
  }
  const fought = keepGoing(play(['enter']));
  assert.equal(fought.over, 'destroyed');
  assert.match(tactical(fought), /^Tactical display\. Your ship is gone\. The Kobayashi Maru is lost\. /);
});

test('a simulation picked up from its seed and its orders is the one that was left, dice and all', () => {
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  const pick = (g, n) => { const open = orders(g).filter(o => !o.done); return open[(n * 7 + g.turn * 3) % open.length].id; };
  for (let seed = 1; seed <= 40; seed++) {
    const rewritten = seed % 5 === 0;
    const live = newGame({ seed, rewritten }), given = [];
    for (let n = 0; n < 60 && !live.over; n++) {
      // Reload here: the game that comes back is this one, and so is everything it said on the way.
      const back = replay(JSON.parse(JSON.stringify({ seed, rewritten, orders: given })));
      same(back.game, live);
      assert.equal(back.turns.length, given.length);
      // And the next order goes the same way in both: the dice were not thrown again.
      const id = pick(live, seed + n);
      const then = act(live, id), again = act(back.game, id);
      same(again, then);
      same(back.game, live);
      same(evaluate(back.game), evaluate(live));
      given.push(id);
    }
    // The finished game comes back finished, so the page can tell it from one to resume.
    assert.equal(replay({ seed, rewritten, orders: given }).game.over, live.over);
  }
});

test('what was kept is only resumed if it could have been played', () => {
  assert.equal(replay(null), null);
  assert.equal(replay({}), null);
  assert.equal(replay({ seed: 'x', orders: [] }), null);
  assert.equal(replay({ seed: 7 }), null);
  assert.equal(replay({ seed: 7, orders: ['beam'] }), null, 'beamed from outside the zone');
  assert.equal(replay({ seed: 7, orders: ['hail-maru', 'hail-maru'] }), null, 'an order already answered, given again');
  assert.equal(replay({ seed: 7, orders: ['leave', 'enter'] }), null, 'an order after the end');
  assert.equal(replay({ seed: 7, orders: ['enter', 'no such order'] }), null);
  assert.equal(replay({ seed: 7, orders: new Array(501).fill('scan') }), null);
  const fresh = replay({ seed: 7, orders: [] });
  assert.equal(fresh.game.turn, 0);
  assert.deepEqual(fresh.turns, []);
  // Reprogrammed only when it says so outright.
  assert.equal(replay({ seed: 7, rewritten: 'yes', orders: [] }).game.rewritten, false);
  assert.equal(replay({ seed: 7, rewritten: true, orders: [] }).game.rewritten, true);
});
