/*
 * input.js — mouse, touch and keyboard.
 *
 * Tools:  inspect (drag = pan, click = inspect a building), select (rectangle),
 *         delete (drag over buildings), build (a building type), paste (clipboard blueprint),
 *         link (pick the target of a mass driver: click another driver in range).
 * Mouse:  left = tool action, right-drag = delete, middle-drag = one-shot selection rectangle
 *         (back to inspect afterwards), Space+drag = pan, wheel = zoom.
 * Touch:  one finger = tool action, two fingers = pan + pinch zoom.
 * Drag-placing: belts follow the finger/mouse path; other buildings are laid out in a line.
 */
(function (CO) {
  'use strict';
  const DX = CO.DX, DY = CO.DY, world = CO.world, BUILDINGS = CO.BUILDINGS, H = CO.history;
  const I = CO.input = {};

  let canvas;
  let tool = 'inspect', buildType = 'belt', rot = 0;
  let cur = null;                       // pointer position in tile coordinates (null = outside)
  const pointers = new Map();
  let gesture = null, drag = null, space = false;
  let selection = { rect: null, blds: [] };
  let inspected = null;
  let clipboard = null;                 // {w,h,items:[{type,rx,ry,dir,cfg,tr}]} (tr: relative driver target)
  let linkSrc = null;                   // mass driver whose target is being chosen (tool 'link')
  const held = {};                      // keyboard pan keys currently down
  let lastCost = 0;

  I.get = function () { return { tool: tool, buildType: buildType, rot: rot, inspected: inspected, selection: selection.blds, clipboard: clipboard, linkSrc: linkSrc }; };
  I.getCost = function () { return lastCost; };

  // ------------------------------------------------------------ tool state
  function setTool(t) {
    tool = t; drag = null;
    if (t !== 'link') linkSrc = null;
    if (t !== 'inspect') inspected = null;
    if (t !== 'select') { selection = { rect: null, blds: [] }; }
    CO.emit('tool'); CO.emit('inspect'); CO.emit('selection');
  }
  I.setTool = setTool;

  I.selectBuild = function (type) {
    if (!CO.isBuildingUnlocked(type)) { CO.emit('toast', 'Technologie requise : ' + CO.TECHS[BUILDINGS[type].tech].name + ' (onglet Recherche).', 'warn'); return; }
    buildType = type; setTool('build');
  };

  /** Rotate the piece being placed, the paste, or the inspected building (`ccw` = counter-clockwise). */
  I.rotate = function (ccw) {
    if (tool === 'paste' && clipboard) { for (let k = ccw ? 3 : 1; k > 0; k--) rotateBlueprint(clipboard); }
    else if (tool === 'build') rot = (rot + (ccw ? 3 : 1)) & 3;
    else if (inspected && !inspected.dead) H.rotate(inspected, ccw);
    CO.emit('tool');
  };

  // ------------------------------------------------------- mass driver link
  /** Start choosing the target of mass driver `b` (next click on another driver in range). */
  I.startLink = function (b) {
    if (!b || b.dead || b.kind !== 'driver') return;
    tool = 'link'; drag = null; linkSrc = b; inspected = b; selection = { rect: null, blds: [] };
    CO.emit('tool'); CO.emit('selection');
  };
  /** Back to the inspect tool with the launcher still shown in the Infos panel. */
  function endLink() {
    const src = linkSrc;
    setTool('inspect');
    if (src && !src.dead) { inspected = src; CO.emit('inspect'); }
  }
  /** Would `b` → `t` be a valid link? Returns '' when fine, else the reason (French). */
  function linkProblem(b, t) {
    if (!t || t.kind !== 'driver') return 'Clique sur une autre catapulte magnétique.';
    if (t === b) return 'Une catapulte ne peut pas se viser elle-même.';
    if (CO.sim.driverDist(b, t) > b.def.range) return 'Hors de portée (' + b.def.range + ' cases au maximum).';
    for (let n = t, k = 0; n && k < 256; k++) {          // following the chain must never come back here
      if (n === b) return 'Boucle : cette catapulte renvoie déjà ses objets vers celle-ci.';
      n = CO.sim.driverTarget(n);
    }
    return '';
  }
  function finishLink(cell) {
    const t = world.at(cell.x, cell.y), b = linkSrc;
    if (!b || b.dead) { setTool('inspect'); return; }
    if (!t) { endLink(); return; }                       // click on empty ground = cancel
    const why = linkProblem(b, t);
    if (why) { CO.emit('toast', why, 'warn'); return; }
    H.configure(b, t.x + ',' + t.y);
    CO.emit('toast', 'Liaison établie : ' + Math.round(CO.sim.driverDist(b, t)) + ' cases.', 'good');
    endLink();
  }

  I.inspect = function (b) { inspected = b; CO.emit('inspect'); };

  // --------------------------------------------------------------- helpers
  function anchor(def, wx, wy) { return { x: Math.round(wx - def.w / 2), y: Math.round(wy - def.h / 2) }; }
  function cellOf(w) { return { x: Math.floor(w.x), y: Math.floor(w.y) }; }
  function dirTo(a, b) { return b.x > a.x ? 0 : b.y > a.y ? 1 : b.x < a.x ? 2 : 3; }

  function extendPath(path, cell) {
    let px = path[path.length - 1].x, py = path[path.length - 1].y, guard = 0;
    while ((px !== cell.x || py !== cell.y) && guard++ < 300) {
      const dx = cell.x - px, dy = cell.y - py;
      if (Math.abs(dx) >= Math.abs(dy)) px += Math.sign(dx); else py += Math.sign(dy);
      const n = path.length;
      if (n >= 2 && path[n - 2].x === px && path[n - 2].y === py) path.pop();          // stepping back = undo a cell
      else if (!path.some(function (p) { return p.x === px && p.y === py; })) path.push({ x: px, y: py });
    }
  }

  // Belt drag modes (read live from the modifier keys):
  //   plain  straight line from the press point, on the dominant axis only
  //   Ctrl   L-shaped path to the cursor (first along the axis the drag started on); cells holding a
  //          building other than a belt are skipped instead of replaced
  //   Alt    free-hand: the belts follow the pointer's track
  const mods = { ctrl: false, alt: false };
  function readMods(e) { mods.ctrl = !!(e.ctrlKey || e.metaKey); mods.alt = !!e.altKey; }
  function beltPath(d) {
    if (mods.alt) return d.path;
    const a = d.path[0], c = cellOf(cur), dx = c.x - a.x, dy = c.y - a.y, out = [{ x: a.x, y: a.y }];
    const walk = function (axis, to) {
      let p = out[out.length - 1];
      while ((axis === 'h' ? p.x : p.y) !== to) {
        p = axis === 'h' ? { x: p.x + Math.sign(to - p.x), y: p.y } : { x: p.x, y: p.y + Math.sign(to - p.y) };
        out.push(p);
      }
    };
    if (mods.ctrl) {
      const first = d.axis || (Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v');
      if (first === 'h') { walk('h', c.x); walk('v', c.y); } else { walk('v', c.y); walk('h', c.x); }
    } else if (Math.abs(dx) >= Math.abs(dy)) walk('h', c.x);
    else walk('v', c.y);
    return out;
  }
  function beltPlacements(path) {
    const out = [], n = path.length;
    for (let i = 0; i < n; i++) {
      let d = rot;
      if (i < n - 1) d = dirTo(path[i], path[i + 1]); else if (n > 1) d = dirTo(path[n - 2], path[n - 1]);
      if (mods.ctrl && !mods.alt && drag) {                     // Ctrl: go around nothing, just leave buildings alone
        const o = world.at(path[i].x, path[i].y);
        if (o && o.kind !== 'belt') continue;
      }
      out.push({ type: buildType, x: path[i].x, y: path[i].y, dir: d });
    }
    return out;
  }

  function linePlacements(def, a, b) {
    const out = [], dx = b.x - a.x, dy = b.y - a.y;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const step = horiz ? def.w : def.h, dist = horiz ? dx : dy, sgn = dist < 0 ? -1 : 1;
    const count = Math.min(80, Math.floor(Math.abs(dist) / step) + 1);
    for (let k = 0; k < count; k++) {
      out.push({ type: buildType, x: a.x + (horiz ? k * step * sgn : 0), y: a.y + (horiz ? 0 : k * step * sgn), dir: rot, cfg: recipeCfg(buildType) });
    }
    return out;
  }
  function recipeCfg(type) {
    const def = BUILDINGS[type];
    if (def.kind !== 'machine') return null;
    const r = CO.state.lastRecipe[type];
    return r && CO.RECIPES[r] && CO.RECIPES[r].machine === type && CO.isRecipeUnlocked(r) ? { recipe: r } : null;
  }

  function buildPlacements() {
    if (!cur) return [];
    const def = BUILDINGS[buildType];
    if (drag && drag.kind === 'build') {
      if (def.kind === 'belt') return beltPlacements(beltPath(drag));
      return linePlacements(def, drag.startAnchor, anchor(def, cur.x, cur.y));
    }
    const a = anchor(def, cur.x, cur.y);
    return [{ type: buildType, x: a.x, y: a.y, dir: rot, cfg: recipeCfg(buildType) }];
  }

  function pastePlacements() {
    if (!cur || !clipboard) return [];
    const bx = Math.round(cur.x - clipboard.w / 2), by = Math.round(cur.y - clipboard.h / 2);
    return clipboard.items.map(function (it) {
      const cfg = { recipe: it.cfg.recipe, filter: it.cfg.filter, target: it.tr ? (bx + it.tr.rx) + ',' + (by + it.tr.ry) : null };
      return { type: it.type, x: bx + it.rx, y: by + it.ry, dir: it.dir, cfg: cfg };
    });
  }

  /** Validate placements for the ghost preview (money is accumulated across the batch). */
  function validate(pl) {
    let money = CO.state.money, total = 0;
    const taken = {};
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i], def = BUILDINGS[p.type];
      const chk = world.check(p.type, p.x, p.y, p.dir);
      let ok = chk.ok && CO.isBuildingUnlocked(p.type);
      for (let j = 0; ok && j < def.h; j++) for (let k = 0; ok && k < def.w; k++) {
        const key = (p.x + k) + ',' + (p.y + j);
        if (taken[key] && !(def.w === 1 && def.h === 1)) ok = false;
      }
      if (ok) {
        let price = def.cost;
        for (let r = 0; r < chk.replaces.length; r++) price -= BUILDINGS[chk.replaces[r].type].cost;
        if (price > money) ok = false; else { money -= price; total += price; }
        for (let j = 0; j < def.h; j++) for (let k = 0; k < def.w; k++) taken[(p.x + k) + ',' + (p.y + j)] = true;
      }
      p.valid = ok || !!chk.same;
      p.same = !!chk.same;
      p.replaces = (ok && chk.replaces && def.w * def.h > 1) ? chk.replaces : null;   // belts that will be removed
    }
    lastCost = total;
    return pl;
  }

  // -------------------------------------------------------- blueprint copy
  function blueprintFrom(blds) {
    const list = blds.filter(function (b) { return !b.def.fixed && !b.dead; });
    if (!list.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    list.forEach(function (b) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return {
      w: x1 - x0, h: y1 - y0,
      items: list.map(function (b) {
        // A driver keeps its link only when its target is copied too (stored relative to the blueprint).
        const t = b.kind === 'driver' ? CO.sim.driverTarget(b) : null;
        const tr = t && list.indexOf(t) >= 0 ? { rx: t.x - x0, ry: t.y - y0, w: t.w, h: t.h } : null;
        return { type: b.type, rx: b.x - x0, ry: b.y - y0, dir: b.dir, cfg: { recipe: b.recipe || null, filter: b.filter || null }, tr: tr };
      })
    };
  }
  function rotateBlueprint(bp) {
    const oh = bp.h;
    bp.items.forEach(function (it) {
      const d = BUILDINGS[it.type], nx = oh - (it.ry + d.h), ny = it.rx;
      it.rx = nx; it.ry = ny; it.dir = (it.dir + 1) & 3;
      if (it.tr) it.tr = { rx: oh - (it.tr.ry + it.tr.h), ry: it.tr.rx, w: it.tr.h, h: it.tr.w };
    });
    bp.h = bp.w; bp.w = oh;
  }
  function currentTargets() {
    if (selection.blds.length) return selection.blds;
    return inspected ? [inspected] : [];
  }

  I.copy = function () {
    const bp = blueprintFrom(currentTargets());
    if (!bp) { CO.emit('toast', 'Sélectionne d’abord des éléments (outil Sélection).', 'warn'); return false; }
    clipboard = bp; CO.emit('toast', bp.items.length + ' élément(s) copié(s). Ctrl+V pour coller.', 'info'); CO.emit('tool');
    return true;
  };
  I.cut = function () { if (I.copy()) I.deleteSelected(); };
  I.paste = function () {
    if (!clipboard) { CO.emit('toast', 'Rien à coller : copie d’abord une disposition.', 'warn'); return; }
    tool = 'paste'; drag = null; inspected = null; selection = { rect: null, blds: [] };
    CO.emit('tool'); CO.emit('inspect'); CO.emit('selection');
  };
  I.deleteSelected = function () {
    const t = currentTargets();
    if (!t.length) return;
    H.remove(t);
    selection = { rect: null, blds: [] }; inspected = null;
    CO.emit('selection'); CO.emit('inspect');
  };
  I.undo = function () { if (H.undo()) afterHistory(); };
  I.redo = function () { if (H.redo()) afterHistory(); };
  function afterHistory() {
    if (inspected && inspected.dead) { inspected = null; CO.emit('inspect'); }
    selection.blds = selection.blds.filter(function (b) { return !b.dead; });
  }

  // ---------------------------------------------------------------- overlay
  const overlay = { hover: null, selected: [], deleting: [], ghosts: [], selRect: null, cursorCell: null, cursorColor: '#fff' };
  I.getOverlay = function () {
    const o = overlay;
    o.hover = null; o.deleting = []; o.ghosts = []; o.cursorCell = null; o.selRect = null; o.link = null; o.plot = -1;
    o.selected = selection.blds.slice();
    if (inspected && !inspected.dead && o.selected.indexOf(inspected) < 0) o.selected.push(inspected);
    if (cur) {
      const c = cellOf(cur), hb = (tool === 'inspect' || tool === 'delete') ? under(c) : world.at(c.x, c.y);
      if (tool === 'inspect') o.hover = hb;
      if (!drag && world.inBounds(c.x, c.y) && !CO.ownsCell(c.x, c.y)) o.plot = CO.plotOf(c.x, c.y);
      if (tool === 'delete' && !drag && hb && !hb.def.fixed) o.deleting = [hb];
      if (tool === 'delete' && !hb) { o.cursorCell = c; o.cursorColor = 'rgba(229,84,84,0.85)'; }
      if (tool === 'select' && !drag) { o.cursorCell = c; o.cursorColor = 'rgba(255,211,127,0.85)'; }
      if (tool === 'build') o.ghosts = validate(buildPlacements());
      if (tool === 'paste') o.ghosts = validate(pastePlacements());
      if (tool === 'link' && linkSrc && !linkSrc.dead) {
        const t = hb && hb !== linkSrc && hb.kind === 'driver' ? hb : null;
        const inRange = CO.sim.driverDist(linkSrc, { x: cur.x, y: cur.y, w: 0, h: 0 }) <= linkSrc.def.range;
        o.link = { src: linkSrc, cur: cur, target: t, valid: t ? !linkProblem(linkSrc, t) : inRange };
      }
      for (let i = 0; i < o.ghosts.length; i++) if (o.ghosts[i].replaces) o.deleting = o.deleting.concat(o.ghosts[i].replaces);
    }
    o.selDelete = false;
    if (drag && drag.kind === 'delete') {          // red marquee: buildings inside will be deleted
      const r = rectOf(drag.start, drag.end);
      if (drag.moved || !drag.cancelTool) { o.deleting = buildingsInRect(r); o.selRect = r; o.selDelete = true; }
    } else if (drag && drag.kind === 'select') o.selRect = rectOf(drag.start, drag.end);
    else if (selection.rect) o.selRect = selection.rect;
    return o;
  };
  /** Building under the pointer: in the isometric view a tall body is picked by its drawn pixels. */
  function under(c) { return CO.render.pick(lastCanvas.x, lastCanvas.y) || world.at(c.x, c.y); }
  I.hoverInfo = function () {
    if (!cur) return null;
    const c = cellOf(cur);
    return { x: c.x, y: c.y, b: under(c), ore: world.oreAt(c.x, c.y), sx: lastClient.x, sy: lastClient.y, mouse: lastClient.mouse };
  };

  function rectOf(a, b) { return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; }

  function buildingsInRect(r) {
    const out = [];
    for (let i = 0; i < world.list.length; i++) {
      const b = world.list[i];
      if (b.def.fixed) continue;
      if (b.x <= r.x1 && b.x + b.w - 1 >= r.x0 && b.y <= r.y1 && b.y + b.h - 1 >= r.y0) out.push(b);
    }
    return out;
  }

  // ---------------------------------------------------------------- camera
  function zoomAt(sx, sy, z) {
    z = CO.clamp(z, 8, 72);
    const before = CO.render.screenToWorld(sx, sy);
    CO.cam.zoom = z;
    const after = CO.render.screenToWorld(sx, sy);
    CO.cam.x += before.x - after.x; CO.cam.y += before.y - after.y;
    clampCam();
  }
  I.zoomBy = function (f) { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, CO.cam.zoom * f); };
  function clampCam() {
    CO.cam.x = CO.clamp(CO.cam.x, 0, world.W); CO.cam.y = CO.clamp(CO.cam.y, 0, world.H);
  }
  I.centerOnPort = function () { CO.cam.x = CO.MAP_CX; CO.cam.y = CO.MAP_CY; clampCam(); };

  // --------------------------------------------------------------- pointers
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let lastClient = { x: 0, y: 0, mouse: false }, lastCanvas = { x: 0, y: 0 };
  function updateCursor(e) {
    const p = pos(e); cur = CO.render.screenToWorld(p.x, p.y); lastCanvas = p;
    lastClient = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
  }

  function onDown(e) {
    e.preventDefault();
    readMods(e);
    if (CO.ui && CO.ui.closeMenus) CO.ui.closeMenus();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = pos(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (pointers.size === 2) { startGesture(); drag = null; return; }
    if (pointers.size > 2) return;
    updateCursor(e);
    const cell = cellOf(cur);
    if (e.button === 0 && space) { drag = { kind: 'pan', lx: p.x, ly: p.y }; return; }
    if (e.button === 1) { drag = { kind: 'pan', lx: p.x, ly: p.y }; return; }   // middle button: move the camera, always
    if (e.button === 0 && mods.ctrl && (tool === 'inspect' || tool === 'select')) {
      // Ctrl + left: select. A drag selects a rectangle (which vanishes on release), a click adds or
      // removes the building under the pointer.
      drag = { kind: 'select', start: cell, end: cell, auto: true, ctrl: true };
      return;
    }
    if (e.button === 2) {
      startDelete(cell);
      // With a building (or a paste) selected for placing, a plain right-click just deselects it;
      // a right-drag still deletes, as in every other tool.
      drag.cancelTool = (tool === 'build' || tool === 'paste' || tool === 'link');
      return;
    }
    if (e.button !== 0) return;
    switch (tool) {
      case 'inspect': drag = { kind: 'panclick', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false }; break;
      case 'select': drag = { kind: 'select', start: cell, end: cell }; break;
      case 'delete': startDelete(cell); break;
      case 'build': {
        const def = BUILDINGS[buildType];
        drag = { kind: 'build', path: [cell], startAnchor: anchor(def, cur.x, cur.y) };
        break;
      }
      case 'paste': drag = { kind: 'paste' }; break;
      case 'link': finishLink(cell); break;
    }
  }
  /** Start a deletion marquee: everything touched by the dragged rectangle is removed on release. */
  function startDelete(cell) {
    const b = under(cell);                       // iso: start on the building actually under the pointer
    if (b && !b.def.fixed && world.at(cell.x, cell.y) !== b) cell = { x: b.x, y: b.y };
    drag = { kind: 'delete', start: cell, end: cell, moved: false };
  }

  function onMove(e) {
    readMods(e);
    const p = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (gesture && pointers.size >= 2) { updateGesture(); return; }
    if (e.pointerType !== 'mouse' && !pointers.has(e.pointerId)) return;
    updateCursor(e);
    if (!drag) return;
    const cell = cellOf(cur);
    switch (drag.kind) {
      case 'pan': doPan(p); break;
      case 'panclick':
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) drag.moved = true;
        if (drag.moved) doPan(p);
        break;
      case 'select': drag.end = cell; break;
      case 'delete':
        drag.end = cell;
        if (cell.x !== drag.start.x || cell.y !== drag.start.y) drag.moved = true;
        break;
      case 'build':
        if (BUILDINGS[buildType].kind === 'belt') {
          extendPath(drag.path, cell);                  // free-hand track (Alt), kept up to date in every mode
          if (!drag.axis && (cell.x !== drag.path[0].x || cell.y !== drag.path[0].y))
            drag.axis = Math.abs(cell.x - drag.path[0].x) >= Math.abs(cell.y - drag.path[0].y) ? 'h' : 'v';
        }
        break;
    }
  }
  function doPan(p) {
    const ts = CO.cam.zoom;
    CO.render.pan(p.x - drag.lx, p.y - drag.ly);
    drag.lx = p.x; drag.ly = p.y; clampCam();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (gesture) { if (pointers.size < 2) gesture = null; return; }
    if (!drag) return;
    const d = drag;
    if (e.type === 'pointercancel') { drag = null; return; }
    switch (d.kind) {
      case 'panclick':
        if (!d.moved) {
          const c = cellOf(cur || CO.render.screenToWorld(d.sx, d.sy)), b = under(c);
          if (selection.blds.length && (!b || selection.blds.indexOf(b) < 0)) {   // click outside the selection: drop it
            selection = { rect: null, blds: [] }; CO.emit('selection');
          }
          if (!b && world.inBounds(c.x, c.y) && !CO.ownsCell(c.x, c.y)) { CO.ui.askBuyPlot(CO.plotOf(c.x, c.y)); break; }
          inspected = b; CO.emit('inspect');
        }
        break;
      case 'select': {
        const r = rectOf(d.start, d.end);
        if (d.ctrl && r.x0 === r.x1 && r.y0 === r.y1) {          // Ctrl + click: toggle one building
          const b = under(d.start), blds = selection.blds.slice(), i = b ? blds.indexOf(b) : -1;
          if (b && !b.def.fixed) { if (i >= 0) blds.splice(i, 1); else blds.push(b); }
          selection = { rect: null, blds: blds };
        } else selection = { rect: d.auto ? null : r, blds: buildingsInRect(r) };   // Ctrl-drag: the rectangle vanishes
        CO.emit('tool'); CO.emit('selection');
        break;
      }
      case 'delete': {
        if (d.cancelTool && !d.moved) {                 // right-click = deselect (or cancel the link)
          drag = null;
          if (tool === 'link') endLink(); else setTool('inspect');
          return;
        }
        const arr = buildingsInRect(rectOf(d.start, d.end));
        if (arr.length) H.remove(arr);
        break;
      }
      case 'build': {
        const pl = buildPlacements();
        const n = H.place(pl);
        if (BUILDINGS[buildType].kind === 'belt' && d.path.length > 1 && pl.length) rot = pl[pl.length - 1].dir;
        if (!n && pl.length === 1 && !pl[0].same) {
          const chk = world.check(pl[0].type, pl[0].x, pl[0].y, pl[0].dir);
          if (!chk.ok && !CO.ownsCell(pl[0].x, pl[0].y) && world.inBounds(pl[0].x, pl[0].y)) CO.ui.askBuyPlot(CO.plotOf(pl[0].x, pl[0].y));
          else if (!chk.ok) CO.emit('toast', chk.reason + '.', 'warn');
        }
        break;
      }
      case 'paste': {
        const n = H.place(pastePlacements());
        if (!n) CO.emit('toast', 'Impossible de coller ici (emplacement occupé, hors carte ou terrain non acheté).', 'warn');
        break;
      }
    }
    drag = null;   // kept until now because the placement preview depends on the drag state
  }

  // --------------------------------------------------------- two-finger gesture
  function startGesture() {
    const pts = Array.from(pointers.values());
    gesture = { d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, z0: CO.cam.zoom,
      mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2 };
  }
  function updateGesture() {
    const pts = Array.from(pointers.values());
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    CO.render.pan(mx - gesture.mx, my - gesture.my);
    zoomAt(mx, my, gesture.z0 * d / gesture.d0);
    gesture.mx = mx; gesture.my = my;
  }

  // ---------------------------------------------------------------- keyboard
  const PAN_KEYS = { arrowleft: 'l', arrowright: 'r', arrowup: 'u', arrowdown: 'd', a: 'l', q: 'l', d: 'r', w: 'u', z: 'u', s: 'd' };

  function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); }

  function onKeyDown(e) {
    if (isTyping(e)) return;
    if (e.key === 'Control' || e.key === 'Meta') mods.ctrl = true;
    if (e.key === 'Alt') { mods.alt = true; e.preventDefault(); }
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (CO.ui && CO.ui.modalOpen()) { if (k === 'escape') CO.ui.closeModal(); return; }
    if (mod) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) I.redo(); else I.undo(); }
      else if (k === 'y') { e.preventDefault(); I.redo(); }
      else if (k === 'c') { e.preventDefault(); I.copy(); }
      else if (k === 'x') { e.preventDefault(); I.cut(); }
      else if (k === 'v') { e.preventDefault(); I.paste(); }
      return;
    }
    if (PAN_KEYS[k]) { held[PAN_KEYS[k]] = true; e.preventDefault(); return; }
    switch (k) {
      case ' ': space = true; e.preventDefault(); break;
      case 'r': I.rotate(e.shiftKey); break;
      case 'v': setTool('inspect'); break;
      case 'e': setTool('select'); break;
      case 'x': setTool('delete'); break;
      case 'i': CO.ui.showGuide(); break;
      case 'tab': e.preventDefault(); CO.render.toggleMode(); break;
      case 'escape':
        if (tool === 'link') endLink();
        else if (tool !== 'inspect') setTool('inspect');
        else { inspected = null; selection = { rect: null, blds: [] }; CO.emit('inspect'); CO.emit('selection'); }
        break;
      case 'delete': case 'backspace': {
        e.preventDefault();
        if (currentTargets().length) I.deleteSelected();
        else if (cur) { const b = world.at(Math.floor(cur.x), Math.floor(cur.y)); if (b) H.remove([b]); }
        break;
      }
      case '+': case '=': I.zoomBy(1.25); break;
      case '-': I.zoomBy(0.8); break;
      default:
        if (/^[0-9]$/.test(k)) {
          const list = I.hotbar(), idx = k === '0' ? 9 : parseInt(k, 10) - 1;
          if (list[idx]) I.selectBuild(list[idx]);
        }
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') mods.ctrl = false;
    if (e.key === 'Alt') { mods.alt = false; e.preventDefault(); }
    const k = e.key.toLowerCase();
    if (k === ' ') space = false;
    if (PAN_KEYS[k]) held[PAN_KEYS[k]] = false;
  }
  /** Buildings reachable by number keys: unlocked ones, in palette order. */
  I.hotbar = function () { return CO.BUILD_ORDER.filter(CO.isBuildingUnlocked); };

  I.update = function (dt) {
    const sp = 700 * dt;                           // CSS pixels per frame, whatever the view
    if (held.l) CO.render.pan(sp, 0); if (held.r) CO.render.pan(-sp, 0);
    if (held.u) CO.render.pan(0, sp); if (held.d) CO.render.pan(0, -sp);
    if (held.l || held.r || held.u || held.d) clampCam();
  };

  I.init = function (c) {
    canvas = c;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !drag) cur = null; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const p = pos(e);
      zoomAt(p.x, p.y, CO.cam.zoom * Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { for (const k in held) held[k] = false; space = false; mods.ctrl = mods.alt = false; });
    CO.on('loaded', function () { inspected = null; selection = { rect: null, blds: [] }; drag = null; CO.emit('inspect'); CO.emit('selection'); });
  };
})(window.CO = window.CO || {});
