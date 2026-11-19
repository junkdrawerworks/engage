// Voyages: named routes at the top of Set course, flown leg by leg. Each stop is a star with notes in the captain's
// log (js/destinations.js), so every arrival on the way has something to say. The bridge keeps one voyage under way
// as `voyage: { id, leg }` in its save, `leg` being the stop it is bound for next, counted from 0; each arrival at
// that stop carries `voyage: { id, leg, of }` in its log entry, counted from 1. A voyage is flown once an entry has
// its last leg: that is worked out from the log, so clearing the log clears it, and nothing else is stored.
// Pure: the bridge passes in how to find a star and where each one is.

export const VOYAGES = [
  {
    id: 'neighbours', name: 'The neighbours',
    line: 'The Sun’s nearest neighbours, one after another, and home.',
    stops: ['Proxima Centauri', 'Rigil Kentaurus', "Barnard's Star", 'Wolf 359', 'Lalande 21185', 'Sirius', 'Sol'],
  },
  {
    id: 'atlas', name: 'Starfleet’s atlas',
    line: 'Vulcan’s sun, the battle at Wolf 359, Altair VI, the Vega colony, Rigel VII and Farpoint, where Star Trek put them.',
    stops: ['Keid', 'Wolf 359', 'Altair', 'Vega', 'Rigel', 'Deneb'],
  },
  {
    id: 'planets', name: 'The planet hunt',
    line: 'Six stars with planets, nearest first, out to 51 Pegasi, the first star like the Sun found to have one.',
    stops: ['Proxima Centauri', 'Ran', "Teegarden's Star", 'Pollux', 'TRAPPIST-1', 'Helvetios'],
  },
  {
    id: 'winter', name: 'The winter sky taken apart',
    line: 'The six stars of the Winter Hexagon and Betelgeuse in its middle. From Earth one shape; out here, 9 to 860 light years deep.',
    stops: ['Sirius', 'Procyon', 'Pollux', 'Capella', 'Aldebaran', 'Betelgeuse', 'Rigel'],
  },
  {
    id: 'brightest', name: 'The brightest seven',
    line: 'The seven brightest stars in Earth’s night sky, brightest first (Alpha Centauri’s two count as one, as the eye sees them).',
    stops: ['Sirius', 'Canopus', 'Rigil Kentaurus', 'Arcturus', 'Vega', 'Capella', 'Rigel'],
  },
];

export const voyageById = id => VOYAGES.find(v => v.id === id) || null;

// The voyage under way as a save holds it, or null when what is there isn't one.
export function tidyVoyage(x) {
  if (!x || typeof x !== 'object') return null;
  const v = voyageById(x.id);
  return v && Number.isInteger(x.leg) && x.leg >= 0 && x.leg < v.stops.length ? { id: v.id, leg: x.leg } : null;
}

// Setting out on a voyage from star `at`: bound for its first stop, or for its second when the ship is at the first
// already (that leg counts as flown).
export function setOut(v, at, find) {
  return { id: v.id, leg: find(v.stops[0]) === at && v.stops.length > 1 ? 1 : 0 };
}

// The star a voyage under way is bound for next (its index in the catalogue), or null.
export function nextStop(voyage, find) {
  const v = voyage && voyageById(voyage.id);
  if (!v) return null;
  const i = find(v.stops[voyage.leg]);
  return i === undefined ? null : i;
}

// The ship has arrived at star `star`. When that is the stop the voyage was bound for, the entry's tag, the voyage
// as it now stands (null once its last leg is flown) and whether that was the last; otherwise null: a detour
// doesn't count against the voyage, and the next leg is still there to fly.
export function arrivedAt(voyage, star, find) {
  const v = voyage && voyageById(voyage.id);
  if (!v || find(v.stops[voyage.leg]) !== star) return null;
  const of = v.stops.length, leg = voyage.leg + 1;
  return { tag: { id: v.id, leg, of }, voyage: leg < of ? { id: v.id, leg } : null, done: leg === of };
}

// The voyages the log shows flown to their last leg.
export function flown(log) {
  const out = new Set();
  for (const e of log) {
    const t = e?.voyage;
    if (t && voyageById(t.id) && t.leg === t.of) out.add(t.id);
  }
  return out;
}

// How far the stops still to fly add up to, in parsecs, from position `from`: the stops from `leg` on, in order.
export function routeLength(v, leg, from, find, pos) {
  let at = from, d = 0;
  for (const name of v.stops.slice(leg)) {
    const i = find(name);
    if (i === undefined) continue;
    const p = pos(i);
    d += Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
    at = p;
  }
  return d;
}

// What an arrival on a voyage says in its log entry: "Leg 2 of 7 of The neighbours. Next, Barnard's Star." The
// last leg says the voyage is flown. `next` is the next stop's name as the log writes it.
export function legLine(tag, next) {
  const v = voyageById(tag.id);
  if (!v) return '';
  return tag.leg === tag.of ? `Leg ${tag.of} of ${tag.of}: ${v.name} is flown.` : `Leg ${tag.leg} of ${tag.of} of ${v.name}. Next, ${next}.`;
}
