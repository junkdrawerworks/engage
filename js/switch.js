// One-switch play, for the Kobayashi Maru and first contact: both are turn-based with no clock, so they can be played
// with a single button. While it is on, a highlight steps through the choices on screen, one every second and a
// half, and each takes the keyboard's place as it comes (so a screen reader reads it out). One press of any key, a
// tap anywhere on the screen, or an assistive switch (which a phone or computer sees as a key) picks the highlighted
// one. Picking starts the steps again from the first choice, except on a choice marked data-stay (a notebook's list
// of meanings), where each press moves it on one and the highlight waits there for the next.
//
// `items()` is the choices that can be picked right now, in order (none while a turn is playing out: the highlight
// waits). `key` is where the setting is kept, so it is remembered.
export function oneSwitch({ items, key, interval = 1500 }) {
  let on = false, timer = 0, at = -1, current = null, picking = false;
  try { on = localStorage.getItem(key) === 'on'; } catch { /* off */ }

  const mark = el => {
    current?.classList.remove('scan');
    current = el;
    if (!el) return;
    el.classList.add('scan');
    el.focus({ preventScroll: false });
  };
  const step = () => {
    clearTimeout(timer);
    if (!on) return;
    const list = items().filter(el => el && el.isConnected && el.getClientRects().length);
    if (!list.length) { mark(null); at = -1; timer = setTimeout(step, 250); return; }
    const was = current && list.indexOf(current);
    at = was >= 0 ? (was + 1) % list.length : 0;
    mark(list[at]);
    timer = setTimeout(step, interval);
  };
  // Starts the steps over from the first choice (or holds on `stay`), after the screen has changed.
  const restart = stay => {
    clearTimeout(timer);
    if (!on) return;
    if (stay) { mark(stay); timer = setTimeout(step, interval * 1.5); return; }
    current?.classList.remove('scan');
    current = null;
    timer = setTimeout(step, 400);
  };
  const pick = () => {
    const el = current;
    if (!el || !el.isConnected) return;
    picking = true;
    try {
      if (el.tagName === 'SELECT') {
        el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else el.click();
    } finally { picking = false; }
    restart(el.dataset.stay !== undefined && el.isConnected ? el : null);
  };

  // Any key picks (and does nothing else: Enter and Space would otherwise click whatever has focus as well).
  addEventListener('keydown', e => {
    if (!on || e.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    pick();
  }, true);
  addEventListener('keyup', e => { if (on && e.key !== 'Tab') e.preventDefault(); }, true);
  // A tap anywhere picks; the tap itself goes nowhere else.
  addEventListener('pointerdown', e => { if (!on || e.button > 0) return; e.preventDefault(); pick(); }, true);
  addEventListener('click', e => { if (on && !picking && e.isTrusted) { e.preventDefault(); e.stopPropagation(); } }, true);

  return {
    get on() { return on; },
    set(value) {
      on = !!value;
      try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* not remembered */ }
      document.documentElement.classList.toggle('one-switch', on);
      if (on) restart(); else { clearTimeout(timer); mark(null); }
    },
    restart,
    get current() { return current; },
    set interval(ms) { interval = ms; },
  };
}
