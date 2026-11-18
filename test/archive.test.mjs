// The examiners' archive, held to the rules it was made from:  node --test test/archive.test.mjs
// js/archive.js is written by tools/archive.mjs. These run its trials again (the same dice, the same random orders)
// and fail if a change to either game's rules has moved a number: run the tool again, and look at what moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE } from '../js/archive.js';
import { maruTrials, contactTrials, mostHome, MARU_TRIALS, CONTACT_TRIALS, SEARCHED } from '../tools/archive.mjs';
import * as maru from '../js/maru-sim.js';
import * as contact from '../js/contact-sim.js';

test('the Kobayashi Maru’s archive is what its trials give today', () => {
  const { trials, endings } = maruTrials();
  assert.deepEqual({ trials, endings }, { trials: ARCHIVE.maru.trials, endings: ARCHIVE.maru.endings }, 'the rules have moved the archive: run node tools/archive.mjs');
  assert.equal(trials, MARU_TRIALS);
  assert.equal(Object.values(endings).reduce((a, b) => a + b, 0), trials, 'a trial did not end');
  assert.equal(ARCHIVE.maru.searched, SEARCHED);
  assert.equal(mostHome(1), ARCHIVE.maru.mostHome);
});

test('first contact’s archive is what its trials give today', () => {
  const got = contactTrials();
  assert.deepEqual(got, ARCHIVE.contact, 'the rules have moved the archive: run node tools/archive.mjs');
  assert.equal(got.trials, CONTACT_TRIALS);
  assert.equal(Object.values(got.endings).reduce((a, b) => a + b, 0), got.trials, 'an encounter did not end');
});

test('the evaluation says how rare its ending is, and nothing for one the archive never saw', () => {
  const g = maru.newGame({ seed: 7 });
  for (const id of ['enter', 'beam', 'beam', 'warp']) maru.act(g, id);
  const e = maru.evaluate(g);
  const n = Math.round(ARCHIVE.maru.trials / ARCHIVE.maru.endings['The lifeboat']);
  assert.equal(maru.archiveLine(g, e), `About 1 in ${n} ends this way, of 400,000 trials the simulator ran with orders given at random.`);
  assert.ok(n > 5 && n < 40, `1 in ${n}`);
  assert.ok(e.note.includes('Nobody has brought more than 150 home.'));
  const stay = maru.newGame({ seed: 7 });
  maru.act(stay, 'leave');
  assert.match(maru.archiveLine(stay, maru.evaluate(stay)), /^About 1 in 2 ends this way/);
  assert.ok(!maru.evaluate(stay).note.some(l => /Nobody has/.test(l)));
  // The reprogrammed simulator is not the one in the archive.
  const r = maru.newGame({ seed: 7, rewritten: true });
  for (const id of ['enter', 'beam', 'beam', 'warp']) maru.act(r, id);
  assert.equal(maru.archiveLine(r, maru.evaluate(r)), '');
  assert.ok(!maru.evaluate(r).note.some(l => /Nobody has/.test(l)));
  // Every line reads as a share of trials, and the commonest endings as so many in ten.
  for (const t of maru.ENDINGS) {
    const line = maru.archiveLine({ rewritten: false }, { title: t });
    if (t === 'Changed the rules') assert.equal(line, '');
    else assert.match(line, /^About (1 in \d+ ends|\d in 10 end) this way, of 400,000 trials/);
  }
  const contacts = Math.round(ARCHIVE.contact.trials / ARCHIVE.contact.endings.contact);
  assert.equal(contact.archiveLine({ outcome: 'contact' }), `About 1 in ${contacts} ends this way, of 40,000 encounters answered with phrases picked at random.`);
  assert.match(contact.archiveLine({ outcome: 'silence' }), /^About \d in 10 end this way/);
  assert.equal(contact.archiveLine({ outcome: 'fled' }), '');
  assert.equal(contact.archiveLine({ outcome: 'hostile' }), '');
});
