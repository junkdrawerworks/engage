// The xenobiology lab's rules: the same seed grows the same creature, every class grows something sensible,
// and the body follows the world (gravity, light, air) the way the field notes say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { grow, growFor, WORLDS, ODDS, oddsFor, summary, EPITHETS, ENDINGS, NOUNS, LOOKS, SEEDS as LAB_SEEDS, CENSUS, READINGS, RECORDS, takeCensus, rarityFor, recordFor, sizeText, gText, bench, BENCH, STEPS, benchPos, benchValue, readingsOf, changedParts, fileFor, compare, neighbours } from '../js/xeno-gen.js';
import { CLASSES, byId, LAB_WORLDS, grows, worldByName } from '../js/classes.js';
import { widthFor } from '../js/physics.js';
import { SPECIMENS, specimensFor } from '../js/species.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 37 + 1);
const all = CLASSES.flatMap(c => SEEDS.map(s => grow(c.id, s)));

test('every planet class has lab rules', () => {
  for (const c of CLASSES) assert.ok(WORLDS[c.id], `no lab rules for ${c.id}`);
  assert.deepEqual(Object.keys(WORLDS).sort(), CLASSES.map(c => c.id).sort());
});

test('the same class and seed always grow the same creature', () => {
  assert.deepEqual(grow('M', 482), grow('M', 482));
  assert.notDeepEqual(grow('M', 482).name, grow('M', 483).name);
  // A creature for a real planet has a name of its own, not its class's creature's with the same number.
  assert.notDeepEqual(growFor('Proxima b', 482).name, grow('M', 482).name);
});

test('a creature drawn pale is not said to be black', () => {
  // Under a red dwarf the notes said "its skin is almost black" of every animal, and a furred one is drawn pale:
  // every walker and flyer grown for Proxima b, TRAPPIST-1 e and LHS 1140 b, which are cold enough for fur.
  const light = c => c.notes.find(n => n.k === 'light').text;
  let furred = 0, dark = 0;
  const grown = [...all, ...LAB_WORLDS.flatMap(({ world }) => Array.from({ length: 60 }, (_, i) => growFor(world, i + 1)))];
  for (const c of grown) {
    const t = light(c), where = `${c.world ? c.world.name : c.classId}-${c.seed}: ${t}`;
    if (!/almost black/.test(t)) continue;
    if (c.body.covering === 'fur') { furred++; assert.match(t, /the skin under its pale fur is almost black/, where); assert.ok(c.body.color.l >= 70, where); }
    else { dark++; assert.match(t, /its skin is almost black/, where); assert.ok(c.body.color.l <= 26, where); }
  }
  assert.ok(furred > 50 && dark > 50, `${furred} furred and ${dark} dark creatures under red dwarfs`);
});

test('a class has many names, and no one name for most of its creatures', () => {
  // The first 200 specimens of each class. Lava worlds and hot Jupiters used to have one name between all 200, Class N
  // three, and six classes a single Latin name.
  const everyName = new Set();
  for (const c of CLASSES) {
    const common = new Map(), latin = new Set();
    for (let seed = 1; seed <= 200; seed++) {
      const { name } = grow(c.id, seed);
      common.set(name.common, (common.get(name.common) || 0) + 1);
      latin.add(`${name.genus} ${name.species}`);
      everyName.add(name.common);
    }
    const [top, n] = [...common].sort((a, b) => b[1] - a[1])[0];
    assert.ok(common.size >= 25, `${c.id}: only ${common.size} names in 200 creatures`);
    assert.ok(n <= 30, `${c.id}: ${n} of 200 are called “${top}”`);
    assert.ok(latin.size >= 20, `${c.id}: only ${latin.size} Latin names in 200 creatures`);
  }
  assert.ok(everyName.size > 1500, `${everyName.size} names in 3,400 creatures`);
});

test('a name says only what is true of the creature', () => {
  // The first word of the common name is one of the lab's words for something about the body. Whichever list it is
  // from, that thing has to be so. (Glassy is in two lists: crystal and jelly.)
  const [dwarf, giant] = [new Set(LOOKS.small), new Set(LOOKS.big)];
  const colours = ['black', 'pale', 'red', 'sandy', 'copper', 'green', 'teal', 'blue'];
  const is = {
    crystal: b => b.crystals, glow: b => b.glow, fur: b => b.covering === 'fur', armor: b => b.armor, sail: b => b.sail, sacs: b => b.sacs,
    jelly: b => b.covering === 'jelly', blind: b => b.eyes === 0, bigEyes: b => b.eyes > 0 && b.eyeSize > 1.5, hooded: b => b.eyes > 0 && b.eyeSize < 1,
    tail: b => b.tail, noTail: b => !b.tail, small: () => true, big: () => true,
    black: b => b.color.l <= 26, pale: b => b.color.l >= 70, red: b => b.color.h < 20 || b.color.h >= 345, sandy: b => b.color.h >= 20 && b.color.h < 80 && b.color.l >= 55,
    copper: b => b.color.h >= 20 && b.color.h < 80 && b.color.l < 55, green: b => b.color.h >= 80 && b.color.h < 160,
    teal: b => b.color.h >= 160 && b.color.h < 200, blue: b => b.color.h >= 200 && b.color.h < 345,
  };
  const seen = new Set();
  const bySize = new Map(); // plan -> sizes called small, and sizes called big
  for (const c of all) {
    const { body: b, name, env } = c;
    const first = name.common.split(' ')[0];
    const eyes = { 'Three-eyed': 3, 'Four-eyed': 4 }[first], legs = { 'Two-legged': 2, 'Six-legged': 6, 'Eight-legged': 8 }[first];
    if (eyes) { assert.equal(b.eyes, eyes, `${c.classId}-${c.seed} ${name.common}`); seen.add('eyes'); continue; }
    if (legs) { assert.equal(b.legs, legs, `${c.classId}-${c.seed} ${name.common}`); seen.add('legs'); continue; }
    const lists = Object.keys(is).filter(k => LOOKS[k].includes(first));
    assert.ok(lists.length, `${c.classId}-${c.seed}: “${first}” is not one of the lab’s words`);
    assert.ok(lists.some(k => is[k](b)), `${c.classId}-${c.seed} is called ${name.common}, and is not ${lists.join(' or ')}`);
    for (const k of lists) if (is[k](b)) seen.add(k);
    if (dwarf.has(first) || giant.has(first)) {
      const plan = b.plan === 'crawler' && !b.crystals ? 'mite' : b.plan;
      const e = bySize.get(plan) || bySize.set(plan, { small: [], big: [] }).get(plan);
      e[dwarf.has(first) ? 'small' : 'big'].push(b.size);
    }
    // The place in the middle is where it lives, and the last word is one for its shape.
    assert.ok(name.common.includes(` ${env.place} `), name.common);
    const nouns = b.plan === 'crawler' ? NOUNS.crawler[b.crystals ? 'rock' : 'mite'] : NOUNS[b.plan][b.build] || Object.values(NOUNS[b.plan])[0];
    assert.ok(nouns.includes(name.common.split(' ').pop()), `${c.classId}-${c.seed} ${name.common} (${b.plan}, ${b.build})`);
    assert.ok(ENDINGS[b.plan].some(e => name.genus.endsWith(e)) && EPITHETS[c.classId].includes(name.species), `${name.genus} ${name.species}`);
  }
  // Anything called a dwarf is smaller than anything of its kind called a giant.
  for (const [plan, e] of bySize) if (e.small.length && e.big.length) assert.ok(Math.max(...e.small) < Math.min(...e.big), `${plan}: a “lesser” one is bigger than a “greater” one`);
  // Every kind of word turned up, so each was checked.
  for (const k of [...Object.keys(is), 'eyes', 'legs']) assert.ok(seen.has(k), `no creature was named for ${k}`);
  assert.ok(colours.every(k => seen.has(k)));
});

test('the lab’s words are plain ones', () => {
  const looks = Object.values(LOOKS).flatMap(v => (Array.isArray(v) ? v : Object.values(v).flat()));
  const nouns = Object.values(NOUNS).flatMap(v => Object.values(v).flat());
  const latin = [...Object.values(EPITHETS).flat(), ...Object.values(ENDINGS).flat()];
  for (const w of looks) assert.match(w, /^[A-Z][a-z]+(-[a-z]+)?$/, w);
  for (const w of nouns) assert.match(w, /^[a-z]+(-[a-z]+)?$/, w);
  for (const w of latin) assert.match(w, /^[a-z]{4,}$/, w);
  // Each slot has a few honest alternatives, and a class three or four species.
  for (const [k, v] of Object.entries(NOUNS)) for (const list of Object.values(v)) assert.ok(list.length >= 4 && new Set(list).size === list.length, `${k}: ${list}`);
  for (const [k, v] of Object.entries(EPITHETS)) assert.ok(v.length >= 3 && v.length <= 4 && new Set(v).size === v.length, `${k}: ${v}`);
  for (const v of Object.values(ENDINGS)) assert.equal(v.length, 2);
  assert.deepEqual(Object.keys(EPITHETS).sort(), CLASSES.map(c => c.id).sort());
  assert.equal(new Set(Object.values(EPITHETS).flat()).size, Object.values(EPITHETS).flat().length, 'two classes share a species name');
  // Nothing rude, in a word or across the join of a made-up genus (the list first contact's languages are held to,
  // and a few more), and no genus Earth already has a famous one of.
  const rude = /fuk|fuck|suk|kok|cock|kum|cum|pis|dik|dick|pus|kike|shit|paki|rape|nazi|pedo|nig|peni|tit|arse|anus|sex|slut|fag|crap|damn|poo/i;
  for (const w of [...looks, ...nouns, ...latin]) assert.doesNotMatch(w, rude, w);
  const genera = new Set(all.map(c => c.name.genus));
  for (const g of genera) {
    assert.doesNotMatch(g, rude, g);
    assert.match(g, /^[A-Z][a-z]+$/, g);
    assert.ok(!['Rhododendron', 'Philodendron', 'Homo', 'Tyrannosaurus'].includes(g), g);
  }
  assert.ok(genera.size > 150, `${genera.size} genera`);
});

test('every creature has a name, a size and four readable field notes', () => {
  for (const c of all) {
    assert.ok(c.name.common && c.name.genus && c.name.species, `${c.classId} ${c.seed} has no name`);
    assert.ok(c.body.size > 0 && Number.isFinite(c.body.size), `${c.classId} ${c.seed} has size ${c.body.size}`);
    assert.equal(c.notes.length, 4);
    for (const n of c.notes) assert.doesNotMatch(n.text + n.label, /undefined|NaN|null|Infinity/, `${c.classId} ${c.seed}: ${n.text}`);
  }
});

test('the field notes read as sentences', () => {
  // No doubled spaces, no sentence that starts in lower case, no "143% of as dense".
  for (const c of all) for (const n of c.notes) assert.doesNotMatch(n.text, /  |\. [a-z]|% of as|^[a-z]|[^.]$/, `${c.classId}-${c.seed}: ${n.text}`);
});

test('the field notes describe the creature that was grown', () => {
  const text = c => c.notes.map(n => n.text).join(' ');
  const id = c => `${c.classId}-${c.seed} (${c.body.plan})`;
  let plants = 0, rocks = 0, lowFlyers = 0, highFlyers = 0, swimmers = 0, coldest = 0;
  for (const c of all) {
    const t = text(c), { env, body } = c;
    if (body.plan === 'plant') {
      plants++;
      assert.doesNotMatch(t, /blood|\bfat\b|blubber|breath|lungs|gills|nostril/, `${id(c)}: a plant with an animal’s insides: ${t}`);
    }
    if (body.crystals) {
      rocks++;
      assert.doesNotMatch(t, /lungs|bones|eyelid|blood|skin|organic|breathes it/, `${id(c)}: a body of rock with soft parts: ${t}`);
    }
    if (body.plan === 'flyer') {
      if (env.g < 1) { lowFlyers++; assert.doesNotMatch(t, /\bpin\b/, `${id(c)} at ${env.g} g: ${t}`); }
      if (env.g >= 1.3) { highFlyers++; assert.doesNotMatch(t, /gentle/, `${id(c)} at ${env.g} g: ${t}`); }
    }
    if (body.plan === 'swimmer') {
      swimmers++;
      assert.doesNotMatch(t, /at night|reflects light|rests in the shade|lives with frost/, `${id(c)}: a swimmer with a land animal’s habits: ${t}`);
    }
    // Nothing that lives in the dark is said to do anything with sunlight.
    if (env.dark) assert.doesNotMatch(t, /reflects light|in the shade|against the glare/, `${id(c)}: ${t}`);
    // Salt keeps water liquid to about 200 K, the coldest brines suspected on Mars; colder than that the lab says it is guessing.
    // (A planetoid's mite sits the cold out dried up, so nothing is said about its blood.)
    if (env.temp < 200 && env.chem === 'brine' && body.plan !== 'crawler') { coldest++; assert.doesNotMatch(t, /Mars|salty/, `${id(c)} at ${env.temp} K: ${t}`); assert.match(t, /guess/); }
    if (body.plan === 'walker' && env.g >= 1.4) assert.match(t, /it weighs \d[\d.]* times what it would on Earth/, `${id(c)}: ${t}`);
  }
  // Every one of those kinds turned up, so the checks above checked something.
  for (const [n, what] of [[plants, 'plants'], [rocks, 'rock bodies'], [lowFlyers, 'flyers under 1 g'], [highFlyers, 'flyers over 1.3 g'], [swimmers, 'swimmers'], [coldest, 'creatures below 200 K']]) {
    assert.ok(n > 20, `only ${n} ${what} to check`);
  }
});

test('the odds line doesn’t promise animals where there are only plants', () => {
  for (const c of all) {
    assert.equal(/animals/.test(oddsFor(c)), c.body.plan !== 'plant' && (c.odds === 'likely' || c.odds === 'possible'), `${c.classId}-${c.seed}: ${oddsFor(c)}`);
    if (c.body.plan !== 'plant') assert.equal(oddsFor(c), ODDS[c.odds]);
  }
  assert.equal(oddsFor(grow('L', 1)), 'Plausible. Earth is proof that this kind of place can grow plants like it.');
});

test('Class L grows plants, since it has no animals', () => {
  for (const c of all.filter(c => c.classId === 'L')) assert.equal(c.body.plan, 'plant');
});

test('gas giants grow floaters, and a rogue planet grows things without eyes', () => {
  for (const c of all.filter(c => ['J', 'T', 'hot-jupiter', 'N'].includes(c.classId))) assert.equal(c.body.plan, 'floater');
  for (const c of all.filter(c => c.classId === 'R')) assert.equal(c.body.eyes, 0);
});

test('stronger gravity means more legs and a smaller walker', () => {
  const walkers = all.filter(c => c.body.plan === 'walker');
  for (const c of walkers) {
    if (c.env.g >= 2.2) assert.equal(c.body.legs, 8);
    if (c.env.g < 0.6) assert.equal(c.body.legs, 2);
  }
  const mean = list => list.reduce((s, c) => s + c.body.size, 0) / list.length;
  const heavy = walkers.filter(c => c.env.g >= 1.6), light = walkers.filter(c => c.env.g < 0.9);
  assert.ok(heavy.length > 10 && light.length > 10);
  assert.ok(mean(heavy) < mean(light), 'heavy-gravity walkers are not smaller');
});

test('eyes follow the light', () => {
  for (const c of all) {
    if (c.env.dark) assert.equal(c.body.eyes, 0, `${c.classId} ${c.seed} has eyes in the dark`);
    if (!c.env.dark && c.env.star === 'red' && c.body.eyes) assert.ok(c.body.eyeSize > 1.5);
  }
});

test('water can’t be the chemistry above 450 K', () => {
  for (const c of all.filter(c => c.env.temp > 450)) assert.equal(c.env.chem, 'silicon');
});

test('every reference specimen belongs to a real class, and every class has one', () => {
  for (const s of SPECIMENS) {
    assert.ok(byId.has(s.cls), `${s.name}: no class ${s.cls}`);
    for (const a of s.also || []) assert.ok(byId.has(a), `${s.name}: no class ${a}`);
  }
  for (const c of CLASSES) assert.ok(specimensFor(c.id).length > 0, `nothing on file for ${c.id}`);
});

// ---------- A creature for a real planet ----------

test('growing for real planets leaves every class creature as it was', () => {
  // The worlds, bodies and notes of 60 specimens of each class, as they were before the lab learned any real planet:
  // #M-42 and every jar must go on bringing back the same animal.
  const h = createHash('sha1');
  for (const c of CLASSES) for (let s = 1; s <= 60; s++) { const g = grow(c.id, s); h.update(JSON.stringify([g.env, g.body])); }
  assert.equal(h.digest('hex').slice(0, 12), '6ffd76cd15ea');
  const c = grow('M', 42);
  assert.equal(c.world, undefined);
  assert.equal(c.notes.length, 4);
  assert.equal(c.env.star, 'red');
  assert.equal(c.body.legs, 6);
});

test('the lab grows for six real planets, each with its own readings', () => {
  assert.deepEqual(LAB_WORLDS.map(x => x.world.name), ['Proxima b', 'Teegarden’s Star b', 'TRAPPIST-1 e', 'K2-18 b', 'LHS 1140 b', '55 Cancri e']);
  for (const { world, cls } of LAB_WORLDS) {
    assert.ok(['red', 'orange', 'yellow'].includes(world.sun), `${world.name}: star ${world.sun}`);
    // A minimum mass comes from the star's wobble, and a planet found that way has no measured width.
    assert.equal(!!world.least, !world.width, `${world.name}: a minimum mass goes with no width, and only then`);
    // Where the lab's rules put the creature at a depth it chooses (a cloud deck, a sea under hydrogen), the planet's
    // own temperature says nothing about where it lives, so those files get no real planets.
    assert.ok(!WORLDS[cls.id].gas && !WORLDS[cls.id].habitats.includes('cloud'), `${world.name} is on ${cls.id}, where the lab picks the depth`);
  }
  // The others say why not in js/classes.js; none of them slipped in.
  for (const name of ['GJ 1214 b', 'Gliese 436 b', 'TRAPPIST-1 b', 'Ægir', 'Luyten b']) assert.equal(grows(worldByName(name).world), false, name);
});

test('a creature for a real planet is always the same one, and takes the planet’s own readings', () => {
  for (const { world, cls } of LAB_WORLDS) {
    for (const seed of SEEDS.slice(0, 120)) {
      const c = growFor(world, seed);
      assert.deepEqual(c, growFor(world.name, seed));
      assert.equal(c.world, world);
      assert.equal(c.cls, cls);
      const { env } = c;
      assert.equal(env.mass, world.mass);
      assert.equal(env.width, world.width || widthFor(world.mass));
      assert.ok(Math.abs(env.g / (world.mass / env.width ** 2) - 1) < 1e-9);
      assert.equal(env.star, world.sun);
      if (env.habitat !== 'under-ice') assert.equal(env.temp, world.teq);
      else assert.ok(env.temp >= 273 && env.temp <= 283 && world.teq < 273, `${world.name}: an ice-covered sea at ${world.teq} K`);
      assert.ok(c.name.common && c.body.size > 0 && Number.isFinite(c.body.size));
      assert.equal(c.notes.length, 5);
      assert.deepEqual(c.notes[4], { k: 'known', label: 'What we really know', text: world.note });
      for (const n of c.notes) {
        assert.doesNotMatch(n.text + n.label, /undefined|NaN|null|Infinity/, `${world.name} ${seed}: ${n.text}`);
        assert.doesNotMatch(n.text, /  |\. [a-z]|^[a-z]|[^.]$/, `${world.name} ${seed}: ${n.text}`);
      }
      assert.match(c.notes[0].text, new RegExp(`^${world.name} is `));
      assert.match(summary(c), new RegExp(`grown for ${world.name}$`));
    }
    assert.notDeepEqual(growFor(world, 1).body, growFor(world, 2).body);
  }
  assert.throws(() => growFor('GJ 1214 b', 1), /No readings/);
  assert.throws(() => growFor('Vulcan', 1), /No readings/);
});

test('Proxima b: a red dwarf’s sky every time, and gravity from its mass if it is rock', () => {
  for (const seed of SEEDS) {
    const c = growFor('Proxima b', seed);
    assert.equal(c.env.star, 'red');
    assert.equal(c.env.temp, 218);
    // 1.055 Earth masses at least; a rocky world that heavy is about 1.015 Earth widths (Chen & Kipping 2017).
    assert.ok(Math.abs(c.env.width - 1.015) < 0.002, `width ${c.env.width}`);
    assert.ok(Math.abs(c.env.g / (1.055 / c.env.width ** 2) - 1) < 0.05, `g ${c.env.g}`);
    assert.match(c.notes[0].label, /^Gravity · 1 g, if it is rock$/);
    assert.match(c.notes[0].text, /^Proxima b is at least 1\.06 times as heavy as Earth, and nobody has measured its width\. If it is rock /);
    if (!c.env.dark && c.body.eyes) assert.ok(c.body.eyeSize > 1.5);
    assert.match(oddsFor(c), /^Plausible\. That is if Proxima b is the kind of place its file hopes for, which nobody knows yet\. Earth is proof/);
  }
  // A measured width is used as it is, and said so.
  const e = growFor('TRAPPIST-1 e', 7);
  assert.ok(Math.abs(e.env.g - 0.692 / 0.92 ** 2) < 1e-9);
  assert.match(e.notes[0].text, /^TRAPPIST-1 e is 0\.92 times as wide as Earth and 0\.69 times as heavy, which makes its pull 0\.82 g\. /);
  assert.equal(e.notes[0].label, 'Gravity · 0.82 g');
  // K2-18 b has no shore and no floor; 55 Cancri e is a lava world, which is no candidate for anything.
  for (const seed of SEEDS.slice(0, 60)) {
    const k = growFor('K2-18 b', seed);
    assert.deepEqual([k.env.habitat, k.env.place, k.body.plan], ['sea', 'open ocean', 'swimmer']);
  }
  assert.equal(oddsFor(growFor('55 Cancri e', 3)), ODDS.wild);
});

test('a real planet is found by its name however the link spells it', () => {
  assert.equal(worldByName('proxima B').world.name, 'Proxima b');
  assert.equal(worldByName("Teegarden's Star b").world.name, 'Teegarden’s Star b');
  assert.equal(worldByName('TRAPPIST-1 e').cls.id, 'M');
  assert.equal(worldByName('Vulcan'), null);
  assert.equal(worldByName(undefined), null);
});

// The census. The lab rolls specimen numbers 1 to 9,999 for each class, so every creature it can grow can be counted:
// 169,983 of them. The specimen card's rarity line and the Lab records shelf are read from a table and a list in
// js/xeno-gen.js, and this grows every creature again (about two seconds) and holds both to what it finds. If a rule
// about how creatures are grown has changed, it fails here: run `node tools/xeno-census.mjs`, which rewrites the
// table and prints who holds each record now, then set RECORDS to match.
test('the census and the lab’s records are what growing every creature gives', () => {
  const { counts, holders, readings, total } = takeCensus();
  assert.equal(total, 169983);
  assert.equal(LAB_SEEDS, 9999);
  assert.deepEqual(CENSUS, counts, 'the creatures have changed since the census was taken: run `node tools/xeno-census.mjs`');
  assert.deepEqual(READINGS, readings, 'the readings the bench names files by have changed: run `node tools/xeno-census.mjs`');
  for (const [cls, plans] of Object.entries(counts)) assert.equal(Object.values(plans).reduce((a, b) => a + b, 0), 9999, cls);
  // Every record on the shelf is held by the specimen it names, and by that one alone.
  assert.deepEqual(RECORDS.map(r => r.id).sort(), Object.keys(holders).sort(), 'the shelf and the census disagree about which records there are');
  for (const r of RECORDS) {
    const h = holders[r.id];
    assert.deepEqual([h.cls, h.seed, h.shared], [r.cls, r.seed, 1], `“${r.title}” has changed hands: run \`node tools/xeno-census.mjs\` and set RECORDS in js/xeno-gen.js to what it prints`);
    assert.equal(recordFor(grow(r.cls, r.seed)), r);
  }
  // The numbers the README and this round's notes quote, as they are at this commit.
  assert.deepEqual([counts.H.flyer, counts.M.flyer, counts.Y.walker, counts.O.flyer], [1, 171, 465, 537]);
  const of = id => { const r = RECORDS.find(x => x.id === id); return grow(r.cls, r.seed); };
  assert.deepEqual([sizeText(of('largest').body.size), sizeText(of('smallest').body.size), gText(of('gravity').env.g), sizeText(of('walker').body.size), gText(of('walker').env.g), sizeText(of('wings').body.size)],
    ['1 km', '0.5 mm', '25 g', '4.9 m', '0.56 g', '6.6 m']);
  assert.deepEqual([of('largest').body.plan, of('smallest').body.plan, of('walker').body.plan, of('wings').body.plan, of('lone').body.plan], ['floater', 'crawler', 'walker', 'flyer', 'flyer']);
});

test('a specimen’s card says how rare it is in its class, and nothing when it is not', () => {
  const flyer = (cls, n = 1) => { let seen = 0; for (let s = 1; s <= 9999; s++) { const c = grow(cls, s); if (c.body.plan === 'flyer' && ++seen === n) return c; } };
  assert.equal(rarityFor(grow('H', 1218)), 'One of a kind: the only Class H specimen that flies.');
  assert.equal(rarityFor(flyer('M')), 'Uncommon: 171 of Class M’s 9,999 specimens fly.');
  assert.equal(rarityFor(flyer('O')), 'Uncommon: 537 of Class O’s 9,999 specimens fly.');
  const walkerY = Array.from({ length: 9999 }, (_, i) => grow('Y', i + 1)).find(c => c.body.plan === 'walker');
  assert.equal(rarityFor(walkerY), 'Uncommon: 465 of Class Y’s 9,999 specimens walk.');
  // A plan a tenth or more of its class has, or the only plan its class has, is not worth a line.
  assert.equal(rarityFor(flyer('super-earth')), '');
  assert.equal(rarityFor(grow('L', 4)), '');
  assert.equal(rarityFor(grow('M', 1)), '');
  // The record-holders say their record; the lone desert flyer's record is its rarity, said once.
  assert.equal(rarityFor(grow('J', 9258)), 'Lab record: the largest of everything the lab can grow.');
  assert.equal(rarityFor(grow('K', 8371)), 'Lab record: the tallest of everything the lab can grow that walks.');
  assert.equal(rarityFor(grow('Y', 9622)), 'Lab record: the widest wings of everything the lab can grow.');
  for (const r of RECORDS) assert.ok(rarityFor(grow(r.cls, r.seed)), `${r.title} says nothing on its card`);
  // Across every class and a spread of seeds: a line is one of the three kinds, and names the creature's own class.
  for (const c of all) {
    const line = rarityFor(c);
    if (line) assert.match(line, /^(One of a kind: the only .+ specimen that \w+( a plant)?\.|Uncommon: [\d,]+ of .+’s 9,999 specimens \w+\.|Lab record: .+\.)( Lab record: .+\.)?$/, line);
  }
  // A creature grown for a real planet is outside the census, whatever its number.
  for (const { world } of LAB_WORLDS) for (const seed of [1218, 9258, 8022, 7]) assert.equal(rarityFor(growFor(world.name, seed)), '', `${world.name}-${seed}`);
  // With a census in which a plan were the only one of its kind among an unnamed class, the words still read.
  assert.equal(rarityFor(flyer('super-earth'), { 'super-earth': { flyer: 1 } }), 'One of a kind: the only super-earth specimen that flies.');
  assert.equal(rarityFor(flyer('super-earth'), { 'super-earth': { flyer: 40 } }), 'Uncommon: 40 of the super-earth’s 9,999 specimens fly.');
});

// ---------- The bench ----------

const BODY = c => JSON.stringify([c.body, c.name, c.notes]);

test('the bench grows the same creature at its own readings, for a class or a real planet', () => {
  for (const c of all.filter((_, i) => i % 7 === 0)) assert.equal(BODY(bench({ id: c.classId, seed: c.seed }, readingsOf(c))), BODY({ ...c, notes: c.notes }), `${c.classId}-${c.seed}`);
  for (const { world } of LAB_WORLDS) for (const seed of [1, 42, 977, 5000]) {
    const c = growFor(world, seed), b = bench({ world: world.name, seed }, readingsOf(c));
    assert.equal(JSON.stringify([b.body, b.name]), JSON.stringify([c.body, c.name]), `${world.name}-${seed}`);
    assert.deepEqual(b.bench.from, { world: world.name, seed });
  }
  // And the same readings always grow the same one.
  assert.deepEqual(bench({ id: 'M', seed: 42 }, { g: 2.5, pressure: 0.01, star: 'red', temp: 250 }), bench({ id: 'M', seed: 42 }, { g: 2.5, pressure: 0.01, star: 'red', temp: 250 }));
  assert.throws(() => bench({ world: 'GJ 1214 b', seed: 1 }, { g: 1, pressure: 1, star: 'red', temp: 288 }));
});

test('a slider changes only what its reading decides', () => {
  const same = (a, b, keys, where) => { for (const k of keys) assert.deepEqual(b.body[k], a.body[k], `${where}: ${k}`); };
  let legs = 0, eyes = 0, fur = 0, wings = 0;
  for (const c of all.filter((_, i) => i % 5 === 0)) {
    const from = { id: c.classId, seed: c.seed }, r = readingsOf(c), where = `${c.classId}-${c.seed}`;
    // Gravity: the colour, the eyes and the coat stay as they were.
    for (const g of [0.05, 0.4, 2.6, 12]) {
      const b = bench(from, { ...r, g });
      same(c, b, ['color', 'accent', 'wobble', 'eyes', 'eyeSize', 'covering', 'glow'], `${where} at ${g} g`);
      if (b.body.legs !== c.body.legs) legs++;
      if (b.body.plan !== c.body.plan) wings++;
    }
    // Light: a walker keeps its legs, build and size. (A swimmer in a sea gone dark grows smaller.)
    for (const star of ['none', 'red', 'orange', 'yellow']) {
      const b = bench(from, { ...r, star });
      same(c, b, c.body.plan === 'walker' ? ['plan', 'legs', 'build', 'size', 'sacs', 'tail'] : ['plan'], `${where} under ${star}`);
      if (b.body.eyes !== c.body.eyes || b.body.eyeSize !== c.body.eyeSize) eyes++;
    }
    // Heat: a walker that stays a walker keeps its legs. (Cold air is thicker, and can lift a walker into the air.)
    for (const temp of [200, 300, 340]) {
      const b = bench(from, { ...r, temp });
      same(c, b, b.body.plan === 'walker' && c.body.plan === 'walker' ? ['legs', 'build', 'wobble'] : ['wobble'], `${where} at ${temp} K`);
      if (b.body.covering !== c.body.covering) fur++;
    }
  }
  assert.ok(legs > 100 && eyes > 100 && fur > 100 && wings > 10, `${legs} leg changes, ${eyes} eye changes, ${fur} coat changes, ${wings} walkers that took wing or landed`);
  // More gravity, more legs: the Class M walker at 1.2 g on six, at 2.5 g on eight and squat, at 0.4 g on two and lanky.
  const m = grow('M', 42);
  assert.deepEqual([m.body.plan, m.body.legs], ['walker', 6]);
  const at = g => bench({ id: 'M', seed: 42 }, { ...readingsOf(m), g }).body;
  assert.deepEqual([at(2.5).legs, at(2.5).build, at(0.4).legs, at(0.4).build], [8, 'squat', 2, 'lanky']);
  assert.ok(at(0.4).size > m.body.size && at(2.5).size < m.body.size);
  // What changed, as the art lights it up.
  assert.deepEqual(changedParts(m.body, at(2.5)), ['legs']);
  assert.deepEqual(changedParts(m.body, m.body), []);
  assert.deepEqual(changedParts(m.body, bench({ id: 'M', seed: 42 }, { ...readingsOf(m), g: 0.3, pressure: 20 }).body), ['body']);
});

test('the bench’s sliders: where a reading sits and what each place reads', () => {
  for (const kind of ['g', 'pressure', 'temp']) {
    const { lo, hi, marks } = BENCH[kind];
    assert.equal(benchValue(kind, STEPS), hi);
    assert.equal(benchValue(kind, kind === 'pressure' ? 1 : 0), lo);
    for (let p = 0; p <= STEPS; p += 7) assert.equal(benchPos(kind, benchValue(kind, p)), p, `${kind} at ${p}`);
    let last = -1;
    for (const [, v] of marks) { const p = benchPos(kind, v); assert.ok(p > last + 30, `${kind}: the marks are crowded at ${v}`); last = p; }
  }
  assert.equal(benchValue('pressure', 0), 0);
  assert.equal(benchPos('pressure', 0), 0);
  assert.deepEqual([0, 1, 2, 3].map(p => benchValue('star', p)), ['none', 'red', 'orange', 'yellow']);
  // Every creature the lab grows sits on the sliders, not off either end.
  for (const c of all) for (const k of ['g', 'temp']) assert.ok(c.env[k] >= BENCH[k].lo && c.env[k] <= BENCH[k].hi, `${c.classId}-${c.seed}: ${k} ${c.env[k]}`);
  for (const { world } of LAB_WORLDS) assert.ok(growFor(world, 1).env.g >= BENCH.g.lo, world.name);
});

test('the bench says which survey file its readings would pass for', () => {
  const at = (g, pressure, star, temp, habitat) => fileFor({ g, pressure, star, temp }, habitat).id;
  assert.equal(at(1, 1, 'yellow', 288, 'land'), 'M');
  assert.equal(at(0.38, 0.0063, 'yellow', 210, 'burrow'), 'K');
  assert.equal(at(0.9, 1, 'yellow', 320, 'cloud'), 'N');
  assert.equal(at(0.17, 0, 'yellow', 250, 'rock'), 'D');
  assert.equal(at(2.5, 3, 'orange', 300, 'land'), 'super-earth');
  assert.equal(at(1, 0, 'none', 280, 'under-ice'), 'R');
  // A creature's own readings pass for its own file, and any other a reading the bench names holds them all.
  for (const c of all) {
    const id = fileFor(readingsOf(c), c.env.habitat, c.classId).id;
    assert.equal(id, c.classId, `${c.classId}-${c.seed}`);
    const other = fileFor(readingsOf(c), c.env.habitat).id, R = READINGS[other];
    for (const k of ['g', 'pressure', 'temp']) assert.ok(c.env[k] >= R[k][0] && c.env[k] <= R[k][1], `${c.classId}-${c.seed} passed for ${other} with ${k} ${c.env[k]}`);
  }
});

test('with no star, a creature on land isn’t said to taste the water', () => {
  for (const c of all.filter(c => c.env.habitat !== 'sea' && c.env.habitat !== 'under-ice').slice(0, 800)) {
    const b = bench({ id: c.classId, seed: c.seed }, { ...readingsOf(c), star: 'none' });
    const light = b.notes.find(n => n.k === 'light');
    assert.doesNotMatch(light.text, /water/, `${c.classId}-${c.seed}: ${light.text}`);
    assert.match(light.text, /^With no star, the only light is what living things make\. It has no eyes/);
    assert.equal(light.label, 'Light · none');
    assert.equal(b.body.eyes, 0);
  }
});

// ---------- Side by side ----------

test('two creatures side by side: a row for each field note, and a sentence from the difference', () => {
  const at = g => bench({ id: 'M', seed: 42 }, { ...readingsOf(grow('M', 42)), g });
  // The idea's own example: thin legs in weak gravity, eight thick ones in strong.
  const { rows, sentence } = compare(at(0.4), at(2.5));
  assert.deepEqual(rows.map(r => [r.label, r.a, r.b, r.alike]), [['Gravity', '0.4 g', '2.5 g', false], ['Air', '1.1 atm', '1.1 atm', true], ['Light', 'red dwarf', 'red dwarf', true], ['Heat', '−7 °C', '−7 °C', true]]);
  assert.match(sentence, /^Gravity: 0\.4 g against 2\.5 g\. That is why one stands [\d.]+ m tall on two thin legs and the other stands \d+ cm tall on eight thick legs\.$/);
  // Thin air against Earth's: breathing sacs.
  assert.equal(compare(grow('K', 8371), grow('M', 42)).sentence, 'Air: 0.017 atm against 1.1 atm. That is why one breathes through sacs along its back and the other breathes much as we do.');
  // A swimmer and a walker differ because one lives in the water, whatever the readings say.
  assert.match(compare(grow('O', 5), grow('M', 5)).sentence, /^One lives in the .+ and the other in the .+, and that, more than any reading, is why one is a swimmer .+ long and the other stands .+ tall/);
  // The same creature twice is alike in every row.
  const same = compare(grow('M', 42), grow('M', 42));
  assert.ok(same.rows.every(r => r.alike));
  assert.equal(same.sentence, 'Their worlds read alike, so what tells them apart is chance.');
  // Any two, from any classes and real planets: four rows with a reading on each side, and one plain sentence.
  const pool = [...all.filter((_, i) => i % 13 === 0), ...LAB_WORLDS.map(({ world }) => growFor(world, 7))];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i], b = pool[(i * 7 + 3) % pool.length], c = compare(a, b);
    assert.equal(c.rows.length, 4);
    for (const r of c.rows) assert.ok(r.a && r.b && !/undefined/.test(r.a + r.b), `${a.classId}-${a.seed} / ${b.classId}-${b.seed}: ${JSON.stringify(r)}`);
    assert.match(c.sentence, /^[A-Z][^]*\.$/);
    assert.doesNotMatch(c.sentence, /undefined|NaN|  /, c.sentence);
  }
});

// ---------- Its neighbours ----------

test('its neighbours: what it eats is smaller, what eats it is a hunter, each with a reason for its shape', () => {
  let n = 0;
  for (const c of all) {
    const kin = neighbours(c), where = `${c.classId}-${c.seed}`;
    if (c.body.plan === 'plant' || c.body.plan === 'crawler') { assert.equal(kin, null, where); continue; }
    n++;
    assert.deepEqual(kin, neighbours(c), `${where}: not the same neighbours twice`);
    assert.ok(kin.eats.body.size < c.body.size, `${where}: what it eats is bigger than it`);
    if (c.body.plan !== 'floater') assert.ok(kin.eaten.body.size > c.body.size, `${where}: what eats it is smaller than it`);
    assert.equal(kin.eats.env, c.env, `${where}: a neighbour from another world`);
    assert.match(kin.eats.name.common, /(grazer|browser|nibbler|cropper|flitter|darter|skimmer|sifter|drifter|worm|threader|root-eater|sinker|drop|pellet)$/, where);
    assert.match(kin.eaten.name.common, /(stalker|prowler|hunter|ambusher|pouncer|raptor|stooper|swift|chaser|lurker|snapper|biter|tunnel-lurker)$/, where);
    for (const k of [kin.eats, kin.eaten]) {
      assert.match(k.note, /^It (stands|is) about [\d.]+ (mm|cm|m|km) (tall|long|across|from wing tip to wing tip)\. [A-Z].+\.$/, `${where}: ${k.note}`);
      assert.doesNotMatch(k.note, /undefined|NaN/, where);
    }
    if (c.body.plan === 'floater') {
      assert.match(kin.eats.note, /A sinker, one of the three kinds of life Carl Sagan and Edwin Salpeter imagined/);
      assert.equal(kin.eaten.body.plan, 'swimmer');
      assert.doesNotMatch(kin.eaten.name.genus, /^Thalasso/, `${where}: a hunter of the clouds named for the sea`);
    }
    // Plants only where the lab draws them.
    if (!['M', 'L', 'O', 'super-earth'].includes(c.classId)) assert.doesNotMatch(kin.eats.note, /plants/, `${where}: ${kin.eats.note}`);
  }
  assert.ok(n > 3000, `${n} creatures with neighbours`);
  // In strong gravity a hunter can't leap, so it waits; in weak gravity it bounds.
  const heavy = all.find(c => c.body.plan === 'walker' && c.env.g >= 1.4), light = all.find(c => c.body.plan === 'walker' && c.env.g < 0.7);
  assert.match(neighbours(heavy).eaten.note, /a hunter can’t leap or chase without breaking a leg, so it waits low beside the trail and lunges\.$/);
  assert.match(neighbours(light).eaten.note, /a hunter covers ground in long bounds/);
  // A real planet's creature has neighbours of its own.
  assert.ok(neighbours(growFor('Proxima b', 7)).eats.name.common);
});
