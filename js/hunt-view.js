// The planetary survey's Long-range sensors tab: Planet hunt. A star's light (or its wobble) drawn point by point;
// tap three dips for the planet's year, drag a line to the floor of the dip for its size, then say which survey file
// it is. The rules are in js/hunt.js; this draws them and takes the taps.
import { curve, events, eventAt, yearFrom, fold, binsFor, tried, tolerance, depthOf, sizeLine, massLine, yearLine, near, linkOf, fromLink, newSeed, LEVELS } from './hunt.js';
import { byId, label } from './classes.js';
import { fourWith } from './quiz.js';
import { Globe, paint } from './planet-art.js';
import { LIVE, share } from './share.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BRIDGE = './';
const AWAY = BRIDGE.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
const AMBER = '#ffb54a', CYAN = '#86d8ff', DOT = 'rgba(214, 228, 255, 0.78)', LINE = 'rgba(134, 216, 255, 0.16)', GREEN = '#6fe3a4';

// The hunt on screen: the curve, the dips tapped, the stage ('dips', 'fold', 'depth', 'file' or 'done'), the planet
// found, its year, and the depth (or wobble) read off by hand.
let c = null, marks = [], stage = 'dips', found = null, year = 0, guess = 0, foldDays = 1;
let started = false;

// Opens a curve: from a link's level and seed, or a new seed for a level.
export function openHunt(level = 1, seed = newSeed()) {
  c = curve(level, seed);
  marks = []; found = c.target; year = 0; guess = 0;
  stage = c.level.fold ? 'fold' : 'dips';
  if (!started) bind();
  document.querySelectorAll('[data-level]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.level) === c.level.id ? 'true' : 'false'));
  $('hunt-brief').textContent = c.level.brief;
  $('hunt-verdict').hidden = true;
  $('hunt-choices').innerHTML = '';
  $('hunt-reveal').hidden = true;
  $('hunt-fold').hidden = !c.level.fold;
  if (c.level.fold) {
    const r = $('fold-year');
    r.value = 1500;
    lit(r);
    foldDays = yearOfSlider();
    $('fold-out').textContent = foldText(foldDays);
  }
  say(c.level.fold ? 'Drag the year until a dip shows in the passes added up.' : c.level.wobble ? 'Tap the tops of the wave: three of them.' : 'Tap a dip.');
  showDepth();
  try { history.replaceState(null, '', `#${linkOf(c)}`); } catch { /* fine */ }
  draw();
}
export const huntLink = text => fromLink(text);
export const hunt = () => ({ curve: c, marks, stage, found, year, guess });

// A slider's lit track ends at its thumb.
const lit = r => r.style.setProperty('--fill', `${(Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min)) * 100}%`);

function say(text, tone = '') {
  $('hunt-status').textContent = text;
  $('hunt-status').className = `hunt-status ${tone}`;
}

// ---------- Drawing ----------

const PAD = 10;
function fit(canvas, cssH) {
  const w = canvas.getBoundingClientRect().width || 340, dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.style.height = `${cssH}px`;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(cssH * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(cssH * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, cssH);
  return { g, w, h: cssH };
}
// Where things go on the main plot: each row's box, and the light (or speed) at its top and bottom.
function layout(w) {
  const rowH = c.level.wobble ? 200 : c.rows > 3 ? 88 : 110;
  let top, bottom;
  if (c.level.wobble) { const a = c.planets[0].kms + 3 * c.noise; top = a; bottom = -a; } else {
    const deepest = Math.max(...c.planets.map(depthOf));
    top = 1 + 3.5 * c.noise; bottom = 1 - deepest * 1.35 - 3.5 * c.noise;
  }
  return { rowH, top, bottom, x0: PAD, x1: w - PAD, h: c.rows * rowH };
}
const yOf = (L, row, v) => row * L.rowH + 8 + (L.top - v) / (L.top - L.bottom) * (L.rowH - 16);

function draw() {
  if (!c) return;
  const canvas = $('hunt-plot');
  const L0 = layout(canvas.getBoundingClientRect().width || 340);
  const { g, w } = fit(canvas, L0.h);
  const L = layout(w);
  const span = c.level.rowDays;
  for (let row = 0; row < c.rows; row++) {
    // A faint line at full light (or at standing still), and the day ticks.
    g.strokeStyle = LINE; g.lineWidth = 1;
    g.beginPath(); const yb = yOf(L, row, c.level.wobble ? 0 : 1); g.moveTo(L.x0, yb); g.lineTo(L.x1, yb); g.stroke();
    g.fillStyle = 'rgba(180, 196, 220, 0.5)'; g.font = '10px system-ui, sans-serif';
    for (let d = 0; d <= span; d++) {
      const x = L.x0 + d / span * (L.x1 - L.x0);
      if (span > 5 && d % 2) continue;
      g.fillRect(x, row * L.rowH + L.rowH - 6, 1, 4);
      if (d < span) g.fillText(`day ${row * span + d}`, x + 4, row * L.rowH + L.rowH - 2);
    }
  }
  // The readings, point by point.
  g.fillStyle = DOT;
  const r = c.level.wobble ? 2.6 : c.t.length > 4000 ? 1.1 : 1.3;
  for (let i = 0; i < c.t.length; i++) {
    const row = Math.min(c.rows - 1, Math.floor(c.t[i] / span));
    const x = L.x0 + (c.t[i] - row * span) / span * (L.x1 - L.x0);
    const y = yOf(L, row, c.y[i]);
    g.fillRect(x - r / 2, y - r / 2, r, r);
  }
  // The dips (or tops) tapped.
  g.strokeStyle = AMBER; g.fillStyle = AMBER; g.lineWidth = 1.5; g.font = '600 11px system-ui, sans-serif';
  marks.forEach((m, k) => {
    const row = Math.min(c.rows - 1, Math.floor(m.at / span));
    const x = L.x0 + (m.at - row * span) / span * (L.x1 - L.x0);
    g.beginPath(); g.moveTo(x, row * L.rowH + 4); g.lineTo(x, row * L.rowH + L.rowH - 12); g.stroke();
    g.fillText(String(k + 1), x + 3, row * L.rowH + 14);
  });
  // The line read off by hand.
  if (stage === 'depth' && !c.level.fold) {
    g.strokeStyle = GREEN; g.setLineDash([6, 4]); g.lineWidth = 1.5;
    for (let row = 0; row < c.rows; row++) {
      const y = yOf(L, row, c.level.wobble ? guess : 1 - guess);
      g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke();
    }
    g.setLineDash([]);
  }
  if (c.level.fold) drawFold();
}

// Level 2: the passes added up on the year being tried, in slices of it (binsFor in js/hunt.js).
function drawFold() {
  const canvas = $('fold-plot');
  const { g, w, h } = fit(canvas, 150);
  const bins = fold(c, foldDays, binsFor(c));
  const depth = depthOf(c.planets[0]);
  const top = 1 + depth * 0.9, bottom = 1 - depth * 1.9;
  const y = v => 8 + (top - v) / (top - bottom) * (h - 24);
  g.strokeStyle = LINE; g.beginPath(); g.moveTo(PAD, y(1)); g.lineTo(w - PAD, y(1)); g.stroke();
  g.fillStyle = 'rgba(180, 196, 220, 0.5)'; g.font = '10px system-ui, sans-serif';
  g.fillText('one year, folded', PAD, h - 4);
  const bw = (w - 2 * PAD) / bins.length;
  g.fillStyle = stage === 'fold' ? CYAN : DOT;
  bins.forEach((v, k) => { if (!Number.isNaN(v)) g.fillRect(PAD + k * bw + 1, Math.min(y(v), y(1)), Math.max(1, bw - 2), Math.max(2, Math.abs(y(v) - y(1)))); });
  if (stage === 'depth') {
    g.strokeStyle = GREEN; g.setLineDash([6, 4]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(PAD, y(1 - guess)); g.lineTo(w - PAD, y(1 - guess)); g.stroke();
    g.setLineDash([]);
  }
}

// ---------- Taps ----------

function tapAt(e) {
  if (!c || stage !== 'dips') return;
  const box = $('hunt-plot').getBoundingClientRect();
  const L = layout(box.width);
  const x = e.clientX - box.left, yy = e.clientY - box.top;
  const row = Math.max(0, Math.min(c.rows - 1, Math.floor(yy / L.rowH)));
  const t = row * c.level.rowDays + (x - L.x0) / (L.x1 - L.x0) * c.level.rowDays;
  // A fingertip, in days; for the wobble, whose tops fall between readings, a sixth of its year.
  const tol = Math.max(16 / (L.x1 - L.x0) * c.level.rowDays, c.level.wobble ? c.planets[0].days / 6 : 0);
  dip(t, tol);
}

// A dip (or top) tapped at time t: the nearest one within `tol` days.
function dip(t, tol) {
  const e = eventAt(c, t, tol);
  if (!e) { say(c.level.wobble ? 'Not a top. Tap where the wave is highest.' : 'Nothing there but scatter. Look for a cluster of low points.', 'bad'); return; }
  if (marks.includes(e)) return;
  if (marks.some(m => m.planet === e.planet && m.n === e.n)) return;
  marks.push(e);
  const y = yearFrom(marks);
  if (y?.mixed) {
    marks = [e];
    say('Those dips aren’t one planet’s: not evenly spaced, or not the same depth. Starting again from the last one.', 'bad');
  } else if (marks.length >= 3) {
    found = y.planet; year = y.days;
    stage = 'depth';
    say(`${yearLine(year)} ${c.level.wobble ? 'Now drag the line to the top of the wave.' : 'Now drag the line to the bottom of the dips.'}`, 'ok');
    showDepth();
  } else say(`${marks.length} of 3. ${c.level.wobble ? 'Tap another top.' : 'Tap another dip.'}`);
  draw();
}

// Level 2: a year tried on the slider, from half a day to eight days.
const yearOfSlider = () => 0.5 * 16 ** (Number($('fold-year').value) / 3000);
const foldText = d => (d < 2 ? `${(d * 24).toFixed(1)} hours` : `${d.toFixed(3)} days`);
function tryYear() {
  if (stage !== 'fold') return;
  foldDays = yearOfSlider();
  lit($('fold-year'));
  $('fold-out').textContent = foldText(foldDays);
  const how = tried(c, foldDays);
  if (how === 'found') {
    found = c.planets[0]; year = found.days; foldDays = year;
    stage = 'depth';
    say(`The passes line up. ${yearLine(year)} Now drag the line to the bottom of the dip.`, 'ok');
    showDepth();
  } else if (how === 'double') say('Two dips in one fold: the year is half this.');
  else say('Drag the year until a dip shows in the passes added up.');
  draw();
}

// The line read off by hand: a slider beside the plot, and the plot itself can be dragged.
function showDepth() {
  const on = stage === 'depth';
  $('hunt-depth').hidden = !on;
  if (!on) return;
  const r = $('depth-range');
  if (c.level.wobble) { r.max = String(Math.round(found.kms * 2)); r.step = '1'; guess = Math.round(found.kms * 0.4); r.value = String(guess); } else { r.max = String(depthOf(found) * 2.2 * 1e5); r.step = '1'; guess = depthOf(found) * 0.3; r.value = String(Math.round(guess * 1e5)); }
  $('depth-label').textContent = c.level.wobble ? 'Height of the wave' : 'Depth of the dip';
  readDepth();
}
function readDepth() {
  lit($('depth-range'));
  guess = c.level.wobble ? Number($('depth-range').value) : Number($('depth-range').value) / 1e5;
  $('depth-out').textContent = c.level.wobble ? `${Math.round(guess)} m/s` : `${(guess * 100).toFixed(guess < 0.01 ? 3 : 2)}% dimmer`;
  draw();
}
function dragDepth(e) {
  if (stage !== 'depth' || c.level.fold) return false;
  const box = $('hunt-plot').getBoundingClientRect();
  const L = layout(box.width);
  const yy = e.clientY - box.top, row = Math.max(0, Math.min(c.rows - 1, Math.floor(yy / L.rowH)));
  const v = L.top - (yy - row * L.rowH - 8) / (L.rowH - 16) * (L.top - L.bottom);
  const r = $('depth-range');
  r.value = String(c.level.wobble ? Math.round(v) : Math.round((1 - v) * 1e5));
  readDepth();
  return true;
}
function dragFold(e) {
  if (stage !== 'depth' || !c.level.fold) return;
  const box = $('fold-plot').getBoundingClientRect();
  const depth = depthOf(c.planets[0]), top = 1 + depth * 0.9, bottom = 1 - depth * 1.9;
  const v = top - (e.clientY - box.top - 8) / (box.height - 24) * (top - bottom);
  $('depth-range').value = String(Math.round((1 - v) * 1e5));
  readDepth();
}

function settle() {
  if (stage !== 'depth') return;
  const truth = c.level.wobble ? found.kms : depthOf(found);
  if (!near(guess, truth)) {
    say(guess < truth ? (c.level.wobble ? 'Not quite: the wave reaches higher than that.' : 'Not quite: the floor of the dip is lower than that.') : (c.level.wobble ? 'Not quite: the wave doesn’t reach that high.' : 'Not quite: the dip isn’t that deep.'), 'bad');
    return;
  }
  stage = 'file';
  $('hunt-depth').hidden = true;
  say(`${yearLine(year)} ${c.level.wobble ? massLine(guess, year, found.ms) : sizeLine(guess, found.rs)}`, 'ok');
  draw();
  // Which file is it? Four to choose from, one of them its own, with look-alikes.
  const files = fourWith(found.file, Math.random);
  $('hunt-verdict').hidden = false;
  $('hunt-choices').innerHTML = files.map(x => `
    <button class="choice" type="button" data-file="${esc(x.id)}">
      <canvas width="112" height="112" aria-hidden="true"></canvas>
      <span class="c-name">${esc(label(x))}</span>
      <span class="c-sub">${esc(x.short)}</span>
    </button>`).join('');
  $('hunt-choices').querySelectorAll('.choice').forEach(b => {
    const x = byId.get(b.dataset.file);
    const gl = new Globe(b.querySelector('canvas'));
    gl.setMap(thumb(x.art));
    gl.draw(0.8, 112);
  });
  $('hunt-verdict').scrollIntoView({ block: 'nearest' });
}
const thumbs = new Map();
const SEEDS = { earth: 3, forest: 2, ocean: 2, rock: 2, icegiant: 4 };
const thumb = art => { if (!thumbs.has(art)) thumbs.set(art, paint(art, SEEDS[art] || 1, 128)); return thumbs.get(art); };

function fileIt(id) {
  if (stage !== 'file') return;
  stage = 'done';
  const right = id === found.file, cls = byId.get(found.file);
  $('hunt-choices').querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.dataset.file === found.file) b.classList.add('right');
    else if (b.dataset.file === id) b.classList.add('wrong');
  });
  $('hunt-reveal').hidden = false;
  $('reveal-head').textContent = right ? `Filed. It’s ${found.name}.` : `Not that file: by its size and year it’s ${cls.inText || label(cls)}. It’s ${found.name}.`;
  $('reveal-head').className = `verdict-head ${right ? 'ok' : 'bad'}`;
  $('reveal-text').textContent = found.found;
  $('reveal-links').innerHTML = `<a class="fly" href="#${esc(cls.id)}">Read the ${esc(label(cls))} file <span aria-hidden="true">→</span></a>`
    + (found.star ? `<a class="fly" href="${BRIDGE}?course=${encodeURIComponent(found.star)}"${AWAY}>Set course <span aria-hidden="true">→</span></a>` : '');
  $('hunt-reveal').scrollIntoView({ block: 'nearest' });
}

function bind() {
  started = true;
  let down = null, dragging = false;
  const plot = $('hunt-plot');
  plot.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; dragging = stage === 'depth' && dragDepth(e); if (dragging) plot.setPointerCapture?.(e.pointerId); });
  plot.addEventListener('pointermove', e => { if (dragging) dragDepth(e); });
  plot.addEventListener('pointerup', e => {
    if (!dragging && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 12) tapAt(e);
    down = null; dragging = false;
  });
  plot.addEventListener('pointercancel', () => { down = null; dragging = false; });
  let foldDrag = false;
  $('fold-plot').addEventListener('pointerdown', e => { if (stage === 'depth') { foldDrag = true; dragFold(e); $('fold-plot').setPointerCapture?.(e.pointerId); } });
  $('fold-plot').addEventListener('pointermove', e => { if (foldDrag) dragFold(e); });
  $('fold-plot').addEventListener('pointerup', () => { foldDrag = false; });
  $('fold-year').addEventListener('input', tryYear);
  $('fold-less').addEventListener('click', () => { $('fold-year').stepDown(); tryYear(); });
  $('fold-more').addEventListener('click', () => { $('fold-year').stepUp(); tryYear(); });
  $('depth-range').addEventListener('input', readDepth);
  $('depth-go').addEventListener('click', settle);
  $('hunt-choices').addEventListener('click', e => { const b = e.target.closest('[data-file]'); if (b) fileIt(b.dataset.file); });
  document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => openHunt(Number(b.dataset.level))));
  $('hunt-new').addEventListener('click', () => openHunt(c.level.id));
  $('hunt-share').addEventListener('click', e => share(e.currentTarget, {
    title: 'Planet hunt, from Engage’s planetary survey',
    text: `Find the planet in this star’s light: ${c.level.name}, in Engage’s planetary survey.`,
    url: `${LIVE}survey.html#${linkOf(c)}`,
  }));
  let width = 0;
  new ResizeObserver(() => { const w = plot.getBoundingClientRect().width; if (w && w !== width) { width = w; draw(); } }).observe(plot);
}

// For tests: tap the dip (or top) nearest a time, and the events in the curve.
export const huntTest = { dip: t => dip(t, 0.05), events: () => (c ? events(c) : []), tolerance: () => tolerance(c), LEVELS };
