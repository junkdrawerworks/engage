// Writes the captain's log entry for an arrival: the star, its planets and notes, how home looks from here,
// and how the trip compares with light and with Voyager 1.
import {
  LY_PER_PC, apparentMag, formatDuration, formatLy, formatYear, spectral, stardate, tripYears, voyagerYears, SUN_ABSMAG,
} from './physics.js';
import { ANCHORS, DESTINATIONS } from './destinations.js';
import { chartFor } from './charts.js';

const NOTES = new Map(DESTINATIONS.map(d => [d.star, d]));
const COLOUR = { O: 'Blue', B: 'Blue-white', A: 'White', F: 'Yellow-white', G: 'Yellow', K: 'Orange', M: 'Red' };

export const notesFor = (cat, i) => NOTES.get(cat.names[i]) || null;
export const titleFor = (cat, i) => notesFor(cat, i)?.title || cat.names[i];
// The title in the middle of a sentence: "at the Pleiades", where a heading or a list says "The Pleiades".
export const inTextFor = (cat, i) => notesFor(cat, i)?.inText || titleFor(cat, i);

const SIZE = { Ia0: 'hypergiant', Iab: 'supergiant', Ia: 'supergiant', Ib: 'supergiant', I: 'supergiant', II: 'bright giant', III: 'giant', IV: 'subgiant' };

// "Orange giant, spectral type K2III", from the catalogue's spectral type, or from the colour if it has none.
// `absmag` is how bright the star really is, where that is known: a yellow, orange or red star whose type doesn't
// say giant or dwarf (Mira's "M5e-M9e") is a giant if it is as bright as one, and a dwarf if it's as faint as one.
// Without it, such a star is called a dwarf, as nearly all of them are.
// For a star whose distance isn't known, pass null: its size is then left unsaid ("Orange star").
export function describeKind(spect, temp, absmag) {
  const s = (spect || '').trim();
  const type = s ? `, spectral type ${s}` : '';
  const { letter: read, lum, special } = spectral(s);
  if (special === 'white dwarf') return `White dwarf${type}`;
  if (special === 'wolf-rayet') return `Wolf-Rayet star${type}`;
  if (special === 'carbon') return `Carbon star${type}`;
  if (special === 'S' && absmag !== null && absmag < GIANT_ABSMAG) return `Red giant${type}`;
  const letter = read || (temp > 30000 ? 'O' : temp > 10000 ? 'B' : temp > 7500 ? 'A' : temp > 6000 ? 'F' : temp > 5200 ? 'G' : temp > 3700 ? 'K' : 'M');
  let size;
  if (special === 'subdwarf') size = 'subdwarf';
  else if (SIZE[lum]) size = SIZE[lum];
  else if (!'GKM'.includes(letter) || (s && !read)) size = 'star'; // a type that names no class ("pec") says nothing of size
  else if (!lum && absmag === null) size = 'star';
  else size = lum ? 'dwarf' : absmag < GIANT_ABSMAG ? 'giant' : absmag < DWARF_ABSMAG ? 'subgiant' : 'dwarf';
  return `${COLOUR[letter]} ${size}${type}`;
}
// Yellow, orange and red giants are brighter than about absolute magnitude +2 (a K0 giant is about +0.7). The
// brightest dwarfs of those colours, the early G stars, are about +4.4, and orange and red dwarfs are fainter than
// +5.5. A star in between has left the dwarfs but isn't a giant yet.
const GIANT_ABSMAG = 2, DWARF_ABSMAG = 3.5;

// "5.2 times the Sun's width". With `rough`, for a figure worked out from the catalogue rather than measured, a big
// number keeps only two figures: 24,000 times, not 24,445.
function ratio(x, what, rough = false) {
  if (x < 0.995) {
    const pct = x * 100;
    return `${pct < 1 ? pct.toPrecision(2) : Math.round(pct)}% of the Sun’s ${what}`;
  }
  if (x < 1.05) return `about the Sun’s ${what}`;
  const r = x < 10 ? x.toFixed(1).replace(/\.0$/, '') : (rough && x >= 100 ? Number(x.toPrecision(2)) : Math.round(x)).toLocaleString('en-US');
  return `${r} times the Sun’s ${what}`;
}

// How home looks from `cam` (parsecs from the Sun): the Sun's brightness and place, and Earth's old light.
// `year` is the date as a year and the fraction of it gone (the stardate's number), so that in November light that
// left 8.6 years ago left in 2018, not 2017.
// With `nominal`, `cam` is at a star whose distance isn't known: only the direction home is true, so that is all
// it says. (Such a star is too far for its distance to have been measured, and the Sun is lost to the eye by 60 ly.)
export function homeLines(cat, cam, year = Number(stardate()), skip = -1, nominal = false) {
  const pc = Math.hypot(...cam);
  const ly = pc * LY_PER_PC;
  const m = apparentMag(SUN_ABSMAG, pc);
  const con = cat.constellationToward(cam.map(v => -v / pc));
  if (nominal) {
    return [
      `The Sun is too faint to see without a telescope from here, in the part of the sky where Earth sees ${con}, though nothing around it would look familiar.`,
      'Without a measured distance, there’s no saying which year of Earth’s past is on show here, or when its first broadcasts will arrive.',
    ];
  }
  let rank = 1;
  for (let i = 1; i < cat.count; i++) {
    if (i === skip) continue;
    const d = cat.distanceFrom(i, cam);
    if (d > 0.01 && apparentMag(cat.absmag[i], d) < m) rank++;
  }
  const lines = [];
  const where = pc < 60 ? `in ${con}` : `in the part of the sky where Earth sees ${con}, though nothing around it would look familiar`;
  if (m < 6.5) {
    const place = rank <= 30 ? `, the ${ordinal(rank)} brightest star in this sky,` : '';
    lines.push(`The Sun is a magnitude ${m.toFixed(1)} star${place} ${where}.`);
  } else {
    lines.push(`The Sun is too faint to see without a telescope from here (magnitude ${m.toFixed(1)}), ${where}.`);
  }
  const seen = year - ly;
  // "Around when" means within a couple of years, or a decade for the sparser moments before 1500.
  const anchor = ANCHORS.find(([y]) => Math.abs(y - Math.round(seen)) <= (seen < 1500 ? 10 : 2));
  lines.push(`With a big enough telescope, someone here would see Earth as it was in ${formatYear(seen)}${anchor ? `, around when ${anchor[1]}` : ''}.`);
  const tv = 1936 + ly;
  lines.push(tv <= year
    ? `Earth’s radio and TV signals, leaking out since the 1930s, first passed here around ${formatYear(tv)}.`
    : `Earth’s first TV broadcasts, from 1936, won’t reach here until ${formatYear(tv)}.`);
  return lines;
}

// With `nominal`, one end of the trip is a star whose distance isn't known, so the trip is as long as the charts say.
export function tripLine(ly, warp, fromTitle, nominal = false) {
  const t = tripYears(ly, warp);
  const w = Number(warp).toFixed(1).replace(/\.0$/, '');
  return `${nominal ? 'By the charts’ nominal distance, ' : ''}${formatLy(ly)} from ${fromTitle} in ${formatDuration(t)} at warp ${w}. Light needs ${formatDuration(ly)} to cover that; Voyager 1 would need ${formatDuration(voyagerYears(ly))}.`;
}

// The full entry, as plain data so it can be kept in the log.
// `nominal` says the trip started from a star whose distance isn't known.
export function composeEntry(cat, i, { cam, holdAU, warp, fromTitle, tripLy, nominal = false, date = new Date() }) {
  const notes = notesFor(cat, i);
  const title = titleFor(cat, i);
  const fromSol = Math.hypot(...cat.pos.subarray(i * 3, i * 3 + 3)) * LY_PER_PC;
  const hold = notes?.hold?.label || `holding ${holdAU < 10 ? holdAU.toFixed(2) : Math.round(holdAU)} AU from the star`;
  const unmeasured = !!cat.unmeasured[i];
  const intro = i === 0
    ? `Back home, ${hold}.`
    : unmeasured
      ? `We’ve dropped out of warp at ${inTextFor(cat, i)} and are ${hold}. The catalogue has no measured distance for this star, so the charts place it at a nominal ${formatLy(fromSol)}.`
      : `We’ve dropped out of warp at ${inTextFor(cat, i)}, ${formatLy(fromSol)} from Sol, and are ${hold}.`;
  const sections = [];
  const kind = notes?.kind || describeKind(cat.spect[i], cat.temp[i], unmeasured ? null : cat.absmag[i]);
  const approx = notes ? '' : 'about ';
  const temp = `${(Math.round(cat.temp[i] / 10) * 10).toLocaleString('en-US')} K at the surface`;
  sections.push(['The star', i === 0
    ? `${kind}. ${temp}.`
    : unmeasured ? `${kind}. ${temp}. Its width and brightness can’t be worked out without its distance.`
    : `${kind}. ${temp}, ${approx}${ratio(cat.radius[i], 'width', !notes)}, and ${approx}${ratio(cat.lum[i], 'brightness', !notes).replace(/^about /, '')}.`]);
  if (notes?.planets) sections.push(['Planets', notes.planets]);
  for (const n of notes?.notes || []) sections.push(['', n]);
  if (notes?.fiction) sections.push(['In fiction', notes.fiction]);
  // What Star Trek put here, in the words tonight's sky uses for the same star.
  const chart = chartFor(cat.names[i]);
  if (chart) sections.push(['Starfleet charts', chart.log || chart.line]);
  if (i !== 0) sections.push(['Looking home', homeLines(cat, cam, Number(stardate(date)), i, unmeasured).join(' ')]);
  if (tripLy > 0) sections.push(['The trip', tripLine(tripLy, warp, fromTitle, unmeasured || nominal)]);
  return { star: i, title, stardate: stardate(date), intro, sections, ly: tripLy || 0 };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
