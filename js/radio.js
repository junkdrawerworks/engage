// Subspace radio: Earth's broadcasts spreading through the real stars, the messages people have aimed at real stars,
// and a hail of your own. Pure: js/radio-room.js draws what this works out. Checked by test/radio.test.mjs.
import { LY_PER_PC } from './physics.js';
import { ANCHORS } from './destinations.js';

// Earth's first television strong enough to leak into space: the Berlin Olympics and the BBC's service, both 1936,
// the year the captain's log counts from too (js/log.js).
export const FIRST_TV = 1936;
// The map reaches 100 light years. The catalogue has every star it knows of out to 80 (tools/build-data.py), and
// past that only the ones brighter than magnitude 7 from Earth, so the last stretch of the map is sparse.
export const MAP_LY = 100, COMPLETE_LY = 80;

// The year as a number with the fraction of it gone, as the bridge's stardate has it: 19 November 2026 is 2026.884.
export function yearNow(date = new Date()) {
  const y = date.getUTCFullYear(), start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}
// And back: the moment a year-with-fraction stands for, in milliseconds.
export function msOfYear(year) {
  const y = Math.floor(year), start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return Math.round(start + (year - y) * (end - start));
}

const lyOf = (cat, i) => Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;

// The year of Earth's broadcasts reaching a star `ly` light years out tonight (`now` as yearNow gives it): the
// light arriving now left in it. Before the first broadcasts, none: { year: null, from } with the year the first
// will reach it.
export function heardAt(ly, now) {
  const year = Math.floor(now - ly);
  return year >= FIRST_TV ? { year, from: null } : { year: null, from: Math.floor(FIRST_TV + ly) };
}

// The stars hearing year `year` tonight: those whose light-travel time puts that year's broadcasts on them now, as
// [{ star, ly }], nearest first. Stars with no measured distance are left out (nobody knows when anything reaches
// them), and so is home. `cat` needs `count`, `pos` (parsecs) and `unmeasured`.
export function hearing(cat, year, now) {
  const near = now - year - 1, far = now - year; // left in that year: from the start of it to the end
  const out = [];
  for (let i = 1; i < cat.count; i++) {
    if (cat.unmeasured[i]) continue;
    const ly = lyOf(cat, i);
    if (ly > near && ly <= far) out.push({ star: i, ly });
  }
  return out.sort((a, b) => a.ly - b.ly);
}

// The three to name of those: destinations with notes first, then stars with a name of their own (not a catalogue
// number), then the brightest from Earth. `known(i)` says a star has notes; `named(i)` that it has a proper name.
export function pickThree(cat, list, { known = () => false, named = () => false } = {}) {
  const mag = s => cat.absmag[s.star] + 5 * Math.log10(s.ly / LY_PER_PC / 10);
  const rank = s => (known(s.star) ? 0 : named(s.star) ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || mag(a) - mag(b)).slice(0, 3);
}
// A star's own name, not a number from a catalogue: Vega or Teegarden's Star, not HIP 3, Gliese 581 or HD 33948.
export const properName = name => !/^(HIP|HD|HR|HYG|Gliese|GJ|Wolf|Ross|LHS|LP|G) ?[0-9]/.test(name) && !/^[0-9]+ [A-Z]/.test(name);

// What was on the air in the years before the long missions' moments begin, from 1936 to 1956: [year, what]. Each
// is a broadcast that went out that year. 1936, 1937, 1941 and 1947 were checked on 19 November 2026 against
// Wikipedia ("First day of BBC television", "1937 in British television", "1947 World Series") and the Television
// Academy's "July 1, 1941: The Day Commercial Television Was Born"; the BBC's 1936 service is the first regular
// *high-definition* one, since Berlin's 180-line service began in 1935. 1938 was checked on 20 November 2026 against
// Wikipedia's "1938 FA Cup final" (Preston North End 1, Huddersfield Town 0, 30 April 1938, the first final broadcast
// on television) and "1937 FA Cup final" (part of that match was shown; 1938's was the first televised in its
// entirety). Only television is listed: radio of the time went out on AM, which the ionosphere bends back to the
// ground, so Orson Welles's The War of the Worlds (1938) is left out. The other four are well-known dates not looked
// up again.
export const ON_AIR = [
  [1936, 'the Berlin Olympics were televised, and the BBC opened the world’s first regular high-definition television service'],
  [1937, 'the BBC televised the coronation procession of George VI'],
  [1938, 'the BBC televised the FA Cup Final live and in full for the first time'],
  [1939, 'NBC televised the opening of the New York World’s Fair'],
  [1941, 'the first paid television advertisement, for a Bulova clock, in New York'],
  [1947, 'the first televised World Series'],
  [1951, 'the first episode of I Love Lucy'],
  [1953, 'the coronation of Elizabeth II, watched live by millions'],
  [1955, 'the first episode of Gunsmoke'],
];

// The line under the dial for a year: what was on the air, or else what happened, or nothing.
export function yearLine(year) {
  const air = ON_AIR.find(([y]) => y === year);
  if (air) return `On the air in ${year}: ${air[1]}.`;
  const a = ANCHORS.find(([y]) => y === year);
  return a ? `In ${year}, ${a[1]}.` : '';
}

// ---------- Messages in flight ----------

// The radio messages people have aimed at real stars, each with the stars it went to as the catalogue names them,
// the day it left (or the year, `year: true`, where only that is known) and what went. From Wikipedia's "List of
// interstellar radio messages" and the articles on each, read 19 November 2026. Arrivals are worked out here, from
// the day it left and the catalogue's distance, so they can differ by a year from the list's. The Arecibo message's
// target, the globular cluster M13, isn't in the catalogue: its distance (`ly`) is the list's. Lone Signal's first day
// (the list gives only 2013) and its free first message are from Wikipedia's "Lone Signal", read the same day.
export const MESSAGES = [
  { id: 'arecibo', name: 'The Arecibo message', from: 'the Arecibo dish, Puerto Rico', what: 'Frank Drake’s 1,679 bits: a picture of numbers, DNA, a person, the Solar System and the dish that sent it.',
    to: [{ star: null, title: 'M13, a globular cluster in Hercules', ly: 25000, sent: '1974-11-16' }] },
  { id: 'altair', name: 'CALL to the COSMOS’83', from: 'a radio telescope at Stanford, California', what: 'Children’s voices and 13 pictures by the astronomers Masaki Morimoto and Hisashi Hirabayashi, for a Japanese comic magazine.',
    to: [{ star: 'Altair', sent: '1983-08-15' }] },
  { id: 'cosmic1', name: 'Cosmic Call 1', from: 'the RT-70 dish at Yevpatoria', what: 'A dictionary of numbers and science, and messages from the public.',
    to: [{ star: '16 Cygni', sent: '1999-05-24' }, { star: '15 Sagittae', sent: '1999-06-30' }, { star: 'Gliese 746', title: 'HD 178428', sent: '1999-06-30' }, { star: 'Gliese 777A', sent: '1999-07-01' }] },
  { id: 'teen', name: 'Teen Age Message', from: 'the RT-70 dish at Yevpatoria', what: 'A concert played on a theremin, chosen by Russian teenagers.',
    to: [{ star: 'Gliese 797A', title: 'HD 197076', sent: '2001-08-29' }, { star: 'Chalawan', title: '47 Ursae Majoris', sent: '2001-09-03' }, { star: '37 Geminorum', sent: '2001-09-03' }, { star: 'Gliese 547', title: 'HD 126053', sent: '2001-09-03' }, { star: 'Gliese 327', title: 'HD 76151', sent: '2001-09-04' }, { star: 'Gliese 788', title: 'HD 193664', sent: '2001-09-04' }] },
  { id: 'cosmic2', name: 'Cosmic Call 2', from: 'the RT-70 dish at Yevpatoria', what: 'The 1999 dictionary again, with more messages from the public.',
    to: [{ star: 'Gliese 49', sent: '2003-07-06' }, { star: 'Gliese 208', sent: '2003-07-06' }, { star: 'Copernicus', title: '55 Cancri', sent: '2003-07-06' }, { star: 'Gliese 67', title: 'HD 10307', sent: '2003-07-06' }, { star: 'Chalawan', title: '47 Ursae Majoris', sent: '2003-07-06' }] },
  { id: 'beatles', name: 'Across the Universe', from: 'NASA’s 70-metre dish at Madrid', what: 'The Beatles’ song, 40 years after it was recorded, for NASA’s 50th birthday.',
    to: [{ star: 'Polaris', sent: '2008-02-04' }] },
  { id: 'amfe', name: 'A Message From Earth', from: 'the RT-70 dish at Yevpatoria', what: '501 messages chosen in a competition on the social network Bebo, for its planet Gliese 581 c.',
    to: [{ star: 'Gliese 581', sent: '2008-10-09' }] },
  { id: 'hfe', name: 'Hello From Earth', from: 'NASA’s 70-metre dish at Tidbinbilla, near Canberra', what: '25,880 messages from people in 195 countries, gathered by Cosmos magazine.',
    to: [{ star: 'Gliese 581', sent: '2009-08-28' }] },
  { id: 'rubisco', name: 'RuBisCo Stars', from: '', what: 'The genetic code of RuBisCo, the protein plants use to take carbon from the air.',
    to: [{ star: 'Gliese 83.1', title: 'TZ Arietis', sent: '2009-11-09' }, { star: "Teegarden's Star", sent: '2009-11-09' }, { star: 'κ¹ Ceti', sent: '2009-11-10' }] },
  { id: 'wow', name: 'The Wow! signal reply', from: '', what: 'Messages from the public, 35 years after a strong signal from Sagittarius that was never heard again.',
    to: [{ star: '37 Geminorum', sent: '2012-08-15' }, { star: 'Copernicus', title: '55 Cancri', sent: '2012-08-15' }] },
  { id: 'lone', name: 'Lone Signal', from: 'the Jamesburg Earth Station, California', what: 'Short messages from the public, one free and the rest at 25 cents each.',
    to: [{ star: 'Gliese 526', sent: '2013-06-17' }] },
  { id: 'esa', name: 'A Simple Response to an Elemental Message', from: '', what: 'Answers from the public to a question about how we live with our planet.',
    to: [{ star: 'Polaris', sent: '2016-10-10' }] },
  { id: 'sonar', name: 'Sónar Calling GJ273b', from: 'the EISCAT dish near Tromsø, Norway', what: 'A lesson in counting and time, then 33 short pieces of music, for Luyten’s Star’s temperate planet.',
    to: [{ star: "Luyten's Star", sent: '2017-10-16' }] },
];

// Every target as a row, by when it arrives: [{ message, target, star, title, ly, sent, arrives, share, arrived }].
// `sent` and `arrives` are years with their fractions, `share` how far along it is (0 to 1), `star` the catalogue's
// number or null (M13, or a name the catalogue lacks). `byName(name)` finds a star.
export function flights(cat, byName, now) {
  const rows = [];
  for (const m of MESSAGES) {
    for (const t of m.to) {
      const i = t.star ? byName(t.star) : undefined;
      const star = Number.isInteger(i) && !cat.unmeasured[i] ? i : null;
      const ly = star != null ? lyOf(cat, star) : t.ly;
      if (!ly) continue;
      const sent = yearNow(new Date(`${t.sent}T12:00:00Z`)), arrives = sent + ly;
      rows.push({ message: m, target: t, star, title: t.title || t.star, ly, sent, arrives, share: Math.min(1, Math.max(0, (now - sent) / ly)), arrived: now >= arrives });
    }
  }
  return rows.sort((a, b) => a.arrives - b.arrives);
}

// When a message gets there, in words: "arrived about 2000", "due about 2029", "due about 25,970".
export const yearSaid = y => { const n = Math.floor(y); return n >= 10000 ? n.toLocaleString('en-US') : String(n); };
export const arrivalSaid = row => `${row.arrived ? 'arrived' : 'due'} about ${yearSaid(row.arrives)}`;

// ---------- Your hails ----------

// What the room keeps, read back: { hails: [{ star, sent, ly, title }] }, a star's name and the moment the hail left
// (ms), with how far it had to go and the star's name as the room says it, for the captain's log (a hail kept before
// those were has only the first two). One hail to a star: a hail on its way isn't sent again. Anything else, or a
// moment still to come, is left out.
export function readHails(s, nowMs = Date.now()) {
  const list = Array.isArray(s?.hails) ? s.hails : [];
  const seen = new Set(), hails = [];
  for (const h of list) {
    if (!h || typeof h.star !== 'string' || !h.star || !Number.isFinite(h.sent) || h.sent <= 0 || h.sent > nowMs + 60000 || seen.has(h.star)) continue;
    seen.add(h.star);
    hails.push({ star: h.star, sent: h.sent, ...(Number.isFinite(h.ly) && h.ly > 0 ? { ly: h.ly } : {}), ...(typeof h.title === 'string' && /^[^<>]{1,60}$/.test(h.title) ? { title: h.title } : {}) });
  }
  return { hails };
}

// A hail to a star `ly` out, sent at `sentMs`: how far along it is by `nowMs` and when it lands, in ms.
export function hailProgress(sentMs, ly, nowMs) {
  const arrives = msOfYear(yearNow(new Date(sentMs)) + ly);
  return { arrives, share: Math.min(1, Math.max(0, (nowMs - sentMs) / (arrives - sentMs))), arrived: nowMs >= arrives };
}

// "4 years 2 months", "11 months", "26 days": how long until a moment `ms` from `nowMs`, roughly.
export function spanSaid(ms) {
  const days = ms / 86400000;
  if (days < 1) return 'less than a day';
  if (days < 61) return `${Math.round(days)} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  const y = Math.floor(months / 12), mo = months % 12;
  return y >= 10 || !mo ? `${y.toLocaleString('en-US')} years` : `${y} years ${mo} ${mo === 1 ? 'month' : 'months'}`;
}
