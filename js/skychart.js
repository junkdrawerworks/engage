// A star chart on a 2D canvas: the whole sky round a point, drawn the way a wide lens keeps shapes true
// (stereographic), dragged to look around, pinched or scrolled to zoom, tapped to pick a star. Shared by the rooms
// that put the real sky on a flat screen without the bridge's viewscreen: the distress call (Earth's sky, and the
// survivors' own) and the temporal observatory (Earth's sky in another century). Directions are unit vectors in
// the catalogue's axes (x toward the March equinox, z toward the north celestial pole). `projector` is pure, and
// checked by test/distress.test.mjs; the class draws.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));

// The screen's axes for a view centred on `centre`: right and up, with celestial north up (and, looking out from
// inside the sky, east on the left, as on any star chart). Looking straight at a pole, up is toward RA 0h.
export function basis(centre) {
  const f = unit(centre);
  let r = cross(f, [0, 0, 1]);
  if (Math.hypot(...r) < 1e-6) r = cross(f, [1, 0, 0]);
  r = unit(r);
  return { f, r, u: cross(r, f) };
}

// Where a direction lands on a W × H screen with `fov` radians across its shorter side: { x, y } in pixels, or null
// for a direction more than about 120° from the centre, where the lens would stretch it past the screen.
export function projector(centre, fov, W, H) {
  const B = basis(centre);
  const S = Math.min(W, H) / 2 / (2 * Math.tan(fov / 4));
  return {
    B, S,
    at(d) {
      const z = dot(d, B.f);
      if (z < -0.5) return null;
      const k = 2 / (1 + z);
      return { x: W / 2 + k * dot(d, B.r) * S, y: H / 2 - k * dot(d, B.u) * S };
    },
  };
}

// The centre after a drag of (dx, dy) pixels: the sky follows the finger.
export function dragged(centre, dx, dy, S) {
  const { f, r, u } = basis(centre);
  return unit([0, 1, 2].map(k => f[k] - r[k] * dx / S + u[k] * dy / S));
}

export const MIN_FOV = 12 * Math.PI / 180, MAX_FOV = 150 * Math.PI / 180;

// A star's dot: radius in pixels and how opaque, by magnitude against the faintest drawn.
export function dotFor(mag, limit) {
  const s = limit + 0.4 - mag;
  return { r: Math.min(4.6, Math.max(0.5, 0.55 + s * 0.42)), a: Math.min(1, Math.max(0.15, s / 1.4)) };
}

export class SkyChart {
  // `opts.onPick(i)` hears a tap on a star (its index, or null on empty sky); `opts.onMove()` hears every redraw
  // the person caused.
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.opts = opts;
    this.centre = opts.centre || [1, 0, 0];
    this.fov = opts.fov || 90 * Math.PI / 180;
    this.stars = []; // [{ i, dir, mag, col: [r, g, b] }], brightest first
    this.lines = []; // [[dirA, dirB]]
    this.ghost = []; // [[dirA, dirB]], drawn fainter (today's shapes, to compare)
    this.names = []; // [{ name, dir }]
    this.limit = 5.5;
    this.marks = null; // (g, at) => void, drawn last
    this.dots = [];
    this.wire();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  set(what) { Object.assign(this, what); this.draw(); }

  turnTo(dir, fov) { this.centre = unit(dir); if (fov) this.fov = fov; this.draw(); }

  draw() {
    const cv = this.cv, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 340, H = cv.clientHeight || 340;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#02040a'; g.fillRect(0, 0, W, H);
    const P = projector(this.centre, this.fov, W, H);
    this.P = P; this.W = W; this.H = H;
    const seg = (list, style) => {
      g.strokeStyle = style; g.lineWidth = 1; g.beginPath();
      for (const [a, b] of list) {
        const pa = P.at(a), pb = P.at(b);
        if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) > Math.max(W, H)) continue;
        g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      }
      g.stroke();
    };
    if (this.ghost.length) { g.setLineDash([3, 4]); seg(this.ghost, 'rgba(255, 181, 74, 0.22)'); g.setLineDash([]); }
    seg(this.lines, 'rgba(134, 190, 255, 0.24)');
    const zoom = Math.min(1.5, Math.max(0.85, Math.sqrt((80 * Math.PI / 180) / this.fov)));
    this.dots = [];
    for (const s of this.stars) {
      if (s.mag > this.limit + 0.4) continue;
      const p = P.at(s.dir);
      if (!p || p.x < -6 || p.y < -6 || p.x > W + 6 || p.y > H + 6) continue;
      const { r, a } = dotFor(s.mag, this.limit);
      const c = s.col || [1, 1, 1];
      g.fillStyle = `rgba(${c[0] * 255 | 0}, ${c[1] * 255 | 0}, ${c[2] * 255 | 0}, ${a})`;
      const rr = r * zoom;
      if (rr < 1.1) g.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
      else { g.beginPath(); g.arc(p.x, p.y, rr, 0, 7); g.fill(); }
      this.dots.push({ x: p.x, y: p.y, i: s.i, mag: s.mag });
    }
    if (this.names.length && this.fov > 30 * Math.PI / 180) {
      g.font = '600 10px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(134, 190, 255, 0.5)';
      for (const n of this.names) {
        const p = P.at(n.dir);
        if (p && p.x > 20 && p.x < W - 20 && p.y > 10 && p.y < H - 10) g.fillText(n.name.toUpperCase(), p.x, p.y);
      }
    }
    if (this.marks) this.marks(g, d => P.at(d), { W, H });
  }

  // The star nearest a point on the canvas, brighter ones winning a near thing, within `reach` pixels.
  starAt(x, y, reach = 22) {
    let best = null, score = Infinity;
    for (const d of this.dots) {
      const away = Math.hypot(d.x - x, d.y - y);
      if (away > reach) continue;
      const s = away + d.mag * 2.5;
      if (s < score) { score = s; best = d; }
    }
    return best ? best.i : null;
  }

  wire() {
    const cv = this.cv, touches = new Map();
    let moved = 0, pinch = null;
    const changed = () => { this.draw(); this.opts.onMove?.(); };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov }; }
    });
    cv.addEventListener('pointermove', e => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 2 && pinch) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, pinch.fov * pinch.d / Math.max(d, 1)));
        moved += 10;
        changed();
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (!this.P) return;
      this.centre = dragged(this.centre, dx, dy, this.P.S);
      changed();
    });
    const up = e => {
      const was = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (e.type === 'pointerup' && was && moved < 8 && touches.size === 0) {
        const r = cv.getBoundingClientRect();
        this.opts.onPick?.(this.starAt(e.clientX - r.left, e.clientY - r.top));
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      this.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, this.fov * Math.exp(e.deltaY * 0.0015)));
      changed();
    }, { passive: false });
    cv.addEventListener('keydown', e => {
      const step = 40;
      const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (move && this.P) { e.preventDefault(); this.centre = dragged(this.centre, move[0], move[1], this.P.S); changed(); }
      else if (e.key === '+' || e.key === '=') { this.fov = Math.max(MIN_FOV, this.fov / 1.25); changed(); }
      else if (e.key === '-') { this.fov = Math.min(MAX_FOV, this.fov * 1.25); changed(); }
    });
  }
}
