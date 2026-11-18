/*
 * history.js — every change made by the player goes through here so it can be
 * undone / redone. A "batch" is a list of small operations:
 *   {k:'add', t, x, y, d, c}      a building was placed      (c = {r: recipe, f: filter})
 *   {k:'del', t, x, y, d, c}      a building was removed
 *   {k:'rot', x, y, a, b}         rotated from direction a to b
 *   {k:'cfg', x, y, a, b}         recipe/filter changed      (a/b = {r, f})
 * Operations reference buildings by position (not id) because undo re-creates buildings.
 * Placing costs credits; removing refunds 100 % (no punishment, in the spirit of the game).
 */
(function (CO) {
  'use strict';
  const world = CO.world, BUILDINGS = CO.BUILDINGS;
  const MAX = 200;
  let undoStack = [], redoStack = [];

  const H = CO.history = {};

  function cfgOf(b) { return { r: b.recipe || null, f: b.filter || null }; }
  function snap(b, k) { return { k: k, t: b.type, x: b.x, y: b.y, d: b.dir, c: cfgOf(b) }; }

  function flip(k, inv) {
    if (!inv) return k;
    return k === 'add' ? 'del' : k === 'del' ? 'add' : k;
  }

  /** Apply one operation (forwards or inverted). Money is adjusted here. */
  function applyOp(op, inv) {
    const st = CO.state, k = flip(op.k, inv);
    if (k === 'add') {
      if (!world.check(op.t, op.x, op.y, op.d).ok) return;
      st.money -= BUILDINGS[op.t].cost;
      world.create(op.t, op.x, op.y, op.d, { recipe: op.c.r, filter: op.c.f });
    } else if (k === 'del') {
      const b = world.at(op.x, op.y);
      if (b && b.type === op.t && !b.def.fixed) { st.money += BUILDINGS[op.t].cost; world.remove(b); }
    } else if (k === 'rot') {
      const b = world.at(op.x, op.y);
      if (b) world.setDir(b, inv ? op.a : op.b);
    } else if (k === 'cfg') {
      const b = world.at(op.x, op.y);
      if (b) setCfg(b, inv ? op.a : op.b);
    }
  }

  function setCfg(b, c) {
    if (b.kind === 'machine') {
      if (b.recipe !== c.r) { b.recipe = c.r; b.inBuf = {}; b.crafting = false; b.prog = 0; }
    } else if (b.kind === 'router') b.filter = c.f;
  }

  function netCost(ops, inv) {
    let c = 0;
    for (let i = 0; i < ops.length; i++) {
      const k = flip(ops[i].k, inv);
      if (k === 'add') c += BUILDINGS[ops[i].t].cost; else if (k === 'del') c -= BUILDINGS[ops[i].t].cost;
    }
    return c;
  }

  function exec(ops, inv) {
    if (CO.state.money < netCost(ops, inv)) { CO.emit('toast', 'Pas assez de crédits pour cette action.', 'warn'); return false; }
    if (inv) for (let i = ops.length - 1; i >= 0; i--) applyOp(ops[i], true);
    else for (let i = 0; i < ops.length; i++) applyOp(ops[i], false);
    return true;
  }

  function push(ops) {
    if (!ops.length) return;
    undoStack.push(ops); redoStack.length = 0;
    if (undoStack.length > MAX) undoStack.shift();
    CO.emit('history');
  }

  H.clear = function () { undoStack = []; redoStack = []; CO.emit('history'); };
  H.canUndo = function () { return undoStack.length > 0; };
  H.canRedo = function () { return redoStack.length > 0; };
  H.undo = function () {
    if (!undoStack.length) return false;
    const ops = undoStack[undoStack.length - 1];
    if (!exec(ops, true)) return false;
    undoStack.pop(); redoStack.push(ops); CO.emit('history'); return true;
  };
  H.redo = function () {
    if (!redoStack.length) return false;
    const ops = redoStack[redoStack.length - 1];
    if (!exec(ops, false)) return false;
    redoStack.pop(); undoStack.push(ops); CO.emit('history'); return true;
  };

  /**
   * Place a list of {type,x,y,dir,cfg}. Each piece is validated against the live
   * world, so overlaps inside the batch are handled naturally. Returns the count placed.
   */
  H.place = function (placements) {
    const ops = [], st = CO.state;
    let skippedMoney = false, placed = 0;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      if (!CO.isBuildingUnlocked(p.type)) continue;
      const chk = world.check(p.type, p.x, p.y, p.dir);
      if (!chk.ok) continue;
      const price = BUILDINGS[p.type].cost - (chk.replace ? BUILDINGS[chk.replace.type].cost : 0);
      if (st.money < price) { skippedMoney = true; break; }
      if (chk.replace) { const o = snap(chk.replace, 'del'); ops.push(o); applyOp(o, false); }
      const cfg = p.cfg || {};
      const add = { k: 'add', t: p.type, x: p.x, y: p.y, d: p.dir, c: { r: cfg.recipe || null, f: cfg.filter || null } };
      ops.push(add); applyOp(add, false); placed++;
    }
    if (skippedMoney) CO.emit('toast', 'Pas assez de crédits.', 'warn');
    push(ops);
    return placed;
  };

  /** Delete buildings (fixed ones are ignored). Returns how many were removed. */
  H.remove = function (blds) {
    const ops = [];
    for (let i = 0; i < blds.length; i++) {
      const b = blds[i];
      if (b.dead || b.def.fixed) continue;
      const o = snap(b, 'del'); ops.push(o); applyOp(o, false);
    }
    push(ops);
    return ops.length;
  };

  H.rotate = function (b) {
    if (b.def.fixed) return;
    const op = { k: 'rot', x: b.x, y: b.y, a: b.dir, b: (b.dir + 1) & 3 };
    applyOp(op, false); push([op]);
  };

  /** Change recipe (machines) or filter (splitters). `value` = item/recipe id or null. */
  H.configure = function (b, value) {
    const a = cfgOf(b), c = { r: a.r, f: a.f };
    if (b.kind === 'machine') c.r = value; else if (b.kind === 'router') c.f = value; else return;
    if (c.r === a.r && c.f === a.f) return;
    const op = { k: 'cfg', x: b.x, y: b.y, a: a, b: c };
    applyOp(op, false); push([op]);
    if (b.kind === 'machine' && value) CO.state.lastRecipe[b.type] = value;
  };
})(window.CO = window.CO || {});
