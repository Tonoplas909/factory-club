/*
 * world.js — the strict grid: ore layer, building storage, placement rules,
 * map generation and (de)serialisation of the factory.
 *
 * A building occupies w×h cells starting at its top-left (x, y). `cells[]`
 * stores a reference to the building in every cell it covers, so lookups are O(1).
 */
(function (CO) {
  'use strict';
  const W = CO.MAP_W, H = CO.MAP_H, DX = CO.DX, DY = CO.DY, BUILDINGS = CO.BUILDINGS;

  // Logistics pieces that a bigger building may simply be built over.
  const REPLACEABLE = { belt: true, tunnel_in: true, tunnel_out: true, router: true, junction: true, ktube: true };

  const world = CO.world = {
    W: W, H: H,
    cells: new Array(W * H).fill(null),
    ore: new Uint8Array(W * H),
    list: [],          // every building, iterated by the simulation
    nextId: 1,
    version: 0,        // bumped on every structural change (invalidates cached links)
    seed: 1,
    port: null,
    planet: 0,         // planet this map belongs to (see reset)

    inBounds: function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; },
    at: function (x, y) { return (x >= 0 && y >= 0 && x < W && y < H) ? this.cells[y * W + x] : null; },
    oreAt: function (x, y) { return this.inBounds(x, y) ? this.ore[y * W + x] : 0; },

    /** Remove everything, regenerate ore patches from `seed` and drop the station port. */
    sites: [],         // buildings waiting for (or under) construction, see makeSite

    /** `planet`: index in CO.PLANETS (the Terre keeps the game seed itself, so its map never changes). */
    reset: function (seed, planet) {
      this.cells.fill(null); this.list.length = 0; this.sites.length = 0; this.nextId = 1; this.version++;
      this.planet = planet || 0;
      this.seed = this.planet ? (seed * 31 + 7919 * this.planet) % 2147483647 : seed;
      if (this.planet === 1) this.generateKeora(this.seed); else this.generateOre(seed);
      this.port = this.create(CO.planet(this.planet).port, CO.MAP_CX - 2, CO.MAP_CY - 2, 0, null);
    },

    /**
     * Kéora: five small patches of the common ores around the Port (inside the land owned at the start),
     * then patches everywhere, bigger and richer far away; iridium and methane only far from the Port.
     */
    generateKeora: function (seed) {
      this.ore.fill(0); this.oreRev = (this.oreRev || 0) + 1;
      const id = function (name) { return CO.ORE_IDS.indexOf(name); };
      const rnd = CO.rng(seed * 7919 + 13), placed = [];
      const start = ['cobalt_ore', 'quartz', 'lithium_ore', 'sulfur', 'lava_rock'], a0 = rnd() * Math.PI * 2;
      for (let i = 0; i < start.length; i++) {
        const a = a0 + i / start.length * Math.PI * 2 + (rnd() - 0.5) * 0.4, d = 12 + rnd() * 5, r = 3.6 + rnd() * 0.8;
        const cx = CO.MAP_CX + Math.cos(a) * d, cy = CO.MAP_CY + Math.sin(a) * d;
        placed.push([cx, cy, r]);
        this.stamp(id(start[i]), cx, cy, r, Math.floor(rnd() * 1000), 0, 0);
      }
      // [ore, how many, min radius, max radius, min distance to the Port, max distance]
      const spread = [['ammonia', 1, 3.2, 4, 18, 26], ['cobalt_ore', 60, 3.4, 7.5, 26, 9999], ['quartz', 50, 3.4, 7, 26, 9999],
        ['lithium_ore', 50, 3.4, 7, 26, 9999], ['sulfur', 48, 3.2, 6.5, 26, 9999], ['lava_rock', 40, 3.2, 6.5, 26, 9999],
        ['iridium_ore', 50, 3.6, 6.5, 60, 9999], ['ammonia', 44, 3.5, 7.5, 32, 9999], ['methane', 34, 2.6, 4.2, 70, 9999]];
      for (let k = 0; k < spread.length; k++) {
        const e = spread[k], ore = id(e[0]);
        for (let n = 0; n < e[1]; n++) {
          for (let tries = 0; tries < 300; tries++) {
            const r = e[2] + rnd() * (e[3] - e[2]);
            const cx = 8 + rnd() * (W - 16), cy = 8 + rnd() * (H - 16), d = Math.hypot(cx - CO.MAP_CX, cy - CO.MAP_CY);
            if (d < e[4] || d > e[5]) continue;
            let ok = true;
            for (let q = 0; q < placed.length && ok; q++) if (Math.hypot(cx - placed[q][0], cy - placed[q][1]) < r + placed[q][2] + 3) ok = false;
            if (!ok) continue;
            placed.push([cx, cy, r]);
            this.stamp(ore, cx, cy, r, Math.floor(rnd() * 1000), 0, 0);
            break;
          }
        }
      }
      for (let y = CO.MAP_CY - 4; y < CO.MAP_CY + 4; y++) for (let x = CO.MAP_CX - 4; x < CO.MAP_CX + 4; x++) this.ore[y * W + x] = 0;
    },

    /** Remove titanium from the plots owned at the start (it must be bought; see state.js). */
    clearStartTitanium: function () {
      const land = CO.startLand();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (this.ore[y * W + x] === 6 && land[CO.plotOf(x, y)]) this.ore[y * W + x] = 0;
      }
      this.oreRev = (this.oreRev || 0) + 1;      // the terrain picture must be redrawn
    },

    /** Place ore patches around the map. Positions are jittered by the seed. */
    generateOre: function (seed) {
      this.ore.fill(0); this.oreRev = (this.oreRev || 0) + 1;
      const rnd = CO.rng(seed * 7919 + 13);
      const OX = CO.LEGACY_OX, OY = CO.LEGACY_OY;
      // [ore id, centre x, centre y, radius]
      const patches = [
        [1, 37, 25, 5.2], [2, 60, 40, 5.0], [3, 35, 41, 4.4], [5, 62, 23, 4.6], [4, 47, 12, 4.6],
        [1, 14, 14, 6.5], [2, 82, 50, 6.5], [4, 82, 12, 5.5], [5, 14, 50, 5.5], [3, 48, 54, 5.0],
        [1, 80, 30, 4.2], [2, 15, 32, 4.2],
        // titanium: far from the port (appended last so older patch layouts stay identical)
        [6, 27, 6, 4.4], [6, 90, 22, 4.4], [6, 68, 58, 4.2]
      ];
      const placed = [];                                   // [x, y, r] of every patch, to keep the extra ones apart
      for (let p = 0; p < patches.length; p++) {
        const pt = patches[p];
        const cx = pt[1] + OX + (rnd() - 0.5) * 3, cy = pt[2] + OY + (rnd() - 0.5) * 3, r = pt[3];
        const ns = Math.floor(rnd() * 1000);
        placed.push([cx, cy, r]);
        this.stamp(pt[0], cx, cy, r, ns, OX, OY);
      }
      // The extra, far-away patches that fill the big map: random but seeded, never touching each other
      // nor crowding the Port. [ore id, how many, min radius, max radius, min distance to the Port]
      // The 240×160 map's patches, drawn exactly as they were (same random sequence, same noise) and moved
      // to the centre of this map, so the ore under old saves does not move.
      const PX = CO.PREV_OX, PY = CO.PREV_OY;
      const rnd2 = CO.rng(seed * 104729 + 31);
      const extra = [[1, 16, 3.4, 6.4, 18], [2, 16, 3.4, 6.4, 18], [3, 12, 3.2, 5.6, 18], [4, 14, 3.2, 5.6, 22], [5, 12, 3.2, 5.6, 22], [6, 14, 3.4, 5.2, 50]];
      for (let k = 0; k < extra.length; k++) {
        const e = extra[k];
        for (let n = 0; n < e[1]; n++) {
          for (let tries = 0; tries < 300; tries++) {
            const r = e[2] + rnd2() * (e[3] - e[2]);
            const cx = 8 + rnd2() * (CO.PREV_W - 16) + PX, cy = 8 + rnd2() * (CO.PREV_H - 16) + PY;
            if (Math.hypot(cx - CO.MAP_CX, cy - CO.MAP_CY) < e[4]) continue;
            let ok = true;
            for (let q = 0; q < placed.length && ok; q++) if (Math.hypot(cx - placed[q][0], cy - placed[q][1]) < r + placed[q][2] + 4) ok = false;
            if (!ok) continue;
            placed.push([cx, cy, r]);
            this.stamp(e[0], cx, cy, r, Math.floor(rnd2() * 1000), PX, PY);
            break;
          }
        }
      }
      // The outer ring added with the 480×320 map: three times as many patches, bigger, titanium-rich.
      const rnd3 = CO.rng(seed * 7307 + 11);
      const outer = [[1, 48, 4, 7.5], [2, 48, 4, 7.5], [3, 36, 3.6, 6.5], [4, 40, 3.6, 6.5], [5, 34, 3.6, 6.5], [6, 52, 3.8, 6.5]];
      for (let k = 0; k < outer.length; k++) {
        const e = outer[k];
        for (let n = 0; n < e[1]; n++) {
          for (let tries = 0; tries < 300; tries++) {
            const r = e[2] + rnd3() * (e[3] - e[2]);
            const cx = 8 + rnd3() * (W - 16), cy = 8 + rnd3() * (H - 16);
            if (cx > PX - r - 2 && cx < PX + CO.PREV_W + r + 2 && cy > PY - r - 2 && cy < PY + CO.PREV_H + r + 2) continue;
            let ok = true;
            for (let q = 0; q < placed.length && ok; q++) if (Math.hypot(cx - placed[q][0], cy - placed[q][1]) < r + placed[q][2] + 4) ok = false;
            if (!ok) continue;
            placed.push([cx, cy, r]);
            this.stamp(e[0], cx, cy, r, Math.floor(rnd3() * 1000), 0, 0);
            break;
          }
        }
      }
      // Lakes and oil pools (appended last, only on empty cells: the ore above is unchanged). One small lake
      // near the Port for the first pumps; oil only far away.
      const rnd4 = CO.rng(seed * 48611 + 7);
      const fluids = [[7, 1, 3.2, 4.2, 14, 26], [7, 46, 3.5, 7.5, 30, 9999], [8, 34, 2.6, 4.2, 70, 9999]];
      for (let k = 0; k < fluids.length; k++) {
        const e = fluids[k];
        for (let n = 0; n < e[1]; n++) {
          for (let tries = 0; tries < 300; tries++) {
            const r = e[2] + rnd4() * (e[3] - e[2]);
            const cx = 8 + rnd4() * (W - 16), cy = 8 + rnd4() * (H - 16), d = Math.hypot(cx - CO.MAP_CX, cy - CO.MAP_CY);
            if (d < e[4] || d > e[5]) continue;
            let ok = true;
            for (let q = 0; q < placed.length && ok; q++) if (Math.hypot(cx - placed[q][0], cy - placed[q][1]) < r + placed[q][2] + 3) ok = false;
            if (!ok) continue;
            placed.push([cx, cy, r]);
            this.stamp(e[0], cx, cy, r, Math.floor(rnd4() * 1000), 0, 0);
            break;
          }
        }
      }
      // Keep the port area clean.
      for (let y = CO.MAP_CY - 4; y < CO.MAP_CY + 4; y++) for (let x = CO.MAP_CX - 4; x < CO.MAP_CX + 4; x++) this.ore[y * W + x] = 0;
    },

    /** Paint one noisy round ore patch (ore id, centre, radius). The noise is sampled relative to (ox, oy). */
    stamp: function (id, cx, cy, r, ns, ox, oy) {
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
        for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
          if (!this.inBounds(x, y)) continue;
          const d = Math.hypot(x - cx, y - cy);
          const n = CO.vnoise((x - ox) * 0.4, (y - oy) * 0.4, ns) * 2.4 - 1.2;
          if (d + n < r && this.ore[y * W + x] === 0) this.ore[y * W + x] = id;
        }
      }
    },

    /**
     * Dominant ore under a w×h footprint: {id, n (covered tiles of that ore)}. Lakes and oil pools are
     * ignored (drills), unless `only` names the one ore id to count (pumps).
     */
    countOre: function (x, y, w, h, only) {
      const c = new Array(CO.ORE_IDS.length).fill(0);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c[this.oreAt(x + i, y + j)]++;
      let best = 0, bn = 0;
      for (let k = 1; k < c.length; k++) {
        if (only ? k !== only : CO.isFluidOre(k)) continue;
        if (c[k] > bn) { bn = c[k]; best = k; }
      }
      return { id: best, n: bn };
    },

    /**
     * Can `type` be placed at (x,y)? A 1×1 building may replace another 1×1 building
     * (e.g. re-laying belts), and any building may replace the logistics pieces it covers
     * (belts, tunnels, splitters/mergers): they are removed (and refunded) automatically.
     * Returns {ok, reason, replaces: [buildings], replace: first one, same}.
     */
    check: function (type, x, y, dir) {
      const def = BUILDINGS[type];
      if (!CO.onPlanet(def, this.planet)) return { ok: false, reason: 'N’existe pas sur ' + CO.planet(this.planet).name };
      const replaces = [];
      for (let j = 0; j < def.h; j++) {
        for (let i = 0; i < def.w; i++) {
          const cx = x + i, cy = y + j;
          if (!this.inBounds(cx, cy)) return { ok: false, reason: 'Hors de la carte' };
          if (!CO.ownsCell(cx, cy)) return { ok: false, reason: 'Terrain non acheté' };
          const o = this.cells[cy * W + cx];
          if (o) {
            const swappable = !o.def.fixed && o.w === 1 && o.h === 1 &&
              ((def.w === 1 && def.h === 1) || REPLACEABLE[o.kind]);
            if (!swappable) return { ok: false, reason: 'Emplacement occupé' };
            if (replaces.indexOf(o) < 0) replaces.push(o);
          }
        }
      }
      if (def.kind === 'drill' && def.fluidOre) {
        if (this.countOre(x, y, def.w, def.h, CO.ORE_IDS.indexOf(def.fluidOre)).n === 0) return { ok: false, reason: 'Doit couvrir ' + CO.ITEMS[def.fluidOre].where };
      } else if (def.kind === 'drill' && this.countOre(x, y, def.w, def.h).n === 0) return { ok: false, reason: 'Doit couvrir un gisement' };
      if (def.kind === 'pump' && this.countOre(x, y, def.w, def.h, CO.ORE_IDS.indexOf(def.fluid)).n === 0)
        return { ok: false, reason: 'Doit couvrir ' + CO.ITEMS[def.fluid].where };
      const replace = replaces[0] || null;
      if (replaces.length === 1 && def.w === 1 && def.h === 1 && replace.type === type && (replace.dir === dir || def.nodir)) return { ok: false, same: true, reason: 'Déjà posé' };
      return { ok: true, replace: replace, replaces: replaces };
    },

    /** Create a building and register it in the grid. `cfg` = {recipe, filter, target} (optional). */
    create: function (type, x, y, dir, cfg) {
      const def = BUILDINGS[type];
      const b = { id: this.nextId++, type: type, def: def, kind: def.kind, x: x, y: y, w: def.w, h: def.h, dir: dir, fc: null,
        lvl: Math.max(1, Math.min(CO.UPGRADE.speed.length, (cfg && cfg.lvl) | 0 || 1)) };
      switch (def.kind) {
        case 'belt': case 'tunnel_in': case 'tunnel_out':
          b.items = []; b.lastIn = -1; b.link = null; b.linkVer = -1; break;
        case 'router':
          b.slot = null; b.timer = 0; b.rr = 0; b.lastIn = -1; b.filter = (cfg && cfg.filter) || null; break;
        case 'junction':                               // one slot per travel direction (E, S, W, N)
          b.slots = [null, null, null, null]; b.timers = [0, 0, 0, 0]; break;
        case 'unloader':
          b.slot = null; b.timer = 0; b.rr = 0; b.filter = (cfg && cfg.filter) || null; b.status = 'idle'; break;
        case 'chest':
          b.q = []; b.outT = 0; break;
        case 'drone_provider':
          b.q = []; b.reserved = {}; break;
        case 'drone_requester':
          b.q = []; b.outT = 0; b.incoming = 0; b.filter = (cfg && cfg.filter) || null; break;
        case 'drone_hub':
          b.drones = []; b.status = 'idle'; break;
        case 'launch_pad':
          b.parts = 0; b.payload = null; b.phase = 'load'; b.t = 0; b.status = 'idle'; break;
        case 'driver':
          b.q = []; b.incoming = 0; b.cd = 0; b.status = 'idle'; b.rr = 0; b.aim = null;
          this.setTarget(b, cfg && cfg.target); break;
        case 'drill': {                                // an extractor fills cartridges from the liquid it covers
          const oc = def.fluidOre ? this.countOre(x, y, def.w, def.h, CO.ORE_IDS.indexOf(def.fluidOre)) : this.countOre(x, y, def.w, def.h);
          b.ore = def.yields ? (oc.n ? def.yields : null) : CO.ORE_IDS[oc.id] || null;
          b.n = oc.n; b.acc = 0; b.out = []; b.status = 'idle'; b.rr = 0; break;
        }
        case 'ktube':                                  // kq: items of the network kept here between two rebuilds (tubes.js)
          b.kq = []; break;
        case 'ksilo':
          b.q = []; break;
        case 'kbooster':
          b.status = 'idle'; break;
        case 'krelay':
          b.status = 'idle'; this.setTarget(b, cfg && cfg.target); break;
        case 'kaccu':
          b.charge = 0; b.status = 'idle'; break;
        case 'machine':
          b.recipe = (cfg && cfg.recipe) || null; b.inBuf = {}; b.outBuf = []; b.prog = 0; b.crafting = false; b.status = 'idle'; b.rr = 0;
          if (def.mode === 'kiln') { b.heat = 20; b.batchN = 0; b.waitT = 0; }      // Kéora: see sim.js updateKiln / updateGrower
          if (def.mode === 'grower') b.slots = [];
          if (def.catUses) b.wear = 0;
          break;
        case 'generator':                              // fuel: items waiting, burn: seconds left on the one burning
          b.fuel = 0; b.burn = 0; b.status = 'idle'; break;
        case 'pole': break;
        case 'pump':
          b.n = this.countOre(x, y, def.w, def.h, CO.ORE_IDS.indexOf(def.fluid)).n; b.status = 'idle'; break;
        case 'pipe': case 'fluid_tank':                // fa / ff: share of the network content kept by this piece
          b.fa = 0; b.ff = null; break;
        default:
          b.pend = 0; b.pendT = 0; break;
      }
      for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) this.cells[(y + j) * W + x + i] = b;
      this.list.push(b);
      this.refreshGeometry(b);
      this.version++;
      return b;
    },

    remove: function (b) {
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const k = (b.y + j) * W + b.x + i;
        if (this.cells[k] === b) this.cells[k] = null;
      }
      const idx = this.list.indexOf(b);
      if (idx >= 0) this.list.splice(idx, 1);
      if (b.site) { const s = this.sites.indexOf(b); if (s >= 0) this.sites.splice(s, 1); }
      b.dead = true;
      this.version++;
    },

    /** Turn a freshly created building into a construction site (`done` seconds of work already spent).
     *  A site takes up its cells but does nothing until a worker finishes it. */
    /** Turn `b` into a construction site. `paid` false makes it a ghost: paid when a worker claims it. */
    makeSite: function (b, done, paid) {
      const t = CO.BUILD_TIME[b.type] || 1;
      b.site = { t: t, p: Math.min(t * 0.999, Math.max(0, done || 0)), w: null, paid: paid !== false };
      this.sites.push(b);
      this.version++;
    },
    finishSite: function (b) {
      if (!b.site) return;
      b.site = null;
      const s = this.sites.indexOf(b); if (s >= 0) this.sites.splice(s, 1);
      this.version++;
      CO.emit('built', b);
    },

    setDir: function (b, dir) { b.dir = dir; this.refreshGeometry(b); this.version++; },

    /** Mass driver target: "x,y" = top-left cell of the receiving driver (positions survive undo/redo). */
    setTarget: function (b, key) {
      const m = typeof key === 'string' ? /^(-?\d+),(-?\d+)$/.exec(key) : null;
      b.target = m ? key : null;
      b.tx = m ? +m[1] : 0; b.ty = m ? +m[2] : 0;
      this.version++;                                  // a relay link changes Kéora's networks
    },

    /** Cache the cells just in front of a building (where it outputs). Flat [x,y,x,y...]. */
    refreshGeometry: function (b) {
      const d = b.dir, out = [];
      if (d === 0 || d === 2) {
        const x = d === 0 ? b.x + b.w : b.x - 1;
        for (let j = 0; j < b.h; j++) out.push(x, b.y + j);
      } else {
        const y = d === 1 ? b.y + b.h : b.y - 1;
        for (let i = 0; i < b.w; i++) out.push(b.x + i, y);
      }
      b.fc = out;
    },

    // ----------------------------------------------------- serialisation
    serializeBuilding: function (b) {
      const o = { t: b.type, x: b.x, y: b.y, d: b.dir };
      if (b.recipe) o.r = b.recipe;
      if (b.filter) o.f = b.filter;
      if (b.target) o.k = b.target;
      if (b.lvl > 1) o.l = b.lvl;
      if (b.kind === 'launch_pad' && (b.parts || b.payload)) { o.rp = b.parts; o.pl = b.payload; o.ph = b.phase; o.pt = Math.round(b.t * 100) / 100; }
      if (b.site) o.s = Math.round(b.site.p * 100) / 100;          // seconds of work already spent on the site
      if (b.site && !b.site.paid) o.g = 1;                          // ghost: not paid yet
      if (b.items && b.items.length) o.i = b.items.map(function (it) { return [it.t, Math.round(it.p * 100) / 100, it.f]; });
      if (b.q && b.q.length) o.q = b.q.slice();
      if (b.kind === 'drone_requester' && CO.drones) {   // what drones are carrying to it is saved into it
        const fly = CO.drones.inFlightTo(b);
        if (fly.length) o.q = (o.q || []).concat(fly);
      }
      if (b.kind === 'generator' && (b.fuel || b.burn > 0)) { o.fu = b.fuel; o.bu = Math.round(b.burn * 100) / 100; }
      if ((b.kind === 'pipe' || b.kind === 'fluid_tank') && CO.fluid) {
        const c = CO.fluid.contentOf(b);
        if (c.a > 0) { o.fa = Math.round(c.a * 10) / 10; o.ff = c.f; }
      }
      if (b.kind === 'ktube' && CO.tubes) { const q = CO.tubes.share(b); if (q.length) o.q = q; }
      if (b.kind === 'kaccu' && b.charge > 0) o.ch = Math.round(b.charge);
      if (b.kind === 'driver') {                       // items still flying are saved back into their launcher
        const fly = CO.sim ? CO.sim.inFlightFrom(b) : [];
        if (fly.length) o.q = (o.q || []).concat(fly);
      }
      if (b.kind === 'machine') {
        if (Object.keys(b.inBuf).length) o.ib = b.inBuf;
        if (b.outBuf.length) o.ob = b.outBuf.slice();
        if (b.def.mode === 'kiln') { o.ht = Math.round(b.heat); if (b.crafting) { o.kb = b.batchN; o.kp = Math.round(b.prog * 100) / 100; } }
        if (b.slots && b.slots.length) o.gs = b.slots.map(function (sl) { return [sl.r, Math.round(sl.p * 100) / 100]; });
        if (b.wear > 0) o.wr = b.wear;
      }
      if (b.kind === 'drill' && b.out.length) o.ob = b.out.slice();
      return o;
    },
    serialize: function () {
      const out = [];
      for (let i = 0; i < this.list.length; i++) if (!this.list[i].def.fixed) out.push(this.serializeBuilding(this.list[i]));
      return out;
    },
    /** Rebuild buildings from serialised data (after reset()). Invalid entries are skipped. */
    restore: function (arr) {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i], def = BUILDINGS[o.t];
        if (!def || def.fixed || !(o.d >= 0 && o.d < 4)) continue;
        if (!this.check(o.t, o.x, o.y, o.d).ok) continue;
        const b = this.create(o.t, o.x, o.y, o.d, { recipe: o.r, filter: o.f, target: o.k, lvl: o.l });
        if (o.s != null) this.makeSite(b, Number(o.s) || 0, !o.g);
        if (o.i && b.items) b.items = o.i.filter(function (a) { return CO.ITEMS[a[0]]; }).map(function (a) { return { t: a[0], p: a[1], f: a[2] }; });
        if (o.q && b.q) b.q = o.q.filter(function (t) { return CO.ITEMS[t]; });
        if (o.q && b.kq) b.kq = o.q.filter(function (t) { return CO.ITEMS[t] && !CO.ITEMS[t].fluid; });
        if (b.kind === 'kaccu') b.charge = CO.clamp(Number(o.ch) || 0, 0, b.def.capacity);
        if (o.ib && b.inBuf) b.inBuf = o.ib;
        if (b.kind === 'launch_pad') {
          b.parts = Math.max(0, Math.min(b.def.parts, o.rp | 0));
          b.payload = o.pl === 'satellite' || o.pl === 'probe' ? o.pl : null;
          b.phase = o.ph === 'build' || o.ph === 'flight' ? o.ph : 'load'; b.t = Math.max(0, Number(o.pt) || 0);
        }
        if (b.kind === 'generator') { b.fuel = Math.max(0, Number(o.fu) || 0); b.burn = Math.max(0, Number(o.bu) || 0); }
        if ((b.kind === 'pipe' || b.kind === 'fluid_tank') && o.ff && CO.ITEMS[o.ff] && CO.ITEMS[o.ff].fluid) { b.fa = Math.max(0, Number(o.fa) || 0); b.ff = o.ff; }
        if (o.ob) { if (b.outBuf) b.outBuf = o.ob.slice(); else if (b.out) b.out = o.ob.slice(); }
        if (b.def.mode === 'kiln') {
          b.heat = CO.clamp(Number(o.ht) || 20, 20, b.def.maxHeat);
          if (o.kb > 0 && b.recipe) { b.batchN = Math.min(b.def.batch, o.kb | 0); b.prog = Math.max(0, Number(o.kp) || 0); b.crafting = true; }
        }
        if (b.slots && Array.isArray(o.gs)) b.slots = o.gs.filter(function (a) { return Array.isArray(a) && CO.RECIPES[a[0]]; }).slice(0, b.def.slots).map(function (a) { return { r: a[0], p: Math.max(0, Number(a[1]) || 0) }; });
        if (b.def.catUses) b.wear = CO.clamp(o.wr | 0, 0, b.def.catUses);
      }
    }
  };
})(window.CO = window.CO || {});
