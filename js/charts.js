// Starfleet's charts laid over the real sky: what Star Trek put at the stars you can see from your back garden.
// `star` is the name in data/stars.json. `tag` is what the overlay calls it; `line` is the story, with where it's from;
// `find` lists other names the search in Set course should know it by.
// The captain's log tells the same story on arrival: `log` is the line for it where the garden's wouldn't fit.
// Every other star Engage has notes on is tagged too, by its own name, so the sky shows everywhere the bridge can go.

export const CHARTS = [
  { star: 'Keid', tag: 'Vulcan', line: 'Spock’s home world circles 40 Eridani A. Gene Roddenberry and three astronomers put it here in a 1991 letter to Sky & Telescope, and you can see the star without a telescope from a dark enough garden.', log: 'Spock’s home world circles 40 Eridani A. Gene Roddenberry and three astronomers put it here in a 1991 letter to Sky & Telescope.' },
  { star: 'Rigil Kentaurus', tag: 'Cochrane’s home', line: '“Zefram Cochrane of Alpha Centauri,” Kirk calls the man who invented warp drive, in Metamorphosis.' },
  { star: 'Wolf 359', tag: 'Wolf 359', line: 'Where the Borg destroyed 39 starships in 2367, in The Best of Both Worlds. Far too faint to see: it’s a red dwarf only a tenth the Sun’s mass.', log: 'Where the Borg destroyed 39 starships in 2367, in The Best of Both Worlds.' },
  { star: 'Rigel', tag: 'Rigel VII', line: 'Captain Pike fought the Kalar warriors on Rigel VII, in The Cage, the very first pilot.' },
  { star: 'Vega', tag: 'Vega colony', line: 'In The Cage, the Enterprise was bound for the Vega colony with her wounded when she picked up a distress call from Talos IV.' },
  { star: 'Altair', tag: 'Altair VI', line: 'In Amok Time, Kirk was ordered to the inauguration on Altair VI and took Spock to Vulcan instead.' },
  { star: 'Deneb', tag: 'Farpoint', line: 'Farpoint Station stood on Deneb IV, where the Enterprise-D met Q on her first mission, in Encounter at Farpoint.' },
  { star: 'Capella', tag: 'Capella IV', line: 'Kirk bargained for mining rights with the warrior Capellans on Capella IV, in Friday’s Child.' },
  { star: 'Pollux', tag: 'Pollux IV', line: 'The being who had been the god Apollo held the Enterprise in his hand over Pollux IV, in Who Mourns for Adonais?' },
  { star: 'Aldebaran', tag: 'Aldebaran whiskey', line: 'Data poured Scotty a glass of it from Guinan’s private stock, in Relics. “It is green.”' },
  { star: 'Antares', tag: 'Antares', line: 'Charlie Evans came aboard the Enterprise from the ship Antares, in Charlie X.' },
  { star: 'Procyon', tag: 'Procyon V', line: 'In Enterprise, Daniels showed Archer the Battle of Procyon V, fought centuries in the future.' },
  { star: '61 Cygni', tag: 'Tellar', line: 'Star Trek: Star Charts puts Tellar Prime, home of the argumentative Tellarites, at 61 Cygni.' },
  // The rest, and which real star each world circles, were checked against Memory Alpha in November 2026.
  { star: 'τ Ceti', tag: 'Tau Ceti III', find: ['Kaferia'], line: 'Picard met his friend Walker Keel in “quite an exotic” bar on Tau Ceti III, in Conspiracy.' },
  { star: 'ε Indi', tag: 'Draylax', line: 'Draylax circles it, the far end of a cargo run from the Vega colony, in Enterprise’s Fortunate Son.' },
  { star: 'Alsafi', tag: 'Sigma Draconis VI', find: ['Sigma Draconis'], line: 'The Eymorgs of Sigma Draconis VI stole Spock’s brain to run the machinery of their underground home, in Spock’s Brain.' },
  { star: 'Regulus', tag: 'Regulus V', find: ['eel-birds'], line: 'Spock likened pon farr to the giant eel-birds of Regulus V, which must go back to the caverns where they hatched every eleven years, in Amok Time.' },
  { star: 'Merak', tag: 'Merak II', line: 'Kirk needed zenite from Ardana to stop a plague killing the plants of Merak II, in The Cloud Minders. With Dubhe it makes the Pointers of the Big Dipper, which lead to Polaris.', log: 'Kirk needed zenite from Ardana to stop a plague killing the plants of Merak II, in The Cloud Minders.' },
  { star: 'Mizar', tag: 'Mizar II', line: 'Home of the Mizarians, so peaceful that their world was conquered six times in three centuries, in Allegiance. It’s the star at the bend of the Big Dipper’s handle, with faint Alcor beside it.', log: 'Home of the Mizarians, so peaceful that their world was conquered six times in three centuries, in Allegiance.' },
  { star: 'Algol', tag: 'Algol I', line: 'The Algolians’ ringed home world, Algol I, is here, in Strange New Worlds; their delegates came to the trade conference on Betazed in Ménage à Troi.' },
  { star: 'θ Cygni', tag: 'Theta Cygni XII', line: 'Flying parasites drove a whole civilisation on Theta Cygni XII to mass insanity before they ever reached Deneva, in Operation -- Annihilate!' },
  { star: 'Menkalinan', tag: 'Beta Aurigae', line: 'The Enterprise was on her way to meet the Potemkin at Beta Aurigae, to study its gravity, when a call from Camus II turned her aside, in Turnabout Intruder.' },
  { star: 'γ Trianguli', tag: 'Gamma Trianguli VI', line: 'The people of Gamma Trianguli VI tended the machine Vaal, which ruled them as a god, until Kirk’s crew destroyed it, in The Apple.' },
  { star: 'γ Hydrae', tag: 'Gamma Hydra IV', find: ['Gamma Hydra'], line: 'A passing comet’s radiation aged the colonists of Gamma Hydra IV to death, and nearly Kirk’s landing party with them, in The Deadly Years. Saavik’s Kobayashi Maru test opens on a training mission to Gamma Hydra, in The Wrath of Khan.' },
  { star: 'Acamar', tag: 'Acamar III', line: 'Sovereign Marouk of Acamar III came aboard to make peace with the Gatherers, Acamarian raiders who had left their world, in The Vengeance Factor.' },
  { star: 'Izar', tag: 'Izar', find: ['Garth of Izar'], line: 'Home of Fleet Captain Garth, whose battles Kirk studied at the Academy, until he went mad and called himself Lord Garth, in Whom Gods Destroy.' },
  { star: 'Canopus', tag: 'Canopus', line: 'Gary Mitchell quoted Nightingale Woman, a love sonnet the poet Tarbolde wrote on a Canopus planet in 1996, in Where No Man Has Gone Before.' },
  { star: 'Mintaka', tag: 'Mintaka III', line: 'The Mintakans of Mintaka III caught Federation scientists watching them from a hidden blind, and took Picard for a god, in Who Watches the Watchers. It’s the westernmost star of Orion’s Belt.', log: 'The Mintakans of Mintaka III caught Federation scientists watching them from a hidden blind, and took Picard for a god, in Who Watches the Watchers.' },
];

export const chartFor = name => CHARTS.find(c => c.star === name);
