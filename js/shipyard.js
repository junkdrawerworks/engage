// The shipyard: the page. The rules are in js/shipyard-sim.js. A design on the bench (hull, mass split, name), drawn
// side on with what she comes to; Starfleet's requisition of the day, and whether she meets it; and the ships kept,
// each with a link to race her on the warp scale and one to send her to someone.
import { HULLS, hullById, stats, rebalance, requisition, meets, shortOf, encodeDesign, decodeDesign, tidyYard, suggestName, newRegistry, MAX_DESIGNS } from './shipyard-sim.js';
import { cleanName, cleanRegistry, fullName } from './myship.js';
import { tripYears } from './physics.js';
import { sound } from './audio.js';
import { LIVE, share } from './share.js';
import { keep, unkept, watch } from './store.js';
import { setUpRoom, textScale } from './room.js';

// The speaker in the header, the text size from Bridge settings, and the Keys card (press ?).
setUpRoom({ sound });

const KEY = 'engage.shipyard.v1';
// Where Engage itself is (the warp scale's race is a page beside this one).
const BRIDGE = './';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const read = () => { try { return tidyYard(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return tidyYard(null); } };
const dayOf = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const shortDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

let yard = read();
// The design on the bench: { hull, e, s, name, registry }, and `editing`, the id of the kept ship it was opened from.
let bench = { hull: 'explorer', e: 40, s: 30, name: '', registry: '' };
let editing = null;
let fromLink = false;

function save() {
  const why = keep(KEY, yard);
  $('unsaved').hidden = !why;
  $('unsaved').textContent = unkept(why, 'the shipyard', 'your ships');
  return !why;
}

// ---------- The bench ----------

function renderHulls() {
  $('hulls').innerHTML = HULLS.map(h => `<button type="button" class="hull${h.id === bench.hull ? ' on' : ''}" data-hull="${h.id}" aria-pressed="${h.id === bench.hull}">${esc(h.name)}</button>`).join('');
}
const fill = (el, v) => el.style.setProperty('--fill', `${(v - 10) / 70 * 100}%`);
function renderMass() {
  const d = 100 - bench.e - bench.s;
  for (const [k, v] of [['e', bench.e], ['s', bench.s], ['d', d]]) {
    $(`share-${k}`).value = v; fill($(`share-${k}`), v);
    $(`out-${k}`).textContent = `${v}%`;
  }
}

const span = years => {
  const days = years * 365.25;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours`;
  if (days < 14) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
  if (days < 61) return `${Math.round(days / 7)} weeks`;
  if (years < 2) return `${Math.round(years * 12)} months`;
  return `${Math.round(years).toLocaleString('en-US')} years`;
};
function render() {
  const st = stats(bench), h = hullById(bench.hull);
  $('specs').innerHTML = [
    ['Top speed', `Warp ${st.top}`], ['Cruising', `Warp ${st.cruise}`], ['Crew', st.crew.toLocaleString('en-US')],
    ['Sensors', `${st.sensors} ly`], ['Defence', `${st.defence} of 100`], ['Mass', `${st.mass.toLocaleString('en-US')} kt`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('like').textContent = h.like;
  // Vega is 25 light years out and the galactic core about 26,700 (the warp scale's own figures).
  $('trips').textContent = `At her cruising warp: Vega in ${span(tripYears(25, st.cruise))}, the galactic core in ${span(tripYears(26700, st.cruise))}.`;
  renderReq(st);
  draw(st);
  $('keep').textContent = editing ? 'Save changes' : 'Keep her';
  $('fresh').hidden = !editing && !fromLink;
}

// ---------- Today's requisition ----------

function renderReq(st = stats(bench)) {
  const day = dayOf(), r = requisition(day);
  const filledBy = yard.designs.find(d => d.id === yard.filled[day]);
  $('req-head').textContent = `Starfleet requisition · ${shortDay(day)}`;
  $('req-says').textContent = r.says;
  $('req-asks').innerHTML = r.asks.map(a => `<li>${esc(a[0].toUpperCase() + a.slice(1))}</li>`).join('');
  const short = shortOf(st, r.needs);
  $('req').classList.toggle('filled', !!filledBy);
  $('req-state').className = `req-state${filledBy ? ' done' : !short.length ? ' meets' : ''}`;
  $('req-state').textContent = filledBy ? `Filled today with the ${fullName(filledBy)}. Tomorrow brings another.`
    : !short.length ? 'The design on the bench meets it. Keep her to fill it.'
      : `The design on the bench falls short: ${short.join('; ')}.`;
}

// ---------- Keeping ----------

function keepHer() {
  const name = cleanName($('name').value);
  if (!name) {
    $('kept-note').textContent = 'She needs a name first. Suggest a name gives her one.';
    $('name').focus();
    return;
  }
  bench.name = name;
  bench.registry = cleanRegistry($('registry').value) || newRegistry();
  $('name').value = name; $('registry').value = bench.registry;
  const now = new Date(), day = dayOf(now), r = requisition(day);
  const fills = !yard.filled[day] && meets(stats(bench), r.needs);
  let ship;
  if (editing && yard.designs.some(d => d.id === editing)) {
    ship = yard.designs.find(d => d.id === editing);
    Object.assign(ship, { name, registry: bench.registry, hull: bench.hull, e: bench.e, s: bench.s });
    if (fills) ship.req = day;
  } else {
    if (yard.designs.length >= MAX_DESIGNS) {
      $('kept-note').textContent = `The shipyard holds ${MAX_DESIGNS} designs. Scrap one below to make room.`;
      return;
    }
    ship = { id: `d${now.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, registry: bench.registry, hull: bench.hull, e: bench.e, s: bench.s, at: now.toISOString(), ...(fills ? { req: day } : {}) };
    yard.designs.push(ship);
  }
  if (fills) yard.filled[day] = ship.id;
  editing = ship.id;
  fromLink = false;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  save();
  sound.blip?.(fills ? 1180 : 880);
  $('kept-note').textContent = fills ? `The ${fullName(ship)} is kept, and fills today’s requisition.` : `The ${fullName(ship)} is kept.`;
  render();
  renderFleet();
}

function open(id) {
  const d = yard.designs.find(x => x.id === id);
  if (!d) return;
  bench = { hull: d.hull, e: d.e, s: d.s, name: d.name, registry: d.registry };
  editing = d.id; fromLink = false;
  $('name').value = d.name; $('registry').value = d.registry;
  $('kept-note').textContent = `The ${fullName(d)} is on the bench.`;
  renderHulls(); renderMass(); render();
  $('drawing').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function fresh() {
  editing = null; fromLink = false;
  bench = { ...bench, name: '', registry: '' };
  $('name').value = ''; $('registry').value = '';
  $('kept-note').textContent = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  render();
}
function scrap(id) {
  const d = yard.designs.find(x => x.id === id);
  if (!d || !confirm(`Scrap the ${fullName(d)}? A requisition she filled stays filled.`)) return;
  yard.designs = yard.designs.filter(x => x.id !== id);
  if (editing === id) editing = null;
  save();
  render();
  renderFleet();
}

const raceLink = d => `${BRIDGE}warp.html?warp=${stats(d).cruise}&ship=yard:${encodeURIComponent(encodeDesign(d))}`;
function renderFleet() {
  const list = [...yard.designs].reverse();
  $('fleet-none').hidden = !!list.length;
  $('ships').innerHTML = list.map(d => {
    const st = stats(d), h = hullById(d.hull);
    return `<li data-ship="${esc(d.id)}">
      <p class="ship-name"><b>${esc(fullName(d))}</b>${d.registry ? `<span>${esc(d.registry)}</span>` : ''}</p>
      <p class="ship-line">${esc(h.name)} · warp ${st.top} top, ${st.cruise} cruising · ${st.crew.toLocaleString('en-US')} aboard${d.req ? ` · <span class="filled-mark">Filled the requisition of ${esc(shortDay(d.req))}</span>` : ''}</p>
      <p class="ship-doors">
        <button class="text-button" type="button" data-open="${esc(d.id)}">On the bench</button>
        <a class="text-button" href="${esc(raceLink(d))}">Race her on the warp scale</a>
        <button class="text-button" type="button" data-send="${esc(d.id)}">Send her</button>
        <button class="text-button scrap" type="button" data-scrap="${esc(d.id)}">Scrap</button>
      </p></li>`;
  }).join('');
}
function send(id, button) {
  const d = yard.designs.find(x => x.id === id);
  if (!d) return;
  const st = stats(d), url = `${LIVE}shipyard.html#ship=${encodeDesign(d)}`;
  const text = `The ${fullName(d)}: a ${hullById(d.hull).name.toLowerCase()}, warp ${st.top} top and ${st.cruise} cruising, ${st.crew.toLocaleString('en-US')} aboard.`;
  share(button, { title: fullName(d), text, url, copy: `${text}\n${url}` });
}

// ---------- The drawing ----------

// Her side on, in the drydock's light: the hull's own shape, nacelles as long as her engines are big, a deflector and
// a sensor pod that grow with science, phaser strips that multiply with defence, and her name on the hull.
const canvas = $('drawing');
function draw(st = stats(bench)) {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const c = canvas.getContext('2d'), W = 1000, H = W * r.height / r.width;
  c.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
  c.fillStyle = '#03050a'; c.fillRect(0, 0, W, H);
  // The drydock's frame.
  c.strokeStyle = 'rgba(134, 216, 255, 0.08)'; c.lineWidth = 2;
  for (let x = 60; x < W; x += 110) { c.beginPath(); c.moveTo(x, 18); c.lineTo(x, H - 18); c.stroke(); }
  c.beginPath(); c.moveTo(20, 30); c.lineTo(W - 20, 30); c.moveTo(20, H - 30); c.lineTo(W - 20, H - 30); c.stroke();
  const h = hullById(bench.hull), e = bench.e / 100, s = bench.s / 100, d = 1 - e - s;
  // How big she is drawn: by her mass, from a scout to a flagship, so a flagship fills the dock.
  const size = 0.55 + 0.45 * Math.min(1, Math.log10(h.mass / 100) / Math.log10(45));
  const L = W * 0.74 * size, nacReach = L * (0.28 + 0.5 * e);
  // Centred on what is drawn: from the saucer's rim (or the escort's bow) to the nacelles' tails.
  const reach = { escort: [-0.4, -0.02], scout: [-0.5, -0.02], science: [-0.5, -0.02] }[h.id] || [-0.5, 0.1];
  const cx = W / 2 - (reach[0] * L + Math.max(reach[1] * L + nacReach, 0.34 * L)) / 2, cy = H * 0.52;
  const ink = '#cfe6ff', glow = 'rgba(134, 216, 255, 0.10)';
  c.lineJoin = 'round'; c.lineWidth = 3 + d * 6; c.strokeStyle = ink; c.fillStyle = glow;
  const nacLen = nacReach, nacH = Math.max(12, L * 0.045);
  const shapes = {
    saucer: () => { c.beginPath(); c.ellipse(cx - L * 0.2, cy - L * 0.09, L * 0.3, L * 0.05, 0, 0, Math.PI * 2); c.fill(); c.stroke(); },
    neck: () => { c.beginPath(); c.moveTo(cx - L * 0.12, cy - L * 0.05); c.lineTo(cx - L * 0.02, cy + L * 0.04); c.lineTo(cx + L * 0.06, cy + L * 0.04); c.lineTo(cx - L * 0.02, cy - L * 0.05); c.closePath(); c.fill(); c.stroke(); },
    body: (w = 0.3, t = 0.05) => { c.beginPath(); c.ellipse(cx + L * 0.12, cy + L * 0.07, L * w / 2, L * t, 0, 0, Math.PI * 2); c.fill(); c.stroke(); },
    nacelle: (y, x0 = cx + L * 0.02) => {
      c.beginPath(); c.roundRect(x0, y, nacLen, nacH, nacH / 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255, 90, 80, 0.85)'; c.beginPath(); c.ellipse(x0 + nacH * 0.6, y + nacH / 2, nacH * 0.45, nacH * 0.38, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = `rgba(110, 180, 255, ${0.35 + e})`; c.fillRect(x0 + nacH * 1.4, y + nacH * 0.3, nacLen - nacH * 2, nacH * 0.4);
      c.fillStyle = glow;
    },
    pylon: (x, y0, y1) => { c.beginPath(); c.moveTo(x, y0); c.lineTo(x + L * 0.05, y1); c.stroke(); },
  };
  let dishAt = [cx - L * 0.01, cy + L * 0.07], nameAt = [cx - L * 0.2, cy - L * 0.09];
  if (h.id === 'escort') {
    // Compact: one wedge with the nacelles tucked along it.
    c.beginPath(); c.moveTo(cx - L * 0.4, cy + L * 0.02); c.lineTo(cx - L * 0.1, cy - L * 0.07); c.lineTo(cx + L * 0.3, cy - L * 0.06); c.lineTo(cx + L * 0.32, cy + L * 0.06); c.lineTo(cx - L * 0.2, cy + L * 0.07); c.closePath(); c.fill(); c.stroke();
    shapes.nacelle(cy + L * 0.085, cx - L * 0.02);
    dishAt = [cx - L * 0.36, cy + L * 0.02]; nameAt = [cx + L * 0.02, cy - L * 0.01];
  } else if (h.id === 'scout' || h.id === 'science') {
    // A small saucer over a pod, the nacelles slung beneath.
    shapes.saucer();
    if (h.id === 'science') { c.beginPath(); c.ellipse(cx + L * 0.05, cy - L * 0.14, L * (0.05 + 0.1 * s), L * 0.03, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    shapes.pylon(cx - L * 0.05, cy - L * 0.05, cy + L * 0.09);
    shapes.nacelle(cy + L * 0.09, cx - L * 0.02);
    dishAt = [cx - L * 0.48, cy - L * 0.09];
  } else {
    // Saucer, neck, engineering hull, and nacelles up on pylons (two drawn as one, side on; a flagship's longer).
    const big = h.id === 'flagship';
    shapes.saucer();
    shapes.neck();
    shapes.body(big ? 0.42 : 0.32, big ? 0.06 : 0.05);
    shapes.pylon(cx + L * 0.12, cy + L * 0.04, cy - L * 0.13);
    shapes.nacelle(cy - L * 0.17 - nacH / 2, cx + L * 0.1);
    if (h.id === 'explorer') { c.beginPath(); c.moveTo(cx + L * 0.24, cy + L * 0.09); c.lineTo(cx + L * 0.36, cy + L * 0.16); c.stroke(); }
  }
  // The deflector, as big and bright as her science allows.
  const dr = L * (0.015 + 0.04 * s);
  const g = c.createRadialGradient(dishAt[0], dishAt[1], 0, dishAt[0], dishAt[1], dr * 2.2);
  g.addColorStop(0, 'rgba(255, 210, 140, 0.95)'); g.addColorStop(0.45, 'rgba(255, 170, 70, 0.6)'); g.addColorStop(1, 'rgba(255, 150, 50, 0)');
  c.fillStyle = g; c.beginPath(); c.arc(dishAt[0], dishAt[1], dr * 2.2, 0, Math.PI * 2); c.fill();
  // Phaser strips along the top of her: one for every tenth of her mass in defence.
  c.strokeStyle = 'rgba(255, 181, 74, 0.9)'; c.lineWidth = 4;
  const strips = Math.round(d * 10);
  for (let k = 0; k < strips; k++) {
    const x = nameAt[0] - L * 0.2 + k * L * 0.4 / Math.max(1, strips - 1 || 1);
    c.beginPath(); c.moveTo(x, nameAt[1] - L * 0.055); c.lineTo(x + L * 0.025, nameAt[1] - L * 0.055); c.stroke();
  }
  // Her name and registry, on the hull.
  const name = cleanName($('name').value), reg = cleanRegistry($('registry').value);
  const k = textScale();
  c.textAlign = 'center'; c.fillStyle = '#e8f0ff';
  c.font = `600 ${Math.round(Math.max(22, L * 0.034) * k)}px "Chakra Petch", sans-serif`;
  c.fillText((reg || 'NCC-?????').toUpperCase(), nameAt[0], nameAt[1] + L * 0.012);
  c.font = `600 ${Math.round(42 * k)}px "Chakra Petch", sans-serif`; c.fillStyle = 'rgba(232, 240, 255, 0.92)';
  c.fillText(name ? fullName({ name }).toUpperCase() : 'UNNAMED', W / 2, H - 46);
  c.font = `600 ${Math.round(30 * k)}px "Chakra Petch", sans-serif`; c.fillStyle = 'rgba(134, 216, 255, 0.75)';
  c.fillText(`${h.name.toUpperCase()} · WARP ${st.top}`, W / 2, 72);
  c.textAlign = 'start';
}
addEventListener('resize', () => draw());

// ---------- Wiring ----------

$('hulls').addEventListener('click', e => {
  const b = e.target.closest('[data-hull]');
  if (!b) return;
  bench.hull = b.dataset.hull;
  renderHulls(); render();
});
for (const k of ['e', 's', 'd']) {
  $(`share-${k}`).addEventListener('input', e => {
    const next = rebalance({ e: bench.e, s: bench.s }, k, Number(e.target.value));
    bench.e = next.e; bench.s = next.s;
    renderMass(); render();
  });
}
$('name').addEventListener('input', () => draw());
$('registry').addEventListener('input', () => draw());
$('suggest').addEventListener('click', () => {
  $('name').value = suggestName(yard.designs.map(d => d.name));
  if (!$('registry').value) $('registry').value = newRegistry();
  draw();
});
$('keep').addEventListener('click', keepHer);
$('fresh').addEventListener('click', fresh);
$('ships').addEventListener('click', e => {
  const t = e.target.closest('[data-open], [data-send], [data-scrap]');
  if (!t) return;
  if (t.dataset.open) open(t.dataset.open);
  else if (t.dataset.send) send(t.dataset.send, t);
  else scrap(t.dataset.scrap);
});

// The shipyard open in another tab has kept or scrapped a ship: this tab shows the same fleet.
watch(KEY, () => { yard = read(); if (editing && !yard.designs.some(d => d.id === editing)) editing = null; render(); renderFleet(); });

// A design someone sent: on the bench, to keep if you like.
function openLink() {
  const m = /^#ship=(.+)$/.exec(location.hash);
  const d = m && decodeDesign(m[1]);
  if (!d) return false;
  bench = { hull: d.hull, e: d.e, s: d.s, name: d.name, registry: d.registry };
  editing = null; fromLink = true;
  $('name').value = d.name; $('registry').value = d.registry;
  $('kept-note').textContent = `The ${fullName(d)}, as someone sent her. Keep her to add her to your shipyard.`;
  return true;
}
addEventListener('hashchange', () => { if (openLink()) { renderHulls(); renderMass(); render(); } });

openLink();
renderHulls();
renderMass();
render();
renderFleet();
document.fonts?.ready.then(() => draw());
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.shipyard = {
  ready: true,
  get bench() { return { ...bench }; },
  get yard() { return structuredClone(yard); },
  keep: keepHer, open, fresh,
  setHull(id) { bench.hull = id; renderHulls(); render(); },
  setShare(k, v) { const n = rebalance({ e: bench.e, s: bench.s }, k, v); bench.e = n.e; bench.s = n.s; renderMass(); render(); },
};
