// The ships on long missions: what each one is, what it has done, and what it is doing now.
// Positions come from js/ephemeris.js; this file is the words. Status notes are as of 2026.

export const SHIPS = [
  {
    id: 'v1', name: 'Voyager 1', color: '#ffb54a', status: 'active',
    agency: 'NASA', launched: '1977-09-05', from: 'Cape Canaveral',
    tagline: 'The farthest anything from Earth has ever gone.',
    where: 'In interstellar space, past the edge of the Sun’s bubble since 2012',
    now: 'Still talking to Earth, at 160 bits a second through a radio about as strong as a fridge light. Her plutonium power supply loses about 4 watts a year, so NASA switches instruments off one by one to keep her going. In 2025 the cosmic ray instrument went quiet, and the low-energy particle instrument was due to follow in 2026, leaving the magnetometer and the plasma wave instrument listening to interstellar space.',
    log: [
      ['1977-09-05', 'Launched from Cape Canaveral, sixteen days after her twin, on a faster path.'],
      ['1979-03-05', 'Jupiter. Found volcanoes erupting on its moon Io, the first active volcanoes seen beyond Earth.'],
      ['1980-11-12', 'Saturn, and a close pass over Titan’s thick orange haze. Titan’s gravity flung her up and out of the planets’ plane for good.'],
      ['1990-02-14', 'Turned around and took the Pale Blue Dot: Earth as a speck, from 6 billion km away.'],
      ['1998-02-17', 'Overtook Pioneer 10 to become the farthest human-made object.'],
      ['2012-08-25', 'Crossed the heliopause at 121.6 AU, the first ship to reach interstellar space.'],
      ['2024-04-20', 'Making sense again after five months of gibberish, fixed from 22 light-hours away by moving code around a failed memory chip.'],
    ],
    bound: { star: 'Gliese 445', text: 'She’s heading out of the Solar System toward Ophiuchus. In about 40,000 years she’ll pass 1.6 light years from the red dwarf Gliese 445.' },
    record: 'Carries the Golden Record: sounds and pictures of Earth, and music from Bach to Chuck Berry.',
    golden: true,
  },
  {
    id: 'v2', name: 'Voyager 2', color: '#86d8ff', status: 'active',
    agency: 'NASA', launched: '1977-08-20', from: 'Cape Canaveral',
    tagline: 'The only ship to visit Uranus and Neptune.',
    where: 'In interstellar space since 2018, falling away below the planets’ plane',
    now: 'She’s so far south of the planets’ plane that only one dish on Earth can reach her: the 70-metre antenna at Canberra, Australia. NASA turned off her plasma instrument in 2024 and her low-energy particle instrument in 2025 to save power, and the cosmic ray instrument was due to follow in 2026.',
    log: [
      ['1977-08-20', 'Launched first, on the slower path that could reach all four giant planets.'],
      ['1979-07-09', 'Jupiter.'],
      ['1981-08-25', 'Saturn.'],
      ['1986-01-24', 'Uranus, the only visit it has ever had. Found 10 new moons.'],
      ['1989-08-25', 'Neptune and its moon Triton, the last stop of the Grand Tour. Neptune bent her path south.'],
      ['2018-11-05', 'Crossed the heliopause at 119 AU into interstellar space.'],
      ['2023-08-04', 'A wrong command had tilted her antenna 2 degrees off Earth. Canberra shouted a fix at full power, and she turned back.'],
    ],
    bound: { star: 'Ross 248', text: 'She’s heading toward Pavo, the Peacock. In about 40,000 years she’ll pass 1.7 light years from the red dwarf Ross 248, and in 296,000 years, 4.3 light years from Sirius.' },
    record: 'Carries the other copy of the Golden Record.',
    golden: true,
  },
  {
    id: 'nh', name: 'New Horizons', color: '#c9a6ff', status: 'active',
    agency: 'NASA', launched: '2006-01-19', from: 'Cape Canaveral',
    tagline: 'Pluto’s first visitor, now crossing the Kuiper Belt.',
    where: 'In the Kuiper Belt, the ring of icy worlds beyond Neptune',
    now: 'Measuring the solar wind, dust and the faint glow of the outer Solar System, and photographing distant Kuiper Belt worlds from angles no telescope at home can. She sleeps spinning between check-ins, and has power to keep working into the 2040s, when she should leave the Sun’s bubble too.',
    log: [
      ['2006-01-19', 'Launched faster than anything before her: past the Moon’s orbit in nine hours.'],
      ['2007-02-28', 'Jupiter, for a gravity boost that cut three years off the trip.'],
      ['2015-07-14', 'Pluto, 12,500 km above its surface. Found a heart-shaped plain of nitrogen ice.'],
      ['2019-01-01', 'Arrokoth, a snowman-shaped world 6.6 billion km out: the farthest object anything has ever visited.'],
    ],
    bound: { text: 'She’s heading toward Sagittarius, the direction of the centre of the galaxy. No star lies close to her path.' },
    record: 'Carries some of the ashes of Clyde Tombaugh, who found Pluto in 1930.',
  },
  {
    id: 'jwst', name: 'James Webb', full: 'James Webb Space Telescope', color: '#ffd27a', status: 'active',
    agency: 'NASA, ESA and CSA', launched: '2021-12-25', from: 'Kourou, French Guiana',
    tagline: 'On station at L2, looking back to the first galaxies.',
    where: 'Circling the Sun–Earth L2 point, 1.5 million km beyond Earth, on the side away from the Sun',
    now: 'Observing around the clock. A sunshield the size of a tennis court keeps her mirror and cameras colder than −223 °C, so she can see the faint heat of galaxies whose light left them 13 billion years ago. She loops around L2 about every six months, and her launch was so precise she has fuel for about 20 years.',
    log: [
      ['2021-12-25', 'Launched on an Ariane 5 from Kourou, folded up like origami.'],
      ['2022-01-08', 'Finished unfolding: sunshield, then the 6.5-metre gold mirror in 18 pieces.'],
      ['2022-01-24', 'Arrived at L2, a month after launch.'],
      ['2022-07-12', 'First full-colour pictures, including the deepest view of the universe yet.'],
    ],
    bound: { text: 'She isn’t going anywhere. L2 keeps pace with Earth, so she circles the Sun with us once a year.' },
    near: true,
  },
  {
    id: 'p10', name: 'Pioneer 10', color: '#9aa7bd', status: 'silent', silentSince: '2003-01-23',
    agency: 'NASA', launched: '1972-03-03', from: 'Cape Canaveral',
    tagline: 'The first ship through the asteroid belt and past Jupiter.',
    where: 'Out of contact, coasting toward Taurus',
    now: 'Her last faint signal reached Earth on 23 January 2003, when her power ran too low to answer. She’s still out there, on the path shown here, and will be for millions of years.',
    log: [
      ['1972-03-03', 'Launched toward Jupiter, through an asteroid belt nobody was sure a ship could cross.'],
      ['1973-12-03', 'Jupiter, the first close look at any giant planet.'],
      ['1983-06-13', 'Crossed Neptune’s orbit, the first ship to pass beyond the planets.'],
      ['2003-01-23', 'Last signal heard.'],
    ],
    bound: { star: 'Aldebaran', text: 'She’s heading for Aldebaran, the red eye of Taurus, 65 light years away. At her speed that’s about 2 million years.' },
    record: 'Carries the Pioneer plaque: a map to the Sun and a drawing of two people.',
  },
  {
    id: 'p11', name: 'Pioneer 11', color: '#9aa7bd', status: 'silent', silentSince: '1995-09-30',
    agency: 'NASA', launched: '1973-04-06', from: 'Cape Canaveral',
    tagline: 'The first ship to reach Saturn.',
    where: 'Out of contact, coasting toward Aquila',
    now: 'NASA heard from her for the last time in September 1995, when she no longer had the power to point her antenna at Earth. She keeps going, silent, on the path shown here.',
    log: [
      ['1973-04-06', 'Launched, a year behind her twin.'],
      ['1974-12-02', 'Jupiter, from just 43,000 km above the clouds. Jupiter threw her back across the Solar System toward Saturn.'],
      ['1979-09-01', 'Saturn, the first visit, finding a new ring and scouting the way for the Voyagers.'],
      ['1995-09-30', 'Last contact.'],
    ],
    bound: { star: 'λ Aquilae', text: 'She’s heading toward Aquila, the Eagle. In about 4 million years she’ll pass near the star Lambda Aquilae.' },
    record: 'Carries the same plaque as Pioneer 10.',
  },
];

export const byId = id => SHIPS.find(s => s.id === id);

// The moment a saved hail left, if it can be one: a real time (ms), and not in the future. A clock set back, or a
// save carried over from another device, can leave a hail stamped days ahead: there is no saying how far along it
// is, so it counts as never sent. A minute's grace covers a clock being nudged.
export const hailSent = (t, now) => (Number.isFinite(t) && t > 0 && t <= now + 60000 ? t : null);

// Where a hail stands. `sent` is when it left (ms, or nothing if never), `lightMs` the one-way light time now.
//   idle: nothing sent · outbound: on its way out · inbound: it has arrived and her answer could be on its way back
//   done: the answer could be home (or she is silent and it has arrived), so another can go
// A hail still in flight is never replaced: the wait is the point, and sending again would start it over.
export function hailState(sent, lightMs, now, silent = false) {
  if (!Number.isFinite(sent) || sent > now) return 'idle'; // a time in the future is a clock that was changed
  if (now < sent + lightMs) return 'outbound';
  if (!silent && now < sent + 2 * lightMs) return 'inbound';
  return 'done';
}

// The words for one of a ship's round-number moments (milestones() in ephemeris.js), still coming or just gone by.
// They follow a date and a colon on the file, and end without a full stop.
export function milestoneText(ship, m, passed = false) {
  if (m.kind === 'earth-day') {
    if (!passed) return 'one light-day from Earth: a hail will take a whole day to reach her';
    return `one light-day from Earth. A hail now takes more than a day to reach her, and as long again for her answer${ship.id === 'v1' ? '. Nothing people have made has been this far' : ''}`;
  }
  if (m.kind === 'sun-day') return passed ? 'one light-day from the Sun. She is outside the dotted ring on the map now' : 'one light-day from the Sun, the dotted ring on the map';
  return `${m.au} AU from the Sun, ${m.au} times farther out than Earth`;
}

// What is on the Golden Record both Voyagers carry, as NASA lists it on its Voyager pages
// (science.nasa.gov/mission/voyager/golden-record-contents/, with its pages on the greetings, the sounds and music,
// the images and the cover; checked November 2026).
export const GOLDEN_RECORD = {
  // The greetings, each language with its words in English as NASA gives them. On the record they run from Akkadian
  // to Wu, as here.
  greetings: [
    ['Akkadian', 'May all be very well.'],
    ['Amoy (Min dialect)', 'Friends from space, how are you all? Have you eaten yet? Come visit us if you have time.'],
    ['Arabic', 'Greetings to our friends in the stars. We wish that we will meet you someday.'],
    ['Aramaic', 'Peace.'],
    ['Armenian', 'To all those who exist in the universe, greetings.'],
    ['Bengali', 'Hello! Let there be peace everywhere.'],
    ['Burmese', 'Are you well?'],
    ['Cantonese', 'Hi. How are you? Wish you peace, health and happiness.'],
    ['Czech', 'Dear friends, we wish you the best.'],
    ['Dutch', 'Dear greetings to everyone.'],
    ['English', 'Hello from the children of planet Earth.'],
    ['French', 'Hello everybody.'],
    ['German', 'Heartfelt greetings to all.'],
    ['Greek', 'Greetings to you, whoever you are. We come in friendship to those who are friends.'],
    ['Gujarati', 'Greetings from a human being of the Earth. Please contact.'],
    ['Hebrew', 'Peace.'],
    ['Hindi', 'Greetings from the inhabitants of this world.'],
    ['Hittite', 'Hail.'],
    ['Hungarian', 'We are sending greetings in the Hungarian language to all peace-loving beings in the Universe.'],
    ['Ila (Zambia)', 'We wish all of you well.'],
    ['Indonesian', 'Good night, ladies and gentlemen. Goodbye and see you next time.'],
    ['Italian', 'Many greetings and wishes.'],
    ['Japanese', 'Hello? How are you?'],
    ['Kannada', 'Greetings. On behalf of Kannada-speaking people, ‘good wishes.’'],
    ['Kechua (Quechua)', 'Hello to everybody from this Earth, in Kechua language.'],
    ['Korean', 'How are you?'],
    ['Latin', 'Greetings to you, whoever you are; we have good will towards you and bring peace across space.'],
    ['Luganda', 'Greetings to all peoples of the universe. God give you peace always.'],
    ['Mandarin', 'Hope everyone’s well. We are thinking about you all. Please come here to visit when you have time.'],
    ['Marathi', 'Greetings. The people of the Earth send their good wishes.'],
    ['Nepali', 'Wishing you a peaceful future from the earthlings.'],
    ['Nguni (Zulu)', 'We greet you, great ones. We wish you longevity.'],
    ['Nyanja', 'How are all you people of other planets?'],
    ['Oriya', 'Greetings to the inhabitants of the universe from the third planet Earth of the star Sun.'],
    ['Persian', 'Greetings to the residents of far skies.'],
    ['Polish', 'Welcome, creatures from beyond the outer world.'],
    ['Portuguese', 'Peace and happiness to all.'],
    ['Punjabi', 'Welcome home. It is a pleasure to receive you.'],
    ['Rajasthani', 'Hello to everyone. We are happy here and you be happy there.'],
    ['Romanian', 'Greetings to everybody.'],
    ['Russian', 'Greetings! I welcome you!'],
    ['Serbian', 'We wish you everything good from our planet.'],
    ['Sinhalese', 'Wish you a long life.'],
    ['Sotho', 'We greet you, O great ones.'],
    ['Spanish', 'Hello and greetings to all.'],
    ['Sumerian', 'May all be well.'],
    ['Swedish', 'Greetings from a computer programmer in the little university town of Ithaca on the planet Earth.'],
    ['Telugu', 'Greetings. Best wishes from Telugu-speaking people.'],
    ['Thai', 'We in this world send you our good will.'],
    ['Turkish', 'Dear Turkish-speaking friends, may the honors of the morning be upon your heads.'],
    ['Ukrainian', 'We are sending greetings from our world, wishing you happiness, goodness, good health and many years.'],
    ['Urdu', 'Peace on you. We the inhabitants of this earth send our greetings to you.'],
    ['Vietnamese', 'Sincerely send you our friendly greetings.'],
    ['Welsh', 'Good health to you now and forever.'],
    ['Wu', 'Best wishes to you all.'],
  ],
  // The music, in the order it plays: [where from, the piece, who plays it, how long].
  music: [
    ['Germany', 'Bach, Brandenburg Concerto No. 2 in F, first movement', 'Munich Bach Orchestra, Karl Richter, conductor', '4:40'],
    ['Java', 'Court gamelan, “Kinds of Flowers”', 'recorded by Robert Brown', '4:43'],
    ['Senegal', 'Percussion', 'recorded by Charles Duvelle', '2:08'],
    ['Zaire', 'Pygmy girls’ initiation song', 'recorded by Colin Turnbull', '0:56'],
    ['Australia', 'Aborigine songs, “Morning Star” and “Devil Bird”', 'recorded by Sandra LeBrun Holmes', '1:26'],
    ['Mexico', '“El Cascabel”', 'Lorenzo Barcelata and the Mariachi México', '3:14'],
    ['United States', '“Johnny B. Goode”', 'written and performed by Chuck Berry', '2:38'],
    ['New Guinea', 'Men’s house song', 'recorded by Robert MacLennan', '1:20'],
    ['Japan', 'Shakuhachi, “Tsuru No Sugomori” (“Crane’s Nest”)', 'Goro Yamaguchi', '4:51'],
    ['Germany', 'Bach, “Gavotte en rondeaux” from the Partita No. 3 in E major for violin', 'Arthur Grumiaux', '2:55'],
    ['Austria', 'Mozart, The Magic Flute, the Queen of the Night’s aria, no. 14', 'Edda Moser, soprano; Bavarian State Opera, Munich, Wolfgang Sawallisch, conductor', '2:55'],
    ['Georgia', 'Chorus, “Tchakrulo”', 'collected by Radio Moscow', '2:18'],
    ['Peru', 'Panpipes and drum', 'collected by Casa de la Cultura, Lima', '0:52'],
    ['United States', '“Melancholy Blues”', 'Louis Armstrong and his Hot Seven', '3:05'],
    ['Azerbaijan', 'Bagpipes', 'recorded by Radio Moscow', '2:30'],
    ['Russia', 'Stravinsky, The Rite of Spring, Sacrificial Dance', 'Columbia Symphony Orchestra, Igor Stravinsky, conductor', '4:35'],
    ['Germany', 'Bach, The Well-Tempered Clavier, Book 2, Prelude and Fugue in C, No. 1', 'Glenn Gould, piano', '4:48'],
    ['Germany', 'Beethoven, Fifth Symphony, first movement', 'the Philharmonia Orchestra, Otto Klemperer, conductor', '7:20'],
    ['Bulgaria', '“Izlel je Delyo Hagdutin”', 'sung by Valya Balkanska', '4:59'],
    ['United States', 'Navajo Night Chant', 'recorded by Willard Rhodes', '0:57'],
    ['United Kingdom', 'Holborne, “The Fairie Round”', 'David Munrow and the Early Music Consort of London', '1:17'],
    ['Solomon Islands', 'Panpipes', 'collected by the Solomon Islands Broadcasting Service', '1:12'],
    ['Peru', 'Wedding song', 'recorded by John Cohen', '0:38'],
    ['China', 'Ch’in, “Flowing Streams”', 'Kuan P’ing-hu', '7:37'],
    ['India', 'Raga, “Jaat Kahan Ho”', 'sung by Surshri Kesar Bai Kerkar', '3:30'],
    ['United States', '“Dark Was the Night”', 'written and performed by Blind Willie Johnson', '3:15'],
    ['Germany', 'Beethoven, String Quartet No. 13 in B flat, Opus 130, Cavatina', 'Budapest String Quartet', '6:37'],
  ],
  pictures: 115,
  // A few of the 115, from NASA's list.
  somePictures: ['the Sun', 'cells dividing', 'a family portrait', 'the Snake River and the Grand Tetons, by Ansel Adams', 'dolphins', 'Jane Goodall with chimpanzees', 'the Great Wall of China', 'the Taj Mahal', 'the Sydney Opera House', 'the Golden Gate Bridge', 'the radio telescope at Westerbork in the Netherlands', 'a string quartet', 'a sunset with birds'],
};
