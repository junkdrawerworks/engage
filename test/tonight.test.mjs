// Checks the sky overlay's numbers: sidereal time, heights and bearings, the Sun, Moon and planets, and the charts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  jdOf, gmst, frame, toLocal, altAz, fromAltAz, sunDir, planetSky, phaseMag, moonSky, moonPhaseName, whereToLook, limitingMag, nextDark, phonePose,
  CITIES, placeForZone, zoneLatitude,
} from '../js/astro.js';
import { CHARTS } from '../js/charts.js';

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
    ['Asia/Tashkent', 5, 30, 45], ['Europe/Oslo', 1, 45, 60], ['Asia/Kathmandu', 5.75, 20, 30], ['Asia/Katmandu', 5.75, 20, 30], ['UTC', 0, 35, 45], ['', 0, 35, 45],
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
