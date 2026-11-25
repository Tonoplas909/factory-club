/*
 * fluid.js — water and oil in pipes.
 *
 * Pipes and tanks ("conductors") that touch form a network: one shared tank holding a single fluid,
 * whose capacity is 100 per pipe plus each tank's capacity. There is no pressure or flow speed: what a
 * pump puts in is available at once to every machine touching the network.
 * Other fluid buildings (pumps, steam plants, refineries) do not conduct: they use every network whose
 * pipes touch their footprint. So a refinery may take oil on one side and water on another without
 * mixing them.
 *
 * Contents survive changes of the pipe layout: before rebuilding, each network's content is shared out
 * between its conductors in proportion to their capacity (b.fa / b.ff), and the new networks add them
 * back up. When two networks of different fluids are joined, the larger content wins.
 */
(function (CO) {
  'use strict';
  const world = CO.world, DX = CO.DX, DY = CO.DY;
  const PIPE_CAP = 100;
  const F = CO.fluid = { nets: [], ver: -1, PIPE_CAP: PIPE_CAP };

  function conducts(b) { return !!b && !b.site && (b.kind === 'pipe' || b.kind === 'fluid_tank'); }
  function capOf(b) { return b.kind === 'fluid_tank' ? b.def.capacity : PIPE_CAP; }
  /** Does a pipe drawn at `b` connect towards neighbour `n`? (for the pipe sprites) */
  F.links = function (b, n) { return !!n && !n.site && (n.kind === 'pipe' || n.kind === 'fluid_tank' || !!n.def.fluidIO); };

  /** Share the content of every network back into its conductors. */
  function writeBack() {
    for (let i = 0; i < F.nets.length; i++) {
      const net = F.nets[i];
      for (let j = 0; j < net.parts.length; j++) {
        const b = net.parts[j];
        b.fa = net.cap > 0 ? net.amount * capOf(b) / net.cap : 0;
        b.ff = b.fa > 0 ? net.fluid : null;
      }
    }
  }
  /** Fluid and amount held by one conductor (for saves). */
  F.contentOf = function (b) {
    const net = b.fnet;
    if (net && F.ver === world.version) return { f: net.fluid, a: net.cap > 0 ? net.amount * capOf(b) / net.cap : 0 };
    return { f: b.ff, a: b.fa || 0 };
  };

  function neighbours(b, fn) {
    for (let i = 0; i < b.w; i++) { fn(world.at(b.x + i, b.y - 1)); fn(world.at(b.x + i, b.y + b.h)); }
    for (let j = 0; j < b.h; j++) { fn(world.at(b.x - 1, b.y + j)); fn(world.at(b.x + b.w, b.y + j)); }
  }

  function rebuild() {
    writeBack();
    F.ver = world.version;
    const list = world.list, nets = [];
    for (let i = 0; i < list.length; i++) { list[i].fnet = null; list[i].fnets = null; }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!conducts(s) || s.fnet) continue;
      const net = { id: nets.length, parts: [], users: [], cap: 0, amount: 0, fluid: null };
      const byFluid = {};
      const stack = [s]; s.fnet = net;
      while (stack.length) {
        const b = stack.pop();
        net.parts.push(b); net.cap += capOf(b);
        if (b.fa > 0 && b.ff) byFluid[b.ff] = (byFluid[b.ff] || 0) + b.fa;
        neighbours(b, function (n) { if (conducts(n) && !n.fnet) { n.fnet = net; stack.push(n); } });
      }
      let best = null;
      for (const f in byFluid) if (!best || byFluid[f] > byFluid[best]) best = f;
      net.fluid = best; net.amount = best ? Math.min(net.cap, byFluid[best]) : 0;
      nets.push(net);
    }
    // users: fluid buildings touching the pipes
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.site || conducts(b) || !b.def.fluidIO) continue;
      const mine = [];
      neighbours(b, function (n) { if (conducts(n) && mine.indexOf(n.fnet) < 0) mine.push(n.fnet); });
      b.fnets = mine;
      for (let k = 0; k < mine.length; k++) mine[k].users.push(b);
    }
    F.nets = nets;
  }
  F.update = function () { if (world.version !== F.ver) rebuild(); };

  /** Amount of `fluid` within reach of building `b`. */
  F.amount = function (b, fluid) {
    const ns = b.fnets;
    if (!ns) return 0;
    let a = 0;
    for (let i = 0; i < ns.length; i++) if (ns[i].fluid === fluid) a += ns[i].amount;
    return a;
  };
  /** Free room for `fluid` around `b` (networks holding it, or empty ones). */
  F.room = function (b, fluid) {
    const ns = b.fnets;
    if (!ns) return 0;
    let r = 0;
    for (let i = 0; i < ns.length; i++) if (ns[i].fluid === fluid || ns[i].amount <= 0) r += ns[i].cap - ns[i].amount;
    return r;
  };
  /** Take up to `n` of `fluid` from the networks around `b`; returns what was taken. */
  F.take = function (b, fluid, n) {
    const ns = b.fnets;
    if (!ns || n <= 0) return 0;
    let got = 0;
    for (let i = 0; i < ns.length && got < n; i++) {
      const net = ns[i];
      if (net.fluid !== fluid) continue;
      const t = Math.min(net.amount, n - got);
      net.amount -= t; got += t;
      if (net.amount <= 1e-6) { net.amount = 0; net.fluid = null; }
    }
    return got;
  };
  /** Put up to `n` of `fluid` into the networks around `b`; returns what went in. */
  F.give = function (b, fluid, n) {
    const ns = b.fnets;
    if (!ns || n <= 0) return 0;
    let put = 0;
    for (let i = 0; i < ns.length && put < n; i++) {
      const net = ns[i];
      if (net.fluid !== fluid && net.amount > 0) continue;
      const t = Math.min(net.cap - net.amount, n - put);
      if (t <= 0) continue;
      net.fluid = fluid; net.amount += t; put += t;
    }
    return put;
  };
  CO.on('loaded', function () { F.nets = []; F.ver = -1; });
})(window.CO = window.CO || {});
