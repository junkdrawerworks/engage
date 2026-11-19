// Your ship's name and registry, set in Bridge settings and kept with the bridge's save (engage.v1, as `ship`). The
// rooms that speak of your ship read it from there: the Kobayashi Maru's briefing, first contact's, the captain's log
// and your lane on the warp scale. A ship with no name is spoken of as before ("a starship", "your bow"). Pure but
// for readShip(); checked by test/voyage.test.mjs.

// A name as typed, tidied: letters, numbers, spaces and a few marks, at most 30 characters. '' for none.
export function cleanName(text) {
  return String(text ?? '').replace(/[^\p{L}\p{N} .'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30).trim();
}

// A registry as typed, tidied: capitals, numbers and dashes, at most 12 ("NCC-1701-D"). '' for none.
export function cleanRegistry(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

// The ship from a bridge save: { name, registry }, or null when she has no name.
export function shipOf(save) {
  const s = save && typeof save === 'object' ? save.ship : null;
  const name = s && typeof s.name === 'string' ? cleanName(s.name) : '';
  if (!name) return null;
  return { name, registry: typeof s.registry === 'string' ? cleanRegistry(s.registry) : '' };
}
export function readShip() {
  try { return shipOf(JSON.parse(localStorage.getItem('engage.v1') || 'null')); } catch { return null; }
}

// Starfleet's ships are the USS something: a name typed with a prefix of its own (USS, ISS, IKS, SS, NX…) keeps it.
const PREFIX = /^(?:[A-Z]{2,4}|U\.S\.S\.)\s/;
// "USS Calypso"
export const fullName = ship => (PREFIX.test(ship.name) ? ship.name : `USS ${ship.name}`);
// "Calypso", for "off the Calypso’s bow"
export const shortName = ship => ship.name.replace(PREFIX, '');
// "USS Calypso, NCC-74210"
export const withRegistry = ship => `${fullName(ship)}${ship.registry ? `, ${ship.registry}` : ''}`;
