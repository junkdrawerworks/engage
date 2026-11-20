// The shipyard's rules: no drawing and no page, so they can be tested on their own. Pick a hull, split her mass
// between engines, science and defence, and she gets a top warp, a cruising warp, a crew, how far her sensors reach
// and how well she can stand a fight. Designs are kept and named; they are ships of your own, not the one you command
// (that one's name is in Bridge settings). Each day Starfleet sends one requisition, the same for every officer, that
// a design can fill. The hulls are the game's own types; each is said to be like a real class for scale, and those
// figures are Memory Alpha's (read 20 November 2026): the Oberth class's standard crew of 80, the Defiant's about 50
// and warp 9.5, the Nova class's 78 and warp 8 at most, the Constitution class's 430 in Kirk's day with warp 6 to
// cruise and warp 8 in an emergency, the Intrepid class's about 150 and warp 9.975 to cruise, and the Galaxy class's
// complement of 1,000 to 6,000 with warp 9.6 for a few hours. How mass turns into speed, crew, sensors and defence is
// the game's. Pure; checked by test/shipyard.test.mjs.
import { warpSpeed } from './physics.js';
import { DESTINATIONS } from './destinations.js';
import { cleanName, cleanRegistry } from './myship.js';

export const TOP = 9.975; // Voyager's top cruising speed: no design goes faster
export const MIN_SHARE = 10; // each part of the mass gets at least this much, in %
export const STEP = 5;

// `top` is her top warp with 40% of her mass in engines; `crew`, `sensors` (light years) and `armour` are for 30% in
// science and 30% in defence. `like` is the real class she is like, for scale.
export const HULLS = [
  { id: 'scout', name: 'Scout', top: 8.6, crew: 70, sensors: 10, armour: 30, mass: 120,
    like: 'About an Oberth-class scout: a standard crew of 80.' },
  { id: 'escort', name: 'Escort', top: 9.3, crew: 45, sensors: 5, armour: 90, mass: 300,
    like: 'About the Defiant: some 50 aboard and warp 9.5, armed far beyond her size.' },
  { id: 'science', name: 'Science vessel', top: 7.8, crew: 75, sensors: 18, armour: 25, mass: 250,
    like: 'About a Nova-class science vessel: a crew of 78 and warp 8 at most.' },
  { id: 'cruiser', name: 'Heavy cruiser', top: 8.0, crew: 420, sensors: 12, armour: 70, mass: 1000,
    like: 'About the Constitution class of Kirk’s day: 430 aboard, warp 6 to cruise and warp 8 in an emergency.' },
  { id: 'explorer', name: 'Long-range explorer', top: 9.6, crew: 150, sensors: 15, armour: 50, mass: 700,
    like: 'About the Intrepid class, Voyager’s: some 150 aboard, and warp 9.975 to cruise.' },
  { id: 'flagship', name: 'Explorer flagship', top: 9.5, crew: 1000, sensors: 20, armour: 85, mass: 4500,
    like: 'About the Galaxy class: a thousand aboard or more, and warp 9.6 for a few hours.' },
];
export const hullById = id => HULLS.find(h => h.id === id) || null;

// The warp factor for a speed in multiples of light: the warp scale's own curve, run backward.
export function warpOf(c) {
  if (!(c > 1)) return 1;
  let lo = 1, hi = 9.99;
  if (c >= warpSpeed(hi)) return hi;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (warpSpeed(mid) < c) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const round5 = x => Math.max(5, Math.round(x / 5) * 5);
const tenth = w => Math.floor(w * 10 + 1e-9) / 10;

// What a design comes to: { top, cruise (warp factors, to the tenth below, 9.975 at most), crew, sensors (light
// years), defence (0 to 100), mass (kilotonnes) }. Cruising is a third of her top speed.
export function stats(d) {
  const h = hullById(d.hull);
  if (!h) return null;
  const { e, s } = d, def = 100 - e - s;
  const topC = warpSpeed(h.top) * (e / 40) ** 1.6;
  const top = Math.min(TOP, warpOf(topC));
  const cruise = Math.min(TOP, warpOf(Math.min(topC, warpSpeed(TOP)) / 3));
  return {
    top: top >= TOP ? TOP : tenth(top), cruise: tenth(Math.max(1, cruise)),
    crew: round5(h.crew * (0.7 + s / 100 * 0.6 + def / 100 * 0.3)),
    sensors: Math.max(1, Math.round(h.sensors * (s / 30) ** 1.2)),
    defence: Math.min(100, Math.round(h.armour * (def / 30) ** 0.8)),
    mass: h.mass,
  };
}
export const warpSaid = w => `warp ${String(w)}`;

// The split, kept whole: each part a multiple of five, at least ten, and the three adding to 100. Moving one part
// takes the difference from the other two in proportion (or gives it back), as far as their floors allow.
export function split(e, s) {
  const clamp = x => Math.min(100 - 2 * MIN_SHARE, Math.max(MIN_SHARE, Math.round(x / STEP) * STEP));
  e = clamp(e); s = clamp(s);
  if (e + s > 100 - MIN_SHARE) s = 100 - MIN_SHARE - e;
  return { e, s, d: 100 - e - s };
}
export function rebalance(cur, key, value) {
  const parts = { e: cur.e, s: cur.s, d: 100 - cur.e - cur.s };
  const v = Math.min(100 - 2 * MIN_SHARE, Math.max(MIN_SHARE, Math.round(value / STEP) * STEP));
  const others = ['e', 's', 'd'].filter(k => k !== key);
  let left = 100 - v;
  const [a, b] = others;
  const was = parts[a] + parts[b];
  let na = was > 0 ? Math.round(left * parts[a] / was / STEP) * STEP : left / 2;
  na = Math.min(left - MIN_SHARE, Math.max(MIN_SHARE, na));
  const next = { ...parts, [key]: v, [a]: na, [b]: left - na };
  return { e: next.e, s: next.s, d: next.d };
}

// A design as kept: { id, name, registry, hull, e, s, at, req? } tidied, or null when it isn't one.
export function tidyDesign(x) {
  if (!x || typeof x !== 'object' || !hullById(x.hull)) return null;
  const name = cleanName(x.name);
  if (!name) return null;
  const { e, s } = split(Number(x.e), Number(x.s));
  if (Number(x.e) !== e || Number(x.s) !== s) return null;
  return {
    id: typeof x.id === 'string' && /^[\w-]{1,24}$/.test(x.id) ? x.id : `d${Date.now().toString(36)}`,
    name, registry: cleanRegistry(x.registry), hull: x.hull, e, s,
    at: typeof x.at === 'string' ? x.at : '',
    ...(typeof x.req === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.req) ? { req: x.req } : {}),
  };
}

// A design in a link (shipyard.html#ship=… and the warp scale's &ship=yard:…): "1", the hull, the engines and
// science shares, the registry and the name, joined by dots, the name written for an address. These links keep
// working: a later shipyard reads "1." the same way.
export function encodeDesign(d) {
  return ['1', d.hull, d.e, d.s, d.registry || '', encodeURIComponent(d.name).replace(/\./g, '%2E')].join('.');
}
export function decodeDesign(code) {
  const [v, hull, e, s, registry, ...rest] = String(code || '').split('.');
  if (v !== '1' || rest.length !== 1) return null;
  let name = '';
  try { name = decodeURIComponent(rest[0]); } catch { return null; }
  return tidyDesign({ id: 'link', hull, e: Number(e), s: Number(s), registry, name });
}

// A name for a new design, from Starfleet's habit of naming ships for virtues, explorers and places.
export const NAMES = ['Resolute', 'Endurance', 'Meridian', 'Kestrel', 'Ardent', 'Tenacity', 'Halley', 'Cassini', 'Magellan', 'Vespucci', 'Shackleton', 'Bellerophon',
  'Wayfarer', 'Lodestar', 'Constance', 'Perseverance', 'Bonaventure', 'Mariner', 'Kepler', 'Tereshkova', 'Galilei', 'Amundsen', 'Fortitude', 'Clarion'];
export function suggestName(taken = [], rand = Math.random) {
  const free = NAMES.filter(n => !taken.includes(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(rand() * pool.length)];
}
export const newRegistry = (rand = Math.random) => `NCC-${80000 + Math.floor(rand() * 19999)}`;

// ---------- Starfleet's requisition of the day ----------

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
const PLACES = DESTINATIONS.filter(d => d.star !== 'Sol').map(d => d.title.replace(/^The /, 'the '));
// What each kind of requisition asks for, and the bars it may set.
const KINDS = [
  { id: 'survey', says: p => `A ship to survey the stars round ${p}.`, needs: { cruise: [6, 7, 7.5], sensors: [12, 15, 18, 22] } },
  { id: 'patrol', says: () => 'A ship to patrol the Neutral Zone.', needs: { defence: [70, 80, 90], cruise: [5, 6, 7] } },
  { id: 'colony', says: p => `A ship to carry colonists to ${p}.`, needs: { crew: [200, 300, 450, 700], cruise: [5, 6, 6.5] } },
  { id: 'courier', says: p => `A fast courier to ${p}.`, needs: { top: [9.3, 9.5, 9.7, 9.9] } },
  { id: 'deep', says: () => 'A ship for five years in deep space, far from any starbase.', needs: { cruise: [6.5, 7, 7.5], crew: [120, 150, 250], sensors: [10, 14, 18] } },
  { id: 'escort', says: p => `An escort for a convoy to ${p}.`, needs: { defence: [60, 75, 85], top: [9, 9.3, 9.5] } },
];
export const NEEDS = {
  top: n => `top speed warp ${n} or better`,
  cruise: n => `cruising at warp ${n} or better`,
  crew: n => `room for ${n} aboard`,
  sensors: n => `sensors reaching ${n} light years`,
  defence: n => `defence ${n} or better`,
};

// Every design the shipyard can make, for checking a requisition can be filled, and not by just anything.
export const ALL = HULLS.flatMap(h => {
  const out = [];
  for (let e = MIN_SHARE; e <= 100 - 2 * MIN_SHARE; e += STEP) for (let s = MIN_SHARE; e + s <= 100 - MIN_SHARE; s += STEP) out.push({ hull: h.id, e, s });
  return out;
});
export const meets = (st, needs) => !!st && Object.entries(needs).every(([k, n]) => st[k] >= n);

// The requisition for `day` (YYYY-MM-DD): { day, kind, says, needs: { what: bar }, asks (in words) }. Each can be
// met by some design, and by no more than about a third of them, so it needs thought but never luck.
export function requisition(day) {
  for (let k = 0; ; k++) {
    let h = hash(`shipyard:${day}:${k}`);
    const take = n => { const x = h % n; h = Math.floor(h / n) || hash(`${day}:${k}:${n}`); return x; };
    const kind = KINDS[take(KINDS.length)];
    const place = PLACES[take(PLACES.length)];
    const needs = {};
    for (const [what, bars] of Object.entries(kind.needs)) needs[what] = bars[take(bars.length)];
    const share = ALL.filter(d => meets(stats(d), needs)).length / ALL.length;
    if ((share > 0 && share <= 0.35) || k > 40) {
      return { day, kind: kind.id, says: kind.says(place), needs, asks: Object.entries(needs).map(([w, n]) => NEEDS[w](n)) };
    }
  }
}

// How far a design falls short of a requisition, in words: [] when she meets it.
export function shortOf(st, needs) {
  return Object.entries(needs).filter(([k, n]) => !(st[k] >= n)).map(([k, n]) => {
    if (k === 'top' || k === 'cruise') return `${k === 'top' ? 'top speed' : 'cruising'} warp ${st[k]}, not ${n}`;
    if (k === 'crew') return `room for ${st.crew}, not ${n}`;
    if (k === 'sensors') return `sensors reach ${st.sensors} light years, not ${n}`;
    return `defence ${st.defence}, not ${n}`;
  });
}

// ---------- The record ----------

// What the shipyard keeps under engage.shipyard.v1, read back tidily: { designs (newest last, at most 40), filled
// ({ day: design id }) }.
export const MAX_DESIGNS = 40;
export function tidyYard(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const designs = (Array.isArray(o.designs) ? o.designs : []).map(tidyDesign).filter(Boolean);
  const seen = new Set();
  const unique = designs.filter(d => !seen.has(d.id) && seen.add(d.id)).slice(-MAX_DESIGNS);
  const filled = {};
  for (const [day, id] of Object.entries(o.filled && typeof o.filled === 'object' ? o.filled : {})) if (/^\d{4}-\d\d-\d\d$/.test(day) && typeof id === 'string') filled[day] = id;
  return { designs: unique, filled };
}
