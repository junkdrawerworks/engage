// Keeps the screen from dimming and locking while the person has asked for something they watch without touching
// the phone: pointing it at the sky, or a race on the warp scale. Browsers without a screen wake lock just carry on.

let wanted = false; // between hold() and release()
let lock = null;    // the browser's lock, while it holds
let asking = false;

export function hold() {
  wanted = true;
  acquire();
}

export function release() {
  wanted = false;
  drop();
}

async function acquire() {
  if (!wanted || lock || asking || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  asking = true;
  let got = null;
  try { got = await navigator.wakeLock.request('screen'); } catch { /* refused: a low battery, or a setting */ }
  asking = false;
  if (!got) return;
  if (!wanted) { got.release().catch(() => {}); return; } // released while the browser was answering
  lock = got;
  // The browser lets go of the lock itself when the page is hidden.
  got.addEventListener('release', () => { if (lock === got) lock = null; });
}

function drop() {
  const held = lock;
  lock = null;
  if (held) held.release().catch(() => {});
}

// Back on screen, the lock is asked for again if it is still wanted; leaving the page gives it up.
document.addEventListener('visibilitychange', acquire);
addEventListener('pagehide', drop);
