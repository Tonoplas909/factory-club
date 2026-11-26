/*
 * power.js — electricity. Machines, drills and labs only work when a power
 * network reaches them, and they slow down when the network is short.
 *
 * Nodes are the Port (a built-in plant), generators and poles. Each node has a coverage zone (its
 * footprint grown by `def.cover`); a consumer touching the zone of a node belongs to its network.
 * Two nodes are in the same network when:
 *   - one is a pole and the other is within its reach (`def.reach`, centre to the nearest cell),
 *   - or the zone of one touches the other (a generator right next to the Port, for example).
 * Wires are only drawn along a spanning tree of each network (shortest links first), so dense grids of
 * poles stay readable.
 *
 * Each tick: supply = what the generators can give (a thermal generator needs coal), demand = the
 * nominal power of every consumer that wants to work (`b.wants`, set by the simulation), and every
 * consumer runs at `b.pw` = min(1, supply / demand) of its speed. Thermal generators burn fuel in
 * proportion to the load.
 */
(function (CO) {
  'use strict';
  const world = CO.world;
  const FUEL_CAP = 10;
  const PW = CO.power = { nets: [], links: [], ver: -1, supply: 0, demand: 0, unpowered: 0, FUEL_CAP: FUEL_CAP };

  function isNode(b) { return !b.site && (b.kind === 'pole' || b.kind === 'generator' || b.kind === 'port'); }
  PW.isConsumer = function (b) { return !!b.def.power; };
  /** Coverage zone of a node: [x0, x1) × [y0, y1) in cells. */
  PW.zone = function (b) { const r = b.def.cover || 0; return { x0: b.x - r, y0: b.y - r, x1: b.x + b.w + r, y1: b.y + b.h + r }; };
  function touches(z, b) { return b.x < z.x1 && b.x + b.w > z.x0 && b.y < z.y1 && b.y + b.h > z.y0; }
  /** Distance from the centre of pole `p` to the nearest point of building `b`. */
  function reachDist(p, b) {
    const px = p.x + 0.5, py = p.y + 0.5;
    if (b.kind === 'pole') return Math.hypot(b.x + 0.5 - px, b.y + 0.5 - py);
    const dx = Math.max(b.x - px, 0, px - (b.x + b.w)), dy = Math.max(b.y - py, 0, py - (b.y + b.h));
    return Math.hypot(dx, dy);
  }
  /** Link length between two nodes if they connect, else -1. `wire` tells whether a wire is drawn. */
  function linkOf(a, b) {
    if (a.kind === 'pole' && b.kind === 'pole') {          // fast path: two poles link by reach only
      const dx = a.x - b.x, dy = a.y - b.y, r = Math.min(a.def.reach, b.def.reach);
      if (dx > r || dx < -r || dy > r || dy < -r) return -1;
      const d = Math.sqrt(dx * dx + dy * dy);
      return d <= r + 1e-9 ? d : -1;
    }
    if (a.kind === 'pole' || b.kind === 'pole') {
      const p = a.kind === 'pole' ? a : b, o = p === a ? b : a;
      const reach = o.kind === 'pole' ? Math.min(p.def.reach, o.def.reach) : p.def.reach;
      const d = reachDist(p, o);
      if (d <= reach + 1e-9) return d;
    }
    if (touches(PW.zone(a), b) || touches(PW.zone(b), a)) return 0;
    return -1;
  }
  /** Can a pole of type `type` at (x, y) reach node `n`? (used for the placement preview) */
  PW.reaches = function (type, x, y, n) {
    const def = CO.BUILDINGS[type], p = { kind: 'pole', x: x, y: y, w: 1, h: 1, def: def };
    return n !== p && linkOf(p, n) >= 0;
  };

  function rebuild() {
    PW.ver = world.version;
    const list = world.list, nodes = [], cons = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.net = null;
      if (isNode(b)) nodes.push(b);
      else if (!b.site && PW.isConsumer(b)) { cons.push(b); b.pw = 0; }
    }
    // Kruskal: candidate links sorted by length, union-find for the networks.
    const parent = nodes.map(function (_, i) { return i; });
    const find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    // Spatial buckets of GRID cells: every possible link (reach ≤ 18, zones ≤ 6) joins neighbouring buckets.
    const GRID = 24, buckets = new Map();
    const bkey = function (bx, by) { return bx * 4096 + by; };
    const bucketOf = function (b) { return [Math.floor((b.x + b.w / 2) / GRID), Math.floor((b.y + b.h / 2) / GRID)]; };
    for (let i = 0; i < nodes.length; i++) {
      const k = bucketOf(nodes[i]), key = bkey(k[0], k[1]);
      let arr = buckets.get(key); if (!arr) buckets.set(key, arr = []);
      arr.push(i);
    }
    const near = function (b, fn) {
      const k = bucketOf(b);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = buckets.get(bkey(k[0] + dx, k[1] + dy));
        if (arr) for (let q = 0; q < arr.length; q++) fn(arr[q]);
      }
    };
    const cand = [];
    for (let i = 0; i < nodes.length; i++) near(nodes[i], function (j) {
      if (j <= i) return;
      const d = linkOf(nodes[i], nodes[j]);
      if (d >= 0) cand.push([d, i, j]);
    });
    cand.sort(function (a, b) { return a[0] - b[0]; });
    const links = [];
    for (let k = 0; k < cand.length; k++) {
      const a = find(cand[k][1]), b = find(cand[k][2]);
      if (a === b) continue;
      parent[a] = b;
      const na = nodes[cand[k][1]], nb = nodes[cand[k][2]];
      if (na.kind === 'pole' || nb.kind === 'pole') links.push([na, nb]);
    }
    const byRoot = {}, nets = [];
    for (let i = 0; i < nodes.length; i++) {
      const r = find(i);
      let net = byRoot[r];
      if (!net) { net = byRoot[r] = { id: nets.length, nodes: [], gens: [], cons: [], supply: 0, demand: 0, sat: 0, load: 0 }; nets.push(net); }
      net.nodes.push(nodes[i]); nodes[i].net = net;
      if (nodes[i].def.gen) net.gens.push(nodes[i]);
    }
    for (let i = 0; i < cons.length; i++) {
      const c = cons[i];
      near(c, function (j) { if (!c.net && touches(PW.zone(nodes[j]), c)) { c.net = nodes[j].net; c.net.cons.push(c); } });
    }
    PW.nets = nets; PW.links = links;
  }

  /** What generator `g` can give right now (kW). */
  function available(g) {
    const gen = g.def.gen * (g.kind === 'port' ? 1 : CO.lvlSpeed(g) * (CO.mods.power || 1));
    if (!g.def.fuel) return gen;
    if (g.def.water && !(CO.fluid.amount(g, 'water') > 0)) return 0;   // a steam plant also needs water
    return g.burn > 0 || g.fuel > 0 ? gen : 0;
  }

  PW.update = function (dt) {
    if (world.version !== PW.ver) rebuild();
    const research = !!CO.state.research;
    let ts = 0, td = 0, off = 0;
    for (let n = 0; n < PW.nets.length; n++) {
      const net = PW.nets[n];
      let supply = 0, demand = 0;
      for (let i = 0; i < net.gens.length; i++) supply += available(net.gens[i]);
      for (let i = 0; i < net.cons.length; i++) {
        const c = net.cons[i];
        if (c.kind === 'lab') c.wants = research;
        if (c.wants) demand += c.def.power * CO.lvlPower(c);
      }
      net.supply = supply; net.demand = demand;
      net.sat = supply <= 0 ? 0 : demand <= 0 ? 1 : Math.min(1, supply / demand);
      net.load = supply > 0 ? Math.min(1, demand / supply) : 0;
      for (let i = 0; i < net.gens.length; i++) {
        const g = net.gens[i];
        if (!g.def.fuel) { g.status = net.load > 0 ? 'work' : 'idle'; continue; }
        if (g.burn <= 0 && g.fuel <= 0) { g.status = 'nofuel'; continue; }
        if (g.def.water && !(CO.fluid.amount(g, 'water') > 0)) { g.status = 'nowater'; continue; }
        if (net.load <= 0) { g.status = 'idle'; continue; }
        const sp = CO.lvlSpeed(g);                     // an upgraded generator gives more and burns faster
        if (g.def.water) CO.fluid.take(g, 'water', g.def.water * net.load * sp * dt);
        if (g.burn <= 0) { g.fuel--; g.burn += g.def.burn; CO.sim.countUsed(g.def.fuel, 1); }
        g.burn = Math.max(0, g.burn - dt * net.load * sp);
        g.status = 'work';
      }
      for (let i = 0; i < net.cons.length; i++) {
        const c = net.cons[i];
        c.pw = net.sat;
        if (c.wants && net.sat <= 0) off++;
      }
      ts += supply; td += demand;
    }
    // consumers outside every network
    const list = world.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.net && !b.site && b.def.power) { b.pw = 0; if (b.kind === 'lab') b.wants = research; if (b.wants) off++; }
    }
    PW.supply = ts; PW.demand = td; PW.unpowered = off;
  };

  /** A thermal generator takes its fuel from belts, on any side. */
  PW.fuelIn = function (g, item) {
    if (!g.def.fuel || item !== g.def.fuel || g.fuel >= FUEL_CAP) return false;
    g.fuel++;
    return true;
  };
  CO.on('loaded', function () { PW.ver = -1; });
})(window.CO = window.CO || {});
