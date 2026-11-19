// First contact, as rules: no drawing and no page, so it can be tested on its own.
// An unknown ship hails you. The universal translator turns their words into ours, but they speak in images from
// their own stories ("Kesh and Ravu at Tavar"), the way the Tamarians did, so what each phrase means has to be worked
// out from when they say it. Each game makes up a new language from its seed: new names, new places, new images.
// The encounter is the same shape every time: they greet you, warn you of a danger, ask you to cross it with them,
// give you a way through, tell you when to wait and when to go. You answer with their own phrases.
// A people you made contact with can hail again: second contact, the same language with your notebook carried in,
// and six new moments in which the right answer is never their own words back (see SECOND).

import { ARCHIVE } from './archive.js';

export const PATIENCE = 5; // misunderstandings they'll sit through before they give up
export const MAX_REPLY = 3; // phrases in one reply

// What each phrase can mean, in the order the notebook lists them.
export const MEANINGS = [
  ['meet', 'Hello, meeting'],
  ['we', 'We, us'],
  ['you', 'You'],
  ['yes', 'Yes, agreed'],
  ['no', 'No, not'],
  ['see', 'Look, see'],
  ['danger', 'Danger'],
  ['understand', 'Understanding'],
  ['together', 'Together'],
  ['give', 'Giving, a gift'],
  ['wait', 'Wait, hold still'],
  ['go', 'Go, move'],
  ['fight', 'Fighting, weapons'],
];
export const MEANING = Object.fromEntries(MEANINGS);

// Images their stories use for each idea. {A} and {B} are heroes, {P} a place, {H} their home.
const IMAGES = {
  meet: ['{A} and {B} at {P}', '{A} at {P}, the gates open', '{A} and {B}, the bread broken'],
  we: ['the children of {H}', 'the fires of {H}', '{H}, its lamps lit'],
  you: ['{A}, the stranger at the well', 'sails from beyond {P}', '{A}, a guest at {P}'],
  yes: ['{A}, {his} cup raised', '{A}, when the bells rang', '{A} at {P}, the oath sworn'],
  no: ['{A}, the door shut', '{A}, {his} back turned', '{P}, the bridge fallen'],
  see: ['{A} on the tower', '{A}, {his} lantern lifted', '{A} at {P}, the veil drawn'],
  danger: ['{P}, when the sky burned', '{A}, the sea rising', '{P}, the ash falling'],
  understand: ['{A}, {his} eyes open', '{A} at {P}, the riddle answered', '{A}, the map unrolled'],
  together: ['{A} and {B}, back to back', '{A} and {B}, one oar each', '{A} and {B} at {P}, the rope between them'],
  give: ['{A}, {his} hands open', '{A} at {P}, the bowl full', '{A}, {his} cloak given'],
  wait: ['{A} at {P}, the river still', '{A}, {his} breath held', '{A}, the long night'],
  go: ['{A}, {his} sails full', '{A} at {P}, the road open', '{A}, the wind behind {him}'],
  fight: ['{A}, {his} blade drawn', '{A} at {P}, the shields locked', '{A}, {his} fist raised'],
};

// What stands between the two ships and where they're going.
export const DANGERS = {
  storm: {
    name: 'the ion storm',
    pic: 'a wall of blue lightning, light years long, rolling toward you',
    sensor: 'an ion storm front',
    gift: 'With them, your shields could shrug off the lightning.',
    gap: 'A dark lane opens in the storm.',
  },
  creature: {
    name: 'the creature',
    pic: 'something vast and pale, shaped like a jellyfish the size of a moon, with broken hulls trailing behind it',
    sensor: 'a living thing as big as a moon, which feeds on starship shields',
    gift: 'With them, the creature shouldn’t be able to taste your shields.',
    gap: 'The creature turns aside to feed on a passing comet.',
  },
  mines: {
    name: 'the minefield',
    pic: 'thousands of dark spheres, each with one blinking red light',
    sensor: 'an old minefield, still armed, drifting on the current',
    gift: 'With them, the mines shouldn’t be able to see you.',
    gap: 'A safe path through the mines lights up on your screen: their ship has marked it.',
  },
};

// Made-up names sometimes land on a real word. These are turned away and rolled again.
// RUDE is matched anywhere in a name (so "Fukzai" goes as well as "Fuk"); PLAIN are ordinary English words and
// short first names, matched whole, because "Geshael at House" reads as a mistake.
const RUDE = ('fuk fuq suk kok kum pis dik dyk pus kunt shit tit nig kike paki rape rapi nazi pedo peni anus anal homo fag hore bich jiz kill hell '
  + 'lesb damn dago puta puto kaka butt vagi semen urin satan isis mofo arse ass sodom tard negr gook jap nude horn porn dildo kondom vulva testi '
  + 'rekt herpes taliban').split(' ');
const PLAIN = new Set(('baba baby bail bake baker bale ban banana bar base bath ben bevy bike bin bite body bon bone bony bore both bozo bum bun bur '
  + 'bus busy dal dale dan dare data date daze death defy demon den deny devil dim dime din dine diner dis dodo dome don dos dose dote dour dove doze '
  + 'duke duly dum dun dune duty face fade fail fair faith fak fake fame fan far fate fek fem fifi fik file fin fine finer fir fire five fok for fore '
  + 'foul four fun fur fury fuse fyk gaga gain gal gale game gar gas gate gave gaze gel gem gene gin give gone gore gory gum gun guru gus gym habit '
  + 'hail hair halo ham hamas hare has hate have haze hazy hem hen her here hero hers hide him hire his hobo hole holy home hon honor hope hose hotel '
  + 'hour house huge hula hum human hun jade jail jam jan jar jen jesus jim jive joke jon judo july june jury kale ken kil kilo kim kin kit kite '
  + 'koala labor lady laid lain lair lake lam lama lame lane laser late later lazy lemon lenin les level life like lily lima lime limit limo line '
  + 'liner liver lobe local logo lol lone lore lose loser loud louse love lube lulu lunar lure made mail maim main major make maker male mam mama man '
  + 'mane many mar mare mate math maze medal mega mel melon memo men menu mere meta metal meter mile mime min mine miner mini minor mis mode model '
  + 'mole mom mon money mope more most motel moth motor mouse mouth mum muse music mute nail nam name nan nana nape native nature navy never nil nine '
  + 'nobody node none nope nor north nose nosy note noun nova number nun paid pail pain pair pak pal pale pam pan pane panel papa paper par pare pas '
  + 'path pen per peso piano pile pilot pin pine pipe pith pity poke pol polar pole polo pom pony pose posy potato pour power puk puma pun pur pure '
  + 'putin radar rage rail rain rake ram ran rare rate raze razor rely rem ride rider rim ripe rise rival river robe robin rode role ron rope rose '
  + 'rota rove ruby rude rule ruler rum rumor run safe saga sage said sail sake sal salad sale sam same san sane sari sik silo sin sir sis site size '
  + 'sober soda sofa soho soil sol solar sole solo some son sonar sore souk soul soup sour south sugar sum sumo sun super sure sus taco tail take '
  + 'taken taker tale tam tame tan tape tar teeth tel ten than the them then thin this thou thus tide tidy tiger til tile tim time timer tin tiny '
  + 'tire tofu toga token tom tomato ton tone tony tore total tote tour towel tube tun tuna tune tuner tutu vail vain val vale van vane vapor vary '
  + 'vase very veto vile vim vin vine virus visa vise visit vital viva vocal vol von vote voter yoga youth zany zen zero zone zulu').split(' '));
const bad = w => { const l = w.toLowerCase(); return PLAIN.has(l) || RUDE.some(x => l.includes(x)); };
// Two names a reader would mix up: one is the start of the other, or they differ by a single letter.
function alike(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a.length > b.length) [a, b] = [b, a];
  if (b.startsWith(a)) return true;
  if (b.length - a.length > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.length === b.length ? a.slice(i + 1) === b.slice(i + 1) : a.slice(i) === b.slice(i + 1);
}

export function rng(seed) {
  let a = seed >>> 0; // mulberry32
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

// A new language: its sounds, its heroes and places, and one image for each idea.
export function makeLanguage(seed) {
  const r = rng(seed ^ 0x5eed);
  const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cons = shuffle(['k', 't', 'v', 'r', 's', 'm', 'n', 'l', 'th', 'd', 'g', 'z', 'sh', 'b', 'p', 'h', 'j', 'kh', 'q', 'f']).slice(0, 9);
  const vows = shuffle(['a', 'e', 'i', 'o', 'u', 'ai', 'ae', 'ou', 'y']).slice(0, 4);
  const codas = shuffle(['n', 'r', 'l', 's', 'k', 'th', 'm']).slice(0, 3);
  const used = new Set();
  const word = () => {
    for (;;) {
      const n = r() < 0.6 ? 2 : r() < 0.7 ? 1 : 3;
      let w = '';
      for (let i = 0; i < n; i++) w += pick(r, cons) + pick(r, vows) + (r() < 0.3 ? pick(r, codas) : '');
      if (n === 1 && !codas.some(c => w.endsWith(c))) w += pick(r, codas);
      w = w[0].toUpperCase() + w.slice(1);
      if (w.length >= 3 && w.length <= 9 && !/^(.{2,})\1$/i.test(w) && !bad(w) && ![...used].some(u => alike(u, w))) { used.add(w); return w; }
    }
  };
  const home = word();
  // What they're called, from their home: "Jimthi" could give "the Jimthi" again, so take the next ending along
  // until it reads as a different word.
  const endings = ['i', 'ari', 'ans', 'en', 'ites'];
  const stem = home.replace(/[aeiouy]+$/, '');
  let people = home;
  for (let i = Math.floor(r() * endings.length), n = 0; n < endings.length; n++) {
    people = stem + endings[(i + n) % endings.length];
    if (people !== home && !bad(people)) break;
  }
  // No hero or place may be called after the people, or nearly: `used` is checked for near misses too.
  // (The people's own name is close to their home's on purpose, so it goes in after it is chosen.)
  used.add(people);
  const pronouns = [['his', 'him'], ['her', 'her'], ['their', 'them']];
  const phrases = {};
  for (const [id] of MEANINGS) {
    const [his, him] = pick(r, pronouns);
    phrases[id] = pick(r, IMAGES[id])
      .replace('{A}', word()).replace('{B}', word()).replace('{P}', word()).replace('{H}', home)
      .replaceAll('{his}', his).replace('{him}', him);
    phrases[id] = phrases[id][0].toUpperCase() + phrases[id].slice(1);
  }
  const captain = word();
  const [his, him] = pick(r, pronouns);
  const danger = pick(r, Object.keys(DANGERS));
  // The story they'll tell about this day, if it goes well.
  const story = word();
  phrases.story = `${captain} and the stranger at ${story}`;
  const look = Math.floor(r() * 2 ** 31);
  return { seed, home, people, captain, his, him, danger, phrases, look, names: [...used].filter(w => w !== people) };
}

// The encounter, beat by beat. Each beat has what they say (a few ways, tried in turn when you need to hear it again),
// what answers they hope for (`accept`, any one of them; or `needs`, sets of phrases that must all be said together),
// what they won't mind hearing alongside (`fits`), answers that end it another way (`alt`), and what they say when you
// get it right. A beat that `asks` is a question put to you: their own words sent straight back are heard as the
// question asked back, not as an answer (see reply()).
const BEATS = [
  {
    id: 'hail',
    lines: [
      [['meet', 'we'], 'The ship stops off your bow and opens a channel. Their captain touches {his} own chest while speaking.'],
      [['meet', 'you'], 'The captain spreads both hands toward your viewscreen.'],
      [['we', 'meet', 'you'], 'The captain touches {his} chest, points at you, then clasps both hands together.'],
    ],
    accept: ['meet'], fits: ['we', 'you', 'yes'],
    ok: () => [['yes', 'meet'], 'The captain lifts a cup toward you and drinks. The crew behind {him} relax.'],
  },
  {
    id: 'warn',
    lines: [
      [['see', 'danger'], 'A picture comes through on the channel: {pic}.'],
      [['danger', 'you'], 'The captain points at you, then at the picture, and sweeps a hand across it like a wave breaking.'],
      [['danger', 'we', 'you'], 'Sensors find it: {sensor}, {dist} light-hours off and drifting across both your paths.'],
    ],
    accept: ['understand', 'see', 'yes'], fits: ['danger', 'we', 'you'],
    alt: { no: 'parted', go: 'parted' },
    ok: () => [['understand', 'yes'], 'The captain lets out a long breath and closes {his} eyes for a moment, relieved.'],
  },
  {
    id: 'ask', asks: true,
    lines: [
      [['we', 'you', 'together'], 'Their ship comes about and slides in alongside yours, close enough to see the lights in her ports.'],
      [['together', 'danger'], 'The captain lays two fingers side by side and runs them through the picture of {name}.'],
      [['see', 'together'], 'A course plot arrives: two ships, one track, straight through {name}.'],
    ],
    accept: ['together', 'yes'], fits: ['we', 'you', 'danger', 'understand', 'go'],
    alt: { no: 'alone' },
    ok: () => [['yes', 'together'], 'Their ship matches your course and speed to the metre.'],
  },
  {
    id: 'give', asks: true,
    lines: [
      [['we', 'give'], 'A data packet arrives: shield harmonics tuned to {name}. {gift}'],
      [['give', 'you'], 'The captain holds out both hands, palms up.'],
    ],
    accept: ['give', 'yes', 'understand'], fits: ['we', 'you', 'together'],
    ok: g => g.gave
      ? [['yes', 'give'], 'Your engineers send back your own deflector readings. The captain studies them and laughs, a sound like gravel in water.']
      : [['yes'], 'Your engineers load the harmonics. The captain nods once.'],
  },
  {
    id: 'wait',
    lines: [
      [['danger', 'wait'], '{Name} reaches the edge of sensor range. Their engines go dark.'],
      [['wait', 'you'], 'Your helm officer reaches for the throttle. On screen, the captain raises one hand toward you, palm out.'],
    ],
    accept: ['wait', 'yes', 'understand'], fits: ['we', 'you', 'together', 'danger'],
    ok: () => [['wait'], 'Both ships drift with their engines cold while {name} rolls past ahead.'],
  },
  {
    id: 'run', asks: true,
    lines: [
      [['go', 'together'], '{Gap} Their engines flare.'],
      [['you', 'go'], 'The captain points at you, then throws an arm forward.'],
    ],
    accept: ['go', 'yes', 'together'], fits: ['we', 'you', 'understand'],
    alt: { no: 'alone' },
    ok: () => [['story'], 'Both ships come out the other side. The captain says something new, and the whole crew behind {him} say it back.'],
  },
];
export const BEAT_IDS = BEATS.map(b => b.id);

// Second contact: a people you made first contact with comes back, and this time they need you. {danger} here is
// another of DANGERS than the one you crossed together, and it has crippled their ship. Every moment is a question,
// and none of its answers is among the words it is asked in: "you, give?" wants "no, together", not "give" or
// "yes". Two of them have a trap in the answer that was always safe before: "yes" to "did you fire on us?" is a
// confession, and "yes" to "go now?" sends them off before their engines are ready.
// What the first meeting is sure to have taught: every line it opens a beat with, and every answer it gives.
// "No" is the one phrase a perfect first contact never hears, so the second moment says it before it is wanted.
const SECOND = [
  {
    id: 'remember', asks: true,
    lines: [
      [['story', 'you'], 'Their ship drops out of warp beside yours. The captain holds up a picture of your two ships side by side, then points at you.'],
      [['you', 'story', 'we'], 'The captain touches the picture, then {his} own chest, then points at you.'],
      [['meet', 'story'], 'The captain spreads both hands toward your viewscreen, and waits.'],
    ],
    needs: [['yes']], fits: ['we', 'you', 'meet', 'together', 'understand'],
    alt: { no: 'denied' },
    ok: () => [['yes', 'we'], 'The captain laughs, and the crew behind {him} raise their cups to you.'],
  },
  {
    id: 'stranded', asks: true,
    lines: [
      [['we', 'go', 'no'], 'The picture changes to their own ship, half her hull scorched black by {name}. The captain points at {his} engines and shakes {his} head.'],
      [['danger', 'we', 'no'], 'Sensors confirm it: their warp core is cold, and their hull is breached in three places.'],
      [['see', 'we', 'danger'], 'The captain sends a close picture of the damage, then lowers {his} eyes.'],
    ],
    needs: [['give'], ['together']], fits: ['we', 'you', 'yes', 'understand', 'see'],
    ok: () => [['yes', 'understand'], 'Your chief engineer beams across with a repair team. On screen, the captain grips the edge of {his} console and bows {his} head.'],
  },
  {
    id: 'blame', asks: true,
    lines: [
      [['you', 'fight'], 'An officer steps up beside the captain, points at the scorch marks on their hull, then at your ship.'],
      [['fight', 'you', 'see'], 'The officer sends a close picture of the scorch marks. They could be weapons fire.'],
      [['you', 'fight', 'danger'], 'The captain raises a hand for quiet, and waits for your answer.'],
    ],
    needs: [['no']], fits: ['we', 'understand', 'see', 'together', 'danger', 'meet'],
    alt: { yes: 'accused' },
    ok: () => [['understand'], 'The officer looks at the picture again, and steps back. The captain nods to you.'],
  },
  {
    id: 'reward', asks: true,
    lines: [
      [['you', 'give'], 'With their lights back on, the captain holds up a crystal that glows from inside, and points at you.'],
      [['give', 'you', 'we'], 'A cargo pod drifts across from their ship to yours. The captain watches your face.'],
      [['see', 'give'], 'The captain turns the crystal so the light falls through it, then holds it out toward you.'],
    ],
    needs: [['no', 'together']], fits: ['we', 'you', 'understand', 'meet'],
    ok: () => [['yes', 'together'], 'The captain laughs and closes {his} hand round the crystal. Their crew sing something across the channel instead.'],
  },
  {
    id: 'soon', asks: true,
    lines: [
      [['danger', 'go'], '{Name} is back on long-range sensors, closing. The captain reaches for the throttle. Your engineer calls up: their engines need ten more minutes.'],
      [['go', 'we', 'danger'], 'The captain points at {name}, then throws an arm forward.'],
      [['we', 'go'], 'Their engines flicker. The repair readings on your screen are still amber.'],
    ],
    needs: [['wait']], fits: ['no', 'we', 'you', 'together', 'understand', 'danger'],
    alt: { yes: 'adrift' },
    ok: () => [['yes', 'wait'], 'Both ships hold still while your engineers finish. Their engines come up green, and {name} slides past.'],
  },
  {
    id: 'invite', asks: true,
    lines: [
      [['you', 'meet', 'we'], 'A course plot arrives: from here to {home}, their world. The captain points at you, then at the plot.'],
      [['we', 'you', 'see'], 'The captain holds up a picture of a city by a sea, lit up at night.'],
      [['you', 'together', 'we'], 'Their ship turns toward {home} and waits for yours.'],
    ],
    needs: [['go']], fits: ['yes', 'together', 'we', 'you', 'meet', 'understand'],
    alt: { no: 'declined' },
    ok: () => [['story', 'meet'], 'Both ships turn for {home}. The captain tells the story of the day you met, and adds a new line to the end of it.'],
  },
];
export const SECOND_IDS = SECOND.map(b => b.id);
const script = g => (g.second ? SECOND : BEATS);

// Fills in a stage direction for this game.
function say(g, text) {
  const d = DANGERS[g.danger];
  const cap = s => s[0].toUpperCase() + s.slice(1);
  return text.replaceAll('{his}', g.lang.his).replaceAll('{him}', g.lang.him)
    .replace('{pic}', d.pic).replace('{sensor}', d.sensor).replace('{gift}', d.gift).replace('{Gap}', d.gap)
    .replaceAll('{name}', d.name).replaceAll('{Name}', cap(d.name)).replace('{dist}', g.dist).replaceAll('{home}', g.lang.home);
}

// What a first contact is sure to have heard, whatever was said in it: each beat's opening line and its answer.
export const ALWAYS_HEARD = [...new Set(BEATS.flatMap(b => [...b.lines[0][0], ...b.ok({ gave: true })[0], ...b.ok({ gave: false })[0]]))];

// A new encounter. `again` makes it second contact: the phrases heard at the first meeting ({ heard: [ids] }, which
// always has ALWAYS_HEARD in it) and the notebook's guesses from it ({ tags }), carried in.
export function newGame({ seed = Date.now(), again = null } = {}) {
  const lang = makeLanguage(seed);
  const second = !!again;
  const keys = Object.keys(DANGERS);
  const g = {
    seed, lang, dist: 3 + Math.floor(rng(seed)() * 7),
    // Second contact's trouble is one of the other two dangers, the same one for the same people.
    danger: second ? keys[(keys.indexOf(lang.danger) + 1 + (seed >>> 0) % 2) % keys.length] : lang.danger,
    beat: 0, tries: [0], patience: PATIENCE, turn: 0, over: null,
    misses: 0, standard: 0, shields: false, gave: false,
    line: [], // the phrase ids of the way they last put the beat they're on
    heard: [], // phrase ids in the order you first heard them
    count: {}, // how often each was said
    tags: {}, // your guess at each, by phrase id
    log: [],
  };
  if (second) {
    g.second = true;
    const known = new Set([...ALWAYS_HEARD, ...(Array.isArray(again.heard) ? again.heard : [])]);
    g.carried = [...MEANINGS.map(([id]) => id), 'story'].filter(id => known.has(id));
    g.heard = g.carried.slice();
    const tags = again.tags && typeof again.tags === 'object' ? again.tags : {};
    for (const id of g.heard) if (id !== 'story' && typeof tags[id] === 'string' && MEANING[tags[id]]) g.tags[id] = tags[id];
    crew(g, 'Communications', `It’s the ${lang.people}. They remember us. Your notebook from the first time is open.`);
  } else {
    crew(g, 'Communications', 'She’s hailing us. The translator has their words, but not what they mean.');
  }
  const first = script(g)[0].lines[0];
  them(g, ...first);
  g.line = first[0];
  g.tries[0] = 1;
  return g;
}

// Something they say: phrase ids and what you see while they say it.
function them(g, ids, act) {
  for (const id of ids) {
    if (!g.heard.includes(id)) g.heard.push(id);
    g.count[id] = (g.count[id] || 0) + 1;
  }
  const line = { who: 'them', ids, act: say(g, act) };
  g.log.push(line);
  return line;
}
function crew(g, who, text, tone) {
  const line = { who, text, tone };
  g.log.push(line);
  return line;
}

export const phrase = (g, id) => g.lang.phrases[id];
export const beat = g => script(g)[g.beat];

// Their next way of putting the current beat. Once they've used them all they start over, and their patience wears:
// that is what waiting costs. `charged` is for a turn that has already cost patience (a reply they didn't follow,
// Standard, weapons), so one misunderstanding never costs two.
function again(g, out, charged = false) {
  const b = script(g)[g.beat];
  const i = g.tries[g.beat] || 0;
  if (i >= b.lines.length) {
    const why = 'The captain waits, then says it all again, more slowly.';
    if (charged) out.push(crew(g, 'Communications', why)); else lose(g, out, why);
  }
  if (g.over) return;
  out.push(them(g, ...b.lines[i % b.lines.length]));
  g.line = b.lines[i % b.lines.length][0];
  g.tries[g.beat] = i + 1;
}

function lose(g, out, why) {
  if (g.over) return;
  g.patience = Math.max(0, g.patience - 1);
  if (why) out.push(crew(g, 'Communications', why));
  if (g.patience <= 0) end(g, out, g.fought ? 'hostile' : 'silence');
}

function end(g, out, how) {
  g.over = how;
  const d = DANGERS[g.danger];
  const lines = {
    contact: ['Communications', 'They’re sending us their star charts. All of them. I think we’ve made a friend.', 'good'],
    alone: ['Helm', `Their ship is going on alone, into ${d.name}.`, 'bad'],
    parted: ['Helm', 'Their ship is turning away. They’re leaving.', 'bad'],
    silence: ['Communications', 'They’ve closed the channel.', 'bad'],
    hostile: ['Tactical', 'A warning shot, across our bow. They’re going to warp.', 'bad'],
    fled: ['Helm', g.second ? 'Breaking off. Their ship is still dead in space behind us.' : 'Breaking off. They’re not following.', 'bad'],
    // Second contact's own endings.
    friends: ['Helm', `Course laid in for ${g.lang.home}, alongside them. Communications says they’re sending word ahead that we’re coming.`, 'good'],
    denied: ['Helm', 'They’re turning away. They think we’re some other ship.', 'bad'],
    accused: ['Tactical', 'Their weapons are locked on us. They’re backing away at full impulse.', 'bad'],
    adrift: ['Engineering', 'Their engines gave out the moment they jumped. We’ve towed them clear, but their captain has closed the channel.', 'bad'],
    declined: ['Helm', `They’re going home to ${g.lang.home} without us.`, 'bad'],
  }[how];
  out.push(crew(g, ...lines));
}

// One thing you do. `what` is { say: [phrase ids] }, or 'listen', 'standard', 'shields' or 'leave'.
// Returns the lines it adds to the log.
export function act(g, what) {
  if (g.over) return [];
  const out = [];
  g.turn++;
  if (what === 'listen') {
    out.push(crew(g, 'You', 'You wait and listen.', 'you'));
    g.listens = (g.listens || 0) + 1;
    again(g, out);
    // The first time, say what waiting costs, so the dot that goes later isn't a surprise.
    if (g.listens === 1 && !g.over) out.push(crew(g, 'Communications', 'They’ll put it another way while they have one. After that, waiting wears on them too.'));
  } else if (what === 'standard') {
    out.push(crew(g, 'You', 'This is a Federation starship. We come in peace. Do you understand me?', 'you'));
    g.standard++;
    out.push(them(g, ['understand', 'no'], g.standard === 1
      ? 'The captain listens politely, then shakes {his} head and spreads {his} hands.'
      : 'The captain’s shoulders drop. {His} crew mutter to each other.'.replace('{His}', g.lang.his[0].toUpperCase() + g.lang.his.slice(1))));
    if (g.standard > 1) lose(g, out);
    if (!g.over) again(g, out, true);
  } else if (what === 'shields') {
    g.shields = !g.shields;
    out.push(crew(g, 'Tactical', g.shields ? 'Shields up.' : 'Shields down.'));
    if (g.shields) {
      out.push(them(g, ['you', 'fight'], 'Their ship turns its bow toward you. Weapon ports slide open.'));
      g.fought = true;
      lose(g, out);
    } else {
      out.push(crew(g, 'Sensors', 'Their weapon ports close.'));
    }
  } else if (what === 'leave') {
    out.push(crew(g, 'You', 'Break off. Take us out of here.', 'you'));
    end(g, out, 'fled');
  } else if (what && Array.isArray(what.say)) {
    reply(g, what.say.slice(0, MAX_REPLY), out);
  }
  return out;
}

function reply(g, ids, out) {
  ids = ids.filter(id => g.heard.includes(id));
  if (!ids.length) { g.turn--; return; }
  const line = { who: 'you', ids };
  g.log.push(line);
  out.push(line);
  const b = script(g)[g.beat];
  const said = new Set(ids);
  if (said.has('fight')) {
    g.fought = true;
    out.push(them(g, ['fight', 'no'], 'Weapons come up on their ship. The captain shouts the words twice, then waves {his} crew back from their stations.'));
    g.misses++;
    lose(g, out); lose(g, out);
    if (!g.over) again(g, out, true);
    return;
  }
  // Their whole line said straight back, when they have asked you something ("we, you, together?"), is the question
  // asked back: Picard answered the Tamarians' greeting in their own words, but echoing a question doesn't answer it.
  // The captain says it again, and nothing is lost; the encounter just doesn't move on. (Echoing used to win every
  // encounter with nothing worked out in the notebook.) A greeting or a warning said back still works, as in Darmok.
  if (b.asks && said.size === new Set(g.line).size && g.line.every(id => said.has(id))) {
    g.echoes = (g.echoes || 0) + 1;
    out.push(them(g, g.line, 'The captain hears {his} own words come back and nods, as if to say yes, that was the question. Then the captain asks it again, and waits for your answer.'));
    return;
  }
  const needs = b.needs || b.accept.map(id => [id]);
  const yes = needs.some(set => set.every(id => said.has(id)));
  const alt = Object.keys(b.alt || {}).find(id => said.has(id));
  const odd = ids.some(id => !needs.some(set => set.includes(id)) && !b.fits.includes(id) && id !== alt);
  if (alt && !yes && !odd) { end(g, out, b.alt[alt]); return; }
  if (yes && !alt && !odd) {
    if (b.id === 'give' && said.has('give')) g.gave = true;
    out.push(them(g, ...b.ok(g)));
    if (g.beat === script(g).length - 1) { end(g, out, g.second ? 'friends' : 'contact'); return; }
    g.beat++;
    g.tries[g.beat] = 0;
    again(g, out);
    return;
  }
  // They didn't follow. Half of an answer that needs two phrases is still a misunderstanding, but they show it.
  g.misses++;
  const half = !odd && !alt && needs.some(set => set.length > 1 && set.some(id => said.has(id)));
  out.push(them(g, ['understand', 'no'], half ? 'The captain waits, as if you had stopped halfway through.'
    : g.misses === 1 ? 'The captain tilts {his} head and repeats your words back, slowly, like a question.'
    : 'The captain frowns and holds up a hand.'));
  lose(g, out);
  if (!g.over) again(g, out, true);
}

// An encounter picked up where it was left. What is kept is the seed, everything you did in order (`acts`, each as
// act() takes it), your notebook's guesses and the reply you were putting together. Doing the same things again to a
// new encounter with the same seed gives the same language, the same captain and the same conversation, word for
// word, so a reload changes nothing and can't take back a misunderstanding.
// Returns the game and the reply, or null if what was kept isn't an encounter: not the right shape, or something
// that couldn't have been done when it says it was.
// A second contact is kept with what was carried in (`again`: { heard }, as newGame() takes it).
const ACTS = new Set(['listen', 'standard', 'shields', 'leave']);
export function replay(kept) {
  if (!kept || typeof kept !== 'object' || !Number.isFinite(kept.seed) || !Array.isArray(kept.acts) || kept.acts.length > 500) return null;
  const again = kept.again && typeof kept.again === 'object' ? { heard: Array.isArray(kept.again.heard) ? kept.again.heard : [] } : null;
  const g = newGame({ seed: kept.seed, again });
  const phrases = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_REPLY && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && id !== 'story' && g.heard.includes(id));
  for (const what of kept.acts) {
    if (g.over || !(ACTS.has(what) || (what && typeof what === 'object' && phrases(what.say)))) return null;
    act(g, typeof what === 'string' ? what : { say: [...what.say] });
  }
  const tags = kept.tags && typeof kept.tags === 'object' ? kept.tags : {};
  for (const id of g.heard) if (id !== 'story' && typeof tags[id] === 'string' && MEANING[tags[id]]) g.tags[id] = tags[id];
  return { game: g, reply: !g.over && phrases(kept.reply) ? [...kept.reply] : [] };
}

// An encounter as a link, so a friend can watch it played back and then answer the same hail: "1." (this way of
// writing it), the seed in base 36, what you did in turn (a letter for each phrase of a reply, in MEANINGS' order;
// l, s, h and x for Listen again, Speak Standard, shields and Break off, each with a ~ before it), and your
// notebook's guesses as pairs of letters, phrase then meaning. These links are kept working: a letter never
// changes its meaning.
// A second contact is written "2.", the seed, the letters of the phrases carried in from the first meeting (in
// MEANINGS' order), then what you did and your guesses as "1." has them.
const LETTERS = 'abcdefghijklm';
const BUTTONS = { listen: 'l', standard: 's', shields: 'h', leave: 'x' };
const BUTTON = Object.fromEntries(Object.entries(BUTTONS).map(([id, l]) => [l, id]));
const letterOf = id => LETTERS[MEANINGS.findIndex(([m]) => m === id)];
const idOf = l => MEANINGS[LETTERS.indexOf(l)]?.[0];
export function encodeRun({ seed, acts, tags = {}, again = null }) {
  const done = acts.map(a => (typeof a === 'string' ? `~${BUTTONS[a]}` : a.say.map(letterOf).join(''))).join('-');
  const guesses = Object.entries(tags).filter(([id, m]) => letterOf(id) && letterOf(m)).map(([id, m]) => letterOf(id) + letterOf(m)).join('');
  if (again) {
    const carried = MEANINGS.map(([id]) => id).filter(id => again.heard.includes(id)).map(letterOf).join('');
    return `2.${(seed >>> 0).toString(36)}.${carried}.${done}.${guesses}`;
  }
  return `1.${(seed >>> 0).toString(36)}.${done}.${guesses}`;
}
// Today's hail: the same ship and the same language for every officer on the same calendar day, so two people can
// compare notebooks on the same aliens. `day` is the date as YYYY-MM-DD; the seed is its FNV-1a hash.
export function dailySeed(day) {
  let h = 0x811c9dc5;
  for (const c of `first-contact:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
// The day as YYYY-MM-DD, by the calendar where the officer is.
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
// An encounter in a line, to send to someone: "First contact, 19 Nov: the Qaethuk. First contact, 9 of 11 phrases
// decoded". The date is there for today's hail, which every officer that day answered.
export function shareLine(e, day) {
  const when = day ? `, ${new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  return `${e.second ? 'Second contact' : 'First contact'}${when}: ${day ? `the ${e.people}. ` : ''}${e.title}, ${e.decoded} of ${e.of} phrases decoded`;
}

// What encodeRun() wrote, as replay() takes it, or null if it isn't an encounter that could have been played to its end.
export function decodeRun(text) {
  const m = /^(?:1\.([0-9a-z]{1,7})|2\.([0-9a-z]{1,7})\.([a-m]{1,13}))\.([a-z~-]{1,1500})\.([a-m]{0,26})$/.exec(String(text || ''));
  if (!m || m[5].length % 2) return null;
  const acts = [];
  for (const part of m[4].split('-')) {
    if (part.startsWith('~')) { if (!BUTTON[part.slice(1)]) return null; acts.push(BUTTON[part.slice(1)]); }
    else if (/^[a-m]{1,3}$/.test(part)) acts.push({ say: [...part].map(idOf) });
    else return null;
  }
  const tags = {};
  for (let i = 0; i < m[5].length; i += 2) tags[idOf(m[5][i])] = idOf(m[5][i + 1]);
  const kept = { seed: parseInt(m[1] ?? m[2], 36), acts, tags, ...(m[3] ? { again: { heard: [...m[3]].map(idOf) } } : {}) };
  const back = kept.seed <= 0xffffffff ? replay(kept) : null;
  return back && back.game.over ? kept : null;
}

// The debrief: what happened, what each phrase meant, and how much of it you worked out.
export function debrief(g) {
  const d = DANGERS[g.danger];
  const L = g.lang;
  const ends = g.second ? {
    friends: ['Second contact', `The ${L.people} came back, and this time they needed you. You offered help, told them the scorch marks weren’t yours, turned down their crystal, held them back until their engines were ready, and now you’re going to ${L.home} with them. Their captain, ${L.captain}, has added to the story of the day you met:`],
    denied: ['Not them', `The ${L.people} came back to find the ship they had met, and you told them it wasn’t you. They left puzzled, their ship still crippled by ${d.name}.`],
    accused: ['Blamed', `The scorch marks on the ${L.people}’s hull were from ${d.name}. When their officer asked whether you had fired on them, you said yes.`],
    adrift: ['Too soon', `You told the ${L.people} to go before their repairs were done. Their engines failed in front of ${d.name}. You towed them clear, but they won’t forget whose word they took.`],
    declined: ['Not this time', `The ${L.people} asked you to come home with them to ${L.home}, and you said no.`],
    silence: ['The channel closes', `The ${L.people} came back for help, crippled by ${d.name}, and gave up trying to make themselves understood.`],
    hostile: ['A warning shot', `The ${L.people} came back for help, and every time weapons came into it they got more frightened, until they fired across your bow and limped away.`],
    fled: ['Broke off', `You left the ${L.people} where they were, their ship crippled by ${d.name}.`],
  } : {
    contact: ['First contact', `You and the ${L.people} came through ${d.name} side by side. Their captain, ${L.captain}, has a new story to tell, and you’re in it. From now on, this is how the ${L.people} will say that two strangers became friends:`],
    alone: ['Ships passing', `You turned their offer down. The ${L.people} went through ${d.name} alone, and you never learned whether they made it.`],
    parted: ['Strangers still', `They were trying to warn you about ${d.name}, and you left before they could finish. It crossed the space where you’d been holding an hour later.`],
    silence: ['The channel closes', `The ${L.people} gave up trying to make themselves understood. They were warning you about ${d.name}, and asking you to cross it with them.`],
    hostile: ['A warning shot', `Every time weapons came into it, the ${L.people} got more frightened, until they fired across your bow and left. They had been trying to warn you about ${d.name}.`],
    fled: ['Broke off', `You left before you understood them. They were trying to warn you about ${d.name}.`],
  };
  const [title, summary] = ends[g.over] || ['Still talking', ''];
  const rows = g.heard.filter(id => id !== 'story').map(id => ({ id, text: L.phrases[id], meaning: MEANING[id], guess: g.tags[id] || null, right: g.tags[id] === id }));
  const decoded = rows.filter(r => r.right).length;
  const fluency = fluencyOf(decoded, rows.length);
  const transcript = g.log.filter(l => l.ids).map(l => ({ who: l.who, said: l.ids.map(id => L.phrases[id]), meant: l.ids.map(id => (id === 'story' ? (g.second ? 'The story of the day you met' : 'A new story: the day you met') : MEANING[id])) }));
  const story = g.over === 'contact' || g.over === 'friends' ? L.phrases.story : null;
  return { title, summary, outcome: g.over, second: !!g.second, people: L.people, captain: L.captain, home: L.home, story, rows, decoded, of: rows.length, fluency, transcript, misses: g.misses, turns: g.turn };
}

// How rare an encounter's ending is, from the examiners' archive (js/archive.js, written by tools/archive.mjs): how
// often an encounter ends this way when every line is answered with phrases picked at random. Nothing for an ending
// the archive never saw (weapons and breaking off are never picked at random).
export function archiveLine(d) {
  if (d.second) return ''; // the archive's trials are all first contacts
  const { trials, endings } = ARCHIVE.contact;
  const n = endings[d.outcome];
  if (!n || !trials) return '';
  const share = n / trials;
  return `${share >= 0.5 ? `About ${Math.round(share * 10)} in 10 end` : `About 1 in ${Math.round(1 / share)} ends`} this way, of ${trials.toLocaleString('en-US')} encounters answered with phrases picked at random.`;
}

// How well a notebook did, from how many of the phrases heard were guessed right.
export function fluencyOf(decoded, of) {
  const share = of ? decoded / of : 0;
  return share === 1 ? 'Fluent' : share >= 0.75 ? 'Conversational' : share >= 0.4 ? 'Halting' : 'Lost in translation';
}

// A communications officer's standing record, from what the page has saved: how many species have hailed (every
// first encounter is a new one), how many of those ended in first contact, and the best notebook (the largest share of
// phrases decoded, and of two as good, the one with more phrases). Second contacts are none of these: the species
// was met before, and the notebook came in half written. The page lists only its last 30 encounters, so
// `met`, `contacts` and `best` are kept beside them; a save from before they were kept is filled in from its runs.
// Anything in the save that doesn't make sense is ignored.
export function standing(saved = {}) {
  const runs = Array.isArray(saved.runs) ? saved.runs.filter(r => r && typeof r === 'object' && !r.second) : [];
  const count = x => (Number.isInteger(x) && x > 0 ? x : 0);
  const notebook = x => (x && Number.isInteger(x.decoded) && Number.isInteger(x.of) && x.of > 0 && x.decoded >= 0 && x.decoded <= x.of ? { decoded: x.decoded, of: x.of } : null);
  let best = notebook(saved.best);
  for (const r of runs) {
    const n = notebook(r);
    if (n && (!best || n.decoded * best.of > best.decoded * n.of || (n.decoded * best.of === best.decoded * n.of && n.of > best.of))) best = n;
  }
  return {
    met: Math.max(count(saved.met), runs.length),
    contacts: Math.max(count(saved.contacts), runs.filter(r => r.outcome === 'contact').length),
    best,
  };
}

// What an encounter added to the record: `before` is the record as it stood (standing() of the save before this
// encounter went on it) and `d` its debrief. `best` is a notebook that beat the best on record, by standing()'s own
// rule (a first encounter has no record to beat); `contacts` is how many first contacts that makes, when this was one.
// A notebook with nothing right in it is never a best: by standing()'s rule none right of eleven phrases beats none
// right of two, and the debrief said "Your best notebook yet" over "0/11, you didn't write any right guesses".
export function encounterFirsts(before = {}, d) {
  const was = standing(before);
  const now = standing({ ...was, runs: [{ decoded: d.decoded, of: d.of }] }).best;
  const best = was.met > 0 && d.decoded > 0 && !!now && (!was.best || now.decoded !== was.best.decoded || now.of !== was.best.of);
  return { best, contacts: d.outcome === 'contact' ? was.contacts + 1 : 0 };
}
// The same in words, for the debrief: "Your best notebook yet · First contact made: 1". A second contact made
// says "Second contact made: 1" (`seconds`, counted by the page).
export function firstsLine(f) {
  return [f.best ? 'Your best notebook yet' : '', f.contacts ? `First contact${f.contacts === 1 ? '' : 's'} made: ${f.contacts}` : '',
    f.seconds ? `Second contact${f.seconds === 1 ? '' : 's'} made: ${f.seconds}` : ''].filter(Boolean).join(' · ');
}

// One line at the head of the briefing for an officer who has answered a hail before, from what the page has saved:
// which ship this is, and how the last one went. A first hail gets none: the briefing reads as it always has.
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
export function briefingLine(saved = {}) {
  const { met } = standing(saved);
  if (!met) return '';
  const runs = Array.isArray(saved.runs) ? saved.runs.filter(r => r && typeof r === 'object' && !r.second) : [];
  const last = runs[runs.length - 1];
  const which = met < ORDINALS.length ? `Your ${ORDINALS[met]} unknown ship.` : `Unknown ship number ${met + 1}.`;
  const people = typeof last?.people === 'string' && /^[\p{L}’' -]{1,30}$/u.test(last.people) ? last.people : '';
  if (last?.outcome === 'silence') return `${which} The last ship left without being understood.`;
  return people ? `${which} The last were the ${people}; these are not.` : which;
}

// A right answer for where things stand, from what you've heard so far: the phrases to say together. For the tests
// and the page's hook. hint() is its first phrase, which is the whole answer in a first contact.
export function answer(g) {
  if (g.over) return null;
  const b = script(g)[g.beat];
  return (b.needs || b.accept.map(id => [id])).find(set => set.every(id => g.heard.includes(id))) || null;
}
export const hint = g => answer(g)?.[0] ?? null;
