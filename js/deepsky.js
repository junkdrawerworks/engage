// The deep sky: clusters, nebulae and galaxies, one list for every room. Tonight's sky tags the ones you can find by
// eye or with binoculars; the bridge flies to the four within 3,000 light years (the Hyades, the Pleiades, the Orion
// Nebula and the Ring Nebula) and paints them on the viewscreen at their true size from wherever the ship is; the
// warp scale races to each. Pure, so test/tonight.test.mjs can check it.
//
// Positions are J2000 right ascension (hours) and declination (degrees), like the catalogue's stars. `size` is the
// width across the sky in arcminutes, [long, short] where it is longer one way, with `pa` the long axis's angle east
// of north where that is drawn (an object with none given is drawn round, at its mean width). `vis` is the faintest
// star (limiting magnitude) a sky must show for the object to be seen by eye: a city sky shows to 3.5, the suburbs 4.6
// and a dark site 6.3, as js/astro.js has it (less with the Moon up); past 6.5 it needs a telescope. `paint` is how the
// bridge's viewscreen draws one it flies to (js/sky.js): a haze of the stars too faint for the charts, a cloud of dust
// lit blue, a glowing cloud or a ring, in an impression's colours, at its true size. `star` is the catalogue star the
// bridge flies to for it (see js/destinations.js), `rung` the warp scale's place for it, and `ly` its distance, each
// with its source:
//  - The Hyades: 153 ly (47 pc), Perryman et al. 1998 from Hipparcos; 330′ across; magnitude 0.5.
//  - The Pleiades: the charts fly to Alcyone, 403 ly in the catalogue (Hipparcos). NASA's Hubble Messier catalogue
//    gives 445 ly and says the number "is not universally agreed upon". 110′ across; magnitude 1.6 (NASA).
//  - The Beehive (M44, Praesepe): 610 ly (186 pc), Gaia Collaboration, Babusiaux et al. 2018 (Gaia DR2); NASA gives
//    about 600 and 1.5° across; magnitude 3.7 (NASA).
//  - The Coalsack: 587 ly (180 pc), Franco 2000 (MNRAS 312, 377); 7° × 5°.
//  - The Orion Nebula (M42): 1,344 ly, as the warp scale has it, inside Menten et al. 2007's 414 ± 7 pc from the
//    parallax of its young stars; 65′ × 60′; magnitude 4.0 (NASA).
//  - The Ring Nebula (M57): 2,580 ly (790 ± 30 pc) from the Gaia parallax of its central star, as Wesson et al. 2023
//    (MNRAS 528, 3392, the JWST paper) give it; the bright ring 96″ × 76″ across; its star 135,000 K and about 310
//    times as luminous as the Sun. Magnitude 8.8 (NASA).
//  - The Lagoon Nebula (M8): 5,200 ly, NASA; 90′ × 40′; magnitude 6.0 (NASA).
//  - The Double Cluster (NGC 869 and 884): 7,460 and 7,640 ly, Currie et al. 2010; 60′ for the pair; 3.7 and 3.8.
//  - The Carina Nebula (NGC 3372, round Eta Carinae): 8,500 ly (2.6 kpc), Kuhn et al. 2019 (Gaia DR2); 2° across;
//    magnitude 1.0.
//  - Omega Centauri (NGC 5139): 17,000 ly (5.2 kpc), Harris 1996 (2010 edition); 36′ across; magnitude 3.9.
//  - The galactic centre: 26,670 ly (8.18 kpc), GRAVITY Collaboration 2019, as the warp scale has it.
//  - The Large Magellanic Cloud: 160,000 ly as the warp scale has it (Pietrzyński et al. 2013, Nature, 49.97 kpc,
//    163,000 ly); 10.75° × 9.17°.
//  - The Small Magellanic Cloud: 204,000 ly (62.44 kpc), Graczyk et al. 2020; 5°20′ × 3°5′; magnitude 2.7.
//  - Andromeda (M31): 2.54 million ly as the warp scale has it (NASA: 2.5 million); about 3° × 1°, long axis 38° east
//    of north; magnitude 3.4. Whether it merges with the Milky Way: about even odds in the next 10 billion years
//    (Sawala et al. 2025, Nature Astronomy, "No certainty of a Milky Way–Andromeda collision"; ESA/Hubble heic2508),
//    where the long-quoted 4.5 billion years took a merger as certain.

export const KINDS = {
  open: 'Star cluster', globular: 'Globular cluster', nebula: 'Nebula', planetary: 'Planetary nebula',
  dark: 'Dark nebula', galaxy: 'Galaxy', core: 'The centre of the galaxy',
};

export const DEEP_SKY = [
  {
    id: 'hyades', name: 'The Hyades', kind: 'open', ra: 4.448, dec: 15.87, ly: 153, size: [330], vis: 3.5, star: 'θ¹ Tauri', rung: 'hyades',
    paint: { shape: 'haze', color: [1, 0.86, 0.66], alpha: 0.12 },
    about: 'The nearest star cluster to the Sun, a few hundred stars born together about 600 million years ago. Its brightest make the V of the Bull’s face. Orange Aldebaran sits in front of them but isn’t one of them: it is less than half as far.',
    bino: true,
  },
  {
    id: 'pleiades', name: 'The Pleiades', kind: 'open', ra: 3.790, dec: 24.117, size: [110], vis: 3, star: 'Alcyone', rung: 'pleiades',
    paint: { shape: 'dust', color: [0.5, 0.66, 1], alpha: 1 },
    about: 'The Seven Sisters: over a thousand young stars, about 100 million years old, drifting through a cloud of dust that their blue light picks out. Six or seven are easy to see by eye; binoculars show dozens. Its distance was argued over for years: the Hipparcos satellite put it at about 390 light years, other measures and then Gaia at about 440.',
    bino: true,
  },
  {
    id: 'beehive', name: 'The Beehive', aka: 'Praesepe, M44', kind: 'open', ra: 8.673, dec: 19.67, ly: 610, size: [95], vis: 5, rung: 'beehive',
    about: 'A cluster of about a thousand stars in Cancer, about as old as the Hyades. To the eye a misty patch between Gemini and Leo; binoculars turn it into a swarm.',
    bino: true,
  },
  {
    id: 'coalsack', name: 'The Coalsack', kind: 'dark', ra: 12.833, dec: -62.5, ly: 587, size: [420, 300], vis: 5, rung: 'coalsack',
    about: 'A cloud of dust that blots out the Milky Way beside the Southern Cross, the best-known dark nebula in the sky. For many Aboriginal Australians it is the head of the Emu in the sky.',
  },
  {
    id: 'orion', name: 'The Orion Nebula', aka: 'M42', kind: 'nebula', ra: 5.588, dec: -5.391, ly: 1344, size: [65, 60], vis: 4.5, star: 'θ¹ Orionis', rung: 'orion',
    paint: { shape: 'glow', color: [1, 0.42, 0.58], core: [0.62, 0.95, 0.9], alpha: 0.75 },
    about: 'A cloud about 25 light years across where new stars are being born, lit up by the four hot young stars of the Trapezium at its heart. A fuzzy patch in Orion’s sword to the eye, and one of the brightest nebulae in the sky.',
    trek: 'A nebula is a captain’s favourite place to hide, the way Kirk lured Khan into the Mutara Nebula.',
    bino: true,
  },
  {
    id: 'ring', name: 'The Ring Nebula', aka: 'M57', kind: 'planetary', ra: 18.8931, dec: 33.0292, ly: 2577, size: [1.6, 1.27], vis: 99, star: 'NGC 6720 central star', rung: 'ring',
    paint: { shape: 'ring', color: [1, 0.38, 0.32], core: [0.4, 0.88, 0.8], alpha: 0.7 },
    about: 'The shell of gas a star like the Sun threw off as it died, about a light year across, lit by the white-hot core it left behind. From Earth it needs a telescope: a small smoke ring about a twentieth of the width of the full Moon.',
  },
  {
    id: 'lagoon', name: 'The Lagoon Nebula', aka: 'M8', kind: 'nebula', ra: 18.060, dec: -24.387, ly: 5200, size: [90, 40], pa: 90, vis: 5.5, rung: 'lagoon',
    about: 'A cloud where stars are being born, in Sagittarius, toward the middle of the galaxy. A faint glow to the eye from a dark site, with a cluster of young stars in it.',
    bino: true,
  },
  {
    id: 'double', name: 'The Double Cluster', aka: 'NGC 869 and 884', kind: 'open', ra: 2.333, dec: 57.133, ly: 7500, size: [60, 30], pa: 90, vis: 5, rung: 'double',
    about: 'Two young clusters side by side in Perseus, east and west of each other. A misty double patch to the eye between Perseus and Cassiopeia, and a glittering pair in binoculars.',
    bino: true,
  },
  {
    id: 'carina', name: 'The Carina Nebula', aka: 'round Eta Carinae', kind: 'nebula', ra: 10.752, dec: -59.868, ly: 8500, size: [120], vis: 4.5, rung: 'carina',
    about: 'One of the biggest, brightest nebulae in the sky, twice the width of the Orion Nebula across it. At its heart is Eta Carinae, a giant star that blazed up in the 1840s to be the second brightest in the sky.',
    bino: true,
  },
  {
    id: 'omega', name: 'Omega Centauri', aka: 'NGC 5139', kind: 'globular', ra: 13.4465, dec: -47.4795, ly: 17000, size: [36], vis: 4.8, rung: 'omega',
    about: 'The biggest of the Milky Way’s globular clusters: about ten million old stars in a ball some 180 light years across. To the eye it looks like a fuzzy star, and it was catalogued as one.',
    bino: true,
  },
  {
    id: 'core', name: 'The galactic centre', aka: 'Sagittarius A*', kind: 'core', ra: 17.7611, dec: -29.0078, ly: 26670, size: [240], vis: 5.5, rung: 'core',
    about: 'The middle of the Milky Way, with a black hole four million times the Sun’s mass. Dust hides it from the eye, but the bright star clouds of Sagittarius round it are the thickest part of the Milky Way.',
    trek: 'In The Final Frontier the Enterprise-A gets here in what seems like days. Even at warp 9.975 it would take about four years.',
  },
  {
    id: 'lmc', name: 'The Large Magellanic Cloud', inText: 'the Large Magellanic Cloud', kind: 'galaxy', ra: 5.3928, dec: -69.757, ly: 160000, size: [645, 550], vis: 4.5, rung: 'lmc',
    about: 'A small galaxy in orbit round our own, like a torn-off piece of the Milky Way to the eye from the south. In 1987 a star in it exploded and could be seen without a telescope.',
    trek: 'To get here you’d cross the galactic barrier at the Milky Way’s edge, which went badly for the Enterprise in Where No Man Has Gone Before.',
  },
  {
    id: 'smc', name: 'The Small Magellanic Cloud', kind: 'galaxy', ra: 0.8791, dec: -72.829, ly: 204000, size: [320, 185], vis: 5, rung: 'smc',
    about: 'The Large Cloud’s smaller partner, another galaxy in orbit round the Milky Way, a smudge you can see by eye from a dark southern sky.',
  },
  {
    id: 'andromeda', name: 'Andromeda', aka: 'M31', kind: 'galaxy', ra: 0.7123, dec: 41.269, ly: 2537000, size: [190, 60], pa: 38, vis: 5, rung: 'andromeda',
    about: 'The nearest big galaxy, and the farthest thing you can see with your eyes: a faint smudge whose light set out 2.5 million years ago. It’s heading our way, but whether it will ever merge with the Milky Way isn’t settled: Hubble and Gaia measurements put the chance at about even in the next 10 billion years.',
    trek: 'In By Any Other Name, the Kelvans take over the Enterprise for a 300-year trip home to Andromeda.',
    bino: true,
  },
];
export const sightById = new Map(DEEP_SKY.map(o => [o.id, o]));
// The one the bridge flies to for a catalogue star, if any (Alcyone is the Pleiades).
export const sightForStar = name => DEEP_SKY.find(o => o.star === name) || null;

// Unit vector toward an object, in the catalogue's axes (x toward the March equinox, z toward the north pole).
export function sightDir(o) {
  const a = o.ra * 15 * Math.PI / 180, d = o.dec * Math.PI / 180;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
// How wide it is across the sky, in radians: [long, short].
export const sightSize = o => [o.size[0], o.size[1] ?? o.size[0]].map(m => m / 60 * Math.PI / 180);
// Its true width in light years, at a distance: [long, short].
export const sightWidthLy = (o, ly) => sightSize(o).map(a => 2 * ly * Math.tan(a / 2));
// Whether a sky that shows stars to magnitude `lim` shows it by eye.
export const seenIn = (o, lim) => lim >= o.vis;

// Stars the catalogue has wrong or lacks, put right with the deep sky's own numbers (see js/catalog.js):
//  - The Trapezium's stars (θ¹ Orionis) have no measured distance in the catalogue, which parks them at 1,000 parsecs:
//    they are moved to the Orion Nebula's.
//  - The Ring Nebula's central star, a white dwarf, is far too faint for the catalogue. It is added at the Gaia
//    distance with its magnitude, V = 15.75 (O'Dell et al. 2007, AJ 134, 1679); its temperature and luminosity are
//    Wesson et al. 2023's, in js/destinations.js.
export const PLACED = [{ name: 'θ¹ Orionis', ly: 1344 }];
export const ADDED = [
  { name: 'NGC 6720 central star', ra: 18.8931, dec: 33.0292, ly: 2577, vmag: 15.75, bv: -0.4, spect: 'WD' },
];
