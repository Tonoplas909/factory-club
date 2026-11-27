/*
 * history.js — every change made by the player goes through here so it can be
 * undone / redone. A "batch" is a list of small operations:
 *   {k:'add', t, x, y, d, c}      a building was placed      (c = {r: recipe, f: filter, k: driver target})
 *   {k:'del', t, x, y, d, c}      a building was removed
 *   {k:'rot', x, y, a, b}         rotated from direction a to b
 *   {k:'cfg', x, y, a, b}         recipe/filter/target changed (a/b = {r, f, k})
 *   {k:'lvl', x, y, a, b}         upgraded from level a to level b (pays / refunds the difference)
 * Operations reference buildings by position (not id) because undo re-creates buildings.
 * Placing costs credits; removing refunds 100 % of what was paid (no punishment, in the spirit of the game).
 * When credits run short, a placed piece becomes a ghost (op.g = 1): an unpaid site that a worker pays for
 * when it comes to build it. Removing a ghost refunds nothing, since nothing was paid.
 */
(function (CO) {
  'use strict';
  const world = CO.world, BUILDINGS = CO.BUILDINGS;
  const MAX = 200;
  let undoStack = [], redoStack = [];

  const H = CO.history = {};

  function cfgOf(b) { const c = { r: b.recipe || null, f: b.filter || null, k: b.target || null }; if (b.lvl > 1) c.l = b.lvl; return c; }
  function snap(b, k) {
    const o = { k: k, t: b.type, x: b.x, y: b.y, d: b.dir, c: cfgOf(b) };
    if (b.site && !b.site.paid) o.g = 1;
    return o;
  }
  /** Credits actually spent on `b`: its cost, or 0 for a ghost not paid yet. */
  CO.paidValue = function (b) { return b.site && !b.site.paid ? 0 : CO.fullCost(b.type, b.lvl); };
  /** Ghost sites waiting for credits: how many, and what they will cost. */
  CO.ghostStats = function () {
    let n = 0, cost = 0;
    const s = world.sites;
    for (let i = 0; i < s.length; i++) if (!s[i].site.paid) { n++; cost += CO.fullCost(s[i].type, s[i].lvl); }
    return { n: n, cost: cost };
  };

  function flip(k, inv) {
    if (!inv) return k;
    return k === 'add' ? 'del' : k === 'del' ? 'add' : k;
  }

  /** Apply one operation (forwards or inverted). Money is adjusted here. */
  function applyOp(op, inv) {
    const st = CO.state, k = flip(op.k, inv);
    if (k === 'add') {
      if (!world.check(op.t, op.x, op.y, op.d).ok) return;
      const cost = CO.fullCost(op.t, op.c.l), paid = !op.g && st.money >= cost;
      if (paid) st.money -= cost;
      const b = world.create(op.t, op.x, op.y, op.d, { recipe: op.c.r, filter: op.c.f, target: op.c.k, lvl: op.c.l });
      world.makeSite(b, 0, paid);                     // a worker has to come and build it (and pay it, if a ghost)
    } else if (k === 'del') {
      const b = world.at(op.x, op.y);
      if (b && b.type === op.t && !b.def.fixed) { st.money += CO.paidValue(b); world.remove(b); }
    } else if (k === 'rot') {
      const b = world.at(op.x, op.y);
      if (b) world.setDir(b, inv ? op.a : op.b);
    } else if (k === 'cfg') {
      const b = world.at(op.x, op.y);
      if (b) setCfg(b, inv ? op.a : op.b);
    } else if (k === 'lvl') {
      const b = world.at(op.x, op.y), from = inv ? op.b : op.a, to = inv ? op.a : op.b;
      if (!b || b.lvl !== from) return;
      const diff = CO.levelSpent(b.type, to) - CO.levelSpent(b.type, from);
      if (b.site && !b.site.paid) { b.lvl = to; return; }        // a ghost pays everything when it is built
      if (diff > st.money) return;
      st.money -= diff; b.lvl = to;
      world.version++;                                           // power demand / speed changed
    }
  }

  function setCfg(b, c) {
    if (b.kind === 'machine') {
      if (b.recipe !== c.r) {
        // Nothing is lost on a recipe change: a craft in progress gives its ingredients back, what the
        // new recipe uses stays in stock (up to the usual limit), the rest leaves through the output.
        const old = b.recipe ? CO.RECIPES[b.recipe] : null, nr = c.r ? CO.RECIPES[c.r] : null;
        const stock = Object.assign({}, b.inBuf);
        if (b.crafting && old) for (const k in old.in) stock[k] = (stock[k] || 0) + old.in[k];
        b.inBuf = {};
        for (const k in stock) {
          const n = stock[k] || 0, keep = nr && nr.in[k] ? Math.min(n, nr.in[k] * 2) : 0;
          if (keep > 0) b.inBuf[k] = keep;
          for (let i = keep; i < n; i++) b.outBuf.push(k);
        }
        b.recipe = c.r; b.crafting = false; b.prog = 0;
      }
    } else if (b.kind === 'router' || b.kind === 'unloader' || b.kind === 'drone_requester') b.filter = c.f;
    else if (b.kind === 'driver' || b.kind === 'krelay') world.setTarget(b, c.k || null);
  }

  // Never refused for lack of credits: a re-added piece that cannot be paid comes back as a ghost.
  function exec(ops, inv) {
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
    let skippedMoney = false, placed = 0, ghosts = 0;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      if (!CO.isBuildingUnlocked(p.type)) continue;
      const chk = world.check(p.type, p.x, p.y, p.dir);
      if (!chk.ok) continue;
      const cost = CO.fullCost(p.type, p.cfg && p.cfg.lvl);
      let price = cost;
      for (let r = 0; r < chk.replaces.length; r++) price -= CO.paidValue(chk.replaces[r]);
      // A piece that replaces others is paid now or not placed: a line is never cut while waiting for credits.
      if (chk.replaces.length && st.money < price) { skippedMoney = true; continue; }
      for (let r = 0; r < chk.replaces.length; r++) { const o = snap(chk.replaces[r], 'del'); ops.push(o); applyOp(o, false); }
      const cfg = p.cfg || {};
      const add = { k: 'add', t: p.type, x: p.x, y: p.y, d: p.dir, c: { r: cfg.recipe || null, f: cfg.filter || null, k: cfg.target || null } };
      if (cfg.lvl > 1 && CO.canUpgradeKind({ kind: BUILDINGS[p.type].kind, def: BUILDINGS[p.type] })) add.c.l = cfg.lvl;
      if (st.money < cost) { add.g = 1; ghosts++; }
      ops.push(add); applyOp(add, false); placed++;
    }
    if (skippedMoney) CO.emit('toast', 'Pas assez de crédits pour remplacer certaines pièces : elles n\u2019ont pas été posées.', 'warn');
    if (ghosts) CO.emit('toast', ghosts + ' pièce(s) en fantôme : les ouvriers les construiront quand les crédits arriveront.', 'info');
    H.lastGhosts = ghosts;
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

  /** Rotate clockwise (or counter-clockwise when `ccw`). */
  H.rotate = function (b, ccw) {
    if (b.def.fixed) return;
    const op = { k: 'rot', x: b.x, y: b.y, a: b.dir, b: (b.dir + (ccw ? 3 : 1)) & 3 };
    applyOp(op, false); push([op]);
  };

  /** Change recipe (machines), filter (splitters) or target ("x,y", mass drivers). `value` = id/key or null. */
  H.configure = function (b, value) {
    const a = cfgOf(b), c = { r: a.r, f: a.f, k: a.k };
    if (b.kind === 'machine') c.r = value; else if (b.kind === 'router' || b.kind === 'unloader' || b.kind === 'drone_requester') c.f = value; else if (b.kind === 'driver' || b.kind === 'krelay') c.k = value; else return;
    if (c.r === a.r && c.f === a.f && c.k === a.k) return;
    const op = { k: 'cfg', x: b.x, y: b.y, a: a, b: c };
    applyOp(op, false); push([op]);
    if (b.kind === 'machine' && value) CO.state.lastRecipe[b.type] = value;
  };
  /** Upgrade every building of `list` that can go one level up (research done, credits enough). One undo step. */
  H.upgrade = function (list) {
    const ops = [];
    let skipped = 0;
    list.forEach(function (b) {
      if (b.dead) return;
      const to = CO.nextLevel(b);
      if (!to) return;
      if (CO.upgradePrice(b) > CO.state.money) { skipped++; return; }
      const op = { k: 'lvl', x: b.x, y: b.y, a: b.lvl || 1, b: to };
      applyOp(op, false); ops.push(op);
    });
    if (ops.length) push(ops);
    if (skipped) CO.emit('toast', skipped + ' bâtiment(s) non amélioré(s) : pas assez de crédits.', 'warn');
    return ops.length;
  };
  /** Same recipe / filter for many buildings at once (one undo step). */
  H.configureMany = function (list, value) {
    const ops = [];
    list.forEach(function (b) {
      if (b.dead) return;
      const a = cfgOf(b), c = { r: a.r, f: a.f, k: a.k };
      if (b.kind === 'machine') c.r = value; else if (b.kind === 'router' || b.kind === 'unloader' || b.kind === 'drone_requester') c.f = value; else return;
      if (c.r === a.r && c.f === a.f) return;
      const op = { k: 'cfg', x: b.x, y: b.y, a: a, b: c };
      applyOp(op, false); ops.push(op);
      if (b.kind === 'machine' && value) CO.state.lastRecipe[b.type] = value;
    });
    if (ops.length) push(ops);
    return ops.length;
  };
})(window.CO = window.CO || {});
