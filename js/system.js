// The system view: a star's real planets on their orbits at true spacing, seen from above with the temperate zone
// shaded; tap one and the ship glides in to it, lit from its star, with its readings. Below, a planet of your own to
// place anywhere round the star (the survey's "Your stars" opens here). The rules are in js/worlds.js.
import { loadCatalog } from './catalog.js';
import { titleFor } from './log.js';
import { DESTINATIONS } from './destinations.js';
import { LY_PER_PC, formatLy, starColor } from './physics.js';
import { planetAt, jdOf } from './ephemeris.js';
import { readShipPlace } from './contacts.js';
import { worldByName, grows, label } from './classes.js';
import { paintSoon, Globe } from './planet-art.js';
import {
  SYSTEMS, systemFor, planetByName, widthOf, standable, temperateZone, orbitAngle, readout, placed, SIZES, artFor,
  auText, yearText, starDegrees, SUN_DEGREES,
} from './worlds.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const plain = s => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const TAU = Math.PI * 2;

let cat = null;
// What is on screen: the star (its catalogue index, name, title, light), its system, the planet flown in to, the
// scale of the map, and the placed planet.
const view = { i: 0, sel: null, scale: 'inner', t: 500, size: 'earth' };
let hits = [];
const maps = new Map(); // painted surfaces, by planet name

// ---------- Which star ----------

// #star=Proxima Centauri (a catalogue name or a destination's title), and #planet=Proxima b to fly in to one. With
// neither, the star the bridge is holding at.
function fromHash() {
  let text = '';
  try { text = decodeURIComponent(location.hash.slice(1)); } catch { /* a link cut off on its way */ }
  const out = {};
  for (const part of text.split('&')) {
    const [k, ...v] = part.split('=');
    if (k) out[k.trim().toLowerCase()] = v.join('=').trim();
  }
  return out;
}
function starIndex(name) {
  if (!name) return null;
  const n = plain(name);
  const d = DESTINATIONS.find(x => plain(x.title) === n || plain(x.star) === n || plain(x.aka) === n);
  if (d && cat.byName.has(d.star)) return cat.byName.get(d.star);
  for (const [k, i] of cat.byName) if (plain(k) === n) return i;
  return null;
}

function open() {
  const h = fromHash();
  const fromPlanet = h.planet ? planetByName(h.planet) : null;
  let i = starIndex(h.star) ?? (fromPlanet ? cat.byName.get(fromPlanet.system.star) : null);
  const asked = !!(h.star || h.planet);
  if (i == null) i = readShipPlace().star;
  if (!(i >= 0 && i < cat.count)) i = 0;
  view.i = i;
  view.name = cat.names[i];
  view.title = titleFor(cat, i);
  view.star = { lum: cat.lum[i], temp: cat.temp[i], radius: cat.radius[i] };
  view.zone = temperateZone(view.star.lum, view.star.temp);
  view.sys = systemFor(view.name);
  view.unknown = asked && starIndex(h.star) == null && !fromPlanet;
  view.unmeasured = !!cat.unmeasured[i];
  const planets = view.sys?.planets || [];
  // The planet flown in to: the one asked for, else the one the bridge holds in the orbit of (Earth at home).
  const holdAt = { Sol: 'Earth', 'Proxima Centauri': 'Proxima b', 'Luyten\'s Star': 'Luyten b', 'Teegarden\'s Star': 'Teegarden’s Star b', 'TRAPPIST-1': 'TRAPPIST-1 e' }[view.name];
  view.sel = planets.find(p => fromPlanet && p === fromPlanet.planet) || planets.find(p => p.name === holdAt) || planets[0] || null;
  view.scale = 'inner';
  // The placed planet starts where it would get Earth's sunlight.
  view.t = Math.round(toT(Math.sqrt(view.star.lum)));
  document.title = `${view.title} · System view · Engage`;
  render();
  if ('place' in h) $('place').scrollIntoView({ block: 'start' });
}

// ---------- The placed planet's orbit ----------

// The slider runs evenly by ratio, from well inside the zone's dry edge to far beyond its cold one.
const span = () => [view.zone.venus * 0.2, view.zone.mars * 6];
const toAU = t => { const [a, b] = span(); return a * (b / a) ** (t / 1000); };
const toT = au => { const [a, b] = span(); return Math.min(1000, Math.max(0, 1000 * Math.log(au / a) / Math.log(b / a))); };
const placedAU = () => toAU(view.t);

// ---------- The map from above ----------

const shortName = (p, sys) => {
  if (sys.star === 'Sol') return p.name;
  const last = p.name.split(' ').pop();
  return last.length === 1 ? last : p.name;
};

// Where a planet is on its orbit today, as an angle.
function angleOf(p, k, jd) {
  if (view.sys?.star === 'Sol') { const [x, y] = planetAt(p.name.toLowerCase(), jd); return Math.atan2(y, x); }
  return orbitAngle(p, k, jd);
}

// The farthest the map reaches: every planet on "the whole system"; on "inner planets", out past the zone.
function reach() {
  const planets = view.sys?.planets || [];
  const zoneEdge = view.zone.mars * 1.12;
  const all = Math.max(zoneEdge, ...planets.map(p => p.au * 1.06), placedAU() * 1.06);
  const inner = Math.max(zoneEdge, placedAU() * 1.06);
  return view.scale === 'all' || !wide() ? all : inner;
}
// A system whose planets reach far beyond its zone (the Sun's giants) gets a choice of scale.
const wide = () => (view.sys?.planets.at(-1)?.au || 0) > view.zone.mars * 3;

function drawMap() {
  const canvas = $('orrery');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 22;
  const k = R / reach();
  const ring = (au, style, width = 1, dash = []) => {
    g.beginPath(); g.arc(cx, cy, au * k, 0, TAU); g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([]);
  };

  // The zone: shaded between its cautious edges, with the wider edges dashed.
  const z = view.zone;
  if (!view.unmeasured) {
    g.beginPath(); g.arc(cx, cy, z.outer * k, 0, TAU); g.arc(cx, cy, z.inner * k, 0, TAU, true);
    g.fillStyle = 'rgba(98, 214, 140, 0.16)'; g.fill();
    ring(z.venus, 'rgba(98, 214, 140, 0.32)', 1, [3, 4]);
    ring(z.mars, 'rgba(98, 214, 140, 0.32)', 1, [3, 4]);
  }

  // The star.
  const c = starColor(view.star.temp).map(v => Math.round(v * 255));
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 18);
  glow.addColorStop(0, `rgba(${c}, 1)`); glow.addColorStop(0.3, `rgba(${c}, 0.8)`); glow.addColorStop(1, `rgba(${c}, 0)`);
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 18, 0, TAU); g.fill();

  // The planets, each where it is today.
  hits = [];
  const jd = jdOf(new Date());
  const planets = view.sys?.planets || [];
  planets.forEach((p, n) => {
    if (p.au * k > R + 4) return;
    ring(p.au, p === view.sel ? 'rgba(255, 181, 74, 0.7)' : 'rgba(134, 190, 255, 0.28)', p === view.sel ? 1.5 : 1);
  });
  planets.forEach((p, n) => {
    if (p.au * k > R + 4) return;
    const a = angleOf(p, n, jd);
    const x = cx + Math.cos(a) * p.au * k, y = cy - Math.sin(a) * p.au * k;
    const size = p === view.sel ? 26 : 18;
    const map = maps.get(p.name);
    if (map?.thumb) g.drawImage(map.thumb, x - size / 2, y - size / 2, size, size);
    else { g.fillStyle = '#9fb3d6'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
    if (p === view.sel) { g.strokeStyle = 'rgba(255, 181, 74, 0.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, size / 2 + 4, 0, TAU); g.stroke(); }
    g.font = `600 ${p === view.sel ? 13 : 11}px 'Chakra Petch', sans-serif`;
    g.fillStyle = p === view.sel ? '#ffb54a' : 'rgba(205, 213, 227, 0.85)';
    g.textAlign = x > cx ? 'left' : 'right';
    g.fillText(shortName(p, view.sys), x + (x > cx ? 1 : -1) * (size / 2 + 6), y + 4);
    hits.push({ x, y, p });
  });

  // Your planet, on its own dashed orbit.
  const au = placedAU();
  ring(au, 'rgba(255, 181, 74, 0.55)', 1, [5, 5]);
  const pa = Math.PI * 0.62, px = cx + Math.cos(pa) * au * k, py = cy - Math.sin(pa) * au * k;
  g.strokeStyle = '#ffb54a'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 6, 0, TAU); g.stroke();
  g.font = "600 11px 'Chakra Petch', sans-serif"; g.fillStyle = '#ffb54a'; g.textAlign = px > cx ? 'left' : 'right';
  g.fillText('Yours', px + (px > cx ? 11 : -11), py + 4);

  // A scale bar: a round number of AU about a fifth of the way across.
  const want = reach() * 0.4, step = 10 ** Math.floor(Math.log10(want));
  const bar = [5, 2, 1].map(m => m * step).find(v => v <= want) || step;
  g.strokeStyle = 'rgba(205, 213, 227, 0.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(14, H - 14); g.lineTo(14 + bar * k, H - 14); g.moveTo(14, H - 18); g.lineTo(14, H - 10); g.moveTo(14 + bar * k, H - 18); g.lineTo(14 + bar * k, H - 10); g.stroke();
  g.textAlign = 'left'; g.fillStyle = 'rgba(205, 213, 227, 0.8)'; g.font = "500 11px 'Chakra Petch', sans-serif";
  g.fillText(auText(bar), 14, H - 22);
  // What the inner view leaves out.
  const out = planets.filter(p => p.au * k > R + 4);
  if (out.length) { g.textAlign = 'right'; g.fillText(`${out[0].name}${out.length > 1 ? ' and beyond' : ''}: off this scale`, W - 14, H - 14); }
}

// ---------- Painting the planets ----------

const seedOf = name => { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 9999 + 1; };
async function paintAll() {
  const sys = view.sys;
  for (const p of sys?.planets || []) {
    if (maps.has(p.name)) continue;
    const map = await paintSoon(artFor(p, view.star), seedOf(p.name), 192, () => view.sys !== sys);
    if (!map) return;
    const c = document.createElement('canvas');
    const globe = new Globe(c, [-0.5, 0.3, 0.8]);
    globe.setMap(map);
    globe.draw(0.6, 48);
    maps.set(p.name, { map, thumb: c });
    drawMap();
    if (p === view.sel) showClose(false);
  }
}

// ---------- Flying in ----------

let closeGlobe = null, glide = null;
function showClose(animate = true) {
  const p = view.sel;
  $('close').hidden = !p;
  if (!p) return;
  const filed = worldByName(p.name);
  const cls = filed?.cls;
  const lab = filed && grows(filed.world);
  const links = [
    standable(p) ? `<a class="to-file beam" href="away.html#world=${encodeURIComponent(p.name)}">Beam down <span aria-hidden="true">→</span></a>` : '',
    cls ? `<a class="to-file" href="survey.html#${encodeURIComponent(cls.id)}">${esc(label(cls))} file <span aria-hidden="true">→</span></a>` : '',
    lab ? `<a class="to-file" href="xeno.html#world=${encodeURIComponent(p.name)}">Grow a creature <span aria-hidden="true">→</span></a>` : '',
  ].filter(Boolean);
  const kind = cls ? (filed.world.misfit ? `On the ${label(cls)} file, though it doesn’t fit it` : `${label(cls)}${cls.candidate ? ', a candidate' : ''}`) : null;
  const rows = readout(p, view.star);
  $('close-text').innerHTML = `
    <p class="eyebrow">${view.sys.star === 'Sol' ? 'Home system' : `${esc(view.title)} · ${esc(formatLy(dist()))} from Sol`}</p>
    <h2>${esc(p.name)}</h2>
    ${kind ? `<p class="kind">${esc(kind)}</p>` : ''}
    <dl class="readings">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${standable(p) ? '' : '<p class="no-ground">A giant: no ground to stand on, so no away team.</p>'}
    <p class="doors">${links.join('')}</p>
    <p class="src">${esc(p.src)}${p.least ? '. Its mass is a minimum, from its star’s wobble.' : '.'}</p>`;
  drawStarSize(p);
  const map = maps.get(p.name)?.map;
  if (!map) { drawClose(0); return; }
  closeGlobe = new Globe(document.createElement('canvas'), [-0.86, 0.3, 0.42]);
  closeGlobe.setMap(map);
  glide = { from: performance.now(), animate: animate && !still.matches };
  requestAnimationFrame(frame);
}
const dist = () => Math.hypot(...cat.pos.subarray(view.i * 3, view.i * 3 + 3)) * LY_PER_PC;

function frame(now) {
  if (!glide) return;
  const t = glide.animate ? Math.min(1, (now - glide.from) / 1400) : 1;
  drawClose(1 - (1 - t) ** 3, now);
  if (t < 1 || !still.matches) requestAnimationFrame(frame);
}

function drawClose(k, now = 0) {
  const canvas = $('close-view');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#02040a'; g.fillRect(0, 0, W, H);
  // A few faint stars behind, the same ones each time for this planet.
  let s = seedOf(view.sel.name);
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 70; n++) { g.fillStyle = `rgba(220, 230, 255, ${0.2 + r() * 0.5})`; g.fillRect(r() * W, r() * H, 1.2, 1.2); }
  // The star's light from the left, off the screen.
  const c = starColor(view.star.temp).map(v => Math.round(v * 255));
  const wash = g.createLinearGradient(0, 0, W * 0.5, 0);
  wash.addColorStop(0, `rgba(${c}, 0.22)`); wash.addColorStop(1, `rgba(${c}, 0)`);
  g.fillStyle = wash; g.fillRect(0, 0, W, H);
  if (!closeGlobe) return;
  const size = Math.round(Math.min(W * 0.9, H * 1.2));
  closeGlobe.draw(still.matches ? 0.6 : 0.6 + now / 40000, Math.min(size * dpr, 400) | 0);
  const shown = size * (0.18 + 0.82 * k);
  g.globalAlpha = Math.min(1, 0.3 + k);
  g.drawImage(closeGlobe.canvas, W / 2 - shown / 2 + (1 - k) * W * 0.25, H / 2 - shown / 2, shown, shown);
  g.globalAlpha = 1;
}

// The star from this orbit, beside the Sun from Earth, the two to one scale.
function drawStarSize(p) {
  const canvas = $('star-size');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 96 * dpr; canvas.height = 48 * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const star = starDegrees(view.star.radius, p.au);
  const big = Math.max(star, SUN_DEGREES);
  const px = d => Math.max(1, (d / big) * 20);
  const c = starColor(view.star.temp).map(v => Math.round(v * 255));
  g.fillStyle = `rgb(${c})`; g.shadowColor = `rgba(${c}, 0.8)`; g.shadowBlur = 8;
  g.beginPath(); g.arc(26, 24, px(star), 0, TAU); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255, 210, 122, 0.8)'; g.setLineDash([2, 2]); g.lineWidth = 1;
  g.beginPath(); g.arc(72, 24, px(SUN_DEGREES), 0, TAU); g.stroke(); g.setLineDash([]);
}

// ---------- The page ----------

function render() {
  const sys = view.sys, n = sys?.planets.length || 0;
  const where = view.i === 0 ? 'Home' : `${view.title}, ${formatLy(dist())} from Sol`;
  $('sys-intro').textContent = view.unknown ? 'That star isn’t in the charts, so here is the star the ship is at.'
    : view.unmeasured ? `${view.title}: the catalogue has no measured distance for this star, so how bright it really is, and where its temperate zone would be, can’t be worked out.`
    : n ? `${where}. ${n === 8 && view.i === 0 ? 'Eight planets' : `${n} known planets`}, drawn on their orbits at true spacing. Tap one to fly in.`
    : `${where}. No planets are known here yet: place one of your own below.`;
  $('scale-pick').hidden = !wide();
  document.querySelectorAll('[data-scale]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scale === view.scale)));
  $('planet-list').innerHTML = (sys?.planets || []).map(p => `<li><button type="button" data-planet="${esc(p.name)}" aria-pressed="${p === view.sel}">
    <b>${esc(p.name)}</b><span>${esc(auText(p.au))} · ${esc(yearText(p.days))} · ${esc(sizeShort(p))}</span></button></li>`).join('');
  $('planet-list').hidden = !n;
  showClose(false);
  renderPlace();
  $('others').innerHTML = SYSTEMS.map(s => {
    const i = cat.byName.get(s.star);
    return s === sys ? `<b>${esc(titleFor(cat, i))}</b>` : `<a href="#star=${encodeURIComponent(s.star)}">${esc(titleFor(cat, i))}</a>`;
  }).join(' · ') + '. The stars in your captain’s log are under Your stars in the <a href="survey.html#yours">planetary survey</a>.';
  drawMap();
  paintAll();
}
const sizeShort = p => (p.width ? `${Number(p.width.toPrecision(2))} × Earth’s width` : `${p.least ? '≥ ' : ''}${Number(p.mass.toPrecision(2))} × Earth’s mass`);

function renderPlace() {
  const unmeasured = view.unmeasured;
  $('place').hidden = unmeasured;
  if (unmeasured) return;
  const au = placedAU();
  const size = SIZES.find(s => s.id === view.size) || SIZES[2];
  const r = placed(size.width, au, view.star);
  $('place-lead').textContent = `Put a planet anywhere round ${view.title} and see what the survey would make of it. Here a planet gets the sunlight Earth does ${auText(Math.sqrt(view.star.lum))} out.`;
  $('place-out').textContent = auText(au);
  $('place-au').value = String(Math.round(view.t));
  $('place-au').setAttribute('aria-valuetext', `${auText(au)} from ${view.title}`);
  if (!$('sizes').querySelector('input')) {
    $('sizes').insertAdjacentHTML('beforeend', SIZES.map(s => `<label><input type="radio" name="size" value="${s.id}"${s.id === view.size ? ' checked' : ''}><span>${esc(s.name)}</span></label>`).join(''));
  }
  $('place-readings').innerHTML = r.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('place-filed').textContent = r.filed;
  $('place-links').innerHTML = `<a class="to-file" href="survey.html#${encodeURIComponent(r.file.id)}">Read the ${esc(label(r.file))} file <span aria-hidden="true">→</span></a>`
    + `<a class="to-file" href="xeno.html#${encodeURIComponent(r.file.id)}">Grow a creature for it <span aria-hidden="true">→</span></a>`;
}

// ---------- Hands on ----------

function select(p) {
  if (!p || p === view.sel) return;
  view.sel = p;
  document.querySelectorAll('[data-planet]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.planet === p.name)));
  drawMap();
  showClose(true);
  if (matchMedia('(max-width: 899px)').matches) $('close').scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
}

$('planet-list').addEventListener('click', e => {
  const b = e.target.closest('[data-planet]');
  if (b) select(view.sys.planets.find(p => p.name === b.dataset.planet));
});
$('orrery').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const best = hits.map(h => [Math.hypot(h.x - x, h.y - y), h]).sort((a, b) => a[0] - b[0])[0];
  if (best && best[0] < 26) select(best[1].p);
});
document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
  view.scale = b.dataset.scale;
  document.querySelectorAll('[data-scale]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  drawMap();
}));
$('place-au').addEventListener('input', e => { view.t = Number(e.target.value); renderPlace(); drawMap(); });
$('sizes').addEventListener('change', e => { if (e.target.name === 'size') { view.size = e.target.value; renderPlace(); } });
window.addEventListener('hashchange', () => cat && open());
window.addEventListener('resize', () => { if (cat) { drawMap(); if (glide) drawClose(1, performance.now()); } });

window.systemView = {
  get star() { return view.name; },
  get selected() { return view.sel?.name || null; },
  select: name => select(view.sys?.planets.find(p => p.name === name)),
  place(au, size) { view.t = toT(au); if (size) { view.size = size; const r = document.querySelector(`#sizes input[value="${size}"]`); if (r) r.checked = true; } renderPlace(); drawMap(); },
  get painted() { return maps.size; },
  ready: false,
};

loadCatalog().then(c => {
  cat = c;
  open();
  window.systemView.ready = true;
});
