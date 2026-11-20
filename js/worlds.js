// Planets as places: the real planets the system view flies in to and the away team stands on, and the rules for a
// planet put anywhere round a star (the survey's "place a planet"). Pure, checked by test/worlds.test.mjs.
//
// Each system is a star in data/stars.json (by its catalogue name) and its planets, nearest the star first:
// `au` the orbit's size (semi-major axis), `days` the year in Earth days, `width` and `mass` against Earth's. `least`
// says the mass is a minimum (found from the star's wobble, which can't tell how the orbit is tilted), and then no
// width has been measured: the rooms say "if it is rock" and use widthFor(mass). `teq` is the temperature the star's
// light alone would warm it to, in kelvin, as the paper gives it; the Solar System's planets have `meanC`, their mean
// temperature in °C, instead, and `dayHours`, the length of a day from noon to noon. `src` is where the numbers are
// from. The exoplanets are the NASA Exoplanet Archive's composite values (exoplanetarchive.ipac.caltech.edu, table
// pscomppars, read 19 November 2026), with the paper each comes from; the Solar System's are NASA's planetary fact
// sheet (nssdc.gsfc.nasa.gov/planetary/factsheet, read the same day). `locked` marks a planet close enough to its star
// (a small star, or a giant a few days out) that it is expected to keep one face to it, as the Moon does to Earth: tides lock a planet that close within a
// few billion years (Barnes 2017, "Tidal locking of habitable exoplanets", Celestial Mechanics and Dynamical
// Astronomy 129, 509). Nobody has seen it happen on any of them; the rooms say "expected".
import { SUN_RADIUS_AU, widthFor } from './physics.js';
import { byId, label, worldByName as fileWorld } from './classes.js';
import { planetAt } from './ephemeris.js';
import { eclipticToEquatorial } from './astro.js';

const FACT = 'NASA planetary fact sheet';
export const SYSTEMS = [
  {
    star: 'Sol', planets: [
      { name: 'Mercury', au: 0.387, days: 88.0, width: 0.383, mass: 0.0553, meanC: 167, dayHours: 4222.6, art: 'rock', src: FACT },
      { name: 'Venus', au: 0.723, days: 224.7, width: 0.949, mass: 0.815, meanC: 464, dayHours: 2802.0, art: 'venus', src: FACT },
      { name: 'Earth', au: 1, days: 365.2, width: 1, mass: 1, meanC: 15, dayHours: 24.0, art: 'earth', src: FACT },
      { name: 'Mars', au: 1.52, days: 687.0, width: 0.532, mass: 0.107, meanC: -65, dayHours: 24.7, art: 'mars', src: FACT },
      { name: 'Jupiter', au: 5.20, days: 4331, width: 11.21, mass: 317.8, meanC: -110, dayHours: 9.9, art: 'jovian', src: FACT },
      { name: 'Saturn', au: 9.57, days: 10747, width: 9.45, mass: 95.2, meanC: -140, dayHours: 10.7, art: 'jovian', src: FACT },
      { name: 'Uranus', au: 19.17, days: 30589, width: 4.01, mass: 14.5, meanC: -195, dayHours: 17.2, art: 'icegiant', src: FACT },
      { name: 'Neptune', au: 30.18, days: 59800, width: 3.88, mass: 17.1, meanC: -200, dayHours: 16.1, art: 'icegiant', src: FACT },
    ],
  },
  {
    star: 'Proxima Centauri', planets: [
      { name: 'Proxima d', au: 0.02881, days: 5.12338, mass: 0.26, least: true, teq: 282, locked: true, src: 'Suárez Mascareño et al. 2025, A&A 700, A11' },
      { name: 'Proxima b', au: 0.04848, days: 11.18465, mass: 1.055, least: true, teq: 218, locked: true, src: 'Suárez Mascareño et al. 2025, A&A 700, A11' },
    ],
  },
  {
    star: 'Luyten\'s Star', planets: [
      { name: 'Luyten c', au: 0.036467, days: 4.7234, mass: 1.18, least: true, teq: 462, locked: true, src: 'Astudillo-Defru et al. 2017, A&A 602, A88' },
      { name: 'Luyten b', au: 0.091101, days: 18.6498, mass: 2.89, least: true, teq: 292, locked: true, src: 'Astudillo-Defru et al. 2017, A&A 602, A88' },
    ],
  },
  {
    star: 'Teegarden\'s Star', planets: [
      { name: 'Teegarden’s Star b', au: 0.0259, days: 4.90634, mass: 1.16, least: true, teq: 277, locked: true, src: 'Dreizler et al. 2024, A&A 684, A117' },
      { name: 'Teegarden’s Star c', au: 0.0455, days: 11.416, mass: 1.05, least: true, teq: 209, locked: true, src: 'Dreizler et al. 2024, A&A 684, A117' },
      { name: 'Teegarden’s Star d', au: 0.0791, days: 26.13, mass: 0.82, least: true, teq: 159, locked: true, src: 'Dreizler et al. 2024, A&A 684, A117' },
    ],
  },
  {
    star: 'TRAPPIST-1', planets: [
      { name: 'TRAPPIST-1 b', au: 0.01154, days: 1.510826, width: 1.116, mass: 1.374, teq: 397.6, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 c', au: 0.0158, days: 2.421937, width: 1.097, mass: 1.308, teq: 339.7, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 d', au: 0.02227, days: 4.049219, width: 0.788, mass: 0.388, teq: 286.2, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 e', au: 0.02925, days: 6.101013, width: 0.92, mass: 0.692, teq: 249.7, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 f', au: 0.03849, days: 9.20754, width: 1.045, mass: 1.039, teq: 217.7, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 g', au: 0.04683, days: 12.352446, width: 1.129, mass: 1.321, teq: 197.3, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
      { name: 'TRAPPIST-1 h', au: 0.06189, days: 18.772866, width: 0.755, mass: 0.326, teq: 171.7, locked: true, src: 'Agol et al. 2021, PSJ 2, 1' },
    ],
  },
  // The stars below were added later, from the same table (read 20 November 2026). Where the archive puts together a
  // planet's figures from more than one paper, `src` names each. A giant's width is nowhere measured: `guess` marks the
  // archive's own estimate from its mass (the mass-radius relation of Chen and Kipping 2017, ApJ 834, 17), and so is
  // a giant's `teq` where no paper gives one: the archive works it out for a planet that reflects no light at all.
  {
    star: 'Barnard\'s Star', planets: [
      { name: 'Barnard’s Star d', au: 0.0188, days: 2.3402, mass: 0.263, least: true, teq: 483, locked: true, src: 'Basant et al. 2025, ApJL 982, L1' },
      { name: 'Barnard’s Star b', au: 0.0229, days: 3.1542, mass: 0.299, least: true, teq: 438, locked: true, src: 'Basant et al. 2025, ApJL 982, L1' },
      { name: 'Barnard’s Star c', au: 0.0274, days: 4.1244, mass: 0.335, least: true, teq: 400, locked: true, src: 'Basant et al. 2025, ApJL 982, L1' },
      { name: 'Barnard’s Star e', au: 0.0381, days: 6.7392, mass: 0.193, least: true, teq: 340, locked: true, src: 'Basant et al. 2025, ApJL 982, L1' },
    ],
  },
  {
    star: 'Ran', title: 'Epsilon Eridani', planets: [
      { name: 'Ægir', au: 3.53, days: 2680, width: 13.8, guess: true, mass: 317.8, teq: 112, src: 'Thompson et al. 2025, AJ 170, 301; its temperature and width are the archive’s estimates' },
    ],
  },
  {
    star: 'Copernicus', title: '55 Cancri', planets: [
      { name: '55 Cancri e', au: 0.01544, days: 0.7365474, width: 1.875, mass: 7.99, teq: 1958, locked: true, src: 'Bourrier et al. 2018, A&A 619, A1; its temperature from Demory et al. 2011, A&A 533, A114' },
      { name: '55 Cancri b', au: 0.118, days: 14.651552, width: 13.9, guess: true, mass: 264.0, teq: 700, src: 'Moutou et al. 2026, A&A 705, A190 (orbit), Baluev 2015, MNRAS 446, 1493 (mass) and Salz et al. 2015, A&A 576, A42 (temperature); its width is the archive’s estimate' },
      { name: '55 Cancri c', au: 0.247, days: 44.3936, width: 8.51, guess: true, mass: 54.47, teq: 499, src: 'Moutou et al. 2026, A&A 705, A190 (orbit) and Baluev 2015, MNRAS 446, 1493 (mass); its temperature and width are the archive’s estimates' },
      { name: '55 Cancri f', au: 0.802, days: 260.58, width: 7.59, guess: true, mass: 44.81, teq: 277, src: 'Moutou et al. 2026, A&A 705, A190 (orbit) and Baluev 2015, MNRAS 446, 1493 (mass); its temperature and width are the archive’s estimates' },
      { name: '55 Cancri d', au: 5.6, days: 4799, width: 13.0, guess: true, mass: 1232, teq: 105, src: 'Moutou et al. 2026, A&A 705, A190 (orbit) and Baluev 2015, MNRAS 446, 1493 (mass); its temperature and width are the archive’s estimates' },
    ],
  },
  {
    star: 'Pollux', planets: [
      { name: 'Thestias', au: 1.64, days: 589.64, width: 13.3, guess: true, mass: 731, least: true, teq: 550, src: 'Hatzes et al. 2006, A&A 457, 335; its temperature and width are the archive’s estimates' },
    ],
  },
  {
    star: 'Helvetios', title: '51 Pegasi', planets: [
      { name: 'Dimidium', au: 0.052, days: 4.2307966, width: 14.1, guess: true, mass: 193.9, teq: 1329, locked: true, src: 'Cont et al. 2026, A&A 710, A345; its temperature and width are the archive’s estimates' },
    ],
  },
  {
    star: 'τ Boötis', title: 'Tau Boötis', planets: [
      { name: 'Tau Boötis b', au: 0.049, days: 3.3124568, width: 12.8, guess: true, mass: 1891, teq: 1682, locked: true, src: 'Borsa et al. 2015, A&A 578, A64 (orbit) and Brogi et al. 2012, Nature 486, 502 (mass); its temperature and width are the archive’s estimates' },
    ],
  },
];

// Capitals and the kind of apostrophe don't matter, since names travel in links.
const plain = s => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
// A system by its star's catalogue name, or by the title the bridge's charts give it (Epsilon Eridani is Ran there).
export const systemFor = star => SYSTEMS.find(s => plain(s.star) === plain(star) || (s.title && plain(s.title) === plain(star))) || null;
// A planet by its name, with its system: { planet, system }, or null.
export function planetByName(name) {
  const n = plain(name);
  for (const system of SYSTEMS) for (const planet of system.planets) if (plain(planet.name) === n) return { planet, system };
  return null;
}

// A planet's width against Earth's, and whether that was measured or is what rock that heavy would be.
export const widthOf = p => p.width || widthFor(p.mass);
// A giant has no ground to stand on. Past about 1.6 Earth widths planets keep a deep layer of gas (Fulton and others
// 2017, AJ 154, 109, found few planets between 1.5 and 2), so the away team beams down only below that.
export const ROCK_WIDTH = 1.6;
export const standable = p => widthOf(p) < ROCK_WIDTH;

// ---------- The star's light ----------

// The temperate zone (the "habitable zone": where a planet like Earth could keep liquid water on its surface), from
// Kopparapu and others 2013, "Habitable zones around main-sequence stars: new estimates" (ApJ 765, 131), Table 3 as
// published (arXiv:1301.6674v2). The inner edge is where an Earth would start losing its water to space (their
// "moist greenhouse"), the outer where even a thick carbon dioxide air could no longer keep it warm ("maximum
// greenhouse"): for the Sun, 0.99 and 1.70 AU, as their abstract says. Each is a flux against what Earth gets,
// Seff = Seff☉ + aT + bT² + cT³ + dT⁴ with T the star's surface temperature less 5780 K, fitted for 2600 to 7200 K;
// a star outside that range is taken at the nearer end. The distance is then √(L / Seff) AU.
export const HZ = {
  inner: [1.0140, 8.1774e-5, 1.7063e-9, -4.3241e-12, -6.6462e-16],
  outer: [0.3438, 5.8942e-5, 1.6558e-9, -3.0045e-12, -5.2983e-16],
  // The wider, "optimistic" edges the same paper gives from Venus and Mars: Venus has had no water for at least a
  // billion years, and early Mars had rivers. The survey files a planet between these and the edges above as dry.
  venus: [1.7753, 1.4316e-4, 2.9875e-9, -7.5702e-12, -1.1635e-15],
  mars: [0.3179, 5.4513e-5, 1.5313e-9, -2.7786e-12, -4.8997e-16],
};
export function seff(edge, teff) {
  const t = Math.min(Math.max(teff, 2600), 7200) - 5780;
  const [s, a, b, c, d] = HZ[edge];
  return s + a * t + b * t ** 2 + c * t ** 3 + d * t ** 4;
}
// The zone round a star of luminosity `lum` (Suns) and surface temperature `teff` (K), in AU.
export function temperateZone(lum, teff) {
  const at = edge => Math.sqrt(lum / seff(edge, teff));
  return { inner: at('inner'), outer: at('outer'), venus: at('venus'), mars: at('mars') };
}

// How much starlight a planet `au` out gets, against what Earth gets from the Sun.
export const sunlight = (lum, au) => lum / (au * au);

// The temperature a planet's star alone would warm it to, in kelvin, if it reflects as much light as Earth does
// (about 30%) and spreads the heat round itself: 278.6 K × (1 − 0.3)^¼ × L^¼ / √au. Earth itself comes to 255 K by
// this rule; its air keeps it 33 degrees warmer.
export const ALBEDO = 0.3;
export const warmedTo = (lum, au, albedo = ALBEDO) => 278.6 * (1 - albedo) ** 0.25 * lum ** 0.25 / Math.sqrt(au);

// How wide the star looks from a planet `au` out, in degrees. `radius` is its width against the Sun's.
export const starDegrees = (radius, au) => 2 * Math.atan(radius * SUN_RADIUS_AU / au) * 180 / Math.PI;
// The Sun from Earth, for comparison.
export const SUN_DEGREES = starDegrees(1, 1);

// Where an orbit falls against the zone: 'hot' (inside even its wider edge), 'warm edge' (inside the wider zone but
// not the cautious one), 'temperate', 'cold edge' or 'cold'. Astronomers who call a planet "in the habitable zone"
// often mean the wider one: Luyten b and Teegarden's Star b are in it, a little closer in than the cautious edge.
export function zoneOf(au, zone) {
  if (au < zone.venus) return 'hot';
  if (au < zone.inner) return 'warm edge';
  if (au <= zone.outer) return 'temperate';
  return au <= zone.mars ? 'cold edge' : 'cold';
}

// ---------- On the ground ----------

// Gravity at the surface, against Earth's: mass over width squared.
export const gravity = p => p.mass / widthOf(p) ** 2;
// What a person of `kg` would weigh there, as kilograms on a bathroom scale made for Earth.
export const weighs = (kg, g) => kg * g;

// ---------- A planet put anywhere ----------

// The survey file a planet of this width (Earth's), this far out round this star, would go on, as a class id in
// js/classes.js. It is the survey's own rule of thumb, from size first and then from where it sits against the zone:
// - wider than 6 Earths it is a giant (Jupiter is 11.2): a hot Jupiter where the star warms it past 1,000 K, Class T
//   from 12 Earths, otherwise Class J;
// - from 1.6 to 6 it has kept a deep layer of gas: an ice giant from 3.5 (Uranus and Neptune are about 4), else a
//   sub-Neptune;
// - smaller, it is rock. Under 0.4 Earths (smaller than Mercury) it is a planetoid, airless. A rocky world the star
//   warms past 1,000 K is a lava world. Inside the zone's dry edge it is Class N, smothered as Venus is (or a bare
//   planetoid, under half Earth's width, too small to hold that much air); between that and the zone, Class H, a
//   desert. In the zone, from 0.8 Earths it is Class M if it has air and water, which nobody can tell from here,
//   and Class K, cold and thin-aired like Mars, if smaller; from 1.25 a super-Earth. Past the zone it is frozen
//   over, Class P, or a planetoid under half Earth's width.
export function fileFor(width, au, lum, teff) {
  const zone = temperateZone(lum, teff);
  const hot = warmedTo(lum, au) >= 1000;
  if (width >= 6) return hot ? 'hot-jupiter' : width >= 12 ? 'T' : 'J';
  if (width >= ROCK_WIDTH) return width >= 3.5 ? 'ice-giant' : 'sub-neptune';
  if (width < 0.4) return 'D';
  if (hot) return 'lava-world';
  if (au < zone.venus) return width < 0.5 ? 'D' : 'N';
  if (au < zone.inner) return 'H';
  if (au <= zone.outer) return width >= 1.25 ? 'super-earth' : width >= 0.8 ? 'M' : 'K';
  return width < 0.5 ? 'D' : 'P';
}
// The same, as the class's entry in js/classes.js.
export const fileOf = (width, au, lum, teff) => byId.get(fileFor(width, au, lum, teff));

// The sizes the survey offers for a placed planet, each against Earth's.
export const SIZES = [
  { id: 'moon', name: 'Moon', width: 0.273 },
  { id: 'mars', name: 'Mars', width: 0.532 },
  { id: 'earth', name: 'Earth', width: 1 },
  { id: 'super', name: 'Super-Earth', width: 1.4 },
  { id: 'neptune', name: 'Neptune', width: 3.88 },
  { id: 'jupiter', name: 'Jupiter', width: 11.21 },
];

// The survey file a real planet is on (js/classes.js), else the one the rule above would put it on, for the colours
// it is painted in. `star` is { lum, temp } from the catalogue.
export function paintedAs(p, star) {
  const filed = fileWorld(p.name);
  if (filed) return filed.cls;
  return fileOf(widthOf(p), p.au, star.lum, star.temp);
}
export const artFor = (p, star) => p.art || paintedAs(p, star).art;

// ---------- Where each planet is ----------

// Where a planet stands on its orbit, as an angle in radians, at Julian day `jd`. Orbits are taken as circles in one
// plane. For an exoplanet only the size and length of the orbit are known here, not where along it the planet is
// today, so each starts from its own fixed angle at J2000 and goes round at its true pace: the spacing of the planets
// on their orbits is a guess, though not how fast each moves. (The Solar System's planets come from js/ephemeris.js.)
export function orbitAngle(p, index, jd) {
  const start = (index * 2.39996 + p.name.length * 0.7) % (Math.PI * 2); // the golden angle, so they spread out
  return start + (2 * Math.PI * (jd - 2451545)) / p.days;
}

// ---------- The sky from the ground ----------

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const along = (a, b) => unit(a.map((x, k) => x - dot(a, b) * b[k])); // a with its part along b taken out
const KM_PER_AU = 149597870.7, EARTH_KM = 6371;

// Where each planet of a system is at Julian day `jd`, in AU from its star, as equatorial x, y, z (x toward the March
// equinox, z toward the north celestial pole, as the catalogue's are). The Solar System's come from the ephemeris.
// For another star the plane of the orbits isn't known (except that a system whose planets cross their star's face,
// as TRAPPIST-1's do, is seen edge on, so the Sun lies in that plane): every system here is drawn that way, with
// `toSol`, the direction from the star to the Sun, in the plane. Positions on the orbits are orbitAngle's.
export function positions(system, jd, toSol) {
  if (system.star === 'Sol') return system.planets.map(p => eclipticToEquatorial(planetAt(p.name.toLowerCase(), jd)));
  const e1 = toSol, n = Math.abs(toSol[2]) > 0.99 ? [1, 0, 0] : unit(cross(toSol, [0, 0, 1])), e2 = cross(n, e1);
  return system.planets.map((p, k) => { const a = orbitAngle(p, k, jd); return e1.map((x, i) => p.au * (Math.cos(a) * x + Math.sin(a) * e2[i])); });
}

// What stands in the sky of `planet` (one of `system`'s) at `jd`: the direction of its star (`sun`), of the Sun
// (`sol`, null at home) and of its sister planets, each with how wide it looks in degrees, how far off it is in AU
// and how much of the face turned to us is lit (`lit`, 0 to 1). `hostPc` is the star's position in parsecs from the
// Sun. And where to stand: `day` is "up" for a place where the star stands 14° high, toward the Sun's side of the
// sky; `night` is "up" for a place on the night side, with the star 20° below the horizon, as high under the Sun
// (or, at home, under Orion) as that allows. On a planet that keeps one face to its star, both places are fixed.
export function groundSky(system, planet, jd, hostPc) {
  const toSol = system.star === 'Sol' ? null : unit(hostPc.map(x => -x));
  const pos = positions(system, jd, toSol || [1, 0, 0]);
  const k = system.planets.indexOf(planet), me = pos[k];
  const sun = unit(me.map(x => -x));
  const sisters = system.planets.map((p, j) => {
    if (j === k) return null;
    const rel = pos[j].map((x, i) => x - me[i]), au = Math.hypot(...rel), dir = unit(rel);
    const deg = 2 * Math.atan(widthOf(p) * EARTH_KM / (au * KM_PER_AU)) * 180 / Math.PI;
    const lit = (1 + dot(unit(pos[j].map(x => -x)), dir.map(x => -x))) / 2;
    return { planet: p, dir, au, deg, lit };
  }).filter(Boolean);
  // At home there is no Sun to look for at night: face Orion (right ascension 5h 30m, on the equator) instead.
  const mark = toSol || [Math.cos(82.5 * Math.PI / 180), Math.sin(82.5 * Math.PI / 180), 0];
  let toward = along(mark, sun);
  if (!Number.isFinite(toward[0]) || Math.abs(dot(mark, sun)) > 0.9999) toward = along([0, 0, 1], sun);
  const tilt = (a, b, deg) => unit(a.map((x, i) => x * Math.sin(deg * Math.PI / 180) + b[i] * Math.cos(deg * Math.PI / 180)));
  return { sun, sol: toSol, mark, sisters, day: tilt(sun, toward, 14), night: tilt(sun.map(x => -x), toward, 20) };
}

// The altitude of a direction, in degrees, for a place whose "up" is `up`.
export const altitude = (dir, up) => Math.asin(Math.max(-1, Math.min(1, dot(dir, up)))) * 180 / Math.PI;

// ---------- In words ----------

const fig = (x, sig = 2) => {
  if (x >= 100) return Math.round(x).toLocaleString('en-US');
  return String(Number(x.toPrecision(sig)));
};
// "0.049 AU", "1.5 AU", "30 AU".
export const auText = au => `${au < 0.1 ? Number(au.toPrecision(2)) : au < 10 ? Number(au.toFixed(2)) : Math.round(au)} AU`;
// "1.5 days", "11 days", "687 days", "11.9 years".
export function yearText(days) {
  if (days < 10) return `${Number(days.toFixed(1))} days`;
  if (days < 1000) return `${Math.round(days)} days`;
  return `${Number((days / 365.25).toFixed(1))} years`;
}
// "65% of Earth’s", "about Earth’s", "2.1 times Earth’s", "a thousandth of Earth’s".
export function lightText(s) {
  if (s >= 0.95 && s < 1.05) return 'about what Earth gets';
  if (s >= 1.05) return `${fig(s)} times what Earth gets`;
  if (s >= 0.01) return `${Math.round(s * 100)}% of what Earth gets`;
  return `${fig(s * 100, 1)}% of what Earth gets`;
}
export const kelvinText = k => `${Math.round(k)} K (${Math.round(k - 273.15) < 0 ? '−' : ''}${Math.abs(Math.round(k - 273.15))} °C)`;
export const celsiusText = c => `${c < 0 ? '−' : ''}${Math.abs(c)} °C`;
// "1.7°, 3.2 times as wide as the Sun from Earth".
export function sunWidthText(deg) {
  const x = deg / SUN_DEGREES;
  const times = x >= 0.95 && x < 1.05 ? 'about as wide as the Sun looks from Earth'
    : x >= 1.05 ? `${fig(x)} times as wide as the Sun looks from Earth`
    : `${x >= 0.1 ? Math.round(x * 100) : fig(x * 100, 1)}% as wide as the Sun looks from Earth`;
  return `${deg >= 1 ? deg.toFixed(1) : Number(deg.toPrecision(2))}°, ${times}`;
}
// A day, from noon to noon: "24 hours", "176 Earth days".
export function dayText(hours) {
  if (hours < 48) return hours < 23.5 || hours > 24.5 ? `${Number(hours.toFixed(1))} hours` : '24 hours';
  return `${Math.round(hours / 24)} Earth days`;
}

// The readings of a real planet, as [label, text] pairs, for the system view's readout. `star` is
// { lum, temp, radius } from the catalogue.
export function readout(p, star) {
  const zone = temperateZone(star.lum, star.temp);
  const w = widthOf(p);
  const rows = [
    ['Orbit', `${auText(p.au)} from its star`],
    ['Year', yearText(p.days)],
    ['Size', p.width === 1 && p.mass === 1 ? 'Earth’s own: 12,756 km across'
      : p.guess ? `${p.least ? 'At least ' : ''}${fig(p.mass)} times Earth’s mass; a giant that heavy is about ${fig(p.width)} times its width`
      : p.width ? `${fig(p.width)} times Earth’s width, ${fig(p.mass)} times its mass`
      : `${p.least ? 'At least ' : ''}${fig(p.mass)} times Earth’s mass; if it is rock, about ${fig(w)} times its width`],
    ['Starlight', lightText(sunlight(star.lum, p.au))],
    p.meanC != null ? ['Temperature', `${celsiusText(p.meanC)} on average`]
      : ['Temperature', `${kelvinText(p.teq)} from its star’s light alone`],
    ['The temperate zone', zoneLine(p.au, zone)],
    ['The star from here', sunWidthText(starDegrees(star.radius, p.au))],
  ];
  return rows;
}
export function zoneLine(au, zone) {
  const z = zoneOf(au, zone);
  const span = `${auText(zone.inner)} to ${auText(zone.outer)}`, wide = `${auText(zone.venus)} to ${auText(zone.mars)}`;
  if (z === 'temperate') return `In it: the zone where water could be liquid runs from ${span} here`;
  if (z === 'warm edge') return `On its warm edge: in the zone by the wider reckoning (${wide}), a little too close for the cautious one (${span})`;
  if (z === 'cold edge') return `On its cold edge: in the zone by the wider reckoning (${wide}), a little too far out for the cautious one (${span})`;
  return `${z === 'hot' ? 'Too close' : 'Too far out'}: the zone where water could be liquid runs from ${span} here`;
}

// What standing there is like, as [label, text] pairs, for the away team's readings strip.
export function groundReadings(p, star) {
  const g = gravity(p);
  const kg = weighs(70, g);
  const about = p.width ? '' : 'about ';
  return [
    ['Gravity', `${about}${fig(g)} g${p.width ? '' : ', if it is rock'}`],
    ['A 70 kg person weighs', `${about}${Math.round(kg)} kg`],
    ['A year', yearText(p.days)],
    ['Sunlight', lightText(sunlight(star.lum, p.au))],
    ['The sun', sunWidthText(starDegrees(star.radius, p.au))],
    p.locked ? ['A day', 'The sun never sets here: like the Moon to Earth, it is expected to keep one face to its star']
      : ['A day', `${dayText(p.dayHours)}, from noon to noon`],
  ];
}

// The survey's reading of a placed planet, for the place-a-planet panel: { file, zone, light, warmed, rows }.
export function placed(width, au, star) {
  const zone = temperateZone(star.lum, star.temp);
  const file = fileOf(width, au, star.lum, star.temp);
  const light = sunlight(star.lum, au);
  const warmed = warmedTo(star.lum, au);
  return {
    file, zone, light, warmed,
    rows: [
      ['Starlight', lightText(light)],
      ['Warmed to', `${kelvinText(warmed)}, by its star’s light alone`],
      ['The temperate zone', zoneLine(au, zone)],
      ['The star from there', sunWidthText(starDegrees(star.radius, au))],
    ],
    filed: filedLine(file),
  };
}
// "It would go on the Class K file: thin air, needs domes." "It would be a sub-Neptune: small and hazy."
export function filedLine(cls) {
  if (cls.id === 'M') return `It would go on the ${label(cls)} file, if it has air and water: nobody can tell that from its size and sunlight alone.`;
  const what = cls.short.toLowerCase();
  return cls.letter ? `It would go on the ${label(cls)} file: ${what}.` : `It would be ${cls.inText}: ${what}.`;
}
