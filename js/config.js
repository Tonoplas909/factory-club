/*
 * config.js — all static game data: items, recipes, buildings, research tree
 * and station construction phases. Gameplay balance lives here.
 * Identifiers are English; player-facing strings are French.
 */
(function (CO) {
  'use strict';

  CO.TILE = 16;            // sprite size of one tile (pixels)
  CO.MAP_W = 96;
  CO.MAP_H = 64;
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
    thruster:     { name: 'Propulseur',        price: 150, shape: 'nozzle',  color: '#d95a5a', accent: '#ffd24a' }
  };
  CO.ITEM_ORDER = Object.keys(CO.ITEMS);

  // Ore tile ids used in the ore layer (0 = none).
  CO.ORE_IDS = ['', 'iron_ore', 'copper_ore', 'stone', 'coal', 'sand'];

  // ------------------------------------------------------------- recipes
  // `machine`: building type that can run it. `tech`: research needed (null = from the start).
  // Output item id == recipe id.
  CO.RECIPES = {
    ingot_iron:   { machine: 'smelter',    in: { iron_ore: 1 },   out: { ingot_iron: 1 },   time: 2, tech: null },
    ingot_copper: { machine: 'smelter',    in: { copper_ore: 1 }, out: { ingot_copper: 1 }, time: 2, tech: null },
    brick:        { machine: 'smelter',    in: { stone: 1 },      out: { brick: 1 },        time: 2, tech: null },
    glass:        { machine: 'smelter',    in: { sand: 1 },       out: { glass: 1 },        time: 2, tech: null },
    plate:        { machine: 'assembler',  in: { ingot_iron: 1 }, out: { plate: 1 },        time: 2, tech: null },
    gear:         { machine: 'assembler',  in: { ingot_iron: 2 }, out: { gear: 1 },         time: 2, tech: null },
    wire:         { machine: 'assembler',  in: { ingot_copper: 1 }, out: { wire: 2 },       time: 2, tech: null },
    circuit:      { machine: 'assembler',  in: { wire: 2, plate: 1 }, out: { circuit: 1 },   time: 3, tech: 'electronics' },
    steel:        { machine: 'steelmill',  in: { ingot_iron: 2, coal: 1 }, out: { steel: 1 }, time: 4, tech: 'metallurgy' },
    silicon:      { machine: 'steelmill',  in: { sand: 2, coal: 1 },       out: { silicon: 1 }, time: 4, tech: 'metallurgy' },
    hull:         { machine: 'fabricator', in: { steel: 2, brick: 1 },     out: { hull: 1 },  time: 4, tech: 'advanced' },
    solar:        { machine: 'fabricator', in: { silicon: 2, glass: 1, circuit: 1 }, out: { solar: 1 }, time: 5, tech: 'photovoltaics' },
    kit:          { machine: 'fabricator', in: { hull: 2, circuit: 1, gear: 1 },     out: { kit: 1 },   time: 6, tech: 'modules' },
    thruster:     { machine: 'fabricator', in: { steel: 3, circuit: 2, gear: 1 },    out: { thruster: 1 }, time: 6, tech: 'propulsion' }
  };
  for (const id in CO.RECIPES) CO.RECIPES[id].id = id;

  // ----------------------------------------------------------- buildings
  // kind: behaviour (see sim.js). cat: palette category. tech: research needed (null = from the start).
  CO.BUILDINGS = {
    belt:            { name: 'Convoyeur',            cat: 'Transport',  kind: 'belt',        w: 1, h: 1, cost: 1,   speed: 1.6, tech: null,
                       desc: 'Transporte les objets dans le sens de la flèche. Glisse pour en poser plusieurs.' },
    belt_fast:       { name: 'Convoyeur rapide',     cat: 'Transport',  kind: 'belt',        w: 1, h: 1, cost: 3,   speed: 3.2, tech: 'fast_belt',
                       desc: 'Deux fois plus rapide qu’un convoyeur de base.' },
    splitter:        { name: 'Séparateur',           cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 12,  tech: 'logistics1',
                       desc: 'Entrée par l’arrière, sortie répartie devant, à gauche et à droite. Peut recevoir un filtre : l’objet filtré sort tout droit.' },
    merger:          { name: 'Fusion',               cat: 'Transport',  kind: 'router',      w: 1, h: 1, cost: 10,  tech: 'logistics1',
                       desc: 'Fusionne jusqu’à trois flux (arrière, gauche, droite) vers une seule sortie devant.' },
    underground_in:  { name: 'Entrée souterraine',   cat: 'Transport',  kind: 'tunnel_in',   w: 1, h: 1, cost: 15,  tech: 'tunnels',
                       desc: 'Plonge sous les autres lignes. Portée : 4 cases jusqu’à une sortie de même direction.' },
    underground_out: { name: 'Sortie souterraine',   cat: 'Transport',  kind: 'tunnel_out',  w: 1, h: 1, cost: 15,  tech: 'tunnels',
                       desc: 'Fait ressortir les objets d’une entrée souterraine alignée.' },
    chest:           { name: 'Coffre tampon',        cat: 'Transport',  kind: 'chest',       w: 1, h: 1, cost: 30,  tech: 'storage', capacity: 300,
                       desc: 'Stocke jusqu’à 300 objets pour lisser la production. Sort par la flèche.' },
    drill:           { name: 'Foreuse',              cat: 'Production', kind: 'drill',       w: 2, h: 2, cost: 40,  tech: null, perTile: 0.2,
                       desc: 'À poser sur un gisement : extrait 0,2 minerai/s par case couverte. Sort par la flèche.' },
    drill_heavy:     { name: 'Foreuse lourde',       cat: 'Production', kind: 'drill',       w: 3, h: 3, cost: 180, tech: 'heavy_drill', perTile: 0.22,
                       desc: 'Grande foreuse 3×3 : jusqu’à 9 cases de gisement.' },
    smelter:         { name: 'Fonderie',             cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 60,  tech: null,
                       desc: 'Fond minerais, pierre et sable en lingots, briques et verre. La recette se choisit seule.' },
    assembler:       { name: 'Atelier',              cat: 'Production', kind: 'machine',     w: 2, h: 2, cost: 90,  tech: null,
                       desc: 'Fabrique plaques, engrenages, fils et circuits. Clique dessus pour choisir la recette.' },
    steelmill:       { name: 'Haut-fourneau',        cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 220, tech: 'metallurgy',
                       desc: 'Produit acier et silicium.' },
    fabricator:      { name: 'Fabrique orbitale',    cat: 'Production', kind: 'machine',     w: 3, h: 3, cost: 380, tech: 'advanced',
                       desc: 'Assemble les pièces avancées de la station.' },
    lab:             { name: 'Laboratoire',          cat: 'Autres',     kind: 'lab',         w: 2, h: 2, cost: 80,  tech: null,
                       desc: 'Consomme les objets de la recherche en cours (onglet Recherche).' },
    seller:          { name: 'Comptoir de vente',    cat: 'Autres',     kind: 'seller',      w: 2, h: 2, cost: 25,  tech: null,
                       desc: 'Achète tout ce qu’on lui apporte, à prix fixe.' },
    port:            { name: 'Port de la station',   cat: 'Autres',     kind: 'port',        w: 4, h: 4, cost: 0,   tech: null, fixed: true, hidden: true,
                       desc: 'Reçoit les pièces de la station. Le surplus est revendu.' }
  };
  for (const id in CO.BUILDINGS) CO.BUILDINGS[id].id = id;
  CO.BUILD_ORDER = Object.keys(CO.BUILDINGS).filter(function (k) { return !CO.BUILDINGS[k].hidden; });

  // ------------------------------------------------------------ research
  // effect.machineSpeed / effect.drillSpeed are additive bonuses.
  CO.TECHS = {
    logistics1:    { name: 'Aiguillages',           desc: 'Séparateurs et fusions de flux.',            cost: { ingot_iron: 20 }, req: [] },
    storage:       { name: 'Stockage tampon',       desc: 'Coffres pour lisser la production.',         cost: { brick: 15, plate: 10 }, req: ['logistics1'] },
    tunnels:       { name: 'Convoyeurs souterrains', desc: 'Passer sous les autres lignes.',            cost: { gear: 10, ingot_copper: 20 }, req: ['logistics1'] },
    fast_belt:     { name: 'Convoyeurs rapides',    desc: 'Des lignes deux fois plus rapides.',         cost: { gear: 25, wire: 20 }, req: ['logistics1'] },
    automation1:   { name: 'Automatisation I',      desc: 'Machines 25 % plus rapides.',                cost: { gear: 20, plate: 20 }, req: [], effect: { machineSpeed: 0.25 } },
    drilling1:     { name: 'Forage renforcé',       desc: 'Foreuses 50 % plus rapides.',                cost: { plate: 20, gear: 10, ingot_iron: 20 }, req: [], effect: { drillSpeed: 0.5 } },
    electronics:   { name: 'Électronique',          desc: 'Recette du circuit.',                        cost: { wire: 30, plate: 15 }, req: [] },
    heavy_drill:   { name: 'Foreuse lourde',        desc: 'Foreuse 3×3 pour les grands gisements.',     cost: { circuit: 15, plate: 40 }, req: ['electronics', 'drilling1'] },
    metallurgy:    { name: 'Métallurgie',           desc: 'Haut-fourneau : acier et silicium.',         cost: { plate: 30, brick: 30, gear: 15, ingot_copper: 20 }, req: ['automation1'] },
    advanced:      { name: 'Assemblage avancé',     desc: 'Fabrique orbitale et plaques de coque.',     cost: { steel: 20, circuit: 20 }, req: ['metallurgy', 'electronics'] },
    photovoltaics: { name: 'Photovoltaïque',        desc: 'Recette du panneau solaire.',                cost: { silicon: 20, glass: 20 }, req: ['advanced'] },
    modules:       { name: 'Modules habitables',    desc: 'Recette du kit modulaire.',                  cost: { hull: 15, circuit: 20 }, req: ['advanced'] },
    propulsion:    { name: 'Propulsion',            desc: 'Recette du propulseur.',                     cost: { steel: 30, circuit: 30, gear: 20 }, req: ['advanced'] },
    automation2:   { name: 'Automatisation II',     desc: 'Machines 35 % plus rapides.',                cost: { steel: 30, circuit: 30 }, req: ['advanced'], effect: { machineSpeed: 0.35 } },
    drilling2:     { name: 'Forage profond',        desc: 'Foreuses 50 % plus rapides.',                cost: { steel: 20, circuit: 20 }, req: ['drilling1', 'metallurgy'], effect: { drillSpeed: 0.5 } }
  };
  for (const id in CO.TECHS) CO.TECHS[id].id = id;

  // ------------------------------------------------------- station phases
  // Each phase adds a visible part to the station (see station.js). Demand grows with every step.
  CO.PHASES = [
    { id: 'frame',   name: 'Armature centrale',      desc: 'La poutre et le moyeu de la station.',          need: { plate: 30, gear: 20 },                      reward: 150 },
    { id: 'habitat', name: 'Cabine de vie',          desc: 'Un premier module pressurisé pour l’équipage.',  need: { brick: 30, glass: 30, plate: 20 },          reward: 200 },
    { id: 'power',   name: 'Réseau électrique',      desc: 'Câblage et nœuds de distribution.',             need: { circuit: 25, wire: 40 },                    reward: 300 },
    { id: 'hull',    name: 'Coque renforcée',        desc: 'Blindage contre les micrométéorites.',          need: { steel: 40, brick: 20 },                     reward: 400 },
    { id: 'solar',   name: 'Ailes solaires',         desc: 'Deux grandes ailes pour capter la lumière.',    need: { solar: 12, circuit: 20 },                   reward: 600 },
    { id: 'ring',    name: 'Anneau d’habitation',    desc: 'Un anneau tournant pour vivre confortablement.', need: { kit: 10, hull: 20 },                        reward: 800 },
    { id: 'engines', name: 'Propulseurs',            desc: 'Pour quitter la surface et rejoindre l’orbite.', need: { thruster: 8, steel: 40 },                   reward: 1000 },
    { id: 'launch',  name: 'Mise en orbite',         desc: 'Dernière étape : allumer la station !',         need: { kit: 15, solar: 15, thruster: 10, circuit: 40 }, reward: 2000 }
  ];

  /** Phase `i`; beyond the planned phases, endless growing "extensions" are generated. */
  CO.getPhase = function (i) {
    if (i < CO.PHASES.length) return CO.PHASES[i];
    const n = i - CO.PHASES.length + 1;
    const menus = [
      { kit: 6, solar: 6, steel: 20 },
      { thruster: 4, hull: 12, circuit: 20 },
      { solar: 8, kit: 6, glass: 30 },
      { hull: 16, steel: 30, thruster: 4 }
    ];
    const base = menus[(n - 1) % menus.length], need = {};
    const scale = 1 + Math.floor((n - 1) / menus.length) * 0.6 + (n - 1) * 0.15;
    for (const k in base) need[k] = Math.round(base[k] * scale);
    return { id: 'ext' + n, name: 'Extension n° ' + n, desc: 'La station grandit : de nouveaux modules sont commandés.', need: need, reward: 1200 + n * 300, extension: n };
  };

  CO.START_MONEY = 200;
})(window.CO = window.CO || {});
