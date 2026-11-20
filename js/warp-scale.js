// The warp scale explorer's numbers: the places on the ladder from the Moon to Andromeda, the ships racing there, how
// long each takes, and the race clock. Pure, so test/warp.test.mjs can check it without a browser.
import { warpSpeed, plural, formatYear } from './physics.js';
import { readings, planetAt, earthAt, moonAt, jdOf, dateOf, whenAbove, LIGHT_DAY_AU, C_KM_S } from './ephemeris.js';
import { sightById } from './deepsky.js';
import { decodeDesign, encodeDesign, hullById, stats as designStats } from './shipyard-sim.js';
import { fullName } from './myship.js';

// A cluster's, a nebula's or a galaxy's rung: its distance, its card's words and its Star Trek line from the deep
// sky's list (js/deepsky.js, where each distance has its source), and `sight`, the card tonight's sky opens for it.
// One the bridge flies to has its star as `course`, so the card offers Set course and the helm's link finds the rung.
const deep = (id, group, color, kind) => {
  const o = sightById.get(id);
  return { id, name: o.name, group, ly: o.ly, color, kind, sight: id, about: o.about, ...(o.star ? { course: o.star } : {}), ...(o.trek ? { trek: o.trek } : {}) };
};

export const AU_PER_LY = 63241.1;
export const SECONDS_PER_YEAR = 31557600; // a Julian year, the one light years are measured in
const LIGHT_SECOND_LY = 1 / SECONDS_PER_YEAR;

// The ships in the race, fastest first. Warp 1 is the speed of light exactly: that's how the scale is defined.
// "custom" is whatever warp factor the slider is at.
export const LANES = [
  { id: 'w9975', label: 'Warp 9.975', warp: 9.975, note: 'Voyager’s top cruising speed', color: '#ffb54a' },
  { id: 'custom', label: 'Your warp', warp: 9, note: 'Set it below', color: '#c9a2ff' },
  { id: 'w5', label: 'Warp 5', warp: 5, note: 'Starfleet’s speed limit after Force of Nature', color: '#86d8ff' },
  { id: 'w1', label: 'Warp 1', warp: 1, note: 'Light itself, and the Phoenix’s first flight in 2063', color: '#f4f7ff' },
  { id: 'real', label: 'Voyager 1', kmS: 16.9, note: 'The fastest thing leaving the Solar System', color: '#6fe3a4' },
];

// The real ship in the bottom lane, picked under the race: two on their way out of the Solar System now, the fastest
// anything has ever gone, and two ideas for crossing to the stars, each with one honest line on the place card.
// `track` is the ship in js/ephemeris.js whose speed is worked out for the day; the others are fixed.
//  - Parker Solar Probe: 430,000 mph (192 km/s) at her closest pass, 3.8 million miles above the Sun on 24 December
//    2024 (NASA, "NASA's Parker Solar Probe Makes History With Closest Pass to Sun", 27 December 2024).
//  - Breakthrough Starshot: probes pushed by lasers to 20% of light, announced 12 April 2016; on hold since 2025
//    (Scientific American, "The Quiet Demise of Breakthrough Starshot", 16 September 2025).
export const REAL_SHIPS = [
  {
    id: 'voyager', label: 'Voyager 1', track: 'v1', kmS: 16.9, note: 'The fastest thing leaving the Solar System',
    line: 'Voyager 1’s real speed today, from her trajectory. Launched in 1977, she is the fastest thing leaving the Solar System, and she isn’t aimed at any star.',
  },
  {
    id: 'nh', label: 'New Horizons', track: 'nh', kmS: 13.6, note: 'Past Pluto, on her way out',
    line: 'New Horizons’ real speed today, from her trajectory. The fastest probe ever launched from Earth, she has slowed since, climbing away from the Sun past Pluto.',
  },
  {
    id: 'parker', label: 'Parker Solar Probe', kmS: 192.2, note: 'At her fastest, 24 December 2024',
    line: 'The fastest anything has ever gone: 192 km/s, only at her closest to the Sun on 24 December 2024 (NASA). She isn’t going anywhere: she falls back round the Sun every 88 days.',
  },
  {
    id: 'starshot', label: 'Breakthrough Starshot', c: 0.2, note: 'A goal, never built',
    line: 'Not a ship but a goal: probes of a gram or so, pushed by lasers to a fifth of light speed, announced in 2016. None was built, and the project has been on hold since 2025.',
  },
  {
    id: 'ark', label: 'A generation ship', c: 0.01, note: 'An idea: 1% of light',
    line: 'An idea, not a design: a ship the size of a town at 1% of light speed, whose crew live and die aboard, and whose descendants, many generations on, arrive.',
  },
];
// A design from the shipyard can race in the same lane: its id is "yard:" and the design's link code (see
// js/shipyard-sim.js), so a link carries the whole design and opens on anyone's warp scale. She races at her
// cruising warp; her line says she is a design, not a real ship.
export function designShip(id) {
  if (typeof id !== 'string' || !id.startsWith('yard:')) return null;
  const d = decodeDesign(id.slice(5));
  if (!d) return null;
  const st = designStats(d), name = fullName(d);
  return {
    id: `yard:${encodeDesign(d)}`, label: name, c: warpSpeed(st.cruise), design: true, note: `Your design, at warp ${st.cruise}`,
    line: `The ${name}, a ${hullById(d.hull).name.toLowerCase()} from your shipyard, at her cruising warp ${st.cruise} (warp ${st.top} at most, for a few hours). A design of yours, not a real ship.`,
  };
}
export const realShip = id => designShip(id) || REAL_SHIPS.find(r => r.id === id) || REAL_SHIPS[0];

export const GROUPS = [
  ['home', 'The Solar System'],
  ['near', 'Neighbours'],
  ['galaxy', 'The Milky Way'],
  ['beyond', 'Further out'],
];

// The places, nearest first. Stars use the same catalogue distances as the bridge, so the helm agrees. The Solar
// System's distances change, so `live` works them out for a date from the same orbits Long missions uses.
// `course` is the star's name in the catalogue, for Set course on the bridge, and `sky` the name tonight's sky opens
// a card for (`sight` for a cluster, a nebula or a galaxy). `file` is the ship in js/ships.js whose file long missions has, and `fileText` what the link to it says.
export const PLACES = [
  {
    id: 'moon', name: 'The Moon', group: 'home', color: '#d8d4cc', kind: 'moon',
    live: jd => Math.hypot(...moonAt(jd)) / C_KM_S * LIGHT_SECOND_LY,
    about: 'About 1.3 light-seconds away. The Apollo crews took three days to get there.',
    trek: 'Starships don’t go to warp this close to a planet. This is what impulse engines are for.',
  },
  {
    id: 'mars', name: 'Mars', group: 'home', color: '#e0805a', kind: 'planet',
    live: jd => fromEarth('mars', jd),
    about: 'Anywhere from 3 to 22 light-minutes, depending on where the two planets are in their orbits. That’s why a rover on Mars can’t be driven with a joystick.',
    trek: 'The Utopia Planitia Fleet Yards, where the Enterprise-D and Voyager were built, orbit Mars.',
  },
  {
    id: 'sun', name: 'The Sun', group: 'home', color: '#ffd27a', kind: 'star',
    live: jd => Math.hypot(...earthAt(jd)) / AU_PER_LY,
    about: 'Sunlight is about 8 minutes 20 seconds old when it reaches you.',
    trek: 'In The Voyage Home, the Bird-of-Prey whips round the Sun at high warp to travel back in time.',
  },
  {
    id: 'jupiter', name: 'Jupiter', group: 'home', color: '#d9b48c', kind: 'planet',
    live: jd => fromEarth('jupiter', jd),
    about: 'Between 33 and 54 light-minutes away. Juno took five years to get there.',
    trek: 'Jupiter Station, where Dr. Lewis Zimmerman wrote the Emergency Medical Hologram, orbits here.',
  },
  {
    id: 'pluto', name: 'Pluto', group: 'home', color: '#cdb59a', kind: 'planet', file: 'nh', fileText: 'New Horizons in long missions',
    live: jd => fromEarth('pluto', jd),
    about: 'Nearly five light-hours away. New Horizons, the fastest probe ever launched, took nine and a half years to fly past it.',
    trek: 'In The First Duty, Wesley Crusher’s squadron crashes on a training flight near Saturn, about a quarter of the way out here.',
  },
  {
    id: 'voyager', name: 'Voyager 1', group: 'home', color: '#6fe3a4', kind: 'probe', file: 'v1', fileText: 'Her file in long missions',
    live: jd => readings('v1', jd).earthAU / AU_PER_LY,
    about: 'The farthest thing people have made, launched in 1977.',
    aboutNow: jd => voyagerLightDay(jd),
    trek: 'In The Motion Picture, V’Ger turns out to be Voyager 6, coming home three centuries later.',
  },
  {
    id: 'oort', name: 'The Oort cloud’s edge', group: 'home', ly: 100000 / AU_PER_LY, color: '#9fb6d8', kind: 'cloud',
    about: 'The comets’ home, so far out the Sun barely holds on to them. Voyager 1 won’t reach even the inside of the cloud for about 300 years.',
  },
  {
    id: 'proxima', name: 'Proxima Centauri', group: 'near', ly: 4.23, color: '#ff9a6a', kind: 'star', course: 'Proxima Centauri', sky: 'Proxima Centauri',
    about: 'The nearest star. Breakthrough Starshot set out in 2016 to send probes the weight of a paperclip here at a fifth of light speed, in about 20 years; it has been on hold since 2025.',
    trek: 'Zefram Cochrane’s Phoenix first broke the warp barrier in 2063. At warp 1 she’d have reached here in just over four years.',
  },
  {
    id: 'wolf', name: 'Wolf 359', group: 'near', ly: 7.8, color: '#ff8a5c', kind: 'star', course: 'Wolf 359', sky: 'Wolf 359',
    about: 'A dim red dwarf, one of the closest stars to the Sun, and far too faint to see without a telescope.',
    trek: 'Where the Borg destroyed 39 Starfleet ships in 2367, with Picard as Locutus.',
  },
  {
    id: 'vulcan', name: '40 Eridani A', group: 'near', ly: 16.26, color: '#ffc98a', kind: 'star', course: 'Keid', sky: 'Keid',
    about: 'An orange dwarf a little smaller than the Sun, in a triple system you can see from Earth with your eyes.',
    trek: 'Star Trek puts Vulcan in orbit round this star. At warp 9.975 Spock could be home in under a day.',
  },
  {
    id: 'vega', name: 'Vega', group: 'near', ly: 25.04, color: '#cfe0ff', kind: 'star', course: 'Vega', sky: 'Vega',
    about: 'One of the brightest stars in the sky, with a wide disc of dust round it.',
    trek: 'The Vega colony is where the Enterprise was headed in The Cage, the very first pilot.',
  },
  {
    id: 'trappist', name: 'TRAPPIST-1', group: 'near', ly: 40.67, color: '#ff7a50', kind: 'star', course: 'TRAPPIST-1', sky: 'TRAPPIST-1',
    about: 'A tiny red star with seven Earth-sized planets, three of them where water could be liquid.',
  },
  deep('hyades', 'galaxy', '#ffcf9a', 'cluster'),
  {
    id: 'pleiades', name: 'The Pleiades', group: 'galaxy', ly: 403, color: '#bcd4ff', kind: 'cluster', course: 'Alcyone', sight: 'pleiades',
    about: 'The Seven Sisters: a young cluster of hot blue stars, about 100 million years old, and easy to see on a winter night.',
  },
  {
    id: 'betelgeuse', name: 'Betelgeuse', group: 'galaxy', ly: 498, color: '#ffa060', kind: 'star', course: 'Betelgeuse', sky: 'Betelgeuse',
    about: 'A red supergiant in Orion that will explode as a supernova some time in the next 100,000 years.',
    trek: 'Home of the Betelgeusians, one of the races at the Federation council in The Voyage Home.',
  },
  deep('coalsack', 'galaxy', '#7d7f99', 'dark'),
  deep('beehive', 'galaxy', '#e8e0c8', 'cluster'),
  {
    id: 'rigel', name: 'Rigel', group: 'galaxy', ly: 863, color: '#c4d8ff', kind: 'star', course: 'Rigel', sky: 'Rigel',
    about: 'A blue supergiant, Orion’s foot, around 100,000 times as bright as the Sun.',
    trek: 'Rigel VII is where Captain Pike’s landing party had the deadly fight he can’t stop thinking about in The Cage.',
  },
  {
    id: 'orion', name: 'The Orion Nebula', group: 'galaxy', ly: 1344, color: '#ff9fc6', kind: 'nebula', course: 'θ¹ Orionis', sight: 'orion',
    about: 'A cloud where new stars are being born, faintly visible to the eye in Orion’s sword.',
    trek: 'A nebula is a captain’s favourite place to hide, the way Kirk lured Khan into the Mutara Nebula.',
  },
  {
    id: 'deneb', name: 'Deneb', group: 'galaxy', ly: 1412, color: '#e4ecff', kind: 'star', course: 'Deneb', sky: 'Deneb',
    about: 'A white supergiant, the tail of the Swan. Its distance is hard to measure: the catalogue says 1,400 light years, newer estimates nearer 2,600.',
    trek: 'Farpoint Station, in the very first episode of The Next Generation, is on Deneb IV.',
  },
  deep('ring', 'galaxy', '#9fe0d0', 'nebula'),
  deep('lagoon', 'galaxy', '#ff8fb0', 'nebula'),
  deep('double', 'galaxy', '#cfe0ff', 'cluster'),
  deep('carina', 'galaxy', '#ffa0a8', 'nebula'),
  deep('omega', 'galaxy', '#ffe6b0', 'cluster'),
  {
    id: 'core', name: 'The galactic core', group: 'galaxy', ly: 26670, color: '#ffe2a8', kind: 'core', headline: true, sight: 'core',
    about: 'Sagittarius A*, a black hole four million times the Sun’s mass, at the centre of the Milky Way. The light reaching us now left it during the last ice age.',
    trek: 'In The Final Frontier the Enterprise-A gets here in what seems like days. On this scale even warp 9.975 takes about four years.',
  },
  {
    id: 'delta', name: 'Where Voyager was stranded', group: 'beyond', ly: 70000, color: '#c9a2ff', kind: 'ship',
    about: 'The far side of the galaxy, in the Delta Quadrant: the Milky Way is about 100,000 light years across.',
    trek: 'Janeway reckoned 75 years to get home at maximum warp. Flying nonstop at warp 9.975 it’s just over ten, so her 75 allowed for a lot of stopping.',
  },
  {
    id: 'lmc', name: 'The Large Magellanic Cloud', group: 'beyond', ly: 160000, color: '#d6dcff', kind: 'galaxy', sight: 'lmc',
    about: 'A small galaxy in orbit round our own, a smudge in the southern sky. In 1987 a star there exploded and could be seen without a telescope.',
    trek: 'To get here you’d cross the galactic barrier at the Milky Way’s edge, which went badly for the Enterprise in Where No Man Has Gone Before.',
  },
  deep('smc', 'beyond', '#d0d6f4', 'galaxy'),
  {
    id: 'andromeda', name: 'Andromeda', group: 'beyond', ly: 2537000, color: '#e8dcff', kind: 'galaxy', sight: 'andromeda',
    about: 'The nearest big galaxy, and the farthest thing you can see with your eyes. It’s heading our way, but whether it will ever merge with the Milky Way isn’t settled: Hubble and Gaia measurements put the chance at about even in the next 10 billion years.',
    trek: 'In By Any Other Name, the Kelvans take over the Enterprise for a 300-year trip home to Andromeda. That’s about 8,500 times light, faster than warp 9.99.',
  },
];
export const byId = new Map(PLACES.map(p => [p.id, p]));

// A place of your own on the ladder: the star the helm is set for, at the catalogue's distance from Earth. The bridge
// sends its name and that distance in the link (warp.html?warp=9&to=Vega&ly=25.04). A star that is on the ladder
// already is that rung, and a star nobody has measured the distance to (the bridge sends none) is no place at all.
export function customPlace(name, ly) {
  if (typeof name !== 'string' || !name.trim() || name.length > 60) return null;
  name = name.trim();
  const known = PLACES.find(p => p.course === name || p.name === name);
  if (known) return known;
  if (!Number.isFinite(ly) || ly <= 0 || ly > 2e5) return null; // nothing in the catalogue is further than this
  return {
    id: 'course', name, group: 'course', ly, color: '#ffb54a', kind: 'star', course: name, sky: name, custom: true,
    about: 'The star your helm is set for, at the catalogue’s distance from Earth. The race leaves from Earth, as every race here does, wherever your ship is holding.',
  };
}
export const COURSE_GROUP = ['course', 'Your course'];

function fromEarth(planet, jd) {
  const p = planetAt(planet, jd), e = earthAt(jd);
  return Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) / AU_PER_LY;
}

// Voyager 1 and one light-day from Earth, said for a date. By the same trajectory Long missions uses she crossed it
// on 18 November 2026 (NASA's own figure is the same morning) and never drops back inside.
let v1Day = 0;
function voyagerLightDay(jd) {
  v1Day ||= whenAbove(t => readings('v1', t).earthAU, LIGHT_DAY_AU, jdOf(new Date('2026-01-01T00:00:00Z')), 2);
  const d = dateOf(v1Day), day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (jd >= v1Day) return `It has been more than a light-day from Earth since ${day}.`;
  const days = Math.ceil(v1Day - jd);
  return days > 60 ? `It reaches one light-day from Earth on ${day}.` : `It reaches one light-day from Earth ${days <= 1 ? 'within a day' : `in ${days} days`}, on ${day}.`;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// What a place's card says about it. A few places have a line that depends on the date.
export const aboutOn = (place, date = new Date()) => (place.aboutNow ? `${place.about} ${place.aboutNow(jdOf(date))}` : place.about);

// How far each place is, in light years, on a date.
export const distanceLy = (place, date = new Date()) => (place.live ? place.live(jdOf(date)) : place.ly);

// Each lane's speed in multiples of light. The real ship's is the one picked (Voyager 1 unless another is); Voyager 1's
// and New Horizons' come from their trajectories when there's a date.
export function laneSpeed(lane, customWarp = 9, date, real = 'voyager') {
  if (lane.id === 'real') {
    const r = realShip(real);
    if (r.c) return r.c;
    return (r.track && date ? readings(r.track, jdOf(date)).speedKmS : r.kmS) / C_KM_S;
  }
  return warpSpeed(lane.id === 'custom' ? customWarp : lane.warp);
}

// Kirk's scale: in the original series a warp factor cubed gave the speed in multiples of light, so warp 6, the
// Enterprise's safe cruising speed, was 216 times light (Stephen Whitfield and Gene Roddenberry, The Making of Star
// Trek, 1968, from the series' writers' guide; never said on screen). The Next Generation's scale is steeper.
export const kirkSpeed = warp => warp ** 3;

export const tripYears = (ly, speedC) => ly / speedC;

// The race clock. Trips run from fractions of a millisecond to hundreds of millions of years, so the clock runs on a
// log scale: it starts at a twentieth of the fastest trip and every second of the race covers the same factor of time.
export function raceClock(times) {
  const from = Math.min(...times) / 20, to = Math.max(...times) * 1.02;
  const decades = Math.log10(to / from);
  const seconds = Math.min(Math.max(decades * 1.05, 5), 13);
  return {
    seconds,
    at: s => from * Math.pow(to / from, Math.min(Math.max(s / seconds, 0), 1)),
    // When, in seconds of the race, a trip of this length ends.
    when: t => seconds * Math.log10(t / from) / decades,
  };
}

// Any span of time, from microseconds to billions of years, in words. The number is rounded first and the unit
// chosen from what it rounds to, so nothing reads "60 seconds", "12 months" or "1,000,000 years", and one of
// anything is singular.
export function formatSpan(years) {
  const s = years * SECONDS_PER_YEAR;
  const us = sigN(s * 1e6);
  if (us < 1000) return count(us, 'microsecond');
  const ms = sigN(s * 1e3);
  if (ms < 1000) return count(ms, 'millisecond');
  if (sigN(s) < 10) return count(sigN(s), 'second');
  if (Math.round(s) < 60) return plural(Math.round(s), 'second');
  const min = Math.round(s / 60);
  if (min < 60) return plural(min, 'minute');
  const h = s / 3600;
  if (h < 23.5) return plural(Math.round(h), 'hour');
  const days = s / 86400;
  if (days < 1.5) return h - 24 >= 0.5 ? `1 day ${plural(Math.round(h - 24), 'hour')}` : '1 day';
  if (days < 59.5) return plural(Math.round(days), 'day');
  const months = Math.round(days / 30.44);
  if (months === 12) return '1 year';
  if (months < 24) return plural(months, 'month');
  if (years < 20) {
    const y = Math.floor(years), m = Math.round((years - y) * 12);
    if (m === 12) return plural(y + 1, 'year');
    return m ? `${plural(y, 'year')} ${plural(m, 'month')}` : plural(y, 'year');
  }
  if (round2(years) < 1e6) return `${round2(years).toLocaleString('en-US')} years`;
  const millions = sigN(years / 1e6);
  if (millions < 1000) return `${millions.toLocaleString('en-US')} million years`;
  return `${sig(years / 1e9)} billion years`;
}

// A distance the way light measures it: light-seconds up close, light years out among the stars.
export function formatLight(ly) {
  const s = ly * SECONDS_PER_YEAR;
  if (sigN(s) < 60) return count(sigN(s), 'light-second');
  if (sigN(s / 60) < 60) return count(sigN(s / 60), 'light-minute');
  if (s < 86400 * 1.5) return count(sigN(s / 3600), 'light-hour');
  if (ly < 0.1) return count(sigN(s / 86400), 'light-day');
  if (ly < 10) return `${ly.toFixed(2)} light years`;
  const round3 = Number(ly.toPrecision(3));
  if (round3 < 1e6) return `${round3.toLocaleString('en-US')} light years`;
  return `${sig(ly / 1e6)} million light years`;
}

// The year a trip leaving now would arrive, while that's still a year worth naming.
export function arrivalYear(years, date = new Date()) {
  if (years < 1 || years > 1e5) return null;
  const y = Math.round(date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12 + years);
  return y > 9999 ? y.toLocaleString('en-US') : String(y);
}

// When the light you see from a place now set off.
export function lightLeft(ly, date = new Date()) {
  if (ly < 1) return null;
  if (ly >= 3000) return `${formatSpan(ly)} ago`;
  return `in ${formatYear(Math.floor(date.getUTCFullYear() + date.getUTCMonth() / 12 - ly))}`; // the calendar year it left in
}

// Where a distance sits on the ladder from a light-second to Andromeda, from 0 to 1, on a log scale.
export const LADDER = [
  [LIGHT_SECOND_LY, 'light-second'], [60 * LIGHT_SECOND_LY, 'light-minute'], [3600 * LIGHT_SECOND_LY, 'light-hour'],
  [86400 * LIGHT_SECOND_LY, 'light-day'], [1, 'light year'], [1000, '1,000 ly'], [1e6, 'million ly'],
];
const LOW = Math.log10(LIGHT_SECOND_LY / 2), HIGH = Math.log10(5e6);
export const ladderAt = ly => (Math.log10(ly) - LOW) / (HIGH - LOW);

// Two significant figures, three from 100 up: as a number, and written out.
const sigN = x => Number(x.toPrecision(x < 100 ? 2 : 3));
const sig = x => sigN(x).toLocaleString('en-US');
// "1 light-second", "1.3 light-seconds": a number that may not be whole, with its unit.
const count = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
// Two significant figures past 100, so 28,341 reads as 28,000.
function round2(x) {
  const a = Math.abs(x);
  if (a < 100) return Math.round(x);
  const p = Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return Math.round(x / p) * p;
}

// The same, squeezed into a ladder cell: "189 µs", "3.9 yr", "2.5M yr". Rounded first here too: "1 min", not "60 s".
export function formatShort(years) {
  const s = years * SECONDS_PER_YEAR;
  if (shortN(s * 1e6) < 1000) return `${short(s * 1e6)} µs`;
  if (shortN(s * 1e3) < 1000) return `${short(s * 1e3)} ms`;
  if (shortN(s) < 60) return `${short(s)} s`;
  if (shortN(s / 60) < 60) return `${short(s / 60)} min`;
  if (shortN(s / 3600) < 24) return `${short(s / 3600)} hr`;
  if (years < 1 / 12 * 2) { const d = short(s / 86400); return `${d} ${d === '1' ? 'day' : 'days'}`; }
  if (shortN(years * 12) < 12) return `${short(years * 12)} mo`;
  if (shortN(years) < 1e6) return `${short(years)} yr`;
  if (shortN(years / 1e6) < 1000) return `${short(years / 1e6)}M yr`;
  return `${short(years / 1e9)}B yr`;
}
const shortN = x => (x < 10 ? Number(x.toFixed(1)) : Number(x.toPrecision(2)));
const short = x => shortN(x).toLocaleString('en-US');

// ---------- Warp 10 ----------
// On the scale The Next Generation uses, warp 10 is the top and can't be reached: infinite speed, everywhere at once.
// Push Your warp hard against its stop three times inside four seconds and the race says what happened to the one
// man who crossed it, in Voyager's “Threshold”. `hits` is when Your warp last reached its stop (ms); returns the hits
// to keep and whether to say it.
export const THRESHOLD = 'Warp 10 is as far as the scale goes: infinite speed, everywhere in the universe at once. Tom Paris crossed it in a shuttle in Voyager’s “Threshold”, and came back turning into a salamander.';
export function againstStop(hits, now, times = 3, within = 4000) {
  const recent = [...hits.filter(t => now - t < within), now];
  return recent.length >= times ? { hits: [], said: true } : { hits: recent, said: false };
}
