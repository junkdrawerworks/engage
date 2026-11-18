// First contact: the page. The rules and the language are in contact-sim.js and the viewscreen in contact-art.js;
// this plays each exchange out, keeps the notebook and the reply, and writes the debrief and the record.
import { newGame, act, debrief, fluencyOf, hint, phrase, replay, standing, DANGERS, MEANINGS, MEANING, MAX_REPLY, PATIENCE } from './contact-sim.js';
import { species, drawScreen } from './contact-art.js';
import { sound } from './audio.js';
import { keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';

const KEY = 'engage.contact.v1';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* start a new record */ }
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  const runs = Array.isArray(s.runs) ? s.runs.filter(r => r && typeof r === 'object' && typeof r.title === 'string') : [];
  // The species met, contacts made and best notebook outlive the 30 encounters listed; an older save's are filled in from its runs.
  return { ...s, runs, ...standing({ ...s, runs }) };
}
// Keeps the record. When the browser won't take it, the debrief and the briefing say so: an encounter that is on
// the record now and gone on the next visit is worse than being told. Returns whether it worked.
let unsaved = '';
function save() {
  unsaved = keep(KEY, saved);
  $('eval-unsaved').hidden = $('record-unsaved').hidden = !unsaved;
  $('eval-unsaved').textContent = unkept(unsaved, 'first contact', 'this encounter');
  $('record-unsaved').textContent = unkept(unsaved, 'first contact', 'your latest encounter');
  return !unsaved;
}
try { sound.on = JSON.parse(localStorage.getItem('engage.v1') || '{}')?.opts?.sound !== false; } catch { /* keep it on */ }

let g = null; // the encounter
let look = null; // how this species looks
let reply = []; // phrase ids in the reply being put together
let acts = []; // everything done in this encounter so far, in order, as act() takes it
let gameId = ''; // its own name, so that however it is picked up and finished it goes on the record once
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// An encounter under way is kept after everything you do: its seed, what you did, your notebook's guesses and the
// reply being put together. A reload, or a phone putting the tab away while you went to think, used to end it, with
// the notebook gone. The briefing offers to resume it (see contact-sim.js's replay(): doing the same things again
// gives the same conversation, so nothing can be taken back). Answering a new hail, or reaching the debrief, lets
// it go.
// (The last thing you do is kept too, though it ends the encounter: a reload while their answer plays out then finds
// it finished, and can't be used to take the last move back.)
function keepGame() {
  if (!g || lastEval) return; // nothing under way, or it is on the record already
  saved.game = { id: gameId, seed: g.seed, acts: acts.slice(), tags: { ...g.tags }, reply: reply.slice() };
  save();
}
// The one kept, if it can be picked up: { game, reply }.
function keptGame() {
  const back = replay(saved.game);
  return back && !back.game.over ? back : null;
}
let shown = 0; // log lines on screen so far
let busy = false;
let speakingUntil = 0;
let lastEval = null;

// ---------- Screens ----------

function showScreen(name) {
  for (const s of ['brief', 'sim', 'eval']) $(s).hidden = s !== name;
  scrollTo(0, 0);
  if (name === 'sim') { sizeScreen(); loop(); }
}

function showBrief() {
  if (unsaved) save(); // try again: room may have been made since
  renderRecord();
  showScreen('brief');
}

function renderRecord() {
  const left = keptGame()?.game;
  $('resume').hidden = $('resume-note').hidden = !left;
  if (left) {
    const heard = left.heard.filter(id => id !== 'story').length;
    $('resume-note').textContent = `You left an encounter with the channel open: ${heard} ${heard === 1 ? 'phrase' : 'phrases'} heard, their patience at ${left.patience} of ${PATIENCE}. Answering the hail meets a new ship.`;
  }
  // With one to resume, that is the main thing to do, and Answer the hail stands back.
  $('start').className = left ? 'secondary' : 'primary';
  const runs = saved.runs.slice(-8).reverse();
  $('record').hidden = !runs.length;
  // The standing record, then each encounter with how its notebook did, so a contact made with nothing decoded
  // doesn't read as a full success.
  const b = saved.best;
  $('tally').innerHTML = [
    [saved.met, 'Species met'],
    [saved.contacts, saved.contacts === 1 ? 'Contact made' : 'Contacts made'],
    [b ? `${b.decoded}/${b.of}` : '–', 'Best notebook', b ? fluencyOf(b.decoded, b.of) : ''],
  ].map(([n, label, word]) => `<span><b>${n}</b>${esc(label)}${word ? `<i>${esc(word)}</i>` : ''}</span>`).join('');
  $('runs').innerHTML = runs.map(r => {
    const decoded = Number(r.decoded) || 0, of = Number(r.of) || 0;
    return `<li><b>${esc(r.title)}</b><span class="when">${esc(new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</span>
    <span class="what">The ${esc(r.people || 'unknown ship')} · ${decoded} of ${of} phrases decoded${of ? ` · ${fluencyOf(decoded, of)}` : ''}</span></li>`;
  }).join('');
}

function start(seed = Date.now()) {
  g = newGame({ seed });
  reply = [];
  acts = [];
  gameId = newId();
  if (saved.game) { delete saved.game; save(); } // a new ship: the encounter that was left is let go
  open();
  play(g.log.slice());
}

// Picks up the encounter that was left: the same captain, everything said so far on the channel, the notebook with
// its guesses, and the reply as far as it had got.
function resume() {
  const back = keptGame();
  if (!back) { renderRecord(); return; }
  g = back.game;
  reply = back.reply;
  acts = saved.game.acts.slice();
  gameId = typeof saved.game.id === 'string' ? saved.game.id : newId();
  open();
  shown = g.log.length;
  renderLog();
  update();
  const last = g.log.filter(l => l.who === 'them').pop();
  if (last) $('subtitle').innerHTML = `${last.ids.length ? `<p class="said">${last.ids.map(id => `“${esc(phrase(g, id))}”`).join(' ')}</p>` : ''}<p class="act">${esc(last.act)}</p>`;
}

// The encounter's screen, cleared for a game just begun or one picked up.
function open() {
  look = species(g.lang.look);
  shown = 0;
  logged = 0;
  busy = false;
  lastEval = null;
  patienceSaid = g.patience;
  $('comms').innerHTML = '';
  $('book').innerHTML = '';
  $('subtitle').innerHTML = '';
  showScreen('sim');
  // With a keyboard, the encounter starts where the first thing to do is: listening again.
  $('listen').focus({ preventScroll: true });
}

// ---------- Each exchange ----------

function play(lines) {
  busy = true;
  update();
  const fast = still.matches;
  let t = 0;
  for (const l of lines) {
    setTimeout(() => {
      shown = Math.min(g.log.length, g.log.indexOf(l) + 1);
      renderLog();
      if (l.who === 'them') speak(l);
      if (l.tone === 'bad') sound.blip(330);
    }, t);
    if (!fast) t += l.who === 'them' ? 300 + 450 * l.ids.length : 650;
  }
  setTimeout(() => {
    shown = g.log.length;
    busy = false;
    renderLog();
    update();
    sayPatience();
    if (g.over) record();
    // The buttons a finished encounter switches off can't hold the keyboard's place: Read the debrief takes it.
    if (g.over && lostFocus()) $('send').focus({ preventScroll: true });
  }, fast ? 0 : t + 200);
}

// Whether the keyboard's place has gone with a control that was switched off or taken away.
const lostFocus = () => !document.activeElement || document.activeElement === document.body || document.activeElement.disabled || !document.activeElement.getClientRects().length;

// The dots over the viewscreen are a picture. When one goes out, the channel says so in words, for a screen reader:
// their patience is the one thing that can end the encounter, and it used to go unread.
let patienceSaid = PATIENCE;
function sayPatience() {
  if (g.patience >= patienceSaid) return;
  patienceSaid = g.patience;
  const p = document.createElement('p');
  p.className = 'sr';
  p.textContent = `Their patience: ${g.patience} of ${PATIENCE}.`;
  $('comms').append(p);
}

// Their captain says a line: subtitles, a moving mouth and a few tones.
function speak(l) {
  $('subtitle').innerHTML = `${l.ids.length ? `<p class="said">${l.ids.map(id => `“${esc(phrase(g, id))}”`).join(' ')}</p>` : ''}<p class="act">${esc(l.act)}</p>`;
  speakingUntil = performance.now() + (still.matches ? 0 : 500 * Math.max(1, l.ids.length));
  l.ids.forEach((id, i) => setTimeout(() => sound.blip(420 + ((id.charCodeAt(0) * 37 + id.length * 11) % 400)), i * 260));
}

function send() {
  if (busy || !g || g.over || !reply.length) return;
  const said = reply;
  reply = [];
  bringIntoView(document.querySelector('.screen-wrap'));
  // Send switches itself off until there is a reply again, so the keyboard's place moves on to Listen again.
  if (document.activeElement === $('send')) $('listen').focus({ preventScroll: true });
  acts.push({ say: said });
  play(act(g, { say: said }));
  keepGame();
}

function doAct(what) {
  if (busy || !g || g.over) return;
  bringIntoView(document.querySelector('.screen-wrap'));
  acts.push(what);
  play(act(g, what));
  keepGame();
}

// Brings the viewscreen back on screen when an answer is given from further down the page, so the turn isn't played out of sight.
function bringIntoView(el) {
  const r = el.getBoundingClientRect();
  const inView = r.top >= -4 && (r.bottom <= innerHeight + 4 || (r.height > innerHeight && r.top <= 4));
  if (!inView) el.scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
}

function update() {
  const over = !!(g && g.over);
  $('patience').innerHTML = Array.from({ length: PATIENCE }, (_, i) => `<i${i >= g.patience ? ' class="gone"' : ''}></i>`).join('');
  $('patience').setAttribute('aria-label', `Their patience: ${g.patience} of ${PATIENCE}`);
  describeScreen();
  $('who-tag').textContent = over ? (g.over === 'contact' ? `The ${g.lang.people}` : 'Channel closed') : 'Unknown vessel';
  document.querySelector('.side').classList.toggle('busy', busy);
  $('shields').textContent = g.shields ? 'Lower shields' : 'Raise shields';
  $('shields').setAttribute('aria-pressed', String(g.shields));
  for (const id of ['listen', 'standard', 'shields', 'leave']) $(id).disabled = over;
  // Once it's over there is nothing left to say or do but read the debrief: the reply and the four buttons go, as the
  // Maru's orders do, and don't stand there looking live.
  for (const el of [document.querySelector('.reply .reply-head'), $('reply'), document.querySelector('.acts')]) el.hidden = over;
  if (over) {
    $('send').disabled = busy;
    $('send').textContent = 'Read the debrief';
  } else {
    $('send').textContent = 'Send';
    $('send').disabled = busy || !reply.length;
  }
  renderReply();
  renderBook();
}

const guessOf = id => (g.tags[id] ? `${MEANING[g.tags[id]]}?` : '');

function renderReply() {
  $('reply').innerHTML = reply.map((id, i) => `<li><span class="t" data-id="${id}">“${esc(phrase(g, id))}”${g.tags[id] ? `<small>${esc(guessOf(id))}</small>` : ''}</span>
    <button type="button" data-i="${i}" aria-label="Take “${esc(phrase(g, id))}” out">${X}</button></li>`).join('');
  $('reply-empty').hidden = reply.length > 0 || g.over;
  $('clear').hidden = reply.length < 2;
}

// The notebook, brought up to date in place: a row is made once, when its phrase is first heard, and after that only
// what has changed in it is touched. It used to be built again from nothing at every turn and every guess, which
// threw away whichever menu or button had the keyboard's place (one press of the down arrow on a menu, and the next
// press went to the page), and left a screen reader at the top of the page.
const OPTIONS = `<option value="">Meaning?</option>${MEANINGS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}`;
function renderBook() {
  // Only what's been heard on screen so far, so new phrases turn up as they're said.
  const said = new Set(g.log.slice(0, shown).flatMap(l => (l.who === 'them' ? l.ids : [])));
  const heard = g.heard.filter(id => id !== 'story' && said.has(id));
  const count = id => g.log.slice(0, shown).reduce((n, l) => n + (l.who === 'them' ? l.ids.filter(x => x === id).length : 0), 0);
  const full = reply.length >= MAX_REPLY || !!g.over || busy;
  const book = $('book');
  const rows = new Map([...book.children].map(li => [li.dataset.id, li]));
  const some = rows.size > 0;
  for (const id of heard) {
    let li = rows.get(id);
    if (li) li.classList.remove('new');
    else {
      li = document.createElement('li');
      li.dataset.id = id;
      if (some) li.className = 'new';
      li.innerHTML = `<button class="ph-add" type="button"><span class="t">“${esc(phrase(g, id))}”</span><span class="plus"></span></button>
        <select aria-label="What “${esc(phrase(g, id))}” means">${OPTIONS}</select><span class="ph-n"></span>`;
      book.append(li);
    }
    // A phrase that can't be said just now is marked so and stays where the keyboard can rest on it: a button
    // switched off outright drops the keyboard's place, and Say it would have done that to itself.
    const off = full || reply.includes(id);
    const add = li.querySelector('.ph-add'), plus = li.querySelector('.plus'), menu = li.querySelector('select'), n = li.querySelector('.ph-n');
    if (off) add.setAttribute('aria-disabled', 'true'); else add.removeAttribute('aria-disabled');
    setText(plus, g.over ? '' : reply.includes(id) ? 'In reply' : 'Say it'); // nothing more can be said once it's over
    setText(n, `heard ${count(id)}×`);
    if (menu.value !== (g.tags[id] || '')) menu.value = g.tags[id] || '';
    menu.classList.toggle('tagged', !!g.tags[id]);
  }
  const tagged = heard.filter(id => g.tags[id]).length;
  setText($('book-n'), heard.length ? `${tagged} of ${heard.length} guessed` : '');
}
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// The channel, added to and never rewritten: a screen reader reads a new line once, and not the whole conversation
// from the top each time something is said or guessed.
let logged = 0;
function renderLog() {
  const box = $('comms');
  for (const l of g.log.slice(logged, shown)) {
    const p = document.createElement('p');
    if (l.ids) {
      const words = l.ids.map(id => `<span class="ph"${id === 'story' ? '' : ` data-id="${id}"`}>“${esc(phrase(g, id))}”</span>`).join(' ');
      p.className = `line ${l.who} fresh`;
      p.innerHTML = `<span class="who">${l.who === 'them' ? 'Their captain' : 'You'}</span>${words}${l.act ? `<span class="act">${esc(l.act)}</span>` : ''}`;
    } else {
      p.className = `line${l.tone ? ` ${l.tone}` : ''} fresh`;
      p.innerHTML = `<span class="who">${esc(l.who)}</span>${esc(l.text)}`;
    }
    box.append(p);
  }
  logged = Math.max(logged, shown);
  showGuesses();
  box.scrollTop = box.scrollHeight;
  renderBook();
  describeScreen();
}

// Your guess at a phrase, in small letters after it wherever it is on screen: in the channel and in your reply. Only
// the guess that changed is touched.
function showGuesses() {
  for (const el of document.querySelectorAll('#comms .ph[data-id], #reply .t[data-id]')) {
    const text = guessOf(el.dataset.id);
    let small = el.querySelector('small');
    if (!text) { small?.remove(); continue; }
    if (!small) { small = document.createElement('small'); el.append(small); }
    setText(small, text);
  }
}

// A guess written in the notebook (or rubbed out).
function guess(id, meaning) {
  if (meaning) g.tags[id] = meaning; else delete g.tags[id];
  showGuesses();
  renderBook();
  keepGame();
}

// ---------- Debrief and the record ----------

function record() {
  lastEval = debrief(g);
  delete saved.game; // finished: there is nothing left to resume
  // One encounter is one line on the record: picked up in two tabs and finished in both, it is still one.
  if (!saved.runs.some(r => r.id === gameId)) {
    saved.runs.push({ title: lastEval.title, outcome: lastEval.outcome, people: lastEval.people, decoded: lastEval.decoded, of: lastEval.of, at: new Date().toISOString(), id: gameId });
    Object.assign(saved, standing({ ...saved, met: saved.met + 1, contacts: saved.contacts + (lastEval.outcome === 'contact' ? 1 : 0) })); // before the list is cut to its last 30
    saved.runs = saved.runs.slice(-30);
  }
  save();
}

function showEval() {
  const e = lastEval || debrief(g);
  $('eval-title').textContent = e.title;
  $('eval-summary').textContent = e.summary;
  $('eval-story').hidden = !e.story;
  $('eval-story').innerHTML = e.story ? `“${esc(e.story)}”<small>Their new phrase for the day you met.</small>` : '';
  const note = e.decoded === e.of && e.of ? 'Every phrase right. Hoshi Sato would be proud.'
    : e.decoded ? 'From your notebook, against what they really meant.' : 'You didn’t write any right guesses in the notebook. Here’s what they were saying.';
  $('eval-score').innerHTML = `<span class="n">${e.decoded}/${e.of}</span><b>${esc(e.fluency)}</b><span>${esc(note)}</span>`;
  $('dict').innerHTML = e.rows.map(r => `<li class="${r.right ? 'right' : r.guess ? 'wrong' : 'blank'}"><span class="mark" aria-hidden="true">${r.right ? '✓' : r.guess ? '✗' : '–'}</span>
    <span class="t">“${esc(r.text)}”</span>
    <span class="m">meant <b>${esc(r.meaning)}</b>${r.guess && !r.right ? `, you guessed ${esc(MEANING[r.guess])}` : ''}${!r.guess ? ', no guess' : ''}</span></li>`).join('');
  $('transcript').innerHTML = e.transcript.map(t => `<li class="${t.who}"><span class="who">${t.who === 'them' ? 'Their captain' : 'You'}</span>
    <span class="meant">${esc(t.meant.join('. '))}.</span><br><span class="said">${t.said.map(s => `“${esc(s)}”`).join(' ')}</span></li>`).join('');
  showScreen('eval');
  $('eval-title').focus({ preventScroll: true }); // read from the verdict down
}

// ---------- The viewscreen ----------

const canvas = $('screen');
const cx = canvas.getContext('2d');
const screenSeen = onScreen(canvas); // the viewscreen isn't drawn while it is scrolled out of sight
let draws = 0;                       // how many times it has been drawn, for tests
let W = 0, H = 0;
function sizeScreen() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  W = r.width; H = r.height;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', () => { if (!$('sim').hidden) sizeScreen(); });

// The viewscreen is a picture, so it says what it shows: their captain's mood, and the picture they send.
const MOODS = { calm: 'calm', wary: 'wary, drawn back', glad: 'glad' };
function describeScreen() {
  const s = screenState(0);
  const text = s.closed ? 'Viewscreen: the channel is closed. Stars.'
    : `Viewscreen: their captain, ${MOODS[s.mood]}${s.pic ? `. Beside ${g.lang.him}, a picture they are sending: ${DANGERS[s.pic].pic}` : ''}.`;
  if (canvas.getAttribute('aria-label') !== text) canvas.setAttribute('aria-label', text);
}

function screenState(now) {
  const said = g.log.slice(0, shown).filter(l => l.who === 'them');
  const last = said[said.length - 1];
  const ids = last ? last.ids : [];
  const mood = ids.includes('fight') ? 'wary' : (ids.includes('yes') || ids.includes('story')) ? 'glad' : 'calm';
  const closed = !!g.over && g.over !== 'contact' && shown >= g.log.length;
  const pic = !g.over && g.beat >= 1 && g.beat <= 4 && said.some(l => l.ids.includes('danger')) ? g.lang.danger : null;
  return { speaking: Math.max(0, Math.min(1, (speakingUntil - now) / 300)), mood, pic, closed };
}

let looping = false;
function loop() {
  if (looping) return;
  looping = true;
  const frame = now => {
    if ($('sim').hidden || document.hidden || !g) { looping = false; return; }
    if (W && screenSeen.on) { drawScreen(cx, W, H, look, screenState(now), still.matches ? 0 : now); draws++; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('sim').hidden) loop(); });

// ---------- Wiring ----------

$('start').addEventListener('click', () => start());
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => { showBrief(); $('start').focus({ preventScroll: true }); });
$('send').addEventListener('click', () => (g && g.over ? showEval() : send()));
// Clear goes away with the reply it cleared, and a phrase taken out takes its button with it: the keyboard's place
// goes to what is left of the reply, or back to the notebook.
const firstPhrase = () => $('book').querySelector('.ph-add');
$('clear').addEventListener('click', () => { reply = []; update(); keepGame(); firstPhrase()?.focus({ preventScroll: true }); });
$('listen').addEventListener('click', () => doAct('listen'));
$('standard').addEventListener('click', () => doAct('standard'));
$('shields').addEventListener('click', () => doAct('shields'));
$('leave').addEventListener('click', () => doAct('leave'));
$('reply').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b || busy) return;
  const [id] = reply.splice(+b.dataset.i, 1);
  update();
  keepGame();
  ($('reply').querySelector(`button[data-i="${Math.min(+b.dataset.i, reply.length - 1)}"]`) || $('book').querySelector(`li[data-id="${id}"] .ph-add`))?.focus({ preventScroll: true });
});
$('book').addEventListener('click', e => {
  const b = e.target.closest('.ph-add');
  if (!b || b.getAttribute('aria-disabled') === 'true' || busy) return;
  const id = b.closest('li').dataset.id;
  if (id && !reply.includes(id) && reply.length < MAX_REPLY) reply.push(id);
  update();
  keepGame();
});
$('book').addEventListener('change', e => {
  const s = e.target.closest('select');
  if (s) guess(s.closest('li').dataset.id, s.value);
});

// Another tab has finished an encounter: the record here is what that tab saved, so an encounter finished here is
// added to its list and not written over it. An encounter under way in this tab carries on untouched.
watch(KEY, () => {
  const mine = g && !g.over ? saved.game : null;
  delete saved.game;
  Object.assign(saved, load());
  if (mine) saved.game = mine;
  renderRecord();
});

// An encounter that ended just as the page was closed (the last thing you did kept, the debrief never reached) goes
// on the record now, as it would have.
{
  const back = replay(saved.game);
  if (back?.game.over) { g = back.game; gameId = typeof saved.game.id === 'string' ? saved.game.id : newId(); record(); g = null; lastEval = null; }
  else if (!back && saved.game) delete saved.game;
}
showBrief();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.contact = {
  get game() { return g; }, get busy() { return busy; }, get draws() { return draws; },
  start, resume, send, act: doAct, showEval,
  // Puts phrases in the reply by meaning, as if tapped in the notebook.
  pick(...ids) { for (const id of ids) if (g.heard.includes(id) && !reply.includes(id) && reply.length < MAX_REPLY) reply.push(id); update(); keepGame(); },
  hint: () => hint(g),
  tag: guess,
  debrief: () => debrief(g),
};
