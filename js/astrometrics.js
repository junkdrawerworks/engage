// Astrometrics: every star on one wall, hot to cool across and dim to bright up (the Hertzsprung-Russell diagram),
// with filters that each teach something, a card for any star tapped, and the Sun's life along the wall. The rules
// are in js/hr.js; this draws them.
import { loadCatalog } from './catalog.js';
import { describeKind, titleFor } from './log.js';
import { chartFor } from './charts.js';
import { DESTINATIONS } from './destinations.js';
import { LY_PER_PC, roughLy } from './physics.js';
import { dotAt } from './cartography.js';
import {
  FAMILY_NAMES, FILTERS, SUN_LIFE, census, family, hrX, hrXClamped, hrY, lesson, passes, wall,
} from './hr.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plain = s => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const BRIDGE = './';

let cat = null, onWall = null, visited = new Set();
const view = { filter: 'all', pick: null, life: 1, lifeShown: false };
let dots = [];

const lyOf = i => Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
function starIndex(name) {
  if (!name) return null;
  const n = plain(name);
  const d = DESTINATIONS.find(x => plain(x.title) === n || plain(x.star) === n || plain(x.aka) === n);
  if (d && cat.byName.has(d.star)) return cat.byName.get(d.star);
  for (const [k, i] of cat.byName) if (plain(k) === n) return i;
  return null;
}
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
// The stars in the bridge's log, read from its save.
function readVisited() {
  let log = [];
  try { log = JSON.parse(localStorage.getItem('engage.v1') || 'null')?.log || []; } catch { /* nothing kept */ }
  return new Set((Array.isArray(log) ? log : []).map(e => e?.star).filter(i => Number.isInteger(i) && i >= 0 && i < cat.count));
}

// ---------- The wall ----------

const PAD = { l: 62, r: 10, t: 14, b: 30 };
const fmt = n => (n >= 1 ? n.toLocaleString('en-US') : `1/${Math.round(1 / n).toLocaleString('en-US')}`);
function draw() {
  const cv = $('wall'), box = cv.parentElement.getBoundingClientRect();
  const W = Math.round(box.width) || 340, H = Math.round(box.height) || 380, dpr = Math.min(devicePixelRatio || 1, 3);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const w = W - PAD.l - PAD.r, h = H - PAD.t - PAD.b;
  const X = t => PAD.l + hrX(t, w), Y = l => PAD.t + hrY(l, h);
  // Grid: light in powers of a hundred, temperature at a few round values.
  g.font = '500 10px "Chakra Petch", sans-serif'; g.fillStyle = 'rgba(114, 127, 151, 0.95)'; g.strokeStyle = 'rgba(140, 180, 255, 0.10)'; g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const l of [1e6, 1e4, 1e2, 1, 1e-2, 1e-4]) {
    const y = Y(l);
    g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(W - PAD.r, y); g.stroke();
    g.fillText(l === 1 ? '1 Sun' : fmt(l), PAD.l - 4, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const t of [40000, 20000, 10000, 6000, 3000]) {
    const x = X(t);
    g.beginPath(); g.moveTo(x, PAD.t); g.lineTo(x, H - PAD.b); g.stroke();
    g.fillText(`${t.toLocaleString('en-US')} K`, x, H - PAD.b + 4);
  }
  g.fillText('Hotter', PAD.l + 22, H - 12); g.fillText('Cooler', W - PAD.r - 22, H - 12);
  // The stars, the chosen filter's bright and the rest faint.
  dots = [];
  const lit = [];
  for (const i of onWall.stars) {
    const x = X(cat.temp[i]), y = Y(cat.lum[i]), on = passes(cat, i, view.filter, visited);
    if (!on) { g.fillStyle = 'rgba(140, 160, 200, 0.10)'; g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); continue; }
    lit.push([i, x, y]);
  }
  const big = view.filter === 'visited' ? 2.6 : view.filter === 'all' ? 0.9 : 1.3;
  for (const [i, x, y] of lit) {
    const c = cat.color.subarray(i * 3, i * 3 + 3);
    g.fillStyle = `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${view.filter === 'all' ? 0.7 : 0.9})`;
    g.beginPath(); g.arc(x, y, big, 0, Math.PI * 2); g.fill();
    dots.push({ x, y, star: i });
  }
  // The families, where they lie.
  g.font = '600 12px "Chakra Petch", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const tag = (text, t, l) => { const x = X(t), y = Y(l); g.strokeStyle = 'rgba(2, 4, 10, 0.85)'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeText(text, x, y); g.fillStyle = 'rgba(134, 216, 255, 0.85)'; g.fillText(text, x, y); };
  tag(FAMILY_NAMES.dwarf.toUpperCase(), 9500, 3);
  tag(FAMILY_NAMES.giant.toUpperCase(), 3700, 900);
  tag(FAMILY_NAMES.supergiant.toUpperCase(), 9000, 2e5);
  tag(FAMILY_NAMES['white dwarf'].toUpperCase(), 14000, 2e-4);
  // The Sun's life, once the slider has been touched (or a link asked for it): its path, and where it is.
  if (view.lifeShown) {
    const pts = SUN_LIFE.map(s => (s.star ? [cat.temp[cat.byName.get(s.star)], cat.lum[cat.byName.get(s.star)]] : [s.temp, s.lum]));
    g.strokeStyle = 'rgba(255, 181, 74, 0.55)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    g.beginPath();
    pts.forEach(([t, l], k) => { const x = PAD.l + hrXClamped(t, w), y = Y(l); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke(); g.setLineDash([]);
    const [t, l] = pts[view.life], x = PAD.l + hrXClamped(t, w), y = Y(l);
    g.fillStyle = '#ffd27a';
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffb54a'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
    if (SUN_LIFE[view.life].off) { g.fillStyle = '#ffb54a'; g.textAlign = 'left'; g.font = '600 11px "Chakra Petch", sans-serif'; g.fillText('← 120,000 K', x + 12, y); }
  } else {
    // Otherwise the Sun is marked where it is today.
    const x = X(cat.temp[0]), y = Y(cat.lum[0]);
    g.strokeStyle = '#ffd27a'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
  }
  // The star picked.
  if (view.pick != null && onWall.stars.includes(view.pick)) {
    const x = X(cat.temp[view.pick]), y = Y(cat.lum[view.pick]);
    g.strokeStyle = '#86d8ff'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke();
    g.font = '600 12px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    const name = titleFor(cat, view.pick), tw = g.measureText(name).width;
    const right = x + 12 + tw < W - PAD.r;
    g.textAlign = right ? 'left' : 'right';
    g.strokeStyle = 'rgba(2, 4, 10, 0.9)'; g.lineWidth = 3; g.strokeText(name, right ? x + 12 : x - 12, y);
    g.fillStyle = '#e8edf6'; g.fillText(name, right ? x + 12 : x - 12, y);
  }
}

// ---------- Words ----------

function renderLesson() {
  const stars = onWall.stars.filter(i => passes(cat, i, view.filter, visited));
  $('lesson').textContent = lesson(view.filter, census(cat, stars));
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === view.filter)));
}

const FAMILY_SAID = { dwarf: 'On the main sequence', giant: 'Among the giants', supergiant: 'Among the supergiants', 'white dwarf': 'Among the white dwarfs' };
function renderCard() {
  const i = view.pick;
  if (i == null) { $('card').innerHTML = '<p class="hint">Tap a star on the wall for its card.</p>'; return; }
  const title = titleFor(cat, i), tag = chartFor(cat.names[i])?.tag;
  let where;
  if (cat.nocolour[i]) where = 'The catalogue has no colour for it, so it isn’t on the wall.';
  else if (cat.unmeasured[i]) where = 'It has no measured distance, so nobody knows how bright it really is: it isn’t on the wall.';
  else if (!onWall.stars.includes(i)) where = `At ${Math.round(cat.temp[i]).toLocaleString('en-US')} K it is off the wall’s hot edge.`;
  else where = `${FAMILY_SAID[family(cat.temp[i], cat.lum[i])]}: ${(Math.round(cat.temp[i] / 10) * 10).toLocaleString('en-US')} K, ${lumSaid(cat.lum[i])}.`;
  const kind = describeKind(cat.spect[i], cat.temp[i], cat.unmeasured[i] ? null : cat.absmag[i]);
  const links = (i === 0 ? '' : `<a href="${BRIDGE}?course=${encodeURIComponent(cat.names[i])}">Set course</a>`)
    + `<a href="${BRIDGE}tonight.html#star=${encodeURIComponent(cat.names[i])}">In your sky tonight</a>`;
  $('card').innerHTML = `<h2>${esc(title)}${tag && tag !== title ? ` <span class="tag">${esc(tag)}</span>` : ''}</h2>`
    + `<p class="kind">${esc(kind)}${i === 0 ? '' : cat.unmeasured[i] ? ' · distance not measured' : ` · ${esc(roughLy(lyOf(i)))} away`}</p>`
    + `<p class="where">${esc(where)}</p><p class="links">${links}</p>`;
}
const lumSaid = l => (l >= 0.995 && l < 1.05 ? 'as bright as the Sun' : l >= 1
  ? `${l < 10 ? l.toFixed(1).replace(/\.0$/, '') : Number(l.toPrecision(2)).toLocaleString('en-US')} times as bright as the Sun`
  : `${l >= 0.01 ? `${Math.round(l * 100)}%` : `1/${Number((1 / l).toPrecision(2)).toLocaleString('en-US')}`} of the Sun’s light`);

function renderLife() {
  const s = SUN_LIFE[view.life];
  $('life').value = String(view.life);
  $('life').style.setProperty('--fill', `${(view.life / (SUN_LIFE.length - 1)) * 100}%`);
  $('life-out').textContent = s.age == null ? 'at the end' : s.age === 0 ? 'at the start' : `at ${s.age.toLocaleString('en-US', { maximumFractionDigits: 2 })} billion years`;
  $('life').setAttribute('aria-valuetext', s.said);
  $('life-said').textContent = s.said;
}

function pick(i) {
  view.pick = i;
  renderCard();
  draw();
}

function open() {
  const h = fromHash();
  if (FILTERS.some(f => f.id === h.filter)) view.filter = h.filter;
  const life = Number(h.sun);
  if ('sun' in h) { view.lifeShown = true; if (Number.isInteger(life) && life >= 0 && life < SUN_LIFE.length) view.life = life; }
  const i = starIndex(h.star);
  view.pick = i;
  if (i != null) document.title = `${titleFor(cat, i)} · Astrometrics · Engage`;
  renderLesson();
  renderCard();
  renderLife();
  draw();
}

$('filters').innerHTML = FILTERS.map(f => `<button type="button" data-filter="${f.id}" aria-pressed="${f.id === view.filter}">${esc(f.name)}</button>`).join('');
$('filters').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b || !cat) return;
  view.filter = b.dataset.filter;
  history.replaceState(null, '', `#filter=${view.filter}`);
  renderLesson();
  draw();
});
$('wall').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  const d = dotAt(dots, e.clientX - r.left, e.clientY - r.top, 14);
  if (!d) return;
  pick(d.star);
  document.title = `${titleFor(cat, d.star)} · Astrometrics · Engage`;
  history.replaceState(null, '', `#star=${encodeURIComponent(cat.names[d.star])}`);
});
$('life').addEventListener('input', e => { view.life = Number(e.target.value); view.lifeShown = true; renderLife(); draw(); });
window.addEventListener('hashchange', () => cat && open());
window.addEventListener('resize', () => cat && draw());

window.astrometrics = {
  get filter() { return view.filter; },
  get pick() { return view.pick == null ? null : cat.names[view.pick]; },
  dots: () => dots.map(d => ({ x: d.x, y: d.y, name: cat.names[d.star] })),
  ready: false,
};

loadCatalog().then(c => {
  cat = c;
  onWall = wall(cat);
  visited = readVisited();
  const left = [];
  left.push(`${onWall.noColour.toLocaleString('en-US')} stars the catalogue has no colour for`);
  left.push(`${onWall.noDistance.toLocaleString('en-US')} with no measured distance`);
  $('left-out').textContent = `${onWall.stars.length.toLocaleString('en-US')} stars on the wall. Left off: ${left.join(' and ')}, which would draw as a false stripe or at a made-up brightness${onWall.off ? `, and ${onWall.off === 1 ? 'one star' : `${onWall.off} stars`} hotter than its edge (the Ring Nebula’s, at 135,000 K)` : ''}.`;
  open();
  window.astrometrics.ready = true;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

