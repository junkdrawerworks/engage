// One voyage: the captain's log read as one story across every room. Each room keeps its own record and none of
// them writes to another's; this reads them all, and works out what the log shows besides its arrivals: the
// supplemental lines the other rooms add between them, the voyage in one sentence, the service record, and the
// five-year mission clock. Pure but for readRecords(): the bridge reads the records and hands them in. Checked by
// test/voyage.test.mjs.
import { tripYears } from './physics.js';
import { byId as shipById, hailSent } from './ships.js';
import { byId as classById, label as classLabel } from './classes.js';
import { DAY, entryTime } from './logbook.js';
import { standing as contactStanding } from './contact-sim.js';
import { hailProgress, spanSaid } from './radio.js';
import { yearsSaid } from './longway.js';
import { tidyYard } from './shipyard-sim.js';
import { fullName } from './myship.js';
import { auText, placedWorld } from './worlds.js';

// The rooms that keep a record of what was done in them, and where each keeps it.
export const RECORDS = { maru: 'engage.maru.v1', contact: 'engage.contact.v1', xeno: 'engage.xeno.v1', survey: 'engage.survey.v1', missions: 'engage.missions.v1', radio: 'engage.radio.v1',
  distress: 'engage.distress.v1', longway: 'engage.longway.v1', engineering: 'engage.engineering.v1', directive: 'engage.directive.v1', shipyard: 'engage.shipyard.v1' };
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
//   maru:     a simulation sat, the Bridge Officer's Test passed, and each rescue test sat (the latest 30)
//   contact:  each encounter answered, with the people's toast after first contact made
//   xeno:     each creature kept in a jar (a jar kept before jars carried a date has no line)
//   survey:   the latest best streak in Cover your tracks
//   missions: the latest hail sent to each ship
//   radio:    the latest hail sent to each star, and the day it lands
//   distress: each distress call answered (the latest 50), rescued or lost
//   longway:  each trip home from the Delta Quadrant (the latest 50)
//   shipyard: each ship kept, and whether she filled a requisition
// `lyOf(name)` is how far a star is, for a hail kept before the room kept that with it.
export function supplementals({ maru, contact, xeno, survey, missions, radio, distress, longway, shipyard } = {}, now = Date.now(), { lyOf } = {}) {
  const out = [];
  // `kind` says what happened, for the counts a mission's summary makes of them.
  const add = (at, room, kind, line, href) => { const t = momentOf(at); if (t && t <= now + 60000) out.push({ t, room, kind, text: `Supplemental: ${line}`, href }); };
  const m = obj(maru);
  for (const r of list(m.runs)) {
    const title = text(r.title, 40);
    if (!title) continue;
    // "The lifeboat, 150 home, C B B B", as the run's own line to send has it.
    const said = text(r.line, 120).replace(/^Kobayashi Maru[^:]*:\s*/, '')
      || [title, list(r.grades).map(x => x.letter).filter(l => LETTERS.test(l)).join(' ')].filter(Boolean).join(', ');
    add(r.at, 'maru', r.outcome === 'rewritten' ? 'rewritten' : 'sat', `sat the Kobayashi Maru. ${said}.`, 'maru.html');
  }
  const officer = obj(m.officer);
  if (text(officer.passed, 40)) add(officer.passed, 'maru', 'passed', 'passed the Bridge Officer’s Test.', 'maru.html');
  for (const r of list(obj(m.rescue).runs)) {
    if (!(Number.isInteger(r.rescued) && Number.isInteger(r.most) && r.most > 0)) continue;
    add(r.at, 'maru', 'rescuetest', `sat the Academy’s rescue test. ${r.rescued} home, of the ${r.most} it allowed${r.rescued >= r.most ? ': the most there was' : ''}.`, 'maru.html');
  }
  const met = new Set(); // a people answered again is a line in the log, but not a new species met
  for (const r of list(obj(contact).runs)) {
    const people = text(r.people, 30), title = text(r.title, 40);
    if (!people || !title) continue;
    const notebook = Number.isInteger(r.decoded) && Number.isInteger(r.of) && r.of > 0 ? `, ${r.decoded} of ${r.of} phrases decoded` : '';
    const again = !r.second && met.has(people);
    if (!r.second) met.add(people);
    // After first contact made, their toast: their new phrase for the day you met. After second contact made, the
    // same phrase, drunk to again.
    const toast = r.outcome === (r.second ? 'friends' : 'contact') ? text(r.toast, 80) : '';
    const raised = toast ? (r.second ? ` The ${people} drank to it again: “${toast}.”` : ` The ${people} raised a toast: “${toast}.”`) : '';
    add(r.at, 'contact', r.second ? 'second' : again ? 'again' : 'met', `${r.second ? `the ${people} hailed again` : `answered a hail from the ${people}`}. ${title}${notebook}.${raised}`, 'contact.html');
  }
  for (const j of list(obj(xeno).jars)) {
    // (A planet placed in the system view is kept by its key, and named by where it was placed.)
    const placed = placedWorld(j.world)?.world;
    const world = placed ? placed.key : text(j.world, 40), cls = classById.get(j.id);
    if ((!world && !cls) || !Number.isInteger(j.seed)) continue;
    add(j.at, 'xeno', 'jar', placed ? `kept a creature grown for the ${placed.placed.sized} placed ${auText(placed.placed.au)} from ${placed.placed.title} in a jar.` : world ? `kept a creature grown for ${world} in a jar.` : `kept a creature from a ${classLabel(cls)} world in a jar.`,
      `xeno.html#${world ? `world=${encodeURIComponent(world)}` : encodeURIComponent(j.id)}-${j.seed}`);
  }
  const s = obj(survey);
  if (count(s.best) && count(s.bestAt)) add(s.bestAt, 'survey', 'best', `a best streak of ${s.best} in Cover your tracks.`, 'survey.html#drill');
  for (const [id, t] of Object.entries(obj(obj(missions).hails))) {
    const ship = shipById(id);
    if (ship && hailSent(t, now)) add(t, 'missions', 'hail', `hailed ${ship.name} from Earth.`, `missions.html#${id}`);
  }
  for (const h of starHails(radio, now, lyOf)) {
    const href = `radio.html#hail=${encodeURIComponent(h.star)}`;
    add(h.sent, 'radio', 'starhail', `hailed ${h.title} on subspace radio${h.lands ? `. It gets there in ${yearOf(h.lands)}` : ''}.`, href);
    if (h.landed) add(h.lands, 'radio', 'landed', `your hail reached ${h.title}, ${spanSaid(h.lands - h.sent)} after it left Earth.`, href);
  }
  for (const c of list(obj(distress).calls)) {
    const star = text(c.star, 60);
    if (!star) continue;
    const air = Number.isInteger(c.air) && c.air >= 0 && c.air <= 100 ? c.air : null;
    add(c.at, 'distress', c.found ? 'rescue' : 'lostcall', c.found
      ? `answered a distress call. Found at ${star}${air != null ? ` with ${air}% of their air left` : ''}.`
      : c.left ? `answered a distress call and left it partway. They were at ${star}.` : `answered a distress call. Their air ran out; they were at ${star}.`, 'distress.html');
  }
  for (const a of list(obj(longway).arrivals)) {
    if (!(a.years > 0)) continue;
    add(a.at, 'longway', 'home', `home from the Delta Quadrant in ${yearsSaid(a.years)}.`, 'longway.html');
  }
  for (const d of tidyYard(shipyard).designs) {
    add(d.at, 'shipyard', 'design', `laid down the ${fullName(d)} at the shipyard${d.req ? ', and filled Starfleet’s requisition with her' : ''}.`, 'shipyard.html');
  }
  return out.sort((a, b) => b.t - a.t);
}

// The hails to stars subspace radio keeps, read for the log: { star, title, sent, lands (ms, or null when nobody can
// say how far the star is), landed }.
const yearOf = ms => { const y = new Date(ms).getUTCFullYear(); return y >= 10000 ? y.toLocaleString('en-US') : String(y); };
export function starHails(radio, now = Date.now(), lyOf) {
  const out = [];
  for (const h of list(obj(radio).hails)) {
    const star = text(h.star, 60), sent = hailSent(h.sent, now);
    if (!star || !sent) continue;
    const ly = h.ly > 0 ? h.ly : lyOf?.(star);
    const p = ly > 0 ? hailProgress(sent, ly, now) : null;
    out.push({ star, title: text(h.title, 60) || star, sent, lands: p ? p.arrives : null, landed: !!p?.arrived });
  }
  return out;
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
    met: contactStanding(contact).met, // each people once
    failed: taken - rewritten,
    rewritten,
    jars: list(obj(rec.xeno).jars).length,
    hails: Object.entries(obj(obj(rec.missions).hails)).filter(([id, t]) => shipById(id) && hailSent(t, now)).length,
  };
}

// What a count of things done says, in words: "nine stars, one new species, one failed exam".
function said(n) {
  return [
    n.stars && some(n.stars, 'star'),
    n.met && some(n.met, 'new species', 'new species'),
    n.failed && some(n.failed, 'failed exam'),
    n.rewritten && `${words(n.rewritten)} exam${n.rewritten === 1 ? '' : 's'} rewritten`,
    n.jars && (n.jars === 1 ? 'one creature in a jar' : `${words(n.jars)} creatures in jars`),
    n.hails && `${some(n.hails, 'ship')} hailed`,
  ].filter(Boolean);
}

// The log summed up in one sentence, at its head: "Fourteen months out: nine stars, one new species, one failed
// exam." The time is since the first thing the log tells. With the mission clock on, the sentence is the mission
// under way's instead, counted from its arrivals and the supplemental lines logged during it: "Year 2, day 114: …".
// Null with nothing to say.
export function story(rec, { log = [], supps = [], clock = false, now = Date.now() } = {}) {
  if (clock) {
    const all = missions(log), m = all[all.length - 1], c = clockNow(log);
    const parts = !m || m.closed ? [] : said(missionTally(m, all, supps));
    return `${c.said.replace(/ of \d$/, '')}: ${parts.length ? parts.join(', ') : c.n > 1 ? `mission ${words(c.n)} begins with the next trip` : 'the mission begins with the first trip'}.`;
  }
  const parts = said(tally(rec, log, now));
  if (!parts.length) return null;
  const when = [...log.map(entryTime), ...supps.map(s => s.t)].filter(Number.isFinite);
  return `${sinceSaid(Math.max(0, now - (when.length ? Math.min(...when) : now)))}: ${parts.join(', ')}.`;
}

// ---------- The service record ----------

// The career in one card at the head of the captain's log, beside the log's own records: a row for each room that
// keeps a record, read from it, each leading to its room. A room with nothing on record yet says so, so the card is
// also a list of what there is still to do. Rows: { room, name, href, line } (line is '' with nothing on record),
// with `none` to say instead.
export function serviceRecord(rec, now = Date.now(), { lyOf } = {}) {
  const maru = obj(rec.maru), runs = list(maru.runs);
  const seen = new Set([...(Array.isArray(maru.seen) ? maru.seen : []), ...runs.map(r => r.title)].filter(t => text(t, 40)));
  const best = obj(maru.best);
  const grades = ['Compassion', 'Judgment', 'Restraint', 'Nerve'].map(g => (LETTERS.test(best[g]) ? best[g] : '–'));
  const passed = !!text(obj(maru.officer).passed, 40);
  const rescue = obj(maru.rescue), rescueBest = Number.isFinite(rescue.best) && rescue.best > 0 ? Math.min(1, rescue.best) : 0;
  const rescueSaid = count(rescue.taken) ? `rescue test best ${Math.round(rescueBest * 100)}%` : '';
  const contact = obj(rec.contact);
  const made = contactStanding(contact).contacts;
  const survey = obj(rec.survey);
  const n = tally(rec, [], now);
  const taken = n.failed + n.rewritten;
  const stars = starHails(rec.radio, now, lyOf), landed = stars.filter(h => h.landed).length;
  const distress = obj(rec.distress), longway = obj(rec.longway), eng = obj(rec.engineering);
  const hearings = list(obj(rec.directive).heard).filter(h => Number.isFinite(h.t)).length;
  const yard = tidyYard(rec.shipyard), filled = Object.keys(yard.filled).length;
  return [
    { room: 'maru', name: 'Kobayashi Maru', href: 'maru.html', none: 'Not sat yet',
      line: taken ? `${Math.min(seen.size, 9)} of 9 endings · best ${grades.join(' ')}${passed ? ' · Officer’s Test passed' : ''}${rescueSaid ? ` · ${rescueSaid}` : ''}`
        : rescueSaid ? `Not sat yet · ${rescueSaid}` : '' },
    { room: 'contact', name: 'First contact', href: 'contact.html', none: 'No one met yet',
      line: n.met ? `${capital(some(n.met, 'people', 'peoples'))} met · ${made === 1 ? 'one contact' : `${words(made)} contacts`} made` : '' },
    { room: 'survey', name: 'Cover your tracks', href: 'survey.html#drill', none: 'Not played yet',
      line: count(survey.seen) ? `Best streak ${count(survey.best)}` : '' },
    { room: 'xeno', name: 'Xenobiology lab', href: 'xeno.html', none: 'No creatures kept yet',
      line: n.jars ? (n.jars === 1 ? 'One creature in a jar' : `${capital(words(n.jars))} creatures in jars`) : '' },
    { room: 'missions', name: 'Long missions', href: 'missions.html', none: 'No ships hailed yet',
      line: n.hails ? `${capital(some(n.hails, 'ship'))} hailed` : '' },
    { room: 'radio', name: 'Hails to stars', href: 'radio.html#hail', none: 'No stars hailed yet',
      line: stars.length ? `${stars.length.toLocaleString('en-US')} sent · ${landed ? `${landed.toLocaleString('en-US')} landed` : 'none landed yet'}` : '' },
    { room: 'distress', name: 'Distress calls', href: 'distress.html', none: 'No calls answered yet',
      line: count(distress.answered) ? `Rescued ${count(distress.rescued)} of ${count(distress.answered)} call${count(distress.answered) === 1 ? '' : 's'}` : '' },
    { room: 'longway', name: 'The long way home', href: 'longway.html', none: obj(longway.trip).seed != null ? 'A trip home under way' : 'Not home yet',
      line: count(longway.homes) ? `Home ${count(longway.homes) === 1 ? 'once' : count(longway.homes) === 2 ? 'twice' : `${words(count(longway.homes))} times`}${longway.best > 0 ? ` · best ${yearsSaid(longway.best)}` : ''}` : '' },
    { room: 'engineering', name: 'Main engineering', href: 'engineering.html', none: 'No shifts stood yet',
      line: count(eng.shifts) ? `${capital(some(count(eng.shifts), 'shift'))} stood${eng.best > 0 ? ` · best ${Math.round(Math.min(1, eng.best) * 100)}% held` : ''}` : '' },
    { room: 'directive', name: 'The Prime Directive', href: 'directive.html', none: 'No hearings yet',
      line: hearings ? `${capital(some(hearings, 'hearing'))} before the board of inquiry` : '' },
    { room: 'shipyard', name: 'The shipyard', href: 'shipyard.html', none: 'No ships designed yet',
      line: yard.designs.length || filled ? `${capital(some(yard.designs.length, 'ship'))} kept · ${filled ? `${words(filled)} requisition${filled === 1 ? '' : 's'} filled` : 'no requisitions filled yet'}` : '' },
  ];
}

// ---------- The five-year mission ----------

export const MISSION_YEARS = 5;

// How long a trip took the ship, in years, from what its entry kept: the warp factor and the light years flown. An
// entry from before the warp factor was kept says it in its trip line ("in 6 days at warp 9.5"). A trip to or from
// a star nobody has measured the distance to is timed by the charts' nominal distance, as the helm and the log time it.
export function entryYears(e) {
  if (!(e?.ly > 0)) return 0;
  let w = Number(e.warp);
  if (!(w >= 1 && w <= 9.99)) {
    const trip = Array.isArray(e.sections) ? e.sections.find(x => Array.isArray(x) && x[0] === 'The trip')?.[1] : '';
    w = Number(/ at warp (\d+(?:\.\d+)?)\./.exec(typeof trip === 'string' ? trip : '')?.[1]);
  }
  return w >= 1 && w <= 9.99 ? tripYears(e.ly, w) : 0;
}

// The missions the log has flown, oldest first. Each arrival adds its trip's ship time to the mission under way; the
// arrival that takes it to five years closes it, and the next trip starts the next one. (A single trip of more than
// five years closes the mission it is in by itself.) Nothing is deleted. Each mission: { n, years, entries (oldest
// first), last (the entry that closed it, or the newest), closed }.
export function missions(log) {
  const out = [];
  let m = null;
  for (const e of [...log].reverse()) {
    if (!m || m.closed) out.push(m = { n: out.length + 1, years: 0, entries: [], last: null, closed: false });
    m.entries.push(e);
    m.years += entryYears(e);
    m.last = e;
    if (m.years >= MISSION_YEARS) m.closed = true;
  }
  return out;
}

// Where a mission stands after `years` of it: "Year 2, day 114 of 5".
export function clockSaid(years) {
  if (years >= MISSION_YEARS) return 'Five years: mission complete';
  const y = Math.floor(years), day = Math.min(365, Math.floor((years - y) * 365.25) + 1);
  return `Year ${y + 1}, day ${day} of ${MISSION_YEARS}`;
}

// The clock as the helm shows it: which mission, and how far into it the ship is. Once an arrival has closed a
// mission, the next starts at year 1, day 1, and its first trip counts toward it. `extra` is ship time still in flight.
export function clockNow(log, extra = 0) {
  const all = missions(log), m = all[all.length - 1];
  const fresh = !m || m.closed;
  const years = (fresh ? 0 : m.years) + extra;
  return { n: fresh ? all.length + 1 : m.n, years, done: all.filter(x => x.closed).length, said: clockSaid(years) };
}

// Ship time in words, for a mission's summary: "5 years, 2 months".
export function shipTimeSaid(years) {
  const y = Math.floor(years), mo = Math.floor((years - y) * 12);
  return [y && `${y} ${y === 1 ? 'year' : 'years'}`, mo && `${mo} ${mo === 1 ? 'month' : 'months'}`].filter(Boolean).join(', ') || 'under a month';
}

// When a mission began and ended: from just after the arrival that closed the one before (or the start of the log)
// to its own last arrival.
export function missionSpan(m, all) {
  const before = all[m.n - 2];
  return { from: before ? entryTime(before.last) ?? 0 : -Infinity, to: entryTime(m.last) ?? 0 };
}

// What one mission did: its stars (home aside), light years and longest trip, and what the other rooms logged
// during it, counted from their supplemental lines.
export function missionTally(m, all, supps = []) {
  const { from, to } = missionSpan(m, all);
  const open = m === all[all.length - 1] && !m.closed; // the mission under way takes in lines up to now
  const during = supps.filter(x => x.t > from && (open || x.t <= to));
  const kinds = k => during.filter(x => x.kind === k).length;
  return {
    stars: new Set(m.entries.filter(e => e.star !== 0).map(e => e.star)).size,
    ly: m.entries.reduce((sum, e) => sum + (e.ly > 0 ? e.ly : 0), 0),
    met: kinds('met'), failed: kinds('sat'), rewritten: kinds('rewritten'), jars: kinds('jar'), hails: kinds('hail'),
  };
}

// A closed mission's summary, in a line: "Twenty-three stars, two new species, three failed exams".
export const missionSaid = n => {
  const parts = said(n);
  return parts.length ? capital(parts.join(', ')) : 'No stars visited';
};
