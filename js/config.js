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
    // ---- fluids: never on belts, they flow in pipes (see fluid.js)
    water:        { name: 'Eau',               price: 0,   shape: 'drop',    color: '#3f8fe0', accent: '#bfe6ff', fluid: true },
    oil:          { name: 'Pétrole',           price: 0,   shape: 'drop',    color: '#3a3045', accent: '#a08ac0', fluid: true }
  };
  /** Items that travel on belts (fluids excluded). */
  CO.ITEM_ORDER = Object.keys(CO.ITEMS).filter(function (id) { return !CO.ITEMS[id].fluid; });
  CO.FLUIDS = Object.keys(CO.ITEMS).filter(function (id) { return CO.ITEMS[id].fluid; });

  // Ore tile ids used in the ore layer (0 = none).
  CO.ORE_IDS = ['', 'iron_ore', 'copper_ore', 'stone', 'coal', 'sand', 'titanium_ore', 'water', 'oil'];
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
    fuel:         { machine: 'refinery',   in: {},          fin: { oil: 20 }, out: { fuel: 1 },    time: 4, tech: 'oil' }
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
                       desc: 'Reçoit les pièces de la station. Le surplus est revendu.' }
  };
  for (const id in CO.BUILDINGS) CO.BUILDINGS[id].id = id;
  CO.BUILD_ORDER = Object.keys(CO.BUILDINGS).filter(function (k) { return !CO.BUILDINGS[k].hidden; });

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
    drilling4:     { name: 'Forage laser',          desc: 'Foreuses 25 % plus rapides de plus (retour aux cadences d’origine).', cost: { processor: 15, alloy: 30 }, req: ['drilling3', 'processors'], effect: { drillSpeed: 0.25 } }
  };
  for (const id in CO.TECHS) CO.TECHS[id].id = id;

  // ------------------------------------------------------- station phases
  // Phase i draws station part i (see station.js): keep the two lists in the same order.
  CO.PHASES = [
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

  /** Phase `i`; beyond the planned phases, endless growing "extensions" are generated. */
  CO.getPhase = function (i) {
    if (i < CO.PHASES.length) return CO.PHASES[i];
    const n = i - CO.PHASES.length + 1;
    const menus = [
      { kit: 8, solar: 8, steel: 30 },
      { thruster: 6, hull: 16, processor: 8 },
      { tank: 8, core: 3, battery: 20 },
      { probe: 2, alloy: 30, solar: 10 },
      { processor: 14, kit: 8, glass: 40 },
      { core: 5, thruster: 6, tank: 8 }
    ];
    const base = menus[(n - 1) % menus.length], need = {};
    const scale = 1 + Math.floor((n - 1) / menus.length) * 0.6 + (n - 1) * 0.15;
    for (const k in base) need[k] = Math.round(base[k] * scale);
    return { id: 'ext' + n, name: 'Extension n° ' + n, desc: 'La station grandit : de nouveaux modules sont commandés.', need: need, reward: 4000 + n * 500, extension: n };
  };

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
    steelmill: 3, fabricator: 4, spaceyard: 6
  };
  CO.WORKERS = { start: 3, max: 12, base: 2500, speed: 8 };   // speed in tiles per second
})(window.CO = window.CO || {});
