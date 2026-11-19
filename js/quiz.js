// Cover your tracks, the planetary survey's quiz: its questions, today's exam and its record. Pure, checked by
// test/survey.test.mjs.
import { CLASSES, byId, label, quizReadings } from './classes.js';

// Each answer is kept as two tallies. `filed` counts, for each file, the worlds filed under it rightly; `mixed`
// counts the slips, by "truth>picked": "K>D" is a Class K world filed as Class D.
const count = x => (Number.isInteger(x) && x >= 0 ? x : 0);
export function tallies(raw, valid) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (valid(k) && count(v)) out[k] = count(v);
  return out;
}
export const isFile = id => byId.has(id);
export const isSlip = k => { const [a, b] = String(k).split('>'); return isFile(a) && isFile(b) && a !== b; };

// Puts one answer on the record: the world was of `truth`, and it was filed as `picked`.
export function record(saved, truth, picked) {
  if (truth === picked) saved.filed[truth] = (saved.filed[truth] || 0) + 1;
  else saved.mixed[`${truth}>${picked}`] = (saved.mixed[`${truth}>${picked}`] || 0) + 1;
}

// The files a world has been rightly filed under at least once: their ids, in the survey's order.
export const filesUsed = filed => CLASSES.filter(c => filed[c.id] > 0).map(c => c.id);

// The slip made most often, once it has been made at least twice (one slip says nothing): { truth, picked, times },
// or null. Ties go to the earlier file in the survey's order, so the line doesn't change from one visit to the next.
export function caughtOut(mixed) {
  let best = null;
  const at = id => CLASSES.indexOf(byId.get(id));
  for (const [k, times] of Object.entries(mixed)) {
    if (!isSlip(k) || times < 2) continue;
    const [truth, picked] = k.split('>');
    if (!best || times > best.times || (times === best.times && (at(truth) < at(best.truth) || (truth === best.truth && at(picked) < at(best.picked))))) best = { truth, picked, times };
  }
  return best;
}
export function caughtOutLine(mixed) {
  const c = caughtOut(mixed);
  return c ? `Most often caught out: ${label(byId.get(c.truth))}, mistaken for ${label(byId.get(c.picked))} (${c.times} times)` : '';
}

// ---------- The questions ----------

// Files that are easy to mistake for one another: every question offers at least one from its own group.
export const GROUPS = [
  ['D', 'K', 'P', 'R'],
  ['M', 'L', 'H', 'O', 'super-earth'],
  ['N', 'Y', 'lava-world'],
  ['J', 'T', 'hot-jupiter', 'ice-giant', 'sub-neptune'],
];
const groupOf = id => GROUPS.find(g => g.includes(id));

// The rounds. 'files' is the quiz as it always was: a world's picture and sensor log, and four files. 'sensors' is
// the log's numbers alone, with no picture and no word on its air, water or life, which give the answer away.
// 'reverse' runs the other way: a file, and four worlds, one of which would pass for it.
export const ROUNDS = ['files', 'sensors', 'reverse'];

export function rng(seed) { // mulberry32, as in js/planet-art.js
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const shuffle = (r, list) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
const TAGS = ['Unlogged world', 'Unnamed planet', 'Uncharted world'];

// One made-up world of a class: its seed (for its painting), its readings and its survey tag.
function worldOf(cls, r) {
  return { cls, seed: 1 + Math.floor(r() * 9999), ...quizReadings(cls, r), survey: `${pick(r, TAGS)} · Sector ${100 + Math.floor(r() * 900)}` };
}
// Four files with `id` among them: two from its own group where it has them, and the rest from anywhere.
export function fourWith(id, r) {
  const near = shuffle(r, groupOf(id).filter(x => x !== id)).slice(0, 2);
  const others = shuffle(r, CLASSES.map(x => x.id).filter(x => x !== id && !near.includes(x)));
  return shuffle(r, [id, ...near, ...others].slice(0, 4)).map(x => byId.get(x));
}

// A question of a round, from `r` (Math.random, or a seeded rng() for today's exam). Its file is never one in `avoid`.
// For 'files' and 'sensors': the world (cls, seed, width, mass, temp, year, survey) and `choices`, four files. For
// 'reverse': `cls`, the file asked about, and `worlds`, four worlds of different files, one of them `cls`. Either way
// the answer is a file's id: the file picked, or the file of the world picked.
export function question(kind, r = Math.random, avoid = []) {
  let cls;
  do cls = pick(r, CLASSES); while (avoid.includes(cls.id));
  if (kind === 'reverse') return { kind, cls, worlds: fourWith(cls.id, r).map(c => worldOf(c, r)) };
  return { kind, ...worldOf(cls, r), choices: fourWith(cls.id, r) };
}

// ---------- Today's exam ----------

// Five worlds, the same for every officer on the same calendar day: two with their pictures, two from the sensors
// alone and one the other way, in an order of their own and each of a different file. `day` is YYYY-MM-DD; the seed is its FNV-1a hash.
export const EXAM = 5;
export function examSeed(day) {
  let h = 0x811c9dc5;
  for (const c of `cover-your-tracks:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
export function exam(day) {
  const r = rng(examSeed(day));
  const kinds = shuffle(r, ['files', 'files', 'sensors', 'sensors', 'reverse']);
  const used = [];
  return kinds.map(kind => { const q = question(kind, r, used); used.push(q.cls.id); return q; });
}
// The day as YYYY-MM-DD, by the calendar where the officer is.
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
// The exam in a line, to send: "Cover your tracks, 19 Nov: 4 of 5 filed".
export function examLine(day, marks) {
  const when = new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `Cover your tracks, ${when}: ${marks.filter(Boolean).length} of ${EXAM} filed`;
}
// A saved exam: { day, marks }, the day as YYYY-MM-DD and up to five true or false, or null.
export function examSaved(x) {
  if (!x || typeof x !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(x.day) || !Array.isArray(x.marks) || x.marks.length > EXAM || !x.marks.every(m => typeof m === 'boolean')) return null;
  return { day: x.day, marks: [...x.marks] };
}
