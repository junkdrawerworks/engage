// The xenobiology lab's rules: the same seed grows the same creature, every class grows something sensible,
// and the body follows the world (gravity, light, air) the way the field notes say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { grow, growFor, WORLDS, ODDS, oddsFor, summary } from '../js/xeno-gen.js';
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

