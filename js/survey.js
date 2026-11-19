// The planetary survey: flip through the planet classes, or match an unlogged world to the file it would pass for.
import { CLASSES, byId, label, quizReadings, grows, streakRecord } from './classes.js';
import { Globe, paint, paintSoon } from './planet-art.js';
import { keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';
import { LIVE, share } from './share.js';

const KEY = 'engage.survey.v1';
// Where Engage itself is. The single-file copy points this at the live site.
const BRIDGE = './';
const XENO = `${BRIDGE}xeno.html`;
const AWAY = BRIDGE.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');

const saved = load();
let mode = 'files';
let at = 0; // the file on screen
let turn = 0, last = performance.now();
const globe = new Globe($('globe'));
const drillGlobe = new Globe($('drill-globe'));
const inView = new Map([[globe, onScreen(globe.canvas)], [drillGlobe, onScreen(drillGlobe.canvas)]]);
let drill = null; // the world being matched
let paintId = 0;

// The quiz's streak, its best and how many worlds have been seen: whole numbers from nought up, or else nought. And
// when the best was made (a moment in milliseconds, or nought), for the line the captain's log gives it.
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* start again */ }
  if (!s || typeof s !== 'object') s = {};
  const count = x => (Number.isInteger(x) && x >= 0 ? x : 0);
  const streak = count(s.streak);
  return { best: Math.max(count(s.best), streak), streak, seen: count(s.seen), bestAt: count(s.bestAt) };
}
// Keeps the streak and the best. When the browser won't take them, a line under the score says so. Returns whether
// it worked.
let unsaved = '';
function save() {
  unsaved = keep(KEY, saved);
  $('score-unsaved').hidden = !unsaved;
  $('score-unsaved').textContent = unkept(unsaved, 'the survey', 'your streak');
  return !unsaved;
}

// ---------- Numbers ----------

const R_EARTH_KM = 6371;
function num(x) {
  if (x >= 100) return Math.round(x).toLocaleString('en-US');
  if (x >= 10) return x.toFixed(0);
  if (x >= 1) return x.toFixed(1).replace(/\.0$/, '');
  if (x >= 0.1) return x.toFixed(2).replace(/0$/, '');
  return x.toPrecision(1);
}
const range = ([a, b], f) => (a === b ? f(a) : `${f(a)}–${f(b)}`);
// A planet's distance as its file gives it: to a tenth of a light year under 100, as the helm shows it.
const lyText = ly => (ly >= 100 ? Math.round(ly).toLocaleString('en-US') : String(ly));
function widthText(w) {
  if (Array.isArray(w)) return `${range(w, num)} × Earth`;
  const km = w * 2 * R_EARTH_KM;
  const r = km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10;
  return `${num(w)} × Earth, ${r.toLocaleString('en-US')} km across`;
}
function massText(m) {
  const jup = x => (x >= 60 ? ` (${num(x / 318)} × Jupiter)` : '');
  if (Array.isArray(m)) return `${range(m, num)} × Earth`;
  return `${num(m)} × Earth${jup(m)}`;
}
const celsius = k => Math.round(k - 273.15);
function tempText(t, gas) {
  const where = gas ? 'at the cloud tops' : '';
  if (Array.isArray(t)) return `${range(t, x => Math.round(x).toLocaleString('en-US'))} K${where ? ` ${where}` : ''}`;
  const c = celsius(t);
  return `${Math.round(t).toLocaleString('en-US')} K (${c < 0 ? '−' : ''}${Math.abs(c).toLocaleString('en-US')} °C)${where ? ` ${where}` : ''}`;
}
function days(d) {
  if (d < 1) return `${Math.round(d * 24)} hours`;
  if (d < 2) return '1 day';
  if (d < 700) return `${Math.round(d)} days`;
  const y = d / 365.25;
  return `${y < 10 ? y.toFixed(1).replace(/\.0$/, '') : Math.round(y).toLocaleString('en-US')} years`;
}
function yearText(y) {
  if (!y) return 'No star to circle';
  if (Array.isArray(y)) return y[0] === y[1] ? days(y[0]) : `${days(y[0])} to ${days(y[1])}`;
  return days(y);
}
const GAS = new Set(['jovian', 'ultra', 'subneptune', 'hotjupiter', 'icegiant', 'venus']);

// ---------- Survey files ----------

const order = CLASSES;
const maps = new Map(); // `${art}:${seed}:${w}` → map

function mapFor(art, seed, w) {
  const k = `${art}:${seed}:${w}`;
  if (!maps.has(k)) maps.set(k, paint(art, seed, w));
  return maps.get(k);
}

// Shows a world quickly in a rough map, then swaps in a sharp one once it's painted.
// The survey files have fixed seeds, so their maps are kept in `maps` for good: 17 worlds, two sizes each.
// A quiz world is a one-off with a seed of its own, so its maps ride on the world itself (`holder`) and go when the
// next one is made. Kept in `maps`, every question left about a megabyte behind.
async function show(target, art, seed, holder = null) {
  const id = ++paintId;
  if (holder) {
    holder.rough ||= paint(art, seed, 128);
    target.setMap(holder.sharp || holder.rough);
    if (holder.sharp) return;
    const map = await paintSoon(art, seed, 512, () => id !== paintId);
    if (map) { holder.sharp = map; target.setMap(map); }
    return;
  }
  target.setMap(mapFor(art, seed, 128));
  const sharp = `${art}:${seed}:512`;
  if (maps.has(sharp)) { target.setMap(maps.get(sharp)); return; }
  const map = await paintSoon(art, seed, 512, () => id !== paintId);
  if (map) { maps.set(sharp, map); target.setMap(map); }
}

const SEEDS = { earth: 3, forest: 2, mars: 1, desert: 1, venus: 1, ocean: 2, ice: 1, rock: 2, demon: 1, jovian: 1, ultra: 1, rogue: 1, superearth: 1, subneptune: 1, lava: 1, hotjupiter: 1, icegiant: 4 };

function openFile(i, push = true) {
  at = (i + order.length) % order.length;
  const c = order[at];
  show(globe, c.art, SEEDS[c.art] || 1);
  $('badge').innerHTML = c.letter
    ? `<span class="badge-k">Class</span><span class="badge-l">${esc(c.letter)}</span>`
    : '<span class="badge-k">No Starfleet</span><span class="badge-k">letter</span>';
  $('counter').textContent = `File ${at + 1} of ${order.length}`;
  $('file').innerHTML = fileHtml(c);
  document.querySelectorAll('#strip .chip').forEach((b, k) => {
    b.setAttribute('aria-current', k === at ? 'true' : 'false');
    if (k === at) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: still.matches ? 'auto' : 'smooth' });
  });
  if (push) try { history.replaceState(null, '', `#${c.id}`); } catch { /* fine */ }
  if (mode === 'files') document.title = `${label(c)} · Planetary survey · Engage`;
}

// A link to the file on screen.
function shareFile(button) {
  const c = order[at];
  return share(button, {
    title: `${label(c)}, from Engage’s planetary survey`,
    text: `${label(c)}${c.letter ? `, ${c.name}` : ''}: ${midSentence(c.short)}. A survey file from Engage.`,
    url: `${LIVE}survey.html#${encodeURIComponent(c.id)}`,
  });
}

function fileHtml(c) {
  const t = c.typical;
  const gas = GAS.has(c.art) && c.art !== 'venus';
  const rows = [
    ['Width', widthText(t.width)],
    ['Mass', massText(t.mass)],
    [gas ? 'Temperature' : 'Surface', tempText(t.temp, gas)],
    ['Year', yearText(t.year)],
    ['Air', t.air],
    ['Water', t.water],
    ['Life', t.life],
  ];
  const worlds = c.worlds.map(w => {
    const fly = w.star ? `<a class="fly" href="${BRIDGE}?course=${encodeURIComponent(w.star)}"${AWAY}>Set course <span aria-hidden="true">→</span></a>`
      + `<a class="fly" href="${BRIDGE}tonight.html#star=${encodeURIComponent(w.star)}"${AWAY}>In your sky tonight <span aria-hidden="true">→</span></a>` : '';
    // Where the planet's own mass, temperature and star are on file, the lab can grow something for it and not just its class.
    const life = grows(w) ? `<a class="fly" href="${XENO}#world=${encodeURIComponent(w.name)}"${AWAY}>Grow a creature for ${esc(w.name)} <span aria-hidden="true">→</span></a>` : '';
    const tag = w.misfit ? '<span class="misfit">Doesn’t fit the readings above</span>' : '';
    return `<li><div class="w-head"><b>${esc(w.name)}</b><span class="ly">${esc(lyText(w.ly))} ly</span></div>${tag}<p>${esc(w.note)}</p>${fly || life ? `<div class="w-links">${fly}${life}</div>` : ''}</li>`;
  }).join('');
  return `
    <p class="eyebrow">${c.letter ? 'Starfleet survey file' : 'Found by astronomers'}</p>
    <h2>${esc(label(c))}${c.letter ? ` <span class="nick">${esc(c.name)}</span>` : ''}</h2>
    <p class="real">${esc(c.real)}</p>
    <p class="about">${esc(c.about)}</p>
    <dl class="readings">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <h3>In the Solar System</h3>
    <p>${esc(c.home)}</p>
    ${c.science ? `<p>${esc(c.science)}</p>` : ''}
    <h3>${c.candidate ? 'Real candidates' : 'Out there'}</h3>
    ${worlds ? `<ul class="worlds">${worlds}</ul>` : '<p class="none">No real planet known to fit yet.</p>'}
    <h3>Life</h3>
    <a class="fly" href="${XENO}#${esc(c.id)}"${AWAY}>Grow a creature for ${esc(label(c))} <span aria-hidden="true">→</span></a>
    <p class="share-row"><button class="text-button" type="button" data-share>Share this file</button></p>
  `;
}

function buildStrip() {
  const strip = $('strip');
  let html = '';
  order.forEach((c, k) => {
    if (k === 0) html += '<p class="strip-group">Starfleet</p>';
    if (!c.letter && order[k - 1]?.letter) html += '<p class="strip-group">Real, unnamed</p>';
    html += `<button class="chip" type="button" data-i="${k}" aria-label="${esc(label(c))}: ${esc(c.short)}">
      <canvas width="96" height="96" aria-hidden="true"></canvas><span>${esc(c.letter || c.name)}</span></button>`;
  });
  strip.innerHTML = html;
  strip.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (b) openFile(Number(b.dataset.i));
  });
  // Paint the thumbnails a few at a time so the first file isn't held up.
  const chips = [...strip.querySelectorAll('.chip canvas')];
  let k = 0;
  const next = () => {
    const end = performance.now() + 12;
    while (k < chips.length && performance.now() < end) {
      const c = order[k];
      const g = new Globe(chips[k]);
      g.setMap(mapFor(c.art, SEEDS[c.art] || 1, 128));
      g.draw(0.8, 96);
      k++;
    }
    if (k < chips.length) setTimeout(next, 0);
  };
  setTimeout(next, 30);
}

// ---------- Cover your tracks ----------

const GROUPS = [
  ['D', 'K', 'P', 'R'],
  ['M', 'L', 'H', 'O', 'super-earth'],
  ['N', 'Y', 'lava-world'],
  ['J', 'T', 'hot-jupiter', 'ice-giant', 'sub-neptune'],
];
const groupOf = id => GROUPS.find(g => g.includes(id));
const pick = list => list[Math.floor(Math.random() * list.length)];
const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };

function newWorld() {
  let c;
  do c = pick(CLASSES); while (drill && c.id === drill.cls.id);
  const world = {
    cls: c,
    seed: 1 + Math.floor(Math.random() * 9999),
    ...quizReadings(c), // width, mass, temp and year
    maps: {}, // its two painted maps, dropped with it
    survey: `${pick(['Unlogged world', 'Unnamed planet', 'Uncharted world'])} · Sector ${100 + Math.floor(Math.random() * 900)}`,
  };
  // Three other files to choose from: at least one that's easy to confuse with it.
  const near = shuffle(groupOf(c.id).filter(id => id !== c.id)).slice(0, 2);
  const others = shuffle(CLASSES.map(x => x.id).filter(id => id !== c.id && !near.includes(id)));
  world.choices = shuffle([c.id, ...near, ...others].slice(0, 4).map(id => byId.get(id)));
  return world;
}

function renderDrill() {
  const w = drill;
  const c = w.cls, t = c.typical;
  const gas = GAS.has(c.art) && c.art !== 'venus';
  show(drillGlobe, c.art, w.seed, w.maps);
  $('drill-tag').textContent = w.survey;
  const rows = [
    ['Width', widthText(w.width)],
    ['Mass', massText(w.mass)],
    [gas ? 'Temperature' : 'Surface', tempText(w.temp, gas)],
    ['Year', yearText(w.year)],
    ['Air', t.air],
    ['Water', t.water],
    ['Life', t.life],
  ];
  $('readings').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('choices').innerHTML = w.choices.map(x => `
    <button class="choice" type="button" data-id="${esc(x.id)}">
      <canvas width="112" height="112" aria-hidden="true"></canvas>
      <span class="c-name">${esc(label(x))}</span>
      <span class="c-sub">${esc(x.short)}</span>
    </button>`).join('');
  $('choices').querySelectorAll('.choice').forEach(b => {
    const x = byId.get(b.dataset.id);
    const g = new Globe(b.querySelector('canvas'));
    g.setMap(mapFor(x.art, SEEDS[x.art] || 1, 128));
    g.draw(0.8, 112);
  });
  $('verdict').hidden = true;
  $('prompt').hidden = false;
  $('drill-intro').hidden = saved.seen > 0;
  renderScore();
}

function answer(id) {
  if (!drill || drill.answered) return;
  drill.answered = true;
  const c = drill.cls;
  const right = id === c.id;
  saved.seen++;
  const bestBefore = saved.best;
  saved.streak = right ? saved.streak + 1 : 0;
  saved.best = Math.max(saved.best, saved.streak);
  if (saved.best > bestBefore) saved.bestAt = Date.now();
  save();
  // A new best streak is said in the verdict, not left to the small score line under it.
  const record = right && streakRecord(bestBefore, saved.streak);
  $('verdict-record').hidden = !record;
  $('verdict-record').textContent = record ? `Best streak yet: ${saved.streak}` : '';
  $('choices').querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.dataset.id === c.id) b.classList.add('right');
    else if (b.dataset.id === id) b.classList.add('wrong');
  });
  const picked = byId.get(id);
  $('verdict-head').textContent = right ? 'Record filed. Nobody will look twice.' : `That file wouldn’t fool anyone. It’s ${c.inText || label(c)}.`;
  $('verdict-head').className = `verdict-head ${right ? 'ok' : 'bad'}`;
  $('verdict-text').textContent = right ? c.tell : `${c.tell} ${hint(picked)}.`;
  $('verdict-file').href = `#${c.id}`;
  $('verdict').hidden = false;
  $('prompt').hidden = true;
  renderScore();
  $('drill-next').focus({ preventScroll: true });
  $('verdict').scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
}

// What the wrong pick would have needed to look like, in a few words.
function hint(c) {
  const t = c.typical;
  const gas = GAS.has(c.art) && c.art !== 'venus';
  const k = x => Math.round(x).toLocaleString('en-US');
  const air = midSentence(t.air);
  return `The ${label(c)} file says ${midSentence(c.short)}: ${range(t.width, num)} × Earth’s width, ${k(t.temp[0])}–${k(t.temp[1])} K${gas ? ' at the cloud tops' : ''}, ${air}`;
}
// Starts lower-case in the middle of a sentence, unless it starts with a name: "Earth-like", "Jupiter-like".
function midSentence(s) {
  return /^(Earth|Jupiter|Neptune)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

// The quiz played in another tab: the streak and the best here are what that tab saved.
watch(KEY, () => { Object.assign(saved, load()); renderScore(); });

function renderScore() {
  $('score').textContent = saved.seen
    ? `Streak ${saved.streak} · Best ${saved.best}`
    : '';
}

// ---------- Modes and input ----------

function setMode(m, push = true) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'));
  $('files').hidden = m !== 'files';
  $('drill').hidden = m !== 'drill';
  if (m === 'drill') {
    if (!drill || drill.answered) drill = newWorld();
    renderDrill();
    if (push) try { history.replaceState(null, '', '#drill'); } catch { /* fine */ }
    document.title = 'Cover your tracks · Planetary survey · Engage';
  } else {
    openFile(at, push);
  }
}

// A link cut off or mangled on its way (a stray "%" isn't an address at all) opens the files where they were.
function hashText() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}
function fromHash() {
  const h = hashText();
  if (h === 'drill') return setMode('drill', false);
  const i = order.findIndex(c => c.id.toLowerCase() === h.toLowerCase());
  if (i >= 0) at = i;
  setMode('files', false);
}

function bind() {
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('file').addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) shareFile(b); });
  $('prev').addEventListener('click', () => openFile(at - 1));
  $('next').addEventListener('click', () => openFile(at + 1));
  $('choices').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) answer(b.dataset.id); });
  $('drill-next').addEventListener('click', () => { drill = newWorld(); renderDrill(); window.scrollTo({ top: 0, behavior: still.matches ? 'auto' : 'smooth' }); });
  $('verdict-file').addEventListener('click', e => {
    e.preventDefault();
    at = order.indexOf(drill.cls);
    setMode('files');
    window.scrollTo({ top: 0 });
  });
  window.addEventListener('hashchange', fromHash);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (mode === 'files' && e.key === 'ArrowLeft') openFile(at - 1);
    else if (mode === 'files' && e.key === 'ArrowRight') openFile(at + 1);
  });
  // Swipe the planet to flip files.
  let start = null;
  const v = $('viewer');
  v.addEventListener('pointerdown', e => { start = [e.clientX, e.clientY]; });
  v.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start[0], dy = e.clientY - start[1];
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) openFile(at + (dx < 0 ? 1 : -1));
  });
  v.addEventListener('pointercancel', () => { start = null; });
}

// ---------- Turning ----------

function sizeFor(canvas) {
  const css = canvas.getBoundingClientRect().width || 300;
  return Math.min(720, Math.round(css * Math.min(devicePixelRatio || 1, 2)));
}

// The globe is painted pixel by pixel, the dearest thing any room draws. It is drawn only while it is on the screen
// (not while a long file is being read under it), and at most 30 times a second as it turns: at 0.12 radians a second
// that is a pixel or two between pictures. Another world, or another size, is drawn at once.
let drew = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    turn += dt * (still.matches ? 0 : 0.12);
    const g = mode === 'files' ? globe : drillGlobe;
    if (inView.get(g).on) {
      const size = sizeFor(g.canvas);
      if (now - drew >= 30 || g.stale(size)) { g.draw(turn, size); drew = now; }
    }
  }
  requestAnimationFrame(frame);
}

buildStrip();
bind();
fromHash();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.survey = { open: id => openFile(order.findIndex(c => c.id === id)), mode: setMode, get world() { return drill; }, answer, get cached() { return maps.size; }, get draws() { return (globe.draws || 0) + (drillGlobe.draws || 0); } };
