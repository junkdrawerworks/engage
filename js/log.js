// Writes the captain's log entry for an arrival: the star, its planets and notes, the sky around it, how home looks
// from here, and how the trip compares with light and with Voyager 1.
import {
  LY_PER_PC, apparentMag, formatDuration, formatLy, formatYear, spectral, stardate, tripYears, voyagerYears, SUN_ABSMAG,
} from './physics.js';
import { ANCHORS, DESTINATIONS } from './destinations.js';
import { chartFor } from './charts.js';
import { byId as shipById } from './ships.js';
import { lifeLine, reachLine, temperateLine } from './lives.js';
import { nowLine, variableFor } from './variables.js';

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
  const { letter, size, special } = kindOf(s, temp, absmag);
  if (special === 'white dwarf') return `White dwarf${type}`;
  if (special === 'wolf-rayet') return `Wolf-Rayet star${type}`;
  if (special === 'carbon') return `Carbon star${type}`;
  return `${COLOUR[letter]} ${size}${type}`;
}

// The same reading as plain data: `letter` (O to M), `size` ('dwarf', 'subgiant', 'giant', 'bright giant',
// 'supergiant', 'hypergiant', 'subdwarf', or 'star' where nothing says), and `special` for the kinds the letters
// don't cover (white dwarf, Wolf-Rayet, carbon), as spectral() gives it.
export function kindOf(spect, temp, absmag) {
  const s = (spect || '').trim();
  const { letter: read, lum, special } = spectral(s);
  if (special === 'white dwarf' || special === 'wolf-rayet' || special === 'carbon') return { letter: null, size: null, special };
  if (special === 'S' && absmag !== null && absmag < GIANT_ABSMAG) return { letter: 'M', size: 'giant', special };
  const letter = read || (temp > 30000 ? 'O' : temp > 10000 ? 'B' : temp > 7500 ? 'A' : temp > 6000 ? 'F' : temp > 5200 ? 'G' : temp > 3700 ? 'K' : 'M');
  let size;
  if (special === 'subdwarf') size = 'subdwarf';
  else if (SIZE[lum]) size = SIZE[lum];
  else if (!'GKM'.includes(letter) || (s && !read)) size = 'star'; // a type that names no class ("pec") says nothing of size
  else if (!lum && absmag === null) size = 'star';
  else size = lum ? 'dwarf' : absmag < GIANT_ABSMAG ? 'giant' : absmag < DWARF_ABSMAG ? 'subgiant' : 'dwarf';
  return { letter, size, special };
}
const GIANTS = ['giant', 'bright giant', 'supergiant', 'hypergiant'];
// Whether kindOf's giant is a slip in the catalogue: a class that says giant on a star as faint as a dwarf. The log
// names a star by its class, but Guniibuu (36 Ophiuchi), an orange dwarf 19 light years away, is listed K2:III: at
// absolute magnitude 5.5, and HIP 58910 a supergiant at 8.9. Nothing that rests on its being big (how far it would
// reach, a place in the computer's list of giants) is said of one.
export const giantSlip = (size, absmag) => GIANTS.includes(size) && absmag > DWARF_ABSMAG;
// The surface temperatures each class spans, in kelvin, with a tenth to spare either side. A star whose colour on the
// charts gives a temperature far outside its class (Mira, a red giant whose colour reads as an orange star's) has
// had its brightness and width worked out from the wrong colour, and the log says nothing more that rests on them.
const CLASS_TEMPS = { O: [25000, 60000], B: [9700, 31000], A: [7200, 10500], F: [5900, 7500], G: [5200, 6100], K: [3800, 5400], M: [2300, 4000] };
const fits = (letter, temp) => !CLASS_TEMPS[letter] || (temp > CLASS_TEMPS[letter][0] * 0.9 && temp < CLASS_TEMPS[letter][1] * 1.1);
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
  const seen = earthYear(cam, year);
  const moment = momentFor(seen);
  lines.push(`With a big enough telescope, someone here would see Earth as it was in ${formatYear(seen)}${moment ? `, ${moment.gap ? 'around when' : 'the year'} ${moment.text}` : ''}.`);
  const tv = 1936 + ly;
  lines.push(tv <= year
    ? `Earth’s radio and TV signals, leaking out since the 1930s, first passed here around ${formatYear(tv)}.`
    : `Earth’s first TV broadcasts, from 1936, won’t reach here until ${formatYear(tv)}.`);
  return lines;
}

// ---------- The sky from here ----------

// The catalogue holds every catalogued star within about 80 light years of the Sun (25 parsecs: tools/build-data.py)
// and, beyond that, only the stars of magnitude 7 or brighter from Earth. So what it can say for certain about the
// sky somewhere else depends on where: inside that sphere it knows every neighbour, and outside it knows almost none.
const COMPLETE_LY = 80, CHART_MAG = 7;
// Two stars the catalogue lists this close together (light years) are one system, whatever it says of the gap: the
// two of a pair are often measured separately, and come out some way apart (40 Eridani A and C are 0.19 ly apart on
// the charts and 400 AU apart in fact). Unrelated stars are hardly ever this close: around the Sun there is about one
// star to every 250 cubic light years. Proxima, 0.19 ly from Alpha Centauri, is one of that system too.
const COMPANION_LY = 0.5;
// Out to a light year the odds are still about nine to one that a neighbour is the star's own companion, misplaced
// (Capella's is listed 0.6 ly from it), so the log gives the distance and says so.
const PERHAPS_LY = 1;
// Two with one name, or one name and a letter each (Gliese 60A and 60B), are a pair even when their two measured
// distances put them light years apart: the catalogue has dozens like that. Past ten, it's left as the charts have it.
const PAIR_LY = 10;
const stem = name => name.replace(/\s?[A-D]$/, '');
// Past this many light years from the Sun the catalogue has almost none of a star's real neighbours, the viewscreen's
// sky is visibly sparse, and the log says why. (Stars brighter than magnitude 6 that it can draw: 4,939 from the Sun,
// 3,316 from the Pleiades at 400 ly, 872 from Deneb at 1,400.)
export const THIN_LY = 250;

const place = (cat, i) => cat.pos.subarray(i * 3, i * 3 + 3);

// Whether stars i and j are one system, by the catalogue: listed at the same place, or near enough.
export function companions(cat, i, j) {
  if (i === j || cat.unmeasured[i] || cat.unmeasured[j]) return false;
  const ly = cat.distanceFrom(j, place(cat, i)) * LY_PER_PC;
  return ly < COMPANION_LY || (ly < PAIR_LY && stem(cat.names[i]) === stem(cat.names[j]));
}

// The `n` stars nearest a place (`from`, parsecs from the Sun), nearest first, as [{ star, ly }]. `skip` is a star
// to leave out (the one the ship is at). Stars with no measured distance are left out: nobody knows where they are.
export function nearestStars(cat, from, n = 5, skip = -1) {
  const best = [];
  for (let j = 0; j < cat.count; j++) {
    if (j === skip || cat.unmeasured[j]) continue;
    const d = cat.distanceFrom(j, from);
    if (best.length === n && d >= best[n - 1].d) continue;
    let k = best.length;
    while (k > 0 && best[k - 1].d > d) k--;
    best.splice(k, 0, { star: j, d });
    if (best.length > n) best.pop();
  }
  return best.map(({ star, d }) => ({ star, ly: d * LY_PER_PC }));
}

// What is around star i, for a ship holding there: the brightest star in its sky and the nearest one, with the
// star's own companions set aside (from Sirius the nearest star on the charts is Sirius B, at no distance at all).
// `sure` says whether the catalogue can know it:
//   the nearest, when the whole sphere out to it lies inside the 80 light years where every star is catalogued;
//   the brightest, when no star left out of the catalogue could outshine it from here. A star left out is fainter
//   than magnitude 7 from Earth and more than 80 ly from the Sun, so from a ship D ly out it is at best
//   7 + 5 log10(1 - D/80).
// Returns null at the Sun, and at a star whose own distance was never measured.
export function skyFrom(cat, i) {
  if (i === 0 || cat.unmeasured[i]) return null;
  const from = place(cat, i);
  const fromSol = Math.hypot(...from) * LY_PER_PC;
  const mates = [];
  let brightest = null, nearest = null;
  for (let j = 0; j < cat.count; j++) {
    if (j === i || cat.unmeasured[j]) continue;
    if (companions(cat, i, j)) { mates.push(j); continue; }
    const d = cat.distanceFrom(j, from);
    const mag = apparentMag(cat.absmag[j], d);
    if (!brightest || mag < brightest.mag) brightest = { star: j, mag };
    if (!nearest || d < nearest.d) nearest = { star: j, d };
  }
  const inside = fromSol < COMPLETE_LY;
  return {
    companions: mates,
    brightest: { ...brightest, sure: inside && brightest.mag < CHART_MAG + 5 * Math.log10(1 - fromSol / COMPLETE_LY) },
    nearest: { star: nearest.star, ly: nearest.d * LY_PER_PC, sure: fromSol + nearest.d * LY_PER_PC < COMPLETE_LY },
    thin: fromSol > THIN_LY,
  };
}

// The log's words for it. "The brightest star in this sky is Arcturus, magnitude −1.2. The nearest is Gliese 452.1,
// 3.6 light years away." Where the catalogue can't be sure, it is "on the charts".
export function skyLine(cat, i, sky = skyFrom(cat, i)) {
  if (!sky) return '';
  const name = j => (j === 0 ? 'the Sun' : titleFor(cat, j));
  const { brightest: b, nearest: n, companions: mates } = sky;
  const mag = `magnitude ${b.mag.toFixed(1).replace(/^-0\.0$/, '0.0').replace('-', '−')}`;
  const away = `${n.ly < 9.95 ? n.ly.toFixed(1) : Math.round(n.ly).toLocaleString('en-US')} light years away`;
  // A companion with the star's own name (the two of 61 Cygni) is just "its companion".
  const named = mates.map(name).filter(t => t !== titleFor(cat, i));
  const apart = !mates.length ? ''
    : mates.length === 1 ? `Apart from its companion${named.length ? ` ${named[0]}` : ''}, `
    : mates.length === 2 && named.length === 2 ? `Apart from its companions ${named[0]} and ${named[1]}, `
    : `Apart from its ${mates.length} companions, `;
  const cap = t => (apart ? apart + t : t[0].toUpperCase() + t.slice(1));
  let text;
  if (b.sure && n.sure) {
    text = b.star === n.star
      ? cap(`the brightest star in this sky is ${name(b.star)}, ${mag}, which is also the nearest, ${away}.`)
      : cap(`the brightest star in this sky is ${name(b.star)}, ${mag}.`) + ` The nearest is ${name(n.star)}, ${away}.`;
  } else if (!b.sure && !n.sure) {
    text = (apart ? `${apart}and going by the charts, ` : 'On the charts, ') + (b.star === n.star
      ? `the brightest star in this sky is ${name(b.star)}, ${mag}, which is also the nearest, ${away}.`
      : `the brightest star in this sky is ${name(b.star)}, ${mag}, and the nearest is ${name(n.star)}, ${away}.`);
  } else {
    text = cap(`the brightest star ${b.sure ? 'in this sky' : 'on the charts here'} is ${name(b.star)}, ${mag}.`)
      + ` The nearest${n.sure ? '' : ' star on the charts'} is ${name(n.star)}, ${away}.`;
  }
  if (n.ly < PERHAPS_LY) text += ' At that distance the two are probably one system.';
  // Not "thousands more": that is true beside Deneb, but at the Pleiades about 1,600 are missing, and far above the
  // galaxy's disc the real sky is thin too.
  if (sky.thin) text += ' The charts are thin this far out. They hold only the stars bright enough to see from Earth, so the real sky here has far more than the viewscreen shows.';
  return text;
}

// The calendar year of Earth on show from `cam` (parsecs from the Sun) at `year`, the date as a year and the fraction
// of it gone: the year the light left in. Light that set out in the middle of 2017 shows 2017, not the nearer 2018.
export const earthYear = (cam, year) => Math.floor(year - Math.hypot(...cam) * LY_PER_PC);

// The moment in Earth's history to name beside a year, or null: { year, text, gap, ship }. From 1900 on a moment is
// named only for its own year, so "the year Voyager 2 flew past Uranus" is exact (the log once had Wolf 359 seeing
// 2019, "around when the James Webb Space Telescope launched", two years early). Before 1900 the moments are
// sparse, and one is named up to two years either side of its own, or ten before 1500: `gap` is how many years
// off, and the log then says "around when". Of two in reach, the nearer. `ship` is the id of the long mission whose
// moment it is, or null.
export function momentFor(seen) {
  let best = null;
  for (const [year, text, ship] of ANCHORS) {
    const gap = Math.abs(year - seen);
    if (gap > (year >= 1900 ? 0 : year >= 1500 ? 2 : 10)) continue;
    if (!best || gap < best.gap) best = { year, text, gap, ship: ship || null };
  }
  return best;
}

// With `nominal`, one end of the trip is a star whose distance isn't known, so the trip is as long as the charts say.
export function tripLine(ly, warp, fromTitle, nominal = false) {
  const t = tripYears(ly, warp);
  const w = Number(warp).toFixed(1).replace(/\.0$/, '');
  return `${nominal ? 'By the charts’ nominal distance, ' : ''}${formatLy(ly)} from ${fromTitle} in ${formatDuration(t)} at warp ${w}. Light needs ${formatDuration(ly)} to cover that; Voyager 1 would need ${formatDuration(voyagerYears(ly))}.`;
}

// A moment and a day as the log writes them, in the device's own time: "Sat 21 Nov, 3:15 am", "21 Nov".
const daySaid = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const momentSaid = t => `${new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(t).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toLowerCase()}`;

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
  // How big a giant really is: how far it would reach in the Sun's place. The readings below rest on the star's
  // width and brightness, which for a star with notes were measured, and otherwise come from the catalogue.
  const { letter, size, special } = kindOf(cat.spect[i], cat.temp[i], unmeasured ? null : cat.absmag[i]);
  const sound = i !== 0 && !unmeasured && special !== 'white dwarf' && (notes || fits(letter, cat.temp[i]));
  const reach = sound && GIANTS.includes(size) && !giantSlip(size, cat.absmag[i]) ? ` ${reachLine(cat.radius[i])}` : '';
  sections.push(['The star', i === 0
    ? `${kind}. ${temp}.`
    : unmeasured ? `${kind}. ${temp}. Its width and brightness can’t be worked out without its distance.`
    : `${kind}. ${temp}, ${approx}${ratio(cat.radius[i], 'width', !notes).replace(approx ? /^about / : /^(?!)/, '')}, and ${approx}${ratio(cat.lum[i], 'brightness', !notes).replace(/^about /, '')}.${reach}`]);
  if (notes?.planets) sections.push(['Planets', notes.planets]);
  for (const n of notes?.notes || []) sections.push(['', n]);
  // A star that behaves: where it is in its cycle, as Earth sees it on the day of the entry.
  const variable = variableFor(cat.names[i]);
  if (variable) sections.push(['Right now', nowLine(variable, date.getTime(), { when: momentSaid, day: daySaid, fromEarth: true })]);
  // After the planets there really are: where a planet would be as warm as Earth, and, for an ordinary star with no
  // notes, its mass, life and end. Ordinary means a main-sequence star, luminosity class V, or a yellow, orange or
  // red one as faint as a dwarf: the mass rule is only for those (on a giant it makes Arcturus four times too
  // heavy). A white dwarf has no such orbit worth the name, and the stars with notes tell their own story.
  if (sound) sections.push(['A temperate orbit', temperateLine(cat.lum[i], cat.radius[i])]);
  const ordinary = size === 'dwarf' || (size === 'star' && spectral(cat.spect[i]).lum === 'V');
  if (sound && !notes && ordinary) sections.push(['Its life', lifeLine(cat.lum[i])]);
  if (notes?.fiction) sections.push(['In fiction', notes.fiction]);
  // What Star Trek put here, in the words tonight's sky uses for the same star.
  const chart = chartFor(cat.names[i]);
  if (chart) sections.push(['Starfleet charts', chart.log || chart.line]);
  // What is around the ship. `near` is the nearest star, kept with the entry so it can offer a course there.
  const sky = skyFrom(cat, i);
  if (sky) sections.push(['The sky from here', skyLine(cat, i, sky)]);
  if (i !== 0) sections.push(['Looking home', homeLines(cat, cam, Number(stardate(date)), i, unmeasured).join(' ')]);
  if (tripLy > 0) sections.push(['The trip', tripLine(tripLy, warp, fromTitle, unmeasured || nominal)]);
  // When the year of Earth on show is one of a long mission's own, the entry keeps the ship, to link to her file.
  const ship = i !== 0 && !unmeasured ? shipById(momentFor(earthYear(cam, Number(stardate(date))))?.ship) : null;
  return {
    star: i, title, stardate: stardate(date), intro, sections, ly: tripLy || 0,
    ...(sky ? { near: sky.nearest.star } : {}), ...(ship ? { ship: { id: ship.id, name: ship.name } } : {}),
  };
}

// The records the captain's log can show, worked out from the entries themselves (newest first, as the log keeps
// them): nothing more is stored. `lyFromSol(star)` is how far a star is from the Sun in light years, or null when
// its distance was never measured; `charted` lists the stars with notes, the destinations in Set course.
// Each record is null until the log has one to show. A trip to or from a star with no measured distance is only as
// long as the charts' guess, so it holds no record; the most-visited star needs a second visit.
export function logRecords(log, { lyFromSol, charted }) {
  let farthest = null, longest = null, most = null;
  const visits = new Map();
  const measured = star => star === 0 || lyFromSol(star) !== null;
  log.forEach((e, k) => {
    const far = e.star === 0 ? null : lyFromSol(e.star);
    if (far !== null && (!farthest || far > farthest.ly)) farthest = { title: e.title, ly: far };
    const from = log[k + 1]?.star ?? 0;
    // The way home counts as a trip like any other: Sol's place is known.
    if (e.ly > 0 && measured(e.star) && measured(from) && (!longest || e.ly > longest.ly)) longest = { title: e.title, ly: e.ly };
    const v = visits.get(e.star) || { title: e.title, n: 0 };
    v.n++;
    visits.set(e.star, v);
  });
  // Of two stars visited as often, the one visited most recently: a Map keeps its keys in the order they first came.
  for (const v of visits.values()) if (v.n > 1 && (!most || v.n > most.n)) most = v;
  return { farthest, longest, most, charted: { n: charted.filter(i => visits.has(i)).length, of: charted.length } };
}

// The kinds of star the log has been to, from the stars in its entries and the catalogue's spectral types: nothing
// more is stored. `spectOf(star)` is a star's type as the catalogue writes it ("M2Ib", "DA2", "" for none).
// `letters` is the seven classes in order, each with whether one has been visited; `n` of `of` is the count; `rare`
// lists the kinds the letters don't tell apart, once one has been seen, by the names the log itself uses for them:
// a red supergiant (class M, luminosity class I), a white dwarf, a carbon star, a Wolf-Rayet star. A white dwarf or
// a carbon star has no letter of the seven, and a star with no type on the charts counts for nothing.
const CLASSES = 'OBAFGKM';
const RARE = ['red supergiant', 'white dwarf', 'carbon star', 'Wolf-Rayet star'];
export function starKinds(log, spectOf) {
  const seen = new Set(), rare = new Set();
  for (const star of new Set(log.map(e => e.star))) {
    const { letter, lum, special } = spectral(spectOf(star));
    if (letter) seen.add(letter);
    if (special === 'white dwarf') rare.add('white dwarf');
    else if (special === 'carbon') rare.add('carbon star');
    else if (special === 'wolf-rayet') rare.add('Wolf-Rayet star');
    else if (letter === 'M' && ['supergiant', 'hypergiant'].includes(SIZE[lum])) rare.add('red supergiant');
  }
  return { letters: [...CLASSES].map(l => [l, seen.has(l)]), n: seen.size, of: CLASSES.length, rare: RARE.filter(k => rare.has(k)) };
}

// The count of charted destinations as the log says it: Sol is one of them, and the ship set out from there. The
// record row and the arrival's line both say it through here, so the two can't disagree.
export const chartedSaid = c => ({ n: c.n + 1, of: c.of + 1 });

// What the newest arrival did, for one quiet line under its title: the log with the new entry at its head against
// the log before it. "First visit" (or "Third visit"), and each record it set: "Farthest yet from Sol", "Longest
// trip yet", "Destination 3 of 32 charted". The first trip of all sets every one. Coming home is not a visit.
// Nothing is kept with the entry: it is worked out from the log, as the records are (same `opts` as logRecords).
const NTH = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
export function arrivalFirsts(log, opts) {
  const e = log[0];
  if (!e) return [];
  const before = logRecords(log.slice(1), opts), after = logRecords(log, opts);
  const lines = [];
  if (e.star !== 0) {
    const visits = log.filter(x => x.star === e.star).length;
    lines.push(`${NTH[visits - 1] || ordinal(visits)} visit`);
  }
  if (after.farthest && (!before.farthest || after.farthest.ly > before.farthest.ly)) lines.push('Farthest yet from Sol');
  if (after.longest && (!before.longest || after.longest.ly > before.longest.ly)) lines.push('Longest trip yet');
  if (after.charted.n > before.charted.n) { const c = chartedSaid(after.charted); lines.push(`Destination ${c.n} of ${c.of} charted`); }
  return lines;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
