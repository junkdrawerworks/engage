// The numbers and the log, checked without a browser:  node --test test/physics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { warpSpeed, apparentMag, formatDuration, formatLy, formatYear, tripYears, voyagerYears, physical, holdDistanceAU, spectral } from '../js/physics.js';
import { describeKind, homeLines, composeEntry, inTextFor, titleFor, tripLine } from '../js/log.js';
import { DESTINATIONS } from '../js/destinations.js';
import { CLASSES } from '../js/classes.js';
import { CHARTS } from '../js/charts.js';

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

test('the log says what Starfleet’s charts put at a star', () => {
  const entry = name => { const i = cat.byName.get(name); return composeEntry(cat, i, { cam: at(name), holdAU: 1, warp: 9, fromTitle: 'Sol', tripLy: 10, date: new Date('2026-10-08T00:00:00Z') }); };
  for (const c of CHARTS) {
    const said = entry(c.star).sections.filter(s => s[0] === 'Starfleet charts');
    assert.deepEqual(said, [['Starfleet charts', c.log || c.line]], c.star);
  }
  const wolf = entry('Wolf 359').sections;
  assert.match(wolf.find(s => s[0] === 'Starfleet charts')[1], /the Borg destroyed 39 starships/);
  assert.ok(!wolf.some(s => /a great starship battle/.test(s[1])), 'Wolf 359 is still coy about the battle');
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
