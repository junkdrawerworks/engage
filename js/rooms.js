// The rooms off the bridge, in the order the welcome card and Bridge settings list them. A new room is one more line
// here: both lists are drawn from this table. `href` is the room's page beside the bridge; `button` is the id of the
// link to it on the bridge (the round buttons, and the warp scale under the warp slider), or null for a room the
// bridge reaches from the captain's log instead (the system view and the away team, from a star's planets); `icon`
// is the inside of that button's 24 × 24 drawing, so the list shows the same picture as the button. Pure, checked by
// test/bridge.test.mjs.

export const ROOMS = [
  {
    id: 'survey', href: 'survey.html', button: 'open-survey', name: 'Planetary survey',
    line: 'Starfleet’s planet classes, beside the real planets astronomers have found.',
    icon: '<circle cx="12" cy="12" r="5.5"/><path d="M4.2 15.6c-1.6 1.5-2 2.8-1.2 3.4 1.6 1.2 7-1.6 12-6.2s7.8-9.2 6.6-10.4c-.6-.6-1.9-.3-3.4.8"/>',
  },
  {
    id: 'system', href: 'system.html', button: null, name: 'System view',
    line: 'Fly in to a star’s real planets, and place one of your own round any star.',
    icon: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="6"/><path d="M21.5 12a9.5 9.5 0 1 1-2.8-6.7"/><circle cx="20.2" cy="7.4" r="1.5"/>',
  },
  {
    id: 'away', href: 'away.html', button: null, name: 'Away team',
    line: 'Beam down and stand on a real planet, under its own sun.',
    icon: '<path d="M3 20.5h18"/><circle cx="12" cy="9.5" r="2"/><path d="M9.5 20.5v-4.5l2.5-2 2.5 2v4.5"/><path d="M7 3.5l1.6 2.6M17 3.5l-1.6 2.6M12 2.5v3"/>',
  },
  {
    id: 'xeno', href: 'xeno.html', button: 'open-xeno', name: 'Xenobiology lab',
    line: 'Grow a creature for any world, shaped by its gravity, light and air.',
    icon: '<path d="M9.5 3h5M10.5 3v5.6L5.2 17.8A2.2 2.2 0 0 0 7.1 21h9.8a2.2 2.2 0 0 0 1.9-3.2L13.5 8.6V3"/><path d="M7.4 14.5h9.2"/><circle cx="10.6" cy="17.6" r=".9"/><circle cx="13.8" cy="16.6" r=".6"/>',
  },
  {
    id: 'maru', href: 'maru.html', button: 'open-maru', name: 'Kobayashi Maru',
    line: 'The Academy’s no-win test: 381 aboard, and the Klingons coming.',
    icon: '<path d="M12 2.8c-2.4 5.2-4.6 11.6-6.2 18.4 1.9-2.4 4-3.6 6.2-3.6s4.3 1.2 6.2 3.6C16.6 14.4 14.4 8 12 2.8z"/>',
  },
  {
    id: 'contact', href: 'contact.html', button: 'open-contact', name: 'First contact',
    line: 'An unknown ship hails you in a language made of stories.',
    icon: '<path d="M4.5 4.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 4v-4h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M7.5 9l1.5 2.5L10.5 9M13 8.5v4M15.5 10.5h2"/>',
  },
  {
    id: 'missions', href: 'missions.html', button: 'open-missions', name: 'Long missions',
    line: 'Where the Voyagers and the other real ships are right now.',
    icon: '<path d="M4.6 9.6a8.2 8.2 0 0 0 9.8 9.8z"/><path d="M9.5 14.5l3-3"/><path d="M14.5 6.2a3.6 3.6 0 0 1 3.3 3.3M14.8 2.6a7.2 7.2 0 0 1 6.6 6.6"/>',
  },
  {
    id: 'tonight', href: 'tonight.html', button: 'open-sky', name: 'Tonight’s sky',
    line: 'Hold your phone up and see which stars over your head Starfleet knows.',
    icon: '<path d="M2.5 19.5c3-2.4 6.2-3.6 9.5-3.6s6.5 1.2 9.5 3.6"/><path d="M12 3.2l1.1 2.7 2.7 1.1-2.7 1.1L12 10.8l-1.1-2.7-2.7-1.1 2.7-1.1z"/><path d="M18.4 9.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5zM5.6 8.8l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z"/>',
  },
  {
    id: 'warp', href: 'warp.html', button: 'open-scale', name: 'Warp scale',
    line: 'Race ships to the Moon, Vulcan, the galactic core and Andromeda.',
    icon: '<path d="M3 8h8M5 12h10M3 16h8"/><path d="M15 7l5 5-5 5"/>',
  },
];

// The list as HTML. `base` goes in front of each page's name (the single-file copy points it at the live site) and
// `away` after it (that copy opens the rooms in a new tab).
export function roomList(base = '', away = '') {
  return `<ul class="rooms">${ROOMS.map(r => `<li><a href="${base}${r.href}"${away} data-room="${r.id}">`
    + `<span class="room-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${r.icon}</svg></span>`
    + `<span class="room-text"><b>${r.name}</b><span>${r.line}</span></span></a></li>`).join('')}</ul>`;
}

// What's new off the bridge since the last visit: the rooms not in `known`, the ids of those the bridge has already
// told of (none for a save from before it kept them, which is taken to know them all).
export const newRooms = known => (Array.isArray(known) ? ROOMS.filter(r => !known.includes(r.id)) : []);
// The line that says so, with a link to each: "New since your last visit: System view and Away team."
export function whatsNew(rooms, base = '', away = '') {
  const links = rooms.map(r => `<a href="${base}${r.href}"${away} data-room="${r.id}">${r.name.replace(/ /g, '\u00a0')}</a>`);
  const list = links.length > 1 ? `${links.slice(0, -1).join(', ')} and ${links[links.length - 1]}` : links[0] || '';
  return list ? `New since your last visit: ${list}.` : '';
}

// A count in words, for "all ten rooms": a room list is never long.
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const inWords = n => WORDS[n] ?? String(n);
