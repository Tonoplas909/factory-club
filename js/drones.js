/*
 * drones.js — late-game air logistics.
 *
 * A drone port holds a few drones. Within its range, send chests ("drone_provider") are filled by belts,
 * and request chests ("drone_requester") ask for one item (their filter) and push it out through their
 * arrow, like a buffer chest. An idle drone looks for a request chest short of its item, picks the
 * nearest send chest holding some, reserves up to CARRY items there, flies to fetch them, delivers them
 * and comes back home. Drones are not saved: a reload sends them home, and what they were carrying is
 * saved into the request chest it was meant for (see world.serializeBuilding).
 */
(function (CO) {
  'use strict';
  const world = CO.world;
  const CARRY = 10, SPEED = 12, TICK_PICK = 0.25;   // items per trip, tiles per second, seconds to load/unload
  const D = CO.drones = { CARRY: CARRY, SPEED: SPEED, ver: -1 };

  function centre(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  /** Is building `b` within the range of hub `h`? (square range around the hub, like the power zones) */
  D.inRange = function (h, b) {
    const r = h.def.range, c = centre(h), d = centre(b);
    return Math.abs(d.x - c.x) <= r && Math.abs(d.y - c.y) <= r;
  };
  function count(q, item) { let n = 0; for (let i = 0; i < q.length; i++) if (q[i] === item) n++; return n; }

  function rebuild() {
    D.ver = world.version;
    const list = world.list, hubs = [], prov = [], req = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.site) continue;
      if (b.kind === 'drone_hub') hubs.push(b);
      else if (b.kind === 'drone_provider') prov.push(b);
      else if (b.kind === 'drone_requester') req.push(b);
    }
    for (let i = 0; i < hubs.length; i++) {
      const h = hubs[i];
      h.prov = prov.filter(function (b) { return D.inRange(h, b); });
      h.req = req.filter(function (b) { return D.inRange(h, b); });
    }
    D.hubs = hubs;
    // Reservations are rebuilt from the drones still flying (a removed hub must not keep items booked).
    for (let i = 0; i < prov.length; i++) prov[i].reserved = {};
    for (let i = 0; i < req.length; i++) req[i].incoming = 0;
    for (let i = 0; i < hubs.length; i++) {
      const ds = hubs[i].drones || [];
      for (let k = 0; k < ds.length; k++) {
        const d = ds[k], j = d.job;
        if (!j) continue;
        if (j.to.dead || (d.state === 'fetch' && j.from.dead)) { d.job = null; d.cargo = 0; d.state = 'home'; continue; }
        if (d.state === 'fetch') { j.from.reserved = j.from.reserved || {}; j.from.reserved[j.item] = (j.from.reserved[j.item] || 0) + j.n; }
        j.to.incoming = (j.to.incoming || 0) + j.n;
      }
    }
  }

  function newDrone(h) { const c = centre(h); return { x: c.x, y: c.y, state: 'idle', job: null, cargo: 0, wait: 0 }; }

  /** Find work for an idle drone of hub `h`. */
  function assign(h, d) {
    for (let i = 0; i < h.req.length; i++) {
      const r = h.req[i];
      if (r.dead || !r.filter) continue;
      const need = r.def.want - count(r.q, r.filter) - (r.incoming || 0);
      if (need <= 0) continue;
      let best = null, bd = Infinity;
      for (let j = 0; j < h.prov.length; j++) {
        const p = h.prov[j];
        if (p.dead) continue;
        const avail = count(p.q, r.filter) - ((p.reserved && p.reserved[r.filter]) || 0);
        if (avail <= 0) continue;
        const c = centre(p), dist = Math.hypot(c.x - d.x, c.y - d.y);
        if (dist < bd) { bd = dist; best = p; }
      }
      if (!best) continue;
      const n = Math.min(CARRY, need, count(best.q, r.filter) - ((best.reserved && best.reserved[r.filter]) || 0));
      best.reserved = best.reserved || {};
      best.reserved[r.filter] = (best.reserved[r.filter] || 0) + n;
      r.incoming = (r.incoming || 0) + n;
      d.job = { from: best, to: r, item: r.filter, n: n }; d.state = 'fetch';
      return true;
    }
    return false;
  }
  function release(d) {                              // cancel the reservations of a job
    const j = d.job;
    if (!j) return;
    if (d.state === 'fetch' && j.from.reserved) j.from.reserved[j.item] = Math.max(0, (j.from.reserved[j.item] || 0) - j.n);
    if (d.state === 'fetch' || d.state === 'deliver') j.to.incoming = Math.max(0, (j.to.incoming || 0) - j.n);
    d.job = null; d.cargo = 0;
  }
  function moveTo(d, t, step) {
    const dx = t.x - d.x, dy = t.y - d.y, dist = Math.hypot(dx, dy);
    if (dist <= step) { d.x = t.x; d.y = t.y; return true; }
    d.x += dx / dist * step; d.y += dy / dist * step; d.face = dx >= 0 ? 1 : -1;
    return false;
  }

  D.update = function (dt) {
    if (world.version !== D.ver) rebuild();
    for (let i = 0; i < D.hubs.length; i++) {
      const h = D.hubs[i], n = h.def.drones;
      h.drones = h.drones || [];
      while (h.drones.length < n) h.drones.push(newDrone(h));
      let busy = 0;
      const pw = h.pw || 0, step = SPEED * pw * dt;
      for (let k = 0; k < h.drones.length; k++) {
        const d = h.drones[k];
        if (d.state !== 'idle') busy++;
        if (pw <= 0) continue;                         // no power: drones hover in place
        if (d.wait > 0) { d.wait -= dt; continue; }
        if (d.state === 'idle') { assign(h, d); continue; }
        const j = d.job;
        if (d.state === 'fetch') {
          if (!j || j.from.dead || j.to.dead) { release(d); d.state = 'home'; continue; }
          if (!moveTo(d, centre(j.from), step)) continue;
          // load what is really there (a belt may have taken some away meanwhile)
          j.from.reserved[j.item] = Math.max(0, (j.from.reserved[j.item] || 0) - j.n);
          let got = 0;
          for (let q = j.from.q.length - 1; q >= 0 && got < j.n; q--) if (j.from.q[q] === j.item) { j.from.q.splice(q, 1); got++; }
          j.to.incoming = Math.max(0, (j.to.incoming || 0) - (j.n - got));
          j.n = got; d.cargo = got; d.wait = TICK_PICK;
          d.state = got ? 'deliver' : 'home';
          if (!got) d.job = null;
        } else if (d.state === 'deliver') {
          if (!j || j.to.dead) { d.job = null; d.cargo = 0; d.state = 'home'; continue; }   // cargo lost with its target
          if (!moveTo(d, centre(j.to), step)) continue;
          for (let q = 0; q < j.n; q++) j.to.q.push(j.item);
          j.to.incoming = Math.max(0, (j.to.incoming || 0) - j.n);
          d.job = null; d.cargo = 0; d.wait = TICK_PICK; d.state = 'home';
        } else if (d.state === 'home') {
          if (moveTo(d, centre(h), step)) d.state = 'idle';
          else if (assign(h, d)) { /* takes a new job on the way back */ }
        }
      }
      h.wants = busy > 0;
      h.status = pw <= 0 && busy ? 'nopower' : busy ? 'work' : 'idle';
    }
  };

  /** Items flying towards request chest `b` (saved into it). */
  D.inFlightTo = function (b) {
    const out = [];
    const hubs = D.hubs || [];
    for (let i = 0; i < hubs.length; i++) {
      const ds = hubs[i].drones || [];
      for (let k = 0; k < ds.length; k++) {
        const d = ds[k];
        if (d.job && d.job.to === b && d.state === 'deliver') for (let q = 0; q < d.cargo; q++) out.push(d.job.item);
      }
    }
    return out;
  };
  /** Every drone, for the renderers: {x, y, item (carried) or null}. */
  D.all = function () {
    const out = [], hubs = D.hubs || [];
    for (let i = 0; i < hubs.length; i++) {
      const ds = hubs[i].drones || [];
      for (let k = 0; k < ds.length; k++) out.push({ x: ds[k].x, y: ds[k].y, item: ds[k].cargo ? ds[k].job.item : null, idle: ds[k].state === 'idle', face: ds[k].face || 1 });
    }
    return out;
  };
  CO.on('loaded', function () { D.ver = -1; D.hubs = []; });
})(window.CO = window.CO || {});
