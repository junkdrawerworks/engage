// Where things are in your own sky: turns the catalogue's directions into "how high, and which way" for a place on
// Earth and a moment, and finds the Sun, the Moon and the planets. Pure functions, so test/tonight.test.mjs can check them.
// Star directions are the catalogue's (the equator and equinox of 2000); the local frame allows for the third of a
// degree the Earth's axis has swung round since, so the Moon and planets sit where they should among the stars.
import { planetAt, earthAt, moonAt } from './ephemeris.js';

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4393 * DEG;

export const jdOf = date => +date / 86400000 + 2440587.5;

// Greenwich mean sidereal time in degrees (IAU 1982, good to a fraction of a second this century).
export function gmst(jd) {
  const d = jd - 2451545, T = d / 36525;
  return (((280.46061837 + 360.98564736629 * d + 0.000387933 * T * T) % 360) + 360) % 360;
}

// Turns a direction from the equator and equinox of the date (which sidereal time is measured from) back to those
// of 2000, which the catalogue and the planets' tables use: the Earth's axis has swung round about a third of a
// degree since. The IAU 1976 angles, as in Meeus, Astronomical Algorithms, chapter 21.
function toJ2000(jd) {
  const T = (jd - 2451545) / 36525, AS = DEG / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T) * AS, z = (2306.2181 * T + 1.09468 * T * T) * AS, theta = (2004.3109 * T - 0.42665 * T * T) * AS;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(theta), st = Math.sin(theta);
  // The rows take 2000 to the date; a direction of the date dotted with each column comes back to 2000.
  const P = [
    [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
    [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
    [cz * st, -sz * st, ct],
  ];
  return v => [0, 1, 2].map(k => P[0][k] * v[0] + P[1][k] * v[1] + P[2][k] * v[2]);
}

// The local frame for a place and moment, as three unit vectors in the catalogue's axes: east, north and up.
// A direction's height above the horizon and its bearing then come from dot products with these.
export function frame(lat, lon, jd) {
  const th = (gmst(jd) + lon) * DEG, ph = lat * DEG;
  const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
  const back = toJ2000(jd);
  return {
    east: back([-st, ct, 0]),
    north: back([-sp * ct, -sp * st, cp]),
    up: back([cp * ct, cp * st, sp]),
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A catalogue direction (any length) as [east, north, up] components of a unit vector.
export function toLocal(f, d) {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [dot(d, f.east) / l, dot(d, f.north) / l, dot(d, f.up) / l];
}

// Altitude above the horizon and azimuth clockwise from north, both in degrees.
export function altAz(enu) {
  const alt = Math.asin(Math.max(-1, Math.min(1, enu[2]))) / DEG;
  const az = ((Math.atan2(enu[0], enu[1]) / DEG) + 360) % 360;
  return { alt, az };
}

export function fromAltAz(alt, az) {
  const a = alt * DEG, z = az * DEG;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

// The planets' tables are on the ecliptic; the stars are on the equator.
export function eclipticToEquatorial([x, y, z]) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [x, c * y - s * z, s * y + c * z];
}

export const sunDir = jd => eclipticToEquatorial(earthAt(jd).map(v => -v));

// How bright a planet looks, less the 5 log10(r × delta) for its distances from the Sun and Earth, at a phase angle
// `a` in degrees (0 when it is full, 180 when it is between us and the Sun). Mercury and Venus go through every phase
// and fade fast as crescents, so they use the curves the Astronomical Almanac does: Mallama & Hilton 2018, "Computing
// apparent planetary magnitudes for The Astronomical Almanac", Astronomy and Computing 25, 10 (equations 2 to 4).
// The outer planets never show much phase, so a brightness at 1 AU and a fade per degree is within a few tenths of a
// magnitude. Saturn's leaves out the tilt of its rings, which brighten it by up to a magnitude when they are wide open
// (they were edge-on in 2025 and open until 2032).
const OUTER_MAG = { mars: [-1.52, 0.016], jupiter: [-9.4, 0.005], saturn: [-8.88, 0.04], uranus: [-7.19, 0], neptune: [-6.87, 0] };
export function phaseMag(name, a) {
  if (name === 'mercury') return -0.613 + a * (6.3280e-2 + a * (-1.6336e-3 + a * (3.3644e-5 + a * (-3.4265e-7 + a * (1.6893e-9 + a * -3.0334e-12)))));
  if (name === 'venus') {
    return a <= 163.7
      ? -4.384 + a * (-1.044e-3 + a * (3.687e-4 + a * (-2.814e-6 + a * 8.938e-9)))
      : 236.05828 + a * (-2.81914 + a * 8.39034e-3); // the thin crescent, lit from behind through its own air
  }
  const [h, k] = OUTER_MAG[name];
  return h + k * a;
}
export const NAKED_EYE_PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// A planet seen from Earth: its direction (catalogue axes), distance in AU, phase angle in degrees and magnitude.
export function planetSky(name, jd) {
  const p = planetAt(name, jd), e = earthAt(jd);
  const g = p.map((v, k) => v - e[k]);
  const r = Math.hypot(...p), delta = Math.hypot(...g);
  const cosPhase = (r * r + delta * delta - Math.hypot(...e) ** 2) / (2 * r * delta);
  const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase))) / DEG;
  return { dir: eclipticToEquatorial(g), au: delta, phase, mag: 5 * Math.log10(r * delta) + phaseMag(name, phase) };
}

// The Moon: its direction, how much of it is lit (0 new to 1 full), and whether it's growing. The Moon is close
// enough that where you stand matters: from one side of the Earth to the other it shifts nearly two degrees against
// the stars. Given a place ({ lat, lon }), the direction is the one from there; without, from the Earth's centre.
const EARTH_KM = 6378.14;
export function moonSky(jd, place) {
  const m = moonAt(jd), s = earthAt(jd).map(v => -v);
  const lonM = Math.atan2(m[1], m[0]), lonS = Math.atan2(s[1], s[0]);
  const cosE = dot(m, s) / (Math.hypot(...m) * Math.hypot(...s));
  const lit = (1 - cosE) / 2;
  const waxing = ((lonM - lonS) / DEG + 720) % 360 < 180;
  let dir = eclipticToEquatorial(m);
  if (place) { const { up } = frame(place.lat, place.lon, jd); dir = dir.map((v, k) => v - EARTH_KM * up[k]); }
  return { dir, km: Math.hypot(...m), lit, waxing };
}

export function moonPhaseName(lit, waxing) {
  if (lit < 0.03) return 'New moon';
  if (lit > 0.97) return 'Full moon';
  if (Math.abs(lit - 0.5) < 0.06) return waxing ? 'First quarter' : 'Last quarter';
  return `${waxing ? 'Waxing' : 'Waning'} ${lit < 0.5 ? 'crescent' : 'gibbous'}`;
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassPoint = az => POINTS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

// "38° up in the south-east", the way you'd tell someone where to look.
export function whereToLook({ alt, az }) {
  if (alt > 84) return 'straight overhead';
  if (alt < -0.5) return `${Math.round(-alt)}° below the horizon, under the ${compassPoint(az)}`;
  if (alt < 3) return `on the horizon in the ${compassPoint(az)}`;
  return `${Math.round(alt)}° up in the ${compassPoint(az)}`;
}

// How faint a star you can see: the darkness of the place, then however much the Sun and Moon wash out.
// `inText` is how each reads in a sentence: "You can see it from the suburbs", "under a dark sky".
export const SKIES = {
  city: { label: 'City', inText: 'from the city', mag: 3.5, note: 'Only the brightest stars through the glow' },
  suburb: { label: 'Suburbs', inText: 'from the suburbs', mag: 4.6, note: 'The main patterns of the constellations' },
  dark: { label: 'Dark sky', inText: 'under a dark sky', mag: 6.3, note: 'Everything the eye can see, Milky Way and all' },
};

export function limitingMag(sky, sunAlt, moonLit = 0, moonAlt = -90) {
  let m = SKIES[sky]?.mag ?? SKIES.suburb.mag;
  if (moonAlt > 0) m -= 1.2 * moonLit * Math.min(1, moonAlt / 20);
  if (sunAlt > -18) m = Math.min(m, 6.3 - (sunAlt + 18) * 0.42); // twilight brightens from astronomical to civil
  if (sunAlt > -2) m = Math.min(m, -1); // daylight: the Moon and Venus at most
  return m;
}

// What the notice over the sky says while the Sun is up or not far down, or null once it's properly dark.
// `sunAlt` is the Sun's height now, `laterAlt` ten minutes on (rising means dawn), and `getsDark` whether the sky
// goes properly dark in the next day: near midsummer in the far north it doesn't.
export function daylightNote(sunAlt, laterAlt, getsDark = true) {
  const day = sunAlt > -2;
  if (!day && sunAlt <= -12) return null;
  if (!getsDark) {
    return day ? 'It doesn’t get dark here tonight: the Sun never goes far below the horizon. The tags show where the stars are.'
      : 'It doesn’t get dark here tonight: this twilight is as dark as it gets. The tags show where the stars are.';
  }
  if (day) return 'The Sun’s up, so these stars are hidden in daylight for now. The tags show where they are.';
  return laterAlt > sunAlt ? 'Dawn is coming: the fainter stars are going out.' : 'Still twilight: only the brightest stars are out so far.';
}

// The next moment after `from` when the sky is properly dark (the Sun 12° down), searched in 10 minute steps.
export function nextDark(lat, lon, from, hours = 36) {
  for (let t = 0; t <= hours * 6; t++) {
    const date = new Date(+from + t * 600000);
    const jd = jdOf(date);
    if (altAz(toLocal(frame(lat, lon, jd), sunDir(jd))).alt < -12) return date;
  }
  return null;
}

// ---------- Tonight's plan ----------

// When something next rises and next sets, for a place, looking `hours` ahead of `from` (a Date). `dirFn(jd)` is its
// direction at a moment, in the catalogue's axes: sunDir, a star's fixed direction, or the Moon's from where you
// stand. `h0` is the height that counts as the horizon, in degrees: −0.833 for the Sun's or Moon's upper edge (34′ of
// refraction at the horizon and a 16′ half-width, as almanacs take it), −12 for the end of dusk. Found by stepping
// five minutes at a time and halving the step that crosses. Returns { rise, set, always }: each a Date or null, and
// when it does neither in that time, `always` says where it stays: 'up' (up all night) or 'down' (never rises).
export function riseSet(dirFn, lat, lon, from, { h0 = -0.833, hours = 24 } = {}) {
  const STEP = 300000;
  const height = t => { const jd = jdOf(t); return altAz(toLocal(frame(lat, lon, jd), dirFn(jd))).alt - h0; };
  const cross = (t0, t1, rising) => {
    for (let k = 0; k < 20; k++) { const m = (t0 + t1) / 2; if ((height(m) > 0) === rising) t1 = m; else t0 = m; }
    return new Date(Math.round(t1 / 1000) * 1000);
  };
  const start = +from, end = start + hours * 3600000;
  let rise = null, set = null, last = height(start);
  for (let t = start; t < end && !(rise && set); t += STEP) {
    const next = Math.min(t + STEP, end), h = height(next);
    if (last <= 0 && h > 0) rise ||= cross(t, next, true);
    else if (last > 0 && h <= 0) set ||= cross(t, next, false);
    last = h;
  }
  return { rise, set, always: rise || set ? null : last > 0 ? 'up' : 'down' };
}

// The coming night: when the sky is properly dark (the Sun 12° down, as nextDark has it). { start, end, now }: `now`
// when it is dark already, and then `start` is `from`; `end` is null where it stays dark a whole day. Null when it
// doesn't get dark at all in the next day, as near midsummer in the far north.
export function darkHours(lat, lon, from) {
  const dusk = { h0: -12 };
  const jd = jdOf(from);
  if (altAz(toLocal(frame(lat, lon, jd), sunDir(jd))).alt < -12) return { start: new Date(+from), end: riseSet(sunDir, lat, lon, from, dusk).rise, now: true };
  const start = riseSet(sunDir, lat, lon, from, dusk).set;
  return start ? { start, end: riseSet(sunDir, lat, lon, new Date(+start + 60000), dusk).rise, now: false } : null;
}

// The best moment of the coming night to look for a list of stars ([{ name, dir, mag }], `dir` in the catalogue's
// axes): the first moment in the dark when the most of them are more than 15° up and bright enough for this kind of
// sky with the Moon where it is then. Moments are tried every `step` minutes counted from `from`, so a time slider
// that counts the same way can be set to it exactly. { date, minutes, up, night }: `minutes` after `from`, `up` the
// stars on show then, brightest first (none, if none ever is). Null when it doesn't get dark.
const WELL_UP = 15; // degrees
export function bestTime(lat, lon, from, stars, skyKind, { step = 10, night = darkHours(lat, lon, from) } = {}) {
  if (!night) return null;
  const last = Math.min(night.end ? +night.end : Infinity, +from + 24 * 3600000);
  let best = null;
  for (let k = Math.ceil((night.start - from) / (step * 60000)); +from + k * step * 60000 <= last; k++) {
    const date = new Date(+from + k * step * 60000), jd = jdOf(date), f = frame(lat, lon, jd);
    const moon = moonSky(jd, { lat, lon });
    const lim = limitingMag(skyKind, altAz(toLocal(f, sunDir(jd))).alt, moon.lit, altAz(toLocal(f, moon.dir)).alt);
    const up = stars.filter(s => s.mag <= lim && altAz(toLocal(f, s.dir)).alt > WELL_UP);
    if (!best || up.length > best.up.length) best = { date, minutes: k * step, up };
  }
  if (!best) return null; // the dark is over before the next moment to try
  return { ...best, up: [...best.up].sort((a, b) => a.mag - b.mag), night };
}

// The year's main meteor showers, from the International Meteor Organization's 2026 Meteor Shower Calendar (ed.
// J. Rendtel, IMO INFO(3-25)), Table 5, "Working List of Visual Meteor Showers": the dates it is active between
// ([month, day]), the Sun's longitude at its peak in degrees (equinox of 2000: the Earth meets the stream at the same
// point of its orbit every year, so the date of the peak is worked out from this for any year), the point in the sky
// its meteors streak away from (the radiant: right ascension and declination in degrees), and its zenithal hourly
// rate: how many an hour one person would count at the peak under a dark sky with the radiant overhead.
export const SHOWERS = [
  { name: 'Quadrantids', from: [12, 28], to: [1, 12], sun: 283.15, ra: 230, dec: 49, zhr: 80 },
  { name: 'Lyrids', from: [4, 14], to: [4, 30], sun: 32.32, ra: 271, dec: 34, zhr: 18 },
  { name: 'Eta Aquariids', from: [4, 19], to: [5, 28], sun: 45.5, ra: 338, dec: -1, zhr: 50 },
  { name: 'Perseids', from: [7, 17], to: [8, 24], sun: 140.0, ra: 48, dec: 58, zhr: 100 },
  { name: 'Orionids', from: [10, 2], to: [11, 7], sun: 208, ra: 95, dec: 16, zhr: 20 },
  { name: 'Leonids', from: [11, 6], to: [11, 30], sun: 235.27, ra: 152, dec: 22, zhr: 15 },
  { name: 'Geminids', from: [12, 4], to: [12, 20], sun: 262.2, ra: 112, dec: 33, zhr: 150 },
  { name: 'Ursids', from: [12, 17], to: [12, 26], sun: 270.7, ra: 217, dec: 76, zhr: 10 },
];

// The Sun's longitude along the ecliptic of 2000, in degrees: how far round its orbit the Earth is.
export function solarLongitude(jd) {
  const e = earthAt(jd);
  return ((Math.atan2(-e[1], -e[0]) / DEG) + 360) % 360;
}
// The moment of a shower's peak nearest to `near` (a Date): when the Sun reaches the shower's longitude.
export function showerPeak(shower, near) {
  let jd = jdOf(near);
  for (let k = 0; k < 4; k++) jd += ((((shower.sun - solarLongitude(jd)) % 360) + 540) % 360 - 180) / 0.98565; // degrees a day
  return new Date(Math.round((jd - 2440587.5) * 1440) * 60000);
}
export const radiantDir = s => [Math.cos(s.dec * DEG) * Math.cos(s.ra * DEG), Math.cos(s.dec * DEG) * Math.sin(s.ra * DEG), Math.sin(s.dec * DEG)];

// The month and day at a place: [11, 17]. `tz` is its time zone's name; without one, the device's own.
function monthDay(date, tz) {
  let parts;
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, month: 'numeric', day: 'numeric' }).formatToParts(date); }
  catch { parts = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).formatToParts(date); }
  return [Number(parts.find(p => p.type === 'month').value), Number(parts.find(p => p.type === 'day').value)];
}
// The showers active on the local date of a moment, the one nearest its peak first: [{ shower, peak }].
export function showersOn(date, tz) {
  const [m, d] = monthDay(date, tz), day = m * 100 + d;
  return SHOWERS.filter(s => {
    const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
    return a <= b ? day >= a && day <= b : day >= a || day <= b; // the Quadrantids run over New Year
  }).map(shower => ({ shower, peak: showerPeak(shower, date) }))
    .sort((x, y) => Math.abs(x.peak - date) - Math.abs(y.peak - date));
}

// The shower to watch in the coming night, if one is active and its radiant is above the horizon while it's dark:
// { shower, peak, tonight, from, rises, high, az }. `tonight` when the peak is within half a day of the middle of the
// night; `from` the first dark moment the radiant is up, and `rises` when that is later than the dark's start; `high`
// when it stands highest in the dark; `az` the bearing to look along (the radiant's as it climbs past 20°, or at its
// highest if it never gets there).
export function showerTonight(lat, lon, night, tz) {
  if (!night) return null;
  const end = night.end ? +night.end : +night.start + 12 * 3600000;
  for (const { shower, peak } of showersOn(night.start, tz)) {
    const dir = radiantDir(shower);
    let from = null, high = null, top = -90, look = null;
    for (let t = +night.start; t <= end; t += 600000) {
      const { alt, az } = altAz(toLocal(frame(lat, lon, jdOf(t)), dir));
      if (alt > 0 && from === null) from = t;
      if (alt > top) { top = alt; high = t; if (look === null || alt < 20) look = az; }
    }
    if (from === null) continue;
    return { shower, peak, tonight: Math.abs(peak - (+night.start + end) / 2) < 12 * 3600000, from: new Date(from), rises: from > +night.start, high: new Date(high), az: look };
  }
  return null;
}

// Tonight's plan for a place, from `from` (now): the dark hours, what the Moon does in them, the best moment for the
// stars Starfleet charts, and any meteor shower. `stars` are those stars ([{ name, dir, mag }]).
export function tonightPlan(lat, lon, from, stars, skyKind, tz) {
  const night = darkHours(lat, lon, from);
  if (!night) return { night: null, moon: null, best: null, shower: null };
  const hours = Math.max(1 / 6, ((night.end ? +night.end : +night.start + 12 * 3600000) - night.start) / 3600000);
  const moonDir = jd => moonSky(jd, { lat, lon }).dir;
  const m = riseSet(moonDir, lat, lon, night.start, { hours });
  const jd = jdOf(night.start);
  const upAtStart = altAz(toLocal(frame(lat, lon, jd), moonDir(jd))).alt > -0.833;
  const moon = upAtStart ? (m.set ? { does: 'sets', at: m.set } : { does: 'up' }) : (m.rise ? { does: 'rises', at: m.rise } : { does: 'down' });
  return { night, moon, best: bestTime(lat, lon, from, stars, skyKind, { night }), shower: showerTonight(lat, lon, night, tz) };
}

// The plan in three plain lines for the head of the list. `time` writes a Date as a clock time at the place
// ("9:40 pm") and `day` as a date ("17 Nov"); `skyIn` is the kind of sky in a sentence ("from the suburbs").
// { dark, best, shower }: `best` and `shower` are null when there is nothing to say.
export function planLines(plan, { time, day, skyIn }) {
  const { night, moon, best, shower } = plan;
  if (!night) return { dark: 'It doesn’t get dark here tonight: the Sun never goes far below the horizon.', best: null, shower: null };
  let dark = night.now ? (night.end ? `Dark until ${time(night.end)}.` : 'It stays dark here all day.')
    : night.end ? `Dark from ${time(night.start)} to ${time(night.end)}.` : `Dark from ${time(night.start)}.`;
  dark += moon.does === 'sets' ? ` Moon sets ${time(moon.at)}.` : moon.does === 'rises' ? ` Moon rises ${time(moon.at)}.` : moon.does === 'up' ? ' The Moon is up all night.' : ' No Moon tonight.';
  let bestLine = null;
  if (best) {
    const names = best.up.map(s => s.name), n = names.length;
    const who = n === 0 ? '' : n === 1 ? `${names[0]} is up` : n === 2 ? `${names[0]} and ${names[1]} are up` : n === 3 ? `${names[0]}, ${names[1]} and ${names[2]} are up` : `${names[0]}, ${names[1]} and ${n - 2} more are up`;
    bestLine = n === 0 ? `None of Starfleet’s stars gets high and bright enough to see ${skyIn} tonight.`
      : `Best ${best.minutes === 0 ? 'right now' : `at ${time(best.date)}`}: ${who}.`;
  }
  let showerLine = null;
  if (shower) {
    const s = shower.shower, dir = compassPoint(shower.az);
    const look = shower.rises ? `look ${dir} after ${time(shower.from)}`
      : night.end && night.end - shower.high < 30 * 60000 ? `look ${dir}, best in the hours before dawn`
      : `look ${dir} ${night.now ? 'from now on' : 'once it’s dark'}`;
    showerLine = shower.tonight ? `The ${s.name} peak tonight: ${look}. Up to ${s.zhr} an hour under a dark sky.`
      : `The ${s.name} are active tonight (${shower.peak < night.start ? 'peaked' : 'peak'} ${day(shower.peak)}): ${look}. Up to ${s.zhr} an hour at the peak, under a dark sky.`;
  }
  return { dark, best: bestLine, shower: showerLine };
}

// ---------- Where you might be ----------

// Cities to pick from when the phone can't say where it is, and for guessing from the time zone: the first city listed
// for a zone is the guess.
export const CITIES = [
  ['New York', 40.71, -74.01, 'America/New_York'], ['Boston', 42.36, -71.06, 'America/New_York'], ['Washington', 38.91, -77.04, 'America/New_York'],
  ['Toronto', 43.65, -79.38, 'America/Toronto'], ['Chicago', 41.88, -87.63, 'America/Chicago'], ['Houston', 29.76, -95.37, 'America/Chicago'],
  ['Denver', 39.74, -104.99, 'America/Denver'], ['Phoenix', 33.45, -112.07, 'America/Phoenix'], ['Los Angeles', 34.05, -118.24, 'America/Los_Angeles'],
  ['San Francisco', 37.77, -122.42, 'America/Los_Angeles'], ['Seattle', 47.61, -122.33, 'America/Los_Angeles'], ['Vancouver', 49.28, -123.12, 'America/Vancouver'],
  ['Anchorage', 61.22, -149.9, 'America/Anchorage'], ['Honolulu', 21.31, -157.86, 'Pacific/Honolulu'], ['Mexico City', 19.43, -99.13, 'America/Mexico_City'],
  ['Bogotá', 4.71, -74.07, 'America/Bogota'], ['Lima', -12.05, -77.04, 'America/Lima'], ['São Paulo', -23.55, -46.63, 'America/Sao_Paulo'],
  ['Buenos Aires', -34.6, -58.38, 'America/Argentina/Buenos_Aires'], ['Santiago', -33.45, -70.67, 'America/Santiago'], ['Reykjavík', 64.15, -21.94, 'Atlantic/Reykjavik'],
  ['Dublin', 53.35, -6.26, 'Europe/Dublin'], ['London', 51.51, -0.13, 'Europe/London'], ['Lisbon', 38.72, -9.14, 'Europe/Lisbon'],
  ['Madrid', 40.42, -3.7, 'Europe/Madrid'], ['Paris', 48.86, 2.35, 'Europe/Paris'], ['Berlin', 52.52, 13.4, 'Europe/Berlin'],
  ['Rome', 41.9, 12.5, 'Europe/Rome'], ['Stockholm', 59.33, 18.07, 'Europe/Stockholm'], ['Warsaw', 52.23, 21.01, 'Europe/Warsaw'],
  ['Athens', 37.98, 23.73, 'Europe/Athens'], ['Kyiv', 50.45, 30.52, 'Europe/Kyiv'], ['Istanbul', 41.01, 28.98, 'Europe/Istanbul'],
  ['Moscow', 55.76, 37.62, 'Europe/Moscow'], ['Cairo', 30.04, 31.24, 'Africa/Cairo'], ['Lagos', 6.52, 3.38, 'Africa/Lagos'],
  ['Nairobi', -1.29, 36.82, 'Africa/Nairobi'], ['Johannesburg', -26.2, 28.05, 'Africa/Johannesburg'], ['Cape Town', -33.92, 18.42, 'Africa/Johannesburg'],
  ['Riyadh', 24.71, 46.68, 'Asia/Riyadh'], ['Tehran', 35.69, 51.39, 'Asia/Tehran'], ['Dubai', 25.2, 55.27, 'Asia/Dubai'],
  ['Karachi', 24.86, 67.01, 'Asia/Karachi'], ['Mumbai', 19.08, 72.88, 'Asia/Kolkata'], ['Delhi', 28.61, 77.21, 'Asia/Kolkata'],
  ['Dhaka', 23.81, 90.41, 'Asia/Dhaka'], ['Bangkok', 13.76, 100.5, 'Asia/Bangkok'], ['Ho Chi Minh City', 10.82, 106.63, 'Asia/Ho_Chi_Minh'],
  ['Kuala Lumpur', 3.14, 101.69, 'Asia/Kuala_Lumpur'], ['Singapore', 1.35, 103.82, 'Asia/Singapore'], ['Jakarta', -6.21, 106.85, 'Asia/Jakarta'],
  ['Manila', 14.6, 120.98, 'Asia/Manila'], ['Hong Kong', 22.32, 114.17, 'Asia/Hong_Kong'], ['Shanghai', 31.23, 121.47, 'Asia/Shanghai'],
  ['Beijing', 39.9, 116.41, 'Asia/Shanghai'], ['Taipei', 25.03, 121.57, 'Asia/Taipei'], ['Seoul', 37.57, 126.98, 'Asia/Seoul'],
  ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'], ['Perth', -31.95, 115.86, 'Australia/Perth'], ['Adelaide', -34.93, 138.6, 'Australia/Adelaide'],
  ['Brisbane', -27.47, 153.03, 'Australia/Brisbane'], ['Sydney', -33.87, 151.21, 'Australia/Sydney'], ['Melbourne', -37.81, 144.96, 'Australia/Melbourne'],
  ['Auckland', -36.85, 174.76, 'Pacific/Auckland'],
].map(([name, lat, lon, tz]) => ({ name, lat, lon, tz }));

// Browsers still give some zones by the names they had before they were respelt or regrouped (Chrome says
// Asia/Calcutta for India and America/Buenos_Aires for Argentina). Old name to the one the cities above use.
const ZONE_NOW = {
  'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Asia/Chongqing': 'Asia/Shanghai', 'Asia/Chungking': 'Asia/Shanghai', 'Asia/Harbin': 'Asia/Shanghai', PRC: 'Asia/Shanghai',
  'Asia/Istanbul': 'Europe/Istanbul', Turkey: 'Europe/Istanbul', 'Asia/Dacca': 'Asia/Dhaka', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon',
  'Australia/Canberra': 'Australia/Sydney', 'Australia/NSW': 'Australia/Sydney', 'Australia/Victoria': 'Australia/Melbourne',
  'Australia/Queensland': 'Australia/Brisbane', 'Australia/South': 'Australia/Adelaide', 'Australia/West': 'Australia/Perth',
  'US/Eastern': 'America/New_York', 'US/Central': 'America/Chicago', 'US/Mountain': 'America/Denver', 'US/Pacific': 'America/Los_Angeles',
  'US/Arizona': 'America/Phoenix', 'US/Alaska': 'America/Anchorage', 'US/Hawaii': 'Pacific/Honolulu', 'Canada/Eastern': 'America/Toronto', 'Canada/Pacific': 'America/Vancouver',
  'Europe/Belfast': 'Europe/London', GB: 'Europe/London', Eire: 'Europe/Dublin', Japan: 'Asia/Tokyo', ROK: 'Asia/Seoul', Singapore: 'Asia/Singapore',
  Hongkong: 'Asia/Hong_Kong', Iran: 'Asia/Tehran', Egypt: 'Africa/Cairo', NZ: 'Pacific/Auckland', Iceland: 'Atlantic/Reykjavik', 'Brazil/East': 'America/Sao_Paulo',
};

// For a zone with no city above, a latitude typical of its part of the world: the far south, the tropics, or the
// middle latitudes of the north, where most of the rest live. The first pattern that fits wins.
const ZONE_LATITUDES = [
  [/^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham)$|^Atlantic\/(Stanley|South_Georgia)$|^Indian\/(Mauritius|Reunion|Antananarivo)$/, -33],
  [/^America\/(Argentina\/|Buenos_Aires|Cordoba|Rosario|Mendoza|Catamarca|Jujuy|Santiago|Punta_Arenas|Montevideo|Asuncion|Sao_Paulo)/, -33],
  [/^Africa\/(Johannesburg|Maseru|Mbabane|Gaborone|Windhoek|Maputo|Harare|Bulawayo)$/, -25],
  [/^Africa\/(Cairo|Tripoli|Tunis|Algiers|Casablanca|El_Aaiun|Ceuta)$/, 32],
  [/^America\/(La_Paz|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Belem|Fortaleza|Recife|Maceio|Bahia|Araguaina|Santarem|Noronha)$/, -10],
  [/^America\/(Bogota|Lima|Guayaquil|Caracas|Boa_Vista|Cayenne|Paramaribo|Guyana|Panama|Costa_Rica|Managua|Tegucigalpa|El_Salvador|Guatemala|Belize|Cancun|Merida|Jamaica|Havana|Port-au-Prince|Santo_Domingo|Puerto_Rico|Port_of_Spain|Barbados|Martinique|Guadeloupe|Curacao|Aruba|St_(Kitts|Lucia|Thomas|Vincent|Barthelemy)|Grenada|Antigua|Dominica|Anguilla|Montserrat|Tortola|Cayman|Nassau)/, 10],
  [/^Asia\/(Pontianak|Makassar|Ujung_Pandang|Jayapura|Dili|Brunei|Kuching)$|^Pacific\/|^Indian\//, -5],
  [/^Asia\/(Phnom_Penh|Vientiane|Yangon|Colombo|Aden|Macau)$/, 15],
  [/^Asia\/(Kathmandu|Thimphu|Muscat|Qatar|Bahrain|Kuwait)$/, 26],
  [/^Africa\//, 5],
  [/^Europe\//, 50],
  [/^Asia\//, 38],
];
export const zoneLatitude = tz => (ZONE_LATITUDES.find(([re]) => re.test(tz)) || [0, 40])[1];

// A first guess at where someone is from their time zone alone: the zone's city if it has one here, or else the
// longitude its standard time is set by (each hour ahead of Greenwich is 15° east; `standardMin` is minutes ahead)
// at a latitude typical of its part of the world.
export function placeForZone(tz, standardMin = 0) {
  const zone = ZONE_NOW[tz] || tz;
  const city = CITIES.find(c => c.tz === zone);
  if (city) return { name: city.name, lat: city.lat, lon: city.lon, tz, how: 'guess' };
  return { name: 'your time zone', lat: zoneLatitude(zone), lon: standardMin / 4, tz, how: 'guess' };
}

// The rest frame of the phone: which way the back camera faces, and the screen's right and up, in east-north-up,
// from the deviceorientation angles (degrees; alpha measured from north). `screenAngle` is the screen's rotation.
export function phonePose(alpha, beta, gamma, screenAngle = 0) {
  const a = alpha * DEG, b = beta * DEG, g = gamma * DEG;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // Columns of Rz(alpha) · Rx(beta) · Ry(gamma): the phone's own x (right), y (top) and z (out of the screen).
  const X = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
  const Y = [-sa * cb, ca * cb, sb];
  const Z = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
  const t = screenAngle * DEG, ct = Math.cos(t), st = Math.sin(t);
  return {
    forward: Z.map(v => -v),
    right: X.map((v, k) => ct * v - st * Y[k]),
    up: Y.map((v, k) => ct * v + st * X[k]),
  };
}
