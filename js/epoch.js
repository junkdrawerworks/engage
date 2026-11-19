// The temporal observatory's rules: where every star is in another century, by its motion through space, and where
// Earth's axis points. Each star moves in a straight line at the speed the catalogue gives it (data/motion.bin, built
// by tools/build-motion.py from the HYG catalogue's proper motions, parallaxes and radial velocities), which is good
// to about 100,000 years either way: past that the stars' paths round the galaxy curve away from straight lines. The
// axis turns once in 25,772 years (the precession of the equinoxes; Capitaine and others 2003, as the IAU's 2006
// precession model has it) about the pole of Earth's orbit, at today's tilt of 23.44° (the tilt itself rocks between
// about 22° and 24.5° over 41,000 years, which moves the pole's circle by a degree or so and is left out). Pure,
// checked by test/epoch.test.mjs; js/temporal.js draws it.
import { apparentMag, LY_PER_PC } from './physics.js';

export const SPAN = 100000; // years either side of now the dial reaches
export const PRECESSION_YEARS = 25772;
export const TILT = 23.4393 * Math.PI / 180; // at J2000
export const EPOCH = 2000; // the catalogue's positions are for the year 2000
const KM_S_PER_PC_YR = 977792.2;
export const UNIT_KM_S = 0.05; // one step of data/motion.bin

// The motions as parsecs a year, three to a star in the catalogue's order. Stars the file has none for (those the
// deep sky adds after the catalogue's own) hold still.
export function velocities(cat, raw) {
  const v = new Float64Array(cat.count * 3);
  const n = Math.min(raw.length, cat.count * 3);
  for (let k = 0; k < n; k++) v[k] = raw[k] * UNIT_KM_S / KM_S_PER_PC_YR;
  return v;
}
export async function loadMotion(cat) {
  const buf = await fetch('data/motion.bin').then(r => r.arrayBuffer());
  return velocities(cat, new Int16Array(buf));
}

// Where star i is in `year` (a calendar year, astronomical: 0 is 1 BC), in parsecs from the Sun.
export function placeAt(cat, vel, i, year) {
  const t = year - EPOCH;
  return [cat.pos[i * 3] + vel[i * 3] * t, cat.pos[i * 3 + 1] + vel[i * 3 + 1] * t, cat.pos[i * 3 + 2] + vel[i * 3 + 2] * t];
}

// Earth's sky in `year`: every star by direction and how bright it looks, brightest first, down to `limit`. A star
// with no measured distance stays where it is today, as bright.
export function skyIn(cat, vel, year, limit = 6) {
  const out = [];
  for (let i = 1; i < cat.count; i++) {
    const p = placeAt(cat, vel, i, year), d = Math.hypot(...p);
    const m = apparentMag(cat.absmag[i], d);
    if (m > limit) continue;
    out.push({ i, dir: [p[0] / d, p[1] / d, p[2] / d], mag: m });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

// The north celestial pole in `year`, as a direction in the catalogue's axes (fixed to the year 2000's equinox, so
// the stars are drawn in one frame and the pole moves among them). It turns westward round the pole of Earth's orbit.
export const ECLIPTIC_POLE = [0, -Math.sin(TILT), Math.cos(TILT)];
export function poleIn(year) {
  const a = -2 * Math.PI * (year - EPOCH) / PRECESSION_YEARS;
  const k = ECLIPTIC_POLE, v = [0, 0, 1];
  const c = Math.cos(a), s = Math.sin(a), kv = k[2]; // k · v
  const kxv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map(j => v[j] * c + kxv[j] * s + k[j] * kv * (1 - c)); // Rodrigues' rotation
}
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
export const DEG = 180 / Math.PI;

// The pole star in `year`: the brightest star within 5° of the pole that the eye can find from a town (magnitude 4
// or brighter), or null when none is that close (as in Caesar's day). { i, mag, off } with `off` in degrees.
export const POLE_REACH = 5, POLE_MAG = 4;
export function poleStar(sky, pole) {
  let best = null;
  for (const s of sky) {
    if (s.mag > POLE_MAG) break;
    const off = angle(s.dir, pole) * DEG;
    if (off <= POLE_REACH && (!best || s.mag < best.mag)) best = { i: s.i, mag: s.mag, off };
  }
  return best;
}

// The nearest star in `year`, of those with a measured distance: { i, ly }.
export function nearestIn(cat, vel, year) {
  let best = null;
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    const d = Math.hypot(...placeAt(cat, vel, i, year));
    if (!best || d < best.d) best = { i, d };
  }
  return { i: best.i, ly: best.d * LY_PER_PC };
}

// When star i comes closest on its straight line, and how close: { year, ly }.
export function closest(cat, vel, i) {
  const p = placeAt(cat, vel, i, EPOCH), v = [vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]];
  const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const t = vv ? -(p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / vv : 0;
  return { year: EPOCH + t, ly: Math.hypot(...p.map((x, k) => x + v[k] * t)) * LY_PER_PC };
}

// The dial: u from −1 to 1, finer near now. 0 is `now`; ±1 is ±100,000 years from it.
export const yearForDial = (u, now) => Math.round(now + Math.sign(u) * (10 ** (Math.abs(u) * 5) - 1));
export const dialForYear = (year, now) => { const d = year - now; return Math.sign(d) * Math.log10(Math.abs(d) + 1) / 5; };

// "AD 14,000", "2800 BC", "2026": calendar years, astronomical numbering in (0 is 1 BC).
export function yearSaid(year) {
  const y = Math.round(year);
  if (y <= 0) return `${(1 - y).toLocaleString('en-US')} BC`;
  if (y < 10000) return y < 1000 ? `AD ${y}` : String(y);
  return `AD ${y.toLocaleString('en-US')}`;
}

// Moments to jump to. The Star Trek ones are a few centuries off at most, and the sky has hardly moved; that is
// itself the lesson. Years from Memory Alpha: Cochrane's warp flight and first contact (Star Trek: First Contact),
// Kirk in 1930s New York (“The City on the Edge of Forever”), the Enterprise's first flight past the galaxy's edge
// (“Where No Man Has Gone Before”) and Picard's first mission (“Encounter at Farpoint”).
export const MOMENTS = [
  { year: -2799, label: 'Pyramids', said: 'The age of the pyramids: Thuban, in Draco, is the pole star.' },
  { year: 1930, label: '1930', said: 'Kirk and Spock in New York, “The City on the Edge of Forever”.' },
  { year: 2063, label: '2063', said: 'Zefram Cochrane’s warp flight, and first contact with the Vulcans.' },
  { year: 2265, label: '2265', said: 'Kirk’s Enterprise goes past the galaxy’s edge, “Where No Man Has Gone Before”.' },
  { year: 2364, label: '2364', said: 'Picard’s first mission, “Encounter at Farpoint”.' },
  { barnard: true, label: 'Barnard’s closest', said: '' },
  { year: 14000, label: 'AD 14,000', said: 'Vega is the pole star, the brightest in the whole 25,772-year turn of Earth’s axis.' },
];

// What has changed since `now`, in one line: how far the most-moved bright star has gone.
export function drift(cat, vel, year, now, limit = 2.5) {
  let best = null;
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    const a = placeAt(cat, vel, i, now), b = placeAt(cat, vel, i, year);
    if (apparentMag(cat.absmag[i], Math.hypot(...a)) > limit) continue;
    const off = angle(a.map(x => x / Math.hypot(...a)), b.map(x => x / Math.hypot(...b))) * DEG;
    if (!best || off > best.off) best = { i, off };
  }
  return best;
}
