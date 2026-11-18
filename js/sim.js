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
  const sim = CO.sim = {};
  CO.fx = [];                  // floating "+12" texts, drawn by render.js

  // ------------------------------------------------------------- statistics
  let cur = {}, curMoney = 0, tAcc = 0;
  const buckets = [], moneyBuckets = [];   // one entry per simulated second, last 60 s
  sim.countProduced = function (item, n) {
    const p = CO.state.stats.produced;
    p[item] = (p[item] || 0) + n;
    cur[item] = (cur[item] || 0) + n;
  };
  sim.countIncome = function (n) { curMoney += n; };
  function windowSeconds() { return Math.max(15, buckets.length + tAcc); }
  /** Items produced per minute (rolling window of the last minute). */
  sim.ratePerMin = function (item) {
    let s = cur[item] || 0;
    for (let i = 0; i < buckets.length; i++) s += buckets[i][item] || 0;
    return s * 60 / windowSeconds();
  };
  sim.moneyPerMin = function () {
    let s = curMoney;
    for (let i = 0; i < moneyBuckets.length; i++) s += moneyBuckets[i];
    return s * 60 / windowSeconds();
  };
  sim.resetStats = function () { cur = {}; curMoney = 0; tAcc = 0; buckets.length = 0; moneyBuckets.length = 0; CO.fx.length = 0; };

  // --------------------------------------------------------------- helpers
  /** Direction in which building `n` pushes items into cell (x,y), or -1. */
  function outputsTo(n, x, y) {
    switch (n.kind) {
      case 'belt': case 'tunnel_out':
        return (n.x + DX[n.dir] === x && n.y + DY[n.dir] === y) ? n.dir : -1;
      case 'router': {
        if (n.type === 'splitter') {
          for (let k = 0; k < 3; k++) {
            const d = (n.dir + 3 + k) & 3;
            if (n.x + DX[d] === x && n.y + DY[d] === y) return d;
          }
          return -1;
        }
        return (n.x + DX[n.dir] === x && n.y + DY[n.dir] === y) ? n.dir : -1;
      }
      case 'chest': case 'machine': case 'drill': {
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
      case 'router': return n.slot !== null;
      case 'chest': return n.q.length > 0;
      case 'machine': return n.outBuf.length > 0;
      case 'drill': return n.out.length > 0;
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
    switch (t.kind) {
      case 'belt': case 'tunnel_in': return beltIn(t, item, dir, carry);
      case 'router': return routerIn(t, item, dir);
      case 'chest':
        if (dir === ((t.dir + 2) & 3) || t.q.length >= t.def.capacity) return false;
        t.q.push(item); return true;
      case 'machine': return machineIn(t, item, dir);
      case 'lab': return labIn(t, item);
      case 'seller': { const p = ITEMS[item].price; CO.addMoney(p); t.pend += p; return true; }
      case 'port': return portIn(t, item);
    }
    return false; // drills and tunnel exits accept nothing from belts
  }

  function beltIn(b, item, dir, carry) {
    if (dir === ((b.dir + 2) & 3)) return false;            // head-on
    const its = b.items, n = its.length;
    if (n && its[n - 1].p < carry + GAP) return false;       // no room at the entrance
    if (b.lastIn === dir && contested(b, dir)) return false; // let the other input go first
    its.push({ t: item, p: carry, f: (dir + 2) & 3 });
    b.lastIn = dir;
    return true;
  }

  function exitIn(ex, item) {
    const its = ex.items;
    if (its.length && its[its.length - 1].p < 0.5 + GAP) return false;
    its.push({ t: item, p: 0.5, f: (ex.dir + 2) & 3 });
    return true;
  }

  function routerIn(b, item, dir) {
    if (b.slot !== null) return false;
    if (b.type === 'splitter') { if (dir !== b.dir) return false; }
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

  function labIn(b, item) {
    const st = CO.state;
    if (!st.research) return false;
    const need = CO.TECHS[st.research].cost[item] || 0, have = st.researchProg[item] || 0;
    if (have >= need) return false;
    st.researchProg[item] = have + 1;
    b.pend = 0;
    if (CO.researchDone()) CO.completeResearch();
    return true;
  }

  function portIn(b, item) {
    const st = CO.state, ph = CO.getPhase(st.phase);
    const need = ph.need[item] || 0, have = st.phaseHave[item] || 0;
    if (have < need) {
      st.phaseHave[item] = have + 1; st.stats.delivered++;
      if (CO.phaseDone()) CO.completePhase();
    } else {                                   // surplus is sold at the fixed price
      const p = ITEMS[item].price; CO.addMoney(p); b.pend += p;
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
    if (b.timer < 0.1) return;
    const item = b.slot;
    let c;
    if (b.type === 'merger') c = [b.dir];
    else if (b.filter) c = item === b.filter ? [b.dir] : [(b.dir + 3) & 3, (b.dir + 1) & 3];
    else c = [b.dir, (b.dir + 3) & 3, (b.dir + 1) & 3];
    const n = c.length;
    for (let k = 0; k < n; k++) {
      const d = c[(b.rr + k) % n];
      const t = world.at(b.x + DX[d], b.y + DY[d]);
      if (t && insert(t, item, d, 0, b)) { b.slot = null; b.rr = (b.rr + k + 1) % n; return; }
    }
  }

  function updateChest(b, dt) {
    b.outT += dt;
    if (b.q.length && b.outT >= 0.18) {
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
    if (!b.ore) { b.status = 'idle'; return; }
    if (b.out.length >= 4) { b.status = 'blocked'; b.acc = Math.min(b.acc, 1); return; }
    b.acc += dt * b.n * b.def.perTile * CO.mods.drill;
    b.status = 'work';
    if (b.acc >= 1) { b.acc -= 1; b.out.push(b.ore); sim.countProduced(b.ore, 1); }
  }

  function outTotal(rec) { let n = 0; for (const k in rec.out) n += rec.out[k]; return n; }

  function updateMachine(b, dt) {
    if (b.outBuf.length) flush(b, b.outBuf);
    const rec = b.recipe ? RECIPES[b.recipe] : null;
    if (!rec) { b.status = 'idle'; return; }
    const room = b.outBuf.length + outTotal(rec) <= OUT_CAP;
    if (b.crafting) {
      b.prog += dt * CO.mods.machine;
      if (b.prog >= rec.time) {
        if (!room) { b.prog = rec.time; b.status = 'blocked'; return; }
        b.crafting = false; b.prog = 0;
        for (const k in rec.out) for (let i = 0; i < rec.out[k]; i++) b.outBuf.push(k);
        for (const k in rec.out) sim.countProduced(k, rec.out[k]);
      } else { b.status = 'work'; return; }
    }
    let can = true;
    for (const k in rec.in) if ((b.inBuf[k] || 0) < rec.in[k]) { can = false; break; }
    if (can && room) {
      for (const k in rec.in) b.inBuf[k] -= rec.in[k];
      b.crafting = true; b.prog = 0; b.status = 'work';
    } else b.status = can ? 'blocked' : 'idle';
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

  const UPDATERS = {
    belt: updateBelt, tunnel_in: updateBelt, tunnel_out: updateBelt,
    router: updateRouter, chest: updateChest, drill: updateDrill, machine: updateMachine,
    seller: updateSink, port: updateSink
  };

  sim.step = function (dt) {
    const st = CO.state;
    st.time += dt;
    const list = world.list;
    for (let i = 0; i < list.length; i++) {
      const f = UPDATERS[list[i].kind];
      if (f) f(list[i], dt);
    }
    tAcc += dt;
    if (tAcc >= 1) {                                   // roll the statistics window
      tAcc -= 1;
      buckets.push(cur); moneyBuckets.push(curMoney);
      cur = {}; curMoney = 0;
      if (buckets.length > 60) { buckets.shift(); moneyBuckets.shift(); }
    }
  };
})(window.CO = window.CO || {});
