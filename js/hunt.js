// Planet hunt, the planetary survey's long-range sensors: find a planet the way astronomers do, from a star's light.
// A transit is a planet crossing its star's face: the star dims by the planet's share of its disc, the square of
// the planet's width over the star's (Seager and Mallén-Ornelas 2003, ApJ 585, 1038), once every year of the planet.
// A wobble is the star pulled back and forth by its planet, which shifts its light: its speed toward and away from us
// rises and falls once a year, by K metres a second, and K, the year and the star's mass give the planet's mass, or
// at least its least possible mass, since nobody can tell how the orbit is tilted.
// Pure, checked by test/survey.test.mjs.
//
// The planets: `days` is the year, `k` the planet's width over its star's, `rs` the star's width against the Sun's,
// `au` the orbit's size, all the NASA Exoplanet Archive's composite values (exoplanetarchive.ipac.caltech.edu, table
// pscomppars, read 19 November 2026), from the paper named in `src`. `file` is the survey file it is on, or would go
// on by js/worlds.js fileFor; `star` the host's name in data/stars.json where the bridge can fly there; `found` how
// it really was found. 51 Pegasi b has `kms`, its wobble, and `ms`, its star's mass against the Sun's, instead.
export const SUN_EARTHS = 109.1; // the Sun's width in Earth widths (NASA Sun fact sheet: 695,700 km over 6,371)
export const PLANETS = [
  { name: 'HD 209458 b', days: 3.52474859, k: 0.12086, rs: 1.19, au: 0.04707, file: 'hot-jupiter', src: 'Stassun and others 2017; Kokori and others 2023',
    found: 'The first planet ever seen crossing its star, in 1999, by two teams at once.' },
  { name: 'HD 189733 b', days: 2.21857567, k: 0.15534, rs: 0.75, au: 0.03126, file: 'hot-jupiter', src: 'Stassun and others 2017; Kokori and others 2023',
    found: 'Seen crossing its star in 2005. Hubble later found it deep blue, with winds that may rain glass.' },
  { name: 'Gliese 436 b', days: 2.64388312, k: 0.0822, rs: 0.455, au: 0.0291, file: 'ice-giant', src: 'Maciejewski and others 2014',
    found: 'Found by its star’s wobble in 2004, and seen crossing it in 2007.' },
  { name: 'GJ 1214 b', days: 1.580404531, k: 0.11589, rs: 0.2162, au: 0.01505, file: 'sub-neptune', src: 'Mahajan and others 2024',
    found: 'Found in 2009 by MEarth, a row of small telescopes in Arizona watching red dwarfs for dips like these.' },
  { name: '55 Cancri e', days: 0.7365474, k: 0.0182, rs: 0.943, au: 0.01544, file: 'lava-world', star: 'Copernicus', src: 'Bourrier and others 2018',
    found: 'Found by its star’s wobble in 2004. Its dips, a thirtieth of a percent, were found in 2011 by adding up many passes, as you just did.' },
  { name: 'π Mensae c', days: 6.2678399, k: 0.015844, rs: 1.17, au: 0.06839, file: 'sub-neptune', star: 'π Mensae', src: 'Kunovac Hodžić and others 2021',
    found: 'The first planet found by NASA’s TESS, announced in 2018, from passes too faint to see one at a time.' },
  ...[['b', 1.510826, 0.0859, 0.01154, 'D'], ['c', 2.421937, 0.0844, 0.0158, 'N'], ['d', 4.049219, 0.06063, 0.02227, 'H'], ['e', 6.101013, 0.07079, 0.02925, 'M'],
    ['f', 9.20754, 0.0804, 0.03849, 'M'], ['g', 12.352446, 0.08692, 0.04683, 'M'], ['h', 18.772866, 0.05809, 0.06189, 'P']].map(([l, days, k, au, file]) => ({
    name: `TRAPPIST-1 ${l}`, system: 'TRAPPIST-1', days, k, rs: 0.1192, au, file, star: 'TRAPPIST-1', src: 'Agol and others 2021',
    found: 'TRAPPIST-1’s seven planets were found from their dips: three in 2016, and all seven in 2017, with the Spitzer space telescope watching for 20 days.' })),
  { name: '51 Pegasi b', days: 4.2307966, kms: 55.77, ms: 1.07, au: 0.052, file: 'hot-jupiter', star: 'Helvetios', src: 'Cont and others 2026',
    found: 'Found in 1995 by Michel Mayor and Didier Queloz from this wobble (Nature 378, 355): the first planet round a star like the Sun, and a Nobel Prize in 2019.' },
];
export const planetByName = name => PLANETS.find(p => p.name === name) || null;

// The four levels. `pool` is the planets a curve can be of (all of TRAPPIST-1's at once in level 3); a curve is
// `rows` rows of `rowDays` days (or enough rows for `years` of the planet's years, or for three and a half), a reading
// every `cadence` days with `noise` of scatter (a fraction of the light, or metres a second for the wobble), or in
// level 2 a scatter of `scatter` times the dip itself, so that no single pass shows.
export const LEVELS = [
  { id: 1, name: 'Deep dips', pool: ['HD 209458 b', 'HD 189733 b', 'Gliese 436 b', 'GJ 1214 b'], rowDays: 5, cadence: 10 / 1440, noise: 0.0008,
    brief: 'A star’s light, a reading every ten minutes. Something dims it now and then. Tap three of the dips.' },
  { id: 2, name: 'Too faint to see', pool: ['55 Cancri e', 'π Mensae c'], rowDays: 10, years: 5, cadence: 30 / 1440, scatter: 0.5, fold: true,
    brief: 'This planet’s dips are smaller than the scatter: no one pass shows. Try years until the passes, added up, make a dip.' },
  { id: 3, name: 'Seven worlds', pool: PLANETS.filter(p => p.system === 'TRAPPIST-1').map(p => p.name), rowDays: 5, rows: 5, cadence: 4 / 1440, noise: 0.0008, many: true,
    brief: 'A small red star with seven planets, all crossing it. Tap three dips of the same planet: same depth, evenly spaced.' },
  { id: 4, name: 'The wobble', pool: ['51 Pegasi b'], rowDays: 14, rows: 1, noise: 8, wobble: true,
    brief: 'Not a dip this time: the star’s speed toward us and away, four readings a night, as in 1995. Tap three of the wave’s tops.' },
];

// ---------- Making a curve ----------

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// How long a crossing lasts, in days, for a planet crossing the middle of its star's face: the star's width over the
// orbit's length, of the year, on a circular orbit.
export const AU_SUNS = 215.03; // an AU in the Sun's radii: 149.6 million km over 695,700
export const duration = p => p.days / Math.PI * Math.asin(Math.min(1, (1 + p.k) * p.rs / (p.au * AU_SUNS)));
export const depthOf = p => p.k * p.k;

// How much a planet dims its star at time t (days), given when one crossing is at its middle.
function dimming(p, mid, t) {
  const T = duration(p), ramp = T * p.k / (1 + p.k);
  let dt = (t - mid) % p.days;
  if (dt < -p.days / 2) dt += p.days; else if (dt > p.days / 2) dt -= p.days;
  return depthOf(p) * Math.min(1, Math.max(0, (T / 2 - Math.abs(dt)) / ramp));
}

// A curve: level 1 to 4 and a seed, 1 to 99,999 (it travels in links). Returns { level, seed, planets, mids, days,
// t, y, target }: for a transit, y is the light as a fraction of the star's full light; for the wobble, the speed in
// m/s. `mids` is a moment when each planet is at the middle of a crossing (for the wobble, at the top of the
// curve). `target` is the planet asked about, or null in level 3, where it is whichever one
// is found.
export function curve(levelId, seed) {
  const level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
  const r = rng(seed * 7919 + level.id);
  const names = level.many ? level.pool : [level.pool[Math.floor(r() * level.pool.length)]];
  const planets = names.map(planetByName);
  const mids = planets.map(p => r() * p.days);
  const rows = level.rows || Math.ceil((level.years || 3.6) * planets[0].days / level.rowDays);
  const noise = level.scatter ? level.scatter * depthOf(planets[0]) : level.noise;
  const days = rows * level.rowDays;
  const t = [], y = [];
  if (level.wobble) {
    // Four readings a night, through fourteen nights, one night in seven lost to cloud.
    const p = planets[0];
    for (let night = 0; night < days; night++) {
      if (r() < 1 / 7) continue;
      for (const at of [0.02 + r() * 0.08, 0.12 + r() * 0.08, 0.22 + r() * 0.08, 0.32 + r() * 0.08]) {
        const tt = night + at;
        t.push(tt);
        y.push(p.kms * Math.cos(2 * Math.PI * (tt - mids[0]) / p.days) + noise * gauss(r));
      }
    }
  } else {
    for (let tt = 0; tt < days; tt += level.cadence) {
      let f = 1;
      planets.forEach((p, i) => { f -= dimming(p, mids[i], tt); });
      t.push(tt);
      y.push(f + noise * gauss(r));
    }
  }
  return { level, seed, planets, mids, days, rows, noise, t: Float64Array.from(t), y: Float64Array.from(y), target: level.many ? null : planets[0] };
}

// Every crossing (or, for the wobble, every top of the curve) in the curve: [{ planet, n, at }], `n` counting from
// the first in the window.
export function events(c) {
  const out = [];
  c.planets.forEach((p, i) => {
    let first = c.mids[i] % p.days;
    for (let n = 0, at = first; at < c.days; n++, at += p.days) out.push({ planet: p, n, at });
  });
  return out.sort((a, b) => a.at - b.at);
}

// The crossing (or top) nearest a tap at time t, if it is within `tol` days: else null.
export function eventAt(c, t, tol) {
  let best = null;
  for (const e of events(c)) if (Math.abs(e.at - t) <= tol && (!best || Math.abs(e.at - t) < Math.abs(best.at - t))) best = e;
  return best;
}

// The year from three or more crossings tapped: { planet, days } when they are all one planet's, else { mixed: true }.
export function yearFrom(marks) {
  if (marks.length < 2) return null;
  if (new Set(marks.map(m => m.planet)).size > 1) return { mixed: true };
  const sorted = [...marks].sort((a, b) => a.at - b.at), a = sorted[0], b = sorted[sorted.length - 1];
  return { planet: a.planet, days: (b.at - a.at) / (b.n - a.n) };
}

// ---------- Adding up passes ----------

// The curve folded on a year: the light in `bins` slices of the year, each the average of the readings that fall
// in it (NaN for one with none).
export function fold(c, days, bins = 60) {
  const sum = new Float64Array(bins), n = new Float64Array(bins);
  for (let i = 0; i < c.t.length; i++) {
    let ph = (c.t[i] % days) / days;
    const b = Math.min(bins - 1, Math.floor(ph * bins));
    sum[b] += c.y[i]; n[b]++;
  }
  return Array.from(sum, (s, b) => (n[b] ? s / n[b] : NaN));
}
// How many slices to fold into: enough that a crossing spans three of them, and at least 40.
export const binsFor = c => Math.max(40, Math.min(120, Math.round(3 * c.planets[0].days / duration(c.planets[0]))));
// How close a year tried is to the true one: 'found' when the passes line up to within a crossing's length over the
// whole window, 'double' at twice the year (the fold shows two dips), else null.
export const tolerance = c => duration(c.planets[0]) / (c.days / c.planets[0].days);
export function tried(c, days) {
  const p = c.planets[0];
  const tol = tolerance(c);
  if (Math.abs(days - p.days) <= tol) return 'found';
  if (Math.abs(days - 2 * p.days) <= 2 * tol) return 'double';
  return null;
}

// ---------- What the dip and the wobble say ----------

// From how much dimmer the star gets (a fraction): the planet's width over the star's, and in Earths.
export function sizeFrom(depth, rs) {
  const k = Math.sqrt(Math.max(0, depth));
  return { k, earths: k * rs * SUN_EARTHS };
}
// From the wobble's height in m/s, the year in days and the star's mass in Suns: the planet's least mass in
// Jupiters, for a planet much lighter than its star on a round orbit. K = (2πG/P)^⅓ m sin i / M^⅔.
const G = 6.674e-11, SUN_KG = 1.989e30, JUPITER_KG = 1.898e27;
export function leastMass(kms, days, ms) {
  return kms * Math.cbrt(days * 86400 / (2 * Math.PI * G)) * (ms * SUN_KG) ** (2 / 3) / JUPITER_KG;
}
// Whether a reading set by hand is close enough: within a third of the truth.
export const near = (guess, truth) => Math.abs(guess - truth) <= Math.abs(truth) / 3;

const pct = x => `${x >= 0.01 ? Number((x * 100).toFixed(1)) : Number((x * 100).toPrecision(1))}%`;
const fig = x => (x >= 10 ? Math.round(x).toLocaleString('en-US') : String(Number(x.toPrecision(2))));
// "1.5% dimmer, so the planet is about 12% of its star’s width: about 15 times Earth’s."
export function sizeLine(depth, rs) {
  const { k, earths } = sizeFrom(depth, rs);
  const like = earths < 1.25 ? 'about Earth’s size' : earths > 9 ? `about ${fig(earths / 11.21)} times Jupiter’s width` : `about ${fig(earths)} times Earth’s width`;
  return `${pct(depth)} dimmer, so the planet is about ${pct(k)} of its star’s width: ${like}.`;
}
export function massLine(kms, days, ms) {
  const m = leastMass(kms, days, ms);
  return `The star swings ${Math.round(kms)} m/s each way, so the planet weighs at least ${fig(m)} times as much as Jupiter${m < 0.1 ? `, ${fig(m * 317.8)} Earths` : ''}.`;
}
export function yearLine(days) {
  return days < 2 ? `One every ${Number((days * 24).toFixed(1))} hours: that is its year.` : `One every ${Number(days.toFixed(2))} days: that is its year.`;
}

// ---------- Links ----------

// A curve in a link, so a teacher can send one to a class: #hunt=2.4187, the level and the seed.
export const linkOf = c => `hunt=${c.level.id}.${c.seed}`;
export function fromLink(text) {
  const m = /^hunt=([1-4])\.(\d{1,5})$/.exec(String(text));
  return m && Number(m[2]) >= 1 ? { level: Number(m[1]), seed: Number(m[2]) } : null;
}
export const newSeed = (r = Math.random) => 1 + Math.floor(r() * 99999);
