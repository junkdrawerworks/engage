// The bridge: the helm console, the flight between stars, the log, and the controls for looking around.
import { loadCatalog } from './catalog.js';
import { Sky } from './sky.js';
import { sound } from './audio.js';
import { buzz, canBuzz, follow, setPref, setUpRoom, textScale } from './room.js';
import { DESTINATIONS, GROUPS } from './destinations.js';
import { arrivalFirsts, chartedSaid, companions, composeEntry, describeKind, inTextFor, logRecords, nearestStars, notesFor, starKinds, titleFor } from './log.js';
import { filesForStar, grows, label as classLabel } from './classes.js';
import { systemFor } from './worlds.js';
import { buildIndex, chartTag, litBy, named, pairLetters, search, yearAsked } from './search.js';
import { SUN_LINE, ask, flightLine, report, sunSaysHello } from './computer.js';
import { SHOWN_IN, onScreen, onScreenParts, variableFor } from './variables.js';
import { LIVE, share } from './share.js';
import { askToKeep, current, keep, watch } from './store.js';
import { ROOMS, firstContactDay, inWords, isFirstContactDay, roomList, newRooms, whatsNew } from './rooms.js';
import { backCloses, swipeDown } from './sheets.js';
import { coursePath } from './courses.js';
import { linesForVisit, readContacts } from './contacts.js';
import { chartEdge, chartLine, chartOf, dotAt } from './cartography.js';
import { drawChart } from './chart-view.js';
import { LONG_LOG, PAGE, byDay, byStar, clockTime, dayHeading, entryTime, matches, newest, timeline } from './logbook.js';
import { cleanName, cleanRegistry, fullName, shipOf, withRegistry } from './myship.js';
import { carried, contents, fileName, fromRaw, jarsLeft, pack, plan, rawOf, unpack } from './records.js';
import { hold as wakeHold, release as wakeRelease } from './wake.js';
import { VOYAGES, arrivedAt, autopilotNext, flown, legLine, nextStop, routeLength, setOut, tidyVoyage, voyageById } from './voyages.js';
import { clockNow, clockSaid, missionSaid, missionTally, missions, readRecords, serviceRecord, shipTimeSaid, starHails, story, supplementals } from './voyage.js';
import { answersDue, carriedOut, dayOf, orderOf, reportOf, roomsOnRecord, tidyDuty, todayItems, update as updateDuty } from './duty.js';
import { jdOf, readings } from './ephemeris.js';
import { byId as shipById } from './ships.js';
import { CHALLENGES } from './contact-sim.js';
import {
  AU_PER_PC, LY_PER_PC, apparentMag, formatDuration, formatLy, holdDistanceAU, roughLy, stardate, tripYears, warpSpeed,
} from './physics.js';

const KEY = 'engage.v1';
// Night vision is tonight's sky's setting, kept with its place and its kind of sky: the bridge reads it and, from
// Bridge settings, writes it back there. No key of its own.
const NIGHT = 'engage.tonight.v1';
// Where to come back to, for this tab only: the log entry a link to another room was followed from (see returnTo).
const RETURN = 'engage.return';
// The planetary survey page. The single-file copy points this at the live site.
const SURVEY = 'survey.html';
const AWAY = SURVEY.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
// The xenobiology lab, beside it.
const XENO = SURVEY.replace('survey.html', 'xeno.html');
// Long missions, too.
const MISSIONS = SURVEY.replace('survey.html', 'missions.html');
// The system view, where a star's planets are flown in to and a planet of your own is placed.
const SYSTEM = SURVEY.replace('survey.html', 'system.html');
const RADIO = SURVEY.replace('survey.html', 'radio.html');
const ASTROMETRICS = SURVEY.replace('survey.html', 'astrometrics.html');
// Tonight's sky, likewise.
const TONIGHT = 'tonight.html';
// And the warp scale.
const SCALE = 'warp.html';
// Where the rooms' pages are, for the room list (the single-file copy's SURVEY is on the live site).
const ROOM_BASE = SURVEY.replace('survey.html', '');
const $ = id => document.getElementById(id);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const DEG = Math.PI / 180;
const START_YAW = 83 * DEG, START_PITCH = 3 * DEG; // facing Orion, with the Sun behind

let cat, sky;
let trip = null, turn = null, dirty = true, last = performance.now();
let speedUp = 1; // tests and screenshots fly faster

const state = defaults();

function defaults() {
  return {
    at: 0, offset: homeOffset(), yaw: START_YAW, pitch: START_PITCH, fov: 60 * DEG,
    target: null, warp: 9, log: [], ly: 0, opts: { lines: true, labels: true, clock: false, report: false }, seenIntro: false, ship: null,
    voyage: null, // the voyage under way, if one is (see js/voyages.js)
    rooms: null, // the rooms the bridge has told of, by id (js/rooms.js), for the line that says what's new
    greeted: null, // the year First Contact Day's line was last closed (see greeting)
    sunHello: false, // whether the Sun has said hello, once, from far out (see lookHome)
    duty: null, // days served, orders carried out, rank and commendations, as js/duty.js keeps them (see dutyNow)
  };
}

function homeOffset() {
  const { f } = Sky.basis(START_YAW, START_PITCH);
  return f.map(v => v / AU_PER_PC); // one AU out from the Sun, on the night side
}

function load() {
  const saved = stored();
  if (saved) Object.assign(state, saved, { opts: { ...state.opts, ...saved.opts } });
  tidy();
}

// What the browser is keeping, or null: nothing kept yet, no storage, or something that isn't a save.
function stored() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
  } catch { return null; }
}

// If a save has been damaged somehow, keep whatever in it is still good and start the rest afresh.
function tidy() {
  const d = defaults();
  const num = x => typeof x === 'number' && Number.isFinite(x);
  const star = i => Number.isInteger(i) && i >= 0 && i < cat.count;
  if (!star(state.at)) Object.assign(state, { at: d.at, offset: d.offset, target: null });
  if (!(Array.isArray(state.offset) && state.offset.length === 3 && state.offset.every(num))) {
    const S = starPos(state.at), dist = Math.hypot(...S); // holding off the star, as if just in from Sol
    state.offset = state.at === 0 ? d.offset : S.map(v => -v / dist * Math.min(holdAU(state.at) / AU_PER_PC, dist / 2));
  }
  for (const k of ['yaw', 'pitch', 'warp']) if (!num(state[k])) state[k] = d[k];
  if (!(num(state.fov) && state.fov >= 2 * DEG && state.fov <= 100 * DEG)) state.fov = d.fov;
  if (!star(state.target)) state.target = null;
  state.log = Array.isArray(state.log) ? state.log.filter(e => e && star(e.star) && Array.isArray(e.sections) && e.sections.every(Array.isArray)) : [];
  if (!(num(state.ly) && state.ly >= 0)) state.ly = state.log.reduce((sum, e) => sum + (num(e.ly) ? e.ly : 0), 0);
  for (const k of Object.keys(d.opts)) if (typeof state.opts[k] !== 'boolean') state.opts[k] = d.opts[k];
  state.ship = shipOf(state); // her name and registry, from Bridge settings, or null
  state.voyage = tidyVoyage(state.voyage);
  state.rooms = Array.isArray(state.rooms) ? state.rooms.filter(x => typeof x === 'string') : null;
  if (!Number.isInteger(state.greeted)) state.greeted = null;
  state.sunHello = state.sunHello === true;
  state.duty = state.duty ? tidyDuty(state.duty) : null;
}

// Keeps the ship's position, the log and the settings. Returns whether it worked. When it doesn't, `unsaved` says why:
// 'full' when the browser's storage has no room, or 'blocked' when the
// browser won't store anything at all. Nothing is ever dropped from the log to make room: the bridge says so instead
// (see unsavedNote), and everything is kept as soon as there is room again.
let unsaved = null;
function save() {
  viewMoved = false;
  const { at, offset, yaw, pitch, fov, target, warp, log, ly, opts, seenIntro, ship, voyage, rooms, greeted, sunHello, duty } = state;
  unsaved = keep(KEY, { at, offset, yaw, pitch, fov, target, warp, log, ly, opts, seenIntro, ...(ship ? { ship } : {}), ...(voyage ? { voyage } : {}), ...(rooms ? { rooms } : {}), ...(greeted ? { greeted } : {}), ...(sunHello ? { sunHello } : {}), ...(duty ? { duty } : {}) }) || null;
  return !unsaved;
}

// Another tab has saved: the bridge open twice, or a Set course link opened in a new tab. Each save is the whole
// ship, so a tab that went on from what it read at the start would write over the other's flights the next time
// anything here was touched (a nudge of the warp slider was enough). Instead this tab takes the ship, the log and
// the settings as the other left them; only where it is looking stays its own. Nothing is saved from here, or two
// tabs would answer each other for ever. In flight it waits: arrive() reads the log again and adds to that.
let stale = false;
function adopt() {
  if (trip) { stale = true; return; }
  if (unsaved) return; // this tab holds what the store had no room for: it keeps that
  const { at, yaw, pitch, fov } = state;
  load();
  Object.assign(state, { yaw, pitch, fov });
  if (state.at !== at) { turn = null; sky.setOrigin(starPos(state.at)); }
  showSettings();
  showTarget();
  updateHud();
  if (state.seenIntro && !$('intro').hidden) { $('intro').hidden = true; behind(); }
  if (!$('log').hidden) drawLog();
  if (!$('picker').hidden) renderList();
  dirty = true;
}

function showSettings() {
  $('opt-lines').checked = state.opts.lines;
  $('opt-labels').checked = state.opts.labels;
  $('opt-clock').checked = state.opts.clock;
  // Her name, unless it is being typed in this tab just now.
  if (document.activeElement !== $('ship-name')) $('ship-name').value = state.ship?.name ?? '';
  if (document.activeElement !== $('ship-registry')) $('ship-registry').value = state.ship?.registry ?? '';
  shipSaid();
  if (reporting !== state.opts.report) setReporting(state.opts.report, false);
  $('warp').value = state.warp;
  updateWarp();
}

// Your ship: what the name and registry in Bridge settings make her, as the rooms will speak of her.
function shipSaid() {
  $('ship-said').textContent = state.ship
    ? `The rooms speak of her as the ${withRegistry(state.ship)}.`
    : 'Name her, and the Kobayashi Maru’s briefing, first contact, the captain’s log and your lane on the warp scale will use it.';
}

// The quiet line on the arrival log and the captain's log when the last save didn't work.
function unsavedNote(id, full, blocked) {
  $(id).hidden = !unsaved;
  $(id).textContent = unsaved === 'full' ? full : unsaved === 'blocked' ? blocked : '';
}

const starPos = i => [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]];
const findStar = name => cat.byName.get(name);
const camAbs = () => (trip ? trip.cam : starPos(state.at).map((v, k) => v + state.offset[k]));
const holdAU = i => notesFor(cat, i)?.hold?.au ?? holdDistanceAU(cat.radius[i]);
// How far from star i the ship stops (parsecs), coming from `dStar` away: its usual holding distance, or where the
// ship already is if that is closer. Some catalogue stars are pairs listed at one position; hopping between the two
// used to halve the distance each time, until the ship sat on the star.
const holdFor = (i, dStar) => Math.min(holdAU(i) / AU_PER_PC, dStar);
const lyFromShip = i => cat.distanceFrom(i, camAbs()) * LY_PER_PC;
// Whether the distance from the ship to star i is only the charts' guess: the catalogue has no measured distance for
// it, or none for the star the ship is at. (Such stars are drawn at a nominal 1,000 parsecs.)
const nominal = i => !!(cat.unmeasured[i] || cat.unmeasured[trip ? trip.i : state.at]);

// ---------- Startup ----------

// Until the catalogue is in (half a second here, seconds on a slow line) the header used to say "Holding, Earth
// orbit" over a black screen wherever the ship was: every return from another room said the ship was home. It says
// where the ship was left instead, from what is saved: the newest log entry is the arrival there. A ship that has
// never flown is in Earth orbit; one whose star can't be named yet says nothing until the stars are charted.
function preview() {
  const saved = stored();
  const away = Number.isInteger(saved?.at) && saved.at > 0;
  const entry = away && Array.isArray(saved.log) ? saved.log[0] : null;
  $('status').textContent = 'Holding';
  $('where').textContent = !away ? 'Earth orbit' : entry && entry.star === saved.at && typeof entry.title === 'string' ? entry.title : '';
}

// Night vision: red light over everything, so eyes used to the dark stay that way. Someone outside with tonight's
// sky in red taps Set course on a star's card, and used to get the bridge at full brightness. `on` is given when
// the browser wouldn't keep the choice: it holds for this visit all the same.
function showNight(on = nightKept()) {
  document.body.classList.toggle('red', on);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#0a0000' : '#05070d');
  $('opt-night').checked = on;
  dirty = true; // the names on the viewscreen are drawn in other colours under it
}

function nightKept() {
  try {
    const s = JSON.parse(localStorage.getItem(NIGHT) || 'null');
    return !!(s && typeof s === 'object' && s.night);
  } catch { return false; }
}

// Everything else tonight's sky keeps (the place, the kind of sky) is left as it is.
function setNight(on) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(NIGHT) || 'null'); } catch { /* nothing kept that can be read */ }
  const why = keep(NIGHT, { ...(s && typeof s === 'object' && !Array.isArray(s) ? s : {}), night: on });
  showNight(why ? on : undefined);
}

async function start() {
  preview();
  showNight(); // before the stars are in: no bright moment on the way
  // Sound, the text size and high contrast are every room's settings (js/room.js), followed here and in Bridge settings; ? shows the
  // bridge's keys.
  setUpRoom({ sound, keys: BRIDGE_KEYS });
  follow(p => {
    $('opt-sound').checked = p.sound;
    $('opt-buzz').checked = p.buzz;
    $('opt-contrast').checked = p.contrast;
    for (const b of $('text-size').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.text === p.text));
    dirty = true; // the names on the viewscreen are drawn at the text size
  });
  $('opt-buzz-row').hidden = !canBuzz(); // iPhones and computers can't vibrate: no setting for it there
  const img = new Image();
  img.src = 'img/milkyway.png';
  try {
    [cat] = await Promise.all([loadCatalog(), img.decode()]);
  } catch (e) {
    $('loading').textContent = 'Couldn’t chart the stars. Try reloading.';
    throw e;
  }
  load();
  try {
    sky = new Sky($('sky'), cat, img);
  } catch (e) {
    $('loading').textContent = 'This browser can’t draw the viewscreen (it needs WebGL).';
    throw e;
  }
  sky.setOrigin(starPos(state.at));
  // Before anything can open a sheet (a link that names no star opens Set course; coming back from a room, the log).
  steps = backCloses({ close: closeSheets, isOpen: () => SHEETS.some(id => !$(id).hidden) });
  for (const id of SHEETS) swipeDown($(id), closeSheets);
  // The report's line stands just above the helm, however tall the helm is.
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--console-h', `${$('console').offsetHeight}px`)).observe($('console'));
  watchGraphics();
  $('loading').remove();
  for (const id of ['intro-rooms', 'settings-rooms']) $(id).innerHTML = roomList(ROOM_BASE, AWAY);
  showSettings();
  setTarget(state.target, false);
  const coursed = new URLSearchParams(location.search).has('course');
  courseFromLink();
  updateHud();
  returnTo(coursed);
  // Take the helm takes focus without being scrolled to: on a small phone, or one on its side, the card is taller than
  // the screen, and it should open at the top.
  if (!state.seenIntro) {
    if (coursed) courseLine();
    $('intro').hidden = false; behind(); $('intro-go').focus({ preventScroll: true });
  }
  roomsNews();
  greeting();
  bind();
  restored();
  watch(KEY, adopt);
  // Night vision switched in tonight's sky, in another tab or on the page before this one (Back can bring this
  // page back whole, as it was left).
  watch(NIGHT, () => showNight());
  addEventListener('pageshow', () => showNight());
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.engage = hooks();
}

// A room added since the last visit gets one line under where the ship is, until it is closed or one of its rooms
// is opened. The welcome card lists every room, so a first visit knows them all; so does a save from before the
// bridge kept count, since nobody can say which rooms it saw.
function roomsNews() {
  const fresh = state.seenIntro ? newRooms(state.rooms) : [];
  const all = ROOMS.map(r => r.id);
  if (!state.seenIntro || !state.rooms) {
    state.rooms = all;
    if (state.seenIntro) save();
  }
  $('whats-new').hidden = !fresh.length;
  if (!fresh.length) return;
  $('whats-new-text').innerHTML = whatsNew(fresh, ROOM_BASE, AWAY);
  const seen = () => { state.rooms = all; save(); $('whats-new').hidden = true; };
  $('whats-new-close').addEventListener('click', () => { seen(); $('choose').focus({ preventScroll: true }); });
  $('whats-new-text').addEventListener('click', e => { if (e.target.closest('a')) seen(); });
}

// On 5 April the bridge greets you with First Contact Day (js/rooms.js), in a line like the one above, once a year:
// closed, or its link followed, it stays away until next 5 April.
function greeting() {
  const now = new Date(), year = now.getFullYear();
  const on = isFirstContactDay(now) && state.greeted !== year;
  $('greeting').hidden = !on;
  if (!on) return;
  $('greeting-text').innerHTML = firstContactDay(ROOM_BASE, AWAY);
  const seen = () => { state.greeted = year; save(); $('greeting').hidden = true; };
  $('greeting-close').addEventListener('click', () => { seen(); $('choose').focus({ preventScroll: true }); });
  $('greeting-text').addEventListener('click', e => { if (e.target.closest('a')) seen(); });
}

// A link like ?course=Proxima%20Centauri, from the planetary survey or someone's shared course, sets course for that
// star. The name is the catalogue's, but a link typed or passed on by hand is read the way Set course reads it
// (?course=vega, ?course=The%20Pleiades). One that names no star opens Set course with the name in the search
// field, so there is something to see and to correct, and not a link that did nothing.
function courseFromLink() {
  const name = new URLSearchParams(location.search).get('course');
  if (name == null) return;
  history.replaceState(null, '', location.pathname + location.hash);
  const i = cat.byName.get(name) ?? named(starIndex(), name, magFromEarth);
  if (i !== undefined) {
    setTarget(i);
    // A course for the star the ship is holding at is no course, and the helm would open as if the link had done
    // nothing (tonight's sky, the survey, the warp scale, long missions and shared links all send these). It says why.
    if (i === state.at && !trip) {
      $('target-name').textContent = 'Choose another star';
      $('target-sub').textContent = i === 0 ? 'You’re holding in Earth orbit.' : `You’re holding at ${inTextFor(cat, i)}.`;
    }
    return;
  }
  if (!name.trim()) return;
  $('search').value = name.trim().slice(0, 60);
  renderList();
  openSheet('picker', $('choose'));
}

// A friend who opens a shared course on a first visit sees the welcome card over the helm, with the course hidden
// behind it: the card says first what the link did.
function courseLine() {
  const i = state.target;
  if (i == null || i === state.at) return;
  const far = nominal(i) ? '' : `, ${roughLy(lyFromShip(i))} out`;
  $('intro-course').textContent = `A course is laid in for ${inTextFor(cat, i)}${far}. Take the helm and engage.`;
  $('intro-course').hidden = false;
}

// ---------- Drawing ----------

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (trip) fly(now, dt);
  if (turn) steer(now);
  const pulsing = state.sunPulse && now - state.sunPulse < 2400;
  // A star that behaves changes slowly (its fastest, a flare, rises over a fifth of a second), so for it alone the
  // viewscreen is drawn ten times a second, not every frame: a sixth of the work, and of the battery.
  const behaves = behaving() && now - lastBehave >= 100;
  if (dirty || trip || turn || pulsing || behaves) {
    if (behaves) lastBehave = now;
    sky.render(viewNow(dt));
    drawLabels(now);
    dirty = false;
  }
  if (reporting) reportTick(now);
  requestAnimationFrame(frame);
}

const viewNow = dt => {
  sky.behave = behaving() ? { star: state.at, ...onScreen(variableFor(cat.names[state.at]), behaveClock ?? performance.now() / 1000) } : null;
  return {
    cam: viewCam(), yaw: state.yaw, pitch: state.pitch, fov: state.fov, lines: state.opts.lines || earthHeld,
    warp: trip?.warp || 0, warpSpeed: trip?.streak || 0, dt,
  };
};
// Holding at a star that behaves (Algol, Mira, Delta Cephei, Betelgeuse, Proxima), its disc does what the star does,
// sped up, so the viewscreen is drawn every frame there. Not with reduced motion asked for: the disc keeps still.
const behaving = () => !trip && !still.matches && !!variableFor(cat.names[state.at]);
let behaveClock = null; // a moment to hold the disc at, in seconds, for pictures (see engage.holdBehave)
let lastBehave = 0;      // when the disc was last drawn for its own sake

// The graphics driver can reset under the page (a long freeze, waking a laptop). The browser usually hands the
// viewscreen back on its own within a moment; if it doesn't, offer a reload instead of leaving a blank screen.
let lostTimer = 0;
function watchGraphics() {
  const canvas = $('sky');
  sky.onlost = () => {
    canvas.style.visibility = 'hidden';
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => { $('lost').hidden = false; }, 2500);
  };
  sky.onrestored = () => {
    clearTimeout(lostTimer);
    canvas.style.visibility = '';
    $('lost').hidden = true;
    dirty = true;
  };
  $('lost-reload').addEventListener('click', () => location.reload());
}

let labelCandidates = null;
function candidates() {
  if (labelCandidates) return labelCandidates;
  const set = new Set(DESTINATIONS.map(d => cat.byName.get(d.star)));
  cat.names.forEach((n, i) => {
    if (i > 0 && !/^(HIP|HD|HYG|Gliese) |^\d|^[α-ω]/.test(n) && apparentMag(cat.absmag[i], Math.hypot(...starPos(i))) < 2.6) set.add(i);
  });
  return (labelCandidates = [...set].filter(i => i !== undefined));
}

function drawLabels(now) {
  const c = $('labels');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const cam = viewCam();
  // Names stay off the header (where we are, and the buttons), the helm and Earth's sky's line, and off each other.
  const taken = [...document.querySelectorAll('.hud .where, .hud-buttons, #console, #earth-note:not([hidden])')].map(el => {
    const b = el.getBoundingClientRect();
    return [b.left - 4, b.top - 4, b.right + 4, b.bottom + 4];
  });
  const box = (x, y, tw) => [x - 2, y - 12 * TK, x + tw + 2, y + 4 * TK];
  const free = (x, y, tw) => {
    const r = box(x, y, tw);
    if (taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
    taken.push(r);
    return true;
  };
  // A name sits to the right of its star, or to the left where it would run off the screen.
  const side = (x, gap, tw) => (x + gap + tw > w - 4 ? x - gap - tw : x + gap);
  drawn = [];
  TK = textScale(); // the names grow with the text size (Bridge settings) and the browser's own
  const onScreen = p => p && !p.behind && p.x > -20 && p.y > -20 && p.x < w + 20 && p.y < h + 20;
  // Under night vision only the red in a colour is left, and the helm's cyan has little: its marks are white there.
  const red = document.body.classList.contains('red');
  const CYAN = red ? '#ffffff' : '#86d8ff';

  // The target: brackets and its name.
  const target = trip ? trip.i : state.target;
  if (target != null) {
    const p = sky.project(target);
    if (onScreen(p)) {
      const r = 15;
      g.strokeStyle = CYAN;
      g.lineWidth = 1.5;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(p.x + sx * r, p.y + sy * (r - 6));
        g.lineTo(p.x + sx * r, p.y + sy * r);
        g.lineTo(p.x + sx * (r - 6), p.y + sy * r);
      }
      g.stroke();
      const name = titleFor(cat, target), dist = nominal(target) && !trip ? 'not measured' : formatLy(cat.distanceFrom(target, cam) * LY_PER_PC);
      const lw = labelWidth(g, name, dist), x = side(p.x, r + 6, lw);
      label(g, name, dist, x, p.y + 4, CYAN);
      taken.push(box(x, p.y + 4, lw));
      drawn.push({ text: name, x, y: p.y + 4, w: lw, star: target });
    }
  }

  // The Sun, wherever we are: a dashed ring, even when it is too faint to see.
  if (Math.hypot(...cam) > 0.002) {
    const p = sky.project(0);
    if (onScreen(p)) {
      const pulse = state.sunPulse && now > state.sunPulse && now - state.sunPulse < 2400 ? 1 + 0.6 * Math.sin((now - state.sunPulse) / 120) * (1 - (now - state.sunPulse) / 2400) : 1;
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 1.3;
      g.setLineDash([3, 4]);
      g.beginPath();
      g.arc(p.x, p.y, 11 * pulse, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      const m = apparentMag(4.83, Math.hypot(...cam));
      const lw = labelWidth(g, 'Sol', `mag ${m.toFixed(1)}`), x = side(p.x, 16, lw);
      label(g, 'Sol', `mag ${m.toFixed(1)}`, x, p.y + 4, '#ffd27a');
      taken.push(box(x, p.y + 4, lw));
      drawn.push({ text: 'Sol', x, y: p.y + 4, w: lw });
    }
  }

  // Earth's sky, held: the star the ship is at, as it looks from home.
  if (earthHeld) {
    const p = sky.project(state.at);
    if (onScreen(p)) {
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 1.3;
      g.beginPath();
      g.arc(p.x, p.y, 9, 0, Math.PI * 2);
      g.stroke();
      const name = titleFor(cat, state.at), lw = labelWidth(g, name, 'you are here'), x = side(p.x, 14, lw);
      label(g, name, 'you are here', x, p.y + 4, '#ffd27a');
      taken.push(box(x, p.y + 4, lw));
      drawn.push({ text: name, x, y: p.y + 4, w: lw });
    }
  }

  if (!state.opts.labels || trip) return;
  const shown = [];
  for (const i of candidates()) {
    if (i === target || i === state.at || i === 0) continue;
    const d = cat.distanceFrom(i, cam);
    const m = apparentMag(cat.absmag[i], d);
    const curated = !!notesFor(cat, i);
    if (m > (curated ? 5.5 : 2.2)) continue;
    const p = sky.project(i);
    if (!onScreen(p)) continue;
    shown.push([m, i, p]);
  }
  shown.sort((a, b) => a[0] - b[0]);
  g.font = `500 ${12 * TK}px "IBM Plex Sans", system-ui, sans-serif`;
  for (const [, i, p] of shown.slice(0, 24)) {
    const text = titleFor(cat, i);
    const tw = g.measureText(text).width;
    const x = side(p.x, 8, tw);
    if (x < 0 || x + tw > w || p.y < 8 || p.y > h - 8 || !free(x, p.y + 4, tw)) continue; // too near an edge to fit
    g.fillStyle = red ? 'rgba(255, 240, 236, 0.8)' : 'rgba(200, 212, 235, 0.62)';
    g.fillText(text, x, p.y + 4);
    drawn.push({ text, x, y: p.y + 4, w: tw, star: i });
  }
}
let drawn = []; // the names on screen, for N and the tests: { text, x, y (the baseline), w, star (if a star's) }

let TK = 1; // how much bigger than standard the names on the viewscreen are drawn
function labelWidth(g, text, sub) {
  g.font = `600 ${13 * TK}px "Chakra Petch", system-ui, sans-serif`;
  const tw = g.measureText(text).width;
  g.font = `500 ${11 * TK}px "Chakra Petch", system-ui, sans-serif`;
  return tw + 7 + g.measureText(sub).width;
}

function label(g, text, sub, x, y, color) {
  g.font = `600 ${13 * TK}px "Chakra Petch", system-ui, sans-serif`;
  g.fillStyle = color;
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 4;
  g.fillText(text, x, y);
  const tw = g.measureText(text).width;
  g.font = `500 ${11 * TK}px "Chakra Petch", system-ui, sans-serif`;
  g.globalAlpha = 0.75;
  g.fillText(sub, x + tw + 7, y);
  g.globalAlpha = 1;
  g.shadowBlur = 0;
}

// ---------- Helm ----------

function setTarget(i, aim = true) {
  if (i === state.at || !(i >= 0 && i < cat.count)) i = null;
  state.target = i;
  showTarget();
  if (i != null && aim) lookAt(starPos(i));
  save();
}

// The helm, for the destination chosen (or none).
function showTarget() {
  const i = state.target;
  const name = $('target-name'), sub = $('target-sub');
  if (i == null) {
    name.textContent = 'Choose a star';
    sub.textContent = 'Tap a star on the viewscreen, or pick from the list';
  } else {
    name.textContent = titleFor(cat, i);
    // The next leg of a voyage under way says so, in place of what kind of star it is.
    const v = state.voyage && i === nextStop(state.voyage, findStar) ? voyageById(state.voyage.id) : null;
    sub.textContent = v ? `${v.name} · leg ${state.voyage.leg + 1} of ${v.stops.length}` : metaFor(i);
  }
  $('engage').disabled = i == null || !!trip;
  updateTrip();
  dirty = true;
}

const shortKind = k => k.split(',')[0];

function updateWarp() {
  const w = Number($('warp').value);
  state.warp = w;
  $('warp-out').textContent = w.toFixed(1).replace(/\.0$/, '');
  $('warp-speed').textContent = `${Math.round(warpSpeed(w)).toLocaleString('en-US')} × the speed of light`;
  $('warp').style.setProperty('--fill', `${(w - 1) / 8.9 * 100}%`);
  updateTrip();
}

// The warp scale opens at the helm's warp factor, and with a star chosen it races there: the link names the star and
// gives the catalogue's distance from Earth (the races all leave from Earth). A star nobody has measured the distance
// to is left out, and the warp scale opens as it would with nothing chosen.
function scaleLink() {
  const i = state.target;
  const to = cat && i != null && i !== 0 && !cat.unmeasured[i]
    ? `&to=${encodeURIComponent(cat.names[i])}&ly=${Number((cat.distanceFrom(i, [0, 0, 0]) * LY_PER_PC).toPrecision(4))}` : '';
  $('open-scale').href = `${SCALE}?warp=${state.warp}${to}`;
}

function updateTrip() {
  scaleLink();
  const el = $('trip');
  if (state.target == null) { el.textContent = ''; return; }
  const ly = lyFromShip(state.target);
  const years = tripYears(ly, state.warp);
  el.innerHTML = nominal(state.target)
    ? `Distance not measured · charted at a nominal <b>${formatLy(ly)}</b> · <b>${formatDuration(years)}</b> at this warp${missionEnd(years)}`
    : `<b>${formatLy(ly)}</b> away · <b>${formatDuration(years)}</b> at this warp${missionEnd(years)} · light takes ${formatDuration(ly)}`;
}

// With the mission clock on, where a trip would leave the five years: "arriving year 3, day 290", or that it ends
// the mission. A slow warp factor costs months of the mission.
function missionEnd(years) {
  if (!state.opts.clock) return '';
  const end = clockNow(state.log).years + years;
  return end >= 5 ? ' · <b>ends the five-year mission</b>' : ` · arriving ${clockSaid(end).replace(/^Year/, 'year').replace(/ of \d$/, '')}`;
}

function updateHud() {
  const fromSol = Math.hypot(...camAbs()) * LY_PER_PC;
  const sd = `Stardate ${stardate()}`;
  if (trip) {
    $('status').textContent = trip.phase === 'drop' ? 'Dropping out of warp' : trip.phase === 'cruise' ? 'At warp' : 'Engaging';
    $('where').textContent = `En route to ${inTextFor(cat, trip.i)}`;
  } else {
    $('status').textContent = 'Holding';
    $('where').textContent = state.at === 0 ? 'Earth orbit' : titleFor(cat, state.at);
    // The tab, the history and the browser's own share sheet name the star the ship is at.
    const title = state.at === 0 ? 'Engage' : `${titleFor(cat, state.at)} · Engage`;
    if (document.title !== title) document.title = title;
  }
  const far = !trip && cat.unmeasured[state.at] ? 'Distance not measured' : `${formatLy(fromSol)} from Sol`;
  // With the five-year mission's clock on, it takes the stardate's place, and runs on through a flight.
  const when = !state.opts.clock ? sd : trip?.clock0 ? clockSaid(trip.clock0.years + trip.elapsed) : clockNow(state.log).said;
  $('when').innerHTML = `<span>${when}</span> <span>${fromSol < 0.001 ? 'Home' : far}</span>`; // the dot between them is drawn by the stylesheet
  // At a star that behaves, its real period, and that the viewscreen shows it sped up.
  const v = !trip && variableFor(cat.names[state.at]);
  $('behaves').innerHTML = v ? onScreenParts(v, !still.matches).map(p => `<span>${esc(p)}</span>`).join(' ') : '';
  $('behaves').title = v && !still.matches ? (v.kind === 'flare' ? 'The viewscreen shows a flare every few seconds.' : `The viewscreen shows one cycle in ${SHOWN_IN} seconds.`) : '';
  $('behaves').hidden = !v;
}

// ---------- Saying what happens ----------

// The flight is a picture: the stars streak, the header changes, and a log entry slides up at the end. A screen
// reader was told none of it. say() puts one line where it is read out, once, as things happen: a course engaged, an
// arrival, a star tapped on the viewscreen, the log cleared. (The readout that counts down the light years changes
// every frame and is never read out.)
function say(text) {
  const el = $('say');
  el.textContent = el.textContent === text ? `${text}\u00a0` : text; // the same line twice is still said twice
}
const lySaid = ly => formatLy(ly).replace(/ ly$/, ' light years');

// ---------- Computer, report ----------

// Report, on the helm, says in a line what is on the viewscreen: where you are looking, the brightest stars in view,
// where the Sun is and how bright, and where the destination is. It stays up, and says it again once the view has
// been still for a moment after it moves; a flight is told in a few timed lines, setting out, halfway, most of the
// in, and dropping out. The words are the ship's computer's (js/computer.js), which also answers "report" in Set
// course. On until it is turned off, and kept with the bridge's settings.
let reporting = false;
let reportSig = '', reportSince = 0, reportedSig = '';

// How the viewscreen is pointed, for the computer: see report() in js/computer.js.
function viewFor() {
  const { f, r, u } = Sky.basis(state.yaw, state.pitch);
  const W = $('sky').clientWidth || innerWidth, H = $('sky').clientHeight || innerHeight;
  const k = Math.tan(state.fov / 2) / Math.sqrt(W * H);
  // The helm stands over the bottom of the screen: a star under it isn't in view.
  const c = $('console'), b = !trip && c.getBoundingClientRect(), s = $('sky').getBoundingClientRect();
  const tx = px => (px - s.left - W / 2) * 2 * k, ty = py => (H / 2 - (py - s.top)) * 2 * k;
  const covered = b && b.width ? [{ left: tx(b.left), right: tx(b.right), top: ty(b.top), bottom: ty(b.bottom) }] : [];
  return { cam: trip ? trip.cam : viewCam(), f, r, u, tanX: W * k, tanY: H * k, covered, at: trip ? null : earthHeld ? 0 : state.at, target: trip ? null : state.target };
}

function setReporting(on, keep = true) {
  reporting = on;
  $('report').setAttribute('aria-pressed', String(on));
  reportedSig = reportSig = '';
  if (on && !trip && cat) showReport(report(cat, viewFor()).line);
  if (!on) $('report-line').textContent = '';
  placeReport();
  if (keep && state.opts.report !== on) { state.opts.report = on; save(); }
}

function showReport(text) {
  const el = $('report-line');
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('flying', !!trip);
  placeReport();
}

// Out of the way of a sheet or the welcome card, which have the bottom of the screen; back when they go.
function placeReport() {
  const el = $('report-line');
  const off = !reporting || !el.textContent || SHEETS.some(id => !$(id).hidden) || !$('intro').hidden;
  if (el.hidden !== off) el.hidden = off;
}

// Each frame while it is on: once the view has been still for 0.6 s after changing, the line is said again.
function reportTick(now) {
  placeReport();
  if (trip) return;
  const sig = `${[state.yaw, state.pitch, state.fov].map(v => v.toFixed(3)).join()}|${state.at}|${state.target}|${earthHeld}|${innerWidth}x${innerHeight}`;
  if (sig !== reportSig) { reportSig = sig; reportSince = now; return; }
  if (sig === reportedSig || now - reportSince < 600) return;
  reportedSig = sig;
  showReport(report(cat, viewFor()).line);
}

// A line of the flight, once each: 'out', 'half', 'near', 'drop'.
function tell(stage, dist = 0) {
  const T = trip;
  if (!reporting || !T || T.told?.includes(stage)) return;
  (T.told ||= []).push(stage);
  showReport(flightLine(cat, stage, {
    from: T.fromTitle, to: T.i, warp: T.warpFactor, ly: T.ly, nominal: T.nominal, view: viewFor(),
    left: Math.max(T.D + T.hold - dist, T.hold) * LY_PER_PC,
  }));
}
const warpSaid = w => w.toFixed(1).replace(/\.0$/, '');

// ---------- Flight ----------

function engage() {
  const i = state.target;
  if (i == null || trip) return;
  const from = camAbs();
  const S = starPos(i);
  const to = S.map((v, k) => v - from[k]);
  const dStar = Math.hypot(...to);
  const dir = to.map(v => v / dStar);
  const hold = holdFor(i, dStar);
  const D = dStar - hold;
  const ly = dStar * LY_PER_PC;
  const a0 = Math.max(cat.distanceFrom(state.at, from), 1e-7);
  const heading = headingOf(dir);
  const cruise = (3.6 + 1.7 * Math.log10(1 + ly)) / speedUp;
  turn = null;
  trip = {
    i, from, S, dir, hold, D, ly, a0, cam: from.slice(),
    fromTitle: state.at === 0 ? 'Sol' : inTextFor(cat, state.at), nominal: nominal(i),
    yaw0: state.yaw, pitch0: state.pitch, yaw1: nearestYaw(state.yaw, heading.yaw), pitch1: heading.pitch, fov0: state.fov,
    t0: performance.now(), align: (still.matches ? 0.4 : 1.5) / speedUp, spool: 1.5 / speedUp, cruise, drop: 1.6 / speedUp,
    years: tripYears(ly, state.warp), warpFactor: state.warp, warp: 0, streak: 0, phase: 'align', rebased: false,
    clock0: clockNow(state.log), elapsed: 0, // the mission clock as the trip began, and the ship time since
  };
  helmAway(true);
  $('engage').disabled = true;
  closeSheets();
  sound.blip(660);
  updateHud();
  say(`Course laid in for ${inTextFor(cat, i)}, warp ${warpSaid(state.warp)}. ${trip.nominal ? 'Distance not measured.' : `${lySaid(ly)}, about ${formatDuration(trip.years)}.`}`);
  // Engage has just been switched off and the helm put away: the keyboard's place goes to the header, which now
  // says where the ship is bound, and not to nowhere.
  $('where').focus({ preventScroll: true });
}

// During a flight the helm slides off the bottom of the screen. It's out of reach of a keyboard and a screen reader
// too while it's there, not only out of sight.
function helmAway(away) {
  $('console').classList.toggle('away', away);
  $('console').inert = away;
}

function along(t, T) {
  const half = T.D / 2;
  if (t < 0.5) return T.a0 * (Math.exp(Math.log(1 + half / T.a0) * 2 * t) - 1);
  return T.D - T.hold * (Math.exp(Math.log(1 + half / T.hold) * 2 * (1 - t)) - 1);
}

// With reduced motion asked for (`calm`), nothing rushes or streaks: the view cuts to the heading, the sky it left
// dims and goes dark, the ship is at the star by the time it comes up again, and it settles before it can be seen.
// The readout counts the trip all the same, so it still reads as a trip.
function fly(now) {
  const T = trip;
  const s = T.frozen ?? (now - T.t0) / 1000;
  const ease = x => x * x * (3 - 2 * x);
  const calm = still.matches;
  let dist = 0, lit = 1; // how far along the ship is drawn, and how much of the sky's light shows
  if (calm) T.warp = T.streak = 0;
  if (s < T.align) {
    const k = calm ? 1 : ease(s / T.align);
    state.yaw = T.yaw0 + (T.yaw1 - T.yaw0) * k;
    state.pitch = T.pitch0 + (T.pitch1 - T.pitch0) * k;
    state.fov = T.fov0 + (60 * DEG - T.fov0) * k;
    T.phase = 'align';
  } else if (s < T.align + T.spool) {
    const k = (s - T.align) / T.spool;
    if (T.phase !== 'spool') { T.phase = 'spool'; sound.engage(T.spool + T.cruise); if (!auto) buzz([20, 40, 40, 40, 90]); tell('out'); updateHud(); }
    state.yaw = T.yaw1; state.pitch = T.pitch1; state.fov = 60 * DEG;
    if (calm) lit = 1 - (1 - DIM) * ease(k);
    else {
      T.warp = k * k;
      T.streak = 6 + 40 * k * k;
      if (k > 0.82 && !T.flashed) { T.flashed = true; flash(0.85); }
    }
  } else if (s < T.align + T.spool + T.cruise) {
    const t = (s - T.align - T.spool) / T.cruise;
    if (T.phase !== 'cruise') { T.phase = 'cruise'; updateHud(); }
    dist = along(t, T);
    if (!calm) {
      T.warp = 1;
      T.streak = 46 + 90 * Math.pow(Math.sin(Math.PI * t), 0.6);
    }
    if (t >= 0.5 && !T.rebased) { T.rebased = true; sky.setOrigin(T.S); }
    readout(dist);
    // Told as of the moment itself (a slow frame can land well past it, and the ship covers most of the way there).
    if (t >= 0.5) tell('half', along(0.5, T));
    if (t >= 0.8) tell('near', along(0.8, T));
    if (calm) {
      // Dark at the midpoint, which is where the sky is swapped for the one at the far end.
      lit = DIM * Math.abs(1 - 2 * t);
      dist = t < 0.5 ? 0 : T.D;
      state.yaw = T.yaw1; state.pitch = t < 0.5 ? T.pitch1 : T.pitch1 - lift();
    }
  } else if (s < T.align + T.spool + T.cruise + T.drop) {
    const k = (s - T.align - T.spool - T.cruise) / T.drop;
    if (T.phase !== 'drop') {
      T.phase = 'drop';
      if (!T.rebased) { T.rebased = true; sky.setOrigin(T.S); }
      flash(0.7);
      if (DESTINATIONS.some(d => d.quiet && cat.byName.get(d.star) === T.i)) sound.hush(); // Wolf 359 falls quiet
      else sound.arrive();
      if (!auto) buzz(90); // a phone left on autopilot overnight isn't buzzing on the nightstand every few minutes
      tell('drop');
      updateHud();
    }
    dist = T.D;
    if (calm) {
      lit = DIM + (1 - DIM) * ease(k);
      state.pitch = T.pitch1 - lift();
    } else {
      T.warp = Math.max(0, 1 - k * 2.2);
      T.streak = 46 * (1 - k);
      // Settle the view so the star sits above the log on a phone.
      state.pitch = T.pitch1 - lift() * ease(k);
    }
    readout(dist);
  } else {
    arrive();
    return;
  }
  T.cam = T.from.map((v, k) => v + T.dir[k] * dist);
  light(lit);
}
const DIM = 0.3; // how much of the sky's light is left while a reduced-motion flight is under way

// How much of the viewscreen's light shows, 0 to 1: the stars and the names over them, against the dark behind.
function light(a) {
  const o = a >= 1 ? '' : a.toFixed(3);
  for (const id of ['sky', 'labels']) if ($(id).style.opacity !== o) $(id).style.opacity = o;
}

// What the flight says as it goes. The time is the time the real trip would have taken to come this far, so it
// keeps step with the distance: the picture of the flight starts slowly and covers most of the way in the middle.
function readout(dist) {
  const T = trip;
  $('readout').hidden = false;
  $('readout-warp').textContent = `Warp ${T.warpFactor.toFixed(1).replace(/\.0$/, '')}`;
  $('readout-left').textContent = `${formatLy(Math.max(T.D + T.hold - dist, T.hold) * LY_PER_PC)} to go`;
  T.elapsed = T.years * (T.D > 0 ? dist / T.D : 1);
  $('readout-time').textContent = `${formatDuration(T.elapsed)} elapsed`;
  updateHud();
}

function arrive() {
  const T = trip;
  trip = null;
  light(1);
  state.at = T.i;
  state.offset = T.dir.map(v => -v * T.hold);
  state.target = null;
  // Face the star, sitting above the log on a phone.
  const h = headingOf(T.dir);
  state.yaw = h.yaw;
  state.pitch = clampPitch(h.pitch - lift());
  sky.setOrigin(T.S);
  // Another tab saved while this one was in flight: the log is as that tab left it, and this arrival goes on top.
  if (stale && !unsaved) {
    const theirs = stored();
    if (theirs) { Object.assign(state, { log: theirs.log, ly: theirs.ly }, theirs.opts && typeof theirs.opts === 'object' ? { opts: { ...state.opts, ...theirs.opts } } : {}); tidy(); }
  }
  stale = false;
  const entry = composeEntry(cat, T.i, { cam: camAbs(), holdAU: T.hold * AU_PER_PC, warp: T.warpFactor, fromTitle: T.fromTitle, tripLy: T.ly, nominal: T.nominal });
  if (entry.ly > 0) entry.warp = T.warpFactor; // the trip's ship time, for the five-year mission's clock
  // Each entry carries the moment of arrival, in milliseconds: a date of its own, and a name no other entry has.
  entry.id = Date.now();
  while (state.log.some(e => e.id === entry.id)) entry.id++;
  // The stop a voyage was bound for: the entry says which leg this was, and the voyage goes on to the next one, or
  // is flown. Anywhere else is a detour, and the voyage waits.
  const leg = arrivedAt(state.voyage, T.i, findStar);
  if (leg) {
    state.voyage = leg.voyage;
    entry.voyage = leg.tag;
    const next = leg.voyage ? nextStop(leg.voyage, findStar) : null;
    entry.sections.unshift(['Voyage', legLine(leg.tag, next === 0 ? 'home to Sol' : next != null ? inTextFor(cat, next) : '')]);
  }
  // Autopilot writes only its first visit to a star (and every leg of a voyage, which the log marks flown): a night
  // left running would otherwise add a thousand repeats, bury your own visits and fill the browser's storage.
  // A repeat is still flown and shown; it goes on autopilot's own list of where it has been, for where to go next.
  const repeat = auto && !leg && state.log.some(e => e.star === T.i);
  if (repeat) auto.since = [...auto.since.filter(i => i !== T.i), T.i];
  else {
    state.log.unshift(entry);
    state.ly += T.ly;
  }
  if (save() && !repeat) askToKeep(); // once ever: the first entry kept is worth keeping
  $('readout').hidden = true;
  if (!auto) helmAway(false);
  setTarget(null, false);
  updateHud();
  say(T.i === 0 ? 'Dropped out of warp in Earth orbit.' : `Dropped out of warp at ${inTextFor(cat, T.i)}.`);
  if (auto) holdHere(entry); else showArrival(entry);
  dirty = true;
}

// How far above the middle of the view a star you arrive at settles. On a phone the helm and the log cover the lower
// part of the screen, so it sits a third of the view higher; on a short screen, like a phone on its side, that would
// put it off the top, so it goes only as high as stays clear of the edge.
function lift() {
  if (innerWidth >= 760 && innerHeight >= 500) return 0;
  return Math.min(0.34 * state.fov, Math.atan((innerHeight / 2 - 44) * sky.dpr / sky.focal(state.fov)));
}

function flash(strength) {
  if (still.matches) return; // a white flash over the whole screen is just what reduced motion asks to skip
  if (document.body.classList.contains('red')) strength *= 0.3; // and under night vision it is kept faint
  $('flash').animate([{ opacity: 0 }, { opacity: strength, offset: 0.25 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
}

// ---------- Autopilot ----------

// From Bridge settings, or F at a keyboard: the helm and the round buttons go, the screen goes full and stays awake,
// and the ship flies itself. A voyage under way flies its next leg; otherwise it goes to the nearest destination
// with notes not yet in the log, then the brightest named stars, then wherever it was longest ago (see
// autopilotNext in js/voyages.js). At each star it holds about 20 seconds with two lines on screen, then goes on.
// Its first stop at each star is written to the log as any arrival is; later rounds fly there and hold, but write
// nothing. Any key or touch drops back to the helm (a flight under way
// finishes first, and its log entry comes up as usual). Under reduced motion each flight is the cross-fade it always is.
const AUTO_HOLD = 20; // seconds at each star
let auto = null; // { timer, full } while it flies

function autopilot(on) {
  if (on === !!auto) return;
  if (on) {
    closeSheets();
    auto = { timer: 0, full: false, since: [] };
    document.body.classList.add('auto');
    helmAway(true);
    wakeHold();
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (auto) auto.full = true; else document.exitFullscreen?.().catch(() => {}); }).catch(() => {});
    }
    const hint = $('auto-hint');
    hint.hidden = false;
    hint.classList.remove('gone');
    setTimeout(() => hint.classList.add('gone'), 4000);
    say('Autopilot engaged. Press any key or touch the screen to take the helm.');
    if (!trip) autoNext();
    return;
  }
  clearTimeout(auto.timer);
  const full = auto.full;
  auto = null;
  document.body.classList.remove('auto');
  $('caption').hidden = true;
  $('auto-hint').hidden = true;
  wakeRelease();
  if (full && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (!trip) { helmAway(false); $('choose').focus({ preventScroll: true }); }
  say('Autopilot off. You have the helm.');
}

function autoNext() {
  if (!auto || trip) return;
  $('caption').hidden = true;
  const i = autopilotNext({
    at: state.at, log: state.log, distance: i => cat.distanceFrom(i, camAbs()),
    // Home is where it set out from, not somewhere to explore.
    tiers: [DESTINATIONS.map(d => findStar(d.star)).filter(i => i > 0 && !cat.unmeasured[i]), candidates().filter(i => i > 0 && !cat.unmeasured[i])],
    voyageNext: state.voyage ? nextStop(state.voyage, findStar) : null,
    since: auto.since,
  });
  if (i == null) { autopilot(false); return; }
  setTarget(i, false);
  engage();
}

// Holding at a star under autopilot: its name and one line, then on to the next.
function holdHere(entry) {
  const i = entry.star;
  const leg = entry.voyage ? `Leg ${entry.voyage.leg} of ${entry.voyage.of}, ${voyageById(entry.voyage.id)?.name}` : '';
  const far = i === 0 ? 'Home, in Earth orbit' : cat.unmeasured[i] ? '' : `${formatLy(Math.hypot(...starPos(i)) * LY_PER_PC)} from Sol`;
  $('cap-title').textContent = entry.title;
  $('cap-sub').textContent = [leg, i === 0 ? '' : metaFor(i), far].filter(Boolean).join(' · ');
  $('caption').hidden = false;
  clearTimeout(auto.timer);
  auto.timer = setTimeout(autoNext, AUTO_HOLD * 1000 / speedUp);
}

// Any key or touch takes the helm back, and does nothing else: the tap that stops it doesn't also pick a star.
function bindAutopilot() {
  $('autopilot').addEventListener('click', () => autopilot(true));
  const stop = e => {
    if (!auto) return;
    e.preventDefault();
    e.stopPropagation();
    autopilot(false);
  };
  addEventListener('pointerdown', stop, true);
  addEventListener('keydown', e => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) stop(e); }, true);
  // Leaving the full screen (Escape, which the browser keeps for itself there) leaves autopilot too.
  document.addEventListener('fullscreenchange', () => { if (auto?.full && !document.fullscreenElement) autopilot(false); });
}

// ---------- Earth's sky, held to compare ----------

// Away from the Sun, pressing and holding Earth's sky on the arrival's log turns the viewscreen to the same direction
// as seen from home: the constellations back in the shapes everyone knows, and the star the ship is at marked among
// them. Letting go brings back the sky from here. Each change fades, the view as it was laid over the new one and
// let go (a fade, not a movement, so reduced motion keeps it). Nothing is saved.
let earthHeld = false;
const viewCam = () => (earthHeld ? [0, 0, 0] : camAbs());

function earthSky(on) {
  if (on && (trip || state.at === 0 || !sky)) on = false;
  if (on === earthHeld) return;
  // The view as it stands, drawn now and copied before the browser clears it.
  const fade = $('fade');
  const w = $('sky').width, h = $('sky').height;
  sky.render(viewNow(0));
  if (fade.width !== w || fade.height !== h) { fade.width = w; fade.height = h; }
  const g = fade.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.drawImage($('sky'), 0, 0, w, h);
  g.drawImage($('labels'), 0, 0, w, h);
  earthHeld = on;
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  void fade.offsetWidth; // the copy is up before it starts to fade
  fade.style.transition = 'opacity .45s ease-out';
  fade.style.opacity = '0';
  $('earth-sky').setAttribute('aria-pressed', String(on));
  $('earth-note').hidden = !on;
  if (on) say(`Earth’s sky: the same direction, seen from home. ${titleFor(cat, state.at)} is marked.`);
  dirty = true;
}

// Held with a finger or the mouse, or with Space or Enter. A click with neither (a screen reader's) turns it on and off.
function bindEarthSky() {
  const b = $('earth-sky');
  let keyed = false;
  b.addEventListener('pointerdown', e => { if (e.button) return; b.setPointerCapture?.(e.pointerId); earthSky(true); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => earthSky(false));
  b.addEventListener('contextmenu', e => e.preventDefault()); // a long press is the point, not a menu
  b.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    keyed = true;
    if (!e.repeat) earthSky(true);
  });
  b.addEventListener('keyup', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    earthSky(false);
    setTimeout(() => { keyed = false; });
  });
  b.addEventListener('blur', () => earthSky(false));
  b.addEventListener('click', e => { if (e.detail === 0 && !keyed) earthSky(!earthHeld); });
}

// ---------- Looking around ----------

function headingOf(dir) {
  return { yaw: Math.atan2(dir[1], dir[0]), pitch: Math.asin(Math.max(-1, Math.min(1, dir[2]))) };
}

function nearestYaw(from, to) {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return from + d;
}

function lookAt(pos, duration = 1000) {
  if (trip) return;
  const cam = camAbs();
  const d = pos.map((v, k) => v - cam[k]);
  const l = Math.hypot(...d);
  const h = headingOf(d.map(v => v / l));
  // With reduced motion the view cuts to it instead of panning across the sky.
  turn = { t0: performance.now(), dur: still.matches ? 1 : duration, yaw0: state.yaw, pitch0: state.pitch, yaw1: nearestYaw(state.yaw, h.yaw), pitch1: Math.max(-1.5, Math.min(1.5, h.pitch - aimLift())) };
}

// On a short screen (a phone on its side) or the narrowest phones, the helm reaches up to the middle of the view, so
// a star you turn to goes halfway up the sky left between the header and the helm instead of behind it.
function aimLift() {
  const top = $('console').offsetTop; // where it sits, even while it's tucked away for a flight
  if (top > innerHeight / 2 + 60) return 0;
  const header = Math.max(...[...document.querySelectorAll('.hud .where, .hud-buttons')].map(el => el.getBoundingClientRect().bottom));
  return Math.atan((innerHeight / 2 - (header + top) / 2) * sky.dpr / sky.focal(state.fov));
}

function steer(now) {
  const k = Math.min(1, (now - turn.t0) / turn.dur);
  const e = 1 - Math.pow(1 - k, 3);
  state.yaw = turn.yaw0 + (turn.yaw1 - turn.yaw0) * e;
  state.pitch = turn.pitch0 + (turn.pitch1 - turn.pitch0) * e;
  dirty = true;
  if (k >= 1) { turn = null; save(); }
}

function lookHome() {
  closeSheets();
  if (Math.hypot(...camAbs()) < 0.002) { lookAt(starPos(0)); return; }
  lookAt(starPos(0), 1400);
  if (!still.matches) state.sunPulse = performance.now() + 1000; // the Sun's ring beats a few times once the view gets there
  // The first time from far out, the Sun says hello, once, as the view gets there (js/computer.js).
  if (sunSaysHello(Math.hypot(...camAbs()) * LY_PER_PC, state.sunHello)) {
    state.sunHello = true;
    save();
    setTimeout(() => {
      const el = $('sun-note');
      el.hidden = true;
      void el.offsetWidth; // start its fade again
      el.hidden = false;
      say(SUN_LINE);
      setTimeout(() => { el.hidden = true; }, 7000);
    }, still.matches ? 0 : 1400);
  }
}

// ---------- Sheets ----------

const SHEETS = ['picker', 'log', 'settings', 'arrival'];
// The sheets that have to be answered or put away before anything else: Set course, the log and the settings. The
// arrival's log entry is not one of them: the new star is there to be looked at, and tapped around, behind it.
const MODAL = ['picker', 'log', 'settings'];
const touchy = matchMedia('(pointer: coarse)').matches;
let opener = null; // the button that opened the sheet that's up, to hand focus back to when it closes
let steps = null; // the sheets' steps in the tab's history: Back closes the sheet that is up (see js/sheets.js)

// `from` is the button that opened it. Then the sheet takes focus, so a keyboard carries on inside it: the search
// field in Set course, or else the close button. On a touchscreen the search field would bring the keyboard up over the list.
function openSheet(id, from = null) {
  for (const s of SHEETS) $(s).hidden = true;
  $(id).hidden = false;
  $('scrim').hidden = false;
  steps?.opened();
  opener = from;
  if (from) (id === 'picker' && !touchy ? $('search') : $(id).querySelector('.close')).focus({ preventScroll: true });
  behind();
  placeReport();
}

function closeSheets() {
  earthSky(false);
  const open = SHEETS.some(id => !$(id).hidden);
  for (const id of SHEETS) $(id).hidden = true;
  $('scrim').hidden = true;
  if (open) steps?.closed();
  behind(); // before focus goes back: nothing behind a sheet can take it while the sheet is up
  if (open && opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus({ preventScroll: true });
  opener = null;
  placeReport();
}

// What is behind a sheet that is up, or behind the welcome card, is out of reach of a keyboard and a screen reader
// as well as of a finger: Tab used to walk out of Bridge settings to the round buttons under the scrim.
function behind() {
  const card = !$('intro').hidden;
  $('bridge').inert = card || MODAL.some(id => !$(id).hidden);
  for (const id of SHEETS) $(id).inert = card;
}

// Tab goes round inside the sheet or the card that is up, and not out to the browser and back in somewhere else.
function keepTab(e) {
  const box = !$('intro').hidden ? $('intro') : MODAL.map($).find(el => !el.hidden);
  if (!box) return;
  const stops = [...box.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), summary')].filter(el => el.getClientRects().length);
  if (!stops.length) return;
  const at = document.activeElement, first = stops[0], last = stops[stops.length - 1];
  const to = !box.contains(at) ? (e.shiftKey ? last : first) : e.shiftKey && at === first ? last : !e.shiftKey && at === last ? first : null;
  if (to) { e.preventDefault(); to.focus(); }
}

// `byPointer` when the card was closed with a finger or a mouse, and not from the keyboard.
function dismissIntro(byPointer = false) {
  $('intro').hidden = true;
  state.seenIntro = true;
  save();
  sound.blip(880);
  behind();
  // The card's button has gone, so the keyboard's place goes to the first thing to do: choosing a destination (or
  // the search field, when a link that named no star has opened Set course under the card).
  const next = MODAL.map($).find(el => !el.hidden);
  const to = next ? (next.id === 'picker' && !touchy ? $('search') : next.querySelector('.close')) : $('choose');
  to.focus({ preventScroll: true });
  if (byPointer) quiet(to);
}

// The focus ring is there for a keyboard. The card's button takes focus as the page opens, which a browser counts as
// the keyboard's doing, and it goes on counting whatever focus is handed to next: after a tap on Take the helm the
// bridge's first sight had a bright ring round Choose a star. The keyboard's place is kept and the ring is not
// drawn, until a key is pressed or focus moves on.
function quiet(el) {
  const loud = () => { el.classList.remove('quiet'); el.removeEventListener('blur', loud); removeEventListener('keydown', loud, true); };
  el.classList.add('quiet');
  el.addEventListener('blur', loud);
  addEventListener('keydown', loud, true);
}

let arrived = null; // the entry on the arrival sheet
// `again` when the sheet is being put back as it was left, and not for a new arrival: its lines don't file in afresh.
function showArrival(entry, again = false) {
  arrived = entry;
  contacts = readContacts();
  $('arrival-date').textContent = `Captain’s log${state.ship ? `, ${fullName(state.ship)}` : ''} · Stardate ${entry.stardate}`;
  $('arrival-entry').innerHTML = entryHtml(entry, true, !again);
  // What this arrival did to the records, said once under the star's name: it is the newest entry that is up.
  const firsts = entry === state.log[0] ? arrivalFirsts(state.log, recordOpts()) : [];
  // The arrival that takes the mission to five years closes it (with the clock on).
  if (state.opts.clock && entry === state.log[0] && missions(state.log).at(-1)?.closed) firsts.push('Five-year mission complete');
  // And the arrival that flies a voyage's last leg ticks it off.
  if (entry === state.log[0] && entry.voyage && entry.voyage.leg === entry.voyage.of) firsts.push(`Voyage flown: ${voyageById(entry.voyage.id)?.name}`);
  if (firsts.length) $('arrival-entry').querySelector('h3').insertAdjacentHTML('afterend', `<p class="firsts">${firsts.map(t => `<span>${esc(t)}</span>`).join(' ')}</p>`);
  unsavedNote('arrival-unsaved', 'The log is full: this entry won’t be kept.', 'This browser isn’t letting the bridge save: this entry won’t be kept.');
  nextButton();
  // Earth's sky is there to compare with anywhere but home, and at a star whose place the charts can only guess.
  $('earth-sky').hidden = state.at === 0 || !!cat.unmeasured[state.at];
  openSheet('arrival');
  $('scrim').hidden = true; // keep the view of the new star clear
  $('arrival-entry').scrollTop = 0;
  // The entry takes the keyboard's place at its heading, so it is read from the top; when it is put away, the place
  // goes to the destination button, for the next course.
  opener = $('choose');
  const heading = $('arrival-entry').querySelector('h3');
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

// The arrival's main button: the next leg of a voyage under way, named with how far it is, or else Set course.
function nextButton() {
  const b = $('arrival-next');
  const i = state.voyage ? nextStop(state.voyage, findStar) : null;
  b.classList.toggle('leg', i != null && i !== state.at);
  if (i == null || i === state.at) {
    b.textContent = 'Next destination';
    b.removeAttribute('aria-label');
    delete b.dataset.leg;
    return;
  }
  const far = nominal(i) ? '' : formatLy(lyFromShip(i));
  b.innerHTML = `<span class="leg-of">Next leg${far ? ` · ${far}` : ''}</span><span class="leg-to">${esc(titleFor(cat, i))}</span>`;
  b.setAttribute('aria-label', `Next leg: ${titleFor(cat, i)}${far ? ` (${far})` : ''}`);
  b.dataset.leg = i;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The contacts first contact says were made, and where (see contacts.js): read again each time the log is drawn.
let contacts = [];

// `heading` for the arrival's sheet, which has the star's name over the entry; `staged` when its lines come in one
// after another, as they do on arrival.
function entryHtml(e, heading, staged = heading) {
  const parts = heading ? [`<h3>${esc(e.title)}</h3>`] : [];
  parts.push(`<p class="intro-line">${esc(e.intro)}</p><dl>`);
  let delay = 0;
  for (const [label, text] of e.sections) {
    const style = staged && !still.matches ? ` style="animation: rise .5s ${(delay += 0.12).toFixed(2)}s both"` : '';
    if (label) parts.push(`<dt${style}>${esc(label)}</dt>`);
    parts.push(`<dd class="${label ? (label === 'Looking home' ? 'home' : '') : 'note'}"${style}>${esc(text)}</dd>`);
    if (label === 'The star') parts.push(wallLink(e.star, style));
    if (label === 'Planets') parts.push(systemLink(e.star, style), surveyLinks(e.star, style));
    if (label === 'A temperate orbit') parts.push(placeLink(e.star, style));
    if (label === 'Looking home') parts.push(shipLink(e.ship, style), radioLink(e.star, style));
  }
  // First contact made during this stay, read from first contact's own record.
  for (const line of linesForVisit(contacts, e)) parts.push(`<dd class="note contact-made">${esc(line)}</dd>`);
  parts.push('</dl>', entryActions(e, heading));
  return parts.join('');
}

// What an entry can do: set course for its star again (from the log; on arrival the ship is there), or for the
// star nearest to it, the one its "sky from here" names; show where the star is in the real sky tonight; and send
// someone a link that sets the same course on their bridge.
function entryActions(e, arrival) {
  const again = !arrival && e.star !== state.at ? `<button type="button" data-again="${e.star}">Set course again</button>` : '';
  const near = Number.isInteger(e.near) && e.near >= 0 && e.near < cat.count && e.near !== state.at
    ? `<button type="button" data-course="${e.near}">Set course for ${esc(titleFor(cat, e.near))}</button>` : '';
  const tonight = `<a href="${TONIGHT}#star=${encodeURIComponent(cat.names[e.star])}"${AWAY}>In your sky tonight</a>`;
  // A course for home isn't one to send: nearly everyone who opens the link is already there.
  // (On the arrival sheet the button stands for that entry itself: the log can gain entries from another tab under it.)
  const send = e.star === 0 ? '' : `<button type="button" data-share="${arrival ? 'arrival' : state.log.indexOf(e)}">Share this course</button>`;
  return `<p class="entry-actions">${again}${near}${tonight}${send}</p>`;
}

function shareCourse(button) {
  const e = button.dataset.share === 'arrival' ? arrived : state.log[Number(button.dataset.share)];
  if (!e) return;
  share(button, {
    title: `Engage: set course for ${inTextFor(cat, e.star)}`,
    text: `Captain’s log, stardate ${e.stardate}. ${e.intro}`,
    // A destination with notes has a page of its own, so the link previews as that star in a chat (js/courses.js).
    url: `${LIVE}${coursePath(cat.names[e.star]) ?? `?course=${encodeURIComponent(cat.names[e.star])}`}`,
  });
}

// Links to the planetary survey's files on this star's planets.
function surveyLinks(i, style) {
  const files = filesForStar(cat.names[i]);
  if (!files.length) return '';
  return `<dd class="files"${style}>${files.map(({ world, cls }) =>
    // A planet that is on a file without fitting its readings (TRAPPIST-1 b, bare rock but Earth-sized) isn't called that class.
    `<a href="${SURVEY}#${encodeURIComponent(cls.id)}"${AWAY}>${esc(world.name)}: ${world.misfit ? `on the ${esc(classLabel(cls))} file` : `${esc(classLabel(cls))}${cls.candidate ? ' candidate' : ''}`}</a>`
    // and, where the lab has the planet's own readings, to a creature grown for it.
    + (grows(world) ? `<a class="to-lab" href="${XENO}#world=${encodeURIComponent(world.name)}"${AWAY}>Grow a creature for ${esc(world.name)}</a>` : '')).join('')}</dd>`;
}

// At a star whose planets the system view has, a link to fly in to them; and beside the orbit where a planet would
// be temperate, one to place a planet there and see what it would be.
function systemLink(i, style) {
  if (!systemFor(cat.names[i])) return '';
  return `<dd class="files"${style}><a href="${SYSTEM}#star=${encodeURIComponent(cat.names[i])}"${AWAY}>System view: fly in to its planets</a></dd>`;
}
function placeLink(i, style) {
  return `<dd class="files"${style}><a href="${SYSTEM}#star=${encodeURIComponent(cat.names[i])}&amp;place"${AWAY}>Place a planet here</a></dd>`;
}

// Under the line on what kind of star it is, a link to astrometrics, with the star ringed among all the others on
// the wall of colour against true brightness. Not for a star the wall leaves off (no colour, too red a colour, or
// no distance).
function wallLink(i, style) {
  if (!(i >= 0 && i < cat.count) || cat.unmeasured[i] || cat.nocolour[i] || cat.offscale[i]) return '';
  return `<dd class="files"${style}><a href="${ASTROMETRICS}#star=${encodeURIComponent(cat.names[i])}"${AWAY}>Astrometrics: where this star sits</a></dd>`;
}

// Beside the line on when Earth's broadcasts reached a star, a link to subspace radio, with the dial at the year that
// star is hearing tonight (or, past their reach, at the star itself). Not for home, nor for a star nobody knows the
// distance to.
function radioLink(i, style) {
  if (!(i > 0 && i < cat.count) || cat.unmeasured[i]) return '';
  return `<dd class="files"${style}><a href="${RADIO}#star=${encodeURIComponent(cat.names[i])}"${AWAY}>Subspace radio: what it hears from Earth</a></dd>`;
}

// When the year of Earth an entry looks back on is one of a long mission's own ("the year Voyager 2 flew past
// Uranus"), a link to that ship's file in long missions: where she is now.
function shipLink(ship, style) {
  if (!ship || !/^[a-z0-9]+$/.test(ship.id) || typeof ship.name !== 'string') return '';
  return `<dd class="files"${style}><a href="${MISSIONS}#${ship.id}"${AWAY}>Where ${esc(ship.name)} is now</a></dd>`;
}

function renderLog() {
  save(); // try again: room may have been made since
  shown = PAGE; // the log opens on its newest arrivals, by day, with nothing searched for
  logView = 'day';
  $('log-search').value = '';
  drawLog();
}

// ---------- On this phone ----------

// Bridge settings says what the README promises: that Engage works with no signal once its copy is kept, and that
// it installs. Where the browser offers to install, a button does it; on an iPhone, where only the Share menu can,
// a line says how. Safari deletes a site's saved data after seven days of Safari use without a visit, but not an
// app's added to the Home Screen (WebKit, "Full Third-Party Cookie Blocking and More", 24 March 2020): there a
// quiet line says so. And where the browser has agreed to keep the log (see askToKeep in js/store.js), it says that.
let installAsk = null; // the browser's offer to install, kept for the button
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installAsk = e; showPhone(); });
addEventListener('appinstalled', () => { installAsk = null; showPhone(); });

const ua = navigator.userAgent;
const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Edg\/|Firefox|Android/.test(ua);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let phoneTimer = 0;
async function showPhone() {
  clearTimeout(phoneTimer);
  if ($('settings').hidden) return;
  const home = installed();
  $('phone-installed').hidden = !home;
  $('install').hidden = home || !installAsk;
  $('phone-ios').hidden = home || !iOS || !!installAsk;
  $('phone-safari').hidden = home || !iOS || !safari; // a Mac has no Home Screen to add it to
  let kept = false;
  try { kept = !!(await navigator.storage?.persisted?.()); } catch { /* can't say */ }
  $('phone-kept').hidden = !kept;
  const copy = await copyKept();
  if (copy) {
    const whole = copy.total && copy.have >= copy.total;
    $('phone-copy').textContent = whole ? `Kept on this device: all ${inWords(ROOMS.length + 1)} rooms work with no signal.`
      : copy.total ? `Saving a copy for use with no signal: ${copy.have} of ${copy.total} files.` : 'Saving a copy for use with no signal…';
    if (!whole) phoneTimer = setTimeout(showPhone, 2000); // while it fills, the count goes on
  }
  $('phone-copy').hidden = !copy;
  $('phone').hidden = [...$('phone').querySelectorAll('p, button')].every(el => el.hidden);
}

// How much of the offline copy the service worker has: { have, total } files, { total: 0 } while it is still being
// set up, or null where there is none (the single-file copy, a browser without service workers).
async function copyKept() {
  let reg = null;
  try { reg = await navigator.serviceWorker?.getRegistration(); } catch { /* none */ }
  if (!reg) return null;
  if (!reg.active) return { have: 0, total: 0 };
  return new Promise(resolve => {
    const ch = new MessageChannel();
    const late = setTimeout(() => resolve(null), 3000);
    ch.port1.onmessage = e => { clearTimeout(late); resolve(e.data && Number.isInteger(e.data.have) ? e.data : null); };
    reg.active.postMessage('engage-copy?', [ch.port2]);
  });
}

// ---------- Ship's records ----------

// Everything lives in one browser on one device. Save a copy downloads one dated file of everything Engage keeps
// (js/records.js); Restore from a copy reads one back, says what is in it, and offers Add to what's here or
// Replace, each asked twice on the button itself (the Artifact viewer refuses confirm dialogs). The page then loads
// again with what was restored, and says so.
const RESTORED = 'engage.restored'; // for this tab: the line to say once the page is back
let found = null; // a copy read from a file, waiting for Add or Replace

function keysNow() {
  const out = [];
  try {
    for (let n = 0; n < localStorage.length; n++) {
      const key = localStorage.key(n);
      if (carried(key)) out.push([key, localStorage.getItem(key)]);
    }
  } catch { /* nothing can be read */ }
  return out;
}

function saveCopy() {
  if (!trip) save(); // the ship as she is now
  const file = pack(keysNow());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  a.download = fileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  $('records-said').textContent = `Saved ${contents(file)}, as ${a.download}.`;
}

async function readCopy(input) {
  const f = input.files?.[0];
  input.value = ''; // the same file can be chosen again
  if (!f) return;
  let text = '';
  try { text = await f.text(); } catch { /* unreadable */ }
  const got = unpack(text);
  found = got.file || null;
  $('records-found').hidden = !found;
  $('records-said').textContent = got.why || '';
  if (!found) return;
  const saved = Date.parse(found.saved);
  const left = jarsLeft(fromRaw(localStorage.getItem('engage.xeno.v1')), found.keys['engage.xeno.v1']);
  $('records-what').textContent = `This copy${Number.isFinite(saved) ? `, saved ${new Date(saved).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })},` : ''} holds ${contents(found)}.`
    + (left ? ` Added to what’s here, ${left} of its creatures won’t fit on the lab’s shelf of 40.` : '');
  for (const id of ['records-add', 'records-replace']) disarm($(id));
  $('records-found').scrollIntoView({ block: 'nearest' });
}

const RESTORE_WORDS = { 'records-add': ['Add to what’s here', 'Tap again to add it'], 'records-replace': ['Replace what’s here', 'Tap again to replace everything here'] };
function disarm(b) { delete b.dataset.armed; b.textContent = RESTORE_WORDS[b.id][0]; }

function restore(b) {
  if (!found) return;
  if (!b.dataset.armed) {
    for (const id of Object.keys(RESTORE_WORDS)) disarm($(id));
    b.dataset.armed = '1';
    b.textContent = RESTORE_WORDS[b.id][1];
    setTimeout(() => disarm(b), 4000);
    return;
  }
  const before = new Map(keysNow());
  const how = b.id === 'records-add' ? 'add' : 'replace';
  const { write, remove } = plan(found, Object.fromEntries([...before].map(([key, raw]) => [key, fromRaw(raw)])), how);
  try {
    for (const key of remove) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(write)) localStorage.setItem(key, rawOf(value));
  } catch {
    // Half a restore is worse than none: everything goes back as it was, and nothing here is lost.
    try {
      for (const key of Object.keys(write)) if (!before.has(key)) localStorage.removeItem(key);
      for (const [key, raw] of before) if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
    } catch { /* as much as the browser allows */ }
    disarm(b);
    $('records-said').textContent = 'This browser’s storage is full, so the copy wasn’t restored, and nothing here was changed. Clearing the log makes room.';
    return;
  }
  try { sessionStorage.setItem(RESTORED, `${how === 'add' ? 'Added' : 'Restored'} from your copy: ${contents(found)}.`); } catch { /* said nowhere */ }
  found = null;
  location.reload();
}

// Back after a restore: Bridge settings opens on the line that says what came back.
function restored() {
  let line = null;
  try { line = sessionStorage.getItem(RESTORED); sessionStorage.removeItem(RESTORED); } catch { /* no storage */ }
  if (!line) return;
  openSheet('settings', $('open-settings'));
  showPhone();
  $('records-said').textContent = line;
  $('records-io').scrollIntoView({ block: 'start' });
  say(line);
}

// ---------- Back from another room ----------

// Every room's Back is a plain link to the bridge, which loads afresh: the log entry you were reading when you
// followed its link (to a planet's survey file, the lab, tonight's sky, a ship on a long mission) was gone, and you
// were on the bare viewscreen. A link followed out of an entry leaves a mark for this tab: which sheet, which entry,
// how far it was scrolled. The mark is only written as the page is really left (see leave), so a link opened in a
// new tab, or one that went nowhere, leaves none.
let leaving = null;
function noteLeaving(id, e) {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const entry = id === 'arrival-entry' ? arrived : state.log[Number(a.closest('.past')?.dataset.k)];
  if (!entry) return;
  leaving = { at: performance.now(), mark: { sheet: id === 'arrival-entry' ? 'arrival' : 'log', id: entry.id ?? null, stardate: entry.stardate, star: entry.star, scroll: $(id).scrollTop } };
}

// As the page is left: the view as it stands, and the mark to come back to. The view is saved whenever it changes,
// but a wheel that has only just stopped hasn't been yet, and a turn still under way is saved where it was going.
// Not in flight, and not over another tab's save that this one never heard of (it may have slept through it).
function leave() {
  if (turn && !trip) { state.yaw = turn.yaw1; state.pitch = turn.pitch1; turn = null; viewMoved = true; }
  if (viewMoved && !trip && current(KEY)) save();
  if (!leaving || performance.now() - leaving.at > 30000) return;
  try { sessionStorage.setItem(RETURN, JSON.stringify({ ...leaving.mark, at: Date.now() })); } catch { /* no storage: the bridge opens plain */ }
  leaving = null;
}

// Back on the bridge within half an hour: the sheet is put back with that entry open, where it was scrolled to. The
// mark is used once. A link that sets a course (`coursed`) is here for the helm, not for the log.
function returnTo(coursed) {
  let mark = null;
  try { mark = JSON.parse(sessionStorage.getItem(RETURN) || 'null'); sessionStorage.removeItem(RETURN); } catch { return; }
  if (coursed || !state.seenIntro || !mark || typeof mark !== 'object') return;
  const age = Date.now() - mark.at;
  if (!(age >= 0 && age < 30 * 60000)) return;
  const k = state.log.findIndex(e => e.star === mark.star && (mark.id != null ? e.id === mark.id : e.stardate === mark.stardate));
  if (k < 0) return;
  const scroll = Number.isFinite(mark.scroll) ? mark.scroll : 0;
  if (mark.sheet === 'arrival' && k === 0 && state.at === state.log[0].star) {
    showArrival(state.log[0], true);
    $('arrival-entry').scrollTop = scroll;
    return;
  }
  shown = Math.max(PAGE, Math.ceil((k + 1) / PAGE) * PAGE); // an entry further back than the log first shows is shown too
  logView = 'day';
  drawLog();
  openSheet('log', $('open-log'));
  const past = $('entries').querySelector(`.past[data-k="${k}"]`);
  past.open = true;
  $('entries').scrollTop = scroll;
  // Other entries may have been open above it when the page was left: if that leaves this one out of sight, show it.
  const box = $('entries').getBoundingClientRect(), top = past.getBoundingClientRect().top;
  if (top < box.top || top > box.bottom - 60) past.scrollIntoView({ block: 'start' });
  past.querySelector('summary').focus({ preventScroll: true });
}

// What the other rooms have on record, read again each time the log is drawn: the lines they add to it.
let supps = [], records = {};
// How far a star is from Sol by its catalogue name, in light years, for a hail to it kept before subspace radio kept that.
const starLy = name => { const i = cat?.byName.get(name); return i > 0 && !cat.unmeasured[i] ? Math.hypot(...starPos(i)) * LY_PER_PC : undefined; };
function drawLog() {
  contacts = readContacts();
  records = readRecords();
  supps = supplementals(records, Date.now(), { lyOf: starLy });
  dutyNow();
  unsavedNote('log-unsaved', 'The log is full: new entries and the ship’s position aren’t being kept. Clearing the log, in settings, makes room.',
    'This browser isn’t letting the bridge save: the log and the ship’s position won’t be kept.');
  const n = new Set(state.log.map(e => e.star)).size;
  $('stats').textContent = state.log.length
    ? `${n} ${n === 1 ? 'star' : 'stars'} visited · ${formatLy(state.ly)} travelled`
    : 'Nothing logged yet. Choose a star and engage.';
  // Past 30 entries the log can be searched, and shown by star. Any log can be printed, and charted.
  const long = state.log.length > LONG_LOG;
  $('log-tools').hidden = !state.log.length;
  $('log-view').hidden = !state.log.length;
  $('log-by-star').hidden = !long;
  if (!long) { if (logView === 'star') logView = 'day'; $('log-search').value = ''; }
  drawEntries();
}

let logView = 'day'; // or 'star': one row for each star; or 'chart': where they all are
function drawEntries() {
  const long = state.log.length > LONG_LOG;
  $('log-search').hidden = !long || logView === 'chart';
  const q = logView === 'chart' ? '' : $('log-search').value.trim();
  for (const [id, v] of [['log-by-day', 'day'], ['log-by-star', 'star'], ['log-chart', 'chart']]) $(id).setAttribute('aria-pressed', String(logView === v));
  if (logView === 'chart') { $('entries').innerHTML = chartHtml(); paintChart(); return; }
  $('entries').innerHTML = (q ? '' : todayHtml() + storyHtml() + serviceHtml() + recordsHtml()) + (logView === 'star' ? starsHtml(q) : daysHtml(q));
}

// ---------- Stellar cartography ----------

// The log as a chart: every star visited, seen from above the galaxy's plane with the Sun in the middle and the
// galactic centre up, each in its own colour, and the flights between them in the order they were flown (the latest
// brightest). Each ring is ten times as far out as the one inside it. A tap on a star names it, with Set course
// again; Save chart makes a picture of it. (The rules are in js/cartography.js, the drawing in js/chart-view.js.)
let chartPick = -1, chartDots = [];
const chartNow = () => chartOf(state.log, cat);
function chartHtml() {
  const c = chartNow();
  return `<section class="chart" id="chart" aria-labelledby="chart-head">
    <h3 class="day" id="chart-head">Stellar cartography</h3>
    <div class="chart-box"><canvas id="chart-map" role="img" aria-label="${esc(`A chart of the stars in the log, seen from above the galaxy. ${chartLine(c, i => titleFor(cat, i), roughLy)}`)}"></canvas></div>
    <p class="chart-line" id="chart-line">${esc(chartLine(c, i => titleFor(cat, i), roughLy))}</p>
    <p class="chart-pick" id="chart-pick" aria-live="polite"></p>
    <p class="chart-key">Seen from above the galaxy, its centre up. Each ring is ten times as far from the Sun as the one inside it, so the near stars aren’t lost in the middle.</p>
    <p class="entry-actions"><button type="button" id="chart-save">Save chart</button></p>
  </section>`;
}
function paintChart() {
  const cv = $('chart-map');
  if (!cv) return;
  const c = chartNow();
  if (!c.stars.some(s => s.star === chartPick)) chartPick = -1;
  const size = Math.min(cv.parentElement.clientWidth || 340, 560), dpr = Math.min(devicePixelRatio || 1, 3);
  cv.style.width = cv.style.height = `${size}px`;
  cv.width = cv.height = Math.round(size * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  chartDots = drawChart(g, c, { size, edge: chartEdge(c.reach), colorOf: chartColor, titleOf: i => titleFor(cat, i), selected: chartPick, labels: size < 400 ? 8 : 12 });
  const s = c.stars.find(x => x.star === chartPick);
  $('chart-pick').innerHTML = s
    ? `<b>${esc(titleFor(cat, s.star))}</b> · ${esc(roughLy(s.ly))} from Sol · ${s.visits} ${s.visits === 1 ? 'visit' : 'visits'}${s.star !== state.at ? ` <button class="text-button" type="button" data-again="${s.star}">Set course again</button>` : ' · the ship is here'}`
    : 'Tap a star to set course for it again.';
}
const chartColor = i => [cat.color[i * 3], cat.color[i * 3 + 1], cat.color[i * 3 + 2]];
function pickOnChart(e) {
  const cv = $('chart-map');
  const r = cv.getBoundingClientRect();
  const d = dotAt(chartDots, e.clientX - r.left, e.clientY - r.top);
  chartPick = d ? d.star : -1;
  if (d) sound.blip(880);
  paintChart();
}

// Save chart: the chart as a picture, headed with the ship and the count, for the phone's share sheet, or downloaded
// where a browser can't share a file. Drawn here: nothing leaves the page but the picture.
async function saveChart(button) {
  button.disabled = true;
  try {
    await Promise.all(['600 64px "Chakra Petch"', '500 28px "Chakra Petch"', '28px "IBM Plex Sans"'].map(f => document.fonts.load(f))).catch(() => {});
    const W = 1080, H = 1290, c = chartNow();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#05070d'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#93a0b8'; g.font = '600 26px "Chakra Petch", sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('CAPTAIN’S LOG · STELLAR CARTOGRAPHY', 60, 82);
    g.fillStyle = '#e8edf6'; g.font = '600 56px "Chakra Petch", sans-serif';
    g.fillText(state.ship ? withRegistry(state.ship) : 'Where we have been', 60, 148, W - 120);
    drawChart(g, c, { size: W - 40, ox: 20, oy: 170, edge: chartEdge(c.reach), colorOf: chartColor, titleOf: i => titleFor(cat, i), unit: 2.4, labels: 14 });
    g.fillStyle = '#93a0b8'; g.font = '28px "IBM Plex Sans", sans-serif';
    g.fillText(chartLine({ ...c, unplaced: 0 }, i => titleFor(cat, i), roughLy), 60, H - 62, W - 120);
    g.fillStyle = '#727f97'; g.font = '500 24px "Chakra Petch", sans-serif';
    g.fillText('engage.junkdrawer.works', 60, H - 24);
    const blob = await new Promise(done => cv.toBlob(done, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'captains-log-chart.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Captain’s log: stellar cartography', text: LIVE }); return; }
      catch (err) { if (err?.name === 'AbortError') return; } // closed the sheet; otherwise download it instead
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } finally { button.disabled = false; }
}

// The service record: the career in one card, read from every room's record, each row leading to its room. It is
// there once anything is on record anywhere, and a room with nothing yet says so.
function serviceHtml() {
  const rows = serviceRecord(records, Date.now(), { lyOf: starLy });
  if (!state.log.length && rows.every(r => !r.line)) return '';
  const chev = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  // With the five-year mission's clock on, it heads the card: which mission, how far into it, and how many are done.
  const c = state.opts.clock ? clockNow(state.log) : null;
  const clock = c ? `<p class="clock" id="service-clock">Mission ${c.n} · ${c.said}${c.done ? ` · ${c.done === 1 ? 'one' : c.done} complete` : ''}</p>` : '';
  const named = state.ship ? ` · ${esc(withRegistry(state.ship))}` : '';
  const d = duty;
  const rank = d ? `<p class="rank" id="rank"><b>${esc(d.rank.name)}</b>${d.rank.next ? `<span>Next, ${esc(d.rank.next)}: ${esc(d.rank.needs.join(', '))}.</span>` : '<span>The highest rank on the bridge.</span>'}</p>` : '';
  const m = d?.medals;
  const medals = m && (m.earned.length || m.next) ? `<p class="medals" id="medals"><b>Commendations</b>${m.earned.length ? `<span class="earned">${m.earned.map(c => `<span title="${esc(c.what)}">${esc(c.name)}</span>`).join('')}</span>` : ''}`
    + `${m.next ? `<span class="next">Next, ${esc(m.next.name)}: ${esc(m.next.what)} (${esc(progressSaid(m.next))}).</span>` : ''}</p>` : '';
  return `<section class="service" id="service" aria-labelledby="service-head"><h3 id="service-head">Service record${named}</h3>${rank}${clock}<ul>${rows.map(r =>
    `<li><a href="${ROOM_BASE}${r.href}"${AWAY} data-room="${r.room}"><b>${esc(r.name)}</b><span${r.line ? '' : ' class="none"'}>${esc(r.line || r.none)}</span>${chev}</a></li>`).join('')}</ul>${medals}</section>`;
}
const progressSaid = c => (c.need === 1 ? 'not yet' : `${c.have.toLocaleString('en-US')} of ${c.need.toLocaleString('en-US')}`);

// ---------- Duty ----------

// What brings an officer back each day (js/duty.js): the order of the day, what is new today in every room, the days
// served, the rank and the commendations. Worked out each time the log is drawn, from the date and every room's
// record; what has been earned is kept in the bridge's save, so it stays earned.
let duty = null;
function dutyNow() {
  const today = dayOf(Date.now());
  const r = logRecords(state.log, recordOpts()), charted = chartedSaid(r.charted);
  const maru = records.maru || {}, contact = records.contact || {};
  const seen = new Set([...(Array.isArray(maru.seen) ? maru.seen : []), ...(Array.isArray(maru.runs) ? maru.runs.map(x => x?.title) : [])].filter(t => typeof t === 'string' && t));
  const f = {
    stars: new Set(state.log.filter(e => e.star !== 0).map(e => e.star)).size,
    rooms: roomsOnRecord(records),
    maru: Math.max(Number.isInteger(maru.taken) ? maru.taken : 0, Array.isArray(maru.runs) ? maru.runs.length : 0),
    charted: charted.n, chartedOf: charted.of,
    endings: Math.min(seen.size, 9),
    challenges: CHALLENGES.filter(seed => contact.challenges?.[seed]?.contact).length,
    rescued: Number.isInteger(records.distress?.rescued) ? records.distress.rescued : 0,
    farthest: r.farthest?.ly || 0,
    jars: Array.isArray(records.xeno?.jars) ? records.xeno.jars.length : 0,
    homeEarly: records.longway?.best > 0 && records.longway.best < 60,
  };
  const u = updateDuty(state.duty, { rec: records, log: state.log, supps, find: findStar, here: state.at, today, f });
  const order = orderOf(today), done = carriedOut(order, records, state.log, findStar, state.at);
  duty = { ...u, today, order, done: done.done || u.duty.orders.includes(today), report: reportOf(order, done.entry) };
  if (u.changed) { state.duty = u.duty; if (!stale) save(); }
}

// Today on the bridge, at the head of the log: Starfleet's order of the day, then what is new today in each room.
function todayHtml() {
  const d = duty;
  if (!d) return '';
  const o = d.order;
  const star = o.kind === 'star' ? findStar(o.star) : undefined;
  const go = d.done ? '' : star !== undefined && star !== state.at
    ? `<button class="text-button" type="button" data-course="${star}">Set course for ${esc(titleFor(cat, star))}</button>`
    : o.href ? `<a href="${ROOM_BASE}${o.href}"${AWAY}>${esc(o.go)}</a>` : '';
  const said = d.done ? `<p class="done"><b>Carried out.</b>${d.report ? ` ${esc(d.report)}` : ''}</p>` : '';
  const friend = (Array.isArray(records.contact?.friends) ? records.contact.friends : []).filter(x => x && !x.again && typeof x.people === 'string').pop()?.people || null;
  const landings = starHails(records.radio, Date.now(), starLy).filter(h => h.landed && dayOf(h.lands) === d.today);
  // A long mission's answer due today, from the light-time to her now (long missions works it out the same way).
  const answers = answersDue(records.missions, Date.now(), id => {
    const ship = shipById(id);
    if (!ship || ship.status === 'silent') return null;
    try { return readings(id, jdOf(new Date())).lightSeconds * 1000; } catch { return null; }
  }).map(a => ({ ...a, name: shipById(a.id).name }));
  const items = todayItems(records, d.today, { friend, landings, answers });
  const served = d.served.total ? `${d.served.total.toLocaleString('en-US')} ${d.served.total === 1 ? 'day' : 'days'} served${d.served.tour > 1 && d.served.tour < d.served.total ? ` · this tour, ${d.served.tour} days` : ''}${d.served.best > d.served.tour && d.served.best > 1 ? ` · longest tour, ${d.served.best} days` : ''}` : 'Your first day aboard';
  const promoted = d.duty.promoted === d.today && d.rank.n > 0 ? `<p class="news">Promoted today to ${esc(d.rank.name)}.</p>` : '';
  const medals = Object.entries(d.duty.medals).filter(([, day]) => day === d.today).map(([id]) => d.medals.earned.find(c => c.id === id)?.name).filter(Boolean);
  const commended = medals.length ? `<p class="news">Commended today: ${esc(medals.join(', '))}.</p>` : '';
  const chev = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  return `<section class="today" id="today" aria-labelledby="today-head">
    <h3 id="today-head">Today on the bridge<span>${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</span></h3>
    ${promoted}${commended}
    <div class="order${d.done ? ' is-done' : ''}" id="order"><p class="eyebrow">Orders from Starfleet</p><p class="says">${esc(o.says)}</p>${said}${go ? `<p class="go">${go}</p>` : ''}</div>
    <ul>${items.map(x => `<li${x.done ? ' class="done"' : ''}><a href="${ROOM_BASE}${x.href}"${AWAY} data-today="${esc(x.id)}"><b>${esc(x.name)}</b><span>${esc(x.line)}</span>${chev}</a></li>`).join('')}</ul>
    <p class="served" id="served"><b>${esc(d.rank.name)}</b> · ${esc(served)}</p>${serviceRecord(records).every(r => !r.line) && !state.log.length && d.rank.next
      ? `<p class="served next">Next, ${esc(d.rank.next)}: ${esc(d.rank.needs.join(', '))}.</p>` : ''}
  </section>`;
}

// The whole voyage in one sentence, at the head of the log: "Fourteen months out: nine stars, one new species, one
// failed exam." Counted from every room's record.
function storyHtml() {
  const line = story(records, { log: state.log, supps, clock: state.opts.clock });
  return line ? `<p class="story" id="story">${esc(line)}</p>` : '';
}

// The log under a heading for each day ("Wednesday 18 November · 6 arrivals"), each arrival with the time it was
// made beside its stardate: a day's arrivals used to carry one stardate between them, in one flat list. It opens on
// the newest 50 arrivals, and Show earlier adds 50 more.
// A search shows the arrivals that mention what is typed, under the days they were made, without the days' counts.
let shown = PAGE;
function daysHtml(q) {
  const all = timeline(state.log, supps, missionItems()).filter(x => matches(x, q));
  if (!all.length) return q ? `<p class="empty">Nothing in the log mentions “${esc(q)}”.</p>` : '';
  const counts = new Map(byDay(all).map(d => [d.key, d]));
  const now = Date.now();
  let html = byDay(newest(all, shown)).map(day => {
    const whole = counts.get(day.key);
    const head = day.key === 'undated' ? 'Undated' : dayHeading(day.t, q ? 0 : whole.arrivals, now);
    return `<h3 class="day">${esc(head)}</h3>${day.items.map(itemHtml).join('')}`;
  }).join('');
  html += moreHtml(all.filter(x => x.entry).length, 'Show earlier');
  return html;
}

const moreHtml = (n, words) => (n > shown ? `<button class="text-button more" type="button" data-more>${words} · ${Math.min(n - shown, PAGE)} more of ${n - shown}</button>` : '');

// By star: one row for each star in the log, the most recently visited first, with how many visits and when. A row
// opens on the newest entry for its star. A search keeps the stars any of whose entries mention it.
const dayMonth = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function starsHtml(q) {
  const rows = byStar(state.log).filter(r => !q || state.log.some(e => e.star === r.star && matches(e, q)));
  if (!rows.length) return `<p class="empty">Nothing in the log mentions “${esc(q)}”.</p>`;
  return rows.slice(0, shown).map(r => {
    const last = entryTime(r.last), first = entryTime(r.first);
    const when = [last && `Last ${dayMonth(last)}`, r.n > 1 && first && `first ${dayMonth(first)}`].filter(Boolean).join(' · ');
    return `
    <details class="past star" data-k="${state.log.indexOf(r.last)}">
      <summary><b>${esc(r.title)}</b><span class="sd">${r.n} ${r.n === 1 ? 'visit' : 'visits'}</span><span>${esc(when)}</span></summary>
      <div class="entry">${entryHtml(r.last, false)}</div>
    </details>`;
  }).join('') + moreHtml(rows.length, 'Show more');
}

// Print the log: every entry, oldest first, as a booklet in black on white, one entry to a block (css/app.css), which
// on a phone is also the way to save it as a PDF. It is laid out whenever the page is printed, from the button or
// from the browser's own menu, and let go afterwards.
function printLog() {
  records = readRecords();
  supps = supplementals(records, Date.now(), { lyOf: starLy });
  const days = byDay(timeline(state.log, supps, missionItems()).reverse());
  const n = new Set(state.log.map(e => e.star)).size;
  const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  $('print-log').innerHTML = `<h1>Captain’s log</h1><p class="print-sub">${state.ship ? `${esc(withRegistry(state.ship))} · ` : ''}${state.log.length
    ? `${n} ${n === 1 ? 'star' : 'stars'} visited · ${formatLy(state.ly)} travelled · printed ${printed}` : 'Nothing logged yet.'}</p>`
    + days.map(day => `<h2>${esc(day.key === 'undated' ? 'Undated' : dayHeading(day.t, day.arrivals))}</h2>${day.items.map(printedHtml).join('')}`).join('');
}

function printedHtml(x) {
  const { entry: e, t, supp } = x;
  if (x.mission) return `<article class="mission"><h3>Mission ${x.mission.n} complete</h3><p>${esc(missionSaid(x.n))} · ${esc(formatLy(x.n.ly))} · ${esc(shipTimeSaid(x.mission.years))} of ship time.</p></article>`;
  if (supp) return `<p class="supp">${esc(supp.text)}</p>`;
  const lines = e.sections.map(([label, text]) => `${label ? `<dt>${esc(label)}</dt>` : ''}<dd>${esc(text)}</dd>`).join('');
  const made = linesForVisit(contacts, e).map(line => `<dd>${esc(line)}</dd>`).join('');
  return `<article><h3>${esc(e.title)}</h3><span class="when">${t ? `${esc(clockTime(t))} · ` : ''}Stardate ${esc(e.stardate)}</span>`
    + `<p>${esc(e.intro)}</p><dl>${lines}${made}</dl></article>`;
}

// Show earlier: 50 more, and the keyboard's place on the first of them.
function showEarlier() {
  const first = shown;
  shown += PAGE;
  const top = $('entries').scrollTop;
  drawEntries();
  $('entries').scrollTop = top;
  $('entries').querySelectorAll('.past')[first]?.querySelector('summary').focus({ preventScroll: true });
}

// With the clock on, each mission that has closed has a summary in the log, over the arrival that closed it: its
// stars, light years and what the other rooms logged in it, and opened, its ship time, its dates and its records.
function missionItems() {
  if (!state.opts.clock) return [];
  const all = missions(state.log);
  return all.filter(m => m.closed).map(m => ({ t: (entryTime(m.last) ?? 0) + 0.5, mission: m, n: missionTally(m, all, supps) }));
}

function missionHtml({ mission: m, n }) {
  const r = logRecords([...m.entries].reverse(), recordOpts());
  const first = entryTime(m.entries[0]), last = entryTime(m.last);
  const rows = [
    ['Ship time', shipTimeSaid(m.years)],
    first && last && ['Logged', dayMonth(first) === dayMonth(last) ? dayMonth(last) : `${dayMonth(first)} to ${dayMonth(last)}`],
    ['Arrivals', String(m.entries.length)],
    r.farthest && ['Farthest from Sol', `${r.farthest.title} · ${formatLy(r.farthest.ly)}`],
    r.longest && ['Longest trip', `${formatLy(r.longest.ly)} to ${r.longest.title}`],
  ].filter(Boolean);
  return `
    <details class="mission-end">
      <summary><b>Mission ${m.n} complete</b><span>${esc(missionSaid(n))} · ${esc(formatLy(n.ly))}</span></summary>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </details>`;
}

// A supplemental line, from another room ("Supplemental: sat the Kobayashi Maru. The lifeboat, 150 home, C B B B."),
// leads to what it is about there.
function itemHtml(x) {
  const { entry: e, k, t, supp } = x;
  if (x.mission) return missionHtml(x);
  if (supp) return `<p class="supp"><a href="${ROOM_BASE}${supp.href}"${AWAY}>${esc(supp.text)}</a></p>`;
  return `
    <details class="past" data-k="${k}">
      <summary><b>${esc(e.title)}</b><span class="sd">${t ? esc(clockTime(t)) : ''}<small>${esc(e.stardate)}</small></span><span>${esc(e.intro)}</span></summary>
      <div class="entry">${entryHtml(e, false)}</div>
    </details>`;
}

// The log's records, at the head of the entries (they scroll away with them, so a phone on its side keeps room for
// the log itself): all worked out from the entries, so there is nothing more to keep.
let chartedStars = null;
// What logRecords and arrivalFirsts need to know of the catalogue.
function recordOpts() {
  chartedStars ||= DESTINATIONS.filter(d => d.star !== 'Sol').map(d => cat.byName.get(d.star)).filter(i => i !== undefined);
  return { lyFromSol: i => (cat.unmeasured[i] ? null : Math.hypot(...starPos(i)) * LY_PER_PC), charted: chartedStars };
}

function recordsHtml() {
  if (!state.log.length) return '';
  const r = logRecords(state.log, recordOpts());
  const charted = chartedSaid(r.charted);
  const rows = [
    r.farthest && ['Farthest from Sol', `${r.farthest.title} · ${formatLy(r.farthest.ly)}`],
    r.longest && ['Longest trip', `${formatLy(r.longest.ly)} to ${r.longest.title}`],
    r.most && ['Most visited', `${r.most.title} · ${r.most.n} visits`],
    ['Charted destinations', `${charted.n} of ${charted.of}`],
  ].filter(Boolean);
  return `<dl class="records" id="records">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}${kindsHtml()}</dl>`;
}

// One more record, across the foot of the others: which of the seven classes of star the log has been to, the
// letters lit as they are visited, and under them the rare kinds once one has been seen.
function kindsHtml() {
  const k = starKinds(state.log, i => cat.spect[i]);
  const said = `Visited: ${k.letters.filter(l => l[1]).map(l => l[0]).join(', ') || 'none'}. Not yet: ${k.letters.filter(l => !l[1]).map(l => l[0]).join(', ') || 'none'}.`;
  return `<div class="kinds"><dt>Kinds of star</dt><dd>${k.n} of ${k.of} `
    + `<span class="letters" role="img" aria-label="${said}">${k.letters.map(([l, on]) => `<b${on ? ' class="on"' : ''}>${l}</b>`).join('')}</span>`
    + `${k.rare.length ? `<span class="rare">Rare kinds: ${esc(k.rare.join(', '))}</span>` : ''}</dd></div>`;
}

let searchIndex = null, letters = null;
const starIndex = () => (searchIndex ||= buildIndex(cat.names, cat.constellations));
const magFromEarth = i => apparentMag(cat.absmag[i], Math.max(Math.hypot(...starPos(i)), 1e-6));
// The line under a star's name: what else it's called, where Starfleet's charts put it, its kind. A row of the list
// shows the charts' name as a badge beside the star's instead.
function metaFor(i, charts = true) {
  const n = notesFor(cat, i);
  const kind = shortKind(n ? n.kind : describeKind(cat.spect[i], cat.temp[i], cat.unmeasured[i] ? null : cat.absmag[i]));
  return [n?.aka, charts && chartTag(cat.names[i]), kind].filter(Boolean).join(' · ');
}

function renderList() {
  const q = $('search').value.trim();
  const cam = camAbs();
  const visited = new Set(state.log.map(e => e.star));
  letters ||= pairLetters(cat.names, cat.absmag);
  const row = (i, meta) => {
    const n = notesFor(cat, i);
    const here = i === state.at;
    // A star of the system the ship is in says so: its distance on the charts is often none at all.
    const badges = [n?.worlds ? 'planets' : '', visited.has(i) ? 'visited' : '', !here && companions(cat, state.at, i) ? 'companion' : ''].filter(Boolean).join(' · ');
    // Two stars with one name (the pair of 61 Cygni) are told apart by a letter, here in the list only.
    const title = titleFor(cat, i) + (letters.has(i) ? ` ${letters.get(i)}` : '');
    const tag = chartTag(cat.names[i]);
    return `<button class="row${here ? ' here' : ''}" type="button" data-star="${i}" ${here ? 'disabled' : ''}>
      <span class="name">${esc(title)}${tag ? `<span class="badge chart">${esc(tag)}</span>` : ''}${badges ? `<span class="badge">${badges}</span>` : ''}</span>
      <span class="dist${nominal(i) && !here ? ' unmeasured' : ''}">${here ? 'You’re here' : nominal(i) ? 'distance not measured' : formatLy(cat.distanceFrom(i, cam) * LY_PER_PC)}</span>
      <span class="meta">${esc(meta)}</span></button>`;
  };
  let html = '', said;
  if (!q) {
    html += voyagesHtml();
    // Away from home, what is near the ship comes first: the stars with notes are nearly all the Sun's neighbours.
    // Not at a star nobody has measured the distance to: the ship is at a nominal place there, nothing can be said
    // to be near it, and the five rows under this heading each read "distance not measured".
    if (state.at !== 0 && !cat.unmeasured[state.at]) {
      html += '<p class="group">Nearest to the ship</p>'
        + nearestStars(cat, starPos(state.at), 5, state.at).map(({ star }) => row(star, star === 0 ? 'The Sun · Earth orbit' : metaFor(star, false))).join('');
    }
    html += `<p class="group">Home</p>${row(0, 'The Sun · Earth orbit')}`;
    for (const [group, title, away] of GROUPS) {
      const stars = DESTINATIONS.filter(d => d.group === group).map(d => cat.byName.get(d.star)).filter(i => i !== undefined);
      stars.sort((a, b) => cat.distanceFrom(a, cam) - cat.distanceFrom(b, cam));
      html += `<p class="group">${state.at !== 0 && away ? away : title}</p>` + stars.map(i => row(i, metaFor(i, false))).join('');
    }
    html += radioRow('Subspace radio: which stars are hearing Earth tonight', '');
  } else if ((said = askComputer(q))) {
    // A question for the ship's computer: its answer in a line, then the stars to tap.
    html = `<p class="computer" role="status">${esc(said.line)}</p>` + said.stars.map(i => row(i, i === 0 ? 'The Sun · Earth orbit' : metaFor(i, false))).join('');
  } else {
    html = search(starIndex(), q, magFromEarth).map(i => row(i, metaFor(i, false))).join('');
    // A year finds the stars its light is reaching now, after any star with that number in its name: from each of
    // them the log dates Earth's old light to that year.
    const now = Number(stardate()), year = yearAsked(q, now);
    if (year) {
      const lit = litBy(year, now, cat.count, i => (cat.unmeasured[i] ? null : Math.hypot(...starPos(i)) * LY_PER_PC), magFromEarth);
      html += lit.length
        ? `<p class="group">Light that left Earth in ${year} is arriving about now at</p>` + lit.map(i => row(i, metaFor(i, false))).join('')
        : `<p class="empty">Light that left Earth in ${year} hasn’t reached another star yet.</p>`;
      if (year >= 1936 && lit.length) html += radioRow(`Subspace radio: the stars hearing ${year}’s broadcasts`, `#year=${year}`);
    }
    html ||= '<p class="empty">No star by that name in the catalogue.</p>';
  }
  $('list').innerHTML = html;
}

// A way from Set course to subspace radio, at the foot of the list (until the bridge has a button for it).
const radioRow = (text, hash) => `<a class="to-room" href="${RADIO}${hash}"${AWAY} data-room="radio">${esc(text)} <span aria-hidden="true">›</span></a>`;

// The ship's computer's answer to what is typed in Set course, or null for a name to look up.
function askComputer(q) {
  return ask(cat, q, {
    at: state.at, warp: state.warp, visited: new Set(state.log.map(e => e.star)),
    charted: recordOpts().charted, worlds: i => !!notesFor(cat, i)?.worlds,
    find: name => search(starIndex(), name, magFromEarth, 1)[0],
    view: viewFor(), // for "computer, report"
  });
}

// The voyages, at the top of Set course: each with its stops, how far they add up to from here and how long that is
// at the helm's warp. The one under way says which leg is next and counts only what is left; a flown one says so.
function voyagesHtml() {
  const done = flown(state.log), cam = camAbs(), guessed = !!cat.unmeasured[state.at];
  const rows = VOYAGES.map(v => {
    const on = state.voyage?.id === v.id;
    const leg = on ? state.voyage.leg : setOut(v, state.at, findStar).leg;
    // From a star nobody has measured the distance to, the ship's own place is a guess, and so is the first leg.
    const ly = guessed ? null : routeLength(v, leg, cam, findStar, starPos) * LY_PER_PC;
    const badge = on ? `leg ${leg + 1} of ${v.stops.length}` : done.has(v.id) ? 'flown' : '';
    // Each stop stays whole on its line, with the dot after it, so no line starts with one.
    const stops = v.stops.map((name, k) => {
      const i = findStar(name);
      return i === undefined ? '' : `<span${on && k < leg ? ' class="flown"' : ''}>${esc(titleFor(cat, i))}${k < v.stops.length - 1 ? ' ·' : ''}</span>`;
    }).filter(Boolean).join(' ');
    return `<button class="row voyage${on ? ' on' : ''}" type="button" data-voyage="${v.id}" title="${esc(v.line)}">
      <span class="name">${esc(v.name)}${badge ? `<span class="badge">${badge}</span>` : ''}</span>
      <span class="dist${guessed ? ' unmeasured' : ''}">${guessed ? 'distance not measured' : formatLy(ly)}</span>
      <span class="meta stops">${stops}</span>
      <span class="meta">${on ? 'The rest' : `${v.stops.length} stops`}${guessed ? '' : ` · ${formatDuration(tripYears(ly, state.warp))} at warp ${warpSaid(state.warp)}`}</span></button>`;
  }).join('');
  const leave = state.voyage ? `<button class="text-button leave-voyage" type="button" data-leave>Leave ${esc(voyageById(state.voyage.id).name)}</button>` : '';
  return `<p class="group">Voyages</p>${rows}${leave}`;
}

// A voyage taken from Set course: the helm is set for its next stop. One already under way carries on from there.
function startVoyage(id) {
  const v = voyageById(id);
  if (!v) return;
  if (state.voyage?.id !== id) state.voyage = setOut(v, state.at, findStar);
  const i = nextStop(state.voyage, findStar);
  sound.blip(990);
  $('search').blur();
  closeSheets();
  setTarget(i);
  if (i != null) say(`${v.name}. ${v.line} Leg ${state.voyage.leg + 1} of ${v.stops.length}: ${titleFor(cat, i)}.`);
}

function leaveVoyage() {
  state.voyage = null;
  save();
  showTarget();
  renderList();
  say('Voyage left. The course stays laid in.');
  $('search').focus({ preventScroll: true });
}

// ---------- Input ----------

function bind() {
  $('warp').addEventListener('input', () => { updateWarp(); save(); });
  $('engage').addEventListener('click', engage);
  $('choose').addEventListener('click', e => { $('search').value = ''; renderList(); openSheet('picker', e.currentTarget); $('list').scrollTop = 0; });
  $('search').addEventListener('input', renderList);
  const pick = b => {
    sound.blip(990);
    $('search').blur(); // a phone's keyboard goes away with it
    closeSheets();
    setTarget(Number(b.dataset.star));
  };
  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-star]');
    if (b) pick(b);
    const v = e.target.closest('[data-voyage]');
    if (v) startVoyage(v.dataset.voyage);
    if (e.target.closest('[data-leave]')) leaveVoyage();
  });
  // Enter, or Go on a phone's keyboard, takes the first star in the list.
  $('search').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const b = $('list').querySelector('[data-star]:not(:disabled)');
    if (b && $('search').value.trim()) { e.preventDefault(); pick(b); }
  });
  watchKeyboard();
  $('open-log').addEventListener('click', e => { renderLog(); openSheet('log', e.currentTarget); });
  $('log-print').addEventListener('click', () => { contacts = readContacts(); printLog(); print(); });
  addEventListener('beforeprint', () => { contacts = readContacts(); printLog(); });
  addEventListener('afterprint', () => { $('print-log').innerHTML = ''; });
  $('log-search').addEventListener('input', () => { shown = PAGE; drawEntries(); $('entries').scrollTop = 0; });
  for (const [id, to] of [['log-by-day', 'day'], ['log-by-star', 'star'], ['log-chart', 'chart']]) {
    $(id).addEventListener('click', () => { logView = to; shown = PAGE; drawEntries(); $('entries').scrollTop = 0; });
  }
  $('entries').addEventListener('click', e => {
    if (e.target.id === 'chart-map') pickOnChart(e);
    if (e.target.id === 'chart-save') saveChart(e.target);
  });
  addEventListener('resize', () => { if (logView === 'chart' && !$('log').hidden) paintChart(); });
  // Set course again, on an entry in the log, or for the star nearest to it, there and on the arrival's entry: the
  // sheet closes on the helm with that star chosen.
  for (const id of ['entries', 'arrival-entry']) {
    $(id).addEventListener('click', e => {
      if (e.target.closest('[data-more]')) { showEarlier(); return; }
      noteLeaving(id, e);
      const b = e.target.closest('[data-share]');
      if (b) shareCourse(b);
      const again = e.target.closest('[data-again], [data-course]');
      if (!again) return;
      sound.blip(990);
      closeSheets();
      setTarget(Number(again.dataset.again ?? again.dataset.course));
    });
  }
  $('open-settings').addEventListener('click', e => { openSheet('settings', e.currentTarget); showPhone(); });
  $('install').addEventListener('click', async () => {
    const asked = installAsk;
    if (!asked) return;
    installAsk = null; // the browser offers it once
    asked.prompt();
    try { await asked.userChoice; } catch { /* closed */ }
    showPhone();
  });
  $('look-home').addEventListener('click', lookHome);
  $('arrival-home').addEventListener('click', lookHome);
  bindEarthSky();
  bindAutopilot();
  // The log entry goes away as Set course opens, so focus comes back to the destination button instead.
  // On a voyage it sets course for the next leg instead, straight away.
  $('arrival-next').addEventListener('click', e => {
    const leg = e.currentTarget.dataset.leg;
    if (leg != null) { sound.blip(990); closeSheets(); setTarget(Number(leg)); return; }
    $('search').value = ''; renderList(); openSheet('picker', $('choose'));
  });
  $('scrim').addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  // A click made with Enter or Space has no count of presses; one made with a finger or a mouse does.
  $('intro-go').addEventListener('click', e => dismissIntro(e.detail > 0));
  // A room taken from the welcome card counts as the card read: back on the bridge, it isn't up again.
  $('intro-rooms').addEventListener('click', e => {
    if (!e.target.closest('a[href]')) return;
    state.seenIntro = true;
    save();
  });
  // Bridge settings can bring the welcome card back, with its list of rooms. Take the helm puts it away again.
  $('show-intro').addEventListener('click', () => {
    closeSheets();
    $('intro-course').hidden = true; // the course a link brought was laid in when the card first came up, not now
    $('intro').hidden = false;
    $('intro').scrollTop = 0;
    behind();
    $('intro-go').focus({ preventScroll: true });
  });
  for (const [id, key] of [['opt-lines', 'lines'], ['opt-labels', 'labels'], ['opt-clock', 'clock']]) {
    $(id).addEventListener('change', e => {
      state.opts[key] = e.target.checked;
      save();
      dirty = true;
      if (key === 'clock') { updateHud(); updateTrip(); }
    });
  }
  $('opt-night').addEventListener('change', e => setNight(e.target.checked));
  // Sound is every room's setting, not only the bridge's: the speaker in any room's header changes it too.
  $('opt-sound').addEventListener('change', e => setPref('sound', e.target.checked));
  $('report').addEventListener('click', () => setReporting(!reporting));
  $('opt-buzz').addEventListener('change', e => setPref('buzz', e.target.checked));
  $('opt-contrast').addEventListener('change', e => setPref('contrast', e.target.checked));
  $('text-size').addEventListener('click', e => { const b = e.target.closest('[data-text]'); if (b) setPref('text', b.dataset.text); });
  $('records-save').addEventListener('click', saveCopy);
  $('records-restore').addEventListener('click', () => $('records-file').click());
  $('records-file').addEventListener('change', e => readCopy(e.target));
  for (const id of ['records-add', 'records-replace']) $(id).addEventListener('click', e => restore(e.currentTarget));
  // Her name and registry are kept as they are typed, tidied (the field itself is tidied once it is left).
  const named = () => {
    const name = cleanName($('ship-name').value);
    state.ship = name ? { name, registry: cleanRegistry($('ship-registry').value) } : null;
    save();
    shipSaid();
  };
  for (const id of ['ship-name', 'ship-registry']) {
    $(id).addEventListener('input', named);
    $(id).addEventListener('change', () => { $('ship-name').value = state.ship?.name ?? ''; $('ship-registry').value = cleanRegistry($('ship-registry').value); });
  }
  // Two taps, asked on the button itself (the Artifact viewer refuses confirm dialogs).
  $('clear-log').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'Tap again to clear the log';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'Clear the log and return to Earth'; }, 4000);
      return;
    }
    delete b.dataset.armed;
    b.textContent = 'Clear the log and return to Earth';
    if (trip) { // a flight under way ends here too, back at Earth
      trip = null;
      stale = false;
      light(1);
      $('readout').hidden = true;
      helmAway(false);
      sound.stop();
    }
    turn = null;
    const keep = { opts: state.opts, seenIntro: true, warp: state.warp, ship: state.ship }; // a new log, the same ship
    Object.assign(state, defaults(), keep);
    sky.setOrigin(starPos(0));
    setTarget(null, false);
    updateHud();
    closeSheets();
    save();
    say('Log cleared. Back in Earth orbit.');
  });
  addEventListener('keydown', e => {
    if (e.key === 'Tab') keepTab(e);
    if (e.key === 'Escape') { if (!$('intro').hidden) dismissIntro(); else closeSheets(); }
    // The viewscreen's keys: the arrows look around, + and - zoom, / opens Set course. They work wherever the
    // keyboard is on the bridge, a button included (they used to stop as soon as anything had been clicked or
    // tabbed to, and nothing gave the sky the keyboard back), but not in a field or on the warp slider, which have
    // their own use for them, nor with a sheet up, nor in flight.
    if (e.ctrlKey || e.metaKey || e.altKey || $('bridge').inert || e.target.closest?.('input, select, textarea, .sheet')) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setReporting(!reporting); return; } // in flight too
    if (trip) return;
    const step = state.fov * 0.08;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const zooms = { '+': 1 / 1.25, '=': 1 / 1.25, '-': 1.25, _: 1.25 };
    if (moves[e.key]) {
      turn = null;
      state.yaw += moves[e.key][0];
      state.pitch = clampPitch(state.pitch + moves[e.key][1]);
      dirty = true;
    } else if (zooms[e.key]) setFov(state.fov * zooms[e.key]);
    else if (e.key === '/') $('choose').click();
    else if (e.key === 'f' || e.key === 'F') autopilot(true);
    else if (e.key === 'e' || e.key === 'E') { if (!$('engage').disabled) engage(); }
    else if (e.key === 'h' || e.key === 'H') lookHome();
    else if (e.key === 'l' || e.key === 'L') $('open-log').click();
    else if (e.key === '[' || e.key === ']') nudgeWarp(e.key === ']' ? 0.1 : -0.1);
    else if (e.key === 'n' || e.key === 'N') nextNamed(e.shiftKey ? -1 : 1);
    else return;
    e.preventDefault();
  });
  // Where the keys left the view is kept, as where a drag leaves it is.
  addEventListener('keyup', e => { if (/^Arrow|^[-+=_]$/.test(e.key) && !trip && !$('bridge').inert && !e.target.closest?.('input, select, textarea, .sheet')) save(); });
  // In Set course, the down arrow goes from the search field into the list and on through it, and the up arrow comes
  // back: it used to take a Tab for every star.
  $('picker').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...$('list').querySelectorAll('.row:not(:disabled)')];
    const i = rows.indexOf(document.activeElement);
    if (i < 0 && e.target !== $('search')) return;
    const to = e.key === 'ArrowDown' ? rows[i + 1] : i === 0 ? $('search') : rows[i - 1];
    if (to) { e.preventDefault(); to.focus(); }
  });
  addEventListener('resize', () => { dirty = true; });
  addEventListener('pagehide', leave);
  // Brought back whole by the browser's own Back, the sheet is still as it was left: the mark has nothing to do.
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    leaving = null;
    try { sessionStorage.removeItem(RETURN); } catch { /* no storage */ }
    // Left for a room from the welcome card: the card was read, and isn't up on the way back.
    if (state.seenIntro && !$('intro').hidden) { $('intro').hidden = true; behind(); }
  });
  still.addEventListener?.('change', () => { dirty = true; updateHud(); });

  // Drag to look around, pinch or scroll to zoom, tap to pick a star.
  const view = $('labels');
  const pts = new Map();
  let drag = null, pinch = null;
  view.addEventListener('pointerdown', e => {
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov }; drag = null; }
  });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || trip) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      setFov(pinch.fov * pinch.d / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1));
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    view.classList.add('dragging');
    turn = null;
    const radPerPx = 1 / (sky.focal(state.fov) / sky.dpr);
    state.yaw += (e.clientX - prev.x) * radPerPx;
    state.pitch = clampPitch(state.pitch + (e.clientY - prev.y) * radPerPx);
    dirty = true;
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    view.classList.remove('dragging');
    // Where a pinch leaves the zoom is kept, as where a drag leaves the view is.
    if (pts.size < 2 && pinch) { pinch = null; if (!trip) save(); }
    if (drag && !drag.moved && !trip && pts.size === 0) {
      const r = view.getBoundingClientRect();
      const i = sky.pick(e.clientX - r.left, e.clientY - r.top, 6.5 + Math.max(0, Math.log2(60 * DEG / state.fov)));
      if (i > 0 || (i === 0 && state.at !== 0)) {
        sound.blip(990);
        setTarget(i, false);
        if (state.target === i) say(`Destination: ${titleFor(cat, i)}, ${nominal(i) ? 'distance not measured' : lySaid(lyFromShip(i))}.`);
      }
    }
    if (drag?.moved) save();
    drag = null;
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  // And where the wheel leaves it, once it has been still for a moment.
  let wheeled = 0;
  view.addEventListener('wheel', e => {
    e.preventDefault();
    if (trip) return;
    setFov(state.fov * Math.exp(e.deltaY * 0.0012));
    clearTimeout(wheeled);
    wheeled = setTimeout(() => { if (!trip && viewMoved) save(); }, 400);
  }, { passive: false });
}

// A phone's keyboard covers the bottom of the screen without the page being resized (always on an iPhone, usually on
// Android), so a sheet standing on the bottom edge would be behind it. --kb is how much is covered; the Set course
// sheet stands that far up. Zoomed in, the visible part is smaller for another reason, so it's left alone.
function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const set = () => {
    // The window's height follows the browser's own bars as they come and go; a keyboard is what's left over.
    const covered = vv.scale > 1.05 ? 0 : innerHeight - vv.height - vv.offsetTop;
    document.documentElement.style.setProperty('--kb', `${covered > 80 ? Math.round(covered) : 0}px`);
    document.documentElement.classList.toggle('kb', covered > 80); // for the styles that only apply with a keyboard up
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
}

const clampPitch = p => Math.max(-89 * DEG, Math.min(89 * DEG, p));

let viewMoved = false; // the zoom has changed since the last save
function setFov(f) {
  state.fov = Math.max(2 * DEG, Math.min(100 * DEG, f));
  dirty = true;
  viewMoved = true;
}

// ---------- Keys ----------

// The bridge's rows on the Keys card (js/room.js adds the ones every room has).
const BRIDGE_KEYS = [
  ['← → ↑ ↓', 'Look around'], ['+ −', 'Zoom in or out'], ['/', 'Set course'], ['N', 'The next named star in view, as the destination'],
  ['E', 'Engage'], ['[ ]', 'Warp down or up a tenth'], ['H', 'Look toward the Sun'], ['L', 'Captain’s log'],
  ['R', 'Report: what is on the viewscreen'], ['F', 'Autopilot'],
];

// [ and ] move the warp slider a tenth, as its own arrow keys do.
function nudgeWarp(by) {
  const w = $('warp');
  w.value = String(Math.round((Number(w.value) + by) * 10) / 10);
  w.dispatchEvent(new Event('input', { bubbles: true }));
  w.dispatchEvent(new Event('change', { bubbles: true }));
}

// N steps the destination through the stars named on the viewscreen, brightest first, as a tap on each would (Shift+N
// goes back). The names are the ones drawn last frame, so it is what you see.
function nextNamed(by) {
  const cam = camAbs(), mag = i => apparentMag(cat.absmag[i], cat.distanceFrom(i, cam));
  const stars = [...new Set(drawn.filter(d => d.star != null && d.star !== state.at).map(d => d.star))].sort((a, b) => mag(a) - mag(b) || a - b);
  if (!stars.length) { say('No named star in view.'); return; }
  const at = stars.indexOf(state.target);
  const i = stars[at < 0 ? (by > 0 ? 0 : stars.length - 1) : (at + by + stars.length) % stars.length];
  sound.blip(990);
  setTarget(i, false);
  say(`Destination: ${titleFor(cat, i)}, ${nominal(i) ? 'distance not measured' : lySaid(lyFromShip(i))}.`);
}

// ---------- Hooks for tests and screenshots ----------

function hooks() {
  return {
    state, get trip() { return trip; }, cat: () => cat,
    speed(x) { speedUp = x; },
    find: name => cat.byName.get(name) ?? DESTINATIONS.find(d => d.title === name && cat.byName.get(d.star)),
    target(name) { setTarget(cat.byName.get(name)); },
    // Puts the ship at a star at once, as if it had flown there from where it was.
    jump(name, warp = state.warp) {
      const i = cat.byName.get(name);
      const from = camAbs(), S = starPos(i);
      const to = S.map((v, k) => v - from[k]), d = Math.hypot(...to), dir = to.map(v => v / d);
      trip = { i, S, dir, hold: holdFor(i, d), ly: d * LY_PER_PC, warpFactor: warp, fromTitle: state.at === 0 ? 'Sol' : inTextFor(cat, state.at), nominal: nominal(i), cam: from };
      arrive();
    },
    look(yawDeg, pitchDeg, fovDeg) { turn = null; state.yaw = yawDeg * DEG; state.pitch = pitchDeg * DEG; if (fovDeg) state.fov = fovDeg * DEG; dirty = true; },
    lookAtStar(name) { const i = cat.byName.get(name); lookAt(starPos(i), 1); },
    // Where a star is on the viewscreen, in CSS pixels, as last drawn.
    project: name => sky.project(cat.byName.get(name)),
    lookHome,
    // Starts a trip and holds it at fraction t of the cruise, for pictures of the ship at warp.
    freeze(name, t) {
      setTarget(cat.byName.get(name), false);
      engage();
      trip.frozen = trip.align + trip.spool + trip.cruise * t;
      fly(performance.now());
      state.yaw = trip.yaw1; state.pitch = trip.pitch1; state.fov = 60 * DEG;
    },
    redraw() { dirty = true; },
    labels: () => drawn,
    // The stars on the log's chart, where they were last drawn on it (CSS pixels from its top left).
    chartDots: () => chartDots.map(d => ({ ...d, name: cat.names[d.star] })),
    // Draws now and returns the viewscreen as an image (the drawing buffer is cleared once it's on screen).
    snapshot() { sky.render(viewNow(0)); return $('sky').toDataURL('image/png'); },
    // What the disc of a star that behaves was last drawn doing: { star, light, size, glow }, or null.
    get behave() { return sky.behave; },
    // The nebulae and clusters painted on the viewscreen in the last frame: { id, x, y, r } in CSS pixels.
    get sights() { return sky.drawn.map(d => ({ ...d })); },
    // Holds the disc of a star that behaves at one moment of its sped-up cycle (null lets it run): for pictures.
    holdBehave(seconds) { behaveClock = seconds; dirty = true; },
    closeSheets,
    earthSky,
    get earthHeld() { return earthHeld; },
    autopilot,
    get auto() { return !!auto; },
    // The stars autopilot chooses among once the voyages are done (catalogue indices), and those it has flown to this
    // time without writing them in the log, oldest first.
    autoStars: () => candidates().slice(),
    get autoSince() { return auto ? auto.since.slice() : null; },
  };
}

start();
