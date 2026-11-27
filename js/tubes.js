/*
 * tubes.js — Kéora's quantum network: how items travel there (there are no belts nor pipes on Kéora).
 *
 * Tubes, silos, accelerators and relays ("members") that touch form a network; two linked relays join
 * their networks across the map. Every other building touching a member is a "user" of that network:
 *   - a drill or machine whose output arrow points at a member drops what it makes into the network
 *     (sim.js insert → T.put), which holds it in a shared pool;
 *   - the network hands each user what it needs, at once: recipe inputs to machines, fuel to generators,
 *     the active research to labs, what the current step or a contract asks for to the Port;
 *   - what nobody needs for a moment goes to the lab reserve or a silo, later to a sink (Port surplus,
 *     exchange counter); silos give back what a user needs.
 * Every hand-over is a transfer: a network makes T.BASE transfers/s, plus `rate` per powered accelerator.
 * Power does not travel here: it goes in beams of light (power.js).
 */
(function (CO) {
  'use strict';
  const world = CO.world, DX = CO.DX, DY = CO.DY;
  const T = CO.tubes = { nets: [], ver: -1, BASE: 6 };
  const STORE_AGE = 1, SINK_AGE = 2.5, SCAN = 48, DEMAND_EVERY = 0.1;

  function member(b) { return !!b && !b.site && (b.kind === 'ktube' || b.kind === 'ksilo' || b.kind === 'kbooster' || b.kind === 'krelay'); }
  T.member = member;
  /** Does the tube drawn at `b` reach towards neighbour `n`? (any building it touches is connected) */
  T.links = function (b, n) { return !!n && !n.site; };
  function neighbours(b, fn) {
    for (let i = 0; i < b.w; i++) { fn(world.at(b.x + i, b.y - 1)); fn(world.at(b.x + i, b.y + b.h)); }
    for (let j = 0; j < b.h; j++) { fn(world.at(b.x - 1, b.y + j)); fn(world.at(b.x + b.w, b.y + j)); }
  }
  /** The relay `b` is linked to (built, in range), or null. */
  T.relayTarget = function (b) {
    if (!b.target) return null;
    const t = world.at(b.tx, b.ty);
    if (!t || t === b || t.kind !== 'krelay' || t.site || t.x !== b.tx || t.y !== b.ty || CO.sim.driverDist(b, t) > b.def.range) return null;
    return t;
  };
  /** Items a network can hold before the outputs pointing at it stall. */
  function capOf(net) { return 12 + 2 * net.tubes; }

  /** Put the pool of every network back into its tubes (it survives changes of the layout). */
  function writeBack() {
    for (let i = 0; i < T.nets.length; i++) {
      const net = T.nets[i], tubes = net.parts.filter(function (p) { return p.kind === 'ktube' && !p.dead; });
      if (!tubes.length) continue;                       // its last tube is gone: its content with it
      for (let k = 0; k < net.pool.length; k++) tubes[k % tubes.length].kq.push(net.pool[k].t);
      net.pool = [];
    }
  }

  function rebuild() {
    writeBack();
    T.ver = world.version;
    const list = world.list, nets = [], links = new Map();
    const link = function (a, b) { (links.get(a) || links.set(a, []).get(a)).push(b); };
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.knet = null; b.knets = null;
      if (b.kind === 'krelay' && !b.site) { const t = T.relayTarget(b); if (t) { link(b, t); link(t, b); } }
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!member(s) || s.knet) continue;
      const net = { id: nets.length, parts: [], users: [], silos: [], boosters: [], relays: [], pool: [], tubes: 0,
        budget: 0, rate: T.BASE, rr: 0, demand: null, demandT: 0, flow: 0, acc: 0, accT: 0, full: false };
      const stack = [s]; s.knet = net;
      while (stack.length) {
        const b = stack.pop();
        net.parts.push(b);
        if (b.kind === 'ktube') {
          net.tubes++;
          for (let k = 0; k < b.kq.length; k++) net.pool.push({ t: b.kq[k], age: 0 });
          b.kq = [];
        } else if (b.kind === 'ksilo') net.silos.push(b);
        else if (b.kind === 'kbooster') net.boosters.push(b);
        else if (b.kind === 'krelay') net.relays.push(b);
        const push = function (n) { if (member(n) && !n.knet) { n.knet = net; stack.push(n); } };
        neighbours(b, push);
        (links.get(b) || []).forEach(push);
      }
      nets.push(net);
    }
    T.nets = nets;
    if (!nets.length) return;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.site || member(b)) continue;
      const mine = [];
      neighbours(b, function (n) { if (member(n) && mine.indexOf(n.knet) < 0) mine.push(n.knet); });
      if (!mine.length) continue;
      b.knet = mine[0]; b.knets = mine;
      for (let k = 0; k < mine.length; k++) mine[k].users.push(b);
    }
  }
  T.ensure = function () { if (world.version !== T.ver) rebuild(); };

  /** An output arrow (or anything else) drops `item` into the network of member `b`. */
  T.put = function (b, item) {
    T.ensure();
    const net = b.knet;
    if (!net || CO.ITEMS[item].fluid || net.pool.length >= capOf(net)) return false;
    net.pool.push({ t: item, age: 0 });
    return true;
  };

  // ------------------------------------------------------------ demand
  /** Recipes of machine `type` that can be picked by `item` alone (the machine has no recipe yet). */
  function autoRecipe(type, item) {
    let found = null, n = 0;
    for (const id in CO.RECIPES) {
      const r = CO.RECIPES[id];
      if (r.machine === type && r.in[item] && CO.isRecipeUnlocked(id)) { found = r; n++; }
    }
    return n === 1 ? found : null;
  }
  /** Does user `u` need `item` right now (recipe input, fuel, research, goal or contract)? */
  function wants(u, item) {
    if (u.dead || u.site) return false;
    const st = CO.state;
    switch (u.kind) {
      case 'machine': {
        const rec = u.recipe ? CO.RECIPES[u.recipe] : autoRecipe(u.type, item), need = rec && rec.in[item];
        return !!need && (u.inBuf[item] || 0) < need * 2;
      }
      case 'generator': return u.def.fuel === item && u.fuel < CO.power.FUEL_CAP;
      case 'lab': {
        if (!(u.pw > 0) || !st.research) return false;
        const cost = CO.TECHS[st.research].cost[item] || 0;
        return cost > (st.researchProg[item] || 0);
      }
      case 'port': {
        const p = CO.getPhase(st.phase), need = p.need[item] || 0;
        if (need > (st.phaseHave[item] || 0)) return true;
        const c = st.contracts;
        return !!c && c.active.some(function (a) { return a.item === item && a.have < a.qty; });
      }
    }
    return false;
  }
  T.wants = wants;
  /** Every item user `u` needs right now. */
  function wantedBy(u) {
    const out = [], st = CO.state;
    switch (u.kind) {
      case 'machine':
        if (u.recipe) { const rec = CO.RECIPES[u.recipe]; for (const k in rec.in) if (wants(u, k)) out.push(k); }
        else CO.recipesFor(u.type).forEach(function (r) { if (CO.isRecipeUnlocked(r.id)) for (const k in r.in) if (out.indexOf(k) < 0 && wants(u, k)) out.push(k); });
        break;
      case 'generator': if (u.def.fuel && wants(u, u.def.fuel)) out.push(u.def.fuel); break;
      case 'lab': if (st.research) for (const k in CO.TECHS[st.research].cost) if (wants(u, k)) out.push(k); break;
      case 'port': {
        const p = CO.getPhase(st.phase);
        for (const k in p.need) if (wants(u, k)) out.push(k);
        if (st.contracts) st.contracts.active.forEach(function (a) { if (out.indexOf(a.item) < 0 && wants(u, a.item)) out.push(a.item); });
        break;
      }
    }
    return out;
  }
  T.wantedBy = wantedBy;
  /** item → users of `net` that need it. */
  function demandOf(net) {
    const m = new Map();
    for (let i = 0; i < net.users.length; i++) {
      const u = net.users[i], ws = wantedBy(u);
      for (let k = 0; k < ws.length; k++) (m.get(ws[k]) || m.set(ws[k], []).get(ws[k])).push(u);
    }
    return m;
  }

  // ------------------------------------------------------------ hand-overs
  const insert = function (u, item) { return CO.sim.insert(u, item, u.dir, 0, null); };
  /** Give `item` to a user of `net` that needs it (round robin). */
  function deliver(net, item) {
    const us = net.demand.get(item);
    if (!us) return false;
    for (let k = 0; k < us.length; k++) {
      const u = us[(net.rr + k) % us.length];
      if (wants(u, item) && insert(u, item)) { net.rr = (net.rr + k + 1) % 1048576; return true; }
    }
    return false;
  }
  /** Keep `item` for later: the lab reserve (future research), then a silo with room. */
  function store(net, item) {
    for (let i = 0; i < net.users.length; i++) {
      const u = net.users[i];
      if (u.kind === 'lab' && u.pw > 0 && !u.site && CO.bankRoom(item) > 0 && insert(u, item)) return true;
    }
    for (let i = 0; i < net.silos.length; i++) {
      const s = net.silos[i];
      if (s.q.length < s.def.capacity) { s.q.push(item); return true; }
    }
    return false;
  }
  /** Nobody wants `item`: sell it (Port surplus or exchange counter). */
  function sink(net, item) {
    const n = net.users.length;
    for (let k = 0; k < n; k++) {
      const u = net.users[(net.rr + k) % n];
      if ((u.kind === 'seller' || u.kind === 'port') && !u.site && insert(u, item)) return true;
    }
    return false;
  }

  function step(net, dt) {
    let rate = T.BASE;
    for (let i = 0; i < net.boosters.length; i++) {
      const bo = net.boosters[i];
      bo.wants = true;
      rate += bo.def.rate * (bo.pw || 0);
      bo.status = bo.pw > 0 ? 'work' : 'nopower';
    }
    net.rate = rate;
    net.budget = Math.min(net.budget + rate * dt, Math.max(1, rate * 0.25));
    for (let i = 0; i < net.pool.length; i++) net.pool[i].age += dt;
    net.demandT -= dt;
    if (net.demandT <= 0 || !net.demand) { net.demand = demandOf(net); net.demandT = DEMAND_EVERY; }
    let moved = 0;
    for (let i = 0, seen = 0; i < net.pool.length && net.budget >= 1 && seen < SCAN; seen++) {
      const it = net.pool[i];
      if (deliver(net, it.t) || (it.age > STORE_AGE && store(net, it.t)) || (it.age > SINK_AGE && sink(net, it.t))) {
        net.pool.splice(i, 1); net.budget--; moved++;
      } else i++;
    }
    if (net.silos.length) {                                   // silos give back what the users need
      net.demand.forEach(function (users, item) {
        for (let s = 0; s < net.silos.length && net.budget >= 1; s++) {
          const silo = net.silos[s], k = silo.q.indexOf(item);
          if (k < 0) continue;
          if (deliver(net, item)) { silo.q.splice(k, 1); net.budget--; moved++; }
          break;
        }
      });
    }
    net.full = net.pool.length >= capOf(net);
    net.acc += moved; net.accT += dt;
    if (net.accT >= 1) { net.flow = net.acc / net.accT; net.acc = 0; net.accT = 0; }
    for (let i = 0; i < net.relays.length; i++) net.relays[i].status = T.relayTarget(net.relays[i]) ? 'work' : 'idle';
  }

  T.update = function (dt) {
    T.ensure();
    for (let i = 0; i < T.nets.length; i++) step(T.nets[i], dt);
  };

  /** Items of the network kept by tube `b` in a save: the pool is shared out between the tubes. */
  let shareKey = '', shares = new Map();
  T.share = function (b) {
    const net = b.knet;
    if (!net || T.ver !== world.version) return (b.kq || []).slice();
    const key = world.version + ':' + CO.state.time;
    if (key !== shareKey) {
      shareKey = key; shares = new Map();
      for (let i = 0; i < T.nets.length; i++) {
        const n = T.nets[i], tubes = n.parts.filter(function (p) { return p.kind === 'ktube'; });
        for (let k = 0; k < n.pool.length && tubes.length; k++) {
          const t = tubes[k % tubes.length];
          (shares.get(t) || shares.set(t, []).get(t)).push(n.pool[k].t);
        }
      }
    }
    return (shares.get(b) || []).concat(b.kq || []);
  };
  /** item → count of what waits in `net` (pool). */
  T.contents = function (net) {
    const out = {};
    for (let i = 0; i < net.pool.length; i++) out[net.pool[i].t] = (out[net.pool[i].t] || 0) + 1;
    return out;
  };
  T.capOf = capOf;
  CO.on('loaded', function () { T.nets = []; T.ver = -1; shareKey = ''; });
})(window.CO = window.CO || {});
