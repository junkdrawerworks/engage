// The captain's log as one voyage: its days, its pages, its rows by star and its search.
//   node --test test/voyage.test.mjs
process.env.TZ = 'UTC'; // the day headings follow the calendar where the captain is: here, Greenwich
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE, byDay, clockTime, dayHeading, entryTime, newest, timeline } from '../js/logbook.js';

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
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 6, 0, now), 'Wednesday 18 November · 6 arrivals');
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 1, 0, now), 'Wednesday 18 November · 1 arrival');
  assert.equal(dayHeading(at('2026-11-18T14:32:00Z'), 0, 2, now), 'Wednesday 18 November · 2 supplemental');
  assert.equal(dayHeading(at('2025-12-31T23:00:00Z'), 2, 1, now), 'Wednesday 31 December 2025 · 2 arrivals · 1 supplemental', 'another year says which');
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
