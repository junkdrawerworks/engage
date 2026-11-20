// What every room shares, whatever else it does: the speaker in its header, which turns Engage's sound on and off
// everywhere at once; vibration, on the phones that can; and the text size and contrast chosen in Bridge settings. The settings
// themselves are js/prefs.js's.
import { PREFS, readPrefs, textScale as scaleFor, withPref } from './prefs.js';
import { keep, watch } from './store.js';

const get = key => { try { return localStorage.getItem(key); } catch { return null; } };

// The settings as the browser keeps them now.
export const prefs = () => readPrefs(get);

// Keeps one setting changed, and puts it into effect on this page. Returns whether the browser kept it: when it
// won't, the change holds for this visit all the same.
let held = null; // what this visit uses when the browser won't keep a change
export function setPref(key, value) {
  const next = withPref(current(), key, value);
  const kept = !keep(PREFS, next);
  held = kept ? null : next;
  applyPrefs();
  return kept;
}
const current = () => held ?? prefs();

// Every part of the page that follows the settings: each is called with them whenever they change, here or in
// another tab.
const followers = new Set();
export function follow(fn) { followers.add(fn); fn(current()); }
function applyPrefs() {
  const p = current();
  scale = null;
  applyText(p.text);
  applyContrast(p.contrast);
  for (const fn of followers) fn(p);
}

// The text size goes on the page as soon as it is known (each page's head sets it before anything is drawn, from
// the same key, so nothing jumps): Standard leaves the stylesheets as they are.
export function applyText(text = current().text) {
  const root = document.documentElement;
  if (text === 'standard') delete root.dataset.text;
  else root.dataset.text = text;
}

// High contrast goes on the page the same way: solid panels, brighter secondary text, thicker outlines (css/app.css).
export function applyContrast(on = current().contrast) {
  const root = document.documentElement;
  if (on) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
}

// How much bigger to draw words into a picture than its standard size (see js/prefs.js). Worked out once for each
// change of the setting, so a picture drawn every frame can ask every frame.
let scale = null;
export function textScale() {
  if (scale === null) scale = scaleFor(current().text, parseFloat(getComputedStyle(document.documentElement).fontSize));
  return scale;
}

// A short vibration, where the phone has one and it is wanted: engaging, dropping out of warp, a hit on the hull.
// Android's browsers vibrate; iPhones, and computers, don't, and nothing happens there.
export const canBuzz = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export function buzz(pattern) {
  if (!canBuzz() || !current().buzz) return;
  try { navigator.vibrate(pattern); } catch { /* not allowed just now */ }
}

// The speaker in the room's header (the button with the id `speaker`), and the sound module's switch, follow the
// setting. Turning it off silences what is playing at once.
export function speaker(sound) {
  const b = document.getElementById('speaker');
  follow(p => {
    if (sound) {
      sound.on = p.sound;
      if (!p.sound) sound.stop?.();
    }
    if (!b) return;
    b.setAttribute('aria-pressed', String(p.sound));
    b.title = p.sound ? 'Sound on' : 'Sound off';
  });
  b?.addEventListener('click', () => {
    const on = !current().sound;
    setPref('sound', on);
    if (on) sound?.blip?.(880); // turning it on says so
  });
}

// ---------- The Keys card ----------

// Press ? in any room for a small card of its keys. It opens only from a key press, so a phone never sees it. Each
// room gives its own rows ([keys, what they do]); every card ends with the ones every room has. M turns the sound on
// and off anywhere.
const EVERY = [['M', 'Sound on or off'], ['Tab', 'Move between controls'], ['Esc', 'Close a card or sheet'], ['?', 'This card']];

// Whether a key press is meant as typing (in a field) or with a modifier held: the rooms' own keys leave those alone.
export const typing = e => e.ctrlKey || e.metaKey || e.altKey || !!e.target?.closest?.('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea, [contenteditable=""], [contenteditable="true"]');

let card = null, cardFrom = null;
function openCard(rows) {
  if (!card) {
    card = document.createElement('div');
    card.className = 'keys-card';
    card.id = 'keys-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'keys-title');
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const row = ([k, what]) => `<dt>${k.split(' ').map(x => (/^(or|to|and)$/.test(x) ? ` ${x} ` : `<kbd>${esc(x)}</kbd>`)).join('')}</dt><dd>${esc(what)}</dd>`;
    card.innerHTML = `<div class="keys-box"><div class="keys-head"><h2 id="keys-title">Keys</h2><button class="close" type="button" aria-label="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <dl>${[...rows, ...EVERY].map(row).join('')}</dl></div>`;
    card.addEventListener('click', e => { if (e.target === card || e.target.closest('.close')) closeCard(); });
    document.body.append(card);
  }
  cardFrom = document.activeElement;
  card.hidden = false;
  card.querySelector('.close').focus({ preventScroll: true });
}
function closeCard() {
  if (!card || card.hidden) return;
  card.hidden = true;
  if (cardFrom?.isConnected) cardFrom.focus({ preventScroll: true });
  cardFrom = null;
}
export const cardOpen = () => !!card && !card.hidden;

// The card's own keys come first, before the room's: while it is up it keeps the keyboard (Tab stays on its close
// button, Escape and ? put it away), and nothing behind it moves.
export function keysCard(rows, sound) {
  addEventListener('keydown', e => {
    if (cardOpen()) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopImmediatePropagation(); closeCard(); return; }
      if (e.key === 'Tab') { e.preventDefault(); card.querySelector('.close').focus(); }
      if (e.key !== 'Enter' && e.key !== ' ') { e.stopImmediatePropagation(); if (e.key !== 'Tab') e.preventDefault(); }
      return;
    }
    // One-switch play has every key for its own (see js/switch.js).
    if (typing(e) || e.repeat || document.documentElement.classList.contains('one-switch')) return;
    if (e.key === '?') { e.preventDefault(); e.stopImmediatePropagation(); openCard(rows); }
    else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      const on = !current().sound;
      setPref('sound', on);
      if (on) sound?.blip?.(880);
    }
  }, true);
}

// Every room calls this once: the text size and contrast, the speaker, its Keys card, and the settings followed when another tab
// changes them.
export function setUpRoom({ sound = null, keys = [] } = {}) {
  applyText();
  applyContrast();
  speaker(sound);
  keysCard(keys, sound);
  watch(PREFS, () => { held = null; applyPrefs(); });
}
