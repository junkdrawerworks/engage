// The ship's computer, in Set course's search box: "nearest", "nearest with planets", "brightest from here",
// "within 20 ly", "red giants", "unvisited", "how far is vega". It answers with a line in the log's voice and the
// stars to tap. Everything is measured from where the ship is, so "brightest from here" changes at every star.
// Anything it doesn't understand is left to the name search (ask returns null). Pure, checked by
// test/search.test.mjs.
import { LY_PER_PC, apparentMag, formatDuration, roughLy, tripYears } from './physics.js';
import { companions, giantSlip, kindOf, nearestStars, notesFor, titleFor } from './log.js';
import { fold } from './search.js';

const LIST = 60;          // the most rows an answer lists
const COMPLETE_LY = 80;   // the catalogue holds every star out to here from the Sun, and only the bright ones beyond
const COLOURS = { O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'red' };
const SIZES = ['dwarf', 'subdwarf', 'subgiant', 'giant', 'bright giant', 'supergiant', 'hypergiant'];
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const said = n => (n <= 10 ? NUMBER[n] : n.toLocaleString('en-US'));
const cap = s => s[0].toUpperCase() + s.slice(1);
const magSaid = m => `magnitude ${m.toFixed(1).replace(/^-0\.0$/, '0.0').replace('-', '−')}`;

// The question as plain words: folded like a name, with "computer," in front, "please", "show me" and a question
// mark left off. "Computer, how far is Vega?" reads "how far is vega".
export function question(q) {
  return fold(q).replace(/\.(?!\d)/g, ' ').replace(/^(computer|ok computer)\s+/, '').replace(/^(please\s+)?(show me|list|find)\s+(the\s+)?/, '')
    .replace(/\s+please$/, '').replace(/\s+/g, ' ').trim();
}

// `ship` is what the answer needs from the bridge: { at, visited (a Set of stars), warp, charted (the stars with
// notes, Sol first), worlds(i) (whether star i is known to have planets), find(name) (the star a name means, or
// undefined) }. Returns { line, stars } or null.
export function ask(cat, query, ship) {
  const q = question(query);
  if (!q) return null;
  const at = ship.at;
  const from = cat.pos.subarray(at * 3, at * 3 + 3);
  const guessed = !!cat.unmeasured[at]; // the ship's own place is only the charts' guess
  const fromSol = Math.hypot(...from) * LY_PER_PC;
  const ly = i => cat.distanceFrom(i, from) * LY_PER_PC;
  const byNear = list => list.sort((a, b) => ly(a) - ly(b) || a - b);
  const nowhere = { line: 'Our own position is only the charts’ guess here, so there’s no saying what is near us.', stars: [] };
  let m;

  if (/^(nearest|closest)( stars?)?( to (us|here|the ship))?$/.test(q)) {
    if (guessed) return nowhere;
    const near = nearestStars(cat, from, 5, at);
    return { line: `The ${said(near.length)} stars nearest our position, nearest first. ${cap(name(cat, near[0].star))} is ${roughLy(near[0].ly)} away.`, stars: near.map(n => n.star) };
  }

  if (/^((nearest|closest) )?(stars? )?with planets( nearby)?$|^(nearest|closest) planets$|^planets( nearby)?$/.test(q)) {
    const stars = byNear(ship.charted.filter(i => i !== at && ship.worlds(i) && !cat.unmeasured[i]));
    if (guessed) return { line: 'Of the stars known to have planets, these are on our charts. Our own position is only a guess here, so none can be called near.', stars };
    return { line: `Of the stars known to have planets, these are nearest our position. ${cap(name(cat, stars[0]))} is ${roughLy(ly(stars[0]))} away.`, stars };
  }

  if (/^(the )?brightest( stars?)?( from here| here| in (this|the|our) sky| we can see)?$/.test(q)) {
    const best = [];
    for (let j = 0; j < cat.count; j++) {
      if (j === at || cat.unmeasured[j] || companions(cat, at, j)) continue;
      const mag = apparentMag(cat.absmag[j], cat.distanceFrom(j, from));
      if (best.length === 5 && mag >= best[4].mag) continue;
      best.push({ star: j, mag });
      best.sort((a, b) => a.mag - b.mag);
      if (best.length > 5) best.pop();
    }
    // Far from the Sun the catalogue lacks the faint stars that could be bright from here.
    const lead = !guessed && fromSol < COMPLETE_LY ? 'The brightest stars in this sky' : 'Going by the charts, the brightest stars in this sky';
    return { line: `${lead}, brightest first. ${cap(name(cat, best[0].star))} shines at ${magSaid(best[0].mag)}.`, stars: best.map(b => b.star) };
  }

  if ((m = /^(stars )?within (\d+(?:\.\d+)?) ?(ly|light ?years?|lightyears?|pc|parsecs?)( of (us|here|the ship))?$/.exec(q))) {
    if (guessed) return nowhere;
    const r = Number(m[2]) * (/^p/.test(m[3]) ? LY_PER_PC : 1);
    const stars = [];
    for (let j = 0; j < cat.count; j++) if (j !== at && !cat.unmeasured[j] && ly(j) <= r) stars.push(j);
    byNear(stars);
    const rSaid = `${Number(r.toPrecision(3)).toLocaleString('en-US')} light years`;
    if (!stars.length) return { line: `No star on the charts lies within ${rSaid} of us.`, stars: [] };
    const more = stars.length > LIST ? ` The nearest ${LIST} are listed.` : '';
    return { line: `${cap(said(stars.length))} star${stars.length === 1 ? '' : 's'} on the charts lie${stars.length === 1 ? 's' : ''} within ${rSaid} of us, nearest first.${more}`, stars: stars.slice(0, LIST) };
  }

  const kind = kindAsked(q);
  if (kind) {
    const stars = [];
    for (let j = 1; j < cat.count; j++) {
      if (j === at || cat.unmeasured[j]) continue;
      // A star with notes is the kind its notes say (the catalogue calls Capella's pair of yellow giants "M1"),
      // by what they say before the first comma ("White star, …, with a white dwarf companion" is no white dwarf).
      const noted = notesFor(cat, j)?.kind;
      if (noted) {
        if (new RegExp(`\\b${kind.one.replace('-', '[- ]')}s?\\b`, 'i').test(noted.split(',')[0])) stars.push(j);
        continue;
      }
      const k = kindOf(cat.spect[j], cat.temp[j], cat.absmag[j]);
      if (giantSlip(k.size, cat.absmag[j])) continue; // a slip in the catalogue's class (see giantSlip)
      if (kind.special ? k.special === kind.special : k.size === kind.size && (!kind.colour || COLOURS[k.letter] === kind.colour)) stars.push(j);
    }
    if (guessed) stars.sort((a, b) => cat.absmag[a] - cat.absmag[b]); else byNear(stars);
    if (!stars.length) return { line: `There are no ${kind.words} on the charts.`, stars: [] };
    const order = guessed ? 'truly brightest first' : 'nearest us first';
    const more = stars.length > LIST ? ` The ${guessed ? 'brightest' : 'nearest'} ${LIST} are listed.` : '';
    return { line: `${cap(said(stars.length))} ${stars.length === 1 ? kind.one : kind.words} on the charts, ${order}.${more}`, stars: stars.slice(0, LIST) };
  }

  if (/^(unvisited|not (yet )?visited|still to visit|where (have|havent) (i|we) (not )?been( yet)?)$/.test(q)) {
    const all = ship.charted.filter(i => i !== 0);
    const left = all.filter(i => !ship.visited.has(i) && i !== at);
    if (!left.length) return { line: `All ${all.length} destinations with notes have been visited. The rest of the catalogue is still out there.`, stars: [] };
    if (!guessed) byNear(left);
    return { line: `Of the ${all.length} destinations with notes, ${said(left.length)} ${left.length === 1 ? 'is' : 'are'} still unvisited${guessed ? '' : ', nearest us first'}.`, stars: left };
  }

  if ((m = /^(how far (is|to|away is)|distance to|how long to|how long to get to) (.+?)( from here)?$/.exec(q))) {
    const i = ship.find(m[3]);
    if (i === undefined) return { line: `No star called ${m[3]} on the charts.`, stars: [] };
    const t = cap(name(cat, i));
    if (i === at) return { line: `We’re holding at ${name(cat, i)} now.`, stars: [] };
    if (guessed || cat.unmeasured[i]) return { line: `${t} has no measured distance from here, so the charts can only guess.`, stars: [i] };
    const d = ly(i);
    const w = Number(ship.warp).toFixed(1).replace(/\.0$/, '');
    return { line: `${t} is ${roughLy(d)} from us: ${formatDuration(tripYears(d, ship.warp))} at warp ${w}.`, stars: [i] };
  }
  return null;
}

// "the Sun" in a sentence, rather than "Sol"; every other star by the log's own title for it.
const name = (cat, i) => (i === 0 ? 'the Sun' : titleFor(cat, i));

// A kind of star asked for: "red giants", "giants", "white dwarfs", "blue-white subgiants", "carbon stars".
// { colour, size, words, one } or { special, words, one }, or null.
function kindAsked(q) {
  if (/^white dwarfs?$/.test(q)) return { special: 'white dwarf', words: 'white dwarfs', one: 'white dwarf' };
  if (/^carbon stars?$/.test(q)) return { special: 'carbon', words: 'carbon stars', one: 'carbon star' };
  if (/^wolf ?rayet( stars?)?$/.test(q)) return { special: 'wolf-rayet', words: 'Wolf-Rayet stars', one: 'Wolf-Rayet star' };
  const m = /^(?:(blue white|yellow white|blue|white|yellow|orange|red) )?(dwarf|subdwarf|subgiant|giant|bright giant|supergiant|hypergiant)s?$/.exec(q);
  if (!m || !SIZES.includes(m[2])) return null;
  const colour = m[1] ? m[1].replace(' ', '-') : null;
  const one = `${colour ? `${colour} ` : ''}${m[2]}`;
  return { colour, size: m[2], words: `${one}s`, one };
}
