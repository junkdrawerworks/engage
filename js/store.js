// What every room does with the browser's storage besides reading it: write, saying whether that worked, and notice
// when another tab has written. The same save can be open twice: the installed app beside a browser tab, or a
// Set course link opened in a new tab while the bridge is up in another.

// Keeps `value` under `key`. Returns '' when it worked, or else why it didn't: 'full' when the browser's storage has
// no room (junkdrawer.works's other tools share it), or 'blocked' when the browser won't store anything at all.
export function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
// that did the writing), or anything at all while this page was put aside whole and has now been brought back with
// Back. A key that has been taken away is not a save: what this tab holds is then the only copy, and it keeps it.
// changed() must read and redraw only. If it saved, two tabs would answer each other for ever.
export function watch(key, changed) {
  addEventListener('storage', e => { if (e.key === key && e.newValue !== null) changed(); });
  addEventListener('pageshow', e => { if (e.persisted) changed(); });
}
