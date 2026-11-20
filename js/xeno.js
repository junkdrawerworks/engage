// The xenobiology lab: pick a planet class, grow a creature for it, read how the world shaped it, and keep the ones you like.
import { CLASSES, byId, label, grows } from './classes.js';
import { worldFor, auText } from './worlds.js';
import { Globe, paint } from './planet-art.js';
import { grow, growFor, oddsFor, rarityFor, RECORDS, SEEDS as LAB_SEEDS, sizeText, gText, tempText, STARS, bench, BENCH, STEPS, benchPos, benchValue, four, readingsOf, changedParts, fileFor, compare, neighbours } from './xeno-gen.js';
import { drawScene, drawCard, CARD_W, CARD_H } from './xeno-art.js';
import { SPECIMENS, specimensFor, tribbles } from './species.js';
import { LIVE, share } from './share.js';
import { askToKeep, keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, the text size from Bridge settings, and the Keys card (press ?).
setUpRoom({ sound, keys: [['← →', 'Between Grow and the bench, on their tabs']] });

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
  // A jar holds a class and a specimen number, or a real planet's name (or a placed planet's key, see placedKey in
  // js/worlds.js) and a number: { id, seed } or { world, seed }.
  const known = j => (typeof j.world === 'string' ? grows(worldFor(j.world)?.world) : byId.has(j.id));
  // A jar may carry a name of yours: a short line of text, or none.
  const named = j => (typeof j.name === 'string' && j.name.trim() ? { ...j, name: j.name.trim().slice(0, 24) } : (({ name, ...rest }) => rest)(j));
  const jars = Array.isArray(s.jars) ? s.jars.filter(j => j && Number.isInteger(j.seed) && known(j)).map(named) : [];
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
// (A placed planet goes by its key, which says where it is; its name is only "Your planet at Vega".)
const keyOf = w => w.key || w.name;
const linkOf = c => (c.world ? `world=${encodeURIComponent(keyOf(c.world))}-${c.seed}` : `${encodeURIComponent(c.classId)}-${c.seed}`);
const jarOf = c => (c.world ? { world: keyOf(c.world), seed: c.seed } : { id: c.classId, seed: c.seed });
const inJar = (j, c) => j.seed === c.seed && (c.world ? j.world === keyOf(c.world) : !j.world && j.id === c.classId);
const growJar = j => (j.world ? growFor(j.world, j.seed) : grow(j.id, j.seed));
const lyText = ly => (ly >= 100 ? Math.round(ly).toLocaleString('en-US') : String(ly));

function put(c, animate) {
  setMode('grow');
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
    <p class="eyebrow">${c.world ? `Grown for ${esc(grownFor(c.world))}` : `Specimen grown for ${esc(label(c.cls))}${c.cls.letter ? ` · ${esc(c.cls.name)}` : ''}`}</p>
    ${nameOf(c) ? `<p class="own-name">${esc(nameOf(c))}</p>` : ''}
    <h2>${esc(c.name.common)}</h2>
    <p class="latin">${esc(c.name.genus)} ${esc(c.name.species)}</p>
    <p class="odds"><b>${ODDS_HEAD[c.odds]}.</b> ${esc(oddsFor(c).replace(/^[^.]+\. /, ''))}</p>
    ${rarity ? `<p class="rarity">${esc(rarity).replace(/^(One of a kind|Uncommon|Lab record):/, '<b>$1:</b>').replace(/ (Lab record):/, ' <b>$1:</b>')}</p>` : ''}
    ${plantOnly ? '<p class="aside">Class L worlds have plant life and no animals, so the lab grew a plant.</p>' : ''}
    <ul class="notes">${c.notes.map(n => `<li><h3>${esc(n.label)}</h3><p>${esc(n.text)}</p></li>`).join('')}</ul>
    ${neighbours(c) ? `<button class="text-button kin-button" id="kin" type="button" aria-pressed="${!!c.kin}">${c.kin ? 'Hide its neighbours' : 'Grow its neighbours'}</button>` : ''}
    ${c.kin ? `<ul class="notes kin">${[['What it eats', c.kin.eats], ['What eats it', c.kin.eaten]].map(([head, n]) => `<li><h3>${head} · ${esc(n.name.common)}</h3><p>${esc(n.note)}</p></li>`).join('')}</ul>` : ''}
    ${real.length ? `<p class="for-real">Or grow one for ${c.world ? 'another' : 'a'} real planet on this file: ${real.map(w => `<a href="#world=${encodeURIComponent(w.name)}">${esc(w.name)}</a>`).join(', ')}.</p>` : ''}
    <a class="to-file" href="${BRIDGE}survey.html#${esc(c.classId)}"${AWAY}>Read the ${esc(label(c.cls))} survey file <span aria-hidden="true">→</span></a>
    ${c.world?.placed ? `<a class="to-file" href="${BRIDGE}system.html#star=${encodeURIComponent(c.world.star)}&amp;place"${AWAY}>Place another round ${esc(c.world.placed.title)} <span aria-hidden="true">→</span></a>` : ''}
    ${c.world?.star && c.world.ly > 0 ? `<a class="to-file" href="${BRIDGE}?course=${encodeURIComponent(c.world.star)}"${AWAY}>Set course for its star <span aria-hidden="true">→</span></a>` : ''}
  `;
}
// "Proxima b, 4.2 light years away"; "the Earth-sized planet you placed 1 AU from Vega, 25 light years away".
function grownFor(w) {
  const far = w.ly > 0 ? `, ${lyText(w.ly)} light years away` : w.of ? `, a moon of ${w.of}` : '';
  return w.placed ? `the ${w.placed.sized} you placed ${auText(w.placed.au)} from ${w.placed.title}${far}` : `${w.name}${far}`;
}

// ---------- The bench ----------

// The Bench tab grows the creature in the tank again under readings set on four sliders. `start` is the creature it
// began from, which Grow goes back to; `readings` are the sliders'. The parts a slider has just changed glow for a
// moment in the tank (`pulses`: part → when), and the field note for that reading is lit while it moves.
let mode = 'grow', start = null, readings = null, pulses = {}, litKind = '', litTimer = 0;
const KINDS = [['g', 'Gravity'], ['pressure', 'Air'], ['star', 'Light'], ['temp', 'Heat']];
const LIGHT = Object.fromEntries(BENCH.star.marks.map(([words, star]) => [star, words]));
function readingText(kind, v) {
  if (kind === 'g') return gText(v);
  if (kind === 'pressure') return v === 0 ? 'None' : `${v < 0.01 ? Number(v.toPrecision(2)) : v < 10 ? Number(v.toPrecision(2)) : Math.round(v).toLocaleString('en-US')} atm`;
  if (kind === 'star') return LIGHT[v];
  return tempText(v);
}

function buildSliders() {
  $('slider-list').innerHTML = KINDS.map(([kind, words]) => {
    const light = kind === 'star';
    const at = v => (light ? benchPos('star', v) / 3 : benchPos(kind, v) / STEPS);
    const marks = BENCH[kind].marks.map(([name, v], i) => {
      // The ends' words sit inside the slider; heat's three marks are close, so its words stand clear of each other:
      // freezing to the left of its mark, boiling below, and no water to the right.
      const u = at(v), place = u < 0.04 ? ' start' : u > 0.96 ? ' end' : kind === 'temp' ? [' before', ' low', ' after'][i] : '';
      return `<span class="mark${place}" style="--u:${u.toFixed(4)}">${esc(name)}</span>`;
    }).join('');
    return `<div class="slider" data-k="${kind}">
      <div class="slider-head"><label for="s-${kind}">${words}</label><output id="o-${kind}" for="s-${kind}"></output></div>
      <input type="range" id="s-${kind}" data-k="${kind}" min="0" max="${light ? 3 : STEPS}" step="1">
      <div class="marks${kind === 'temp' ? ' two' : ''}" aria-hidden="true">${marks}</div>
    </div>`;
  }).join('');
}

// The creature `from` names ({ id, seed } or { world, seed }), on the bench at `set` (its own readings by default).
function toBench(from, set) {
  start = from.world ? growFor(from.world, from.seed) : grow(from.id, from.seed);
  readings = { ...readingsOf(start), ...set };
  pulses = {}; litKind = '';
  setMode('bench');
  current = bench(from, readings);
  renderRefs(start.classId);
  born = -1e9;
  for (const [kind] of KINDS) $(`s-${kind}`).value = benchPos(kind, readings[kind]);
  renderBench();
  benchLink();
}

function benchLink() {
  const r = readings;
  try { history.replaceState(null, '', `#bench=${linkOf(start)}&g=${four(r.g)}&air=${four(r.pressure)}&light=${r.star}&heat=${four(r.temp)}`); } catch { /* fine */ }
}

// A slider has moved: grow again, and light up what changed.
function moved(kind, pos) {
  const before = current.body;
  readings = { ...readings, [kind]: benchValue(kind, pos) };
  current = bench(jarOf(start), readings);
  const now = performance.now();
  for (const part of changedParts(before, current.body)) pulses[part] = now;
  litKind = kind;
  clearTimeout(litTimer);
  litTimer = setTimeout(() => { litKind = ''; document.querySelectorAll('#specimen .notes li.lit').forEach(li => li.classList.remove('lit')); }, 1500);
  renderBench();
}

function renderBench() {
  const c = current, r = readings;
  $('tank-tag').textContent = `Bench · ${start.world ? start.world.name : label(start.cls)} · Specimen ${String(start.seed).padStart(4, '0')}`;
  for (const [kind] of KINDS) {
    const text = readingText(kind, r[kind]);
    const el = $(`s-${kind}`);
    $(`o-${kind}`).textContent = text;
    el.setAttribute('aria-valuetext', text);
    el.style.setProperty('--fill', `${(100 * el.value) / el.max}%`);
  }
  const file = fileFor(r, c.env.habitat, start.classId);
  const named = file.letter ? label(file) : file.inText;
  $('passes').innerHTML = `These readings would pass for <a href="${BRIDGE}survey.html#${esc(file.id)}"${AWAY}>${esc(named)}</a>${file.id === start.classId ? `, the file it was grown for` : ''}.`;
  $('specimen').innerHTML = benchCardHtml(c, file);
  document.title = `${c.name.common} on the bench · Xenobiology lab · Engage`;
  if (still.matches) frame(performance.now());
}

function benchCardHtml(c, file) {
  return `
    <p class="eyebrow">On the bench · from ${esc(start.world ? start.world.name : label(start.cls))}’s specimen ${String(start.seed).padStart(4, '0')}</p>
    <h2>${esc(c.name.common)}</h2>
    <p class="latin">${esc(c.name.genus)} ${esc(c.name.species)}</p>
    <ul class="notes">${c.notes.map(n => `<li data-k="${n.k}"${n.k === noteOf(litKind) ? ' class="lit"' : ''}><h3>${esc(n.label)}</h3><p>${esc(n.text)}</p></li>`).join('')}</ul>
    <a class="to-file" href="${BRIDGE}survey.html#${esc(file.id)}"${AWAY}>Read the ${esc(label(file))} survey file <span aria-hidden="true">→</span></a>
  `;
}
const noteOf = kind => ({ g: 'gravity', pressure: 'air', star: 'light', temp: 'heat' })[kind] || '';

// Grow and Bench. Leaving the bench puts back the creature it started from.
function setMode(m) {
  if (m === mode) return;
  mode = m;
  $('tab-grow').setAttribute('aria-selected', String(m === 'grow'));
  $('tab-bench').setAttribute('aria-selected', String(m === 'bench'));
  $('tab-grow').tabIndex = m === 'grow' ? 0 : -1;
  $('tab-bench').tabIndex = m === 'bench' ? 0 : -1;
  $('grow-panel').hidden = m !== 'grow';
  $('bench-panel').hidden = m !== 'bench';
  // Read out on every step of a slider, the whole card would be said again; on the bench the readings speak instead.
  $('specimen').setAttribute('aria-live', m === 'grow' ? 'polite' : 'off');
  document.body.classList.toggle('on-bench', m === 'bench');
}
function tab(m) {
  if (m === mode) return;
  if (m === 'bench') toBench(jarOf(current));
  else put(start, false);
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
  if (mode === 'bench') {
    const pulse = {};
    for (const [part, at] of Object.entries(pulses)) {
      const age = (now - at) / 900;
      if (age >= 1 || still.matches) delete pulses[part];
      else pulse[part] = Math.sin(Math.PI * age);
    }
    current.body.pulse = pulse;
  }
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
  // The tribbles' card offers one to keep, until one is kept (see Trouble in the lab, below).
  const keep = s.name === 'Tribbles' && !saved.tribble ? '<button class="text-button ref-keep" type="button" data-tribble>Keep one</button>' : '';
  return `<li><div class="ref-head"><b>${esc(s.name)}</b><span class="ref-kind ${s.kind}">${s.kind === 'trek' ? 'Star Trek' : 'Earth'}</span></div>
    <p class="ref-home">${esc(s.home)} · ${esc(label(cls))}</p><p>${esc(s.note)}</p>${keep}</li>`;
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
  else if (saved.jars.length < JAR_MAX) { saved.jars.unshift({ ...jarOf(current), at: new Date().toISOString() }); sound.clink(); } // when, for the captain's log
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
  gone = { jar: j, at, name: j.name || `the ${growJar(j).name.common}`, timer: setTimeout(() => { gone = null; renderJars(); }, 8000) };
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

// ---------- Side by side ----------

// Compare picks two jars, and the panel above the shelf shows both creatures with a row for each field note and a
// sentence from the difference that matters most. `pair` is the two ({ id, seed } or { world, seed }); its link,
// #pair=M-42&lava-world-7, opens the same two for anyone, jars or none.
let comparing = false, picked = [], pair = null;
const specLink = j => (j.world ? `world=${encodeURIComponent(j.world)}-${j.seed}` : `${encodeURIComponent(j.id)}-${j.seed}`);
const pairLink = p => `pair=${p.map(specLink).join('&')}`;
function showPair(p, scroll) {
  pair = p;
  const [a, b] = p.map(growJar);
  const { rows, sentence } = compare(a, b);
  $('pair-pics').innerHTML = [a, b].map((c, k) => `<button class="pair-pic" type="button" data-pair="${k}" aria-label="Grow the ${esc(c.name.common)} in the tank">
    <canvas width="480" height="360" aria-hidden="true"></canvas>
    ${nameOf(c) ? `<span class="jar-own">${esc(nameOf(c))}</span>` : ''}<span class="jar-name">${esc(c.name.common)}</span><span class="jar-cls">${esc(c.world ? c.world.name : label(c.cls))}</span></button>`).join('');
  $('pair-pics').querySelectorAll('canvas').forEach((cv, k) => drawScene(cv.getContext('2d'), [a, b][k], cv.width, cv.height, 0, 1));
  $('pair-table').innerHTML = `<caption class="sr">The ${esc(a.name.common)} and the ${esc(b.name.common)}, reading by reading</caption>`
    + rows.map(r => `<tr${r.alike ? ' class="alike"' : ''}><th scope="row">${r.label}${r.alike ? ' <span class="alike-tag">Alike</span>' : ''}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('');
  $('pair-why').textContent = sentence;
  $('pair').hidden = false;
  try { history.replaceState(null, '', `#${pairLink(p)}`); } catch { /* fine */ }
  if (scroll) $('pair').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
}
function closePair() {
  pair = null;
  $('pair').hidden = true;
  if (current) try { history.replaceState(null, '', mode === 'bench' ? location.hash : `#${linkOf(current)}`); } catch { /* fine */ }
}
function setComparing(on) {
  comparing = on;
  picked = [];
  renderJars();
}

function renderJars() {
  // A name still being typed is kept first (leaving its field draws the shelf again), so the Undo line running out,
  // or another tab's change, can't wipe it away: not every browser says a field has been left when it is taken away.
  const typing = $('jars').querySelector('.jar-field');
  if (typing && typing === document.activeElement) { typing.blur(); if (!typing.isConnected) return; }
  const list = saved.jars;
  $('jars-wrap').hidden = !list.length && !gone && !saved.tribble;
  if (list.length < 2 && comparing) { comparing = false; picked = []; }
  $('compare').hidden = list.length < 2;
  $('compare').textContent = comparing ? 'Done' : 'Compare two';
  $('compare').setAttribute('aria-pressed', String(comparing));
  $('compare-hint').hidden = !comparing;
  $('jars').classList.toggle('comparing', comparing);
  $('jars-n').textContent = `${list.length} of ${JAR_MAX}`;
  $('jar-undo').hidden = !gone;
  if (gone) $('jar-undo-text').textContent = `Let ${gone.name} go.`;
  $('jars').innerHTML = list.map((j, k) => {
    const c = growJar(j);
    const on = comparing && picked.some(p => sameJar(p, j));
    const called = j.name ? `${j.name}, the ${c.name.common}` : `the ${c.name.common}`;
    // The picture opens the jar (or, comparing, picks it); its name is a button of its own, to give it yours.
    return `<li class="jar${on ? ' picked' : ''}"><button class="jar-open" type="button" data-k="${k}" aria-label="${comparing ? `Pick ${esc(called)}` : `Grow ${esc(called)} in the tank`}"${comparing ? ` aria-pressed="${on}"` : ''}><canvas width="300" height="225" aria-hidden="true"></canvas></button>
      <button class="jar-title" type="button" data-name="${k}" aria-label="${j.name ? `Rename ${esc(called)}` : `Give the ${esc(c.name.common)} a name`}">${j.name ? `<span class="jar-own">${esc(j.name)}</span>` : ''}<span class="jar-name">${esc(c.name.common)}<svg class="pen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg></span></button>
      <span class="jar-cls">${esc(c.world ? c.world.name : label(c.cls))}</span>
      <button class="jar-drop" type="button" data-drop="${k}" aria-label="Let ${esc(called)} go"${comparing ? ' hidden' : ''}>
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
// The bench is the creature it started from and its readings: #bench=M-42&g=2.5&air=0.01&light=red&heat=250. A
// reading missing or out of reach is the creature's own.
function fromHash() {
  const t = hashText();
  if (/^pair=/i.test(t)) { // two creatures, each with its number
    const two = t.slice(5).split('&').map(x => (/-\d{1,4}$/.test(x) ? creatureFrom(x) : null));
    return two.length === 2 && two.every(Boolean) ? { pair: two.map(({ id, world, seed }) => (world ? { world, seed } : { id, seed })) } : null;
  }
  if (!/^bench=/i.test(t)) return creatureFrom(t);
  const [who, ...rest] = t.slice(6).split('&');
  const h = creatureFrom(who);
  if (!h) return null;
  const q = Object.fromEntries(rest.map(p => p.split('=')));
  const set = {};
  const num = (k, kind) => { const v = Number(q[k]); if (q[k] !== undefined && q[k] !== '' && Number.isFinite(v) && (kind === 'pressure' ? v === 0 || (v >= BENCH.pressure.lo && v <= BENCH.pressure.hi) : v >= BENCH[kind].lo && v <= BENCH[kind].hi)) set[kind] = v; };
  num('g', 'g'); num('air', 'pressure'); num('heat', 'temp');
  if (LIGHT[q.light]) set.star = q.light;
  return { ...h, bench: set };
}
function creatureFrom(text) {
  const m = text.match(/^(.+?)(?:-(\d{1,4}))?$/);
  if (!m) return null;
  const seed = Number(m[2]) || newSeed();
  if (/^world=/i.test(m[1])) {
    const w = worldFor(m[1].slice(6))?.world;
    return grows(w) ? { world: keyOf(w), seed } : null;
  }
  const cls = CLASSES.find(c => c.id.toLowerCase() === m[1].toLowerCase());
  return cls ? { id: cls.id, seed } : null;
}
const open = (h, animate = true) => (h.pair ? (put(growJar(h.pair[0]), animate), showPair(h.pair, true)) : h.bench ? toBench(h.world ? { world: h.world, seed: h.seed } : { id: h.id, seed: h.seed }, h.bench) : h.world ? showWorld(h.world, h.seed, animate) : show(h.id, h.seed, animate));

// ---------- Trouble in the lab ----------

// A tribble kept from its reference card lives in a jar of its own, apart from the shelf and its limit, and does what
// tribbles do: a litter of ten every twelve hours, so the count goes up while you're away, to Spock's 1,771,561
// after three days (js/species.js). Kept under the lab's save as { tribble: { at } }.
let tribbleTimer = 0;
function renderTribble() {
  clearTimeout(tribbleTimer);
  const t = saved.tribble;
  $('tribble').hidden = !t;
  if (t) {
    const now = tribbles(t.at);
    $('tribble-n').textContent = now.n.toLocaleString('en-US');
    $('tribble-line').textContent = now.line;
    $('tribble-go').textContent = now.n === 1 ? 'Give it away' : 'Give them all away';
    // The next litter arrives on screen too, if the page is still open when it's due.
    if (now.next) tribbleTimer = setTimeout(renderTribble, Math.min(now.next - Date.now() + 500, 2 ** 31 - 1));
  }
}
function keepTribble(on) {
  if (on) { saved.tribble = { at: new Date().toISOString() }; sound.clink(); } else delete saved.tribble;
  save();
  renderTribble();
  renderJars();
  $('cabinet').innerHTML = SPECIMENS.map(refHtml).join('');
  if (current) renderRefs(current.classId);
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-tribble]')) return;
  keepTribble(true);
  $('tribble').scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' });
});
$('tribble-go').addEventListener('click', () => keepTribble(false));
if (saved.tribble && !Number.isFinite(Date.parse(saved.tribble.at))) delete saved.tribble; // a damaged one is none

buildStrip();
buildSliders();
$('cabinet').innerHTML = SPECIMENS.map(refHtml).join('');
renderTribble();
renderRecords();
// A record's link grows it in the tank, which may be a long way up the page.
$('records').addEventListener('click', e => { if (e.target.closest('a')) $('tank').scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' }); });
$('again').addEventListener('click', () => (current.world ? showWorld(keyOf(current.world)) : show(current.classId)));
$('keep').addEventListener('click', toggleKeep);
// A link that grows the same creature again: its class and its number, as the address bar has them.
$('send').addEventListener('click', e => {
  const c = current;
  if (!c) return;
  share(e.currentTarget, {
    title: `${c.name.common}, from Engage’s xenobiology lab`,
    text: `Meet the ${c.name.common} (${c.name.genus} ${c.name.species}), grown for ${c.world ? (c.world.placed ? grownFor(c.world).replace(/, [^,]+ light years away$/, '') : c.world.name) : c.cls.letter ? label(c.cls) : c.cls.inText || label(c.cls)} in Engage’s xenobiology lab.`,
    url: `${LIVE}xeno.html#${linkOf(c)}`,
  });
});
$('jar-undo-go').addEventListener('click', undoLetGo);
$('picture').addEventListener('click', e => savePicture(e.currentTarget));
// Grow its neighbours: what it eats and what eats it, in the tank beside it and in two more notes.
$('specimen').addEventListener('click', e => {
  if (!e.target.closest('#kin') || !current || mode !== 'grow') return;
  current.kin = current.kin ? null : neighbours(current);
  $('specimen').innerHTML = cardHtml(current);
  $('kin').focus({ preventScroll: true });
  if (still.matches) frame(performance.now());
});
$('compare').addEventListener('click', () => setComparing(!comparing));
$('pair-close').addEventListener('click', closePair);
$('pair-pics').addEventListener('click', e => {
  const b = e.target.closest('[data-pair]');
  if (!b || !pair) return;
  const keep = pair;
  put(growJar(pair[Number(b.dataset.pair)]), true);
  try { history.replaceState(null, '', `#${pairLink(keep)}`); } catch { /* fine */ }
  $('tank').scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' });
});
$('pair-send').addEventListener('click', e => {
  if (!pair) return;
  const [a, b] = pair.map(growJar);
  share(e.currentTarget, {
    title: 'Two creatures side by side, from Engage’s xenobiology lab',
    text: `The ${a.name.common} and the ${b.name.common}, side by side in Engage’s xenobiology lab.`,
    url: `${LIVE}xeno.html#${pairLink(pair)}`,
  });
});
$('tab-grow').addEventListener('click', () => tab('grow'));
$('tab-bench').addEventListener('click', () => tab('bench'));
// The tabs take the arrow keys, as tabs do.
$('tab-grow').parentNode.addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const m = e.key === 'Home' ? 'grow' : e.key === 'End' ? 'bench' : mode === 'grow' ? 'bench' : 'grow';
  tab(m);
  $(`tab-${m}`).focus();
});
$('slider-list').addEventListener('input', e => { if (e.target.dataset.k) moved(e.target.dataset.k, Number(e.target.value)); });
$('slider-list').addEventListener('change', benchLink); // (the address waits for the slider to be let go: a browser allows only so many changes a second)
$('bench-reset').addEventListener('click', () => {
  const before = current.body;
  toBench(jarOf(start));
  for (const part of changedParts(before, current.body)) pulses[part] = performance.now();
});
$('bench-send').addEventListener('click', e => {
  const c = current;
  share(e.currentTarget, {
    title: `${c.name.common}, on the xenobiology lab’s bench`,
    text: `Meet the ${c.name.common}, grown on the bench in Engage’s xenobiology lab at ${gText(readings.g)}, ${readings.pressure ? `air at ${readingText('pressure', readings.pressure)}` : 'no air'}, ${STARS[readings.star].name} and ${tempText(readings.temp)}.`,
    url: `${LIVE}xeno.html${location.hash}`,
  });
});
// The address keeps naming the creature in the tank, so the link down to the jars scrolls without changing it.
$('kept-note').addEventListener('click', e => {
  if (!e.target.closest('a')) return;
  e.preventDefault();
  $('jars-head').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
});
// ---------- A picture to share ----------

// Save a picture draws the creature card (js/xeno-art.js) and hands it to the phone's share sheet, or, where a
// browser can't share a file, downloads it. All drawn here: nothing leaves the page but the picture.
async function savePicture(button) {
  const c = current;
  if (!c || button.disabled) return;
  button.disabled = true;
  try {
    // The canvas draws in whatever fonts are loaded by then, so wait for the page's own.
    await Promise.all(['600 64px "Chakra Petch"', 'italic 34px "IBM Plex Sans"', '28px "IBM Plex Sans"'].map(f => document.fonts.load(f))).catch(() => {});
    const cv = document.createElement('canvas');
    cv.width = CARD_W; cv.height = CARD_H;
    const far = c.world?.ly > 0 ? `, ${lyText(c.world.ly)} light years away` : c.world?.of ? `, a moon of ${c.world.of}` : '';
    const where = c.world ? `${c.world.name}${c.world.placed ? `, ${auText(c.world.placed.au)} out` : ''}${far}` : `${label(c.cls)}${c.cls.letter ? ` · ${c.cls.name}` : ''}`;
    drawCard(cv.getContext('2d'), c, { own: nameOf(c), grownFor: `${where} · Specimen ${String(c.seed).padStart(4, '0')}` });
    const blob = await new Promise(done => cv.toBlob(done, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `${(nameOf(c) || c.name.common).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creature'}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${c.name.common}, from Engage’s xenobiology lab`, text: `${LIVE}xeno.html#${linkOf(c)}` });
        return;
      } catch (err) { if (err?.name === 'AbortError') return; } // closed the sheet; otherwise download it instead
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } finally { button.disabled = false; }
}

// ---------- Names on the jars ----------

// A jar can carry a name of yours ("Biscuit"), shown above the creature's own, on its card in the tank and on its
// picture. Tapping the name opens a field in its place: Enter or leaving it keeps what is typed (nothing takes the
// name away), Escape leaves it as it was.
const NAME_MAX = 24;
const nameOf = c => saved.jars.find(j => inJar(j, c))?.name || '';
function nameJar(k) {
  const j = saved.jars[k], title = $('jars').querySelector(`[data-name="${k}"]`);
  if (!j || !title) return;
  const c = growJar(j);
  const field = document.createElement('input');
  Object.assign(field, { type: 'text', className: 'jar-field', value: j.name || '', maxLength: NAME_MAX, placeholder: 'Give it a name', enterKeyHint: 'done', autocomplete: 'off' });
  field.setAttribute('aria-label', `A name for the ${c.name.common}`);
  title.replaceWith(field);
  field.focus();
  let done = false;
  const finish = keepIt => {
    if (done) return;
    done = true;
    const name = field.value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (keepIt && name !== (j.name || '')) {
      if (name) j.name = name; else delete j.name;
      save();
    }
    renderJars();
    if (current && inJar(j, current) && mode === 'grow') $('specimen').innerHTML = cardHtml(current);
    $('jars').querySelector(`[data-name="${saved.jars.indexOf(j)}"]`)?.focus({ preventScroll: true });
  };
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  field.addEventListener('blur', () => finish(true));
}

$('jars').addEventListener('click', e => {
  const drop = e.target.closest('[data-drop]');
  const list = saved.jars;
  const naming = e.target.closest('[data-name]');
  if (naming) { nameJar(Number(naming.dataset.name)); return; }
  if (drop) { letGo(list[Number(drop.dataset.drop)]); return; }
  const tile = e.target.closest('[data-k]');
  if (tile && comparing) { // pick it, or put it back; the second pick puts the two side by side
    const j = list[Number(tile.dataset.k)];
    picked = picked.some(p => sameJar(p, j)) ? picked.filter(p => !sameJar(p, j)) : [...picked, j];
    if (picked.length === 2) {
      const p = picked.map(({ id, world, seed }) => (world ? { world, seed } : { id, seed }));
      comparing = false; picked = [];
      renderJars();
      showPair(p, true);
    } else renderJars();
    return;
  }
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
  const fresh = load();
  saved.jars = fresh.jars.filter(j => !(gone && sameJar(j, gone.jar)));
  // The tribbles' jar too: kept or given away in another tab (or come back with the ship's records), it is so here,
  // and this tab's next save keeps it that way rather than putting back what it last saw.
  const tribble = fresh.tribble && Number.isFinite(Date.parse(fresh.tribble.at)) ? fresh.tribble : null;
  if ((tribble?.at ?? null) !== (saved.tribble?.at ?? null)) {
    if (tribble) saved.tribble = tribble; else delete saved.tribble;
    renderTribble();
    $('cabinet').innerHTML = SPECIMENS.map(refHtml).join('');
    if (current) renderRefs(current.classId);
  }
  renderJars();
  renderKeep();
});
window.addEventListener('hashchange', () => {
  const h = fromHash();
  if (!h && location.hash.length > 1) $('link-note').hidden = false; // a link that names nothing the lab knows: say so, and leave the tank as it is
  if (h?.bench || h?.pair) open(h);
  else if (h && (mode === 'bench' || !current || h.seed !== current.seed || (h.world ? h.world !== (current.world && keyOf(current.world)) : !!current.world || h.id !== current.classId))) open(h);
});
window.addEventListener('resize', () => { if (still.matches) frame(performance.now()); });
still.addEventListener?.('change', () => frame(performance.now()));

window.xeno = { show, showWorld, tab, get mode() { return mode; }, get readings() { return readings; }, get pair() { return pair; }, get current() { return current; }, get jars() { return saved.jars; }, get draws() { return draws; } };

// A link that names nothing the lab knows (a class it hasn't got, a planet it has no readings for, a link cut off on
// its way) still opens the lab, on a new creature, with a line to say that is what happened.
const asked = location.hash.length > 1, linked = fromHash();
open(linked || { id: 'M', seed: newSeed() });
$('link-note').hidden = !asked || !!linked;
renderJars();
requestAnimationFrame(loop);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
