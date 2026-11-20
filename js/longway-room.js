// The long way home: the map of the galaxy, the helm and the voyage so far. The rules are in js/longway.js.
import { warpSpeed } from './physics.js';
import {
  COLLECT, QUARTER, START_LY, SUSTAIN_WARP, TANK, TOP_WARP, ahead, burn, cruise, debrief, newTrip, readTrip, recordHome, step,
  whenSaid, yearsSaid,
} from './longway.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, and the text size from Bridge settings.
setUpRoom({ sound });

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'engage.longway.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked: the trip still plays */ } };
const LOG = 8; // quarters of the voyage shown, newest first
const num = n => Math.round(n).toLocaleString('en-US');

// The galaxy from above, in light years, the centre at 0, 0 and the Sun 26,000 light years below it (Gravity
// Collaboration 2019: 8.18 kiloparsecs). The ship starts 70,000 light years from the Sun, on the far side of the core.
const SUN = [0, 26000];
const START = [25000, SUN[1] - Math.sqrt(START_LY ** 2 - 25000 ** 2)];
const RADIUS = 50000;

let saved = read();
let trip = readTrip(saved) || newTrip(fresh());
function fresh() { return (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0; }
function keep() { saved = { ...saved, trip: trip.home == null ? trip : null }; write(saved); }

// ---------- The map ----------

let backdrop = null, backdropFor = '';
function paintGalaxy(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), k = size / (RADIUS * 2.2), o = size / 2;
  // The core's glow and its bar.
  const core = g.createRadialGradient(o, o, 0, o, o, 14000 * k);
  core.addColorStop(0, 'rgba(255, 226, 170, 0.75)'); core.addColorStop(0.4, 'rgba(255, 196, 120, 0.25)'); core.addColorStop(1, 'rgba(255, 180, 110, 0)');
  g.fillStyle = core; g.fillRect(0, 0, size, size);
  // Four arms, logarithmic spirals, as a haze of stars (seeded, so the map is the same every time).
  let a = 7;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let n = 0; n < 9000; n++) {
    const arm = n % 4, r = 4000 + rnd() ** 0.8 * (RADIUS - 4000);
    const th = arm * Math.PI / 2 + Math.log(r / 4000) / Math.tan(12.5 * Math.PI / 180) + (rnd() - 0.5) * 0.5;
    const x = o + Math.cos(th) * r * k + (rnd() - 0.5) * 2600 * k, y = o + Math.sin(th) * r * k + (rnd() - 0.5) * 2600 * k;
    const b = 0.18 + rnd() * 0.5 * (1 - r / RADIUS);
    g.fillStyle = rnd() < 0.15 ? `rgba(255, 200, 170, ${b})` : `rgba(170, 196, 255, ${b})`;
    g.fillRect(x, y, 1.2, 1.2);
  }
  return c;
}

function drawMap() {
  const cv = $('map'), dpr = Math.min(devicePixelRatio || 1, 2);
  const S = Math.round((cv.clientWidth || 340) * dpr);
  if (cv.width !== S || cv.height !== S) { cv.width = S; cv.height = S; }
  const g = cv.getContext('2d');
  if (backdropFor !== String(S)) { backdrop = paintGalaxy(S); backdropFor = String(S); }
  g.fillStyle = '#02040a'; g.fillRect(0, 0, S, S);
  g.drawImage(backdrop, 0, 0);
  const k = S / (RADIUS * 2.2), o = S / 2, P = ([x, y]) => [o + x * k, o + y * k];
  const f = Math.min(1, (START_LY - trip.left) / START_LY);
  const ship = [START[0] + (SUN[0] - START[0]) * f, START[1] + (SUN[1] - START[1]) * f];
  // The way home, dashed, and the way flown, solid.
  g.lineWidth = 1.5 * dpr;
  g.setLineDash([4 * dpr, 5 * dpr]); g.strokeStyle = 'rgba(255, 210, 122, 0.35)';
  g.beginPath(); g.moveTo(...P(ship)); g.lineTo(...P(SUN)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#ffb54a'; g.beginPath(); g.moveTo(...P(START)); g.lineTo(...P(ship)); g.stroke();
  const dot = (p, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(...P(p), r * dpr, 0, 7); g.fill(); };
  const say = (text, p, dx, dy, colour, align = 'left') => {
    g.font = `600 ${11 * dpr}px "Chakra Petch", sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    const [x, y] = P(p);
    g.strokeStyle = 'rgba(2, 4, 10, 0.9)'; g.lineWidth = 3 * dpr; g.strokeText(text, x + dx * dpr, y + dy * dpr);
    g.fillStyle = colour; g.fillText(text, x + dx * dpr, y + dy * dpr);
  };
  dot(SUN, 4, '#ffd27a'); say('Earth', SUN, 8, 0, '#ffd27a');
  dot(START, 3, '#86d8ff'); say('Stranded here', START, 0, -18, 'rgba(134, 216, 255, 0.9)', 'center');
  dot(ship, 5, '#ffffff'); g.strokeStyle = '#ffb54a'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(...P(ship), 9 * dpr, 0, 7); g.stroke();
  say('Galactic centre', [0, 0], 0, 16, 'rgba(255, 226, 170, 0.75)', 'center');
  // A scale bar: 10,000 light years.
  const y = S - 16 * dpr, x0 = 16 * dpr;
  g.strokeStyle = 'rgba(232, 237, 246, 0.7)'; g.lineWidth = 1.5 * dpr;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 10000 * k, y); g.stroke();
  g.font = `500 ${10 * dpr}px "Chakra Petch", sans-serif`; g.fillStyle = 'rgba(232, 237, 246, 0.75)'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText('10,000 light years', x0, y - 4 * dpr);
}

// ---------- Words ----------

function meter(v) { return `<span class="meter${v < 25 ? ' low' : ''}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`; }
function renderStatus() {
  $('status').innerHTML = [
    ['Ship’s date', whenSaid(trip.quarter)],
    ['Still to go', `${num(trip.left)} ly`],
    ['Fuel', `${Math.round(trip.fuel)}%${meter(trip.fuel)}`],
    ['Stores', `${Math.round(trip.supplies)}%${meter(trip.supplies)}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
const AHEAD = {
  nebula: ['Ahead: <b>a nebula thick with deuterium.</b> Stopping fills the tanks by 40, and takes the quarter.', 'Stop for fuel'],
  world: ['Ahead: <b>a world with air, water and fruit.</b> Shore leave restocks the stores by 40, and takes the quarter.', 'Shore leave'],
};
function renderHelm() {
  const a = trip.home == null ? ahead(trip.seed, trip.quarter) : null;
  $('ahead').innerHTML = a ? AHEAD[a][0] : 'Nothing ahead but stars.';
  $('stops').innerHTML = a ? `<button type="button" data-stop="${a}">${AHEAD[a][1]}</button>` : '';
  renderBurn();
}
function renderBurn() {
  const w = Number($('warp').value), v = warpSpeed(w), b = burn(w);
  $('warp-out').textContent = w.toFixed(w >= 9.9 ? 3 : w % 1 ? 2 : 1).replace(/0$/, '').replace(/\.$/, '');
  $('warp').setAttribute('aria-valuetext', `Warp ${$('warp-out').textContent}`);
  const per = `${num(v)} times light, ${num(v * QUARTER)} light years a quarter`;
  let fuel;
  if (b <= COLLECT + 1e-9) fuel = `The collectors keep up: the tanks never empty at this speed. Home in ${yearsSaid(trip.left / v)} at it.`;
  else {
    const weeks = trip.fuel / (b - COLLECT) * QUARTER * 52.18;
    fuel = `It burns ${Math.round(b)} a quarter against the collectors’ ${COLLECT}: ${trip.fuel > 0 ? `the tanks would be dry in ${weeks < 13 ? `${Math.max(1, Math.round(weeks))} week${Math.round(weeks) === 1 ? '' : 's'}` : yearsSaid(weeks / 52.18)}, then warp ${SUSTAIN_WARP.toFixed(1)}` : `the tanks are dry, so warp ${SUSTAIN_WARP.toFixed(1)} is all she can make`}.`;
  }
  $('burn').textContent = `${per}. ${fuel}`;
}
function logLine(r) {
  if (r.stopped) return { when: whenSaid(r.quarter), text: r.stopped === 'nebula' ? 'Stopped in a nebula and filled the tanks.' : 'Shore leave. The stores are restocked.' };
  const bits = [`Warp ${r.warp.toFixed(1)}, ${num(r.ly)} light years.`];
  if (r.ran) bits.push(`The tanks ran dry; she fell back to warp ${SUSTAIN_WARP.toFixed(1)}.`);
  if (r.tired) bits.push('The stores are empty, and the crew can’t run her past warp 6.');
  return { when: whenSaid(r.quarter), text: bits.join(' ') };
}
function note(entries) {
  trip.log = [...entries.reverse(), ...(trip.log || [])].slice(0, LOG);
}
function renderLog() {
  $('voyage-log').innerHTML = (trip.log || []).map(e => `<li><b>${esc(e.when)}</b>${esc(e.text)}</li>`).join('');
}
function render() {
  renderStatus(); renderHelm(); renderLog(); drawMap();
  const home = trip.home != null;
  $('helm').hidden = home;
  $('debrief').hidden = !home;
  if (home) {
    const [a, b] = debrief(trip);
    $('debrief-1').textContent = a; $('debrief-2').textContent = b;
    $('best').textContent = saved.homes > 1 ? `Your best: ${yearsSaid(saved.best)}, of ${saved.homes} trips home.` : '';
  }
}

// ---------- The helm ----------

function after(results, summary = null) {
  note(summary ? [summary] : results.map(logLine));
  if (trip.home != null) saved = recordHome(saved, trip);
  keep();
  render();
}
$('fly').addEventListener('click', () => { const r = step(trip, { warp: Number($('warp').value) }); if (r) after([r]); });
$('cruise').addEventListener('click', () => {
  const from = trip.quarter, went = cruise(trip, Number($('warp').value));
  if (!went.length) return;
  const ly = went.reduce((s, r) => s + r.ly, 0), last = went[went.length - 1];
  const extra = [last.ran && `The tanks ran dry; she fell back to warp ${SUSTAIN_WARP.toFixed(1)}.`, last.tired && 'The stores are empty.', trip.supplies <= 20 && trip.supplies > 0 && 'The stores are running low.'].filter(Boolean);
  after(went, went.length === 1 ? null : { when: `${whenSaid(from)} to ${whenSaid(trip.quarter - 1)}`, text: [`${went.length} quarters, ${num(ly)} light years.`, ...extra].join(' ') });
});
$('stops').addEventListener('click', e => { const b = e.target.closest('[data-stop]'); if (b) { const r = step(trip, { stop: b.dataset.stop }); if (r) after([r]); } });
$('warp').addEventListener('input', renderBurn);
$('again').addEventListener('click', () => { trip = newTrip(fresh()); keep(); render(); scrollTo({ top: 0 }); });
new ResizeObserver(() => drawMap()).observe($('map'));

window.longway = {
  ready: true,
  get trip() { return JSON.parse(JSON.stringify(trip)); },
  // A trip from a chosen seed, for the walk-through and the README's pictures.
  start: seed => { trip = newTrip(seed); keep(); render(); },
};
document.fonts?.ready.then(drawMap);
keep();
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
