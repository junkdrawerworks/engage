// Draws astrometrics' neighbourhood (js/neighbourhood.js works out what goes where) on a canvas, and turns it: drag
// to turn, pinch or the wheel to zoom, tap a star to pick it. Keeps only the view and what was last drawn, for taps.
import { FIRST_VIEW, REACH, RINGS, dotRadius, project, turned } from './neighbourhood.js';
import { dotAt } from './cartography.js';
import { picture } from './room.js';

const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`;
const GREY = [0.62, 0.66, 0.74];

// `cat` the catalogue; `near`, `named` from js/neighbourhood.js; `titleOf(i)` a star's name; `onPick(i)` when a star
// is tapped. `data()` hands back what changes as the page goes: { visited (a Set), chart (chartOf the log), pick }.
export function makeHood(cv, { cat, near, named, titleOf, onPick, onTurn = () => {}, data }) {
  let view = { ...FIRST_VIEW }, dots = [], queued = false, dragged = false;
  const labelOf = new Map(named.map(n => [n.star, n.label]));

  function draw() {
    queued = false;
    const box = cv.parentElement.getBoundingClientRect();
    const W = Math.round(box.width) || 340, H = Math.round(box.height) || 380, dpr = Math.min(devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = picture(cv.getContext('2d'));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const { visited, chart, pick } = data();
    const at = p => project(p, view, W, H);
    // The disc: its rings, dashed, each named where it comes nearest the bottom of the picture, and which way the
    // galactic centre is.
    g.lineWidth = 1;
    const ringNames = [];
    for (const r of RINGS) {
      let low = null;
      g.beginPath();
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2, [x, y] = at({ x: r * Math.cos(a), y: r * Math.sin(a), z: 0 });
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
        if (!low || y > low[1]) low = [x, y];
      }
      if (r === REACH) { g.fillStyle = 'rgba(134, 216, 255, 0.035)'; g.fill(); }
      g.strokeStyle = r === REACH ? 'rgba(140, 180, 255, 0.45)' : 'rgba(140, 180, 255, 0.26)';
      g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
      ringNames.push([`${r} ly`, low[0], low[1] + 2]);
    }
    const [cx0, cy0] = at({ x: -REACH, y: 0, z: 0 }), [cx1, cy1] = at({ x: REACH, y: 0, z: 0 });
    g.strokeStyle = 'rgba(140, 180, 255, 0.14)';
    g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx1, cy1); g.stroke();

    // Which stars get a line to the disc and a name: the one picked, the ones in the log, the named ones.
    const marked = new Set(named.map(n => n.star));
    for (const s of near) if (visited.has(s.star)) marked.add(s.star);
    const placed = near.map(s => { const [x, y, d] = at(s); return { s, x, y, d }; });
    // Lines dropped to the disc: solid from a star above it, dashed from one below, with a tick where each lands.
    for (const p of placed) {
      if (!marked.has(p.s.star) && p.s.star !== pick) continue;
      const [fx, fy] = at({ x: p.s.x, y: p.s.y, z: 0 });
      g.strokeStyle = p.s.star === pick ? 'rgba(134, 216, 255, 0.8)' : 'rgba(134, 216, 255, 0.32)';
      g.lineWidth = p.s.star === pick ? 1.5 : 1;
      g.setLineDash(p.s.z < 0 ? [2, 3] : []);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(fx, fy); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.moveTo(fx - 3, fy); g.lineTo(fx + 3, fy); g.stroke();
    }
    // The stars, the farthest from the eye first, fainter the farther.
    placed.sort((a, b) => a.d - b.d);
    dots = [];
    const z = view.zoom;
    for (const p of placed) {
      if (p.x < -8 || p.y < -8 || p.x > W + 8 || p.y > H + 8) continue;
      const i = p.s.star, a = (marked.has(i) ? 0.75 : 0.4) + 0.25 * Math.max(0, Math.min(1, (p.d + REACH) / (2 * REACH)));
      g.fillStyle = rgb(cat.nocolour[i] ? GREY : cat.color.subarray(i * 3, i * 3 + 3), a);
      g.beginPath(); g.arc(p.x, p.y, dotRadius(cat.absmag[i], z), 0, Math.PI * 2); g.fill();
      dots.push({ x: p.x, y: p.y, star: i });
    }
    // The flights from the log, oldest faintest, and the stars visited ringed in amber. A flight to a star past 80
    // light years runs on off the picture, the way it went.
    const byStar = new Map(chart.stars.map(s => [s.star, s]));
    const placeOf = i => (i === 0 ? [W / 2, H / 2] : at(byStar.get(i)));
    const n = chart.legs.length;
    chart.legs.forEach(([a, b], k) => {
      const [x1, y1] = placeOf(a), [x2, y2] = placeOf(b);
      g.strokeStyle = `rgba(255, 181, 74, ${(0.25 + 0.6 * ((k + 1) / n) ** 2).toFixed(3)})`;
      g.lineWidth = k === n - 1 ? 1.8 : 1.1;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    });
    g.strokeStyle = 'rgba(255, 181, 74, 0.85)'; g.lineWidth = 1.2;
    for (const p of placed) if (visited.has(p.s.star)) { g.beginPath(); g.arc(p.x, p.y, 4.5, 0, Math.PI * 2); g.stroke(); }
    // The rings' distances, over the stars, each where it doesn't crowd another (seen edge on, they all meet).
    g.font = '500 10px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    const ringAt = [];
    for (const [t, x, y] of ringNames) {
      if (ringAt.some(([a, b]) => Math.abs(a - x) < 30 && Math.abs(b - y) < 14)) continue;
      ringAt.push([x, y]);
      g.strokeStyle = 'rgba(5, 7, 13, 0.85)'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeText(t, x, y);
      g.fillStyle = 'rgba(147, 160, 184, 0.95)'; g.fillText(t, x, y);
    }
    // Which way the galactic centre is, over the stars.
    g.font = '600 9px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    {
      const [x, y] = at({ x: REACH * 1.1, y: 0, z: 0 }), t = 'TOWARD THE GALACTIC CENTRE';
      g.textAlign = x < W * 0.3 ? 'left' : x > W * 0.7 ? 'right' : 'center';
      const px = Math.min(W - 6, Math.max(6, x)), py = Math.min(H - 8, Math.max(8, y));
      g.strokeStyle = 'rgba(5, 7, 13, 0.85)'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeText(t, px, py);
      g.fillStyle = 'rgba(147, 160, 184, 1)'; g.fillText(t, px, py);
    }
    // Home.
    g.fillStyle = '#ffd27a';
    g.beginPath(); g.arc(W / 2, H / 2, 3.5, 0, Math.PI * 2); g.fill();
    // The star picked.
    const picked = placed.find(p => p.s.star === pick);
    if (picked) { g.strokeStyle = '#86d8ff'; g.lineWidth = 2; g.beginPath(); g.arc(picked.x, picked.y, 8, 0, Math.PI * 2); g.stroke(); }
    // Names: Sol, the one picked, then the ones in the log, then Starfleet's and the others with notes, nearest first,
    // each where it fits without covering another.
    g.font = '500 10.5px "IBM Plex Sans", sans-serif';
    g.textBaseline = 'middle';
    const boxes = [];
    const name = (x, y, t, strong, force) => {
      const w = g.measureText(t).width, h = 13, right = x + 7 + w < W - 4;
      const bx = right ? x + 7 : x - 7 - w, b = [bx, y - h / 2, bx + w, y + h / 2];
      if (!force && boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return false;
      if (!force && (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2)) return false;
      boxes.push(b);
      g.textAlign = 'left';
      g.strokeStyle = 'rgba(5, 7, 13, 0.85)'; g.lineWidth = 3; g.lineJoin = 'round';
      g.strokeText(t, bx, y);
      g.fillStyle = strong ? '#e8edf6' : 'rgba(232, 237, 246, 0.78)';
      g.fillText(t, bx, y);
      return true;
    };
    if (picked) name(picked.x + 2, picked.y, labelOf.get(pick) || titleOf(pick), true, true);
    g.fillStyle = '#ffd27a';
    name(W / 2, H / 2, 'Sol', true, false);
    const wanted = placed.filter(p => p.s.star !== pick && (visited.has(p.s.star) || labelOf.has(p.s.star)))
      .sort((a, b) => visited.has(b.s.star) - visited.has(a.s.star) || labelOf.has(b.s.star) - labelOf.has(a.s.star) || a.s.ly - b.s.ly);
    const most = W < 500 ? 12 : 22;
    let said = 0;
    for (const p of wanted) {
      if (said >= most) break;
      if (name(p.x, p.y, labelOf.get(p.s.star) || titleOf(p.s.star), visited.has(p.s.star), false)) said++;
    }
  }
  const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  const set = v => { view = v; redraw(); onTurn(view); };

  // A finger (or the mouse) dragged turns it, two pinched zoom it; a tap that didn't move picks the nearest star.
  const down = new Map();
  let pinch = null, start = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture?.(e.pointerId);
    down.set(e.pointerId, [e.clientX, e.clientY]);
    if (down.size === 1) { start = [e.clientX, e.clientY]; dragged = false; }
    if (down.size === 2) { const [a, b] = [...down.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom: view.zoom }; dragged = true; }
  });
  cv.addEventListener('pointermove', e => {
    const was = down.get(e.pointerId);
    if (!was) return;
    down.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && down.size === 2) {
      const [a, b] = [...down.values()];
      set(turned(view, 0, 0, (pinch.zoom * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)) / view.zoom));
      return;
    }
    if (!dragged && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 6) return;
    dragged = true;
    set(turned(view, (e.clientX - was[0]) * 0.01, -(e.clientY - was[1]) * 0.008));
  });
  const up = e => { down.delete(e.pointerId); if (down.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('click', e => {
    if (dragged) { dragged = false; return; }
    const r = cv.getBoundingClientRect();
    const d = dotAt(dots, e.clientX - r.left, e.clientY - r.top, 14);
    if (d) onPick(d.star);
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); set(turned(view, 0, 0, Math.exp(-e.deltaY * 0.0015))); }, { passive: false });

  return {
    draw, redraw,
    get view() { return { ...view }; },
    turn: (dYaw, dPitch) => set(turned(view, dYaw, dPitch)),
    zoom: by => set(turned(view, 0, 0, by)),
    reset: () => set({ ...FIRST_VIEW }),
    dots: () => dots,
  };
}
