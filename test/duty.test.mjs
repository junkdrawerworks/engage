// Duty, checked without a browser:  node --test test/duty.test.mjs
// The order of the day, what is new today, days served, the rank and the commendations (js/duty.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASKS, COMMENDATIONS, ORDERS, ORDER_PLACES, RANKS, activeDays, addDays, answersDue, carriedOut, commendations, dayOf, mergeDuty,
  orderOf, rankOf, reportOf, roomsOnRecord, served, tidyDuty, todayItems, update,
} from '../js/duty.js';
import { requisition } from '../js/shipyard-sim.js';
import { DESTINATIONS } from '../js/destinations.js';

const noon = day => new Date(`${day}T12:00:00`).getTime();
const entry = (day, star, more = {}) => ({ id: noon(day), star, title: `Star ${star}`, stardate: '2026.880', intro: `At star ${star}.`, sections: [], ly: 1, ...more });

test('days are the calendar where the captain is, and count across months and years', () => {
  assert.equal(dayOf(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
  assert.equal(dayOf(new Date(2026, 10, 21, 0, 1)), '2026-11-21');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-11-20', -14), '2026-11-06');
});

test('the order of the day is the same for everyone on a date, and every kind comes up', () => {
  assert.deepEqual(orderOf('2026-11-20'), orderOf('2026-11-20'));
  const kinds = new Map();
  let repeats = 0, prev = null;
  for (let k = 0; k < 730; k++) {
    const o = orderOf(addDays('2026-11-20', k));
    kinds.set(o.kind, (kinds.get(o.kind) || 0) + 1);
    assert.ok(typeof o.says === 'string' && o.says.length > 20 && o.says.endsWith('.'), `an order says nothing: ${o.says}`);
    if (o.kind === 'star') {
      assert.ok(ORDER_PLACES.some(p => p.star === o.star), `an order sent the ship nowhere: ${o.star}`);
      assert.notEqual(o.star, 'Sol', 'an order sent the ship home');
      assert.ok(ASKS[o.ask], o.ask);
      if (o.ask === 'planets') assert.ok(DESTINATIONS.find(d => d.star === o.star).planets, `${o.star} has no planets to report on`);
      assert.doesNotMatch(o.says, /to The /, 'a capital The mid-sentence');
    } else assert.ok(ORDERS[o.kind], o.kind);
    if (prev && prev.kind === o.kind && (o.kind !== 'star' || prev.star === o.star)) repeats++;
    prev = o;
  }
  assert.deepEqual([...kinds.keys()].sort(), ['contact', 'directive', 'distress', 'far', 'jar', 'maru', 'missions', 'new', 'radio', 'star', 'voyage']);
  const stars = kinds.get('star') / 730;
  assert.ok(stars > 0.2 && stars < 0.4, `a star to visit on ${(stars * 100).toFixed(0)}% of days`);
  assert.ok(repeats < 8, `the same order two days running ${repeats} times in two years`);
});

test('an order is carried out on its own day, from the log or another room’s record', () => {
  const day = '2026-11-20', find = name => ({ Vega: 7, Altair: 9 })[name];
  const star = { day, kind: 'star', star: 'Vega', ask: 'home' };
  const vega = entry(day, 7, { sections: [['The star', 'A white star.'], ['Looking home', 'From here our Sun is a magnitude 4.3 star in Aquila. Light from home left 25 years ago.']] });
  assert.equal(carriedOut(star, {}, [vega], find).done, true);
  assert.equal(carriedOut(star, {}, [entry('2026-11-19', 7)], find).done, false, 'a visit the day before counted');
  assert.equal(carriedOut(star, {}, [entry(day, 9)], find).done, false, 'another star counted');
  // Already holding at the star it is sent to: the ship has proceeded there, and its latest entry reports. Only today's
  // order knows where the ship is now.
  const earlier = [entry('2026-11-12', 7, { intro: 'Old.' }), entry('2026-11-18', 7, { sections: [['Looking home', 'Our Sun is faint. More.']] })];
  const holding = carriedOut(star, {}, earlier, find, 7);
  assert.deepEqual([holding.done, reportOf(star, holding.entry)], [true, 'Our Sun is faint.']);
  assert.equal(carriedOut(star, {}, earlier, find, 9).done, false, 'holding at another star counted');
  assert.equal(reportOf(star, carriedOut(star, {}, [vega], find).entry), 'From here our Sun is a magnitude 4.3 star in Aquila.');
  assert.equal(reportOf({ ...star, ask: 'planets' }, vega), 'From here our Sun is a magnitude 4.3 star in Aquila.', 'with nothing on its planets, the log’s look home');
  const at = `${day}T10:00:00`;
  const o = kind => ({ day, kind });
  assert.equal(carriedOut(o('maru'), { maru: { daily: { date: day } } }).done, true);
  assert.equal(carriedOut(o('maru'), { maru: { daily: { date: '2026-11-19' } } }).done, false);
  assert.equal(carriedOut(o('contact'), { contact: { daily: { date: day } } }).done, true);
  assert.equal(carriedOut(o('distress'), { distress: { calls: [{ day, left: true }] } }).done, false, 'a call left partway is no call answered');
  assert.equal(carriedOut(o('distress'), { distress: { calls: [{ day, found: false }] } }).done, true);
  assert.equal(carriedOut(o('jar'), { xeno: { jars: [{ id: 'M', seed: 1, at: new Date(at).toISOString() }] } }).done, true);
  assert.equal(carriedOut(o('radio'), { radio: { hails: [{ star: 'Vega', sent: noon(day) }] } }).done, true);
  assert.equal(carriedOut(o('missions'), { missions: { hails: { v1: noon(day) } } }).done, true);
  assert.equal(carriedOut(o('directive'), { directive: { heard: [{ case: 'a', path: [], t: noon(day) }] } }).done, true);
  // A star never visited before; a voyage's leg; a hundred light years in a day.
  assert.equal(carriedOut(o('new'), {}, [entry(day, 7), entry('2026-11-01', 9)]).done, true);
  assert.equal(carriedOut(o('new'), {}, [entry(day, 7), entry('2026-11-01', 7)]).done, false, 'a star visited before counted as new');
  assert.equal(carriedOut(o('voyage'), {}, [entry(day, 7, { voyage: { id: 'brightest', leg: 1, of: 7 } })]).done, true);
  assert.equal(carriedOut(o('far'), {}, [entry(day, 7, { ly: 60 }), entry(day, 9, { ly: 45 })]).done, true);
  assert.equal(carriedOut(o('far'), {}, [entry(day, 7, { ly: 60 }), entry('2026-11-19', 9, { ly: 45 })]).done, false);
  // Records that aren't records carry nothing out.
  for (const kind of Object.keys(ORDERS)) assert.equal(carriedOut(o(kind), { maru: 'x', xeno: { jars: 'x' }, distress: null }, []).done, false, kind);
});

test('days served, and a tour of duty that forgives one missed day', () => {
  assert.deepEqual(served([], '2026-11-20'), { total: 0, tour: 0, best: 0, today: false });
  // Served the 14th to the 16th, missed the 17th, served the 18th to the 20th: one tour of six days.
  const days = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20'];
  assert.deepEqual(served(days, '2026-11-20'), { total: 6, tour: 6, best: 6, today: true });
  // Not yet aboard today: yesterday's tour is still open, and so it is the day after a missed day.
  assert.equal(served(days, '2026-11-21').tour, 6);
  assert.equal(served(days, '2026-11-22').tour, 6);
  // Two days missed: the tour is over (nothing is taken away), and the next day aboard starts another.
  assert.deepEqual(served(days, '2026-11-23'), { total: 6, tour: 0, best: 6, today: false });
  assert.deepEqual(served([...days, '2026-11-22'], '2026-11-22'), { total: 7, tour: 7, best: 7, today: true }, 'two days apart is one missed day');
  assert.deepEqual(served([...days, '2026-11-24'], '2026-11-24'), { total: 7, tour: 1, best: 6, today: true });
  // Doubles and days still to come count for nothing.
  assert.equal(served(['2026-11-20', '2026-11-20', '2026-12-25', 'nonsense'], '2026-11-20').total, 1);
});

test('the days aboard are read from every room’s record', () => {
  const rec = {
    maru: { daily: { date: '2026-11-15' } }, contact: { daily: { date: '2026-11-16' } },
    directive: { heard: [{ case: 'a', path: [], t: noon('2026-11-17') }] }, survey: { exam: { day: '2026-11-13', marks: [true] } },
  };
  const supps = [{ t: noon('2026-11-18'), kind: 'jar' }, { t: noon('2026-11-19'), kind: 'landed' }];
  assert.deepEqual([...activeDays(rec, [entry('2026-11-14', 3)], supps)].sort(), ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'], 'a hail landing is nothing done that day');
  assert.equal(activeDays({ survey: { exam: { day: '2026-11-13', marks: [] } } }).size, 0, 'an exam opened and not answered is nothing done');
});

test('ranks from Cadet to Captain, each with what the next one needs, and never taken away', () => {
  assert.deepEqual(RANKS.map(r => r.name), ['Cadet', 'Ensign', 'Lieutenant junior grade', 'Lieutenant', 'Lieutenant Commander', 'Commander', 'Captain']);
  // Each rank needs at least as much as the one below it.
  for (let k = 2; k < RANKS.length; k++) for (const n of ['stars', 'rooms', 'days', 'orders']) assert.ok((RANKS[k][n] || 0) >= (RANKS[k - 1][n] || 0), `${RANKS[k].name} needs less ${n}`);
  assert.deepEqual(rankOf({}), { n: 0, name: 'Cadet', next: 'Ensign', needs: ['10 more stars', '1 more Kobayashi Maru run'] });
  assert.deepEqual(rankOf({ stars: 9, maru: 1 }).needs, ['1 more star']);
  assert.equal(rankOf({ stars: 12, maru: 1 }).name, 'Ensign');
  assert.deepEqual(rankOf({ stars: 30, maru: 2, rooms: 3, days: 2 }), { n: 1, name: 'Ensign', next: 'Lieutenant junior grade', needs: ['1 more room on the service record', '1 more day served'] });
  assert.equal(rankOf({ stars: 300, maru: 9, rooms: 10, days: 60, orders: 50 }).name, 'Captain');
  assert.deepEqual(rankOf({ stars: 400, maru: 9, rooms: 10, days: 99, orders: 99 }).needs, []);
  // A log cleared does not take a rank away: the rank held before stays.
  assert.equal(rankOf({ stars: 0 }, 3).name, 'Lieutenant');
  assert.equal(rankOf({ stars: 0 }, 99).name, 'Cadet', 'a rank that isn’t one');
});

test('the rooms on record are the eleven with a record to keep', () => {
  assert.equal(roomsOnRecord({}), 0);
  assert.equal(roomsOnRecord({
    maru: { taken: 1 }, contact: { met: 1 }, survey: { seen: 3 }, xeno: { tribble: { n: 1 } }, missions: { hails: { v1: 1 } }, radio: { hails: [{ star: 'Vega', sent: 1 }] },
    distress: { answered: 1 }, longway: { homes: 1 }, engineering: { shifts: 2 }, directive: { heard: [{ case: 'a' }] }, shipyard: { designs: [{ id: 'a' }] },
  }), 11);
  assert.equal(roomsOnRecord({ maru: { rescue: { taken: 1 } } }), 1, 'the rescue test puts the Kobayashi Maru on record');
  assert.equal(roomsOnRecord({ maru: 'x', xeno: { jars: [] }, longway: { trip: { seed: 1 } } }), 0);
});

test('commendations: earned, kept once earned, and the nearest still to come', () => {
  const none = commendations({});
  assert.deepEqual(none.earned, []);
  assert.ok(none.next && none.next.need > 0);
  const f = { charted: 35, chartedOf: 35, rescued: 4, jars: 11, endings: 3, farthest: 120, bestTour: 2, orders: 1, challenges: 0, homeEarly: false };
  const c = commendations(f);
  assert.deepEqual(c.earned.map(x => x.name), ['Cartographer']);
  assert.deepEqual([c.next.name, c.next.have, c.next.need], ['Xenobiologist', 11, 12], 'the nearest is the one most nearly done');
  assert.deepEqual(commendations({ ...f, charted: 2 }, { charted: '2026-11-01' }).earned.map(x => x.id), ['charted'], 'a commendation earned is kept');
  assert.equal(commendations({ homeEarly: true }).earned.some(x => x.id === 'home'), true);
  assert.equal(new Set(COMMENDATIONS.map(x => x.id)).size, COMMENDATIONS.length);
});

test('today on the bridge: today’s simulation, hail and distress call, a friend, a landing and a trip under way', () => {
  const day = '2026-11-20';
  const blank = todayItems({}, day);
  assert.deepEqual(blank.map(x => [x.name, x.done, x.href]), [
    ['Today’s simulation', false, 'maru.html'], ['Today’s hail', false, 'contact.html'], ['Today’s distress call', false, 'distress.html'],
    ['Today’s exam', false, 'survey.html#exam'], ['Today’s rescue test', false, 'maru.html'], ['Today’s requisition', false, 'shipyard.html'],
  ]);
  assert.equal(blank[5].line, requisition(day).says.slice(0, -1));
  const filled = todayItems({ shipyard: { designs: [{ id: 'a', name: 'Meridian', hull: 'scout', e: 40, s: 30 }], filled: { [day]: 'a' } } }, day)[5];
  assert.deepEqual([filled.line, filled.done], ['Filled with the USS Meridian', true]);
  const rec = {
    maru: { daily: { date: day }, rescue: { daily: { date: day, line: 'Rescue test, 20 Nov: 450 home, of the 480 it allowed' } } }, contact: { daily: { date: '2026-11-19' } },
    distress: { calls: [{ day, star: 'Procyon', found: true }] },
    longway: { trip: { seed: 3, quarter: 9, left: 61234.5 } }, survey: { exam: { day, marks: [true, false] } },
  };
  const items = todayItems(rec, day, { friend: 'Qaethuk', landings: [{ star: 'Proxima Centauri', title: 'Proxima Centauri' }] });
  assert.deepEqual(items.map(x => [x.name, x.line, x.done]), [
    ['Today’s simulation', 'Sat', true],
    ['Today’s hail', 'An unknown ship, the same for everyone', false],
    ['Today’s distress call', 'Rescued at Procyon', true],
    ['Today’s exam', 'Cover your tracks: 2 of 5 worlds so far', false],
    ['Today’s rescue test', '450 home, of the 480 it allowed', true],
    ['Today’s requisition', requisition(day).says.slice(0, -1), false],
    ['The Qaethuk are hailing again', 'Second contact', false],
    ['Your hail reached Proxima Centauri', 'Today, after the long way there', true],
    ['The long way home', 'Under way: year 3, 61,235 light years to go', false],
  ]);
  assert.equal(items[7].href, 'radio.html#hail=Proxima%20Centauri');
  // Yesterday's rescue is not today's.
  assert.equal(todayItems({ maru: { rescue: { daily: { date: '2026-11-19', line: 'x' } } } }, day)[4].done, false);
  assert.equal(todayItems({ distress: { calls: [{ day, star: 'Vega', left: true }] } }, day)[2].line, 'Lost');
  // Today's exam: all five filed is done; yesterday's exam is not today's.
  const filed = todayItems({ survey: { exam: { day, marks: [true, true, false, true, true] } } }, day)[3];
  assert.deepEqual([filed.line, filed.done], ['Cover your tracks: 4 of 5 filed', true]);
  assert.equal(todayItems({ survey: { exam: { day: '2026-11-19', marks: [true, true, true, true, true] } } }, day)[3].done, false);
});

test('what is kept: days served, orders carried out, the rank and the commendations, brought up to date', () => {
  const find = name => ({ Vega: 7 })[name];
  // A fortnight's orders are read back from the records: an order carried out days ago, while the log stayed shut.
  // (The first day from 20 November with a Kobayashi Maru order in the fortnight before it.)
  let today = '2026-11-20', order = null, back = 0;
  for (let t = 0; t < 60 && !order; t++, today = addDays(today, 1)) {
    for (let k = 3; k < 14 && !order; k++) { const o = orderOf(addDays(today, -k)); if (o.kind === 'maru') { order = o; back = k; } }
  }
  today = addDays(today, -1);
  assert.ok(order, 'no Kobayashi Maru order in two months to try');
  const rec = { maru: { daily: { date: order.day }, taken: 1 } };
  const log = Array.from({ length: 12 }, (_, k) => entry(addDays(today, -(k % 3)), k + 1));
  const u = update(null, { rec, log, supps: [], find, today, f: { stars: 12, maru: 1, rooms: 1 } });
  assert.ok(u.duty.orders.includes(order.day), `the order of ${back} days ago was not counted`);
  assert.deepEqual(u.duty.days, [...new Set([order.day, addDays(today, -2), addDays(today, -1), today])].sort(), 'the days aboard: the arrivals’ and the simulation’s');
  assert.equal(u.rank.name, 'Ensign');
  assert.equal(u.duty.rank, 1);
  assert.equal(u.duty.promoted, today);
  assert.equal(u.changed, true);
  // Again, the same day: nothing changes, so nothing is saved.
  const again = update(u.duty, { rec, log, supps: [], find, today, f: { stars: 12, maru: 1, rooms: 1 } });
  assert.equal(again.changed, false);
  // The log cleared and the Kobayashi Maru's record gone: the days, the orders and the rank all stay.
  const after = update(u.duty, { rec: {}, log: [], supps: [], find, today: addDays(today, 1), f: {} });
  assert.deepEqual([after.rank.name, after.duty.days.length >= 3, after.duty.orders.includes(order.day), after.duty.promoted], ['Ensign', true, true, today]);
  // Read back from a save: junk is left out.
  assert.deepEqual(tidyDuty({ days: ['2026-11-20', 'x', 3, '2026-11-20'], orders: 'no', rank: 'Captain', medals: { charted: '2026-11-01', made_up: '2026-11-01', jars: 4 } }),
    { days: ['2026-11-20'], orders: [], rank: 0, promoted: null, medals: { charted: '2026-11-01' } });
  // Two copies put together keep everything earned on either.
  const m = mergeDuty({ days: ['2026-11-01'], orders: ['2026-11-01'], rank: 2, promoted: '2026-11-01', medals: { jars: '2026-11-05' } }, { days: ['2026-11-02'], rank: 1, medals: { jars: '2026-11-03', rescue: '2026-11-04' } });
  assert.deepEqual(m, { days: ['2026-11-01', '2026-11-02'], orders: ['2026-11-01'], rank: 2, promoted: '2026-11-01', medals: { jars: '2026-11-03', rescue: '2026-11-04' } });
});

test('today on the bridge: a long mission’s answer due today, or come in, and none from a silent ship', () => {
  const now = new Date(2026, 10, 20, 12, 0).getTime(), hour = 3600000;
  const light = { v1: 23 * hour, v2: 19.5 * hour, nh: 8 * hour, p10: null };
  const missions = { hails: { v1: now - 40 * hour, v2: now - 30 * hour, nh: now - 60 * hour, p10: now - 2 * hour, x: 'no' } };
  // Voyager 1: sent 40 hours ago, home 46 hours after, so at six this evening. Voyager 2: sent 30 hours ago, home 39
  // hours after, at nine tonight. New Horizons: home two days ago. Pioneer 10 can't answer.
  const due = answersDue(missions, now, id => light[id] ?? null);
  assert.deepEqual(due.map(a => [a.id, new Date(a.at).getHours()]), [['v1', 18], ['v2', 21]]);
  // Heard later when no dish could hear her as it reached Earth: Voyager 2's waits an hour and a half for Canberra.
  const late = answersDue(missions, now, id => light[id] ?? null, (id, at) => (id === 'v2' ? at + 1.5 * hour : at));
  assert.deepEqual(late.map(a => [a.id, new Date(a.at).getHours(), new Date(a.at).getMinutes(), new Date(a.home).getHours()]), [['v1', 18, 0, 18], ['v2', 22, 30, 21]]);
  assert.equal(answersDue(missions, now, id => light[id] ?? null, (id, at) => at - hour)[0].at, now + 6 * hour, 'never before it reaches Earth');
  assert.equal(todayItems({}, '2026-11-20', { now, answers: late.map(a => ({ ...a, name: a.id })) }).at(-1).line, 'At 22:30, when a dish can hear her');
  assert.deepEqual(answersDue({}, now, () => hour), []);
  assert.deepEqual(answersDue({ hails: { v1: now + hour } }, now, () => hour), [], 'a hail from a clock set ahead');
  const items = todayItems({}, '2026-11-20', { now, answers: [{ id: 'v1', name: 'Voyager 1', at: now + 6 * hour }, { id: 'nh', name: 'New Horizons', at: now - 2 * hour }] });
  assert.deepEqual(items.slice(-2).map(x => [x.name, x.line, x.done, x.href]), [
    ['Voyager 1’s answer is due today', 'At 18:00, at the speed of light', false, 'missions.html#v1'],
    ['New Horizons answered your hail', 'Her answer came in at 10:00', true, 'missions.html#nh'],
  ]);
});
