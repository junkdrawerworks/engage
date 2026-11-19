// The distress call's rules: which stars a call can come from, what the survivors can see of their own sky, the air
// they have, and how a call ends. Every clue is worked out from the catalogue, never written by hand: the colour of
// their sun from its own colour, the brightest star in their night and how our Sun looks from there by the log's own
// sums (js/log.js), and the constellation our Sun sits in by the IAU's boundaries. Pure, checked by
// test/distress.test.mjs; js/distress.js draws it.
import { apparentMag, LY_PER_PC, SUN_ABSMAG } from './physics.js';
import { skyFrom, titleFor } from './log.js';

// A call comes from a star you could pick out of Earth's sky by eye from a suburb, close enough that our Sun is
// still to be seen from there (it fades past magnitude 6 at about 60 light years).
export const REACH_LY = 60;
export const EYE_MAG = 4.5;
// Air, in hundredths of what they had when the call came in: it runs down as you look, and cleaning up the signal or
// locking on to the wrong star costs more.
export const AIR = { start: 100, perSecond: 0.4, clean: 15, wrong: 20 };
// How many clues the call opens with.
export const OPEN = 2;

const at = (cat, i) => [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]];
const lyOf = (cat, i) => Math.hypot(...at(cat, i)) * LY_PER_PC;
export const earthMag = (cat, i) => (i === 0 ? -26.7 : apparentMag(cat.absmag[i], Math.hypot(...at(cat, i))));

// A star's colour in words, from its own temperature: what the eye (or a survivor) would call it.
export function colourOf(temp) {
  if (temp > 10000) return 'blue-white';
  if (temp > 7300) return 'white';
  if (temp > 6000) return 'yellow-white';
  if (temp > 5200) return 'yellow';
  if (temp > 3800) return 'orange';
  return 'red';
}

// The stars a call can come from, by index. One to a system (the brightest of a pair as Earth sees it), and none whose
// brightest neighbour the charts put within 0.7 light years: that is the star's own companion measured apart, shining
// in its sky like a second moon (Capella's at magnitude −8, 0.6 light years off on the charts). And where two stars
// would give the very same clues (Dalim and τ¹ Eridani, side by side 46 light years out), only the brighter, so every
// call has one answer.
export function candidates(cat) {
  const out = [], seen = new Set();
  const near = [];
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i] || lyOf(cat, i) > REACH_LY || earthMag(cat, i) > EYE_MAG) continue;
    const sky = skyFrom(cat, i);
    if (sky.companions.some(j => earthMag(cat, j) < earthMag(cat, i))) continue;
    if (cat.distanceFrom(sky.brightest.star, at(cat, i)) * LY_PER_PC < 0.7) continue;
    near.push(i);
  }
  near.sort((a, b) => earthMag(cat, a) - earthMag(cat, b));
  for (const i of near) {
    const s = skyOf(cat, i), key = CLUE_ORDER.map(k => s[k]).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

// Everything the survivors could tell of their sky, as plain values: their sun's colour, the constellation our Sun
// sits in as Earth names the sky, how bright our Sun looks, the brightest star in their night (their own companions
// set aside, as the log does) and how long their signal has been on its way (the distance, in years of light).
export function skyOf(cat, i) {
  const p = at(cat, i), pc = Math.hypot(...p);
  const sky = skyFrom(cat, i);
  return {
    colour: colourOf(cat.temp[i]),
    sunIn: cat.constellationToward(p.map(v => -v / pc)),
    sunMag: Math.round(apparentMag(SUN_ABSMAG, pc) * 10) / 10,
    brightest: sky.brightest.star,
    brightestMag: Math.round(sky.brightest.mag * 10) / 10,
    years: Math.round(pc * LY_PER_PC),
  };
}

// The clues in the order the signal gives them up: two to start, one more for each clean-up.
export const CLUE_ORDER = ['colour', 'sunIn', 'sunMag', 'brightest', 'years'];
const mag = m => `${m < 0 ? '−' : ''}${Math.abs(m).toFixed(1)}`;
export function clueText(cat, id, s) {
  switch (id) {
    case 'colour': return `…our sun is ${s.colour === 'orange' ? 'an orange' : `a ${s.colour}`} star…`;
    case 'sunIn': return `…your Sun is a small star in what you call ${s.sunIn}…`;
    case 'sunMag': return `…your Sun shines at magnitude ${mag(s.sunMag)} here…`;
    case 'brightest': return `…the brightest star in our night is ${titleFor(cat, s.brightest)}, magnitude ${mag(s.brightestMag)}…`;
    case 'years': return `…this signal has been travelling ${s.years} years…`;
    default: return '';
  }
}

// A seeded pick, so a day's call is the same for everyone.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// The day's seed, from the calendar date where the captain is ("2026-11-19").
export function daySeed(day) {
  let h = 2166136261;
  for (const c of `distress:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// A new call: from a seeded star of `list` (the candidates), with the first clues open and all their air.
export function newCall(cat, list, seed, day = null) {
  const star = list[Math.floor(rng(seed)() * list.length)];
  return { star, seed, day, sky: skyOf(cat, star), open: OPEN, air: AIR.start, wrong: [], over: null };
}

// Air running down with the seconds; a call whose air is gone is lost.
export function breathe(call, seconds) {
  if (call.over || !(seconds > 0)) return call;
  call.air = Math.max(0, call.air - seconds * AIR.perSecond);
  if (call.air <= 0) call.over = 'lost';
  return call;
}

// Cleaning up the signal opens the next clue and costs air. Nothing happens once every clue is open.
export function clean(call) {
  if (call.over || call.open >= CLUE_ORDER.length) return false;
  call.open++;
  call.air = Math.max(0, call.air - AIR.clean);
  if (call.air <= 0) call.over = 'lost';
  return true;
}

// Locking on to star j: { right } for the survivors' star, otherwise { right: false, why } saying which open clue it
// fails, in words, and the air it cost.
export function lockOn(cat, call, j) {
  if (call.over) return { right: false, why: '' };
  if (j === call.star) { call.over = 'found'; return { right: true }; }
  call.wrong.push(j);
  call.air = Math.max(0, call.air - AIR.wrong);
  if (call.air <= 0) call.over = 'lost';
  return { right: false, why: whyNot(cat, call, j) };
}

// Why star j isn't them, by the first open clue it fails.
export function whyNot(cat, call, j) {
  const name = j === 0 ? 'the Sun' : titleFor(cat, j);
  if (j === 0) return 'That is our own Sun.';
  if (cat.unmeasured[j]) return `Not ${name}: nobody has measured how far it is, and they can see our Sun.`;
  const s = call.sky, t = skyOf(cat, j);
  for (const id of CLUE_ORDER.slice(0, call.open)) {
    if (id === 'colour' && t.colour !== s.colour) return `Not ${name}: its light is ${t.colour}, and theirs is ${s.colour}.`;
    if (id === 'sunIn' && t.sunIn !== s.sunIn) return `Not ${name}: from there our Sun would sit in ${t.sunIn}, not ${s.sunIn}.`;
    if (id === 'sunMag' && t.sunMag !== s.sunMag) {
      return t.years > REACH_LY
        ? `Not ${name}: it is ${t.years.toLocaleString('en-US')} light years out, and from there our Sun is far too faint to see.`
        : `Not ${name}: from there our Sun would be magnitude ${mag(t.sunMag)}, not ${mag(s.sunMag)}.`;
    }
    if (id === 'brightest' && t.brightest !== s.brightest) return `Not ${name}: from there the brightest star would be ${titleFor(cat, t.brightest)}.`;
    if (id === 'years' && t.years !== s.years) return `Not ${name}: it is ${t.years.toLocaleString('en-US')} light years out, and their signal is ${s.years} years old.`;
  }
  return `Not ${name}, though nothing they have said yet rules it out. Clean up the signal for more.`;
}

// How our Sun's magnitude says how far away they are: magnitude 2 from about 9 light years, 4 from 22, 6 from 56.
export const sunMagFrom = ly => apparentMag(SUN_ABSMAG, ly / LY_PER_PC);
export const lyForSunMag = m => 10 ** ((m - SUN_ABSMAG + 5) / 5) * LY_PER_PC;

// The sky from star i: every catalogued star (and our Sun) by direction and how bright it looks from there, brightest
// first, down to `limit` (our Sun always, however faint). Their own companions are left out: from that close they
// would be a second sun, not a star.
export function skyFromStar(cat, i, limit = 6) {
  const p = at(cat, i), mates = new Set(skyFrom(cat, i)?.companions || []);
  const out = [];
  for (let j = 0; j < cat.count; j++) {
    if (j === i || cat.unmeasured[j] || mates.has(j)) continue;
    const d = [cat.pos[j * 3] - p[0], cat.pos[j * 3 + 1] - p[1], cat.pos[j * 3 + 2] - p[2]], r = Math.hypot(...d);
    const m = j === 0 ? apparentMag(SUN_ABSMAG, r) : apparentMag(cat.absmag[j], r);
    if (m > limit && j !== 0) continue;
    out.push({ i: j, dir: d.map(v => v / r), mag: m });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

// The debrief, in two lines: what happened, and what their sky was like.
export function debrief(cat, call) {
  const name = titleFor(cat, call.star), s = call.sky;
  const ly = lyOf(cat, call.star);
  const away = `${ly < 9.95 ? ly.toFixed(1) : Math.round(ly)} light years out`;
  const clues = `${call.open} of ${CLUE_ORDER.length} clues`;
  const wrong = call.wrong.length ? `, ${call.wrong.length} wrong lock${call.wrong.length === 1 ? '' : 's'}` : '';
  const head = call.over === 'found'
    ? `Found: they were at ${name}, ${away}. A rescue ship is on its way, with ${Math.round(call.air)}% of their air left (${clues}${wrong}).`
    : `Their air ran out. They were at ${name}, ${away} (${clues}${wrong}).`;
  const sky = `From ${name} the brightest star in the night is ${titleFor(cat, s.brightest)}, and our Sun is a magnitude ${mag(s.sunMag)} star in ${s.sunIn}: every star has a sky of its own.`;
  return [head, sky];
}

// The record kept under engage.distress.v1: { answered, rescued, calls: [{ day, star, found, air, open, wrong, at }] },
// the counts over every call, the calls themselves newest last and only the latest 50. A day's call has that day;
// the rest have none.
export const KEEP = 50;
const count = x => (Number.isInteger(x) && x > 0 ? x : 0);
export function record(saved, call, name, now = new Date()) {
  const was = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const calls = Array.isArray(was.calls) ? was.calls.filter(c => c && typeof c === 'object') : [];
  const found = call.over === 'found';
  calls.push({ day: call.day, star: name, found, air: Math.round(call.air), open: call.open, wrong: call.wrong.length, at: now.toISOString() });
  return { ...was, answered: count(was.answered) + 1, rescued: count(was.rescued) + (found ? 1 : 0), calls: calls.slice(-KEEP) };
}
// The briefing's line on the record: "Rescued 3 of 4 calls. Today’s call: found at Procyon with 42% of their air
// left."
export function standing(saved, day) {
  const calls = Array.isArray(saved?.calls) ? saved.calls : [];
  const answered = count(saved?.answered);
  if (!answered) return '';
  const t = calls.find(c => c.day === day);
  const todays = t ? ` Today’s call: ${t.found ? `found at ${t.star} with ${t.air}% of their air left` : `lost, at ${t.star}`}.` : '';
  return `Rescued ${count(saved.rescued)} of ${answered} call${answered === 1 ? '' : 's'}.${todays}`;
}
