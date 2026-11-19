// Main engineering's rules: a warp core to keep steady through one shift while the bridge asks for one warp factor
// after another. Three flows: deuterium, antideuterium and coolant, each a fraction of the core's rated flow, where
// rated flow is the most each injector can give.
//
// Matter and antimatter annihilate mass for mass, so the core burns min(antimatter, deuterium); antimatter with no
// deuterium to meet strains the magnetic containment, and deuterium beyond one to one isn't burned but runs through
// the core and carries heat away as plasma. Coolant carries heat away too, but its pumps take power from what the
// core gives the warp coils. The core heats with what it burns, and above its rating it strains containment as well;
// strain that reaches the limit ejects the core and ends the shift. The deuterium tank holds only so much for a shift,
// so a rich mix isn't free.
//
// The energy is real arithmetic: a kilogram of antimatter meeting a kilogram of matter turns both into energy,
// E = mc² for 2 kg, about 1.8 × 10^17 joules. The rest (how big the core is, how much power each warp factor
// needs, how it heats) is a game's, not canon. Pure, checked by test/core.test.mjs; js/engineering.js draws it.

export const C = 299792458; // metres a second, exact by definition
export const MEGATON = 4.184e15; // joules in a megaton of TNT, by definition
export const PAIR_J = 2 * C * C; // joules from 1 kg of antimatter and 1 kg of matter: about 1.8e17

// The yardsticks a shift's burn is held against.
// Little Boy, the Hiroshima bomb: about 15 kilotons (Wikipedia, "Little Boy").
// Tsar Bomba, the largest bomb ever tested: 50 megatons (Wikipedia, "Tsar Bomba").
// The whole world's energy for a year: just over 600 exajoules in 2025 (Energy Institute, Statistical Review of World
// Energy 2026, total energy supply).
export const HIROSHIMA_J = 15e3 * 4.184e9;
export const TSAR_J = 50 * MEGATON;
export const WORLD_YEAR_J = 600e18;

export const RATED_KG_HOUR = 1; // the game's core: at full burn it annihilates 1 kg of antimatter an hour
export const ORDERS = 8; // a shift: eight orders from the bridge
export const ORDER_SECONDS = 12; // each held for 12 seconds of play, an hour of ship's time
export const HOURS_PER_SECOND = 1 / ORDER_SECONDS;
export const DEUT_TANK = 6; // hours of deuterium at full flow: enough for a shift at three quarters
export const PUMP = 0.1; // power the coolant pumps take at full flow
export const HOT = 1; // temperature (1 is the rating) above which the core runs hot
export const LIMIT = 1.25; // above which it strains containment
export const TOLERANCE = 0.2; // warp factors either side of the order that count as holding it
export const TAU = 1.5; // seconds for the core's temperature to settle
const HEAT = 1.6, BASE = 0.4, COOL = 2, RICH = 1.2, SPILL = 0.4, OVER = 0.3, RELAX = 0.15;

// The share of the core's power warp w needs: the square of the warp factor over ten. Warp 5 is a quarter, warp 8
// nearly two thirds, warp 9.5 nine tenths.
export const need = w => (w > 0 ? (w / 10) ** 2 : 0);
// The warp a share of the core's power holds: the inverse of need.
export const warpOf = p => (p > 0 ? 10 * Math.sqrt(p) : 0);

// The bridge's eight orders for a shift, from a seed: between warp 3 and 9.5 in half steps, each at least a warp and
// a half from the one before, so every order means moving the sliders.
export function orders(seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  while (out.length < ORDERS) {
    const w = 3 + Math.floor(rnd() * 14) / 2;
    if (out.length && Math.abs(w - out[out.length - 1]) < 1.5) continue;
    out.push(w);
  }
  return out;
}

export function newShift(seed) {
  return {
    seed: seed >>> 0, orders: orders(seed), t: 0, a: 0, d: 0, c: 0,
    temp: 0, strain: 0, deut: DEUT_TANK, kg: 0, onOrder: 0, hottest: 0, over: null,
  };
}

// Where the shift stands now, worked out from its flows: what the core burns, what it gives the coils, the warp
// that holds, and the order.
export function reading(s) {
  const d = s.deut > 0 ? s.d : 0;
  const burn = Math.min(s.a, d), spill = Math.max(0, s.a - d), rich = Math.max(0, d - s.a);
  const power = Math.max(0, burn - PUMP * s.c);
  const k = Math.min(ORDERS - 1, Math.floor(s.t / ORDER_SECONDS));
  const order = s.orders[k], warp = warpOf(power);
  return {
    burn, spill, rich, power, warp, order, k,
    settle: HEAT * burn / (BASE + COOL * s.c + RICH * rich), // the temperature the core is heading for
    holding: Math.abs(warp - order) <= TOLERANCE,
    ratio: s.a > 0 ? d / s.a : null, // deuterium to antimatter
  };
}

// The shift run on for dt seconds of play (in steps of at most a tenth of a second). Returns the shift.
export function run(s, dt) {
  while (dt > 1e-9 && !s.over) {
    const h = Math.min(dt, 0.1, ORDERS * ORDER_SECONDS - s.t);
    const r = reading(s);
    if (r.holding) s.onOrder += h;
    s.temp += (r.settle - s.temp) * (1 - Math.exp(-h / TAU));
    s.hottest = Math.max(s.hottest, s.temp);
    const strain = SPILL * r.spill + OVER * Math.max(0, s.temp - LIMIT);
    s.strain = Math.max(0, Math.min(1, s.strain + (strain > 0 ? strain : -RELAX) * h));
    s.deut = Math.max(0, s.deut - (s.deut > 0 ? s.d : 0) * h * HOURS_PER_SECOND);
    s.kg += r.burn * RATED_KG_HOUR * h * HOURS_PER_SECOND;
    s.t += h;
    dt -= h;
    if (s.strain >= 1) s.over = 'ejected';
    else if (s.t >= ORDERS * ORDER_SECONDS - 1e-9) s.over = 'done';
  }
  return s;
}

// The flows that hold warp w at a mix of `ratio` deuterium to each part antimatter: the least coolant that keeps
// the core at its rating, and enough antimatter to make up what the pumps take. What a careful engineer would set,
// and what the walk-through and the tests fly with. Null when the core can't hold it that way.
export function flowsFor(w, ratio = 1) {
  const p = need(w);
  for (let c = 0; c <= 1 + 1e-9; c += 0.01) {
    const a = p + PUMP * c, d = Math.min(1, a * ratio);
    if (a > 1) return null;
    if (d < a) continue;
    const settle = HEAT * a / (BASE + COOL * c + RICH * (d - a));
    if (settle <= HOT) return { a, d, c: Math.round(c * 100) / 100 };
  }
  return null;
}

// "1.8 kg", "640 g": antimatter, in grams under a kilogram.
export function massSaid(kg) {
  if (kg >= 1) return `${kg >= 10 ? Math.round(kg) : kg.toFixed(1)} kg`;
  const g = kg * 1000;
  return `${g >= 10 ? Math.round(g) : g.toFixed(1)} g`;
}
const big = n => (n >= 100 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? n.toFixed(0) : n.toFixed(1));

// What antimatter costs in energy, against the yardsticks: the energy of the antimatter and as much matter, in
// megatons, and how it compares with the Hiroshima bomb, the Tsar Bomba and the world's energy for a year.
export function yardsticks(kg) {
  const j = kg * PAIR_J, mt = j / MEGATON, hours = j / WORLD_YEAR_J * 365.25 * 24;
  return {
    joules: j, megatons: mt, hiroshimas: j / HIROSHIMA_J, tsars: j / TSAR_J, worldHours: hours,
    lines: [
      `${big(mt)} megaton${big(mt) === '1.0' ? '' : 's'} of TNT`,
      `${big(j / HIROSHIMA_J)} times the Hiroshima bomb`,
      `${big(j / TSAR_J)} times the Tsar Bomba, the largest bomb ever set off`,
      hours >= 24 ? `${big(hours / 24)} days of all the energy the world uses` : `${big(hours)} hours of all the energy the world uses`,
    ],
  };
}

// What a warp factor costs this core in an hour: its antimatter, and as much deuterium, and the energy.
export function costOf(w) {
  const kg = need(w) * RATED_KG_HOUR;
  return { kg, megatons: kg * PAIR_J / MEGATON };
}

// The shift's grade, by the share of it the core held the bridge's order. An ejected core is an F.
export function grade(s) {
  const share = s.onOrder / (ORDERS * ORDER_SECONDS);
  if (s.over === 'ejected') return { share, letter: 'F' };
  return { share, letter: share >= 0.75 ? 'A' : share >= 0.6 ? 'B' : share >= 0.45 ? 'C' : share >= 0.3 ? 'D' : 'F' };
}

// The record kept under engage.engineering.v1: { shifts, best (share held), kg (antimatter over every shift),
// ejected }. Anything that isn't a record is read as none.
export function recordShift(saved, s) {
  const was = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const n = x => (Number.isFinite(x) && x > 0 ? x : 0);
  const { share } = grade(s);
  return {
    ...was,
    shifts: (Number.isInteger(was.shifts) && was.shifts > 0 ? was.shifts : 0) + 1,
    best: s.over === 'ejected' ? n(was.best) : Math.max(n(was.best), share),
    kg: n(was.kg) + s.kg,
    ejected: (Number.isInteger(was.ejected) && was.ejected > 0 ? was.ejected : 0) + (s.over === 'ejected' ? 1 : 0),
  };
}
