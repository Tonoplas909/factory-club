/*
 * sim.js — the factory simulation (fixed time step).
 *
 * Items travel on belts as a sorted list of {t: itemId, p: progress 0..1, f: side it came from}.
 * `p` runs along the tile; an item entering from the side first slides to the tile centre
 * (p 0 → 0.5) then moves forward (p 0.5 → 1), which gives natural looking corners and merges.
 * Every building gets `insert(target, item, travelDir, carry, source)` offered by its neighbours;
 * it returns true when it accepted the item. This single rule drives the whole logistics.
 */
(function (CO) {
  'use strict';
  const DX = CO.DX, DY = CO.DY, world = CO.world, ITEMS = CO.ITEMS, RECIPES = CO.RECIPES;
  const GAP = 0.33;            // minimum spacing between two items on a belt
  const TUNNEL_SPEED = 3.2;
  const OUT_CAP = 8;           // output buffer size of machines
  const DRIVER_SPEED = 24;     // mass driver shots, tiles per second
  const sim = CO.sim = {};
  // Splitters, mergers, gates, junctions and chests pass 15 items/s: more than an armored belt (14.5/s).
  const ROUTER_DELAY = 1 / 15, CHEST_DELAY = 1 / 15, UNLOAD_DELAY = 0.1;
  const EPS = 1e-6;            // delays are whole numbers of 1/60 s ticks: do not lose one to rounding
  const TICK = 1 / 60;         // fixed simulation step (see main.js)
  /** Logistics constants, exposed so the UI can show exact throughputs. */
  sim.K = { gap: GAP, tunnelSpeed: TUNNEL_SPEED, routerDelay: ROUTER_DELAY, chestDelay: CHEST_DELAY, unloadDelay: UNLOAD_DELAY, tunnelRange: 4 };
  CO.fx = [];                  // floating "+12" texts, drawn by render.js
  sim.shots = [];              // mass driver volleys in flight: {from, to, items, t, dur}

  // ------------------------------------------------------------- statistics
  // Three flows per item, one bucket per simulated second over the last minute:
  // p = produced, u = used (machines, labs, station deliveries), s = sold (seller, Port surplus).
  let cur = { p: {}, u: {}, s: {} }, curMoney = 0, tAcc = 0;
  const buckets = [], moneyBuckets = [];
  function bump(map, item, n) { map[item] = (map[item] || 0) + n; }
  sim.countProduced = function (item, n) { bump(CO.state.stats.produced, item, n); bump(cur.p, item, n); };
  sim.countUsed = function (item, n) { bump(cur.u, item, n); };
  sim.countSold = function (item, n) { bump(cur.s, item, n); };
  sim.countIncome = function (n) { curMoney += n; };
  function windowSeconds() { return Math.max(15, buckets.length + tAcc); }
  function perMin(kind, item) {
    let s = cur[kind][item] || 0;
    for (let i = 0; i < buckets.length; i++) s += buckets[i][kind][item] || 0;
    return s * 60 / windowSeconds();
  }
  /** Items produced / used / sold per minute (rolling window of the last minute). */
  sim.ratePerMin = function (item) { return perMin('p', item); };
  sim.usePerMin = function (item) { return perMin('u', item); };
  sim.soldPerMin = function (item) { return perMin('s', item); };
  sim.moneyPerMin = function () {
    let s = curMoney;
    for (let i = 0; i < moneyBuckets.length; i++) s += moneyBuckets[i];
    return s * 60 / windowSeconds();
  };
  // Longer history for the curves of the Production tab: three rings of at most 60 samples, one sample
  // per 1 s, 10 s and 60 s (so 1 min, 10 min and 1 h of history). Not saved: it restarts with the page.
  sim.HIST = [{ label: '1 min', step: 1 }, { label: '10 min', step: 10 }, { label: '1 h', step: 60 }];
  const HIST_LEN = 60;
  const rings = [[], [], []], accs = [null, null, null];
  function newAcc() { return { p: {}, u: {}, m: 0, n: 0, ps: 0, pd: 0 }; }
  function addInto(acc, b, money) {
    for (const k in b.p) acc.p[k] = (acc.p[k] || 0) + b.p[k];
    for (const k in b.u) acc.u[k] = (acc.u[k] || 0) + b.u[k];
    acc.m += money; acc.n++;
    acc.ps += CO.power ? CO.power.supply : 0; acc.pd += CO.power ? CO.power.demand : 0;
  }
  function pushHistory(b, money) {
    for (let r = 0; r < 3; r++) {
      const acc = accs[r] || (accs[r] = newAcc());
      addInto(acc, b, money);
      if (acc.n < sim.HIST[r].step) continue;
      rings[r].push(acc); accs[r] = null;
      if (rings[r].length > HIST_LEN) rings[r].shift();
    }
  }
  /**
   * Values (oldest first) at resolution `res` of `kind`: 'p' produced, 'u' used (items per minute),
   * 'm' income (credits per minute), 'ps' / 'pd' power supply / demand (average kW).
   */
  sim.history = function (res, kind, item) {
    const ring = rings[res], f = 60 / sim.HIST[res].step, out = new Array(ring.length);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      out[i] = kind === 'ps' || kind === 'pd' ? a[kind] / a.n : (kind === 'm' ? a.m : a[kind][item] || 0) * f;
    }
    return out;
  };

  sim.resetStats = function () {
    cur = { p: {}, u: {}, s: {} }; curMoney = 0; tAcc = 0; buckets.length = 0; moneyBuckets.length = 0;
    for (let r = 0; r < 3; r++) { rings[r].length = 0; accs[r] = null; }
    CO.fx.length = 0; sim.shots.length = 0;
  };
  // A new or loaded game must not inherit the gauges (nor the volleys in flight) of the previous one.
  CO.on('loaded', sim.resetStats);

  // --------------------------------------------------------------- helpers
  /** Direction in which building `n` pushes items into cell (x,y), or -1. */
  function outputsTo(n, x, y) {
    switch (n.kind) {
      case 'belt': case 'tunnel_out':
        return (n.x + DX[n.dir] === x && n.y + DY[n.dir] === y) ? n.dir : -1;
      case 'unloader':
        return (n.x + DX[n.dir] === x && n.y + DY[n.dir] === y) ? n.dir : -1;
      case 'junction': {                                 // straight through, when something feeds the opposite side
        for (let d = 0; d < 4; d++) {
          if (n.x + DX[d] !== x || n.y + DY[d] !== y) continue;
          const back = world.at(n.x - DX[d], n.y - DY[d]);
          return back && back.kind !== 'junction' && outputsTo(back, n.x, n.y) === d ? d : -1;
        }
        return -1;
      }
      case 'router': {
        if (n.type !== 'merger') {
          for (let k = 0; k < 3; k++) {
            const d = (n.dir + 3 + k) & 3;
            if (n.x + DX[d] === x && n.y + DY[d] === y) return d;
          }
          return -1;
        }
        return (n.x + DX[n.dir] === x && n.y + DY[n.dir] === y) ? n.dir : -1;
      }
      case 'chest': case 'machine': case 'drill': case 'driver': case 'drone_requester': {
        if (n.kind === 'driver' && n.target) return -1;    // a launcher sends through the air, not to its front
        const fc = n.fc;
        for (let i = 0; i < fc.length; i += 2) if (fc[i] === x && fc[i + 1] === y) return n.dir;
        return -1;
      }
    }
    return -1;
  }
  sim.outputsTo = outputsTo;

  /** Does neighbour `n` currently hold an item it wants to push out? */
  function waiting(n) {
    switch (n.kind) {
      case 'belt': case 'tunnel_out': return n.items.length > 0 && n.items[0].p >= 0.95;
      case 'router': case 'unloader': return n.slot !== null;
      case 'junction': return n.slots[0] !== null || n.slots[1] !== null || n.slots[2] !== null || n.slots[3] !== null;
      case 'chest': case 'drone_requester': return n.q.length > 0;
      case 'machine': return n.outBuf.length > 0;
      case 'drill': return n.out.length > 0;
      case 'driver': return !n.target && n.q.length > 0;
    }
    return false;
  }

  /**
   * Fairness when several inputs compete for the same building: an input that was served
   * last time yields if another input is waiting (so merges alternate instead of starving).
   */
  function contested(b, dir) {
    const head = (b.dir + 2) & 3;
    for (let d = 0; d < 4; d++) {
      if (d === dir || d === head) continue;
      const n = world.at(b.x - DX[d], b.y - DY[d]);
      if (n && n !== b && outputsTo(n, b.x, b.y) === d && waiting(n)) return true;
    }
    return false;
  }

  sim.findExit = function (b) {
    if (b.linkVer === world.version) return b.link;
    b.link = null; b.linkVer = world.version;
    for (let k = 1; k <= 5; k++) {
      const n = world.at(b.x + DX[b.dir] * k, b.y + DY[b.dir] * k);
      if (!n) continue;
      if (n.kind === 'tunnel_out' && n.dir === b.dir) { b.link = n; break; }
      if (n.kind === 'tunnel_in' && n.dir === b.dir) break;
    }
    return b.link;
  };

  // ------------------------------------------------------------ insertion
  function insert(t, item, dir, carry, src) {
    if (t.site) return false;                                // not built yet
    switch (t.kind) {
      case 'belt': case 'tunnel_in': return beltIn(t, item, dir, carry);
      case 'router': return routerIn(t, item, dir);
      case 'junction':
        if (t.slots[dir] !== null) return false;
        t.slots[dir] = item; t.timers[dir] = 0; return true;
      case 'chest':
        if (dir === ((t.dir + 2) & 3) || t.q.length >= CO.chestCap(t.def)) return false;
        t.q.push(item); return true;
      case 'drone_provider':                                 // filled by belts on any side, emptied by drones
        if (t.q.length >= t.def.capacity) return false;
        t.q.push(item); return true;
      case 'machine': return machineIn(t, item, dir);
      case 'driver':                                         // only a linked launcher loads from belts (any side)
        if (!driverTarget(t) || t.q.length + t.incoming >= t.def.capacity) return false;
        t.q.push(item); return true;
      case 'lab': return labIn(t, item);
      case 'generator': return CO.power.fuelIn(t, item);
      case 'launch_pad': return CO.orbit.padIn(t, item);
      case 'seller': { const p = ITEMS[item].price; CO.addMoney(p); t.pend += p; sim.countSold(item, 1); return true; }
      case 'port': return portIn(t, item);
      case 'ktube': case 'kbooster': case 'krelay': return CO.tubes.put(t, item);   // into Kéora's network
      case 'ksilo':
        if (t.q.length >= t.def.capacity) return false;
        t.q.push(item); return true;
    }
    return false; // drills and tunnel exits accept nothing from belts
  }
  sim.insert = insert;

  function beltIn(b, item, dir, carry) {
    if (dir === ((b.dir + 2) & 3)) return false;            // head-on
    const its = b.items, n = its.length;
    // No room at the entrance? An item handed over with no carry (chest, splitter…) may start up to one
    // tick behind the edge, so the spacing stays exactly GAP instead of being rounded up to whole ticks.
    const slack = carry === 0 ? (b.def.speed || TUNNEL_SPEED) * TICK : 0;
    if (n && its[n - 1].p < carry + GAP - slack) return false;
    if (b.lastIn === dir && contested(b, dir)) return false; // let the other input go first
    its.push({ t: item, p: n ? Math.min(carry, its[n - 1].p - GAP) : carry, f: (dir + 2) & 3 });
    b.lastIn = dir;
    return true;
  }

  function exitIn(ex, item) {
    if (ex.site) return false;
    const its = ex.items;
    if (its.length && its[its.length - 1].p < 0.5 + GAP) return false;
    its.push({ t: item, p: 0.5, f: (ex.dir + 2) & 3 });
    return true;
  }

  function routerIn(b, item, dir) {
    if (b.slot !== null) return false;
    if (b.type !== 'merger') { if (dir !== b.dir) return false; }   // splitter, gates, inverted sorter: from the back
    else {
      if (dir === ((b.dir + 2) & 3)) return false;
      if (b.lastIn === dir && contested(b, dir)) return false;
    }
    b.slot = item; b.timer = 0; b.lastIn = dir;
    return true;
  }

  function machineIn(b, item, dir) {
    if (dir === ((b.dir + 2) & 3)) return false;             // front side is the output
    let rec = b.recipe ? RECIPES[b.recipe] : null;
    if (!rec) {
      // No recipe yet: auto-pick only when the item identifies exactly one unlocked recipe.
      let found = null, count = 0;
      for (const id in RECIPES) {
        const r = RECIPES[id];
        if (r.machine === b.type && r.in[item] && CO.isRecipeUnlocked(id)) { found = r; count++; }
      }
      if (count !== 1) return false;
      b.recipe = found.id; rec = found;
    }
    const need = rec.in[item];
    if (!need) return false;
    const have = b.inBuf[item] || 0;
    if (have >= need * 2) return false;
    b.inBuf[item] = have + 1;
    return true;
  }

  /**
   * Labs feed the active research first; anything a future research will need goes to the shared
   * lab reserve (spent as soon as that research starts), so a mixed belt never jams a lab.
   */
  function labIn(b, item) {
    const st = CO.state;
    if (!(b.pw > 0)) return false;                           // an unpowered lab takes nothing
    if (st.research) {
      const need = CO.TECHS[st.research].cost[item] || 0, have = st.researchProg[item] || 0;
      if (have < need) {
        st.researchProg[item] = have + 1; sim.countUsed(item, 1);
        if (CO.researchDone()) CO.completeResearch();
        return true;
      }
    }
    if (CO.bankRoom(item) <= 0) return false;
    st.researchBank[item] = (st.researchBank[item] || 0) + 1; sim.countUsed(item, 1);
    return true;
  }

  function portIn(b, item) {
    const st = CO.state, ph = CO.getPhase(st.phase);
    if (CO.contracts.deliver(item)) { sim.countUsed(item, 1); return true; }   // accepted contracts come first
    const need = ph.need[item] || 0, have = st.phaseHave[item] || 0;
    if (have < need) {
      st.phaseHave[item] = have + 1; st.stats.delivered++; sim.countUsed(item, 1);
      if (CO.phaseDone()) CO.completePhase();
    } else {                                   // surplus is sold at the fixed price
      const p = ITEMS[item].price; CO.addMoney(p); b.pend += p; sim.countSold(item, 1);
    }
    return true;
  }

  // -------------------------------------------------------------- updaters
  function updateBelt(b, dt) {
    const its = b.items;
    if (!its.length) return;
    const step = (b.def.speed || TUNNEL_SPEED) * dt;
    let prev = Infinity, i = 0;
    while (i < its.length) {
      const it = its[i];
      let np = it.p + step;
      if (np > prev - GAP) np = Math.max(it.p, prev - GAP);
      if (np >= 1) {                                         // front item reached the end
        let ok;
        if (b.kind === 'tunnel_in') { const ex = sim.findExit(b); ok = ex ? exitIn(ex, it.t) : false; }
        else {
          const t = world.at(b.x + DX[b.dir], b.y + DY[b.dir]);
          ok = t ? insert(t, it.t, b.dir, np - 1, b) : false;
        }
        if (ok) { its.splice(i, 1); continue; }
        np = 1;
      }
      it.p = np; prev = np; i++;
    }
  }

  function updateRouter(b, dt) {
    if (b.slot === null) return;
    b.timer += dt;
    if (b.timer < ROUTER_DELAY - EPS) return;
    const item = b.slot, F = b.dir, L = (b.dir + 3) & 3, R = (b.dir + 1) & 3;
    // groups of outputs tried in order of priority; inside a group, round robin
    let groups;
    switch (b.type) {
      case 'merger': groups = [[F]]; break;
      case 'overflow': groups = [[F], [L, R]]; break;          // front first, the overflow to the sides
      case 'underflow': groups = [[L, R], [F]]; break;         // sides first, the front only when they are full
      case 'sorter_inv': groups = b.filter && item === b.filter ? [[L, R]] : [[F]]; break;
      default: groups = b.filter ? (item === b.filter ? [[F]] : [[L, R]]) : [[F, L, R]];   // splitter
    }
    for (let g = 0; g < groups.length; g++) {
      const c = groups[g], n = c.length;
      for (let k = 0; k < n; k++) {
        const d = c[(b.rr + k) % n];
        const t = world.at(b.x + DX[d], b.y + DY[d]);
        if (t && insert(t, item, d, 0, b)) { b.slot = null; b.rr = (b.rr + k + 1) % n; return; }
      }
    }
  }

  /** Junction: every item keeps going in its travel direction. */
  function updateJunction(b, dt) {
    for (let d = 0; d < 4; d++) {
      if (b.slots[d] === null) continue;
      b.timers[d] += dt;
      if (b.timers[d] < ROUTER_DELAY - EPS) continue;
      const t = world.at(b.x + DX[d], b.y + DY[d]);
      if (t && insert(t, b.slots[d], d, 0, b)) b.slots[d] = null;
    }
  }

  /**
   * Unloader: pulls items (the filtered one only, if set) out of the chests, machines, drills and
   * receiving mass drivers touching its three other sides, and pushes them out of its front.
   */
  function takeFrom(n, filter) {
    let arr = null;
    switch (n.kind) {
      case 'chest': case 'drone_provider': case 'drone_requester': arr = n.q; break;
      case 'machine': arr = n.outBuf; break;
      case 'drill': arr = n.out; break;
      case 'driver': if (!n.target) arr = n.q; break;
    }
    if (!arr || !arr.length) return null;
    if (!filter) return arr.shift();
    const i = arr.indexOf(filter);
    return i < 0 ? null : arr.splice(i, 1)[0];
  }
  function updateUnloader(b, dt) {
    b.timer += dt;
    if (b.slot === null && b.timer >= UNLOAD_DELAY - EPS) {
      const sides = [(b.dir + 2) & 3, (b.dir + 3) & 3, (b.dir + 1) & 3];   // back, left, right — in turn
      for (let k = 0; k < 3; k++) {
        const side = sides[(b.rr + k) % 3], n = world.at(b.x + DX[side], b.y + DY[side]);
        if (!n || n === b || n.site) continue;
        const it = takeFrom(n, b.filter);
        if (it) { b.slot = it; b.timer = 0; b.rr = (b.rr + k + 1) % 3; break; }
      }
    }
    if (b.slot !== null) {
      const t = world.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      if (t && insert(t, b.slot, b.dir, 0, b)) b.slot = null;
    }
    b.status = b.slot !== null ? 'blocked' : b.timer < UNLOAD_DELAY * 2 ? 'work' : 'idle';
  }

  function updateChest(b, dt) {
    b.outT += dt;
    if (b.q.length && b.outT >= CHEST_DELAY - EPS) {
      const t = world.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      if (t && insert(t, b.q[0], b.dir, 0, b)) { b.q.shift(); b.outT = 0; }
    }
  }

  /** Push the first buffered item to one of the cells in front of the building. */
  function flush(b, arr) {
    const fc = b.fc, n = fc.length >> 1, item = arr[0];
    for (let k = 0; k < n; k++) {
      const j = (b.rr + k) % n;
      const t = world.at(fc[j * 2], fc[j * 2 + 1]);
      if (t && insert(t, item, b.dir, 0, b)) { arr.shift(); b.rr = (j + 1) % n; return true; }
    }
    return false;
  }

  function updateDrill(b, dt) {
    if (b.out.length) flush(b, b.out);
    if (!b.ore) { b.status = 'idle'; b.wants = false; return; }
    if (b.out.length >= 4) { b.status = 'blocked'; b.wants = false; b.acc = Math.min(b.acc, 1); return; }
    b.wants = true;
    const pw = b.pw || 0;
    if (pw <= 0) { b.status = 'nopower'; return; }
    b.acc += dt * CO.drillRate(b) * pw;
    b.status = 'work';
    if (b.acc >= 1) { b.acc -= 1; b.out.push(b.ore); sim.countProduced(b.ore, 1); }
  }

  function outTotal(rec) { let n = 0; for (const k in rec.out) n += rec.out[k]; return n; }

  function updateMachine(b, dt) {
    if (b.outBuf.length) flush(b, b.outBuf);
    const rec = b.recipe ? RECIPES[b.recipe] : null;
    if (!rec) { b.status = 'idle'; b.wants = false; return; }
    const room = b.outBuf.length + outTotal(rec) <= OUT_CAP, pw = b.pw || 0;
    if (b.crafting) {
      if (b.prog < rec.time) {                                 // still working: needs power
        b.wants = true;
        if (pw <= 0) { b.status = 'nopower'; return; }
        b.prog += dt * CO.mods.machine * pw * CO.lvlSpeed(b);
      }
      if (b.prog >= rec.time) {
        if (!room) { b.prog = rec.time; b.status = 'blocked'; b.wants = false; return; }
        b.crafting = false; b.prog = 0;
        for (const k in rec.out) for (let i = 0; i < rec.out[k]; i++) b.outBuf.push(k);
        for (const k in rec.out) sim.countProduced(k, rec.out[k]);
      } else { b.status = 'work'; return; }
    }
    let can = true;
    for (const k in rec.in) if ((b.inBuf[k] || 0) < rec.in[k]) { can = false; break; }
    if (can && rec.fin) for (const k in rec.fin) if (CO.fluid.amount(b, k) < rec.fin[k] - 1e-6) { can = false; break; }
    if (can && room) {
      b.wants = true;
      if (pw <= 0) { b.status = 'nopower'; return; }
      for (const k in rec.in) { b.inBuf[k] -= rec.in[k]; sim.countUsed(k, rec.in[k]); }
      if (rec.fin) for (const k in rec.fin) CO.fluid.take(b, k, rec.fin[k]);
      b.crafting = true; b.prog = 0; b.status = 'work';
    } else { b.status = can ? 'blocked' : 'idle'; b.wants = false; }
  }

  /** Water pumps and oil wells: push their fluid into the pipes touching them. */
  function updatePump(b, dt) {
    const fl = b.def.fluid;
    b.wants = false;
    if (!b.n) { b.status = 'idle'; return; }
    if (!b.fnets || !b.fnets.length) { b.status = 'nopipe'; return; }
    if (CO.fluid.room(b, fl) <= 1e-6) { b.status = 'blocked'; return; }
    b.wants = true;
    const pw = b.pw || 0;
    if (pw <= 0) { b.status = 'nopower'; return; }
    CO.fluid.give(b, fl, b.def.rate * b.n / (b.w * b.h) * pw * CO.lvlSpeed(b) * dt);
    b.status = 'work';
  }

  function updateSink(b, dt) {
    if (b.pend > 0) {
      b.pendT += dt;
      if (b.pendT >= 0.8) {
        if (CO.fx.length > 60) CO.fx.shift();
        CO.fx.push({ x: b.x + b.w / 2, y: b.y + 0.3, text: '+' + CO.fmt(b.pend), age: 0 });
        b.pend = 0; b.pendT = 0;
      }
    }
  }

  // ----------------------------------------------------------- mass drivers
  function driverDist(a, t) { return Math.hypot(t.x + t.w / 2 - a.x - a.w / 2, t.y + t.h / 2 - a.y - a.h / 2); }
  sim.driverDist = driverDist;
  /** The driver `b` shoots at, or null (no link, target gone, or out of range). */
  function driverTarget(b) {
    if (!b.target) return null;
    const t = world.at(b.tx, b.ty);
    if (!t || t === b || t.kind !== 'driver' || t.site || t.x !== b.tx || t.y !== b.ty || driverDist(b, t) > b.def.range) return null;
    return t;
  }
  sim.driverTarget = driverTarget;
  /** Items currently flying out of launcher `b` (saved back into it, see world.serializeBuilding). */
  sim.inFlightFrom = function (b) {
    const out = [];
    for (let i = 0; i < sim.shots.length; i++) if (sim.shots[i].from === b) out.push.apply(out, sim.shots[i].items);
    return out;
  };

  function updateDriver(b, dt) {
    const tg = driverTarget(b);
    if (b.cd > 0) b.cd = Math.max(0, b.cd - dt);
    if (!tg) {                                        // receiver: unload through the front, like a chest
      b.aim = null;
      if (b.target) { b.status = 'blocked'; return; } // linked to something that is gone or out of range
      if (!b.q.length) { b.status = 'idle'; return; }
      b.status = flush(b, b.q) || b.q.length < b.def.capacity ? 'work' : 'blocked';
      return;
    }
    b.aim = Math.atan2(tg.y + tg.h / 2 - b.y - b.h / 2, tg.x + tg.w / 2 - b.x - b.w / 2);
    if (b.cd > 0) { b.status = 'work'; return; }
    if (!b.q.length) { b.status = 'idle'; return; }
    // Never shoot more than the target can still store: space is reserved until the volley lands.
    const n = Math.min(b.def.volley, b.q.length, tg.def.capacity - tg.q.length - tg.incoming);
    if (n <= 0) { b.status = 'blocked'; return; }
    tg.incoming += n;
    sim.shots.push({ from: b, to: tg, items: b.q.splice(0, n), t: 0, dur: driverDist(b, tg) / DRIVER_SPEED });
    b.cd = b.def.reload; b.status = 'work';
  }

  function updateShots(dt) {
    const shots = sim.shots;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t += dt;
      if (s.t < s.dur) continue;
      shots.splice(i, 1);
      if (!s.to.dead) { s.to.incoming = Math.max(0, s.to.incoming - s.items.length); s.to.q.push.apply(s.to.q, s.items); }
      else if (!s.from.dead) s.from.q.push.apply(s.from.q, s.items);   // target removed mid-flight: back to the launcher
    }
  }

  // ---------------------------------------------------------------- workers
  // Little builders. Each one takes the nearest site nobody has claimed, flies there in a straight line
  // (over everything), builds it, then claims the next nearest site from where it stands; with nothing
  // left to build it flies back to its spot next to the Port.
  const workers = sim.workers = [];        // {x, y (tile coords, centre), job, building, moving, face}
  function homeOf(i) {
    const p = world.port, a = i / Math.max(1, CO.state.workers) * Math.PI * 2;
    return { x: p.x + p.w / 2 + Math.cos(a) * 1.3, y: p.y + p.h / 2 + Math.sin(a) * 1.3 };
  }
  function syncWorkers() {
    const n = CO.state.workers;
    while (workers.length < n) { const h = homeOf(workers.length); workers.push({ x: h.x, y: h.y, job: null, building: false, moving: false, face: 1 }); }
    if (workers.length > n) workers.length = n;
  }
  function claimNearest(w) {
    const sites = world.sites;
    const money = CO.state.money;
    let best = null, bd = Infinity;
    for (let i = 0; i < sites.length; i++) {
      const b = sites[i];
      if (b.site.w && !b.site.w.gone) continue;
      if (!b.site.paid && money < CO.fullCost(b.type, b.lvl)) continue;   // a ghost waits until it can be paid
      const dx = b.x + b.w / 2 - w.x, dy = b.y + b.h / 2 - w.y;
      const d = dx * dx + dy * dy + (b.site.paid ? 0 : 0.5);  // paid sites first at equal distance
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    if (!best.site.paid) { CO.state.money -= CO.fullCost(best.type, best.lvl); best.site.paid = true; }
    best.site.w = w; w.job = best;
  }
  function updateWorkers(dt) {
    syncWorkers();
    const step = CO.WORKERS.speed * dt;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      if (w.job && (w.job.dead || !w.job.site || w.job.site.w !== w)) w.job = null;
      if (!w.job && world.sites.length) claimNearest(w);
      const t = w.job ? { x: w.job.x + w.job.w / 2, y: w.job.y + w.job.h / 2 } : homeOf(i);
      const dx = t.x - w.x, dy = t.y - w.y, d = Math.hypot(dx, dy);
      w.building = false;
      if (d > 0.02) {
        if (step >= d) { w.x = t.x; w.y = t.y; } else { w.x += dx / d * step; w.y += dy / d * step; }
        if (Math.abs(dx) > 0.01) w.face = dx > 0 ? 1 : -1;
        w.moving = true;
        continue;
      }
      w.moving = false;
      if (w.job) {
        const s = w.job.site;
        s.p += dt; w.building = true;
        if (s.p >= s.t) { world.finishSite(w.job); w.job = null; }
      }
    }
  }
  /** How many workers are busy (flying to a site or building it). */
  sim.busyWorkers = function () { let n = 0; for (let i = 0; i < workers.length; i++) if (workers[i].job) n++; return n; };
  // A loaded game starts with its whole crew next to the Port (sites keep their progress).
  CO.on('loaded', function () { for (let i = 0; i < workers.length; i++) workers[i].gone = true; workers.length = 0; });

  const UPDATERS = {
    belt: updateBelt, tunnel_in: updateBelt, tunnel_out: updateBelt,
    router: updateRouter, junction: updateJunction, unloader: updateUnloader, chest: updateChest, drill: updateDrill, machine: updateMachine,
    driver: updateDriver, seller: updateSink, port: updateSink, pump: updatePump, drone_requester: updateChest, launch_pad: function (b, dt) { CO.orbit.updatePad(b, dt); }
  };

  sim.step = function (dt) {
    const st = CO.state;
    st.time += dt;
    CO.fluid.update();                               // pipe networks (rebuilt when the layout changed)
    CO.power.update(dt);                             // network supply / demand → b.pw of every consumer
    const list = world.list;
    for (let i = 0; i < list.length; i++) {
      if (list[i].site) continue;                    // construction sites do nothing yet
      const f = UPDATERS[list[i].kind];
      if (f) f(list[i], dt);
    }
    if (sim.shots.length) updateShots(dt);
    CO.tubes.update(dt);                             // Kéora's quantum network hands the items over
    CO.drones.update(dt);
    updateWorkers(dt);
    tAcc += dt;
    if (tAcc >= 1) {                                   // roll the statistics window
      tAcc -= 1;
      buckets.push(cur); moneyBuckets.push(curMoney);
      pushHistory(cur, curMoney);
      CO.contracts.update();                         // deadlines and new offers
      cur ={ p: {}, u: {}, s: {} }; curMoney = 0;
      if (buckets.length > 60) { buckets.shift(); moneyBuckets.shift(); }
    }
  };
})(window.CO = window.CO || {});
