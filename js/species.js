// Dino Arena — the all-stars roster (Hollywood edition).
// This file IS the game: argue about it, tweak it, reload the page.
//
// Dice: budget d20, species d12 (the index below, 1-based).
// headcount = max(1, round(budget / bulk))
//
// Stats
//   bulk    cost per head on the budget die (1 = raptor-sized, 5 = colossal)
//   bite    damage per unit per tick, before the target's armor is subtracted
//   hp      hit points per unit
//   armor   flat reduction on every incoming bite (bite - armor <= 0 does nothing)
//   pack    Lanchester exponent: strength = bite * N^pack
//           ~1.0 lone brawlers, >1 coordinated packs, <1 giants in each other's way
//   morale  fraction of the army lost before it routs (1.0 = never routs)
//   flying  untouchable by ground units (x0.25 damage unless the attacker is a leaper),
//           but can never hold the hill: must win before the clock runs out
//   leaper  no penalty when attacking flyers

const SPECIES = [
  {
    id: 'trex', face: 1, name: 'Tyrannosaurus rex', plural: 'T-rex', emoji: '🦖',
    role: 'Apex bruiser',
    bulk: 4, bite: 12, hp: 42, armor: 1, pack: 1.0, morale: 0.6, flying: false, leaper: false,
    signature: { name: 'Crushing bite', text: 'On a roll of 17+, the bite ignores armor and is doubled.' },
    intro: 'The ground shakes. {n} {plural} {step|steps} into the arena.',
  },
  {
    id: 'raptor', face: 2, name: 'Velociraptor', plural: 'Velociraptors', emoji: '🦎',
    role: 'Swarm pack',
    bulk: 1, bite: 3, hp: 7, armor: 0, pack: 1.5, morale: 0.7, flying: false, leaper: true,
    signature: { name: 'Clever girl', text: 'On a roll of 18+, the pack finds the gap: armor is ignored. Leapers: no penalty against flyers.' },
    intro: '{n} {plural} {fan|fans} out, chirping.',
  },
  {
    id: 'stego', face: 3, name: 'Stegosaurus', plural: 'Stegosaurus', emoji: '🦕',
    role: 'Brawler',
    bulk: 3, bite: 7, hp: 34, armor: 1, pack: 0.9, morale: 1.0, flying: false, leaper: false,
    signature: { name: 'Thagomizer', text: 'Damage x2 against big targets (bulk 3+).' },
    intro: '{n} {plural} {plant|plants} {their|its} feet and {swing|swings} {their|its} {tails|tail}.',
  },
  {
    id: 'trike', face: 4, name: 'Triceratops', plural: 'Triceratops', emoji: '🦏',
    role: 'Herd tank',
    bulk: 3, bite: 7, hp: 32, armor: 1, pack: 1.0, morale: 1.0, flying: false, leaper: false,
    signature: { name: 'Charge', text: 'Damage x1.8 on the first tick.' },
    intro: '{n} {plural} {lower|lowers} {their|its} horns.',
  },
  {
    id: 'ankylo', face: 5, name: 'Ankylosaurus', plural: 'Ankylosaurus', emoji: '🛡️',
    role: 'Fortress',
    bulk: 4, bite: 7, hp: 48, armor: 4, pack: 0.9, morale: 1.0, flying: false, leaper: false,
    signature: { name: 'Club', text: 'Armor 4: small bites do nothing. On a roll of 14+ against a big target (bulk 3+), the club adds a quarter of a unit\'s hp per ankylosaurus.' },
    intro: '{n} {plural} {sit|sits} down on the hill and {wait|waits}.',
  },
  {
    id: 'ptero', face: 6, name: 'Pteranodon', plural: 'Pteranodons', emoji: '🦅',
    role: 'Flyer',
    bulk: 2, bite: 4, hp: 9, armor: 0, pack: 1.3, morale: 0.4, flying: true, leaper: false,
    signature: { name: 'Untouchable', text: 'Ground units deal x0.25 (leapers excepted). Cannot hold the hill: must win before the clock.' },
    intro: '{n} {plural} {circle|circles} overhead.',
  },
  {
    id: 'spino', face: 7, name: 'Spinosaurus', plural: 'Spinosaurus', emoji: '🐊',
    role: 'Heavyweight',
    bulk: 4, bite: 9, hp: 55, armor: 1, pack: 1.0, morale: 0.6, flying: false, leaper: false,
    signature: { name: 'Rematch', text: 'Damage x1.5 against Tyrannosaurus rex.' },
    intro: '{n} {plural} {wade|wades} in, {sails|sail} high.',
  },
  {
    id: 'brachio', face: 8, name: 'Brachiosaurus', plural: 'Brachiosaurus', emoji: '🦕',
    role: 'Colossus',
    bulk: 5, bite: 7, hp: 110, armor: 2, pack: 0.8, morale: 1.0, flying: false, leaper: false,
    signature: { name: 'Stomp', text: 'Damage x2 against small targets (bulk 1 or less).' },
    intro: '{n} {plural} {arrive|arrives}. It takes a while.',
  },
  {
    id: 'dilo', face: 9, name: 'Dilophosaurus', plural: 'Dilophosaurus', emoji: '🦜',
    role: 'Spitter',
    bulk: 1, bite: 3, hp: 9, armor: 0, pack: 1.4, morale: 0.5, flying: false, leaper: false,
    signature: { name: 'Venom', text: 'On the first tick, the spit weakens the enemy: their bite is x0.7 for the whole fight.' },
    intro: '{n} {plural} {flare|flares} {their|its} {frills|frill}.',
  },
  {
    id: 'carno', face: 10, name: 'Carnotaurus', plural: 'Carnotaurus', emoji: '🐂',
    role: 'Ambusher',
    bulk: 3, bite: 8, hp: 30, armor: 0, pack: 1.1, morale: 0.6, flying: false, leaper: false,
    signature: { name: 'Ambush', text: 'Strikes first on the first tick, at x1.5 damage.' },
    intro: '{n} {plural} {burst|bursts} out of the treeline.',
  },
  {
    id: 'pachy', face: 11, name: 'Pachycephalosaurus', plural: 'Pachycephalosaurus', emoji: '🐏',
    role: 'Headbutter',
    bulk: 2, bite: 5, hp: 18, armor: 1, pack: 1.1, morale: 0.8, flying: false, leaper: false,
    signature: { name: 'Headbutt', text: 'On a roll of 15+, the enemy is dazed: their next attack is x0.5.' },
    intro: '{n} {plural} {lower|lowers} {their|its} {domes|dome}.',
  },
  {
    id: 'compy', face: 12, name: 'Compsognathus', plural: 'Compsognathus', emoji: '🐤',
    role: 'Swarm of swarms',
    bulk: 0.5, bite: 1.5, hp: 3, armor: 0, pack: 1.5, morale: 0.4, flying: false, leaper: false,
    signature: { name: 'A thousand bites', text: 'Tiny bite, huge numbers, useless against any armor. They scatter early.' },
    intro: '{n} {plural} {pour|pours} in like a tide.',
  },
];

const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
