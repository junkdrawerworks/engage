// Tonight's sky: the real sky from where you're standing, with the stars Starfleet knows tagged on it.
// Hold the phone up and it follows where you point it (its compass and tilt sensors); without them, drag to look.
// Tap a tag to read it, then set course for it on the bridge.
import { loadCatalog, constellationLabels } from './catalog.js';
import { DESTINATIONS } from './destinations.js';
import { describeKind, inTextFor, titleFor } from './log.js';
import { CHARTS } from './charts.js';
import { LY_PER_PC, apparentMag, formatLy, formatYear, stardate } from './physics.js';
import {
  jdOf, frame, toLocal, altAz, fromAltAz, sunDir, planetSky, moonSky, moonPhaseName, whereToLook, limitingMag, nextDark,
  phonePose, SKIES, NAKED_EYE_PLANETS, CITIES, placeForZone, daylightNote, tonightPlan, planLines, showersOn, radiantDir,
} from './astro.js';
import { hold, release } from './wake.js';
import { keep, watch } from './store.js';
import { backCloses, swipeDown } from './sheets.js';
import { LIVE, share } from './share.js';
import { PLACES } from './warp-scale.js';
import { fileForHome, label as fileLabel } from './classes.js';
import { linesForStar, readContacts } from './contacts.js';
import { nowLine, variableFor } from './variables.js';

const KEY = 'engage.tonight.v1';
// Where Engage itself is. The single-file copy points this at the live site.
const BRIDGE = './';
const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;
const DARK_SKY = 6.5; // the faintest star ever drawn
const PLANET_NAMES = { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };

const saved = load();
const visits = loadVisits(); // star index -> { stardate, n }: where the bridge's log says the ship has been
const contacts = readContacts(); // the contacts first contact's record says were made, and at which star
let shipAt = loadAt();       // the star the ship is holding at now, read again each time a card opens
let cat, ctx, canvas;
let sky = null;          // everything worked out for the current place and moment
let view = { az: 180, alt: 35, fov: 80 * DEG };
let pose = null;         // where the phone is pointing, smoothed
let sensing = false, gotReading = false;
let compassOffset = null; // iPhones give alpha from wherever they started, and the compass separately
let offsetMin = 0;       // minutes ahead of now
let sel = null;          // { kind: 'star', i } | { kind: 'planet', name } | { kind: 'moon' } | { kind: 'sun' } | { kind: 'shower' }
let dirty = true, aimAnim = null, testNow = null;
let placed = [];         // where things were drawn last frame, for taps: { x, y, r, hit }

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* start afresh */ }
  if (!s || typeof s !== 'object') s = {};
  // Whatever doesn't make sense any more goes back to the start: the suburbs, and a place guessed again.
  const p = s.place;
  const placed = p && typeof p === 'object' && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  return {
    ...s,
    place: placed ? p : undefined,
    sky: Object.keys(SKIES).includes(s.sky) ? s.sky : 'suburb',
    trim: Number.isFinite(s.trim) ? s.trim : 0,
    night: !!s.night,
  };
}
// Night vision: the red light over everything (css/app.css), the button lit, and the browser's own bar dark red
// with it. The bridge wears it too, and can switch it from its settings: it is kept here, with the place.
function showNight() {
  document.body.classList.toggle('red', !!saved.night);
  $('night').setAttribute('aria-pressed', String(!!saved.night));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', saved.night ? '#0a0000' : '#05070d');
  dirty = true; // the sky is drawn in other colours under the red light
}

// The bridge's log, read once and never written: each star the ship has dropped out of warp at, with the stardate of
// the latest visit (the log keeps the newest entry first) and how many there have been. A missing or damaged save
// is no visits.
function loadVisits() {
  const seen = new Map();
  let log = null;
  try { log = JSON.parse(localStorage.getItem('engage.v1') || 'null')?.log; } catch { /* no log */ }
  if (!Array.isArray(log)) return seen;
  for (const e of log) {
    if (!e || !Number.isInteger(e.star) || e.star < 1) continue;
    const v = seen.get(e.star);
    if (v) v.n++;
    else seen.set(e.star, { stardate: /^\d{4}\.\d{1,3}$/.test(e.stardate) ? e.stardate : '', n: 1 });
  }
  return seen;
}
// Where the bridge's save says the ship is holding: a star's index, or null when it's at home or there's no save.
function loadAt() {
  let at = null;
  try { at = JSON.parse(localStorage.getItem('engage.v1') || 'null')?.at; } catch { /* no save */ }
  return Number.isInteger(at) && at > 0 ? at : null;
}
function save() {
  const { place, sky: s, trim, night } = saved;
  keep(KEY, { place, sky: s, trim, night }); // only settings: nothing is lost if they can't be kept
}

// ---------- Startup ----------

async function start() {
  cat = await loadCatalog();
  Object.assign(saved, load()); // as it stands now: another tab may have saved while the stars were being fetched
  canvas = $('view');
  ctx = canvas.getContext('2d');
  // A guess is saved along with everything else, but it's still only a guess: make it afresh from today's time zone.
  if (!saved.place || saved.place.how === 'guess') saved.place = guessPlace();
  prepareStars();
  buildSheets();
  steps = backCloses({ close: closeSheets, isOpen: () => SHEETS.some(id => !$(id).hidden) });
  for (const id of SHEETS) swipeDown($(id), closeSheets);
  showNight();
  compute();
  faceSomethingGood();
  bind();
  $('loading').remove();
  starFromLink();
  window.addEventListener('hashchange', starFromLink);
  if (saved.place.how === 'guess' && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') locate(); }).catch(() => {});
  }
  setInterval(() => { compute(); }, 20000);
  requestAnimationFrame(tick);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.tonight = hooks();
}

// The stars worth drawing (all the eye could ever see, from Earth), brightest first, and the tagged ones.
let bright, brightMag, tags, figures;
function prepareStars() {
  figures = constellationLabels(cat); // where each constellation's name goes
  const list = [];
  for (let i = 1; i < cat.count; i++) {
    const m = earthMag(i);
    if (m < DARK_SKY) list.push([i, m]);
  }
  list.sort((a, b) => a[1] - b[1]);
  bright = Int32Array.from(list, x => x[0]);
  brightMag = Float32Array.from(list, x => x[1]);

  const charted = new Map(CHARTS.map(c => [c.star, c]));
  tags = [];
  for (const c of CHARTS) {
    const i = cat.byName.get(c.star);
    if (i !== undefined) tags.push({ i, chart: c, name: c.tag });
  }
  for (const d of DESTINATIONS) {
    if (d.star === 'Sol' || charted.has(d.star)) continue;
    const i = cat.byName.get(d.star);
    if (i !== undefined) tags.push({ i, dest: d, name: d.title });
  }
  // Anywhere else the log has been gets a tag of its own, so the log shows in the sky: drawn only while it is up and
  // bright enough to see (see drawTag), and always in the list.
  const tagged = new Set(tags.map(t => t.i));
  for (const i of visits.keys()) {
    if (i >= cat.count) { visits.delete(i); continue; }
    if (!tagged.has(i)) tags.push({ i, name: titleFor(cat, i) });
  }
  for (const t of tags) { t.been = visits.has(t.i); t.mag = earthMag(t.i); t.ly = cat.distanceFrom(t.i, [0, 0, 0]) * LY_PER_PC; t.dest ??= DESTINATIONS.find(d => d.star === cat.names[t.i]); }
}
const earthMag = i => apparentMag(cat.absmag[i], cat.distanceFrom(i, [0, 0, 0]));
const starDir = i => [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]];

// ---------- Where you are ----------

function guessPlace() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* none */ }
  // Summer time runs an hour ahead of a zone's standard time, so go by whichever of January and July is behind.
  const y = new Date().getFullYear();
  return placeForZone(tz, -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()));
}

function setPlace(p) {
  saved.place = p;
  save();
  compute();
  renderPlaces();
}

function locate() {
  const note = $('place-note');
  if (!navigator.geolocation) { note.textContent = 'This browser can’t share its location. Pick the nearest city instead.'; return; }
  note.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
    const near = CITIES.map(c => [c, Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos(lat * DEG))]).sort((a, b) => a[1] - b[1])[0];
    const name = near[1] < 1.2 ? `near ${near[0].name}` : `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`;
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* none */ }
    setPlace({ name, lat, lon, tz, how: 'gps' });
    note.textContent = 'Using where your phone says you are, to about 10 km. It stays on this device.';
  }, err => {
    note.textContent = err.code === 1
      ? 'Location is turned off for this page. Pick the nearest city instead; within a few hundred kilometres the sky looks the same.'
      : 'Couldn’t get your location just now. Pick the nearest city instead.';
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

// ---------- Working out the sky ----------

const when = () => new Date((testNow ?? Date.now()) + offsetMin * 60000);

function compute() {
  const { lat, lon } = saved.place;
  const date = when(), jd = jdOf(date);
  const f = frame(lat, lon, jd);
  const sun = toLocal(f, sunDir(jd));
  const moon = moonSky(jd, { lat, lon }); // from where you stand: the Moon is near enough for that to show
  const moonL = toLocal(f, moon.dir);
  const sunAlt = altAz(sun).alt, moonAlt = altAz(moonL).alt;
  const lim = limitingMag(saved.sky, sunAlt, moon.lit, moonAlt);
  const nightLim = limitingMag(saved.sky, -90, moon.lit, moonAlt);

  const n = bright.length;
  const local = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) local.set(toLocal(f, starDir(bright[k])), k * 3);
  const lines = cat.lines.map(([a, b]) => [toLocal(f, starDir(a)), toLocal(f, starDir(b))]);

  const planets = NAKED_EYE_PLANETS.map(name => {
    const p = planetSky(name, jd);
    return { name, label: PLANET_NAMES[name], local: toLocal(f, p.dir), mag: p.mag, au: p.au };
  });
  for (const c of figures) c.local = toLocal(f, c.dir);
  for (const t of tags) {
    t.local = toLocal(f, starDir(t.i));
    t.alt = altAz(t.local).alt;
    t.seen = t.mag <= nightLim;
  }
  // A meteor shower that is active on this date here, and where its meteors streak away from.
  const shower = showersOn(date, tzOf())[0] || null;
  if (shower) shower.local = toLocal(f, radiantDir(shower.shower));
  else if (sel?.kind === 'shower') closeSheets(); // the slider has run on past its last night
  sky = { date, f, sun, sunAlt, moon, moonL, moonAlt, lim, nightLim, local, lines, planets, shower };
  updateHud();
  if (!$('list').hidden) renderList();
  if (!$('card').hidden && sel) fillCard(sel); // keeps the card up to date without turning the view back to it
  dirty = true;
}

function updateHud() {
  const p = saved.place;
  $('place-name').textContent = p.how === 'guess' && p.name !== 'your time zone' ? `Near ${p.name}?` : p.how === 'guess' ? 'Your time zone' : cap(p.name);
  $('clock').textContent = clockText(sky.date, offsetMin === 0);
  $('time-out').textContent = offsetMin === 0 ? 'Now' : timeOf(sky.date);
  $('time').style.setProperty('--fill', `${offsetMin / 7.2}%`);
  const dark = nextDark(p.lat, p.lon, sky.date, 24);
  const later = jdOf(new Date(+sky.date + 600000));
  const note = daylightNote(sky.sunAlt, altAz(toLocal(frame(p.lat, p.lon, later), sunDir(later))).alt, !!dark);
  const banner = $('daylight');
  banner.hidden = !note;
  if (note) {
    $('daylight-text').textContent = note;
    const mins = dark ? Math.ceil((dark - (testNow ?? Date.now())) / 600000) * 10 : null;
    $('go-dark').hidden = !(mins && mins <= 720);
    $('go-dark').dataset.min = mins ?? '';
    $('go-dark').textContent = dark ? `Show ${timeOf(dark)}` : 'Show tonight';
  }
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const dayOf = (d, tz = tzOf()) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
const timeOf = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzOf() }).toLowerCase().replace(' ', ' ');
const clockText = (d, now) => `${now ? 'now, ' : ''}${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: tzOf() })} ${timeOf(d)}`; // the dot before it is in the CSS
function tzOf() {
  const tz = saved.place?.tz;
  try { if (tz) { Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch { /* unknown zone */ }
  return undefined;
}

// Start by looking toward Vulcan if it's up, or the first other Starfleet star that is, or else the side of the
// sky away from the pole.
function faceSomethingGood() {
  const up = tags.filter(t => t.chart && t.alt > 12 && t.seen);
  const t = up.find(x => x.chart.tag === 'Vulcan') || up[0];
  if (t) {
    const { alt, az } = altAz(t.local);
    view.az = az; view.alt = Math.min(Math.max(alt, 20), 55);
  } else { view.az = saved.place.lat >= 0 ? 180 : 0; view.alt = 35; }
}

// A link like tonight.html#star=Vega, from the captain's log on the bridge, turns to that star and opens its card.
function starFromLink() {
  const m = location.hash.match(/^#star=(.+)$/);
  if (!m) return;
  let name = '';
  try { name = decodeURIComponent(m[1]); } catch { return; }
  const i = cat.byName.get(name) ?? tags.find(t => t.name === name)?.i;
  if (i === undefined) return;
  const s = i === 0 ? { kind: 'sun' } : { kind: 'star', i };
  const { alt, az } = altAz(selLocal(s));
  aimAnim = null;
  view.az = az; view.alt = Math.min(Math.max(alt, -10), 80);
  draw(); // so the card knows where the star sits on screen
  showCard(s);
}

// ---------- Looking ----------

function basis() {
  if (sensing && pose) {
    const t = saved.trim * DEG, c = Math.cos(t), s = Math.sin(t);
    const turn = v => [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]; // clockwise by the trim, seen from above
    return { f: turn(pose.forward), r: turn(pose.right), u: turn(pose.up) };
  }
  const f = fromAltAz(view.alt, view.az);
  const r = [Math.cos(view.az * DEG), -Math.sin(view.az * DEG), 0];
  const u = cross(r, f);
  return { f, r, u };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

// A stereographic view, like a wide camera lens that keeps shapes true: `scale` is pixels per unit near the middle.
let B, W, H, S;
function project(d) {
  const z = dot(d, B.f);
  if (z < -0.5) return null;
  const k = 2 / (1 + z);
  return { x: W / 2 + k * dot(d, B.r) * S, y: H / 2 - k * dot(d, B.u) * S, z };
}

function tick() {
  if (aimAnim) stepAim();
  if (dirty && sky) { draw(); dirty = false; }
  requestAnimationFrame(tick);
}

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = cw; H = ch;
  B = basis();
  S = Math.sqrt(W * H) / 2 / (2 * Math.tan(view.fov / 4));
  placed = []; labelled = [];
  // Keep labels clear of the header, the controls and the daylight notice when it's up.
  const hud = document.querySelector('.hud').getBoundingClientRect(), controls = document.querySelector('.controls .row').getBoundingClientRect();
  labelBoxes = [{ x: -100, y: -100, w: W + 200, h: hud.bottom - 10 + 100 }, { x: controls.left, y: controls.top - 34, w: controls.width, h: H }];
  if (!$('daylight').hidden) { const b = $('daylight').getBoundingClientRect(); labelBoxes.push({ x: b.left, y: b.top, w: b.width, h: b.height }); }
  reservedBoxes = labelBoxes.length;
  const zoom = Math.min(1.6, Math.max(0.8, Math.sqrt(80 * DEG / view.fov)));

  // The sky's colour from where the Sun is.
  const sa = sky.sunAlt;
  const glow = Math.min(1, Math.max(0, (sa + 15) / 17));
  const top = mix([3, 5, 12], [40, 92, 160], glow), low = mix([8, 12, 26], [120, 160, 210], glow);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(low));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const lim = sky.lim, ghost = sky.lim < sky.nightLim - 0.5; // daylight or twilight: draw the night's stars faintly
  const drawLim = ghost ? Math.min(sky.nightLim, 4.5) : lim;

  // Constellation lines
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(134, 190, 255, ${ghost ? 0.12 : 0.2})`;
  ctx.beginPath();
  for (const [a, b] of sky.lines) {
    if (a[2] < 0 && b[2] < 0) continue;
    const pa = project(a), pb = project(b);
    if (!pa || !pb || pa.z < 0 || pb.z < 0) continue;
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();

  // Stars
  const L = sky.local;
  for (let k = 0; k < bright.length; k++) {
    const m = brightMag[k];
    if (m > drawLim + 0.4) break;
    if (L[k * 3 + 2] < -0.02) continue;
    const p = project([L[k * 3], L[k * 3 + 1], L[k * 3 + 2]]);
    if (!p || p.x < -8 || p.y < -8 || p.x > W + 8 || p.y > H + 8) continue;
    const s = drawLim + 0.4 - m;
    let a = Math.min(1, s / 1.4);
    if (ghost) a *= sky.sunAlt > -2 ? 0.8 : 0.5;
    const r = Math.min(4.6, 0.55 + s * 0.42) * zoom;
    const i = bright[k];
    // Under night vision only the red in a colour is left, which would make a blue-white star (Rigel, Vega) look
    // fainter than a red one as bright: there every star is drawn white, so how bright it looks is its magnitude.
    const c = saved.night ? WHITE : cat.color.subarray(i * 3, i * 3 + 3);
    ctx.fillStyle = `rgba(${c[0] * 255 | 0}, ${c[1] * 255 | 0}, ${c[2] * 255 | 0}, ${a})`;
    if (r < 1.1) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); }
    if (m < 2.2) placed.push({ x: p.x, y: p.y, r: 16, hit: { kind: 'star', i }, rank: m });
  }

  // Planets, the Moon and the Sun. Every disc goes down before any name, and each disc is somewhere no name may go:
  // with two planets close together (Mars and Jupiter, 1.4° apart on 18 November 2026) the first one's name used to
  // take the only place tried, the second went unnamed, and its disc was painted over the first one's name.
  bodies = [];
  for (const pl of sky.planets) {
    if (pl.local[2] < -0.02 || pl.mag > Math.max(lim, 2)) continue;
    const p = project(pl.local);
    if (!p || p.z < 0) continue;
    const r = Math.min(5, 1.6 + (2 - pl.mag) * 0.6) * zoom;
    ctx.fillStyle = '#ffe9c4';
    ctx.shadowColor = 'rgba(255, 200, 120, 0.8)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    bodies.push({ name: pl.label, x: p.x, y: p.y, r, mag: pl.mag });
    placed.push({ x: p.x, y: p.y, r: 22, hit: { kind: 'planet', name: pl.name }, rank: -5 });
  }
  if (sky.moonL[2] > -0.02) drawMoon();
  for (const b of bodies) labelBoxes.push({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 });
  // The brightest is named first, so it has first pick of the room beside it.
  for (const b of [...bodies].sort((a, c) => a.mag - c.mag)) {
    if (b.x > -b.r && b.x < W + b.r && b.y > -b.r && b.y < H + b.r) label(b.name, b.x, b.y, b.r + 6, 'planet');
  }
  if (sky.sun[2] > -0.02) {
    const p = project(sky.sun);
    if (p && p.z > 0) {
      const sg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 60);
      sg.addColorStop(0, 'rgba(255, 250, 230, 1)'); sg.addColorStop(0.15, 'rgba(255, 235, 180, 0.9)'); sg.addColorStop(1, 'rgba(255, 220, 160, 0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(p.x, p.y, 60, 0, 7); ctx.fill();
      placed.push({ x: p.x, y: p.y, r: 30, hit: { kind: 'sun' }, rank: -30 });
    }
  }

  drawGround();

  // The tags: Starfleet's names, then Engage's other destinations. First where each whole tag's ring will be, so a
  // name can be put on the side of its star that keeps clear of the others' rings (Merak II's and Mizar II's).
  ringsAhead = [];
  for (const t of tags) {
    const p = project(t.local);
    if (p && p.z >= 0.05 && (sel?.kind === 'star' && sel.i === t.i || (t.alt >= 0 && t.seen))) ringsAhead.push({ x: p.x, y: p.y, r: (t.chart ? 19 : 9) + 2, i: t.i });
  }
  for (const t of tags) drawTag(t);
  drawRadiant();

  // Bright stars' own names, small, where there's room.
  for (const q of placed) {
    if (q.hit.kind !== 'star' || q.rank > 1.4 || tags.some(t => t.i === q.hit.i)) continue;
    const name = cat.names[q.hit.i];
    if (/^(HIP|Gliese|HD) /.test(name)) continue;
    label(name, q.x, q.y, 6, 'star');
  }

  drawNames(ghost);
  drawSelection();
  drawPointer();
}

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const rgb = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;

// The ground, below the horizon. On this kind of view the horizon is always a circle (or a straight line),
// so it's found from three points on it, and the ground is whichever side the point under your feet is on.
function drawGround() {
  const az0 = Math.atan2(B.f[0], B.f[1]) / DEG;
  const pts = [0, 90, -90].map(d => project(fromAltAz(0, az0 + d)));
  if (pts.some(p => !p)) return;
  const [p1, p2, p3] = pts;
  const nadir = project([0, 0, -1]);
  ctx.save();
  ctx.beginPath();
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  let horizon;
  if (Math.abs(d) < 1e-3) {
    // A straight horizon: fill the half of the screen the nadir is on.
    const dx = p3.x - p2.x, dy = p3.y - p2.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    const ref = nadir || { x: W / 2 - B.u[0], y: H }; // looking straight out, the ground is down the screen
    if ((ref.x - p2.x) * nx + (ref.y - p2.y) * ny < 0) { nx = -nx; ny = -ny; }
    const far = 4 * (W + H);
    ctx.moveTo(p2.x - dx / len * far, p2.y - dy / len * far);
    ctx.lineTo(p2.x + dx / len * far, p2.y + dy / len * far);
    ctx.lineTo(p2.x + dx / len * far + nx * far, p2.y + dy / len * far + ny * far);
    ctx.lineTo(p2.x - dx / len * far + nx * far, p2.y - dy / len * far + ny * far);
    ctx.closePath();
    horizon = () => { ctx.moveTo(p2.x - dx / len * far, p2.y - dy / len * far); ctx.lineTo(p2.x + dx / len * far, p2.y + dy / len * far); };
  } else {
    const a1 = p1.x * p1.x + p1.y * p1.y, a2 = p2.x * p2.x + p2.y * p2.y, a3 = p3.x * p3.x + p3.y * p3.y;
    const cx = (a1 * (p2.y - p3.y) + a2 * (p3.y - p1.y) + a3 * (p1.y - p2.y)) / d;
    const cy = (a1 * (p3.x - p2.x) + a2 * (p1.x - p3.x) + a3 * (p2.x - p1.x)) / d;
    const r = Math.hypot(p1.x - cx, p1.y - cy);
    const inside = nadir ? Math.hypot(nadir.x - cx, nadir.y - cy) < r : false;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (!inside) ctx.rect(-10, -10, W + 20, H + 20);
    horizon = () => ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  const glow = Math.min(1, Math.max(0, (sky.sunAlt + 15) / 17));
  ctx.fillStyle = `rgba(${mix([6, 9, 12], [34, 44, 40], glow).join(',')}, 0.94)`;
  ctx.fill('evenodd');
  ctx.beginPath(); horizon();
  ctx.strokeStyle = 'rgba(255, 181, 74, 0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();

  // Compass points along the horizon
  ctx.textAlign = 'center';
  for (const [az, name] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]) {
    const p = project(fromAltAz(0, az));
    if (!p || p.z < 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
    ctx.font = `600 ${name.length === 1 ? 15 : 11}px ${FONT}`;
    ctx.fillStyle = name.length === 1 ? '#ffb54a' : 'rgba(255, 181, 74, 0.7)';
    ctx.fillText(name, p.x, p.y + 18);
    labelBoxes.push({ x: p.x - 12, y: p.y + 4, w: 24, h: 18 });
  }
  ctx.textAlign = 'left';
}

function drawMoon() {
  const p = project(sky.moonL);
  if (!p || p.z < 0) return;
  const r = Math.max(7, 0.26 * DEG * S * 2 / (1 + p.z));
  // Which way the Sun is, on screen
  const toward = sky.moonL.map((v, k) => v + 0.02 * sky.sun[k]);
  const q = project(toward) || { x: p.x + 1, y: p.y };
  const ang = Math.atan2(q.y - p.y, q.x - p.x);
  const { lit } = sky.moon;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(60, 66, 80, 0.85)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f1e6';
  ctx.shadowColor = 'rgba(255, 250, 230, 0.6)'; ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); // the half facing the Sun…
  const w = r * Math.abs(1 - 2 * lit);       // …and the terminator, an ellipse
  ctx.ellipse(0, 0, w, r, 0, Math.PI / 2, -Math.PI / 2, lit < 0.5);
  ctx.fill();
  ctx.restore();
  bodies.push({ name: 'Moon', x: p.x, y: p.y, r, mag: -12 });
  placed.push({ x: p.x, y: p.y, r: Math.max(24, r), hit: { kind: 'moon' }, rank: -12 });
}

// The constellations' names, in small spaced capitals at the middle of each figure: after everything else that is
// labelled, so a name gives way to a tag, a planet or a star's name and never crowds one. Only for figures above the
// horizon, only with the Sun down (fainter in twilight, as the lines are), and only on a view wide enough to take in
// whole figures: closer in than about 40°, a name would be floating over a few stars of one.
const NAMES_FOV = 40; // degrees
let named = []; // the names drawn last frame, with their boxes on screen, for tests
function drawNames(ghost) {
  named = [];
  if (view.fov < NAMES_FOV * DEG || sky.sunAlt > -2) return;
  ctx.save();
  ctx.font = `600 10px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillStyle = `rgba(${saved.night ? '235, 205, 196' : '150, 196, 255'}, ${ghost ? 0.34 : 0.6})`;
  // A tag's ring is not a label box (a tag with no room for its words is a ring alone), so keep clear of those too.
  const rings = placed.filter(q => q.rank <= -20).map(q => ({ x: q.x - 22, y: q.y - 22, w: 44, h: 44 }));
  const onRing = b => rings.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  for (const c of figures) {
    if (c.local[2] < 0.07) continue; // 4° up
    const p = project(c.local);
    if (!p || p.z < 0) continue;
    const text = c.name.toUpperCase(), w = ctx.measureText(text).width;
    if (p.x - w / 2 < 4 || p.x + w / 2 > W - 4 || p.y < 10 || p.y > H - 10) continue;
    // In the middle of the figure, or a line above or below it where that is taken.
    for (const dy of [0, 15, -15]) {
      const box = { x: p.x - w / 2 - 2, y: p.y + dy - 8, w: w + 4, h: 13 };
      if (overlaps(box) || onRing(box)) continue;
      labelBoxes.push(box);
      ctx.fillText(text, p.x - w / 2, p.y + dy + 3);
      named.push({ name: c.name, ...box });
      break;
    }
  }
  ctx.restore();
}

// Where an active meteor shower's meteors come from: a small burst, named, once the Sun is down.
function drawRadiant() {
  const sh = sky.shower;
  if (!sh || sh.local[2] < 0.02 || sky.sunAlt > -2) return;
  const p = project(sh.local);
  if (!p || p.z < 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) return;
  const a = sky.sunAlt > -12 ? 0.5 : 0.9;
  ctx.save();
  ctx.strokeStyle = `rgba(190, 255, 214, ${a})`;
  ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const t = k * Math.PI / 4 + 0.2, long = k % 2 === 0;
    ctx.moveTo(p.x + Math.cos(t) * 5, p.y + Math.sin(t) * 5);
    ctx.lineTo(p.x + Math.cos(t) * (long ? 13 : 9), p.y + Math.sin(t) * (long ? 13 : 9));
  }
  ctx.stroke();
  ctx.restore();
  label(sh.shower.name, p.x, p.y, 17, 'shower');
  placed.push({ x: p.x, y: p.y, r: 22, hit: { kind: 'shower' }, rank: -4 });
}

const FONT = "'Chakra Petch', 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
const WHITE = [1, 1, 1];
// A tag's colours: Starfleet's stars in cyan, the others in amber, and the line under the name. Night vision lays red
// light over the page, which keeps only the red in each colour: cyan has little, so Starfleet's tags came out the
// faintest thing on the screen, fainter than the plain star names. Under it the tags are told apart by brightness
// instead: Starfleet's in white (all of its red is kept, 5.25:1 on black, the most red light can give), the others
// a step down (red 236 of 255, which still clears 4.5:1). Their capitals, size and cross-hairs do the rest.
const TAG = {
  day: { trek: '134, 216, 255', other: '255, 181, 74', sub: '200, 210, 230', subA: 0.85 },
  night: { trek: '255, 255, 255', other: '236, 196, 180', sub: '255, 240, 236', subA: 1, otherSub: '226, 200, 190' },
};
let ringsAhead = []; // where this frame's whole tags put their rings: { x, y, r, i }
let labelBoxes = [], reservedBoxes = 0; // the first few are the page's own: the header, the controls and the daylight notice
let bodies = [];   // the planets and the Moon drawn last frame: { name, x, y, r, mag }
let labelled = []; // the names written beside things last frame, with their boxes on screen, for tests
// A name beside something: to its right, or where that is taken or off the screen, to its left, below it or above it.
// A star's name or a shower's with no room in any of the four is left out. A planet's or the Moon's is always
// written, where it covers the least, unless the only places on the screen are under the header, the controls or
// the daylight notice.
function label(text, x, y, gap, style) {
  ctx.font = `${style === 'star' ? 500 : 600} ${style === 'star' ? 11 : 12}px ${FONT}`;
  const w = ctx.measureText(text).width, h = 14;
  const mid = Math.min(Math.max(x - w / 2, 2), Math.max(2, W - 2 - w)); // centred under or over it, but kept on the screen
  const spots = [{ x: x + gap, y: y - 8 }, { x: x - gap - w, y: y - 8 }, { x: mid, y: y + gap - 4 }, { x: mid, y: y - gap - h + 4 }];
  let box = null, least = Infinity;
  for (const s of spots) {
    const b = { x: s.x, y: s.y, w, h };
    if (b.x < 2 || b.x + w > W - 2) continue;
    if (!overlaps(b)) { box = b; break; }
    if (style !== 'planet' || labelBoxes.slice(0, reservedBoxes).some(o => meets(b, o))) continue;
    let cost = 0;
    for (const o of labelBoxes) cost += Math.max(0, Math.min(b.x + w, o.x + o.w) - Math.max(b.x, o.x)) * Math.max(0, Math.min(b.y + h, o.y + o.h) - Math.max(b.y, o.y));
    if (cost < least) { least = cost; box = b; }
  }
  if (!box) return;
  labelBoxes.push(box);
  labelled.push({ text, style, ...box });
  ctx.fillStyle = style === 'planet' ? '#ffd28a' : style === 'shower' ? 'rgba(190, 255, 214, 0.9)' : 'rgba(200, 210, 230, 0.62)';
  ctx.fillText(text, box.x, box.y + 12);
}
const meets = (b, o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h;
const overlaps = b => labelBoxes.some(o => b.x < o.x + o.w + 4 && o.x < b.x + b.w + 4 && b.y < o.y + o.h && o.y < b.y + b.h);

// A Starfleet tag: a targeting ring on the star, its name and a line under it. Only a star that is up and bright
// enough to see from your sky gets all of that; the rest (below the horizon, or too faint) are a quiet dashed ring,
// still there to tap, so 28 of Starfleet's stars don't bury the few you can find tonight. The one chosen is always
// drawn in full.
function drawTag(t) {
  const p = project(t.local);
  if (!p || p.z < 0.05 || p.x < -60 || p.x > W + 60 || p.y < -40 || p.y > H + 40) return;
  const chosen = sel?.kind === 'star' && sel.i === t.i;
  const below = t.alt < 0, faint = !t.seen;
  const trek = !!t.chart;
  if (below && !trek && !chosen) return; // only Starfleet's are worth looking down for
  // A star that is only in your log, too faint to see from here, isn't drawn at all: a keen captain's log is mostly
  // catalogue stars no suburban sky shows, and their rings buried Starfleet's tags. It stays in the list, and opens
  // from the log's In your sky tonight, drawn in full while chosen.
  if (faint && !t.chart && !t.dest && !chosen) return;
  const pal = saved.night ? TAG.night : TAG.day;
  const color = trek ? pal.trek : pal.other;
  if ((below || faint) && !chosen) {
    ctx.save();
    ctx.strokeStyle = `rgba(${color}, ${below ? 0.3 : 0.5})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(p.x, p.y, trek ? 10 : 8, 0, 7); ctx.stroke();
    ctx.restore();
    placed.push({ x: p.x, y: p.y, r: 20, hit: { kind: 'star', i: t.i }, rank: -20, quiet: true });
    return;
  }
  const a = below ? 0.4 : 1;
  const R = trek ? 12 : 9;
  ctx.save();
  ctx.strokeStyle = `rgba(${color}, ${0.9 * a})`;
  ctx.lineWidth = 1.4;
  if (faint) ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  if (trek) {
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(p.x + dx * (R + 2), p.y + dy * (R + 2)); ctx.lineTo(p.x + dx * (R + 7), p.y + dy * (R + 7)); }
    ctx.stroke();
  }
  // The name, with a dark pill behind it so it reads over anything.
  // A star the catalogue has no distance for (only ever one from the log) isn't given the charts' nominal one here either.
  const far = cat.unmeasured[t.i] ? 'distance not measured' : formatLy(t.ly);
  const sub = below ? 'below the horizon' : faint ? 'too faint to see' : t.chart ? `${titleFor(cat, t.i)} · ${far}` : far;
  ctx.font = `600 ${trek ? 14 : 12}px ${FONT}`;
  const name = trek ? t.name.toUpperCase() : t.name;
  const tick = t.been ? 15 : 0; // room for the mark that says the ship has been there
  const wName = ctx.measureText(name).width + (trek ? name.length * 1.2 : 0) + tick;
  ctx.font = `500 11px ${FONT}`;
  const wSub = ctx.measureText(sub).width;
  const w = Math.max(wName, wSub) + 14, h = 34;
  let x = p.x + R + 9, y = p.y - h / 2;
  const left = p.x - R - 9 - w;
  const onRing = b => ringsAhead.some(o => o.i !== t.i && b.x < o.x + o.r && o.x - o.r < b.x + b.w && b.y < o.y + o.r && o.y - o.r < b.y + b.h);
  if (x + w > W - 6 || overlaps({ x, y, w, h }) || (onRing({ x, y, w, h }) && left >= 6 && !onRing({ x: left, y, w, h }) && !overlaps({ x: left, y, w, h }))) x = left;
  // Never off the screen's edge: a star just past the left edge (or one whose name had to go left) keeps its whole
  // name on the screen, where it was cut off at the edge.
  if (x < 6) x = Math.max(6, Math.min(p.x + R + 9, W - 6 - w));
  const box = { x, y, w, h };
  const reserved = labelBoxes.slice(0, reservedBoxes); // never under the header, the controls or the daylight notice
  if (reserved.some(o => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h) || (overlaps(box) && !trek)) { ctx.restore(); placed.push({ x: p.x, y: p.y, r: 20, hit: { kind: 'star', i: t.i }, rank: -20 }); return; }
  labelBoxes.push(box);
  ctx.fillStyle = `rgba(5, 9, 18, ${0.72 * a})`;
  roundRect(x, y, w, h, 7); ctx.fill();
  ctx.fillStyle = `rgba(${color}, ${a})`;
  ctx.fillRect(x, y + 5, 2, h - 10);
  ctx.font = `600 ${trek ? 14 : 12}px ${FONT}`;
  if (trek && 'letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
  ctx.fillText(name, x + 8, y + 15);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  if (t.been) {
    // A small filled Starfleet delta after the name: you've dropped out of warp here.
    const mx = x + 8 + wName - 6, my = y + 10.5;
    ctx.beginPath();
    ctx.moveTo(mx, my - 5.5); ctx.lineTo(mx + 4.4, my + 5); ctx.lineTo(mx, my + 2.4); ctx.lineTo(mx - 4.4, my + 5);
    ctx.closePath(); ctx.fill();
  }
  ctx.font = `500 11px ${FONT}`;
  ctx.fillStyle = `rgba(${trek ? pal.sub : pal.otherSub || pal.sub}, ${pal.subA * a})`;
  ctx.fillText(sub, x + 8, y + 28);
  ctx.restore();
  placed.push({ x: p.x, y: p.y, r: 26, box, been: t.been, hit: { kind: 'star', i: t.i }, rank: trek ? -40 : -20 });
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Where the selected thing is in your local sky.
function selLocal(s = sel) {
  if (!s) return null;
  if (s.kind === 'star') return toLocal(sky.f, starDir(s.i));
  if (s.kind === 'planet') return sky.planets.find(p => p.name === s.name).local;
  if (s.kind === 'moon') return sky.moonL;
  if (s.kind === 'shower') return sky.shower.local;
  return sky.sun;
}

function drawSelection() {
  if (!sel) return;
  const p = project(selLocal());
  if (!p || p.z < 0) return;
  ctx.strokeStyle = '#ffb54a'; ctx.lineWidth = 1.6;
  const R = 19, k = 6;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(p.x + sx * R, p.y + sy * (R - k)); ctx.lineTo(p.x + sx * R, p.y + sy * R); ctx.lineTo(p.x + sx * (R - k), p.y + sy * R);
  }
  ctx.stroke();
}

// When the selected thing is off the screen, an arrow at the edge says which way to turn.
function drawPointer() {
  const el = $('pointer');
  if (!sel) { el.hidden = true; return; }
  const d = selLocal();
  const z = dot(d, B.f), x = dot(d, B.r), y = dot(d, B.u);
  const p = project(d);
  const on = p && p.z > 0 && p.x > 20 && p.x < W - 20 && p.y > 90 && p.y < H - 150;
  el.hidden = on;
  if (on) return;
  const ang = Math.atan2(-y, z < -0.999 ? 1 : x); // screen angle, y down
  const cx = W / 2, cy = (90 + H - 150) / 2, hw = W / 2 - 34, hh = (H - 150 - 90) / 2 - 10;
  const t = Math.min(hw / Math.abs(Math.cos(ang) || 1e-9), hh / Math.abs(Math.sin(ang) || 1e-9));
  el.style.transform = `translate(${cx + Math.cos(ang) * t}px, ${cy + Math.sin(ang) * t}px)`;
  el.querySelector('svg').style.transform = `rotate(${ang}rad)`;
  $('pointer-name').textContent = nameOf(sel);
}

function nameOf(s) {
  if (s.kind === 'star') { const t = tags.find(x => x.i === s.i); return t ? t.name : titleFor(cat, s.i); }
  if (s.kind === 'planet') return PLANET_NAMES[s.name];
  if (s.kind === 'shower') return sky.shower.shower.name;
  return s.kind === 'moon' ? 'The Moon' : 'The Sun';
}

// ---------- The card ----------

function showCard(s) {
  shipAt = loadAt(); // the bridge may have flown on in another tab, or before Back brought this page up again
  fillCard(s);
  $('card-body').scrollTop = 0;
  openSheet('card');
  frameAboveCard();
  dirty = true;
}

// Writes the card for something in the sky. The card is read out as it changes, so only what moved is rewritten.
function fillCard(s) {
  sel = s;
  const local = selLocal(s);
  const pos = altAz(local);
  const look = whereToLook(pos);
  // A course for the star the ship is holding at is no course: the bridge would open with nothing chosen. There the
  // card says where the ship is, with a way back.
  const here = s.kind === 'star' && s.i === shipAt;
  const course = $('card-course');
  course.hidden = s.kind !== 'star' || here;
  $('card-here').hidden = !here;
  let kind, title, sub = '', line = '', facts = '', seeIt = '', been = '', now = '';
  const skyIn = SKIES[saved.sky].inText;
  const night = sky.sunAlt > -12 ? ' once it’s dark' : '';
  if (s.kind === 'star') {
    const t = tags.find(x => x.i === s.i);
    const ly = cat.distanceFrom(s.i, [0, 0, 0]) * LY_PER_PC;
    const m = earthMag(s.i);
    const d = t?.dest;
    const v = visits.get(s.i);
    kind = t?.chart ? 'Starfleet charts' : d ? 'Engage destination' : v ? 'From your log' : 'Star';
    if (v) {
      const on = v.stardate ? ` on stardate ${v.stardate}` : '';
      been = v.n > 1 ? `You’ve dropped out of warp here ${v.n === 2 ? 'twice' : `${v.n} times`}${on && `, the last${on}`}.` : `You dropped out of warp here${on}.`;
    }
    // And any first contact made here, from first contact's own record.
    been = [been, ...linesForStar(contacts, s.i)].filter(Boolean).join(' ');
    title = t ? t.name : titleFor(cat, s.i);
    // The catalogue has no distance for some stars: the bridge says so, and so does this card, with no year for its light.
    const unmeasured = !!cat.unmeasured[s.i];
    const con = cat.constellationToward(norm(starDir(s.i)));
    sub = [t?.chart && titleFor(cat, s.i) !== title ? titleFor(cat, s.i) : '', unmeasured ? 'Distance not measured' : `${formatLy(ly)} away`, con ? `in ${con}` : ''].filter(Boolean).join(' · ');
    line = t?.chart?.line || d?.fiction || d?.notes?.[0] || '';
    // When it would show in this sky with the Moon down, the Moon is what hides it, not the sky.
    seeIt = m <= sky.nightLim ? `You can see it ${skyIn}${night}.`
      : m <= limitingMag(saved.sky, -90) ? 'The Moon is washing it out tonight.'
      : m < 6.5 ? `Too faint to pick out ${skyIn}; it needs a dark sky.` : `Far too faint to see without a telescope (magnitude ${m.toFixed(1)}).`;
    const left = Math.floor(Number(stardate()) - ly); // the calendar year it left in, as the captain's log dates Earth's old light
    const what = d?.kind || describeKind(cat.spect[s.i], cat.temp[s.i], unmeasured ? null : cat.absmag[s.i]);
    facts = unmeasured ? `${what}. Nobody has measured how far away it is, so there’s no saying how old its light is.`
      : `${what}. The light reaching you tonight left it ${ly < 5000 ? `in ${formatYear(left)}` : `about ${formatLy(ly).replace(' ly', '')} years ago`}.`;
    // A star that behaves (Algol, Mira, Delta Cephei, Betelgeuse, Proxima): where it is in its cycle tonight.
    const variable = variableFor(cat.names[s.i]);
    if (variable) now = nowLine(variable, +sky.date, { when: t => `${new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tzOf() })}, ${timeOf(new Date(t))}`, day: t => dayOf(new Date(t)) });
    course.href = `${BRIDGE}?course=${encodeURIComponent(cat.names[s.i])}`;
    // The star's name is the card's heading; with it in the button too, the words ran to two lines on a phone.
    setText('card-course', v ? 'Set course again' : 'Set course');
    course.setAttribute('aria-label', `Set course${v ? ' again' : ''} for ${inTextFor(cat, s.i)}`);
    if (BRIDGE.startsWith('http')) { course.target = '_blank'; course.rel = 'noopener'; }
  } else if (s.kind === 'planet') {
    const p = sky.planets.find(x => x.name === s.name);
    kind = 'Planet'; title = PLANET_NAMES[s.name];
    const mins = p.au * 499 / 60;
    sub = `${p.au.toFixed(2)} AU away`;
    // Sirius, the brightest star, is magnitude −1.5.
    line = `It shines at magnitude ${p.mag.toFixed(1).replace('-', '−')}, ${p.mag < -1.5 ? 'brighter than any star' : p.mag < 0 ? 'brighter than almost every star' : 'as bright as a fairly bright star'}, and doesn’t twinkle the way stars do.`;
    facts = `Its light takes ${mins < 60 ? `${Math.round(mins)} minutes` : `${(mins / 60).toFixed(1)} hours`} to reach you.`;
  } else if (s.kind === 'moon') {
    kind = 'The Moon'; title = moonPhaseName(sky.moon.lit, sky.moon.waxing);
    sub = `${Math.round(sky.moon.lit * 100)}% lit · ${Math.round(sky.moon.km).toLocaleString('en-US')} km away`;
    line = sky.moon.lit > 0.6 ? 'A bright moon washes out the faintest stars, so fewer of the tags are visible tonight.' : 'A thin moon leaves the sky dark for the faint stars.';
    facts = 'Its light takes 1.3 seconds to reach you.';
  } else if (s.kind === 'shower') {
    const { shower: sh, peak } = sky.shower;
    const md = ([m, d]) => dayOf(new Date(Date.UTC(2026, m - 1, d, 12)), 'UTC');
    kind = 'Meteor shower'; title = sh.name;
    sub = `Active ${md(sh.from)} to ${md(sh.to)} · ${peak < sky.date ? 'peaked' : 'peak'} ${dayOf(peak)}`;
    line = 'Its meteors can cross any part of the sky, but they all streak away from this point, the radiant. The higher it stands, the more of them you see.';
    facts = `Up to ${sh.zhr} an hour at the peak, under a dark sky with this point overhead. Dates and rates are the International Meteor Organization’s.`;
  } else {
    kind = 'Sol'; title = 'The Sun'; sub = '8 light minutes away';
    line = 'Home. Don’t look straight at it.';
  }
  setText('card-kind', kind);
  setText('card-title', title);
  setText('card-sub', sub);
  setText('card-look', `${cap(look)}${s.kind === 'star' && pos.alt > -0.5 ? '. ' + seeIt : '.'}`);
  setText('card-line', line);
  $('card-line').hidden = !line;
  setText('card-facts', facts);
  $('card-facts').hidden = !facts;
  setText('card-now', now);
  $('card-now').hidden = !now;
  setText('card-been', been);
  $('card-been').hidden = !been;
  // A star can be sent: its link turns this sky to it and opens this card. (The planets and the Moon have no link.)
  $('card-share').hidden = !linkName(s);
  // Doors to the other rooms that know this thing: its rung on the warp scale, and for a planet or the Moon the
  // survey file it is the Solar System's example of.
  const rung = s.kind === 'star' ? PLACES.find(p => p.sky === cat.names[s.i])?.id : ['moon', 'mars', 'jupiter'].find(id => id === (s.kind === 'moon' ? 'moon' : s.kind === 'planet' && s.name));
  const file = s.kind === 'moon' ? fileForHome('Moon') : s.kind === 'planet' ? fileForHome(PLANET_NAMES[s.name]) : null;
  const doors = [
    rung && [`${BRIDGE}warp.html${s.kind === 'star' ? '' : '?warp=9'}#${rung}`, s.kind === 'star' ? 'Race there on the warp scale' : 'How long at warp 9'],
    file && [`${BRIDGE}survey.html#${encodeURIComponent(file.id)}`, `${fileLabel(file)} survey file`],
  ].filter(Boolean).map(([href, text]) => `<a href="${href}"${BRIDGE.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`).join('');
  if ($('card-doors').dataset.for !== doors) { $('card-doors').dataset.for = doors; $('card-doors').innerHTML = doors; }
  $('card-share-row').hidden = !doors && !linkName(s);
  const tab = `${nameOf(s)} · Tonight’s sky · Engage`;
  if (document.title !== tab) document.title = tab;
}
// The name a link to a star's card carries: the catalogue's, when that name leads back to this star.
const linkName = s => (s.kind === 'star' && cat.byName.get(cat.names[s.i]) === s.i ? cat.names[s.i] : '');
function shareStar(button) {
  const name = sel && linkName(sel);
  if (!name) return null;
  return share(button, {
    title: `${nameOf(sel)}, in tonight’s sky`,
    text: `${nameOf(sel)} (${$('card-sub').textContent}): find it in your sky tonight.`,
    url: `${LIVE}tonight.html#star=${encodeURIComponent(name)}`,
  });
}
const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };

// With the card up, turn the view (when looking by hand) so the thing sits in the sky that's left above it.
function frameAboveCard() {
  if (sensing || !sel || !B) return;
  // Where the card comes to rest: its place in the layout, not where it is on screen, which for its first third of a
  // second is up to 40 px lower as it slides in. (Measured on the way up, a star straight overhead was judged clear
  // of the card and then covered by it.)
  const card = { top: $('card').offsetTop, left: $('card').offsetLeft };
  const free = card.left > W / 2 ? { x: card.left / 2, y: H / 2 } : { x: W / 2, y: Math.max(110, (card.top + 80) / 2) };
  const p = project(selLocal());
  if (p && p.z > 0 && Math.abs(p.x - free.x) < W * 0.4 && p.y > 90 && p.y < card.top - 30 && card.left <= W / 2) return;
  aim(sel, (H / 2 - free.y) / S / DEG, card.left > W / 2 ? (W / 2 - free.x) / S / DEG : 0);
}

// ---------- The list ----------

// Tonight's plan, at the head of the list: worked out from this moment, not from where the time slider is, since its
// button is what moves the slider. The best time counts ten-minute steps from now, as the slider does.
let plan = null;
function renderPlan() {
  const { lat, lon } = saved.place;
  const now = new Date(testNow ?? Date.now());
  const stars = tags.filter(t => t.chart).map(t => ({ name: t.name, dir: starDir(t.i), mag: t.mag }));
  plan = tonightPlan(lat, lon, now, stars, saved.sky, tzOf());
  const lines = planLines(plan, { time: timeOf, day: d => dayOf(d), skyIn: SKIES[saved.sky].inText });
  setText('plan-dark', lines.dark);
  $('plan-best').hidden = !lines.best;
  setText('plan-best-text', lines.best || '');
  // The slider reaches twelve hours ahead; a best time further off than that is named with no button.
  const go = $('plan-go'), min = plan.best?.up.length ? plan.best.minutes : null;
  go.hidden = min === null || min > 720 || min === offsetMin;
  if (!go.hidden) setText('plan-go', min === 0 ? 'Show now' : `Show ${timeOf(plan.best.date)}`);
  $('plan-shower').hidden = !lines.shower;
  setText('plan-shower', lines.shower || '');
}

function renderList() {
  renderPlan();
  const rows = tags.map(t => ({ t, state: t.alt < 0 ? 2 : t.seen ? 0 : 1 }))
    .sort((a, b) => a.state - b.state || (b.t.chart ? 1 : 0) - (a.t.chart ? 1 : 0) || b.t.alt - a.t.alt);
  const up = rows.filter(r => r.state === 0 && r.t.chart).length;
  const charted = tags.filter(t => t.chart).length;
  // (Where it doesn't get dark tonight, "once it's dark" would promise something the plan above has just ruled out.)
  const seen = sky.sunAlt <= -12 ? `up and bright enough to see ${SKIES[saved.sky].inText}`
    : plan.night ? `up and bright enough to see ${SKIES[saved.sky].inText} once it’s dark` : `up, and would be bright enough to see ${SKIES[saved.sky].inText} if it got dark`;
  $('list-note').textContent = `${up} of Starfleet’s ${charted} charted stars ${up === 1 ? 'is' : 'are'} ${seen}.${visits.size ? ` You’ve flown to ${visits.size} of the stars listed here.` : ''}`;
  const box = $('systems');
  box.replaceChildren(...rows.map(({ t, state }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `system s${state}${t.chart ? ' trek' : ''}${t.been ? ' been' : ''}`;
    const where = state === 2 ? 'Below the horizon' : `${cap(whereToLook(altAz(t.local)))}${state === 1 ? ', too faint to see' : ''}`;
    b.innerHTML = '<i aria-hidden="true"></i><span class="s-name"></span><span class="s-sub"></span>';
    b.querySelector('.s-name').textContent = t.name;
    if (t.been) b.querySelector('.s-name').insertAdjacentHTML('beforeend', '<span class="s-been">Been there</span>');
    b.querySelector('.s-sub').textContent = `${t.chart && titleFor(cat, t.i) !== t.name ? titleFor(cat, t.i) + ' · ' : ''}${where}`;
    b.addEventListener('click', () => { const s = { kind: 'star', i: t.i }; showCard(s); if (sensing) aim(s); });
    return b;
  }));
}

// Turn the view to something (when looking by hand; with the sensors, the arrow at the edge says where to point).
// `up` and `left` (degrees) put it above or left of the middle of the screen.
function aim(s, up = 0, left = 0) {
  sel = s;
  if (sensing) { dirty = true; return; }
  const { alt, az } = altAz(selLocal(s));
  const to = Math.min(Math.max(alt - up, -10), 80);
  const daz = ((az + left / Math.max(0.3, Math.cos(alt * DEG)) - view.az + 540) % 360) - 180;
  aimAnim = { from: { az: view.az, alt: view.alt }, daz, to, t0: performance.now() };
}
function stepAim() {
  const k = Math.min(1, (performance.now() - aimAnim.t0) / 900), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  view.az = (aimAnim.from.az + aimAnim.daz * e + 360) % 360;
  view.alt = aimAnim.from.alt + (aimAnim.to - aimAnim.from.alt) * e;
  if (k >= 1) aimAnim = null;
  dirty = true;
}

// ---------- Places sheet ----------

function buildSheets() {
  const skies = $('skies');
  for (const [id, s] of Object.entries(SKIES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sky-opt'; b.dataset.id = id; b.setAttribute('role', 'radio');
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = s.label;
    b.querySelector('span').textContent = s.note;
    b.addEventListener('click', () => { saved.sky = id; save(); compute(); renderPlaces(); });
    skies.append(b);
  }
  const cities = $('cities');
  for (const c of CITIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'city'; b.textContent = c.name;
    b.addEventListener('click', () => {
      setPlace({ name: c.name, lat: c.lat, lon: c.lon, tz: c.tz, how: 'city' });
      $('place-note').textContent = '';
      closeSheets();
    });
    cities.append(b);
  }
  renderPlaces();
}

function renderPlaces() {
  for (const b of $('skies').children) b.setAttribute('aria-checked', String(b.dataset.id === saved.sky));
  for (const b of $('cities').children) b.setAttribute('aria-pressed', String(saved.place.how === 'city' && b.textContent === saved.place.name));
  if (!$('place-note').textContent) {
    $('place-note').textContent = saved.place.how === 'guess'
      ? 'Guessed from your time zone. Share your location, or pick the nearest city, for a sky that lines up.'
      : saved.place.how === 'gps' ? 'Using where your phone says you are, to about 10 km. It stays on this device.' : '';
  }
}

// ---------- Sheets ----------

const SHEETS = ['card', 'list', 'places'];
let opener = null; // the button that opened the list or the places, to hand focus back to when the sheets close
let steps = null; // the sheets' steps in the tab's history: Back closes the sheet that is up (see js/sheets.js)

// `from` is the button that opened it. Then the sheet takes focus (its close button), so a keyboard carries on inside it.
function openSheet(id, from = null) {
  for (const s of SHEETS) if (s !== id) $(s).hidden = true;
  $(id).hidden = false;
  steps?.opened();
  $('scrim').hidden = id === 'card'; // the card leaves the sky usable behind it
  document.body.classList.toggle('carded', id === 'card');
  if (from) { opener = from; $(id).querySelector('.close').focus({ preventScroll: true }); }
  behind();
}
function closeSheets() {
  const open = SHEETS.some(s => !$(s).hidden);
  for (const s of SHEETS) $(s).hidden = true;
  $('scrim').hidden = true;
  if (open) steps?.closed();
  document.body.classList.remove('carded');
  document.title = 'Tonight’s sky · Engage';
  sel = null;
  dirty = true;
  behind(); // before focus goes back: nothing behind a sheet can take it while the sheet is up
  if (open && opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
  opener = null;
}

// The list and Where you are have to be answered or put away, so the sky and its buttons behind them are out of
// reach of a keyboard and a screen reader too, and Tab goes round inside the sheet. The card is not like that: the
// sky stays usable behind it.
const MODAL = ['list', 'places'];
function behind() { $('scope').inert = MODAL.some(id => !$(id).hidden); }
function keepTab(e) {
  const box = MODAL.map($).find(el => !el.hidden);
  if (!box) return;
  const stops = [...box.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
  if (!stops.length) return;
  const at = document.activeElement, first = stops[0], last = stops[stops.length - 1];
  const to = !box.contains(at) ? (e.shiftKey ? last : first) : e.shiftKey && at === first ? last : !e.shiftKey && at === last ? first : null;
  if (to) { e.preventDefault(); to.focus(); }
}

// ---------- Sensors ----------

const touchy = matchMedia('(pointer: coarse)').matches;

async function toggleSensors() {
  if (sensing) { stopSensors(); return; }
  if (typeof DeviceOrientationEvent === 'undefined') { noSensors(); return; }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') { hint('Motion access is off, so drag to look around instead. You can turn it on in Settings for this site.'); return; }
    } catch { noSensors(); return; }
  }
  sensing = true; gotReading = false; compassOffset = null; pose = null;
  hold(); // a phone held up to the sky isn't being touched, and would dim and lock in half a minute
  window.addEventListener('deviceorientationabsolute', onAbsolute);
  window.addEventListener('deviceorientation', onOrient);
  $('sensors').textContent = 'Stop';
  $('sensors').classList.replace('primary', 'secondary');
  hint('Hold your phone up to the sky. If the stars sit a little off, drag sideways to line them up.');
  giveUp = setTimeout(() => { if (sensing && !gotReading) { stopSensors(); noSensors(); } }, 2500);
}
let giveUp = 0; // the wait for a first reading; stopping ends it, so it can't cut short the next try

function stopSensors() {
  sensing = false;
  clearTimeout(giveUp);
  release();
  window.removeEventListener('deviceorientationabsolute', onAbsolute);
  window.removeEventListener('deviceorientation', onOrient);
  if (pose) { const { alt, az } = altAz(basis().f); view.alt = alt; view.az = az; }
  pose = null;
  $('sensors').textContent = 'Point your phone';
  $('sensors').classList.replace('secondary', 'primary');
  hint('Drag to look around. Tap a tag to read it.');
  dirty = true;
}

function noSensors() {
  hint('This device isn’t sharing its compass and tilt, so drag to look around instead.');
  $('sensors').hidden = true;
}

let absolute = false;
function onAbsolute(e) { if (e.alpha != null) { absolute = true; reading(e.alpha, e); } }
function onOrient(e) {
  if (e.alpha == null || e.beta == null) return;
  if (absolute) return; // Android sends both; the absolute one is already in hand
  let alpha = e.alpha;
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    // iPhone: alpha starts wherever the phone was; the compass heading says where north is.
    const off = ((360 - e.webkitCompassHeading - e.alpha) % 360 + 360) % 360;
    compassOffset = compassOffset == null ? off : compassOffset + (((off - compassOffset + 540) % 360) - 180) * 0.05;
    alpha = e.alpha + compassOffset;
  } else if (!e.absolute && !gotReading) hint('This phone’s compass isn’t reporting north, so drag sideways to line the stars up.');
  reading(alpha, e);
}

function reading(alpha, e) {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const p = phonePose(alpha, e.beta, e.gamma, angle);
  gotReading = true;
  if (!pose) pose = p;
  else {
    const k = 0.25;
    const f = norm(pose.forward.map((v, i) => v + (p.forward[i] - v) * k));
    const u0 = pose.up.map((v, i) => v + (p.up[i] - v) * k);
    const r = norm(cross(f, u0));
    pose = { forward: f, right: r, up: cross(r, f) };
  }
  dirty = true;
}

function hint(text) { $('hint').textContent = text; }

// ---------- Input ----------

function bind() {
  window.addEventListener('resize', () => { dirty = true; });
  $('sensors').hidden = !touchy;
  $('sensors').addEventListener('click', toggleSensors);
  $('time').addEventListener('input', e => { offsetMin = +e.target.value; compute(); });
  $('go-dark').addEventListener('click', e => {
    offsetMin = Math.min(720, +e.currentTarget.dataset.min);
    $('time').value = offsetMin;
    compute();
  });
  // The plan's button: the slider goes to the best time, and the list gets out of the way of the sky.
  $('plan-go').addEventListener('click', () => {
    if (!plan?.best) return;
    offsetMin = Math.min(720, plan.best.minutes);
    $('time').value = offsetMin;
    closeSheets();
    compute();
  });
  $('open-place').addEventListener('click', e => openSheet('places', e.currentTarget));
  $('open-list').addEventListener('click', e => { renderList(); openSheet('list', e.currentTarget); });
  $('locate').addEventListener('click', locate);
  $('night').addEventListener('click', () => {
    saved.night = !saved.night; save();
    showNight();
  });
  // Tonight's sky open in another tab: the place, the kind of sky and night vision chosen there are the ones kept,
  // so this tab shows them too, and a city picked there isn't written over by a guess from here.
  watch(KEY, () => {
    Object.assign(saved, load());
    if (!saved.place || saved.place.how === 'guess') saved.place = guessPlace();
    showNight();
    compute();
    renderPlaces();
  });
  $('scrim').addEventListener('click', closeSheets);
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closeSheets);
  $('card-share').addEventListener('click', e => shareStar(e.currentTarget));
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') keepTab(e);
    if (e.key === 'Escape') closeSheets();
    if (e.target.tagName === 'INPUT' || sensing) return;
    const step = view.fov / DEG / 12;
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (keys[e.key]) { e.preventDefault(); view.az = (view.az + keys[e.key][0] + 360) % 360; view.alt = clampAlt(view.alt + keys[e.key][1]); dirty = true; }
  });

  // Drag to look (or, with the sensors on, to correct the compass), pinch or scroll to zoom, tap to pick.
  const pts = new Map();
  let start = null, moved = false, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { start = [e.clientX, e.clientY]; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov: view.fov }; moved = true; }
    aimAnim = null;
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const last = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      view.fov = clampFov(pinch.fov * pinch.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])));
      dirty = true; return;
    }
    if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) moved = true;
    if (!moved) return;
    const dx = e.clientX - last[0], dy = e.clientY - last[1];
    if (sensing) { saved.trim = ((saved.trim - dx / S / DEG) % 360 + 540) % 360 - 180; }
    else { view.az = (view.az - dx / S / DEG + 360) % 360; view.alt = clampAlt(view.alt + dy / S / DEG); }
    dirty = true;
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (!moved) tap(e.clientX, e.clientY);
      else if (sensing) save();
      start = null;
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.fov = clampFov(view.fov * Math.exp(e.deltaY * 0.0012)); dirty = true; }, { passive: false });
}

const clampAlt = a => Math.max(-85, Math.min(89, a));
const clampFov = f => Math.max(18 * DEG, Math.min(120 * DEG, f));

function tap(x, y) {
  const r = canvas.getBoundingClientRect();
  x -= r.left; y -= r.top;
  let best = null, score = Infinity;
  for (const q of placed) {
    const inBox = q.box && x >= q.box.x && x <= q.box.x + q.box.w && y >= q.box.y && y <= q.box.y + q.box.h;
    const d = inBox ? 0 : Math.hypot(q.x - x, q.y - y);
    if (d > q.r) continue;
    const s = d + q.rank * 0.5;
    if (s < score) { score = s; best = q; }
  }
  if (best) showCard(best.hit);
  else if (!$('card').hidden) closeSheets();
}

// ---------- For tests and screenshots ----------

function hooks() {
  return {
    get state() { return { view: { ...view }, place: saved.place, offsetMin, sensing, trim: saved.trim, sel, sunAlt: sky.sunAlt }; },
    at(iso) { testNow = +new Date(iso); compute(); },
    place(lat, lon, name, tz) { setPlace({ name, lat, lon, tz, how: 'city' }); },
    look(az, alt, fovDeg) { view.az = az; view.alt = alt; if (fovDeg) view.fov = fovDeg * DEG; aimAnim = null; dirty = true; },
    aimAt(name) { const t = tags.find(x => x.name === name || cat.names[x.i] === name); const s = { kind: 'star', i: t ? t.i : cat.byName.get(name) }; aim(s); aimAnim = null; const { alt, az } = altAz(selLocal(s)); view.az = az; view.alt = Math.min(Math.max(alt, -10), 80); dirty = true; },
    // Where a named star lands on screen, in CSS pixels.
    where(name) { const t = tags.find(x => x.name === name); const i = t ? t.i : cat.byName.get(name); B = basis(); return project(toLocal(sky.f, starDir(i))); },
    // The tags drawn last frame, with their boxes on screen.
    tags: () => placed.filter(q => q.box).map(q => ({ name: nameOf(q.hit), been: !!q.been, ...q.box })),
    // The tags drawn last frame as a quiet ring alone: below the horizon or too faint to see.
    rings: () => placed.filter(q => q.quiet).map(q => nameOf(q.hit)),
    tag(name) { const t = tags.find(x => x.name === name); return t && { alt: t.alt, seen: t.seen, mag: t.mag }; },
    // The meteor shower marked on the sky, if one is: its name, where its radiant is on screen, and whether it was drawn.
    get shower() { const sh = sky.shower; return sh ? { name: sh.shower.name, alt: altAz(sh.local).alt, drawn: placed.some(q => q.hit.kind === 'shower') } : null; },
    get plan() { return plan; },
    // The constellations named on the sky in the last frame drawn.
    // The names written beside planets, the Moon, bright stars and the shower in the last frame, each with its box on
    // screen, and the planets' and the Moon's discs.
    labels: () => labelled.map(l => ({ ...l })),
    bodies: () => bodies.map(b => ({ ...b })),
    names: () => named.map(n => n.name),
    nameBox: name => named.find(n => n.name === name) || null,
    // Open the card for anything in the sky: { kind: 'planet', name: 'venus' }, { kind: 'moon' }.
    show(s) { showCard(s); },
    // Pretend to be a phone held up: compass heading and tilt.
    sense(alpha, beta, gamma) { sensing = true; gotReading = true; pose = null; reading(alpha, { beta, gamma }); },
    unsense() { stopSensors(); },
    pointing() { return altAz(basis().f); },
  };
}

start().catch(e => { $('loading').textContent = 'Couldn’t chart the sky. Try reloading.'; throw e; });
