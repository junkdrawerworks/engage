// The numbers and the log, checked without a browser:  node --test test/physics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { warpSpeed, apparentMag, formatDuration, formatLy, formatYear, roughLy, tripYears, voyagerYears, physical, holdDistanceAU, spectral, massFor, widthFor } from '../js/physics.js';
import { THIN_LY, arrivalFirsts, chartedSaid, companions, describeKind, earthYear, homeLines, composeEntry, inTextFor, logRecords, momentFor, nearestStars, skyFrom, skyLine, starKinds, titleFor, tripLine } from '../js/log.js';
import { ANCHORS, DESTINATIONS } from '../js/destinations.js';
import { SHIPS, byId as shipById } from '../js/ships.js';
import { CLASSES, quizReadings, fileForHome, streakRecord } from '../js/classes.js';
import { rng, grow } from '../js/xeno-gen.js';
import { CHARTS } from '../js/charts.js';
import { lifeLine, lifetimeYears, massFromLum, reachLine, temperateAU, temperateLine } from '../js/lives.js';
import { sweep } from './sweep.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// loadCatalog fetches relative URLs; answer them from the repo.
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const cat = await loadCatalog();
const at = name => { const i = cat.byName.get(name); return [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]]; };

test('warp factors follow the familiar scale', () => {
  assert.equal(warpSpeed(1), 1);
  assert.ok(Math.abs(warpSpeed(9) - 1516) < 1);
  assert.ok(Math.abs(warpSpeed(9.9) - 3053) < 1);
  assert.ok(warpSpeed(9.5) > warpSpeed(9) && warpSpeed(9.5) < warpSpeed(9.9));
  for (let w = 1; w < 9.9; w += 0.1) assert.ok(warpSpeed(w + 0.1) > warpSpeed(w), `warp ${w}`);
});

test('trip times read sensibly', () => {
  assert.equal(formatDuration(tripYears(4.37, 9)), '1 day 1 hour');
  assert.equal(formatDuration(voyagerYears(4.37)), '77,000 years');
  assert.equal(formatDuration(4.2), '4 years');
  assert.equal(formatDuration(0.5 / 8766), '30 minutes');
  assert.equal(formatLy(0.0000008), '0.05 AU');
  assert.equal(formatYear(-470), '471 BCE');
});

test('trip times round before they pick a unit', () => {
  const hours = h => h / 8766;
  assert.equal(formatDuration(tripYears(8.6, 9.1)), '2 days'); // Sirius at warp 9.1: 47.7 hours
  assert.equal(formatDuration(hours(47.6)), '2 days');
  assert.equal(formatDuration(hours(30)), '1 day 6 hours');
  assert.equal(formatDuration(hours(24.4)), '1 day');
  assert.equal(formatDuration(hours(23.6)), '1 day');
  assert.equal(formatDuration(hours(0.995)), '1 hour');
  assert.equal(formatDuration(59.7 / 365.25), '2 months');
  assert.equal(formatDuration(1.99), '2 years');
  // Deneb near warp 8.9 is a year away: "1 year", where it used to read "12 months".
  assert.equal(formatDuration(1), '1 year');
  assert.equal(formatDuration(0.96), '1 year');
  assert.equal(formatDuration(0.95), '11 months');
  assert.equal(formatDuration(1.05), '13 months');
});

// Every trip time from a few seconds to a hundred billion years, 2,000 values to a decade. (Past a million years the
// helm writes the figure out, "1,800,000 years": it has no word for a million, so that isn't looked for here.)
test('trip times read right at every unit\'s edge', () => {
  assert.deepEqual(sweep(formatDuration, -9, 11, { million: false }), []);
  assert.deepEqual(sweep(formatLy, -6, 7), []);
});

test('the Sun comes out like the Sun', () => {
  const sun = physical(4.83, 0.656);
  assert.ok(Math.abs(sun.temp - 5772) < 100);
  assert.ok(Math.abs(sun.lum - 1) < 0.1);
  assert.ok(Math.abs(apparentMag(4.83, 1 / 206265) + 26.74) < 0.05);
  assert.ok(Math.abs(holdDistanceAU(1) - 0.213) < 0.01);
});

test('every destination is in the catalogue', () => {
  for (const d of DESTINATIONS) assert.ok(cat.byName.has(d.star), d.star);
  assert.equal(cat.names[0], 'Sol');
  assert.ok(cat.count > 18000);
});

test('from Alpha Centauri the Sun is a bright star in Cassiopeia', () => {
  const [first] = homeLines(cat, at('Rigil Kentaurus'), 2026, cat.byName.get('Rigil Kentaurus'));
  assert.match(first, /magnitude 0\.\d star.* in Cassiopeia\./);
});

test('Earth’s old light is dated from today, not from New Year', () => {
  const home = (name, date) => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 1, date: new Date(date) }).sections.find(s => s[0] === 'Looking home')[1]; };
  // Sirius is 8.60 ly away. On 18 November 2026 (2026.88) its view of Earth is from early 2018; it used to say 2017.
  assert.match(home('Sirius', '2026-11-18T12:00:00Z'), /Earth as it was in 2018, the year Voyager 2 left the Sun’s bubble for interstellar space\./);
  assert.match(home('Sirius', '2026-02-01T12:00:00Z'), /Earth as it was in 2017[.,]/);
  // The year is the one the light left in, not the nearest: on 1 May (2026.33) that is still 2017, three quarters gone.
  assert.match(home('Sirius', '2026-05-01T12:00:00Z'), /Earth as it was in 2017[.,]/);
  assert.match(home('Sirius', '2026-08-15T12:00:00Z'), /Earth as it was in 2018[.,]/);
  // The TV line turns over during the year too: 1936 + 8.60 is mid-1944 either way.
  assert.match(home('Sirius', '2026-11-18T12:00:00Z'), /first passed here around 1945\./);
  // Antares sees 1472 or so: not "around when" Columbus sailed, twenty years later.
  const antares = home('Antares', '2026-11-18T12:00:00Z');
  assert.match(antares, /Earth as it was in 14\d\d\./);
  assert.doesNotMatch(antares, /Columbus/);
  // Before 1900 a moment is offered within two years of it, or ten before 1500, as "around when".
  const lines = (ly, year) => homeLines(cat, [ly / 3.26156, 0, 0], year).join(' ');
  assert.match(lines(60, 2026.5), /in 1966, the year Star Trek premiered on television/);
  assert.doesNotMatch(lines(112.2, 2026.5), /around when|the year/); // 1914
  assert.match(lines(540, 2026.5), /in 1486, around when Columbus crossed the Atlantic/);
  assert.doesNotMatch(lines(556, 2026.5), /around when/); // 1470
  // Before year 1 the count runs the other way: 2,500.2 light years back from mid-2026 is 475 BCE.
  assert.match(lines(2500.2, 2026.5), /Earth as it was in 475 BCE/);
});

test('Looking home names a moment for the very year, and only then', () => {
  const said = (name, date = '2026-11-18T12:00:00Z') => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 1, date: new Date(date) }); };
  const home = (name, date) => said(name, date).sections.find(s => s[0] === 'Looking home')[1];
  // Wolf 359 is 7.8 light years out: on 18 November 2026 it sees early 2019. The log used to say "2019, around when
  // the James Webb Space Telescope launched", which was Christmas Day 2021.
  assert.match(home('Wolf 359'), /Earth as it was in 2019, the year New Horizons flew past Arrokoth, the farthest world ever visited\./);
  assert.doesNotMatch(home('Wolf 359'), /Webb|around when/);
  // The ships' own years, from their files: Procyon sees New Horizons at Pluto, TRAPPIST-1 sees Voyager 2 at Uranus.
  assert.match(home('Procyon'), /in 2015, the year New Horizons flew past Pluto\./);
  assert.match(home('TRAPPIST-1'), /in 1986, the year Voyager 2 flew past Uranus\./);
  assert.match(home('Proxima Centauri'), /in 2022, the year the James Webb Space Telescope sent back its first pictures\./);
  assert.match(home('Vega'), /in 2001, the year NEAR Shoemaker made the first landing on an asteroid, Eros\./);
  // The entry keeps the ship whose moment it is, for a link to her file; one with no ship in it keeps none.
  assert.deepEqual(said('Sirius').ship, { id: 'v2', name: 'Voyager 2' });
  assert.deepEqual(said('Procyon').ship, { id: 'nh', name: 'New Horizons' });
  assert.deepEqual(said('Proxima Centauri').ship, { id: 'jwst', name: 'James Webb' });
  assert.ok(!('ship' in said('Vega')) && !('ship' in said('Deneb')));
  const lost = cat.unmeasured.findIndex(u => u);
  assert.ok(!('ship' in composeEntry(cat, lost, { cam: [...cat.pos.subarray(lost * 3, lost * 3 + 3)], holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 3262, date: new Date('2026-11-18T12:00:00Z') })));

  // From 1900 on, only the year itself: a year with no moment says nothing, however near its neighbours'.
  assert.equal(momentFor(2002), null);
  assert.equal(momentFor(1904), null);
  assert.deepEqual(momentFor(1903), { year: 1903, text: 'the Wright brothers first flew', gap: 0, ship: null });
  // Before 1900 the nearest moment within two years (ten before 1500), and "around when" unless it is the year.
  assert.equal(momentFor(1606).year, 1604);
  assert.equal(momentFor(1608).year, 1610);
  assert.equal(momentFor(1607), null);
  assert.equal(momentFor(1783).gap, 2);
  assert.equal(momentFor(1784), null);
  assert.equal(momentFor(1045).year, 1054);
  assert.equal(momentFor(1043), null);
  const line = (ly, year) => homeLines(cat, [ly / 3.26156, 0, 0], year)[1];
  assert.match(line(2026.5 - 1781.5, 2026.5), /in 1781, the year William Herschel discovered Uranus\./);
  assert.match(line(2026.5 - 1780.5, 2026.5), /in 1780, around when William Herschel discovered Uranus\./);
  assert.match(line(2026.5 - 1572.5, 2026.5), /in 1572, the year Tycho Brahe saw a new star, a supernova, in Cassiopeia\./);
  assert.match(line(2026.5 - 1718.5, 2026.5), /in 1718, the year Edmond Halley found that the stars move\./);
  assert.match(line(2026.5 - 1050.5, 2026.5), /in 1050, around when the supernova that made the Crab Nebula lit up the sky\./);
  assert.equal(earthYear([8.6 / 3.26156, 0, 0], 2026.88), 2018);

  // The list: one moment to a year, in order, each a clause that can follow "the year" or "around when".
  const years = ANCHORS.map(a => a[0]);
  assert.deepEqual(years, [...new Set(years)].sort((a, b) => a - b));
  for (const [year, text] of ANCHORS) assert.match(text, /^[a-zA-Z][^.]*[a-zA-Z0-9]$/, `${year}: ${text}`);
  // Every year from Sputnik to 2024 has one, but for the ones with nothing sure to say.
  const missing = [];
  for (let y = 1957; y <= 2024; y++) if (!years.includes(y)) missing.push(y);
  assert.deepEqual(missing, [2002]);
  // A ship's moment is in her own file under the same day, so the log and long missions can't disagree; and each
  // ship on a long mission has at least one.
  const ships = new Set();
  for (const [year, text, ship, day] of ANCHORS) {
    if (!ship) { assert.equal(day, undefined, text); continue; }
    ships.add(ship);
    assert.ok(shipById(ship)?.log.some(([d]) => d === day), `${ship} has nothing on ${day}`);
    assert.equal(Number(day.slice(0, 4)), year, text);
  }
  assert.deepEqual([...ships].sort(), SHIPS.map(s => s.id).sort());
});

test('from far away the Sun is too faint to see', () => {
  const [first] = homeLines(cat, at('Betelgeuse'), 2026, cat.byName.get('Betelgeuse'));
  assert.match(first, /too faint to see without a telescope/);
});

test('star kinds are described in words', () => {
  assert.equal(describeKind('K2III', 4500), 'Orange giant, spectral type K2III');
  assert.equal(describeKind('M4.5V', 3100), 'Red dwarf, spectral type M4.5V');
  assert.equal(describeKind('B8Ia', 12000), 'Blue-white supergiant, spectral type B8Ia');
  assert.equal(describeKind('DA2', 20000), 'White dwarf, spectral type DA2');
  assert.equal(describeKind('', 5800), 'Yellow dwarf');
});

test('spectral types are read whole', () => {
  assert.deepEqual(spectral('K2III'), { letter: 'K', lum: 'III', special: null });
  // The longest class wins: Iab is not Ia, III is not II, and what trails it is detail.
  assert.equal(spectral('K7Iab:').lum, 'Iab');
  assert.equal(spectral('B0.5Iavar').lum, 'Ia');
  assert.equal(spectral('K4IIIb').lum, 'III');
  assert.equal(spectral('K3IIIvar').lum, 'III');
  assert.equal(spectral('A2Vn').lum, 'V');
  assert.equal(spectral('F5IV/V').lum, 'IV');
  assert.equal(spectral('G8/K0III').lum, 'III');
  assert.equal(spectral('G0Ia0:').lum, 'Ia0');
  assert.equal(spectral('M5e-M9e').lum, null);
  // Only the first star of a pair.
  assert.deepEqual(spectral('WC8 + O9I'), { letter: null, lum: null, special: 'wolf-rayet' });
  assert.equal(spectral('M3IIIa+...').lum, 'III');
  // The Gliese catalogue's lower-case classes and old prefixes.
  assert.deepEqual(spectral('m'), { letter: 'M', lum: null, special: null });
  assert.equal(spectral('k-m').letter, 'K');
  assert.deepEqual(spectral('dM4.5e'), { letter: 'M', lum: 'V', special: null });
  assert.deepEqual(spectral('sdM1'), { letter: 'M', lum: null, special: 'subdwarf' });
  assert.equal(spectral('DA2').special, 'white dwarf');
  assert.equal(spectral('DXP9').special, 'white dwarf');
  for (const s of ['C7Iab', 'N5', 'CH', 'Cp', 'C5II', 'CIb...']) assert.equal(spectral(s).special, 'carbon', s);
  assert.equal(spectral('WN...').special, 'wolf-rayet');
  assert.equal(spectral('pec').letter, null);
  assert.equal(spectral('').letter, null);
});

test('stars the log has no notes on are still called what they are', () => {
  const kind = name => { const i = cat.byName.get(name); return describeKind(cat.spect[i], cat.temp[i], cat.absmag[i]).split(',')[0]; };
  assert.equal(kind('Mira'), 'Red giant'); // "M5e-M9e" has no luminosity class; it was a red dwarf
  assert.equal(kind('La Superba'), 'Carbon star'); // C7Iab
  assert.equal(kind('Saiph'), 'Blue-white supergiant'); // B0.5Iavar
  assert.equal(kind('ρ Cassiopeiae'), 'Yellow-white supergiant'); // F8Iavar
  assert.equal(kind('HIP 1486'), 'Orange supergiant'); // K7Iab:
  assert.equal(kind('Bubup'), 'Wolf-Rayet star'); // WN...
  assert.equal(kind('Gliese 3094B'), 'Red dwarf'); // m
  assert.equal(kind('Gliese 581'), 'Red dwarf'); // M5, and faint
  assert.equal(describeKind('K4IIIb', 4200, -0.3), 'Orange giant, spectral type K4IIIb');
  assert.equal(describeKind('K7Iab:', 4000, -5), 'Orange supergiant, spectral type K7Iab:');
  assert.equal(describeKind('G0Ia0', 5500, -8), 'Yellow hypergiant, spectral type G0Ia0');
  assert.equal(describeKind('dM4', 3200, 12), 'Red dwarf, spectral type dM4'); // it was a white dwarf
  assert.equal(describeKind('S5.3', 3000, -1), 'Red giant, spectral type S5.3');
  assert.equal(describeKind('m', 3000, 11), 'Red dwarf, spectral type m');
  assert.equal(describeKind('M', 3000, -0.5), 'Red giant, spectral type M');
  assert.equal(describeKind('G5', 5600, 5), 'Yellow dwarf, spectral type G5');
  assert.equal(describeKind('G0', 5900, 2.4), 'Yellow subgiant, spectral type G0');
  assert.equal(describeKind('Se', 4000, 8.8), 'Orange star, spectral type Se');
  assert.equal(describeKind('pec', 5500, -3.8), 'Yellow star, spectral type pec'); // Eta Carinae is no giant
  assert.equal(describeKind('', 4000, 0.5), 'Orange giant');
  assert.equal(describeKind('', 3200, 12), 'Red dwarf');
  assert.equal(describeKind('WN', 40000, -5), 'Wolf-Rayet star, spectral type WN');
  // No star typed as a giant or supergiant comes out a dwarf or a plain star.
  for (let i = 1; i < cat.count; i++) {
    const s = cat.spect[i] || '';
    if (/^[OBAFGKM][0-9.]*I(I|II|a|b|ab)?(?![IV])/.test(s)) assert.match(describeKind(s, cat.temp[i], cat.absmag[i]), /giant/, `${cat.names[i]}: ${s}`);
  }
});

test('a star with no measured distance is not given one as fact', () => {
  const n = [...cat.unmeasured].filter(Boolean).length;
  assert.equal(n, 431);
  for (const d of DESTINATIONS) assert.equal(cat.unmeasured[cat.byName.get(d.star)], 0, d.star);
  assert.equal(cat.unmeasured[cat.byName.get('Deneb')], 0); // far, but measured
  const i = cat.byName.get('ρ Cassiopeiae');
  assert.equal(cat.unmeasured[i], 1);
  const e = composeEntry(cat, i, { cam: at('ρ Cassiopeiae'), holdAU: 5, warp: 9, fromTitle: 'Sol', tripLy: 3262, date: new Date('2026-10-08T00:00:00Z') });
  const all = [e.intro, ...e.sections.map(s => s[1])].join(' ');
  assert.match(e.intro, /no measured distance for this star, so the charts place it at a nominal 3,262 ly\.$/);
  assert.doesNotMatch(all, /(?<!nominal (distance, )?)3,262 ly/, 'the placeholder distance is stated as fact');
  assert.doesNotMatch(all, /BCE|as it was in|until \d{4}|first passed here/, 'a year is worked out from the placeholder distance');
  assert.doesNotMatch(all, /times the Sun’s|% of the Sun’s/, 'a width or brightness is worked out from the placeholder distance');
  const section = l => e.sections.find(s => s[0] === l)[1];
  assert.match(section('The star'), /^Yellow-white supergiant, spectral type F8Iavar\. [\d,]+ K at the surface\. Its width and brightness can’t be worked out/);
  assert.match(section('Looking home'), /^The Sun is too faint to see without a telescope from here, in the part of the sky where Earth sees /);
  assert.match(section('The trip'), /^By the charts’ nominal distance, 3,262 ly from Sol in /);
  // Leaving one for a measured star, the trip is still only as long as the charts say.
  const back = composeEntry(cat, cat.byName.get('Deneb'), { cam: at('Deneb'), holdAU: 5, warp: 9, fromTitle: 'ρ Cassiopeiae', tripLy: 2000, nominal: true, date: new Date('2026-10-08T00:00:00Z') });
  assert.match(back.sections.find(s => s[0] === 'The trip')[1], /^By the charts’ nominal distance, /);
  assert.match(back.intro, /ly from Sol, and are holding/);
  // Its type doesn't say giant or dwarf, and its brightness is unknown: neither does the log.
  assert.equal(describeKind('K0', 4800, null), 'Orange star, spectral type K0');
  assert.equal(describeKind('K0III', 4800, null), 'Orange giant, spectral type K0III');
});

test('a worked-out width or brightness keeps two figures once it is in the hundreds', () => {
  const star = name => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 10, date: new Date('2026-10-08T00:00:00Z') }).sections[0][1]; };
  for (const name of ['Alnilam', 'Saiph', 'La Superba']) {
    for (const n of star(name).match(/[\d,]+(?= times)/g)) assert.match(n, /^\d\d?(,?0)*$/, `${name}: ${n} times`);
  }
  // Measured values on the stars with notes are said as given.
  assert.match(star('Deneb'), /203 times the Sun’s width, and 196,000 times the Sun’s brightness/);
});

test('a log entry covers the star, home and the trip', () => {
  const i = cat.byName.get('Proxima Centauri');
  const cam = at('Proxima Centauri');
  const e = composeEntry(cat, i, { cam, holdAU: 0.0485, warp: 9, fromTitle: 'Sol', tripLy: 4.24, date: new Date('2026-10-08T00:00:00Z') });
  const labels = e.sections.map(s => s[0]);
  for (const l of ['The star', 'Planets', 'Looking home', 'The trip']) assert.ok(labels.includes(l), l);
  assert.match(e.intro, /Proxima b’s orbit/);
  assert.match(e.sections.find(s => s[0] === 'Looking home')[1], /Cassiopeia/);
});

test('the log says what is in the sky from here: the brightest star and the nearest', () => {
  const star = name => cat.byName.get(name);
  const entry = name => composeEntry(cat, star(name), { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 10, date: new Date('2026-10-08T00:00:00Z') });
  const sky = name => entry(name).sections.find(s => s[0] === 'The sky from here')?.[1];
  // Checked against the catalogue by hand: from Denebola, Arcturus is 22 ly off and shines at magnitude −1.2, and
  // the red dwarf Gliese 452.1 is 3.6 ly away.
  assert.equal(sky('Denebola'), 'The brightest star in this sky is Arcturus, magnitude −1.2. The nearest is Gliese 452.1, 3.6 light years away.');
  // From Arcturus the nearest star is also the brightest: Muphrid, 3.3 ly away. The entry keeps it, to offer a course.
  assert.equal(sky('Arcturus'), 'The brightest star in this sky is Muphrid, magnitude −2.6, which is also the nearest, 3.3 light years away.');
  assert.equal(entry('Arcturus').near, star('Muphrid'));
  assert.ok(Math.abs(skyFrom(cat, star('Arcturus')).nearest.ly - 3.27) < 0.02);
  // The section comes after the star's own and before the look home; there is none at home.
  const labels = entry('Arcturus').sections.map(s => s[0]);
  assert.ok(labels.indexOf('The sky from here') > labels.indexOf('Starfleet charts') && labels.indexOf('The sky from here') === labels.indexOf('Looking home') - 1, String(labels));
  const home = composeEntry(cat, 0, { cam: [1e-6, 0, 0], holdAU: 1, warp: 9, fromTitle: 'Vega', tripLy: 25, date: new Date('2026-10-08T00:00:00Z') });
  assert.ok(!home.sections.some(s => s[0] === 'The sky from here') && !('near' in home));
  assert.equal(skyFrom(cat, 0), null);

  // A star listed at the same place is its companion, never "the nearest star, 0.0 light years away". Sirius B is
  // Gliese 244B on the charts, at Sirius's own position; the nearest star beyond is Procyon's white dwarf.
  assert.equal(sky('Sirius'), 'Apart from its companion Gliese 244B, the brightest star in this sky is Procyon, magnitude −1.3. The nearest is Gliese 280B, 5.2 light years away.');
  assert.ok(companions(cat, star('Sirius'), star('Gliese 244B')) && !companions(cat, star('Sirius'), star('Procyon')) && !companions(cat, star('Sirius'), star('Sirius')));
  // The two of 61 Cygni share a name: "its companion" is enough. Alpha Centauri has two, and from there the nearest
  // star is the Sun.
  assert.match(sky('61 Cygni'), /^Apart from its companion, the brightest star in this sky is Vega, /);
  assert.equal(sky('Rigil Kentaurus'), 'Apart from its companions Proxima Centauri and Toliman, the brightest star in this sky is Sirius, magnitude −1.2. The nearest is the Sun, 4.3 light years away.');
  assert.equal(entry('Rigil Kentaurus').near, 0);
  // A pair the catalogue measured separately, and so lists light years apart, is still a pair: Gliese 60A and 60B.
  assert.ok(companions(cat, star('Gliese 60B'), star('Gliese 60A')));
  assert.match(sky('Gliese 60B'), /^Apart from its companions Gliese 60A and Gliese 60C, /);
  // Under a light year the neighbour is nearly always the star's own companion, misplaced: Fomalhaut's is TW Piscis
  // Austrini (Gliese 879), which really is its companion, 0.9 ly out.
  assert.match(sky('Fomalhaut'), /Gliese 879, magnitude −0\.7, which is also the nearest, 0\.9 light years away\. At that distance the two are probably one system\.$/);

  // "The nearest" is only said where the catalogue has every star: the sphere out to the neighbour has to lie inside
  // 80 light years of the Sun. Deneb is 1,400 ly out, and its nearest neighbour on the charts is 96 ly from it.
  assert.match(sky('Deneb'), /^On the charts, the brightest star in this sky is 59 Cygni, magnitude −1\.1, which is also the nearest, 96 light years away\./);
  assert.match(sky('Betelgeuse'), /^On the charts, the brightest star in this sky is Rigel, magnitude −1\.4, and the nearest is 52 Orionis, 44 light years away\./);
  assert.deepEqual([skyFrom(cat, star('Deneb')).brightest.sure, skyFrom(cat, star('Deneb')).nearest.sure], [false, false]);
  // 70 ly out with a neighbour 15 ly off, the brightest is sure and the nearest is not.
  let mixed = 0;
  for (let i = 1; i < cat.count && mixed < 3; i += 7) {
    const s = skyFrom(cat, i);
    if (!s || !s.brightest.sure || s.nearest.sure) continue;
    mixed++;
    const ly = Math.hypot(...cat.pos.subarray(i * 3, i * 3 + 3)) * 3.26156;
    assert.ok(ly < 80 && ly + s.nearest.ly >= 80, cat.names[i]);
    assert.match(skyLine(cat, i, s), /brightest star in this sky is .*\. The nearest star on the charts is /, cat.names[i]);
  }
  assert.equal(mixed, 3);
  // Every measured star gets a sentence with real numbers in it, and none names the star itself, a star with no
  // measured distance, or a neighbour at no distance.
  for (let i = 1; i < cat.count; i += 37) {
    const s = skyFrom(cat, i);
    if (cat.unmeasured[i]) { assert.equal(s, null); continue; }
    const line = skyLine(cat, i, s);
    assert.match(line, /magnitude −?\d+\.\d[.,] .* \d[\d,.]* light years away\./, cat.names[i]);
    assert.doesNotMatch(line.replace(/\b[\w.]+-[\w.]+\b/g, ''), /NaN|undefined| 0\.0 light years|-/, cat.names[i]);
    for (const j of [s.brightest.star, s.nearest.star]) assert.ok(j !== i && !cat.unmeasured[j] && !s.companions.includes(j), cat.names[i]);
    assert.ok(s.nearest.ly >= 0.5, `${cat.names[i]}: ${line}`);
  }
  // A star whose own distance was never measured has no place to look out from.
  const lost = cat.unmeasured.findIndex(u => u);
  assert.ok(!composeEntry(cat, lost, { cam: [...cat.pos.subarray(lost * 3, lost * 3 + 3)], holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 3262, date: new Date('2026-10-08T00:00:00Z') }).sections.some(s => s[0] === 'The sky from here'));
});

test('far from home the log says the charts are thin', () => {
  const THIN = / The charts are thin this far out\. They hold only the stars bright enough to see from Earth, so the real sky here has far more than the viewscreen shows\.$/;
  const lyOf = i => Math.hypot(...cat.pos.subarray(i * 3, i * 3 + 3)) * 3.26156;
  assert.equal(THIN_LY, 250);
  // Either side of the line: the measured stars nearest to 250 light years from the Sun, inside and out.
  let inside = 0, outside = 0;
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    const ly = lyOf(i);
    if (ly <= 250 && (!inside || ly > lyOf(inside))) inside = i;
    if (ly > 250 && (!outside || ly < lyOf(outside))) outside = i;
  }
  assert.ok(lyOf(inside) > 249 && lyOf(outside) < 251, `${lyOf(inside)} ${lyOf(outside)}`);
  assert.doesNotMatch(skyLine(cat, inside), /charts are thin/);
  assert.match(skyLine(cat, outside), THIN);
  // Deneb, the Pleiades and Betelgeuse are out there; Arcturus, Vega and Mizar (86 ly) are not.
  for (const name of ['Deneb', 'Alcyone', 'Betelgeuse', 'HIP 3']) assert.match(skyLine(cat, cat.byName.get(name)), THIN, name);
  for (const name of ['Arcturus', 'Vega', 'Mizar', 'Proxima Centauri']) assert.doesNotMatch(skyLine(cat, cat.byName.get(name)), /charts are thin/, name);
  // It is part of the entry's sky section, after what the charts do hold.
  const i = cat.byName.get('Deneb');
  const e = composeEntry(cat, i, { cam: at('Deneb'), holdAU: 43, warp: 9, fromTitle: 'Sol', tripLy: 1412, date: new Date('2026-10-08T00:00:00Z') });
  assert.match(e.sections.find(s => s[0] === 'The sky from here')[1], /^On the charts, the brightest star in this sky is 59 Cygni, .* 96 light years away\. The charts are thin this far out\./);
});

test('the stars nearest the ship are listed nearest first, without the ones nobody has measured', () => {
  const star = name => cat.byName.get(name);
  const near = nearestStars(cat, at('Arcturus'), 5, star('Arcturus'));
  assert.deepEqual(near.map(n => cat.names[n.star]), ['Muphrid', 'Gliese 1179A', 'Gliese 1179B', 'Gliese 567', 'Gliese 568B']);
  assert.ok(near.every((n, k) => !k || n.ly >= near[k - 1].ly));
  assert.ok(Math.abs(near[0].ly - 3.27) < 0.02);
  // From Sirius the first is its companion, at no distance; from the Sun, Proxima and the two of Alpha Centauri.
  assert.equal(cat.names[nearestStars(cat, at('Sirius'), 1, star('Sirius'))[0].star], 'Gliese 244B');
  assert.deepEqual(nearestStars(cat, [0, 0, 0], 3, 0).map(n => cat.names[n.star]), ['Proxima Centauri', 'Toliman', 'Rigil Kentaurus']);
  // The 431 stars parked at a nominal 1,000 parsecs are never anyone's neighbour, even from one of their own.
  const lost = cat.unmeasured.findIndex(u => u);
  assert.ok(nearestStars(cat, [...cat.pos.subarray(lost * 3, lost * 3 + 3)], 8, lost).every(n => !cat.unmeasured[n.star]));
});

test('the log says what Starfleet’s charts put at a star', () => {
  const entry = name => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 10, date: new Date('2026-10-08T00:00:00Z') }); };
  for (const c of CHARTS) {
    const said = entry(c.star).sections.filter(s => s[0] === 'Starfleet charts');
    assert.deepEqual(said, [['Starfleet charts', c.log || c.line]], c.star);
  }
  const wolf = entry('Wolf 359').sections;
  assert.match(wolf.find(s => s[0] === 'Starfleet charts')[1], /the Borg destroyed 39 starships/);
  assert.ok(!wolf.some(s => /a great starship battle/.test(s[1])), 'Wolf 359 is still coy about the battle');
  // What is written for someone standing in a garden isn't said to someone at the star.
  for (const c of CHARTS) assert.doesNotMatch(c.log || c.line, /garden|too faint to see/, `${c.star}'s line in the log is written for the garden`);
  // Vulcan is said once, not in two sections.
  assert.equal(entry('Keid').sections.filter(s => /Sky & Telescope/.test(s[1])).length, 1);
  // The stories that aren't Star Trek's keep their own section, beside the charts'.
  assert.deepEqual(entry('Vega').sections.map(s => s[0]).filter(l => /fiction|charts/.test(l)), ['In fiction', 'Starfleet charts']);
  assert.ok(!entry('Sirius').sections.some(s => s[0] === 'Starfleet charts'));
});

test('the Pleiades are "The Pleiades" in a heading and "the Pleiades" in a sentence', () => {
  const i = cat.byName.get('Alcyone');
  const e = composeEntry(cat, i, { cam: at('Alcyone'), holdAU: 100, warp: 9, fromTitle: 'Sol', tripLy: 400, date: new Date('2026-10-08T00:00:00Z') });
  assert.equal(e.title, 'The Pleiades');
  assert.equal(titleFor(cat, i), 'The Pleiades');
  assert.match(e.intro, /^We’ve dropped out of warp at the Pleiades, /);
  assert.match(tripLine(400, 9, inTextFor(cat, i)), / from the Pleiades in /);
  assert.equal(inTextFor(cat, cat.byName.get('Sirius')), 'Sirius');
});

test('the offline copy lists every script', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  for (const f of await readdir(join(root, 'js'))) assert.ok(sw.includes(`'js/${f}'`), f);
  for (const f of await readdir(join(root, 'fonts'))) if (f.endsWith('.woff2')) assert.ok(sw.includes(`'fonts/${f}'`), f);
});

test('every survey world Engage can fly to is in the catalogue, as far away as the helm says', () => {
  for (const c of CLASSES) {
    for (const w of c.worlds) {
      if (!w.star) continue;
      const i = cat.byName.get(w.star);
      assert.ok(i !== undefined, `${w.name}: no star called ${w.star}`);
      const ly = Math.hypot(...at(w.star)) * 3.26156;
      const helm = ly >= 100 ? Math.round(ly) : Math.round(ly * 10) / 10;
      assert.equal(w.ly, helm, `${w.name}: file says ${w.ly} ly, catalogue says ${ly.toFixed(2)}`);
    }
  }
});

test('survey files are complete', () => {
  const ids = new Set();
  for (const c of CLASSES) {
    assert.ok(!ids.has(c.id), `two files called ${c.id}`);
    ids.add(c.id);
    for (const k of ['name', 'short', 'art', 'real', 'about', 'tell', 'home']) assert.ok(c[k], `${c.id} has no ${k}`);
    for (const k of ['width', 'mass', 'temp']) assert.ok(c.typical[k][0] < c.typical[k][1], `${c.id}: ${k} range is backwards`);
  }
});

test('a world’s mass goes with its width', () => {
  // Chen & Kipping 2017 (ApJ 834, 17), set so that Earth is exactly Earth.
  assert.equal(massFor(1), 1);
  const within = (got, real, tol, what) => assert.ok(Math.abs(got / real - 1) < tol, `${what}: ${got} against ${real}`);
  within(massFor(0.949), 0.815, 0.05, 'Venus');
  within(massFor(0.532), 0.107, 0.05, 'Mars');
  within(massFor(0.2727), 0.0123, 0.2, 'the Moon'); // the fit runs light down here, so rock's own density takes over
  within(massFor(3.88, 'gas'), 17.1, 0.2, 'Neptune');
  within(massFor(4.01, 'gas'), 14.5, 0.2, 'Uranus');
  for (let w = 0.1; w < 4.5; w += 0.05) {
    assert.ok(massFor(w + 0.05) > massFor(w) && massFor(w + 0.05, 'gas') > massFor(w, 'gas'), `a wider world came out lighter at ${w}`);
    assert.ok(massFor(w) / w ** 3 >= 0.5, `rock ${w} wide came out less dense than loose rock`);
    // And back again: the width of a rocky world from its mass, for a planet whose width nobody has measured.
    within(widthFor(massFor(w)), w, 1e-9, `the width of a rocky world as heavy as one ${w} wide`);
  }
  assert.equal(widthFor(1), 1);
  within(widthFor(0.815), 0.949, 0.02, 'Venus, from its mass');
  within(widthFor(0.107), 0.532, 0.02, 'Mars, from its mass');
});

test('Cover your tracks never invents an impossible planet', () => {
  // Density against Earth's is mass over width cubed. Rock and iron run from about 0.5 (the Moon is 0.6) to 2 (a
  // squeezed super-Earth); worlds with a deep layer of gas or ice from 0.1 to 0.6 (Neptune is 0.3). The quiz used to
  // draw width and mass apart, and Class D could come out 50 times as dense as Earth.
  const rand = rng(20261118);
  const GIANTS = ['J', 'T', 'hot-jupiter'], GAS = ['sub-neptune', 'ice-giant'];
  for (const c of CLASSES) {
    let lo = Infinity, hi = 0;
    for (let k = 0; k < 2000; k++) {
      const w = quizReadings(c, rand), t = c.typical;
      for (const key of ['width', 'mass', 'temp']) assert.ok(w[key] >= t[key][0] && w[key] <= t[key][1], `${c.id}: ${key} ${w[key]} is off the file`);
      assert.equal(w.year === null, !t.year, c.id);
      const density = w.mass / w.width ** 3;
      lo = Math.min(lo, density); hi = Math.max(hi, density);
    }
    if (GIANTS.includes(c.id)) continue; // a gas giant's width barely changes with its mass
    const [min, max] = GAS.includes(c.id) ? [0.15, 0.7] : c.id === 'R' ? [0.15, 2.5] : [0.3, 2.5];
    assert.ok(lo >= min && hi <= max, `${c.id}: densities from ${lo.toFixed(2)} to ${hi.toFixed(2)} times Earth’s`);
  }
});

test('a planetoid’s creature feels a planetoid’s gravity', () => {
  // Class D is the Moon and Mercury: 0.17 and 0.38 g. The lab had 2,500 km planetoids at 0.75 g.
  for (let seed = 1; seed <= 300; seed++) {
    const { env } = grow('D', seed);
    assert.ok(env.g > 0.04 && env.g < 0.3, `D-${seed}: ${env.g} g on a world ${env.width} Earths wide`);
    assert.ok(env.mass >= 0.001 && env.mass <= 0.05);
  }
});

test('a real planet either fits its survey file or is marked as one that doesn’t', () => {
  // Widths and masses against Earth's, from the NASA Exoplanet Archive's composite table (read 18 November 2026):
  // K2-18 b 2.37 and 8.92 (Sarkis et al. 2018), LHS 1140 b 1.73 and 5.60 (Cadieux et al. 2024), TRAPPIST-1 b 1.116
  // and 1.374 and TRAPPIST-1 e 0.920 and 0.692 (Agol et al. 2021), GJ 436 b 4.17 and 22.1 (Maciejewski et al. 2014),
  // Proxima b at least 1.055 (Suárez Mascareño et al. 2025).
  let fits = 0, misfits = 0;
  for (const c of CLASSES) {
    for (const w of c.worlds) {
      const off = ['width', 'mass'].filter(k => w[k] !== undefined && (w[k] < c.typical[k][0] || w[k] > c.typical[k][1]));
      if (w.misfit) {
        misfits++;
        assert.ok(off.length, `${w.name} is marked as not fitting ${c.id}, but its numbers do`);
        assert.match(w.note, /It is (on this file|here) (because|for)|but nothing like/, `${w.name}’s note doesn’t say why it is on the file`);
      } else {
        if (w.width !== undefined || w.mass !== undefined) fits++;
        assert.deepEqual(off, [], `${w.name} is on the ${c.id} file with a ${off.join(' and ')} outside its readings`);
      }
    }
  }
  assert.ok(fits >= 2 && misfits === 4, `${fits} worlds checked against their files, ${misfits} marked as not fitting`);
  // The worlds a file is linked to as its Solar System examples are the ones its line names; a line that begins
  // "None" has none. Mars, Venus, Jupiter and Saturn each lead to one file from tonight's sky.
  for (const c of CLASSES) {
    for (const name of c.homes || []) assert.match(c.home, new RegExp(`\\b${name}\\b`), `${c.id}: ${name} is not in "${c.home}"`);
    if (/^None\b/.test(c.home)) assert.equal(c.homes, undefined, `${c.id} has no example in the Solar System, and names one`);
  }
  assert.deepEqual(['Mars', 'Venus', 'Jupiter', 'Saturn', 'Mercury', 'Moon', 'Io'].map(n => fileForHome(n)?.id), ['K', 'N', 'J', 'J', 'D', 'D', undefined]);
  // The Solar System's own examples: the Moon and Mercury sit inside the planetoid file's readings, as its line says.
  const d = CLASSES.find(c => c.id === 'D').typical;
  for (const [name, width, mass] of [['the Moon', 0.2727, 0.0123], ['Mercury', 0.3829, 0.0553]]) {
    assert.ok(width >= d.width[0] && width <= d.width[1] && mass >= d.mass[0] && mass <= d.mass[1], `${name} is off the Class D file`);
  }
});

// Cover your tracks says so when a right answer makes a new best streak.
test('a best streak is one that beats a best there already was', () => {
  assert.equal(streakRecord(0, 1), false, 'the first right answer anyone gives is not a record');
  assert.equal(streakRecord(1, 2), true);
  assert.equal(streakRecord(3, 4), true);
  assert.equal(streakRecord(4, 4), false, 'equalling the best is not beating it');
  assert.equal(streakRecord(4, 2), false);
  assert.equal(streakRecord(4, 0), false, 'a wrong answer ends the streak and is no record');
});

test('the log’s records are worked out from its entries', () => {
  // Stars by number: 1 is 4 ly out, 2 is 25 ly, 3 is 1,400 ly, 4 has no measured distance (the charts put it at 3,262).
  const far = { 1: 4, 2: 25, 3: 1400, 4: null };
  const opts = { lyFromSol: i => far[i], charted: [1, 2, 9] };
  assert.deepEqual(logRecords([], opts), { farthest: null, longest: null, most: null, charted: { n: 0, of: 3 } });
  // Newest first, as the bridge keeps it: Sol -> 1 -> 2 -> 1 -> 3 -> 4 -> 2 -> home.
  const log = [
    { star: 0, title: 'Sol', ly: 25 },
    { star: 2, title: 'Vega', ly: 3250 },
    { star: 4, title: 'HIP 4', ly: 4600 },
    { star: 3, title: 'Deneb', ly: 1398 },
    { star: 1, title: 'Proxima Centauri', ly: 27 },
    { star: 2, title: 'Vega', ly: 27 },
    { star: 1, title: 'Proxima Centauri', ly: 4 },
  ];
  const r = logRecords(log, opts);
  assert.deepEqual(r.farthest, { title: 'Deneb', ly: 1400 }, 'a star with no measured distance is not the farthest from Sol');
  assert.deepEqual(r.longest, { title: 'Deneb', ly: 1398 }, 'a trip to or from a star with no measured distance holds no record');
  assert.deepEqual(r.most, { title: 'Vega', n: 2 }, 'of two stars visited twice, the one visited last');
  assert.deepEqual(r.charted, { n: 2, of: 3 });
  // One visit each is no record for most visited, and going home is not far from Sol.
  const short = logRecords([{ star: 0, title: 'Sol', ly: 4 }, { star: 1, title: 'Proxima Centauri', ly: 4 }], opts);
  assert.equal(short.most, null);
  assert.deepEqual(short.farthest, { title: 'Proxima Centauri', ly: 4 });
  assert.equal(log.length, 7, 'the log itself was changed');
  // The way home is a trip like any other, and can be the longest.
  const back = logRecords([{ star: 0, title: 'Sol', ly: 1400 }, { star: 3, title: 'Deneb', ly: 1396 }, { star: 1, title: 'Proxima Centauri', ly: 4 }], opts);
  assert.deepEqual(back.longest, { title: 'Sol', ly: 1400 }, 'the trip home holds no record');
  // But not from a star with no measured distance.
  assert.deepEqual(logRecords([{ star: 0, title: 'Sol', ly: 3262 }, { star: 4, title: 'HIP 4', ly: 3262 }], opts).longest, null);
});

test('the log counts the kinds of star it has been to', () => {
  const kinds = names => starKinds(names.map(n => ({ star: cat.byName.get(n) })), i => cat.spect[i]);
  const lit = k => k.letters.filter(l => l[1]).map(l => l[0]).join('');
  // Nothing visited: seven letters, none lit, no rare kinds.
  assert.deepEqual(starKinds([], i => cat.spect[i]), { letters: [...'OBAFGKM'].map(l => [l, false]), n: 0, of: 7, rare: [] });
  // Vega is class A; Betelgeuse is class M, and a red supergiant.
  const two = kinds(['Vega', 'Betelgeuse']);
  assert.deepEqual([lit(two), two.n, two.of, two.rare], ['AM', 2, 7, ['red supergiant']]);
  // The same star twice counts once, and a red dwarf is no red supergiant.
  assert.deepEqual([lit(kinds(['Vega', 'Vega', 'Proxima Centauri'])), kinds(['Vega', 'Vega', 'Proxima Centauri']).rare], ['AM', []]);
  // All seven, by one star of each: Naos O, Rigel B, Vega A, Procyon F, the Sun G, Arcturus K, Proxima M.
  const all = kinds(['Naos', 'Rigel', 'Vega', 'Procyon', 'Sol', 'Arcturus', 'Proxima Centauri']);
  assert.deepEqual([lit(all), all.n, all.rare], ['OBAFGKM', 7, []]);
  // The rare kinds, in one order whatever order they were visited in. A white dwarf (Sirius B), a carbon star (La
  // Superba) and a Wolf-Rayet star (Gamma 2 Velorum) have no letter of the seven.
  const rare = kinds(['γ² Velorum', 'La Superba', 'Gliese 244B', 'Antares']);
  assert.deepEqual(rare.rare, ['red supergiant', 'white dwarf', 'carbon star', 'Wolf-Rayet star']);
  assert.deepEqual([lit(rare), rare.n], ['M', 1]);
  // They are the kinds the log calls by those names.
  for (const [name, said] of [['Gliese 244B', /^White dwarf/], ['La Superba', /^Carbon star/], ['γ² Velorum', /^Wolf-Rayet star/]]) {
    const i = cat.byName.get(name);
    assert.match(describeKind(cat.spect[i], cat.temp[i], cat.absmag[i]), said, name);
  }
  assert.match(describeKind('M2Ib', 3500, -5), /^Red supergiant/);
  // A blue or a yellow supergiant is not a red one, and a star with no type on the charts counts for nothing.
  assert.deepEqual(kinds(['Rigel', 'Deneb', 'Canopus']).rare, []);
  assert.deepEqual(starKinds([{ star: 1 }], () => ''), { letters: [...'OBAFGKM'].map(l => [l, false]), n: 0, of: 7, rare: [] });
  assert.deepEqual(starKinds([{ star: 1 }], () => undefined).n, 0);
});

test('an arrival says what it did to the records', () => {
  // Stars by number, as above: 1 is 4 ly out, 2 is 25 ly, 3 is 1,400 ly, 4 has no measured distance, 5 is 10 ly.
  const far = { 1: 4, 2: 25, 3: 1400, 4: null, 5: 10 };
  const opts = { lyFromSol: i => far[i], charted: [1, 2, 9] };
  const e = (star, ly) => ({ star, title: `star ${star}`, ly });
  assert.deepEqual(arrivalFirsts([], opts), []);
  // The first trip of all sets every record, and charts a destination: the count is the record row's, home included.
  assert.deepEqual(arrivalFirsts([e(1, 4)], opts), ['First visit', 'Farthest yet from Sol', 'Longest trip yet', 'Destination 2 of 4 charted']);
  assert.deepEqual(chartedSaid(logRecords([e(1, 4)], opts).charted), { n: 2, of: 4 });
  // A second star farther out by a longer trip.
  assert.deepEqual(arrivalFirsts([e(2, 27), e(1, 4)], opts), ['First visit', 'Farthest yet from Sol', 'Longest trip yet', 'Destination 3 of 4 charted']);
  // Back to the first: a second visit, and no record.
  assert.deepEqual(arrivalFirsts([e(1, 27), e(2, 27), e(1, 4)], opts), ['Second visit']);
  // A star with no notes, nearer than the farthest, by the longest trip yet: only that.
  assert.deepEqual(arrivalFirsts([e(5, 30), e(1, 27), e(2, 27), e(1, 4)], opts), ['First visit', 'Longest trip yet']);
  // The same distance again is no record: "yet" means farther than before.
  assert.deepEqual(arrivalFirsts([e(2, 30), e(5, 30), e(2, 27)], opts), ['Second visit']);
  // A star nobody has measured holds no record for distance or for the trip there, but it is still a first visit.
  assert.deepEqual(arrivalFirsts([e(4, 3262), e(1, 4)], opts), ['First visit']);
  // Coming home is not a visit, but the way home can be the longest trip.
  assert.deepEqual(arrivalFirsts([e(0, 1400), e(3, 1396), e(1, 4)], opts), ['Longest trip yet']);
  assert.deepEqual(arrivalFirsts([e(0, 4), e(1, 4)], opts), []);
  // Third, tenth, eleventh.
  assert.deepEqual(arrivalFirsts([e(1, 1), e(1, 1), e(1, 4)], opts), ['Third visit']);
  assert.deepEqual(arrivalFirsts(Array.from({ length: 10 }, () => e(1, 4)), opts), ['Tenth visit']);
  assert.deepEqual(arrivalFirsts(Array.from({ length: 11 }, () => e(1, 4)), opts), ['11th visit']);
  assert.deepEqual(arrivalFirsts(Array.from({ length: 22 }, () => e(1, 4)), opts), ['22nd visit']);
});

test('a distance in a sentence is rounded the way people say it', () => {
  assert.equal(roughLy(4.2465), '4.2 light years');
  assert.equal(roughLy(9.96), '10 light years');
  assert.equal(roughLy(25.04), '25 light years');
  assert.equal(roughLy(1412.6), '1,413 light years');
});

test('the log says where a planet would be temperate, how far a giant reaches, and an ordinary star’s life', () => {
  // The rules: sunlight like Earth's at the square root of the brightness; the Sun is one Sun's mass for ten billion
  // years; twice the Sun's mass is 16 times as bright (M^4 up to two Suns).
  assert.ok(Math.abs(temperateAU(15) - 3.87) < 0.01);
  assert.equal(massFromLum(1), 1);
  assert.ok(Math.abs(massFromLum(16) - 2) < 0.01);
  assert.equal(lifetimeYears(1), 1e10);
  assert.ok(Math.abs(massFromLum(0.23 * 0.2 ** 2.3) - 0.2) < 1e-9, 'a red dwarf’s mass');
  assert.ok(Math.abs(massFromLum(1.4 * 10 ** 3.5) - 10) < 1e-9, 'a blue star’s mass');
  assert.equal(lifeLine(16), 'About twice the Sun’s mass, good for about 2 billion years, and it will swell into a red giant and end as a white dwarf.');
  assert.match(lifeLine(1.4 * 12 ** 3.5), /^About 12 times the Sun’s mass, good for about 20 million years, and it will end in a supernova/);
  assert.match(lifeLine(0.002), /longer than the universe has existed so far, and it will end as a white dwarf, though no star so small/);
  assert.equal(reachLine(760), 'Put in the Sun’s place, it would reach about 3.5 AU out, past the orbit of Mars.');
  assert.equal(reachLine(203), 'Put in the Sun’s place, it would reach about 0.9 AU out, past the orbit of Venus, nearly to Earth’s.');
  assert.equal(reachLine(25.4), 'Put in the Sun’s place, it would reach about a third of the way to Mercury’s orbit.');
  assert.equal(reachLine(79), 'Put in the Sun’s place, it would reach nearly all the way to Mercury’s orbit.');
  assert.equal(temperateLine(1, 1), 'A planet would get the sunlight Earth does about 1.0 AU out, about where Earth is from the Sun. From there the star would look about as wide as the Sun does from Earth.');

  const entry = name => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 10, date: new Date('2026-10-08T00:00:00Z') }).sections; };
  const said = (name, head) => entry(name).find(s => s[0] === head)?.[1];
  // Denebola, with no notes: about 3.8 AU out, and an A-type dwarf's mass and life.
  assert.match(said('Denebola', 'A temperate orbit'), /^A planet would get the sunlight Earth does about 3\.8 AU out\. From there the star would look 40% as wide/);
  assert.match(said('Denebola', 'Its life'), /^About 1\.9 times the Sun’s mass, good for about 2 billion years/);
  // Betelgeuse's measured width reaches past Mars; a giant is never given the mass rule; a star with notes keeps its own.
  assert.match(said('Betelgeuse', 'The star'), /760 times the Sun’s width.*past the orbit of Mars\.$/);
  assert.equal(said('Arcturus', 'Its life'), undefined);
  assert.equal(said('Menkar', 'Its life'), undefined, 'a red giant got a main-sequence mass');
  assert.match(said('Menkar', 'The star'), /past the orbit of Mercury/);
  assert.equal(said('Proxima Centauri', 'Its life'), undefined, 'a star with notes got a rule-of-thumb mass');
  assert.match(said('Proxima Centauri', 'A temperate orbit'), /about 0\.041 AU out, closer than Mercury/);
  // A blue main-sequence star heavier than eight Suns ends in a supernova.
  assert.match(said('Spica', 'Its life'), /supernova/);
  // Nothing that rests on a width or brightness worked out from the wrong colour (Mira's), for a white dwarf, at home,
  // or at a star with no measured distance.
  for (const name of ['Mira', 'Gliese 3121', 'Sol']) assert.ok(!entry(name).some(s => /A temperate orbit|Its life/.test(s[0]) || /Sun’s place/.test(s[1])), name);
  const lost = cat.unmeasured.findIndex(u => u);
  assert.ok(!entry(cat.names[lost]).some(s => /A temperate orbit|Its life/.test(s[0])), 'a star with no distance');
  // A star that behaves says where it is in its cycle, as Earth sees it on the day.
  assert.match(said('Algol', 'Right now'), /^An eclipsing star: .* Seen from Earth, it’s /);
  assert.equal(said('Vega', 'Right now'), undefined);
  // A width near the Sun's is said with one "about"; a catalogue class that calls a faint star a giant (Guniibuu,
  // listed K2:III: at absolute magnitude 5.5) gets no giant's reach.
  assert.match(said('Guniibuu', 'The star'), /^Orange giant, .*, about the Sun’s width, and/);
  assert.ok(!/about about|Sun’s place/.test(said('Guniibuu', 'The star')), said('Guniibuu', 'The star'));
  // Every figure is hedged.
  for (const name of ['Denebola', 'Alsafi', 'Gliese 1294A', 'Regulus']) for (const s of entry(name).filter(x => /temperate|life/i.test(x[0]))) assert.match(s[1], /about|hundreds|trillions/, `${name}: ${s[1]}`);
});
