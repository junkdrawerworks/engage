// Astrometrics' second view, the neighbourhood: every catalogued star within 80 light years in its real place round
// the Sun, turned with a finger, the galaxy's disc drawn through the Sun with a line dropped from each named star to
// it, and the log's flights drawn in. Pure: js/neighbourhood-view.js draws what this works out. Checked by
// test/neighbourhood.test.mjs.
import { LY_PER_PC, roughLy } from './physics.js';
import { galactic } from './cartography.js';
import { CHARTS } from './charts.js';
import { DESTINATIONS } from './destinations.js';

// How far the neighbourhood reaches, and the rings drawn on its disc. 80 light years is as far as the catalogue
// holds every star it has; past it, only the ones bright enough to see from Earth (README, "Every star is real").
export const REACH = 80;
export const RINGS = [20, 40, 60, 80];

// A star's place in light years on the galaxy's axes (x toward the galactic centre, y toward Cygnus, z toward the
// north galactic pole), with its distance from the Sun.
export function placeOf(cat, i) {
  const [x, y, z] = galactic(cat.pos.subarray(i * 3, i * 3 + 3)).map(v => v * LY_PER_PC);
  return { star: i, x, y, z, ly: Math.hypot(x, y, z) };
}

// Every star within `reach` of the Sun, nearest first, home left out (it is the middle, drawn as the Sun). A star
// with no measured distance is never one: the catalogue parks those at a made-up 1,000 parsecs.
export function neighbourhood(cat, reach = REACH) {
  const stars = [];
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    if (Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC > reach) continue;
    stars.push(placeOf(cat, i));
  }
  return stars.sort((a, b) => a.ly - b.ly);
}

// The stars the map names: Starfleet's (Vulcan, Wolf 359, Tellar, by what Star Trek calls them, from js/charts.js),
// then the other stars with notes (Proxima Centauri, TRAPPIST-1...), nearest first. `starfleet` says which are which.
export function namedHere(cat, near) {
  const here = new Map(near.map(s => [s.star, s]));
  const out = new Map();
  for (const c of CHARTS) {
    const i = cat.byName.get(c.star);
    if (here.has(i)) out.set(i, { star: i, label: c.tag, starfleet: true });
  }
  for (const d of DESTINATIONS) {
    const i = cat.byName.get(d.star);
    if (here.has(i) && !out.has(i)) out.set(i, { star: i, label: d.title, starfleet: false });
  }
  return [...out.values()].sort((a, b) => here.get(a.star).ly - here.get(b.star).ly);
}

// How the map is turned: `yaw` round the galaxy's pole, `pitch` from looking straight down on the disc (0) to
// looking along it (a right angle), and `zoom`. It opens looking down at 30° to the disc from the rim's side, the
// galactic centre away up the screen, as the log's chart has it.
export const PITCH_MAX = Math.PI / 2, ZOOM_MIN = 1, ZOOM_MAX = 8;
export const FIRST_VIEW = Object.freeze({ yaw: 0, pitch: Math.PI / 3, zoom: 1 });
export function turned(view, dYaw = 0, dPitch = 0, zoomBy = 1) {
  const yaw = ((view.yaw + dYaw) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return {
    yaw,
    pitch: Math.min(PITCH_MAX, Math.max(0, view.pitch + dPitch)),
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * zoomBy)),
  };
}

// Where a place { x, y, z } (light years) lands on a picture `w` by `h`, seen straight on (no perspective, so the
// lines dropped to the disc stay upright and true to scale): [x, y] from the top left, and `depth`, larger nearer
// the eye. At the first zoom the 80-light-year ring just fits the picture's narrower side, less `pad`.
export function project(p, view, w, h, pad = 18) {
  const k = ((Math.min(w, h) / 2 - pad) / REACH) * view.zoom;
  const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
  const x1 = p.x * c - p.y * s, y1 = p.x * s + p.y * c;
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const right = -y1, up = x1 * cp + p.z * sp, depth = p.z * cp - x1 * sp;
  return [w / 2 + right * k, h / 2 - up * k, depth];
}

// A star's dot: bigger the brighter it really is (by absolute magnitude), and a little bigger zoomed in.
export const dotRadius = (absmag, zoom = 1) => Math.min(3.4, Math.max(0.6, 0.7 + (8 - absmag) * 0.18)) * Math.min(1.6, zoom ** 0.25);

// How far above or below the disc a place sits: "10 light years below the disc". The disc is the galaxy's plane,
// drawn through the Sun.
export function heightSaid(p) {
  const h = Math.abs(p.z);
  return h < 0.05 ? 'on the disc itself' : `${roughLy(h)} ${p.z > 0 ? 'above' : 'below'} the disc`;
}
// "16 light years from Sol, 10 light years below the disc", for the list of named stars.
export const placeSaid = p => (p.ly ? `${roughLy(p.ly)} from Sol, ${heightSaid(p)}` : 'Home: the disc is drawn through it');
// The line on a star's card: "10 light years below the disc." (the card already says how far away it is).
export const cardSaid = p => (p.ly ? `${heightSaid(p)[0].toUpperCase()}${heightSaid(p).slice(1)}${p.ly > REACH ? ', far beyond the neighbourhood’s 80 light years' : ''}.` : 'Home: the disc is drawn through it.');

// What there is still to do here: of `near`, how many the log has been to (`visited`, a Set of stars), of the named
// ones Starfleet's, how many; and the nearest star not yet visited, and the nearest of Starfleet's.
export function progress(near, named, visited) {
  const sf = named.filter(n => n.starfleet);
  return {
    total: near.length,
    been: near.filter(s => visited.has(s.star)).length,
    starfleet: sf.length,
    starfleetBeen: sf.filter(n => visited.has(n.star)).length,
    nearest: near.find(s => !visited.has(s.star)) || null,
    nearestStarfleet: sf.find(n => !visited.has(n.star)) || null,
  };
}

// The line under the map: "2,957 catalogued stars within 80 light years. You have been to 3 of them, and to 2 of
// the 16 that Starfleet's charts name."
export function progressLine(p) {
  const n = p.total.toLocaleString('en-US');
  const sf = p.starfleetBeen ? `, and to ${p.starfleetBeen === p.starfleet ? `all ${p.starfleet}` : `${p.starfleetBeen} of the ${p.starfleet}`} that Starfleet’s charts name` : '';
  if (!p.been) return `${n} catalogued stars within 80 light years. You haven’t been to any of them yet: the nearest is a short hop.`;
  if (p.been === p.total) return `${n} catalogued stars within 80 light years, and you have been to every one.`;
  return `${n} catalogued stars within 80 light years. You have been to ${p.been.toLocaleString('en-US')} of them${sf}.`;
}
