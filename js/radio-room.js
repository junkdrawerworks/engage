// Subspace radio: Earth's broadcasts on the real star map, the real messages in flight, and a hail of your own to any
// star. The rules are in js/radio.js; this draws them and keeps your hails.
import { loadCatalog } from './catalog.js';
import { notesFor, titleFor } from './log.js';
import { CHARTS, chartFor } from './charts.js';
import { DESTINATIONS } from './destinations.js';
import { LY_PER_PC, apparentMag, roughLy } from './physics.js';
import { galactic, dotAt } from './cartography.js';
import { buildIndex, search } from './search.js';
import { keep, unkept, watch } from './store.js';
import {
  FIRST_TV, MAP_LY, arrivalSaid, flights, hailProgress, heardAt, hearing, pickThree, properName, readHails, spanSaid,
  yearLine, yearNow, yearSaid,
} from './radio.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plain = s => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const BRIDGE = './';
const KEY = 'engage.radio.v1';

let cat = null, index = null;
const view = { tab: 'broadcasts', year: 1969, pick: null, chosen: null };
let dots = [];
let saved = { hails: [] }, unsaved = '';
const now = () => yearNow(new Date());

// ---------- Where things are ----------

const lyOf = i => Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
const nameOf = i => {
  const t = titleFor(cat, i), tag = chartFor(cat.names[i])?.tag;
  return tag && tag !== t ? `${t} (${tag})` : t;
};
const known = i => !!(notesFor(cat, i) || chartFor(cat.names[i]));
function starIndex(name) {
  if (!name) return null;
  const n = plain(name);
  const d = DESTINATIONS.find(x => plain(x.title) === n || plain(x.star) === n || plain(x.aka) === n);
  if (d && cat.byName.has(d.star)) return cat.byName.get(d.star);
  for (const [k, i] of cat.byName) if (plain(k) === n) return i;
  return null;
}
const courseLinks = i => (i === 0 ? '' : `<a href="${BRIDGE}?course=${encodeURIComponent(cat.names[i])}">Set course</a>`)
  + `<a href="${BRIDGE}tonight.html#star=${encodeURIComponent(cat.names[i])}">In your sky tonight</a>`;

// #year=1969, #star=Vega (the dial at the year Vega is hearing), #messages, #hail or #hail=Vega.
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

// ---------- Earth's broadcasts ----------

// The map: every star within 100 light years from above the galaxy's plane, the Sun in the middle and the galactic
// centre up, inside the bubble Earth's broadcasts have filled; the shell of the year on the dial lit, its stars bright.
function drawMap() {
  const cv = $('radio-map'), box = cv.parentElement.getBoundingClientRect();
  const size = Math.round(box.width) || 340, dpr = Math.min(devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(size * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  const mid = size / 2, R = mid - 14, k = R / MAP_LY;
  const t = now();
  const at = i => { const [x, y] = galactic(cat.pos.subarray(i * 3, i * 3 + 3)).map(v => v * LY_PER_PC); return [mid - y * k, mid - x * k]; };
  // The bubble, out to where 1936's broadcasts are tonight.
  const edge = (t - FIRST_TV) * k;
  const grad = g.createRadialGradient(mid, mid, 0, mid, mid, edge);
  grad.addColorStop(0, 'rgba(134, 216, 255, 0.10)');
  grad.addColorStop(1, 'rgba(134, 216, 255, 0.03)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(mid, mid, edge, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(134, 216, 255, 0.35)'; g.lineWidth = 1;
  g.beginPath(); g.arc(mid, mid, edge, 0, Math.PI * 2); g.stroke();
  // Distance rings every 20 light years, labelled where each crosses the line straight down from the Sun. The labels'
  // places are kept, so no star's name is written over one.
  const boxes = [];
  g.font = '500 10px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (let d = 20; d <= MAP_LY; d += 20) {
    g.strokeStyle = 'rgba(140, 180, 255, 0.12)'; g.setLineDash([2, 4]);
    g.beginPath(); g.arc(mid, mid, d * k, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    const text = `${d} ly`, w = g.measureText(text).width, y = mid + d * k - 2;
    g.strokeStyle = 'rgba(2, 4, 10, 0.9)'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeText(text, mid, y);
    g.fillStyle = 'rgba(114, 127, 151, 0.95)'; g.fillText(text, mid, y);
    g.lineWidth = 1;
    boxes.push([mid - w / 2 - 2, y - 11, mid + w / 2 + 2, y + 1]);
  }
  // The year on the dial: a band from where its last broadcasts are to where its first are.
  const inner = (t - view.year - 1) * k, outer = (t - view.year) * k;
  g.fillStyle = 'rgba(255, 181, 74, 0.22)';
  g.beginPath(); g.arc(mid, mid, outer, 0, Math.PI * 2); g.arc(mid, mid, Math.max(0, inner), 0, Math.PI * 2, true); g.fill();
  g.strokeStyle = 'rgba(255, 181, 74, 0.8)'; g.lineWidth = 1.2;
  g.beginPath(); g.arc(mid, mid, outer, 0, Math.PI * 2); g.stroke();
  // The stars.
  const shell = new Set(hearing(cat, view.year, t).map(s => s.star));
  dots = [];
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    const ly = lyOf(i);
    if (ly > MAP_LY) continue;
    const [x, y] = at(i), lit = shell.has(i);
    const c = cat.color.subarray(i * 3, i * 3 + 3).map(v => Math.round(v * 255));
    g.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${lit ? 1 : ly <= t - FIRST_TV ? 0.55 : 0.3})`;
    g.beginPath(); g.arc(x, y, lit ? 2.2 : 1.1, 0, Math.PI * 2); g.fill();
    dots.push({ x, y, star: i });
  }
  // Names: the three named for the year, the star picked, and the stars with notes.
  const three = new Set(pickThree(cat, hearing(cat, view.year, t), { known, named: i => properName(cat.names[i]) }).map(s => s.star));
  g.font = '500 11px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const label = (i, strong, name = titleFor(cat, i)) => {
    const [x, y] = at(i), text = name, w = g.measureText(text).width;
    const bx = x + 5 + w < size - 4 ? x + 5 : x - 5 - w;
    const b = [bx, y - 7, bx + w, y + 7];
    if (!strong && boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
    boxes.push(b);
    g.strokeStyle = 'rgba(2, 4, 10, 0.9)'; g.lineWidth = 3; g.strokeText(text, bx, y);
    g.fillStyle = strong ? '#ffb54a' : 'rgba(232, 237, 246, 0.6)'; g.fillText(text, bx, y);
  };
  if (view.pick != null && lyOf(view.pick) <= MAP_LY && view.pick !== 0) {
    const [x, y] = at(view.pick);
    g.strokeStyle = '#86d8ff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
    label(view.pick, true);
  }
  for (const i of three) if (i !== view.pick) label(i, true);
  // Starfleet's charts, by the names Star Trek gave them (Vulcan, Wolf 359, Tellar).
  for (const c of CHARTS) {
    const i = cat.byName.get(c.star);
    if (i > 0 && !three.has(i) && i !== view.pick && lyOf(i) <= MAP_LY) label(i, false, c.tag);
  }
  g.fillStyle = '#ffd27a';
  g.beginPath(); g.arc(mid, mid, 3, 0, Math.PI * 2); g.fill();
}

function renderYear() {
  const t = now(), y = view.year;
  $('dial').value = String(y);
  $('dial-out').textContent = String(y);
  $('dial').style.setProperty('--fill', `${((y - FIRST_TV) / (Number($('dial').max) - FIRST_TV)) * 100}%`);
  $('dial').setAttribute('aria-valuetext', `Hearing ${y} tonight`);
  $('year-line').textContent = yearLine(y);
  const list = hearing(cat, y, t);
  const near = Math.max(0, t - y - 1), far = t - y;
  if (!list.length) {
    const closest = [...Array(cat.count).keys()].filter(i => i > 0 && !cat.unmeasured[i]).reduce((a, i) => (lyOf(i) < lyOf(a) ? i : a), 1);
    const heard = heardAt(lyOf(closest), t).year;
    $('year-count').textContent = `No star is close enough to be hearing ${y} yet: its broadcasts are only ${far < 1 ? 'months' : roughLy(far)} out. The nearest, ${titleFor(cat, closest)}, is hearing ${heard}.`;
  } else {
    $('year-count').textContent = `${list.length === 1 ? 'One catalogued star is' : `${list.length} catalogued stars are`} hearing ${y} tonight, ${near.toFixed(1)} to ${far.toFixed(1)} light years out.`;
  }
  const three = pickThree(cat, list, { known, named: i => properName(cat.names[i]) });
  $('three').innerHTML = three.map(s => `<li><b>${esc(nameOf(s.star))}</b><span>${esc(roughLy(s.ly))} out${cat.names[s.star] && constellation(s.star) ? ` · in ${esc(constellation(s.star))}` : ''}</span><p class="links">${courseLinks(s.star)}</p></li>`).join('');
  document.title = `${y} · Subspace radio · Engage`;
  drawMap();
}
const constellation = i => { const p = cat.pos.subarray(i * 3, i * 3 + 3), d = Math.hypot(...p); return d ? cat.constellationToward([...p].map(v => v / d)) : ''; };

// A star picked on the map or named in the address: what it is hearing tonight, or when the first broadcasts reach it.
function renderPick() {
  const i = view.pick;
  if (i == null) { $('picked').hidden = true; return; }
  const t = now(), name = nameOf(i);
  let text;
  if (i === 0) text = 'Home: everything Earth has ever sent starts here.';
  else if (cat.unmeasured[i]) text = `${name} has no measured distance, so there’s no saying when Earth’s broadcasts reach it.`;
  else {
    const ly = lyOf(i), h = heardAt(ly, t), line = h.year ? yearLine(h.year) : '';
    text = h.year
      ? `${name}, ${roughLy(ly)} out, is hearing ${h.year} tonight.${line ? ` ${line}` : ''}`
      : `${name} is ${roughLy(ly)} out. Earth’s first broadcasts, from 1936, won’t reach it until ${yearSaid(h.from)}.`;
    if (ly > MAP_LY) text += ' It is beyond the edge of this map.';
  }
  $('picked').hidden = false;
  $('picked').innerHTML = `<p>${esc(text)}</p><p class="links">${courseLinks(i)}<a href="#hail=${encodeURIComponent(cat.names[i])}">Hail ${esc(titleFor(cat, i))}</a></p>`;
}

function pickStar(i, moveDial = true) {
  view.pick = i;
  if (moveDial && i != null && i > 0 && !cat.unmeasured[i]) {
    const h = heardAt(lyOf(i), now());
    if (h.year) view.year = h.year;
  }
  renderPick();
  renderYear();
}

// ---------- Messages in flight ----------

function renderMessages() {
  const t = now(), rows = flights(cat, n => cat.byName.get(n), t);
  const groups = [];
  for (const m of new Set(rows.map(r => r.message))) groups.push([m, rows.filter(r => r.message === m)]);
  groups.sort((a, b) => Math.min(...a[1].map(r => r.sent)) - Math.min(...b[1].map(r => r.sent)));
  $('flights').innerHTML = groups.map(([m, rs]) => {
    // A message sent over several days says from when to when: "Sent 24 May to 1 July 1999".
    const days = [...new Set(rs.map(r => r.target.sent))].sort();
    const day = (iso, year = true) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    const sent = rs[0].target.year ? `Sent in ${Math.floor(rs[0].sent)}`
      : days.length > 1 ? `Sent ${day(days[0], days[0].slice(0, 4) !== days[days.length - 1].slice(0, 4))} to ${day(days[days.length - 1])}` : `Sent ${day(days[0])}`;
    return `<li class="flight" data-message="${m.id}"><h3>${esc(m.name)}</h3><p class="from">${esc(sent)}${m.from ? ` from ${esc(m.from)}` : ''}${rs.length > 1 ? `, to ${rs.length} stars` : ''}.</p><p class="what">${esc(m.what)}</p>`
      + `<ul class="targets">${rs.map(r => targetHtml(r)).join('')}</ul></li>`;
  }).join('');
}
function targetHtml(r) {
  const pct = Math.round(r.share * 1000) / 10;
  const said = `${arrivalSaid(r)}${r.arrived ? '' : ` · ${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of the way`}`;
  const tag = r.star != null ? chartFor(cat.names[r.star])?.tag : null;
  return `<li><p class="aim"><b>${esc(r.title)}${tag ? ` <i>(${esc(tag)})</i>` : ''}</b><span>${esc(roughLy(r.ly))} · ${esc(said)}</span></p>`
    + `<div class="bar${r.arrived ? ' done' : ''}" role="img" aria-label="${esc(r.arrived ? 'Arrived' : `${Math.round(pct)}% of the way there`)}"><span style="width:${(r.share * 100).toFixed(2)}%"></span></div>`
    + (r.star != null ? `<p class="links">${courseLinks(r.star)}</p>` : '') + '</li>';
}

// ---------- Your hails ----------

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* nothing kept yet */ }
  return readHails(s);
}
function store() {
  unsaved = keep(KEY, saved);
  $('hail-unsaved').hidden = !unsaved;
  $('hail-unsaved').textContent = unkept(unsaved, 'subspace radio', 'your hails');
}

function renderResults() {
  const q = $('hail-search').value.trim();
  const found = q ? search(index, q, i => apparentMag(cat.absmag[i], Math.max(lyOf(i) / LY_PER_PC, 1e-6))).filter(i => i > 0).slice(0, 6) : [];
  $('hail-results').innerHTML = found.map(i => `<li><button type="button" data-star="${i}"${i === view.chosen ? ' aria-pressed="true"' : ''}><b>${esc(nameOf(i))}</b><span>${cat.unmeasured[i] ? 'Distance not measured' : esc(roughLy(lyOf(i)))}</span></button></li>`).join('')
    || (q ? `<li class="none">No star by that name in the catalogue.</li>` : '');
}

function renderChosen() {
  const i = view.chosen;
  $('hail-chosen').hidden = i == null;
  if (i == null) return;
  const title = titleFor(cat, i), out = saved.hails.find(h => h.star === cat.names[i]);
  const send = $('hail-send');
  if (cat.unmeasured[i]) {
    $('hail-what').textContent = `${title} has no measured distance: nobody can say when a hail would get there.`;
    send.disabled = true; send.textContent = 'Send hail';
  } else if (out && !hailProgress(out.sent, lyOf(i), Date.now()).arrived) {
    $('hail-what').textContent = `Your hail to ${title} is already on its way.`;
    send.disabled = true; send.textContent = 'Hail on its way';
  } else {
    const p = hailProgress(Date.now(), lyOf(i), Date.now());
    $('hail-what').textContent = `${title} is ${roughLy(lyOf(i))} away. A hail sent now arrives in ${monthYear(p.arrives)}, ${spanSaid(p.arrives - Date.now())} from now.`;
    send.disabled = false; send.textContent = out ? 'Hail again' : 'Send hail';
  }
}
const monthYear = ms => { const d = new Date(ms); return d.getUTCFullYear() >= 10000 ? yearSaid(d.getUTCFullYear()) : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

function renderYours() {
  const nowMs = Date.now();
  const rows = saved.hails.map(h => ({ h, i: cat.byName.get(h.star) })).filter(r => r.i != null && !cat.unmeasured[r.i]).sort((a, b) => b.h.sent - a.h.sent);
  $('yours-head').hidden = !rows.length;
  $('yours').innerHTML = rows.map(({ h, i }) => {
    const p = hailProgress(h.sent, lyOf(i), nowMs);
    const sent = new Date(h.sent).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const said = p.arrived ? `Arrived in ${monthYear(p.arrives)}` : `Arrives in ${monthYear(p.arrives)}, ${spanSaid(p.arrives - nowMs)} from now`;
    return `<li class="flight mine" data-star="${esc(h.star)}"><p class="aim"><b>${esc(nameOf(i))}</b><span>Sent ${esc(sent)} · ${esc(roughLy(lyOf(i)))}</span></p>`
      + `<div class="bar${p.arrived ? ' done' : ''}" role="img" aria-label="${esc(p.arrived ? 'Arrived' : `${(p.share * 100).toFixed(p.share < 0.01 ? 4 : 1)}% of the way there`)}"><span style="width:${(p.share * 100).toFixed(4)}%"></span></div>`
      + `<p class="when">${esc(said)}.</p><p class="links">${courseLinks(i)}</p></li>`;
  }).join('');
}

function sendHail() {
  const i = view.chosen;
  if (i == null || cat.unmeasured[i]) return;
  const name = cat.names[i], out = saved.hails.find(h => h.star === name);
  if (out && !hailProgress(out.sent, lyOf(i), Date.now()).arrived) return;
  saved.hails = [{ star: name, sent: Date.now() }, ...saved.hails.filter(h => h.star !== name)];
  store();
  const p = hailProgress(Date.now(), lyOf(i), Date.now());
  $('hail-said').textContent = `Hailing frequencies open. Your hail is on its way to ${titleFor(cat, i)}, and gets there in ${monthYear(p.arrives)}.`;
  renderChosen();
  renderYours();
}

function choose(i) {
  view.chosen = i;
  $('hail-said').textContent = '';
  renderResults();
  renderChosen();
}

// ---------- Tabs ----------

function showTab(tab) {
  view.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  for (const id of ['broadcasts', 'messages', 'hail']) $(id).hidden = id !== tab;
  if (tab === 'broadcasts') renderYear();
  if (tab === 'messages') { renderMessages(); document.title = 'Messages in flight · Subspace radio · Engage'; }
  if (tab === 'hail') { renderYours(); document.title = 'Hail a star · Subspace radio · Engage'; }
}

function open() {
  const h = fromHash();
  if ('hail' in h) {
    const i = starIndex(h.hail);
    if (i != null && i > 0) { $('hail-search').value = titleFor(cat, i); choose(i); }
    showTab('hail');
    return;
  }
  if ('messages' in h) { showTab('messages'); return; }
  const year = Number(h.year);
  if (Number.isInteger(year) && year >= FIRST_TV && year <= Number($('dial').max)) { view.year = year; view.pick = null; renderPick(); }
  const i = starIndex(h.star);
  showTab('broadcasts');
  if (i != null) pickStar(i);
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  history.replaceState(null, '', b.dataset.tab === 'broadcasts' ? `#year=${view.year}` : `#${b.dataset.tab}`);
  showTab(b.dataset.tab);
}));
$('dial').addEventListener('input', e => {
  view.year = Number(e.target.value);
  if (view.pick != null && heardAt(lyOf(view.pick), now()).year !== view.year) { view.pick = null; renderPick(); }
  renderYear();
});
$('dial').addEventListener('change', () => history.replaceState(null, '', `#year=${view.year}`));
$('radio-map').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  const d = dotAt(dots, e.clientX - r.left, e.clientY - r.top, 16);
  if (!d) return;
  pickStar(d.star);
  history.replaceState(null, '', `#star=${encodeURIComponent(cat.names[d.star])}`);
});
$('hail-search').addEventListener('input', renderResults);
$('hail-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const b = $('hail-results').querySelector('[data-star]');
  if (b) { e.preventDefault(); choose(Number(b.dataset.star)); $('hail-search').blur(); }
});
$('hail-results').addEventListener('click', e => { const b = e.target.closest('[data-star]'); if (b) choose(Number(b.dataset.star)); });
$('hail-send').addEventListener('click', sendHail);
window.addEventListener('hashchange', () => cat && open());
window.addEventListener('resize', () => { if (cat && view.tab === 'broadcasts') drawMap(); });

window.radio = {
  get year() { return view.year; },
  get pick() { return view.pick == null ? null : cat.names[view.pick]; },
  get tab() { return view.tab; },
  dots: () => dots.map(d => ({ x: d.x, y: d.y, name: cat.names[d.star] })),
  ready: false,
};

loadCatalog().then(c => {
  cat = c;
  index = buildIndex(cat.names, cat.constellations);
  const thisYear = new Date().getUTCFullYear();
  $('dial').max = String(thisYear);
  $('dial-end').textContent = String(thisYear);
  saved = load();
  watch(KEY, () => { saved = load(); if (view.tab === 'hail') { renderChosen(); renderYours(); } });
  open();
  window.radio.ready = true;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
