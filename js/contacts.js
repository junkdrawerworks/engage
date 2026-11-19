// Where first contact happens: the star the bridge has the ship holding at, and, read back the other way, the contacts
// first contact's record says were made at each star. First contact reads the bridge's save; the bridge's log and
// tonight's sky read first contact's record. Nothing here writes to either: each room keeps only its own.

export const CONTACT_KEY = 'engage.contact.v1';
const BRIDGE_KEY = 'engage.v1';

const read = key => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

// Where the ship is, from the bridge's save: { star, place, visit }. `star` is the catalogue index (0 is home, and so
// is no save at all: the bridge starts in Earth orbit); `place` the star's name as the log wrote it, or '' at home or
// when the log no longer has an entry for it; `visit` the id of the log entry for this stay, so a contact made here
// is told on that entry and not on every visit to the same star.
export function shipPlace(bridge) {
  const at = bridge && typeof bridge === 'object' && Number.isInteger(bridge.at) && bridge.at >= 0 ? bridge.at : 0;
  const log = Array.isArray(bridge?.log) ? bridge.log.filter(e => e && typeof e === 'object') : [];
  // The log keeps the newest entry first, and the newest entry for this star is this stay.
  const e = log.find(x => x.star === at);
  const place = at > 0 && typeof e?.title === 'string' && /^[^<>]{1,60}$/.test(e.title) ? e.title : '';
  return { star: at, place, visit: Number.isFinite(e?.id) && e === log[0] ? e.id : null };
}
export const readShipPlace = () => shipPlace(read(BRIDGE_KEY));

// Where the ship is, as the briefing says it after "off your bow": "here at Vega", "in Earth orbit", or nothing when
// the log can't name the star.
export function whereWords(p) {
  if (!p) return '';
  return p.star === 0 ? 'in Earth orbit' : p.place ? `here at ${p.place}` : '';
}

// Every contact first contact's record says was made, with where: { people, star, visit, sd, second }. A first
// contact and a second one with the same people are two. Anything that doesn't make sense is left out.
const PEOPLE = /^[\p{L}’' -]{1,30}$/u;
export function contactsMade(saved) {
  const friends = Array.isArray(saved?.friends) ? saved.friends : [];
  const out = [];
  const one = (people, c, second) => {
    if (!c || !Number.isInteger(c.star) || c.star < 0 || typeof c.sd !== 'string' || !/^\d{4}\.\d{3}$/.test(c.sd)) return;
    out.push({ people, star: c.star, visit: Number.isFinite(c.visit) ? c.visit : null, sd: c.sd, second });
  };
  for (const f of friends) {
    if (!f || typeof f !== 'object' || typeof f.people !== 'string' || !PEOPLE.test(f.people)) continue;
    one(f.people, f, false);
    if (f.again?.outcome === 'friends') one(f.people, f.again, true);
  }
  return out;
}
export const readContacts = () => contactsMade(read(CONTACT_KEY));

// A contact in the words of the log and of tonight's card: "First contact was made here with the Qaethuk, stardate 2026.880."
export const contactLine = c => `${c.second ? 'Second' : 'First'} contact was made here with the ${c.people}, stardate ${c.sd}.`;

// The lines for one log entry: the contacts made during that stay.
export const linesForVisit = (contacts, entry) => contacts.filter(c => c.visit != null && c.visit === entry?.id && c.star === entry.star).map(contactLine);
// The lines for one star, on any visit: tonight's card for it.
export const linesForStar = (contacts, star) => contacts.filter(c => c.star === star && star > 0).map(contactLine);
