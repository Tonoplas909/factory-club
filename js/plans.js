/*
 * plans.js — the library of construction plans: named blueprints kept in the browser, shared by every
 * game (they are not part of a save). A blueprint is the clipboard format of input.js:
 *   { w, h, items: [{ type, rx, ry, dir, cfg: {recipe, filter}, tr }] }
 */
(function (CO) {
  'use strict';
  const KEY = 'chantier-orbital-plans';
  const P = CO.plans = { rev: 0 };
  let plans = null;

  function valid(bp) {
    return bp && bp.w > 0 && bp.h > 0 && Array.isArray(bp.items) && bp.items.length > 0 &&
      bp.items.every(function (it) { return CO.BUILDINGS[it.type] && !CO.BUILDINGS[it.type].fixed && it.dir >= 0 && it.dir < 4; });
  }
  function load() {
    if (plans) return plans;
    plans = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(raw)) plans = raw.filter(function (p) { return p && typeof p.name === 'string' && valid(p.bp); });
    } catch (e) { plans = []; }      // storage unavailable or corrupt: start with an empty library
    return plans;
  }
  function store() {
    P.rev++;
    try { localStorage.setItem(KEY, JSON.stringify(plans)); return true; } catch (e) { return false; }
  }

  /** Plans, most recent first. */
  P.list = function () { return load().slice().sort(function (a, b) { return b.created - a.created; }); };
  P.get = function (id) { return load().find(function (p) { return p.id === id; }) || null; };
  P.add = function (name, bp) {
    load();
    if (!valid(bp)) return null;
    const p = { id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name, created: Date.now(), bp: JSON.parse(JSON.stringify(bp)) };
    plans.push(p);
    if (!store()) CO.emit('toast', 'Le navigateur refuse d’enregistrer : le plan sera perdu en quittant la page.', 'warn');
    return p;
  };
  P.rename = function (id, name) { const p = P.get(id); if (p) { p.name = name; store(); } };
  P.remove = function (id) { load(); plans = plans.filter(function (p) { return p.id !== id; }); store(); };
  /** Default name for a new plan. */
  P.nextName = function () { return 'Plan n° ' + (load().length + 1); };

  P.cost = function (bp) { return bp.items.reduce(function (s, it) { return s + CO.fullCost(it.type, it.cfg && it.cfg.lvl); }, 0); };
  /** Names of the buildings of `bp` not unlocked yet (they are skipped when the plan is placed). */
  P.locked = function (bp) {
    const out = [];
    bp.items.forEach(function (it) {
      const n = CO.BUILDINGS[it.type].name;
      if (!CO.isBuildingUnlocked(it.type) && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  };

  // Thumbnail colours: same families as the minimap.
  const COL = { Transport: '#9698a6', Production: '#ffd37f', 'Énergie': '#6fe0a0', Fluides: '#5fb0ff', Autres: '#7faaff' };
  const DARK = { Transport: '#4a4b55', Production: '#8a6a2a', 'Énergie': '#2f7050', Fluides: '#2a5a8a', Autres: '#3a4f80' };
  /** Small top-down drawing of a blueprint, fitted in maxW × maxH CSS pixels. */
  P.thumb = function (bp, maxW, maxH) {
    const s = Math.max(1, Math.min(8, Math.floor(maxW / bp.w), Math.floor(maxH / bp.h)));
    const cv = CO.h('canvas', { class: 'plan-thumb', width: bp.w * s, height: bp.h * s });
    const g = cv.getContext('2d');
    g.fillStyle = '#131316'; g.fillRect(0, 0, cv.width, cv.height);
    bp.items.forEach(function (it) {
      const d = CO.BUILDINGS[it.type], x = it.rx * s, y = it.ry * s, w = d.w * s, hh = d.h * s;
      const locked = !CO.isBuildingUnlocked(it.type);
      if (d.kind === 'belt') {
        g.fillStyle = locked ? '#6a2f2f' : '#3a3b44'; g.fillRect(x, y, w, hh);
        if (s >= 4) {                                  // direction mark
          g.fillStyle = locked ? '#e55454' : COL.Transport;
          const c = s / 2, l = Math.max(1, Math.floor(s / 4));
          if (it.dir === 0 || it.dir === 2) g.fillRect(x + 1, y + c - l / 2, s - 2, l); else g.fillRect(x + c - l / 2, y + 1, l, s - 2);
          const tip = [[s - 2, c], [c, s - 2], [1, c], [c, 1]][it.dir];
          g.fillRect(x + tip[0] - l, y + tip[1] - l, l * 2, l * 2);
        }
        return;
      }
      g.fillStyle = locked ? '#e55454' : COL[d.cat] || COL.Autres; g.fillRect(x, y, w, hh);
      if (s >= 3 && (w > s || hh > s)) { g.strokeStyle = locked ? '#6a2f2f' : DARK[d.cat] || DARK.Autres; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1); }
    });
    return cv;
  };
})(window.CO = window.CO || {});
