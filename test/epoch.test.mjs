// The temporal observatory's rules, checked without a browser:  node --test test/epoch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEG, EPOCH, MOMENTS, PRECESSION_YEARS, closest, dialForYear, drift, loadMotion, nearestIn, placeAt, poleIn, poleStar, skyIn,
  yearForDial, yearSaid,
} from '../js/epoch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const { titleFor } = await import('../js/log.js');
const cat = await loadCatalog();
const vel = await loadMotion(cat);
const at = name => cat.byName.get(name);
const kms = i => Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]) * 977792.2;
const poleStarIn = year => { const p = poleStar(skyIn(cat, vel, year, 6), poleIn(year)); return p && { name: cat.names[p.i], off: p.off }; };

test('the motions file has a motion for every star the catalogue file has, in its order', async () => {
  const raw = await readFile(join(root, 'data/motion.bin'));
  assert.equal(raw.length / 6, (await readFile(join(root, 'data/stars.bin'))).length / 20);
  // Barnard's Star, the fastest across our sky, at about 142 km/s through space (SIMBAD: 110 km/s toward us and
  // 10.4 arcseconds a year across); Arcturus about 122 km/s.
  assert.ok(Math.abs(kms(at("Barnard's Star")) - 142) < 4, `${kms(at("Barnard's Star"))}`);
  assert.ok(Math.abs(kms(at('Arcturus')) - 122) < 6, `${kms(at('Arcturus'))}`);
  // Stars with no measured distance, and the catalogue's three impossible racers, hold still.
  for (let i = 0; i < cat.count; i++) if (cat.unmeasured[i]) assert.equal(kms(i), 0, cat.names[i]);
  for (const name of ['HIP 10784', 'HIP 14925', 'HIP 49751']) assert.equal(kms(at(name)), 0, name);
  let fastest = 0;
  for (let i = 0; i < cat.count; i++) fastest = Math.max(fastest, kms(i));
  assert.ok(fastest < 400, `a star moves at ${fastest} km/s`);
});

test('the year 2000 is the catalogue as it is', () => {
  const i = at('Sirius');
  assert.deepEqual(placeAt(cat, vel, i, EPOCH), [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]]);
  assert.equal(skyIn(cat, vel, 2026, 6)[0].i, i);
});

test('the pole turns once in 25,772 years round the pole of Earth’s orbit', () => {
  const now = poleIn(EPOCH);
  assert.deepEqual(now.map(v => Math.round(v * 1e9) / 1e9 + 0), [0, 0, 1]);
  const back = poleIn(EPOCH + PRECESSION_YEARS);
  assert.ok(Math.acos(Math.min(1, back[2])) * DEG < 1e-6);
  // Half a turn on, the pole is twice the tilt away from today's.
  assert.ok(Math.abs(Math.acos(poleIn(EPOCH + PRECESSION_YEARS / 2)[2]) * DEG - 2 * 23.4393) < 1e-6);
});

test('the pole star: Thuban by the pyramids, Polaris now, none in Caesar’s day, Vega around AD 14,000', () => {
  // Thuban "lay a mere 0°.1 from the pole" about 4,800 years ago (Wikipedia, “Pole star”, quoting Ridpath's Norton's
  // Star Atlas); a fixed tilt puts it a few tenths of a degree off.
  const thuban = poleStarIn(-2799);
  assert.equal(thuban.name, 'Thuban');
  assert.ok(thuban.off < 0.6, `${thuban.off}°`);
  const polaris = poleStarIn(2026);
  assert.equal(polaris.name, 'Polaris');
  assert.ok(Math.abs(polaris.off - 0.65) < 0.1, `${polaris.off}°`);
  assert.equal(poleStarIn(0), null);
  // Vega "will be a pole star around 14,500 AD, though at a distance of 5° from celestial north" (Wikipedia).
  const vega = poleStarIn(14000);
  assert.equal(vega.name, 'Vega');
  assert.ok(vega.off > 3.5 && vega.off < 5, `${vega.off}°`);
});

test('the nearest star stops being Proxima, and Barnard’s Star comes closest about AD 12,000', () => {
  assert.equal(titleFor(cat, nearestIn(cat, vel, 2026).i), 'Proxima Centauri');
  assert.equal(titleFor(cat, nearestIn(cat, vel, 12000).i), 'Alpha Centauri');
  // Wikipedia (“Barnard's Star”, after Bobylev 2010): about 3.75 light years, around AD 11,800. A straight line from
  // this catalogue's motion: 3.66 light years, in about AD 11,970.
  const b = closest(cat, vel, at("Barnard's Star"));
  assert.ok(Math.abs(b.year - 11900) < 300, `${b.year}`);
  assert.ok(Math.abs(b.ly - 3.7) < 0.1, `${b.ly}`);
  // Alpha Centauri at about 3 light years in about 28,000 years (Wikipedia, “Alpha Centauri”: 0.90 pc in 27,000 years).
  const a = closest(cat, vel, at('Rigil Kentaurus'));
  assert.ok(Math.abs(a.year - 29000) < 2500 && Math.abs(a.ly - 2.9) < 0.2, `${a.year} ${a.ly}`);
});

test('the dial is finer near now, and reaches 100,000 years either way', () => {
  assert.equal(yearForDial(0, 2026), 2026);
  assert.equal(yearForDial(1, 2026), 2026 + 99999);
  assert.equal(yearForDial(-1, 2026), 2026 - 99999);
  for (const y of [-2799, 1930, 2063, 2364, 14000]) assert.equal(yearForDial(dialForYear(y, 2026), 2026), y);
  assert.ok(Math.abs(dialForYear(2364, 2026)) < 0.55);
});

test('years are said the way people write them', () => {
  assert.equal(yearSaid(-2799), '2,800 BC');
  assert.equal(yearSaid(0), '1 BC');
  assert.equal(yearSaid(476), 'AD 476');
  assert.equal(yearSaid(2063), '2063');
  assert.equal(yearSaid(14000), 'AD 14,000');
});

test('the moments are in order, and a century barely moves the sky', () => {
  const years = MOMENTS.filter(m => !m.barnard).map(m => m.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  // By Picard's time the bright star that has moved most is Alpha Centauri, by less than the Moon's width.
  const picard = drift(cat, vel, 2364, 2026);
  assert.ok(['Rigil Kentaurus', 'Toliman'].includes(cat.names[picard.i]), cat.names[picard.i]);
  assert.ok(picard.off < 0.5, `${picard.off}`);
  const far = drift(cat, vel, 52026, 2026);
  assert.ok(far.off > 10, `${far.off}`);
});
