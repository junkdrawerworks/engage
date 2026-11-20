// First contact: the page. The rules and the language are in contact-sim.js and the viewscreen in contact-art.js;
// this plays each exchange out, keeps the notebook and the reply, and writes the debrief and the record.
import { LIVE, share } from './share.js';
import { oneSwitch } from './switch.js';
import { newGame, act, debrief, fluencyOf, hint, answer, phrase, replay, standing, encounterFirsts, firstsLine, briefingLine, archiveLine, encodeRun, decodeRun, dailySeed, today, shareLine, makeLanguage, CHALLENGES, DANGERS, MEANINGS, MEANING, MAX_REPLY, PATIENCE } from './contact-sim.js';
import { species, drawScreen } from './contact-art.js';
import { sound } from './audio.js';
import { keep, unkept, watch } from './store.js';
import { onScreen } from './onscreen.js';
import { readShipPlace, whereWords } from './contacts.js';
import { readShip, shortName } from './myship.js';
import { stardate } from './physics.js';
import { setUpRoom, typing } from './room.js';

// The speaker in the header, the text size from Bridge settings, and the Keys card (press ?).
setUpRoom({ sound, keys: [['1 to 9', 'Add the phrase with that number in your notebook to your reply'], ['Enter', 'Send your reply'], ['L', 'Listen again']] });

const KEY = 'engage.contact.v1';
const LAB = 'xeno.html'; // the xenobiology lab, for what might live on their world
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

let g = null; // the encounter
let look = null; // how this species looks
let reply = []; // phrase ids in the reply being put together
let acts = []; // everything done in this encounter so far, in order, as act() takes it
let gameId = ''; // its own name, so that however it is picked up and finished it goes on the record once
let watching = null; // an encounter someone shared, being played back: { seed, acts, tags }
// Where the ship was when the hail came in, from the bridge's save (see contacts.js): { star, place, visit }. It is
// read when the encounter starts and kept with it, so the record says where it happened even if the ship has moved on.
let here = null;
// A second contact: what was carried in from the first meeting ({ heard }), or null for a first.
let again = null;
let daily = ''; // the day, YYYY-MM-DD, when this is today's hail
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// An encounter under way is kept after everything you do: its seed, what you did, your notebook's guesses and the
// reply being put together. A reload, or a phone putting the tab away while you went to think, used to end it, with
// the notebook gone. The briefing offers to resume it (see contact-sim.js's replay(): doing the same things again
// gives the same conversation, so nothing can be taken back). Answering a new hail, or reaching the debrief, lets
// it go.
// (The last thing you do is kept too, though it ends the encounter: a reload while their answer plays out then finds
// it finished, and can't be used to take the last move back.)
function keepGame() {
  if (!g || lastEval || watching) return; // nothing under way, on the record already, or someone else's
  saved.game = { id: gameId, seed: g.seed, acts: acts.slice(), tags: { ...g.tags }, reply: reply.slice(), ...(here ? { here } : {}), ...(again ? { again } : {}), ...(daily ? { daily } : {}) };
  save();
}
// The one kept, if it can be picked up: { game, reply }.
function keptGame() {
  const back = replay(saved.game);
  return back && !back.game.over ? back : null;
}
let shown = 0; // log lines on screen so far
const ended = new WeakSet(); // the encounters whose end has been heard
let busy = false;
let speakingUntil = 0;
let lastEval = null;

// ---------- Screens ----------

function showScreen(name) {
  for (const s of ['brief', 'sim', 'eval']) $(s).hidden = s !== name;
  if (name !== 'sim') document.body.classList.remove('talking');
  scrollTo(0, 0);
  if (name === 'sim') { sizeScreen(); loop(); }
}

function showBrief() {
  if (unsaved) save(); // try again: room may have been made since
  renderRecord();
  showScreen('brief');
}

// A place kept with an encounter, if it is one: anything else is no place.
const placeOf = p => (p && Number.isInteger(p.star) && p.star >= 0 && typeof p.place === 'string' ? { star: p.star, place: p.place.slice(0, 60), visit: Number.isFinite(p.visit) ? p.visit : null } : null);

// The people you have made contact with (kept for good, with where and the notebook of the day), and the one who
// hails again next: the latest who hasn't yet. Each comes back once.
const friendsOf = s => (Array.isArray(s.friends) ? s.friends.filter(f => f && typeof f === 'object' && Number.isFinite(f.seed) && typeof f.people === 'string') : []);
const nextFriend = () => friendsOf(saved).filter(f => !f.again).pop() || null;
// What a friend carries into second contact: the phrases heard the first time, and the guesses written then.
const carried = f => ({ heard: Array.isArray(f.heard) ? f.heard.filter(id => typeof id === 'string') : [], tags: f.tags && typeof f.tags === 'object' ? f.tags : {} });

function renderFriend() {
  const f = nextFriend();
  const left = keptGame();
  $('friend').hidden = !f || !!left?.game.second;
  if (!f) return;
  const where = typeof f.place === 'string' && f.place ? ` at ${f.place}` : f.star === 0 ? ' in Earth orbit' : '';
  const when = typeof f.sd === 'string' ? `, stardate ${f.sd}` : '';
  setText($('friend-title'), `The ${f.people} are hailing again`);
  setText($('friend-text'), `You made first contact with them${where}${when}, and your notebook from that day is open. This time something is wrong with their ship.`);
  setText($('friend-start'), `Answer the ${f.people}`);
  const more = friendsOf(saved).filter(x => !x.again).length - 1;
  $('friend-more').hidden = more < 1;
  setText($('friend-more'), `${more} more ${more === 1 ? 'ship' : 'ships'} you’ve made contact with will call after them.`);
}

// The linguist's challenges: each with its people, how it has gone (contact made, with the best notebook; tried; or
// not yet), a button to answer it and one to send it.
const challengeOf = seed => (saved.challenges && typeof saved.challenges === 'object' ? saved.challenges[seed] : null);
function renderChallenges() {
  $('challenges').innerHTML = CHALLENGES.map(seed => {
    const people = makeLanguage(seed).people, c = challengeOf(seed);
    const ok = c && Number.isInteger(c.decoded) && Number.isInteger(c.of) && c.of > 0;
    const state = ok && c.contact ? `Contact made · best notebook ${c.decoded}/${c.of}, ${fluencyOf(c.decoded, c.of)}` : ok ? `Tried · best notebook ${c.decoded}/${c.of}` : 'Not answered yet';
    return `<li${ok && c.contact ? ' class="done"' : ''}><b>The ${esc(people)}</b><span class="state">${esc(state)}</span>
      <button class="secondary" type="button" data-challenge="${seed}" aria-label="Answer the ${esc(people)}">Answer</button>
      <button class="text-button" type="button" data-send="${seed}" aria-label="Send the ${esc(people)}’s hail">Send</button></li>`;
  }).join('');
}

// A hail sent by link (contact.html#hail=<seed in base 36>): a challenge, today's hail or any one. The briefing says
// so, and Answer the hail answers that one.
let sent = null; // the seed of the hail a link sent, until it is answered
function sentHail() {
  const m = /^#hail=([0-9a-z]{1,7})$/.exec(location.hash);
  const seed = m ? parseInt(m[1], 36) : NaN;
  return Number.isFinite(seed) && seed <= 0xffffffff ? seed : null;
}
function renderSent() {
  $('hail-note').hidden = sent === null;
  if (sent === null) { setText($('start'), 'Answer the hail'); return; }
  const people = makeLanguage(sent).people;
  setText($('hail-note'), CHALLENGES.includes(sent) ? `A linguist’s challenge, sent to you: the ${people}, one of the five hardest languages on file.`
    : sent === dailySeed(today()) ? `Today’s hail, sent to you: the ${people}.` : `A hail sent to you: the ${people}.`);
  setText($('start'), `Answer the ${people}`);
}

function renderRecord() {
  renderFriend();
  renderChallenges();
  renderSent();
  // The ship has dropped out of warp where the bridge left yours: "off your bow, here at Vega", or off the Calypso's
  // once Bridge settings has named her.
  const w = whereWords(readShipPlace()), ship = readShip();
  setText($('brief-where'), `A ship of no known design has dropped out of warp off ${ship ? `the ${shortName(ship)}’s` : 'your'} bow${w ? `, ${w},` : ''} and she’s hailing you.`);
  // An officer who has answered a hail before is told which ship this is, above the briefing they know.
  const again = briefingLine(saved);
  $('brief-line').hidden = !again;
  $('brief-line').textContent = again;
  const left = keptGame()?.game;
  $('resume').hidden = $('resume-note').hidden = !left;
  if (left) {
    const heard = left.heard.filter(id => id !== 'story').length;
    $('resume-note').textContent = `You left an encounter with the channel open: ${heard} ${heard === 1 ? 'phrase' : 'phrases'} heard, their patience at ${left.patience} of ${PATIENCE}. Answering the hail meets a new ship.`;
  }
  // With one to resume, that is the main thing to do, and Answer the hail stands back.
  $('start').className = left ? 'secondary' : 'primary';
  // Today's hail, once a day; afterwards, how it went and the line to send.
  const day = today(), done = saved.daily?.date === day && typeof saved.daily.line === 'string' ? saved.daily : null;
  const leftDaily = !!left && saved.game.daily === day;
  $('daily-start').hidden = !!done || leftDaily;
  $('daily-share').hidden = !done;
  $('daily-note').innerHTML = done ? `<b>Today’s hail</b>${esc(done.line.replace(/^First contact, [^:]+: the /, 'The '))}`
    : leftDaily ? 'Today’s hail is the one left to resume.' : 'The same ship and the same language for every officer today.';
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
    <span class="what">The ${esc(r.people || 'unknown ship')}${r.place && typeof r.place === 'string' ? ` · at ${esc(r.place)}` : ''} · ${decoded} of ${of} phrases decoded${of ? ` · ${fluencyOf(decoded, of)}` : ''}</span></li>`;
  }).join('');
}

function start(seed = Date.now(), carry = null, day = '') {
  again = carry ? { heard: carry.heard } : null;
  daily = day;
  g = newGame({ seed, again: carry });
  reply = [];
  acts = [];
  gameId = newId();
  watching = null;
  here = readShipPlace();
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
  watching = null;
  gameId = typeof saved.game.id === 'string' ? saved.game.id : newId();
  here = placeOf(saved.game.here);
  again = g.second ? { heard: g.carried.slice() } : null;
  daily = typeof saved.game.daily === 'string' ? saved.game.daily : '';
  open();
  shown = g.log.length;
  renderLog();
  update();
  const last = g.log.filter(l => l.who === 'them').pop();
  if (last) subtitle(last);
}

// Their words under the viewscreen, and in one line over the reply where a phone keeps it at the foot of the screen.
function subtitle(l) {
  const words = l.ids.map(id => `“${phrase(g, id)}”`).join(' ');
  $('subtitle').innerHTML = `${l.ids.length ? `<p class="said">${esc(words)}</p>` : ''}<p class="act">${esc(l.act)}</p>`;
  setText($('dock-said'), words);
}

// A phone keeps the reply at the foot of the screen while an encounter is on; the page's own foot is kept clear of
// it by its height.
const dockSize = new ResizeObserver(() => document.body.style.setProperty('--dock-h', `${$('dock').offsetHeight}px`));
dockSize.observe($('dock'));

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
  $('dock-said').textContent = '';
  $('watching').hidden = !watching;
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
    // The end of an encounter: a rising figure for contact made, a falling one for the channel closing.
    if (g.over && !ended.has(g)) { ended.add(g); if (g.over === 'contact' || g.over === 'friends') sound.contactMade(); else sound.channelClosed(); }
    if (g.over && !watching) record();
    if (watching) { if (g.over) $('watching').hidden = true; else setTimeout(nextWatched, watching.skip ? 0 : still.matches ? 300 : 900); }
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
  subtitle(l);
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
  $('who-tag').textContent = over ? (g.over === 'contact' || g.over === 'friends' ? `The ${g.lang.people}` : 'Channel closed') : g.second ? `The ${g.lang.people}` : 'Unknown vessel';
  document.body.classList.toggle('talking', !over && !$('sim').hidden && !watching);
  document.body.classList.toggle('replaying', !over && !!watching);
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
  // (A second contact's notebook comes in with the phrases from the first time.)
  const said = new Set([...(g.carried || []), ...g.log.slice(0, shown).flatMap(l => (l.who === 'them' ? l.ids : []))]);
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
        <select aria-label="What “${esc(phrase(g, id))}” means" data-stay>${OPTIONS}</select><span class="ph-n"></span>`;
      book.append(li);
    }
    // A phrase that can't be said just now is marked so and stays where the keyboard can rest on it: a button
    // switched off outright drops the keyboard's place, and Say it would have done that to itself.
    const off = full || reply.includes(id);
    const add = li.querySelector('.ph-add'), plus = li.querySelector('.plus'), menu = li.querySelector('select'), n = li.querySelector('.ph-n');
    if (off) add.setAttribute('aria-disabled', 'true'); else add.removeAttribute('aria-disabled');
    setText(plus, g.over ? '' : reply.includes(id) ? 'In reply' : 'Say it'); // nothing more can be said once it's over
    setText(n, count(id) || !g.second ? `heard ${count(id)}×` : 'from before');
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
  if (watching) return;
  if (meaning) g.tags[id] = meaning; else delete g.tags[id];
  showGuesses();
  renderBook();
  keepGame();
}

// ---------- Debrief and the record ----------

let firsts = null; // what the encounter just finished added to the record: a best notebook, a first contact
function record() {
  lastEval = debrief(g);
  firsts = null;
  delete saved.game; // finished: there is nothing left to resume
  // Today's hail goes down once, the first time it is finished that day.
  if (daily && saved.daily?.date !== daily) saved.daily = { date: daily, line: shareLine(lastEval, daily), run: encodeRun({ seed: g.seed, acts, tags: g.tags }) };
  // One encounter is one line on the record: picked up in two tabs and finished in both, it is still one.
  if (!saved.runs.some(r => r.id === gameId) && g.second) recordSecond();
  else if (!saved.runs.some(r => r.id === gameId)) {
    firsts = encounterFirsts(saved, lastEval); // against the record as it stood
    // Where it happened goes with it: the bridge's log and tonight's sky read it back for that star.
    const where = here ? { star: here.star, place: here.place, ...(here.visit != null ? { visit: here.visit } : {}), sd: stardate() } : {};
    saved.runs.push({ title: lastEval.title, outcome: lastEval.outcome, people: lastEval.people, decoded: lastEval.decoded, of: lastEval.of, at: new Date().toISOString(), id: gameId, seed: g.seed, ...where });
    // A people you made contact with is kept for good, with where you met them, beyond the 30 encounters listed.
    // Their notebook goes with them, the phrases heard and the guesses, for when they hail again.
    // A people met before (a linguist's challenge answered again, a hail sent by link) is already a friend: first
    // contact with them was made once, and they hail again once.
    if (lastEval.outcome === 'contact' && !friendsOf(saved).some(f => f.seed === g.seed)) {
      saved.friends = [...friendsOf(saved), { seed: g.seed, people: lastEval.people, at: new Date().toISOString(), ...where, heard: g.heard.filter(id => id !== 'story'), tags: { ...g.tags } }];
    }
    // A linguist's challenge keeps its best notebook, and whether contact has been made.
    if (CHALLENGES.includes(g.seed)) {
      const was = challengeOf(g.seed), e = lastEval;
      const better = !was || !Number.isInteger(was.decoded) || !(was.of > 0) || e.decoded * was.of > was.decoded * e.of;
      saved.challenges = { ...(saved.challenges && typeof saved.challenges === 'object' ? saved.challenges : {}),
        [g.seed]: { ...(better ? { decoded: e.decoded, of: e.of } : { decoded: was.decoded, of: was.of }), contact: !!was?.contact || e.outcome === 'contact' } };
    }
    Object.assign(saved, standing({ ...saved, met: saved.met + 1, contacts: saved.contacts + (lastEval.outcome === 'contact' ? 1 : 0) })); // before the list is cut to its last 30
    saved.runs = saved.runs.slice(-30);
  }
  save();
}

// A second contact goes on the record as an encounter (not a species met: they were met before), and on the friend
// who hailed: how it went and where, so they don't hail again and the log can tell it.
function recordSecond() {
  const e = lastEval;
  const where = here ? { star: here.star, place: here.place, ...(here.visit != null ? { visit: here.visit } : {}), sd: stardate() } : {};
  saved.runs.push({ title: e.title, outcome: e.outcome, people: e.people, decoded: e.decoded, of: e.of, at: new Date().toISOString(), id: gameId, seed: g.seed, second: true, ...where });
  saved.runs = saved.runs.slice(-30);
  const f = friendsOf(saved).find(x => x.seed === g.seed && !x.again);
  if (f) f.again = { outcome: e.outcome, title: e.title, decoded: e.decoded, of: e.of, at: new Date().toISOString(), ...where };
  const made = friendsOf(saved).filter(x => x.again?.outcome === 'friends').length;
  firsts = { best: false, contacts: 0, seconds: e.outcome === 'friends' ? made : 0 };
}

function showEval() {
  const e = lastEval || debrief(g);
  // A shared encounter's debrief is theirs: nothing of it is on this officer's record, and the way on is to answer it.
  $('eval-eyebrow').textContent = watching ? 'A shared encounter · Debrief' : e.second ? 'Second contact · Debrief' : daily ? 'Today’s hail · Debrief' : 'Communications · Debrief';
  // A friend's shared second contact can't be answered as theirs: the way in is the same people's first hail.
  $('again').textContent = watching ? (e.second ? 'Answer their first hail yourself' : 'Answer this hail yourself') : 'Answer another hail';
  $('eval-title').textContent = e.title;
  $('eval-summary').textContent = e.summary;
  $('eval-story').hidden = !e.story;
  $('eval-story').innerHTML = e.story ? `“${esc(e.story)}”<small>${e.second ? 'The story of the day you met, with a new ending.' : 'Their new phrase for the day you met.'}</small>` : '';
  const note = e.decoded === e.of && e.of ? 'Every phrase right. Hoshi Sato would be proud.'
    : e.decoded ? 'From your notebook, against what they really meant.' : 'You didn’t write any right guesses in the notebook. Here’s what they were saying.';
  // Said when it is made, not left for the briefing's record card: a notebook that beat the best, a contact made.
  const made = firsts && !watching ? firstsLine(firsts) : '';
  $('eval-firsts').hidden = !made;
  $('eval-firsts').textContent = made;
  $('eval-score').innerHTML = `<span class="n">${e.decoded}/${e.of}</span><b>${esc(e.fluency)}</b><span>${esc(note)}</span>`;
  // The score arrives a moment after the verdict, as the Maru's grades do.
  $('eval-score').style.animation = still.matches ? '' : 'rise .5s .25s both';
  // How rare this ending is, from encounters answered with phrases picked at random.
  const rare = archiveLine(e);
  $('eval-archive').hidden = !rare;
  $('eval-archive').innerHTML = rare ? `<b>Examiners’ archive</b> ${esc(rare)}` : '';
  // Their world is somewhere out there: the lab grows what might live on a world like it, the same creature for the same people.
  $('to-lab').hidden = e.outcome !== 'contact' && e.outcome !== 'friends';
  $('to-lab').href = `${LAB}#M-${1 + (g.seed >>> 0) % 9999}`;
  $('dict').innerHTML = e.rows.map(r => `<li class="${r.right ? 'right' : r.guess ? 'wrong' : 'blank'}"><span class="mark" aria-hidden="true">${r.right ? '✓' : r.guess ? '✗' : '–'}</span>
    <span class="t">“${esc(r.text)}”</span>
    <span class="m">meant <b>${esc(r.meaning)}</b>${r.guess && !r.right ? `, you guessed ${esc(MEANING[r.guess])}` : ''}${!r.guess ? ', no guess' : ''}</span></li>`).join('');
  $('transcript').innerHTML = e.transcript.map(t => `<li class="${t.who}"><span class="who">${t.who === 'them' ? 'Their captain' : 'You'}</span>
    <span class="meant">${esc(t.meant.join('. '))}.</span><br><span class="said">${t.said.map(s => `“${esc(s)}”`).join(' ')}</span></li>`).join('');
  showScreen('eval');
  $('eval-title').focus({ preventScroll: true }); // read from the verdict down
}

// ---------- A shared encounter, played back ----------

// A link to an encounter (contact.html#run=…, from Share this encounter) plays it back at speaking pace, with the
// notebook's guesses as they were at the end, and what was done each turn in place of the reply. Nothing goes on
// this officer's record; the debrief offers to answer the same hail, in the same language.
const DID = { listen: 'Listened again', standard: 'Spoke Standard', shields: 'Raised or lowered shields', leave: 'Broke off' };
function watchEncounter(kept) {
  watching = { ...kept };
  g = newGame({ seed: kept.seed, again: kept.again || null });
  Object.assign(g.tags, kept.tags);
  reply = [];
  acts = [];
  gameId = '';
  here = null;
  again = null;
  daily = '';
  open();
  $('watching-text').innerHTML = '<b>A shared encounter, played back</b>Their ship is hailing.';
  play(g.log.slice());
}
function nextWatched() {
  if (!watching || !g || g.over || busy) return;
  const rest = watching.acts.slice(acts.length);
  // Skipping does the rest at once and goes straight to the debrief.
  if (watching.skip) {
    for (const a of rest) { acts.push(a); act(g, a); }
    shown = g.log.length;
    renderLog();
    update();
    showEval();
    return;
  }
  const what = rest[0];
  acts.push(what);
  $('watching-text').innerHTML = `<b>A shared encounter, played back</b>${typeof what === 'string' ? DID[what] : `They answered ${what.say.map(id => `“${esc(phrase(g, id))}”`).join(' ')}`}`;
  play(act(g, typeof what === 'string' ? what : { say: [...what.say] }));
}
function skipWatched() {
  if (!watching) return;
  watching.skip = true;
  if (!busy) nextWatched();
}
function openedRun() {
  const m = /^#run=(.+)$/.exec(location.hash);
  return m ? decodeRun(decodeURIComponent(m[1])) : null;
}
// Share this encounter: how it went in a line, and a link that plays it back for whoever opens it.
function shareRun(button) {
  const e = lastEval || debrief(g);
  const code = encodeRun({ seed: g.seed, acts, tags: g.tags, again: g.second ? { heard: g.carried } : null });
  const line = shareLine(e);
  const url = `${LIVE}contact.html#run=${code}`;
  return share(button, { title: 'First contact', text: line, url, copy: `${line}\n${url}` });
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
  const closed = !!g.over && g.over !== 'contact' && g.over !== 'friends' && shown >= g.log.length; // made friends, first or second time: they stay on screen
  const pic = !g.over && g.beat >= 1 && g.beat <= 4 && said.some(l => l.ids.includes('danger')) ? g.danger : null;
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

// ---------- One-switch play ----------

// The choices a single press can pick, screen by screen (see switch.js): Send when there is a reply, the phrases that
// can be said, the four buttons, Clear, then the notebook's meanings (each press moves one on to the next).
const visible = (...ids) => ids.map(id => $(id));
const sw = oneSwitch({
  key: 'engage.oneswitch',
  items() {
    if (!$('brief').hidden) return [...visible('resume', 'start', 'daily-start', 'daily-share', 'friend-start'), ...$('challenges').querySelectorAll('button'), $('one-switch')];
    if (!$('eval').hidden) return visible('again', 'to-bridge', 'share-run', 'to-lab');
    if (busy || !g) return [];
    if (g.over) return visible('send');
    if (watching) return visible('skip');
    return [...(reply.length ? [$('send')] : []), ...$('book').querySelectorAll('.ph-add:not([aria-disabled])'), ...visible('listen', 'standard', 'shields', 'leave', 'clear'), ...$('book').querySelectorAll('select')];
  },
});
$('one-switch').checked = sw.on;
$('one-switch').addEventListener('change', e => sw.set(e.target.checked));

// ---------- Wiring ----------

$('start').addEventListener('click', () => {
  if (sent === null) { start(); return; }
  const seed = sent;
  sent = null;
  history.replaceState(null, '', location.pathname + location.search);
  start(seed, null, seed === dailySeed(today()) ? today() : '');
});
$('challenges').addEventListener('click', e => {
  const b = e.target.closest('[data-challenge]');
  if (b) { start(Number(b.dataset.challenge)); return; }
  const send = e.target.closest('[data-send]');
  if (!send) return;
  const seed = Number(send.dataset.send), people = makeLanguage(seed).people;
  share(send, { title: 'First contact: a linguist’s challenge', text: `The ${people} speak one of the five hardest languages the translator has on file. Can you make first contact?`,
    url: `${LIVE}contact.html#hail=${seed.toString(36)}` });
});
$('daily-start').addEventListener('click', () => { const day = today(); start(dailySeed(day), null, day); });
$('daily-share').addEventListener('click', e => {
  const d = saved.daily, url = `${LIVE}contact.html#run=${d.run}`;
  share(e.currentTarget, { title: 'First contact', text: d.line, url, copy: `${d.line}\n${url}` });
});
$('friend-start').addEventListener('click', () => { const f = nextFriend(); if (f) start(f.seed, carried(f)); });
$('resume').addEventListener('click', resume);
$('again').addEventListener('click', () => {
  if (watching) {
    // The same hail, in the same language: today's, if that is what they shared.
    const { seed } = watching, day = today();
    history.replaceState(null, '', location.pathname + location.search);
    start(seed, null, seed === dailySeed(day) ? day : '');
    return;
  }
  showBrief();
  $('start').focus({ preventScroll: true });
});
$('share-run').addEventListener('click', e => shareRun(e.currentTarget));
$('skip').addEventListener('click', skipWatched);
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
// From the keyboard: 1 to 9 add the notebook's phrases, counting down it; Enter sends the reply (unless a button has
// the keyboard, which Enter presses); L listens again.
addEventListener('keydown', e => {
  if (typing(e) || e.repeat || !g || watching) return;
  if (/^[1-9]$/.test(e.key)) {
    const b = $('book').querySelectorAll('.ph-add')[Number(e.key) - 1];
    if (!b) return;
    e.preventDefault();
    b.click();
  } else if (e.key === 'Enter' && !e.target.closest?.('button, a, select, summary')) {
    if ($('send').disabled) return;
    e.preventDefault();
    $('send').click();
  } else if (e.key === 'l' || e.key === 'L') {
    if ($('listen').disabled || !$('listen').getClientRects().length) return;
    e.preventDefault();
    $('listen').click();
  }
});
$('book').addEventListener('click', e => {
  const b = e.target.closest('.ph-add');
  if (!b || b.getAttribute('aria-disabled') === 'true' || busy || watching) return;
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
  if (back?.game.over) {
    g = back.game; gameId = typeof saved.game.id === 'string' ? saved.game.id : newId(); here = placeOf(saved.game.here);
    acts = saved.game.acts.slice(); daily = typeof saved.game.daily === 'string' ? saved.game.daily : '';
    record(); g = null; lastEval = null; here = null; daily = ''; acts = [];
  }
  else if (!back && saved.game) delete saved.game;
}
sent = sentHail();
// A hail link opened on a page already open: the briefing takes it up.
addEventListener('hashchange', () => { const h = sentHail(); if (h !== null) { sent = h; if (!$('brief').hidden) renderRecord(); } });
const shared = openedRun();
if (shared) watchEncounter(shared); else showBrief();
sw.set(sw.on);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.contact = {
  get game() { return g; }, get busy() { return busy; }, get draws() { return draws; },
  start, resume, send, act: doAct, daily: () => $('daily-start').click(), showEval, oneSwitch: sw, watch: watchEncounter, skip: skipWatched, get watching() { return watching; },
  // Puts phrases in the reply by meaning, as if tapped in the notebook.
  pick(...ids) { for (const id of ids) if (g.heard.includes(id) && !reply.includes(id) && reply.length < MAX_REPLY) reply.push(id); update(); keepGame(); },
  hint: () => hint(g),
  answer: () => answer(g),
  // Puts a whole answer in the reply, as if each phrase were tapped.
  say() { this.pick(...(answer(g) || [])); },
  tag: guess,
  debrief: () => debrief(g),
};
