// Ship's records: everything Engage keeps, saved to one file and restored from it. Everything lives in one browser on
// one device; lose the phone, clear the browser, or move from a browser tab to the installed copy on an iPhone (which
// has storage of its own) and the log, the jars and the records are gone. Pure: Bridge settings reads the storage,
// writes it and handles the file. Checked by test/voyage.test.mjs.
//
// The file is a promise (the README says so): one JSON object,
//   { "format": "Engage ship’s records", "version": 1, "saved": "<ISO time>", "keys": { "<key>": <what is kept> } }
// where each key is one of Engage's in the browser's storage and its value is what Engage keeps there, as JSON (or
// as the plain text, for the two keys that keep text). A file of this format and version is always restored. A later
// Engage that needs more adds keys, and a new version number only for a change an older Engage couldn't read.

import { peoplesMet, peoplesMade } from './contact-sim.js';
import { mergeDuty } from './duty.js';

export const FORMAT = 'Engage ship’s records';
export const VERSION = 1;

// Engage's keys all start "engage.". Whether this browser has been asked to keep Engage's storage belongs to the
// browser, not to the records, and stays behind.
const DEVICE = new Set(['engage.asked-to-keep']);
export const carried = key => typeof key === 'string' && key.startsWith('engage.') && !DEVICE.has(key);

// What a key keeps, read for the file: JSON where it is JSON, and otherwise the text itself.
export const fromRaw = raw => { try { return JSON.parse(raw); } catch { return raw; } };
// And back, for the browser's storage.
export const rawOf = value => (typeof value === 'string' ? value : JSON.stringify(value));

// The file for what the storage holds: `entries` are [key, raw text] pairs.
export function pack(entries, now = new Date()) {
  const keys = {};
  for (const [key, raw] of entries) if (carried(key) && typeof raw === 'string') keys[key] = fromRaw(raw);
  return { format: FORMAT, version: VERSION, saved: now.toISOString(), keys };
}

// "engage-records-2026-11-19.json", by the calendar where the captain is.
export function fileName(now = new Date()) {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `engage-records-${d}.json`;
}

// A file read back: { file } when it is a copy of Engage's records, or { why } in words when it isn't.
export function unpack(text) {
  let f;
  try { f = JSON.parse(text); } catch { return { why: 'That file isn’t a copy of Engage’s records.' }; }
  if (!f || typeof f !== 'object' || f.format !== FORMAT || !f.keys || typeof f.keys !== 'object' || Array.isArray(f.keys)) {
    return { why: 'That file isn’t a copy of Engage’s records.' };
  }
  if (!Number.isInteger(f.version) || f.version < 1) return { why: 'That file isn’t a copy of Engage’s records.' };
  if (f.version > VERSION) return { why: 'That copy was saved by a newer Engage. Reload this page to update it, then try again.' };
  const keys = {};
  for (const [key, value] of Object.entries(f.keys)) if (carried(key) && value !== null && value !== undefined) keys[key] = value;
  return { file: { ...f, keys } };
}

const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
const list = x => (Array.isArray(x) ? x.filter(y => y && typeof y === 'object' && !Array.isArray(y)) : []);
const count = x => (Number.isInteger(x) && x > 0 ? x : 0);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// What a copy holds, in a line: "212 log entries, 14 creatures in jars, 9 simulations, 3 encounters, 2 hails".
export function contents(file) {
  const k = file.keys;
  const parts = [
    list(obj(k['engage.v1'])?.log).length && plural(list(obj(k['engage.v1']).log).length, 'log entry', 'log entries'),
    list(obj(k['engage.xeno.v1'])?.jars).length && plural(list(obj(k['engage.xeno.v1']).jars).length, 'creature in a jar', 'creatures in jars'),
    obj(k['engage.maru.v1']) && Math.max(count(k['engage.maru.v1'].taken), list(k['engage.maru.v1'].runs).length)
      && plural(Math.max(count(k['engage.maru.v1'].taken), list(k['engage.maru.v1'].runs).length), 'simulation'),
    list(obj(k['engage.contact.v1'])?.runs).length && plural(list(obj(k['engage.contact.v1']).runs).length, 'encounter'),
    obj(obj(k['engage.missions.v1'])?.hails) && Object.keys(k['engage.missions.v1'].hails).length && plural(Object.keys(k['engage.missions.v1'].hails).length, 'hail'),
    count(obj(k['engage.survey.v1'])?.best) && `a best streak of ${k['engage.survey.v1'].best}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'settings only, nothing logged';
}

// ---------- Add to what's here ----------

// Two records of one kind put together, for Add to what's here. What is listed (log entries, runs, encounters, jars,
// hails) is put together without doubles, matched by its own name; a count kept beside a list goes up by what was
// added; a best is the better of the two; a setting stays as it is here. `here` and `theirs` are what each keeps
// under the key (here may be missing).
const ENTRY = e => (Number.isFinite(e.id) ? `id:${e.id}` : `${e.star}|${e.stardate}|${e.title}`);
const RUN = r => (typeof r.id === 'string' && r.id ? r.id : `${r.at}|${r.title}`);
const JAR = j => `${typeof j.world === 'string' ? `w:${j.world}` : `c:${j.id}`}|${j.seed}`;
const when = x => { const t = Date.parse(x?.at); return Number.isFinite(t) ? t : 0; };
const entryWhen = e => (Number.isFinite(e.id) ? e.id : 0);

// The two lists as one, here's first, without doubles; and how many of each side the other didn't have.
function union(mine, yours, name) {
  const seen = new Set(mine.map(name));
  const added = yours.filter(x => !seen.has(name(x)));
  const theirs = new Set(yours.map(name));
  return { all: [...mine, ...added], added, only: mine.filter(x => !theirs.has(name(x))) };
}
const better = (a, b) => (['A', 'B', 'C', 'D', 'F'].includes(a) && (!b || a < b) ? a : b);
const notebook = x => (x && Number.isInteger(x.decoded) && Number.isInteger(x.of) && x.of > 0 ? x : null);
const newer = (a, b) => (obj(a) && obj(b) ? (String(b.date) > String(a.date) ? b : a) : obj(a) || obj(b) || undefined);
export const JAR_MAX = 40; // the lab's shelf (js/xeno.js)

const MERGE = {
  'engage.v1'(here, theirs) {
    const u = union(list(here.log), list(theirs.log), ENTRY);
    const log = u.all.sort((a, b) => entryWhen(b) - entryWhen(a));
    const ly = (Number.isFinite(here.ly) ? here.ly : 0) + u.added.reduce((sum, e) => sum + (e.ly > 0 ? e.ly : 0), 0);
    // The Sun says hello once ever: said on either, it has been said.
    // Days served, orders carried out, rank and commendations: everything earned on either.
    const duty = here.duty || theirs.duty ? { duty: mergeDuty(here.duty, theirs.duty) } : {};
    return { ...here, log, ly, seenIntro: !!(here.seenIntro || theirs.seenIntro), ...(here.ship || !theirs.ship ? {} : { ship: theirs.ship }), ...(here.sunHello || theirs.sunHello ? { sunHello: true } : {}), ...duty };
  },
  'engage.maru.v1'(here, theirs) {
    const u = union(list(here.runs), list(theirs.runs), RUN);
    const best = {};
    for (const g of new Set([...Object.keys(obj(here.best) || {}), ...Object.keys(obj(theirs.best) || {})])) best[g] = better(obj(here.best)?.[g], better(obj(theirs.best)?.[g]));
    const oh = obj(here.officer) || {}, ot = obj(theirs.officer) || {};
    const passed = [oh.passed, ot.passed].filter(p => typeof p === 'string' && p).sort()[0] || '';
    return {
      ...here,
      runs: u.all.sort((a, b) => when(a) - when(b)).slice(-30),
      taken: Math.max(count(here.taken) + u.added.length, count(theirs.taken) + u.only.length, u.all.length),
      seen: [...new Set([...(Array.isArray(here.seen) ? here.seen : []), ...(Array.isArray(theirs.seen) ? theirs.seen : [])])],
      best,
      ...(oh.taken || ot.taken ? { officer: { taken: Math.max(count(oh.taken), count(ot.taken)), passed } } : {}),
      ...(newer(here.daily, theirs.daily) ? { daily: newer(here.daily, theirs.daily) } : {}),
      ...(here.game || !theirs.game ? {} : { game: theirs.game }),
    };
  },
  'engage.contact.v1'(here, theirs) {
    const u = union(list(here.runs), list(theirs.runs), RUN);
    // Each people counts once, by name: what one copy has met that the other hasn't adds to the other's count.
    const mh = peoplesMet(here), mt = peoplesMet(theirs), ch = peoplesMade(here), ct = peoplesMade(theirs);
    const minus = (a, b) => [...a].filter(x => !b.has(x)).length;
    const unnamed = rs => rs.filter(r => !r.second && typeof r.people !== 'string').length;
    const nh = notebook(here.best), nt = notebook(theirs.best);
    const best = !nh ? nt : !nt ? nh : nt.decoded * nh.of > nh.decoded * nt.of ? nt : nh;
    const friends = union(list(here.friends), list(theirs.friends), f => f.people).all;
    return {
      ...here,
      runs: u.all.sort((a, b) => when(a) - when(b)).slice(-30),
      met: Math.max(count(here.met) + minus(mt, mh) + unnamed(u.added), count(theirs.met) + minus(mh, mt) + unnamed(u.only)),
      contacts: Math.max(count(here.contacts) + minus(ct, ch), count(theirs.contacts) + minus(ch, ct)),
      peoples: [...new Set([...mh, ...mt])],
      ...(best ? { best } : {}),
      ...(friends.length ? { friends } : {}),
      ...(obj(here.challenges) || obj(theirs.challenges) ? { challenges: { ...obj(theirs.challenges), ...obj(here.challenges) } } : {}),
      ...(newer(here.daily, theirs.daily) ? { daily: newer(here.daily, theirs.daily) } : {}),
      ...(here.game || !theirs.game ? {} : { game: theirs.game }),
    };
  },
  'engage.xeno.v1'(here, theirs) {
    // The shelf holds 40: what is here stays, and the copy's fill what room is left.
    const u = union(list(here.jars), list(theirs.jars), JAR);
    // The tribbles' jar is apart from the shelf: the one here stays, or the copy's comes over with its count.
    return { ...here, jars: u.all.slice(0, Math.max(JAR_MAX, list(here.jars).length)), ...(obj(here.tribble) || !obj(theirs.tribble) ? {} : { tribble: theirs.tribble }) };
  },
  'engage.survey.v1'(here, theirs) {
    const theirsBest = count(theirs.best) > count(here.best);
    // The files used and the slips made: the larger count of each, so a copy of this same record adds nothing.
    const most = (a, b) => { const out = { ...(obj(a) || {}) }; for (const [k, v] of Object.entries(obj(b) || {})) if (count(v) > count(out[k])) out[k] = v; return out; };
    return { ...here, best: Math.max(count(here.best), count(theirs.best)), seen: Math.max(count(here.seen), count(theirs.seen)), ...(theirsBest && count(theirs.bestAt) ? { bestAt: theirs.bestAt } : {}), filed: most(here.filed, theirs.filed), mixed: most(here.mixed, theirs.mixed) };
  },
  'engage.radio.v1'(here, theirs) {
    // One hail to each star: of two, the later.
    const byStar = new Map();
    for (const h of [...list(theirs.hails), ...list(here.hails)]) if (typeof h.star === 'string' && !(byStar.get(h.star)?.sent >= h.sent)) byStar.set(h.star, h);
    return { ...here, hails: [...byStar.values()].sort((a, b) => b.sent - a.sent) };
  },
  'engage.missions.v1'(here, theirs) {
    const hails = { ...obj(theirs.hails) };
    for (const [id, t] of Object.entries(obj(here.hails) || {})) if (!(hails[id] >= t)) hails[id] = t;
    return { ...here, hails };
  },
};

// The jars a copy brings that the shelf has no room for, when added to what's here.
export function jarsLeft(here, theirs) {
  const u = union(list(obj(here)?.jars), list(obj(theirs)?.jars), JAR);
  return Math.max(0, u.all.length - Math.max(JAR_MAX, list(obj(here)?.jars).length));
}

// What restoring a copy writes and removes: { write: { key: value }, remove: [key] }. `now` is what the storage holds
// ({ key: value }). Replace takes the copy as it is and lets go of every key of Engage's it doesn't have; Add puts
// each key together with what is here (a setting, or a key with no rule, stays as it is here).
export function plan(file, now, how) {
  const write = {}, remove = [];
  if (how === 'replace') {
    for (const key of Object.keys(now)) if (carried(key) && !(key in file.keys)) remove.push(key);
    Object.assign(write, file.keys);
    return { write, remove };
  }
  for (const [key, theirs] of Object.entries(file.keys)) {
    const here = now[key];
    if (here === undefined || here === null) write[key] = theirs;
    else if (MERGE[key] && obj(here) && obj(theirs)) write[key] = MERGE[key](here, theirs);
  }
  return { write, remove };
}
