/*
 * state.js — game state (money, research, station progress), progression rules
 * and persistence (localStorage autosave + file export/import).
 */
(function (CO) {
  'use strict';

  CO.mods = { machine: 1, drill: 1, chest: 0, land: 1, power: 1 };   // research bonuses (speed multipliers, extra chest capacity)
  CO.cam = { x: CO.MAP_CX, y: CO.MAP_CY, zoom: 32 };  // camera centre (tiles) and zoom (CSS px per tile)

  // --------------------------------------------------------------- land
  /** Plot index of cell (x, y). */
  CO.plotOf = function (x, y) { return Math.floor((y + CO.PLOT_OY) / CO.PLOT) * CO.PLOTS_W + Math.floor((x + CO.PLOT_OX) / CO.PLOT); };
  /** Cells covered by plot `p` (inclusive bounds, clipped to the map). */
  CO.plotRect = function (p) {
    const px = p % CO.PLOTS_W, py = Math.floor(p / CO.PLOTS_W);
    const x0 = px * CO.PLOT - CO.PLOT_OX, y0 = py * CO.PLOT - CO.PLOT_OY;
    return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(CO.MAP_W - 1, x0 + CO.PLOT - 1), y1: Math.min(CO.MAP_H - 1, y0 + CO.PLOT - 1) };
  };
  /** The 3×3 plots around the Port, owned from the start. */
  CO.startLand = function () {
    const land = new Array(CO.PLOTS_W * CO.PLOTS_H).fill(0), c = CO.plotOf(CO.MAP_CX, CO.MAP_CY);
    const cx = c % CO.PLOTS_W, cy = Math.floor(c / CO.PLOTS_W);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) land[(cy + j) * CO.PLOTS_W + cx + i] = 1;
    return land;
  };
  CO.ownsCell = function (x, y) { return CO.state.land[CO.plotOf(x, y)] === 1; };
  /** Price of the next plot (or of the n-th bought one): LAND_BASE × LAND_GROWTH^n, two significant digits. */
  CO.landPrice = function (n) {
    const p = CO.planet().landBase * Math.pow(CO.LAND_GROWTH, n == null ? CO.state.landBought : n) * (CO.mods && CO.mods.land || 1), m = Math.pow(10, Math.floor(Math.log10(p)) - 1);
    return Math.round(p / m) * m;
  };
  /** A plot can be bought when it is not owned yet and touches owned land (by a side). */
  CO.plotBuyable = function (p) {
    const land = CO.state.land, px = p % CO.PLOTS_W, py = Math.floor(p / CO.PLOTS_W);
    if (land[p]) return false;
    return (px > 0 && land[p - 1] === 1) || (px < CO.PLOTS_W - 1 && land[p + 1] === 1) ||
      (py > 0 && land[p - CO.PLOTS_W] === 1) || (py < CO.PLOTS_H - 1 && land[p + CO.PLOTS_W] === 1);
  };
  /** Buy plot `p`. Returns '' on success, else the reason it failed. */
  CO.buyPlot = function (p) {
    const st = CO.state, price = CO.landPrice();
    if (!CO.plotBuyable(p)) return st.land[p] ? 'Déjà à toi' : 'Ce terrain doit toucher le tien';
    if (st.money < price) return 'Pas assez d’argent';
    st.money -= price; st.land[p] = 1; st.landBought++;
    CO.emit('land');
    return '';
  };
  // ------------------------------------------------------------ workers
  /** Price of the next worker (null when the crew is full). */
  CO.workerPrice = function () {
    const w = CO.WORKERS, n = CO.state.workers;
    return n >= w.max ? null : w.base * Math.pow(2, n - w.start);
  };
  /** Hire one more worker. Returns '' on success, else the reason it failed. */
  CO.hireWorker = function () {
    const price = CO.workerPrice();
    if (price == null) return 'Équipe au complet';
    if (CO.state.money < price) return 'Pas assez d’argent';
    CO.state.money -= price; CO.state.workers++;
    CO.emit('workers');
    return '';
  };

  /** Ore cells of each type inside plot `p`: {itemId: cells}. */
  CO.plotOre = function (p) {
    const r = CO.plotRect(p), out = {};
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const o = CO.world.oreAt(x, y);
      if (o) { const id = CO.ORE_IDS[o]; out[id] = (out[id] || 0) + 1; }
    }
    return out;
  };

  function freshState(seed) {
    return {
      v: 1,
      seed: seed,
      money: CO.START_MONEY,
      tech: {},              // unlocked research ids
      research: null,        // active research id
      researchProg: {},      // delivered items for the active research
      researchBank: {},      // lab reserve: items delivered ahead for research not started yet
      researchQueue: [],     // research ids to start automatically, in order
      phase: 0,             // current station phase index
      phaseHave: {},         // delivered items for the current phase
      stats: { produced: {}, sold: 0, delivered: 0 },
      time: 0,               // simulated seconds
      lastRecipe: {},        // remembered recipe per machine type
      land: CO.startLand(),  // 1 per owned plot (index = row * PLOTS_W + column)
      landBought: 0,         // plots bought so far (sets the price of the next one)
      workers: CO.WORKERS.start,  // builders flying out of the Port to build the sites
      contracts: null,            // Port contracts (contracts.js), created when first needed
      orbit: { mission: 0, have: {}, launches: 0 },  // orbital program (orbit.js)
      // Planets: the fields above that belong to a place (land, phase, factory, contracts, research under
      // way) describe the planet being played; the others wait in `planets[k]` (see packPlanet).
      planet: 0,             // index in CO.PLANETS
      planets: [],           // packed state of the planets not being played (null: never visited)
      reached: 0             // highest planet index the player may travel to
    };
  }
  CO.state = freshState(1);

  // ------------------------------------------------------------ unlocks
  /** Bonuses of the planet being played: its own research only, and the orbital program on the Terre. */
  CO.recalcMods = function () {
    let m = 0, d = 0, c = 0;
    for (const id in CO.state.tech) {
      const t = CO.TECHS[id];
      if (t && t.effect && CO.onPlanet(t)) { m += t.effect.machineSpeed || 0; d += t.effect.drillSpeed || 0; c += t.effect.chestCap || 0; }
    }
    const ob = CO.orbitBonus && CO.planetIndex() === 0 ? CO.orbitBonus() : {};
    m += ob.machine || 0; d += ob.drill || 0;
    CO.mods.machine = 1 + m; CO.mods.drill = 1 + d; CO.mods.chest = c;
    CO.mods.land = 1 + (ob.land || 0); CO.mods.power = 1 + (ob.power || 0);
  };
  /** Capacity of a buffer chest with current research. */
  CO.chestCap = function (def) { return def.capacity + CO.mods.chest; };
  CO.isBuildingUnlocked = function (type) {
    const def = CO.BUILDINGS[type], t = def.tech;
    return !t || !!CO.state.tech[t] || (!!def.techAlt && !!CO.state.tech[def.techAlt]);
  };
  CO.isRecipeUnlocked = function (id) {
    const t = CO.RECIPES[id].tech;
    return !t || !!CO.state.tech[t];
  };
  CO.isTechAvailable = function (id) {
    const t = CO.TECHS[id];
    for (let i = 0; i < t.req.length; i++) if (!CO.state.tech[t.req[i]]) return false;
    return true;
  };
  /** Recipes (unlocked) a machine type can run. */
  CO.recipesFor = function (machineType) {
    const out = [];
    for (const id in CO.RECIPES) if (CO.RECIPES[id].machine === machineType) out.push(CO.RECIPES[id]);
    return out;
  };
  /** Is some unlocked recipe able to craft `item`? (raw items: always true) */
  CO.isItemCraftable = function (item) {
    const r = CO.RECIPES[item];
    return !r || CO.isRecipeUnlocked(item);
  };

  /** Items per second mined by a drill (covered tiles / footprint × full-coverage rate × research). */
  CO.drillRate = function (b) { return b.ore ? b.n / (b.w * b.h) * b.def.rate * CO.mods.drill * CO.lvlSpeed(b) : 0; };
  // ------------------------------------------------------------ upgrades
  /** Speed (or output) factor of building `b` from its level. */
  CO.lvlSpeed = function (b) { return CO.UPGRADE.speed[(b.lvl || 1) - 1]; };
  /** Power use factor of building `b` from its level. */
  CO.lvlPower = function (b) { return CO.UPGRADE.power[(b.lvl || 1) - 1]; };
  /** Credits spent on the levels above I of a `type` building at level `lvl`. */
  CO.levelSpent = function (type, lvl) {
    let s = 0;
    for (let l = 1; l < (lvl || 1); l++) s += CO.UPGRADE.cost[l] * CO.BUILDINGS[type].cost;
    return s;
  };
  /** Full price of a `type` building at level `lvl` (what placing it costs, what removing it refunds). */
  CO.fullCost = function (type, lvl) { return CO.BUILDINGS[type].cost + CO.levelSpent(type, lvl); };
  CO.canUpgradeKind = function (b) { return !!CO.UPGRADE.kinds[b.kind] && !b.def.fixed; };
  /** Next level of `b` if it can be upgraded now (research done), or 0. */
  CO.nextLevel = function (b) {
    if (!CO.canUpgradeKind(b) || b.site) return 0;
    const l = (b.lvl || 1) + 1;
    if (l > CO.UPGRADE.speed.length) return 0;
    return CO.state.tech[CO.upgradeTech(l)] ? l : 0;
  };
  /** Research that opens upgrade level `l` (2 or 3) on the current planet. */
  CO.upgradeTech = function (l) { return CO.planet().upTech[l - 1]; };
  /** Price of the next level of `b`. */
  CO.upgradePrice = function (b) { return CO.UPGRADE.cost[b.lvl || 1] * b.def.cost; };
  /** Seconds one craft takes with current research. */
  CO.craftTime = function (rec) { return rec.time / CO.mods.machine; };
  /** How many crafts of `rec` one machine runs at once: a crucible's batch, a crystalliser's pods, else 1. */
  CO.machineMult = function (rec) { const d = CO.BUILDINGS[rec.machine]; return d.mode === 'kiln' ? d.batch : d.mode === 'grower' ? d.slots : 1; };
  /** `item` per second made by one machine running `rec` without a break (a crystalliser: at night). */
  CO.machineRate = function (rec, item) { return rec.out[item] * CO.machineMult(rec) / CO.craftTime(rec); };
  /** Short French note on how a machine of `rec` works, or ''. */
  CO.machineNote = function (rec) {
    const d = CO.BUILDINGS[rec.machine];
    if (d.mode === 'kiln') return 'fournée de ' + d.batch + ' à ' + CO.fmt(rec.temp) + '°';
    if (d.mode === 'grower') return d.slots + ' cristaux à la fois, la nuit';
    return rec.cat ? 'use un ' + CO.ITEMS[rec.cat].name.toLowerCase() + ' toutes les ' + d.catUses + ' pièces' : '';
  };

  // -------------------------------------------------------------- money
  CO.addMoney = function (n) {
    CO.state.money += n;
    if (n > 0) { CO.state.stats.sold += n; CO.sim.countIncome(n); }
  };

  // ----------------------------------------------------------- research
  /**
   * Start research `id` (null = stop). What the labs already absorbed for the previous research goes
   * back to the lab reserve, and the new research is first paid from that reserve.
   */
  CO.setResearch = function (id) {
    const st = CO.state;
    if (id && (!CO.TECHS[id] || st.tech[id] || !CO.isTechAvailable(id) || !CO.onPlanet(CO.TECHS[id]))) return false;
    if (st.research !== id) {
      for (const k in st.researchProg) st.researchBank[k] = (st.researchBank[k] || 0) + st.researchProg[k];
      st.research = id; st.researchProg = {};
      if (id) {
        const cost = CO.TECHS[id].cost;
        for (const k in cost) {
          const take = Math.min(cost[k], st.researchBank[k] || 0);
          if (take) { st.researchProg[k] = take; st.researchBank[k] -= take; if (!st.researchBank[k]) delete st.researchBank[k]; }
        }
      }
      CO.sanitizeQueue();
      if (id && CO.researchDone()) { CO.completeResearch(); return true; }   // fully paid by the reserve
    }
    CO.emit('research');
    return true;
  };

  /** Free room in the lab reserve for `item`: what research not done (nor active) still needs, minus the stock. */
  CO.bankRoom = function (item) {
    const st = CO.state;
    let n = 0;
    for (const id in CO.TECHS) if (!st.tech[id] && id !== st.research) n += CO.TECHS[id].cost[item] || 0;
    return n - (st.researchBank[item] || 0);
  };

  // ------------------------------------------------------- research queue
  /** Keep only queued research that is not done/active and whose prerequisites come earlier. */
  CO.sanitizeQueue = function () {
    const st = CO.state, ok = {}, out = [];
    for (const id in st.tech) ok[id] = true;
    if (st.research) ok[st.research] = true;
    st.researchQueue.forEach(function (id) {
      const t = CO.TECHS[id];
      if (!t || ok[id]) return;
      for (let i = 0; i < t.req.length; i++) if (!ok[t.req[i]]) return;
      ok[id] = true; out.push(id);
    });
    st.researchQueue = out;
  };
  /** Can `id` be appended to the queue (prerequisites done, active or queued)? */
  CO.canQueue = function (id) {
    const st = CO.state, t = CO.TECHS[id];
    if (!t || !CO.onPlanet(t) || st.tech[id] || st.research === id || st.researchQueue.indexOf(id) >= 0) return false;
    for (let i = 0; i < t.req.length; i++) {
      const r = t.req[i];
      if (!st.tech[r] && st.research !== r && st.researchQueue.indexOf(r) < 0) return false;
    }
    return true;
  };
  /** Add to the queue, or start it at once when nothing is being researched. */
  CO.queueResearch = function (id) {
    const st = CO.state;
    if (!st.research && CO.isTechAvailable(id) && !st.tech[id]) return CO.setResearch(id);
    if (!CO.canQueue(id)) return false;
    st.researchQueue.push(id);
    CO.emit('research');
    return true;
  };
  /** Remove from the queue (research that depended on it goes too). */
  CO.unqueueResearch = function (id) {
    const st = CO.state, i = st.researchQueue.indexOf(id);
    if (i < 0) return;
    st.researchQueue.splice(i, 1);
    CO.sanitizeQueue();
    CO.emit('research');
  };
  /** Start the first queued research that can start. Returns its id or null. */
  CO.startNextResearch = function () {
    const st = CO.state;
    CO.sanitizeQueue();
    for (let i = 0; i < st.researchQueue.length; i++) {
      const id = st.researchQueue[i];
      if (CO.isTechAvailable(id)) { CO.setResearch(id); return id; }
    }
    return null;
  };
  CO.researchDone = function () {
    const st = CO.state, t = CO.TECHS[st.research];
    if (!t) return false;
    for (const k in t.cost) if ((st.researchProg[k] || 0) < t.cost[k]) return false;
    return true;
  };
  CO.completeResearch = function () {
    const st = CO.state, id = st.research;
    st.tech[id] = true; st.research = null; st.researchProg = {};
    CO.recalcMods();
    CO.emit('toast', 'Recherche terminée : ' + CO.TECHS[id].name, 'good');
    CO.emit('research'); CO.emit('unlock');
    const next = CO.startNextResearch();                // the queue keeps the labs busy
    if (next && CO.state.research === next) CO.emit('toast', 'Recherche suivante (file d’attente) : ' + CO.TECHS[next].name, 'info');
  };

  // ------------------------------------------------------ station phases
  CO.phaseDone = function () {
    const st = CO.state, p = CO.getPhase(st.phase);
    for (const k in p.need) if ((st.phaseHave[k] || 0) < p.need[k]) return false;
    return true;
  };
  CO.completePhase = function () {
    const st = CO.state, p = CO.getPhase(st.phase);
    st.money += p.reward;            // bonus is not counted as sales income (keeps the income/min gauge honest)
    st.phase++; st.phaseHave = {};
    if (st.phase >= CO.goalEnd() && st.planet + 1 < CO.PLANETS.length) st.reached = Math.max(st.reached, st.planet + 1);
    CO.emit('phase', st.phase - 1, p);
  };

  /** Light of the planet's star, 0 (night) to 1 (full day): Kéora's days are short. */
  CO.daylight = function () {
    const day = CO.planet().day;
    if (!day) return 1;
    return CO.clamp(0.35 + 0.9 * Math.sin((CO.state.time % day) / day * Math.PI * 2), 0, 1);
  };

  // ------------------------------------------------------------ planets
  /** May the player go to planet `k`? */
  CO.planetOpen = function (k) { return k >= 0 && k < CO.PLANETS.length && k <= CO.state.reached; };
  /** Has planet `k` been played at least once? */
  CO.planetVisited = function (k) { const st = CO.state; return k === st.planet || !!st.planets[k]; };
  /** Station phase reached on planet `k`. */
  CO.planetPhase = function (k) { const st = CO.state; return k === st.planet ? st.phase : st.planets[k] ? st.planets[k].phase || 0 : 0; };

  /** What stays behind on the planet being left (all plain data, saved as is). */
  function packPlanet() {
    const st = CO.state;
    return {
      buildings: CO.world.serialize(), cam: { x: CO.cam.x, y: CO.cam.y, zoom: CO.cam.zoom },
      land: st.land.reduce(function (a, v, i) { if (v) a.push(i); return a; }, []), landBought: st.landBought,
      phase: st.phase, phaseHave: st.phaseHave, research: st.research, researchQueue: st.researchQueue,
      contracts: st.contracts || null, leftAt: st.time
    };
  }
  /**
   * Make planet `k` the one being played, from its packed state `pk` (null: first landing, an empty map
   * with only its Port). The map is regenerated from the game seed, then the factory is rebuilt.
   */
  function unpackPlanet(k, pk) {
    const st = CO.state;
    pk = pk && typeof pk === 'object' ? pk : {};
    st.planet = k;
    st.land = CO.startLand();
    if (Array.isArray(pk.land)) pk.land.forEach(function (p) { p = p | 0; if (p >= 0 && p < st.land.length) st.land[p] = 1; });
    st.landBought = Math.max(0, Math.floor(pk.landBought) || 0);
    st.phase = Math.max(0, Math.floor(pk.phase) || 0);
    st.phaseHave = counts(pk.phaseHave);
    st.research = null; st.researchProg = {};
    st.researchQueue = Array.isArray(pk.researchQueue) ? pk.researchQueue.filter(function (id) { return CO.TECHS[id] && CO.onPlanet(CO.TECHS[id], k); }) : [];
    st.contracts = CO.contracts.restore(pk.contracts);
    const away = isFinite(pk.leftAt) ? Math.max(0, st.time - pk.leftAt) : 0;      // contract clocks stop while away
    if (away) { st.contracts.next += away; st.contracts.active.forEach(function (a) { a.deadline += away; }); }
    CO.recalcMods();
    CO.world.reset(st.seed, k);
    if (k === 0 && !st.startTitanium) CO.world.clearStartTitanium();
    CO.world.restore(Array.isArray(pk.buildings) ? pk.buildings : []);
    const port = CO.world.port, cam = pk.cam;
    if (cam && isFinite(cam.x) && isFinite(cam.y)) { CO.cam.x = cam.x; CO.cam.y = cam.y; CO.cam.zoom = CO.clamp(cam.zoom || 32, 4, 72); }
    else { CO.cam.x = port.x + port.w / 2; CO.cam.y = port.y + port.h / 2; CO.cam.zoom = 32; }
    CO.sanitizeQueue();
    if (pk.research && CO.TECHS[pk.research] && !st.tech[pk.research] && CO.onPlanet(CO.TECHS[pk.research], k)) CO.setResearch(pk.research);
  }
  /**
   * Travel to planet `k`. The planet being left is frozen as it is (machines, belts, stocks, sites); the
   * research under way goes back to the lab reserve and starts again on return. Returns true on success.
   */
  CO.travel = function (k) {
    const st = CO.state;
    if (k === st.planet || !CO.planetOpen(k)) return false;
    const paused = st.research;
    CO.setResearch(null);
    const pk = packPlanet();
    pk.research = paused;
    st.planets[st.planet] = pk;
    const arriving = st.planets[k] || null, first = !arriving;
    st.planets[k] = null;
    unpackPlanet(k, arriving);
    CO.history.clear();
    CO.emit('loaded');
    CO.emit('travel', k, first);
    return true;
  };

  // --------------------------------------------------------- persistence
  const SAVE_REV = 8;          // 6: 480×320 map (older saves are moved to its centre); 7: electricity; 8: planets
  let warned = false;
  function snapshot() {
    const st = CO.state;
    return {
      v: 1, savedAt: Date.now(),
      state: {
        seed: st.seed, money: st.money, tech: st.tech, research: st.research, researchProg: st.researchProg,
        researchBank: st.researchBank, researchQueue: st.researchQueue,
        phase: st.phase, phaseHave: st.phaseHave, stats: st.stats, time: st.time, lastRecipe: st.lastRecipe,
        land: st.land.reduce(function (a, v, i) { if (v) a.push(i); return a; }, []), landBought: st.landBought,
        startTitanium: st.startTitanium || undefined, workers: st.workers, contracts: st.contracts || undefined, orbit: st.orbit,
        planet: st.planet, planets: st.planets, reached: st.reached, rev: SAVE_REV
      },
      cam: { x: CO.cam.x, y: CO.cam.y, zoom: CO.cam.zoom },
      buildings: CO.world.serialize()
    };
  }
  /** {item: count} read from a save: unknown items and non-positive counts are dropped. */
  function counts(o) {
    const out = {};
    if (o && typeof o === 'object') for (const k in o) if (CO.ITEMS[k] && o[k] > 0) out[k] = Math.floor(o[k]);
    return out;
  }
  /** Apply a snapshot to the live game. Throws on invalid data. */
  function applySnapshot(data) {
    if (!data || data.v !== 1 || !data.state || !Array.isArray(data.buildings)) throw new Error('format');
    const s = data.state, st = freshState(Number(s.seed) || 1);
    st.money = isFinite(s.money) ? Math.max(0, s.money) : CO.START_MONEY;
    st.tech = {}; for (const k in (s.tech || {})) if (CO.TECHS[k]) st.tech[k] = true;
    st.research = (s.research && CO.TECHS[s.research] && !st.tech[s.research]) ? s.research : null;
    st.researchProg = st.research ? counts(s.researchProg) : {};
    // rev 4: lab reserve and research queue (older saves simply start with both empty).
    st.researchBank = counts(s.researchBank);
    st.researchQueue = Array.isArray(s.researchQueue) ? s.researchQueue.filter(function (id) { return CO.TECHS[id]; }) : [];
    st.phase = Math.max(0, Math.floor(s.phase) || 0);
    st.phaseHave = s.phaseHave || {};
    if (!s.rev) {                            // saves made before the 16-step station had 8 steps: map them across
      st.phase = st.phase < 8 ? st.phase * 2 : st.phase + 8; st.phaseHave = {};
    }
    const legacyMap = !(s.rev >= 3);         // before the big map: the old 96×64 world is now centred in the new one
    st.stats = { produced: (s.stats && s.stats.produced) || {}, sold: (s.stats && s.stats.sold) || 0, delivered: (s.stats && s.stats.delivered) || 0 };
    st.time = Number(s.time) || 0;
    st.lastRecipe = s.lastRecipe || {};
    // rev 8: planets. The top-level land, phase, research, contracts, camera and buildings are those of the
    // planet being played; the other planets are kept packed as they were saved.
    const pl = Math.floor(s.planet) || 0;
    st.planet = pl > 0 && pl < CO.PLANETS.length ? pl : 0;
    st.planets = [];
    for (let k = 0; k < CO.PLANETS.length; k++) {
      const pk = Array.isArray(s.planets) ? s.planets[k] : null;
      st.planets[k] = k !== st.planet && pk && typeof pk === 'object' ? pk : null;
    }
    st.reached = CO.clamp(Math.floor(s.reached) || 0, st.planet, CO.PLANETS.length - 1);
    if (st.research && !CO.onPlanet(CO.TECHS[st.research], st.planet)) {
      for (const k in st.researchProg) st.researchBank[k] = (st.researchBank[k] || 0) + st.researchProg[k];
      st.research = null; st.researchProg = {};
    }
    st.researchQueue = st.researchQueue.filter(function (id) { return CO.onPlanet(CO.TECHS[id], st.planet); });
    CO.state = st;
    // A goal complete from before the planets (endless extensions) opens the next planet.
    for (let k = 0; k + 1 < CO.PLANETS.length; k++) if (CO.planetPhase(k) >= CO.goalEnd(k)) st.reached = Math.max(st.reached, k + 1);
    CO.recalcMods();
    CO.sanitizeQueue();
    CO.world.reset(st.seed, st.planet);
    // Older maps are centred in this one: the 96×64 map (rev < 3), then the 240×160 map (rev 3 to 5).
    const prevMap = !legacyMap && !(s.rev >= 6);
    const ox = legacyMap ? CO.LEGACY_OX : prevMap ? CO.PREV_OX : 0, oy = legacyMap ? CO.LEGACY_OY : prevMap ? CO.PREV_OY : 0;
    if (ox || oy) data.buildings.forEach(function (o) { o.x += ox; o.y += oy; });
    // rev 5: land plots (set before the buildings come back: placement checks ownership). Older saves keep
    // the start plots plus, for free, every plot that already holds a building, and the titanium that the
    // start area used to have (new games have none there: titanium is a reason to buy land).
    if (Array.isArray(s.land)) {
      // a rev 5 save numbered its plots on the 240×160 map (15 columns, grid shifted 8 rows): same plots,
      // moved with the map
      const PW = prevMap ? 15 : CO.PLOTS_W, n = prevMap ? 15 * 11 : st.land.length;
      s.land.forEach(function (p) {
        p = p | 0;
        if (p < 0 || p >= n) return;
        if (prevMap) p = CO.plotOf((p % PW) * 16 + 8 + ox, Math.floor(p / PW) * 16 - 8 + 8 + oy);
        if (p >= 0 && p < st.land.length) st.land[p] = 1;
      });
      st.landBought = Math.max(0, Math.floor(s.landBought) || 0);
      st.startTitanium = !!s.startTitanium;
    } else {
      st.startTitanium = true;
      data.buildings.forEach(function (o) {
        const def = CO.BUILDINGS[o.t];
        if (!def) return;
        for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
          const x = o.x + i, y = o.y + j;
          if (x >= 0 && y >= 0 && x < CO.MAP_W && y < CO.MAP_H) st.land[CO.plotOf(x, y)] = 1;
        }
      });
    }
    if (!st.startTitanium && st.planet === 0) CO.world.clearStartTitanium();
    st.workers = CO.clamp(Math.floor(s.workers) || CO.WORKERS.start, CO.WORKERS.start, CO.WORKERS.max);
    st.contracts = CO.contracts ? CO.contracts.restore(s.contracts) : null;
    const ob = s.orbit || {};
    st.orbit = { mission: Math.max(0, ob.mission | 0), have: counts(ob.have), launches: Math.max(0, ob.launches | 0) };
    CO.recalcMods();                         // mission bonuses
    CO.world.restore(data.buildings);
    // Saves from before electricity: their machines now need power, tell the player once.
    CO.save.powerNotice = !(s.rev >= 7) && CO.world.list.some(function (b) { return !!b.def.power; });
    if (data.cam) { CO.cam.x = data.cam.x + ox; CO.cam.y = data.cam.y + oy; CO.cam.zoom = CO.clamp(data.cam.zoom, 4, 72); }
    CO.history.clear();
    CO.emit('loaded');
  }

  CO.save = {
    save: function () {
      try { localStorage.setItem(CO.SAVE_KEY, JSON.stringify(snapshot())); return true; }
      catch (e) {
        if (!warned) { warned = true; CO.emit('toast', 'Sauvegarde automatique impossible (stockage du navigateur indisponible). Pense à exporter ta partie.', 'warn'); }
        return false;
      }
    },
    /** Try to load the autosave. Returns true when a game was restored. */
    load: function () {
      try {
        const raw = localStorage.getItem(CO.SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        // before migrating an older save, keep an untouched copy of it (one per format revision)
        const rev = data && data.state && data.state.rev || 0;
        if (rev < SAVE_REV) { try { localStorage.setItem(CO.SAVE_KEY + '-backup-rev' + rev, raw); } catch (e) { /* storage full: go on */ } }
        applySnapshot(data);
        return true;
      } catch (e) { console.warn('Autosave unreadable', e); return false; }
    },
    newGame: function (seed) {
      CO.state = freshState(seed || (1 + Math.floor(Math.random() * 99999)));
      CO.recalcMods();
      CO.world.reset(CO.state.seed, 0);
      CO.world.clearStartTitanium();
      CO.cam.x = CO.MAP_CX; CO.cam.y = CO.MAP_CY; CO.cam.zoom = 32;
      CO.history.clear();
      CO.emit('loaded');
    },
    exportFile: function () {
      const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chantier-orbital-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    importText: function (text) {
      try { applySnapshot(JSON.parse(text)); CO.save.save(); return true; }
      catch (e) { return false; }
    }
  };
})(window.CO = window.CO || {});
