// Subspace radio's rules, checked without a browser:  node --test test/radio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_TV, MESSAGES, ON_AIR, arrivalSaid, flights, hailProgress, heardAt, hearing, msOfYear, pickThree, properName, readHails, spanSaid, yearLine, yearNow, yearSaid } from '../js/radio.js';
import { ANCHORS } from '../js/destinations.js';
import { LY_PER_PC } from '../js/physics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => {
  const body = await readFile(join(root, String(url)));
  return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body) };
};
const { loadCatalog } = await import('../js/catalog.js');
const cat = await loadCatalog();
const lyOf = name => { const i = cat.byName.get(name); return Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC; };
const NOW = yearNow(new Date('2026-11-19T12:00:00Z'));

test('the year runs on with its fraction, as the stardate does, and back again', () => {
  assert.equal(NOW.toFixed(3), '2026.884');
  assert.equal(msOfYear(NOW), Date.parse('2026-11-19T12:00:00Z'));
  assert.equal(yearNow(new Date('2027-01-01T00:00:00Z')), 2027);
});

test('a star hears the year whose broadcasts are arriving tonight, or none before the first', () => {
  // Vega, 25 light years out, is hearing 2001; Deneb, 1,400 out, waits until the 33rd century.
  assert.deepEqual(heardAt(lyOf('Vega'), NOW), { year: 2001, from: null });
  const deneb = heardAt(lyOf('Deneb'), NOW);
  assert.equal(deneb.year, null);
  assert.equal(deneb.from, Math.floor(FIRST_TV + lyOf('Deneb')));
  assert.deepEqual(heardAt(90, NOW), { year: 1936, from: null });
  assert.deepEqual(heardAt(91, NOW), { year: null, from: 2027 });
});

test('the stars hearing a year sit in a shell a light year thick, and the three named are the best known', () => {
  // Star Trek went out on 8 September 1966: tonight that is 60.2 light years away.
  assert.equal((NOW - yearNow(new Date('1966-09-08T12:00:00Z'))).toFixed(1), '60.2');
  const list = hearing(cat, 1966, NOW);
  assert.ok(list.length > 30 && list.length < 400, `${list.length} stars are hearing 1966`);
  for (const s of list) assert.ok(s.ly > NOW - 1967 && s.ly <= NOW - 1966);
  assert.ok(list.every((s, k) => !k || list[k - 1].ly <= s.ly), 'not nearest first');
  assert.ok(list.every(s => !cat.unmeasured[s.star] && s.star !== 0));
  // Every star within the shell is in it: none left out at the edges.
  let n = 0;
  for (let i = 1; i < cat.count; i++) {
    const ly = Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
    if (!cat.unmeasured[i] && ly > NOW - 1967 && ly <= NOW - 1966) n++;
  }
  assert.equal(list.length, n);
  // The shells for every year from 1936 hold each measured star within 90 light years once.
  const all = [];
  for (let y = FIRST_TV; y <= 2026; y++) all.push(...hearing(cat, y, NOW).map(s => s.star));
  assert.equal(new Set(all).size, all.length, 'a star is hearing two years at once');
  // Altair (16.7 ly) is hearing 2010: of that year's stars it is named first, being a destination with notes.
  const three = pickThree(cat, hearing(cat, 2010, NOW), { known: i => cat.names[i] === 'Altair', named: i => properName(cat.names[i]) });
  assert.equal(cat.names[three[0].star], 'Altair');
  assert.ok(three.length <= 3);
});

test('a star’s own name is told from a catalogue number', () => {
  for (const n of ['Vega', "Teegarden's Star", 'Chalawan', 'Polaris', 'η Serpentis']) assert.ok(properName(n), n);
  for (const n of ['HIP 3', 'HD 33948', 'Gliese 581', 'Gliese 83.1', 'Wolf 359', '37 Geminorum', '15 Sagittae']) assert.ok(!properName(n), n);
});

test('every year from 1936 to 1956 with something on the air says what, and later years name their moment', () => {
  assert.equal(yearLine(1938), 'On the air in 1938: the BBC televised the FA Cup Final live and in full for the first time.');
  assert.equal(yearLine(1966), 'In 1966, Star Trek premiered on television.');
  assert.equal(yearLine(1969), 'In 1969, people first walked on the Moon.');
  assert.equal(yearLine(1940), '');
  for (const [y] of ON_AIR) assert.ok(y >= FIRST_TV && y < 1957 && !ANCHORS.some(([a]) => a === y), `${y} has two lines`);
});

test('the messages in flight reach the stars they were sent to, at the speed of light from the day they left', () => {
  const byName = n => cat.byName.get(n);
  for (const m of MESSAGES) for (const t of m.to) if (t.star) assert.ok(byName(t.star) !== undefined && !cat.unmeasured[byName(t.star)], `${m.name}: the catalogue has no ${t.star}`);
  const rows = flights(cat, byName, NOW);
  assert.equal(rows.length, MESSAGES.reduce((n, m) => n + m.to.length, 0));
  assert.ok(rows.every((r, k) => !k || rows[k - 1].arrives <= r.arrives), 'not by arrival');
  const row = (msg, star) => rows.find(r => r.message.id === msg && r.target.star === star);
  // The dates Wikipedia's list gives: Altair about 2000, Gliese 581 2029, Luyten's Star 2030. (It has Teegarden's Star
  // in 2021: sent in November 2009 to a star 12.5 light years away, it got there in 2022.)
  const altair = row('altair', 'Altair');
  assert.equal(arrivalSaid(altair), 'arrived about 2000');
  assert.equal(altair.share, 1);
  assert.equal(arrivalSaid(row('rubisco', "Teegarden's Star")), 'arrived about 2022');
  assert.equal(arrivalSaid(row('amfe', 'Gliese 581')), 'due about 2029');
  assert.equal(arrivalSaid(row('sonar', "Luyten's Star")), 'due about 2030');
  // Lone Signal went on 17 June 2013 (the list gives only the year), to a star the list puts 17.6 ly out: about 2031.
  assert.equal(row('lone', 'Gliese 526').target.sent, '2013-06-17');
  assert.equal(arrivalSaid(row('lone', 'Gliese 526')), 'due about 2031');
  const luyten = row('sonar', "Luyten's Star");
  assert.ok(luyten.share > 0.7 && luyten.share < 0.8, `the Sónar message is ${luyten.share} of the way`);
  // M13 isn't in the catalogue: the list's distance, and no course to set.
  const m13 = rows.find(r => r.message.id === 'arecibo');
  assert.equal(m13.star, null);
  assert.equal(arrivalSaid(m13), 'due about 26,974');
  assert.equal(yearSaid(2029.4), '2029');
});

test('your hails: one to a star, none from the future, and each lands at light speed', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.deepEqual(readHails(null), { hails: [] });
  assert.deepEqual(readHails({ hails: [{ star: 'Vega', sent: now - 1000 }, { star: 'Vega', sent: now - 5 }, { star: 'Altair', sent: now + 86400000 }, { star: '', sent: 1 }, null, 'x', { star: 'Sirius', sent: 'soon' }] }, now),
    { hails: [{ star: 'Vega', sent: now - 1000 }] });
  const p = hailProgress(now, 4.2465, now);
  assert.equal(p.share, 0);
  assert.equal(new Date(p.arrives).toISOString().slice(0, 7), '2031-02');
  const later = hailProgress(now, 4.2465, now + (p.arrives - now) / 2);
  assert.ok(Math.abs(later.share - 0.5) < 1e-9 && !later.arrived);
  assert.equal(hailProgress(now, 4.2465, p.arrives).arrived, true);
  assert.equal(spanSaid(4.2 * 365.25 * 86400000), '4 years 2 months');
  assert.equal(spanSaid(30 * 86400000), '30 days');
  assert.equal(spanSaid(25.1 * 365.25 * 86400000), '25 years');
  assert.equal(spanSaid(3600000), 'less than a day');
});
