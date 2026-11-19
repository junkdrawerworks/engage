// The captain's log as one voyage: its days, its pages, its rows by star and its search.
//   node --test test/voyage.test.mjs
process.env.TZ = 'UTC'; // the day headings follow the calendar where the captain is: here, Greenwich
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LONG_LOG, PAGE, byDay, byStar, clockTime, dayHeading, entryTime, matches, newest, timeline } from '../js/logbook.js';

const at = iso => Date.parse(iso);
const entry = (iso, star = 1, title = 'Vega', more = {}) => ({ id: at(iso), star, title, stardate: '2026.880', intro: `At ${title}.`, sections: [], ly: 1, ...more });

test('an arrival is dated by the moment it was written, or else by its stardate', () => {
  assert.equal(entryTime(entry('2026-11-18T14:32:00Z')), at('2026-11-18T14:32:00Z'));
  // Stardate 2026.880 is 88% of the way through 2026: 18 November, about 5 am.
  const t = entryTime({ stardate: '2026.880' });
  assert.equal(new Date(t).toISOString().slice(0, 10), '2026-11-18');
  assert.equal(entryTime({ stardate: 'nonsense' }), null);
  assert.equal(entryTime({ id: 3, stardate: '2026.880' }), t, 'an id that is no moment');
});

test('a day is headed with its weekday and date, and how many arrivals it had', () => {
  const now = at('2026-11-19T09:00:00Z');
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 6, now), 'Wednesday 18 November · 6 arrivals');
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 1, now), 'Wednesday 18 November · 1 arrival');
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 0, now), 'Wednesday 18 November', 'a day of supplemental lines only');
  assert.equal(dayHeading(at('2025-12-31T23:00:00Z'), 2, now), 'Wednesday 31 December 2025 · 2 arrivals', 'another year says which');
  assert.equal(clockTime(at('2026-11-18T14:32:00Z')), '2:32 pm');
  assert.equal(clockTime(at('2026-11-18T00:05:00Z')), '12:05 am');
});

test('the log comes in days, newest first, and the newest 50 arrivals at a time', () => {
  const log = [];
  // 120 arrivals, three an hour from the morning of 16 November: newest first, as the bridge keeps them.
  for (let n = 0; n < 120; n++) log.unshift(entry(new Date(at('2026-11-16T08:00:00Z') + n * 20 * 60000).toISOString(), n + 1, `Star ${n + 1}`));
  const all = timeline(log);
  assert.equal(all.length, 120);
  assert.deepEqual(all.slice(0, 3).map(x => x.k), [0, 1, 2], 'each arrival knows its place in the log');
  const days = byDay(all);
  assert.deepEqual(days.map(d => [d.key, d.arrivals]), [['2026-11-17', 72], ['2026-11-16', 48]]);
  assert.equal(days.reduce((n, d) => n + d.arrivals, 0), 120);
  assert.equal(PAGE, 50);
  const first = newest(all, PAGE);
  assert.equal(first.filter(x => x.entry).length, 50);
  assert.deepEqual([first[0].k, first[49].k], [0, 49]);
  assert.equal(newest(all, 500).length, 120, 'asking for more than there are gives them all');
});

test('a supplemental line goes in among the arrivals by its time, and arrivals with no time keep their order at the end', () => {
  const log = [entry('2026-11-18T15:00:00Z', 2, 'Altair'), entry('2026-11-18T09:00:00Z', 1, 'Vega'), { star: 3, title: 'Old', sections: [] }, { star: 4, title: 'Older', sections: [] }];
  const supps = [{ t: at('2026-11-18T12:00:00Z'), room: 'maru', text: 'Supplemental: sat the Kobayashi Maru.' }, { t: at('2026-11-17T12:00:00Z'), room: 'xeno', text: 'Supplemental: kept a creature.' }];
  const all = timeline(log, supps);
  assert.deepEqual(all.map(x => x.entry?.title ?? x.supp.room), ['Altair', 'maru', 'Vega', 'xeno', 'Old', 'Older']);
  const days = byDay(all);
  assert.deepEqual(days.map(d => [d.key, d.arrivals, d.supps]), [['2026-11-18', 2, 1], ['2026-11-17', 0, 1], ['undated', 2, 0]]);
  // A page of one arrival takes the lines between it and the next arrival, which waits for Show earlier.
  assert.deepEqual(newest(all, 1).map(x => x.entry?.title ?? x.supp.room), ['Altair', 'maru']);
});

test('by star: one row for each star, the most recently visited first, with its visits and its first and last', () => {
  const log = [entry('2026-11-18T15:00:00Z', 2, 'Altair'), entry('2026-11-18T09:00:00Z', 1, 'Vega'), entry('2026-11-10T09:00:00Z', 2, 'Altair'), entry('2026-11-01T09:00:00Z', 2, 'Altair')];
  const rows = byStar(log);
  assert.deepEqual(rows.map(r => [r.title, r.n]), [['Altair', 3], ['Vega', 1]]);
  assert.equal(rows[0].last, log[0]);
  assert.equal(rows[0].first, log[3]);
  assert.equal(rows[1].first, rows[1].last);
});

test('a search finds a star’s name, the line under it or anything its entry says, whatever the capitals and accents', () => {
  const e = { title: 'Proxima Centauri', intro: 'We’ve dropped out of warp at Proxima Centauri.', sections: [['Planets', 'Proxima b orbits in the habitable zone.'], ['', 'Alnitak is brighter.']] };
  assert.ok(matches({ entry: e }, 'proxima'));
  assert.ok(matches(e, 'HABITABLE'));
  assert.ok(matches(e, 'álnitak'));
  assert.ok(!matches(e, 'Vega'));
  assert.ok(matches(e, '  '), 'nothing typed finds everything');
  assert.ok(matches({ supp: { text: 'Supplemental: sat the Kobayashi Maru.' } }, 'kobayashi'));
  assert.equal(LONG_LOG, 30);
});

test('each room adds a line to the log when something in it finishes, read from its own record', async () => {
  const { supplementals } = await import('../js/voyage.js');
  const now = at('2026-11-19T12:00:00Z');
  const lines = supplementals({
    maru: {
      runs: [
        { title: 'The lifeboat', line: 'Kobayashi Maru: The lifeboat, 150 home, C B B B', grades: [], at: '2026-11-18T10:00:00.000Z' },
        { title: 'Died trying', grades: [{ name: 'Compassion', letter: 'A' }, { name: 'Judgment', letter: 'C' }], at: '2026-11-17T10:00:00.000Z' }, // from before runs kept their line
        { title: '<b>no</b>', at: '2026-11-17T11:00:00.000Z' },
      ],
      officer: { taken: 2, passed: '2026-11-18T11:00:00.000Z' },
    },
    contact: { runs: [
      { title: 'First contact', people: 'Qaethuk', decoded: 9, of: 11, outcome: 'contact', at: '2026-11-18T12:00:00.000Z' },
      { title: 'Second contact', people: 'Qaethuk', decoded: 10, of: 12, outcome: 'friends', second: true, at: '2026-11-18T13:00:00.000Z' },
    ] },
    xeno: { jars: [{ id: 'M', seed: 42, at: '2026-11-18T14:00:00.000Z' }, { world: 'Proxima b', seed: 7, at: '2026-11-18T15:00:00.000Z' }, { id: 'H', seed: 3 }, { id: 'nonsense', seed: 1, at: '2026-11-18T15:00:00.000Z' }] },
    survey: { best: 7, streak: 2, seen: 30, bestAt: at('2026-11-18T16:00:00Z') },
    missions: { hails: { v1: at('2026-11-18T17:00:00Z'), nobody: at('2026-11-18T17:00:00Z'), v2: now + 3600000 } },
  }, now);
  assert.deepEqual(lines.map(l => [l.room, l.text, l.href]), [
    ['missions', 'Supplemental: hailed Voyager 1 from Earth.', 'missions.html#v1'],
    ['survey', 'Supplemental: a best streak of 7 in Cover your tracks.', 'survey.html#drill'],
    ['xeno', 'Supplemental: kept a creature grown for Proxima b in a jar.', 'xeno.html#world=Proxima%20b-7'],
    ['xeno', 'Supplemental: kept a creature from a Class M world in a jar.', 'xeno.html#M-42'],
    ['contact', 'Supplemental: the Qaethuk hailed again. Second contact, 10 of 12 phrases decoded.', 'contact.html'],
    ['contact', 'Supplemental: answered a hail from the Qaethuk. First contact, 9 of 11 phrases decoded.', 'contact.html'],
    ['maru', 'Supplemental: passed the Bridge Officer’s Test.', 'maru.html'],
    ['maru', 'Supplemental: sat the Kobayashi Maru. The lifeboat, 150 home, C B B B.', 'maru.html'],
    ['maru', 'Supplemental: sat the Kobayashi Maru. Died trying, A C.', 'maru.html'],
  ]);
  assert.equal(lines[0].t, at('2026-11-18T17:00:00Z'));
  // Nothing on record, or records that aren't records: no lines.
  assert.deepEqual(supplementals({}), []);
  assert.deepEqual(supplementals({ maru: [], contact: 'x', xeno: { jars: 'x' }, survey: null, missions: { hails: [] } }), []);
});

test('the log in one sentence: how long since it began, and what every room has done', async () => {
  const { story, sinceSaid, words } = await import('../js/voyage.js');
  const now = at('2027-01-20T12:00:00Z');
  const log = [entry('2026-11-18T15:00:00Z', 2, 'Altair'), entry('2026-11-17T09:00:00Z', 1, 'Vega'), entry('2026-11-16T09:00:00Z', 1, 'Vega'), entry('2025-11-16T09:00:00Z', 0, 'Earth orbit')];
  const rec = {
    maru: { runs: [{ title: 'The lifeboat', outcome: 'escaped' }, { title: 'Changed the rules', outcome: 'rewritten' }], taken: 3 },
    contact: { runs: [{ title: 'First contact', people: 'Qaethuk' }, { title: 'Second contact', people: 'Qaethuk', second: true }], met: 1 },
    xeno: { jars: [{ id: 'M', seed: 1 }] },
    missions: { hails: { v1: at('2026-12-01T12:00:00Z'), v2: at('2026-12-02T12:00:00Z'), nobody: at('2026-12-02T12:00:00Z') } },
  };
  // The first entry is home's, fourteen months before: home isn't a star visited, but it starts the voyage.
  assert.equal(story(rec, { log, now }), 'Fourteen months out: two stars, one new species, two failed exams, one exam rewritten, one creature in a jar, two ships hailed.');
  assert.equal(story({ maru: { runs: [{ title: 'The lifeboat', outcome: 'escaped' }], taken: 1 } }, { log: [], supps: [{ t: now - 3 * 86400000 }], now }), 'Three days out: one failed exam.');
  assert.equal(story({}, { log: [], now }), null, 'nothing done, nothing said');
  assert.equal(story({}, { log: [entry('2027-01-20T11:00:00Z', 0, 'Earth orbit')], now }), null, 'a trip home is no star visited');
  assert.deepEqual([0.5, 1, 13, 14, 60, 61, 700, 731].map(d => sinceSaid(d * 86400000)),
    ['First day out', 'One day out', 'Thirteen days out', 'Two weeks out', 'Eight weeks out', 'Two months out', '22 months out', 'Two years out']);
  assert.equal(words(21), '21');
});

test('the service record: a row for each room’s record, saying what is on it or that nothing is yet', async () => {
  const { serviceRecord } = await import('../js/voyage.js');
  const { ENDINGS } = await import('../js/maru-sim.js');
  assert.equal(ENDINGS.length, 9, 'the service record counts the Kobayashi Maru’s endings out of nine');
  const empty = serviceRecord({});
  assert.deepEqual(empty.map(r => [r.name, r.line, r.none, r.href]), [
    ['Kobayashi Maru', '', 'Not sat yet', 'maru.html'],
    ['First contact', '', 'No one met yet', 'contact.html'],
    ['Cover your tracks', '', 'Not played yet', 'survey.html#drill'],
    ['Xenobiology lab', '', 'No creatures kept yet', 'xeno.html'],
    ['Long missions', '', 'No ships hailed yet', 'missions.html'],
  ]);
  const now = at('2026-11-19T12:00:00Z');
  const rows = serviceRecord({
    maru: { runs: [{ title: 'The lifeboat' }, { title: 'Died trying' }], seen: ['The lifeboat', 'Held the line'], taken: 5, best: { Compassion: 'A', Judgment: 'B', Nerve: 'C', Restraint: 'x' }, officer: { taken: 1, passed: '2026-11-18T10:00:00.000Z' } },
    contact: { runs: [{ title: 'First contact', outcome: 'contact', people: 'Qaethuk' }, { title: 'Ships passing', outcome: 'alone', people: 'Mipen' }], met: 2, contacts: 1 },
    survey: { best: 7, streak: 0, seen: 12 },
    xeno: { jars: [{ id: 'M', seed: 1 }, { id: 'H', seed: 2 }] },
    missions: { hails: { v1: now - 1000, v2: now + 3600000 } },
  }, now);
  assert.deepEqual(rows.map(r => r.line), [
    '3 of 9 endings · best A B – C · Officer’s Test passed',
    'Two peoples met · one contact made',
    'Best streak 7',
    'Two creatures in jars',
    'One ship hailed',
  ]);
  // Played but never right: a streak of nought is still a record.
  assert.equal(serviceRecord({ survey: { best: 0, seen: 3 } })[2].line, 'Best streak 0');
});

test('the five-year mission: each trip’s ship time counts, and the arrival that reaches five years closes it', async () => {
  const { clockNow, clockSaid, entryYears, missions, missionTally, missionSaid, shipTimeSaid, story } = await import('../js/voyage.js');
  const { tripYears } = await import('../js/physics.js');
  // Warp 1 is light: a trip of 1.5 light years at warp 1 takes a year and a half of the mission.
  assert.equal(entryYears({ ly: 1.5, warp: 1 }), 1.5);
  assert.equal(entryYears({ ly: 498, warp: 6 }), tripYears(498, 6));
  // An entry from before the warp factor was kept: its trip line says it.
  assert.equal(entryYears({ ly: 10, sections: [['The trip', '10.0 ly from Sol in 2 days at warp 9.5. Light needs 10 years to cover that.']] }), tripYears(10, 9.5));
  assert.equal(entryYears({ ly: 0, warp: 9 }), 0, 'the first entry, from nowhere');
  assert.equal(entryYears({ ly: 3 }), 0, 'no warp factor to time it by');
  assert.deepEqual([0, 0.0001, 1.3123, 4.9999].map(clockSaid), ['Year 1, day 1 of 5', 'Year 1, day 1 of 5', 'Year 2, day 115 of 5', 'Year 5, day 365 of 5']);
  assert.equal(clockSaid(5), 'Five years: mission complete');
  // Newest first, as the bridge keeps the log: 2 + 2 years, then a trip that takes it past five, then a fresh start.
  const trip = (iso, years, star = 1) => entry(iso, star, `Star ${star}`, { ly: years, warp: 1 });
  const log = [trip('2026-11-19T12:00:00Z', 0.5, 5), trip('2026-11-18T12:00:00Z', 1.5, 4), trip('2026-11-17T12:00:00Z', 2, 3), trip('2026-11-16T12:00:00Z', 2, 2), trip('2026-11-15T12:00:00Z', 0, 0)];
  const all = missions(log);
  assert.deepEqual(all.map(m => [m.n, m.entries.length, m.closed, +m.years.toFixed(3)]), [[1, 4, true, 5.5], [2, 1, false, 0.5]]);
  assert.equal(all[0].last, log[1]);
  assert.deepEqual(clockNow(log), { n: 2, years: 0.5, done: 1, said: 'Year 1, day 183 of 5' });
  assert.equal(clockNow(log, 1).said, 'Year 2, day 183 of 5', 'ship time in flight counts as it goes');
  // Just closed: the next mission starts at the first day, with the next trip.
  assert.deepEqual(clockNow(log.slice(1)), { n: 2, years: 0, done: 1, said: 'Year 1, day 1 of 5' });
  assert.deepEqual(clockNow([]), { n: 1, years: 0, done: 0, said: 'Year 1, day 1 of 5' });
  // One trip of more than five years closes the mission it is in by itself.
  assert.deepEqual(missions([trip('2026-11-16T12:00:00Z', 2600, 9)]).map(m => [m.closed, m.years]), [[true, 2600]]);
  // A closed mission's summary counts its own stars and what the other rooms logged while it lasted.
  const supps = [
    { t: at('2026-11-17T13:00:00Z'), kind: 'sat' }, { t: at('2026-11-18T13:00:00Z'), kind: 'met' }, // in mission 2: after the arrival that closed 1
    { t: at('2026-11-16T13:00:00Z'), kind: 'jar' }, { t: at('2026-11-10T13:00:00Z'), kind: 'met' }, // in mission 1, which started with the log
  ];
  const fixed = [trip('2026-11-19T12:00:00Z', 0.5, 5), trip('2026-11-17T12:00:00Z', 5, 3), trip('2026-11-16T12:00:00Z', 1, 2)];
  const two = missions(fixed);
  assert.deepEqual(missionTally(two[0], two, supps), { stars: 2, ly: 6, met: 1, failed: 0, rewritten: 0, jars: 1, hails: 0 });
  assert.deepEqual(missionTally(two[1], two, supps), { stars: 1, ly: 0.5, met: 1, failed: 1, rewritten: 0, jars: 0, hails: 0 });
  assert.equal(missionSaid(missionTally(two[0], two, supps)), 'Two stars, one new species, one creature in a jar');
  assert.equal(shipTimeSaid(5.25), '5 years, 3 months');
  assert.equal(shipTimeSaid(0.01), 'under a month');
  // With the clock on, the log's sentence is the mission's.
  assert.equal(story({}, { log: fixed, supps, clock: true }), 'Year 1, day 183: one star, one new species, one failed exam.');
  assert.equal(story({}, { log: fixed.slice(1), supps: [], clock: true }), 'Year 1, day 1: mission two begins with the next trip.');
  assert.equal(story({}, { log: [], clock: true }), 'Year 1, day 1: the mission begins with the first trip.');
});

test('your ship: a name and a registry, tidied, and the USS in front unless she has a prefix of her own', async () => {
  const { cleanName, cleanRegistry, shipOf, fullName, shortName, withRegistry } = await import('../js/myship.js');
  assert.equal(cleanName('  Calypso  '), 'Calypso');
  assert.equal(cleanName('<b>Calypso</b>'), 'bCalypsob', 'no markup gets through');
  assert.equal(cleanName('Jean-Luc’s   Pride'), 'Jean-Luc’s Pride');
  assert.equal(cleanName('x'.repeat(40)).length, 30);
  assert.equal(cleanRegistry(' ncc-1701-d '), 'NCC-1701-D');
  assert.equal(cleanRegistry('NCC 74656!'), 'NCC74656');
  assert.equal(shipOf({}), null);
  assert.equal(shipOf({ ship: { name: '   ' } }), null, 'a blank name is no name');
  assert.deepEqual(shipOf({ ship: { name: 'Calypso', registry: 'ncc-74210', extra: 1 } }), { name: 'Calypso', registry: 'NCC-74210' });
  assert.deepEqual(shipOf({ ship: { name: 'Calypso', registry: 5 } }), { name: 'Calypso', registry: '' });
  const calypso = { name: 'Calypso', registry: 'NCC-74210' };
  assert.deepEqual([fullName(calypso), shortName(calypso), withRegistry(calypso)], ['USS Calypso', 'Calypso', 'USS Calypso, NCC-74210']);
  const botany = { name: 'SS Botany Bay', registry: '' };
  assert.deepEqual([fullName(botany), shortName(botany), withRegistry(botany)], ['SS Botany Bay', 'Botany Bay', 'SS Botany Bay']);
});
