// The captain's log, long: each arrival under the day it was made, the newest 50 at a time, a row for each star, and
// a search. Pure: the bridge draws what this works out. Checked by test/voyage.test.mjs.

export const DAY = 86400000;

// ---------- When ----------

// The moment of an arrival, in milliseconds. Each entry's id is the moment it was written; an entry from before ids
// were kept has only its stardate (the year and how far through it, in UTC), which is good to about nine hours.
export function entryTime(e) {
  if (Number.isFinite(e?.id) && e.id > 1e12) return e.id;
  const sd = Number(e?.stardate);
  if (!Number.isFinite(sd) || sd < 1900) return null;
  const y = Math.floor(sd), start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return Math.round(start + (sd - y) * (end - start));
}

// The day an item belongs to, by the calendar where the captain is: "2026-11-18".
export const dayKey = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A day's heading: "Wednesday 18 November · 6 arrivals", with the year when it isn't this one, and the supplemental
// lines counted when there are any.
export function dayHeading(t, arrivals, supps = 0, now = Date.now()) {
  const d = new Date(t);
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
    .replace(',', '');
  const counts = [arrivals && `${arrivals} ${arrivals === 1 ? 'arrival' : 'arrivals'}`, supps && `${supps} supplemental`].filter(Boolean);
  return [date, ...counts].join(' · ');
}

// The time of day an arrival was logged: "2:32 pm".
export const clockTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toLowerCase();

// ---------- The log, day by day ----------

// The arrivals and the supplemental lines in one list, newest first: { t, entry, k } for an arrival (k is its place in
// the log) and { t, supp } for a line. `log` is newest first, as the bridge keeps it.
export function timeline(log, supps = []) {
  const items = log.map((entry, k) => ({ t: entryTime(entry) ?? 0, entry, k }));
  for (const supp of supps) items.push({ t: supp.t, supp });
  // A stable sort: two arrivals with no time keep the log's order.
  return items.map((x, n) => [x, n]).sort((a, b) => b[0].t - a[0].t || a[1] - b[1]).map(([x]) => x);
}

// The timeline cut into days: [{ key, t, arrivals, supps, items }], newest first. Arrivals with no time at all go
// under one undated day at the end.
export function byDay(items) {
  const days = [];
  for (const x of items) {
    const key = x.t ? dayKey(x.t) : 'undated';
    let day = days[days.length - 1];
    if (!day || day.key !== key) days.push(day = { key, t: x.t, arrivals: 0, supps: 0, items: [] });
    day.items.push(x);
    if (x.entry) day.arrivals++; else day.supps++;
  }
  return days;
}

// The newest `n` arrivals and the lines among them: the log opens with 50, and Show earlier adds 50 more. The lines
// between the oldest arrival shown and the next one come with the page; the next arrival waits for Show earlier.
export function newest(items, n) {
  let seen = 0;
  const out = [];
  for (const x of items) {
    if (x.entry && seen === n) break;
    if (x.entry) seen++;
    out.push(x);
  }
  return out;
}

// One row for each star in the log, most recently visited first: { star, title, n, last, first } (last and first
// are entries).
export function byStar(log) {
  const rows = new Map();
  for (const e of log) {
    const row = rows.get(e.star);
    if (row) { row.n++; row.first = e; } else rows.set(e.star, { star: e.star, title: e.title, n: 1, last: e, first: e });
  }
  return [...rows.values()];
}

// Whether an entry (or a supplemental line) has `q` in it: its star's name, the line under it, or anything the
// entry says. Capitals and accents don't count: "proxima" finds Proxima, "beteigeuze" doesn't, "alnitak" does.
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matches(x, q) {
  const want = fold(q).trim();
  if (!want) return true;
  if (x.supp) return fold(x.supp.text).includes(want);
  const e = x.entry ?? x;
  return [e.title, e.intro, ...(Array.isArray(e.sections) ? e.sections.flat() : [])].some(s => typeof s === 'string' && fold(s).includes(want));
}

// The log grows a search box and a By star view once it is longer than this.
export const LONG_LOG = 30;
// And shows this many arrivals at a time.
export const PAGE = 50;

