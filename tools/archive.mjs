// The examiners' archive: how the Kobayashi Maru and first contact end when the orders are given at random, so an
// evaluation can say how rare its ending is.  node tools/archive.mjs   rewrites js/archive.js
// The trials are the same every time (the dice and the random orders both come from fixed seeds), and
// test/archive.test.mjs runs them again and holds js/archive.js to what they give, so a change to either game's
// rules that moves the numbers fails the tests until this is run again.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as maru from '../js/maru-sim.js';
import * as contact from '../js/contact-sim.js';

export const MARU_TRIALS = 400000;
export const CONTACT_TRIALS = 40000;
export const SEARCHED = 10; // simulations searched every way they can go, for the most anyone brings home

// A cadet who gives any order the simulation offers, at random, until it ends. The simulator as every cadet meets it:
// never the reprogrammed one.
export function maruTrials(n = MARU_TRIALS) {
  let a = 1;
  const rand = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const endings = {};
  for (let seed = 1; seed <= n; seed++) {
    const g = maru.newGame({ seed });
    while (!g.over && g.turn < 200) { const open = maru.orders(g).filter(o => !o.done); maru.act(g, open[Math.floor(rand() * open.length)].id); }
    const t = g.over ? maru.evaluate(g).title : 'unfinished';
    endings[t] = (endings[t] || 0) + 1;
  }
  return { trials: n, endings: Object.fromEntries(maru.ENDINGS.filter(t => endings[t]).map(t => [t, endings[t]])) };
}

// An officer who answers every line with one to three phrases picked at random from those heard so far.
export function contactTrials(n = CONTACT_TRIALS) {
  let a = 2;
  const rand = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const endings = {};
  for (let seed = 1; seed <= n; seed++) {
    const g = contact.newGame({ seed });
    while (!g.over && g.turn < 200) {
      const pool = g.heard.filter(id => id !== 'story');
      const say = [];
      for (let k = 1 + Math.floor(rand() * Math.min(contact.MAX_REPLY, pool.length)); k > 0; k--) say.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      contact.act(g, { say });
    }
    const t = g.over || 'unfinished';
    endings[t] = (endings[t] || 0) + 1;
  }
  return { trials: n, endings };
}

// The most people any order of orders brings home at warp, over every way each of `seeds` simulations can go.
export function mostHome(seeds = SEARCHED) {
  let most = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const seen = new Set();
    const walk = g => {
      if (g.over) { if (g.over === 'warp') most = Math.max(most, g.aboard); return; }
      const { rand, ...rest } = g;
      const key = JSON.stringify(rest) + rand.state();
      if (seen.has(key)) return;
      seen.add(key);
      for (const o of maru.orders(g)) if (!o.done) { const c = maru.fork(g); maru.act(c, o.id); walk(c); }
    };
    walk(maru.newGame({ seed }));
  }
  return most;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const archive = { maru: { ...maruTrials(), searched: SEARCHED, mostHome: mostHome() }, contact: contactTrials() };
  await writeFile(new URL('../js/archive.js', import.meta.url), `// The examiners' archive. Written by tools/archive.mjs, which says how: run it again rather than editing this.
// maru: how ${archive.maru.trials.toLocaleString('en-US')} Kobayashi Maru simulations ended with orders given at random, and the most anyone brought home
// at warp in every way ${archive.maru.searched} simulations can go. contact: how ${archive.contact.trials.toLocaleString('en-US')} first contacts ended, answered with phrases picked at random.
export const ARCHIVE = ${JSON.stringify(archive, null, 2)};
`);
  console.log(archive);
}
