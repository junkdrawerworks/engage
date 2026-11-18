// Sheets that behave like a phone's own: the back gesture (or the browser's Back) closes the sheet that is up instead
// of leaving the page, and on a phone a sheet follows a finger that drags its head down, closing once it has gone far
// enough or was flicked. Used by the bridge and tonight's sky.

// How far a sheet has to be dragged down to close (CSS pixels), and how fast a shorter flick has to be (pixels per
// millisecond) to close it all the same. Pure, checked by test/bridge.test.mjs.
export const SWIPE_CLOSE = 80, FLICK = 0.5;
export function dismissed(dy, ms) {
  if (!(dy > 0)) return false;
  return dy >= SWIPE_CLOSE || (dy >= 12 && ms > 0 && dy / ms >= FLICK);
}

// Opening a sheet adds one step to the tab's history, at the same address, so going back takes that step and closes
// the sheet. A sheet closed any other way (its close button, the scrim, Escape) takes the step back itself, so the
// history and the address end up where they started. `close` puts every sheet away without asking about history;
// `isOpen` says whether one is up. Returns { opened, closed }, for the page's own openSheet and closeSheets to call.
export function backCloses({ close, isOpen, root = document }) {
  const MARK = 'engageSheet';
  const marked = () => !!(history.state && typeof history.state === 'object' && history.state[MARK]);
  const push = () => { history.pushState({ ...(history.state && typeof history.state === 'object' ? history.state : {}), [MARK]: true }, ''); };
  let pushed = false; // our step is the one the tab is on
  let backing = false; // a step back asked for, not yet taken
  let repush = false; // a sheet opened while that step back was on its way: it needs its own step once it lands
  let dead = false; // the tab is on a step of ours with no sheet up (the page was reloaded with a sheet open)

  // Opened afresh on our own step (a reload with a sheet up): that step is spent, and the next Back would seem to
  // do nothing. It is noted, and that Back goes on to where it was meant to.
  if (marked()) dead = true;

  function opened() {
    if (pushed) return;
    if (backing) { repush = true; return; }
    if (dead) { dead = false; pushed = true; return; } // the spent step serves this sheet
    push();
    pushed = true;
  }
  function closed() {
    repush = false;
    if (!pushed) return;
    pushed = false;
    backing = true;
    history.back();
  }
  addEventListener('popstate', () => {
    if (backing) {
      backing = false;
      if (repush && isOpen()) { push(); pushed = true; }
      repush = false;
      return;
    }
    if (pushed) { pushed = false; close(); return; }
    if (dead && !isOpen()) { dead = false; history.back(); }
  });
  // Brought back whole by the browser (the page kept as it was left), the sheet may still be up on a step that is not ours.
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    backing = repush = false;
    pushed = marked() && isOpen();
    dead = marked() && !isOpen();
    if (isOpen() && !pushed) { push(); pushed = true; }
  });
  // A link followed out of a sheet takes the sheet's step with it: the room replaces it, so the room's Back comes
  // straight back here and not to a step with a sheet that is no longer up. Links into a new tab are left alone.
  root.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!pushed || !a || !a.closest('.sheet') || a.target || a.hasAttribute('download') || e.defaultPrevented
      || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    pushed = false;
    location.replace(a.href);
  });
  return { opened, closed };
}

// On a phone, the sheet follows a finger dragging its head down, and closes past SWIPE_CLOSE or on a quick flick;
// otherwise it springs back. Not on a wide screen, where the sheets stand at the side and aren't bottom sheets.
export function swipeDown(sheet, close, narrow = matchMedia('(max-width: 759px)')) {
  const head = sheet.querySelector('.sheet-head');
  if (!head) return;
  let drag = null;
  head.addEventListener('pointerdown', e => {
    if (!narrow.matches || e.button || e.target.closest('button, a, input')) return;
    drag = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0, last: [e.clientY, e.timeStamp] };
    head.setPointerCapture?.(e.pointerId);
    sheet.style.transition = 'none';
  });
  head.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    // The speed at the end of the drag, over its last tenth of a second or so.
    if (e.timeStamp - drag.last[1] > 100) drag.last = [drag.prev?.[0] ?? drag.y, drag.prev?.[1] ?? drag.t];
    drag.prev = [e.clientY, e.timeStamp];
    sheet.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, last } = drag;
    const flick = e.type === 'pointerup' ? Math.max(0, e.clientY - last[0]) : 0, ms = e.timeStamp - last[1];
    drag = null;
    if (e.type === 'pointerup' && (dismissed(dy, Infinity) || dismissed(flick, ms))) {
      sheet.style.transition = sheet.style.transform = '';
      close();
      return;
    }
    sheet.style.transition = 'transform .18s ease-out'; // springs back
    sheet.style.transform = '';
    setTimeout(() => { if (!drag) sheet.style.transition = ''; }, 200);
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}
