// The long way home's rules. Stranded in the Delta Quadrant, 70,000 light years from Earth (Star Trek: Voyager,
// “Caretaker”), you choose a cruising warp each quarter-year and what to stop for. Speed is Engage's own warp scale
// (js/physics.js). The fuel is the budget: the ship's collectors scoop up enough deuterium while she flies to keep
// her going at warp 7.8 for ever, the speed at which the trip takes the 75 years the crew are told it will; faster
// burns it by the square of the speed, so flat out empties full tanks in about six weeks and the ship falls back
// to warp 7.8. A nebula on the way refills the tanks, and a world with air and water restocks the crew, each for a
// quarter's stop. Nothing is lost for good: the only score is how long it takes. Pure, checked by
// test/longway.test.mjs; js/longway-room.js draws it.
import { warpSpeed } from './physics.js';

export const START_LY = 70000;
export const SHOW_YEARS = 75;
export const QUARTER = 0.25; // years a turn
export const TOP_WARP = 9.975; // Voyager's top cruising speed, as the warp scale has it
export const SUSTAIN = START_LY / SHOW_YEARS; // c, about 933: warp 7.8
export const TANK = 100;
export const COLLECT = 4; // fuel a quarter the collectors take in while she flies
export const NEBULA_FUEL = 40;
export const SUPPLIES_USED = 2; // a quarter
export const SHORE_LEAVE = 40;
export const TIRED_WARP = 6; // with the stores empty, the crew can't run her harder than this

// The warp factor a speed (times light) is, on Engage's scale: the inverse of warpSpeed.
export function warpFor(c) {
  let lo = 0, hi = 9.99;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (warpSpeed(mid) < c) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const SUSTAIN_WARP = warpFor(SUSTAIN);

// Fuel burnt in a quarter at warp w, before what the collectors take in.
export const burn = w => (w > 0 ? COLLECT * (warpSpeed(w) / SUSTAIN) ** 2 : 0);

// What lies ahead this quarter, from the trip's seed: null, 'nebula' or 'world'.
export function ahead(seed, quarter) {
  let h = (seed ^ Math.imul(quarter + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  const r = h / 4294967296;
  return r < 0.16 ? 'nebula' : r < 0.26 ? 'world' : null;
}

export function newTrip(seed) {
  return { seed: seed >>> 0, quarter: 0, left: START_LY, fuel: TANK, supplies: 100, flown: 0, fastest: 0, stops: { nebula: 0, world: 0 }, home: null };
}

// One quarter: { warp } to fly, or { stop: 'nebula' | 'world' } to stop for what is ahead. Returns what happened, in
// plain values: { ly, warp (the warp flown on average), ran: 'dry' when the tanks ran out this quarter, tired, stopped }.
export function step(trip, { warp = 0, stop = null } = {}) {
  if (trip.home != null) return null;
  const here = ahead(trip.seed, trip.quarter);
  const out = { quarter: trip.quarter, ly: 0, warp: 0, ran: null, tired: false, stopped: null };
  trip.supplies = Math.max(0, trip.supplies - SUPPLIES_USED);
  if (stop && stop === here) {
    out.stopped = stop;
    trip.stops[stop]++;
    if (stop === 'nebula') trip.fuel = Math.min(TANK, trip.fuel + NEBULA_FUEL);
    else trip.supplies = Math.min(100, trip.supplies + SHORE_LEAVE);
    trip.quarter++;
    return out;
  }
  let w = Math.max(0, Math.min(TOP_WARP, warp));
  if (trip.supplies <= 0 && w > TIRED_WARP) { w = TIRED_WARP; out.tired = true; }
  // At warp w until the tanks are dry, then at the speed the collectors keep up with (or w, if that is slower).
  const net = burn(w) - COLLECT; // fuel a quarter
  let t = QUARTER; // years at w
  if (net > 0 && trip.fuel < net) { t = QUARTER * trip.fuel / net; if (trip.fuel > 0) out.ran = 'dry'; }
  const slow = Math.min(w, SUSTAIN_WARP);
  let ly = warpSpeed(w) * t + (w > 0 ? warpSpeed(slow) * (QUARTER - t) : 0);
  trip.fuel = net > 0 && t < QUARTER ? 0 : Math.min(TANK, trip.fuel - net * (w > 0 ? 1 : 0));
  let years = QUARTER;
  if (ly >= trip.left) { years = QUARTER * trip.left / ly; ly = trip.left; trip.home = (trip.quarter * QUARTER) + years; }
  trip.left -= ly;
  trip.flown += ly;
  out.ly = ly;
  out.warp = ly > 0 ? warpFor(ly / years) : 0;
  trip.fastest = Math.max(trip.fastest, out.warp);
  trip.quarter++;
  return out;
}

// Flying on at warp w until something needs a decision: something ahead to stop for, the tanks running dry, the
// stores getting low, or home. Returns the quarters flown.
export function cruise(trip, warp, most = 400) {
  const went = [];
  while (trip.home == null && went.length < most) {
    if (went.length && ahead(trip.seed, trip.quarter)) break;
    const r = step(trip, { warp });
    went.push(r);
    if (r.ran || (trip.supplies <= 20 && trip.supplies + SUPPLIES_USED > 20) || trip.supplies <= 0) break;
  }
  return went;
}

// "Year 3, quarter 2", by the ship's calendar from the day she was stranded.
export const whenSaid = q => `Year ${Math.floor(q / 4) + 1}, quarter ${q % 4 + 1}`;
export function yearsSaid(years) {
  const y = Math.floor(years + 1e-9), m = Math.round((years - y) * 12);
  const yy = m === 12 ? y + 1 : y, mm = m === 12 ? 0 : m;
  return [yy ? `${yy} year${yy === 1 ? '' : 's'}` : '', mm ? `${mm} month${mm === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'no time at all';
}

// How long full tanks last flat out, in weeks, before she falls back to warp 7.8.
export const weeksFlatOut = () => 52.18 * QUARTER * TANK / (burn(TOP_WARP) - COLLECT);

// The debrief: how long it took, against the 75 years of cruising at warp 7.8 and what flat out would be with
// endless fuel.
export function debrief(trip) {
  const flat = START_LY / warpSpeed(TOP_WARP);
  const stops = trip.stops.nebula + trip.stops.world;
  return [
    `Home in ${yearsSaid(trip.home)}, ${stops ? `with ${trip.stops.nebula} stop${trip.stops.nebula === 1 ? '' : 's'} for fuel and ${trip.stops.world} for shore leave` : 'without a stop'}.`,
    `Cruising at warp ${SUSTAIN_WARP.toFixed(1)}, the pace her collectors keep up with, the trip takes the ${SHOW_YEARS} years Voyager’s crew were told in “Caretaker”. Flat out at warp ${TOP_WARP} it would be ${yearsSaid(flat)}, if the fuel lasted; full tanks last about ${Math.round(weeksFlatOut())} weeks at that.`,
  ];
}

// The record kept under engage.longway.v1: { trip (the one under way, or null), best (years), homes }.
export function recordHome(saved, trip) {
  const was = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const best = Number.isFinite(was.best) && was.best > 0 ? Math.min(was.best, trip.home) : trip.home;
  return { ...was, trip: null, best, homes: (Number.isInteger(was.homes) && was.homes > 0 ? was.homes : 0) + 1 };
}
// A trip read back from the record, or null for anything that isn't one.
export function readTrip(saved) {
  const t = saved?.trip;
  if (!t || typeof t !== 'object') return null;
  const n = x => Number.isFinite(x);
  if (!n(t.seed) || !Number.isInteger(t.quarter) || !n(t.left) || !n(t.fuel) || !n(t.supplies) || t.home != null) return null;
  return { ...newTrip(t.seed), ...t, stops: { nebula: t.stops?.nebula | 0, world: t.stops?.world | 0 } };
}
