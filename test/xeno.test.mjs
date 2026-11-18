// The xenobiology lab's rules: the same seed grows the same creature, every class grows something sensible,
// and the body follows the world (gravity, light, air) the way the field notes say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grow, WORLDS, ODDS, oddsFor } from '../js/xeno-gen.js';
import { CLASSES, byId } from '../js/classes.js';
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
