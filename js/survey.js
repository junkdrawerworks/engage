// The planetary survey: flip through the planet classes, or match an unlogged world to the file it would pass for.
import { CLASSES, byId, label, quizReadings, grows, streakRecord } from './classes.js';
import { MOONS } from './moons.js';
import { openHunt, huntLink, hunt, huntTest } from './hunt-view.js';
import { Globe, paint, paintSoon } from './planet-art.js';
import { keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';
import { Pace } from './pace.js';
import { tallies, isFile, isSlip, record as onRecord, filesUsed, caughtOutLine, question, exam, EXAM, today, examLine, examSaved, ROUNDS } from './quiz.js';
import { LIVE, share } from './share.js';
import { planetByName, standable, systemFor } from './worlds.js';
import { sound } from './audio.js';
import { setUpRoom } from './room.js';

// The speaker in the header, and the text size from Bridge settings.
setUpRoom({ sound });

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
// when the best was made (a moment in milliseconds, or nought), for the line the captain's log gives it. `filed` and
// `mixed` are the files used and the slips made (js/quiz.js), `round` the round last played and `exam` today's exam
// so far ({ day, marks }), none of which an older save has.
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* start again */ }
  if (!s || typeof s !== 'object') s = {};
  const count = x => (Number.isInteger(x) && x >= 0 ? x : 0);
  const streak = count(s.streak);
  return { best: Math.max(count(s.best), streak), streak, seen: count(s.seen), bestAt: count(s.bestAt), filed: tallies(s.filed, isFile), mixed: tallies(s.mixed, isSlip),
    round: ROUNDS.includes(s.round) || s.round === 'exam' ? s.round : 'files', exam: examSaved(s.exam) };
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

// The planet classes, then the moons and dwarf planets (js/moons.js), which Cover your tracks leaves out.
const order = [...CLASSES, ...MOONS];
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

const SEEDS = { earth: 3, forest: 2, mars: 1, desert: 1, venus: 1, ocean: 2, ice: 1, rock: 2, demon: 1, jovian: 1, ultra: 1, rogue: 1, superearth: 1, subneptune: 1, lava: 1, hotjupiter: 1, icegiant: 4, moon: 2, io: 3, europa: 2, ganymede: 1, titan: 1, enceladus: 1, triton: 2, ceres: 1, pluto: 1 };

function openFile(i, push = true) {
  at = (i + order.length) % order.length;
  const c = order[at];
  show(globe, c.art, SEEDS[c.art] || 1);
  $('badge').innerHTML = c.of !== undefined
    ? `<span class="badge-k">Filed as</span><span class="badge-l">${esc(byId.get(c.cls).letter)}</span>`
    : c.letter
      ? `<span class="badge-k">Class</span><span class="badge-l">${esc(c.letter)}</span>`
      : '<span class="badge-k">No Starfleet</span><span class="badge-k">letter</span>';
  $('counter').textContent = `File ${at + 1} of ${order.length}`;
  $('file').innerHTML = c.of !== undefined ? moonHtml(c) : fileHtml(c);
  document.querySelectorAll('#strip .chip').forEach((b, k) => {
    b.setAttribute('aria-current', k === at ? 'true' : 'false');
    // The strip scrolls sideways to it on a phone; the page itself stays where it is (a moon's thumbnail, at the foot
    // of the strip on a wide screen, scrolled the globe off the top).
    if (k === at) {
      const strip = $('strip'), box = b.getBoundingClientRect(), frame = strip.getBoundingClientRect();
      strip.scrollTo({ left: strip.scrollLeft + box.left - frame.left - strip.clientWidth / 2 + box.width / 2, behavior: still.matches ? 'auto' : 'smooth' });
    }
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
    // A planet the system view has can be flown in to, and one with ground, stood on.
    const place = planetByName(w.name);
    const there = place ? `<a class="fly" href="${BRIDGE}system.html#star=${encodeURIComponent(place.system.star)}&amp;planet=${encodeURIComponent(w.name)}"${AWAY}>System view <span aria-hidden="true">→</span></a>`
      + (standable(place.planet) ? `<a class="fly" href="${BRIDGE}away.html#world=${encodeURIComponent(w.name)}"${AWAY}>Beam down <span aria-hidden="true">→</span></a>` : '') : '';
    const tag = w.misfit ? '<span class="misfit">Doesn’t fit the readings above</span>' : '';
    return `<li><div class="w-head"><b>${esc(w.name)}</b><span class="ly">${esc(lyText(w.ly))} ly</span></div>${tag}<p>${esc(w.note)}</p>${fly || life || there ? `<div class="w-links">${fly}${there}${life}</div>` : ''}</li>`;
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

// A moon's or dwarf planet's file: its own readings, the class it would be filed under and why, and the lab.
const moonWidth = m => `${m.km.toLocaleString('en-US')} km across (${num(m.width)} × Earth)`;
const moonMass = m => `${Number(m.mass.toPrecision(2))} × Earth`;
const signed = x => `${x < 0 ? '−' : ''}${Math.abs(x)}`;
const moonTemp = ([a, b]) => (a === b ? tempText(a) : `${a}–${b} K (${signed(celsius(a))} to ${signed(celsius(b))} °C)`);
function moonHtml(m) {
  const cls = byId.get(m.cls);
  const rows = [
    ['Width', moonWidth(m)],
    ['Mass', moonMass(m)],
    ['Gravity', `${num(m.mass / m.width ** 2)} × Earth’s`],
    ['Surface', moonTemp(m.temp)],
    m.of ? ['Orbit', `Round ${m.of} every ${m.orbit < 10 ? `${m.orbit.toFixed(1)} days` : days(m.orbit)}`] : ['Year', days(m.year)],
    ['Air', m.air],
    ['Water', m.water],
    ['Life', m.life],
  ];
  const life = grows(m)
    ? `<a class="fly" href="${XENO}#world=${encodeURIComponent(m.name)}"${AWAY}>Grow a creature for ${esc(m.name)} <span aria-hidden="true">→</span></a>`
    : m.id === 'titan'
      ? '<p class="none">Life in Titan’s seas would be made of methane, not water, and the lab has no rules for that yet.</p>'
      : `<a class="fly" href="${XENO}#${esc(cls.id)}"${AWAY}>Grow a creature for ${esc(label(cls))} <span aria-hidden="true">→</span></a>`;
  return `
    <p class="eyebrow">${m.of ? `A moon of ${esc(m.of)}` : 'A dwarf planet'}</p>
    <h2>${esc(m.name)}</h2>
    <p class="real">${esc(m.short)}</p>
    <p class="about">${esc(m.about)}</p>
    <dl class="readings">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <h3>Starfleet would file it as</h3>
    <p>${esc(m.fits)}</p>
    <a class="fly" href="#${esc(cls.id)}">Read the ${esc(label(cls))} file <span aria-hidden="true">→</span></a>
    <h3>Life</h3>
    ${life}
    <p class="share-row"><button class="text-button" type="button" data-share>Share this file</button></p>
  `;
}

function buildStrip() {
  const strip = $('strip');
  let html = '';
  order.forEach((c, k) => {
    if (k === 0) html += '<p class="strip-group">Starfleet</p>';
    if (!c.letter && order[k - 1]?.letter) html += '<p class="strip-group">Real, unnamed</p>';
    if (c.of !== undefined && order[k - 1]?.of === undefined) html += '<p class="strip-group">Moons and dwarf planets</p>';
    html += `<button class="chip" type="button" data-i="${k}" aria-label="${esc(label(c))}: ${esc(c.short)}">
      <canvas width="96" height="96" aria-hidden="true"></canvas><span>${esc(c.letter || c.name.replace(/^The /, ''))}</span></button>`;
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

// The round being played: one of ROUNDS (js/quiz.js), or 'exam', today's five worlds. `drill` is the question on
// screen; in the exam, `examAt` is which of the five it is.
let examAt = 0;
const isExam = () => saved.round === 'exam';

function newWorld() {
  if (isExam()) {
    const day = today();
    if (saved.exam?.day !== day) { saved.exam = { day, marks: [] }; save(); }
    examAt = saved.exam.marks.length;
    if (examAt >= EXAM) return null;
    // `exam` says which day's exam it is and which of its five, so an answer goes on that exam only, in its own place.
    return { ...exam(day)[examAt], maps: {}, exam: { day, at: examAt } };
  }
  return { ...question(saved.round, Math.random, drill ? [drill.cls.id] : []), maps: {} };
}

const numbers = w => [
  ['Width', widthText(w.width)],
  ['Mass', massText(w.mass)],
  [GAS.has(w.cls.art) && w.cls.art !== 'venus' ? 'Temperature' : 'Surface', tempText(w.temp, GAS.has(w.cls.art) && w.cls.art !== 'venus')],
  ['Year', yearText(w.year)],
];
const PROMPTS = {
  files: 'Which file would it pass for?',
  sensors: 'Sensors only, no picture. Which file would it pass for?',
};

function renderDrill() {
  document.querySelectorAll('[data-round]').forEach(b => b.setAttribute('aria-pressed', b.dataset.round === saved.round ? 'true' : 'false'));
  $('exam-head').hidden = !isExam();
  $('exam-result').hidden = true;
  if (!drill) return renderExamResult();
  $('drill-play').hidden = false;
  const w = drill;
  const c = w.cls, t = c.typical;
  if (isExam()) $('exam-head').textContent = `Today’s exam · World ${examAt + 1} of ${EXAM}`;
  const reverse = w.kind === 'reverse', blind = w.kind === 'sensors';
  // No picture with sensors only, nor the other way round, where the file's painting would match its world's.
  $('drill-view').hidden = blind || reverse;
  $('drill-blind').hidden = !(blind || reverse);
  $('blind-head').textContent = reverse ? label(c) : 'No picture';
  $('blind-text').textContent = reverse ? `${c.short}. Which world would pass for it? Go by the numbers.` : 'The cameras are down. Go by the numbers.';
  if (reverse) {
    // The file asked about, and the readings it allows.
    $('sensor-head').textContent = `The ${label(c)} file`;
    $('readings').innerHTML = [
      ['Width', `${range(t.width, num)} × Earth`],
      ['Mass', `${range(t.mass, num)} × Earth`],
      [GAS.has(c.art) && c.art !== 'venus' ? 'Temperature' : 'Surface', tempText(t.temp, GAS.has(c.art) && c.art !== 'venus')],
      ['Year', yearText(t.year)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('prompt').textContent = `Which of these worlds would pass for the ${label(c)} file?`;
    $('choices').className = 'choices worlds-pick';
    // Four worlds by their numbers alone: width, mass, temperature and year.
    const short = x => [['Width', `${num(x.width)} × Earth`], ['Mass', `${num(x.mass)} × Earth`], ['Temp', `${Math.round(x.temp).toLocaleString('en-US')} K`], ['Year', x.year ? days(x.year) : 'none']];
    $('choices').innerHTML = w.worlds.map((x, k) => `
      <button class="choice" type="button" data-id="${esc(x.cls.id)}" aria-label="World ${k + 1}: ${esc(numbers(x).map(([a, b]) => `${a} ${b}`).join(', '))}">
        <span class="c-name">World ${k + 1}</span>
        <span class="c-sub">${short(x).map(([a, v]) => `<span class="c-k">${a}</span> ${esc(v)}`).join('<br>')}</span>
      </button>`).join('');
  } else {
    if (!blind) show(drillGlobe, c.art, w.seed, w.maps);
    $('drill-tag').textContent = w.survey;
    $('sensor-head').textContent = 'Sensor log';
    // With sensors only there is no word on the air, water or life: the files' own words, they'd give it away.
    const rows = blind ? numbers(w) : [...numbers(w), ['Air', t.air], ['Water', t.water], ['Life', t.life]];
    $('readings').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('prompt').textContent = PROMPTS[w.kind];
    $('choices').className = 'choices';
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
  }
  $('verdict').hidden = true;
  $('prompt').hidden = false;
  $('drill-intro').hidden = saved.seen > 0;
  renderScore();
}

// Today's exam, once its five worlds are filed: the score, a mark for each, and the line to send.
function renderExamResult() {
  $('drill-play').hidden = true;
  $('exam-head').hidden = true;
  const { day, marks } = saved.exam;
  $('exam-result').hidden = false;
  $('exam-score').textContent = `${marks.filter(Boolean).length} of ${EXAM} filed`;
  $('exam-marks').innerHTML = marks.map((m, k) => `<li class="${m ? 'ok' : 'bad'}"><span aria-hidden="true">${m ? '✓' : '✗'}</span><span class="vh">World ${k + 1}: ${m ? 'filed' : 'caught'}</span></li>`).join('');
  $('exam-line').textContent = examLine(day, marks);
  renderScore();
}

function answer(id) {
  if (!drill || drill.answered) return;
  drill.answered = true;
  const c = drill.cls;
  const right = id === c.id;
  const reverse = drill.kind === 'reverse';
  saved.seen++;
  // Today's exam is its own score: it leaves the streak alone. Whether this is the exam goes by the world on screen,
  // not the round, which another tab can change under it; and an exam world another tab has answered meanwhile
  // isn't marked twice.
  const bestBefore = saved.best;
  const inExam = !!drill.exam;
  if (inExam) { if (saved.exam?.day === drill.exam.day && saved.exam.marks.length === drill.exam.at) saved.exam.marks.push(right); }
  else {
    saved.streak = right ? saved.streak + 1 : 0;
    saved.best = Math.max(saved.best, saved.streak);
    if (saved.best > bestBefore) saved.bestAt = Date.now();
  }
  // The other way round, a slip is the world picked filed under the file asked about.
  if (reverse) onRecord(saved, id, c.id); else onRecord(saved, c.id, id);
  save();
  // A new best streak is said in the verdict, not left to the small score line under it.
  const record = right && !inExam && streakRecord(bestBefore, saved.streak);
  $('verdict-record').hidden = !record;
  $('verdict-record').textContent = record ? `Best streak yet: ${saved.streak}` : '';
  $('choices').querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.dataset.id === c.id) b.classList.add('right');
    else if (b.dataset.id === id) b.classList.add('wrong');
  });
  const picked = byId.get(id);
  $('verdict-head').textContent = right ? 'Record filed. Nobody will look twice.'
    : reverse ? `That world wouldn’t pass for ${c.inText || label(c)}. It’s ${picked.inText || label(picked)}.`
      : `That file wouldn’t fool anyone. It’s ${c.inText || label(c)}.`;
  $('verdict-head').className = `verdict-head ${right ? 'ok' : 'bad'}`;
  $('verdict-text').textContent = right ? c.tell : reverse ? `${picked.tell} ${hint(c)}.` : `${c.tell} ${hint(picked)}.`;
  $('verdict-file').href = `#${c.id}`;
  $('drill-next').textContent = inExam && saved.exam.marks.length >= EXAM ? 'See how you did' : 'Next world';
  $('verdict').hidden = false;
  $('prompt').hidden = true;
  renderScore();
  $('drill-next').focus({ preventScroll: true });
  $('verdict').scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
}

function setRound(r) {
  if (r === saved.round && drill && !drill.answered) return;
  saved.round = r;
  save();
  drill = newWorld();
  renderDrill();
  try { history.replaceState(null, '', r === 'exam' ? '#exam' : '#drill'); } catch { /* fine */ }
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
// The round stays this tab's own.
watch(KEY, () => { const { round } = saved; Object.assign(saved, load(), { round }); renderScore(); });

// Under the score, a badge for each of the 17 files, lit once a world has been rightly filed under it, and the slip
// made most often.
const SHORT = { 'super-earth': 'SE', 'sub-neptune': 'SN', 'lava-world': 'LW', 'hot-jupiter': 'HJ', 'ice-giant': 'IG' };
function renderScore() {
  $('score').textContent = saved.seen
    ? `Streak ${saved.streak} · Best ${saved.best}`
    : '';
  const used = new Set(filesUsed(saved.filed));
  $('files-used').hidden = !saved.seen;
  $('used-badges').innerHTML = CLASSES.map(c => `<li class="${used.has(c.id) ? 'on' : ''}" title="${esc(label(c))}"><span aria-hidden="true">${esc(c.letter || SHORT[c.id])}</span><span class="vh">${esc(label(c))}${used.has(c.id) ? ', used' : ''}</span></li>`).join('');
  $('used-count').textContent = `${used.size} of ${CLASSES.length} files used`;
  const caught = caughtOutLine(saved.mixed);
  $('caught').hidden = !caught;
  $('caught').textContent = caught;
}

// ---------- Your stars ----------

// The stars in the captain's log, newest first, with home always at the top: each opens the system view, where a
// planet can be placed round it. The bridge's save is only read here.
function loggedStars() {
  let log = [];
  try { log = JSON.parse(localStorage.getItem('engage.v1') || 'null')?.log || []; } catch { /* nothing kept */ }
  const seen = new Set([0]), out = [{ star: 0, title: 'Sol' }];
  for (const e of Array.isArray(log) ? log : []) {
    if (!e || !Number.isInteger(e.star) || seen.has(e.star) || typeof e.title !== 'string' || !/^[^<>]{1,60}$/.test(e.title)) continue;
    seen.add(e.star);
    out.push({ star: e.star, title: e.title });
  }
  return out;
}
function renderYours() {
  const stars = loggedStars();
  $('yours-list').innerHTML = stars.map(s => {
    const known = systemFor(s.title);
    return `<li><a href="${BRIDGE}system.html#star=${encodeURIComponent(s.title)}&amp;place"${AWAY}><b>${esc(s.star === 0 ? 'Sol, home' : s.title)}</b>`
      + `<span>${known ? `${known.planets.length} known planets, and room for yours` : 'Place a planet round it'}</span></a></li>`;
  }).join('');
  $('yours-none').hidden = stars.length > 1;
}

// ---------- Modes and input ----------

function setMode(m, push = true) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'));
  $('files').hidden = m !== 'files';
  $('drill').hidden = m !== 'drill';
  $('yours').hidden = m !== 'yours';
  $('hunt').hidden = m !== 'hunt';
  if (m === 'hunt') {
    const link = huntLink(hashText());
    if (link) openHunt(link.level, link.seed);
    else if (!hunt().curve) openHunt(1);
    else if (push) try { history.replaceState(null, '', `#hunt=${hunt().curve.level.id}.${hunt().curve.seed}`); } catch { /* fine */ }
    document.title = 'Long-range sensors · Planetary survey · Engage';
  } else if (m === 'yours') {
    renderYours();
    if (push) try { history.replaceState(null, '', '#yours'); } catch { /* fine */ }
    document.title = 'Your stars · Planetary survey · Engage';
  } else if (m === 'drill') {
    if (!drill || drill.answered) drill = newWorld();
    renderDrill();
    if (push) try { history.replaceState(null, '', isExam() ? '#exam' : '#drill'); } catch { /* fine */ }
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
  if (h === 'exam') { if (saved.round !== 'exam') { saved.round = 'exam'; drill = null; } return setMode('drill', false); }
  if (h === 'yours') return setMode('yours', false);
  if (h === 'hunt' || huntLink(h)) return setMode('hunt', false);
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
  document.querySelectorAll('[data-round]').forEach(b => b.addEventListener('click', () => setRound(b.dataset.round)));
  $('exam-share').addEventListener('click', e => share(e.currentTarget, { title: 'Cover your tracks, from Engage’s planetary survey', text: `${examLine(saved.exam.day, saved.exam.marks)}. Today’s five worlds in Engage’s planetary survey.`, url: `${LIVE}survey.html#exam` }));
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
// that is a pixel or two between pictures. Another world, or another size, is drawn at once. On a phone too slow to
// draw it in 10 ms, it is drawn at three-quarters of the size and then three-fifths, and the page stretches it back
// up (js/pace.js): a little softer, and a tap no longer waits behind it.
let drew = 0;
const pace = new Pace();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    turn += dt * (still.matches ? 0 : 0.12);
    const g = mode === 'files' ? globe : drillGlobe;
    if (inView.get(g).on) {
      const size = Math.round(sizeFor(g.canvas) * pace.scale);
      const fresh = g.stale(size);
      if (now - drew >= 30 || fresh) {
        const t0 = performance.now();
        g.draw(turn, size);
        if (!fresh) pace.took(performance.now() - t0);
        drew = now;
      }
    }
  }
  requestAnimationFrame(frame);
}

buildStrip();
bind();
fromHash();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.survey = { open: id => openFile(order.findIndex(c => c.id === id)), mode: setMode, round: setRound, get hunt() { return hunt(); }, huntTest, get world() { return drill; }, answer, get cached() { return maps.size; }, get draws() { return (globe.draws || 0) + (drillGlobe.draws || 0); }, get globeScale() { return pace.scale; } };
