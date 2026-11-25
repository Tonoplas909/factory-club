/*
 * iso.js — isometric view of the world, with the voxel art of voxel.js.
 *
 * Projection (device pixels, ts = tile size at the current zoom): world point (x, y, z) →
 *   sx = cx0 + (x − y) · ts/2,   sy = cy0 + (x + y) · ts/4 − z · ts/2
 * so one tile is a 2:1 diamond ts wide, and a voxel model baked at 32 px per tile is drawn at ts/32.
 *
 * Drawing order: ground chunks (cached canvases), land shading, flat pieces (belts, tunnels) with the
 * items they carry, then every other building sorted back to front, then flying things and overlays.
 * The simulation, the saves and the input logic are the same as the top-down view.
 */
(function (CO) {
  'use strict';
  const world = CO.world, DX = CO.DX, DY = CO.DY, V = CO.voxel;
  const ACC = '#ffd37f', OUT = '#1f1f25', RED = '#e55454';
  const ISO = CO.iso = {};
  const CH = 16;                                         // chunk size (tiles)
  let ctx, cw = 1, ch = 1, dpr = 1, ts = 32, hw = 16, hh = 8, zs = 16, sc = 1, cx0 = 0, cy0 = 0;
  let drawn = [];                                        // buildings drawn last frame, back to front (for picking)

  function geom() {
    const g = CO.render.surface();
    ctx = g.ctx; cw = g.cw; ch = g.ch; dpr = g.dpr;
    ts = Math.max(4, Math.round(CO.cam.zoom * dpr / 4) * 4);   // multiple of 4: diamonds stay on whole pixels
    hw = ts / 2; hh = ts / 4; zs = ts / 2; sc = ts / 32;
    cx0 = Math.round(cw / 2 - (CO.cam.x - CO.cam.y) * hw);
    cy0 = Math.round(ch / 2 - (CO.cam.x + CO.cam.y) * hh);
  }
  function P(x, y, z) { return [cx0 + (x - y) * hw, cy0 + (x + y) * hh - (z || 0) * zs]; }

  /** Camera move for a drag of (dx, dy) CSS pixels, with the exact tile size used for drawing. */
  ISO.pan = function (dx, dy) {
    geom();
    const u = dx * dpr / hw, v = dy * dpr / hh;
    CO.cam.x -= (u + v) / 2; CO.cam.y -= (v - u) / 2;
  };
  ISO.screenToWorld = function (sx, sy) {
    geom();
    const u = (sx * dpr - cx0) / hw, v = (sy * dpr - cy0) / hh;
    return { x: (u + v) / 2, y: (v - u) / 2 };
  };

  /** Draw a baked voxel sprite so that its voxel point (vx, vy, vz) lands on world point (x, y, z). */
  function blit(s, x, y, z, vx, vy, vz) {
    const p = P(x, y, z);
    const ax = s.ox + 2 * ((vx || 0) - (vy || 0)), ay = s.oy + (vx || 0) + (vy || 0) - 2 * (vz || 0);
    const X = Math.round(p[0] - ax * sc), Y = Math.round(p[1] - ay * sc);
    ctx.drawImage(s.c, X, Y, Math.round(s.w * sc), Math.round(s.h * sc));
    return [X, Y];
  }

  // ------------------------------------------------------------ ground
  // Chunks of 16×16 tiles are baked once into canvases, at full or reduced resolution depending on the
  // zoom, and kept in small LRU caches.
  const LODS = [{ f: 1, cap: 90 }, { f: 0.5, cap: 260 }, { f: 0.25, cap: 640 }];
  let bakeBudget = 0;                                    // new chunks baked per frame (zooming out never stalls)
  const chunkCache = LODS.map(function () { return new Map(); });
  let groundKey = '';
  function chunk(cx, cy, li) {
    const lod = LODS[li], m = chunkCache[li], k = cx + ',' + cy;
    let c = m.get(k);
    if (c) { m.delete(k); m.set(k, c); return c; }
    if (bakeBudget-- <= 0) return null;
    const full = V.chunk(cx * CH, cy * CH, CH);
    if (lod.f === 1) c = full;
    else {
      const w = Math.ceil(full.w * lod.f), h = Math.ceil(full.h * lod.f), cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(full.c, 0, 0, w, h);
      c = { c: cv, ox: full.ox * lod.f, oy: full.oy * lod.f, w: w, h: h, f: lod.f };
    }
    m.set(k, c);
    if (m.size > lod.cap) m.delete(m.keys().next().value);
    return c;
  }
  function drawGround() {
    const gk = world.seed + ':' + world.oreRev;
    if (gk !== groundKey) { groundKey = gk; chunkCache.forEach(function (m) { m.clear(); }); }
    const li = sc >= 0.7 ? 0 : sc >= 0.35 ? 1 : 2, f = LODS[li].f;
    bakeBudget = 6;
    const NX = Math.ceil(world.W / CH), NY = Math.ceil(world.H / CH);
    for (let s = 0; s <= NX + NY - 2; s++) {
      for (let cx = Math.max(0, s - NY + 1); cx <= Math.min(NX - 1, s); cx++) {
        const cy = s - cx, x0 = cx * CH, y0 = cy * CH;
        const left = P(x0, y0 + CH)[0], right = P(x0 + CH, y0)[0], top = P(x0, y0, 0.4)[1], bot = P(x0 + CH, y0 + CH)[1] + hh;
        if (right < 0 || left > cw || bot < 0 || top > ch) continue;
        const c = chunk(cx, cy, li), p = P(x0, y0, 0), k = sc / f;
        if (!c) continue;
        ctx.drawImage(c.c, Math.round(p[0] - c.ox * k), Math.round(p[1] - c.oy * k), Math.round(c.w * k), Math.round(c.h * k));
      }
    }
  }

  // -------------------------------------------------------------- shapes
  function diamondPath(x0, y0, x1, y1, z) {           // rectangle of the world (tile edges) as a diamond
    const a = P(x0, y0, z), b = P(x1, y0, z), c = P(x1, y1, z), d = P(x0, y1, z);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
  }
  function foot(b, fill, stroke, lw, dash) {
    diamondPath(b.x, b.y, b.x + b.w, b.y + b.h, 0.02);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.save(); if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
    }
  }
  /** Wire box around a building: footprint, top and the three visible vertical edges. */
  function wire(b, color, lw) {
    const top = heightOf(b);
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    diamondPath(b.x, b.y, b.x + b.w, b.y + b.h, 0.02); ctx.stroke();
    diamondPath(b.x, b.y, b.x + b.w, b.y + b.h, top); ctx.stroke();
    ctx.beginPath();
    [[b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].forEach(function (q) {
      const a = P(q[0], q[1], 0), c = P(q[0], q[1], top); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
    });
    ctx.stroke();
  }
  function heightOf(b) {
    if (b.kind === 'belt') return 0.25;
    if (b.kind === 'pipe') return 0.5;
    return V.building(b.type, b.dir || 0, 0).top;
  }
  function drawIcon(id, x, y, size) {
    const s = Math.max(2, Math.round(size));
    ctx.drawImage(CO.sprites.item(id), 0, 0, 8, 8, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
  function label(text, x, y, color, size) {
    ctx.font = 'bold ' + Math.round(size) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = OUT; ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  // -------------------------------------------------------------- land
  function drawLand() {
    const land = CO.state.land, PW = CO.PLOTS_W, PH = CO.PLOTS_H;
    const dim = new Path2D(), far = new Path2D(), edge = new Path2D();
    for (let p = 0; p < land.length; p++) {
      const r = CO.plotRect(p), x0 = r.x0, y0 = r.y0, x1 = r.x1 + 1, y1 = r.y1 + 1;
      const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
      if (b[0] < 0 || d[0] > cw || c[1] < 0 || a[1] > ch) continue;
      if (!land[p]) {
        const path = CO.plotBuyable(p) ? dim : far;
        path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath();
        continue;
      }
      const px = p % PW, py = Math.floor(p / PW);
      if (px > 0 && !land[p - 1]) { edge.moveTo(a[0], a[1]); edge.lineTo(d[0], d[1]); }
      if (px < PW - 1 && !land[p + 1]) { edge.moveTo(b[0], b[1]); edge.lineTo(c[0], c[1]); }
      if (py > 0 && !land[p - PW]) { edge.moveTo(a[0], a[1]); edge.lineTo(b[0], b[1]); }
      if (py < PH - 1 && !land[p + PW]) { edge.moveTo(d[0], d[1]); edge.lineTo(c[0], c[1]); }
    }
    ctx.fillStyle = 'rgba(8,8,11,0.5)'; ctx.fill(dim);
    ctx.fillStyle = 'rgba(8,8,11,0.72)'; ctx.fill(far);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke(dim); ctx.stroke(far);
    ctx.strokeStyle = 'rgba(255,211,127,0.6)'; ctx.lineWidth = Math.max(2, Math.round(ts / 12)); ctx.stroke(edge);
  }
  function drawPlotHover(p) {
    const r = CO.plotRect(p), ok = CO.plotBuyable(p), lw = Math.max(2, Math.round(ts / 12));
    diamondPath(r.x0, r.y0, r.x1 + 1, r.y1 + 1, 0);
    ctx.fillStyle = ok ? 'rgba(255,211,127,0.07)' : 'rgba(229,84,84,0.06)'; ctx.fill();
    ctx.save(); ctx.setLineDash([Math.max(4, ts * 0.5), Math.max(3, ts * 0.3)]);
    ctx.strokeStyle = ok ? ACC : 'rgba(229,84,84,0.75)'; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
    const c = P((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2, 0), price = CO.landPrice();
    label(ok ? CO.fmt(price) + ' ¢' : 'Hors d’atteinte', c[0], c[1], !ok || CO.state.money < price ? RED : ACC, CO.clamp(ts * 0.9, 12, 30));
  }

  // -------------------------------------------------------- belts & items
  function beltShape(b) {
    const back = world.at(b.x - DX[b.dir], b.y - DY[b.dir]);
    if (back && back !== b && CO.sim.outputsTo(back, b.x, b.y) === b.dir) return 0;
    let side = -1, count = 0;
    for (let k = 1; k <= 3; k += 2) {
      const d = (b.dir + k) & 3, n = world.at(b.x - DX[d], b.y - DY[d]);
      if (n && n !== b && CO.sim.outputsTo(n, b.x, b.y) === d) { count++; side = k; }
    }
    return count === 1 ? (side === 1 ? 1 : 2) : 0;
  }
  function itemTile(b, it) {
    let x = b.x + 0.5, y = b.y + 0.5;
    if (it.f === ((b.dir + 2) & 3)) { x += DX[b.dir] * (it.p - 0.5); y += DY[b.dir] * (it.p - 0.5); }
    else {
      const l = Math.max(0, 0.5 - it.p), fw = Math.max(0, it.p - 0.5);
      x += DX[it.f] * l + DX[b.dir] * fw; y += DY[it.f] * l + DY[b.dir] * fw;
    }
    return [x, y];
  }
  function drawItem(id, x, y, z) { blit(V.item(id), x, y, z, 1.5, 1.5, 0); }

  // ------------------------------------------------------------- frame
  ISO.draw = function (time, dt) {
    geom();
    ctx.imageSmoothingEnabled = false;
    CO.render.drawStars();
    drawGround();
    drawLand();

    const ov = CO.input ? CO.input.getOverlay() : null;
    const cur = CO.input ? CO.input.hoverInfo() : null;   // (picks against last frame's bodies)
    drawn = [];
    const flat = [], tall = [], list = world.list, m = ts * 3;
    for (let i = 0; i < list.length; i++) {
      const b = list[i], c = P(b.x + b.w / 2, b.y + b.h / 2), r = (b.w + b.h) * hw;
      if (c[0] < -r - m || c[0] > cw + r + m || c[1] < -r - m * 2 || c[1] > ch + r + m) continue;
      (b.kind === 'belt' || b.kind === 'tunnel_in' || b.kind === 'tunnel_out' || b.kind === 'pipe' ? flat : tall).push(b);
    }
    flat.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y) || a.x - b.x; });
    tall.sort(function (a, b) { return (a.x + a.w + a.y + a.h) - (b.x + b.w + b.y + b.h) || (a.x + a.y) - (b.x + b.y); });

    // 1. flat pieces and the items they carry
    for (let i = 0; i < flat.length; i++) {
      const b = flat[i];
      const spr = b.kind === 'belt'
        ? V.belt(b.def.tier || 0, b.dir, beltShape(b), Math.floor(time * b.def.speed * V.VT) % 4)
        : b.kind === 'pipe' ? V.pipe(CO.render.pipeMask(b), b.fnet && b.fnet.amount > 0 ? b.fnet.fluid : null)
        : V.building(b.type, b.dir, 0);
      drawBody(b, spr, time);
      if (b.items && !b.site) {
        for (let k = b.items.length - 1; k >= 0; k--) {
          const it = b.items[k];
          if (b.kind === 'tunnel_in' && it.p > 0.5) continue;
          const q = itemTile(b, it);
          drawItem(it.t, q[0], q[1], 0.25);
        }
      }
    }
    // tunnel links
    ctx.save(); ctx.setLineDash([ts * 0.12, ts * 0.12]); ctx.strokeStyle = 'rgba(255,211,127,0.6)'; ctx.lineWidth = Math.max(1, ts / 14);
    for (let i = 0; i < flat.length; i++) {
      const b = flat[i];
      if (b.kind !== 'tunnel_in') continue;
      const ex = CO.sim.findExit(b);
      if (!ex) continue;
      const a = P(b.x + 0.5, b.y + 0.5, 0.1), c = P(ex.x + 0.5, ex.y + 0.5, 0.1);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    ctx.restore();

    // 2. everything standing, back to front (a body hiding the pointer turns see-through)
    for (let i = 0; i < tall.length; i++) {
      const b = tall[i];
      let spr;
      if (b.kind === 'driver') spr = V.building(b.type, b.dir, 0);
      else {
        const nf = V.frames[b.type] || 1;
        const busy = b.status === 'work' || b.kind === 'port' || (b.kind === 'lab' && CO.state.research);
        spr = V.building(b.type, b.dir, busy && !b.site ? Math.floor(time * (b.kind === 'port' ? 1.5 : 6)) % nf : 0);
      }
      let alpha = 1;
      if (cur && !b.site && cur.b !== b) {
        const cx = cur.x, cy = cur.y;
        const inside = cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
        if (!inside && cx + cy < b.x + b.w + b.y + b.h - 2) {
          const q = P(cx + 0.5, cy + 0.5), xy = P(b.x, b.y);
          const left = xy[0] - spr.ox * sc, top = xy[1] - spr.oy * sc;
          if (q[0] > left && q[0] < left + spr.w * sc && q[1] > top && q[1] < top + spr.h * sc) alpha = 0.4;
        }
      }
      ctx.globalAlpha = alpha;
      drawBody(b, spr, time);
      if (!b.site) {
        decorate(b, time);
        if (CO.render.noPower(b)) { const q = P(b.x + b.w / 2, b.y + b.h / 2, heightOf(b) + 0.45); CO.render.bolt(q[0], q[1], Math.max(8, ts * 0.5), time); }
        if (b.lvl > 1) { const q = P(b.x, b.y + b.h, 0.1); CO.render.levelBadge(q[0] + ts * 0.1, q[1] - ts * 0.05, b.lvl, ts); }
      }
      ctx.globalAlpha = 1;
    }

    drawRockets(time);
    drawWires();
    drawDriverLinks(ov);
    drawShots(time);
    drawWorkers(time);

    // floating texts
    const fx = CO.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.age += dt;
      if (f.age > 1.6) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, 1.6 - f.age);
      const p = P(f.x, f.y, 1 + f.age * 0.9);
      label(f.text, p[0], p[1], ACC, ts * 0.42);
      ctx.globalAlpha = 1;
    }
    if (ov) drawOverlay(ov, time);
  };

  /** A building body (or a see-through construction site with its frame and progress). */
  function drawBody(b, spr, time) {
    const a = ctx.globalAlpha;
    if (b.site) ctx.globalAlpha = a * (b.site.paid ? 0.25 + 0.45 * (b.site.p / b.site.t) : 0.18);
    const at = blit(spr, b.x, b.y, 0, 0, 0, 0);
    drawn.push({ b: b, s: spr, x: at[0], y: at[1] });
    ctx.globalAlpha = a;
    if (!b.site) return;
    const working = !!(b.site.w && b.site.w.building), lw = Math.max(1, Math.round(ts / 16));
    if (!b.site.paid) {                                  // ghost: blue tint and frame, waiting for credits
      foot(b, 'rgba(110,160,255,0.18)', 'rgba(150,190,255,0.85)', lw, [Math.max(2, ts * 0.12), Math.max(2, ts * 0.12)]);
      return;
    }
    ctx.save(); ctx.lineDashOffset = working ? -time * ts * 0.8 : 0;
    foot(b, null, working ? ACC : 'rgba(255,211,127,0.55)', lw, [Math.max(2, ts * 0.2), Math.max(2, ts * 0.14)]);
    ctx.restore();
    if (b.site.p > 0) {
      const c = P(b.x + b.w / 2, b.y + b.h / 2, heightOf(b) + 0.25), bw = Math.max(ts * 0.8, b.w * hw), bh = Math.max(2, Math.round(ts * 0.08));
      ctx.fillStyle = OUT; ctx.fillRect(Math.round(c[0] - bw / 2) - 1, Math.round(c[1]) - 1, Math.round(bw) + 2, bh + 2);
      ctx.fillStyle = ACC; ctx.fillRect(Math.round(c[0] - bw / 2), Math.round(c[1]), Math.round(bw * b.site.p / b.site.t), bh);
    }
  }

  /** What sits on top of a building: output arrow, recipe/ore badge, status light, gauges, held item. */
  function decorate(b, time) {
    const k = b.kind, top = heightOf(b), c = P(b.x + b.w / 2, b.y + b.h / 2, top);
    const s = Math.max(3, Math.round(ts * 0.16));
    const led = function (col, x, y) { ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, s + 2, s + 2); ctx.fillStyle = col; ctx.fillRect(x, y, s, s); };
    if (k === 'machine' || k === 'drill') {
      arrowOut(b);
      const id = k === 'drill' ? b.ore : b.recipe, bs = Math.max(6, Math.round(ts * 0.5));
      const bx = Math.round(c[0] - bs / 2), by = Math.round(c[1] - bs - ts * 0.3);
      if (id) {
        ctx.fillStyle = OUT; ctx.fillRect(bx - 2, by - 2, bs + 4, bs + 4);
        ctx.fillStyle = '#2b2c33'; ctx.fillRect(bx - 1, by - 1, bs + 2, bs + 2);
        drawIcon(id, bx + bs / 2, by + bs / 2, bs);
      } else if (k === 'machine') label('?', c[0], by + bs / 2, ACC, ts * 0.7);
      led(CO.render.ledColor(b), bx + bs + 3, by);
    } else if (k === 'lab') {
      led(CO.render.ledColor(b), Math.round(c[0] - s / 2), Math.round(c[1] - ts * 0.6));
      if (CO.state.research) {
        const need = CO.TECHS[CO.state.research].cost; let n = 0;
        for (const id in need) if ((CO.state.researchProg[id] || 0) < need[id]) drawIcon(id, c[0] + (n++ - 1) * ts * 0.42, c[1] - ts * 0.15, ts * 0.36);
      }
    } else if (k === 'driver') {
      if (!CO.sim.driverTarget(b)) arrowOut(b);
      const ang = b.aim != null ? b.aim : b.dir * Math.PI / 2;
      const recoil = b.cd > b.def.reload - 0.3 ? (b.cd - (b.def.reload - 0.3)) / 0.3 * 0.2 : 0;
      const ox = b.x + b.w / 2, oy = b.y + b.h / 2, len = 1 - recoil;
      const a = P(ox, oy, 0.75), e = P(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len, 0.8);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = OUT; ctx.lineWidth = ts * 0.3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      ctx.strokeStyle = '#868895'; ctx.lineWidth = ts * 0.18; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      ctx.fillStyle = ACC; ctx.fillRect(Math.round(e[0] - ts * 0.07), Math.round(e[1] - ts * 0.07), Math.round(ts * 0.14), Math.round(ts * 0.14));
      gauge(b, b.q.length / b.def.capacity);
      led(CO.render.ledColor(b), Math.round(c[0] - s / 2), Math.round(c[1] - ts * 0.55));
    } else if (k === 'router' || k === 'unloader') {
      if (b.slot !== null) drawItem(b.slot, b.x + 0.5, b.y + 0.5, top);
      else if (b.filter) drawIcon(b.filter, c[0], c[1] - ts * 0.2, ts * 0.36);
      if (k === 'unloader') arrowOut(b);
    } else if (k === 'junction') {
      for (let d = 0; d < 4; d++) if (b.slots[d] !== null) drawItem(b.slots[d], b.x + 0.5 + DX[d] * 0.2, b.y + 0.5 + DY[d] * 0.2, top);
    } else if (k === 'chest') gauge(b, b.q.length / CO.chestCap(b.def));
    else if (k === 'generator') {
      led(CO.render.ledColor(b), Math.round(c[0] - s / 2), Math.round(c[1] - ts * 0.55));
      if (b.def.fuel) gauge(b, b.fuel / CO.power.FUEL_CAP);
    }
    else if (k === 'port') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2);
      ctx.strokeStyle = 'rgba(255,211,127,' + (0.2 + 0.4 * pulse) + ')'; ctx.lineWidth = Math.max(2, ts * 0.08);
      diamondPath(b.x + 0.15, b.y + 0.15, b.x + b.w - 0.15, b.y + b.h - 0.15, top); ctx.stroke();
    }
  }
  function gauge(b, f) {
    const c = P(b.x + b.w / 2, b.y + b.h / 2, heightOf(b) + 0.15), bw = Math.max(ts * 0.6, b.w * hw * 0.9), bh = Math.max(2, Math.round(ts * 0.08));
    ctx.fillStyle = OUT; ctx.fillRect(Math.round(c[0] - bw / 2) - 1, Math.round(c[1]) - 1, Math.round(bw) + 2, bh + 2);
    ctx.fillStyle = f > 0.9 ? RED : ACC; ctx.fillRect(Math.round(c[0] - bw / 2), Math.round(c[1]), Math.round(bw * f), bh);
  }
  /** Yellow arrow lying on the ground just outside the output edge. */
  function arrowOut(b) {
    const d = b.dir, dx = DX[d], dy = DY[d], nx = -dy, ny = dx;
    const mx = b.x + b.w / 2 + dx * b.w / 2, my = b.y + b.h / 2 + dy * b.h / 2;
    const t = P(mx + dx * 0.42, my + dy * 0.42, 0.05), l = P(mx + nx * 0.28, my + ny * 0.28, 0.05), r = P(mx - nx * 0.28, my - ny * 0.28, 0.05);
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(l[0], l[1]); ctx.lineTo(r[0], r[1]); ctx.closePath();
    ctx.fillStyle = ACC; ctx.fill(); ctx.lineWidth = Math.max(1, ts / 16); ctx.strokeStyle = OUT; ctx.stroke();
  }

  // ------------------------------------------------------- flying things
  function centre(b, z) { return P(b.x + b.w / 2, b.y + b.h / 2, z); }
  function drawDriverLinks(ov) {
    const list = world.list;
    ctx.save(); ctx.lineWidth = Math.max(1, ts / 14); ctx.setLineDash([ts * 0.3, ts * 0.25]);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.kind !== 'driver' || !b.target) continue;
      const tg = CO.sim.driverTarget(b);
      if (!tg) continue;
      const hot = ov && (ov.hover === b || ov.hover === tg || ov.selected.indexOf(b) >= 0 || ov.selected.indexOf(tg) >= 0);
      const a = centre(b, 0.8), c = centre(tg, 0.8);
      ctx.strokeStyle = hot ? 'rgba(255,211,127,0.75)' : 'rgba(255,211,127,0.22)';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    ctx.restore();
  }
  function drawShots(time) {
    const shots = CO.sim.shots;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], a = centre(s.from, 0.8), c = centre(s.to, 0.8), k = Math.min(1, s.t / s.dur);
      for (let j = 3; j >= 0; j--) {
        const kk = Math.max(0, k - j * 0.035), x = a[0] + (c[0] - a[0]) * kk, y = a[1] + (c[1] - a[1]) * kk - Math.sin(kk * Math.PI) * ts * 1.2;
        const r = Math.max(2, ts * (0.2 - j * 0.035));
        ctx.globalAlpha = j ? 0.35 - j * 0.08 : 1;
        ctx.fillStyle = j ? '#ff9d5c' : OUT; ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
      }
      ctx.globalAlpha = 1;
      const x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k - Math.sin(k * Math.PI) * ts * 1.2, r = Math.max(2, ts * 0.16);
      ctx.fillStyle = (Math.floor(time * 12) % 2) ? ACC : '#fff0c8'; ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
      drawIcon(s.items[0], x, y, ts * 0.28);
    }
  }
  /** Workers: voxel astronauts hovering 1 tile up, with their shadow and a welding beam. */
  /** Logistic drones flying above everything, with the item they carry. */
  function drawDrones(time) {
    const ds = CO.drones.all(), u = Math.max(1, Math.round(ts / 20));
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      if (d.idle) continue;
      const z = 2.2 + Math.sin(time * 6 + i) * 0.05, p = P(d.x, d.y, z), gnd = P(d.x, d.y, 0);
      if (p[0] < -ts * 2 || p[0] > cw + ts * 2 || p[1] < -ts * 3 || p[1] > ch + ts) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(gnd[0], gnd[1], ts * 0.18, ts * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      if (d.item) drawIcon(d.item, p[0], p[1] + u * 5, ts * 0.32);
      const x = Math.round(p[0]), y = Math.round(p[1]);
      ctx.fillStyle = OUT; ctx.fillRect(x - u * 3, y - u * 2, u * 6, u * 3);
      ctx.fillStyle = '#5f616c'; ctx.fillRect(x - u * 2, y - u * 1.5, u * 4, u * 2);
      ctx.fillStyle = Math.floor(time * 30 + i) % 2 ? '#d8dae2' : '#9a9caa';
      ctx.fillRect(x - u * 5, y - u * 3, u * 3, u); ctx.fillRect(x + u * 2, y - u * 3, u * 3, u);
      ctx.fillStyle = '#84f491'; ctx.fillRect(x - Math.ceil(u / 2), y - u, u, u);
    }
  }
  function drawWorkers(time) {
    drawDrones(time);
    const ws = CO.sim.workers;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], g = P(w.x, w.y, 0);
      if (g[0] < -ts * 2 || g[0] > cw + ts * 2 || g[1] < -ts * 3 || g[1] > ch + ts) continue;
      const z = 0.9 + Math.sin(time * 5 + i * 1.7) * 0.06;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(g[0], g[1], ts * 0.2, ts * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      let dir = 0;                                     // face the way it flies (or its job)
      const tgt = w.job && !w.job.dead ? [w.job.x + w.job.w / 2 - w.x, w.job.y + w.job.h / 2 - w.y] : null;
      const vx = tgt && (Math.abs(tgt[0]) + Math.abs(tgt[1]) > 0.05) ? tgt[0] : w.face, vy = tgt ? tgt[1] : 0;
      dir = Math.abs(vx) >= Math.abs(vy) ? (vx >= 0 ? 0 : 2) : (vy >= 0 ? 1 : 3);
      const flame = w.moving ? 1 + (Math.floor(time * 20 + i) % 2) : 0;
      const p = blit(V.worker(dir, flame), w.x, w.y, z, 2, 2, 0);
      if (w.building && w.job && !w.job.dead) {
        const j = w.job, k = time * 9 + i, hz = heightOf(j) * 0.7;
        const a = P(w.x, w.y, z + 0.4), e = P(j.x + j.w * (0.5 + 0.35 * Math.sin(k)), j.y + j.h * (0.5 + 0.35 * Math.cos(k * 1.3)), hz);
        ctx.strokeStyle = 'rgba(255,211,127,0.85)'; ctx.lineWidth = Math.max(1, ts / 22);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        const r = Math.max(1, Math.round(ts / 22));
        ctx.fillStyle = '#fff6d8'; ctx.fillRect(Math.round(e[0]) - r, Math.round(e[1]) - r, r * 2, r * 2);
      }
      void p;
    }
  }

  // ------------------------------------------------------------ overlay
  function rangeEllipse(b, valid) {
    const c = P(b.x + b.w / 2, b.y + b.h / 2, 0.02), r = b.def.range;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(c[0], c[1], r * hw * Math.SQRT2, r * hh * Math.SQRT2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,211,127,0.05)'; ctx.fill();
    ctx.setLineDash([ts * 0.4, ts * 0.3]); ctx.lineWidth = Math.max(2, ts / 12);
    ctx.strokeStyle = valid === false ? 'rgba(229,84,84,0.7)' : 'rgba(255,211,127,0.6)'; ctx.stroke();
    ctx.restore();
  }
  /** Rockets standing on launch pads, and the ones taking off (flame and a trail of smoke). */
  function drawRockets(time) {
    const list = world.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.kind !== 'launch_pad' || b.site || (!b.parts && b.phase === 'load')) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, alt = CO.orbit.altitude(b), full = b.phase !== 'load';
      const spr = V.rocket(full ? b.def.parts : b.parts, b.def.parts);
      if (alt > 0) {
        for (let k = 0; k < 6; k++) {                   // smoke trail
          const p = P(cx + Math.sin(k * 2.1 + time) * 0.25, cy, alt * (k / 6) + 0.3), r = ts * (0.25 + k * 0.06);
          ctx.fillStyle = 'rgba(200,200,210,' + (0.35 - k * 0.04) + ')';
          ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
        }
        const f = P(cx, cy, alt + 0.1);
        ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffd37f' : '#ff7a3a';
        ctx.beginPath(); ctx.moveTo(f[0] - ts * 0.2, f[1]); ctx.lineTo(f[0] + ts * 0.2, f[1]); ctx.lineTo(f[0], f[1] + ts * 0.9); ctx.closePath(); ctx.fill();
      }
      blit(spr, cx - 0.5, cy - 0.5, 0.25 + alt, 0, 0, 0);
    }
  }
  /** Height (tiles) where wires hook on a power node. */
  function hookZ(b) { return b.type === 'pole' ? 1.5 : b.type === 'pylon' ? 2.15 : heightOf(b) * 0.85; }
  /** Power wires, sagging a little between their two ends. */
  function drawWires() {
    const L = CO.power.links;
    if (!L.length) return;
    const lw = Math.max(1, Math.round(ts / 16));
    for (let i = 0; i < L.length; i++) {
      const a = L[i][0], b = L[i][1], za = hookZ(a), zb = hookZ(b);
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const p = P(ax, ay, za), q = P(bx, by, zb);
      if (Math.max(p[0], q[0]) < 0 || Math.min(p[0], q[0]) > cw || Math.max(p[1], q[1]) < 0 || Math.min(p[1], q[1]) > ch) continue;
      const sag = Math.min(0.6, 0.06 * Math.hypot(bx - ax, by - ay)), m = P((ax + bx) / 2, (ay + by) / 2, (za + zb) / 2 - sag * 2);
      ctx.strokeStyle = OUT; ctx.lineWidth = lw + 1.5;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(m[0], m[1], q[0], q[1]); ctx.stroke();
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(m[0], m[1], q[0], q[1]); ctx.stroke();
    }
  }
  /** Coverage zones of the power nodes, and what a pole being placed would connect to. */
  function drawZones(ov) {
    if (!CO.render.showZones(ov)) return;
    const nodes = CO.render.powerNodes(), lw = Math.max(1, Math.round(ts / 16)), dash = [Math.max(2, ts * 0.2), Math.max(2, ts * 0.15)];
    for (let i = 0; i < nodes.length; i++) {
      const z = CO.power.zone(nodes[i]);
      foot({ x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0 }, 'rgba(255,211,127,0.05)', 'rgba(255,211,127,0.35)', lw, dash);
    }
    for (let i = 0; i < ov.ghosts.length; i++) {
      const g = ov.ghosts[i], d = CO.BUILDINGS[g.type];
      if (d.kind !== 'pole' && d.kind !== 'generator') continue;
      const z = CO.power.zone({ x: g.x, y: g.y, w: d.w, h: d.h, def: d });
      foot({ x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0 }, 'rgba(132,244,145,0.10)', 'rgba(132,244,145,0.8)', lw, dash);
      if (d.kind !== 'pole') continue;
      ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = 'rgba(132,244,145,0.85)'; ctx.lineWidth = lw;
      const a = P(g.x + 0.5, g.y + 0.5, d.reach > 10 ? 2.15 : 1.5);
      for (let j = 0; j < nodes.length; j++) if (CO.power.reaches(g.type, g.x, g.y, nodes[j])) {
        const n = nodes[j], e = P(n.x + n.w / 2, n.y + n.h / 2, hookZ(n));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawOverlay(ov, time) {
    const lw = Math.max(2, Math.round(ts / 14));
    drawZones(ov);
    const hr = CO.render.hubRange(ov);
    if (hr) {
      const r = hr.def.range, x0 = hr.x + hr.w / 2 - r, y0 = hr.y + hr.h / 2 - r;
      foot({ x: x0, y: y0, w: r * 2, h: r * 2 }, 'rgba(132,244,145,0.05)', 'rgba(132,244,145,0.7)', lw, [ts * 0.3, ts * 0.2]);
    }
    if (ov.plot >= 0) drawPlotHover(ov.plot);
    if (ov.hover) wire(ov.hover, 'rgba(255,255,255,0.75)', lw);
    for (let i = 0; i < ov.selected.length; i++) wire(ov.selected[i], ACC, lw);
    for (let i = 0; i < ov.deleting.length; i++) { foot(ov.deleting[i], 'rgba(229,84,84,0.42)'); wire(ov.deleting[i], RED, lw); }
    if (ov.cursorCell) foot({ x: ov.cursorCell.x, y: ov.cursorCell.y, w: 1, h: 1 }, null, ov.cursorColor, lw);
    if (ov.link) {
      const L = ov.link, a = centre(L.src, 0.8);
      rangeEllipse(L.src, true);
      const end = L.target ? centre(L.target, 0.8) : P(L.cur.x, L.cur.y, 0);
      ctx.save(); ctx.setLineDash([ts * 0.3, ts * 0.2]); ctx.lineDashOffset = -time * ts;
      ctx.strokeStyle = L.valid ? ACC : RED; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(end[0], end[1]); ctx.stroke(); ctx.restore();
      if (L.target) wire(L.target, L.valid ? ACC : RED, lw * 1.5);
      wire(L.src, ACC, lw);
    }
    // placement ghosts, back to front
    const gh = ov.ghosts.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
    for (let i = 0; i < gh.length; i++) {
      const g = gh[i], def = CO.BUILDINGS[g.type], box = { x: g.x, y: g.y, w: def.w, h: def.h, dir: g.dir };
      if (def.kind === 'driver' && gh.length === 1) rangeEllipse({ x: g.x, y: g.y, w: def.w, h: def.h, def: def }, g.valid);
      foot(box, !g.valid ? 'rgba(229,84,84,0.45)' : g.ghost ? 'rgba(110,160,255,0.3)' : 'rgba(255,211,127,0.14)',
        !g.valid ? 'rgba(229,84,84,0.95)' : g.ghost ? 'rgba(150,190,255,0.95)' : 'rgba(255,211,127,0.95)', lw);
      const spr = def.kind === 'belt' ? V.belt(def.tier || 0, g.dir, 0, 0) : V.building(g.type, g.dir, 0);
      ctx.globalAlpha = g.valid ? 0.75 : 0.5;
      blit(spr, g.x, g.y, 0, 0, 0, 0);
      ctx.globalAlpha = 1;
      if (def.w * def.h > 1 && def.kind !== 'lab' && def.kind !== 'seller' && def.kind !== 'port') arrowOut(box);
    }
    // underground pieces being placed: the link they will make, or their reach when they find nothing
    for (let i = 0; i < ov.tunnels.length; i++) {
      const t = ov.tunnels[i];
      ctx.save();
      if (t.b) {
        const a = P(t.a.x + 0.5, t.a.y + 0.5, 0.15), e = P(t.b.x + 0.5, t.b.y + 0.5, 0.15);
        ctx.setLineDash([ts * 0.2, ts * 0.15]); ctx.lineDashOffset = -time * ts;
        ctx.strokeStyle = ACC; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        ctx.setLineDash([]); foot({ x: t.b.x, y: t.b.y, w: 1, h: 1 }, 'rgba(255,211,127,0.18)', ACC, lw);
      } else {
        for (let k = 0; k < t.cells.length; k++)
          foot({ x: t.cells[k].x + 0.15, y: t.cells[k].y + 0.15, w: 0.7, h: 0.7 }, null, 'rgba(229,84,84,0.6)', Math.max(1, lw / 2), [ts * 0.12, ts * 0.12]);
      }
      ctx.restore();
    }
    if (ov.selRect) {
      const r = ov.selRect, col = ov.selDelete ? RED : ACC;
      diamondPath(r.x0, r.y0, r.x1 + 1, r.y1 + 1, 0.02);
      ctx.fillStyle = ov.selDelete ? 'rgba(229,84,84,0.14)' : 'rgba(255,211,127,0.12)'; ctx.fill();
      ctx.save(); ctx.setLineDash([ts * 0.25, ts * 0.2]); ctx.lineDashOffset = -time * ts * 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
    }
  }

  // ------------------------------------------------------------- picking
  /** Front-most building whose drawn pixels cover the CSS point (sx, sy), from the last frame. */
  ISO.pick = function (sx, sy) {
    const X = sx * dpr, Y = sy * dpr;
    for (let i = drawn.length - 1; i >= 0; i--) {
      const d = drawn[i], s = d.s;
      if (d.b.dead || d.b.kind === 'belt') continue;
      const u = Math.floor((X - d.x) / sc), v = Math.floor((Y - d.y) / sc);
      if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue;
      if (s.buf[v * s.w + u]) return d.b;
    }
    return null;
  };
})(window.CO = window.CO || {});
