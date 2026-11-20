// Reference specimens for the xenobiology lab: Star Trek species and real Earth life that show how a world shapes what
// lives on it. `cls` is the planet class (an id from js/classes.js) each belongs with, and `also` lists classes it
// helps explain too. Episode names are where the trait is shown on screen.

export const SPECIMENS = [
  // Star Trek
  { name: 'Humans', kind: 'trek', home: 'Earth', cls: 'M',
    note: 'The pattern for every Class M guess: two legs for 1 g, eyes tuned to a yellow star, and sweat to shed heat.' },
  { name: 'Vulcans', kind: 'trek', home: 'Vulcan', cls: 'M', also: ['H'],
    note: 'Vulcan is hotter and drier than Earth, with stronger gravity and thinner air. Spock has an inner eyelid against its glare (“Operation: Annihilate!”) and green, copper-based blood.' },
  { name: 'Klingons', kind: 'trek', home: 'Qo’noS', cls: 'M',
    note: 'Built to take punishment, with back-up organs for nearly everything, so a wound that would kill a human only slows a Klingon down.' },
  { name: 'Tribbles', kind: 'trek', home: 'A Class M world', cls: 'M', also: ['L'],
    note: 'Born pregnant, which only works where plenty of things eat them. Aboard a station with nothing to eat them, they fill it in days (“The Trouble with Tribbles”).' },
  { name: 'Ferengi', kind: 'trek', home: 'Ferenginar', cls: 'M', also: ['O'],
    note: 'It rains on Ferenginar nearly all the time, and Ferengi think of a downpour as fine weather. Those famous ears are as sharp as they look.' },
  { name: 'Cardassians', kind: 'trek', home: 'Cardassia Prime', cls: 'H',
    note: 'They like it hot and dim. Garak finds Federation rooms uncomfortably cold, and Cardassian-built stations are kept warm with low lights.' },
  { name: 'Ocampa', kind: 'trek', home: 'Ocampa', cls: 'H', also: ['K'],
    note: 'Their world’s surface dried into desert, so they live underground, cared for by the Caretaker. They live only about nine years (Voyager, “Caretaker”).' },
  { name: 'Talosians', kind: 'trek', home: 'Talos IV', cls: 'K', also: ['D'],
    note: 'A war left their surface barely livable, so they moved underground, where their minds grew powerful while their bodies withered (“The Cage”).' },
  { name: 'Andorians', kind: 'trek', home: 'Andoria', cls: 'P',
    note: 'From an icy moon of a gas giant, with their cities deep under the ice. Blue skin and antennae; they shrug off cold that would kill a human (Enterprise).' },
  { name: 'The Breen', kind: 'trek', home: 'Breen', cls: 'P',
    note: 'They never take off their refrigeration suits, so everyone took their home world for a frozen waste. The Dominion’s Weyoun says it is quite comfortable (Deep Space Nine, “The Changing Face of Evil”). What is inside a suit went unseen until Discovery showed a Breen’s face (“Mirrors”).' },
  { name: 'Xindi-Aquatics', kind: 'trek', home: 'Xindus', cls: 'O', also: ['sub-neptune'],
    note: 'Huge water-breathers who fly ships full of water and are famously slow to make up their minds (Enterprise).' },
  { name: 'Horta', kind: 'trek', home: 'Janus VI', cls: 'lava-world', also: ['D', 'Y'],
    note: 'Silicon instead of carbon: a rock-eater that tunnels through stone with acid. The miners took it for a monster until Spock found a mother guarding her eggs (“The Devil in the Dark”).' },
  { name: 'Excalbians', kind: 'trek', home: 'Excalbia', cls: 'lava-world',
    note: 'Living rock from a world of molten lava, curious enough to stage a fight between good and evil just to watch (“The Savage Curtain”).' },
  { name: 'Tholians', kind: 'trek', home: 'Tholia', cls: 'Y', also: ['hot-jupiter'],
    note: 'Crystalline beings who need heat that would cook a human. They spin an energy web around a trapped ship (“The Tholian Web”).' },
  { name: 'The silver blood', kind: 'trek', home: 'A Demon class planet', cls: 'Y',
    note: 'A liquid that copies Harry Kim and Tom Paris and wakes up aware. Voyager leaves behind a whole crew of copies (Voyager, “Demon”).' },
  { name: 'The Founders', kind: 'trek', home: 'A rogue planet in the Omarion Nebula', cls: 'R',
    note: 'Shape-shifters who merge into one living sea, the Great Link, on a world with no sun (Deep Space Nine, “The Search”).' },

  // Earth
  { name: 'Blue whale', kind: 'earth', home: 'Earth’s oceans', cls: 'O', also: ['sub-neptune', 'ice-giant'],
    note: 'The largest animal that has ever lived, and possible only because water carries its weight. On land its own bulk would crush it.' },
  { name: 'Elephant', kind: 'earth', home: 'Africa and Asia', cls: 'super-earth', also: ['T'],
    note: 'Twice an animal’s length means eight times its weight, but only four times the strength in its bones. That’s why big animals stand on thick, straight pillars of legs.' },
  { name: 'Fennec fox', kind: 'earth', home: 'The Sahara', cls: 'H',
    note: 'Enormous ears full of blood vessels let heat escape, and it hunts at night when the sand has cooled.' },
  { name: 'Tardigrades', kind: 'earth', home: 'Everywhere', cls: 'D', also: ['K'],
    note: 'Half a millimetre long with eight stubby legs. Dried out, they have survived open space, deep cold and doses of radiation that would kill a person.' },
  { name: 'Lichens', kind: 'earth', home: 'Rocks, worldwide', cls: 'K',
    note: 'A fungus and an alga living as one. Some kinds kept working after weeks in chambers that copy the air and cold of Mars.' },
  { name: 'Tube worms', kind: 'earth', home: 'Hot vents on the sea floor', cls: 'R', also: ['P'],
    note: 'They live in total darkness and feed on bacteria that run on chemicals from the vents, not on sunlight. That’s how life might live under the ice of Europa.' },
  { name: 'Icefish', kind: 'earth', home: 'Antarctic seas', cls: 'P',
    note: 'Antifreeze in their blood keeps them from freezing in water below 0 °C, and they have no haemoglobin, so their blood runs clear.' },
  { name: 'Pompeii worm', kind: 'earth', home: 'Pacific vent chimneys', cls: 'Y', also: ['lava-world'],
    note: 'Among the most heat-tolerant animals known, living against vent walls hot enough to hurt. Even it would die in seconds on a Class Y world.' },
  { name: 'Mosses', kind: 'earth', home: 'Earth, 470 million years ago', cls: 'L',
    note: 'The first plants on land had it to themselves for millions of years before any animal crawled out of the sea: Earth was a Class L world.' },
  { name: 'Floaters', kind: 'earth', home: 'Imagined for Jupiter', cls: 'J', also: ['T', 'hot-jupiter', 'ice-giant'],
    note: 'In 1976 Carl Sagan and Edwin Salpeter imagined living gas bags kilometres across in Jupiter’s clouds, with “sinkers” and “hunters” alongside.' },
  { name: 'Venus’s cloud microbes', kind: 'earth', home: 'Proposed for Venus', cls: 'N',
    note: 'In 2020 astronomers reported phosphine in Venus’s clouds, a gas that life makes on Earth. The finding is still disputed.' },
];

// The specimens that belong with a class, its own first.
export function specimensFor(id) {
  return [...SPECIMENS.filter(s => s.cls === id), ...SPECIMENS.filter(s => s.cls !== id && s.also?.includes(id))];
}

// ---------- Trouble in the lab ----------
// Keep a tribble and it does what tribbles do. Spock's count in “The Trouble with Tribbles”: one tribble with a litter
// of ten every twelve hours comes to 1,771,561 after three days, 11 to the power of 6, one litter for each twelve
// hours. The jar counts a litter for every twelve hours since the tribble was kept, and stops at his figure, as he did.
export const TRIBBLE_HOURS = 12;
const TRIBBLE_LITTERS = 6;
const AFTER = ['', 'twelve hours', 'a day', 'a day and a half', 'two days', 'two and a half days', 'three days'];
// { n, done, next (when the next litter is due, ms, or null), line } for a tribble kept at `kept` (an ISO date).
export function tribbles(kept, now = Date.now()) {
  const t = Date.parse(kept), step = TRIBBLE_HOURS * 3600e3;
  const litters = Number.isFinite(t) ? Math.min(TRIBBLE_LITTERS, Math.max(0, Math.floor((now - t) / step))) : 0;
  const n = 11 ** litters, done = litters === TRIBBLE_LITTERS;
  const line = litters === 0 ? 'One tribble. Born pregnant: ten more within twelve hours.'
    : done ? `${n.toLocaleString('en-US')} tribbles after three days: Mr Spock’s figure exactly (“The Trouble with Tribbles”). He stopped counting there, and so does the jar.`
    : `${n.toLocaleString('en-US')} tribbles after ${AFTER[litters]}. Every one of them has ten young every twelve hours.`;
  return { n, done, next: done || !Number.isFinite(t) ? null : t + (litters + 1) * step, line };
}
