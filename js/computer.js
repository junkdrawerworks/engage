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

  // "Computer, report": what is on the viewscreen, when the bridge has given its view (see report below).
  if (ship.view && /^((status )?report|what('?s| is) (on (the )?(view ?)?screen|in view|ahead)|what am i looking at|describe (the )?(view|viewscreen|sky))$/.test(q)) {
    const r = report(cat, ship.view);
    return { line: r.line, stars: r.brightest };
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

// ---------- Computer, report ----------

// What is on the viewscreen, in a line, in the same voice: "Looking toward Orion. Brightest in view: Betelgeuse,
// Rigel and Bellatrix. The Sun is behind you and to the left, magnitude −26.7." For someone who can't see the screen,
// and for anyone who wants it said. `view` is how the viewscreen is pointed: { cam (where the ship is, in parsecs),
// f, r, u (ahead, right and up, as unit vectors), tanX, tanY (how far the screen reaches left-right and up-down from
// its middle, as tangents), at (the star the ship is holding at, or null in flight), target (the destination, or
// null), covered (optional: parts of the screen something stands over, such as the helm, as { left, right, top,
// bottom } in the same tangents, up positive) }. Returns { line, brightest (the stars named, brightest first) }.
const SEEN = 6.5; // the faintest star an eye can see

// Where a direction is from the ship's point of view: in view, or "behind you and to the left".
function whereIs(d, view) {
  const len = Math.hypot(...d) || 1;
  const z = dot(d, view.f) / len, x = dot(d, view.r) / len, y = dot(d, view.u) / len;
  if (z > 0.01 && Math.abs(x / z) < view.tanX && Math.abs(y / z) < view.tanY) return 'in view';
  const parts = [z > 0.5 ? 'ahead' : z < -0.5 ? 'behind you' : '', x > 0.35 ? 'to the right' : x < -0.35 ? 'to the left' : '', y > 0.5 ? 'above' : y < -0.5 ? 'below' : ''].filter(Boolean);
  if (!parts.length) parts.push(z >= 0 ? 'ahead' : 'behind you');
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const listed = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// The brightest stars in view from `cam`, brightest first: { star, mag }. The star the ship holds at, and its
// companions, are left to the line about them; stars with no measured distance are left out (where they are drawn
// is only the charts' guess).
export function brightestInView(cat, view, n = 3, skip = []) {
  const best = [];
  const p = cat.pos, c = view.cam;
  for (let j = 1; j < cat.count; j++) {
    if (cat.unmeasured[j] || skip.includes(j)) continue;
    if (view.at != null && view.at !== 0 && (j === view.at || companions(cat, view.at, j))) continue;
    const d = [p[j * 3] - c[0], p[j * 3 + 1] - c[1], p[j * 3 + 2] - c[2]];
    const len = Math.hypot(...d);
    const mag = apparentMag(cat.absmag[j], len);
    if (mag > SEEN || (best.length === n && mag >= best[n - 1].mag)) continue;
    const z = dot(d, view.f) / len;
    if (z <= 0.01) continue;
    const x = dot(d, view.r) / len / z, y = dot(d, view.u) / len / z;
    if (Math.abs(x) >= view.tanX || Math.abs(y) >= view.tanY) continue;
    if (view.covered?.some(c => x > c.left && x < c.right && y < c.top && y > c.bottom)) continue; // under the helm
    best.push({ star: j, mag });
    best.sort((a, b) => a.mag - b.mag);
    if (best.length > n) best.pop();
  }
  return best;
}

const seenSaid = mag => `${magSaid(mag)}${mag > SEEN ? ', too faint to see without help' : ''}`;

export function report(cat, view) {
  const toward = cat.constellationToward?.(view.f);
  const parts = [toward ? `Looking toward ${toward}.` : 'Looking out.'];
  const c = view.cam;
  // The star the ship is holding at, when it is in front of you.
  if (view.at != null && view.at !== 0) {
    const i = view.at, d = [cat.pos[i * 3] - c[0], cat.pos[i * 3 + 1] - c[1], cat.pos[i * 3 + 2] - c[2]];
    if (whereIs(d, view) === 'in view') parts.push(`${cap(name(cat, i))}, where we are holding, fills the view at ${magSaid(apparentMag(cat.absmag[i], Math.hypot(...d)))}.`);
  }
  const best = brightestInView(cat, view);
  parts.push(best.length ? `Brightest in view: ${listed(best.map(b => name(cat, b.star)))}.` : 'No star bright enough to see is in view.');
  // The Sun, wherever it is (unless the ship is holding off it, in Earth orbit, where it is behind you anyway).
  const sun = [-c[0], -c[1], -c[2]];
  if (Math.hypot(...sun) > 1e-7) parts.push(`The Sun is ${whereIs(sun, view)}, ${seenSaid(apparentMag(cat.absmag[0], Math.hypot(...sun)))}.`);
  // And the destination, if one is chosen.
  const t = view.target;
  if (t != null && t !== view.at) {
    const d = [cat.pos[t * 3] - c[0], cat.pos[t * 3 + 1] - c[1], cat.pos[t * 3 + 2] - c[2]];
    const where = whereIs(d, view);
    parts.push(`Your destination, ${name(cat, t)}, is ${where}.`);
  }
  return { line: parts.join(' '), brightest: best.map(b => b.star) };
}

// The few lines a flight is told in, when Report is on: setting out, halfway, closing in, and dropping out of
// warp. `trip` is { from (where it left, as the log names it), to (the star), warp, ly (the whole way), left (light
// years still to go), nominal (the distance is only the charts' guess), view (as for report, from where the ship is
// now) }.
export function flightLine(cat, stage, trip) {
  const to = name(cat, trip.to);
  const w = Number(trip.warp).toFixed(1).replace(/\.0$/, '');
  if (stage === 'out') return trip.nominal ? `Leaving ${trip.from} at warp ${w} for ${to}. Its distance has never been measured.` : `Leaving ${trip.from} at warp ${w} for ${to}, ${roughLy(trip.ly)} away.`;
  if (stage === 'drop') return `Dropping out of warp at ${to}.`;
  const left = trip.nominal ? 'the rest unmeasured' : `${leftSaid(trip.left)} to go`;
  // Closing in, the destination is the brightest thing ahead by far: the line is only how far is left.
  if (stage === 'near') return `Closing on ${to}: ${left}.`;
  const ahead = brightestInView(cat, { ...trip.view, at: null }, 1)[0];
  return `Halfway: ${left}${ahead ? `, ${name(cat, ahead.star)} now the brightest star ahead` : ''}.`;
}
// What is left of a flight: light years, or near the end (the ship covers most of the way in the middle of the
// flight, and the last of it slowly) astronomical units, as the readout counts it.
function leftSaid(ly) {
  if (ly >= 0.1) return roughLy(ly);
  const au = ly * 63241.1;
  return `${au < 10 ? au.toFixed(1) : Math.round(au).toLocaleString('en-US')} AU`;
}
