// The stars with notes in the captain's log. `star` is the name in data/stars.json; everything else is what the
// log says on arrival. Temperatures in kelvin, brightness (all light, not just visible) and width against the Sun.
// `inText` is the title as it reads in the middle of a sentence, where that differs ("at the Pleiades").
// `find` lists other names people know it by, for the search in Set course; they aren't shown.
// Any other star can be visited too: the log then works out what it can from the catalogue.

export const HOME = 'Sol';

export const DESTINATIONS = [
  {
    star: 'Sol', worlds: true, title: 'Sol', aka: 'the Sun', find: ['Earth', 'Solar System', 'Home'], group: 'home',
    kind: 'Yellow dwarf, spectral type G2', temp: 5772, lum: 1, radius: 1,
    planets: 'Eight, and one of them is home.',
    hold: { au: 1, label: 'in Earth’s orbit' },
    notes: [
      'The Sun is an ordinary star: there are hundreds of billions like it in the Milky Way.',
      'Its light takes 8 minutes 20 seconds to reach Earth.',
    ],
  },
  {
    star: 'Proxima Centauri', worlds: true, title: 'Proxima Centauri', group: 'neighbors',
    kind: 'Red dwarf, spectral type M5.5', temp: 3042, lum: 0.0017, radius: 0.154,
    planets: 'Two confirmed. Proxima b, found in 2016, is at least as heavy as Earth and orbits in 11 days, inside the zone where water could be liquid. Proxima d, found in 2022, is about a quarter of Earth’s mass.',
    hold: { au: 0.0485, label: 'in Proxima b’s orbit' },
    notes: [
      'The nearest star to the Sun, and far too faint to see from Earth without a telescope.',
      'It throws off violent flares that can brighten it many times over in minutes.',
      'It circles Alpha Centauri A and B about 13,000 AU away, taking roughly half a million years to go round once.',
    ],
  },
  {
    star: 'Rigil Kentaurus', title: 'Alpha Centauri', aka: 'Rigil Kentaurus and Toliman', find: ['Toliman'], group: 'neighbors',
    kind: 'Two Sun-like stars, spectral types G2 and K1', temp: 5790, lum: 1.52, radius: 1.22,
    planets: 'None confirmed. In 2025 the James Webb Space Telescope spotted a possible giant planet around A, which still needs confirming.',
    notes: [
      'Alpha Centauri A, where you are now, is a near twin of the Sun. Its partner B, an orange star, is the bright light close by.',
      'A and B orbit each other every 80 years, swinging between 11 and 35 AU apart.',
      'From Earth the pair shine as one star, the third brightest in the night sky, though it never rises for most of the northern hemisphere.',
    ],
    fiction: 'The destination in Lost in Space, and the system Pandora orbits in Avatar.',
  },
  {
    star: "Barnard's Star", worlds: true, title: 'Barnard’s Star', group: 'neighbors',
    kind: 'Old red dwarf, spectral type M4', temp: 3195, lum: 0.0035, radius: 0.187,
    planets: 'Four small rocky planets, all lighter than Earth, confirmed in 2024 and 2025. They circle it in two to seven days.',
    notes: [
      'It moves across Earth’s sky faster than any other star, about the width of the Moon every 180 years.',
      'It is heading our way and will come within 3.8 light years of the Sun in about 10,000 years, though Proxima Centauri will be closer still.',
      'At around 10 billion years old, it is more than twice the Sun’s age.',
    ],
    fiction: 'The target of Project Daedalus, a 1970s study of an uncrewed starship.',
  },
  {
    star: 'Wolf 359', title: 'Wolf 359', find: ['The Borg'], group: 'neighbors',
    kind: 'Red dwarf, spectral type M6', temp: 2800, lum: 0.0014, radius: 0.16,
    planets: 'None confirmed.',
    notes: [
      'One of the faintest and smallest stars known, only about a tenth of the Sun’s mass.',
      'Like many small red dwarfs it is a flare star, prone to sudden outbursts.',
    ],
  },
  {
    star: 'Lalande 21185', worlds: true, title: 'Lalande 21185', group: 'neighbors',
    kind: 'Red dwarf, spectral type M2', temp: 3550, lum: 0.022, radius: 0.39,
    planets: 'At least two. One circles in under 13 days; another takes about eight years.',
    notes: [
      'The brightest red dwarf in the northern sky. Binoculars will show it from Earth, in Ursa Major.',
    ],
  },
  {
    star: 'Sirius', title: 'Sirius', aka: 'The Dog Star', find: ['Alpha Canis Majoris'], group: 'neighbors',
    kind: 'White star, spectral type A1, with a white dwarf companion', temp: 9940, lum: 25.4, radius: 1.71,
    planets: 'None known.',
    notes: [
      'The brightest star in Earth’s night sky.',
      'Its companion, Sirius B, is a white dwarf: about the Sun’s mass squeezed into something the size of Earth. The two orbit every 50 years.',
      'Ancient Egyptians watched for Sirius rising just before dawn, which came before the Nile’s yearly flood.',
    ],
  },
  {
    star: 'Ran', worlds: true, title: 'Epsilon Eridani', aka: 'Ran', group: 'neighbors',
    kind: 'Orange dwarf, spectral type K2', temp: 5084, lum: 0.34, radius: 0.74,
    planets: 'One giant planet, about Jupiter’s mass, on a seven-year orbit, inside rings of dust and ice.',
    notes: [
      'A young star, under a billion years old, with belts of debris like our asteroid and Kuiper belts.',
      'One of the two stars Frank Drake listened to in 1960 in the first search for alien radio signals.',
    ],
    fiction: 'The home of the Babylon 5 space station.',
  },
  {
    star: 'Procyon', title: 'Procyon', find: ['Alpha Canis Minoris'], group: 'neighbors',
    kind: 'Yellow-white star, spectral type F5, with a white dwarf companion', temp: 6530, lum: 6.9, radius: 2.05,
    planets: 'None known.',
    notes: [
      'Its name means “before the dog”: from the north it rises just before Sirius, the Dog Star.',
      'It is beginning to swell as it runs low on hydrogen in its core.',
    ],
  },
  {
    star: '61 Cygni', title: '61 Cygni', group: 'neighbors',
    kind: 'Two orange dwarfs, spectral types K5 and K7', temp: 4400, lum: 0.15, radius: 0.67,
    planets: 'None known.',
    notes: [
      'The first star whose distance was ever measured, by Friedrich Bessel in 1838. Until then nobody knew how far away the stars were.',
      'The pair orbit each other about every 700 years.',
    ],
  },
  {
    star: 'ε Indi', worlds: true, title: 'Epsilon Indi', group: 'neighbors',
    kind: 'Orange dwarf, spectral type K5', temp: 4650, lum: 0.22, radius: 0.71,
    planets: 'A cold giant several times Jupiter’s mass, photographed directly by the James Webb Space Telescope in 2024.',
    notes: [
      'Far out from it, about 1,500 AU, a pair of brown dwarfs orbit each other: objects too small to shine as stars.',
    ],
  },
  {
    star: 'τ Ceti', title: 'Tau Ceti', group: 'neighbors',
    kind: 'Yellow dwarf, spectral type G8', temp: 5344, lum: 0.52, radius: 0.79,
    planets: 'Several possible small planets, none yet beyond doubt.',
    notes: [
      'The nearest single star like the Sun, and visible from Earth without a telescope.',
      'It has a disc of dust about ten times as massive as the Sun’s, so its planets would be bombarded often.',
      'The other star Frank Drake listened to in 1960.',
    ],
    fiction: 'A favourite of science fiction writers, from Asimov to Le Guin.',
  },
  {
    star: "Luyten's Star", worlds: true, title: 'Luyten’s Star', group: 'neighbors',
    kind: 'Red dwarf, spectral type M3.5', temp: 3380, lum: 0.0088, radius: 0.32,
    planets: 'At least two. Luyten b, found in 2017, is about three times Earth’s mass and orbits where water could be liquid.',
    hold: { au: 0.091, label: 'in Luyten b’s orbit' },
    notes: [
      'In 2017 a radio message with music was beamed here from Norway. It should arrive around 2030.',
    ],
  },
  {
    star: "Teegarden's Star", worlds: true, title: 'Teegarden’s Star', group: 'neighbors',
    kind: 'Red dwarf, spectral type M7', temp: 2900, lum: 0.00073, radius: 0.107,
    planets: 'Three small planets. Teegarden b is one of the most Earth-like worlds known by size and the light it gets.',
    hold: { au: 0.0252, label: 'in Teegarden b’s orbit' },
    notes: [
      'So faint it wasn’t found until 2003, hiding in old asteroid-survey pictures.',
    ],
  },
  {
    star: "Kapteyn's Star", title: 'Kapteyn’s Star', group: 'neighbors',
    kind: 'Red subdwarf, spectral type M1', temp: 3550, lum: 0.012, radius: 0.29,
    planets: 'Two were claimed in 2014; later work suggests the signals came from the star itself.',
    notes: [
      'About 11 billion years old, it circles the galaxy backwards compared with the Sun.',
      'It may have been pulled from a small galaxy the Milky Way swallowed long ago.',
    ],
  },
  {
    star: 'Keid', title: '40 Eridani', aka: 'Keid', find: ['Omicron 2 Eridani'], group: 'famous',
    kind: 'Orange dwarf, spectral type K0, with two companions', temp: 5126, lum: 0.46, radius: 0.81,
    planets: 'A planet claimed in 2018 turned out to be the star’s own activity.',
    notes: [
      'A triple: an orange star like this one, a white dwarf and a red dwarf. The white dwarf is the easiest of all white dwarfs to see from Earth, in a small telescope.',
    ],
  },
  {
    star: 'Altair', title: 'Altair', find: ['Alpha Aquilae'], group: 'famous',
    kind: 'White star, spectral type A7', temp: 7700, lum: 10.6, radius: 1.8,
    planets: 'None known.',
    notes: [
      'It spins once every nine hours, so fast it bulges at the equator, a fifth wider there than pole to pole.',
      'In 2007 it became the first ordinary star other than the Sun to have its surface pictured.',
    ],
    fiction: 'The sun of Altair IV in Forbidden Planet.',
  },
  {
    star: 'Vega', title: 'Vega', find: ['Alpha Lyrae'], group: 'famous',
    kind: 'White star, spectral type A0', temp: 9600, lum: 40, radius: 2.4,
    planets: 'None confirmed, though a wide disc of dust surrounds it.',
    notes: [
      'In 1850 it became the first star other than the Sun to be photographed.',
      'Earth’s wobble makes it the north star around 12,000 BCE and again around 13,700 CE.',
    ],
    fiction: 'The source of the message in Contact.',
  },
  {
    star: 'Fomalhaut', title: 'Fomalhaut', find: ['Alpha Piscis Austrini'], group: 'famous',
    kind: 'White star, spectral type A3', temp: 8590, lum: 16.6, radius: 1.84,
    planets: '“Fomalhaut b”, photographed in 2008, turned out to be a spreading cloud of dust from a collision.',
    notes: [
      'A bright ring of icy debris circles it about 140 AU out, and the Webb telescope found more belts inside it.',
      'It is young, about 440 million years old.',
    ],
  },
  {
    star: 'TRAPPIST-1', worlds: true, title: 'TRAPPIST-1', group: 'famous',
    kind: 'Ultracool red dwarf, spectral type M8', temp: 2566, lum: 0.00055, radius: 0.119,
    planets: 'Seven, all roughly Earth-sized, announced in 2017. All seven would fit inside Mercury’s orbit, and three orbit where water could be liquid.',
    hold: { au: 0.0292, label: 'in TRAPPIST-1e’s orbit' },
    notes: [
      'From one of its planets, the neighbouring planets would sometimes look bigger than the Moon does from Earth.',
      'Webb found that the two innermost planets have no thick atmospheres.',
    ],
  },
  {
    star: 'Helvetios', worlds: true, title: '51 Pegasi', aka: 'Helvetios', group: 'famous',
    kind: 'Yellow dwarf, spectral type G5', temp: 5790, lum: 1.36, radius: 1.15,
    planets: 'Dimidium, a giant half Jupiter’s mass that circles in just over four days.',
    notes: [
      'Dimidium was the first planet ever found around a Sun-like star, in 1995. It won Michel Mayor and Didier Queloz the 2019 Nobel Prize.',
      'Nobody expected a giant planet so close to its star. It changed where astronomers looked.',
    ],
  },
  {
    star: 'Pollux', worlds: true, title: 'Pollux', find: ['Beta Geminorum'], group: 'famous',
    kind: 'Orange giant, spectral type K0', temp: 4586, lum: 43, radius: 9.1,
    planets: 'One giant planet, Thestias, about twice Jupiter’s mass.',
    notes: [
      'The nearest giant star to the Sun: it has used up the hydrogen in its core and swollen to nine times the Sun’s width.',
    ],
  },
  {
    star: 'Arcturus', title: 'Arcturus', find: ['Alpha Bootis'], group: 'famous',
    kind: 'Orange giant, spectral type K1.5', temp: 4286, lum: 170, radius: 25.4,
    planets: 'None known.',
    notes: [
      'The brightest star in the northern half of the sky.',
      'Its light opened the 1933 Chicago World’s Fair: a telescope caught it, and the current switched on the lights.',
      'An old star passing through the Sun’s neighbourhood on a steep orbit through the galaxy.',
    ],
  },
  {
    star: 'Capella', title: 'Capella', find: ['Alpha Aurigae'], group: 'famous',
    kind: 'Two yellow giants, spectral types G8 and G0', temp: 4970, lum: 79, radius: 11.9,
    planets: 'None known.',
    notes: [
      'What looks like one star from Earth is two giants circling each other every 104 days, with a pair of red dwarfs farther out.',
    ],
  },
  {
    star: 'Aldebaran', title: 'Aldebaran', find: ['Alpha Tauri'], group: 'giants',
    kind: 'Orange giant, spectral type K5', temp: 3900, lum: 439, radius: 44,
    planets: 'One possible giant planet.',
    notes: [
      'The bull’s red eye in Taurus. It looks like part of the Hyades cluster, but sits about halfway between us and it.',
      'Pioneer 10 is drifting in its direction and will pass it in about two million years.',
    ],
  },
  {
    star: 'Polaris', title: 'Polaris', aka: 'The North Star', find: ['Pole Star', 'Alpha Ursae Minoris'], group: 'giants',
    kind: 'Yellow supergiant, spectral type F7', temp: 6015, lum: 1260, radius: 37.5,
    planets: 'None known.',
    notes: [
      'It sits within a degree of Earth’s north pole of the sky, and will be closest around the year 2100.',
      'A Cepheid: it pulses in brightness every four days. Stars like it are how astronomers measure distances to other galaxies.',
      'Its distance is still argued over; the catalogue here puts it at the far end.',
    ],
  },
  {
    star: 'Betelgeuse', title: 'Betelgeuse', find: ['Alpha Orionis'], group: 'giants',
    kind: 'Red supergiant, spectral type M2', temp: 3600, lum: 100000, radius: 760,
    planets: 'None known. In 2025 astronomers reported a small companion star tucked close to it.',
    notes: [
      'Put it where the Sun is and it would swallow everything out past Mars, and maybe Jupiter.',
      'In 2019 and 2020 it dimmed dramatically. It had puffed out a cloud of dust that blocked some of its light.',
      'It will explode as a supernova, probably within the next 100,000 years. From Earth it would shine about as bright as a half Moon for weeks.',
    ],
  },
  {
    star: 'Rigel', title: 'Rigel', find: ['Beta Orionis'], group: 'giants',
    kind: 'Blue supergiant, spectral type B8', temp: 12100, lum: 120000, radius: 79,
    planets: 'None known.',
    notes: [
      'Orion’s bright foot, and one of the most luminous stars in Earth’s neighbourhood of the galaxy.',
      'It is at least four stars: the blue supergiant and a family of smaller companions.',
    ],
  },
  {
    star: 'Antares', title: 'Antares', find: ['Alpha Scorpii'], group: 'giants',
    kind: 'Red supergiant, spectral type M1', temp: 3660, lum: 75900, radius: 680,
    planets: 'None known.',
    notes: [
      'The heart of the Scorpion. Its name means “rival of Mars” because the two look alike in colour.',
      'A small, hot blue-white companion star orbits it.',
    ],
  },
  {
    star: 'Canopus', title: 'Canopus', find: ['Alpha Carinae'], group: 'giants',
    kind: 'White giant, spectral type A9', temp: 7350, lum: 10700, radius: 71,
    planets: 'None known.',
    notes: [
      'The second brightest star in Earth’s night sky.',
      'Spacecraft have long used it as a guide star to know which way they are pointing.',
    ],
  },
  {
    star: 'Deneb', title: 'Deneb', find: ['Alpha Cygni'], group: 'giants',
    kind: 'White supergiant, spectral type A2', temp: 8525, lum: 196000, radius: 203,
    planets: 'None known.',
    notes: [
      'One of the most luminous stars that can be seen without a telescope from Earth, and the tail of Cygnus the swan.',
      'Its distance is very uncertain, anywhere from about 1,400 to 2,600 light years.',
    ],
  },
  // Nebulae and clusters: the four of the deep sky's list (js/deepsky.js) within 3,000 light years, each flown to by a
  // star in it and held far enough out to see it whole, painted on the viewscreen at its true size. `estimate` says
  // the star's width and brightness are the catalogue's estimates, said with an "about", not measured.
  {
    star: 'θ¹ Tauri', title: 'The Hyades', inText: 'the Hyades', aka: 'θ¹ Tauri', find: ['Hyades', 'Melotte 25', 'Theta Tauri', 'Caldwell 41'], group: 'deep', estimate: true,
    kind: 'Yellow giant θ¹ Tauri, spectral type G7, one of the cluster’s brightest stars',
    planets: 'None known round θ¹ Tauri. Ain, another of the cluster’s giants, has a planet several times Jupiter’s mass, found in 2007.',
    hold: { au: 1010000, label: 'holding 16 light years out, with the whole cluster ahead' },
    notes: [
      'Ahead, the nearest star cluster to the Sun: a few hundred stars born together about 600 million years ago, most of them within about 9 light years of its middle.',
      'From Earth its brightest stars make the V of the Bull’s face. Aldebaran sits in front of them but isn’t one of them: it is less than half as far.',
      'The glow on the viewscreen is painted, at the cluster’s true size, for its fainter stars, too faint for the charts.',
    ],
  },
  {
    star: 'Alcyone', title: 'The Pleiades', inText: 'the Pleiades', aka: 'Alcyone', find: ['Seven Sisters', 'M45', 'Subaru', 'Eta Tauri'], group: 'deep',
    kind: 'Blue giant, spectral type B7, the brightest of the Seven Sisters', temp: 12750, lum: 2400, radius: 9.3,
    planets: 'None known.',
    hold: { au: 885000, label: 'holding 14 light years out, with the whole cluster ahead' },
    notes: [
      'Ahead, a cluster of over a thousand young stars, born together about 100 million years ago, drifting through a cloud of dust that their blue light picks out.',
      'From Earth, Japan calls them Subaru, which is the six stars on the carmaker’s badge.',
      'The dust’s glow on the viewscreen is painted, at the cluster’s true size.',
    ],
  },
  {
    star: 'θ¹ Orionis', title: 'The Orion Nebula', inText: 'the Orion Nebula', aka: 'the Trapezium', find: ['M42', 'Orion Nebula', 'Trapezium', 'Theta Orionis', 'Great Nebula'], group: 'deep',
    // θ¹ Orionis C, the brightest: 39,000 K (Simón-Díaz et al. 2006, A&A 448, 351) and about 220,000 Suns at the
    // nebula's distance, so about 10 times the Sun's width. (The catalogue's colour, reddened by the nebula's dust,
    // would make it a 6,000 K star.)
    kind: 'The Trapezium: four young stars, the brightest, θ¹ Orionis C, a blue-white type O7 whose light makes the nebula glow', temp: 39000, lum: 220000, radius: 10.3,
    planets: 'None known. Hundreds of the young stars round it have discs of dust and gas where planets may be forming, which the Hubble Space Telescope photographed in the 1990s.',
    hold: { au: 1770000, label: 'holding 28 light years out, with the whole nebula ahead' },
    notes: [
      'Ahead, a cloud about 25 light years across where new stars are being born, lit up by the Trapezium’s ultraviolet light.',
      'The catalogue has no measured distance for the Trapezium’s stars, so the charts put them at the nebula’s, 1,344 light years, from the parallax of its young stars measured by radio telescopes.',
      'The nebula on the viewscreen is painted, at its true size: its glow is real, its shape an impression.',
    ],
  },
  {
    star: 'NGC 6720 central star', title: 'The Ring Nebula', inText: 'the Ring Nebula', aka: 'M57', find: ['M57', 'NGC 6720', 'Ring Nebula'], group: 'deep',
    kind: 'White dwarf, the bare core of a star like the Sun, at the heart of the ring', temp: 135000, lum: 310, radius: 0.032,
    planets: 'None known.',
    hold: { au: 88500, label: 'holding 1.4 light years out, with the whole ring ahead' },
    notes: [
      'Ahead, the shell of gas the star threw off as it died, about a light year across and glowing in the core’s ultraviolet light.',
      'The star at its heart is far too faint for the charts from Earth, magnitude 15.8: its distance, about 2,580 light years, is from the Gaia satellite.',
      'The ring on the viewscreen is painted, at its true size: its glow is real, its shape an impression.',
    ],
  },
];

// The headings in Set course. They are written from Earth: once the ship is somewhere else, the first is headed by
// the third name here (61 Cygni is not next door from Deneb, 1,400 light years off).
export const GROUPS = [
  ['neighbors', 'Next door', 'The Sun’s neighbours'],
  ['famous', 'Worth the trip'],
  ['giants', 'Long hauls'],
  ['deep', 'Nebulae and clusters'],
];

// Moments on Earth that a distant watcher could be seeing now, for the log's line about Earth's light: [year, what
// happened]. A moment from 1900 on is offered only for its own year ("in 1986, the year Voyager 2 flew past
// Uranus"). The sparser ones before that are offered a couple of years either side as well, or ten before 1500,
// as "around when". One moment to a year; a year with nothing sure to say has none.
// A moment that is one of the long missions' own carries the ship and the day as her file has them in js/ships.js
// (test/physics.test.mjs checks the two agree): the log then links to her file.
export const ANCHORS = [
  [-2560, 'the Great Pyramid of Giza was being finished'],
  [-776, 'the first Olympic Games were held'],
  [1054, 'the supernova that made the Crab Nebula lit up the sky'],
  [1215, 'Magna Carta was sealed'],
  [1440, 'Gutenberg was building his printing press'],
  [1492, 'Columbus crossed the Atlantic'],
  [1543, 'Copernicus put the Sun at the centre'],
  [1572, 'Tycho Brahe saw a new star, a supernova, in Cassiopeia'],
  [1604, 'Kepler’s supernova appeared, the last one in our galaxy seen by eye'],
  [1610, 'Galileo turned a telescope on the sky'],
  [1687, 'Newton published his laws of motion'],
  [1718, 'Edmond Halley found that the stars move'],
  [1781, 'William Herschel discovered Uranus'],
  [1838, 'Bessel first measured the distance to a star'],
  [1846, 'Neptune was found'],
  [1876, 'the telephone was invented'],
  [1903, 'the Wright brothers first flew'],
  [1915, 'Einstein presented his general theory of relativity'],
  [1926, 'Robert Goddard launched the first liquid-fuelled rocket'],
  [1930, 'Clyde Tombaugh found Pluto'],
  [1946, 'a camera on a rocket took the first photograph of Earth from space'],
  [1957, 'Sputnik went up'],
  [1958, 'NASA was founded'],
  [1959, 'Luna 3 sent back the first pictures of the far side of the Moon'],
  [1960, 'Frank Drake first listened for signals from other stars, at Tau Ceti and Epsilon Eridani'],
  [1961, 'Yuri Gagarin became the first person in space'],
  [1962, 'Mariner 2 flew past Venus, the first visit to another planet'],
  [1963, 'Valentina Tereshkova became the first woman in space'],
  [1964, 'the first Star Trek pilot, The Cage, was filmed'],
  [1965, 'Alexei Leonov made the first spacewalk'],
  [1966, 'Star Trek premiered on television'],
  [1967, 'Jocelyn Bell found the first pulsar'],
  [1968, 'Apollo 8 carried the first people around the Moon'],
  [1969, 'people first walked on the Moon'],
  [1970, 'Apollo 13 made it home'],
  [1971, 'Mariner 9 reached Mars, the first ship to orbit another planet'],
  [1972, 'Pioneer 10 launched for Jupiter', 'p10', '1972-03-03'],
  [1973, 'Pioneer 10 flew past Jupiter', 'p10', '1973-12-03'],
  [1974, 'Pioneer 11 flew past Jupiter', 'p11', '1974-12-02'],
  [1975, 'an Apollo and a Soyuz docked in orbit'],
  [1976, 'Viking 1 landed on Mars'],
  [1977, 'the two Voyager spacecraft launched', 'v1', '1977-09-05'],
  [1978, 'Pluto’s moon Charon was discovered'],
  [1979, 'Voyager 1 found volcanoes erupting on Jupiter’s moon Io', 'v1', '1979-03-05'],
  [1980, 'Voyager 1 flew past Saturn', 'v1', '1980-11-12'],
  [1981, 'Voyager 2 flew past Saturn', 'v2', '1981-08-25'],
  [1982, 'Star Trek II reached cinemas, and with it the Kobayashi Maru'],
  [1983, 'Pioneer 10 crossed Neptune’s orbit, the first ship to pass beyond the planets', 'p10', '1983-06-13'],
  [1984, 'Bruce McCandless flew free of the Space Shuttle with a jet pack'],
  [1985, 'the hole in the ozone layer over Antarctica was reported'],
  [1986, 'Voyager 2 flew past Uranus', 'v2', '1986-01-24'],
  [1987, 'Star Trek: The Next Generation premiered'],
  [1988, 'the Soviet shuttle Buran made its only flight'],
  [1989, 'Voyager 2 flew past Neptune', 'v2', '1989-08-25'],
  [1990, 'the Hubble Space Telescope launched'],
  [1991, 'the Galileo probe made the first flyby of an asteroid, Gaspra'],
  [1992, 'the first planets beyond the Solar System were found, circling a pulsar'],
  [1993, 'astronauts fixed the Hubble Space Telescope’s blurred sight'],
  [1994, 'Comet Shoemaker–Levy 9 hit Jupiter'],
  [1995, 'the first planet around a Sun-like star was found'],
  [1996, 'Star Trek: First Contact reached cinemas'],
  [1997, 'Mars Pathfinder landed with Sojourner, the first rover to drive on Mars'],
  [1998, 'Voyager 1 overtook Pioneer 10 to become the farthest thing people have made', 'v1', '1998-02-17'],
  [1999, 'a planet was first seen crossing the face of another star'],
  [2000, 'the first crew moved into the International Space Station'],
  [2001, 'NEAR Shoemaker made the first landing on an asteroid, Eros'],
  [2003, 'Pioneer 10 was last heard from', 'p10', '2003-01-23'],
  [2004, 'the rovers Spirit and Opportunity landed on Mars'],
  [2005, 'the Huygens probe landed on Saturn’s moon Titan'],
  [2006, 'New Horizons launched for Pluto', 'nh', '2006-01-19'],
  [2007, 'New Horizons flew past Jupiter', 'nh', '2007-02-28'],
  [2008, 'astronomers published a picture of three planets circling another star'],
  [2009, 'the Kepler space telescope launched to look for planets'],
  [2010, 'the Hayabusa probe brought home the first dust from an asteroid'],
  [2011, 'the Space Shuttle flew for the last time'],
  [2012, 'Voyager 1 left the Sun’s bubble for interstellar space', 'v1', '2012-08-25'],
  [2013, 'the Gaia telescope launched to map a billion stars'],
  [2014, 'the Philae lander touched down on a comet'],
  [2015, 'New Horizons flew past Pluto', 'nh', '2015-07-14'],
  [2016, 'a planet was found around Proxima Centauri'],
  [2017, 'the count of planets known around TRAPPIST-1 reached seven'],
  [2018, 'Voyager 2 left the Sun’s bubble for interstellar space', 'v2', '2018-11-05'],
  [2019, 'New Horizons flew past Arrokoth, the farthest world ever visited', 'nh', '2019-01-01'],
  [2020, 'Betelgeuse faded to about a third of its usual brightness'],
  [2021, 'the James Webb Space Telescope launched', 'jwst', '2021-12-25'],
  [2022, 'the James Webb Space Telescope sent back its first pictures', 'jwst', '2022-07-12'],
  [2023, 'a shout from Canberra turned Voyager 2’s antenna back to Earth', 'v2', '2023-08-04'],
  [2024, 'Voyager 1 was repaired from 22 light-hours away', 'v1', '2024-04-20'],
];
