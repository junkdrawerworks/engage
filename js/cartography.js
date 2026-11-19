// Stellar cartography, in the captain's log: every star visited, seen from above the galaxy's plane with the Sun in
// the middle, and the flights between them in the order they were flown. Pure: the bridge draws what this works out.
// Checked by test/voyage.test.mjs.
import { LY_PER_PC } from './physics.js';

// From the catalogue's axes (x toward the March equinox, z toward the north celestial pole) to the galaxy's: x toward
// the galactic centre, y toward galactic longitude 90° (Cygnus, the way the Sun is carried round), z toward the north
// galactic pole. The rotation is the Hipparcos catalogue's (ESA 1997, The Hipparcos and Tycho Catalogues, vol. 1,
// section 1.5.3), for the J2000 frame the HYG catalogue's positions are in.
const TO_GALACTIC = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];
export const galactic = p => TO_GALACTIC.map(r => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);

// The chart of a log (newest first, as the bridge keeps it): each star visited once, in light years on the plane
// (x toward the galactic centre, y toward Cygnus) with its height above or below it, how many visits and the newest;
// and the flights, oldest first, each from the star before it (the first from home). Stars with no measured distance
// are counted but left off: the catalogue parks them at a made-up distance, so nobody knows where to draw them.
// `cat` needs `pos` (parsecs, three to a star), `unmeasured` and `count`.
export function chartOf(log, cat) {
  const stars = new Map(), legs = [];
  let unplaced = 0, from = 0;
  const known = i => Number.isInteger(i) && i >= 0 && i < cat.count;
  const placed = i => known(i) && !cat.unmeasured[i];
  const seenUnplaced = new Set();
  for (let k = log.length - 1; k >= 0; k--) {
    const e = log[k], i = e?.star;
    if (!known(i)) continue;
    if (!placed(i)) {
      if (!seenUnplaced.has(i)) { seenUnplaced.add(i); unplaced++; }
      from = null; // where the ship was is lost: the next flight starts from nowhere the chart can draw
      continue;
    }
    if (!stars.has(i)) {
      const [gx, gy, gz] = galactic(cat.pos.subarray(i * 3, i * 3 + 3)).map(v => v * LY_PER_PC);
      stars.set(i, { star: i, x: gx, y: gy, z: gz, ly: Math.hypot(gx, gy, gz), visits: 0, last: k });
    }
    const s = stars.get(i);
    s.visits++;
    s.last = k;
    if (from != null && from !== i && placed(from)) legs.push([from, i]);
    from = i;
  }
  stars.delete(0); // home is the middle of the chart, drawn as the Sun
  const list = [...stars.values()];
  return { stars: list, legs, unplaced, reach: list.reduce((m, s) => Math.max(m, Math.hypot(s.x, s.y)), 0) };
}

// How far out the chart reaches: a power of ten, at least 1,000 light years, so its three rings (10, 100 and 1,000)
// are always there, and one more ring for each step past that the log goes.
export const chartEdge = reach => 10 ** Math.max(3, Math.ceil(Math.log10(Math.max(reach, 1) * 1.02)));
export const chartRings = edge => { const r = []; for (let d = 10; d <= edge; d *= 10) r.push(d); return r; };

// Distance out from the Sun on the chart, as a share of its radius. Each ring is ten times as far as the one inside
// it, so Proxima at 4 light years and Deneb at 1,400 both fit: equal steps out are equal multiples of distance.
export const chartRadius = (ly, edge) => Math.log10(1 + Math.max(0, ly)) / Math.log10(1 + edge);

// A star's place on a chart drawn `size` across round its middle, galactic centre up and Cygnus to the left, as seen
// from the north galactic pole: [x, y] from the top left.
export function chartXY(s, edge, size, pad = 0) {
  const R = size / 2 - pad, d = Math.hypot(s.x, s.y);
  if (!d) return [size / 2, size / 2];
  const r = chartRadius(d, edge) * R;
  return [size / 2 - (s.y / d) * r, size / 2 - (s.x / d) * r];
}

// The dot nearest a tap at (x, y), within `reach` of it, or null. `dots` are [{ x, y, ...}].
export function dotAt(dots, x, y, reach = 22) {
  let best = null, bd = reach;
  for (const d of dots) {
    const g = Math.hypot(d.x - x, d.y - y);
    if (g <= bd) { best = d; bd = g; }
  }
  return best;
}

// The line under the chart: "12 stars charted, the farthest Deneb, 1,400 light years out." `titleOf` names a star.
export function chartLine(chart, titleOf, formatLy) {
  const n = chart.stars.length;
  const far = chart.stars.reduce((a, s) => (!a || s.ly > a.ly ? s : a), null);
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'star' : 'stars'} charted${n > 1 ? `, the farthest ${titleOf(far.star)}, ${formatLy(far.ly)} out` : `: ${titleOf(far.star)}, ${formatLy(far.ly)} out`}.`);
  else parts.push('Nothing charted yet beyond home.');
  if (chart.unplaced) parts.push(`${chart.unplaced === 1 ? 'One star' : `${chart.unplaced} stars`} with no measured distance ${chart.unplaced === 1 ? 'is' : 'are'} left off: nobody knows where to draw ${chart.unplaced === 1 ? 'it' : 'them'}.`);
  return parts.join(' ');
}
