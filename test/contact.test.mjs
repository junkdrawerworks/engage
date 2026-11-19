// First contact's language and rules, checked without a browser:  node --test test/contact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, debrief, fluencyOf, hint, makeLanguage, rng, standing, encounterFirsts, firstsLine, briefingLine, MEANINGS, PATIENCE, BEAT_IDS, replay, encodeRun, decodeRun } from '../js/contact-sim.js';

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

// Their own words straight back. On the greeting and the warning that is an answer, as Picard's was in Darmok. On the
// three moments they ask you something (will you cross with us, will you take this, shall we go) it is their question
// asked back: the captain asks again, nothing is lost, and nothing moves on. Echoing every line used to win all 500
// encounters a triage ran, with nothing worked out in the notebook.
const lastLine = g => g.log.filter(l => l.who === 'them').at(-1).ids;
test('saying their question straight back is not an answer, and costs nothing', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = newGame({ seed });
    act(g, { say: lastLine(g) });
    assert.equal(g.beat, 1, `seed ${seed}: their greeting said back did not answer it`);
    act(g, { say: g.line });
    assert.equal(g.beat, 2, `seed ${seed}: their warning said back did not answer it`);
    for (const id of ['ask', 'give', 'run']) {
      while (BEAT_IDS[g.beat] !== id) act(g, { say: [hint(g)] });
      const [patience, misses, turn, line] = [g.patience, g.misses, g.turn, g.line];
      act(g, { say: [...line].reverse() }); // in any order
      assert.equal(BEAT_IDS[g.beat], id, `seed ${seed}: echoing on ${id} moved it on`);
      assert.deepEqual([g.patience, g.misses, g.turn, g.over], [patience, misses, turn + 1, null], `seed ${seed}: echoing on ${id} cost something`);
      assert.deepEqual(lastLine(g), line, `seed ${seed}: the captain did not ask the same thing again`);
      assert.match(g.log.at(-1).act, /asks it again/);
      act(g, { say: [hint(g)] });
      assert.ok(g.over === 'contact' || BEAT_IDS[g.beat] !== id, `seed ${seed}: a real answer after an echo did not work`);
    }
    assert.equal(g.over, 'contact');
    assert.equal(g.patience, PATIENCE);
  }
  // Echoing and nothing else never makes contact now: it stalls on the first question.
  for (let seed = 1; seed <= 500; seed++) {
    const g = newGame({ seed });
    while (!g.over && g.turn < 60) act(g, { say: lastLine(g).filter(id => id !== 'story').slice(0, 3) });
    assert.notEqual(g.over, 'contact', `seed ${seed}: echoing made contact`);
    assert.equal(BEAT_IDS[g.beat], 'ask', `seed ${seed}`);
  }
});

// A shared encounter's link: written and read back to the same encounter, word for word, notebook and all.
test('an encounter written as a link reads back as the same one, and a link that isn’t one is turned away', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = newGame({ seed: seed * 7919 + 1795035142426 });
    const r = rng(seed), acts = [], tags = {};
    while (!g.over && g.turn < 60) {
      const what = ['listen', 'standard', 'shields', { say: [hint(g)] }, { say: [hint(g)] }, { say: g.heard.filter(id => id !== 'story').slice(0, 2) }][Math.floor(r() * 6)];
      if (what.say && !what.say[0]) continue;
      acts.push(what);
      act(g, what);
      const heard = g.heard.filter(id => id !== 'story');
      tags[heard[Math.floor(r() * heard.length)]] = MEANINGS[Math.floor(r() * MEANINGS.length)][0];
    }
    if (!g.over) { acts.push('leave'); act(g, 'leave'); }
    const code = encodeRun({ seed: g.seed, acts, tags });
    const kept = decodeRun(code);
    assert.ok(kept, `seed ${seed}: ${code}`);
    const back = replay(kept).game;
    assert.deepEqual(back.log, g.log, `seed ${seed}: not the same conversation`);
    assert.deepEqual(debrief({ ...back, tags: kept.tags }).rows, debrief({ ...g, tags: Object.fromEntries(Object.entries(tags).filter(([id]) => g.heard.includes(id))) }).rows);
  }
  // These letters were written by the first version and must keep meaning the same things.
  assert.deepEqual(decodeRun('1.5.~l-a-~x.aa'), { seed: 5, acts: ['listen', { say: ['meet'] }, 'leave'], tags: { meet: 'meet' } });
  assert.equal(decodeRun('1.5.~l-a.aa'), null, 'an encounter still under way');
  for (const bad of ['', '1.5', '1.5..', '1.5.a.', '1.5.~q.', '1.5.abcd.', '1.5.a.abc', '2.5.a.', '1.5.~l.']) assert.equal(decodeRun(bad), null, bad);
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

// What an encounter added to the record, said on the debrief as it is made.
test('an encounter says what it added to the record: a best notebook, a first contact', () => {
  const d = (outcome, decoded, of) => ({ outcome, decoded, of });
  // The first encounter of all: a contact made is the first, and there is no notebook to beat.
  assert.deepEqual(encounterFirsts({}, d('contact', 6, 11)), { best: false, contacts: 1 });
  assert.equal(firstsLine({ best: false, contacts: 1 }), 'First contact made: 1');
  assert.deepEqual(encounterFirsts(undefined, d('silence', 0, 4)), { best: false, contacts: 0 });
  assert.equal(firstsLine({ best: false, contacts: 0 }), '');
  // With a record: a larger share of the phrases is a best; the same share with more phrases is too; an equal or
  // worse notebook is not. A contact made counts on from the ones before.
  const had = { met: 3, contacts: 1, best: { decoded: 6, of: 11 }, runs: [] };
  assert.deepEqual(encounterFirsts(had, d('contact', 9, 11)), { best: true, contacts: 2 });
  assert.equal(firstsLine({ best: true, contacts: 2 }), 'Your best notebook yet · First contacts made: 2');
  assert.deepEqual(encounterFirsts(had, d('alone', 12, 22)), { best: true, contacts: 0 });
  assert.equal(firstsLine({ best: true, contacts: 0 }), 'Your best notebook yet');
  assert.deepEqual(encounterFirsts(had, d('fled', 6, 11)), { best: false, contacts: 0 });
  assert.deepEqual(encounterFirsts(had, d('contact', 5, 11)), { best: false, contacts: 2 });
  assert.deepEqual(encounterFirsts(had, d('hostile', 0, 0)), { best: false, contacts: 0 });
  // A notebook with nothing right is never a best, though none right of eleven outranks none right of two on the
  // record: a contact made by repeating their words, with no guesses written down, is a contact and no more.
  const blank = { met: 1, contacts: 0, runs: [{ outcome: 'fled', decoded: 0, of: 2 }] };
  assert.deepEqual(encounterFirsts(blank, d('contact', 0, 11)), { best: false, contacts: 1 });
  assert.equal(firstsLine(encounterFirsts(blank, d('contact', 0, 11))), 'First contact made: 1');
  assert.deepEqual(encounterFirsts({ met: 1, runs: [{ outcome: 'hostile', decoded: 0, of: 0 }] }, d('silence', 0, 5)), { best: false, contacts: 0 });
  assert.deepEqual(encounterFirsts(blank, d('silence', 1, 11)), { best: true, contacts: 0 });
  // The record as the page keeps it, with its runs: the same answer as standing() gives before and after.
  const saved = { runs: [{ outcome: 'contact', decoded: 3, of: 9, people: 'Beqen' }, { outcome: 'silence', decoded: 4, of: 8, people: 'Orru' }] };
  const real = debrief(win(newGame({ seed: 5 })));
  const f = encounterFirsts(saved, real);
  const after = standing({ ...saved, runs: [...saved.runs, { outcome: real.outcome, decoded: real.decoded, of: real.of }] });
  assert.equal(f.contacts, after.contacts);
  assert.equal(f.best, after.best.decoded * 8 > 4 * after.best.of && after.best.of === real.of);
});

// The line at the head of the briefing, from what the page has saved.
test('the briefing greets a returning officer, and a first hail reads as it always has', () => {
  assert.equal(briefingLine({}), '');
  assert.equal(briefingLine(), '');
  const run = (outcome, people) => ({ outcome, people, decoded: 2, of: 8 });
  assert.equal(briefingLine({ runs: [run('contact', 'Beqen')] }), 'Your second unknown ship. The last were the Beqen; these are not.');
  assert.equal(briefingLine({ met: 3, runs: [run('fled', 'Orru'), run('alone', 'Beqen')] }), 'Your fourth unknown ship. The last were the Beqen; these are not.');
  assert.equal(briefingLine({ runs: [run('contact', 'Beqen'), run('silence', 'Orru')] }), 'Your third unknown ship. The last ship left without being understood.');
  assert.equal(briefingLine({ met: 11, runs: [run('hostile', 'Tal Vek')] }), 'Your twelfth unknown ship. The last were the Tal Vek; these are not.');
  assert.equal(briefingLine({ met: 12, runs: [run('contact', 'Beqen')] }), 'Unknown ship number 13. The last were the Beqen; these are not.');
  // A save that has lost the last ship's name, or has something else in its place, still counts the ship.
  assert.equal(briefingLine({ met: 4, runs: [] }), 'Your fifth unknown ship.');
  assert.equal(briefingLine({ runs: [{ outcome: 'contact', people: '<b>x</b>' }] }), 'Your second unknown ship.');
  assert.equal(briefingLine({ runs: [{ outcome: 'contact', people: 7 }] }), 'Your second unknown ship.');
  // Every people the game can make up passes for a name.
  for (let seed = 1; seed <= 300; seed++) {
    const people = makeLanguage(seed).people;
    assert.equal(briefingLine({ runs: [run('contact', people)] }), `Your second unknown ship. The last were the ${people}; these are not.`, `seed ${seed}: ${people}`);
  }
});

// Where first contact happens (js/contacts.js): the star the bridge's save has the ship holding at, and the contacts
// first contact's record says were made at each star, for the bridge's log and tonight's card.
test('the hail comes in where the bridge left the ship, and the log and tonight’s card are told where contact was made', async () => {
  const { shipPlace, whereWords, contactsMade, contactLine, linesForVisit, linesForStar } = await import('../js/contacts.js');
  const vega = { star: 12, title: 'Vega', stardate: '2026.880', id: 1700000000000 };
  const sol = { star: 0, title: 'Sol', stardate: '2026.870', id: 1690000000000 };
  // Holding at Vega, the newest entry: this stay.
  assert.deepEqual(shipPlace({ at: 12, log: [vega, sol] }), { star: 12, place: 'Vega', visit: vega.id });
  assert.equal(whereWords(shipPlace({ at: 12, log: [vega, sol] })), 'here at Vega');
  // No save at all is the bridge's start, in Earth orbit; so is home.
  assert.deepEqual(shipPlace(null), { star: 0, place: '', visit: null });
  assert.equal(whereWords(shipPlace(null)), 'in Earth orbit');
  assert.equal(whereWords(shipPlace({ at: 0, log: [sol] })), 'in Earth orbit');
  // A star the log no longer names (cleared) is somewhere, but the briefing can't say where.
  assert.deepEqual(shipPlace({ at: 12, log: [] }), { star: 12, place: '', visit: null });
  assert.equal(whereWords(shipPlace({ at: 12, log: [] })), '');
  // Damaged saves are home, and a name that isn't one is no name.
  assert.deepEqual(shipPlace({ at: -3, log: 'x' }), { star: 0, place: '', visit: null });
  assert.equal(shipPlace({ at: 12, log: [{ ...vega, title: '<img src=x>' }] }).place, '');
  // The record: a first contact at Vega during that stay, and one at home.
  const saved = { friends: [
    { seed: 5, people: 'Qaethuk', star: 12, visit: vega.id, sd: '2026.880' },
    { seed: 9, people: 'Tal Vek', star: 0, visit: sol.id, sd: '2026.901' },
    { seed: 6, people: 'Beqen', star: 12, sd: '2026.881' }, // made at Vega with no log entry for the stay
    { seed: 7, people: 'Orru', star: 12, visit: vega.id, sd: 'soon' }, // not a stardate: left out
    { seed: 8, people: '<b>', star: 12, sd: '2026.882' },
    null,
  ] };
  const made = contactsMade(saved);
  assert.deepEqual(made.map(c => [c.people, c.star]), [['Qaethuk', 12], ['Tal Vek', 0], ['Beqen', 12]]);
  assert.equal(contactLine(made[0]), 'First contact was made here with the Qaethuk, stardate 2026.880.');
  // The log tells it on the stay it happened in, and not on another visit to the same star.
  assert.deepEqual(linesForVisit(made, vega), ['First contact was made here with the Qaethuk, stardate 2026.880.']);
  assert.deepEqual(linesForVisit(made, { ...vega, id: 1800000000000 }), []);
  assert.deepEqual(linesForVisit(made, sol), ['First contact was made here with the Tal Vek, stardate 2026.901.']);
  // Tonight's card tells every contact made at the star, and there is no card for home.
  assert.deepEqual(linesForStar(made, 12), ['First contact was made here with the Qaethuk, stardate 2026.880.', 'First contact was made here with the Beqen, stardate 2026.881.']);
  assert.deepEqual(linesForStar(made, 0), []);
  assert.deepEqual(contactsMade({}), []);
  assert.deepEqual(contactsMade(null), []);
  // A second contact made is told too, where it was made; one that didn't come off is not.
  const twice = contactsMade({ friends: [
    { seed: 5, people: 'Qaethuk', star: 12, visit: vega.id, sd: '2026.880', again: { outcome: 'friends', star: 0, visit: sol.id, sd: '2026.950' } },
    { seed: 6, people: 'Beqen', star: 0, sd: '2026.881', again: { outcome: 'accused', star: 12, visit: vega.id, sd: '2026.951' } },
  ] });
  assert.deepEqual(linesForVisit(twice, sol), ['Second contact was made here with the Qaethuk, stardate 2026.950.']);
  assert.deepEqual(linesForVisit(twice, vega), ['First contact was made here with the Qaethuk, stardate 2026.880.']);
});

// Second contact: a people you made contact with hails again, in the same language, with your notebook carried in.
test('second contact: the same language, the notebook carried in, and solvable from what any first contact heard', async () => {
  const { answer, ALWAYS_HEARD, SECOND_IDS } = await import('../js/contact-sim.js');
  const play = g => { for (let n = 0; !g.over && n < 60; n++) { const a = answer(g); act(g, a ? { say: a } : 'listen'); } return g; };
  assert.equal(SECOND_IDS.length, 6, 'six new moments');
  for (let seed = 1; seed <= 300; seed++) {
    const first = win(newGame({ seed }));
    assert.equal(first.over, 'contact');
    // Everything a first contact can have heard includes what any first contact is sure to have.
    for (const id of ALWAYS_HEARD) assert.ok(first.heard.includes(id), `seed ${seed}: a first contact never heard ${id}`);
    const g = newGame({ seed, again: { heard: first.heard, tags: { meet: 'meet', we: 'you', story: 'meet' } } });
    assert.equal(g.second, true);
    assert.deepEqual(g.lang, first.lang, 'the same people, the same language');
    assert.notEqual(g.danger, first.lang.danger, 'their trouble is the danger you crossed together');
    // The notebook comes in: the phrases from the first time can be said at once, with their guesses.
    assert.deepEqual(g.tags, { meet: 'meet', we: 'you' });
    for (const id of ALWAYS_HEARD) assert.ok(g.heard.includes(id));
    play(g);
    assert.equal(g.over, 'friends', `seed ${seed} ended ${g.over}`);
    assert.equal(g.misses, 0);
    assert.equal(g.patience, PATIENCE);
  }
});

test('second contact: no moment is answered by its own words, "yes" is a trap twice, and half an answer is a miss', async () => {
  const { answer, SECOND_IDS } = await import('../js/contact-sim.js');
  const meet = seed => newGame({ seed, again: { heard: win(newGame({ seed })).heard } });
  const to = (g, id) => { while (!g.over && SECOND_IDS[g.beat] !== id) act(g, { say: answer(g) }); return g; };
  for (let seed = 1; seed <= 40; seed++) {
    // Each moment's own words: said straight back, the question is asked again and nothing is lost; any one of them
    // on its own (but weapons) is a misunderstanding. Every way each moment is put is tried.
    for (const id of SECOND_IDS) {
      for (let k = 0; k < 3; k++) {
        const g = to(meet(seed), id);
        for (let i = 0; i < k; i++) act(g, 'listen');
        const line = g.line.filter(x => x !== 'story');
        // (Weapons said back are weapons, as in a first contact: they cost double, echo or not.)
        if (!line.length || line.length !== g.line.length || line.includes('fight')) continue;
        const before = [g.beat, g.patience];
        act(g, { say: line });
        assert.deepEqual([g.beat, g.patience, g.over], [...before, null], `seed ${seed}: ${id} said back moved it on or cost patience`);
        for (const one of line.filter(x => x !== 'fight')) {
          const h = to(meet(seed), id);
          for (let i = 0; i < k; i++) act(h, 'listen');
          const p = h.patience;
          act(h, { say: [one] });
          assert.equal(SECOND_IDS[h.beat], id, `seed ${seed}: “${one}” alone answered ${id}`);
          assert.ok(h.patience < p || h.over, `seed ${seed}: “${one}” alone on ${id} cost nothing`);
        }
      }
    }
    // "Did you fire on us?" "Yes." And "go now?" "Yes."
    const b = to(meet(seed), 'blame'); act(b, { say: ['yes'] }); assert.equal(b.over, 'accused');
    const s = to(meet(seed), 'soon'); act(s, { say: ['yes'] }); assert.equal(s.over, 'adrift');
    // "Do you want this?" "No, together": either half alone is shown as half, and costs one.
    for (const half of [['no'], ['together']]) {
      const r = to(meet(seed), 'reward');
      const p = r.patience;
      act(r, { say: half });
      assert.equal(r.patience, p - 1);
      assert.match(r.log.filter(l => l.who === 'them').at(-2).act, /stopped halfway/, `seed ${seed}: half an answer was not shown as half`);
    }
    const r = to(meet(seed), 'reward'); act(r, { say: ['no', 'together'] }); assert.equal(SECOND_IDS[r.beat], 'soon');
    // "No" is heard before it is wanted, though a perfect first contact never says it.
    const n = to(meet(seed), 'blame');
    assert.ok(n.heard.includes('no'));
  }
});

test('second contact is kept and shared like a first, and is no new species on the record', async () => {
  const { answer } = await import('../js/contact-sim.js');
  const first = win(newGame({ seed: 77 }));
  const g = newGame({ seed: 77, again: { heard: first.heard, tags: { go: 'go' } } });
  const acts = [];
  const doIt = what => { acts.push(what); act(g, what); };
  doIt('listen');
  while (!g.over) { const a = answer(g); doIt({ say: a }); }
  // Picked up again, word for word.
  const back = replay({ seed: 77, acts, tags: g.tags, again: { heard: first.heard } });
  assert.deepEqual(back.game.log, g.log);
  assert.equal(back.game.over, 'friends');
  // As a link: "2.", the seed, what was carried in, what was done, the guesses.
  const code = encodeRun({ seed: 77, acts, tags: g.tags, again: { heard: first.heard } });
  assert.match(code, /^2\.[0-9a-z]+\.[a-m]+\.[a-m~-]+\.[a-m]*$/);
  const kept = decodeRun(code);
  assert.deepEqual(kept.again.heard.sort(), first.heard.filter(id => id !== 'story').sort());
  assert.deepEqual(replay(kept).game.log, g.log);
  // A first contact's link is read as before.
  const f = newGame({ seed: 77 }); const fa = [];
  while (!f.over) { const a = { say: [hint(f)] }; fa.push(a); act(f, a); }
  assert.equal(decodeRun(encodeRun({ seed: 77, acts: fa, tags: {} })).again, undefined);
  // The debrief is second contact's, with no archive line, and the record doesn't count it as a species met.
  const d = debrief(g);
  assert.deepEqual([d.title, d.second, d.outcome], ['Second contact', true, 'friends']);
  assert.equal(d.story, g.lang.phrases.story);
  const { archiveLine } = await import('../js/contact-sim.js');
  assert.equal(archiveLine(d), '');
  assert.equal(archiveLine({ ...d, outcome: 'silence' }), '');
  const runs = [{ outcome: 'contact', decoded: 3, of: 11, people: 'Beqen' }, { outcome: 'friends', second: true, decoded: 11, of: 12, people: 'Beqen' }];
  assert.deepEqual(standing({ runs }), { met: 1, contacts: 1, best: { decoded: 3, of: 11 } });
  assert.equal(briefingLine({ runs }), 'Your second unknown ship. The last were the Beqen; these are not.');
});

// Today's hail: the same ship for every officer on the same day.
test('today’s hail is the same language all day for everyone, and a new one tomorrow', async () => {
  const { dailySeed, today, shareLine } = await import('../js/contact-sim.js');
  assert.equal(today(new Date(2026, 10, 19, 23, 59)), '2026-11-19');
  assert.equal(today(new Date(2027, 0, 2, 0, 1)), '2027-01-02');
  assert.equal(dailySeed('2026-11-19'), dailySeed('2026-11-19'));
  const year = new Set();
  for (let d = 0; d < 365; d++) {
    const day = today(new Date(2026, 0, 1 + d, 12));
    const seed = dailySeed(day);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
    year.add(makeLanguage(seed).people);
    assert.equal(win(newGame({ seed })).over, 'contact', `${day} can't be won`);
  }
  assert.ok(year.size > 355, `only ${year.size} different peoples in a year`);
  // Not the Maru's dice for the same day.
  const maru = await import('../js/maru-sim.js');
  assert.notEqual(dailySeed('2026-11-19'), maru.dailySeed('2026-11-19'));
  const d = debrief(win(newGame({ seed: dailySeed('2026-11-19') })));
  assert.equal(shareLine(d, '2026-11-19'), `First contact, 19 Nov: the ${d.people}. First contact, ${d.decoded} of ${d.of} phrases decoded`);
  assert.equal(shareLine(d), `First contact: First contact, ${d.decoded} of ${d.of} phrases decoded`);
});

// The linguist's challenges: the hardest languages, by false friends.
test('the five linguist’s challenges each have seven false friends, the most there can be, and can be won', async () => {
  const { falseFriends, CHALLENGES } = await import('../js/contact-sim.js');
  assert.equal(CHALLENGES.length, 5);
  const peoples = new Set();
  for (const seed of CHALLENGES) {
    const L = makeLanguage(seed);
    assert.equal(falseFriends(L).length, 7, `challenge ${seed}`);
    peoples.add(L.people);
    assert.equal(win(newGame({ seed })).over, 'contact');
  }
  assert.equal(peoples.size, 5);
  // The numbers the briefing rests on: about 38% have none, about 1 in 350 has seven, and none has more.
  const n = 40000, count = {};
  for (let seed = 1; seed <= n; seed++) { const k = falseFriends(makeLanguage(seed)).length; count[k] = (count[k] || 0) + 1; }
  assert.ok(Math.max(...Object.keys(count).map(Number)) === 7, JSON.stringify(count));
  assert.ok(count[0] / n > 0.36 && count[0] / n < 0.40, `${count[0] / n} have none`);
  assert.ok(n / count[7] > 250 && n / count[7] < 500, `1 in ${n / count[7]} has seven`);
  // Their example: "the gates open" and "the road open" are a pair.
  const pairs = falseFriends(makeLanguage(179)).map(p => p.join('+'));
  assert.ok(pairs.includes('meet+go') && pairs.includes('understand+give'), pairs.join(' '));
});
