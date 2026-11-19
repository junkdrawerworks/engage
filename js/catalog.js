// Loads the stars: positions in parsecs from the Sun (x toward the March equinox, z toward the north celestial
// pole), how bright each really is, and the colour, temperature and size worked out from that.
import { LY_PER_PC, physical, starColor } from './physics.js';
import { DESTINATIONS } from './destinations.js';
import { ADDED, PLACED } from './deepsky.js';
import { constellationIn } from './astro.js';

const NOMINAL_PC = 1000;

export async function loadCatalog() {
  const [bin, meta] = await Promise.all([
    fetch('data/stars.bin').then(r => r.arrayBuffer()),
    fetch('data/stars.json').then(r => r.json()),
  ]);
  return buildCatalog(bin, meta);
}

// The catalogue from the two files' contents: data/stars.bin as an ArrayBuffer and data/stars.json parsed. (Apart
// from loadCatalog, so a test can make one without a server.)
export function buildCatalog(bin, meta) {
  // The catalogue's own stars, then the few the deep sky adds after them (js/deepsky.js), so every star the
  // catalogue has keeps its number.
  const own = new Float32Array(bin), base = own.length / 5;
  const raw = new Float32Array((base + ADDED.length) * 5);
  raw.set(own);
  ADDED.forEach((a, k) => {
    const r = a.ra * 15 * Math.PI / 180, d = a.dec * Math.PI / 180, pc = a.ly / LY_PER_PC;
    raw.set([pc * Math.cos(d) * Math.cos(r), pc * Math.cos(d) * Math.sin(r), pc * Math.sin(d), a.vmag - 5 * Math.log10(pc / 10), a.bv], (base + k) * 5);
  });
  const names = [...meta.names, ...ADDED.map(a => a.name)], spect = [...meta.spect, ...ADDED.map(a => a.spect)];
  // Stars the catalogue parks at its nominal distance that the deep sky has a measured one for (the Trapezium's, at
  // the Orion Nebula's) are moved out along their own line of sight, and made as bright as that distance says.
  for (const { name, ly } of PLACED) {
    names.forEach((nm, i) => {
      if (nm !== name) return;
      const x = raw[i * 5], y = raw[i * 5 + 1], z = raw[i * 5 + 2], d = Math.hypot(x, y, z);
      if (Math.abs(d - NOMINAL_PC) >= 0.01) return;
      const pc = ly / LY_PER_PC;
      raw.set([x / d * pc, y / d * pc, z / d * pc, raw[i * 5 + 3] + 5 * Math.log10(d / pc)], i * 5);
    });
  }
  const n = raw.length / 5;
  const pos = new Float64Array(n * 3);
  const absmag = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const radius = new Float32Array(n); // in solar radii
  const temp = new Float32Array(n);
  const lum = new Float32Array(n);
  // Stars the catalogue has no distance for. tools/build-data.py parks them at exactly 1,000 parsecs, as bright as
  // they look from Earth, so they can be drawn; nothing worked out from that distance is true of them.
  const unmeasured = new Uint8Array(n);
  // Stars the catalogue has no colour for. tools/build-data.py gives them a B-V of exactly 0.6, so they can be drawn;
  // their temperature, and so their colour, is that stand-in's (astrometrics leaves them off its wall).
  const nocolour = new Uint8Array(n);
  const STAND_IN = Math.fround(0.6);
  for (let i = 0; i < base; i++) if (raw[i * 5 + 4] === STAND_IN) nocolour[i] = 1;
  // Stars redder than a B-V of 2.0, mostly carbon stars and dust-reddened supergiants, where the colour-to-temperature
  // rule (js/physics.js) stops: they all get its reddest temperature, about 3,170 K, so it is only a floor for them
  // (astrometrics leaves them off its wall too, where they would stand in one false column).
  const offscale = new Uint8Array(n);
  for (let i = 0; i < base; i++) if (raw[i * 5 + 4] > 2.0) offscale[i] = 1;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = raw[i * 5]; pos[i * 3 + 1] = raw[i * 5 + 1]; pos[i * 3 + 2] = raw[i * 5 + 2];
    absmag[i] = raw[i * 5 + 3];
    if (Math.abs(Math.hypot(raw[i * 5], raw[i * 5 + 1], raw[i * 5 + 2]) - NOMINAL_PC) < 0.01) unmeasured[i] = 1;
    const p = physical(absmag[i], raw[i * 5 + 4]);
    temp[i] = p.temp; lum[i] = p.lum; radius[i] = p.radius;
  }
  const byName = new Map();
  names.forEach((name, i) => { if (!byName.has(name)) byName.set(name, i); });

  // The stars with notes use the measured values rather than the estimates.
  for (const d of DESTINATIONS) {
    const i = byName.get(d.star);
    if (i === undefined) continue;
    if (d.temp) { temp[i] = d.temp; lum[i] = d.lum; radius[i] = d.radius; offscale[i] = 0; }
  }
  for (let i = 0; i < n; i++) color.set(starColor(temp[i]), i * 3);

  return {
    count: n, pos, absmag, color, radius, temp, lum, unmeasured, nocolour, offscale,
    names, spect,
    constellations: meta.constellations, lines: meta.lines,
    byName,
    distanceFrom(i, p) {
      const dx = pos[i * 3] - p[0], dy = pos[i * 3 + 1] - p[1], dz = pos[i * 3 + 2] - p[2];
      return Math.hypot(dx, dy, dz);
    },
    // The constellation a direction falls in, by the IAU boundaries.
    constellationToward: dir => constellationIn(meta, dir),
  };
}

// Where to write each constellation's name on a sky map: one point per constellation, the mean direction of the
// stars its lines join, as [{ name, dir }] with `dir` a unit vector in the catalogue's axes. A line belongs to the
// constellation both its ends are in; where the ends differ (a figure can borrow a neighbour's star, as Auriga
// borrows Elnath from Taurus), to whichever of the two its middle is in. A long, winding figure's mean can land in
// a neighbour (Hydra's is in Sextans, and the two halves of Serpens average out in Hercules), so a point that falls
// outside its own constellation moves to the nearest star of its own figure.
export function constellationLabels(cat) {
  const unit = i => { const v = [cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]], l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const of = new Map(); // star -> constellation, looked up once each
  const at = i => { if (!of.has(i)) of.set(i, cat.constellationToward(unit(i))); return of.get(i); };
  const figures = new Map(); // name -> { sum, stars }
  for (const [a, b] of cat.lines) {
    const da = unit(a), db = unit(b);
    let name = at(a);
    if (name !== at(b)) {
      const mid = da.map((v, k) => v + db[k]), l = Math.hypot(...mid) || 1;
      const m = cat.constellationToward(mid.map(v => v / l));
      if (m !== name && m !== at(b)) continue;
      name = m;
    }
    if (!name) continue;
    const fig = figures.get(name) || figures.set(name, { sum: [0, 0, 0], stars: [] }).get(name);
    for (let k = 0; k < 3; k++) fig.sum[k] += da[k] + db[k];
    if (at(a) === name) fig.stars.push(da);
    if (at(b) === name) fig.stars.push(db);
  }
  return [...figures].map(([name, { sum, stars }]) => {
    const l = Math.hypot(...sum) || 1;
    let dir = sum.map(x => x / l);
    if (cat.constellationToward(dir) !== name) {
      const near = d => d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2];
      dir = stars.reduce((best, d) => (near(d) > near(best) ? d : best));
    }
    return { name, dir };
  });
}
