// The warp scale explorer: pick a place, and five ships race there from Earth at warp 9.975, your own warp, warp 5,
// light speed and a real ship's speed (Voyager 1 unless another is picked), on a clock that speeds up as they go.
import { apparentMag, starColor, warpSpeed } from './physics.js';
import {
  LANES, GROUPS, PLACES, byId, distanceLy, aboutOn, laneSpeed, tripYears, raceClock,
  formatSpan, formatShort, formatLight, arrivalYear, lightLeft, LADDER, ladderAt, customPlace, COURSE_GROUP,
  REAL_SHIPS, realShip, designShip, kirkSpeed,
  againstStop, THRESHOLD,
} from './warp-scale.js';
import { hold, release } from './wake.js';
import { keep, watch } from './store.js';
import { LIVE, share } from './share.js';
import { fullName, readShip } from './myship.js';
import { encodeDesign } from './shipyard-sim.js';
import { loadCatalog } from './catalog.js';
import { aberrate, doppler, gamma, greenSeenAs, halfSkyDeg, hourOnEarth, speedSaid, FULL_IMPULSE } from './impulse.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, the text size from Bridge settings, and the Keys card (press ?).
setUpRoom({ sound });

const KEY = 'engage.warp.v1';
// Where Engage itself is. The single-file copy points this at the live site.
const BRIDGE = './';
const AWAY = BRIDGE.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const UNIVERSE = 13.8e9;
const LIGHT_KINDS = new Set(['star', 'cluster', 'nebula', 'core', 'galaxy']);

const saved = load();
let place = byId.get(saved.place) || byId.get('core');
let custom = saved.warp;
let real = saved.real; // the real ship in the bottom lane: an id in REAL_SHIPS
// The star the helm is set for, when the bridge's Warp scale link named one that isn't on the ladder already: a rung
// of its own at the top, for as long as the page is open. (The link that brought it carries it; nothing is saved.)
let course = null;
const find = id => (course && id === course.id ? course : byId.get(id));
let trip = null; // the lanes' speeds and times for the place
let race = null; // { start, clock } while the race runs; { done: true } once everyone is there
let lastNote = '';
const cv = $('race');
const g = cv.getContext('2d');
const field = Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random()]);

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* start again */ }
  const warp = Number(s.warp);
  return { place: typeof s.place === 'string' ? s.place : null, warp: warp >= 1 && warp <= 9.99 ? warp : 9, real: realShip(s.real).id };
}
// Only where you left off: nothing is lost if it can't be kept. The helm's course isn't a place to come back to
// (the next visit has no link to say where it is), so with that chosen the last place on the ladder stays the one kept.
function save() {
  if (!place.custom) saved.place = place.id;
  keep(KEY, { place: saved.place || 'core', warp: custom, real });
}

const warpName = w => `Warp ${w.toFixed(2).replace(/\.?0+$/, '')}`;
const times = n => `${n < 10 ? n.toFixed(n < 1 ? 5 : 1).replace(/\.?0+$/, '') : Math.round(n).toLocaleString('en-US')} × light`;
// Your lane carries your ship's name once Bridge settings has given her one.
const yours = readShip();
const laneLabel = l => (l.id === 'custom' ? `${warpName(custom)}${yours ? ` · ${fullName(yours)}` : ''}` : l.label);
// A place's name in the middle of a sentence: "the Moon", "where Voyager was stranded".
const inText = p => p.name.replace(/^(The|Where) /, w => w.toLowerCase());

// The address names the place and the warp factor now on the slider, so it can be copied, bookmarked or shared as it
// stands (it used to repeat whatever "?warp=" the page was opened with, however far the slider had moved since).
// The real ship goes in it too when it isn't Voyager 1, the one a link without it races.
const query = () => `?warp=${custom}${real !== 'voyager' ? `&ship=${encodeURIComponent(real)}` : ''}${course ? `&to=${encodeURIComponent(course.name)}&ly=${course.ly}` : ''}`;
function address() {
  try { history.replaceState(null, '', `${query()}#${place.id}`); } catch { /* fine */ }
  document.title = `${place.name} · Warp scale · Engage`;
}

// ---------- Working out the trip ----------

function plan() {
  const now = new Date();
  const ly = distanceLy(place, now);
  const r = realShip(real);
  const lanes = LANES.map(l => {
    const c = laneSpeed(l, custom, now, real);
    const ship = l.id === 'real' ? { label: r.label, note: r.note } : { label: laneLabel(l) };
    return { ...l, ...ship, c, years: tripYears(ly, c) };
  });
  trip = { ly, lanes, clock: raceClock(lanes.map(l => l.years)), now };
}

// `quiet` is for a place or a warp factor taken from another tab: shown, and not saved again from here.
function select(id, { scroll = false, quiet = false } = {}) {
  const p = find(id);
  if (!p) return;
  place = p;
  race = null;
  plan();
  if (!quiet) save();
  address();
  renderPlace();
  renderLadder();
  setButton();
  note(startNote());
  draw(0);
  aim();
  if (scroll) document.querySelector('.race').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
}

function setCustom(w, quiet = false) {
  custom = Math.min(Math.max(Math.round(w * 100) / 100, 1), 9.99);
  $('custom-warp').value = custom;
  $('custom-out').textContent = custom.toFixed(2).replace(/\.?0+$/, '');
  $('custom-speed').textContent = times(warpSpeed(custom));
  $('custom-warp').style.setProperty('--fill', `${(custom - 1) / 8.99 * 100}%`);
  race = null;
  plan();
  if (!quiet) save();
  address();
  renderPlace();
  setButton();
  note(startNote());
  draw(0);
}

// ---------- The race ----------

function engage() {
  if (race && !race.done) return skip();
  if (!trip) plan();
  if (still.matches) return finish();
  race = { start: performance.now(), rung: 0 };
  lastNote = '';
  setButton();
  note('Engaging…');
  sound.raceStart();
  requestAnimationFrame(tick);
}

function skip() { finish(); }

function finish() {
  race = { done: true };
  setButton();
  note(endNote());
  draw(trip.clock.seconds);
  markArrived(Infinity);
}

function tick(now) {
  if (!race || race.done) return;
  const s = race.frozen ?? (now - race.start) / 1000;
  if (s >= trip.clock.seconds) {
    if (!race.frozen) while (race.rung < trip.lanes.length) sound.laneIn(race.rung++); // the last ones in, at the end
    return finish();
  }
  draw(s);
  const t = trip.clock.at(s);
  const there = trip.lanes.filter(l => l.years <= t);
  markArrived(t);
  // Each ship arriving rings, a little lower than the one before (not a race held still for a picture).
  if (!race.frozen) while (race.rung < there.length) sound.laneIn(race.rung++);
  if (there.length) {
    const l = there[there.length - 1];
    note(`${l.label} is there, after ${formatSpan(l.years)}.`);
  }
  if (!race.frozen) requestAnimationFrame(tick);
}

// Holds the race at a moment, for the screenshots.
function freeze(s) {
  race = { frozen: s };
  setButton();
  tick(0);
}

function setButton() {
  const b = $('go');
  b.textContent = race && !race.done ? 'Skip ahead' : race?.done ? 'Race again' : 'Engage';
  // A race is watched, not touched: the screen stays awake until it ends, is skipped, or another place is picked.
  if (race && !race.done && !race.frozen) hold(); else release();
}

function note(text) {
  if (text === lastNote) return;
  lastNote = text;
  $('race-note').textContent = text;
}

function startNote() {
  return `Five ships leave Earth together for ${inText(place)}. The clock speeds up as they go, so even the slowest gets there.`;
}

function endNote() {
  const [fast] = trip.lanes, light = trip.lanes.find(l => l.id === 'w1'), slow = trip.lanes[trip.lanes.length - 1];
  let s = `At warp 9.975 it’s ${formatSpan(fast.years)}, where light takes ${formatSpan(light.years)}.`;
  if (slow.years > UNIVERSE) s += ` ${slow.label} would need ${Math.round(slow.years / UNIVERSE)} times the age of the universe.`;
  else s += ` ${slow.label} would take ${formatSpan(slow.years)}.`;
  return s;
}

function markArrived(t) {
  document.querySelectorAll('#times tr[data-lane]').forEach(tr => {
    const l = trip.lanes.find(x => x.id === tr.dataset.lane);
    tr.classList.toggle('there', !!race && l.years <= t);
  });
}

// ---------- Drawing ----------

function size() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w: r.width, h: r.height, dpr };
}

function draw(s) {
  if (!trip) return;
  const { w, h, dpr } = size();
  if (!w) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const running = race && !race.done;
  const t = race?.done ? Infinity : race ? trip.clock.at(s) : 0;

  g.fillStyle = '#02040a';
  g.fillRect(0, 0, w, h);
  // Stars drifting past, faster as the race goes on.
  const drift = running ? s * (40 + s * 30) : 0;
  for (const [x, y, b] of field) {
    const px = ((x * w - drift * (0.3 + b)) % w + w) % w, py = y * h;
    const streak = running ? Math.min(40, 2 + s * s * b * 1.4) : 0;
    g.strokeStyle = `rgba(200, 220, 255, ${(running ? 0.06 : 0.15) + b * (running ? 0.22 : 0.45)})`;
    g.lineWidth = b > 0.8 ? 1.4 : 0.8;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + streak + 0.6, py); g.stroke();
  }

  // The clock and where we're going.
  const pad = 16;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#93a0b8';
  g.font = '600 10px "Chakra Petch", sans-serif';
  letter(g, 'ELAPSED', pad, 22, 1.6);
  g.textAlign = 'right';
  letter(g, 'DESTINATION', w - pad, 22, 1.6, 'right');
  g.textAlign = 'left';
  g.fillStyle = '#ffb54a';
  g.font = '600 22px "Chakra Petch", sans-serif';
  const shown = race?.done ? trip.lanes[trip.lanes.length - 1].years : t;
  g.fillText(race ? formatSpan(shown) : '—', pad, 48);
  g.textAlign = 'right';
  g.fillStyle = '#e8edf6';
  g.font = '600 15px "Chakra Petch", sans-serif';
  g.fillText(fit(g, place.name, w / 2 - pad), w - pad, 40);
  g.fillStyle = '#86d8ff';
  g.font = '500 12px "IBM Plex Sans", sans-serif';
  g.fillText(formatLight(trip.ly), w - pad, 56);
  g.textAlign = 'left';

  const top = 72, rowH = (h - top - 8) / trip.lanes.length;
  const x0 = pad + 6, x1 = w - pad - 6;
  trip.lanes.forEach((l, k) => {
    const y = top + k * rowH;
    const p = race ? Math.min(1, t / l.years) : 0;
    const there = race && p >= 1;
    // Label and status. A long label (your lane, with your ship's name in it) is cut short of the status.
    const status = !race ? formatSpan(l.years) : there ? `✓ ${formatSpan(l.years)}` : `${pct(p)} of the way`;
    g.font = '500 12px "Chakra Petch", sans-serif';
    const room = w - pad * 2 - g.measureText(status).width - 14;
    g.font = '600 12px "Chakra Petch", sans-serif';
    g.fillStyle = l.color;
    letter(g, fitSpaced(g, l.label.toUpperCase(), room, 1.2), pad, y + 14, 1.2);
    g.textAlign = 'right';
    g.font = '500 12px "Chakra Petch", sans-serif';
    g.fillStyle = there ? l.color : '#93a0b8';
    g.fillText(status, w - pad, y + 14);
    g.textAlign = 'left';
    // The track.
    const ty = y + rowH * 0.48;
    g.strokeStyle = 'rgba(140, 180, 255, 0.18)';
    g.lineWidth = 1;
    g.setLineDash([2, 4]);
    g.beginPath(); g.moveTo(x0, ty); g.lineTo(x1, ty); g.stroke();
    g.setLineDash([]);
    dot(g, x0, ty, 3.5, '#5aa0ff');
    dot(g, x1, ty, there ? 5 : 3.5, place.color, there ? 14 : 0);
    // The ship and its wake.
    const sx = x0 + (x1 - x0) * p;
    const wake = running && !there && p > 0 ? Math.min(sx - x0, 10 + 70 * Math.min(1, Math.log10(1 + l.c * 1e4) / 8)) : 0;
    if (wake > 1) {
      const grad = g.createLinearGradient(sx - wake, 0, sx, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, l.color);
      g.strokeStyle = grad;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(sx - wake, ty); g.lineTo(sx, ty); g.stroke();
    }
    ship(g, Math.min(sx, x1 - 6), ty, l.color);
    // Speed underneath.
    g.font = '400 11px "IBM Plex Sans", sans-serif';
    g.fillStyle = '#727f97';
    g.fillText(fit(g, `${times(l.c)} · ${l.id === 'custom' ? 'set it below' : l.note}`, w - pad * 2), pad, ty + 19);
  });
}

function letter(ctx, text, x, y, spacing, align = 'left') {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, align === 'right' ? x + spacing : x, y);
    ctx.letterSpacing = '0px';
  } else ctx.fillText(text, x, y);
}

// fit(), for text drawn with `spacing` pixels between its letters.
function fitSpaced(ctx, text, width, spacing) {
  const wide = t => ctx.measureText(t).width + spacing * t.length;
  if (wide(text) <= width) return text;
  let t = text;
  while (t.length > 4 && wide(t + '…') > width) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 4 && ctx.measureText(t + '…').width > width) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function dot(ctx, x, y, r, color, glow = 0) {
  ctx.save();
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function ship(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x - 5, y - 5);
  ctx.lineTo(x - 2, y);
  ctx.lineTo(x - 5, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function pct(p) {
  const v = p * 100;
  if (v === 0) return '0%';
  if (v < 0.001) return 'under 0.001%';
  if (v < 1) return `${Number(v.toPrecision(1))}%`;
  return `${Math.floor(v)}%`;
}

// ---------- The place card ----------

function renderPlace() {
  const p = place, ly = trip.ly;
  const group = [...GROUPS, COURSE_GROUP].find(([id]) => id === p.group)[1];
  const left = LIGHT_KINDS.has(p.kind) ? lightLeft(ly, trip.now) : null;
  const rows = trip.lanes.map(l => {
    const year = arrivalYear(l.years, trip.now);
    return `<tr data-lane="${l.id}"><th scope="row"><i style="background:${l.color}"></i>${esc(l.label)}</th>
      <td>${esc(formatSpan(l.years))}${l.years > UNIVERSE ? '<span class="arrive">longer than the universe has existed</span>' : year ? `<span class="arrive">arrives ${year}</span>` : ''}</td></tr>`;
  }).join('');
  const ticks = LADDER.map(([v, name]) => `<span class="tick" style="left:${(ladderAt(v) * 100).toFixed(2)}%" title="${esc(name)}"><span>${esc(shortTick(name))}</span></span>`).join('');
  $('place').innerHTML = `
    <p class="eyebrow">${esc(group)}</p>
    <h2>${esc(p.name)}</h2>
    <p class="dist">${esc(formatLight(ly))} from Earth${p.live ? ' today' : ''}${left ? ` · the light you see left ${esc(left)}` : ''}</p>
    <div class="scale-bar" aria-hidden="true">${ticks}<span class="mark" style="left:${(Math.min(Math.max(ladderAt(ly), 0), 1) * 100).toFixed(2)}%;--c:${p.color}"></span></div>
    <p class="about">${esc(aboutOn(p, trip.now))}</p>
    ${p.trek ? `<p class="trek"><b>Star Trek</b> ${esc(p.trek)}</p>` : ''}
    <table class="times" id="times"><caption>Leaving Earth now</caption><tbody>${rows}</tbody></table>
    <p class="aside real-line">${esc(realShip(real).line)}</p>
    <p class="aside kirk">${esc(kirkLine(ly))}</p>
    <p class="doors">${[
      p.course && [`${BRIDGE}?course=${encodeURIComponent(p.course)}`, 'Set course on the bridge'],
      p.sky && [`${BRIDGE}tonight.html#star=${encodeURIComponent(p.sky)}`, 'In your sky tonight'],
      p.sight && [`${BRIDGE}tonight.html#sight=${p.sight}`, 'In your sky tonight'],
      p.file && [`${BRIDGE}missions.html#${p.file}`, p.fileText],
    ].filter(Boolean).map(([href, text]) => `<a class="to-file" href="${esc(href)}"${AWAY}>${esc(text)} <span aria-hidden="true">→</span></a>`).join('')}</p>
    <p class="share-row"><button class="text-button" type="button" data-share>Share this race</button></p>
  `;
  markArrived(race?.done ? Infinity : 0);
}

// Your warp factor on Kirk's scale, the original series' (see kirkSpeed), beside the Next Generation's on the race.
function kirkLine(ly) {
  const w = warpName(custom).toLowerCase(), how = 'In the original series the warp factor cubed gave the speed (The Making of Star Trek, 1968; never said on screen)';
  if (custom === 1) return `Kirk’s ${w} was light too. ${how}.`;
  const k = kirkSpeed(custom);
  return `Kirk’s ${w} was slower. ${how}: ${times(k)}, not ${times(warpSpeed(custom)).replace(' × light', '')}, so here in ${formatSpan(tripYears(ly, k))}.`;
}

// The picker under the race: the real ships, then the ships kept in the shipyard (and the one a link brought, if it
// isn't one of them).
function fillPicker() {
  const box = $('real-ship');
  let yard = [];
  try { yard = (JSON.parse(localStorage.getItem('engage.shipyard.v1') || 'null')?.designs || []).map(d => designShip(`yard:${encodeDesign(d)}`)).filter(Boolean); } catch { /* no shipyard */ }
  const mine = designShip(real);
  if (mine && !yard.some(d => d.id === mine.id)) yard.push(mine);
  box.replaceChildren(...REAL_SHIPS.map(r => new Option(r.label, r.id)));
  if (yard.length) {
    const g = document.createElement('optgroup');
    g.label = 'Your shipyard';
    g.append(...[...yard].reverse().map(d => new Option(d.label, d.id)));
    box.append(g);
  }
  box.value = real;
}

// The real ship in the bottom lane, from the picker under the race.
function setReal(id, quiet = false) {
  real = realShip(id).id;
  fillPicker();
  race = null;
  plan();
  if (!quiet) save();
  address();
  renderPlace();
  setButton();
  note(startNote());
  draw(0);
}

// A link to this race: the place, and the warp factor on the slider, on the live site.
function shareRace(button) {
  const mine = trip.lanes.find(l => l.id === 'custom'), light = trip.lanes.find(l => l.id === 'w1');
  return share(button, {
    title: `${place.name}, on Engage’s warp scale`,
    text: `Earth to ${inText(place)}: ${formatSpan(mine.years)} at ${warpName(custom).toLowerCase()}, ${formatSpan(light.years)} for light.`,
    url: `${LIVE}warp.html${query()}#${place.id}`,
  });
}

const shortTick = name => ({ 'light-second': '1 sec', 'light-minute': '1 min', 'light-hour': '1 hr', 'light-day': '1 day', 'light year': '1 yr', '1,000 ly': '1,000 yr', 'million ly': '1M yr' })[name];

// ---------- The ladder ----------

function renderLadder() {
  const now = trip.now;
  const html = [...(course ? [COURSE_GROUP] : []), ...GROUPS].map(([gid, gname]) => {
    // The planets move about, so the Solar System's order changes: Mars is sometimes nearer than the Sun.
    const here = [...PLACES, ...(course ? [course] : [])].filter(p => p.group === gid).map(p => [p, distanceLy(p, now)]).sort((a, b) => a[1] - b[1]);
    const rungs = here.map(([p, ly]) => {
      const at = id => formatShort(tripYears(ly, laneSpeed(LANES.find(l => l.id === id), custom, now)));
      return `<button class="rung${p.headline ? ' headline' : ''}" type="button" data-id="${p.id}" aria-current="${p === place}">
        <span class="rung-name"><b>${esc(p.name)}</b><span>${esc(formatLight(ly))}</span></span>
        <span class="t w9975">${at('w9975')}</span><span class="t w5">${at('w5')}</span><span class="t w1">${at('w1')}</span></button>`;
    }).join('');
    return `<h3 class="rung-group">${esc(gname)}</h3>${rungs}`;
  }).join('');
  $('ladder').innerHTML = html;
}

// ---------- Impulse power ----------

// The whole sky round the ship as she leaves the Sun toward the place on the card (a star with a course; Proxima
// Centauri for anywhere else), drawn so dead ahead is the middle and dead behind is the rim, each ring outward
// another 45 degrees from dead ahead. At speed each star is moved, recoloured and brightened or dimmed as special
// relativity says (js/impulse.js). The stars are the bridge's own catalogue, loaded when the section comes near.
const sv = $('impulse-sky');
const sg = sv.getContext('2d');
let sky = null; // { stars: [[x, y, z, mag, temp]], names: [[index in stars, name]], cat } once the catalogue is in
let beta = 0;
let heading = null; // { name, dir, u, v }

const HEAD_DEFAULT = 'Proxima Centauri';
const SKY_NAMES = ['Sirius', 'Canopus', 'Arcturus', 'Vega', 'Capella', 'Rigel', 'Betelgeuse', 'Aldebaran', 'Antares', 'Polaris', 'Deneb', 'Altair'];

async function loadSky() {
  if (sky) return;
  sky = 'loading';
  drawSky();
  let cat;
  try { cat = await loadCatalog(); } catch { sky = null; drawSky('Couldn’t chart the stars. Try reloading.'); return; }
  const stars = [];
  const index = new Map();
  for (let i = 1; i < cat.count; i++) {
    const x = cat.pos[i * 3], y = cat.pos[i * 3 + 1], z = cat.pos[i * 3 + 2], d = Math.hypot(x, y, z);
    if (!(d > 0)) continue;
    index.set(i, stars.length);
    stars.push([x / d, y / d, z / d, apparentMag(cat.absmag[i], d), cat.temp[i]]);
  }
  const names = SKY_NAMES.map(n => [index.get(cat.byName.get(n)), n]).filter(([k]) => k !== undefined);
  sky = { stars, names, cat, index };
  aim();
}

// The heading: toward the place on the card when it is a star the catalogue has.
function aim() {
  if (!sky || sky === 'loading') return;
  const want = place.course && sky.cat.byName.has(place.course) ? place.course : HEAD_DEFAULT;
  const i = sky.cat.byName.get(want);
  const p = [sky.cat.pos[i * 3], sky.cat.pos[i * 3 + 1], sky.cat.pos[i * 3 + 2]], d = Math.hypot(...p);
  const dir = p.map(v => v / d);
  // Two directions square to it, for where round dead ahead each star is: "up" toward the celestial north pole.
  let u = [-dir[0] * dir[2], -dir[1] * dir[2], 1 - dir[2] * dir[2]];
  const ul = Math.hypot(...u) || 1;
  u = u.map(v => v / ul);
  const v = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  heading = { name: place.course && sky.cat.byName.has(place.course) ? place.name : 'Proxima Centauri', star: sky.index.get(i), dir, u, v };
  drawSky();
}

// Where star k (in sky.stars) is drawn, at the throttle's speed: { x, y } in CSS pixels, how bright it looks and the
// shift in its light.
function seen(k, cx, cy, R) {
  const [x, y, z, mag] = sky.stars[k];
  const { dir, u, v } = heading;
  const cosT = x * dir[0] + y * dir[1] + z * dir[2];
  const cosTp = Math.max(-1, Math.min(1, aberrate(cosT, beta)));
  const d = doppler(cosTp, beta);
  const r = R * Math.acos(cosTp) / Math.PI;
  const phi = Math.atan2(x * v[0] + y * v[1] + z * v[2], x * u[0] + y * u[1] + z * u[2]);
  // Seen from inside, with north up, east is to the left: `v` points west, so it is drawn to the right.
  return { x: cx + r * Math.sin(phi), y: cy - r * Math.cos(phi), mag: mag - 5 * Math.log10(d), d };
}

function skySize() {
  const r = sv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (sv.width !== w || sv.height !== h) { sv.width = w; sv.height = h; }
  return { w: r.width, h: r.height, dpr };
}

function drawSky(message) {
  const { w, h, dpr } = skySize();
  if (!w) return;
  sg.setTransform(dpr, 0, 0, dpr, 0, 0);
  sg.globalCompositeOperation = 'source-over';
  sg.fillStyle = '#02040a';
  sg.fillRect(0, 0, w, h);
  if (!heading || typeof sky !== 'object' || !sky) {
    sg.fillStyle = '#93a0b8';
    sg.font = '500 13px "IBM Plex Sans", sans-serif';
    sg.textAlign = 'center';
    sg.fillText(message || 'Charting the stars…', w / 2, h / 2);
    sg.textAlign = 'left';
    return;
  }
  const cx = w / 2, cy = h / 2 + 8, R = Math.min(w, h) / 2 - 22;
  // Rings: 45, 90 and 135 degrees from dead ahead, and the rim, dead behind.
  sg.strokeStyle = 'rgba(140, 180, 255, 0.14)';
  sg.lineWidth = 1;
  for (const a of [45, 90, 135, 180]) { sg.beginPath(); sg.arc(cx, cy, R * a / 180, 0, Math.PI * 2); sg.stroke(); }
  // The stars, faintest first so the bright ones are on top. Each is a dot of its own colour, not light added up:
  // where the sky crowds ahead, thousands share a few degrees, and added up they made one white blot.
  const limit = 6.2;
  for (let k = 0; k < sky.stars.length; k++) {
    const s = seen(k, cx, cy, R);
    if (s.mag > limit) continue;
    const f = Math.pow(10, -0.4 * (s.mag - limit));
    const size = Math.min(0.5 + 0.5 * Math.pow(f, 0.26), 3.6);
    const alpha = Math.min(0.9, 0.18 + 0.1 * Math.pow(f, 0.4));
    const [r, g, b] = starColor(Math.min(Math.max(sky.stars[k][4] * s.d, 1200), 40000));
    sg.fillStyle = `rgba(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0}, ${alpha.toFixed(3)})`;
    if (size < 1.1) sg.fillRect(s.x - size / 2, s.y - size / 2, size, size);
    else { sg.beginPath(); sg.arc(s.x, s.y, size, 0, Math.PI * 2); sg.fill(); }
  }
  // Half the sky: everything that was in front of the ship at rest is inside this circle.
  const half = R * halfSkyDeg(beta) / 180;
  sg.strokeStyle = 'rgba(255, 181, 74, 0.75)';
  sg.setLineDash([4, 5]);
  sg.beginPath(); sg.arc(cx, cy, half, 0, Math.PI * 2); sg.stroke();
  sg.setLineDash([]);
  // Its label goes below the circle, in a dark box, and the names keep off it and off each other.
  sg.font = '600 10px "Chakra Petch", sans-serif';
  const hw = sg.measureText('HALF THE SKY').width + 14, hy = Math.min(cy + half + 16, cy + R - 4);
  const taken = [[cx - hw / 2 - 4, hy - 11, cx + hw / 2 + 4, hy + 5], [cx - 14, cy - 14, cx + 14, cy + 14]];
  sg.fillStyle = 'rgba(2, 4, 10, 0.8)';
  sg.fillRect(cx - hw / 2, hy - 10, hw, 14);
  sg.fillStyle = '#ffb54a';
  sg.textAlign = 'center';
  letter(sg, 'HALF THE SKY', cx, hy, 1.2);
  // A few bright stars by name, and the heading in the middle.
  sg.font = '500 11px "IBM Plex Sans", sans-serif';
  sg.textAlign = 'left';
  for (const [k, name] of sky.names) {
    if (k === heading.star) continue;
    const s = seen(k, cx, cy, R);
    const box = [s.x + 4, s.y - 8, s.x + 8 + sg.measureText(name).width, s.y + 6];
    if (taken.some(t => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
    taken.push(box);
    // Edged in the dark of the sky, so a name stays readable over the crowd of stars ahead at speed.
    sg.lineWidth = 3;
    sg.lineJoin = 'round';
    sg.strokeStyle = 'rgba(2, 4, 10, 0.85)';
    sg.strokeText(name, s.x + 6, s.y + 4);
    sg.fillStyle = 'rgba(200, 212, 235, 0.85)';
    sg.fillText(name, s.x + 6, s.y + 4);
  }
  sg.strokeStyle = '#86d8ff';
  sg.lineWidth = 1.4;
  sg.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    sg.moveTo(cx + sx * 10, cy + sy * 5); sg.lineTo(cx + sx * 10, cy + sy * 10); sg.lineTo(cx + sx * 5, cy + sy * 10);
  }
  sg.stroke();
  // Labels in the corners: where she's bound, and dead behind.
  sg.font = '600 10px "Chakra Petch", sans-serif';
  sg.fillStyle = '#93a0b8';
  letter(sg, 'HEADING FOR', 14, 20, 1.4);
  sg.fillStyle = '#86d8ff';
  sg.font = '600 13px "Chakra Petch", sans-serif';
  sg.fillText(heading.name, 14, 37);
  sg.textAlign = 'right';
  sg.font = '600 10px "Chakra Petch", sans-serif';
  sg.fillStyle = '#93a0b8';
  letter(sg, 'RIM: DEAD BEHIND', w - 14, 20, 1.4, 'right');
  sg.textAlign = 'left';
}

function setThrottle(b) {
  beta = Math.min(Math.max(Number(b) || 0, 0), 0.999);
  $('throttle').value = beta;
  $('throttle').style.setProperty('--fill', `${(beta / 0.999 * 100).toFixed(1)}%`);
  $('impulse-speed').textContent = speedSaid(beta);
  $('full-impulse').classList.toggle('on', beta === FULL_IMPULSE);
  const ahead = doppler(1, beta), behind = doppler(-1, beta);
  const times = d => (d >= 10 ? Math.round(d) : d.toFixed(d < 1 ? 2 : 1)).toString();
  const rows = beta === 0
    ? [['Half the sky', 'Everything up to 90° from dead ahead, as it should be.'], ['Ship’s clock', '1 hour aboard is 1 hour on Earth.'], ['Dead ahead', 'Light arrives as it left: green as green.'], ['Dead behind', 'The same.']]
    : [
      ['Half the sky', `Squeezed within ${Math.round(halfSkyDeg(beta))}° of dead ahead.`],
      ['Ship’s clock', `1 hour aboard is ${hourOnEarth(beta)} on Earth.`],
      ['Dead ahead', `Light arrives at ${times(ahead)} times its frequency: green as ${greenSeenAs(ahead)}.`],
      ['Dead behind', `At ${times(behind)} times: green as ${greenSeenAs(behind)}.`],
    ];
  $('impulse-read').innerHTML = rows.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('');
  sv.setAttribute('aria-label', beta === 0
    ? 'The whole sky round the ship at a full stop: dead ahead in the middle, dead behind round the edge.'
    : `The whole sky at ${speedSaid(beta).split(',')[0]}: the stars crowd into a circle ${Math.round(halfSkyDeg(beta))} degrees round dead ahead, bluer in front and redder behind.`);
  drawSky();
}

$('throttle').addEventListener('input', e => setThrottle(e.target.value));
$('full-impulse').addEventListener('click', () => setThrottle(FULL_IMPULSE));
setThrottle(0);
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); loadSky(); } }, { rootMargin: '600px 0px' });
  io.observe($('impulse'));
} else loadSky();

// ---------- Start ----------

// A link cut off or mangled on its way (a stray "%" isn't an address at all) names no place: the last one stays.
// `to` is the star the helm was set for, from the bridge's Warp scale link (see customPlace in warp-scale.js).
const fromLink = () => {
  const q = new URLSearchParams(location.search);
  const warp = Number(q.get('warp'));
  let id = '';
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { /* not a place */ }
  const asked = q.get('ship');
  const ship = asked ? (designShip(asked)?.id ?? REAL_SHIPS.find(r => r.id === asked)?.id ?? null) : null;
  return { id, warp: warp >= 1 && warp <= 9.99 ? warp : null, ship, to: q.has('to') ? customPlace(q.get('to'), Number(q.get('ly'))) : null };
};

$('go').addEventListener('click', engage);
// Your warp pushed hard against its stop, three times running: what happened at warp 10 (js/warp-scale.js).
let stopHits = [];
$('custom-warp').addEventListener('input', e => {
  const was = custom;
  setCustom(Number(e.target.value));
  if (custom < 9.99 || was >= 9.99) return;
  const r = againstStop(stopHits, performance.now());
  stopHits = r.hits;
  if (r.said) note(THRESHOLD);
});
fillPicker();
$('real-ship').addEventListener('change', e => setReal(e.target.value));
$('place').addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) shareRace(b); });
$('ladder').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) select(b.dataset.id, { scroll: true });
});
// The warp scale open in another tab: the place and the warp factor last chosen there are the ones kept, so this tab
// shows them too, unless a race is running here.
watch(KEY, () => {
  if (race && !race.done) return;
  const s = load(), p = byId.get(s.place);
  if (s.warp !== custom) setCustom(s.warp, true);
  if (s.real !== real) setReal(s.real, true);
  if (p && p !== place && !place.custom) select(p.id, { quiet: true });
});
addEventListener('hashchange', () => { const { id } = fromLink(); if (find(id) && id !== place.id) select(id); });
addEventListener('resize', () => { if (!race || race.done) draw(race ? trip.clock.seconds : 0); drawSky(); });
document.fonts?.ready.then(() => { if (!race || race.done) draw(race ? trip.clock.seconds : 0); drawSky(); });

window.warpScale = {
  select, engage, skip, setCustom, setReal, freeze,
  // Impulse power: the throttle, and where a star (by name) is drawn on the sky, for the tests.
  impulse: {
    set: setThrottle,
    get ready() { return !!heading; },
    get heading() { return heading?.name; },
    where(name) {
      const k = sky?.index?.get(sky.cat.byName.get(name));
      if (k === undefined || !heading) return null;
      const r = sv.getBoundingClientRect(), R = Math.min(r.width, r.height) / 2 - 22;
      const s = seen(k, r.width / 2, r.height / 2 + 8, R);
      return { x: s.x, y: s.y, fromMiddle: Math.hypot(s.x - r.width / 2, s.y - r.height / 2 - 8) / R * 180, d: s.d };
    },
  },
  get place() { return place.id; },
  get trip() { return trip; },
  get running() { return !!race && !race.done; },
  get done() { return !!race?.done; },
};

{
  const link = fromLink();
  if (link.warp) custom = link.warp;
  if (link.ship) real = link.ship;
  fillPicker();
  // The helm's course: a rung of its own, or the rung the ladder has for that star already. The race starts there,
  // unless the link names another place after its "#".
  if (link.to?.custom) course = link.to;
  if (find(link.id)) place = find(link.id);
  else if (link.to) place = link.to;
  $('custom-warp').value = custom;
  setCustom(custom);
  select(place.id);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
