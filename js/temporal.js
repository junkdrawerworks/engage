// The temporal observatory: Earth's sky in any year from 100,000 years ago to 100,000 on, with today's shapes kept
// faintly to compare, the pole moving among the stars, and what has changed. The rules are in js/epoch.js; the chart
// is js/skychart.js.
import { loadCatalog, constellationLabels } from './catalog.js';
import { titleFor } from './log.js';
import { apparentMag } from './physics.js';
import { SkyChart, unit } from './skychart.js';
import {
  DEG, MOMENTS, POLE_MAG, PRECESSION_YEARS, SPAN, closest, dialForYear, drift, loadMotion, nearestIn, placeAt, poleIn,
  poleStar, skyIn, yearForDial, yearSaid,
} from './epoch.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NOW = new Date().getFullYear();
const MOON = 0.5; // degrees across

let cat = null, vel = null, chart = null, today = null, names = [], circle = [];
const view = { year: NOW, moment: null, ghosts: true };
let shown = { pole: poleIn(NOW), poleStar: null, nearest: null };

const colOf = i => [cat.color[i * 3], cat.color[i * 3 + 1], cat.color[i * 3 + 2]];
const dirIn = (i, year) => unit(placeAt(cat, vel, i, year));
const magOf = (i, year) => apparentMag(cat.absmag[i], Math.hypot(...placeAt(cat, vel, i, year)));
const fmtMag = m => `${m < 0 ? '−' : ''}${Math.abs(m).toFixed(1)}`;
const lyIs = ly => `${ly.toFixed(2)} light years`;
const degIs = d => (d < 0.1 ? 'less than a tenth of a degree' : `${d < 10 ? d.toFixed(1) : Math.round(d)}°`);
const linesIn = year => cat.lines.map(([a, b]) => [dirIn(a, year), dirIn(b, year)]);

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
  // The pole's circle, once round in 25,772 years, and where the pole is in this year.
  g.strokeStyle = 'rgba(134, 216, 255, 0.28)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath();
  let pen = false;
  for (const d of circle) { const p = at(d); if (!p) { pen = false; continue; } if (pen) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); pen = true; }
  g.stroke(); g.setLineDash([]);
  const pp = at(shown.pole);
  if (pp) {
    g.strokeStyle = '#86d8ff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(pp.x - 9, pp.y); g.lineTo(pp.x + 9, pp.y); g.moveTo(pp.x, pp.y - 9); g.lineTo(pp.x, pp.y + 9); g.stroke();
    g.beginPath(); g.arc(pp.x, pp.y, 4, 0, 7); g.stroke();
    label('North pole of the sky', { x: pp.x, y: pp.y + 16 }, 'rgba(134, 216, 255, 0.9)', -4);
  }
  for (const s of chart.stars) {
    if (s.mag > 1.2) break;
    if (s.i === shown.poleStar) continue;
    label(titleFor(cat, s.i), at(s.dir), 'rgba(200, 212, 235, 0.65)', 7);
  }
  if (shown.poleStar != null) label(`${titleFor(cat, shown.poleStar)} · pole star`, at(dirIn(shown.poleStar, view.year)), '#ffd27a', 9);
  if (view.moment?.barnard) {
    const i = cat.byName.get("Barnard's Star"), p = at(dirIn(i, view.year));
    if (p) { g.strokeStyle = '#ffb54a'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.stroke(); label('Barnard’s Star', p, '#ffb54a', 13); }
  }
}

function render() {
  const y = view.year;
  const sky = skyIn(cat, vel, y, 5.9).map(s => ({ ...s, col: colOf(s.i) }));
  const pole = poleIn(y), ps = poleStar(sky, pole), near = nearestIn(cat, vel, y), was = nearestIn(cat, vel, NOW);
  shown = { pole, poleStar: ps?.i ?? null, nearest: near.i };
  chart.set({
    stars: sky,
    lines: linesIn(y),
    ghost: view.ghosts && y !== NOW ? today : [],
    names: Math.abs(y - NOW) < 3000 ? names : [],
  });
  // The words.
  $('year-out').textContent = yearSaid(y);
  $('chart-tag').textContent = y === NOW ? 'Earth’s sky now' : `Earth’s sky, ${yearSaid(y)}`;
  $('dial').value = String(Math.round(dialForYear(y, NOW) * 1000));
  $('dial').setAttribute('aria-valuetext', yearSaid(y));
  if (document.activeElement !== $('year')) $('year').value = String(y);
  let poleLine;
  if (ps) poleLine = `${titleFor(cat, ps.i)}, magnitude ${fmtMag(ps.mag)}, ${degIs(ps.off)} from the pole.`;
  else {
    let best = null;
    for (const s of sky) {
      if (s.mag > POLE_MAG) break;
      const off = Math.acos(Math.min(1, s.dir[0] * pole[0] + s.dir[1] * pole[1] + s.dir[2] * pole[2])) * DEG;
      if (!best || off < best.off) best = { i: s.i, off };
    }
    poleLine = `None. No star the eye can find from a town is within 5° of the pole; the nearest is ${titleFor(cat, best.i)}, ${degIs(best.off)} away.`;
  }
  const nearLine = near.i === was.i
    ? `${titleFor(cat, near.i)}, ${lyIs(near.ly)}${y === NOW ? '' : ` (${lyIs(was.ly)} now)`}.`
    : `${titleFor(cat, near.i)}, ${lyIs(near.ly)}. Today it is ${titleFor(cat, was.i)}.`;
  const d = y === NOW ? null : drift(cat, vel, y, NOW);
  const moved = !d ? 'Turn the dial: nothing has moved yet.'
    : `${titleFor(cat, d.i)} has moved furthest of the bright stars, ${degIs(d.off)}${d.off < MOON ? ', less than the Moon is wide' : d.off < 2 * MOON ? ', about the width of the Moon' : ''}.`;
  const bright = sky[0];
  $('era').innerHTML = [
    ['Pole star', poleLine],
    ['Nearest star', nearLine],
    ['Brightest star', `${titleFor(cat, bright.i)}, magnitude ${fmtMag(bright.mag)}${fmtMag(magOf(bright.i, NOW)) === fmtMag(bright.mag) ? '' : ` (${fmtMag(magOf(bright.i, NOW))} now)`}.`],
    ['Since now', moved],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  document.querySelectorAll('[data-moment]').forEach(b => b.setAttribute('aria-pressed', String(MOMENTS[Number(b.dataset.moment)] === view.moment)));
  $('moment-said').textContent = view.moment ? momentSaid(view.moment) : '';
  document.title = y === NOW ? 'Temporal observatory · Engage' : `${yearSaid(y)} · Temporal observatory · Engage`;
}

function momentSaid(m) {
  if (!m.barnard) return m.said;
  const i = cat.byName.get("Barnard's Star"), c = closest(cat, vel, i);
  return `Barnard’s Star at its closest by this catalogue: ${lyIs(c.ly)}, in ${yearSaid(Math.round(c.year))} (published reckonings say about 3.75 light years, around AD 11,800). It is still too faint to see without a telescope, at magnitude ${fmtMag(magOf(i, Math.round(c.year)))}.`;
}
const momentYear = m => (m.barnard ? Math.round(closest(cat, vel, cat.byName.get("Barnard's Star")).year) : m.year);

function go(year, moment = null, push = true) {
  view.year = Math.max(NOW - SPAN + 1, Math.min(NOW + SPAN - 1, Math.round(year)));
  view.moment = moment;
  if (push) history.replaceState(null, '', view.year === NOW ? location.pathname : `#year=${view.year}`);
  render();
}

$('dial').addEventListener('input', e => go(yearForDial(Number(e.target.value) / 1000, NOW)));
$('year').addEventListener('change', e => { const v = Number(e.target.value); if (Number.isFinite(v) && cat) go(v); });
$('moments').addEventListener('click', e => {
  const b = e.target.closest('[data-moment]');
  if (!b || !cat) return;
  const m = MOMENTS[Number(b.dataset.moment)];
  go(momentYear(m), m);
  if (m.barnard) chart.turnTo(dirIn(cat.byName.get("Barnard's Star"), view.year), 70 / DEG);
  else if (m.year < 0 || m.year > 10000) chart.turnTo(shown.pole, 80 / DEG);
});
$('ghosts').addEventListener('change', e => { view.ghosts = e.target.checked; if (cat) render(); });
$('to-pole').addEventListener('click', () => chart && chart.turnTo(shown.pole, 80 / DEG));
$('to-dipper').addEventListener('click', () => chart && chart.turnTo(dirIn(cat.byName.get('Megrez'), view.year), 60 / DEG));
window.addEventListener('hashchange', () => { if (cat) fromHash(); });

function fromHash() {
  const m = /year=(-?\d+)/.exec(decodeURIComponent(location.hash));
  go(m ? Number(m[1]) : NOW, null, false);
}

window.temporal = {
  ready: false,
  get year() { return view.year; },
  get poleStar() { return shown.poleStar == null ? null : cat.names[shown.poleStar]; },
  get nearest() { return cat.names[shown.nearest]; },
  go: y => go(y),
};

Promise.all([loadCatalog()]).then(async ([c]) => {
  cat = c;
  vel = await loadMotion(cat);
  today = linesIn(NOW);
  names = constellationLabels(cat);
  circle = Array.from({ length: 145 }, (_, k) => poleIn(NOW + k * PRECESSION_YEARS / 144));
  $('year').min = String(NOW - SPAN + 1); $('year').max = String(NOW + SPAN - 1);
  $('held').textContent = ['HIP 10784', 'HIP 14925', 'HIP 49751'].join(', ').replace(/, (?=[^,]*$)/, ' and ');
  $('moments').innerHTML = MOMENTS.map((m, k) => `<button type="button" data-moment="${k}" aria-pressed="false">${esc(m.label)}</button>`).join('');
  chart = new SkyChart($('chart'), {});
  chart.marks = marks;
  chart.limit = 5.5;
  chart.turnTo(dirIn(cat.byName.get('Megrez'), NOW).map((v, k) => v + [0, 0, 0.6][k]), 95 / DEG);
  fromHash();
  window.temporal.ready = true;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
