// What the captain's log can say about a star's life from the catalogue alone: where a planet would be as warm as
// Earth, how far a giant would reach in the Sun's place, and, for an ordinary star, roughly how heavy it is, how long
// it lasts and how it ends. Every figure is a rule of thumb, and the log says "about". Pure functions, checked by
// test/physics.test.mjs.
import { SUN_RADIUS_AU } from './physics.js';

// The planets' average distances from the Sun, in AU (NASA's planetary fact sheet).
export const ORBITS = [['Mercury', 0.387], ['Venus', 0.723], ['Earth', 1], ['Mars', 1.524], ['Jupiter', 5.204], ['Saturn', 9.582], ['Uranus', 19.2], ['Neptune', 30.05]];
const AGE_OF_UNIVERSE = 13.8e9;
// Stars born heavier than about eight Suns end in a supernova; lighter ones as white dwarfs. Smartt and others 2009,
// "The death of massive stars I" (MNRAS 395, 1409), put the lowest mass of a supernova's star at 8.5 (+1, -1.5) Suns.
export const SUPERNOVA_MASS = 8;

// How far from a star (AU) a planet gets the sunlight Earth does: sunlight falls off as the square of distance, so
// that is the square root of the star's brightness against the Sun's. `lum` is all its light, not just visible.
export const temperateAU = lum => Math.sqrt(lum);

const d = x => (x < 0.1 ? x.toPrecision(2) : x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString('en-US'));
const POSS = name => (name === 'Mercury' ? 'Mercury’s' : name === 'Venus' ? 'Venus’s' : `${name}’s`);

// "half as wide", "a third as wide", "45% as wide", "twice as wide", "3.7 times as wide".
const PARTS = [[0.1, 'a tenth'], [0.2, 'a fifth'], [0.25, 'a quarter'], [1 / 3, 'a third'], [0.5, 'half'], [2 / 3, 'two thirds'], [0.75, 'three quarters']];
function asWide(x) {
  if (x >= 0.95 && x < 1.05) return 'about as wide';
  if (x >= 1.05) return x < 1.95 || x >= 2.05 ? `${x < 10 ? x.toFixed(1) : Math.round(x)} times as wide` : 'twice as wide';
  const near = PARTS.find(([v]) => Math.abs(x / v - 1) < 0.1);
  return near ? `${near[1]} as wide` : `${x < 0.1 ? Number((x * 100).toPrecision(1)) : Math.round(x * 100)}% as wide`;
}

// The log's line for it. `radius` is the star's width against the Sun's.
// "A planet would get the sunlight Earth does about 3.9 AU out, where the star would look half as wide as the Sun does
// from Earth." Beside a planet's orbit, it says which.
export function temperateLine(lum, radius) {
  const au = temperateAU(lum);
  const near = ORBITS.find(([, a]) => au / a > 0.85 && au / a < 1.18);
  const where = near ? `, about where ${near[0]} is from the Sun`
    : au < ORBITS[0][1] ? ', closer than Mercury is to the Sun'
    : au > ORBITS[ORBITS.length - 1][1] ? ', farther out than Neptune is from the Sun' : '';
  // The disc's width from there against the Sun's from Earth: its radius over the distance, against the Sun's
  // radius over 1 AU, which comes to the star's width in Suns over the distance in AU.
  const wide = asWide(radius / au);
  return `A planet would get the sunlight Earth does about ${d(au)} AU out${where}. From there the star would look ${wide} as the Sun does from Earth.`;
}

// For a giant: how far it would reach in the Sun's place. "Put in the Sun’s place, it would reach past the orbit of
// Mars." `radius` is its width against the Sun's.
const FRACTIONS = [[0.1, 'a tenth'], [0.2, 'a fifth'], [0.25, 'a quarter'], [1 / 3, 'a third'], [0.5, 'half'], [2 / 3, 'two thirds'], [0.75, 'three quarters'], [0.9, 'nearly all']];
export function reachLine(radius) {
  const au = radius * SUN_RADIUS_AU;
  const passed = ORBITS.filter(([, a]) => a < au).pop();
  if (passed) {
    const next = ORBITS[ORBITS.indexOf(passed) + 1];
    const nearly = next && au / next[1] > 0.85 ? `, nearly to ${POSS(next[0])}` : '';
    return `Put in the Sun’s place, it would reach about ${d(au)} AU out, past the orbit of ${passed[0]}${nearly}.`;
  }
  const f = au / ORBITS[0][1];
  if (f < 0.075) return 'Put in the Sun’s place, it would reach less than a tenth of the way to Mercury’s orbit.';
  const part = FRACTIONS.reduce((a, b) => (Math.abs(Math.log(b[0] / f)) < Math.abs(Math.log(a[0] / f)) ? b : a))[1];
  return `Put in the Sun’s place, it would reach about ${part} of the way to Mercury’s orbit.`;
}

// An ordinary (main-sequence) star's mass from all its light, in Suns, by the textbook mass-luminosity relation
// (Duric 2004, Advanced Astrophysics, p. 19, after Salaris & Cassisi 2005): L = 0.23 M^2.3 below 0.43 Suns,
// M^4 to 2 Suns, 1.4 M^3.5 to 55 Suns, and 32,000 M above. Not for giants: it gives Arcturus four times its mass.
export function massFromLum(lum) {
  if (lum < 0.23 * 0.43 ** 2.3) return (lum / 0.23) ** (1 / 2.3);
  if (lum < 16) return lum ** 0.25;
  if (lum < 1.4 * 55 ** 3.5) return (lum / 1.4) ** (1 / 3.5);
  return lum / 32000;
}

// How long an ordinary star of that mass shines, in years: the Sun's ten billion years times M^-2.5 (Hansen &
// Kawaler 1994, Stellar Interiors, p. 28). The heaviest stars all last a few million years, whatever the rule says.
export const lifetimeYears = mass => Math.max(1e10 * mass ** -2.5, 3e6);

function massSaid(m) {
  if (m < 0.95) return `about ${m < 0.1 ? Math.round(m * 100) : Math.round(m * 10) * 10}% of the Sun’s mass`;
  if (m < 1.05) return 'about the Sun’s mass';
  const r = m < 10 ? Number(m.toFixed(1)) : Math.round(m);
  return r === 2 ? 'about twice the Sun’s mass' : `about ${r} times the Sun’s mass`;
}

function lifeSaid(t) {
  const longer = t >= AGE_OF_UNIVERSE ? ', longer than the universe has existed so far' : '';
  if (t >= 1e12) return `trillions of years${longer}`;
  if (t >= 1e11) return `hundreds of billions of years${longer}`;
  if (t >= 1e9) {
    const b = t < 1e10 ? Number((t / 1e9).toPrecision(1)) : Math.round(t / 1e9);
    return `about ${b === 1 ? 'a billion' : `${b} billion`} years${longer}`;
  }
  if (t >= 1e7) return `about ${Number((t / 1e6).toPrecision(1)).toLocaleString('en-US')} million years`;
  return 'only a few million years';
}

// "About twice the Sun’s mass, good for about 2 billion years, and it will swell into a red giant and end as
// a white dwarf." `lum` is all the star's light against the Sun's. Only for an ordinary star.
export function lifeLine(lum) {
  const m = massFromLum(lum);
  const fate = m >= SUPERNOVA_MASS ? 'it will end in a supernova, leaving a neutron star or a black hole'
    : m < 0.5 ? 'it will end as a white dwarf, though no star so small has lived long enough to do it yet'
    : 'it will swell into a red giant and end as a white dwarf';
  const said = massSaid(m);
  return `${said[0].toUpperCase()}${said.slice(1)}, good for ${lifeSaid(lifetimeYears(m))}, and ${fate}.`;
}
