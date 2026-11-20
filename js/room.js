// What every room shares, whatever else it does: the speaker in its header, which turns Engage's sound on and off
// everywhere at once; vibration, on the phones that can; and the text size chosen in Bridge settings. The settings
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
  applyText(p.text);
  for (const fn of followers) fn(p);
}

// The text size goes on the page as soon as it is known (each page's head sets it before anything is drawn, from
// the same key, so nothing jumps): Standard leaves the stylesheets as they are.
export function applyText(text = current().text) {
  const root = document.documentElement;
  if (text === 'standard') delete root.dataset.text;
  else root.dataset.text = text;
}

// How much bigger to draw words into a picture than its standard size (see js/prefs.js).
export function textScale() {
  return scaleFor(current().text, parseFloat(getComputedStyle(document.documentElement).fontSize));
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

// Every room calls this once: the text size, the speaker, and the settings followed when another tab changes them.
let set = false;
export function setUpRoom({ sound = null } = {}) {
  applyText();
  speaker(sound);
  if (set) return;
  set = true;
  watch(PREFS, () => { held = null; applyPrefs(); });
}
