// The Kobayashi Maru, as rules: no drawing and no page, so it can be tested on its own.
import { ARCHIVE } from './archive.js';
// The test is rigged the way Starfleet Academy rigs it: whatever you do, the Maru is lost, and more cruisers keep coming.
// What changes is how you lose, and that is what evaluate() grades.

// Where the scenario is set. In Star Trek II the Maru gives her position as Gamma Hydra, Section 10. Gamma Hydrae is
// a real star: `star` is its name in the catalogue the bridge flies by, and `ly` that catalogue's distance to the
// nearest light year (test/maru.test.mjs holds it to the catalogue).
export const POSITION = { film: 'Gamma Hydra, Section 10', star: 'γ Hydrae', name: 'Gamma Hydrae', ly: 134 };
export const CREW = 430; // your ship's company
export const MARU = 381; // the Maru: 81 crew and 300 passengers
export const BEAM = 75; // people the transporter brings over in a turn
export const WARP_HULL = 35; // below this much hull the warp drive is gone
export const ABANDON_HULL = 60; // below this much hull, abandoning ship becomes an order
const MARU_HIT = 34; // the Maru's hull lost to each Klingon volley: three volleys and she breaks up
const FIRE = 8; // what one cruiser's volley takes off your hull or shields, before it ramps up
const LIFE_SUPPORT = 12; // Maru lives lost each turn you wait outside
const LIFE_SUPPORT_NEAR = 6; // and each turn once you're alongside

function rng(seed) {
  let a = seed >>> 0; // mulberry32
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  next.state = () => a; // where the dice are: rng(state) throws the same ones from here
  return next;
}

const NAMES = ['IKS Gr’oth', 'IKS Amar', 'IKS Kor’tal', 'IKS Hegh’ta', 'IKS Bortas', 'IKS Ning’tao', 'IKS T’Ong', 'IKS Qu’Vat', 'IKS Pagh', 'IKS Rotarran', 'IKS Buruk', 'IKS Toh’Kaht'];

// A fresh simulation. `rewritten` is the one cadet who reprogrammed the simulator.
export function newGame({ seed = Date.now(), rewritten = false } = {}) {
  return {
    seed, rand: rng(seed), rewritten,
    turn: 0, zoneTurn: 0, quiet: 0, where: 'outside', over: null,
    hull: 100, shields: 100, torpedoes: 6,
    maru: { aboard: MARU, hull: 100, gone: false, lostTurn: 0 },
    aboard: 0, beamedEver: 0, lifeSupportLost: 0,
    klingons: [], sent: 0, kills: 0, named: 0,
    flags: { hailedMaru: false, calledStarfleet: false, scanned: false, hailedKlingons: 0, talkedFirst: false, firedFirst: false, playerFired: false, klingonsFired: false, held: false, surrendered: false, beamedUnderFire: 0, warpDown: false },
  };
}

const alive = g => g.klingons.filter(k => k.hull > 0);
// The Klingons' clock: turns alongside the Maru, less the quiet one a first hail buys. Their rising fire, their attack
// on the Maru and their reinforcements all run on it, so the turn they hold fire really is free. (It used to count,
// and talking first turned the best run there is, two beam-overs and out, into losing everyone.)
const clock = g => g.zoneTurn - g.quiet;
const crewLost = g => (g.over === 'destroyed' ? CREW : Math.round(CREW * (100 - g.hull) / 100 * 0.3));

// A copy of a simulation under way that throws the same dice from here on: for searching every way a game can go
// (tools/archive.mjs and the tests) without playing each one again from the start.
export function fork(g) {
  const { rand, ...rest } = g;
  return { ...structuredClone(rest), rand: rng(rand.state()) };
}

// The orders the captain can give right now.
export function orders(g) {
  if (g.over) return [];
  if (g.where === 'outside') {
    return [
      { id: 'enter', label: 'Cross into the Neutral Zone', sub: 'Go to the Maru. The treaty forbids it.', primary: true },
      { id: 'hail-maru', label: 'Hail the Maru', sub: g.flags.hailedMaru ? 'Already answered' : 'Confirm the distress call', done: g.flags.hailedMaru },
      { id: 'starfleet', label: 'Call Starfleet Command', sub: g.flags.calledStarfleet ? 'Already answered' : 'Ask for orders', done: g.flags.calledStarfleet },
      { id: 'scan', label: 'Scan the Neutral Zone', sub: g.flags.scanned ? 'Already scanned' : 'Look before you go', done: g.flags.scanned },
      { id: 'leave', label: 'Stay on this side', sub: 'Keep the treaty. Leave the Maru.' },
    ];
  }
  const near = alive(g).length;
  const list = [
    { id: 'beam', label: 'Beam survivors aboard', sub: g.maru.gone ? 'The Maru is gone' : g.maru.aboard === 0 ? 'Nobody left aboard' : `${Math.min(BEAM, g.maru.aboard)} a turn. Shields drop while it runs.`, done: g.maru.gone || g.maru.aboard === 0, primary: !g.maru.gone && g.maru.aboard > 0 },
    { id: 'phasers', label: 'Fire phasers', sub: near ? 'At the weakest cruiser' : 'No targets', done: !near },
    { id: 'torpedoes', label: 'Torpedo spread', sub: g.torpedoes ? `Two at a time, ${g.torpedoes} left` : 'None left', done: !g.torpedoes || !near },
    { id: 'hail', label: 'Hail the Klingons', sub: g.flags.playerFired ? 'After you fired on them' : g.flags.hailedKlingons ? 'They answered once' : 'Talk before shooting' },
    { id: 'evade', label: 'Evasive manoeuvres', sub: 'Halves the damage this turn' },
    { id: 'warp', label: 'Go to warp', sub: g.flags.warpDown ? 'Warp drive is offline' : g.aboard ? `Leave with the ${g.aboard} you have aboard` : 'Leave the Maru behind', done: g.flags.warpDown },
    { id: 'surrender', label: 'Offer surrender', sub: g.flags.surrendered ? (g.rewritten ? 'They want no prisoners' : 'They refused') : 'Ask them to take prisoners', done: g.flags.surrendered },
  ];
  if (g.hull <= ABANDON_HULL) list.push({ id: 'abandon', label: 'Abandon ship', sub: 'Crew to the lifeboats, set the self-destruct', danger: true });
  return list;
}

// A simulation picked up where it was left. What is kept is small: the seed, whether the simulator was reprogrammed,
// and the orders given so far. Giving them again to a new simulation with the same seed throws the same dice, so the
// ship, the cruisers and the Maru come back exactly as they were, and a reload can't be used to re-roll a turn.
// Returns the game and what each turn said (for the page's log), or null if what was kept isn't a simulation: not
// the right shape, or an order that couldn't have been given when it says it was.
export function replay(kept) {
  if (!kept || typeof kept !== 'object' || !Number.isFinite(kept.seed) || !Array.isArray(kept.orders) || kept.orders.length > 500) return null;
  const g = newGame({ seed: kept.seed, rewritten: kept.rewritten === true });
  const turns = [];
  for (const id of kept.orders) {
    if (g.over || !orders(g).some(o => o.id === id && !o.done)) return null;
    turns.push({ id, ...act(g, id) });
  }
  return { game: g, turns };
}

// The tactical display in words, for someone who can't see it: where your ship is, how many are still aboard the
// Maru, and how strong each cruiser still is (Fire phasers goes for the weakest, and only the picture showed which).
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
export function tactical(g) {
  const ship = g.over === 'destroyed' || g.over === 'abandoned' ? 'Your ship is gone.'
    : g.over === 'warp' ? 'Your ship has gone to warp.'
    : g.where === 'outside' ? 'Your ship is holding in Federation space, at the edge of the Neutral Zone.'
    : `Your ship is inside the Neutral Zone, alongside the Maru, hull ${g.hull} percent, shields ${g.shields} percent.`;
  const maru = g.maru.gone ? 'The Kobayashi Maru is lost.'
    : `The Kobayashi Maru is adrift${g.where === 'outside' ? ' inside the zone' : ''}, ${g.maru.aboard} aboard.`;
  const up = alive(g), down = g.klingons.length - up.length;
  const strengths = up.map(k => k.hull);
  const list = strengths.length > 1 ? `${strengths.slice(0, -1).join(', ')} and ${strengths[strengths.length - 1]}` : `${strengths[0]}`;
  const cruisers = !g.klingons.length ? ''
    : ` ${COUNT[up.length] || up.length} Klingon cruiser${up.length === 1 ? '' : 's'}${up.length ? `, at ${list} percent` : ' left'}${down ? `; ${down} destroyed` : ''}.`;
  return `Tactical display. ${ship} ${maru}${cruisers}`;
}

// Gives one order and plays out the turn. Returns what happened, for the page to draw and log.
export function act(g, id) {
  const o = orders(g).find(x => x.id === id);
  if (!o || o.done) return { events: [], lines: [] };
  const events = [], lines = [];
  const say = (who, text, tone) => lines.push({ who, text, tone });
  g.turn++;

  if (g.where === 'outside') {
    if (id === 'hail-maru') {
      g.flags.hailedMaru = true;
      // In the reprogrammed simulator the Maru's air holds, and she says so: waiting out here costs nobody.
      say('Kobayashi Maru', g.rewritten
        ? 'This is the Kobayashi Maru. We’ve struck a gravitic mine and lost all power. Hull breached, 381 aboard. Life support is holding, for now. Please help us.'
        : 'This is the Kobayashi Maru. We’ve struck a gravitic mine and lost all power. Hull breached, 381 aboard, life support failing. Please help us.');
    } else if (id === 'starfleet') {
      g.flags.calledStarfleet = true;
      say('Starfleet Command', 'The Maru is inside the Neutral Zone. Entering it violates the treaty with the Klingon Empire. Proceed at your discretion.');
    } else if (id === 'scan') {
      g.flags.scanned = true;
      say('Science officer', 'One freighter, adrift, ten thousand kilometres inside the zone. Nothing else on sensors. A cloaked ship wouldn’t show either.');
    } else if (id === 'leave') {
      g.over = 'stayed';
      g.maru.gone = true; g.maru.lostTurn = g.turn;
      say('Helm', 'Holding position outside the Neutral Zone.');
      say('Kobayashi Maru', 'Is anyone receiving? Please—', 'bad');
      say('Communications', 'The Maru’s signal has stopped.', 'bad');
      return { events, lines };
    } else if (id === 'enter') {
      g.where = 'zone';
      events.push({ type: 'move', to: 'maru' });
      say('Helm', 'Crossing into the Neutral Zone. Coming alongside the Maru.');
      decloak(g, 3, events);
      say('Tactical', 'Three Klingon cruisers decloaking, bearing on us!', 'bad');
      say('Klingon commander', g.rewritten
        ? 'Federation ship, we know your captain. We will not fire. Take your freighter.'
        : 'Federation ship, you have violated the treaty. Leave Klingon space or be destroyed.', 'klingon');
      return { events, lines };
    }
    // The cadet who rewrote the conditions took the Maru's failing air out with the Klingons' guns:
    // otherwise asking first, which the examiner praises, would quietly put the one win out of reach.
    if (!g.rewritten) lifeSupport(g, LIFE_SUPPORT, say);
    return { events, lines };
  }

  // In the zone: your order, then the Maru's air, then the Klingons' answer.
  g.zoneTurn++;
  let shieldsDown = false, evading = false, hold = false;
  const targets = () => alive(g).sort((a, b) => a.hull - b.hull);

  if (id === 'beam') {
    shieldsDown = true;
    const n = Math.min(BEAM, g.maru.aboard);
    g.maru.aboard -= n; g.aboard += n; g.beamedEver += n;
    events.push({ type: 'beam', n });
    say('Transporter room', `Shields down. ${n} aboard from the Maru${g.maru.aboard ? `, ${g.maru.aboard} still over there` : ', and that’s everyone'}.`, 'good');
  } else if (id === 'phasers') {
    fireFirst(g);
    const k = targets()[0];
    const dmg = Math.round(36 + g.rand() * 14);
    hit(g, k, dmg, 'phaser', events, say);
  } else if (id === 'torpedoes') {
    fireFirst(g);
    g.torpedoes -= 2;
    const t = targets();
    hit(g, t[0], Math.round(46 + g.rand() * 10), 'torpedo', events, say);
    const second = alive(g).sort((a, b) => a.hull - b.hull)[0];
    if (second) hit(g, second, Math.round(46 + g.rand() * 10), 'torpedo', events, say);
  } else if (id === 'hail') {
    g.flags.hailedKlingons++;
    if (!g.flags.playerFired) g.flags.talkedFirst = true;
    events.push({ type: 'hail' });
    if (g.rewritten) say('Klingon commander', 'We have said we will not fire. Take your people and go.', 'klingon');
    else if (g.flags.playerFired) say('Klingon commander', 'You fired on us. Now you want to talk? Die well, human.', 'klingon');
    else if (g.flags.hailedKlingons === 1) {
      hold = true; g.flags.held = true; g.quiet++;
      say('Klingon commander', 'You have one minute to leave Klingon space. We are counting.', 'klingon');
    } else say('Communications', 'No reply from the Klingons.');
  } else if (id === 'evade') {
    evading = true;
    events.push({ type: 'evade' });
    say('Helm', 'Evasive pattern Delta. Hold on.');
  } else if (id === 'warp') {
    if (g.hull < WARP_HULL) { g.flags.warpDown = true; say('Engineering', 'Warp drive is offline. We’re not going anywhere, Captain.', 'bad'); }
    else {
      if (!g.rewritten) volley(g, { parting: true, evading: false, shieldsDown: false }, events, say);
      if (g.hull <= 0) return destroyed(g, events, lines, say); // the parting volley can finish her before she jumps
      g.over = 'warp';
      events.push({ type: 'warp' });
      say('Helm', g.aboard ? `Warp 8 out of the Neutral Zone with ${g.aboard} of the Maru’s people aboard.` : 'Warp 8 out of the Neutral Zone.');
      if (!g.maru.gone && g.maru.aboard) {
        g.maru.gone = true; g.maru.lostTurn = g.turn;
        say('Communications', g.rewritten
          ? `We’re leaving the Maru adrift, with ${g.maru.aboard} still aboard.`
          : `The Maru is breaking up behind us, with ${g.maru.aboard} still aboard.`, 'bad');
      }
      return { events, lines };
    }
  } else if (id === 'surrender') {
    g.flags.surrendered = true;
    say('Communications', 'Offering our surrender on all frequencies.');
    say('Klingon commander', g.rewritten ? 'We have no quarrel with you today. Take your people.' : 'Klingons do not take prisoners from cowards.', 'klingon');
  } else if (id === 'abandon') {
    g.over = 'abandoned';
    events.push({ type: 'abandon' });
    say('Captain', 'All hands, abandon ship. Self-destruct in sixty seconds.');
    const k = targets()[0];
    if (k) { k.hull = 0; g.kills++; events.push({ type: 'boom', target: k.id }); }
    say('Tactical', `The lifeboats are away. The ship went up with ${k ? `the ${k.name} alongside her` : 'nobody aboard'}.`);
    say('Klingon commander', 'Bring the lifeboats in. They will answer for this on Qo’noS.', 'klingon');
    if (!g.maru.gone) { g.maru.gone = true; g.maru.lostTurn = g.turn; }
    return { events, lines };
  }

  if (!g.maru.gone && !g.rewritten) lifeSupport(g, LIFE_SUPPORT_NEAR, say);
  if (!hold && !g.rewritten) volley(g, { evading, shieldsDown }, events, say);
  if (shieldsDown && !hold && !g.rewritten) g.flags.beamedUnderFire++;
  if (g.hull <= 0) return destroyed(g, events, lines, say);
  if (g.hull < WARP_HULL && !g.flags.warpDown) { g.flags.warpDown = true; say('Engineering', 'We’ve lost the warp drive!', 'bad'); }

  // The Klingons go for the Maru from the second turn alongside. She can take three volleys.
  if (!g.maru.gone && clock(g) >= 2 && !hold && !g.rewritten) {
    g.maru.hull = Math.max(0, g.maru.hull - MARU_HIT);
    events.push({ type: 'fire-maru' });
    if (g.maru.hull === 0) {
      g.maru.gone = true; g.maru.lostTurn = g.turn;
      events.push({ type: 'maru-lost' });
      say('Tactical', g.maru.aboard ? `They’ve destroyed the Maru. ${g.maru.aboard} people were still aboard.` : 'They’ve destroyed the Maru. She was empty.', 'bad');
    } else say('Tactical', 'They’re firing on the Maru!', 'bad');
  }
  // And more keep coming.
  if (clock(g) % 2 === 0 && !hold && !g.rewritten) {
    const n = g.sent >= 9 ? 1 : 2;
    decloak(g, n, events);
    say('Tactical', n === 1 ? 'Another cruiser decloaking.' : 'Two more cruisers decloaking.', 'bad');
  }
  return { events, lines };
}

function destroyed(g, events, lines, say) {
  g.hull = 0; g.over = 'destroyed';
  events.push({ type: 'destroyed' });
  say('Computer', 'Warp core breach.', 'bad');
  if (!g.maru.gone) { g.maru.gone = true; g.maru.lostTurn = g.turn; }
  return { events, lines };
}

function decloak(g, n, events) {
  for (let i = 0; i < n; i++) {
    const k = { id: `k${g.sent}`, name: NAMES[g.sent % NAMES.length], hull: 100, slot: g.sent };
    g.klingons.push(k); g.sent++;
    events.push({ type: 'decloak', target: k.id });
  }
}

function fireFirst(g) {
  if (!g.flags.klingonsFired && !g.flags.playerFired) g.flags.firedFirst = true;
  g.flags.playerFired = true;
}

function hit(g, k, dmg, type, events, say) {
  if (!k) return;
  k.hull = Math.max(0, k.hull - dmg);
  events.push({ type, target: k.id });
  if (k.hull === 0) {
    g.kills++;
    events.push({ type: 'boom', target: k.id });
    say('Tactical', `Direct hit. The ${k.name} is destroyed.`, 'good');
  } else say('Tactical', `${type === 'torpedo' ? 'Torpedo hit' : 'Phasers hit'} the ${k.name}. Her shields are at ${k.hull}%.`);
}

function lifeSupport(g, n, say) {
  if (g.maru.gone || !g.maru.aboard) return;
  const lost = Math.min(n, g.maru.aboard);
  g.maru.aboard -= lost; g.lifeSupportLost += lost;
  if (g.where === 'outside') say('Kobayashi Maru', `Life support is failing. We’ve lost ${g.lifeSupportLost}. ${g.maru.aboard} of us left.`, 'bad');
}

// Every cruiser fires. Shields take most of it while they're up; dropped shields put it all on the hull.
function volley(g, { evading, shieldsDown, parting }, events, say) {
  const ks = alive(g);
  if (!ks.length) return;
  g.flags.klingonsFired = true;
  const ramp = 1 + 0.12 * (clock(g) - 1);
  let dmg = 0;
  for (const k of ks) { dmg += FIRE * ramp * (0.85 + g.rand() * 0.3); events.push({ type: 'kfire', from: k.id }); }
  if (evading) dmg *= 0.5;
  if (parting) dmg *= 0.5;
  dmg = Math.round(dmg);
  const hullBefore = g.hull, shieldsBefore = g.shields;
  if (shieldsDown || g.shields <= 0) g.hull -= dmg;
  else {
    let toShields = dmg * 0.85, toHull = dmg * 0.15;
    if (toShields > g.shields) { toHull += toShields - g.shields; toShields = g.shields; }
    g.shields = Math.round(g.shields - toShields);
    g.hull -= Math.round(toHull);
  }
  g.hull = Math.max(0, g.hull);
  const lost = hullBefore - g.hull;
  const sh = shieldsBefore - g.shields;
  if (g.hull > 0) say('Tactical', `${ks.length === 1 ? 'The cruiser fires' : `All ${ks.length} cruisers fire`}${shieldsDown ? ' with our shields down' : ''}. ${sh ? `Shields at ${g.shields}%, hull` : 'Hull'} at ${g.hull}%${lost >= 20 ? `. Casualties on decks ${Math.round(4 + g.rand() * 8)} through ${Math.round(13 + g.rand() * 8)}` : ''}.`, 'bad');
}

// ---------- The evaluation ----------

// Every way the simulation can end, by the title evaluate() gives it. The briefing counts how many a cadet has seen.
export const ENDINGS = ['By the book', 'Turned back', 'The lifeboat', 'Last off the ship', 'Held the line', 'Died trying', 'Went down fighting', 'The war you started', 'Changed the rules'];
// The four things every run is graded on. (A reprogrammed run adds Honesty, which is only ever an F.)
export const GRADED = ['Compassion', 'Judgment', 'Restraint', 'Nerve'];
// The best letter the simulation lets anyone earn, for a grade where that is below an A. Too many lives are lost in
// every run for Judgment to reach one: test/maru.test.mjs searches every way a game can go and holds it to this. The
// evaluation says so beside a grade that reaches it. (Compassion can reach an A, but only by losing your ship.)
export const CEILING = { Judgment: 'B' };

// A cadet's standing record, from what the page has saved: the endings seen (in ENDINGS' order), the best letter
// earned for each grade, and how many runs have been taken. The page lists only its last 30 runs, so `seen`, `best`
// and `taken` are kept beside them; a save from before they were kept is filled in from its runs. Anything in the
// save that isn't an ending or a letter is ignored.
export function transcript(saved = {}) {
  const runs = Array.isArray(saved.runs) ? saved.runs.filter(r => r && typeof r === 'object') : [];
  const seen = new Set(Array.isArray(saved.seen) ? saved.seen : []);
  const best = {};
  const earn = (name, l) => { if (GRADED.includes(name) && ['A', 'B', 'C', 'D', 'F'].includes(l) && (!best[name] || l < best[name])) best[name] = l; };
  if (saved.best && typeof saved.best === 'object') for (const name of GRADED) earn(name, saved.best[name]);
  for (const r of runs) {
    seen.add(r.title);
    for (const x of Array.isArray(r.grades) ? r.grades : []) if (x && typeof x === 'object') earn(x.name, x.letter);
  }
  const taken = Math.max(Number.isInteger(saved.taken) && saved.taken > 0 ? saved.taken : 0, runs.length);
  return { seen: ENDINGS.filter(t => seen.has(t)), best, taken };
}

// What a run added to the record: `before` is the record as it stood when the run ended (transcript() of the save
// before this run went on it) and `e` its evaluation. A new ending is one not seen before, and `endingsSeen` counts
// it. `better` names the grades whose letter beat the best on record. A first run has no record to beat, so it only
// ever has a new ending; and Honesty, which is only ever an F, is never a best.
export function runFirsts(before = {}, e) {
  const seen = new Set((Array.isArray(before.seen) ? before.seen : []).filter(t => ENDINGS.includes(t)));
  const newEnding = ENDINGS.includes(e.title) && !seen.has(e.title);
  const best = before.best && typeof before.best === 'object' ? before.best : {};
  const better = e.grades.filter(x => GRADED.includes(x.name) && best[x.name] && x.letter < best[x.name]).map(x => x.name);
  return { newEnding, endingsSeen: seen.size + (newEnding ? 1 : 0), better };
}

// The line under the examiner's notes. The test has no winning answer; the one cadet who wrote one in is told what
// that left unanswered. (It used to say "has no winning answer" straight under "You are the only cadet to beat it".)
export const moral = e => (e.outcome === 'rewritten'
  ? 'The Kobayashi Maru had no winning answer until you wrote one in. The examiners still haven’t seen how you face losing.'
  : 'The Kobayashi Maru has no winning answer. It shows the examiners how you face one.');

// How rare a run's ending is, from the examiners' archive (js/archive.js, written by tools/archive.mjs): how often the
// simulator ends this way when it is given orders at random. Said as a share of trials, never as a judgment of the
// run. The reprogrammed simulator is not the one in the archive, so its runs get nothing; nor does an ending the
// archive never saw.
const often = share => (share >= 0.5 ? `About ${Math.round(share * 10)} in 10 end` : `About 1 in ${Math.round(1 / share)} ends`);
export function archiveLine(g, e) {
  const { trials, endings } = ARCHIVE.maru;
  const n = endings[e.title];
  if (g.rewritten || !n || !trials) return '';
  return `${often(n / trials)} this way, of ${trials.toLocaleString('en-US')} trials the simulator ran with orders given at random.`;
}

// One line at the head of the briefing for a cadet who has been here before, from the standing record (transcript()).
// A first attempt gets none: the briefing reads as it always has.
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
export function briefingLine(record = {}) {
  const taken = Number.isInteger(record.taken) && record.taken > 0 ? record.taken : 0;
  const seen = Array.isArray(record.seen) ? record.seen : [];
  if (!taken) return '';
  if (ENDINGS.every(t => seen.includes(t))) return 'You have seen every way this ends, cadet. The board has nothing left to show you. The chair is yours all the same.';
  if (seen.includes('Changed the rules')) return 'The simulator’s code has been restored. The board would like a word afterwards.';
  if (taken === 1) return 'Second attempt, cadet. The scenario has not changed.';
  if (taken === 2) return 'Third attempt. The board notes your persistence.';
  return `${taken < ORDINALS.length ? `${ORDINALS[taken]} attempt` : `Attempt ${taken + 1}`}, cadet. The scenario has not changed.`;
}

const letter = s => (s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F');
const clamp = s => Math.max(0, Math.min(100, Math.round(s)));
const people = n => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;

export function evaluate(g) {
  const f = g.flags;
  // Who is alive at the end, and where.
  const crew = CREW - crewLost(g);
  const maruSaved = g.over === 'warp' || g.over === 'abandoned' ? g.aboard : 0;
  const prisoners = g.over === 'abandoned';
  const maruLost = MARU - maruSaved;
  const zoneTurns = g.zoneTurn;
  const afterMaru = g.maru.lostTurn && g.where === 'zone' ? g.turn - g.maru.lostTurn : 0;

  // The reprogrammed simulator only beats the test for the cadet who brings every one of the Maru's people over
  // without firing a shot. Any other reprogrammed run is graded like a normal one, with the cheating on top.
  const honesty = { name: 'Honesty', letter: 'F', why: 'You reprogrammed the simulator the night before.' };
  if (g.rewritten && g.over === 'warp' && g.aboard === MARU && !f.playerFired) {
    return {
      title: 'Changed the rules', outcome: 'rewritten',
      summary: `Everyone came home: all ${CREW} of your crew and all ${MARU} from the Maru.`,
      numbers: { crew, maruSaved, maruLost, prisoners },
      grades: [
        { name: 'Compassion', letter: 'A', why: 'Nobody was left behind.' },
        { name: 'Judgment', letter: 'A', why: 'A perfect result, for a simulation that allows none.' },
        { name: 'Restraint', letter: 'A', why: 'Not a shot fired.' },
        honesty,
      ],
      note: [
        'You are the only cadet to beat the Kobayashi Maru. You did it by changing the conditions of the test.',
        'The board has awarded a commendation for original thinking, and noted that you don’t believe in a no-win scenario.',
        'You also didn’t learn what the test was for. One day you will face a situation you can’t talk, fight or program your way out of.',
      ],
    };
  }

  let title, summary;
  if (g.over === 'stayed') { title = 'By the book'; summary = `You kept the treaty and your crew. The Maru’s ${MARU} died waiting.`; }
  else if (g.over === 'warp' && g.aboard) {
    title = 'The lifeboat';
    // Only the reprogrammed simulator lets anyone bring all of them over.
    summary = maruLost ? `You brought ${people(g.aboard)} home from the Maru. ${maruLost} were lost${crew < CREW ? `, and ${CREW - crew} of your crew` : ''}.` : `You brought all ${MARU} of the Maru’s people home.`;
  }
  else if (g.over === 'warp') { title = 'Turned back'; summary = `You went in and came out with nobody. The Maru’s ${MARU} were lost${crew < CREW ? `, and ${CREW - crew} of your crew` : ''}.`; }
  else if (g.over === 'abandoned') { title = 'Last off the ship'; summary = maruSaved ? `${crew} of your crew and ${maruSaved} from the Maru are alive, as prisoners of the Klingon Empire.` : `${crew} of your crew are alive, as prisoners of the Klingon Empire. Nobody from the Maru is with them.`; }
  else if (f.firedFirst && !f.hailedKlingons) { title = 'The war you started'; summary = `Your ship and all ${CREW} aboard were lost${g.aboard ? `, with ${g.aboard} you’d saved from the Maru` : ''}. The Maru’s ${MARU} were lost.`; }
  else if (g.beamedEver) { title = 'Died trying'; summary = `Your ship was destroyed with all ${CREW} aboard and the ${g.aboard} you’d brought over. The Maru’s ${MARU} were lost.`; }
  else if (g.kills >= 3) { title = 'Went down fighting'; summary = `You destroyed ${g.kills} cruisers before they destroyed you. All ${CREW} of your crew and the Maru’s ${MARU} were lost.`; }
  else { title = 'Held the line'; summary = `Your ship and all ${CREW} aboard were lost, and the Maru’s ${MARU} with her.`; }

  const went = g.where === 'zone';
  const compassion = !went ? (f.hailedMaru ? 25 : 10) : 45 + 55 * g.beamedEver / MARU + (g.beamedEver ? 0 : Math.min(15, zoneTurns * 4));
  const kept = (crew + maruSaved) / (CREW + MARU);
  let judgment = 100 * kept;
  if (g.over === 'warp') judgment += 8;
  if (g.over === 'destroyed' && !g.beamedEver) judgment -= 10;
  if (afterMaru > 1 && g.over === 'destroyed') judgment -= 5 * afterMaru;
  if (f.hailedMaru) judgment += 5;
  if (f.scanned) judgment += 5;
  let restraint = 70;
  if (went) restraint -= 10;
  if (f.hailedKlingons && !f.firedFirst) restraint += 15;
  if (f.calledStarfleet) restraint += 10;
  if (f.firedFirst) restraint -= 40;
  // Fired first, but only after hailing them: with Starfleet called too, that is a D, not the F of opening fire
  // unasked. (No run could earn a D before: firing first was an F, and anything else a C or better.)
  if (f.firedFirst && f.talkedFirst) restraint += 10;
  if (f.surrendered) restraint += 5;
  if (went && !f.playerFired) restraint += 10;
  if (!went) restraint = 95;
  let nerve = !went ? 30 : 45 + 9 * Math.min(zoneTurns, 5);
  if (g.over === 'warp' && zoneTurns <= 1 && !g.beamedEver) nerve -= 30;
  if (g.over === 'destroyed' || g.over === 'abandoned') nerve += 10;
  if (f.surrendered && g.over !== 'destroyed') nerve -= 10;

  // Each why-line says the best thing about the run. `but` is what cost the most, where the line doesn't already
  // say it: it is added when the letter is below an A, so a B beside "You never fired a shot" explains itself.
  const turns = `${zoneTurns} ${zoneTurns === 1 ? 'turn' : 'turns'}`;
  const judgmentBut = afterMaru > 1 && g.over === 'destroyed' ? `and you stayed ${afterMaru} turns after the Maru was gone`
    : g.over === 'destroyed' && !g.beamedEver ? 'and you lost the ship without bringing anyone across' : '';
  const nerveBut = !went ? ''
    : g.over === 'warp' ? `${f.klingonsFired ? '' : 'but you left '}${zoneTurns <= 1 && !g.beamedEver ? 'before you had tried anything' : f.surrendered ? 'after offering to surrender' : 'sooner than the board likes'}`
    : g.over === 'abandoned' ? (f.surrendered ? 'after offering to surrender' : `but you gave her up after only ${turns}`)
    : 'but the end came quickly';
  const grades = [
    { name: 'Compassion', score: clamp(compassion), why: !went ? 'You never went to them.' : g.beamedEver ? `You brought ${people(g.beamedEver)} off the Maru${g.over === 'destroyed' ? ', though they died with your ship' : ''}.` : 'You went in, but nobody came off the Maru.',
      but: went && g.beamedEver ? `${g.over === 'destroyed' ? 'and' : 'but'} ${MARU - g.beamedEver} never left her` : '' },
    { name: 'Judgment', score: clamp(judgment), why: `${Math.round(kept * 100)}% of the ${(CREW + MARU).toLocaleString('en-US')} lives in your hands came through${prisoners ? ', as prisoners' : ''}.`, but: judgmentBut },
    { name: 'Restraint', score: clamp(restraint), why: !went ? 'You never broke the treaty.' : f.firedFirst ? (f.talkedFirst ? 'You hailed them, then fired the first shot.' : 'You fired the first shot.') : f.hailedKlingons ? 'You talked before you shot.' : f.playerFired ? 'You fired only after they did.' : 'You never fired a shot.',
      but: went && !f.firedFirst ? 'but you broke the treaty to be there' : '' },
    { name: 'Nerve', score: clamp(nerve), why: !went ? 'You decided from a safe distance.' : g.over === 'warp' ? (f.klingonsFired ? `You held for ${turns} under their guns, then ran.` : `You stayed ${turns} alongside the Maru, and nobody fired.`) : g.over === 'abandoned' ? 'You were the last off the ship.' : `You held your post for ${turns}, to the end.`, but: nerveBut },
  ].map(({ but, ...x }) => {
    const l = letter(x.score);
    return { ...x, letter: l, why: l !== 'A' && but ? `${x.why.slice(0, -1)}, ${but}.` : x.why, ...(CEILING[x.name] === l && !g.rewritten ? { ceiling: true } : {}) };
  });
  if (g.rewritten) grades.push(honesty);

  const note = [];
  note.push(f.hailedMaru ? 'You spoke to the Maru before you decided.' : went ? 'You never spoke to the Maru, so you never knew whether the call was a trap.' : 'You never even answered the Maru.');
  if (f.calledStarfleet) note.push('Starfleet left it to you, as it always will.');
  if (went) note.push(`Crossing the line broke the treaty. The simulator answered with ${g.sent} cruisers${g.kills ? `, and you destroyed ${g.kills}` : ''}.`);
  if (f.firedFirst) note.push('Your phasers opened the battle. To the Klingons, that was the Federation declaring war.');
  else if (f.held) note.push('Talking first bought you one quiet turn.');
  if (f.beamedUnderFire) note.push(`You dropped your shields ${f.beamedUnderFire === 1 ? 'once' : f.beamedUnderFire === 2 ? 'twice' : `${f.beamedUnderFire} times`} to bring people across, and your own crew paid for it. That trade is the test.`);
  if (f.surrendered) note.push(g.rewritten ? 'You offered to surrender to ships you had told not to fire.' : 'You offered to surrender. In this simulation the Klingons never accept.');
  if (afterMaru > 1 && g.over === 'destroyed') note.push(`You stayed ${afterMaru} turns after the Maru was gone, with nothing left to save.`);
  if (g.over === 'stayed') note.push('Some captains would call it the only sane choice. The board wants to know if you could live with it.');
  if (g.over === 'warp' && !g.rewritten && ARCHIVE.maru.mostHome && g.aboard >= ARCHIVE.maru.mostHome) note.push(`Nobody has brought more than ${ARCHIVE.maru.mostHome} home.`);

  return { title, outcome: g.over, summary, numbers: { crew, maruSaved, maruLost, prisoners }, grades, note };
}
