// Duty: what brings an officer back to the bridge each day, read from every room's record. Today on the bridge, at
// the head of the captain's log, gathers what is new today across the rooms: Starfleet's order of the day, today's
// hail, simulation, exam and distress call, a friend hailing again, a hail landing, a long mission's answer due, a trip
// home under way. The service record
// carries a rank, from Cadet to Captain, earned from what has been done in every room, with what the next one needs,
// the days served (and the tour under way, which a single missed day doesn't end), and commendations to see coming.
// Everything is worked out in the page from the date and the records, the same for every officer on the same day:
// there is no server, nothing is lost by missing a day, and no clock runs against anyone. What has been earned is kept
// beside the bridge's own save (`duty`), so it stays earned if a room's record is cleared or cut to its latest runs.
// Pure: js/app.js reads the records and hands them in. Checked by test/duty.test.mjs.
import { DESTINATIONS } from './destinations.js';
import { CHALLENGES } from './contact-sim.js';
import { entryTime } from './logbook.js';
import { EXAM } from './quiz.js';

const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const list = x => (Array.isArray(x) ? x.filter(y => y && typeof y === 'object' && !Array.isArray(y)) : []);
const count = x => (Number.isInteger(x) && x > 0 ? x : 0);
const DAY_RE = /^\d{4}-\d\d-\d\d$/;

// ---------- Days ----------

// The calendar day a moment fell on, where the captain is: "2026-11-20".
export function dayOf(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// The day `n` days after `day` (before, for n < 0).
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n, 12));
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

// The days something was done aboard, from what every room keeps: each arrival in the log, each supplemental line a
// room adds (but for a hail landing, which nobody did that day), today's simulation, hail and exam, and each hearing
// before the board of inquiry. `supps` are the log's supplemental lines (js/voyage.js).
export function activeDays(rec = {}, log = [], supps = []) {
  const days = new Set();
  for (const e of log) { const t = entryTime(e); if (Number.isFinite(t)) days.add(dayOf(t)); }
  for (const s of supps) if (s.kind !== 'landed' && Number.isFinite(s.t)) days.add(dayOf(s.t));
  const exam = obj(obj(rec.survey).exam);
  for (const d of [obj(obj(rec.maru).daily).date, obj(obj(rec.contact).daily).date, Array.isArray(exam.marks) && exam.marks.length ? exam.day : null]) if (typeof d === 'string' && DAY_RE.test(d)) days.add(d);
  for (const h of list(obj(rec.directive).heard)) if (Number.isFinite(h.t)) days.add(dayOf(h.t));
  return days;
}

// Days served: how many, and the tour of duty under way. A tour goes on while no two days in a row are missed: one
// day off is forgiven. `tour` is the days served in the tour under way, nothing once two days have gone by without
// one (the next day served starts a new tour); `best` the longest tour.
export function served(days, today) {
  const all = [...new Set(days)].filter(d => DAY_RE.test(d) && d <= today).sort();
  let best = 0, run = 0, last = null;
  for (const d of all) {
    run = last && daysBetween(last, d) <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  const alive = last && daysBetween(last, today) <= 2;
  return { total: all.length, tour: alive ? run : 0, best, today: last === today };
}

// ---------- Orders of the day ----------

// A seeded pick, so the day's order is the same for every officer.
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
// The places an order can send the ship: the charted destinations, home aside.
export const ORDER_PLACES = DESTINATIONS.filter(d => d.star !== 'Sol');
// What a star order asks to be reported, and the section of the log's entry that answers it.
export const ASKS = {
  home: { says: p => `Proceed to ${p} and report how our Sun looks from there.`, section: 'Looking home' },
  sky: { says: p => `Proceed to ${p} and report the brightest star in its sky.`, section: 'The sky from here' },
  planets: { says: p => `Proceed to ${p} and report on its planets.`, section: 'Planets' },
};
// The other orders: what each asks, and where to carry it out.
export const ORDERS = {
  maru: { says: 'Sit today’s Kobayashi Maru simulation. Every cadet gets the same dice today.', href: 'maru.html', go: 'Kobayashi Maru' },
  contact: { says: 'Answer today’s hail in first contact. Every officer hears the same ship today.', href: 'contact.html', go: 'First contact' },
  distress: { says: 'Answer today’s distress call, and find the survivors before their air runs out.', href: 'distress.html', go: 'Distress call' },
  jar: { says: 'Grow a creature in the xenobiology lab and keep it in a jar.', href: 'xeno.html', go: 'Xenobiology lab' },
  radio: { says: 'Send a hail to a star of your choosing on subspace radio.', href: 'radio.html#hail', go: 'Subspace radio' },
  missions: { says: 'Hail one of the long missions from Earth.', href: 'missions.html', go: 'Long missions' },
  directive: { says: 'Sit a hearing before the board of inquiry in the Prime Directive room.', href: 'directive.html', go: 'The Prime Directive' },
  new: { says: 'Visit a star you have never been to.', href: null },
  voyage: { says: 'Fly a leg of a voyage. The voyages are at the top of Set course.', href: null },
  far: { says: 'Cover 100 light years today, in as many trips as it takes.', href: null },
};
// How often each kind comes up: a star to visit on about four days in ten.
const KINDS = ['star', 'star', 'star', 'star', 'maru', 'contact', 'distress', 'jar', 'radio', 'missions', 'directive', 'new', 'voyage', 'far'];
const lower = t => t.replace(/^The /, 'the ');

// The order of the day for `day`: { day, kind, says, href, go } and, for a star, { star (its catalogue name), title,
// ask }. A day whose first pick would repeat the day before's (the same place, or the same order of another kind) picks
// again, so the same order hardly ever comes two days running.
export function orderOf(day) {
  const pick = d => {
    const h = hash(`orders:${d}`);
    const kind = KINDS[h % KINDS.length];
    if (kind !== 'star') return { kind };
    const p = ORDER_PLACES[Math.floor(h / KINDS.length) % ORDER_PLACES.length];
    const asks = p.planets ? ['home', 'sky', 'planets'] : ['home', 'sky'];
    return { kind, star: p.star, title: p.title, ask: asks[Math.floor(h / KINDS.length / ORDER_PLACES.length) % asks.length] };
  };
  let o = pick(day);
  const before = pick(addDays(day, -1));
  for (let k = 1; k < 6 && o.kind === before.kind && (o.kind !== 'star' || o.star === before.star); k++) o = pick(`${day}+${k}`);
  if (o.kind === 'star') return { day, ...o, says: ASKS[o.ask].says(lower(o.title)), href: null, go: null };
  return { day, ...o, ...ORDERS[o.kind] };
}

// Whether the order for its day was carried out that day, from the records: { done, entry } where `entry` is the log
// entry that answers a star order. `find(name)` is a star's catalogue index. `here` is the star the ship holds at now,
// for today's order only: a ship already at the star it is sent to has proceeded there, and its latest entry reports.
export function carriedOut(order, rec = {}, log = [], find = () => undefined, here = undefined) {
  const on = t => Number.isFinite(t) && dayOf(t) === order.day;
  const at = x => Date.parse(x);
  const todays = log.filter(e => on(entryTime(e)));
  switch (order.kind) {
    case 'star': {
      const i = find(order.star);
      const entry = i === undefined ? null : todays.find(e => e.star === i)
        || (here === i ? log.filter(e => e.star === i).sort((a, b) => (entryTime(b) ?? 0) - (entryTime(a) ?? 0))[0] : null) || null;
      return { done: !!entry, entry };
    }
    case 'maru': return { done: obj(obj(rec.maru).daily).date === order.day };
    case 'contact': return { done: obj(obj(rec.contact).daily).date === order.day };
    case 'distress': return { done: list(obj(rec.distress).calls).some(c => c.day === order.day && !c.left) };
    case 'jar': return { done: list(obj(rec.xeno).jars).some(j => on(at(j.at))) };
    case 'radio': return { done: list(obj(rec.radio).hails).some(h => on(h.sent)) };
    case 'missions': return { done: Object.values(obj(obj(rec.missions).hails)).some(on) };
    case 'directive': return { done: list(obj(rec.directive).heard).some(h => on(h.t)) };
    case 'new': {
      // An arrival that day at a star with no entry before it.
      const done = todays.some(e => e.star !== 0 && !log.some(x => x.star === e.star && (entryTime(x) ?? Infinity) < entryTime(e)));
      return { done };
    }
    case 'voyage': return { done: todays.some(e => e.voyage) };
    case 'far': return { done: todays.reduce((sum, e) => sum + (e.ly > 0 ? e.ly : 0), 0) >= 100 };
    default: return { done: false };
  }
}

// What the log's entry reports, for a star order carried out: the first sentence of the section it asked for.
export function reportOf(order, entry) {
  if (!entry) return '';
  const want = ASKS[order.ask]?.section;
  const s = (Array.isArray(entry.sections) ? entry.sections : []).find(x => Array.isArray(x) && x[0] === want)
    || (Array.isArray(entry.sections) ? entry.sections : []).find(x => Array.isArray(x) && x[0] === 'Looking home');
  const said = typeof s?.[1] === 'string' ? s[1] : typeof entry.intro === 'string' ? entry.intro : '';
  return (said.match(/^.*?[.!?](?=\s|$)/)?.[0] || said).slice(0, 240);
}

// ---------- Today on the bridge ----------

// The long missions whose answer to your hail comes in today: [{ id, at }], soonest first. A hail's answer is home twice
// the light-time after it went (as long missions works it out); `lightMsOf(id)` is the light-time to her now, in
// milliseconds, or null for a ship that can't answer (Pioneer 10 and 11 are silent).
export function answersDue(missions = {}, now = Date.now(), lightMsOf = () => null) {
  const day = dayOf(now), out = [];
  for (const [id, sent] of Object.entries(obj(obj(missions).hails))) {
    if (!Number.isFinite(sent) || sent > now) continue;
    const light = lightMsOf(id);
    if (!(light > 0)) continue;
    const at = sent + 2 * light;
    if (dayOf(at) === day) out.push({ id, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
const clock = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// What is new today across the rooms, in order: { id, name, line, href, done }. `landings` are hails to stars landing
// today, `friend` a people hailing again, `answers` the long missions' answers due today ({ id, name, at }, see answersDue).
export function todayItems(rec = {}, day, { landings = [], friend = null, answers = [], now = Date.now() } = {}) {
  const items = [];
  const maru = obj(obj(rec.maru).daily), contact = obj(obj(rec.contact).daily);
  items.push({ id: 'maru', name: 'Today’s simulation', href: 'maru.html', done: maru.date === day, line: maru.date === day ? 'Sat' : 'The same dice for every cadet' });
  items.push({ id: 'contact', name: 'Today’s hail', href: 'contact.html', done: contact.date === day, line: contact.date === day ? 'Answered' : 'An unknown ship, the same for everyone' });
  const call = list(obj(rec.distress).calls).find(c => c.day === day);
  items.push({ id: 'distress', name: 'Today’s distress call', href: 'distress.html', done: !!call,
    line: !call ? 'Survivors waiting' : call.found ? `Rescued at ${call.star}` : 'Lost' });
  const exam = obj(obj(rec.survey).exam), marks = exam.day === day && Array.isArray(exam.marks) ? exam.marks.filter(m => typeof m === 'boolean') : [];
  items.push({ id: 'exam', name: 'Today’s exam', href: 'survey.html#exam', done: marks.length >= EXAM,
    line: marks.length >= EXAM ? `Cover your tracks: ${marks.filter(Boolean).length} of ${EXAM} filed` : marks.length ? `Cover your tracks: ${marks.length} of ${EXAM} worlds so far` : 'Cover your tracks: five worlds, the same for everyone' });
  if (friend) items.push({ id: 'friend', name: `The ${friend} are hailing again`, href: 'contact.html', done: false, line: 'Second contact' });
  for (const h of landings) items.push({ id: `landed:${h.star}`, name: `Your hail reached ${h.title}`, href: `radio.html#hail=${encodeURIComponent(h.star)}`, done: true, line: 'Today, after the long way there' });
  for (const a of answers) {
    items.push(a.at <= now
      ? { id: `answer:${a.id}`, name: `${a.name} answered your hail`, href: `missions.html#${a.id}`, done: true, line: `Her answer came in at ${clock(a.at)}` }
      : { id: `answer:${a.id}`, name: `${a.name}’s answer is due today`, href: `missions.html#${a.id}`, done: false, line: `At ${clock(a.at)}, at the speed of light` });
  }
  const trip = obj(obj(rec.longway).trip);
  if (Number.isInteger(trip.quarter) && trip.seed != null) {
    items.push({ id: 'longway', name: 'The long way home', href: 'longway.html', done: false, line: `Under way: year ${Math.floor(trip.quarter / 4) + 1}${Number.isFinite(trip.left) ? `, ${Math.round(trip.left).toLocaleString('en-US')} light years to go` : ''}` });
  }
  return items;
}

// ---------- Rank ----------

// The rooms whose records count toward a rank, and whether each has anything on it.
export const ROOM_RECORDS = {
  maru: r => count(r.taken) > 0 || list(r.runs).length > 0,
  contact: r => count(r.met) > 0 || list(r.runs).length > 0,
  survey: r => count(r.seen) > 0,
  xeno: r => list(r.jars).length > 0 || !!r.tribble,
  missions: r => Object.keys(obj(r.hails)).length > 0,
  radio: r => list(r.hails).length > 0,
  distress: r => count(r.answered) > 0,
  longway: r => count(r.homes) > 0,
  engineering: r => count(r.shifts) > 0,
  directive: r => list(r.heard).length > 0,
};
export const roomsOnRecord = rec => Object.entries(ROOM_RECORDS).filter(([k, has]) => has(obj(rec[k]))).length;

// Starfleet's ranks, lowest first, and what each needs: stars visited, rooms with something on record (of the ten
// above), days served, orders of the day carried out, and for an ensign, one Kobayashi Maru sat. The names are
// Starfleet's own; the thresholds are Engage's.
export const RANKS = [
  { name: 'Cadet' },
  { name: 'Ensign', stars: 10, maru: 1 },
  { name: 'Lieutenant junior grade', stars: 25, rooms: 4, days: 3 },
  { name: 'Lieutenant', stars: 50, rooms: 6, days: 7, orders: 5 },
  { name: 'Lieutenant Commander', stars: 100, rooms: 8, days: 15, orders: 12 },
  { name: 'Commander', stars: 200, rooms: 9, days: 30, orders: 25 },
  { name: 'Captain', stars: 300, rooms: 10, days: 60, orders: 50 },
];
const NEEDS = [['stars', 'star', 'stars'], ['rooms', 'room on the service record', 'rooms on the service record'], ['days', 'day served', 'days served'], ['orders', 'order of the day', 'orders of the day'], ['maru', 'Kobayashi Maru run', 'Kobayashi Maru runs']];
const met = (r, f) => NEEDS.every(([k]) => !(r[k] > (f[k] || 0)));

// The rank held: the highest whose needs are met, or the highest held before (`held`), whichever is higher: a rank is
// never taken away. Returns { n, name, next, needs } where needs says what the next one still wants, in words.
export function rankOf(f, held = 0) {
  let n = 0;
  for (let k = 1; k < RANKS.length; k++) if (met(RANKS[k], f)) n = k;
  n = Math.max(n, Number.isInteger(held) && held >= 0 && held < RANKS.length ? held : 0);
  const next = RANKS[n + 1] || null;
  const needs = next ? NEEDS.filter(([k]) => next[k] > (f[k] || 0)).map(([k, one, many]) => {
    const more = next[k] - (f[k] || 0);
    return `${more.toLocaleString('en-US')} more ${more === 1 ? one : many}`;
  }) : [];
  return { n, name: RANKS[n].name, next: next?.name || null, needs };
}

// ---------- Commendations ----------

// Engage's own commendations, each with how far along it is: [have, need]. `f` is what has been done.
export const COMMENDATIONS = [
  { id: 'charted', name: 'Cartographer', what: 'every charted destination reached', of: f => [f.charted, f.chartedOf] },
  { id: 'endings', name: 'No-win scenario', what: 'all nine of the Kobayashi Maru’s endings seen', of: f => [f.endings, 9] },
  { id: 'linguist', name: 'Linguist', what: `contact made with all ${CHALLENGES.length} of the linguist’s challenges`, of: f => [f.challenges, CHALLENGES.length] },
  { id: 'rescue', name: 'Search and rescue', what: 'ten crews rescued', of: f => [f.rescued, 10] },
  { id: 'deep', name: 'Deep space', what: 'a thousand light years from Sol', of: f => [Math.floor(f.farthest), 1000] },
  { id: 'jars', name: 'Xenobiologist', what: 'twelve creatures kept in jars', of: f => [f.jars, 12] },
  { id: 'home', name: 'Home early', what: 'home from the Delta Quadrant in under 60 years', of: f => [f.homeEarly ? 1 : 0, 1] },
  { id: 'tour', name: 'A week on duty', what: 'a tour of seven days served', of: f => [f.bestTour, 7] },
  { id: 'orders', name: 'By the book', what: 'ten orders of the day carried out', of: f => [f.orders, 10] },
];

// Which are earned (by what has been done, or kept from before in `kept`, { id: day }) and the nearest still to come:
// { earned: [{ id, name, what }], next: { id, name, what, have, need } or null }.
export function commendations(f, kept = {}) {
  const earned = [], open = [];
  for (const c of COMMENDATIONS) {
    const [have, need] = c.of(f).map(x => (Number.isFinite(x) && x > 0 ? x : 0));
    if ((need > 0 && have >= need) || typeof obj(kept)[c.id] === 'string') earned.push({ id: c.id, name: c.name, what: c.what });
    else if (need > 0) open.push({ id: c.id, name: c.name, what: c.what, have: Math.min(have, need), need });
  }
  open.sort((a, b) => b.have / b.need - a.have / a.need);
  return { earned, next: open[0] || null };
}

// ---------- What is kept ----------

// The duty record, read back from the bridge's save: { days, orders, rank, medals, promoted }: the days served and
// the days an order was carried out (each "YYYY-MM-DD"), the rank held (an index of RANKS) and the day it came, and
// the commendations earned with the day each was. Anything else is left out.
export function tidyDuty(d) {
  const x = obj(d);
  const days = arr => [...new Set(Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && DAY_RE.test(s)) : [])].sort();
  const medals = {};
  for (const [k, v] of Object.entries(obj(x.medals))) if (COMMENDATIONS.some(c => c.id === k) && typeof v === 'string' && DAY_RE.test(v)) medals[k] = v;
  const rank = Number.isInteger(x.rank) && x.rank >= 0 && x.rank < RANKS.length ? x.rank : 0;
  return { days: days(x.days), orders: days(x.orders), rank, promoted: typeof x.promoted === 'string' && DAY_RE.test(x.promoted) ? x.promoted : null, medals };
}

// Two duty records as one, for Add to what's here and for another tab's: every day served and order carried out on
// either, the higher rank, and every commendation (with the earlier day).
export function mergeDuty(a, b) {
  const x = tidyDuty(a), y = tidyDuty(b);
  const medals = { ...y.medals };
  for (const [k, v] of Object.entries(x.medals)) if (!medals[k] || v < medals[k]) medals[k] = v;
  const rank = Math.max(x.rank, y.rank);
  return tidyDuty({ days: [...x.days, ...y.days], orders: [...x.orders, ...y.orders], rank, promoted: rank === x.rank ? x.promoted : y.promoted, medals });
}

// The duty record brought up to date for `today`: the days served the records show, each order of the last fortnight
// carried out on its day, the rank and the commendations earned. `f` is what has been done (see facts in js/app.js),
// without days and orders, which this adds; `here` is the star the ship holds at (see carriedOut). Returns { duty, f, rank, medals, changed }.
export function update(kept, { rec = {}, log = [], supps = [], find = () => undefined, here, today, f: done = {} }) {
  const was = tidyDuty(kept);
  const days = new Set([...was.days, ...activeDays(rec, log, supps)]);
  const orders = new Set(was.orders);
  for (let k = 0; k < 14; k++) {
    const day = addDays(today, -k);
    if (!orders.has(day) && carriedOut(orderOf(day), rec, log, find, k === 0 ? here : undefined).done) orders.add(day);
  }
  const s = served([...days], today);
  const f = { ...done, days: s.total, orders: orders.size, bestTour: s.best };
  const rank = rankOf(f, was.rank);
  const medals = { ...was.medals };
  for (const c of commendations(f, was.medals).earned) if (!medals[c.id]) medals[c.id] = today;
  const duty = tidyDuty({ days: [...days], orders: [...orders], rank: rank.n, promoted: rank.n > was.rank ? today : was.promoted, medals });
  const changed = JSON.stringify(duty) !== JSON.stringify(was);
  return { duty, f, served: s, rank, medals: commendations(f, medals), changed };
}
