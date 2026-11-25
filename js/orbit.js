/*
 * orbit.js — the orbital program: rockets launched from launch pads carry payloads (satellites, deep
 * probes) for a sequence of missions (CO.MISSIONS). Each mission done gives a permanent bonus
 * (CO.orbitBonus, applied by CO.recalcMods); past the last one, endless deep missions pay credits.
 *
 * A launch pad goes through three phases:
 *   load   — belts bring rocket parts (def.parts of them) and one payload the current mission still needs;
 *   build  — the rocket is assembled (ASSEMBLE seconds, slower without full power);
 *   flight — the rocket climbs (FLIGHT seconds), then its payload counts for the mission.
 */
(function (CO) {
  'use strict';
  const O = CO.orbit = { ASSEMBLE: 10, FLIGHT: 6, PAYLOADS: ['satellite', 'probe'] };
  function S() { return CO.state.orbit; }

  /** Sum of the bonuses of the missions done. */
  CO.orbitBonus = function () {
    const st = CO.state, out = {};
    if (!st || !st.orbit) return out;
    for (let i = 0; i < Math.min(st.orbit.mission, CO.MISSIONS.length); i++) {
      const b = CO.MISSIONS[i].bonus;
      for (const k in b) out[k] = (out[k] || 0) + b[k];
    }
    return out;
  };
  /** Payloads still missing for the current mission (counting those already sitting on pads). */
  O.missing = function (item) {
    const m = CO.getMission(S().mission), need = m.need[item] || 0;
    let onPads = 0;
    const list = CO.world.list;
    for (let i = 0; i < list.length; i++) if (list[i].kind === 'launch_pad' && list[i].payload === item) onPads++;
    return need - (S().have[item] || 0) - onPads;
  };

  /** Belts feeding a launch pad (any side). */
  O.padIn = function (b, item) {
    if (b.phase !== 'load') return false;
    if (item === 'rocket_part') {
      if (b.parts >= b.def.parts) return false;
      b.parts++; CO.sim.countUsed(item, 1); return true;
    }
    if (O.PAYLOADS.indexOf(item) >= 0) {
      if (b.payload || O.missing(item) <= 0) return false;   // only what the mission still needs
      b.payload = item; CO.sim.countUsed(item, 1); return true;
    }
    return false;
  };

  O.updatePad = function (b, dt) {
    const pw = b.pw || 0;
    if (b.phase === 'load') {
      const ready = b.parts >= b.def.parts && !!b.payload;
      b.wants = ready;
      if (!ready) { b.status = 'idle'; return; }
      if (pw <= 0) { b.status = 'nopower'; return; }
      b.phase = 'build'; b.t = 0;
    }
    if (b.phase === 'build') {
      b.wants = true;
      if (pw <= 0) { b.status = 'nopower'; return; }
      b.t += dt * pw; b.status = 'work';
      if (b.t >= O.ASSEMBLE) {
        b.phase = 'flight'; b.t = 0;
        CO.emit('toast', 'Décollage ! La fusée emporte ' + (b.payload === 'probe' ? 'une sonde profonde' : 'un satellite') + '.', 'good');
      }
      return;
    }
    if (b.phase === 'flight') {
      b.wants = false; b.status = 'work';
      b.t += dt;
      if (b.t >= O.FLIGHT) { const item = b.payload; b.parts = 0; b.payload = null; b.phase = 'load'; b.t = 0; arrive(item); }
    }
  };

  function arrive(item) {
    const o = S();
    o.launches++;
    o.have[item] = (o.have[item] || 0) + 1;
    const m = CO.getMission(o.mission);
    for (const k in m.need) if ((o.have[k] || 0) < m.need[k]) { CO.emit('orbit'); return; }
    if (m.reward) CO.state.money += m.reward;
    o.mission++; o.have = {};
    CO.recalcMods();
    CO.emit('orbit');
    CO.emit('mission', m);
  }
  /** Altitude (tiles) of the rocket of a pad in flight, for the renderers. */
  O.altitude = function (b) { return b.phase === 'flight' ? 0.5 + 1.2 * b.t * b.t : 0; };
})(window.CO = window.CO || {});
