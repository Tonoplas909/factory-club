/*
 * state.js — game state (money, research, station progress), progression rules
 * and persistence (localStorage autosave + file export/import).
 */
(function (CO) {
  'use strict';

  CO.mods = { machine: 1, drill: 1 };   // research multipliers
  CO.cam = { x: 48, y: 32, zoom: 32 };  // camera centre (tiles) and zoom (CSS px per tile)

  function freshState(seed) {
    return {
      v: 1,
      seed: seed,
      money: CO.START_MONEY,
      tech: {},              // unlocked research ids
      research: null,        // active research id
      researchProg: {},      // delivered items for the active research
      phase: 0,              // current station phase index
      phaseHave: {},         // delivered items for the current phase
      stats: { produced: {}, sold: 0, delivered: 0 },
      time: 0,               // simulated seconds
      lastRecipe: {}         // remembered recipe per machine type
    };
  }
  CO.state = freshState(1);

  // ------------------------------------------------------------ unlocks
  CO.recalcMods = function () {
    let m = 0, d = 0;
    for (const id in CO.state.tech) {
      const t = CO.TECHS[id];
      if (t && t.effect) { m += t.effect.machineSpeed || 0; d += t.effect.drillSpeed || 0; }
    }
    CO.mods.machine = 1 + m; CO.mods.drill = 1 + d;
  };
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

  // -------------------------------------------------------------- money
  CO.addMoney = function (n) {
    CO.state.money += n;
    if (n > 0) { CO.state.stats.sold += n; CO.sim.countIncome(n); }
  };

  // ----------------------------------------------------------- research
  CO.setResearch = function (id) {
    const st = CO.state;
    if (id && (!CO.TECHS[id] || st.tech[id] || !CO.isTechAvailable(id))) return false;
    if (st.research !== id) { st.research = id; st.researchProg = {}; }
    CO.emit('research');
    return true;
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
        phase: st.phase, phaseHave: st.phaseHave, stats: st.stats, time: st.time, lastRecipe: st.lastRecipe
      },
      cam: { x: CO.cam.x, y: CO.cam.y, zoom: CO.cam.zoom },
      buildings: CO.world.serialize()
    };
  }
  /** Apply a snapshot to the live game. Throws on invalid data. */
  function applySnapshot(data) {
    if (!data || data.v !== 1 || !data.state || !Array.isArray(data.buildings)) throw new Error('format');
    const s = data.state, st = freshState(Number(s.seed) || 1);
    st.money = isFinite(s.money) ? Math.max(0, s.money) : CO.START_MONEY;
    st.tech = {}; for (const k in (s.tech || {})) if (CO.TECHS[k]) st.tech[k] = true;
    st.research = (s.research && CO.TECHS[s.research] && !st.tech[s.research]) ? s.research : null;
    st.researchProg = st.research ? (s.researchProg || {}) : {};
    st.phase = Math.max(0, Math.floor(s.phase) || 0);
    st.phaseHave = s.phaseHave || {};
    st.stats = { produced: (s.stats && s.stats.produced) || {}, sold: (s.stats && s.stats.sold) || 0, delivered: (s.stats && s.stats.delivered) || 0 };
    st.time = Number(s.time) || 0;
    st.lastRecipe = s.lastRecipe || {};
    CO.state = st;
    CO.recalcMods();
    CO.world.reset(st.seed);
    CO.world.restore(data.buildings);
    if (data.cam) { CO.cam.x = data.cam.x; CO.cam.y = data.cam.y; CO.cam.zoom = CO.clamp(data.cam.zoom, 8, 72); }
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
      CO.cam.x = 48; CO.cam.y = 32; CO.cam.zoom = 32;
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
