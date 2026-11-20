// The rescue test, as rules: no drawing and no page, so it can be tested on its own. The Academy's third test on the
// Kobayashi Maru's page, and Engage's own: no episode has it. Two ships are in trouble, too far apart for the
// transporter to reach both, and each has a few minutes left. The examiners say there is time to save one of them.
// There is more than that: the cargo transporters can be set to carry people, the shuttles can go to the other ship,
// and the other ship can be told how to buy itself time. A cadet who does all of it saves people from both.
//
// Canon it leans on (Memory Alpha, "Transporter", read 20 November 2026): a 24th-century transporter reaches about
// 40,000 km (The Next Generation, "A Matter of Honor" and "Bloodlines"); cargo transporters could be reset to carry
// people to hurry an evacuation ("11001001"). Full impulse is a quarter of light speed by the Star Trek: Voyager
// Technical Manual (Memory Alpha, "Impulse drive"), so a minute of it is about 4.5 million km. In "The Arsenal of
// Freedom", Riker remembers Paul Rice ignoring the three answers to his Academy navigation test and finding his own;
// the test has had four answers since (Memory Alpha, "Paul Rice"). How many people a transporter moves in a minute,
// and every other number here, are the game's.

export const RANGE_KM = 40000;
export const KM_PER_MINUTE = 4.5e6; // full impulse, a quarter of light speed
export const RATE = 30; // people a minute off the ship in range, from the personnel transporters
export const QUANTUM = 30; // more a minute once the cargo transporters carry people too
export const SHUTTLE_SEATS = 90; // what the shuttles bring off between them, in one trip
export const BUY = 3; // minutes a ship gains when it does what it's told

function rng(seed) {
  let a = seed >>> 0; // mulberry32
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// The ships in trouble, with how many each can carry. Their names are the game's own.
const KINDS = [
  { id: 'colony', what: 'colony transport', aboard: [300, 460] },
  { id: 'liner', what: 'passenger liner', aboard: [220, 380] },
  { id: 'hospital', what: 'hospital ship', aboard: [150, 260] },
  { id: 'science', what: 'science vessel', aboard: [70, 150] },
  { id: 'mining', what: 'mining ship', aboard: [90, 170] },
];
const NAMES = ['Halcyon', 'Seren', 'Corvallis', 'Juniper', 'Okafor', 'Belle Isle', 'Talmadge', 'Ruth Ann', 'Kestrel Bay', 'Marlowe', 'Aranui', 'Tamsin', 'Vigdis', 'Ilha Nova', 'Petrel', 'Maddox Star'];
// What is wrong with each, how long it gives her, and what she can be told to do to buy time.
const DANGERS = [
  { id: 'breach', trouble: 'her warp core will breach', minutes: [6, 9], tell: 'vent the core’s plasma', told: 'Venting plasma. The core is holding, for now.' },
  { id: 'hull', trouble: 'her hull is breaking up', minutes: [7, 10], tell: 'seal the outer decks', told: 'Outer decks sealed. Everyone is in the inner sections.' },
  { id: 'air', trouble: 'her life support is failing', minutes: [8, 11], tell: 'crowd into one deck', told: 'Everyone is on deck four. The rest of the ship is shut down to save the air.' },
  { id: 'star', trouble: 'she is falling into the star', minutes: [7, 10], tell: 'burn the last of her fuel', told: 'Thrusters firing. The fall is slower.' },
  { id: 'storm', trouble: 'a radiation storm will reach her', minutes: [6, 9], tell: 'shelter behind the engine core', told: 'Everyone is aft, behind the core’s shielding.' },
];

// A rescue to try from `seed`. Not every throw makes a fair test: one where everyone can be saved, or where the
// orders the examiners expect (go to one, beam everyone you can) are already the best, is thrown again. Every test
// keeps: nobody can save everyone (the best leaves at least 40 behind), and the best run saves people from both ships.
export function newRescue(seed = Date.now()) {
  for (let k = 0; k < 200; k++) {
    const t = setUp((seed + k * 7919) >>> 0, seed >>> 0);
    const top = best(t), plain = best(t, PLAIN).rescued, total = t.ships[0].aboard + t.ships[1].aboard;
    if (top.rescued <= total - 40 && top.rescued >= plain + 20 && run(t, top.orders).ships.every(s => s.saved > 0)) return { ...t, most: top.rescued, plain, total, plan: top.orders };
  }
  throw new Error('rescue-sim: no fair test from that seed');
}
function setUp(throwSeed, seed) {
  const r = rng(throwSeed);
  const kinds = [...KINDS].sort(() => r() - 0.5).slice(0, 2);
  const dangers = [...DANGERS].sort(() => r() - 0.5).slice(0, 2);
  const names = [...NAMES].sort(() => r() - 0.5).slice(0, 2);
  const ships = kinds.map((kind, i) => {
    const d = dangers[i];
    return { name: names[i], kind: kind.id, what: kind.what, danger: d.id, aboard: Math.round(between(r, ...kind.aboard) / 10) * 10, left: between(r, ...d.minutes), saved: 0, lost: false, bought: false, shuttled: 0 };
  });
  return {
    seed, apart: pick(r, [2, 3]), minute: 0, at: 'between', rate: RATE, quantum: false,
    shuttles: null, // { to, arrives } once launched
    ships, over: false, log: 0,
  };
}

// A copy to play on, of only what the rules use (the searches below make hundreds of thousands).
const copy = t => ({ seed: t.seed, apart: t.apart, minute: t.minute, at: t.at, rate: t.rate, quantum: t.quantum,
  shuttles: t.shuttles && { ...t.shuttles }, ships: t.ships.map(s => ({ ...s })), over: t.over, most: t.most, total: t.total, plan: t.plan });
const where = t => (t.at === 'a' ? 0 : t.at === 'b' ? 1 : -1);
// How many minutes to close on ship i from where the ship is.
export const travel = (t, i) => (where(t) === i ? 0 : where(t) === -1 ? 1 : t.apart);
const live = s => !s.lost && s.aboard > 0;
// How far apart the two ships are, in km, for the briefing.
export const apartKm = t => t.apart * KM_PER_MINUTE;

// The orders on offer, in the order the page lists them. Each takes a minute, but for closing on a ship, which takes
// as many as the trip does. Once given, a one-time order goes from the list.
export function orders(t) {
  if (t.over) return [];
  const out = [];
  const here = where(t);
  t.ships.forEach((s, i) => {
    if (here !== i && live(s)) out.push({ id: `go-${i}`, label: `Close on the ${s.name}`, sub: `${travel(t, i)} minute${travel(t, i) === 1 ? '' : 's'} at full impulse` });
  });
  const inRange = here >= 0 && live(t.ships[here]);
  out.push({ id: 'beam', label: 'Energize', sub: inRange ? `${t.rate} a minute off the ${t.ships[here].name}` : 'Nobody in range', off: !inRange });
  if (!t.quantum) out.push({ id: 'quantum', label: 'Cargo transporters to quantum level', sub: `A minute to set; then ${RATE + QUANTUM} a minute` });
  if (!t.shuttles) {
    t.ships.forEach((s, i) => { if (live(s)) out.push({ id: `shuttle-${i}`, label: `Shuttles to the ${s.name}`, sub: `They bring off ${SHUTTLE_SEATS}, if she lasts till they get there` }); });
  }
  t.ships.forEach((s, i) => {
    if (!s.bought && live(s)) out.push({ id: `tell-${i}`, label: `Tell the ${s.name} to ${DANGERS.find(d => d.id === s.danger).tell}`, sub: `${BUY} more minutes for her` });
  });
  return out;
}

// The orders the examiners expect: go to a ship and beam. Used to make sure there is always more to find.
const PLAIN = id => id === 'beam' || id === 'quantum' || id.startsWith('go-');

// A minute passes: shuttles that get there take people off, and each ship's time runs down. Returns what was said.
function tick(t, say) {
  t.minute++;
  const sh = t.shuttles;
  if (sh && !sh.done && t.minute >= sh.arrives) {
    sh.done = true;
    const s = t.ships[sh.to];
    if (live(s)) {
      const n = Math.min(SHUTTLE_SEATS, s.aboard);
      s.aboard -= n; s.saved += n; s.shuttled = n;
      say('Shuttle bay', `The shuttles are back from the ${s.name} with ${n} aboard.`, 'good');
    } else say('Shuttle bay', `The shuttles reached the ${s.name} too late.`, 'bad');
  }
  for (const s of t.ships) {
    if (s.lost) continue;
    s.left--;
    if (s.left <= 0) {
      s.lost = true;
      if (s.aboard > 0) say('Ops', `We’ve lost the ${s.name}. ${s.aboard} were still aboard.`, 'bad');
      else if (s.saved > 0) say('Ops', `The ${s.name} is gone. Everyone was off her.`);
    }
  }
  const shuttlesOut = sh && !sh.done && live(t.ships[sh.to]);
  if (!t.ships.some(live) && !shuttlesOut) t.over = true;
}

// Gives one order. Returns what was said, for the page's log: [{ who, text, tone }].
export function act(t, id) {
  const lines = [];
  const say = (who, text, tone) => lines.push({ who, text, tone });
  if (t.over || !orders(t).some(o => o.id === id && !o.off)) return lines;
  const [kind, n] = id.split('-');
  const i = Number(n);
  if (kind === 'go') {
    const m = travel(t, i);
    say('Helm', `Full impulse to the ${t.ships[i].name}. ${m === 1 ? 'One minute.' : `${m} minutes.`}`);
    t.at = 'between';
    for (let k = 0; k < m && !t.over; k++) tick(t, say);
    t.at = i === 0 ? 'a' : 'b';
    if (live(t.ships[i])) say('Transporter room', `The ${t.ships[i].name} is in range.`);
    else if (!t.over) say('Helm', `We’re there, Captain. There’s nobody left to beam.`);
    return lines;
  }
  if (kind === 'beam') {
    const s = t.ships[where(t)];
    const got = Math.min(t.rate, s.aboard);
    s.aboard -= got; s.saved += got;
    say('Transporter room', s.aboard === 0 ? `${got} aboard. That’s the last of them off the ${s.name}.` : `${got} aboard from the ${s.name}. ${s.aboard} still on her.`, 'good');
  } else if (kind === 'quantum') {
    t.quantum = true; t.rate = RATE + QUANTUM;
    say('Engineering', `Cargo transporters reset to quantum level. They can carry people now: ${t.rate} a minute.`);
  } else if (kind === 'shuttle') {
    t.shuttles = { to: i, arrives: t.minute + 1 + 2 * Math.max(1, travel(t, i)), done: false };
    say('Shuttle bay', `Shuttles away to the ${t.ships[i].name}. ${t.shuttles.arrives - t.minute - 1} minutes there and back.`);
  } else if (kind === 'tell') {
    const s = t.ships[i], d = DANGERS.find(x => x.id === s.danger);
    s.bought = true; s.left += BUY;
    say(s.name, d.told);
  }
  tick(t, say);
  return lines;
}

// A test played through from its start, by the orders given.
export function run(t0, list) {
  const t = copy(t0);
  for (const id of list) act(t, id);
  return t;
}

// The most anyone can bring home from here: { rescued, orders }. Every order can be searched: the ships' clocks
// end a test within about fifteen minutes, and the same state reached two ways is only looked at once.
export function best(t0, allowed = () => true) {
  const memo = new Map();
  const key = t => [t.minute, t.at, t.rate, t.shuttles ? `${t.shuttles.to}:${t.shuttles.arrives}:${t.shuttles.done}` : '-',
    ...t.ships.map(s => `${s.aboard}:${s.left}:${s.lost}:${s.bought}`)].join('|');
  const saved = t => t.ships.reduce((n, s) => n + s.saved, 0);
  function go(t) {
    if (t.over) return { rescued: saved(t), orders: [] };
    const k = key(t);
    if (memo.has(k)) { const m = memo.get(k); return { rescued: saved(t) + m.more, orders: m.orders }; }
    let top = { more: -1, orders: [] };
    for (const o of orders(t)) {
      if (o.off || !allowed(o.id)) continue;
      const next = copy(t);
      act(next, o.id);
      const r = go(next);
      const more = r.rescued - saved(t);
      if (more > top.more) top = { more, orders: [o.id, ...r.orders] };
    }
    if (top.more < 0) top = { more: 0, orders: [] }; // nothing left that helps: the rest is waiting
    memo.set(k, top);
    return { rescued: saved(t) + top.more, orders: top.orders };
  }
  return go(copy(t0));
}

// A test with nothing left to do but wait is over: the ships' clocks run out on their own. Nothing more can be done
// once no ship with people aboard can still be reached by the transporter or the shuttles in her time, even after
// telling her to buy some. Returns what was said as the clocks ran out.
export function settle(t) {
  const lines = [];
  const say = (who, text, tone) => lines.push({ who, text, tone });
  while (!t.over && hopeless(t)) tick(t, say);
  return lines;
}
export function hopeless(t) {
  return t.ships.every((s, i) => {
    if (!live(s)) return true;
    const time = s.left + (s.bought ? 0 : BUY - 1); // what she has, if she is told first
    const coming = t.shuttles && !t.shuttles.done && t.shuttles.to === i && time >= t.shuttles.arrives - t.minute;
    return travel(t, i) >= time && !coming && (t.shuttles || 2 * Math.max(1, travel(t, i)) >= time);
  });
}

// Today's rescue: the same two ships for every cadet on the same calendar day. `day` is YYYY-MM-DD.
export function dailySeed(day) {
  let h = 0x811c9dc5;
  for (const c of `rescue-test:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

// The board's verdict: { title, passed, rescued, total, most, share, summary, note }.
export function evaluate(t, given = []) {
  const rescued = t.ships.reduce((n, s) => n + s.saved, 0);
  const share = t.most ? rescued / t.most : 0;
  const both = t.ships.every(s => s.saved > 0);
  const title = rescued >= t.most ? 'Commended' : share >= 0.85 ? 'Passed' : 'Not passed';
  const note = [];
  // What the best run used and this one didn't: the board only mentions what would have helped.
  const plan = Array.isArray(t.plan) ? t.plan : [];
  const used = test => plan.some(test) && !given.some(test);
  const firstMove = given.findIndex(id => id.startsWith('go-'));
  if (firstMove === 0) note.push(`You chose in the first minute: the ${t.ships[Number(given[0].slice(3))].name}.`);
  else if (firstMove > 0) note.push(`You gave ${firstMove === 1 ? 'one order' : `${firstMove} orders`} before you closed on either ship.${rescued < t.most ? ' Choosing sooner would have bought time at the pads.' : ''}`);
  if (used(id => id === 'quantum')) note.push('You never set the cargo transporters to carry people. Every minute at the pads after that would have brought more off.');
  if (used(id => id.startsWith('shuttle-'))) note.push('The shuttles never left the bay. They could have brought people off a ship the transporter couldn’t reach in time.');
  else if (t.shuttles && !t.ships[t.shuttles.to].shuttled) note.push(`The shuttles reached the ${t.ships[t.shuttles.to].name} too late.`);
  if (used(id => id.startsWith('tell-'))) note.push('Neither ship was told how to buy time. Their crews knew how; nobody asked them.');
  if (both) note.push(`You took people off both ships. The test says there is time for one; the best cadets find the rest, the way Paul Rice found a fourth answer to a test that had three.`);
  else note.push(`Everyone you saved came off one ship. That is the answer the test gives you; it isn’t the best one.`);
  return {
    title, passed: title !== 'Not passed', rescued, total: t.total, most: t.most, share,
    summary: `You brought ${rescued} of the ${t.total} aboard home. The most the simulation allowed was ${t.most}${rescued >= t.most ? ', and you found it.' : ` (${Math.round(share * 100)}% of it).`}`,
    note,
  };
}

// The run in a line, to send: "Rescue test, 20 Nov: 412 home, the most it allowed 455".
export function shareLine(e, day) {
  const when = day ? `, ${new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  return `Rescue test${when}: ${e.rescued} home, of the ${e.most} it allowed`;
}

export const moral = 'The rescue test says there is time to save one ship. It is testing whether you take that as the answer.';
