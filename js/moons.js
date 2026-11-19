// The survey's third group: moons and dwarf planets, the Solar System's most-asked-about places for life that aren't
// planets. Each has its real readings and the Starfleet class it would be filed under (`cls`, a class in
// js/classes.js), with `fits` saying how well it fits that file. These are the survey's own calls, not canon: no
// episode files Europa or Titan under a letter.
//
// `km` is the width in kilometres, and `width` and `mass` against Earth's (6,371 km in radius, 5.9722 × 10²⁴ kg), from
// NASA's planetary fact sheets (nssdc.gsfc.nasa.gov/planetary/factsheet: the Moon, Pluto, and the Jovian, Saturnian
// and Neptunian satellite sheets, read 19 November 2026; Enceladus's width is the mean of its three axes there).
// Ceres is from the same site's asteroid fact sheet (965 × 961 × 891 km, 939,300 × 10¹⁵ kg). `orbit` is the time to
// go round its planet, in days, from the same sheets, or for a dwarf planet `year`, round the Sun.
// `temp` is the surface's range in kelvin: the Moon's equator from its fact sheet; Io from Galileo (Rathbun and others
// 2004, Icarus 169, 127); Europa from Galileo (as summed up in Europa, University of Arizona Press 2009); Ganymede from
// Galileo (Orton and others 1996, Science 274, 389, and Delitsky and Lane 1998, JGR 103, 31391); Titan as Huygens
// measured it on landing, 93.65 K at 1,467 hPa (Fulchignoni and others 2005, Nature 438, 785); Enceladus from Cassini
// (Spencer and others 2006, Science 311, 1401: 145 K at the cracks near its south pole); Triton as Voyager 2 found it,
// −235 °C (NASA, science.nasa.gov/neptune/moons/triton); Ceres from Dawn (Tosi and others 2015, EGU 17, 11960); Pluto
// −226 to −240 °C (NASA, science.nasa.gov/dwarf-planets/pluto/facts), the fact sheet's 13 microbar of nitrogen for its air.
//
// Europa and Enceladus have what the xenobiology lab needs to grow a creature for them (js/xeno-gen.js growFor):
// `teq`, here the mean temperature their sunlight keeps the surface at (Europa 102 K, Enceladus 75 K, from the same
// sources), `sun`, and `habitats`, which sends the lab under the ice, where the water is. The others link to the lab's
// creatures for the class they'd be filed under; Titan, whose lakes are methane, has none until the lab has rules for it.
export const MOONS = [
  {
    id: 'moon', name: 'The Moon', of: 'Earth', cls: 'D', art: 'moon', short: 'Earth’s own',
    km: 3475, width: 0.2727, mass: 0.0123, temp: [95, 390], orbit: 27.32,
    air: 'None to speak of', water: 'Ice in craters at the poles that never see the Sun', life: 'None',
    about: 'Airless, grey and cratered, with dark plains of old lava that make the face people see from Earth. Twelve people have walked on it, and it is the only other world anyone has.',
    fits: 'Small, airless and cratered: a textbook planetoid, and the Class D file names it.',
  },
  {
    id: 'io', name: 'Io', of: 'Jupiter', cls: 'D', art: 'io', short: 'Volcanoes everywhere',
    km: 3643, width: 0.2859, mass: 0.01496, temp: [90, 130], orbit: 1.769,
    air: 'A trace of sulfur dioxide from its volcanoes', water: 'None', life: 'None',
    about: 'The most volcanic place in the Solar System. Jupiter and its other moons knead Io’s insides as it goes round, the heat comes out through hundreds of volcanoes, and sulfur paints the ground yellow, orange and white.',
    fits: 'Small and all but airless, so Class D by its readings, though no planetoid file says anything about volcanoes.',
  },
  {
    id: 'europa', name: 'Europa', of: 'Jupiter', cls: 'P', art: 'europa', short: 'An ocean under ice',
    km: 3122, width: 0.245, mass: 0.008037, temp: [50, 125], orbit: 3.551,
    air: 'A trace of oxygen, a trillionth of Earth’s pressure', water: 'A salty ocean under the ice, with perhaps twice the water of Earth’s oceans', life: 'None known; one of the best places to look',
    about: 'A white ball of ice criss-crossed with reddish cracks. Under the ice is an ocean kept liquid by Jupiter’s tides, with a rocky floor where it may have vents like Earth’s. NASA’s Europa Clipper reaches it in 2030.',
    fits: 'Ice from pole to pole: Class P, though at a quarter of Earth’s width it is smaller than the file allows.',
    teq: 102, sun: 'yellow', habitats: ['under-ice'],
    note: 'Europa’s ocean has been there for billions of years, in touch with rock, which is what life on Earth’s sea floor needs. Nobody has looked inside it yet.',
  },
  {
    id: 'ganymede', name: 'Ganymede', of: 'Jupiter', cls: 'P', art: 'ganymede', short: 'Bigger than Mercury',
    km: 5262, width: 0.413, mass: 0.02481, temp: [70, 152], orbit: 7.155,
    air: 'A trace of oxygen', water: 'Probably a salty ocean deep under its ice; Hubble saw it in the way its aurorae rock', life: 'None known',
    about: 'The biggest moon in the Solar System, wider than Mercury, and the only moon with a magnetic field of its own. Dark old ground is crossed by bright grooved ice. ESA’s Juice mission is on its way.',
    fits: 'Ice and rock under almost no air: Class P, at well under half Earth’s width.',
  },
  {
    id: 'titan', name: 'Titan', of: 'Saturn', cls: 'P', art: 'titan', short: 'Thick air, methane seas',
    km: 5150, width: 0.4042, mass: 0.02253, temp: [94, 94], orbit: 15.95,
    air: 'Nitrogen at about one and a half times Earth’s pressure, under orange haze', water: 'Ice is its bedrock; its lakes and seas are liquid methane and ethane', life: 'None known; life in methane has only been imagined',
    about: 'The only moon with thick air, and the only place but Earth with rain, rivers and seas on the surface, all of methane. Huygens landed in 2005 on a plain of ice pebbles; NASA’s Dragonfly will fly there in the 2030s.',
    fits: 'Frozen, so nearest Class P, but its air is thicker than Earth’s and no file of cold worlds has that.',
  },
  {
    id: 'enceladus', name: 'Enceladus', of: 'Saturn', cls: 'P', art: 'enceladus', short: 'Geysers of seawater',
    km: 504, width: 0.03955, mass: 0.00001808, temp: [33, 145], orbit: 1.370,
    air: 'None, but geysers near its south pole throw water into space', water: 'A salty ocean under the whole of its ice', life: 'None known; one of the best places to look',
    about: 'Tiny and whiter than fresh snow. Cassini flew through the spray from its south pole and found salt, silica and simple organic molecules: an ocean, warmed at its floor, leaking into space.',
    fits: 'Ice from pole to pole: Class P, but it is barely 500 km across, a seventh of the Moon’s width.',
    teq: 75, sun: 'yellow', habitats: ['under-ice'],
    note: 'Cassini tasted Enceladus’s ocean in its spray, and found the salts, silica and molecules of a sea floor with hot vents. It is the only alien ocean anyone has sampled.',
  },
  {
    id: 'triton', name: 'Triton', of: 'Neptune', cls: 'P', art: 'triton', short: 'Going round backwards',
    km: 2707, width: 0.2124, mass: 0.003583, temp: [38, 38], orbit: 5.877,
    air: 'A trace of nitrogen', water: 'Ice for bedrock, frosted with frozen nitrogen', life: 'None known',
    about: 'It goes round Neptune the wrong way, so it was probably caught from the Kuiper belt. Voyager 2 saw dark plumes of nitrogen jetting from its pinkish polar cap in 1989, and it is among the coldest places ever measured.',
    fits: 'Frozen from pole to pole under thin nitrogen air: Class P, except that it is a fifth of Earth’s width.',
  },
  {
    id: 'ceres', name: 'Ceres', of: null, cls: 'D', art: 'ceres', short: 'Dwarf planet in the asteroid belt',
    km: 938, width: 0.07364, mass: 0.0001573, temp: [110, 235], year: 1680,
    air: 'None', water: 'Ice under the crust, and bright salt left by brine in Occator crater', life: 'None',
    about: 'The biggest thing in the asteroid belt, and the only dwarf planet inside Neptune. Dawn went into orbit in 2015 and found bright spots of salt where briny water seeped up from below.',
    fits: 'Tiny, airless and cratered: a Class D planetoid.',
  },
  {
    id: 'pluto', name: 'Pluto', of: null, cls: 'P', art: 'pluto', short: 'A heart of nitrogen ice',
    km: 2376, width: 0.1865, mass: 0.002182, temp: [33, 47], year: 90560,
    air: 'Nitrogen with blue haze, about 13 millionths of Earth’s pressure', water: 'Ice for bedrock, under plains of frozen nitrogen', life: 'None known',
    about: 'A planet from 1930 until 2006, now the best-known dwarf planet. New Horizons flew past in 2015 and found mountains of water ice, a heart-shaped glacier of nitrogen and a sky of blue haze.',
    fits: 'Frozen under thin nitrogen air: Class P, though it is smaller than the Moon.',
  },
];

export const moonById = new Map(MOONS.map(m => [m.id, m]));
