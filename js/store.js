// What every room does with the browser's storage besides reading it: write, saying whether that worked, and notice
// when another tab has written. The same save can be open twice: the installed app beside a browser tab, or a
// Set course link opened in a new tab while the bridge is up in another.

// Keeps `value` under `key`. Returns '' when it worked, or else why it didn't: 'full' when the browser's storage has
// no room (junkdrawer.works's other tools share it), or 'blocked' when the browser won't store anything at all.
export function keep(key, value) {
  try {
    const text = JSON.stringify(value);
    localStorage.setItem(key, text);
    seen.set(key, text);
    return '';
  } catch (e) {
    // Firefox has its own name and number for a full store.
    return ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(e?.name) || e?.code === 22 || e?.code === 1014 ? 'full' : 'blocked';
  }
}

// The line a room shows where its record is listed when the last save didn't work, in the bridge's words:
// "This browser's storage is full: this run won't be kept."
export function unkept(why, room, thing) {
  if (why === 'full') return `This browser’s storage is full: ${thing} won’t be kept.`;
  return why ? `This browser isn’t letting ${room} save: ${thing} won’t be kept.` : '';
}

// Calls changed() when something else has saved under `key`: another tab or window (the browser never tells the tab
// that did the writing). A phone puts tabs to sleep and doesn't always say afterwards what was saved meanwhile, so
// the tab also looks for itself whenever it comes back into view, or is brought back whole with Back. A key that
// has been taken away is not a save: what this tab holds is then the only copy, and it keeps it.
// changed() must read and redraw only. If it saved, two tabs would answer each other for ever.
export function watch(key, changed) {
  seen.set(key, held(key));
  const look = () => {
    const now = held(key);
    if (now === null || now === seen.get(key)) return;
    seen.set(key, now);
    changed();
  };
  addEventListener('storage', e => { if (e.key === key) look(); });
  addEventListener('pageshow', e => { if (e.persisted) look(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
}

// Whether what the browser holds under `key` is still what this tab last read or wrote there. A tab that was put
// to sleep can be closed without ever hearing that another tab saved: before it writes on its way out, it asks.
export const current = key => held(key) === seen.get(key);

// What the browser holds under each key, as this tab last read or wrote it.
const seen = new Map();
function held(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
