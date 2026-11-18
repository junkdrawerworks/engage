// First contact's language and rules, checked without a browser:  node --test test/contact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, debrief, hint, makeLanguage, rng, MEANINGS, PATIENCE, BEAT_IDS } from '../js/contact-sim.js';

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
