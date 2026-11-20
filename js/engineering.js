// Main engineering: the warp core, its three flows, the bridge's orders and the shift's burn. The rules are in
// js/core.js.
import {
  DEUT_TANK, HOT, LIMIT, ORDERS, ORDER_SECONDS, asked, costOf, flowsFor, grade, massSaid, newShift, reading, recordShift, run,
  yardsticks,
} from './core.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, and the text size from Bridge settings.
setUpRoom({ sound });

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'engage.engineering.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked: the shift still runs */ } };
const still = matchMedia('(prefers-reduced-motion: reduce)');
const fresh = () => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
const warpSaid = w => (Math.round(w * 10) / 10).toFixed(1).replace(/\.0$/, '');
const pct = x => `${Math.round(x * 100)}%`;
const say = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };

let saved = read();
let shift = newShift(fresh());
let running = false, last = 0, frame = 0, glow = 0;


// ---------- The core ----------

function drawCore() {
  const cv = $('core'), dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.round((cv.clientWidth || 160) * dpr), H = Math.round((cv.clientHeight || 320) * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'), r = reading(shift);
  g.fillStyle = '#02040a'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cw = Math.min(W * 0.34, 70 * dpr), top = 18 * dpr, bot = H - 18 * dpr;
  // The housing.
  g.fillStyle = '#0b1222'; g.strokeStyle = 'rgba(140, 180, 255, 0.32)'; g.lineWidth = 1.5 * dpr;
  g.beginPath(); g.roundRect(cx - cw / 2 - 10 * dpr, top - 8 * dpr, cw + 20 * dpr, bot - top + 16 * dpr, 12 * dpr); g.fill(); g.stroke();
  // The column's colour: blue at its rating and below, white as it runs hot, orange past the limit; its brightness
  // is what it burns.
  const t = shift.temp, b = Math.min(1, r.burn);
  const hue = t <= HOT ? 200 : t <= LIMIT ? 200 - (t - HOT) / (LIMIT - HOT) * 170 : 30;
  const light = t <= HOT ? 55 : t <= LIMIT ? 55 + (t - HOT) / (LIMIT - HOT) * 25 : 60;
  const alpha = b > 0 ? 0.3 + 0.7 * Math.sqrt(b) : 0.08;
  const grd = g.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
  grd.addColorStop(0, `hsla(${hue}, 90%, ${light - 25}%, ${alpha * 0.5})`);
  grd.addColorStop(0.5, `hsla(${hue}, 95%, ${light + 15}%, ${alpha})`);
  grd.addColorStop(1, `hsla(${hue}, 90%, ${light - 25}%, ${alpha * 0.5})`);
  g.fillStyle = grd; g.fillRect(cx - cw / 2, top, cw, bot - top);
  // The rings, pulsing up the column at a pace set by the burn (still, with reduced motion).
  const rings = 9, gap = (bot - top) / rings;
  for (let k = 0; k <= rings; k++) {
    const y = bot - ((k * gap + (still.matches ? 0 : glow * gap)) % (bot - top));
    g.fillStyle = `hsla(${hue}, 100%, ${Math.min(92, light + 30)}%, ${0.15 + 0.6 * b})`;
    g.fillRect(cx - cw / 2 - 6 * dpr, y - 2 * dpr, cw + 12 * dpr, 4 * dpr);
  }
  // The glow round it.
  if (b > 0.02) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(cx, (top + bot) / 2, cw * 0.3, cx, (top + bot) / 2, cw * 2.2);
    halo.addColorStop(0, `hsla(${hue}, 90%, 60%, ${0.25 * b})`); halo.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    g.fillStyle = halo; g.fillRect(0, 0, W, H); g.restore();
  }
  // Containment strain: a red rim that thickens.
  if (shift.strain > 0.02) {
    g.strokeStyle = `rgba(255, 90, 70, ${0.3 + 0.7 * shift.strain})`; g.lineWidth = (1 + 5 * shift.strain) * dpr;
    g.strokeRect(cx - cw / 2 - 3 * dpr, top - 3 * dpr, cw + 6 * dpr, bot - top + 6 * dpr);
  }
  cv.setAttribute('aria-label', `The warp core, ${!r.burn ? 'dark' : shift.temp > LIMIT ? 'glowing orange, past its limit' : shift.temp > HOT ? 'glowing white, running hot' : 'glowing blue'}`);
}

// ---------- Words ----------

function meter(v, low) { return `<span class="meter${low ? ' low' : ''}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, v * 100))}%"></i></span>`; }
function renderGauges() {
  const r = reading(shift);
  const temp = shift.temp > LIMIT ? 'Past the limit' : shift.temp > HOT ? 'Running hot' : 'In the blue';
  $('gauges').innerHTML = [
    ['Holding', r.power > 0.005 ? `Warp ${warpSaid(r.warp)}` : 'No warp', r.holding ? '<span class="on">On the order</span>' : `<span class="off">Ordered: warp ${warpSaid(r.order)}</span>`],
    ['Core temperature', `${pct(shift.temp)} <small>${temp}</small>`, meter(shift.temp / 1.5, shift.temp > HOT)],
    ['Containment strain', pct(shift.strain), meter(shift.strain, shift.strain > 0.25)],
    ['Deuterium left', `${(shift.deut).toFixed(1)} h at full flow`, meter(shift.deut / DEUT_TANK, shift.deut < 1)],
  ].map(([k, v, x]) => `<div><dt>${k}</dt><dd>${v}${x}</dd></div>`).join('');
  $('mix').textContent = r.ratio == null ? 'No antimatter flowing.'
    : r.spill > 0.005 ? `Mix ${r.ratio.toFixed(2)} to 1: antimatter with no deuterium to meet. Containment is straining.`
      : r.rich > 0.005 ? `Mix ${r.ratio.toFixed(1)} to 1: the deuterium past one to one runs through and cools the core.`
        : 'Mix one to one: every gram of antimatter meets a gram of deuterium.';
  $('burned-kg').textContent = `${massSaid(shift.kg)} of antimatter`;
  const y = yardsticks(shift.kg);
  $('burned-said').textContent = shift.kg > 0 ? `With as much deuterium: ${y.lines[0]}, ${y.lines[1]}.` : 'Nothing yet.';
}
function renderOrder() {
  const r = reading(shift), w = warpSaid(r.order), cost = costOf(r.order);
  if (!running && shift.t === 0) {
    say('order-hour', 'Before the shift');
    say('order-line', `The bridge will ask for ${ORDERS} warp factors, one an hour. The first: warp ${w}. Set the flows, then start.`);
  } else {
    say('order-hour', `Bridge · hour ${r.k + 1} of ${ORDERS}`);
    say('order-line', asked(shift.orders, r.k, warpSaid));
  }
  say('order-cost', `Warp ${w} needs ${pct(cost.kg)} of this core’s power: ${massSaid(cost.kg)} of antimatter an hour, ${Math.round(cost.megatons)} megatons.`);
}
let lastK = -1;
function render() {
  const r = reading(shift);
  if (r.k !== lastK || !running) { renderOrder(); lastK = r.k; }
  renderGauges();
  drawCore();
  for (const f of ['a', 'd', 'c']) { $(`out-${f}`).textContent = pct(shift[f]); $(`flow-${f}`).style.setProperty('--fill', pct(shift[f])); }
  const over = !!shift.over;
  $('debrief').hidden = !over;
  $('burned').hidden = over;
  document.querySelector('.flows').hidden = over;
  $('start').hidden = running || over;
  $('start').textContent = shift.t > 0 ? 'Carry on' : 'Start the shift';
  $('pause').hidden = !running;
}

function debrief() {
  const g = grade(shift), y = yardsticks(shift.kg);
  const hour = Math.min(ORDERS, Math.floor(shift.t / ORDER_SECONDS) + 1);
  $('debrief-head').textContent = shift.over === 'ejected' ? `Core ejected in hour ${hour}` : `Shift complete: ${g.letter}`;
  $('debrief-held').textContent = shift.over === 'ejected'
    ? `Containment gave out, and the core went over the side. The ship is on impulse until a new one is fitted. You had held the bridge’s order for ${pct(g.share)} of the shift.`
    : `You held the bridge’s order for ${pct(g.share)} of the shift${g.letter === 'A' ? '. The bridge never had to ask twice.' : '.'}`;
  $('debrief-burn').textContent = `The core burned ${massSaid(shift.kg)} of antimatter, with as much deuterium. That is`;
  $('yardsticks').innerHTML = y.lines.map(l => `<li>${esc(l)}</li>`).join('');
  $('best').textContent = saved.shifts > 1 ? `Your best: ${pct(saved.best)} held, over ${saved.shifts} shifts, ${massSaid(saved.kg)} of antimatter in all.` : '';
}

// ---------- The shift ----------

function tick(now) {
  if (!running) return;
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  advance(dt);
  if (running) frame = requestAnimationFrame(tick);
}
function advance(dt) {
  const k = reading(shift).k;
  run(shift, dt);
  glow = (glow + dt * (0.3 + 2.2 * reading(shift).burn)) % 1;
  if (shift.over) finish();
  else if (reading(shift).k !== k) navigator.vibrate?.(30);
  render();
}
function finish() {
  running = false;
  cancelAnimationFrame(frame);
  saved = recordShift(saved, shift);
  write(saved);
  debrief();
  render();
  $('debrief-head').focus({ preventScroll: true });
  $('debrief').scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
}
function go() {
  if (shift.over) return;
  if (shift.t === 0 && innerWidth < 900) $('deck').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
  running = true;
  lastK = -1; // the order's words turn from the briefing's to the bridge's
  last = performance.now();
  frame = requestAnimationFrame(tick);
  render();
}
function pause() { running = false; cancelAnimationFrame(frame); render(); }

for (const f of ['a', 'd', 'c']) {
  const el = $(`flow-${f}`);
  el.addEventListener('input', () => { shift[f] = Number(el.value) / 100; el.setAttribute('aria-valuetext', `${el.value}%`); render(); });
}
$('start').addEventListener('click', go);
$('pause').addEventListener('click', pause);
$('again').addEventListener('click', () => { start(fresh()); scrollTo({ top: 0 }); });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(); });
new ResizeObserver(() => drawCore()).observe($('core'));

function start(seed) {
  pause();
  shift = newShift(seed);
  for (const f of ['a', 'd', 'c']) { $(`flow-${f}`).value = 0; shift[f] = 0; }
  lastK = -1;
  render();
}
function set(flows) {
  for (const f of ['a', 'd', 'c']) if (flows[f] != null) { shift[f] = flows[f]; $(`flow-${f}`).value = Math.round(flows[f] * 100); }
  render();
}

window.engineering = {
  ready: true,
  get shift() { return JSON.parse(JSON.stringify(shift)); },
  get reading() { return reading(shift); },
  // For the walk-through and the README's pictures: a shift from a chosen seed, the flows set by hand, the shift run
  // on by `seconds` of play without waiting, and the flows a careful engineer would set for an order.
  start, set, flowsFor,
  run: seconds => { if (!shift.over) { if (!running && shift.t === 0) running = true; advance(seconds); if (!shift.over) pause(); } },
};
document.fonts?.ready.then(drawCore);
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
