// Finding a star by what people type: the catalogue's name, the name the log uses, what else it's called, and where
// Starfleet's charts put things ("vulcan", "farpoint"). Pure functions, so test/search.test.mjs can check them
// without a browser.
import { DESTINATIONS } from './destinations.js';
import { CHARTS } from './charts.js';

const GREEK = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ο: 'omicron', π: 'pi', ρ: 'rho', σ: 'sigma', ς: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega' };
// The three-letter forms astronomers write: "eps Eri", "alp Cen".
const SHORT = { alp: 'alpha', bet: 'beta', gam: 'gamma', del: 'delta', eps: 'epsilon', zet: 'zeta', the: 'theta', iot: 'iota', kap: 'kappa', lam: 'lambda', omi: 'omicron', sig: 'sigma', ups: 'upsilon', ome: 'omega' };
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

// Lower case, Greek letters spelled out, raised digits brought down ("θ¹ Orionis" reads "theta 1 orionis"), accents
// and apostrophes dropped, and anything else that isn't a letter or a digit read as a space.
export const fold = s => String(s).toLowerCase()
  .replace(/[⁰¹²³⁴-⁹]/g, c => ` ${SUPER[c]} `)
  .replace(/[α-ω]/g, c => ` ${GREEK[c]} `)
  .normalize('NFD').replace(/[̀-ͯ’']/g, '')
  .replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
// The same with nothing between the words, so "wolf359", "hip3" and "theta1 orionis" still match.
const tight = s => s.replace(/[^a-z0-9]/g, '');

const NOTES = new Map(DESTINATIONS.map(d => [d.star, d]));
const TAGS = new Map(CHARTS.map(c => [c.star, c.tag]));
const CHART_FIND = new Map(CHARTS.map(c => [c.star, c.find || []]));

// What Starfleet's charts call a star, where that isn't just the star's own name: "Vulcan" for 40 Eridani.
export function chartTag(name) {
  const tag = TAGS.get(name);
  return tag && fold(tag) !== fold(NOTES.get(name)?.title || name) ? tag : null;
}

// One entry per star: every name it answers to, folded, with and without spaces. `constellations` is the catalogue's
// list of [abbreviation, name, genitive], for "eps Eri" and "alpha UMa".
export function buildIndex(names, constellations = []) {
  const stars = names.map(name => {
    const d = NOTES.get(name);
    const all = [name, d?.title, d?.aka, TAGS.get(name), ...(d?.find || []), ...(CHART_FIND.get(name) || [])].filter(Boolean).map(fold);
    for (const p of [...all]) if (p.startsWith('the ')) all.push(p.slice(4)); // "The North Star" answers to "north star"
    const parts = [...new Set(all)];
    return { parts, tight: parts.map(tight), words: parts.map(p => p.split(' ')), known: !!(d || TAGS.has(name)) };
  });
  return { stars, genitive: new Map(constellations.map(([abbr, , gen]) => [fold(abbr), fold(gen)])) };
}

// The ways a query might be meant: as typed, and with the short forms written out ("gj 581" as "gliese 581",
// "eps eri" as "epsilon eridani"). Written out only as a second reading, so "the dog star" isn't lost to theta.
export function readings(query, genitive = new Map()) {
  const q = fold(query);
  if (!q) return [];
  let words = q.replace(/^(gj|gl)\.?\s*(?=\d)/, 'gliese ').split(' ');
  const m = words[0].match(/^([a-z]{3})(\d?)$/);
  if (m && SHORT[m[1]] && words.length > 1) words[0] = SHORT[m[1]] + (m[2] ? ` ${m[2]}` : '');
  const last = words.length - 1;
  if (last > 0 && genitive.has(words[last])) words[last] = genitive.get(words[last]);
  return [...new Set([q, words.join(' ')])];
}

// The stars a query finds, best first: a name that is exactly what was typed, then one where it is whole words from
// the start ("hip 3" is HIP 3 before HIP 37819), then the rest; within each, the stars with notes or a place on
// Starfleet's charts first, then a match at the start of a name, then the brightest from Earth. `mag(i)` is how
// bright star i looks from Earth. Last come names that hold every word typed with something between them:
// "zeta reticuli" is both ζ¹ and ζ² Reticuli, which the catalogue writes "zeta 1 reticuli".
export function search(index, query, mag, limit = 60) {
  return rank(index, query, mag).slice(0, limit).map(h => h[4]);
}

// The one star a name means, for a link that names its star (?course=vega, ?course=The%20Pleiades): the best match
// when the name is exactly one of the star's own, however it is spelled, or else nothing.
export function named(index, query, mag) {
  const best = rank(index, query, mag)[0];
  return best && best[0] === 0 ? best[4] : undefined;
}

function rank(index, query, mag) {
  const ways = readings(query, index.genitive).map(q => [q, tight(q), q.split(' ')]).filter(w => w[1]);
  if (!ways.length) return [];
  const hits = [];
  index.stars.forEach((star, i) => {
    let best = 9, start = 1;
    for (const [q, qt, qw] of ways) {
      star.parts.forEach((p, k) => {
        const at = p.indexOf(q);
        let tier = 9;
        if (star.tight[k] === qt) tier = 0;
        else if (at === 0 && p[q.length] === ' ') tier = 1;
        else if (at >= 0) tier = 2;
        else if (star.tight[k].includes(qt)) tier = 3;
        else if (qw.length > 1 && qw.every(w => star.words[k].includes(w))) tier = 4;
        if (tier < best) best = tier;
        if (at === 0) start = 0;
      });
    }
    if (best < 9) hits.push([best, star.known ? 0 : 1, start, mag(i), i]);
  });
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
}

// ---------- A year ----------

// A query that is a year, from 1900 to this one ("1987"), or null. `now` is today as a year and the fraction of it
// gone (the stardate's number).
export function yearAsked(query, now) {
  const m = /^\s*(\d{4})\s*$/.exec(String(query));
  const year = m ? Number(m[1]) : 0;
  return year >= 1900 && year <= Math.floor(now) ? year : null;
}

// The stars that light which left Earth in `year` is reaching about now: those within half a light year of the
// middle of that year's light, which is to say the stars from which the log would date Earth's old light to that
// year (it is floor(now - ly) there too, so the log on arrival names the year that was asked for). The `n`
// brightest from Earth, brightest first. `lyFromSol(i)` is star i's distance from the Sun in light years, or null
// where it was never measured; `mag(i)` is how bright it looks from Earth. "About now": distances 40 to 80 light
// years out are good to a few tenths of a light year at best.
export function litBy(year, now, count, lyFromSol, mag, n = 3) {
  const hits = [];
  for (let i = 1; i < count; i++) {
    const ly = lyFromSol(i);
    if (ly !== null && Math.floor(now - ly) === year) hits.push(i);
  }
  return hits.sort((a, b) => mag(a) - mag(b) || a - b).slice(0, n);
}

// Stars that share a name (the two of 61 Cygni, the three of θ¹ Orionis) get a letter each, the brightest A, so the
// rows of a list can be told apart. `absmag` is each star's true brightness. Returns star number -> letter.
export function pairLetters(names, absmag) {
  const groups = new Map();
  names.forEach((n, i) => { if (!groups.has(n)) groups.set(n, []); groups.get(n).push(i); });
  const letters = new Map();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => absmag[a] - absmag[b] || a - b).forEach((i, k) => letters.set(i, 'ABCDEFGH'[k] || '?'));
  }
  return letters;
}
