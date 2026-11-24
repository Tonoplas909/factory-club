/*
 * state.js — game state (money, research, station progress), progression rules
 * and persistence (localStorage autosave + file export/import).
 */
(function (CO) {
  'use strict';

  CO.mods = { machine: 1, drill: 1, chest: 0 };   // research bonuses (speed multipliers, extra chest capacity)
  CO.cam = { x: CO.MAP_CX, y: CO.MAP_CY, zoom: 32 };  // camera centre (tiles) and zoom (CSS px per tile)

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
      lastRecipe: {}         // remembered recipe per machine type
    };
  }
  CO.state = freshState(1);

  // ------------------------------------------------------------ unlocks
  CO.recalcMods = function () {
    let m = 0, d = 0, c = 0;
    for (const id in CO.state.tech) {
      const t = CO.TECHS[id];
      if (t && t.effect) { m += t.effect.machineSpeed || 0; d += t.effect.drillSpeed || 0; c += t.effect.chestCap || 0; }
    }
    CO.mods.machine = 1 + m; CO.mods.drill = 1 + d; CO.mods.chest = c;
  };
  /** Capacity of a buffer chest with current research. */
  CO.chestCap = function (def) { return def.capacity + CO.mods.chest; };
  CO.isBuildingUnlocked = function (type) {
    const t = CO.BUILDINGS[type].tech;
    return !t || !!CO.state.tech[t];
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
  CO.drillRate = function (b) { return b.ore ? b.n / (b.w * b.h) * b.def.rate * CO.mods.drill : 0; };
  /** Seconds one craft takes with current research. */
  CO.craftTime = function (rec) { return rec.time / CO.mods.machine; };

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
    if (id && (!CO.TECHS[id] || st.tech[id] || !CO.isTechAvailable(id))) return false;
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
    if (st.tech[id] || st.research === id || st.researchQueue.indexOf(id) >= 0) return false;
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
    CO.emit('phase', st.phase - 1, p);
  };

  // --------------------------------------------------------- persistence
  let warned = false;
  function snapshot() {
    const st = CO.state;
    return {
      v: 1, savedAt: Date.now(),
      state: {
        seed: st.seed, money: st.money, tech: st.tech, research: st.research, researchProg: st.researchProg,
        researchBank: st.researchBank, researchQueue: st.researchQueue,
        phase: st.phase, phaseHave: st.phaseHave, stats: st.stats, time: st.time, lastRecipe: st.lastRecipe, rev: 4
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
    CO.state = st;
    CO.recalcMods();
    CO.sanitizeQueue();
    CO.world.reset(st.seed);
    const ox = legacyMap ? CO.LEGACY_OX : 0, oy = legacyMap ? CO.LEGACY_OY : 0;
    if (ox || oy) data.buildings.forEach(function (o) { o.x += ox; o.y += oy; });
    CO.world.restore(data.buildings);
    if (data.cam) { CO.cam.x = data.cam.x + ox; CO.cam.y = data.cam.y + oy; CO.cam.zoom = CO.clamp(data.cam.zoom, 8, 72); }
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
        applySnapshot(JSON.parse(raw));
        return true;
      } catch (e) { console.warn('Autosave unreadable', e); return false; }
    },
    newGame: function (seed) {
      CO.state = freshState(seed || (1 + Math.floor(Math.random() * 99999)));
      CO.recalcMods();
      CO.world.reset(CO.state.seed);
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
