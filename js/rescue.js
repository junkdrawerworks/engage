// The rescue test: the page, inside the Kobayashi Maru's (the rules are in rescue-sim.js). A card on the Maru's
// briefing opens it, with today's rescue beside it; it has its own screen (the two ships, your ship and its
// transporter range on the tactical display, the minutes each ship has, the orders and the channel) and its own
// verdict, and keeps its record beside the Maru's, as `rescue`.
import { newRescue, orders, act, settle, evaluate, shareLine, dailySeed, moral, apartKm, RANGE_KM, BUY } from './rescue-sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fresh = () => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
const shortDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const pct = x => `${Math.round(x * 100)}%`;

// The record kept under the Maru's save as `rescue`, read back tidily: { taken, best (the best share of the most
// there was, 0 to 1), full (runs that found the most), runs (the latest 30: { at, rescued, of, most, day? }),
// daily ({ date, line }) }.
export function rescueRecord(saved) {
  const r = saved && typeof saved.rescue === 'object' && saved.rescue && !Array.isArray(saved.rescue) ? saved.rescue : {};
  const n = x => (Number.isInteger(x) && x > 0 ? x : 0);
  const runs = (Array.isArray(r.runs) ? r.runs : []).filter(x => x && typeof x.at === 'string' && Number.isInteger(x.rescued) && Number.isInteger(x.most) && x.most > 0).slice(-30);
  const daily = r.daily && typeof r.daily.date === 'string' && typeof r.daily.line === 'string' ? { date: r.daily.date, line: r.daily.line } : null;
  return { taken: Math.max(n(r.taken), runs.length), best: Number.isFinite(r.best) && r.best > 0 ? Math.min(1, r.best) : 0, full: n(r.full), runs, ...(daily ? { daily } : {}) };
}

// `saved` is the Maru's record and `save` keeps it; `show(name)` shows one of the page's screens; `back()` returns to
// the briefing; `today()` is the date where the cadet is; `share(button, what)` sends a line and a link; `sound`
// is Engage's.
export function rescueTest({ saved, save, show, back, today, share, live, sound }) {
  let t = null, given = [], day = '', shuttleFrom = null, lastEval = null, clocks = [];

  function renderCard() {
    const r = rescueRecord(saved);
    $('rescue-record').hidden = !r.taken;
    $('rescue-record').textContent = !r.taken ? ''
      : `${r.taken === 1 ? 'One test' : `${r.taken} tests`} taken. Best: ${pct(r.best)} of what was possible${r.full ? `, found the most ${r.full === 1 ? 'once' : `${r.full} times`}` : ''}.`;
    $('rescue-start').textContent = r.taken ? 'Take it again' : 'Take the test';
    const d = today(), done = r.daily?.date === d ? r.daily : null;
    $('rescue-daily').hidden = !!done;
    $('rescue-share').hidden = !done;
    $('rescue-daily-note').innerHTML = done ? `<b>Today’s rescue</b>${esc(done.line.replace(/^Rescue test, [^:]+: /, ''))}` : 'The same two ships for every cadet today.';
  }

  // `seed` picks the test, for the e2e walk-through; today's has its own.
  function start(daily = false, seed = fresh()) {
    day = daily ? today() : '';
    t = newRescue(daily ? dailySeed(day) : seed);
    given = []; shuttleFrom = null; lastEval = null;
    clocks = t.ships.map(s => s.left + BUY); // a full ring: her minutes, and the most she can be told to buy
    $('rescue-comms').innerHTML = '';
    const [a, b] = t.ships;
    const mkm = Math.round(apartKm(t) / 1e5) / 10;
    const ship = s => `The ${s.name}, a ${s.what} with ${s.aboard} aboard: ${trouble(s)}, ${s.left} minutes.`;
    log([
      { who: 'Computer', text: `Simulation begins. Two distress calls at once. ${ship(a)} ${ship(b)}`, tone: 'bad' },
      { who: 'Helm', text: `They are ${mkm.toLocaleString('en-US')} million kilometres apart, ${t.apart} minutes at full impulse. The transporter reaches ${RANGE_KM.toLocaleString('en-US')}. We are between them, a minute from each.` },
      { who: 'The examiner', text: 'There is time to save one of them.' },
    ]);
    $('rescue-eyebrow').textContent = day ? 'Today’s rescue · The board’s verdict' : 'Starfleet Academy · Rescue test';
    show('rescue');
    update();
    $('rescue-orders').querySelector('.order')?.focus({ preventScroll: true });
  }
  const TROUBLE = { breach: 'her warp core will breach', hull: 'her hull is breaking up', air: 'her life support is failing', star: 'she is falling into the star', storm: 'a radiation storm will reach her' };
  const trouble = s => TROUBLE[s.danger];

  function give(id) {
    if (!t || t.over) return;
    const o = orders(t).find(x => x.id === id);
    if (!o || o.off) return;
    if (id.startsWith('shuttle-')) shuttleFrom = { minute: t.minute, at: t.at };
    given.push(id);
    const before = t.ships.map(s => s.lost);
    const lines = [...act(t, id), ...settle(t)];
    log(lines);
    if (id === 'beam') sound.beam?.();
    if (t.ships.some((s, k) => s.lost && !before[k])) sound.boom?.();
    if (lines.some(l => l.who === 'Shuttle bay' && l.tone === 'good')) sound.blip?.(990);
    if (t.over) finish();
    update();
  }

  function finish() {
    const r = rescueRecord(saved);
    const e = evaluate(t, given);
    lastEval = e;
    const run = { at: new Date().toISOString(), rescued: e.rescued, of: e.total, most: e.most, ...(day ? { day } : {}) };
    const full = e.rescued >= e.most;
    const firsts = [];
    if (e.share > r.best && r.taken) firsts.push(`New best · ${pct(e.share)}`);
    if (full && !r.full) firsts.push('The most there was, for the first time');
    saved.rescue = {
      taken: r.taken + 1, best: Math.max(r.best, Math.round(e.share * 1000) / 1000), full: r.full + (full ? 1 : 0),
      runs: [...r.runs, run].slice(-30),
      ...(day && r.daily?.date !== day ? { daily: { date: day, line: shareLine(e, day) } } : r.daily ? { daily: r.daily } : {}),
    };
    save();
    $('rescue-firsts').hidden = !firsts.length;
    $('rescue-firsts').textContent = firsts.join(' · ');
  }

  function update() {
    $('rescue-turn').textContent = `Rescue test · Minute ${t.minute}`;
    const rescued = t.ships.reduce((n, s) => n + s.saved, 0);
    $('rescue-status').innerHTML = `<div class="gauge"><span class="g-k">Rescued</span><span class="g-v">${rescued}</span></div>`
      + `<div class="gauge"><span class="g-k">Transporter</span><span class="g-v">${t.rate} a min</span></div>`
      + t.ships.map(s => `<div class="gauge"><span class="g-k">${esc(s.name)}</span><span class="g-v">${s.lost ? (s.aboard ? 'Lost' : 'Gone, all off') : s.aboard ? `${s.aboard} · ${s.left} min` : 'All off'}</span></div>`).join('');
    const box = $('rescue-orders');
    if (t.over) {
      box.innerHTML = '<button class="primary" id="rescue-read" type="button">Read the verdict</button>';
      $('rescue-read').addEventListener('click', verdict);
      $('rescue-read').focus({ preventScroll: true });
    } else {
      const here = document.activeElement?.dataset?.rescue;
      box.innerHTML = orders(t).map(o => `<button class="order${o.id === 'beam' && !o.off ? ' primary-order' : ''}" type="button" data-rescue="${o.id}"${o.off ? ' aria-disabled="true"' : ''}><b>${esc(o.label)}</b><span>${esc(o.sub)}</span></button>`).join('');
      if (here) (box.querySelector(`[data-rescue="${here}"]`) || box.querySelector('.order:not([aria-disabled])'))?.focus({ preventScroll: true });
    }
    draw();
  }

  function log(lines) {
    const box = $('rescue-comms');
    for (const l of lines) {
      const p = document.createElement('p');
      p.className = `line${l.tone ? ` ${l.tone}` : ''}`;
      p.innerHTML = `<span class="who">${esc(l.who)}</span>${esc(l.text)}`;
      box.append(p);
      $('rescue-caption').innerHTML = p.innerHTML;
      $('rescue-caption').className = `caption${l.tone ? ` ${l.tone}` : ''}`;
    }
    box.scrollTop = box.scrollHeight;
  }

  function verdict() {
    const e = lastEval || evaluate(t, given);
    $('rescue-title').textContent = e.title;
    $('rescue-title').className = e.passed ? 'passed' : '';
    $('rescue-summary').textContent = e.summary;
    $('rescue-note').innerHTML = e.note.map(n => `<p>${esc(n)}</p>`).join('');
    $('rescue-moral').textContent = moral;
    $('rescue-share-run').hidden = !day;
    show('rescue-eval');
    $('rescue-title').focus({ preventScroll: true });
  }

  function sendToday(button) {
    const d = rescueRecord(saved).daily;
    if (!d) return;
    const url = `${live}maru.html`;
    share(button, { title: 'The rescue test', text: d.line, url, copy: `${d.line}\n${url}` });
  }

  // The tactical display: the two ships on either side, each with a ring for the minutes she has left and her count
  // aboard; your ship between them or alongside one, with the transporter's reach round it (not to scale: at this
  // scale it would be a speck); the shuttles on their way, there and back.
  const canvas = $('rescue-plot');
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
    const pos = [[W * 0.19, H * 0.3], [W * 0.81, H * 0.3]];
    const mid = [W * 0.5, H * 0.5];
    // Alongside a ship is just inside her, toward the middle, so her name stays clear.
    const beside = at => (at === 'a' ? [pos[0][0] + 118, pos[0][1] + 18] : at === 'b' ? [pos[1][0] - 118, pos[1][1] + 18] : mid);
    const you = beside(t.at);
    // The course between them.
    c.setLineDash([4, 10]); c.strokeStyle = 'rgba(134, 216, 255, 0.25)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(...pos[0]); c.lineTo(...mid); c.lineTo(...pos[1]); c.stroke(); c.setLineDash([]);
    c.font = '600 30px "Chakra Petch", sans-serif'; c.textAlign = 'center';
    t.ships.forEach((s, k) => {
      const [x, y] = pos[k];
      const gone = s.lost || s.aboard === 0;
      c.globalAlpha = s.lost && s.aboard ? 0.35 : gone ? 0.55 : 1;
      // The clock: a ring that empties as her minutes go.
      c.lineWidth = 7; c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      c.beginPath(); c.arc(x, y, 56, 0, Math.PI * 2); c.stroke();
      if (!s.lost) {
        const f = Math.min(1, s.left / clocks[k]);
        c.strokeStyle = s.left <= 2 ? '#ff6b5e' : s.left <= 4 ? '#ffb54a' : '#86d8ff';
        c.beginPath(); c.arc(x, y, 56, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
      }
      // Her hull, side on.
      c.fillStyle = 'rgba(134, 216, 255, 0.1)'; c.strokeStyle = s.lost ? '#ff6b5e' : '#cfe6ff'; c.lineWidth = 3;
      c.beginPath(); c.roundRect(x - 34, y - 11, 68, 22, 11); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 12, y - 11); c.lineTo(x - 4, y - 24); c.lineTo(x + 18, y - 24); c.lineTo(x + 12, y - 11); c.stroke();
      c.font = '600 30px "Chakra Petch", sans-serif';
      c.fillStyle = '#e3e8f1'; c.fillText(s.name.toUpperCase(), x, y + 100);
      c.font = '600 26px "Chakra Petch", sans-serif';
      c.fillStyle = s.lost && s.aboard ? '#ff6b5e' : 'rgba(227, 232, 241, 0.8)';
      c.fillText(s.lost ? (s.aboard ? `LOST · ${s.aboard}` : 'ALL OFF') : s.aboard ? `${s.aboard} · ${s.left} MIN` : 'ALL OFF', x, y + 134);
      c.globalAlpha = 1;
    });
    // Shuttles: out to the ship, then home to yours.
    const sh = t.shuttles;
    if (sh && !sh.done && shuttleFrom) {
      const from = beside(shuttleFrom.at);
      const f = Math.max(0, Math.min(1, (t.minute - shuttleFrom.minute) / (sh.arrives - shuttleFrom.minute)));
      const to = pos[sh.to], g = f < 0.5 ? f * 2 : 2 - f * 2;
      const sx = from[0] + (to[0] - from[0]) * g, sy = from[1] + (to[1] - from[1]) * g;
      c.fillStyle = '#ffb54a';
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.arc(sx + k * 14, sy + Math.abs(k) * 7, 6, 0, Math.PI * 2); c.fill(); }
      c.font = '600 24px "Chakra Petch", sans-serif'; c.fillText('SHUTTLES', sx, sy - 20);
    }
    // Your ship and the transporter's reach.
    c.setLineDash([7, 7]); c.strokeStyle = 'rgba(111, 227, 164, 0.6)'; c.lineWidth = 2;
    c.beginPath(); c.arc(you[0], you[1], 128, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#6fe3a4';
    c.beginPath(); c.moveTo(you[0] + 20, you[1]); c.lineTo(you[0] - 14, you[1] - 12); c.lineTo(you[0] - 8, you[1]); c.lineTo(you[0] - 14, you[1] + 12); c.closePath(); c.fill();
    c.font = '600 22px "Chakra Petch", sans-serif'; c.fillStyle = 'rgba(111, 227, 164, 0.85)';
    c.fillText('TRANSPORTER RANGE', you[0], you[1] + 160);
    c.fillText('NOT TO SCALE', you[0], you[1] + 186);
    c.textAlign = 'start';
  }
  addEventListener('resize', () => { if (!$('rescue').hidden) draw(); });

  $('rescue-start').addEventListener('click', () => start(false));
  $('rescue-daily').addEventListener('click', () => start(true));
  $('rescue-share').addEventListener('click', e => sendToday(e.currentTarget));
  $('rescue-share-run').addEventListener('click', e => sendToday(e.currentTarget));
  $('rescue-orders').addEventListener('click', e => {
    const b = e.target.closest('.order');
    if (b && b.getAttribute('aria-disabled') !== 'true') give(b.dataset.rescue);
  });
  $('rescue-again').addEventListener('click', () => start(false));
  $('rescue-back').addEventListener('click', () => { renderCard(); back(); });
  // 1 to 9 give the orders, counting down the list as it stands, as they do in the Maru.
  addEventListener('keydown', e => {
    if ($('rescue').hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const b = $('rescue-orders').querySelectorAll('.order')[Number(e.key) - 1];
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    b.click();
  });

  renderCard();
  return {
    renderCard, start, give,
    get test() { return t; },
    get given() { return given.slice(); },
    // The choices one switch can pick on this test's screens.
    items: () => (!$('rescue').hidden ? (t?.over ? [$('rescue-read')] : [...$('rescue-orders').querySelectorAll('.order:not([aria-disabled])')])
      : !$('rescue-eval').hidden ? [$('rescue-again'), $('rescue-back'), ...(day ? [$('rescue-share-run')] : [])] : []),
  };
}
