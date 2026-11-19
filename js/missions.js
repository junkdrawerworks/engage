// Long missions: where the Voyagers, New Horizons, Webb and the Pioneers are right now, on a map and in numbers,
// with a hail you can send and watch crawl out to them at the speed of light.
import { SHIPS, byId, hailSent, hailState, milestoneText, GOLDEN_RECORD, dishLine } from './ships.js';
import {
  AU_KM, LIGHT_DAY_AU, jdOf, dateOf, readings, trackUntil, planetAt, earthAt, semiMajor,
  jwstFromEarth, jwstSpan, jwstAroundL2, jwstTracked, moonAt, milestones,
} from './ephemeris.js';
import { warpSpeed, stardate, plural } from './physics.js';
import { shipDir, dishWatch, constellationIn } from './astro.js';
import { keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';
import { LIVE, share } from './share.js';

const KEY = 'engage.missions.v1';
// Where Engage itself is. The single-file copy points this at the live site.
const BRIDGE = './';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');

const saved = load();
let sel = byId(location.hash.slice(1)) ? location.hash.slice(1) : 'v1';
let view = byId(sel).near ? 'earth' : 'sun';
let lastText = 0;
let marks = null; // the selected ship's milestones: the next one, and a light-day mark just passed (see ephemeris.js)

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* no hails yet */ }
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  // Each hail is the moment it was sent; anything else in there is left out, and so is a moment still to come.
  const now = Date.now();
  const hails = s.hails && typeof s.hails === 'object' ? Object.fromEntries(Object.entries(s.hails).filter(([, t]) => hailSent(t, now))) : {};
  return { ...s, hails };
}
// Keeps the hails. When the browser won't take them, a line under Hail her says so: the page promises a hail will
// still be on its way tomorrow. Returns whether it worked.
let unsaved = '';
function save() {
  unsaved = keep(KEY, saved);
  $('hail-unsaved').hidden = !unsaved;
  $('hail-unsaved').textContent = unkept(unsaved, 'long missions', 'your hails');
  return !unsaved;
}

// ---------- Words for numbers ----------

const int = x => Math.round(x).toLocaleString('en-US');
const fmtDate = (d, opts = {}) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...opts });
// A moment, one way throughout the hail card: "today at 11:56 pm", or the day then the month, "19 Nov at 1:51 am",
// as the ship's file and the captain's log write dates. (It used to give a weekday for the next few days, a date for
// the rest and capitals for the hour, all three in one sentence.) The space before "am" doesn't break.
const fmtWhen = d => {
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/, '\u202f');
  if (d.toDateString() === new Date().toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`;
};
function lightTime(sec) {
  if (sec < 60) return `${sec.toFixed(1)} seconds`;
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec) % 60;
  const two = n => String(n).padStart(2, '0');
  return h ? `${h} h ${two(m)} m ${two(s)} s` : `${m} m ${two(s)} s`;
}
function shortSpan(sec) {
  if (sec < 1) return `${(sec * 1000).toFixed(0)} thousandths of a second`;
  if (sec < 90) return plural(Math.round(sec), 'second');
  if (sec < 5400) return plural(Math.round(sec / 60), 'minute');
  if (sec < 172800) return plural(Math.round(sec / 3600), 'hour');
  return plural(Math.round(sec / 86400), 'day');
}
function missionAge(launch, now) {
  let y = now.getUTCFullYear() - launch.getUTCFullYear();
  const anniversary = new Date(launch); anniversary.setUTCFullYear(launch.getUTCFullYear() + y);
  if (anniversary > now) { y--; anniversary.setUTCFullYear(launch.getUTCFullYear() + y); }
  const d = Math.floor((now - anniversary) / 864e5);
  return y ? `${plural(y, 'year')}, ${plural(d, 'day')}` : plural(d, 'day');
}

// ---------- The fleet ----------

function buildFleet() {
  $('fleet').innerHTML = SHIPS.map(s => `
    <button type="button" role="tab" class="ship-tab${s.status === 'silent' ? ' silent' : ''}" data-id="${s.id}" style="--c:${s.color}">
      <i aria-hidden="true"></i><span class="t-name">${esc(s.name)}</span><span class="t-sub" data-sub="${s.id}"></span>
    </button>`).join('');
  $('fleet').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) choose(b.dataset.id);
  });
}

function choose(id, fromMap = false) {
  sel = id;
  const ship = byId(id);
  view = ship.near ? 'earth' : 'sun';
  history.replaceState(null, '', '#' + id);
  document.title = `${ship.name} · Long missions · Engage`;
  for (const b of $('fleet').children) b.setAttribute('aria-selected', String(b.dataset.id === id));
  if (!fromMap) $('fleet').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: still.matches ? 'auto' : 'smooth' });
  fillFile(ship);
  setView(view);
  tick(true);
}

function fillFile(ship) {
  document.body.style.setProperty('--ship', ship.color);
  $('ship-agency').textContent = `${ship.agency} · ${ship.status === 'silent' ? 'Out of contact' : 'On mission'}`;
  $('ship-name').textContent = ship.full || ship.name;
  $('ship-tagline').textContent = ship.tagline;
  $('ship-where').textContent = ship.where;
  $('ship-now').textContent = ship.now;
  $('ship-log').innerHTML = ship.log.map(([d, t]) =>
    `<li><time datetime="${d}">${esc(fmtDate(new Date(d + 'T12:00:00Z'), { timeZone: 'UTC' }))}</time><span>${esc(t)}</span></li>`).join('');
  $('ship-bound').textContent = ship.bound.text;
  const course = $('ship-course');
  course.hidden = !ship.bound.star;
  if (ship.bound.star) {
    course.href = `${BRIDGE}?course=${encodeURIComponent(ship.bound.star)}`;
    course.textContent = `Set course for ${ship.bound.star} →`;
    if (BRIDGE.startsWith('http')) { course.target = '_blank'; course.rel = 'noopener'; }
  }
  // Voyager 1 is a rung on the warp scale: the race there puts numbers beside "at warp 9 you'd catch her".
  const race = $('ship-race');
  race.hidden = ship.id !== 'v1';
  race.href = `${BRIDGE}warp.html?warp=9#voyager`;
  if (BRIDGE.startsWith('http')) { race.target = '_blank'; race.rel = 'noopener'; }
  if (BRIDGE.startsWith('http')) { $('sky-link').target = '_blank'; $('sky-link').rel = 'noopener'; }
  $('ship-record').textContent = ship.record || '';
  $('ship-record').hidden = !ship.record;
  $('golden').hidden = !ship.golden;
  $('launched').textContent = `since launch on ${fmtDate(new Date(ship.launched + 'T12:00:00Z'), { timeZone: 'UTC' })}`;
  marks = ship.near ? null : milestones(ship.id, jdOf(Date.now()));
}

// The Golden Record's panel, the same on both Voyagers: what NASA lists on it, in three lists that open one at a time.
function buildGolden() {
  const g = GOLDEN_RECORD;
  $('golden-about').textContent = `A 12-inch gold-plated copper disc, made for whoever finds her: greetings in ${g.greetings.length} languages, the sounds of Earth from surf, wind and thunder to birds and whales, ${g.music.length} pieces of music and ${g.pictures} pictures, with printed messages from President Carter and UN Secretary-General Kurt Waldheim. It plays at 16⅔ turns a minute, and a cartridge and needle travel with it. The cover shows how to play it and where the Sun is among 14 pulsars, and carries a speck of uranium-238 as a clock: half of it decays in 4.51 billion years.`;
  $('golden-greetings-title').textContent = `Greetings in ${g.greetings.length} languages`;
  $('golden-greetings').innerHTML = g.greetings.map(([lang, words]) => `<li><b>${esc(lang)}</b> “${esc(words)}”</li>`).join('');
  $('golden-music-title').textContent = `${g.music.length} pieces of music`;
  $('golden-music').innerHTML = g.music.map(([from, piece, by, len]) => `<li><b>${esc(piece)}</b><small>${esc(from)} · ${esc(by)} · ${esc(len)}</small></li>`).join('');
  $('golden-pictures-title').textContent = `${g.pictures} pictures`;
  $('golden-pictures').textContent = `Sent as sound, to be drawn line by line. The first is a circle, so whoever plays it can check they have the picture’s shape right. Among the rest: ${g.somePictures.join(', ')}.`;
}

// How long ago a date was, by the calendar: today, yesterday, 12 days ago.
function daysAgo(then, now) {
  const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((day(now) - day(then)) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${plural(n, 'day')} ago`;
}

// ---------- Hailing ----------

// Sends a hail, unless one is still out or its answer still due: then the button only replays the sweep along the
// line, and the hail already crossing keeps the time it left.
function hail() {
  const now = Date.now();
  const ship = byId(sel);
  const state = hailState(saved.hails[sel], readings(sel, jdOf(now)).lightSeconds * 1000, now, ship.status === 'silent');
  if (state === 'idle' || state === 'done') {
    saved.hails[sel] = now;
    save();
  }
  pulses.push({ id: sel, t: performance.now() });
  tick(true);
  // What the hail did, read out once. The note under the button is not itself read as it changes: while a hail is
  // on its way, its "0.004% of the way there" moves on every second, for hours.
  const said = $('hail-note').textContent;
  $('hail-said').textContent = $('hail-said').textContent === said ? `${said}\u00a0` : said;
}

// A link to the ship's file, with how far she is and how long a signal takes at this moment, as the file has them.
function shareShip(button) {
  const ship = byId(sel);
  return share(button, {
    title: `${ship.name}, from Engage’s long missions`,
    text: `${ship.name} is ${$('earth-km').textContent} from Earth right now, and a signal takes ${$('signal').textContent} to reach her, one way.`,
    url: `${LIVE}missions.html#${sel}`,
  });
}

function hailLabel(ship, state) {
  if (state === 'outbound') return 'Hail on its way';
  if (state === 'inbound') return 'Waiting for her answer';
  if (state === 'done') return 'Hail her again';
  return ship.status === 'silent' ? 'Hail her anyway' : 'Hail her';
}

function hailText(ship, r, nowMs) {
  const sent = hailSent(saved.hails[ship.id], nowMs - 60000); // one the clock has since gone back behind was never sent
  const lt = r.lightSeconds * 1000;
  if (!sent || nowMs - sent > 2 * lt + 864e5) {
    if (ship.status === 'silent') return `She can’t answer: her last signal reached Earth on ${fmtDate(new Date(ship.silentSince + 'T12:00:00Z'), { timeZone: 'UTC' })}. A hail sent now would still find her in ${lightTime(r.lightSeconds)}.`;
    return `A hail sent now reaches her ${lt < 6e4 ? `in ${shortSpan(lt / 1000)}` : fmtWhen(new Date(nowMs + lt))}. The soonest her answer could get back is ${lt < 6e4 ? `${shortSpan(2 * lt / 1000)} after you sent it` : fmtWhen(new Date(nowMs + 2 * lt))}.`;
  }
  const arrive = sent + lt, back = sent + 2 * lt;
  const sentText = fmtWhen(new Date(sent));
  if (nowMs < arrive) {
    const pct = (nowMs - sent) / lt * 100;
    return `Your hail, sent ${sentText}, is ${pct < 1 ? pct.toFixed(3) : pct < 10 ? pct.toFixed(1) : Math.floor(pct)}% of the way there. It reaches her ${lt < 6e4 ? `in ${shortSpan((arrive - nowMs) / 1000)}` : fmtWhen(new Date(arrive))}.`;
  }
  if (ship.status === 'silent') return `Your hail, sent ${sentText}, reached her ${lt < 6e4 ? 'already' : fmtWhen(new Date(arrive))}. Nothing came back: she has no power left to answer.`;
  if (nowMs < back) return `Your hail reached her ${lt < 6e4 ? 'already' : fmtWhen(new Date(arrive))}. If she answered at once, the reply lands ${lt < 6e4 ? `in ${shortSpan((back - nowMs) / 1000)}` : fmtWhen(new Date(back))}.`;
  return `Your hail, sent ${sentText}, reached her ${fmtWhen(new Date(arrive))}, and an answer could have been back ${fmtWhen(new Date(back))}. That’s how long every question to her takes.`;
}

// ---------- Where she is in the sky ----------

// The constellation a ship is in, by the IAU boundaries in the star catalogue's file, fetched once (the offline copy
// keeps it). Until it is in, or if it never comes, the row stays hidden.
let skyMeta = null;
async function loadBounds() {
  try {
    skyMeta = await fetch('data/stars.json').then(r => r.json());
    tick(true);
  } catch { /* no catalogue here: the row stays hidden */ }
}
const skyCache = new Map(); // ship and day -> constellation: she takes years to cross one
function constellationOf(id, jd) {
  const key = `${id}:${Math.floor(jd)}`;
  if (!skyCache.has(key)) skyCache.set(key, constellationIn(skyMeta, shipDir(id, jd)));
  return skyCache.get(key);
}
// Which of the Deep Space Network's dishes could hear her: worked out again each minute, not ten times a second.
let dishes = { key: '', text: '' };
function dishText(ship, nowMs) {
  const key = `${ship.id}:${Math.floor(nowMs / 60000)}`;
  if (dishes.key !== key) {
    const watch = dishWatch(ship.id, new Date(nowMs));
    dishes = { key, text: dishLine(watch, { silent: ship.status === 'silent', south: shipDir(ship.id, jdOf(nowMs))[2] < 0, fmt: fmtWhen }) };
  }
  return dishes.text;
}

// ---------- Numbers on the file ----------

function tick(force = false) {
  const nowMs = Date.now();
  if (!force && nowMs - lastText < 100) return;
  lastText = nowMs;
  const jd = jdOf(nowMs);
  $('clock').textContent = `Stardate ${stardate(new Date(nowMs))}`;
  const ship = byId(sel);
  const r = readings(sel, jd);
  // Webb's loop round L2 is charted for October 2026 to December 2027. On any other date she is somewhere on it, so
  // her file gives round figures for the L2 point and says so, and not a place to the kilometre.
  const adrift = ship.near && !jwstTracked(jd);
  const round = km => `about ${int(Math.round(km / 1e5) * 1e5)} km`;
  $('sun-km').textContent = adrift ? round(r.sunAU * AU_KM) : `${int(r.sunAU * AU_KM)} km`;
  $('sun-au').textContent = adrift ? `${r.sunAU.toFixed(2)} AU` : `${r.sunAU.toFixed(r.sunAU < 2 ? 4 : 3)} AU`;
  const earthKm = r.earthAU * AU_KM;
  $('earth-km').textContent = adrift ? round(earthKm) : `${int(earthKm)} km`;
  $('earth-au').textContent = adrift ? 'the L2 point. Her loop round it isn’t charted for this date: she is 1.2 to 1.8 million km out'
    : ship.near ? `${(earthKm / 384400).toFixed(2)} times as far as the Moon` : `${r.earthAU.toFixed(3)} AU`;
  if (ship.near) {
    $('speed').textContent = `${r.speedKmS.toFixed(1)} km/s`;
    $('speed-h').textContent = adrift ? 'round the Sun with Earth' : `round the Sun with Earth, and ${jwstAroundL2(jd).toFixed(2)} km/s round L2`;
  } else {
    $('speed').textContent = `${r.speedKmS.toFixed(2)} km/s`;
    $('speed-h').textContent = `${int(Math.round(r.speedKmS * 36) * 100)} km/h, relative to the Sun`;
  }
  $('signal').textContent = adrift ? 'about 5 seconds' : lightTime(r.lightSeconds);
  $('signal-note').textContent = adrift ? 'one way, at the speed of light: 4 to 6 seconds, depending where she is on her loop' : 'one way, at the speed of light';
  $('dishes').textContent = dishText(ship, nowMs);
  $('sky-row').hidden = !skyMeta;
  if (skyMeta) {
    const con = constellationOf(sel, jd);
    $('sky-con').textContent = con || '';
    $('sky-note').textContent = `${con ? `the constellation she’s in. ` : ''}${ship.near ? 'Too faint to see by eye.' : 'Far too faint for any telescope to see.'}`;
    const href = `${BRIDGE}tonight.html#ship=${sel}`;
    if ($('sky-link').getAttribute('href') !== href) $('sky-link').href = href;
  }
  $('age').textContent = missionAge(new Date(ship.launched + 'T12:00:00Z'), new Date(nowMs));
  $('hail-note').textContent = hailText(ship, r, nowMs);
  const state = hailState(saved.hails[sel], r.lightSeconds * 1000, nowMs, ship.status === 'silent');
  if ($('hail').dataset.state !== `${sel}:${state}`) {
    $('hail').dataset.state = `${sel}:${state}`;
    $('hail').textContent = hailLabel(ship, state);
    $('hail').classList.toggle('waiting', state === 'outbound' || state === 'inbound');
  }

  // The round-number moments: the one coming, and a light-day mark gone by in the last two months. A page left open
  // past the next one works them out again.
  if (marks?.next && jd > marks.next.jd) marks = milestones(sel, jd);
  const n = $('next'), gone = $('passed');
  n.hidden = !marks?.next;
  gone.hidden = !marks?.passed;
  if (marks?.next) {
    const days = marks.next.jd - jd;
    const when = fmtDate(dateOf(marks.next.jd));
    n.innerHTML = `<b>Next milestone</b> ${esc(when)}${days < 400 ? ` (${days < 1 ? 'today' : `in ${plural(Math.ceil(days), 'day')}`})` : ''}: ${esc(milestoneText(ship, marks.next))}.`;
  }
  if (marks?.passed) {
    const then = dateOf(marks.passed.jd);
    gone.innerHTML = `<b>Just passed</b> ${esc(fmtDate(then))} (${daysAgo(then, new Date(nowMs))}): ${esc(milestoneText(ship, marks.passed, true))}.`;
  }

  const warp = $('ship-warp');
  const w9 = r.lightSeconds / warpSpeed(9);
  warp.textContent = ship.near
    ? `At full impulse, a quarter of light speed, you’d reach her from Earth in ${shortSpan(r.lightSeconds * 4)}.`
    : `At warp 9 you’d catch her in ${shortSpan(w9)}. She has been flying for ${missionAge(new Date(ship.launched + 'T12:00:00Z'), new Date(nowMs)).split(',')[0]}.`;

  for (const s of SHIPS) {
    const el = $('fleet').querySelector(`[data-sub="${s.id}"]`);
    if (!el) continue;
    const rs = s.id === sel ? r : readings(s.id, jd);
    el.textContent = s.near ? (jwstTracked(jd) ? `${(rs.earthAU * AU_KM / 1e6).toFixed(2)} million km` : 'about 1.5 million km') : `${rs.sunAU.toFixed(1)} AU`;
  }
}

// ---------- The map ----------

const canvas = $('map');
const ctx = canvas.getContext('2d');
const mapSeen = onScreen(canvas); // the map isn't drawn while it is scrolled out of sight; the numbers go on ticking
let draws = 0;                    // how many times it has been drawn, for tests
let W = 0, H = 0, DPR = 1;
const R_MIN = 0.6, R_MAX = 230; // AU at the centre and at the edge of the Solar System view
const NEAR_SPAN = 2.1e6; // km from Earth to the edge of the near-Earth view
const pulses = [];
let shipsOnMap = []; // where each ship was drawn, for tapping
let placed = []; // ship labels already on the map this frame, so the next one can step around them

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}

// Solar System view: distance from the Sun on a log scale, direction as seen from above the planets' plane.
function sunXY(p) {
  const d = Math.hypot(p[0], p[1], p[2]);
  const ang = Math.atan2(p[1], p[0]);
  const rr = radius(d);
  return [W / 2 + rr * Math.cos(ang), CY() - rr * Math.sin(ang)];
}
// The view buttons sit over the top of the map, so the Sun sits a little below the middle.
const TOP = 46;
const CY = () => (H + TOP) / 2;
const RMAP = () => Math.min(W, H - TOP) / 2 - 14;
function radius(d) {
  const R = RMAP();
  return R * Math.max(0, Math.log(Math.max(d, R_MIN) / R_MIN) / Math.log(R_MAX / R_MIN));
}

// Near-Earth view: km from Earth, turning with Earth so the Sun is always off to the left.
function nearFrame(jd) {
  const e = earthAt(jd);
  const a = Math.atan2(e[1], e[0]);
  return [Math.cos(a), Math.sin(a)];
}
function nearXY(p, frame) {
  const [c, s] = frame;
  const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c;
  const k = RMAP() / NEAR_SPAN;
  return [W / 2 - W * 0.12 + u * k, CY() - v * k];
}

function draw(now) {
  const nowMs = Date.now();
  const jd = jdOf(nowMs);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  shipsOnMap = [];
  placed = [];
  if (view === 'sun') drawSun(jd, now, nowMs); else drawNear(jd, now, nowMs);
}

function ring(r, style, dash = []) {
  ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = style; ctx.lineWidth = 1;
  ctx.arc(W / 2, CY(), r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
function label(text, x, y, color, align = 'left', size = 11) {
  ctx.font = `600 ${size}px 'Chakra Petch', 'Arial Narrow', sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4, 6, 11, 0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
// Where label() would put some text: { x0, x1, y0, y1 }.
function labelBox(text, x, y, align, size) {
  ctx.font = `600 ${size}px 'Chakra Petch', 'Arial Narrow', sans-serif`;
  const w = ctx.measureText(text).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  return { x0, x1: x0 + w, y0: y - size / 2, y1: y + size / 2 };
}
const nearLabels = { earth: null, moon: null }; // the names on the near-Earth map, for the tests
function ringLabel(text, r, color, a) {
  label(text, W / 2 + r * Math.cos(a), CY() + r * Math.sin(a), color, 'center', 10);
}

function drawSun(jd, now, nowMs) {
  // The Kuiper Belt and the rings.
  ctx.beginPath();
  ctx.arc(W / 2, CY(), radius(50), 0, Math.PI * 2); ctx.arc(W / 2, CY(), radius(30), 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(160, 190, 255, 0.05)'; ctx.fill();
  ringLabel('Kuiper Belt', radius(40), 'rgba(160, 180, 220, 0.5)', -Math.PI * 0.75);
  for (const p of ['earth', 'jupiter', 'saturn', 'uranus', 'neptune']) ring(radius(semiMajor(p)), 'rgba(140, 180, 255, 0.14)');
  ring(radius(121), 'rgba(255, 181, 74, 0.4)', [5, 5]);
  label('Edge of the Sun’s bubble', W / 2 - radius(121) + 4, CY() - 9, 'rgba(255, 181, 74, 0.75)', 'left', 10);
  ring(radius(LIGHT_DAY_AU), 'rgba(134, 216, 255, 0.35)', [1.5, 4]);
  ringLabel('One light-day from the Sun', radius(LIGHT_DAY_AU), 'rgba(134, 216, 255, 0.75)', -Math.PI * 0.27);

  // The Sun.
  const g = ctx.createRadialGradient(W / 2, CY(), 0, W / 2, CY(), 16);
  g.addColorStop(0, '#fff6dc'); g.addColorStop(0.3, '#ffd27a'); g.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, CY(), 16, 0, Math.PI * 2); ctx.fill();

  // The planets, where they are now.
  const names = { earth: 'Earth', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };
  for (const p of Object.keys(names)) {
    const [x, y] = sunXY(planetAt(p, jd));
    ctx.fillStyle = p === 'earth' ? '#7fb8ff' : '#c9d3e6';
    ctx.beginPath(); ctx.arc(x, y, p === 'earth' ? 3.2 : 2.6, 0, Math.PI * 2); ctx.fill();
    label(names[p], x + 6, y - 7, p === 'earth' ? '#9cc8ff' : 'rgba(201, 211, 230, 0.7)', 'left', 10);
  }

  // Where each ship has been, then where it is.
  const order = SHIPS.filter(s => !s.near).sort((a, b) => (a.id === sel) - (b.id === sel));
  for (const s of order) {
    const on = s.id === sel;
    const pts = trackUntil(s.id, jd);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i - 1] || pts[0], b = pts[i];
      for (let k = i ? 1 : 0; k <= 6; k++) {
        const t = k / 6, [x, y] = sunXY(a.map((v, j) => v + (b[j] - v) * t));
        if (i === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = on ? s.color : withAlpha(s.color, s.status === 'silent' ? 0.22 : 0.35);
    ctx.lineWidth = on ? 1.8 : 1.2;
    if (s.status === 'silent') ctx.setLineDash([3, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    const here = readings(s.id, jd).pos;
    const ahead = readings(s.id, jd + 3650).pos;
    const [x, y] = sunXY(here), [x2, y2] = sunXY(ahead);
    marker(s, x, y, Math.atan2(y2 - y, x2 - x), on, now);
    shipsOnMap.push({ id: s.id, x, y });
    shipLabel(s, x, y, on);
  }
  // Webb rides along with Earth at this scale.
  const webb = byId('jwst');
  const [ex, ey] = sunXY(readings('jwst', jd).pos);
  shipsOnMap.push({ id: 'jwst', x: ex, y: ey });
  ctx.fillStyle = webb.color; ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2); ctx.fill();

  drawHail(jd, now, nowMs, p => sunXY(p), earthAt(jd));
  $('scale').textContent = 'Seen from above the planets. Distance from the Sun is stretched so everything fits; dashed paths are ships that have gone silent.';
}

function drawNear(jd, now, nowMs) {
  const frame = nearFrame(jd);
  const [cx, cy] = nearXY([0, 0, 0], frame);
  const k = RMAP() / NEAR_SPAN;
  // Toward the Sun.
  ctx.strokeStyle = 'rgba(255, 210, 122, 0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx - 40, cy); ctx.lineTo(14, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, cy - 5); ctx.lineTo(13, cy); ctx.lineTo(20, cy + 5); ctx.stroke();
  label('To the Sun', 14, cy + 14, 'rgba(255, 210, 122, 0.85)', 'left', 10);
  // The Moon's orbit and the Moon.
  ctx.beginPath(); ctx.arc(cx, cy, 384400 * k, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(140, 180, 255, 0.18)'; ctx.stroke();
  const [mx, my] = nearXY(moonAt(jd), frame);
  ctx.fillStyle = '#c9d3e6'; ctx.beginPath(); ctx.arc(mx, my, 2.6, 0, Math.PI * 2); ctx.fill();
  // Earth.
  ctx.fillStyle = '#7fb8ff'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  label('Earth', cx, cy + 16, '#9cc8ff', 'center', 11);
  nearLabels.earth = labelBox('Earth', cx, cy + 16, 'center', 11);
  // The Moon's name goes on the side away from Earth, so it never lands on Earth's.
  const out = Math.atan2(my - cy, mx - cx), side = Math.cos(out) >= 0 ? 'left' : 'right';
  const moonName = labelBox('Moon', mx + Math.cos(out) * 9, my + Math.sin(out) * 9, side, 10);
  const clash = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  nearLabels.moon = clash(moonName, nearLabels.earth) ? null : moonName;
  if (nearLabels.moon) label('Moon', mx + Math.cos(out) * 9, my + Math.sin(out) * 9, 'rgba(201, 211, 230, 0.75)', side, 10);
  // L2.
  const lx = cx + 1.5e6 * k;
  ctx.strokeStyle = 'rgba(255, 181, 74, 0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lx - 5, cy - 5); ctx.lineTo(lx + 5, cy + 5); ctx.moveTo(lx + 5, cy - 5); ctx.lineTo(lx - 5, cy + 5); ctx.stroke();
  label('L2', lx, cy + 15, 'rgba(255, 181, 74, 0.85)', 'center', 10);

  // Webb's loop around L2: the next three months solid, the past three faint, each point turned to Earth's frame then.
  // On a date the loop isn't charted for, there is no loop to draw: she is marked at L2 itself, and the note says why.
  const webb = byId('jwst');
  const [t0, t1] = jwstSpan();
  const charted = jwstTracked(jd);
  for (const [from, to, alpha] of charted ? [[t0, t1, 0.25], [jd, jd + 90, 0.8]] : []) {
    ctx.beginPath();
    let first = true;
    for (let t = Math.max(from, t0); t <= Math.min(to, t1); t += 1) {
      const [x, y] = nearXY(jwstFromEarth(t), nearFrame(t));
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(webb.color, alpha); ctx.lineWidth = 1.4;
    if (alpha < 0.5) ctx.setLineDash([3, 3]);
    ctx.stroke(); ctx.setLineDash([]);
  }
  const [wx, wy] = nearXY(jwstFromEarth(jd), frame);
  const [ax, ay] = nearXY(jwstFromEarth(jd + 3), nearFrame(jd + 3));
  marker(webb, wx, wy, charted ? Math.atan2(ay - wy, ax - wx) : -Math.PI / 2, sel === 'jwst', now);
  shipsOnMap.push({ id: 'jwst', x: wx, y: wy });
  label('James Webb', wx + 10, wy - 12, webb.color, 'left', 12);

  drawHail(jd, now, nowMs, p => nearXY(p, frame), [0, 0, 0], true);
  $('scale').textContent = charted
    ? 'Seen from above, turning with Earth so the Sun stays to the left. The bright line is where Webb goes in the next three months. The other ships are billions of km off the map.'
    : 'Seen from above, turning with Earth so the Sun stays to the left. Webb’s loop round L2 is charted here for October 2026 to December 2027 only, so for this date she is marked at L2 itself: she is really up to 800,000 km from it. The other ships are billions of km off the map.';
}

// A ship's name beside it, nudged up or down until it clears the names already drawn.
function shipLabel(s, x, y, on) {
  const size = on ? 12 : 11;
  ctx.font = `600 ${size}px 'Chakra Petch', 'Arial Narrow', sans-serif`;
  const w = ctx.measureText(s.name).width + 4, left = x < W / 2;
  const lx = left ? x - 10 : x + 10, x0 = left ? lx - w : lx;
  let ly = y + (y < CY() ? -11 : 12);
  const step = y < CY() ? -14 : 14;
  for (let k = 0; k < 6 && placed.some(r => x0 < r.x1 && x0 + w > r.x0 && Math.abs(ly - r.y) < 13); k++) ly += step;
  placed.push({ x0, x1: x0 + w, y: ly });
  label(s.name, lx, ly, on ? s.color : withAlpha(s.color, 0.75), left ? 'right' : 'left', size);
}

// A ship: a little arrowhead pointing the way it's going, ringed when it's the one on file.
function marker(s, x, y, dir, on, now) {
  const silent = s.status === 'silent';
  if (on && !silent && !still.matches) {
    const t = (now / 2400) % 1;
    ctx.beginPath(); ctx.arc(x, y, 6 + t * 16, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(s.color, 0.5 * (1 - t)); ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, -4.5); ctx.closePath();
  ctx.fillStyle = silent ? withAlpha(s.color, on ? 0.9 : 0.6) : s.color;
  ctx.shadowColor = s.color; ctx.shadowBlur = silent ? 0 : on ? 10 : 5;
  ctx.fill();
  ctx.restore();
  if (on) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.strokeStyle = withAlpha(s.color, 0.7); ctx.lineWidth = 1; ctx.stroke(); }
}

// A hail on its way: a bright dot crawling from Earth to the ship, and back again for the answer. The real trip takes
// hours, so a fresh hail also gets a quick sweep along the same line to show which way it went.
function drawHail(jd, now, nowMs, toXY, earthPos, near = false) {
  const ship = byId(sel);
  const sent = saved.hails[sel];
  const shipPos = near ? jwstFromEarth(jd) : readings(sel, jd).pos;
  const [ex, ey] = toXY(earthPos), [sx, sy] = toXY(shipPos);
  const along = (f, color, size) => {
    const x = ex + (sx - ex) * f, y = ey + (sy - ey) * f;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  };
  if (sent) {
    const lt = readings(sel, jd).lightSeconds * 1000;
    const f = (nowMs - sent) / lt;
    if (f > 0 && f < 2 && ship.status !== 'silent' || f > 0 && f < 1) {
      ctx.strokeStyle = 'rgba(134, 216, 255, 0.25)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      along(f < 1 ? f : 2 - f, f < 1 ? '#86d8ff' : '#6fe3a4', 3);
    }
  }
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    const t = (now - p.t) / 1600;
    if (t > 1 || p.id !== sel) { pulses.splice(i, 1); continue; }
    if (still.matches) continue;
    along(t, `rgba(134, 216, 255, ${1 - t * 0.6})`, 2.2);
    ctx.beginPath(); ctx.arc(ex, ey, 4 + t * 26, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(134, 216, 255, ${0.6 * (1 - t)})`; ctx.lineWidth = 1.2; ctx.stroke();
  }
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function setView(v) {
  view = v;
  $('view-sun').setAttribute('aria-pressed', String(v === 'sun'));
  $('view-earth').setAttribute('aria-pressed', String(v === 'earth'));
}

// ---------- Running ----------

function frame(now) {
  if (mapSeen.on) { draw(now); draws++; }
  tick();
  requestAnimationFrame(frame);
}

function bind() {
  $('hail').addEventListener('click', hail);
  $('share-ship').addEventListener('click', e => shareShip(e.currentTarget));
  // A hail sent from another tab is on its way here too, and the next one sent here won't write over it.
  watch(KEY, () => { saved.hails = load().hails; tick(true); });
  $('view-sun').addEventListener('click', () => { setView('sun'); if (byId(sel).near) choose('v1'); });
  $('view-earth').addEventListener('click', () => { setView('earth'); if (!byId(sel).near) choose('jwst'); });
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bestD = 28;
    for (const s of shipsOnMap) { const d = Math.hypot(s.x - x, s.y - y); if (d < bestD) { best = s; bestD = d; } }
    if (best && best.id !== sel) choose(best.id, true);
  });
  addEventListener('resize', resize);
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (byId(id) && id !== sel) choose(id); });
}

buildFleet();
buildGolden();
loadBounds();
resize();
bind();
choose(sel);
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.missions = { get sel() { return sel; }, get view() { return view; }, get hails() { return saved.hails; }, readings, choose, nearLabels, get draws() { return draws; } };
