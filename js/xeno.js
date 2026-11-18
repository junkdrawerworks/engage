// The xenobiology lab: pick a planet class, grow a creature for it, read how the world shaped it, and keep the ones you like.
import { CLASSES, byId, label, grows, worldByName } from './classes.js';
import { Globe, paint } from './planet-art.js';
import { grow, growFor, oddsFor, rarityFor, RECORDS, SEEDS as LAB_SEEDS, sizeText, gText } from './xeno-gen.js';
import { drawScene } from './xeno-art.js';
import { SPECIMENS, specimensFor } from './species.js';
import { LIVE, share } from './share.js';
import { askToKeep, keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';

const KEY = 'engage.xeno.v1';
// Where Engage itself is. The single-file copy points this at the live site.
const BRIDGE = './';
const AWAY = BRIDGE.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const order = CLASSES;
const SEEDS = { earth: 3, forest: 2, mars: 1, desert: 1, venus: 1, ocean: 2, ice: 1, rock: 2, demon: 1, jovian: 1, ultra: 1, rogue: 1, superearth: 1, subneptune: 1, lava: 1, hotjupiter: 1, icegiant: 4 };
const ODDS_HEAD = { likely: 'Plausible', possible: 'Possible', long: 'A long shot', wild: 'Pure speculation' };

const saved = load();
let current = null; // the creature in the tank
let born = 0; // when it started growing
const tank = $('tank');
const tg = tank.getContext('2d');
const tankSeen = onScreen(tank); // the creature isn't drawn while the tank is scrolled out of sight
let draws = 0;                   // how many times it has been drawn, for tests

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* start again */ }
  // A jar holds a class and a specimen number, or a real planet's name and a number: { id, seed } or { world, seed }.
  const known = j => (typeof j.world === 'string' ? grows(worldByName(j.world)?.world) : byId.has(j.id));
  const jars = Array.isArray(s.jars) ? s.jars.filter(j => j && Number.isInteger(j.seed) && known(j)) : [];
  return { ...s, jars };
}
// Keeps the shelf, and says so beside Keep and over the jars when the browser wouldn't take it: a jar that is on
// screen and gone on the next visit is worse than being told. Returns whether it worked.
let unsaved = '';
function save() {
  unsaved = keep(KEY, saved);
  for (const id of ['keep-unsaved', 'jars-unsaved']) {
    $(id).hidden = !unsaved;
    $(id).textContent = unkept(unsaved, 'the lab', 'changes to your jars');
  }
  return !unsaved;
}

const newSeed = () => 1 + Math.floor(Math.random() * LAB_SEEDS);

// ---------- Growing ----------

// A creature for a class, or (showWorld) for one of the survey's real planets, by its name.
function show(id, seed = newSeed(), animate = true) { put(grow(id, seed), animate); }
function showWorld(name, seed = newSeed(), animate = true) { put(growFor(name, seed), animate); }

// What names a creature: in its link (after the #), and in its jar.
const linkOf = c => (c.world ? `world=${encodeURIComponent(c.world.name)}-${c.seed}` : `${encodeURIComponent(c.classId)}-${c.seed}`);
const jarOf = c => (c.world ? { world: c.world.name, seed: c.seed } : { id: c.classId, seed: c.seed });
const inJar = (j, c) => j.seed === c.seed && (c.world ? j.world === c.world.name : !j.world && j.id === c.classId);
const growJar = j => (j.world ? growFor(j.world, j.seed) : grow(j.id, j.seed));
const lyText = ly => (ly >= 100 ? Math.round(ly).toLocaleString('en-US') : String(ly));

function put(c, animate) {
  current = c;
  $('link-note').hidden = true;
  born = animate && !still.matches ? performance.now() : -1e9;
  const id = c.classId;
  $('tank-tag').textContent = `${c.world ? c.world.name : label(c.cls)} · Specimen ${String(c.seed).padStart(4, '0')}`;
  $('specimen').innerHTML = cardHtml(c);
  renderKeep();
  renderRefs(id);
  document.querySelectorAll('#strip .chip').forEach(b => {
    const on = b.dataset.id === id;
    b.setAttribute('aria-current', on ? 'true' : 'false');
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: still.matches ? 'auto' : 'smooth' });
  });
  try { history.replaceState(null, '', `#${linkOf(c)}`); } catch { /* fine */ }
  document.title = `${c.name.common} · Xenobiology lab · Engage`;
  if (still.matches) frame(performance.now());
}

function cardHtml(c) {
  const plantOnly = c.classId === 'L';
  // The real planets on this class's file that the lab has readings for, other than the one in the tank.
  const real = c.cls.worlds.filter(w => grows(w) && w !== c.world);
  // How rare it is among its class's 9,999 specimens, when it is; and its record, if it holds one.
  const rarity = rarityFor(c);
  return `
    <p class="eyebrow">${c.world ? `Grown for ${esc(c.world.name)}, ${esc(lyText(c.world.ly))} light years away` : `Specimen grown for ${esc(label(c.cls))}${c.cls.letter ? ` · ${esc(c.cls.name)}` : ''}`}</p>
    <h2>${esc(c.name.common)}</h2>
    <p class="latin">${esc(c.name.genus)} ${esc(c.name.species)}</p>
    <p class="odds"><b>${ODDS_HEAD[c.odds]}.</b> ${esc(oddsFor(c).replace(/^[^.]+\. /, ''))}</p>
    ${rarity ? `<p class="rarity">${esc(rarity).replace(/^(One of a kind|Uncommon|Lab record):/, '<b>$1:</b>').replace(/ (Lab record):/, ' <b>$1:</b>')}</p>` : ''}
    ${plantOnly ? '<p class="aside">Class L worlds have plant life and no animals, so the lab grew a plant.</p>' : ''}
    <ul class="notes">${c.notes.map(n => `<li><h3>${esc(n.label)}</h3><p>${esc(n.text)}</p></li>`).join('')}</ul>
    ${real.length ? `<p class="for-real">Or grow one for ${c.world ? 'another' : 'a'} real planet on this file: ${real.map(w => `<a href="#world=${encodeURIComponent(w.name)}">${esc(w.name)}</a>`).join(', ')}.</p>` : ''}
    <a class="to-file" href="${BRIDGE}survey.html#${esc(c.classId)}"${AWAY}>Read the ${esc(label(c.cls))} survey file <span aria-hidden="true">→</span></a>
    ${c.world?.star ? `<a class="to-file" href="${BRIDGE}?course=${encodeURIComponent(c.world.star)}"${AWAY}>Set course for its star <span aria-hidden="true">→</span></a>` : ''}
  `;
}

// ---------- The tank ----------

function size() {
  const r = tank.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (tank.width !== w || tank.height !== h) { tank.width = w; tank.height = h; }
  return { w: r.width, h: r.height, dpr };
}

function frame(now) {
  if (!current) return;
  const { w, h, dpr } = size();
  if (!w) return;
  tg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = still.matches ? 0 : now / 1000;
  const grown = Math.min(1, (now - born) / 1400);
  drawScene(tg, current, w, h, t, grown);
  draws++;
}

function loop(now) {
  if (!still.matches && !document.hidden && tankSeen.on) frame(now);
  requestAnimationFrame(loop);
}

// ---------- Reference specimens ----------

function refHtml(s) {
  const cls = byId.get(s.cls);
  return `<li><div class="ref-head"><b>${esc(s.name)}</b><span class="ref-kind ${s.kind}">${s.kind === 'trek' ? 'Star Trek' : 'Earth'}</span></div>
    <p class="ref-home">${esc(s.home)} · ${esc(label(cls))}</p><p>${esc(s.note)}</p></li>`;
}

function renderRefs(id) {
  const list = specimensFor(id);
  const c = byId.get(id);
  $('refs-sub').textContent = list.length
    ? `Life from Star Trek and from Earth that helps explain ${label(c)}.`
    : `Nothing on file for ${label(c)} yet.`;
  $('refs').innerHTML = list.map(refHtml).join('');
}

// ---------- Lab records ----------

// The record-holders among everything the lab can grow, each a link that grows it. What a record measures is read
// off the creature itself, so the shelf can't disagree with the tank.
function renderRecords() {
  const n = x => x.toLocaleString('en-US');
  $('records-sub').textContent = `The lab can grow ${n(CLASSES.length * LAB_SEEDS)} creatures: ${n(LAB_SEEDS)} for each of its ${CLASSES.length} kinds of world. These hold the records among them.`;
  $('records').innerHTML = RECORDS.map(r => {
    const c = grow(r.cls, r.seed);
    const what = { largest: `${sizeText(c.body.size)} across`, smallest: `${sizeText(c.body.size)} long`, gravity: `lives at ${gText(c.env.g)}`,
      walker: `${sizeText(c.body.size)} tall, at ${gText(c.env.g)}`, wings: `${sizeText(c.body.size)} from tip to tip`, lone: `the only ${label(c.cls)} specimen that flies` }[r.id];
    return `<li><a href="#${encodeURIComponent(r.cls)}-${r.seed}"><b>${esc(r.title)}</b><span class="rec-name">${esc(c.name.common)}</span><span class="rec-what">${esc(label(c.cls))} · ${esc(what)}</span></a></li>`;
  }).join('');
}

// ---------- Jars ----------

// A kept creature is only let go when the person says so. When the shelf is full, Keep says so and waits.
const JAR_MAX = 40;
const isKept = () => !!current && saved.jars.some(j => inJar(j, current));

function renderKeep() {
  const kept = isKept();
  const n = saved.jars.length;
  const full = !kept && n >= JAR_MAX;
  $('keep').textContent = kept ? 'In a jar' : full ? 'Jars full: let one go first' : 'Keep in a jar';
  $('keep').setAttribute('aria-pressed', kept ? 'true' : 'false');
  $('keep').disabled = full;
  // The jars are at the foot of the page, below the reference cards, so say how many there are and link to them.
  $('kept-note').hidden = !n;
  $('kept-note').innerHTML = full
    ? `All ${JAR_MAX} jars are full. <a href="#jars-head">Let one go</a> to keep this one.`
    : `<a href="#jars-head">${n} kept in your jars <span aria-hidden="true">↓</span></a>`;
}

function toggleKeep() {
  if (!current) return;
  const i = saved.jars.findIndex(j => inJar(j, current));
  if (i >= 0) saved.jars.splice(i, 1);
  else if (saved.jars.length < JAR_MAX) saved.jars.unshift(jarOf(current));
  else return;
  // With the shelf full again there is nowhere to put back the one just let go, so its Undo goes too.
  if (gone && saved.jars.length >= JAR_MAX) { clearTimeout(gone.timer); gone = null; }
  save();
  if (i < 0 && !unsaved) askToKeep(); // once ever: the browser is asked to keep Engage's storage
  renderKeep();
  renderJars();
}

// Letting one go can be taken back for a few seconds: the X sits right on the tile that opens the jar.
let gone = null; // { jar, at, name, timer }
function letGo(j) {
  const at = saved.jars.indexOf(j);
  if (at < 0) return;
  saved.jars.splice(at, 1);
  clearTimeout(gone?.timer);
  gone = { jar: j, at, name: growJar(j).name.common, timer: setTimeout(() => { gone = null; renderJars(); }, 8000) };
  save(); renderJars(); renderKeep();
}
function undoLetGo() {
  if (!gone) return;
  clearTimeout(gone.timer);
  const { jar, at } = gone;
  gone = null;
  if (saved.jars.length < JAR_MAX && !saved.jars.some(j => sameJar(j, jar))) saved.jars.splice(Math.min(at, saved.jars.length), 0, jar);
  save(); renderJars(); renderKeep();
}

function renderJars() {
  const list = saved.jars;
  $('jars-wrap').hidden = !list.length && !gone;
  $('jars-n').textContent = `${list.length} of ${JAR_MAX}`;
  $('jar-undo').hidden = !gone;
  if (gone) $('jar-undo-text').textContent = `Let the ${gone.name} go.`;
  $('jars').innerHTML = list.map((j, k) => {
    const c = growJar(j);
    return `<li class="jar"><button class="jar-open" type="button" data-k="${k}"><canvas width="300" height="225" aria-hidden="true"></canvas>
      <span class="jar-name">${esc(c.name.common)}</span><span class="jar-cls">${esc(c.world ? c.world.name : label(c.cls))}</span></button>
      <button class="jar-drop" type="button" data-drop="${k}" aria-label="Let the ${esc(c.name.common)} go">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`;
  }).join('');
  $('jars').querySelectorAll('.jar-open canvas').forEach((cv, k) => {
    const g = cv.getContext('2d');
    drawScene(g, growJar(list[k]), cv.width, cv.height, 0, 1);
  });
}

// ---------- Planet strip ----------

function buildStrip() {
  const strip = $('strip');
  let html = '';
  order.forEach((c, k) => {
    if (k === 0) html += '<p class="strip-group">Starfleet</p>';
    if (!c.letter && order[k - 1]?.letter) html += '<p class="strip-group">Real, unnamed</p>';
    html += `<button class="chip" type="button" data-id="${esc(c.id)}" aria-label="${esc(label(c))}: ${esc(c.short)}">
      <canvas width="96" height="96" aria-hidden="true"></canvas><span>${esc(c.letter || c.name)}</span></button>`;
  });
  strip.innerHTML = html;
  strip.addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) show(b.dataset.id);
  });
  const chips = [...strip.querySelectorAll('.chip canvas')];
  let k = 0;
  const next = () => {
    const end = performance.now() + 12;
    while (k < chips.length && performance.now() < end) {
      const c = order[k];
      const g = new Globe(chips[k]);
      g.setMap(paint(c.art, SEEDS[c.art] || 1, 128));
      g.draw(0.8, 96);
      k++;
    }
    if (k < chips.length) setTimeout(next, 0);
  };
  setTimeout(next, 30);
}

// ---------- Start ----------

// What the address asks for: a class, and a specimen number if it gives one. A link cut off or mangled on its way
// (a stray "%" isn't an address at all) asks for nothing, and the lab opens as usual. The class is read in either
// case (#m-5 is Class M's specimen 5), and specimen 0 is one the lab never grows, so it counts as no number.
function hashText() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}
// A real planet is asked for by name: #world=Proxima b-42 (the name can have hyphens of its own: TRAPPIST-1 e).
function fromHash() {
  const m = hashText().match(/^(.+?)(?:-(\d{1,4}))?$/);
  if (!m) return null;
  const seed = Number(m[2]) || newSeed();
  if (/^world=/i.test(m[1])) {
    const w = worldByName(m[1].slice(6))?.world;
    return grows(w) ? { world: w.name, seed } : null;
  }
  const cls = CLASSES.find(c => c.id.toLowerCase() === m[1].toLowerCase());
  return cls ? { id: cls.id, seed } : null;
}
const open = (h, animate = true) => (h.world ? showWorld(h.world, h.seed, animate) : show(h.id, h.seed, animate));

buildStrip();
$('cabinet').innerHTML = SPECIMENS.map(refHtml).join('');
renderRecords();
// A record's link grows it in the tank, which may be a long way up the page.
$('records').addEventListener('click', e => { if (e.target.closest('a')) $('tank').scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' }); });
$('again').addEventListener('click', () => (current.world ? showWorld(current.world.name) : show(current.classId)));
$('keep').addEventListener('click', toggleKeep);
// A link that grows the same creature again: its class and its number, as the address bar has them.
$('send').addEventListener('click', e => {
  const c = current;
  if (!c) return;
  share(e.currentTarget, {
    title: `${c.name.common}, from Engage’s xenobiology lab`,
    text: `Meet the ${c.name.common} (${c.name.genus} ${c.name.species}), grown for ${c.world ? c.world.name : c.cls.letter ? label(c.cls) : c.cls.inText || label(c.cls)} in Engage’s xenobiology lab.`,
    url: `${LIVE}xeno.html#${linkOf(c)}`,
  });
});
$('jar-undo-go').addEventListener('click', undoLetGo);
// The address keeps naming the creature in the tank, so the link down to the jars scrolls without changing it.
$('kept-note').addEventListener('click', e => {
  if (!e.target.closest('a')) return;
  e.preventDefault();
  $('jars-head').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
});
$('jars').addEventListener('click', e => {
  const drop = e.target.closest('[data-drop]');
  const list = saved.jars;
  if (drop) { letGo(list[Number(drop.dataset.drop)]); return; }
  const tile = e.target.closest('[data-k]');
  if (tile) {
    const j = list[Number(tile.dataset.k)];
    put(growJar(j), true);
    $('tank').scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' });
  }
});
// The lab open in another tab has kept a creature or let one go: the shelf here is what that tab saved, so the next
// jar kept here goes beside its jars and not over them. One this tab has just let go, and can still take back,
// stays gone.
const sameJar = (a, b) => a.seed === b.seed && a.id === b.id && a.world === b.world;
watch(KEY, () => {
  saved.jars = load().jars.filter(j => !(gone && sameJar(j, gone.jar)));
  renderJars();
  renderKeep();
});
window.addEventListener('hashchange', () => {
  const h = fromHash();
  if (!h && location.hash.length > 1) $('link-note').hidden = false; // a link that names nothing the lab knows: say so, and leave the tank as it is
  if (h && (!current || h.seed !== current.seed || (h.world ? h.world !== current.world?.name : !!current.world || h.id !== current.classId))) open(h);
});
window.addEventListener('resize', () => { if (still.matches) frame(performance.now()); });
still.addEventListener?.('change', () => frame(performance.now()));

window.xeno = { show, showWorld, get current() { return current; }, get jars() { return saved.jars; }, get draws() { return draws; } };

// A link that names nothing the lab knows (a class it hasn't got, a planet it has no readings for, a link cut off on
// its way) still opens the lab, on a new creature, with a line to say that is what happened.
const asked = location.hash.length > 1, linked = fromHash();
open(linked || { id: 'M', seed: newSeed() });
$('link-note').hidden = !asked || !!linked;
renderJars();
requestAnimationFrame(loop);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
