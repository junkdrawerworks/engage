// The Bridge Officer's Test: the page, inside the Kobayashi Maru's (the rules are in officer-sim.js). A card on the
// Maru's briefing opens it; it has its own screen (a schematic of the ship, the minutes left, the orders and the
// channel) and its own verdict, and keeps its record beside the Maru's.
import { newTest, orders, act, evaluate, moral, MINUTES } from './officer-sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// `saved` is the Maru's record (officer: { taken, passed }) and `save` keeps it; `show(name)` shows one of the
// page's screens; `back()` returns to the briefing.
export function officerTest({ saved, save, show, back }) {
  let t = null, given = [];
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  function record() {
    const r = saved.officer && typeof saved.officer === 'object' ? saved.officer : {};
    return { taken: Number.isInteger(r.taken) && r.taken > 0 ? r.taken : 0, passed: typeof r.passed === 'string' ? r.passed : '' };
  }
  function renderCard() {
    const r = record();
    $('officer-record').hidden = !r.taken;
    $('officer-record').textContent = !r.taken ? '' : r.passed
      ? `Passed on ${new Date(r.passed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. ${r.taken === 1 ? 'First time.' : `${r.taken} attempts.`}`
      : `${r.taken === 1 ? 'One attempt' : `${r.taken} attempts`}, not passed yet.`;
    $('officer-start').textContent = r.taken ? 'Take it again' : 'Take the test';
  }

  function start() {
    t = newTest();
    given = [];
    $('officer-comms').innerHTML = '';
    log([{ who: 'Computer', text: `Simulation begins. A coolant leak in main engineering: warp core breach in ${MINUTES} minutes. The compartment is sealed and flooded with radiation.`, tone: 'bad' }]);
    show('officer');
    update();
    $('officer-orders').querySelector('.order')?.focus({ preventScroll: true });
  }

  function give(id) {
    if (!t || t.over) return;
    given.push(id);
    log(act(t, id));
    update();
    if (t.over) {
      const r = record();
      saved.officer = { taken: r.taken + 1, passed: r.passed || (t.over === 'passed' ? new Date().toISOString() : '') };
      save();
    }
  }

  function update() {
    $('officer-minutes').textContent = t.over === 'passed' ? 'Stopped' : `${t.minutes} min`;
    $('officer-bar').style.width = `${(t.over === 'passed' ? MINUTES : t.minutes) / MINUTES * 100}%`;
    $('officer-bar').classList.toggle('low', t.minutes <= 2 && t.over !== 'passed');
    $('officer-tried').textContent = `${t.tried.length}`;
    const box = $('officer-orders');
    if (t.over) {
      box.innerHTML = '<button class="primary" id="officer-read" type="button">Read the verdict</button>';
      $('officer-read').addEventListener('click', verdict);
      $('officer-read').focus({ preventScroll: true });
    } else {
      const here = document.activeElement?.dataset?.officer;
      box.innerHTML = orders(t).map(o => `<button class="order${o.danger ? ' danger' : ''}" type="button" data-officer="${o.id}"${o.tried ? ' aria-disabled="true"' : ''}><b>${esc(o.label)}</b><span>${esc(o.sub)}</span></button>`).join('');
      if (here) box.querySelector(`[data-officer="${here}"]`)?.focus({ preventScroll: true });
    }
    draw();
  }

  function log(lines) {
    const box = $('officer-comms');
    for (const l of lines) {
      const p = document.createElement('p');
      p.className = `line${l.tone ? ` ${l.tone}` : ''}`;
      p.innerHTML = `<span class="who">${esc(l.who)}</span>${esc(l.text)}`;
      box.append(p);
      $('officer-caption').innerHTML = p.innerHTML;
      $('officer-caption').className = `caption${l.tone ? ` ${l.tone}` : ''}`;
    }
    box.scrollTop = box.scrollHeight;
  }

  function verdict() {
    const e = evaluate(t);
    $('officer-title').textContent = e.title;
    $('officer-title').className = e.passed ? 'passed' : '';
    $('officer-summary').textContent = e.summary;
    $('officer-note').innerHTML = e.note.map(n => `<p>${esc(n)}</p>`).join('');
    $('officer-moral').textContent = moral;
    show('officer-eval');
    $('officer-title').focus({ preventScroll: true });
  }

  // A schematic of the ship from the side: the saucer, the engineering hull with the warp core in it, and the sealed
  // compartment, red while the radiation is in it. The core glows hotter as the minutes go.
  const canvas = $('officer-plot');
  function draw() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !t) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const c = canvas.getContext('2d'), W = 1000, H = W * r.height / r.width;
    c.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
    c.fillStyle = '#04060b'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(134, 216, 255, 0.07)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const cy = H * 0.5, lost = t.over === 'breach' || t.over === 'saucer';
    c.lineWidth = 3; c.strokeStyle = '#86d8ff'; c.fillStyle = 'rgba(134, 216, 255, 0.08)';
    // Saucer, neck, engineering hull and a nacelle, in outline.
    c.globalAlpha = t.over === 'breach' ? 0.35 : 1;
    c.beginPath(); c.ellipse(W * 0.32, cy - H * 0.16, W * 0.22, H * 0.06, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    {
      c.globalAlpha = lost ? 0.35 : 1;
      c.beginPath(); c.moveTo(W * 0.42, cy - H * 0.11); c.lineTo(W * 0.5, cy + H * 0.02); c.lineTo(W * 0.56, cy + H * 0.02); c.lineTo(W * 0.48, cy - H * 0.11); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(W * 0.64, cy + H * 0.08, W * 0.17, H * 0.07, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(W * 0.6, cy - H * 0.2, W * 0.34, H * 0.05, 12); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(W * 0.68, cy + H * 0.02); c.lineTo(W * 0.74, cy - H * 0.15); c.stroke();
      // The flooded compartment, and the conduit in it.
      const red = t.over === 'passed' ? 0.12 : 0.35;
      c.fillStyle = `rgba(255, 90, 80, ${red})`; c.strokeStyle = 'rgba(255, 107, 94, 0.8)'; c.lineWidth = 2; c.setLineDash([7, 6]);
      c.beginPath(); c.rect(W * 0.66, cy + H * 0.03, W * 0.09, H * 0.08); c.fill(); c.stroke(); c.setLineDash([]);
      // The core: amber, then red as the minutes run out; cool blue once the conduit is mended.
      const heat = t.over === 'passed' ? 0 : 1 - t.minutes / MINUTES;
      c.fillStyle = t.over === 'passed' ? '#86d8ff' : `rgb(255, ${Math.round(190 - 130 * heat)}, ${Math.round(80 - 40 * heat)})`;
      c.shadowColor = c.fillStyle; c.shadowBlur = still.matches ? 0 : 10 + 20 * heat;
      c.fillRect(W * 0.62, cy + H * 0.02, W * 0.012, H * 0.12);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
    c.font = '600 18px "Chakra Petch", sans-serif';
    c.fillStyle = 'rgba(255, 107, 94, 0.9)'; c.fillText('SEALED · RADIATION', W * 0.66, cy + H * 0.22);
    c.fillStyle = 'rgba(134, 216, 255, 0.6)'; c.fillText('WARP CORE', W * 0.47, cy + H * 0.22);
    if (lost) { c.fillStyle = 'rgba(255, 170, 60, 0.8)'; c.fillText(t.over === 'saucer' ? 'STARDRIVE SECTION LOST' : 'WARP CORE BREACH', W * 0.47, cy + H * 0.29); }
  }
  addEventListener('resize', () => { if (!$('officer').hidden) draw(); });

  $('officer-start').addEventListener('click', start);
  $('officer-orders').addEventListener('click', e => {
    const b = e.target.closest('.order');
    if (b && b.getAttribute('aria-disabled') !== 'true') give(b.dataset.officer);
  });
  $('officer-again').addEventListener('click', start);
  $('officer-back').addEventListener('click', () => { renderCard(); back(); });

  renderCard();
  return {
    renderCard, start, give,
    get test() { return t; },
    // The choices one switch can pick on this test's screens.
    items: () => (!$('officer').hidden ? (t?.over ? [$('officer-read')] : [...$('officer-orders').querySelectorAll('.order:not([aria-disabled])')]) : !$('officer-eval').hidden ? [$('officer-again'), $('officer-back')] : []),
  };
}
