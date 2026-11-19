// Astrometrics: every star on one wall, hot to cool across and dim to bright up, the chart astronomers call the
// Hertzsprung-Russell diagram, where stars fall into families. Pure: js/astrometrics.js draws what this works out.
// Checked by test/hr.test.mjs.
import { LY_PER_PC, apparentMag } from './physics.js';

// The wall's edges: 50,000 K on the left to 2,000 K on the right, a hundred-thousandth of the Sun's light at the bottom to a
// million Suns at the top, both on a log scale. Each step across is the same ratio of temperature, each step up the
// same ratio of light.
export const T_HOT = 50000, T_COOL = 2000, L_DIM = 1e-5, L_BRIGHT = 1e6;
export const hrX = (temp, w) => (Math.log10(T_HOT) - Math.log10(temp)) / (Math.log10(T_HOT) - Math.log10(T_COOL)) * w;
export const hrY = (lum, h) => (Math.log10(L_BRIGHT) - Math.log10(lum)) / (Math.log10(L_BRIGHT) - Math.log10(L_DIM)) * h;
// A point off the wall's hot edge (the Sun's bare core, at 120,000 K) is drawn on the edge, pointing off it.
export const hrXClamped = (temp, w) => Math.max(0, Math.min(w, hrX(temp, w)));
export const onWall = (temp, lum) => temp >= T_COOL && temp <= T_HOT && lum >= L_DIM && lum <= L_BRIGHT;

// The main sequence, where a star spends most of its life burning hydrogen: [temperature (K), log of its light in
// Suns] along its middle, from the hottest O stars to the coolest red dwarfs. From the standard table of dwarf stars
// (Pecaut and Mamajek 2013, ApJS 208, 9, as kept up to date in Mamajek's "A Modern Mean Dwarf Stellar Color and
// Effective Temperature Sequence", read 19 November 2026).
export const MAIN_SEQUENCE = [
  [41400, 5.54], // O5V
  [31400, 4.65], // B0V
  [20600, 3.43], // B2V
  [15700, 2.77], // B5V
  [10700, 1.86], // B9V
  [9700, 1.58], // A0V
  [8100, 1.09], // A5V
  [7220, 0.86], // F0V
  [6550, 0.56], // F5V
  [5930, 0.13], // G0V
  [5770, 0.01], // G2V
  [5270, -0.34], // K0V
  [4440, -0.76], // K5V
  [3850, -1.16], // M0V
  [3430, -1.79], // M3V
  [3060, -2.52], // M5V
  [2570, -3.28], // M8V
];
// The light of a main-sequence star of temperature `temp`, by the table (log against log, straight between rows).
export function msLum(temp) {
  const t = Math.log10(temp), rows = MAIN_SEQUENCE.map(([a, b]) => [Math.log10(a), b]);
  if (t >= rows[0][0]) return 10 ** rows[0][1];
  for (let k = 1; k < rows.length; k++) {
    if (t >= rows[k][0]) {
      const [t0, l0] = rows[k - 1], [t1, l1] = rows[k];
      return 10 ** (l1 + (l0 - l1) * (t - t1) / (t0 - t1));
    }
  }
  return 10 ** rows[rows.length - 1][1];
}

// Which family a point on the wall belongs to, by how far above or below the main sequence it sits: 'dwarf' on it
// (within a factor of about six either side), 'giant' well above it, 'supergiant' far above (brighter than about
// 10,000 Suns and well off the sequence), 'white dwarf' a hundred times or more below it.
export function family(temp, lum) {
  const off = Math.log10(lum) - Math.log10(msLum(temp));
  if (off <= -2) return 'white dwarf';
  if (lum >= 1e4 && off >= 1) return 'supergiant';
  if (off >= 0.8) return 'giant';
  return 'dwarf';
}
export const FAMILY_NAMES = { dwarf: 'Main sequence', giant: 'Giants', supergiant: 'Supergiants', 'white dwarf': 'White dwarfs' };

// Which stars go on the wall. Three kinds can't: those the catalogue has no colour for (it gives them a stand-in, so
// they would all draw in one false stripe at one temperature), those too red for the colour-to-temperature rule
// (B-V past 2.0: they all get its reddest temperature, another false stripe) and those it has no distance for (so
// no true brightness). Home goes on as the Sun. `cat` needs `count`, `temp`, `lum`, `nocolour`, `offscale` and
// `unmeasured`.
export function wall(cat) {
  const stars = [];
  let noColour = 0, tooRed = 0, noDistance = 0, off = 0;
  for (let i = 0; i < cat.count; i++) {
    if (cat.nocolour[i]) { noColour++; continue; }
    if (cat.offscale[i]) { tooRed++; continue; }
    if (cat.unmeasured[i]) { noDistance++; continue; }
    if (!onWall(cat.temp[i], cat.lum[i])) { off++; continue; }
    stars.push(i);
  }
  return { stars, noColour, tooRed, noDistance, off };
}

// The filters, each a lesson. `visited` is a Set of the stars in the log.
export const FILTERS = [
  { id: 'all', name: 'Every star' },
  { id: 'eye', name: 'Naked eye' },
  { id: 'near', name: 'Within 80 ly' },
  { id: 'visited', name: 'Visited' },
];
const lyOf = (cat, i) => Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
export function passes(cat, i, filter, visited = new Set()) {
  if (filter === 'eye') return i === 0 || apparentMag(cat.absmag[i], lyOf(cat, i) / LY_PER_PC) <= 6;
  if (filter === 'near') return lyOf(cat, i) <= 80;
  if (filter === 'visited') return i === 0 || visited.has(i);
  return true;
}

// How a set of stars divides: { n, dwarf, giant, supergiant, 'white dwarf', red, hot }, where `red` counts the red
// dwarfs (main sequence, cooler than 3,900 K) and `hot` the main-sequence stars hotter than the Sun's 6,000 K.
export function census(cat, stars) {
  const c = { n: stars.length, dwarf: 0, giant: 0, supergiant: 0, 'white dwarf': 0, red: 0, hot: 0 };
  for (const i of stars) {
    const f = family(cat.temp[i], cat.lum[i]);
    c[f]++;
    if (f === 'dwarf' && cat.temp[i] < 3900) c.red++;
    if (f === 'dwarf' && cat.temp[i] > 6000) c.hot++;
  }
  return c;
}
const pct = (a, n) => `${Math.round((100 * a) / Math.max(n, 1))}%`;

// The line under the wall for a filter: what its stars show.
export function lesson(filter, c) {
  const n = c.n.toLocaleString('en-US');
  if (filter === 'eye') return `${n} stars you can see without a telescope. ${pct(c.giant + c.supergiant + c.hot, c.n)} of them are giants, supergiants or main-sequence stars hotter than the Sun: they are the ones bright enough to see from far away. ${c.red ? `Only ${pct(c.red, c.n) === '0%' ? 'a handful' : pct(c.red, c.n)} are red dwarfs.` : 'Not one is a red dwarf.'}`;
  if (filter === 'near') return `${n} stars within 80 light years, the neighbourhood the catalogue knows best. ${pct(c.red, c.n)} of them are red dwarfs, too faint to see by eye, and only ${pct(c.giant + c.supergiant, c.n)} are giants: close to, most stars are small and dim. The catalogue is still missing red dwarfs too faint to have been found.`;
  if (filter === 'visited') {
    if (c.n < 2) return 'Nothing in your log yet but home. Fly somewhere, and it lands here.';
    const big = c.giant + c.supergiant, wd = c['white dwarf'];
    return `${n} stars in your log, home among them: ${[c.dwarf && `${c.dwarf} on the main sequence`, big && `${big} ${big === 1 ? 'giant or supergiant' : 'giants or supergiants'}`, wd && `${wd} white ${wd === 1 ? 'dwarf' : 'dwarfs'}`].filter(Boolean).join(', ')}.`;
  }
  return `${n} stars, each in its own colour. Most lie on the main sequence, the band from hot and bright at top left to cool and dim at bottom right, where stars spend most of their lives. Above it are the giants and supergiants; below, the white dwarfs.`;
}

// The Sun's life along the wall, from Sackmann, Boothroyd and Kraemer 1993, "Our Sun. III. Present and Future",
// ApJ 418, 457 (the stages as Richard Pogge's Ohio State course notes table them): its age (billions of years),
// temperature (K) and light (Suns). The last stage, a white dwarf, is drawn where 40 Eridani B sits now: a white
// dwarf of about the mass the Sun will leave behind (0.54 of the Sun's, by the paper).
export const SUN_LIFE = [
  { age: 0, temp: 5586, lum: 0.70, said: 'Settled onto the main sequence 4.5 billion years ago, 70% as bright as today.' },
  { age: 4.55, temp: 5772, lum: 1, said: 'Today, 4.6 billion years old, not yet halfway through the hydrogen at its heart.' },
  { age: 10.9, temp: 5517, lum: 2.21, said: '10.9 billion years: the hydrogen at its heart runs out, and it is twice as bright as today.' },
  { age: 12.15, temp: 4902, lum: 2.2, said: '12.15 billion years: a subgiant, swelling and cooling.' },
  { age: 12.233, temp: 3107, lum: 2350, said: '12.23 billion years: a red giant 166 times as wide as today, out past where Venus circles now, and 2,350 times as bright.' },
  { age: 12.234, temp: 4724, lum: 41, said: 'Then the helium at its heart catches fire, and it settles down, smaller, for about 100 million years.' },
  { age: 12.365, temp: 3160, lum: 3000, said: '12.37 billion years: a red giant again, 180 times as wide as today and brighter than before, shedding its outer layers.' },
  { age: 12.37, temp: 120000, lum: 3500, off: true, said: 'Its outer layers drift off as a glowing nebula, like the Ring Nebula, and the bare core blazes at 120,000 K.' },
  { age: null, star: 'Gliese 166B', said: 'What is left is a white dwarf about the size of the Earth, cooling for billions of years, as 40 Eridani B, beside Vulcan’s sun, is doing now.' },
];
