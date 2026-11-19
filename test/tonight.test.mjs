// Checks the sky overlay's numbers: sidereal time, heights and bearings, the Sun, Moon and planets, and the charts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  jdOf, gmst, frame, toLocal, altAz, fromAltAz, sunDir, planetSky, phaseMag, moonSky, moonPhaseName, whereToLook, limitingMag, nextDark, phonePose,
  CITIES, placeForZone, zoneLatitude, daylightNote,
  riseSet, darkHours, bestTime, SHOWERS, solarLongitude, showerPeak, showersOn, showerTonight, radiantDir, tonightPlan, planLines, compassPoint,
} from '../js/astro.js';
import { CHARTS } from '../js/charts.js';
import { SHOWN_IN, VARIABLES, dimAt, magAt, nextAt, nowLine, onScreen, onScreenParts, phaseAt, variableFor } from '../js/variables.js';
import { buildCatalog, constellationLabels } from '../js/catalog.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not within ${tol} of ${b}`);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI;
const radec = (raH, decD) => { const r = raH * 15 * Math.PI / 180, d = decD * Math.PI / 180; return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]; };

test('sidereal time', () => {
  near(gmst(2451545), 280.46, 0.01, 'at J2000');
  // 1 January 2026 0h UT: 6h 42m 41s (from the Astronomical Almanac's formula)
  near(gmst(jdOf(Date.UTC(2026, 0, 1))), (6 + 42 / 60 + 41 / 3600) * 15, 0.05, 'on 1 January 2026');
});

test('the pole star stands as high as your latitude', () => {
  const polaris = radec(2.53, 89.26);
  for (const lat of [51.5, 34, 10]) {
    const { alt, az } = altAz(toLocal(frame(lat, -0.1, jdOf(Date.UTC(2026, 9, 10, 22))), polaris));
    near(alt, lat, 1, `Polaris from latitude ${lat}`);
    assert.ok(az < 2 || az > 358, 'Polaris is not due north');
  }
});

test('a star crossing the meridian is due south at 90 minus the gap in latitude', () => {
  // Vega when the local sidereal time equals its right ascension. The catalogue has it at 18h 36.9m, +38.78° (the
  // equator and equinox of 2000); the Earth's axis has swung round since, and on 1 July 2026 it is at 18h 37.8m,
  // +38.81° (astropy, FK5 for the date). The frame allows for that: the catalogue's direction crosses the meridian
  // when today's right ascension says, not 2000's, which is 53 seconds earlier.
  const jd0 = jdOf(Date.UTC(2026, 6, 1));
  const lon = 18.63048 * 15 - gmst(jd0); // the longitude where it's on the meridian at that moment
  const { alt, az } = altAz(toLocal(frame(20, lon, jd0), radec(18.615, 38.78)));
  near(alt, 90 - (38.8077 - 20), 0.02, 'Vega’s height');
  near((az + 180) % 360 - 180, 0, 0.1, 'Vega north of the zenith when it culminates from 20°N');
  const old = altAz(toLocal(frame(20, 18.615 * 15 - gmst(jd0), jd0), radec(18.615, 38.78)));
  assert.ok(Math.abs(old.az > 180 ? old.az - 360 : old.az) > 0.3, 'the frame takes the catalogue’s year for today');
});

test('the Sun at noon on the solstice', () => {
  // 21 June 2026, local noon at Greenwich-ish: the Sun about 73.4° up from 40°N.
  let best = -90;
  for (let m = 0; m < 240; m += 2) {
    const jd = jdOf(Date.UTC(2026, 5, 21, 10) + m * 60000);
    best = Math.max(best, altAz(toLocal(frame(40, 0, jd), sunDir(jd))).alt);
  }
  near(best, 90 - 40 + 23.44, 0.2, 'the Sun’s highest');
});

test('the planets are where they were seen', () => {
  // Mars at opposition on 16 January 2025: opposite the Sun.
  let jd = jdOf(Date.UTC(2025, 0, 16));
  assert.ok(angle(planetSky('mars', jd).dir, sunDir(jd)) > 175, 'Mars was not opposite the Sun');
  near(planetSky('mars', jd).mag, -1.4, 0.3, 'Mars at opposition');
  // Venus at greatest elongation, 10 January 2025: 47.2° from the Sun.
  jd = jdOf(Date.UTC(2025, 0, 10));
  near(angle(planetSky('venus', jd).dir, sunDir(jd)), 47.2, 1, 'Venus’s elongation');
  // Jupiter at opposition, 7 December 2024.
  jd = jdOf(Date.UTC(2024, 11, 7));
  assert.ok(angle(planetSky('jupiter', jd).dir, sunDir(jd)) > 177, 'Jupiter was not opposite the Sun');
  near(planetSky('jupiter', jd).mag, -2.8, 0.3, 'Jupiter at opposition');
});

test('Venus and Mercury fade as crescents, the way the Astronomical Almanac works them out', () => {
  // Mallama & Hilton 2018 (Astronomy and Computing 25, 10): over fifty years Venus runs from -4.92 at its brightest
  // to about -3 when it passes between us and the Sun, and Mercury from -2.48 to fainter than +7.
  // On 19 November 2026 Venus is a morning crescent, 26 days past the Sun, 131° round from full: about -4.9.
  const venus = planetSky('venus', jdOf(Date.UTC(2026, 10, 19, 11, 15)));
  near(venus.phase, 130.5, 1, 'Venus’s phase angle');
  assert.ok(venus.mag > -5.0 && venus.mag < -4.6, `Venus at ${venus.mag}`);
  // A whole trip round for each (Venus comes back to the same place against the Sun every 584 days, Mercury 116).
  let v = [9, -9], m = [9, -9];
  for (let jd = jdOf(Date.UTC(2026, 0, 1)); jd < jdOf(Date.UTC(2028, 0, 1)); jd += 0.5) {
    const a = planetSky('venus', jd), b = planetSky('mercury', jd);
    v = [Math.min(v[0], a.mag), Math.max(v[1], a.mag)];
    m = [Math.min(m[0], b.mag), Math.max(m[1], b.mag)];
    if (b.phase > 160) assert.ok(b.mag > 3.5, `Mercury a thin crescent at magnitude ${b.mag}`);
    if (a.phase > 170) assert.ok(a.mag > -4.5, `Venus nearly new at magnitude ${a.mag}`);
  }
  assert.ok(v[0] > -5.0 && v[0] < -4.8, `Venus at its brightest: ${v[0]}`);
  assert.ok(v[1] > -4.0 && v[1] < -3.7, `Venus at its faintest in these two years: ${v[1]}`);
  near(m[0], -2.48, 0.1, 'Mercury at its brightest');
  assert.ok(m[1] > 5.5, `Mercury at its faintest: ${m[1]}`);
  // The two halves of Venus's curve meet where the paper joins them, and the rest is the paper's constants.
  near(phaseMag('venus', 163.7), phaseMag('venus', 163.71), 0.02, 'Venus’s curve at the join');
  near(phaseMag('venus', 0), -4.384, 1e-9, 'Venus full');
  near(phaseMag('mercury', 0), -0.613, 1e-9, 'Mercury full');
  near(phaseMag('mercury', 90), 2.26, 0.01, 'Mercury half lit');
});

test('the Moon, the Sun and the stars stand where astropy puts them', () => {
  // Heights and bearings seen from the place itself (not the Earth's centre), with no bending by the air, from
  // astropy 7 with its built-in ephemeris (ERFA's Moon). The Moon had been up to 2.3° out: one term of its series,
  // and no allowance for where on Earth you stand, which moves it by up to a degree.
  const PLACES = { 'New York': [40.71, -74.01], Sydney: [-33.87, 151.21], 'Reykjavík': [64.15, -21.94], Auckland: [-36.85, 174.76], 'the pole': [89.9, 0] };
  const WHEN = ['2026-11-19T02:00:00Z', '2026-06-21T12:00:00Z', '2027-03-01T10:30:00Z'];
  const MOON = { // [alt, az] for each of WHEN
    'New York': [[37.12, 217.27], [-45.70, 30.29], [18.08, 160.62]],
    Sydney: [[-11.74, 102.79], [18.73, 283.91], [-25.04, 156.29]],
    'Reykjavík': [[-0.83, 259.76], [-8.23, 74.55], [-5.97, 207.52]],
    Auckland: [[7.61, 89.05], [-0.70, 270.25], [-12.15, 137.85]],
    'the pole': [[-5.31, 282.65], [-0.89, 94.89], [-28.42, 233.21]],
  };
  const LIT = [0.656, 0.457, 0.384];
  for (const [name, [lat, lon]] of Object.entries(PLACES)) {
    WHEN.forEach((iso, k) => {
      const jd = jdOf(new Date(iso)), f = frame(lat, lon, jd);
      const moon = moonSky(jd, { lat, lon });
      const [alt, az] = MOON[name][k];
      near(angle(toLocal(f, moon.dir), fromAltAz(alt, az)), 0, 0.2, `the Moon from ${name} at ${iso}`);
      near(moon.lit, LIT[k], 0.02, `how much of the Moon is lit at ${iso}`);
      // From the Earth's centre it is somewhere else, by up to a degree: more when it is low, almost nothing overhead.
      const shift = angle(moonSky(jd).dir, moon.dir);
      assert.ok(shift < 1.02 && (Math.abs(alt) > 20 || shift > 0.8), `the Moon shifts ${shift}° between ${name} and the Earth’s centre`);
    });
  }
  // The night the Moon had set in Reykjavík and was drawn as up: 19 November 2026, 2am.
  const jd = jdOf(new Date(WHEN[0]));
  assert.ok(altAz(toLocal(frame(64.15, -21.94, jd), moonSky(jd, { lat: 64.15, lon: -21.94 }).dir)).alt < -0.5, 'the Moon is still up in Reykjavík');
  // New York, 19 November 2026, 02:00 UTC: the Sun and three stars (catalogue places, with their own drift since 2000 left out).
  const f = frame(40.71, -74.01, jd);
  near(angle(toLocal(f, sunDir(jd)), fromAltAz(-49.63, 289.55)), 0, 0.05, 'the Sun');
  near(angle(toLocal(f, radec(101.2872 / 15, -16.7161)), fromAltAz(-8.98, 104.42)), 0, 0.05, 'Sirius');
  near(angle(toLocal(f, radec(279.2347 / 15, 38.7837)), fromAltAz(21.15, 303.62)), 0, 0.05, 'Vega');
  near(angle(toLocal(f, radec(37.9546 / 15, 89.2641)), fromAltAz(41.23, 0.45)), 0, 0.05, 'Polaris');
});

test('the Moon’s phases', () => {
  const full = moonSky(jdOf(Date.UTC(2026, 9, 26, 4, 12)));  // full moon, 26 October 2026
  assert.ok(full.lit > 0.97, `not full: ${full.lit}`);
  const fresh = moonSky(jdOf(Date.UTC(2026, 9, 10, 15, 50))); // new moon, 10 October 2026
  assert.ok(fresh.lit < 0.03, `not new: ${fresh.lit}`);
  const q = moonSky(jdOf(Date.UTC(2026, 9, 18, 16)));          // first quarter, 18 October 2026
  assert.equal(moonPhaseName(q.lit, q.waxing), 'First quarter');
});

test('words for where to look', () => {
  assert.equal(whereToLook({ alt: 38.2, az: 134 }), '38° up in the south-east');
  assert.equal(whereToLook({ alt: 1, az: 271 }), 'on the horizon in the west');
  assert.equal(whereToLook({ alt: -20, az: 0 }), '20° below the horizon, under the north');
  assert.equal(whereToLook({ alt: 88, az: 0 }), 'straight overhead');
});

test('how faint you can see', () => {
  assert.equal(limitingMag('dark', -30), 6.3);
  assert.ok(limitingMag('city', -30) < limitingMag('suburb', -30));
  assert.ok(limitingMag('dark', -30, 1, 50) < 5.5, 'a full moon high up does not wash out the faint stars');
  assert.ok(limitingMag('dark', -8) < 3, 'twilight does not hide the faint stars');
  assert.ok(limitingMag('dark', 20) <= -1, 'stars show in daylight');
});

test('the next dark sky', () => {
  const noon = new Date(Date.UTC(2026, 9, 10, 17)); // noon in New York
  const dark = nextDark(40.7, -74, noon);
  const local = (dark.getUTCHours() + 24 - 4) % 24 + dark.getUTCMinutes() / 60;
  near(local, 19.75, 0.5, 'dark in New York in October');
});

test('a place guessed from the time zone', () => {
  const guess = (tz, hoursAhead = 0) => placeForZone(tz, hoursAhead * 60);
  // A zone with a city here is that city, whichever of its names the browser gives: Chrome still says Asia/Calcutta
  // for India, America/Buenos_Aires for Argentina, Asia/Saigon for Vietnam and Europe/Kiev for Ukraine.
  for (const [tz, name, lat] of [
    ['Asia/Kolkata', 'Mumbai', 19], ['Asia/Calcutta', 'Mumbai', 19], ['America/Argentina/Buenos_Aires', 'Buenos Aires', -35], ['America/Buenos_Aires', 'Buenos Aires', -35],
    ['Asia/Ho_Chi_Minh', 'Ho Chi Minh City', 11], ['Asia/Saigon', 'Ho Chi Minh City', 11], ['Europe/Kyiv', 'Kyiv', 50], ['Europe/Kiev', 'Kyiv', 50],
    ['America/Lima', 'Lima', -12], ['Asia/Jakarta', 'Jakarta', -6], ['Africa/Lagos', 'Lagos', 7], ['Asia/Shanghai', 'Shanghai', 31], ['Asia/Seoul', 'Seoul', 38],
    ['Asia/Manila', 'Manila', 15], ['Asia/Bangkok', 'Bangkok', 14], ['Asia/Karachi', 'Karachi', 25], ['Asia/Dhaka', 'Dhaka', 24], ['Asia/Tehran', 'Tehran', 36],
    ['Europe/Istanbul', 'Istanbul', 41], ['Europe/Moscow', 'Moscow', 56], ['Africa/Johannesburg', 'Johannesburg', -26], ['America/Bogota', 'Bogotá', 5],
    ['America/Santiago', 'Santiago', -33], ['Australia/Perth', 'Perth', -32], ['Australia/Brisbane', 'Brisbane', -27], ['Australia/Adelaide', 'Adelaide', -35],
    ['Europe/Lisbon', 'Lisbon', 39], ['Europe/Athens', 'Athens', 38], ['Europe/Warsaw', 'Warsaw', 52], ['America/New_York', 'New York', 41], ['US/Pacific', 'Los Angeles', 34],
  ]) {
    const p = guess(tz);
    assert.deepEqual([p.name, Math.round(p.lat), p.how, p.tz], [name, lat, 'guess', tz], tz);
  }
  // A zone with no city is put at the longitude its standard time is set by, at a latitude for its part of the
  // world: not 40° north for the whole of the tropics and the south.
  assert.deepEqual(guess('Europe/Amsterdam', 1), { name: 'your time zone', lat: 50, lon: 15, tz: 'Europe/Amsterdam', how: 'guess' });
  for (const [tz, hours, lo, hi] of [
    ['Africa/Kinshasa', 1, -10, 10], ['Africa/Accra', 0, -10, 10], ['America/Caracas', -4, 0, 15], ['America/Panama', -5, 0, 15], ['America/La_Paz', -4, -20, -5],
    ['Asia/Makassar', 8, -10, 5], ['Pacific/Fiji', 12, -20, 0], ['Indian/Maldives', 5, -10, 10], ['America/Montevideo', -3, -40, -25], ['America/Cordoba', -3, -40, -25],
    ['Australia/Hobart', 10, -45, -30], ['Africa/Maputo', 2, -30, -20], ['Africa/Casablanca', 0, 28, 36], ['America/Halifax', -4, 35, 50], ['America/Winnipeg', -6, 35, 50],
    ['Asia/Tashkent', 5, 30, 45], ['Europe/Oslo', 1, 45, 60], ['America/St_Johns', -3.5, 35, 50], ['America/St_Lucia', -4, 0, 15], ['America/St_Kitts', -4, 0, 15], ['Asia/Kathmandu', 5.75, 20, 30], ['Asia/Katmandu', 5.75, 20, 30], ['UTC', 0, 35, 45], ['', 0, 35, 45],
  ]) {
    const p = guess(tz, hours);
    assert.equal(p.name, 'your time zone', tz);
    assert.ok(p.lat >= lo && p.lat <= hi, `${tz} was put at latitude ${p.lat}`);
    assert.equal(p.lon, hours * 15, tz);
    assert.equal(zoneLatitude(tz), tz === 'Asia/Katmandu' ? 38 : p.lat); // the old spelling is put right before the latitude is looked up
  }
  // Every city is somewhere on Earth, named once, in a zone this browser knows.
  assert.equal(new Set(CITIES.map(c => c.name)).size, CITIES.length);
  for (const c of CITIES) {
    assert.ok(Math.abs(c.lat) < 70 && Math.abs(c.lon) <= 180, c.name);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: c.tz }), c.name);
    // Its clock agrees with its longitude to within a couple of hours (China and Spain keep time well off the Sun's).
    const offset = (Date.UTC(2026, 0, 15, 12) - new Date(new Date(Date.UTC(2026, 0, 15, 12)).toLocaleString('en-US', { timeZone: c.tz }) + ' UTC')) / -3600e3;
    assert.ok(Math.abs(offset - c.lon / 15) < 2.6, `${c.name} at ${c.lon}° keeps time ${offset} hours from Greenwich`);
  }
});

test('the notice over a sky that isn’t dark', () => {
  const sunAt = (lat, lon, date) => altAz(toLocal(frame(lat, lon, jdOf(date)), sunDir(jdOf(date)))).alt;
  const note = (lat, lon, iso) => {
    const date = new Date(iso);
    return daylightNote(sunAt(lat, lon, date), sunAt(lat, lon, new Date(+date + 600000)), !!nextDark(lat, lon, date, 24));
  };
  // New York, 19 November 2026: properly dark at 4am, dawn at 6:15, daylight at noon, dusk at 5:10pm.
  assert.equal(note(40.71, -74.01, '2026-11-19T09:00:00Z'), null);
  assert.equal(note(40.71, -74.01, '2026-11-19T11:15:00Z'), 'Dawn is coming: the fainter stars are going out.');
  assert.match(note(40.71, -74.01, '2026-11-19T17:00:00Z'), /^The Sun’s up, so these stars are hidden in daylight for now/);
  assert.equal(note(40.71, -74.01, '2026-11-19T22:10:00Z'), 'Still twilight: only the brightest stars are out so far.');
  // Reykjavík at midsummer: the Sun dips under the northern horizon and the sky never goes dark.
  assert.equal(nextDark(64.15, -21.94, new Date('2026-06-21T00:30:00Z'), 24), null);
  assert.match(note(64.15, -21.94, '2026-06-21T01:30:00Z'), /^It doesn’t get dark here tonight: this twilight is as dark as it gets/);
  assert.match(note(64.15, -21.94, '2026-06-21T13:00:00Z'), /^It doesn’t get dark here tonight: the Sun never goes far below the horizon/);
  // By late August it does again.
  assert.match(note(64.15, -21.94, '2026-08-25T13:00:00Z'), /^The Sun’s up, so these stars/);
});

test('the phone’s pose', () => {
  // Upright, top to the sky, screen facing you, you facing north: the camera looks north.
  let p = phonePose(0, 90, 0);
  near(angle(p.forward, [0, 1, 0]), 0, 0.01, 'facing north');
  near(angle(p.up, [0, 0, 1]), 0, 0.01, 'top up');
  // Turned to face east (the compass reading 90 means alpha 270).
  p = phonePose(270, 90, 0);
  near(angle(p.forward, [1, 0, 0]), 0, 0.01, 'facing east');
  near(angle(p.right, [0, -1, 0]), 0, 0.01, 'south on the right');
  // Lying flat, screen up: the camera looks at the ground.
  p = phonePose(0, 0, 0);
  near(angle(p.forward, [0, 0, -1]), 0, 0.01, 'looking down');
  // Turned on its side for landscape, still facing north: the screen's up is still the sky.
  p = phonePose(90, 0, -90, 90);
  near(angle(p.forward, [0, 1, 0]), 0, 0.01, 'landscape, facing north');
  near(angle(p.up, [0, 0, 1]), 0, 0.01, 'landscape, sky up');
  near(angle(fromAltAz(0, 90), [1, 0, 0]), 0, 0.01, 'east from an azimuth');
});

test('every chart names a star in the catalogue', async () => {
  const { names } = JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url)));
  for (const c of CHARTS) assert.ok(names.includes(c.star), `${c.star} is not in the catalogue`);
});

// ---------- Tonight's plan ----------

const NY = [40.71, -74.01], SYD = [-33.87, 151.21], REY = [64.15, -21.94];
const mins = (a, iso) => Math.abs(a - new Date(iso)) / 60000;
const moonFrom = (lat, lon) => jd => moonSky(jd, { lat, lon }).dir;

test('sunrise and sunset, to within three minutes', () => {
  // astropy 8.0.3 (its built-in ephemeris), the Sun's centre 0.833° below a flat horizon, as almanacs take sunrise:
  // for each place, the first rise and set after the moment given.
  for (const [what, [lat, lon], from, rise, set] of [
    ['New York in November', NY, '2026-11-18T05:00:00Z', '2026-11-18T11:46:27Z', '2026-11-18T21:35:39Z'],
    ['New York at midsummer', NY, '2026-06-21T05:00:00Z', '2026-06-21T09:25:03Z', '2026-06-22T00:30:44Z'],
    ['Sydney in November', SYD, '2026-11-17T13:00:00Z', '2026-11-17T18:41:59Z', '2026-11-18T08:38:55Z'],
    ['Sydney at midwinter', SYD, '2026-06-20T14:00:00Z', '2026-06-20T20:59:57Z', '2026-06-21T06:53:48Z'],
    ['Reykjavík at midsummer', REY, '2026-06-20T12:00:00Z', '2026-06-21T02:55:06Z', '2026-06-21T00:03:50Z'],
    ['Reykjavík at midwinter', REY, '2026-12-21T00:00:00Z', '2026-12-21T11:22:24Z', '2026-12-21T15:29:17Z'],
    ['Reykjavík at the equinox', REY, '2026-03-20T00:00:00Z', '2026-03-20T07:28:37Z', '2026-03-20T19:43:23Z'],
  ]) {
    const got = riseSet(sunDir, lat, lon, new Date(from));
    assert.ok(mins(got.rise, rise) <= 3, `sunrise, ${what}: ${got.rise.toISOString()} against ${rise}`);
    assert.ok(mins(got.set, set) <= 3, `sunset, ${what}: ${got.set.toISOString()} against ${set}`);
    assert.equal(got.always, null);
  }
});

test('the end of dusk, the start of dawn, and the Moon’s rising and setting', () => {
  // astropy again: the Sun 12° down, and the Moon's centre 0.833° down as seen from the place itself.
  const dusk = { h0: -12 };
  for (const [what, [lat, lon], from, dawn, dark] of [
    ['New York', NY, '2026-11-18T05:00:00Z', '2026-11-18T10:43:35Z', '2026-11-18T22:38:30Z'],
    ['Sydney', SYD, '2026-11-17T13:00:00Z', '2026-11-17T17:40:49Z', '2026-11-18T09:40:15Z'],
    ['Reykjavík at midwinter', REY, '2026-12-21T00:00:00Z', '2026-12-21T08:53:53Z', '2026-12-21T17:57:48Z'],
  ]) {
    const got = riseSet(sunDir, lat, lon, new Date(from), dusk);
    assert.ok(mins(got.rise, dawn) <= 3 && mins(got.set, dark) <= 3, `${what}: dawn ${got.rise.toISOString()}, dark ${got.set.toISOString()}`);
  }
  for (const [what, [lat, lon], from, rise, set] of [
    ['New York', NY, '2026-06-21T05:00:00Z', '2026-06-21T16:49:28Z', '2026-06-22T04:50:39Z'],
    ['Sydney', SYD, '2026-06-20T14:00:00Z', '2026-06-21T01:24:56Z', '2026-06-21T13:38:55Z'],
    ['Reykjavík', REY, '2026-03-20T00:00:00Z', '2026-03-20T07:13:41Z', '2026-03-20T22:58:13Z'],
  ]) {
    const got = riseSet(moonFrom(lat, lon), lat, lon, new Date(from));
    assert.ok(mins(got.rise, rise) <= 4 && mins(got.set, set) <= 4, `the Moon from ${what}: rises ${got.rise.toISOString()}, sets ${got.set.toISOString()}`);
  }
});

test('what never rises, what never sets, and a search that crosses midnight', () => {
  const from = new Date('2026-11-18T23:00:00Z');
  // From New York the pole star never sets and the Southern Cross never rises.
  assert.deepEqual(riseSet(() => radec(2.53, 89.26), ...NY, from), { rise: null, set: null, always: 'up' });
  assert.deepEqual(riseSet(() => radec(12.45, -60), ...NY, from), { rise: null, set: null, always: 'down' });
  // The midnight Sun in Tromsø, and its midwinter with no sunrise; at the poles themselves, six months of each.
  assert.equal(riseSet(sunDir, 69.65, 18.96, new Date('2026-06-21T00:00:00Z')).always, 'up');
  assert.equal(riseSet(sunDir, 69.65, 18.96, new Date('2026-12-21T00:00:00Z')).always, 'down');
  assert.equal(riseSet(sunDir, 90, 0, new Date('2026-06-21T00:00:00Z')).always, 'up');
  assert.equal(riseSet(sunDir, -90, 0, new Date('2026-06-21T00:00:00Z')).always, 'down');
  // Asked at 11 pm, the next sunrise is tomorrow's and so is the next sunset, and each is found once.
  const late = riseSet(sunDir, ...NY, new Date('2026-11-19T04:00:00Z'));
  assert.ok(mins(late.rise, '2026-11-19T11:47:30Z') <= 4 && mins(late.set, '2026-11-19T21:35:00Z') <= 4, JSON.stringify(late));
  assert.ok(late.rise < late.set);
  // A shorter search finds only what happens in it.
  assert.deepEqual(riseSet(sunDir, ...NY, new Date('2026-11-19T04:00:00Z'), { hours: 3 }), { rise: null, set: null, always: 'down' });
});

test('the coming night', () => {
  // By day: tonight's dusk to tomorrow's dawn. In the dark: from now to dawn. (New York, 18 November 2026.)
  const day = darkHours(...NY, new Date('2026-11-18T14:00:00Z'));
  assert.ok(mins(day.start, '2026-11-18T22:38:30Z') <= 3 && mins(day.end, '2026-11-19T10:44:40Z') <= 4 && !day.now, JSON.stringify(day));
  const night = darkHours(...NY, new Date('2026-11-19T02:00:00Z'));
  assert.ok(night.now && +night.start === +new Date('2026-11-19T02:00:00Z') && mins(night.end, '2026-11-19T10:44:40Z') <= 4, JSON.stringify(night));
  // In twilight after sunset it is tonight's; in twilight before sunrise, the next evening's.
  assert.ok(mins(darkHours(...NY, new Date('2026-11-18T22:00:00Z')).start, '2026-11-18T22:38:30Z') <= 3);
  assert.ok(mins(darkHours(...NY, new Date('2026-11-18T11:00:00Z')).start, '2026-11-18T22:38:30Z') <= 3);
  // Reykjavík in June never gets dark; Tromsø in December gets light enough to end the dark for a few hours at noon;
  // at the south pole in June it is dark all day and the night has no end to give.
  assert.equal(darkHours(...REY, new Date('2026-06-20T22:00:00Z')), null);
  const tromso = darkHours(69.65, 18.96, new Date('2026-12-20T12:00:00Z'));
  assert.ok(tromso && !tromso.now && tromso.end > tromso.start && (tromso.end - tromso.start) / 3600000 > 14);
  assert.deepEqual(darkHours(-90, 0, new Date('2026-06-21T00:00:00Z')), { start: new Date('2026-06-21T00:00:00Z'), end: null, now: true });
});

test('the best time to look', () => {
  // Three stars from New York on 18 November 2026: Vega and Deneb are up at dusk and sinking, Sirius rises late.
  const stars = [{ name: 'Sirius', dir: radec(6.752, -16.72), mag: -1.46 }, { name: 'Vega', dir: radec(18.616, 38.78), mag: 0.03 }, { name: 'Deneb', dir: radec(20.69, 45.28), mag: 1.25 }];
  const from = new Date('2026-11-18T14:00:00Z'); // 9 am
  const best = bestTime(...NY, from, stars, 'suburb');
  // The first ten-minute mark after dusk (5:38 pm), counted from `from`.
  assert.equal(best.minutes, 520);
  assert.equal(+best.date, +from + 520 * 60000);
  assert.deepEqual(best.up.map(s => s.name), ['Vega', 'Deneb']);
  // What it reports up really is: over 15° and the Sun 12° down.
  const f = frame(...NY, jdOf(best.date));
  for (const s of best.up) assert.ok(altAz(toLocal(f, s.dir)).alt > 15);
  assert.ok(altAz(toLocal(f, sunDir(jdOf(best.date)))).alt < -12);
  // In the dark already, with those two still up, the best time is now.
  assert.equal(bestTime(...NY, new Date('2026-11-18T23:00:00Z'), stars, 'suburb').minutes, 0);
  // After midnight Vega and Deneb have gone down and only Sirius is well up: the count can't be beaten, so it's now.
  const small = bestTime(...NY, new Date('2026-11-19T07:00:00Z'), stars, 'suburb');
  assert.deepEqual([small.minutes, small.up.map(s => s.name)], [0, ['Sirius']]);
  // A star too faint for the sky is never counted, so with only that one there is nothing to wait for.
  const none = bestTime(...NY, from, [{ name: 'Faint', dir: radec(18.616, 38.78), mag: 5.5 }], 'city');
  assert.deepEqual([none.up, none.minutes], [[], 520]);
  // With a night that crosses midnight the best moment can be after it: Sirius alone, from 9 am.
  const sirius = bestTime(...NY, from, [stars[0]], 'suburb');
  assert.ok(sirius.date > new Date('2026-11-19T03:30:00Z') && sirius.date < new Date('2026-11-19T10:44:00Z'), sirius.date.toISOString());
  assert.equal(sirius.minutes % 10, 0);
  // No dark, no best time.
  assert.equal(bestTime(...REY, new Date('2026-06-20T22:00:00Z'), stars, 'suburb'), null);
});

test('the meteor showers are the IMO calendar’s', () => {
  // International Meteor Organization, 2026 Meteor Shower Calendar, Table 5.
  assert.deepEqual(SHOWERS.map(s => [s.name, s.from, s.to, s.sun, s.ra, s.dec, s.zhr]), [
    ['Quadrantids', [12, 28], [1, 12], 283.15, 230, 49, 80],
    ['Lyrids', [4, 14], [4, 30], 32.32, 271, 34, 18],
    ['Eta Aquariids', [4, 19], [5, 28], 45.5, 338, -1, 50],
    ['Perseids', [7, 17], [8, 24], 140.0, 48, 58, 100],
    ['Orionids', [10, 2], [11, 7], 208, 95, 16, 20],
    ['Leonids', [11, 6], [11, 30], 235.27, 152, 22, 15],
    ['Geminids', [12, 4], [12, 20], 262.2, 112, 33, 150],
    ['Ursids', [12, 17], [12, 26], 270.7, 217, 76, 10],
  ]);
  // The peaks worked out from the Sun's longitude land on the moments the calendar's text gives for 2026.
  const peak = (name, near) => showerPeak(SHOWERS.find(s => s.name === name), new Date(near));
  for (const [name, near, when] of [
    ['Lyrids', '2026-04-15', '2026-04-22T19:40:00Z'], ['Perseids', '2026-08-01', '2026-08-13T03:00:00Z'], ['Leonids', '2026-11-25', '2026-11-17T23:45:00Z'],
    ['Geminids', '2026-12-05', '2026-12-14T14:00:00Z'], ['Ursids', '2026-12-18', '2026-12-22T22:00:00Z'],
  ]) assert.ok(mins(peak(name, near), when) <= 65, `${name}: ${peak(name, near).toISOString()} against ${when}`);
  // Each lands on the day the calendar's table gives (in UT), for the year asked about.
  for (const [name, near, day] of [['Quadrantids', '2026-01-01', '2026-01-03'], ['Eta Aquariids', '2026-05-01', '2026-05-06'], ['Orionids', '2026-10-10', '2026-10-21'], ['Quadrantids', '2026-12-30', '2027-01-04']]) {
    assert.equal(peak(name, near).toISOString().slice(0, 10), day, name);
  }
  // At the March equinox of 2026 the Sun is at 0° on the equinox of that date, which has slipped back 0.37° since 2000.
  near(solarLongitude(jdOf(new Date('2026-03-20T14:46:00Z'))), 359.63, 0.05, 'the Sun’s longitude at the 2026 March equinox, against the equinox of 2000');
});

test('which shower is on', () => {
  const on = (iso, tz) => showersOn(new Date(iso), tz).map(x => x.shower.name);
  assert.deepEqual(on('2026-11-18T23:00:00Z', 'America/New_York'), ['Leonids']);
  assert.deepEqual(on('2026-10-01T12:00:00Z', 'America/New_York'), []);
  // The local date decides: the Leonids start on 6 November, which Sydney reaches while New York is still on the 5th.
  assert.deepEqual(on('2026-11-05T20:00:00Z', 'Australia/Sydney'), ['Leonids', 'Orionids']);
  assert.deepEqual(on('2026-11-05T20:00:00Z', 'America/New_York'), ['Orionids']);
  // Two at once: the one nearer its peak comes first. Over New Year the Quadrantids are on both sides of it.
  assert.deepEqual(on('2026-12-19T12:00:00Z', 'Europe/London'), ['Ursids', 'Geminids']);
  assert.deepEqual(on('2026-12-31T12:00:00Z', 'Europe/London'), ['Quadrantids']);
  assert.deepEqual(on('2027-01-02T12:00:00Z', 'Europe/London'), ['Quadrantids']);
  assert.deepEqual(on('2026-12-31T12:00:00Z', 'No/Such_Zone').length, 1); // an unknown zone falls back to the device's
  near(angle(radiantDir({ ra: 152, dec: 22 }), radec(152 / 15, 22)), 0, 1e-9, 'the Leonids’ radiant');
});

test('tonight’s plan, line by line', () => {
  const fmt = tz => ({
    time: d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).toLowerCase(),
    day: d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz }),
    skyIn: 'from the suburbs',
  });
  const stars = [{ name: 'Rigel VII', dir: radec(5.242, -8.2), mag: 0.18 }, { name: 'Vega colony', dir: radec(18.616, 38.78), mag: 0.03 }, { name: 'Farpoint', dir: radec(20.69, 45.28), mag: 1.25 }, { name: 'Capella IV', dir: radec(5.278, 46), mag: 0.08 }];
  const lines = (place, iso, tz, list = stars, sky = 'suburb') => planLines(tonightPlan(...place, new Date(iso), list, sky, tz), fmt(tz));
  // New York on the evening of 18 November 2026, the day after the Leonids' peak, the Moon a day past first quarter.
  assert.deepEqual(lines(NY, '2026-11-18T14:00:00Z', 'America/New_York'), {
    dark: 'Dark from 5:38 pm to 5:44 am. Moon sets 1:00 am.',
    best: 'Best at 9:20 pm: Vega colony, Capella IV and 2 more are up.',
    shower: 'The Leonids are active tonight (peaked 17 Nov): look east after 10:58 pm. Up to 15 an hour at the peak, under a dark sky.',
  });
  const dark = lines(NY, '2026-11-19T02:20:00Z', 'America/New_York');
  assert.equal(dark.dark, 'Dark until 5:44 am. Moon sets 1:00 am.');
  assert.equal(dark.best, 'Best right now: Vega colony, Capella IV and 2 more are up.');
  assert.equal(lines(NY, '2026-11-19T02:20:00Z', 'America/New_York', stars.slice(1)).best.replace(/^Best [^:]+/, 'Best'), 'Best: Vega colony, Capella IV and Farpoint are up.');
  assert.equal(lines(NY, '2026-11-19T02:20:00Z', 'America/New_York', stars.slice(2)).best.replace(/^Best [^:]+/, 'Best'), 'Best: Capella IV and Farpoint are up.');
  // Sydney the same evening: the peak fell on the 18th there, and Leo rises in the small hours.
  const syd = lines(SYD, '2026-11-18T08:30:00Z', 'Australia/Sydney');
  assert.match(syd.dark, /^Dark from 8:40 pm to 4:40 am\. Moon sets 2:0\d am\.$/);
  assert.match(syd.shower, /^The Leonids are active tonight \(peaked 18 Nov\): look north-east after 2:\d\d am\. /);
  assert.equal(lines(SYD, '2026-11-18T08:30:00Z', 'Australia/Sydney', [stars[2]]).best, 'None of Starfleet’s stars gets high and bright enough to see from the suburbs tonight.');
  assert.equal(lines(SYD, '2026-11-18T08:30:00Z', 'Australia/Sydney', [stars[0]]).best.replace(/\d+:\d\d [ap]m/, 'T'), 'Best at T: Rigel VII is up.');
  // Reykjavík in June: one line, in the words the notice over the sky uses, and no best time or shower to offer.
  assert.deepEqual(lines(REY, '2026-06-20T22:00:00Z', 'Atlantic/Reykjavik'), { dark: 'It doesn’t get dark here tonight: the Sun never goes far below the horizon.', best: null, shower: null });
  assert.ok(daylightNote(5, 4, false).startsWith('It doesn’t get dark here tonight: the Sun never goes far below the horizon.'));
  // The night of a peak, and the nights before it; a radiant that is up at dusk; one that climbs until dawn.
  const gem = lines(NY, '2026-12-13T22:00:00Z', 'America/New_York');
  assert.match(gem.shower, /^The Geminids peak tonight: look (north-east|east) after \d+:\d\d pm\. Up to 150 an hour under a dark sky\.$/);
  assert.match(gem.dark, /Moon sets 8:4\d pm\.$/);
  assert.match(lines(NY, '2026-12-14T02:00:00Z', 'America/New_York').dark, /^Dark until 6:06 am\. No Moon tonight\.$/);
  assert.match(lines(NY, '2026-12-10T22:00:00Z', 'America/New_York').shower, /^The Geminids are active tonight \(peak 14 Dec\): /);
  assert.equal(lines(NY, '2026-08-13T01:00:00Z', 'America/New_York').shower, 'The Perseids peak tonight: look north-east, best in the hours before dawn. Up to 100 an hour under a dark sky.');
  assert.match(lines(REY, '2026-12-20T22:00:00Z', 'Atlantic/Reykjavik').shower, /^The Ursids are active tonight \(peak 22 Dec\): look north/);
  // No shower in early October in the north once the radiant's out of reach... and none where its radiant never rises:
  // the Ursids, 14° from the pole star, from Sydney.
  assert.equal(lines(NY, '2026-10-01T14:00:00Z', 'America/New_York').shower, null);
  assert.equal(lines(SYD, '2026-12-22T08:30:00Z', 'Australia/Sydney').shower, null);
  assert.equal(showerTonight(...SYD, darkHours(...SYD, new Date('2026-12-22T08:30:00Z')), 'Australia/Sydney'), null);
  assert.equal(compassPoint(showerTonight(...NY, darkHours(...NY, new Date('2026-11-18T14:00:00Z')), 'America/New_York').az), 'east');
  // The Moon in every state: rising in the night, up all through it, and down all through it.
  assert.match(lines(NY, '2027-01-03T23:00:00Z', 'America/New_York').dark, /^Dark until 6:1\d am\. Moon rises 4:5\d am\.$/);
  assert.match(lines([69.65, 18.96], '2026-12-20T12:00:00Z', 'Europe/Oslo').dark, /^Dark from 3:3\d pm to 7:4\d am\. The Moon is up all night\.$/);
  assert.equal(lines([-90, 0], '2026-06-21T00:00:00Z', 'UTC').dark.split('.')[0], 'It stays dark here all day');
});

// ---------- Constellation names ----------

test('each constellation’s name has a place on its own figure', async () => {
  const bin = await readFile(new URL('../data/stars.bin', import.meta.url));
  const meta = JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url), 'utf8'));
  const cat = buildCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
  const labels = constellationLabels(cat);
  // All 88, once each, by the names the star cards use, each a direction inside its own boundaries.
  assert.equal(labels.length, 88);
  assert.deepEqual(labels.map(l => l.name).sort(), meta.constellations.map(c => c[1]).sort());
  for (const l of labels) {
    near(Math.hypot(...l.dir), 1, 1e-9, `${l.name}’s direction`);
    assert.equal(cat.constellationToward(l.dir), l.name, `${l.name}’s name would be written in ${cat.constellationToward(l.dir)}`);
  }
  const at = name => labels.find(l => l.name === name).dir;
  // Orion's is within 10° of the middle star of his belt (Alnilam), Crux's within 3° of the middle of the cross, and
  // Lyra's and Leo's sit by their figures.
  assert.ok(angle(at('Orion'), radec(5.6036, -1.2)) < 10, `Orion’s name is ${angle(at('Orion'), radec(5.6036, -1.2))}° from his belt`);
  assert.ok(angle(at('Crux'), radec(12.45, -60)) < 3);
  assert.ok(angle(at('Lyra'), radec(18.85, 35)) < 4);
  assert.ok(angle(at('Leo'), radec(10.6, 18)) < 6);
  // A winding figure's mean lands next door (Hydra's in Sextans, Eridanus's in Fornax), and Serpens, in two halves
  // either side of Ophiuchus, averages out between them: each is moved onto a star of its own figure.
  for (const name of ['Hydra', 'Eridanus', 'Serpens']) {
    const star = cat.lines.flat().some(i => angle(at(name), [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]]) < 1e-4);
    assert.ok(star, `${name}’s name is not on one of its stars`);
  }
  // Serpens is one constellation, whichever half a direction falls in (the data used to call both halves Serpens Cauda).
  assert.equal(cat.constellationToward(radec(15.74, 6.4)), 'Serpens'); // Unukalhai, in the head
  assert.equal(cat.constellationToward(radec(18.35, -2.9)), 'Serpens'); // Eta Serpentis, in the tail
  assert.equal(cat.constellationToward(radec(18.616, 38.78)), 'Lyra');
});


// ---------- Stars that behave ----------

test('the variable stars keep their published timings', async () => {
  const { names } = JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url)));
  for (const v of VARIABLES) assert.ok(names.includes(v.star), `${v.star} is not in the catalogue`);
  const algol = variableFor('Algol'), mira = variableFor('Mira'), cep = variableFor('δ Cephei');
  // Algol's minima as the RASC Observer's Handbook 2025 lists them (to its minute, and a few minutes either side).
  for (const iso of ['2025-01-02T07:53:00Z', '2025-05-02T18:23:00Z', '2025-12-03T19:22:00Z']) {
    const p = phaseAt(algol, Date.parse(iso));
    assert.ok(Math.min(p, 1 - p) * algol.period * 1440 < 20, `Algol's minimum at ${iso} is ${Math.round(Math.min(p, 1 - p) * algol.period * 1440)} minutes out`);
  }
  // Mira peaked about 10 May 2024; Delta Cephei's GCVS maximum is JD 2455479.905.
  const pm = phaseAt(mira, Date.parse('2024-05-10T00:00:00Z'));
  assert.ok(Math.min(pm, 1 - pm) * mira.period < 3);
  assert.ok(phaseAt(cep, (2455479.905 - 2440587.5) * 86400000 + 10 * 5.366208 * 86400000) < 1e-6);
  // The light curves: Algol is dimmest mid-eclipse and steady outside it; a pulsing star is brightest at the peak
  // and faintest just before it starts to rise.
  assert.equal(dimAt(algol, 0), 1);
  assert.equal(dimAt(algol, 0.5), 0);
  assert.equal(dimAt(algol, algol.span / 2), 0);
  assert.equal(magAt(cep, 0), 3.5);
  assert.ok(Math.abs(magAt(cep, 1 - cep.rise) - 4.4) < 1e-9);
  const t = Date.parse('2026-11-19T05:00:00Z');
  assert.equal(phaseAt(algol, nextAt(algol, t)) < 1e-9 || phaseAt(algol, nextAt(algol, t)) > 1 - 1e-9, true);
  assert.ok(nextAt(algol, t) > t && nextAt(algol, t) - t <= algol.period * 86400000);
  assert.equal(phaseAt(variableFor('Betelgeuse'), t), null);
});

test('a variable star says where in its cycle it is', () => {
  const when = t => new Date(t).toISOString().slice(0, 16), day = t => new Date(t).toISOString().slice(0, 10);
  const algol = variableFor('Algol');
  assert.equal(nowLine(algol, Date.parse('2026-11-19T05:00:00Z'), { when, day }),
    'An eclipsing star: every 2.87 days its dimmer companion passes in front of it. It’s shining at its usual magnitude 2.1 now. The next eclipse is deepest 2026-11-21T11:36, when it fades to 3.4 for a few hours either side.');
  assert.match(nowLine(algol, Date.parse('2026-12-20T00:00:00Z'), { when, day, fromEarth: true }), /Seen from Earth, it’s in eclipse now, at magnitude 2\.2 and fading to 3\.4, deepest 2026-12-20T03:4\d\.$/);
  assert.match(nowLine(variableFor('Mira'), Date.parse('2024-05-01T00:00:00Z'), { when, day }), /near its brightest now.*peak due about 2024-05-1\d/);
  assert.match(nowLine(variableFor('Mira'), Date.parse('2026-11-19T00:00:00Z'), { when, day }), /brightening now, at about magnitude [67]\.\d, too faint to see without a telescope\. The next peak is due about 2027-01-3\d\.$/);
  assert.match(nowLine(variableFor('δ Cephei'), Date.parse('2026-11-19T05:00:00Z'), { when, day }), /^A Cepheid.* It’s fading now, at magnitude 4\.\d, and next at its brightest, magnitude 3\.5, 2026-11-22T03:1\d\.$/);
  assert.match(nowLine(variableFor('Betelgeuse'), 0, { when, day }), /no saying where in its cycle/);
  assert.match(nowLine(variableFor('Proxima Centauri'), 0, { when, day }), /^A flare star.*68 times brighter/);
});

test('on the viewscreen a star that behaves does what it does, sped up', () => {
  const algol = variableFor('Algol'), mira = variableFor('Mira'), prox = variableFor('Proxima Centauri');
  // Algol: steady, then one eclipse each cycle of the viewscreen's, at most 1.3 magnitudes deep.
  assert.deepEqual(onScreen(algol, SHOWN_IN * 0.5), { light: 1, size: 1, glow: 1 });
  assert.ok(Math.abs(onScreen(algol, SHOWN_IN * 3).light - 10 ** (-0.4 * 1.3)) < 1e-9);
  // Mira: dimmest and widest just before it rises, and back to itself at the peak.
  const low = onScreen(mira, SHOWN_IN * (1 - mira.rise));
  assert.ok(low.light < 0.31 && low.size > 1.15, JSON.stringify(low));
  assert.deepEqual(onScreen(mira, 0), { light: 1, size: 1, glow: 1 });
  // Proxima: a flicker, and a flare in every nine seconds.
  for (let w = 0; w < 20; w++) {
    let top = 0;
    for (let s = w * 9; s < w * 9 + 9; s += 0.05) top = Math.max(top, onScreen(prox, s).light);
    assert.ok(top > 2.5, `no flare between ${w * 9} and ${w * 9 + 9} seconds`);
  }
  assert.ok(onScreen(prox, 0.5).light < 1.2);
  // The header says the real period, and that the viewscreen speeds it up, unless reduced motion keeps it still.
  assert.deepEqual(onScreenParts(algol), ['Dims every 2.87 days', 'sped up']);
  assert.deepEqual(onScreenParts(algol, false), ['Dims every 2.87 days']);
  for (const v of VARIABLES) assert.ok(onScreenParts(v)[0].length <= 22, `${v.star}'s line is too long for a phone's header`);
});
