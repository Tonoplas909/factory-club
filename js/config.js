/*
 * config.js — all static game data: items, recipes, buildings, research tree
 * and station construction phases. Gameplay balance lives here.
 * Identifiers are English; player-facing strings are French.
 */
(function (CO) {
  'use strict';

  CO.TILE = 16;            // sprite size of one tile (pixels)
  CO.MAP_W = 480;
  CO.MAP_H = 320;
  // Older maps sit in the middle of this one, so old saves are shifted by these offsets:
  // the very first 96×64 map (saves before rev 3) and the 240×160 one (saves before rev 6).
  CO.LEGACY_OX = (CO.MAP_W - 96) / 2;
  CO.LEGACY_OY = (CO.MAP_H - 64) / 2;
  CO.PREV_W = 240; CO.PREV_H = 160;
  CO.PREV_OX = (CO.MAP_W - CO.PREV_W) / 2;
  CO.PREV_OY = (CO.MAP_H - CO.PREV_H) / 2;
  CO.MAP_CX = CO.MAP_W / 2;          // map centre = where the Port stands
  CO.MAP_CY = CO.MAP_H / 2;
  // Land: the map is cut into 16×16 plots. The game starts with the 3×3 plots around the Port; every
  // other plot is bought (it must touch owned land), each purchase LAND_GROWTH times dearer than the last.
  CO.PLOT = 16;
  // the grid is shifted so the Port (map centre) sits in the middle of a plot
  CO.PLOT_OX = ((CO.PLOT / 2 - CO.MAP_CX % CO.PLOT) % CO.PLOT + CO.PLOT) % CO.PLOT;   // 8
  CO.PLOT_OY = ((CO.PLOT / 2 - CO.MAP_CY % CO.PLOT) % CO.PLOT + CO.PLOT) % CO.PLOT;   // 8
  CO.PLOTS_W = Math.ceil((CO.MAP_W + CO.PLOT_OX) / CO.PLOT);        // 31 columns (first and last are half plots)
  CO.PLOTS_H = Math.ceil((CO.MAP_H + CO.PLOT_OY) / CO.PLOT);        // 21 rows
  CO.LAND_BASE = 400;
  CO.LAND_GROWTH = 1.25;
  CO.SAVE_KEY = 'chantier-orbital-save-v1';

  // ---------------------------------------------------------------- items
  // shape: icon pattern (see sprites.js); color/accent: icon palette; price: fixed sell price.
  CO.ITEMS = {
    iron_ore:     { name: 'Minerai de fer',    price: 1,   shape: 'rock',    color: '#7d8fb3', accent: '#c4d4f2' },
    copper_ore:   { name: 'Minerai de cuivre', price: 1,   shape: 'rock',    color: '#d9824a', accent: '#ffc79a' },
    stone:        { name: 'Pierre',            price: 1,   shape: 'rock',    color: '#b9b0a0', accent: '#e8e0d0' },
    coal:         { name: 'Charbon',           price: 1,   shape: 'rock',    color: '#464656', accent: '#8a8aa0' },
    sand:         { name: 'Sable',             price: 1,   shape: 'rock',    color: '#e6cf82', accent: '#fff2b8' },
    ingot_iron:   { name: 'Lingot de fer',     price: 3,   shape: 'bar',     color: '#aeb9d0', accent: '#ffffff' },
    ingot_copper: { name: 'Lingot de cuivre',  price: 3,   shape: 'bar',     color: '#e8995c', accent: '#ffe0c0' },
    brick:        { name: 'Brique',            price: 3,   shape: 'brick',   color: '#c4614a', accent: '#e8b09a' },
    glass:        { name: 'Verre',             price: 3,   shape: 'glass',   color: '#8fdcec', accent: '#ffffff' },
    plate:        { name: 'Plaque de fer',     price: 5,   shape: 'plate',   color: '#c6cfe0', accent: '#ffffff' },
    gear:         { name: 'Engrenage',         price: 8,   shape: 'gear',    color: '#9aa6c0', accent: '#ffffff' },
    wire:         { name: 'Fil de cuivre',     price: 2,   shape: 'coil',    color: '#e8995c', accent: '#ffd9b0' },
    circuit:      { name: 'Circuit',           price: 18,  shape: 'board',   color: '#3fbf6a', accent: '#ffe27a' },
    steel:        { name: 'Acier',             price: 15,  shape: 'bar',     color: '#6e82ad', accent: '#b8caf0' },
    silicon:      { name: 'Silicium',          price: 14,  shape: 'crystal', color: '#8a78e8', accent: '#d8ccff' },
    hull:         { name: 'Plaque de coque',   price: 40,  shape: 'hull',    color: '#8fa2c9', accent: '#e8f0ff' },
    solar:        { name: 'Panneau solaire',   price: 70,  shape: 'panel',   color: '#2f6fe0', accent: '#9fd0ff' },
    kit:          { name: 'Kit modulaire',     price: 120, shape: 'cube',    color: '#e8c14a', accent: '#fff0a0' },
    thruster:     { name: 'Propulseur',        price: 150, shape: 'nozzle',  color: '#d95a5a', accent: '#ffd24a' },
    // ---- late game (titanium chain)
    titanium_ore: { name: 'Minerai de titane', price: 2,   shape: 'rock',    color: '#8da1e3', accent: '#d8e2ff' },
    ingot_titanium: { name: 'Lingot de titane', price: 6,  shape: 'bar',     color: '#9fb2ee', accent: '#f0f4ff' },
    alloy:        { name: 'Alliage de titane', price: 30,  shape: 'plate',   color: '#38a3a5', accent: '#c8fff4' },
    battery:      { name: 'Batterie',          price: 30,  shape: 'battery', color: '#6fcf5a', accent: '#f0ff9a' },
    processor:    { name: 'Processeur',        price: 90,  shape: 'chip',    color: '#3a5fc8', accent: '#ffd24a' },
    tank:         { name: 'Réservoir',         price: 80,  shape: 'tank',    color: '#d0d6e8', accent: '#5de0e6' },
    core:         { name: 'Cœur de réacteur',  price: 180, shape: 'orb',     color: '#ff8a3a', accent: '#fff0a0' },
    probe:        { name: 'Sonde profonde',    price: 400, shape: 'probe',   color: '#c36bff', accent: '#ffffff' },
    // ---- orbital program
    rocket_part:  { name: 'Module de fusée',   price: 900, shape: 'nozzle',  color: '#e8e8ee', accent: '#e55454' },
    satellite:    { name: 'Satellite',         price: 1500, shape: 'panel',  color: '#c8a04a', accent: '#9fd0ff' },
    // ---- oil chain
    plastic:      { name: 'Plastique',         price: 25,  shape: 'plate',   color: '#d8d2ea', accent: '#ffffff' },
    fuel:         { name: 'Carburant',         price: 70,  shape: 'tank',    color: '#e0663a', accent: '#ffd37f' },
    // ---- fluids: never on belts, they flow in pipes (see fluid.js). place / where: how the map names the
    // pool; pool: its colours on the ground (liquid, ripples).
    water:        { name: 'Eau',               price: 0,   shape: 'drop',    color: '#3f8fe0', accent: '#bfe6ff', fluid: true, place: 'Lac', where: 'un lac', pool: ['#2c5fa8', '#5f9fe8'] },
    oil:          { name: 'Pétrole',           price: 0,   shape: 'drop',    color: '#3a3045', accent: '#a08ac0', fluid: true, place: 'Nappe de pétrole', where: 'une nappe de pétrole', pool: ['#1d1824', '#4a3d5e'] },

    // ================= Kéora (planet 1): a crystal world, none of the items above exist there
    quartz:        { name: 'Quartz',                price: 2,   shape: 'k_shard', color: '#e8c6f2', accent: '#ffffff', planet: 1 },
    cobalt_ore:    { name: 'Minerai de cobalt',     price: 2,   shape: 'k_nugget',    color: '#4a6ad8', accent: '#aebfff', planet: 1 },
    lithium_ore:   { name: 'Minerai de lithium',    price: 2,   shape: 'k_nugget',    color: '#8fe0b8', accent: '#e8fff2', planet: 1 },
    sulfur:        { name: 'Soufre',                price: 2,   shape: 'k_powder',    color: '#e6d040', accent: '#fff7a8', planet: 1 },
    lava_rock:     { name: 'Roche volcanique',      price: 2,   shape: 'k_nugget',    color: '#c45a3c', accent: '#ffb08a', planet: 1 },
    iridium_ore:   { name: 'Minerai d’iridium',     price: 4,   shape: 'k_nugget',    color: '#d0c8f0', accent: '#ffffff', planet: 1 },
    ingot_cobalt:  { name: 'Lingot de cobalt',      price: 6,   shape: 'k_hexbar',     color: '#5f7fe8', accent: '#d0dcff', planet: 1 },
    lithium:       { name: 'Lithium raffiné',       price: 6,   shape: 'k_flask',     color: '#a8f0cc', accent: '#ffffff', planet: 1 },
    quartz_glass:  { name: 'Verre de quartz',       price: 6,   shape: 'k_pane',   color: '#f0d0ff', accent: '#ffffff', planet: 1 },
    ceramic:       { name: 'Céramique',             price: 6,   shape: 'k_tile',   color: '#e08a5a', accent: '#ffd8b8', planet: 1 },
    cobalt_sheet:  { name: 'Tôle de cobalt',        price: 10,  shape: 'k_sheet',   color: '#7f9cf0', accent: '#e8eeff', planet: 1 },
    rotor:         { name: 'Rotor magnétique',      price: 16,  shape: 'k_rotor',    color: '#6a7fd0', accent: '#ff8ae0', planet: 1 },
    fiber:         { name: 'Fibre optique',         price: 4,   shape: 'k_spool',    color: '#e0b8ff', accent: '#ffffff', planet: 1 },
    photonic:      { name: 'Puce photonique',       price: 36,  shape: 'k_pchip',   color: '#7a3fd0', accent: '#5ef0ff', planet: 1 },
    cell:          { name: 'Cellule au lithium',    price: 60,  shape: 'k_capsule', color: '#5fe0a8', accent: '#e0fff0', planet: 1 },
    superalloy:    { name: 'Superalliage',          price: 30,  shape: 'k_layers',     color: '#5a6a9a', accent: '#ff9ae8', planet: 1 },
    resonator:     { name: 'Cristal résonant',      price: 28,  shape: 'k_shard', color: '#e070ff', accent: '#ffe0ff', planet: 1 },
    ingot_iridium: { name: 'Lingot d’iridium',      price: 12,  shape: 'k_hexbar',     color: '#e0dcff', accent: '#ffffff', planet: 1 },
    iridium_alloy: { name: 'Iridium trempé',        price: 60,  shape: 'k_layers',   color: '#b0a8e8', accent: '#ffffff', planet: 1 },
    polymer:       { name: 'Polymère',              price: 50,  shape: 'k_blob',   color: '#f0e070', accent: '#ffffff', planet: 1 },
    hydrazine:     { name: 'Hydrazine',             price: 140, shape: 'k_vial',    color: '#5ad0e0', accent: '#e8ffff', planet: 1 },
    dome:          { name: 'Panneau de dôme',       price: 80,  shape: 'k_dome',    color: '#9aa8e0', accent: '#f0e8ff', planet: 1 },
    lens:          { name: 'Lentille photonique',   price: 140, shape: 'k_lens',   color: '#c060f0', accent: '#a0f8ff', planet: 1 },
    habitat:       { name: 'Module de colonie',     price: 240, shape: 'k_module',    color: '#5fd0c0', accent: '#e0fff8', planet: 1 },
    qprocessor:    { name: 'Processeur quantique',  price: 180, shape: 'k_qchip',    color: '#4a2fa0', accent: '#5ef0ff', planet: 1 },
    capacitor:     { name: 'Condensateur à plasma', price: 160, shape: 'k_capa',    color: '#d0c8f0', accent: '#ff6ad8', planet: 1 },
    ion_engine:    { name: 'Moteur ionique',        price: 300, shape: 'k_engine',  color: '#5a6ad0', accent: '#5ef0ff', planet: 1 },
    fusion_core:   { name: 'Noyau de fusion',       price: 360, shape: 'k_star',     color: '#5ef0ff', accent: '#ffffff', planet: 1 },
    gate_ring:     { name: 'Segment de portail',    price: 800, shape: 'k_gate',   color: '#ff6ad8', accent: '#ffffff', planet: 1 },
    ammonia_cell:  { name: 'Cartouche d’ammoniac',  price: 4,   shape: 'k_cart',    color: '#7fe0c8', accent: '#ffffff', planet: 1 },
    methane_cell:  { name: 'Cartouche de méthane',  price: 8,   shape: 'k_cart',    color: '#c8903a', accent: '#ffe0a0', planet: 1 },
    slag:          { name: 'Scories',               price: 1,   shape: 'k_slag',    color: '#6a5a6a', accent: '#c45a3c', planet: 1 },
    mineral_wool:  { name: 'Laine minérale',        price: 8,   shape: 'k_wool',    color: '#d8c8a8', accent: '#ffffff', planet: 1 },
    catalyst:      { name: 'Catalyseur',            price: 60,  shape: 'k_catalyst', color: '#ff6ad8', accent: '#5ef0ff', planet: 1 },
    ammonia:       { name: 'Ammoniac',              price: 0,   shape: 'drop',    color: '#7fe0c8', accent: '#e0fff8', fluid: true, planet: 1, place: 'Lac d’ammoniac', where: 'un lac d’ammoniac', pool: ['#1f5a52', '#5fc8b0'] },
    methane:       { name: 'Méthane liquide',       price: 0,   shape: 'drop',    color: '#c8903a', accent: '#ffe0a0', fluid: true, planet: 1, place: 'Poche de méthane', where: 'une poche de méthane', pool: ['#2e2210', '#8a6a30'] }
  };

  // Ore tile ids used in the ore layer (0 = none). Kéora's ores come after the ones of the Terre.
  CO.ORE_IDS = ['', 'iron_ore', 'copper_ore', 'stone', 'coal', 'sand', 'titanium_ore', 'water', 'oil',
    'quartz', 'cobalt_ore', 'lithium_ore', 'sulfur', 'lava_rock', 'iridium_ore', 'ammonia', 'methane'];
  /** Ore ids that are fluids (lakes, oil pools): pumped, never drilled. */
  CO.isFluidOre = function (id) { return id > 0 && !!CO.ITEMS[CO.ORE_IDS[id]].fluid; };

  // ------------------------------------------------------------- recipes
  // `machine`: building type that can run it. `tech`: research needed (null = from the start).
  // Output item id == recipe id.
  CO.RECIPES = {
    // Balance rule: every base time is DOUBLE the old one and drills are twice slower, so all
    // integer machine ratios (1 drill = 2 smelters, 1 wire + 1 plate workshop = 1 circuit workshop...) still hold.
    ingot_iron:   { machine: 'smelter',    in: { iron_ore: 1 },   out: { ingot_iron: 1 },   time: 4, tech: null },
    ingot_copper: { machine: 'smelter',    in: { copper_ore: 1 }, out: { ingot_copper: 1 }, time: 4, tech: null },
    brick:        { machine: 'smelter',    in: { stone: 1 },      out: { brick: 1 },        time: 4, tech: null },
    glass:        { machine: 'smelter',    in: { sand: 1 },       out: { glass: 1 },        time: 4, tech: null },
    ingot_titanium: { machine: 'smelter',  in: { titanium_ore: 1 }, out: { ingot_titanium: 1 }, time: 4, tech: 'titanium' },
    plate:        { machine: 'assembler',  in: { ingot_iron: 1 }, out: { plate: 1 },        time: 4, tech: null },
    gear:         { machine: 'assembler',  in: { ingot_iron: 2 }, out: { gear: 1 },         time: 8, tech: null },
    wire:         { machine: 'assembler',  in: { ingot_copper: 1 }, out: { wire: 2 },       time: 4, tech: null },
    circuit:      { machine: 'assembler',  in: { wire: 2, plate: 1 }, out: { circuit: 1 },   time: 4, tech: 'electronics' },
    battery:      { machine: 'assembler',  in: { ingot_copper: 2, plate: 2 }, out: { battery: 1 }, time: 8, tech: 'batteries' },
    steel:        { machine: 'steelmill',  in: { ingot_iron: 2, coal: 1 }, out: { steel: 1 }, time: 8, tech: 'metallurgy' },
    silicon:      { machine: 'steelmill',  in: { sand: 2, coal: 1 },       out: { silicon: 1 }, time: 8, tech: 'metallurgy' },
    alloy:        { machine: 'steelmill',  in: { ingot_titanium: 2, coal: 1 }, out: { alloy: 1 }, time: 8, tech: 'alloys' },
    hull:         { machine: 'fabricator', in: { steel: 2, brick: 1 },     out: { hull: 1 },  time: 8, tech: 'advanced' },
    solar:        { machine: 'fabricator', in: { silicon: 2, glass: 1, circuit: 1 }, out: { solar: 1 }, time: 16, tech: 'photovoltaics' },
    kit:          { machine: 'fabricator', in: { hull: 2, circuit: 1, gear: 1 },     out: { kit: 1 },   time: 16, tech: 'modules' },
    thruster:     { machine: 'fabricator', in: { steel: 4, circuit: 2, gear: 1 },    out: { thruster: 1 }, time: 16, tech: 'propulsion' },
    processor:    { machine: 'fabricator', in: { circuit: 2, silicon: 2 },            out: { processor: 1 }, time: 8, tech: 'processors' },
    tank:         { machine: 'fabricator', in: { alloy: 2, glass: 2 },               out: { tank: 1 },  time: 16, tech: 'tanks' },
    core:         { machine: 'spaceyard',  in: { alloy: 2, processor: 1, battery: 2 }, out: { core: 1 }, time: 16, tech: 'spaceyard' },
    probe:        { machine: 'spaceyard',  in: { thruster: 1, processor: 2, tank: 1 }, out: { probe: 1 }, time: 32, tech: 'probes' },
    rocket_part:  { machine: 'spaceyard',  in: { hull: 2, fuel: 4, processor: 1, plastic: 4 }, out: { rocket_part: 1 }, time: 24, tech: 'rocketry' },
    satellite:    { machine: 'spaceyard',  in: { solar: 4, processor: 4, battery: 4, alloy: 4 }, out: { satellite: 1 }, time: 32, tech: 'rocketry' },
    // `fin`: fluids taken from the pipes touching the machine, per cycle
    plastic:      { machine: 'refinery',   in: { coal: 1 }, fin: { oil: 10 }, out: { plastic: 2 }, time: 4, tech: 'oil' },
    fuel:         { machine: 'refinery',   in: {},          fin: { oil: 20 }, out: { fuel: 1 },    time: 4, tech: 'oil' },

    // ================= Kéora: each machine has its own way of making things (see the machines below and sim.js).
    // Crucible ('kiln'): `time` bakes a whole batch, once the crucible is at `temp` degrees. Crystalliser
    // ('grower'): `time` seconds of darkness per crystal, several growing at once. `cat`: a catalyst the
    // machine wears down (def.catUses crafts each). Plasma oven: slag comes out with every alloy.
    ingot_cobalt:  { machine: 'k_forge',       in: { cobalt_ore: 1 },  out: { ingot_cobalt: 1 },  time: 10, temp: 1100, tech: null },
    lithium:       { machine: 'k_forge',       in: { lithium_ore: 1 }, out: { lithium: 1 },       time: 10, temp: 300,  tech: null },
    quartz_glass:  { machine: 'k_forge',       in: { quartz: 1 },      out: { quartz_glass: 1 },  time: 10, temp: 900,  tech: null },
    ceramic:       { machine: 'k_forge',       in: { lava_rock: 1 },   out: { ceramic: 1 },       time: 10, temp: 700,  tech: null },
    ingot_iridium: { machine: 'k_forge',       in: { iridium_ore: 1 }, out: { ingot_iridium: 1 }, time: 10, temp: 1500, tech: 'k_iridium' },
    resonator:     { machine: 'k_grower',      in: { quartz: 2, lithium: 1 }, out: { resonator: 1 }, time: 24, tech: 'k_growth' },
    cobalt_sheet:  { machine: 'k_workshop',    in: { ingot_cobalt: 1 }, out: { cobalt_sheet: 1 }, time: 4, tech: null },
    rotor:         { machine: 'k_workshop',    in: { ingot_cobalt: 2 }, out: { rotor: 1 },        time: 8, tech: null },
    fiber:         { machine: 'k_workshop',    in: { quartz_glass: 1 }, out: { fiber: 2 },        time: 4, tech: null },
    photonic:      { machine: 'k_workshop',    in: { fiber: 2, cobalt_sheet: 1 }, out: { photonic: 1 }, time: 4, tech: 'k_photonics' },
    cell:          { machine: 'k_workshop',    in: { lithium: 2, cobalt_sheet: 2 }, out: { cell: 1 }, time: 8, tech: 'k_cells' },
    catalyst:      { machine: 'k_workshop',    in: { quartz_glass: 2, photonic: 1 }, out: { catalyst: 1 }, time: 8, tech: 'k_synth' },
    superalloy:    { machine: 'k_plasma_oven', in: { ingot_cobalt: 2, sulfur: 1 }, out: { superalloy: 1, slag: 1 }, time: 8, tech: 'k_plasma' },
    iridium_alloy: { machine: 'k_plasma_oven', in: { ingot_iridium: 2, lithium: 1 }, out: { iridium_alloy: 1, slag: 1 }, time: 8, tech: 'k_iridium_alloy' },
    mineral_wool:  { machine: 'k_crusher',     in: { slag: 2 }, out: { mineral_wool: 1 }, time: 4, tech: 'k_plasma' },
    dome:          { machine: 'k_synth',       in: { superalloy: 2, mineral_wool: 1 }, out: { dome: 1 }, time: 8, cat: 'catalyst', tech: 'k_synth' },
    lens:          { machine: 'k_synth',       in: { resonator: 2, quartz_glass: 1, photonic: 1 }, out: { lens: 1 }, time: 16, cat: 'catalyst', tech: 'k_lens' },
    habitat:       { machine: 'k_synth',       in: { dome: 2, photonic: 1, rotor: 1 }, out: { habitat: 1 }, time: 16, cat: 'catalyst', tech: 'k_habitat' },
    qprocessor:    { machine: 'k_synth',       in: { photonic: 2, resonator: 2 }, out: { qprocessor: 1 }, time: 8, cat: 'catalyst', tech: 'k_quantum' },
    capacitor:     { machine: 'k_synth',       in: { iridium_alloy: 2, polymer: 2 }, out: { capacitor: 1 }, time: 16, cat: 'catalyst', tech: 'k_capacitor' },
    ion_engine:    { machine: 'k_synth',       in: { superalloy: 3, photonic: 2, hydrazine: 2 }, out: { ion_engine: 1 }, time: 16, cat: 'catalyst', tech: 'k_ion' },
    fusion_core:   { machine: 'k_stellar',     in: { iridium_alloy: 2, qprocessor: 1, cell: 2 }, out: { fusion_core: 1 }, time: 16, tech: 'k_stellar' },
    gate_ring:     { machine: 'k_stellar',     in: { ion_engine: 1, qprocessor: 2, capacitor: 1 }, out: { gate_ring: 1 }, time: 32, tech: 'k_gate' },
    polymer:       { machine: 'k_chem',        in: { sulfur: 1, methane_cell: 1 }, out: { polymer: 2 }, time: 4, tech: 'k_methane' },
    hydrazine:     { machine: 'k_chem',        in: { ammonia_cell: 2 },            out: { hydrazine: 1 }, time: 4, tech: 'k_cryo' }
  };
  for (const id in CO.RECIPES) CO.RECIPES[id].id = id;

  // ----------------------------------------------------------- buildings
  // kind: behaviour (see sim.js). cat: palette category. tech: research needed (null = from the start).
  CO.BUILDINGS = {
    belt:            { name: 'Convoyeur',            cat: 'Transport',  kind: 'belt',        w: 1, h: 1, cost: 1,   speed: 1.6, tier: 0, tech: null,
                       desc: 'Transporte les objets dans le sens de la flèche. Glisse pour en poser plusieurs.' },
    belt_fast:       { name: 'Convoyeur rapide',     cat: 'Transport',  kind: 'belt',        w: 1, h: 1, cost: 3,   speed: 3.2, tier: 1, tech: 'fast_belt',
                       desc: 'Deux fois plus rapide qu’un convoyeur de base.' },
    belt_armored:    { name: 'Convoyeur blindé',     cat: 'Transport',  kind: 'belt',        w: 1, h: 1, cost: 4,   speed: 4.8, tier: 2, tech: 'armored_belt',
                       desc: 'Rails en titane : trois fois plus rapide qu’un convoyeur de base.' },
    splitter:        { name: 'Séparateur',           cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 12,  tech: 'logistics1',
                       desc: 'Entrée par l’arrière, sortie répartie devant, à gauche et à droite. Peut recevoir un filtre : l’objet filtré sort tout droit.' },
    merger:          { name: 'Fusion',               cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 10,  tech: 'logistics1',
                       desc: 'Fusionne jusqu’à trois flux (arrière, gauche, droite) vers une seule sortie devant.' },
    overflow:        { name: 'Porte de débordement', cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 14,  tech: 'logistics2',
                       desc: 'Entrée par l’arrière. Tout sort devant ; quand devant est bloqué, le surplus part à gauche et à droite.' },
    underflow:       { name: 'Porte de sous-débit',  cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 14,  tech: 'logistics2',
                       desc: 'Entrée par l’arrière. Alimente d’abord la gauche et la droite ; devant seulement quand les deux côtés sont bloqués.' },
    junction:        { name: 'Croisement',           cat: 'Transport',  kind: 'junction',    w: 1, h: 1, cost: 8,   tech: 'logistics2',
                       desc: 'Deux lignes se croisent sans se mélanger : chaque objet ressort en face de son entrée.' },
    sorter_inv:      { name: 'Trieur inversé',       cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 16,  tech: 'sorting',
                       desc: 'Entrée par l’arrière. L’objet choisi (Infos → filtre) sort à gauche et à droite, tout le reste continue tout droit.' },
    underground_in:  { name: 'Entrée souterraine',   cat: 'Transport',  kind: 'tunnel_in',   w: 1, h: 1, cost: 15,  tech: 'tunnels',
                       desc: 'Plonge sous les autres lignes. Portée : 4 cases jusqu’à une sortie de même direction.' },
    underground_out: { name: 'Sortie souterraine',   cat: 'Transport',  kind: 'tunnel_out',  w: 1, h: 1, cost: 15,  tech: 'tunnels',
                       desc: 'Fait ressortir les objets d’une entrée souterraine alignée.' },
    chest:           { name: 'Coffre tampon',        cat: 'Transport',  kind: 'chest',       w: 1, h: 1, cost: 30,  tech: 'storage', capacity: 300,
                       desc: 'Stocke jusqu’à 300 objets pour lisser la production. Sort par la flèche.' },
    unloader:        { name: 'Extracteur',           cat: 'Transport',  kind: 'unloader',    w: 1, h: 1, cost: 40,  tech: 'sorting',
                       desc: 'Collé à un coffre, une machine ou une foreuse, il en tire les objets (filtre possible dans Infos) et les sort par sa flèche.' },
    // ---- drones (late game): air delivery between send and request chests within a drone port's range
    drone_hub:       { name: 'Port de drones',       cat: 'Transport',  kind: 'drone_hub',   w: 2, h: 2, cost: 1500, tech: 'drones', drones: 4, range: 24, power: 30,
                       desc: 'Abrite 4 drones qui portent jusqu’à 10 objets des Coffres d’envoi vers les Coffres de demande, à 24 cases de lui au plus (zone carrée). 30 kW quand ils volent.' },
    drone_provider:  { name: 'Coffre d’envoi',       cat: 'Transport',  kind: 'drone_provider', w: 1, h: 1, cost: 60, tech: 'drones', capacity: 100,
                       desc: 'Reçoit les objets des convoyeurs (n’importe quel côté) : les drones viennent les chercher.' },
    drone_requester: { name: 'Coffre de demande',    cat: 'Transport',  kind: 'drone_requester', w: 1, h: 1, cost: 60, tech: 'drones', capacity: 100, want: 40,
                       desc: 'Choisis l’objet voulu dans Infos : les drones en apportent jusqu’à en avoir 40, et le coffre les sort par sa flèche.' },
    // Mass driver: point-to-point long range link. range in tiles (centre to centre), volleys of `volley`
    // items every `reload` s = 4 items/s (= 8 drills = 2 heavy drills), whatever the research.
    driver:          { name: 'Catapulte magnétique', cat: 'Transport',  kind: 'driver',      w: 2, h: 2, cost: 300, tech: 'mass_driver',
                       range: 48, volley: 8, reload: 2, capacity: 32,
                       desc: 'Lance les objets reçus vers une autre catapulte, jusqu’à 48 cases (4 objets/s, en salves de 8). Sans cible, elle reçoit et sort par la flèche. Infos → « Choisir la cible ».' },
    drill:           { name: 'Foreuse',              cat: 'Production', kind: 'drill',       w: 2, h: 2, cost: 40,  tech: null, rate: 0.5, power: 10,
                       desc: 'À poser sur un gisement : 0,5 minerai/s à pleine couverture (0,125 par case). Équivaut à 2 fonderies. Sort par la flèche.' },
    drill_heavy:     { name: 'Foreuse lourde',       cat: 'Production', kind: 'drill',       w: 3, h: 3, cost: 180, tech: 'heavy_drill', rate: 2, power: 35,
                       desc: 'Grande foreuse 3×3 : 2 minerais/s à pleine couverture (9 cases). Équivaut à 8 fonderies.' },
    smelter:         { name: 'Fonderie',             cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 60,  tech: null, power: 15,
                       desc: 'Fond minerais, pierre et sable en lingots, briques et verre. La recette se choisit seule.' },
    assembler:       { name: 'Atelier',              cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 90,  tech: null, power: 20,
                       desc: 'Fabrique plaques, engrenages, fils et circuits. Clique dessus pour choisir la recette.' },
    steelmill:       { name: 'Haut-fourneau',        cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 220, tech: 'metallurgy', power: 60,
                       desc: 'Produit acier et silicium.' },
    fabricator:      { name: 'Fabrique orbitale',    cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 380, tech: 'advanced', power: 90,
                       desc: 'Assemble les pièces avancées de la station.' },
    spaceyard:       { name: 'Chantier spatial',     cat: 'Production', kind: 'machine',     w: 4, h: 4, cost: 900, tech: 'spaceyard', power: 250,
                       desc: 'Géant 4×4 : cœurs de réacteur et sondes profondes, les pièces les plus complexes.' },
    launch_pad:      { name: 'Pas de tir',           cat: 'Production', kind: 'launch_pad',  w: 4, h: 4, cost: 5000, tech: 'rocketry', power: 200, parts: 10,
                       desc: 'Reçoit des Modules de fusée et une charge utile (Satellite ou Sonde profonde) par convoyeur, de n’importe quel côté. Avec 10 modules et une charge, il assemble la fusée et la lance : chaque lancement fait avancer le programme orbital (onglet Station).' },
    refinery:        { name: 'Raffinerie',           cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 600, tech: 'oil', power: 80, fluidIO: true,
                       desc: 'Transforme le pétrole amené par tuyau en plastique (avec du charbon) ou en carburant. Relie un tuyau de pétrole à n’importe quel côté.' },
    // ---- energy: machines, drills, labs and launchers only work when a power network reaches them
    pole:            { name: 'Poteau électrique',    cat: 'Énergie',    kind: 'pole',        w: 1, h: 1, cost: 4,   tech: null, cover: 2, reach: 7,
                       desc: 'Alimente tout bâtiment qui touche sa zone (5×5 cases autour de lui) et se relie tout seul aux poteaux et générateurs à 7 cases ou moins.' },
    pylon:           { name: 'Pylône',               cat: 'Énergie',    kind: 'pole',        w: 1, h: 1, cost: 25,  tech: 'power_grid', cover: 1, reach: 18,
                       desc: 'Transporte le courant loin : se relie aux poteaux et pylônes jusqu’à 18 cases. Petite zone (3×3).' },
    generator:       { name: 'Générateur thermique', cat: 'Énergie',    kind: 'generator',   w: 2, h: 2, cost: 60,  tech: null, gen: 120, fuel: 'coal', burn: 6, cover: 1,
                       desc: 'Brûle du charbon amené par convoyeur (n’importe quel côté) : 120 kW. À pleine charge, un charbon dure 6 s ; il brûle moins vite quand le réseau demande moins.' },
    solar_plant:     { name: 'Centrale solaire',     cat: 'Énergie',    kind: 'generator',   w: 2, h: 2, cost: 500, tech: 'photovoltaics', gen: 80, cover: 1,
                       desc: 'Produit 80 kW en continu, sans carburant.' },
    steam_plant:     { name: 'Centrale à vapeur',    cat: 'Énergie',    kind: 'generator',   w: 3, h: 3, cost: 900, tech: 'steam_power', gen: 400, fuel: 'coal', burn: 4, water: 10, cover: 1, fluidIO: true,
                       desc: 'Chaudière et turbine : 400 kW. Brûle du charbon (convoyeur, n’importe quel côté) et consomme 10 eau/s à pleine charge, amenée par un tuyau.' },
    // ---- fluids
    pipe:            { name: 'Tuyau',                cat: 'Fluides',    kind: 'pipe',        w: 1, h: 1, cost: 2,   tech: 'fluids',
                       desc: 'Les tuyaux qui se touchent forment un réseau qui partage son contenu (100 unités par tuyau, un seul fluide). Relie pompes, cuves et machines à fluides.' },
    pump:            { name: 'Pompe à eau',          cat: 'Fluides',    kind: 'pump',        w: 2, h: 2, cost: 80,  tech: 'fluids', fluid: 'water', rate: 20, power: 15, fluidIO: true,
                       desc: 'À poser sur un lac : 20 eau/s à pleine couverture, envoyée dans les tuyaux qui la touchent.' },
    oil_well:        { name: 'Puits de pétrole',     cat: 'Fluides',    kind: 'pump',        w: 2, h: 2, cost: 400, tech: 'oil', fluid: 'oil', rate: 5, power: 40, fluidIO: true,
                       desc: 'À poser sur une nappe de pétrole (taches sombres, loin du Port) : 5 pétrole/s à pleine couverture.' },
    fluid_tank:      { name: 'Cuve',                 cat: 'Fluides',    kind: 'fluid_tank',  w: 2, h: 2, cost: 120, tech: 'fluids', capacity: 2000, fluidIO: true,
                       desc: 'Réserve de 2 000 unités, reliée comme un tuyau : elle amortit les à-coups entre pompes et machines.' },
    lab:             { name: 'Laboratoire',          cat: 'Autres',     kind: 'lab',         w: 2, h: 2, cost: 80,  tech: null, power: 25,
                       desc: 'Consomme les objets de la recherche en cours (onglet Recherche) et met en réserve ceux qui serviront à une recherche future.' },
    seller:          { name: 'Comptoir de vente',    cat: 'Autres',     kind: 'seller',      w: 2, h: 2, cost: 25,  tech: null,
                       desc: 'Achète tout ce qu’on lui apporte, à prix fixe.' },
    port:            { name: 'Port de la station',   cat: 'Autres',     kind: 'port',        w: 4, h: 4, cost: 0,   tech: null, fixed: true, hidden: true, gen: 150, cover: 6,
                       desc: 'Reçoit les pièces de la station. Le surplus est revendu.' },

    // ================= Kéora (planet 1): nothing of the Terre exists there. No belts: the quantum network
    // (tubes.js) carries the items. No poles: energy travels in beams of light (power.js). No pipes: liquids
    // travel in cartridges.
    k_tube:          { name: 'Tube quantique',       cat: 'Réseau',     kind: 'ktube',       w: 1, h: 1, cost: 3,   tech: null, planet: 1, path: true, nodir: true,
                       desc: 'Les tubes qui se touchent forment un réseau. Tout bâtiment qui touche un tube y est relié : le réseau lui apporte ce dont il a besoin. Pointe la flèche d’une machine sur un tube pour y déposer sa production. Glisse pour en poser plusieurs.' },
    k_silo:          { name: 'Silo à capsules',      cat: 'Réseau',     kind: 'ksilo',       w: 2, h: 2, cost: 150, tech: null, capacity: 400, planet: 1, nodir: true,
                       desc: 'Fait partie du réseau : garde jusqu’à 400 objets dont personne n’a besoin sur le moment, et les rend dès qu’un bâtiment du réseau les demande.' },
    k_booster:       { name: 'Accélérateur de flux', cat: 'Réseau',     kind: 'kbooster',    w: 2, h: 2, cost: 300, tech: 'k_flux', rate: 10, power: 40, planet: 1, nodir: true,
                       desc: 'Fait partie du réseau et lui ajoute 10 transferts/s (un réseau seul en fait 6). Consomme 40 kW.' },
    k_relay:         { name: 'Relais quantique',     cat: 'Réseau',     kind: 'krelay',      w: 2, h: 2, cost: 800, tech: 'k_relay', range: 64, planet: 1, nodir: true,
                       desc: 'Relie son réseau de tubes à celui d’un autre relais, jusqu’à 64 cases, par-dessus tout le reste. Infos → « Choisir la cible ».' },
    k_prism:         { name: 'Prisme',               cat: 'Énergie',    kind: 'kprism',      w: 1, h: 1, cost: 20,  tech: null, planet: 1,
                       desc: 'Un faisceau d’énergie qui l’atteint repart dans le sens de sa flèche, avec une portée neuve de 24 cases. Sert à contourner, à tourner au coin d’une rangée de machines.' },
    k_split:         { name: 'Diffracteur',          cat: 'Énergie',    kind: 'ksplit',      w: 1, h: 1, cost: 60,  tech: 'k_photonics', planet: 1,
                       desc: 'Divise le faisceau qui l’atteint en trois : devant (sa flèche), à gauche et à droite, chacun avec une portée de 24 cases.' },
    k_drill:         { name: 'Foreuse à plasma',     cat: 'Production', kind: 'drill',       w: 2, h: 2, cost: 120, tech: null, rate: 0.5, power: 15, planet: 1,
                       desc: 'À poser sur un gisement : 0,5 minerai/s à pleine couverture (0,125 par case). Équivaut à 2 forges. Sort par la flèche (sur un tube : dans le réseau).' },
    k_drill_heavy:   { name: 'Foreuse sismique',     cat: 'Production', kind: 'drill',       w: 3, h: 3, cost: 500, tech: 'k_seismic', rate: 2, power: 45, planet: 1,
                       desc: 'Grande foreuse 3×3 : 2 minerais/s à pleine couverture (9 cases). Équivaut à 8 forges.' },
    k_extractor:     { name: 'Extracteur d’ammoniac', cat: 'Production', kind: 'drill',      w: 2, h: 2, cost: 200, tech: 'k_cryo', rate: 0.5, power: 20, fluidOre: 'ammonia', yields: 'ammonia_cell', planet: 1,
                       desc: 'À poser sur un lac d’ammoniac : remplit 0,5 cartouche/s à pleine couverture. Pas de tuyaux sur Kéora : les liquides voyagent en cartouches, comme les autres objets.' },
    k_well:          { name: 'Puits de méthane',     cat: 'Production', kind: 'drill',       w: 2, h: 2, cost: 1000, tech: 'k_methane', rate: 0.25, power: 50, fluidOre: 'methane', yields: 'methane_cell', planet: 1,
                       desc: 'À poser sur une poche de méthane (taches brunes, loin du Port) : 0,25 cartouche/s à pleine couverture.' },
    k_forge:         { name: 'Creuset à fournée',    cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 150, tech: null, power: 30, planet: 1,
                       mode: 'kiln', batch: 8, wait: 6, heatRate: 150, cool: 60, maxHeat: 1600,
                       desc: 'Cuit par fournées : il charge jusqu’à 8 minerais identiques, puis les cuit tous ensemble (10 s), quand il est plein ou 6 s après le premier. Il doit d’abord chauffer jusqu’à la température du minerai (lithium 300°, roche 700°, quartz 900°, cobalt 1 100°, iridium 1 500°) et refroidit s’il reste vide : nourris-le sans arrêt.' },
    k_grower:        { name: 'Cristallisoir',        cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 400, tech: 'k_growth', power: 25, planet: 1,
                       mode: 'grower', slots: 6,
                       desc: 'Fait pousser jusqu’à 6 cristaux résonants à la fois (quartz + lithium). Les cristaux ne poussent que dans le noir : la nuit à plein régime, presque pas en plein jour. Stocke-les dans un silo pour les journées.' },
    k_crusher:       { name: 'Broyeur à scories',    cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 250, tech: 'k_plasma', power: 25, planet: 1,
                       desc: 'Broie les scories du four à plasma en laine minérale, l’isolant des panneaux de dôme.' },
    k_workshop:      { name: 'Atelier de précision', cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 220, tech: null, power: 30, planet: 1,
                       desc: 'Tôles, rotors, fibre optique, puces photoniques et cellules. Clique dessus pour choisir la recette.' },
    k_plasma_oven:   { name: 'Four à plasma',        cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 600, tech: 'k_plasma', power: 80, planet: 1,
                       desc: 'Allie les métaux dans le plasma : superalliage (au soufre), iridium trempé (au lithium). Chaque fournée rejette des scories, qui sortent avec l’alliage : envoie-les au broyeur.' },
    k_synth:         { name: 'Synthétiseur',         cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 1000, tech: 'k_synth', power: 120, planet: 1, catUses: 15,
                       desc: 'Assemble les pièces avancées du portail. Chaque assemblage use son catalyseur : un catalyseur fait 15 pièces, puis il en faut un neuf (le réseau l’apporte).' },
    k_stellar:       { name: 'Forge stellaire',      cat: 'Production', kind: 'machine',     w: 4, h: 4, cost: 2500, tech: 'k_stellar', power: 300, planet: 1,
                       desc: 'Géant 4×4 : noyaux de fusion et segments de portail, les pièces les plus complexes.' },
    k_chem:          { name: 'Réacteur chimique',    cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 1500, tech: 'k_cryo', power: 100, planet: 1,
                       desc: 'Hydrazine (cartouches d’ammoniac) et polymère (cartouches de méthane + soufre).' },
    k_gen:           { name: 'Générateur au soufre', cat: 'Énergie',    kind: 'generator',   w: 2, h: 2, cost: 150, tech: null, gen: 150, fuel: 'sulfur', burn: 6, planet: 1,
                       desc: 'Brûle du soufre (apporté par les tubes) et envoie 150 kW dans un faisceau d’énergie, dans le sens de sa flèche : tout ce que le faisceau traverse sur 24 cases est alimenté. À pleine charge, un soufre dure 6 s.' },
    k_turbine:       { name: 'Turbine au méthane',   cat: 'Énergie',    kind: 'generator',   w: 3, h: 3, cost: 2000, tech: 'k_methane', gen: 500, fuel: 'methane_cell', burn: 4, planet: 1,
                       desc: 'Brûle des cartouches de méthane : 500 kW, envoyés dans un faisceau dans le sens de sa flèche. À pleine charge, une cartouche dure 4 s.' },
    k_collector:     { name: 'Collecteur photonique', cat: 'Énergie',   kind: 'generator',   w: 2, h: 2, cost: 1200, tech: 'k_lens', gen: 120, light: true, planet: 1,
                       desc: 'Jusqu’à 120 kW sans carburant, en plein jour, dans un faisceau dans le sens de sa flèche. Kéora tourne vite : la nuit tombe toutes les 5 minutes et le collecteur s’éteint. Garde des accumulateurs pour la nuit.' },
    k_accu:          { name: 'Accumulateur',         cat: 'Énergie',    kind: 'kaccu',       w: 2, h: 2, cost: 600, tech: 'k_cells', capacity: 30000, rate: 200, planet: 1, nodir: true,
                       desc: 'Placé sur un faisceau, il se charge du surplus de son réseau (200 kW au plus) et le rend quand les générateurs ne suffisent plus, la nuit par exemple. Il émet aussi un faisceau dans le sens de sa flèche. Réserve : 30 000 kJ.' },
    k_lab:           { name: 'Laboratoire cristallin', cat: 'Autres',   kind: 'lab',         w: 2, h: 2, cost: 200, tech: null, power: 30, planet: 1,
                       desc: 'Relié au réseau, il reçoit les objets de la recherche en cours (onglet Recherche) et met en réserve ceux qui serviront plus tard.' },
    k_seller:        { name: 'Comptoir d’échange',   cat: 'Autres',     kind: 'seller',      w: 2, h: 2, cost: 100, tech: null, planet: 1,
                       desc: 'Relié au réseau, il achète au prix fixe tout ce qui y traîne sans preneur depuis quelques secondes.' },
    k_port:          { name: 'Spatioport de Kéora',  cat: 'Autres',     kind: 'port',        w: 4, h: 4, cost: 0,   tech: null, fixed: true, hidden: true, gen: 150, planet: 1,
                       desc: 'Reçoit les pièces du portail. Relié aux tubes, il prend ce que l’étape demande (et les contrats) et revend le surplus. Il envoie 150 kW dans quatre faisceaux d’énergie, un par côté.' }
  };
  for (const id in CO.BUILDINGS) CO.BUILDINGS[id].id = id;
  // Every building belongs to one planet: what has no `planet` is the Terre's.
  for (const id in CO.BUILDINGS) if (CO.BUILDINGS[id].planet == null) CO.BUILDINGS[id].planet = 0;

  // ------------------------------------------------------------ research
  // effect.machineSpeed / drillSpeed are additive bonuses (+0.25 = +25 % of the base speed);
  // effect.chestCap adds capacity to every buffer chest.
  CO.TECHS = {
    logistics1:    { name: 'Aiguillages',           desc: 'Séparateurs et fusions de flux.',            cost: { ingot_iron: 20 }, req: [] },
    storage:       { name: 'Stockage tampon',       desc: 'Coffres pour lisser la production.',         cost: { brick: 15, plate: 10 }, req: ['logistics1'] },
    tunnels:       { name: 'Convoyeurs souterrains', desc: 'Passer sous les autres lignes.',            cost: { gear: 10, ingot_copper: 20 }, req: ['logistics1'] },
    fast_belt:     { name: 'Convoyeurs rapides',    desc: 'Des lignes deux fois plus rapides.',         cost: { gear: 25, wire: 20 }, req: ['logistics1'] },
    logistics2:    { name: 'Aiguillages II',        desc: 'Portes de débordement et de sous-débit, croisements.', cost: { gear: 20, plate: 20 }, req: ['logistics1'] },
    sorting:       { name: 'Tri avancé',            desc: 'Trieur inversé et extracteur.',              cost: { circuit: 15, gear: 20 }, req: ['storage', 'electronics'] },
    mass_driver:   { name: 'Catapultes magnétiques', desc: 'Envoyer les objets par salves jusqu’à 48 cases, par-dessus tout le reste.', cost: { circuit: 30, steel: 20, gear: 20 }, req: ['tunnels', 'metallurgy', 'electronics'] },
    automation1:   { name: 'Automatisation I',      desc: 'Machines 25 % plus rapides.',                cost: { gear: 20, plate: 20 }, req: [], effect: { machineSpeed: 0.25 } },
    drilling1:     { name: 'Forage renforcé',       desc: 'Foreuses 25 % plus rapides (même gain que l’Automatisation I).', cost: { plate: 20, gear: 10, ingot_iron: 20 }, req: [], effect: { drillSpeed: 0.25 } },
    electronics:   { name: 'Électronique',          desc: 'Recette du circuit.',                        cost: { wire: 30, plate: 15 }, req: [] },
    fluids:        { name: 'Hydraulique',           desc: 'Tuyaux, pompe à eau et cuve.',               cost: { plate: 40, gear: 20 }, req: ['logistics1'] },
    steam_power:   { name: 'Vapeur',                desc: 'Centrale à vapeur : eau + charbon → 400 kW.', cost: { steel: 30, circuit: 20 }, req: ['fluids', 'metallurgy'] },
    oil:           { name: 'Pétrochimie',           desc: 'Puits de pétrole et raffinerie : plastique et carburant.', cost: { steel: 40, circuit: 30, glass: 30 }, req: ['steam_power'] },
    rocketry:      { name: 'Astronautique',         desc: 'Pas de tir, modules de fusée et satellites : le programme orbital.', cost: { thruster: 20, processor: 30, fuel: 40 }, req: ['probes', 'oil'] },
    drones:        { name: 'Drones logistiques',    desc: 'Port de drones, Coffres d’envoi et de demande : livraisons par les airs.', cost: { processor: 20, battery: 30, plastic: 30 }, req: ['processors', 'oil'] },
    upgrades1:     { name: 'Améliorations I',       desc: 'Niveau II des foreuses, machines, pompes et générateurs (×1,5).', cost: { gear: 40, circuit: 20 }, req: ['electronics'] },
    upgrades2:     { name: 'Améliorations II',      desc: 'Niveau III (×2 par rapport au niveau I).',   cost: { steel: 40, circuit: 40 }, req: ['upgrades1', 'metallurgy'] },
    power_grid:    { name: 'Haute tension',         desc: 'Pylône : relie le courant jusqu’à 18 cases.', cost: { wire: 40, circuit: 15 }, req: ['electronics'] },
    heavy_drill:   { name: 'Foreuse lourde',        desc: 'Foreuse 3×3 pour les grands gisements.',     cost: { circuit: 15, plate: 40 }, req: ['electronics', 'drilling1'] },
    metallurgy:    { name: 'Métallurgie',           desc: 'Haut-fourneau : acier et silicium.',         cost: { plate: 30, brick: 30, gear: 15, ingot_copper: 20 }, req: ['automation1'] },
    advanced:      { name: 'Assemblage avancé',     desc: 'Fabrique orbitale et plaques de coque.',     cost: { steel: 20, circuit: 20 }, req: ['metallurgy', 'electronics'] },
    photovoltaics: { name: 'Photovoltaïque',        desc: 'Panneau solaire et Centrale solaire (80 kW).',                cost: { silicon: 30, glass: 30 }, req: ['advanced'] },
    modules:       { name: 'Modules habitables',    desc: 'Recette du kit modulaire.',                  cost: { hull: 20, circuit: 30 }, req: ['advanced'] },
    propulsion:    { name: 'Propulsion',            desc: 'Recette du propulseur.',                     cost: { steel: 40, circuit: 40, gear: 30 }, req: ['advanced'] },
    automation2:   { name: 'Automatisation II',     desc: 'Machines 25 % plus rapides de plus.',        cost: { steel: 40, circuit: 40, gear: 20 }, req: ['advanced', 'automation1'], effect: { machineSpeed: 0.25 } },
    drilling2:     { name: 'Forage profond',        desc: 'Foreuses 25 % plus rapides de plus.',        cost: { steel: 30, circuit: 30 }, req: ['drilling1', 'metallurgy', 'electronics'], effect: { drillSpeed: 0.25 } },
    // ---- titanium chain
    titanium:      { name: 'Prospection du titane', desc: 'Fondre le minerai de titane (gisements bleu clair aux confins de la carte).', cost: { plate: 60, circuit: 30, steel: 20 }, req: ['advanced'] },
    alloys:        { name: 'Alliages de titane',    desc: 'Recette de l’alliage (haut-fourneau : titane + charbon).', cost: { ingot_titanium: 40, steel: 30 }, req: ['titanium'] },
    batteries:     { name: 'Batteries',             desc: 'Recette de la batterie (atelier).',          cost: { ingot_copper: 60, plate: 40, circuit: 20 }, req: ['electronics', 'metallurgy'] },
    processors:    { name: 'Microprocesseurs',      desc: 'Recette du processeur (fabrique orbitale).', cost: { circuit: 60, silicon: 40, battery: 20 }, req: ['advanced', 'batteries'] },
    tanks:         { name: 'Réservoirs sous pression', desc: 'Recette du réservoir (fabrique orbitale).', cost: { alloy: 30, glass: 40, hull: 10 }, req: ['alloys'] },
    spaceyard:     { name: 'Chantier spatial',      desc: 'Bâtiment 4×4 : cœurs de réacteur.',          cost: { alloy: 40, processor: 15, hull: 20 }, req: ['processors', 'alloys'] },
    probes:        { name: 'Sondes profondes',      desc: 'Recette de la sonde (chantier spatial).',    cost: { thruster: 10, processor: 20, tank: 10 }, req: ['spaceyard', 'propulsion', 'tanks'] },
    // ---- upgrades
    storage2:      { name: 'Entrepôts',             desc: 'Coffres tampons : 900 objets au lieu de 300.', cost: { alloy: 20, plate: 60, brick: 40 }, req: ['storage', 'alloys'], effect: { chestCap: 600 } },
    armored_belt:  { name: 'Convoyeurs blindés',    desc: 'Rails en titane : des lignes trois fois plus rapides (14,5 objets/s).', cost: { ingot_titanium: 30, steel: 20 }, req: ['fast_belt', 'titanium'] },
    automation3:   { name: 'Automatisation III',    desc: 'Machines 25 % plus rapides de plus.',        cost: { alloy: 30, battery: 30 }, req: ['automation2', 'alloys', 'batteries'], effect: { machineSpeed: 0.25 } },
    automation4:   { name: 'Automatisation IV',     desc: 'Machines 25 % plus rapides de plus (retour aux cadences d’origine).', cost: { processor: 20, alloy: 40 }, req: ['automation3', 'processors'], effect: { machineSpeed: 0.25 } },
    drilling3:     { name: 'Forage au titane',      desc: 'Foreuses 25 % plus rapides de plus.',        cost: { alloy: 25, circuit: 40 }, req: ['drilling2', 'alloys'], effect: { drillSpeed: 0.25 } },
    drilling4:     { name: 'Forage laser',          desc: 'Foreuses 25 % plus rapides de plus (retour aux cadences d’origine).', cost: { processor: 15, alloy: 30 }, req: ['drilling3', 'processors'], effect: { drillSpeed: 0.25 } },

    // ================= Kéora: researched there, with its own items. Nothing learnt on the Terre counts there
    // (speed bonuses and upgrade levels included).
    k_photonics:     { planet: 1, name: 'Photonique',            desc: 'Recette de la puce photonique (atelier de précision) et Diffracteur (divise un faisceau d’énergie en trois).', cost: { fiber: 30, cobalt_sheet: 15 }, req: [] },
    k_plasma:        { planet: 1, name: 'Fusion au plasma',      desc: 'Four à plasma (superalliage, avec des scories) et Broyeur à scories (laine minérale).', cost: { cobalt_sheet: 30, ceramic: 30, rotor: 15, lithium: 20 }, req: [] },
    k_growth:        { planet: 1, name: 'Cristallogenèse',       desc: 'Cristallisoir : faire pousser des cristaux résonants, la nuit.', cost: { quartz_glass: 25, lithium: 25, cobalt_sheet: 15 }, req: [] },
    k_flux:          { planet: 1, name: 'Flux quantique',        desc: 'Accélérateur de flux : +10 transferts/s pour le réseau qu’il touche.', cost: { cobalt_sheet: 20, rotor: 10, quartz_glass: 10 }, req: [] },
    k_overclock:     { planet: 1, name: 'Surcadençage',          desc: 'Machines 25 % plus rapides.', cost: { rotor: 30, photonic: 20 }, req: ['k_photonics'], effect: { machineSpeed: 0.25 } },
    k_seismic:       { planet: 1, name: 'Forage sismique',       desc: 'Foreuse sismique 3×3 pour les grands gisements.', cost: { photonic: 15, cobalt_sheet: 40 }, req: ['k_photonics'] },
    k_up1:           { planet: 1, name: 'Optimisation I',        desc: 'Niveau II des foreuses, machines et générateurs de Kéora (×1,5).', cost: { rotor: 40, photonic: 20 }, req: ['k_photonics'] },
    k_cells:         { planet: 1, name: 'Cellules au lithium',   desc: 'Recette de la cellule au lithium et Accumulateur (garder l’énergie pour la nuit).', cost: { lithium: 60, cobalt_sheet: 40, photonic: 20 }, req: ['k_photonics', 'k_plasma'] },
    k_relay:         { planet: 1, name: 'Intrication quantique', desc: 'Relais quantique : relier deux réseaux jusqu’à 64 cases.', cost: { photonic: 30, superalloy: 20 }, req: ['k_photonics', 'k_plasma'] },
    k_cryo:          { planet: 1, name: 'Cryogénie',             desc: 'Extracteur d’ammoniac (cartouches), réacteur chimique et hydrazine.', cost: { superalloy: 30, photonic: 20 }, req: ['k_plasma', 'k_photonics'] },
    k_synth:         { planet: 1, name: 'Synthèse avancée',      desc: 'Synthétiseur, catalyseur (atelier) et panneaux de dôme.', cost: { superalloy: 20, photonic: 20 }, req: ['k_plasma', 'k_photonics'] },
    k_deepcore:      { planet: 1, name: 'Forage du manteau',     desc: 'Foreuses 25 % plus rapides.', cost: { superalloy: 30, photonic: 30 }, req: ['k_seismic', 'k_plasma'], effect: { drillSpeed: 0.25 } },
    k_up2:           { planet: 1, name: 'Optimisation II',       desc: 'Niveau III (×2 par rapport au niveau I).', cost: { superalloy: 40, photonic: 40 }, req: ['k_up1', 'k_plasma'] },
    k_lens:          { planet: 1, name: 'Optique stellaire',     desc: 'Lentille photonique et Collecteur photonique (jusqu’à 120 kW le jour).', cost: { resonator: 30, quartz_glass: 30 }, req: ['k_synth', 'k_growth'] },
    k_habitat:       { planet: 1, name: 'Habitats de colonie',   desc: 'Recette du module de colonie (synthétiseur).', cost: { dome: 20, photonic: 30 }, req: ['k_synth'] },
    k_methane:       { planet: 1, name: 'Chimie du méthane',     desc: 'Puits de méthane, polymère et Turbine au méthane (500 kW).', cost: { superalloy: 40, photonic: 30, quartz_glass: 30 }, req: ['k_cryo'] },
    k_quantum:       { planet: 1, name: 'Calcul quantique',      desc: 'Recette du processeur quantique (synthétiseur).', cost: { photonic: 60, resonator: 40, cell: 20 }, req: ['k_synth', 'k_cells', 'k_growth'] },
    k_iridium:       { planet: 1, name: 'Prospection de l’iridium', desc: 'Fondre le minerai d’iridium (gisements argentés, loin du Port).', cost: { cobalt_sheet: 60, photonic: 30, superalloy: 20 }, req: ['k_synth'] },
    k_ion:           { planet: 1, name: 'Propulsion ionique',    desc: 'Recette du moteur ionique (synthétiseur, à l’hydrazine).', cost: { superalloy: 40, photonic: 40, rotor: 30 }, req: ['k_synth', 'k_cryo'] },
    k_iridium_alloy: { planet: 1, name: 'Trempe de l’iridium',   desc: 'Recette de l’iridium trempé (four à plasma).', cost: { ingot_iridium: 40, superalloy: 30 }, req: ['k_iridium'] },
    k_capacitor:     { planet: 1, name: 'Condensateurs à plasma', desc: 'Recette du condensateur (synthétiseur).', cost: { iridium_alloy: 30, polymer: 30, dome: 10 }, req: ['k_iridium_alloy', 'k_methane'] },
    k_overclock2:    { planet: 1, name: 'Surcadençage II',       desc: 'Machines 25 % plus rapides de plus.', cost: { qprocessor: 15, superalloy: 40 }, req: ['k_overclock', 'k_quantum'], effect: { machineSpeed: 0.25 } },
    k_deepcore2:     { planet: 1, name: 'Forage du noyau',       desc: 'Foreuses 25 % plus rapides de plus.', cost: { qprocessor: 10, iridium_alloy: 20 }, req: ['k_deepcore', 'k_quantum', 'k_iridium_alloy'], effect: { drillSpeed: 0.25 } },
    k_stellar:       { planet: 1, name: 'Forge stellaire',       desc: 'Bâtiment 4×4 : noyaux de fusion.', cost: { iridium_alloy: 40, qprocessor: 15, dome: 20 }, req: ['k_quantum', 'k_iridium_alloy'] },
    k_gate:          { planet: 1, name: 'Portail stellaire',     desc: 'Recette du segment de portail (forge stellaire).', cost: { ion_engine: 10, qprocessor: 20, capacitor: 10 }, req: ['k_stellar', 'k_ion', 'k_capacitor'] }
  };
  for (const id in CO.TECHS) { CO.TECHS[id].id = id; if (CO.TECHS[id].planet == null) CO.TECHS[id].planet = 0; }   // research belongs to one planet

  // ------------------------------------------------------- station phases
  // Phase i draws station part i (see station.js): keep the two lists in the same order.
  const TERRE_PHASES = [
    { id: 'frame',    name: 'Armature centrale',      desc: 'La poutre et le moyeu de la station.',               need: { plate: 40, gear: 25 },                       reward: 200 },
    { id: 'habitat',  name: 'Cabine de vie',          desc: 'Un premier module pressurisé pour l’équipage.',       need: { brick: 40, glass: 40, plate: 30 },           reward: 250 },
    { id: 'power',    name: 'Réseau électrique',      desc: 'Câblage et nœuds de distribution.',                  need: { circuit: 30, wire: 60 },                     reward: 350 },
    { id: 'hull',     name: 'Coque renforcée',        desc: 'Blindage contre les micrométéorites.',               need: { steel: 50, brick: 30 },                      reward: 500 },
    { id: 'dock',     name: 'Quai d’amarrage',        desc: 'Un bras d’accueil pour les navettes de ravitaillement.', need: { steel: 40, gear: 40, circuit: 20 },      reward: 600 },
    { id: 'solar',    name: 'Ailes solaires',         desc: 'Deux grandes ailes pour capter la lumière.',         need: { solar: 20, circuit: 20 },                    reward: 700 },
    { id: 'lab',      name: 'Module scientifique',    desc: 'Des laboratoires en apesanteur.',                    need: { hull: 20, glass: 40, circuit: 30 },          reward: 800 },
    { id: 'ring',     name: 'Anneau d’habitation',    desc: 'Un anneau tournant pour vivre confortablement.',      need: { kit: 12, hull: 25 },                         reward: 1000 },
    { id: 'antenna',  name: 'Antenne de communication', desc: 'Une grande parabole pour parler à la Terre.',      need: { ingot_titanium: 40, circuit: 50, steel: 30 }, reward: 1200 },
    { id: 'radiator', name: 'Radiateurs thermiques',  desc: 'Évacuer la chaleur dans le vide.',                   need: { alloy: 30, glass: 40, steel: 40 },           reward: 1400 },
    { id: 'engines',  name: 'Propulseurs',            desc: 'Pour quitter la surface et rejoindre l’orbite.',      need: { thruster: 12, alloy: 20 },                   reward: 1600 },
    { id: 'cargo',    name: 'Soute de fret',          desc: 'Des conteneurs pressurisés pour tout emporter.',     need: { tank: 15, hull: 20, battery: 20 },           reward: 1900 },
    { id: 'reactor',  name: 'Réacteur de bord',       desc: 'Le cœur énergétique de la station.',                 need: { core: 8, battery: 30, processor: 10 },       reward: 2200 },
    { id: 'shield',   name: 'Bouclier magnétique',    desc: 'Protège l’équipage des tempêtes solaires.',           need: { processor: 20, alloy: 40, kit: 10 },         reward: 2600 },
    { id: 'garden',   name: 'Serre orbitale',         desc: 'Des plantes, de l’air frais et un peu de vert.',      need: { tank: 20, solar: 20, processor: 10 },        reward: 3000 },
    { id: 'launch',   name: 'Mise en orbite',         desc: 'Dernière étape : allumer la station !',              need: { probe: 6, core: 8, kit: 15, thruster: 10, solar: 15 }, reward: 5000 }
  ];

  // The portal of Kéora, drawn by station.js (same order).
  const KEORA_PHASES = [
    { id: 'anchor',  name: 'Plateforme d’ancrage',     desc: 'Le socle du portail, arrimé en orbite basse.',         need: { cobalt_sheet: 40, rotor: 25 },                  reward: 1500 },
    { id: 'dorms',   name: 'Dortoirs pressurisés',     desc: 'De quoi loger les premiers colons.',                   need: { ceramic: 40, quartz_glass: 40, cobalt_sheet: 30 }, reward: 2000 },
    { id: 'grid',    name: 'Réseau photonique',        desc: 'La lumière remplace les câbles.',                      need: { photonic: 30, fiber: 60 },                      reward: 2500 },
    { id: 'frame',   name: 'Charpente en superalliage', desc: 'L’anneau extérieur du portail.',                     need: { superalloy: 50, ceramic: 30 },                  reward: 3500 },
    { id: 'mirrors', name: 'Miroirs stellaires',       desc: 'Des lentilles géantes pour concentrer la lumière de l’étoile.', need: { lens: 20, photonic: 20 },       reward: 4500 },
    { id: 'domes',   name: 'Dômes de colonie',         desc: 'Sous les dômes, l’air est respirable.',                need: { dome: 20, quartz_glass: 40, photonic: 30 },     reward: 5000 },
    { id: 'quarter', name: 'Quartier d’habitation',    desc: 'Des modules pour toute une ville.',                    need: { habitat: 12, dome: 25 },                        reward: 6000 },
    { id: 'iring',   name: 'Anneau d’iridium',         desc: 'Un second anneau, plus dense, pour tenir le champ.',   need: { ingot_iridium: 40, photonic: 50, superalloy: 30 }, reward: 7000 },
    { id: 'engines', name: 'Moteurs ioniques',         desc: 'Pour orienter le portail vers sa destination.',        need: { ion_engine: 12, iridium_alloy: 20 },            reward: 8000 },
    { id: 'brain',   name: 'Cerveau quantique',        desc: 'Il calcule le chemin à travers le portail.',           need: { qprocessor: 20, cell: 30, capacitor: 10 },      reward: 9500 },
    { id: 'core',    name: 'Cœur de fusion',           desc: 'L’énergie qu’il faut pour ouvrir le passage.',         need: { fusion_core: 8, capacitor: 15, polymer: 30 },   reward: 11000 },
    { id: 'open',    name: 'Ouverture du portail',     desc: 'Dernière étape : allumer le portail !',                need: { gate_ring: 6, fusion_core: 8, habitat: 15, ion_engine: 10, lens: 15 }, reward: 20000 }
  ];

  /**
   * Planets, played one at a time (the others wait, frozen, until the player comes back). Each has its
   * own map, land, factory, goal (phases then extensions) and Port; money, workers and research are shared.
   * maxExt: extensions before the goal is complete and the next planet opens (Infinity on the last one).
   * drill / drillHeavy / smelter / gen / refRecipe: the buildings and recipe the help texts compare against.
   * the: the name inside a sentence; ground: the two floor palettes.
   * port: its Port; grid: how power travels ('poles' and wires, or 'beams' of light); transport: how items travel ('belts', or
   * the 'tubes' of the quantum network); upTech: research for
   * the upgrade levels II and III; day: length of a day in seconds (0: always day).
   */
  CO.PLANETS = [
    { id: 'terre', name: 'Terre', the: 'la Terre', goal: 'Station', goalOf: 'de la station', done: 'Station terminée', phases: TERRE_PHASES, maxExt: 8,
      desc: 'Le monde industriel : fer, cuivre, charbon, sable, titane, eau et pétrole.',
      extDesc: 'La station grandit : de nouveaux modules sont commandés.', extBase: 4000, extStep: 500,
      extMenus: [
        { kit: 8, solar: 8, steel: 30 },
        { thruster: 6, hull: 16, processor: 8 },
        { tank: 8, core: 3, battery: 20 },
        { probe: 2, alloy: 30, solar: 10 },
        { processor: 14, kit: 8, glass: 40 },
        { core: 5, thruster: 6, tank: 8 }
      ],
      drill: 'drill', drillHeavy: 'drill_heavy', smelter: 'smelter', gen: 'generator', refRecipe: 'ingot_iron',
      machines: ['smelter', 'assembler', 'steelmill', 'fabricator', 'spaceyard', 'refinery'],
      ground: [['#34343b', '#313138', '#37373e'], ['#433f3b', '#403c38', '#46423d']], boulder: '#4a4a52', landBase: 400, far: 'Le titane se trouve loin du Port.',
      port: 'port', grid: 'poles', transport: 'belts', upTech: [null, 'upgrades1', 'upgrades2'], day: 0 },
    { id: 'keora', name: 'Kéora', the: 'Kéora', goal: 'Portail', goalOf: 'du portail', done: 'Portail ouvert', phases: KEORA_PHASES, maxExt: Infinity,
      desc: 'Un monde cristallin aux lacs d’ammoniac : cobalt, lithium, quartz, soufre, roche volcanique et iridium.',
      extDesc: 'Le portail s’agrandit : de nouveaux modules sont commandés.', extBase: 12000, extStep: 1500,
      extMenus: [
        { habitat: 8, lens: 8, superalloy: 30 },
        { ion_engine: 6, dome: 16, qprocessor: 8 },
        { capacitor: 8, fusion_core: 3, cell: 20 },
        { gate_ring: 2, iridium_alloy: 30, lens: 10 },
        { qprocessor: 14, habitat: 8, quartz_glass: 40 },
        { fusion_core: 5, ion_engine: 6, capacitor: 8 }
      ],
      drill: 'k_drill', drillHeavy: 'k_drill_heavy', smelter: 'k_forge', gen: 'k_gen', refRecipe: 'ingot_cobalt',
      machines: ['k_forge', 'k_grower', 'k_workshop', 'k_plasma_oven', 'k_crusher', 'k_synth', 'k_stellar', 'k_chem'],
      ground: [['#363048', '#332d44', '#39334c'], ['#323d4c', '#2f3a49', '#354150']], boulder: '#544a6e', landBase: 2000,
      far: 'L’iridium se trouve loin du Port.',
      port: 'k_port', grid: 'beams', transport: 'tubes', upTech: [null, 'k_up1', 'k_up2'], day: 300 }
  ];
  /** Index of the planet being played (0 = Terre). */
  CO.planetIndex = function () { return (CO.state && CO.state.planet) || 0; };
  /** Planet `k` (default: the one being played). */
  CO.planet = function (k) { return CO.PLANETS[k == null ? CO.planetIndex() : k]; };
  /** Does item / building / research `def` belong on planet `k` (default: the current one)? No `planet` = shared. */
  CO.onPlanet = function (def, k) { return def.planet == null || def.planet === (k == null ? CO.planetIndex() : k); };

  // Lists of what exists on each planet, read through CO.ITEM_ORDER, CO.FLUIDS, CO.BUILD_ORDER and CO.PHASES:
  // they always describe the planet being played.
  const CAT_ORDER = ['Transport', 'Réseau', 'Production', 'Énergie', 'Fluides', 'Autres'];
  const lists = [];
  function listsOf(k) {
    if (lists[k]) return lists[k];
    const items = Object.keys(CO.ITEMS).filter(function (id) { return (CO.ITEMS[id].planet || 0) === k; });
    const builds = Object.keys(CO.BUILDINGS).filter(function (t) { return !CO.BUILDINGS[t].hidden && CO.onPlanet(CO.BUILDINGS[t], k); });
    builds.sort(function (a, b) { return CAT_ORDER.indexOf(CO.BUILDINGS[a].cat) - CAT_ORDER.indexOf(CO.BUILDINGS[b].cat); });
    return (lists[k] = {
      items: items.filter(function (id) { return !CO.ITEMS[id].fluid; }),
      fluids: items.filter(function (id) { return CO.ITEMS[id].fluid; }),
      builds: builds
    });
  }
  /** Items that travel on belts (fluids excluded), on the current planet. */
  Object.defineProperty(CO, 'ITEM_ORDER', { get: function () { return listsOf(CO.planetIndex()).items; } });
  Object.defineProperty(CO, 'FLUIDS', { get: function () { return listsOf(CO.planetIndex()).fluids; } });
  Object.defineProperty(CO, 'BUILD_ORDER', { get: function () { return listsOf(CO.planetIndex()).builds; } });
  Object.defineProperty(CO, 'PHASES', { get: function () { return CO.planet().phases; } });

  /**
   * Phase `i` of planet `k` (default: current). Beyond the planned phases come growing "extensions"; past
   * the planet's last extension the goal is complete: a phase that asks for nothing (`done`).
   */
  CO.getPhase = function (i, k) {
    const P = CO.planet(k), n0 = P.phases.length;
    if (i < n0) return P.phases[i];
    const n = i - n0 + 1;
    if (n > P.maxExt) return { id: 'done', name: P.done, desc: '', need: {}, reward: 0, done: true };
    const menus = P.extMenus;
    const base = menus[(n - 1) % menus.length], need = {};
    const scale = 1 + Math.floor((n - 1) / menus.length) * 0.6 + (n - 1) * 0.15;
    for (const key in base) need[key] = Math.round(base[key] * scale);
    return { id: 'ext' + n, name: 'Extension n° ' + n, desc: P.extDesc, need: need, reward: P.extBase + n * P.extStep, extension: n };
  };
  /** Phase index at which planet `k`'s goal is complete (Infinity when it never is). */
  CO.goalEnd = function (k) { const P = CO.planet(k); return P.phases.length + P.maxExt; };

  // Building upgrades: level 1 (as built), II and III. Speed (or output) and power use grow with the level;
  // each level costs `cost[l]` times the building's price. Only these kinds can be upgraded.
  CO.UPGRADE = {
    speed: [1, 1.5, 2], power: [1, 1.6, 2.4], cost: [0, 2, 4], tech: [null, 'upgrades1', 'upgrades2'],
    kinds: { drill: true, machine: true, pump: true, generator: true }, names: ['I', 'II', 'III']
  };

  // Orbital program: missions done one after another with rockets launched from a launch pad. `need`: payloads
  // to send; `bonus`: permanent effect once done (machine / drill speed, land price, generator output).
  CO.MISSIONS = [
    { id: 'comsat',  name: 'Satellite de communication', desc: 'Un premier relais en orbite basse.',            need: { satellite: 1 },             bonus: { machine: 0.10 }, text: 'Machines +10 %' },
    { id: 'network', name: 'Constellation',              desc: 'Trois satellites pour couvrir toute la planète.', need: { satellite: 3 },           bonus: { drill: 0.20 },   text: 'Foreuses +20 %' },
    { id: 'moon',    name: 'Sondes lunaires',            desc: 'Cartographier la Lune avant de s’y poser.',       need: { probe: 2 },               bonus: { land: -0.20 },   text: 'Terrains −20 %' },
    { id: 'base',    name: 'Base lunaire',               desc: 'Panneaux, relais et sondes : un avant-poste.',     need: { satellite: 4, probe: 2 }, bonus: { power: 0.20 },   text: 'Générateurs +20 %' },
    { id: 'mars',    name: 'Expédition vers Mars',       desc: 'Le grand voyage : la station devient un port interplanétaire.', need: { satellite: 6, probe: 6 }, bonus: { machine: 0.15, drill: 0.15 }, text: 'Machines et foreuses +15 %' }
  ];
  /** Mission `i`; after the planned ones, endless deep-space missions paid in credits. */
  CO.getMission = function (i) {
    if (i < CO.MISSIONS.length) return CO.MISSIONS[i];
    const n = i - CO.MISSIONS.length + 1;
    return { id: 'deep' + n, name: 'Mission profonde n° ' + n, desc: 'Toujours plus loin dans le système solaire.', deep: n,
      need: { satellite: 2 + Math.floor(n / 2), probe: 2 + Math.floor((n + 1) / 2) }, reward: 50000 * n, text: '+' + (50000 * n).toLocaleString('fr-FR') + ' ¢' };
  };

  CO.START_MONEY = 300;

  // Builders: a placed building is only a site until a worker has flown there from the Port and spent
  // BUILD_TIME seconds on it. The game starts with WORKERS.start of them; more can be hired, each one
  // twice the price of the previous.
  CO.BUILD_TIME = {
    belt: 0.2, belt_fast: 0.3, belt_armored: 0.4, splitter: 0.4, merger: 0.4, overflow: 0.4, underflow: 0.4, junction: 0.3,
    sorter_inv: 0.5, underground_in: 0.4, underground_out: 0.4, chest: 0.4, unloader: 0.6,
    launch_pad: 8, drone_hub: 3, drone_provider: 0.5, drone_requester: 0.5, pole: 0.3, pylon: 0.6, generator: 1.2, solar_plant: 2, steam_plant: 4, refinery: 4, pipe: 0.2, pump: 1, oil_well: 2, fluid_tank: 1,
    drill: 0.75, smelter: 1, seller: 1, assembler: 1.5, lab: 1.5, drill_heavy: 2.5, driver: 2.5,
    steelmill: 3, fabricator: 4, spaceyard: 6,
    k_drill: 0.75, k_drill_heavy: 2.5, k_forge: 1, k_grower: 1.5, k_crusher: 1, k_workshop: 1.5, k_plasma_oven: 3, k_synth: 4, k_stellar: 6, k_chem: 4,
    k_gen: 1.2, k_collector: 2, k_turbine: 4, k_extractor: 1, k_well: 2, k_tube: 0.2, k_silo: 1, k_booster: 1.5, k_relay: 2.5, k_accu: 1.5,
    k_lab: 1.5, k_seller: 1, k_prism: 0.3, k_split: 0.5
  };
  CO.WORKERS = { start: 3, max: 12, base: 2500, speed: 8 };   // speed in tiles per second
})(window.CO = window.CO || {});
