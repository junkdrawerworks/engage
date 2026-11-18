// The xenobiology lab's rules: from a planet class and a seed, the conditions where a creature lives there, the body
// those conditions would push it toward, and the field notes that explain why. Pure, so test/xeno.test.mjs can run it.
// The art is in js/xeno-art.js; this only decides what to draw.
import { byId, label, grows, worldByName } from './classes.js';
import { massFor, widthFor } from './physics.js';

// Where life could live on each kind of world, and what the air is like there.
// `habitats` is drawn from at random (repeat one to make it likelier). `pressure` is in Earth atmospheres where it lives.
// `temp` overrides the class's surface temperature for habitats that aren't on the surface, in kelvin.
// `stars` are the kinds of star it might circle; `odds` is how seriously to take the result.
// `gas` marks hydrogen air, which is far lighter than ours for the same pressure.
export const WORLDS = {
  M: { habitats: ['land', 'land', 'land', 'sea'], pressure: [0.7, 1.6], stars: ['yellow', 'orange', 'red'], odds: 'likely', place: ['meadow', 'forest', 'river'] },
  L: { habitats: ['plant'], pressure: [0.6, 1.0], stars: ['yellow', 'orange', 'red'], odds: 'likely', place: ['grassland', 'forest'] },
  K: { habitats: ['burrow', 'burrow', 'land'], pressure: [0.006, 0.03], stars: ['yellow', 'orange', 'red'], odds: 'long', place: ['crater', 'rust plain'] },
  H: { habitats: ['land', 'land', 'burrow'], pressure: [0.7, 1.3], stars: ['yellow', 'orange', 'red'], odds: 'likely', place: ['dune', 'salt flat', 'mesa'] },
  N: { habitats: ['cloud'], pressure: [0.5, 1.2], temp: [290, 340], stars: ['yellow', 'orange'], odds: 'long', place: ['cloud deck'] },
  O: { habitats: ['sea', 'sea', 'sea', 'land'], pressure: [1, 3], stars: ['yellow', 'orange', 'red'], odds: 'likely', place: ['reef', 'shallows', 'open ocean'] },
  P: { habitats: ['under-ice', 'under-ice', 'land'], pressure: [0.2, 0.6], stars: ['yellow', 'orange', 'red'], odds: 'possible', place: ['tundra', 'ice shelf'] },
  D: { habitats: ['rock'], pressure: [0, 0], stars: ['yellow', 'orange', 'red'], odds: 'long', place: ['crater rim', 'regolith'] },
  Y: { habitats: ['rock', 'land'], pressure: [4, 20], stars: ['yellow', 'orange', 'red'], odds: 'wild', place: ['caldera', 'ash field'] },
  J: { habitats: ['cloud'], pressure: [2, 6], temp: [270, 330], stars: ['yellow', 'orange', 'red'], gas: true, odds: 'long', place: ['cloud band', 'storm edge'] },
  T: { habitats: ['cloud'], pressure: [2, 6], temp: [270, 330], stars: ['yellow', 'orange', 'red'], gas: true, odds: 'wild', place: ['cloud band'] },
  R: { habitats: ['under-ice'], pressure: [0, 0], temp: [273, 290], stars: ['none'], odds: 'possible', place: ['vent field'] },
  'super-earth': { habitats: ['land', 'land', 'sea'], pressure: [1.5, 6], stars: ['orange', 'red', 'red'], odds: 'possible', place: ['basin', 'steppe', 'coast'] },
  'sub-neptune': { habitats: ['sea'], pressure: [10, 60], temp: [280, 330], stars: ['orange', 'red', 'red'], gas: true, odds: 'long', place: ['deep ocean'] },
  'lava-world': { habitats: ['rock'], pressure: [0, 0.01], temp: [600, 950], stars: ['yellow', 'orange', 'red'], odds: 'wild', place: ['night side'] },
  'hot-jupiter': { habitats: ['cloud'], pressure: [0.5, 2], temp: [900, 1300], stars: ['yellow', 'orange'], gas: true, odds: 'wild', place: ['night-side clouds'] },
  'ice-giant': { habitats: ['sea'], pressure: [200, 2000], temp: [280, 360], stars: ['yellow', 'orange', 'red'], gas: true, odds: 'wild', place: ['water mantle'] },
};

// (Class L has plants and no animals, so its creatures get the line with "plants" in it: see oddsFor.)
export const ODDS = {
  likely: 'Plausible. Earth is proof that this kind of place can grow animals like it.',
  possible: 'Possible. Earth has animals that live in places like this, though none started out there.',
  long: 'A long shot. Some scientists have argued for life here, but nobody expects much.',
  wild: 'Pure speculation. Nothing on Earth could survive here, so the lab is guessing at a different chemistry.',
};

// How seriously to take one creature: the line for its world, worded for what was grown. One grown for a real planet
// that is only a candidate for its file (nobody knows yet that Proxima b is Class M) says that first.
export function oddsFor(c) {
  const line = c.body.plan === 'plant' ? ODDS[c.odds].replace('animals like it', 'plants like it') : ODDS[c.odds];
  if (!c.world || !c.cls.candidate) return line;
  return line.replace('. ', `. That is if ${c.world.name} is the kind of place its file hopes for, which nobody knows yet. `);
}

export const STARS = {
  yellow: { name: 'a yellow star like the Sun', color: [255, 244, 214] },
  orange: { name: 'an orange dwarf', color: [255, 196, 128] },
  red: { name: 'a red dwarf', color: [255, 120, 80] },
  none: { name: 'no star at all', color: null },
};

// ---------- Randomness ----------

export function rng(seed) { // mulberry32, as in js/planet-art.js
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, list) => list[Math.floor(r() * list.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- Numbers in words ----------

export function gText(g) { return g >= 10 ? `${Math.round(g)} g` : `${g.toFixed(g < 1 ? 2 : 1).replace(/\.?0+$/, '')} g`; }
export function sizeText(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace(/\.0$/, '')} km`;
  if (m >= 1) return `${m.toFixed(m >= 10 ? 0 : 1).replace(/\.0$/, '')} m`;
  if (m >= 0.01) return `${Math.round(m * 100)} cm`;
  return `${Math.max(0.1, m * 1000).toFixed(m >= 0.001 ? 0 : 1)} mm`;
}
// How many times as much, to go before "what it would on Earth": "2.5 times", "1.4 times", "55% of".
function times(x) {
  if (x >= 10) return `${Math.round(x)} times`;
  if (x >= 1.05) return `${x.toFixed(1).replace(/\.0$/, '')} times`;
  return `${Math.round(x * 100)}% of`;
}
// How thick the air is against Earth's, as the end of "The air is ...".
function denseText(d) {
  if (d >= 1.05) return `${d >= 10 ? Math.round(d) : d.toFixed(1).replace(/\.0$/, '')} times as dense as Earth’s`;
  return d > 0.95 ? 'about as dense as Earth’s' : `${Math.round(d * 100)}% as dense as Earth’s`;
}
const celsius = k => Math.round(k - 273.15);
const signed = n => (n < 0 ? `−${-n}` : String(n));
export const tempText = k => `${Math.round(k)} K (${signed(celsius(k))} °C)`;
function pressureText(p) {
  if (p === 0) return 'none';
  if (p < 0.05) return `about ${p < 0.01 ? 'a hundredth' : 'a fiftieth'} of Earth’s`;
  if (p >= 1.9) return `${Math.round(p)} times Earth’s`;
  return `${Math.round(p * 100)}% of Earth’s`;
}

// ---------- The creature ----------

// Everything about one creature, decided from its class and seed alone: grow('M', 7) is always the same animal.
export function grow(classId, seed) {
  return make(classId, seed, null);
}

// A creature for a real planet: the same rules, with the planet's own width, mass, temperature and star in place of
// the ones grow() draws. `world` is one of the survey's real worlds, or its name; the file it is on still decides
// where on it life could be and how thick the air is, since nobody has measured those. growFor('Proxima b', 7) is
// always the same animal too.
export function growFor(world, seed) {
  const found = worldByName(typeof world === 'string' ? world : world?.name);
  if (!found || !grows(found.world)) throw new Error(`No readings to grow for: ${typeof world === 'string' ? world : world?.name}`);
  return make(found.cls.id, seed, found.world);
}

function make(classId, seed, world) {
  const cls = byId.get(classId);
  const W = WORLDS[classId];
  if (!cls || !W) throw new Error(`No such class: ${classId}`);
  const r = rng(hash(world ? `${classId}/${world.name}` : classId) ^ seed);
  const t = cls.typical;

  // The world: width and mass rise together, so the gravity stays near what that kind of planet really has.
  const k = r();
  let width = lerp(t.width[0], t.width[1], clamp(k + (r() - 0.5) * 0.3, 0, 1));
  // (A planetoid's range of masses is fifty-fold and its widths only four-fold, so for Class D the mass is what a
  // body that wide would weigh: its gravity then runs from a twentieth to a quarter of Earth's, as the Moon's does.)
  let mass = classId === 'D' ? clamp(massFor(width), t.mass[0], t.mass[1]) : lerp(t.mass[0], t.mass[1], k);
  // A real planet brings its own. Where only its mass is known, the width is what a rocky world that heavy would have.
  if (world) { mass = world.mass; width = world.width || widthFor(mass); }
  const g = mass / (width * width);
  const habitat = pick(r, world?.habitats || W.habitats);
  let temp = lerp(...(W.temp || (habitat === 'under-ice' ? [273, 283] : t.temp)), r());
  // (Under the ice the water is as warm as water under ice is, whatever the star does to the surface.)
  if (world && habitat !== 'under-ice') temp = world.teq;
  const pressure = lerp(W.pressure[0], W.pressure[1], r());
  let star = pick(r, W.stars);
  if (world) star = world.sun;
  const dark = star === 'none' || habitat === 'under-ice' || (habitat === 'sea' && W.gas) || (habitat === 'burrow' && r() < 0.5);
  // Air's density against Earth's at sea level: pressure over temperature, and hydrogen weighs a fourteenth of our air.
  const density = pressure * (288 / temp) * (W.gas ? 2.3 / 29 : 1);
  const chem = temp > 450 ? 'silicon' : W.gas && habitat === 'sea' && temp > 300 && classId === 'ice-giant' ? 'ammonia' : temp < 255 && habitat !== 'under-ice' ? 'brine' : 'water';
  const env = { width, mass, g, habitat, temp, pressure, density, star, dark, chem, place: placeFor(classId, habitat, W, r), gas: !!W.gas };
  if (world?.places) env.place = world.places[Math.floor(k * world.places.length)];

  const body = shape(env, classId, r);
  const name = names(env, body, classId, rng(hash(`name/${world ? `${classId}/${world.name}` : classId}`) ^ seed));
  const c = { cls, classId, seed, env, body, name, notes: notes(env, body, cls), odds: W.odds };
  if (world) { c.world = world; c.notes = worldNotes(c); }
  return c;
}

// The field notes of a creature grown for a real planet: the same four, each opening with what is measured and what
// is the lab's guess, and a fifth with what the survey file says of the planet itself.
const fig = x => String(Math.round(x * 100 + 1e-6) / 100);
const fileOf = cls => (cls.letter ? label(cls) : cls.name.toLowerCase());
function worldNotes(c) {
  const { world: w, env, cls } = c;
  const gs = gText(env.g);
  return [...c.notes.map(n => {
    if (n.k === 'gravity') {
      return w.width
        ? { ...n, text: `${w.name} is ${fig(w.width)} times as wide as Earth and ${fig(w.mass)} times as heavy, which makes its pull ${gs}. ${n.text}` }
        : { ...n, label: `${n.label}, if it is rock`, text: `${w.name} is ${w.least ? 'at least ' : ''}${fig(w.mass)} times as heavy as Earth, and nobody has measured its width. If it is rock it is about ${fig(env.width)} times as wide, which makes its pull about ${gs}. ${n.text}` };
    }
    if (n.k === 'air' && /^(The air|There is no air)/.test(n.text)) {
      return { ...n, text: `How much air ${w.name} has isn’t known, so the lab used the ${fileOf(cls)} file’s. ${n.text}` };
    }
    if (n.k === 'heat') {
      const lead = env.habitat === 'under-ice' ? `Its star’s light alone would warm ${w.name} to ${tempText(w.teq)}, so the lab froze its sea over.`
        : `The lab took the temperature its star’s light alone would give ${w.name}${env.pressure >= 0.1 ? '; air would add to that, as Earth’s adds more than 30 degrees' : ''}.`;
      return { ...n, text: `${lead} ${n.text}` };
    }
    return n;
  }), { k: 'known', label: 'What we really know', text: w.note }];
}

function placeFor(classId, habitat, W, r) {
  if (habitat === 'under-ice') return pick(r, ['vent', 'sub-ice']);
  if (habitat === 'sea' && !['O', 'sub-neptune', 'ice-giant'].includes(classId)) return pick(r, ['reef', 'kelp', 'shallows']);
  return pick(r, W.place);
}

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function shape(env, classId, r) {
  const { g, habitat, temp, pressure, density, star, dark, chem } = env;
  const b = { plan: 'walker', legs: 0, eyes: 2, eyeSize: 1, covering: 'skin', sail: false, sacs: false, armor: false, wings: false, glow: false, feelers: false, tail: r() < 0.7, crystals: false };

  // How easily something could fly: thicker air holds it up, stronger gravity pulls it down.
  const lift = density / g;
  if (habitat === 'land') b.plan = lift > 1.8 && pressure > 1.2 ? 'flyer' : 'walker';
  else if (habitat === 'sea' || habitat === 'under-ice') b.plan = 'swimmer';
  else if (habitat === 'cloud') b.plan = 'floater';
  else if (habitat === 'burrow') b.plan = 'burrower';
  else if (habitat === 'plant') b.plan = 'plant';
  else if (habitat === 'rock') b.plan = 'crawler';

  // Size: on land the square-cube law caps it, roughly with 1/g. Water and gas hold a body up, so those can be huge.
  const u = r();
  if (b.plan === 'walker') b.size = clamp(lerp(0.4, 2.6, u) / Math.pow(g, 1.1), 0.05, 8);
  else if (b.plan === 'flyer') b.size = clamp(lerp(0.6, 3, u) * Math.sqrt(lift / 2), 0.3, 12);
  else if (b.plan === 'swimmer') b.size = lerp(0.5, dark ? 6 : 18, u * u);
  else if (b.plan === 'floater') b.size = lerp(20, 900, u * u) / Math.sqrt(g);
  else if (b.plan === 'burrower') b.size = lerp(0.15, 1.4, u) / Math.sqrt(g);
  else if (b.plan === 'plant') b.size = clamp(lerp(1, 30, u * u) / g, 0.2, 60);
  else b.size = chem === 'silicon' ? lerp(0.6, 2.5, u) : lerp(0.0005, 0.004, u); // a Horta, or a tardigrade

  // Legs: more of them, and thicker, as gravity rises. Thick-set or lanky to match.
  if (b.plan === 'walker') {
    b.legs = g >= 2.2 ? 8 : g >= 1.4 ? 6 : g < 0.6 ? 2 : pick(r, [2, 4, 4, 6]);
    b.build = g >= 1.4 ? 'squat' : g < 0.7 ? 'lanky' : 'even';
  } else if (b.plan === 'flyer') { b.legs = 2; b.build = 'lanky'; b.wings = true; }
  else if (b.plan === 'crawler') { b.legs = chem === 'silicon' ? 0 : 8; b.build = 'squat'; }
  else if (b.plan === 'floater') b.build = g >= 6 ? 'squat' : 'even';
  else if (b.plan === 'swimmer') b.build = pick(r, ['squat', 'even', 'even', 'lanky']);
  else b.build = g >= 1.6 ? 'squat' : g < 0.7 ? 'lanky' : 'even';

  // Eyes follow the light: none in the dark, huge under a dim red sun, small and shaded under a fierce one.
  if (dark) { b.eyes = 0; b.feelers = true; b.glow = b.plan === 'swimmer' || r() < 0.4; }
  else if (b.plan === 'plant') b.eyes = 0;
  else if (star === 'red') { b.eyes = pick(r, [2, 2, 4]); b.eyeSize = 1.7; }
  else if (star === 'orange') { b.eyes = pick(r, [2, 2, 3]); b.eyeSize = 1.3; }
  else { b.eyes = pick(r, [2, 2, 2, 4]); b.eyeSize = temp > 300 && habitat === 'land' ? 0.75 : 1; }
  if (b.plan === 'crawler' && chem !== 'silicon') b.eyes = 0;

  // Skin: what to wear against cold, heat, thin air and hard radiation.
  if (chem === 'silicon') { b.covering = 'crystal'; b.crystals = true; }
  else if (b.plan === 'floater') b.covering = 'jelly';
  else if (b.plan === 'swimmer') b.covering = dark ? 'pale' : 'smooth';
  else if (b.plan === 'plant') b.covering = 'leaf';
  else if (b.plan === 'crawler') b.covering = 'skin';
  else if (temp < 262) b.covering = 'fur';
  else if (temp > 310 || star === 'red' || classId === 'Y') b.covering = 'scales';
  b.sail = (b.plan === 'walker') && temp > 305 && chem !== 'silicon';
  b.sacs = (b.plan === 'walker' || b.plan === 'burrower') && pressure < 0.1;
  b.armor = classId === 'Y' || (star === 'red' && b.plan === 'walker' && r() < 0.5);
  if (b.plan === 'floater' || b.plan === 'burrower' || b.plan === 'plant') b.tail = false;

  // Colour, as a hue and lightness, from what it has to soak up or hide against.
  if (dark) b.color = { h: lerp(180, 260, r()), s: 20, l: 78 };
  else if (chem === 'silicon') b.color = { h: lerp(20, 50, r()), s: 30, l: 62 };
  else if (star === 'red') b.color = { h: lerp(270, 330, r()), s: 30, l: 22 };
  else if (star === 'orange') b.color = { h: lerp(8, 30, r()), s: 55, l: 42 };
  else if (habitat === 'sea' || habitat === 'cloud') b.color = { h: lerp(170, 220, r()), s: 50, l: 52 };
  else if (temp > 300) b.color = { h: lerp(30, 45, r()), s: 45, l: 62 };
  else b.color = { h: lerp(80, 140, r()), s: 40, l: 38 };
  if (b.plan === 'plant' && star === 'yellow') b.color = { h: lerp(95, 130, r()), s: 50, l: 34 };
  if (b.covering === 'fur') b.color.l = Math.max(b.color.l, 70);
  b.accent = (b.color.h + lerp(150, 210, r())) % 360;
  b.wobble = r();
  return b;
}

// ---------- Names ----------

// A name is put together from what is true of the creature, and where more than one thing is true, or there is more
// than one honest word for it, a generator of the name's own chooses: seeded from the class (or planet) and the
// specimen number, and apart from the one that grows the body, so widening these lists never changes an animal.

// The species: three or four per class, each a Latin word for the kind of world.
export const EPITHETS = {
  M: ['minsharae', 'terrestris', 'communis', 'temperans'], L: ['marginalis', 'silvestris', 'nemoralis', 'herbarum'],
  K: ['adaptabilis', 'frigoris', 'pulveris', 'martialis'], H: ['deserti', 'harenae', 'solis', 'sitiens'],
  N: ['venerea', 'nubium', 'sulphuris', 'acidi'], O: ['pelagica', 'maris', 'oceani', 'fluctuum'],
  P: ['glacialis', 'nivis', 'glaciei', 'hiemalis'], D: ['planetoidea', 'lunaris', 'crateris', 'vacui'],
  Y: ['daemonis', 'infernalis', 'veneni', 'cineris'], J: ['jovialis', 'nubigena', 'procellae', 'zonarum'],
  T: ['ultragigantea', 'gigantis', 'ponderis', 'colossi'], R: ['erratica', 'vagans', 'tenebrarum', 'solitudinis'],
  'super-earth': ['gravis', 'molis', 'oneris', 'firmans'], 'sub-neptune': ['nebulosa', 'nebulae', 'caliginis', 'profundi'],
  'lava-world': ['ignea', 'ignis', 'vulcani', 'fornacis'], 'hot-jupiter': ['torrida', 'ardoris', 'aestus', 'fervens'],
  'ice-giant': ['caerulea', 'neptuni', 'urani', 'abyssi'],
};
// The genus ends in a word for how it gets about: foot and walker, wing and flier, fish and swimmer, bladder and
// air, digger twice, plant and shoot, slow one and creeping thing. (Not "dendron", tree: a red one would be a
// Rhododendron, which Earth already has.)
export const ENDINGS = {
  walker: ['podus', 'bates'], flyer: ['pteryx', 'petes'], swimmer: ['ichthys', 'nectes'], floater: ['physa', 'aeron'],
  burrower: ['oryctes', 'scaptor'], plant: ['phyton', 'thallus'], crawler: ['tardus', 'herpeton'],
};
// What it is called for its shape: a few honest words for each body plan and build. A crawler is a dome of rock
// where it is too hot for water (`rock`), and a mite the size of a grain of dust everywhere else (`mite`).
export const NOUNS = {
  walker: { squat: ['lumberer', 'plodder', 'trundler', 'tramper', 'stomper'], even: ['grazer', 'browser', 'forager', 'rambler', 'roamer'], lanky: ['strider', 'stalker', 'loper', 'bounder', 'stilt-walker'] },
  flyer: { lanky: ['glider', 'soarer', 'flier', 'skimmer', 'wind-rider'] },
  swimmer: { squat: ['ray', 'skate', 'flapper', 'wing-fish', 'blanket-fish'], even: ['swimmer', 'fish', 'darter', 'cruiser', 'finback'], lanky: ['eel', 'ribbon', 'sea-snake', 'whip', 'wriggler'] },
  floater: { squat: ['sail', 'disc', 'veil', 'raft', 'kite', 'parasol'], even: ['drifter', 'balloon', 'gas-bag', 'float', 'bell', 'bladder'] },
  burrower: { squat: ['borer', 'digger', 'mole', 'delver', 'shoveller'], even: ['burrower', 'tunneller', 'miner', 'excavator', 'delver'], lanky: ['worm', 'threader', 'slider', 'needle-worm', 'burrow-snake'] },
  plant: { squat: ['mat', 'cushion', 'carpet', 'rosette', 'tussock'], even: ['frond', 'fern', 'bush', 'thicket', 'shrub'], lanky: ['spire', 'pole', 'mast', 'reed', 'tower'] },
  crawler: { rock: ['creeper', 'rock-eater', 'stone-borer', 'dome', 'grinder', 'crawler'], mite: ['creeper', 'mite', 'grain-clinger', 'dust-bear', 'crawler'] },
};
// What it is called for its looks: each list is ways of saying one thing that is true of it.
export const LOOKS = {
  crystal: ['Glassy', 'Faceted', 'Flinty', 'Crystal-backed', 'Stone-skinned', 'Quartz'],
  glow: ['Lantern', 'Glow-spotted', 'Lamplit', 'Glimmering', 'Star-flecked'],
  fur: ['Shaggy', 'Woolly', 'Furred', 'Thick-coated', 'Downy'],
  armor: ['Armoured', 'Plated', 'Shield-backed', 'Shelled', 'Hard-shelled'],
  sail: ['Sail-backed', 'Fan-backed', 'Fin-backed', 'Crested'],
  sacs: ['Barrel-chested', 'Sac-backed', 'Deep-chested', 'Big-lunged'],
  jelly: ['Glassy', 'Clear', 'Filmy', 'Jelly', 'Bubble'],
  blind: ['Blind', 'Eyeless'],
  bigEyes: ['Big-eyed', 'Wide-eyed', 'Owl-eyed', 'Saucer-eyed'],
  hooded: ['Hooded', 'Heavy-browed', 'Squinting'],
  eyes: { 3: ['Three-eyed'], 4: ['Four-eyed'] },
  legs: { 2: ['Two-legged'], 6: ['Six-legged'], 8: ['Eight-legged'] },
  tail: ['Long-tailed', 'Whip-tailed'], noTail: ['Bob-tailed', 'Tailless'],
  small: ['Lesser', 'Dwarf', 'Little', 'Pygmy'], big: ['Greater', 'Giant', 'Great', 'King'],
  // The colour it is drawn in: by how light it is, and otherwise by its hue.
  black: ['Black', 'Sooty', 'Coal', 'Dusky', 'Inky'], pale: ['Pale', 'Ashen', 'Milky', 'Ghost', 'Bone-white'],
  red: ['Russet', 'Brick', 'Rust-red'], sandy: ['Sandy', 'Tawny', 'Buff', 'Dun'], copper: ['Copper', 'Ginger', 'Amber', 'Rusty'],
  green: ['Green', 'Moss', 'Olive', 'Fern'], teal: ['Teal', 'Sea-green', 'Turquoise'], blue: ['Blue', 'Slate', 'Azure'],
};
// The colour word list for a body's drawn colour ({ h, s, l }), and the Greek root that says the same.
function colourOf({ h, l }) {
  if (l <= 26) return ['black', 'Melano'];
  if (l >= 70) return ['pale', 'Leuco'];
  if (h < 20 || h >= 345) return ['red', 'Pyrrho'];
  if (h < 80) return [l >= 55 ? 'sandy' : 'copper', 'Xantho'];
  if (h < 160) return ['green', 'Chloro'];
  if (h < 200) return ['teal', 'Glauco'];
  return ['blue', 'Cyano']; // (the lab draws nothing violet that isn't near-black or pale)
}
// Small and big for each body plan, in metres: the bottom and top third or so of what the lab grows.
const SIZES = { walker: [0.6, 1.9], flyer: [1.2, 3.5], swimmer: [1.5, 8], floater: [90, 420], burrower: [0.45, 1], plant: [3, 14], crawler: [1.1, 2] };

function names(env, b, classId, nr) {
  const tiny = b.plan === 'crawler' && !b.crystals; // a mite: its sizes are in millimetres
  const [small, big] = tiny ? [0.0015, 0.003] : SIZES[b.plan];
  const size = b.size < small ? 'small' : b.size > big ? 'big' : null;
  const [colour, colourRoot] = colourOf(b.color);

  // The genus: a Greek root for one thing that is true of it or its world, and an ending for how it gets about.
  const roots = [];
  if (b.crystals) roots.push('Litho');
  if (env.dark) roots.push('Nycto');
  if (env.g >= 1.6) roots.push('Bary');
  if (env.g < 0.6) roots.push('Lepto');
  if (env.temp > 320) roots.push('Pyro');
  if (env.temp < 262) roots.push('Cryo');
  if (env.star === 'red') roots.push('Erythro');
  if (b.plan === 'swimmer') roots.push('Thalasso');
  if (b.plan === 'floater') roots.push('Nephelo');
  if (size) roots.push(size === 'big' ? 'Mega' : 'Micro');
  roots.push(colourRoot);
  if (roots.length < 3) roots.push(pick(nr, ['Xeno', 'Neo', 'Allo']));

  // Its looks: every list that is true of it, then one of those, then one word from that.
  const looks = [LOOKS[colour]];
  if (b.crystals) looks.push(LOOKS.crystal);
  if (b.glow) looks.push(LOOKS.glow);
  if (b.covering === 'fur') looks.push(LOOKS.fur);
  if (b.armor && !b.crystals) looks.push(LOOKS.armor);
  if (b.sail) looks.push(LOOKS.sail);
  if (b.sacs) looks.push(LOOKS.sacs);
  if (b.covering === 'jelly') looks.push(LOOKS.jelly);
  if (!b.eyes && b.plan !== 'plant') looks.push(LOOKS.blind);
  if (b.eyes >= 3) looks.push(LOOKS.eyes[Math.min(4, b.eyes)]);
  if (b.eyes && b.eyeSize > 1.5 && !b.crystals) looks.push(LOOKS.bigEyes);
  if (b.eyes && b.eyeSize < 1) looks.push(LOOKS.hooded);
  if (b.plan === 'walker' && LOOKS.legs[b.legs]) looks.push(LOOKS.legs[b.legs]);
  if (b.plan === 'walker' || b.plan === 'flyer') looks.push(b.tail ? LOOKS.tail : LOOKS.noTail);
  if (size) looks.push(LOOKS[size]);

  const nouns = b.plan === 'crawler' ? NOUNS.crawler[b.crystals ? 'rock' : 'mite'] : NOUNS[b.plan][b.build] || Object.values(NOUNS[b.plan])[0];
  return {
    genus: pick(nr, roots) + pick(nr, ENDINGS[b.plan]),
    species: pick(nr, EPITHETS[classId]),
    common: `${pick(nr, pick(nr, looks))} ${env.place} ${pick(nr, nouns)}`,
  };
}

// ---------- Field notes ----------

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

function notes(env, b, cls) {
  const { g, temp, pressure, density, star, dark, chem, habitat } = env;
  const out = [];
  const gs = gText(g);
  const rock = b.crystals; // a body of silicon: no lungs, no bones, no blood, no eyelids

  // Gravity
  let gt;
  if (b.plan === 'flyer') {
    gt = g < 1 ? `At ${gs} the pull is gentle and the air is thick, so a light body stays up easily.`
      : g < 1.3 ? `At ${gs}, close to Earth’s pull, the air is thick enough to hold a light body up.`
      : `At ${gs} its weight would pin a walker down, but the air is thicker still and holds a light body up.`;
    gt += rock ? ` Its frame is a lattice of thin glassy struts, and its wings span about ${sizeText(b.size)}.` : ` Hollow bones keep it light, and its wings span about ${sizeText(b.size)}.`;
  } else if (b.plan === 'walker') {
    if (g >= 1.4) gt = `At ${gs} it weighs ${times(g)} what it would on Earth. It keeps low on ${NUM[b.legs]} thick legs set wide apart, like an elephant’s pillars, because a heavier body needs ${rock ? 'thicker props' : 'fatter bones'}. A fall here would hurt, so it never runs.`;
    else if (g < 0.7) gt = `At ${gs} it weighs only ${times(g)} what it would on Earth, so ${NUM[b.legs]} thin legs hold it up and it can grow tall. Long strides and big bounds cost it little.`;
    else gt = `At ${gs}, close to Earth’s pull, it stands on ${NUM[b.legs]} legs much like an Earth animal its size.`;
    gt += ` It stands about ${sizeText(b.size)} tall.`;
  } else if (b.plan === 'swimmer') {
    gt = `Water holds it up, so the ${gs} pull barely shapes it. That is why the biggest animal Earth ever grew, the blue whale, lives in the sea. This one is about ${sizeText(b.size)} long.`;
  } else if (b.plan === 'floater') {
    gt = g >= 6
      ? `At ${gs} anything that sinks is crushed and cooked in the deeps below. It spreads into a thin, wide disc of warm gas, ${sizeText(b.size)} across, to hang on the rising air.`
      : `There is no ground: anything that sinks too far is crushed and cooked. At ${gs} it stays up as a gas bag ${sizeText(b.size)} across, filled with hydrogen it warms itself, like a hot-air balloon.`;
  } else if (b.plan === 'burrower') {
    gt = `Digging means pushing, not lifting, so the ${gs} pull matters less underground. It is about ${sizeText(b.size)} long and shoves soil aside with a hard, shovel-shaped head.`;
  } else if (b.plan === 'plant') {
    gt = `Plants here hold themselves up against ${gs}. ${g > 1.2 ? 'Stronger gravity keeps them low and stout' : g < 0.8 ? 'Weak gravity lets them grow tall and slender' : 'That is close to Earth’s, so they grow to about Earth’s heights'}: this one reaches ${sizeText(b.size)}.`;
  } else {
    gt = rock
      ? `At ${gs} it hugs the rock in a low dome about ${sizeText(b.size)} across, with no legs at all: it moves by dissolving the stone in front of it.`
      : `At ${gs} it barely weighs anything, but at ${sizeText(b.size)} long it has no need for strength. It clings to grains of dust with ${NUM[b.legs]} stubby, clawed legs.`;
  }
  out.push({ k: 'gravity', label: `Gravity · ${gs}`, text: gt });

  // Air
  let at;
  if (pressure === 0) {
    at = habitat === 'under-ice'
      ? 'No air reaches the ocean under the ice. It takes dissolved oxygen and chemicals from the water through feathery gills.'
      : 'There is no air at all. It doesn’t breathe: when conditions turn bad it dries out into a dormant husk and waits, the way Earth’s tardigrades survive even open space.';
  } else if (habitat === 'sea' || habitat === 'under-ice') {
    at = env.gas
      ? `Above its ocean is a thick hydrogen sky at ${pressureText(pressure)} pressure. The water below is warm and dark, and it breathes through gills.`
      : 'It breathes through gills, pulling oxygen from the water as Earth’s fish do.';
  } else if (b.plan === 'plant') {
    at = `The air is ${pressureText(pressure)} pressure${pressure > 0.6 && pressure < 1.6 ? ', close to Earth’s' : ''}. It takes in carbon dioxide through pores in its leaves and gives off oxygen, as Earth’s plants do.`;
  } else if (pressure < 0.1 && b.plan === 'crawler') {
    at = `The air is barely there, ${pressureText(pressure)}. It doesn’t breathe at all: its rock body takes what it needs from the stone it eats.`;
  } else if (pressure < 0.1) {
    at = `The air is ${pressureText(pressure)}. A barrel chest and breathing sacs along its back pull in what little there is, and it seals its nostrils when the dust blows.`;
  } else if (b.plan === 'flyer') {
    at = `The air is ${denseText(density)}${g < 1 ? ' and the pull is gentle, so flying is cheap' : `, thick enough to make flying cheap even at ${gs}`}. It has broad wings and spends most of its life aloft.`;
  } else if (b.plan === 'floater') {
    at = !env.gas ? `It lives in the layer of cloud where the pressure is ${pressureText(pressure)} and the temperature is mild, far above the crushing surface. The droplets around it are sulfuric acid, so its skin has to resist acid.`
      : rock ? `The air is hydrogen and helium at ${pressureText(pressure)} pressure. At this heat the clouds are grains of rock, and it sieves that mineral dust for its food.`
      : `The air is hydrogen and helium at ${pressureText(pressure)} pressure. It eats the organic specks that drift down from above, like plankton.`;
  } else if (rock) {
    at = `The air is ${denseText(density)}, and nothing in it is any use to a body of rock. It doesn’t breathe: it takes what it needs from the stone it eats.`;
  } else if (density > 2) {
    at = `The air is ${denseText(density)}. It needs only small lungs, and sounds carry far, so it calls more than it looks.`;
  } else {
    at = `The air is ${pressureText(pressure)} pressure${pressure > 0.6 && pressure < 1.6 ? ', close to Earth’s,' : ''} and it breathes it much as we do.`;
  }
  out.push({ k: 'air', label: pressure === 0 ? 'Air · none' : `Air · ${pressure >= 1.9 ? Math.round(pressure) : pressure.toFixed(pressure < 0.1 ? 3 : 1)} atm`, text: at });

  // Light
  let lt;
  const eyes = b.eyes > 2 ? `${NUM[b.eyes]} eyes` : 'eyes';
  if (star === 'none') lt = 'With no star, the only light is what living things make. It has no eyes; long feelers taste the water, and it flashes patterns of its own light to find others.';
  else if (dark) lt = `Its world circles ${STARS[star].name}, but no sunlight reaches where it lives. It has no eyes and finds its way with feelers${b.glow ? ', and it carries its own glowing lure' : ''}.`;
  else if (b.plan === 'crawler' && !b.eyes) lt = `Its world circles ${STARS[star].name}, but at its size eyes are no use: it feels its way grain by grain.${star === 'red' ? ' Its dark skin soaks up what warmth the dim red light brings.' : ''}`;
  else if (b.plan === 'plant') lt = star === 'red'
    ? 'A red dwarf gives off most of its light as infrared. To catch as much of it as possible the leaves here are nearly black, not green.'
    : star === 'orange' ? 'An orange star’s light is redder than the Sun’s, so the leaves here may be orange-red, soaking up the colours there are most of.' : 'Under a Sun-like star the leaves are green, like Earth’s.';
  else if (rock && /night/.test(env.place)) lt = `Its world circles ${STARS[star].name}, but it keeps to the night side, where that star never rises. Its ${eyes} are lenses of clear crystal that see by the dull glow of the hot ${b.plan === 'floater' ? 'clouds' : 'rock'}.`;
  else if (rock) lt = star === 'red' ? `Its world circles a red dwarf, whose light is dim and mostly infrared. Its ${eyes} are lenses of clear crystal, wide open to that heat.${b.armor ? ' Red dwarfs flare, so it grew a shell against the bursts of radiation.' : ''}`
    : star === 'orange' ? `An orange dwarf’s light is softer and redder than the Sun’s. Its ${eyes} are lenses of clear crystal, tuned toward red.`
    : `Under a Sun-like star it sees through ${b.eyes > 2 ? `${NUM[b.eyes]} ` : ''}lenses of clear crystal, which no glare can burn.`;
  else if (star === 'red') lt = `Its world circles a red dwarf, whose light is dim and mostly infrared. ${b.eyes > 2 ? `It has ${NUM[b.eyes]} huge eyes that` : 'Its huge eyes'} see heat, and its skin is almost black to soak up warmth.${b.armor ? ' Red dwarfs flare, so it grew a shell against the bursts of radiation.' : ''}`;
  else if (star === 'orange') lt = `An orange dwarf’s light is softer and redder than the Sun’s, so its ${b.eyes > 2 ? `${NUM[b.eyes]} ` : ''}eyes are large and tuned toward red.`;
  else lt = b.eyeSize < 1 ? 'Under a fierce Sun-like star its eyes are small, set deep under a heavy brow, with a clear inner eyelid against the glare.' : `Under a Sun-like star it sees much as we do, with ${NUM[b.eyes]} forward-facing eyes.`;
  out.push({ k: 'light', label: `Light · ${star === 'none' ? 'none' : dark ? 'dark' : STARS[star].name.replace(/^an? /, '').replace(/ like the Sun$/, '')}`, text: lt });

  // Heat and chemistry
  let ht;
  const swims = b.plan === 'swimmer';
  if (chem === 'silicon') ht = `At ${tempText(temp)} water can’t stay liquid, so it can’t be built like us. The lab guesses at a body of silicon, like rock, and like Star Trek’s Horta.`;
  else if (b.plan === 'crawler') ht = `With no air to hold heat, the ground swings from baking to freezing between day and night, around ${tempText(temp)} on average. It rides out the extremes dried up and dormant.`;
  else if (chem === 'ammonia') ht = 'Deep in an ice giant, water mixes with ammonia under huge pressure. Its blood would be part ammonia, which keeps it liquid.';
  else if (b.plan === 'plant') {
    ht = temp < 262 ? `At ${tempText(temp)} it lives with frost. Its sap is thick with sugars that work as antifreeze, as in Earth’s conifers, and it grows only in the short thaw.`
      : temp < 283 ? `At ${tempText(temp)} it lives in the cold, near freezing. It grows slowly and keeps its leaves small and waxy, like the plants of Earth’s tundra.`
      : `At ${tempText(temp)}, mild by Earth’s standards, it needs no special tricks against heat or cold.`;
  } else if (swims && habitat !== 'under-ice') {
    ht = temp > 305 ? `The water is about ${tempText(temp)}, ${temp < 318 ? 'as warm as a bath' : temp < 373 ? 'as hot as a hot spring' : 'kept from boiling only by the pressure'}, and warm water holds little oxygen. It has broad gills and never hurries.`
      : temp < 262 ? `The water is about ${tempText(temp)}, so salty that it stays liquid well below freezing. Its blood is as salty as the sea, and a thick layer of fat keeps it warm.`
      : temp < 283 ? `The water is about ${tempText(temp)}, near freezing. A thick layer of fat under its skin keeps it warm, like a seal’s blubber.`
      : `The water is about ${tempText(temp)}, mild by Earth’s standards, so it needs no special tricks against heat or cold.`;
  } else if (temp < 262 && habitat !== 'under-ice') {
    // Salt keeps water liquid to about 200 K (the perchlorate brines suspected on Mars), and ammonia to 176 K. Colder
    // than that the lab has nothing to offer but a guess.
    const warm = b.covering === 'fur' ? 'Thick fur and a layer of fat keep it warm' : '';
    const blood = temp >= 200 ? `its blood is salty enough not to freeze${chem === 'brine' ? ', like the brines that may seep under Mars' : ''}`
      : temp >= 176 ? 'the lab guesses its blood is water mixed with ammonia, which stays liquid far colder than any brine'
      : 'what runs in its veins is the lab’s guess: even water mixed with ammonia freezes solid at this temperature';
    ht = `At ${tempText(temp)} it lives with frost. ${warm ? `${warm}, and ${blood}` : blood.charAt(0).toUpperCase() + blood.slice(1)}.`;
  } else if (habitat === 'under-ice') ht = `The water is about ${tempText(temp)}, kept liquid by heat from the planet’s core. It gathers around hot vents on the sea floor, as tube worms do on Earth.`;
  else if (b.plan === 'floater') ht = `It rides at the height where it is about ${tempText(temp)}, warm enough for water droplets to stay liquid. Too high it freezes, too low it cooks, so it spends its life adjusting how much gas it holds.`;
  else if (temp > 305 && b.plan === 'burrower') ht = `At ${tempText(temp)} it keeps cool by staying underground through the heat of the day, as desert animals do on Earth, and comes up at night.`;
  else if (temp > 305 && b.sail) ht = `At ${tempText(temp)} its problem is shedding heat. The sail on its back is full of blood vessels and works as a radiator, and it rests in the shade by day.`;
  else if (temp > 305) ht = `At ${tempText(temp)} it keeps cool with a pale skin that reflects light, and it does its moving at night.`;
  else if (temp < 283) ht = `At ${tempText(temp)} it lives in the cold, near freezing. A thick layer of fat under its skin keeps it warm, like a seal’s blubber.`;
  else ht = `At ${tempText(temp)}, mild by Earth’s standards, it needs no special tricks against heat or cold.`;
  out.push({ k: 'heat', label: `Heat · ${signed(celsius(temp))} °C`, text: ht });

  return out;
}

export function summary(c) {
  return `${c.name.common} (${c.name.genus} ${c.name.species}), grown for ${c.world ? c.world.name : label(c.cls)}`;
}
