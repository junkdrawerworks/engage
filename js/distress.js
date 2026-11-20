// The distress call: the survivors' clues, Earth's real sky to find them on, the air running down, and the debrief
// in their own sky. The rules are in js/distress-sim.js; the chart is js/skychart.js.
import { loadCatalog, constellationLabels } from './catalog.js';
import { titleFor } from './log.js';
import { LY_PER_PC, roughLy } from './physics.js';
import { SkyChart, unit } from './skychart.js';
import {
  AIR, CLUE_ORDER, EYE_MAG, breathe, candidates, clean, clueText, colourOf, daySeed, debrief, earthMag, lockOn,
  newCall, record, skyFromStar, standing, today,
} from './distress-sim.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, the text size from Bridge settings, and the Keys card (press ?).
setUpRoom({ sound });

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'engage.distress.v1';
const BRIDGE = './';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked: the call still plays */ } };

let cat = null, list = [], chart = null, earth = null;
let call = null, pick = null, sky = 'earth', last = 0;
const hold = { on: false }; // the walk-through stops the clock

const lyOf = i => Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
const dirOf = i => unit([cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]]);
const colOf = i => [cat.color[i * 3], cat.color[i * 3 + 1], cat.color[i * 3 + 2]];
const garble = id => ({ colour: '…our ▒▒▒ is ▒ ▒▒▒▒▒▒ star…', sunIn: '…your Sun ▒▒ ▒ ▒▒▒▒▒ star in ▒▒▒▒…', sunMag: '…your Sun ▒▒▒▒▒▒ at magnitude ▒.▒…', brightest: '…the ▒▒▒▒▒▒▒▒ star in our ▒▒▒▒▒ is ▒▒▒▒▒▒…', years: '…this ▒▒▒▒▒▒ has been ▒▒▒▒▒▒▒▒▒ ▒▒ years…' })[id];

// ---------- Earth's sky, and theirs ----------

function earthSky() {
  const stars = [];
  for (let i = 1; i < cat.count; i++) {
    const m = earthMag(cat, i);
    if (m <= 5.8) stars.push({ i, dir: dirOf(i), mag: m, col: colOf(i) });
  }
  stars.sort((a, b) => a.mag - b.mag);
  return { stars, lines: cat.lines.map(([a, b]) => [dirOf(a), dirOf(b)]), names: constellationLabels(cat), limit: 5.5 };
}
// Their sky has no stick figures: Earth's constellations are the shapes stars at many distances make from here, and
// from another star the lines would only cross it at random.
function theirSky(i) {
  const stars = skyFromStar(cat, i, 6).map(s => ({ ...s, col: s.i === 0 ? [1, 0.93, 0.8] : colOf(s.i) }));
  return { stars, lines: [], names: [], limit: 5.8 };
}

// Labels: the first-magnitude stars, faintly, to steer by; the star picked; and the wrong locks, crossed out. In
// their sky, our Sun and their brightest star.
function marks(g, at, { W, H }) {
  const label = (text, p, colour, dx = 9) => {
    if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
    g.font = '600 12px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    const right = p.x + dx + g.measureText(text).width < W - 4;
    g.textAlign = right ? 'left' : 'right';
    g.strokeStyle = 'rgba(2, 4, 10, 0.9)'; g.lineWidth = 3; g.lineJoin = 'round';
    g.strokeText(text, right ? p.x + dx : p.x - dx, p.y);
    g.fillStyle = colour; g.fillText(text, right ? p.x + dx : p.x - dx, p.y);
  };
  const ring = (p, colour, r = 9) => { if (!p) return; g.strokeStyle = colour; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); };
  if (sky === 'theirs' && call) {
    const s = chart.stars.find(x => x.i === 0), b = chart.stars.find(x => x.i === call.sky.brightest);
    if (s) { const p = at(s.dir); ring(p, '#ffd27a', 10); label(`Our Sun · ${fmtMag(s.mag)}`, p, '#ffd27a', 14); }
    if (b) { const p = at(b.dir); ring(p, '#86d8ff', 9); label(`${titleFor(cat, b.i)} · ${fmtMag(b.mag)}`, p, '#86d8ff', 13); }
    return;
  }
  for (const s of chart.stars) {
    if (s.mag > 0.9) break;
    if (s.i === pick) continue;
    label(titleFor(cat, s.i), at(s.dir), 'rgba(200, 212, 235, 0.6)', 7);
  }
  if (call) {
    g.strokeStyle = 'rgba(255, 120, 100, 0.85)'; g.lineWidth = 2;
    for (const j of call.wrong) {
      const p = at(dirOf(j));
      if (!p) continue;
      g.beginPath(); g.moveTo(p.x - 6, p.y - 6); g.lineTo(p.x + 6, p.y + 6); g.moveTo(p.x + 6, p.y - 6); g.lineTo(p.x - 6, p.y + 6); g.stroke();
    }
    if (call.over) { const p = at(dirOf(call.star)); ring(p, call.over === 'found' ? '#4fd1a5' : '#ff8a6a', 12); label(titleFor(cat, call.star), p, '#e8edf6', 16); }
  }
  if (pick != null && pick !== call?.star) { const p = at(dirOf(pick)); ring(p, '#ffb54a'); label(titleFor(cat, pick), p, '#e8edf6', 13); }
}
const fmtMag = m => `magnitude ${m < 0 ? '−' : ''}${Math.abs(m).toFixed(1)}`;

function showSky(which) {
  sky = which;
  document.querySelectorAll('[data-sky]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sky === which)));
  $('chart-tag').textContent = which === 'theirs' ? `The sky from ${titleFor(cat, call.star)}` : 'Earth’s sky';
  $('chart-tag').classList.toggle('theirs', which === 'theirs');
  if (which === 'theirs') {
    const t = theirSky(call.star);
    chart.set(t);
    chart.turnTo(t.stars.find(s => s.i === 0).dir, 100 * Math.PI / 180);
  } else {
    chart.set(earth);
    chart.turnTo(dirOf(call?.over ? call.star : pick ?? call?.star ?? 1), 100 * Math.PI / 180);
  }
}

// ---------- The call ----------

function renderSignal() {
  $('signal').innerHTML = CLUE_ORDER.map((id, k) => (k < call.open
    ? `<li>${esc(clueText(cat, id, call.sky))}</li>`
    : `<li class="garbled" aria-label="Not yet made out">${esc(garble(id))}</li>`)).join('');
  const more = call.open < CLUE_ORDER.length && !call.over;
  $('clean').disabled = !more;
  $('clean-cost').textContent = more ? `· costs ${AIR.clean}% air` : '· nothing more to make out';
}
function renderAir() {
  const a = Math.max(0, call.air);
  $('air-fill').style.width = `${a}%`;
  $('air-left').textContent = `${Math.ceil(a)}%`;
  $('air-bar').setAttribute('aria-valuenow', String(Math.ceil(a)));
  $('air-box').classList.toggle('low', a < 25);
}
function renderPicked() {
  $('picked').hidden = !!call?.over;
  if (pick == null) { $('picked').innerHTML = '<p class="hint">Tap a star on the chart to see its colour and distance.</p>'; return; }
  const away = pick === 0 ? '' : cat.unmeasured[pick] ? ' · distance not measured' : ` · ${roughLy(lyOf(pick))} away`;
  const lockable = call && !call.over && pick !== 0;
  const tried = call?.wrong.includes(pick);
  $('picked').innerHTML = `<h3>${esc(titleFor(cat, pick))}</h3><p class="what">${pick === 0 ? 'Our own Sun' : `A ${colourOf(cat.temp[pick])} star${esc(away)}`}</p>`
    + (lockable ? `<button type="button" class="primary lock" id="lock"${tried ? ' disabled' : ''}>${tried ? 'Not them' : `Lock on to ${esc(titleFor(cat, pick))}`}</button>` : '');
}

function choose(i) {
  pick = i;
  renderPicked();
  chart.draw();
}

function start(daily, from = list) {
  const day = today();
  const seed = daily ? daySeed(day) : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  call = newCall(cat, from, seed, daily ? day : null);
  pick = null;
  $('briefing').hidden = true;
  $('call').hidden = false;
  $('debrief').hidden = true;
  $('said').textContent = '';
  $('said').className = 'said';
  $('clean').hidden = false;
  showSky('earth');
  // Every call opens on the same patch of sky (the Great Square of Pegasus), so the first view gives nothing away.
  chart.turnTo([0.97, 0, 0.25], 100 * Math.PI / 180);
  renderSignal();
  renderAir();
  renderPicked();
  last = performance.now();
  window.distress.call = { star: cat.names[call.star], open: call.open };
  document.title = 'Distress call · Engage';
  scrollTo({ top: 0 });
}

function finish() {
  const name = titleFor(cat, call.star);
  write(record(read(), call, name));
  const [head, line] = debrief(cat, call);
  $('debrief-1').textContent = head;
  $('debrief-2').textContent = line;
  $('debrief-links').innerHTML = `<a href="${BRIDGE}?course=${encodeURIComponent(cat.names[call.star])}">Set course for ${esc(name)}</a>`
    + `<a href="${BRIDGE}tonight.html#star=${encodeURIComponent(cat.names[call.star])}">In your sky tonight</a>`;
  $('debrief').hidden = false;
  $('clean').hidden = true;
  pick = null;
  renderPicked();
  renderSignal();
  renderAir();
  showSky('theirs');
  $('debrief').scrollIntoView({ block: 'nearest' });
}

function tick(now) {
  if (call && !call.over) {
    const dt = Math.min(1, (now - last) / 1000); // a page left in the background doesn't lose their air for it
    if (!hold.on && !document.hidden) breathe(call, dt);
    renderAir();
    if (call.over) { $('said').textContent = 'Their air has run out.'; $('said').className = 'said wrong'; finish(); }
  }
  last = now;
  requestAnimationFrame(tick);
}

function renderBriefing() {
  const saved = read(), day = today();
  $('standing').textContent = standing(saved, day);
  const done = (saved.calls || []).find(c => c.day === day);
  $('today').hidden = !!done;
  $('today-said').hidden = !done;
  $('today-said').textContent = done ? 'Today’s call is answered. A new one comes in tomorrow; every officer gets the same call that day.' : '';
  $('another').className = done ? 'primary' : 'secondary';
}

// ---------- Wiring ----------

$('today').addEventListener('click', () => cat && start(true));
$('another').addEventListener('click', () => cat && start(false));
$('again').addEventListener('click', () => cat && start(false));
$('clean').addEventListener('click', () => {
  if (!call || call.over) return;
  clean(call);
  renderSignal(); renderAir();
  window.distress.call = { star: cat.names[call.star], open: call.open };
  if (call.over) { $('said').textContent = 'Their air has run out.'; finish(); }
});
$('picked').addEventListener('click', e => {
  if (!e.target.closest('#lock') || !call || call.over || pick == null) return;
  const r = lockOn(cat, call, pick);
  renderAir();
  if (r.right) { $('said').textContent = `Locked on. They are at ${titleFor(cat, call.star)}.`; $('said').className = 'said'; finish(); return; }
  $('said').textContent = r.why + (call.over ? ' Their air has run out.' : ` That cost ${AIR.wrong}% of their air.`);
  $('said').className = 'said wrong';
  if (call.over) { finish(); return; }
  renderPicked();
  chart.draw();
});
$('turn').addEventListener('click', () => { if (chart) chart.turnTo(chart.centre.map(v => -v)); });
$('find').addEventListener('change', e => {
  const t = e.target.value.trim().toLowerCase();
  if (!t || !cat) return;
  let i = -1;
  for (let j = 0; j < cat.count; j++) if (titleFor(cat, j).toLowerCase() === t || cat.names[j].toLowerCase() === t) { i = j; break; }
  if (i < 0) { $('said').textContent = `No star called “${e.target.value.trim()}” on the charts.`; $('said').className = 'said'; return; }
  e.target.value = '';
  if (sky === 'theirs') showSky('earth');
  if (i > 0) chart.turnTo(dirOf(i));
  choose(i);
});
document.querySelector('.skies').addEventListener('click', e => { const b = e.target.closest('[data-sky]'); if (b && call?.over) showSky(b.dataset.sky); });

window.distress = {
  ready: false,
  call: null,
  hold: on => { hold.on = on; },
  // A call from one star, for the README's pictures.
  startAt: name => start(false, [cat.byName.get(name)]),
  finish: () => { lockOn(cat, call, call.star); finish(); },
  choose: name => choose(cat.byName.get(name)),
  // Where a star is on the chart, for the walk-through to tap: { x, y } in the canvas, or null.
  where: name => { const i = cat.byName.get(name), d = chart.dots.find(x => x.i === i); return d ? { x: d.x, y: d.y } : null; },
  turnTo: name => chart.turnTo(dirOf(cat.byName.get(name))),
  get pick() { return pick == null ? null : cat.names[pick]; },
  get sky() { return sky; },
};

loadCatalog().then(c => {
  cat = c;
  list = candidates(cat);
  earth = earthSky();
  chart = new SkyChart($('chart'), { onPick: i => { if (sky === 'earth' && i != null) choose(i); } });
  chart.marks = marks;
  chart.set(earth);
  // Names to type: every star you could see from a suburb.
  const names = [];
  for (let i = 1; i < cat.count; i++) if (earthMag(cat, i) <= EYE_MAG) names.push(titleFor(cat, i));
  $('names').innerHTML = [...new Set(names)].sort().map(n => `<option value="${esc(n)}">`).join('');
  renderBriefing();
  requestAnimationFrame(tick);
  window.distress.ready = true;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
