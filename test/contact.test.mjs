// First contact's language and rules, checked without a browser:  node --test test/contact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, debrief, fluencyOf, hint, makeLanguage, rng, standing, MEANINGS, PATIENCE, BEAT_IDS, replay } from '../js/contact-sim.js';

// Plays the right answer each turn, from what has been heard so far.
function win(g) {
  for (let n = 0; !g.over && n < 40; n++) {
    const h = hint(g);
    act(g, h ? { say: [h] } : 'listen');
  }
  return g;
}

test('each seed makes its own language, and the same seed the same one', () => {
  const a = makeLanguage(1), b = makeLanguage(1), c = makeLanguage(2);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.phrases, c.phrases);
  for (const seed of [1, 2, 3, 42, 999]) {
    const L = makeLanguage(seed);
    const texts = MEANINGS.map(([id]) => L.phrases[id]);
    assert.equal(new Set(texts).size, texts.length, `two ideas share a phrase in language ${seed}`);
    for (const t of texts) assert.match(t, /^[A-Z][^{}]*$/, `unfilled or uncapitalised phrase: ${t}`);
    assert.match(L.phrases.story, new RegExp(`^${L.captain} and the stranger at `));
  }
});

test('no language has a rude or plain English name, a people named exactly like their home, or two names a letter apart', () => {
  // The finder's list, as leading syllables, plus the plain words seen on screen. Kept apart from the game's own list.
  const rude = /^(fuk|suk|kok|kum|pis|dik|pus|kike|shit|paki|rape|nazi|pedo|nig|peni)/i;
  const plain = /^(house|soul|sail|man|men|sin|hell|kill|the|then|them|this|his|him|her|sun|son|gun|home|name|time)$/i;
  const near = (a, b) => {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a.startsWith(b) || b.startsWith(a)) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    // One letter changed, added or dropped.
    const [x, y] = a.length <= b.length ? [a, b] : [b, a];
    for (let i = 0; i <= x.length; i++) {
      if (x.length === y.length ? i < x.length && x.slice(0, i) + y[i] + x.slice(i + 1) === y : x.slice(0, i) + y[i] + x.slice(i) === y) return true;
    }
    return false;
  };
  for (let seed = 1; seed <= 20000; seed++) {
    const L = makeLanguage(seed);
    const where = `language ${seed}`;
    // Every capitalised word in what they say is a name, apart from the first word of a phrase that starts with an image.
    const spoken = new Set(Object.values(L.phrases).flatMap(t => t.split(/[^\p{L}]+/u).filter((w, i) => w && /^\p{Lu}/u.test(w) && !(i === 0 && /^(The|Sails)$/.test(w)))));
    for (const w of spoken) assert.ok(L.names.includes(w), `${where}: ${w} is spoken but not among its names`);
    assert.ok(L.names.includes(L.home) && L.names.includes(L.captain));
    for (const w of [...L.names, L.people]) {
      assert.doesNotMatch(w, rude, `${where}: ${w}`);
      assert.doesNotMatch(w, plain, `${where}: ${w}`);
    }
    assert.notEqual(L.people, L.home, `${where}: the people are called exactly what their home is`);
    assert.ok(!L.names.includes(L.people), `${where}: a hero or place is called ${L.people}, like the people`);
    for (let i = 0; i < L.names.length; i++) {
      for (let j = i + 1; j < L.names.length; j++) assert.ok(!near(L.names[i], L.names[j]), `${where}: ${L.names[i]} and ${L.names[j]} are too alike`);
    }
  }
});

test('answering right every time makes first contact, for any seed', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = win(newGame({ seed }));
    assert.equal(g.over, 'contact', `seed ${seed} ended ${g.over}`);
    assert.equal(g.patience, PATIENCE);
    assert.equal(g.misses, 0);
  }
});

test('every beat can be answered with a phrase already heard, with no help from Standard', () => {
  const g = newGame({ seed: 5 });
  for (const id of BEAT_IDS) {
    assert.ok(hint(g), `nothing heard yet answers ${id}`);
    act(g, { say: [hint(g)] });
  }
  assert.equal(g.over, 'contact');
});

test('saying things that make no sense wears their patience out', () => {
  const g = newGame({ seed: 9 });
  for (let i = 0; i < PATIENCE && !g.over; i++) act(g, { say: ['we'] });
  assert.equal(g.over, 'silence');
  assert.equal(g.patience, 0);
  assert.ok(g.heard.includes('understand') && g.heard.includes('no'), 'they never said they did not understand');
});

test('five misunderstandings close the channel, never four, and nothing but weapons costs two at once', () => {
  for (let seed = 1; seed <= 60; seed++) {
    // Only wrong replies, on the greeting: "we" alone is never an answer to it.
    const g = newGame({ seed });
    const left = [];
    for (let i = 0; i < PATIENCE; i++) {
      assert.equal(g.over, null, `seed ${seed}: the channel closed after ${i} wrong replies (${left})`);
      act(g, { say: ['we'] });
      left.push(g.patience);
    }
    assert.deepEqual(left, [4, 3, 2, 1, 0], `seed ${seed}`);
    assert.equal(g.over, 'silence');
    // Any mix of things that aren't weapons: each costs one at most.
    const h = newGame({ seed });
    const r = rng(seed);
    while (!h.over && h.turn < 80) {
      const before = h.patience;
      const what = ['listen', 'standard', { say: ['we'] }, { say: ['you', 'no'] }, { say: [hint(h)] }, 'listen'][Math.floor(r() * 6)];
      act(h, what);
      assert.ok(before - h.patience <= 1, `seed ${seed}: ${JSON.stringify(what)} cost ${before - h.patience} at once`);
    }
  }
});

test('you can only say what you have heard, and only three phrases at once', () => {
  const g = newGame({ seed: 3 });
  const before = g.log.length;
  assert.deepEqual(act(g, { say: ['danger'] }), [], 'said a phrase never heard');
  assert.equal(g.log.length, before);
  assert.equal(g.turn, 0);
  act(g, { say: ['meet', 'we', 'meet', 'meet'] });
  assert.equal(g.beat, 1, 'a greeting with extra words did not work');
});

test('throwing every phrase at them at once does not work', () => {
  const h = newGame({ seed: 4 });
  act(h, { say: ['meet'] });
  const beat = h.beat;
  act(h, { say: ['see', 'meet', 'yes'] }); // "meet" makes no sense as an answer to a warning
  assert.equal(h.beat, beat);
  assert.equal(h.misses, 1);
});

test('weapons cost twice, and raising shields makes them wary', () => {
  const g = newGame({ seed: 11 });
  act(g, 'shields');
  assert.equal(g.patience, PATIENCE - 1);
  assert.ok(g.heard.includes('fight'));
  act(g, 'shields');
  assert.equal(g.patience, PATIENCE - 1, 'lowering shields cost patience');
  act(g, { say: ['fight'] });
  assert.equal(g.patience, PATIENCE - 3);
  act(g, { say: ['fight'] });
  assert.equal(g.over, 'hostile');
});

test('Standard is forgiven once, then it costs', () => {
  const g = newGame({ seed: 12 });
  act(g, 'standard');
  assert.equal(g.patience, PATIENCE);
  assert.ok(g.heard.includes('understand') && g.heard.includes('no'));
  act(g, 'standard');
  assert.equal(g.patience, PATIENCE - 1);
});

test('listening again gives another way of putting it, and only wears on them once they run out', () => {
  const g = newGame({ seed: 13 });
  act(g, 'listen');
  act(g, 'listen');
  assert.equal(g.patience, PATIENCE);
  assert.ok(g.heard.includes('you'), 'the second way of saying hello did not come');
  act(g, 'listen');
  assert.equal(g.patience, PATIENCE - 1);
  // The first wait says what waiting will cost, once.
  const told = g.log.filter(l => /waiting wears on them/.test(l.text || ''));
  assert.equal(told.length, 1);
  assert.ok(g.log.indexOf(told[0]) < 6, 'the warning came after the cost');
});

test('turning down their offer, or leaving, ends it another way', () => {
  const a = newGame({ seed: 21 });
  act(a, 'standard'); // to hear "no"
  act(a, { say: ['meet'] });
  act(a, { say: [hint(a)] });
  assert.equal(a.beat, 2);
  act(a, { say: ['no'] });
  assert.equal(a.over, 'alone');
  const b = newGame({ seed: 22 });
  act(b, 'leave');
  assert.equal(b.over, 'fled');
  assert.deepEqual(act(b, 'listen'), [], 'it went on after it ended');
});

test('the debrief marks your guesses against what they meant', () => {
  const g = newGame({ seed: 30 });
  g.tags.meet = 'meet';
  g.tags.we = 'you';
  win(g);
  const d = debrief(g);
  assert.equal(d.title, 'First contact');
  assert.equal(d.story, g.lang.phrases.story);
  assert.equal(d.decoded, 1);
  assert.equal(d.of, d.rows.length);
  assert.ok(!d.rows.some(r => r.id === 'story'));
  assert.equal(d.rows.find(r => r.id === 'we').guess, 'you');
  assert.equal(d.fluency, 'Lost in translation');
  for (const r of d.rows) g.tags[r.id] = r.id;
  assert.equal(debrief(g).fluency, 'Fluent');
  assert.ok(d.transcript.length >= 12);
  assert.ok(d.transcript.every(t => t.said.length === t.meant.length));
});

test('the record counts species met, contacts made and the best notebook, and outlives the list of encounters', () => {
  assert.deepEqual(standing(), { met: 0, contacts: 0, best: null });
  // A save from before the record was kept: only its runs. It is filled in from them.
  const run = (outcome, decoded, of) => ({ title: 'x', outcome, people: 'Thaejy', decoded, of, at: '2026-11-18T00:00:00Z' });
  const old = { runs: [run('contact', 1, 11), run('silence', 7, 8), run('contact', 9, 12), run('fled', 0, 2)] };
  const s = standing(old);
  assert.deepEqual(s, { met: 4, contacts: 2, best: { decoded: 7, of: 8 } }, 'the best notebook is the largest share decoded, win or lose');
  assert.equal(old.runs.length, 4, 'the runs were changed');
  // Forty encounters later the page lists only the last thirty, and the record still has the rest.
  const saved = { ...old, ...s };
  for (let n = 0; n < 40; n++) {
    saved.runs.push(n === 0 ? run('contact', 11, 11) : run('parted', 3, 9));
    Object.assign(saved, standing({ ...saved, met: saved.met + 1, contacts: saved.contacts + (n === 0 ? 1 : 0) }));
    saved.runs = saved.runs.slice(-30);
  }
  assert.deepEqual(standing(JSON.parse(JSON.stringify(saved))), { met: 44, contacts: 3, best: { decoded: 11, of: 11 } });
  // Of two notebooks as good, the one with more phrases; and junk in a save is ignored rather than counted.
  assert.deepEqual(standing({ runs: [run('contact', 3, 3), run('contact', 12, 12), run('contact', 2, 2)] }).best, { decoded: 12, of: 12 });
  assert.deepEqual(standing({ runs: [null, { title: 'x', decoded: 5, of: 3 }, { title: 'y', decoded: '2', of: 0 }], met: -1, contacts: 'many', best: { decoded: 9 } }), { met: 2, contacts: 0, best: null });
  // The word beside a notebook is the debrief's own.
  const g = win(newGame({ seed: 6 }));
  for (const id of g.heard) g.tags[id] = id;
  const d = debrief(g);
  assert.equal(d.fluency, 'Fluent');
  assert.equal(fluencyOf(d.decoded, d.of), d.fluency);
  assert.deepEqual([fluencyOf(0, 11), fluencyOf(5, 11), fluencyOf(9, 11), fluencyOf(0, 0)], ['Lost in translation', 'Halting', 'Conversational', 'Lost in translation']);
});

test('an encounter picked up from its seed and what you did is the one that was left, word for word', () => {
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  const WAYS = ['listen', 'standard', 'shields', 'hint', 'wrong', 'hint', 'hint'];
  for (let seed = 1; seed <= 40; seed++) {
    const live = newGame({ seed }), acts = [];
    for (let n = 0; n < 40 && !live.over; n++) {
      // A guess in the notebook and a reply half put together come back too.
      const tags = Object.fromEntries(live.heard.filter(id => id !== 'story').slice(0, 1 + n % 3).map((id, k) => [id, MEANINGS[(seed + k) % MEANINGS.length][0]]));
      const half = live.heard.filter(id => id !== 'story').slice(0, n % 3);
      Object.assign(live.tags, tags);
      const back = replay(JSON.parse(JSON.stringify({ seed, acts, tags: live.tags, reply: half })));
      same(back.game, live);
      assert.deepEqual(back.reply, half);
      // And the next thing you do goes the same way in both.
      const way = WAYS[(seed + n) % WAYS.length];
      const what = way === 'hint' ? { say: [hint(live)] } : way === 'wrong' ? { say: [live.heard[0], live.heard[live.heard.length - 1]].filter((id, k, all) => id !== 'story' && all.indexOf(id) === k) } : way;
      const then = act(live, what), again = act(back.game, what);
      same(again, then);
      same(back.game, live);
      acts.push(what);
    }
    const end = replay({ seed, acts, tags: live.tags });
    assert.equal(end.game.over, live.over);
    assert.deepEqual(end.reply, []);
    same(debrief(end.game), debrief(live));
  }
});

test('what was kept is only resumed if it could have been done', () => {
  assert.equal(replay(null), null);
  assert.equal(replay({ seed: 3 }), null);
  assert.equal(replay({ seed: NaN, acts: [] }), null);
  assert.equal(replay({ seed: 3, acts: ['dance'] }), null);
  assert.equal(replay({ seed: 3, acts: [{ say: [] }] }), null);
  assert.equal(replay({ seed: 3, acts: [{ say: ['story'] }] }), null);
  assert.equal(replay({ seed: 3, acts: [{ say: ['go'] }] }), null, 'a phrase said before it was ever heard');
  assert.equal(replay({ seed: 3, acts: ['leave', 'listen'] }), null, 'something done after the end');
  const g = newGame({ seed: 3 });
  assert.equal(replay({ seed: 3, acts: [{ say: [g.heard[0], g.heard[0]] }] }), null, 'the same phrase twice in a reply');
  // Guesses that aren't meanings, or are for phrases not heard yet, are left out; so is a reply that couldn't be one.
  const back = replay({ seed: 3, acts: [], tags: { [g.heard[0]]: 'meet', [g.heard[1]]: 'nonsense', go: 'go', story: 'meet' }, reply: ['go'] });
  assert.deepEqual(back.game.tags, { [g.heard[0]]: 'meet' });
  assert.deepEqual(back.reply, []);
});
