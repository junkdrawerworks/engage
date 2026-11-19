// One voyage: the captain's log read as one story across every room. Each room keeps its own record and none of
// them writes to another's; this reads them all, and works out what the log shows besides its arrivals: the
// supplemental lines the other rooms add between them. Pure but for readRecords(): the bridge reads the records and
// hands them in. Checked by test/voyage.test.mjs.
import { byId as shipById, hailSent } from './ships.js';
import { byId as classById, label as classLabel } from './classes.js';
import { DAY, entryTime } from './logbook.js';

// The rooms that keep a record of what was done in them, and where each keeps it.
export const RECORDS = { maru: 'engage.maru.v1', contact: 'engage.contact.v1', xeno: 'engage.xeno.v1', survey: 'engage.survey.v1', missions: 'engage.missions.v1' };
export function readRecords() {
  const out = {};
  for (const [room, key] of Object.entries(RECORDS)) {
    try { out[room] = JSON.parse(localStorage.getItem(key) || 'null'); } catch { out[room] = null; }
  }
  return out;
}

const momentOf = at => {
  const t = typeof at === 'string' ? Date.parse(at) : at;
  return Number.isFinite(t) && t > 0 ? t : null;
};
const text = (x, max = 80) => (typeof x === 'string' && x.length <= max && !/[<>]/.test(x) ? x : '');
const count = x => (Number.isInteger(x) && x > 0 ? x : 0);
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const list = x => (Array.isArray(x) ? x.filter(y => y && typeof y === 'object' && !Array.isArray(y)) : []);
const LETTERS = /^[ABCDF]$/;

// ---------- What the other rooms add ----------

// The lines each room adds to the log when something in it finishes, newest first: { t, room, text, href }, where
// href leads to what the line is about in its room. Each is read from that room's own record, so nothing is written
// twice and nothing goes out of step. The Kobayashi Maru and first contact list their last 30 runs, and these lines
// go back as far as those do.
//   maru:     a simulation sat, and the Bridge Officer's Test passed
//   contact:  each encounter answered
//   xeno:     each creature kept in a jar (a jar kept before jars carried a date has no line)
//   survey:   the latest best streak in Cover your tracks
//   missions: the latest hail sent to each ship
export function supplementals({ maru, contact, xeno, survey, missions } = {}, now = Date.now()) {
  const out = [];
  const add = (at, room, line, href) => { const t = momentOf(at); if (t && t <= now + 60000) out.push({ t, room, text: `Supplemental: ${line}`, href }); };
  const m = obj(maru);
  for (const r of list(m.runs)) {
    const title = text(r.title, 40);
    if (!title) continue;
    // "The lifeboat, 150 home, C B B B", as the run's own line to send has it.
    const said = text(r.line, 120).replace(/^Kobayashi Maru[^:]*:\s*/, '')
      || [title, list(r.grades).map(x => x.letter).filter(l => LETTERS.test(l)).join(' ')].filter(Boolean).join(', ');
    add(r.at, 'maru', `sat the Kobayashi Maru. ${said}.`, 'maru.html');
  }
  const officer = obj(m.officer);
  if (text(officer.passed, 40)) add(officer.passed, 'maru', 'passed the Bridge Officer’s Test.', 'maru.html');
  for (const r of list(obj(contact).runs)) {
    const people = text(r.people, 30), title = text(r.title, 40);
    if (!people || !title) continue;
    const notebook = Number.isInteger(r.decoded) && Number.isInteger(r.of) && r.of > 0 ? `, ${r.decoded} of ${r.of} phrases decoded` : '';
    add(r.at, 'contact', `${r.second ? `the ${people} hailed again` : `answered a hail from the ${people}`}. ${title}${notebook}.`, 'contact.html');
  }
  for (const j of list(obj(xeno).jars)) {
    const world = text(j.world, 40), cls = classById.get(j.id);
    if ((!world && !cls) || !Number.isInteger(j.seed)) continue;
    add(j.at, 'xeno', world ? `kept a creature grown for ${world} in a jar.` : `kept a creature from a ${classLabel(cls)} world in a jar.`,
      `xeno.html#${world ? `world=${encodeURIComponent(world)}` : encodeURIComponent(j.id)}-${j.seed}`);
  }
  const s = obj(survey);
  if (count(s.best) && count(s.bestAt)) add(s.bestAt, 'survey', `a best streak of ${s.best} in Cover your tracks.`, 'survey.html#drill');
  for (const [id, t] of Object.entries(obj(obj(missions).hails))) {
    const ship = shipById(id);
    if (ship && hailSent(t, now)) add(t, 'missions', `hailed ${ship.name} from Earth.`, `missions.html#${id}`);
  }
  return out.sort((a, b) => b.t - a.t);
}

// ---------- In one sentence ----------

const YEAR = 365.25 * DAY;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const words = n => (n <= 20 ? WORDS[n] : n.toLocaleString('en-US'));
const some = (n, one, many = `${one}s`) => `${words(n)} ${n === 1 ? one : many}`;
const capital = s => s[0].toUpperCase() + s.slice(1);

// How long since the voyage began, in a word or two: "First day out", "Three days out", "Fourteen months out".
export function sinceSaid(ms) {
  const days = Math.floor(ms / DAY);
  if (days < 1) return 'First day out';
  if (days < 14) return `${capital(some(days, 'day'))} out`;
  if (days < 61) return `${capital(some(Math.floor(days / 7), 'week'))} out`;
  const months = Math.floor(ms / (YEAR / 12));
  if (months < 24) return `${capital(some(months, 'month'))} out`;
  return `${capital(some(Math.floor(ms / YEAR), 'year'))} out`;
}

// What the voyage has done, counted from every room's record: the stars visited (home aside), the peoples met, the
// Kobayashi Maru runs (every one a failed exam, but for a rewritten simulator), the creatures in jars and the ships
// hailed.
export function tally(rec, log = [], now = Date.now()) {
  const maru = obj(rec.maru), runs = list(maru.runs);
  const taken = Math.max(count(maru.taken), runs.length);
  const rewritten = Math.min(taken, runs.filter(r => r.outcome === 'rewritten').length);
  const contact = obj(rec.contact);
  return {
    stars: new Set(log.filter(e => e && e.star !== 0).map(e => e.star)).size,
    met: Math.max(count(contact.met), list(contact.runs).filter(r => !r.second).length),
    failed: taken - rewritten,
    rewritten,
    jars: list(obj(rec.xeno).jars).length,
    hails: Object.entries(obj(obj(rec.missions).hails)).filter(([id, t]) => shipById(id) && hailSent(t, now)).length,
  };
}

// The log summed up in one sentence, at its head: "Fourteen months out: nine stars, one new species, one failed
// exam." The time is since the first thing the log tells. Null with nothing to say.
export function story(rec, { log = [], supps = [], now = Date.now() } = {}) {
  const n = tally(rec, log, now);
  const parts = [
    n.stars && some(n.stars, 'star'),
    n.met && some(n.met, 'new species', 'new species'),
    n.failed && some(n.failed, 'failed exam'),
    n.rewritten && `${words(n.rewritten)} exam${n.rewritten === 1 ? '' : 's'} rewritten`,
    n.jars && (n.jars === 1 ? 'one creature in a jar' : `${words(n.jars)} creatures in jars`),
    n.hails && `${some(n.hails, 'ship')} hailed`,
  ].filter(Boolean);
  if (!parts.length) return null;
  const when = [...log.map(entryTime), ...supps.map(s => s.t)].filter(Number.isFinite);
  return `${sinceSaid(Math.max(0, now - (when.length ? Math.min(...when) : now)))}: ${parts.join(', ')}.`;
}
