/*
 * render.js — draws the world on the main canvas. Everything is drawn in device pixels
 * with an integer tile size so pixel art stays crisp at every zoom level.
 * Only what is visible on screen is drawn (culling), so a few hundred buildings stay smooth.
 */
(function (CO) {
  'use strict';
  const T = CO.TILE, DX = CO.DX, DY = CO.DY, world = CO.world, sprites = CO.sprites, ITEMS = CO.ITEMS;
  const Rn = CO.render = {};
  const ACC = '#ffd37f', OUT = '#1f1f25';
  const GHOST_FILL = 'rgba(110,160,255,0.18)', GHOST_LINE = 'rgba(150,190,255,0.85)';   // unpaid ghost sites            // Mindustry-like team accent and outline
  let canvas, ctx, cw = 0, ch = 0, dpr = 1, ts = 32, ox = 0, oy = 0;
  let terrainKey = '', starPat = null;

  Rn.init = function (c) {
    canvas = c; ctx = c.getContext('2d');
    Rn.resize();
    window.addEventListener('resize', Rn.resize);
  };
  Rn.resize = function () {
    dpr = window.devicePixelRatio || 1;
    cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = cw; canvas.height = ch;
  };
  Rn.dpr = function () { return dpr; };

  // View mode: 'iso' (isometric voxel view, see iso.js) or 'top' (flat top-down pixel art below).
  const VIEW_KEY = 'chantier-orbital-view';
  Rn.mode = 'iso';
  try { if (localStorage.getItem(VIEW_KEY) === 'top') Rn.mode = 'top'; } catch (e) { /* storage unavailable */ }
  Rn.toggleMode = function () {
    Rn.mode = Rn.mode === 'iso' ? 'top' : 'iso';
    try { localStorage.setItem(VIEW_KEY, Rn.mode); } catch (e) { /* ignore */ }
    CO.emit('view', Rn.mode);
  };
  Rn.surface = function () { return { ctx: ctx, cw: cw, ch: ch, dpr: dpr }; };
  /** Move the camera as if the map had been dragged by (dx, dy) CSS pixels. */
  Rn.pan = function (dx, dy) {
    if (Rn.mode === 'iso' && CO.iso) { CO.iso.pan(dx, dy); return; }
    CO.cam.x -= dx / CO.cam.zoom; CO.cam.y -= dy / CO.cam.zoom;
  };
  // ------------------------------------------------------------ power (shared with iso.js)
  const NOPOWER = '#8f7bff';
  /** Status light colour: green working, orange waiting, red blocked, violet without power. */
  Rn.ledColor = function (b) {
    if (b.kind === 'lab') return !CO.state.research ? '#ffb347' : b.pw > 0 ? '#84f491' : NOPOWER;
    if (b.kind === 'generator') return b.status === 'work' ? '#84f491' : b.status === 'nofuel' ? '#e55454' : '#ffb347';
    return b.status === 'work' ? '#84f491' : b.status === 'blocked' ? '#e55454' : b.status === 'nopower' ? NOPOWER : '#ffb347';
  };
  /** Does `b` stand still for lack of power? (gets the blinking bolt badge) */
  Rn.noPower = function (b) {
    if (!b.def.power || b.site) return false;
    if (b.kind === 'lab') return !!CO.state.research && !(b.pw > 0);
    return b.status === 'nopower';
  };
  /** Blinking lightning badge centred on (x, y), `s` pixels wide. */
  Rn.bolt = function (x, y, s, time) {
    if (Math.floor(time * 2.5) % 3 === 2) return;
    x = Math.round(x); y = Math.round(y); s = Math.round(s);
    ctx.fillStyle = OUT; ctx.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
    ctx.fillStyle = '#4a1f5a'; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.fillStyle = ACC; ctx.beginPath();
    [[0.12, -0.42], [-0.28, 0.06], [-0.02, 0.06], [-0.14, 0.42], [0.28, -0.1], [0.02, -0.1]].forEach(function (q, i) {
      const X = x + q[0] * s, Y = y + q[1] * s; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    });
    ctx.closePath(); ctx.fill();
  };
  /** Level chevrons (one per level above I) whose bottom-left corner is (x, y). */
  Rn.levelBadge = function (x, y, lvl, ts) {
    const u = Math.max(1, Math.round(ts / 16)), w = 5 * u, hh = 3 * u;
    for (let i = 0; i < lvl - 1; i++) {
      const by = Math.round(y - (i + 1) * (hh + u));
      ctx.fillStyle = OUT; ctx.fillRect(Math.round(x) - u, by - u, w + 2 * u, hh + 2 * u);
      ctx.fillStyle = ACC;
      for (let k = 0; k < 3; k++) { ctx.fillRect(Math.round(x) + k * u, by + (2 - k) * u, u, u); ctx.fillRect(Math.round(x) + (4 - k) * u, by + (2 - k) * u, u, u); }
    }
  };
  /** Should the coverage zones of the power network be shown? (placing / inspecting energy pieces) */
  Rn.showZones = function (ov) {
    if (CO.planet().grid !== 'poles') return false;                 // Kéora: the power runs in the tubes
    const ins = CO.input.get().inspected;
    if (ins && !ins.dead && (ins.kind === 'pole' || ins.kind === 'generator' || ins.kind === 'port')) return true;
    for (let i = 0; i < ov.ghosts.length; i++) {
      const d = CO.BUILDINGS[ov.ghosts[i].type];
      if (d.kind === 'pole' || d.kind === 'generator' || d.power) return true;
    }
    return false;
  };
  /** Power nodes of the networks (built ones). */
  Rn.powerNodes = function () {
    const out = [], nets = CO.power.nets;
    for (let i = 0; i < nets.length; i++) for (let j = 0; j < nets[i].nodes.length; j++) out.push(nets[i].nodes[j]);
    return out;
  };
  function drawWiresTop() {
    const L = CO.power.links;
    if (!L.length) return;
    const lw = Math.max(1, Math.round(ts / 14));
    for (let i = 0; i < L.length; i++) {
      const a = L[i][0], b = L[i][1];
      const ax = ox + (a.x + a.w / 2) * ts, ay = oy + (a.y + a.h / 2) * ts, bx = ox + (b.x + b.w / 2) * ts, by = oy + (b.y + b.h / 2) * ts;
      if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > cw || Math.max(ay, by) < 0 || Math.min(ay, by) > ch) continue;
      ctx.strokeStyle = OUT; ctx.lineWidth = lw + 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  }
  function drawZonesTop(ov) {
    if (!Rn.showZones(ov)) return;
    const nodes = Rn.powerNodes(), lw = Math.max(1, Math.round(ts / 16));
    ctx.save(); ctx.setLineDash([Math.max(2, ts * 0.2), Math.max(2, ts * 0.15)]);
    const zone = function (z, fill, stroke) {
      const x = ox + z.x0 * ts, y = oy + z.y0 * ts, w = (z.x1 - z.x0) * ts, hh = (z.y1 - z.y0) * ts;
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, hh - lw);
    };
    for (let i = 0; i < nodes.length; i++) zone(CO.power.zone(nodes[i]), 'rgba(255,211,127,0.05)', 'rgba(255,211,127,0.35)');
    for (let i = 0; i < ov.ghosts.length; i++) {
      const g = ov.ghosts[i], d = CO.BUILDINGS[g.type];
      if (d.kind !== 'pole' && d.kind !== 'generator') continue;
      zone(CO.power.zone({ x: g.x, y: g.y, w: d.w, h: d.h, def: d }), 'rgba(132,244,145,0.10)', 'rgba(132,244,145,0.8)');
      if (d.kind !== 'pole') continue;
      ctx.strokeStyle = 'rgba(132,244,145,0.8)'; ctx.lineWidth = lw;
      for (let j = 0; j < nodes.length; j++) if (CO.power.reaches(g.type, g.x, g.y, nodes[j])) {
        const n = nodes[j];
        ctx.beginPath(); ctx.moveTo(ox + (g.x + 0.5) * ts, oy + (g.y + 0.5) * ts); ctx.lineTo(ox + (n.x + n.w / 2) * ts, oy + (n.y + n.h / 2) * ts); ctx.stroke();
      }
    }
    ctx.restore();
  }
  Rn.drawZonesTop = drawZonesTop;

  /** Kéora: beam colour from the power of its network (full, short, none) as "r,g,b". */
  Rn.beamColor = function (net) { const s = net ? net.sat : 0; return s >= 0.999 ? '94,240,255' : s > 0 ? '255,179,71' : '229,84,84'; };
  /** Can building `def` shoot an energy beam (Kéora)? */
  Rn.emitsBeam = function (def) { return CO.planet().grid === 'beams' && (!!def.gen || def.kind === 'kaccu' || def.kind === 'kprism' || def.kind === 'ksplit'); };
  /** Segments the beam of a ghost `g` would follow (straight on, up to the first prism). */
  Rn.ghostBeams = function (g) {
    const def = CO.BUILDINGS[g.type], src = { x: g.x, y: g.y, w: def.w, h: def.h, dir: g.dir, kind: def.kind }, out = [];
    const dirs = def.kind === 'port' ? [0, 1, 2, 3] : def.kind === 'ksplit' ? [g.dir, (g.dir + 1) & 3, (g.dir + 3) & 3] : [g.dir];
    dirs.forEach(function (d) {
      const s = CO.power.trace(src, d, function (o) { return !(o.kind === 'kprism' || o.kind === 'ksplit'); });
      if (s) out.push(s);
    });
    return out;
  };
  /** Sides a tube of Kéora's network connects to (same bits as pipes), and whether its network is busy. */
  Rn.tubeMask = function (b) {
    let m = 0;
    for (let d = 0; d < 4; d++) if (CO.tubes.links(b, world.at(b.x + DX[d], b.y + DY[d]))) m |= 1 << d;
    return m;
  };
  Rn.tubeGlow = function (b) { return b.knet && b.knet.flow > 0.05 ? 1 : 0; };
  /** Sides a pipe connects to: 1 E, 2 S, 4 W, 8 N. */
  Rn.pipeMask = function (b) {
    let m = 0;
    for (let d = 0; d < 4; d++) if (CO.fluid.links(b, world.at(b.x + DX[d], b.y + DY[d]))) m |= 1 << d;
    return m;
  };
  /** Building drawn under a screen point (iso: the tall bodies hide the ground behind them), or null. */
  Rn.pick = function (sx, sy) { return Rn.mode === 'iso' && CO.iso ? CO.iso.pick(sx, sy) : null; };
  function geom() {
    const cam = CO.cam;
    ts = Math.max(4, Math.round(cam.zoom * dpr));
    ox = Math.round(cw / 2 - cam.x * ts);
    oy = Math.round(ch / 2 - cam.y * ts);
  }
  /** CSS pixel position (relative to the canvas) → fractional tile coordinates. */
  Rn.screenToWorld = function (sx, sy) {
    if (Rn.mode === 'iso' && CO.iso) return CO.iso.screenToWorld(sx, sy);
    geom();
    return { x: (sx * dpr - ox) / ts, y: (sy * dpr - oy) / ts };
  };
  Rn.invalidateTerrain = function () { terrainKey = ''; };

  // ------------------------------------------------------------ helpers
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

  function drawIcon(id, cx, cy, size) {
    const s = Math.max(2, Math.round(size));
    ctx.drawImage(sprites.item(id), 0, 0, 8, 8, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
  }

  function itemTile(b, it) {          // item position in tile coordinates
    let cx = b.x + 0.5, cy = b.y + 0.5;
    if (it.f === ((b.dir + 2) & 3)) { cx += DX[b.dir] * (it.p - 0.5); cy += DY[b.dir] * (it.p - 0.5); }
    else {
      const l = Math.max(0, 0.5 - it.p), fw = Math.max(0, it.p - 0.5);
      cx += DX[it.f] * l + DX[b.dir] * fw; cy += DY[it.f] * l + DY[b.dir] * fw;
    }
    return [cx, cy];
  }

  function drawArrowOut(b) {          // yellow marker on the output edge of a machine
    const px = ox + b.x * ts, py = oy + b.y * ts, pw = b.w * ts, ph = b.h * ts, s = ts * 0.32;
    let cx, cy;
    switch (b.dir) {
      case 0: cx = px + pw; cy = py + ph / 2; break;
      case 1: cx = px + pw / 2; cy = py + ph; break;
      case 2: cx = px; cy = py + ph / 2; break;
      default: cx = px + pw / 2; cy = py;
    }
    const dx = DX[b.dir], dy = DY[b.dir], nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(cx + dx * s * 0.7, cy + dy * s * 0.7);
    ctx.lineTo(cx - dx * s * 0.5 + nx * s * 0.8, cy - dy * s * 0.5 + ny * s * 0.8);
    ctx.lineTo(cx - dx * s * 0.5 - nx * s * 0.8, cy - dy * s * 0.5 - ny * s * 0.8);
    ctx.closePath();
    ctx.fillStyle = ACC; ctx.fill();
    ctx.lineWidth = Math.max(1, ts / 14); ctx.strokeStyle = OUT; ctx.stroke();
  }

  // Ground: chunks of 32×32 tiles baked on demand at full, half or quarter resolution (by zoom), kept
  // in small LRU caches; at most a few new chunks are baked per frame so zooming out never stalls.
  const TCH = 32, TLODS = [{ f: 1, cap: 48 }, { f: 0.5, cap: 120 }, { f: 0.25, cap: 170 }];
  const tcache = TLODS.map(function () { return new Map(); });
  let bakeBudget = 0;
  function ensureTerrain() {
    const key = world.seed + ':' + world.oreRev;
    if (terrainKey === key) return;
    terrainKey = key; tcache.forEach(function (m) { m.clear(); });
  }
  function terrainChunk(cx, cy, li) {
    const m = tcache[li], k = cx + ',' + cy;
    let c = m.get(k);
    if (c) { m.delete(k); m.set(k, c); return c; }
    if (bakeBudget-- <= 0) return null;
    const full = sprites.terrainChunk(cx * TCH, cy * TCH, TCH), f = TLODS[li].f;
    if (f === 1) c = full;
    else {
      c = document.createElement('canvas'); c.width = c.height = Math.ceil(TCH * T * f);
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(full, 0, 0, c.width, c.height);
    }
    m.set(k, c);
    if (m.size > TLODS[li].cap) m.delete(m.keys().next().value);
    return c;
  }
  function drawTerrain(x0, y0, x1, y1) {
    bakeBudget = 4;
    const s = ts / T, li = s >= 0.75 ? 0 : s >= 0.375 ? 1 : 2;
    for (let cy = Math.floor(y0 / TCH); cy <= Math.floor(y1 / TCH); cy++) for (let cx = Math.floor(x0 / TCH); cx <= Math.floor(x1 / TCH); cx++) {
      const c = terrainChunk(cx, cy, li);
      if (c) ctx.drawImage(c, 0, 0, c.width, c.height, ox + cx * TCH * ts, oy + cy * TCH * ts, TCH * ts, TCH * ts);
    }
  }

  Rn.drawStars = function () { drawStars(); };
  function drawStars() {
    if (!starPat) {
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const g = c.getContext('2d'), rnd = CO.rng(7);
      g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, 200, 200);
      for (let i = 0; i < 50; i++) {
        const b = rnd(); g.fillStyle = b > 0.85 ? '#9a9aa6' : b > 0.4 ? '#45454f' : '#26262c';
        g.fillRect(Math.floor(rnd() * 200), Math.floor(rnd() * 200), 2, 2);
      }
      starPat = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = starPat; ctx.fillRect(0, 0, cw, ch);
  }

  // --------------------------------------------------------------- frame
  Rn.draw = function (time, dt) {
    if (Rn.mode === 'iso' && CO.iso) { CO.iso.draw(time, dt); return; }
    geom();
    ensureTerrain();
    ctx.imageSmoothingEnabled = false;
    drawStars();
    const W = world.W, H = world.H;
    const x0 = Math.max(0, Math.floor(-ox / ts)), y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(W - 1, Math.floor((cw - ox) / ts)), y1 = Math.min(H - 1, Math.floor((ch - oy) / ts));
    if (x1 < x0 || y1 < y0) return;
    drawTerrain(x0, y0, x1, y1);

    if (ts >= 20) {                                   // strict grid, faint
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(ox + x * ts + 0.5, oy + y0 * ts); ctx.lineTo(ox + x * ts + 0.5, oy + (y1 + 1) * ts); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(ox + x0 * ts, oy + y * ts + 0.5); ctx.lineTo(ox + (x1 + 1) * ts, oy + y * ts + 0.5); }
      ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,211,127,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W * ts, H * ts);
    drawLand(x0, y0, x1, y1);

    const ov = CO.input ? CO.input.getOverlay() : null;
    const list = world.list, vis = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.x + b.w <= x0 || b.x > x1 || b.y + b.h <= y0 || b.y > y1) continue;
      vis.push(b);
    }

    // 0. soft drop shadows (offset down-right), under everything but belts
    const so = Math.max(1, Math.round(ts * 0.14));
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i];
      if (b.kind === 'belt' || b.site) continue;
      const inset = b.w === 1 ? ts * 0.06 : 0;
      ctx.fillRect(ox + b.x * ts + so + inset, oy + b.y * ts + so + inset, b.w * ts - inset * 2, b.h * ts - inset * 2);
    }

    // 1. bodies
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i], px = ox + b.x * ts, py = oy + b.y * ts;
      let spr;
      if (b.kind === 'belt') {
        const tier = b.def.tier || 0;
        spr = sprites.belt(tier, b.dir, beltShape(b), Math.floor(time * b.def.speed * 16) % 16);
      } else if (b.kind === 'pipe') {
        spr = sprites.pipe(Rn.pipeMask(b), b.fnet && b.fnet.amount > 0 ? b.fnet.fluid : null);
      } else if (b.kind === 'ktube') {
        spr = sprites.tube(Rn.tubeMask(b), Rn.tubeGlow(b));
      } else if (b.kind === 'driver') {
        spr = sprites.building(b.type, b.dir, 1);         // base only: the barrel is drawn aimed at the target
      } else {
        const nf = sprites.frames[b.type] || 1;
        const busy = b.status === 'work' || b.kind === 'port' || (b.kind === 'lab' && CO.state.research);
        const f = busy ? Math.floor(time * (b.kind === 'port' ? 1.5 : 7)) % nf : 0;
        spr = sprites.building(b.type, b.dir, f);
      }
      if (b.site) {                                   // construction site: see-through, filling up as it is built
        ctx.globalAlpha = b.site.paid ? 0.25 + 0.45 * (b.site.p / b.site.t) : 0.18;
        ctx.drawImage(spr, 0, 0, spr.width, spr.height, px, py, b.w * ts, b.h * ts);
        ctx.globalAlpha = 1;
        drawSite(b, px, py, time);
        continue;
      }
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, px, py, b.w * ts, b.h * ts);
    }

    // tunnel links
    ctx.save(); ctx.setLineDash([ts * 0.12, ts * 0.12]); ctx.strokeStyle = 'rgba(255,211,127,0.6)'; ctx.lineWidth = Math.max(1, ts / 14);
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i];
      if (b.kind !== 'tunnel_in') continue;
      const ex = CO.sim.findExit(b);
      if (!ex) continue;
      ctx.beginPath(); ctx.moveTo(ox + (b.x + 0.5) * ts, oy + (b.y + 0.5) * ts); ctx.lineTo(ox + (ex.x + 0.5) * ts, oy + (ex.y + 0.5) * ts); ctx.stroke();
    }
    ctx.restore();
    drawDriverLinks(ov);
    drawBeamsTop(time);

    // 2. items carried on belts / held by routers / chest fill
    const isz = ts * 0.42;
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i];
      if (b.items) {
        for (let k = b.items.length - 1; k >= 0; k--) {
          const it = b.items[k];
          if (b.kind === 'tunnel_in' && it.p > 0.5) continue;
          const pos = itemTile(b, it);
          drawIcon(it.t, ox + pos[0] * ts, oy + pos[1] * ts, isz);
        }
      } else if ((b.kind === 'router' || b.kind === 'unloader') && b.slot !== null) {
        drawIcon(b.slot, ox + (b.x + 0.5) * ts, oy + (b.y + 0.5) * ts, isz);
      } else if (b.kind === 'junction') {
        for (let d = 0; d < 4; d++) if (b.slots[d] !== null)
          drawIcon(b.slots[d], ox + (b.x + 0.5 + CO.DX[d] * 0.22) * ts, oy + (b.y + 0.5 + CO.DY[d] * 0.22) * ts, isz * 0.8);
      }
    }

    // 3. overlays: output arrows, recipe icons, status LEDs
    for (let i = 0; i < vis.length; i++) {
      if (vis[i].site) continue;
      const b = vis[i], px = ox + b.x * ts, py = oy + b.y * ts, cx = px + b.w * ts / 2, cy = py + b.h * ts / 2;
      const k = b.kind;
      if (k === 'machine' || k === 'drill') {
        drawArrowOut(b);
        const id = k === 'drill' ? b.ore : b.recipe;
        if (id) {                                    // recipe / ore badge in the top-right corner (keeps the machine art visible)
          const bs = Math.max(6, Math.round(ts * 0.5)), bx = px + b.w * ts - bs - ts * 0.1, by = py + ts * 0.1;
          ctx.fillStyle = OUT; ctx.fillRect(bx - 2, by - 2, bs + 4, bs + 4);
          ctx.fillStyle = '#2b2c33'; ctx.fillRect(bx - 1, by - 1, bs + 2, bs + 2);
          drawIcon(id, bx + bs / 2, by + bs / 2, bs);
        }
        else if (k === 'machine') {
          ctx.fillStyle = ACC; ctx.font = 'bold ' + Math.round(ts * 0.8) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, cy);
        }
        const led = Rn.ledColor(b);
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.12 - 1, py + ts * 0.12 - 1, s + 2, s + 2);
        ctx.fillStyle = led; ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
        if (b.def.mode === 'kiln') {                 // crucible: heat gauge, white-hot once at the ore's temperature
          const rec = b.recipe ? CO.RECIPES[b.recipe] : null, f = Math.min(1, (b.heat || 20) / b.def.maxHeat), gw = b.w * ts - ts * 0.6, gh = Math.max(2, ts * 0.09);
          ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, gw, gh);
          ctx.fillStyle = rec && b.heat >= rec.temp ? '#ffe0a0' : '#ff7a3a'; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, gw * f, gh);
          if (rec) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px + ts * 0.3 + gw * rec.temp / b.def.maxHeat, py + b.h * ts - ts * 0.24, Math.max(1, ts * 0.04), gh + ts * 0.08); }
        } else if (b.def.mode === 'grower' && b.slots) {   // crystalliser: one dot per crystal growing
          for (let i = 0; i < b.slots.length; i++) {
            const r = CO.RECIPES[b.slots[i].r], f = Math.min(1, b.slots[i].p / r.time), d = Math.max(2, ts * 0.14);
            ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.3 + i * d * 1.5 - 1, py + b.h * ts - ts * 0.24 - 1, d + 2, d + 2);
            ctx.fillStyle = f >= 1 ? '#ffffff' : 'rgba(192,96,240,' + (0.35 + 0.65 * f) + ')'; ctx.fillRect(px + ts * 0.3 + i * d * 1.5, py + b.h * ts - ts * 0.24, d, d);
          }
        }
      } else if (k === 'lab') {
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.12 - 1, py + ts * 0.12 - 1, s + 2, s + 2);
        ctx.fillStyle = Rn.ledColor(b);
        ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
        if (CO.state.research) {                                  // show what the lab is waiting for
          const need = CO.TECHS[CO.state.research].cost; let n = 0;
          for (const id in need) if ((CO.state.researchProg[id] || 0) < need[id]) drawIcon(id, px + ts * (0.5 + n++ * 0.45), py + b.h * ts - ts * 0.4, ts * 0.38);
        }
      } else if (k === 'driver') {
        const tg = CO.sim.driverTarget(b);
        if (!tg) drawArrowOut(b);                    // receivers unload through their front
        const ang = b.aim != null ? b.aim : b.dir * Math.PI / 2;
        const recoil = b.cd > b.def.reload - 0.3 ? (b.cd - (b.def.reload - 0.3)) / 0.3 * ts * 0.18 : 0;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        ctx.drawImage(sprites.barrel(), 0, 0, 16, 8, Math.round(-ts * 0.12 - recoil), Math.round(-ts * 0.25), Math.round(ts), Math.round(ts * 0.5));
        ctx.restore();
        const f = b.q.length / b.def.capacity;          // stock gauge along the bottom edge
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, b.w * ts - ts * 0.6, Math.max(2, ts * 0.09));
        ctx.fillStyle = f > 0.9 ? '#e55454' : ACC; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, (b.w * ts - ts * 0.6) * f, Math.max(2, ts * 0.09));
        const led = Rn.ledColor(b);
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.12 - 1, py + ts * 0.12 - 1, s + 2, s + 2);
        ctx.fillStyle = led; ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
      } else if ((k === 'router' || k === 'unloader') && b.filter) {
        drawIcon(b.filter, cx, cy, ts * 0.36);
      } else if (k === 'ksilo' || k === 'kaccu') {                 // stock gauge along the bottom edge
        if (k === 'kaccu') drawArrowOut(b);
        const f = k === 'ksilo' ? b.q.length / b.def.capacity : b.charge / b.def.capacity;
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, b.w * ts - ts * 0.6, Math.max(2, ts * 0.09));
        ctx.fillStyle = k === 'kaccu' ? '#5fe0a8' : f > 0.9 ? '#e55454' : '#5ef0ff';
        ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, (b.w * ts - ts * 0.6) * f, Math.max(2, ts * 0.09));
      } else if (k === 'chest') {
        const f = b.q.length / CO.chestCap(b.def);
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.15, py + ts * 0.84, ts * 0.7, Math.max(2, ts * 0.09));
        ctx.fillStyle = f > 0.9 ? '#e55454' : ACC; ctx.fillRect(px + ts * 0.15, py + ts * 0.84, ts * 0.7 * f, Math.max(2, ts * 0.09));
      } else if (k === 'port') {
        const pulse = 0.5 + 0.5 * Math.sin(time * 2);
        ctx.strokeStyle = 'rgba(' + (b.def.planet ? '94,240,255' : '255,211,127') + ',' + (0.2 + 0.4 * pulse) + ')'; ctx.lineWidth = Math.max(2, ts * 0.1);
        ctx.strokeRect(px + ts * 0.1, py + ts * 0.1, b.w * ts - ts * 0.2, b.h * ts - ts * 0.2);
      } else if (k === 'generator') {
        if (Rn.emitsBeam(b.def)) drawArrowOut(b);
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.12 - 1, py + ts * 0.12 - 1, s + 2, s + 2);
        ctx.fillStyle = Rn.ledColor(b); ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
        if (b.def.fuel) {                            // fuel gauge along the bottom edge
          const f = b.fuel / CO.power.FUEL_CAP;
          ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, b.w * ts - ts * 0.6, Math.max(2, ts * 0.09));
          ctx.fillStyle = f < 0.2 ? '#e55454' : ACC; ctx.fillRect(px + ts * 0.3, py + b.h * ts - ts * 0.2, (b.w * ts - ts * 0.6) * f, Math.max(2, ts * 0.09));
        }
      }
      if (Rn.noPower(b)) Rn.bolt(cx, cy, Math.max(8, ts * 0.5), time);
      if (b.lvl > 1) Rn.levelBadge(px + ts * 0.08, py + b.h * ts - ts * 0.08, b.lvl, ts);
    }
    drawWiresTop();
    drawRocketsTop(time);

    drawShots(time);

    drawWorkers(time);

    // 4. floating texts
    const fx = CO.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.age += dt;
      if (f.age > 1.6) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, 1.6 - f.age);
      ctx.font = 'bold ' + Math.round(ts * 0.42) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = ox + f.x * ts, ty = oy + (f.y - f.age * 0.7) * ts;
      ctx.fillStyle = OUT; ctx.fillText(f.text, tx + 1, ty + 1);
      ctx.fillStyle = ACC; ctx.fillText(f.text, tx, ty);
      ctx.globalAlpha = 1;
    }

    if (ov) drawOverlay(ov, time);
  };

  // ------------------------------------------------------------ builders
  /** Site frame: dashed yellow outline (marching while a worker builds it) and a progress bar. */
  function drawSite(b, px, py, time) {
    const w = b.w * ts, hh = b.h * ts, lw = Math.max(1, Math.round(ts / 16)), working = !!(b.site.w && b.site.w.building);
    if (!b.site.paid) {                               // ghost: blue tint and frame, waiting for credits
      ctx.fillStyle = GHOST_FILL; ctx.fillRect(px, py, w, hh);
      ctx.save(); ctx.setLineDash([Math.max(2, ts * 0.12), Math.max(2, ts * 0.12)]);
      ctx.strokeStyle = GHOST_LINE; ctx.lineWidth = lw; ctx.strokeRect(px + lw, py + lw, w - lw * 2, hh - lw * 2);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.setLineDash([Math.max(2, ts * 0.2), Math.max(2, ts * 0.14)]);
    ctx.lineDashOffset = working ? -time * ts * 0.8 : 0;
    ctx.strokeStyle = working ? ACC : 'rgba(255,211,127,0.55)'; ctx.lineWidth = lw;
    ctx.strokeRect(px + lw, py + lw, w - lw * 2, hh - lw * 2);
    ctx.restore();
    if (b.site.p > 0) {
      const bh = Math.max(2, Math.round(ts * 0.1)), bw = w - ts * 0.3;
      ctx.fillStyle = OUT; ctx.fillRect(px + ts * 0.15 - 1, py + hh - ts * 0.22 - 1, bw + 2, bh + 2);
      ctx.fillStyle = ACC; ctx.fillRect(px + ts * 0.15, py + hh - ts * 0.22, bw * (b.site.p / b.site.t), bh);
    }
  }
  /** The workers: tiny astronauts with a jetpack, a flame when flying and a welding beam when building. */
  /** Rockets seen from above: a white disc growing with the parts, then climbing up the screen. */
  function drawRocketsTop(time) {
    const list = world.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.kind !== 'launch_pad' || b.site || (!b.parts && b.phase === 'load')) continue;
      const full = b.phase !== 'load', alt = CO.orbit.altitude(b);
      const cx = ox + (b.x + b.w / 2) * ts, cy = oy + (b.y + b.h / 2) * ts - alt * ts * 0.6, r = ts * (0.35 + 0.35 * (full ? 1 : b.parts / b.def.parts));
      if (alt > 0) {
        ctx.fillStyle = 'rgba(200,200,210,0.3)';
        ctx.beginPath(); ctx.arc(ox + (b.x + b.w / 2) * ts, oy + (b.y + b.h / 2) * ts, ts * (0.8 + alt * 0.1), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffd37f' : '#ff7a3a';
        ctx.fillRect(cx - r * 0.4, cy + r, r * 0.8, ts * 0.6);
      }
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dcdde4'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e55454'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }
  /** Logistic drones: a small quadcopter, its cargo hanging below. */
  function drawDrones(time) {
    const ds = CO.drones.all();
    const u = Math.max(1, ts / 20);
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i], cx = ox + d.x * ts, cy = oy + d.y * ts - ts * 0.4 + Math.sin(time * 6 + i) * u;
      if (cx < -ts || cy < -ts || cx > cw + ts || cy > ch + ts) continue;
      if (d.idle) continue;                            // parked drones sit inside the hub
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - u * 3, oy + d.y * ts + u * 2, u * 6, u * 1.5);
      if (d.item) drawIcon(d.item, cx, cy + u * 4, ts * 0.32);
      ctx.fillStyle = OUT; ctx.fillRect(cx - u * 3, cy - u * 1.5, u * 6, u * 3);
      ctx.fillStyle = '#5f616c'; ctx.fillRect(cx - u * 2, cy - u, u * 4, u * 2);
      const spin = Math.floor(time * 30 + i) % 2;
      ctx.fillStyle = spin ? '#d8dae2' : '#9a9caa';
      [[-4, -2.5], [2.5, -2.5], [-4, 1.5], [2.5, 1.5]].forEach(function (p) { ctx.fillRect(cx + p[0] * u, cy + p[1] * u, u * 1.5, u); });
      ctx.fillStyle = '#84f491'; ctx.fillRect(cx - u * 0.5, cy - u * 0.5, u, u);
    }
  }
  /** Square range of a drone port being placed or inspected. */
  Rn.hubRange = function (ov) {
    const ins = CO.input.get().inspected;
    if (ins && !ins.dead && ins.kind === 'drone_hub') return ins;
    for (let i = 0; i < ov.ghosts.length; i++) {
      const g = ov.ghosts[i], d = CO.BUILDINGS[g.type];
      if (d.kind === 'drone_hub') return { x: g.x, y: g.y, w: d.w, h: d.h, def: d };
    }
    return null;
  };
  function drawWorkers(time) {
    drawDrones(time);
    const ws = CO.sim.workers;
    if (!ws.length) return;
    const u = Math.max(1, ts / 22);                   // one "pixel" of the little guy
    for (let i = 0; i < ws.length; i++) {
      const wk = ws[i], cx = ox + wk.x * ts, cy = oy + wk.y * ts;
      if (cx < -ts || cy < -ts || cx > cw + ts || cy > ch + ts) continue;
      const bob = Math.round(Math.sin(time * 5 + i * 1.7) * u * 1.2), by = cy - u * 6 + bob, f = wk.face;
      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx - u * 3, cy + u * 3, u * 6, u * 1.5);
      if (wk.building && wk.job && !wk.job.dead) {     // welding beam to a flickering point of the site
        const j = wk.job, k = time * 9 + i;
        const tx = ox + (j.x + j.w * (0.5 + 0.35 * Math.sin(k))) * ts, ty = oy + (j.y + j.h * (0.5 + 0.35 * Math.cos(k * 1.3))) * ts;
        ctx.strokeStyle = 'rgba(255,211,127,0.85)'; ctx.lineWidth = Math.max(1, u);
        ctx.beginPath(); ctx.moveTo(cx + f * u * 3, by + u * 2); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#fff6d8'; ctx.fillRect(tx - u, ty - u, u * 2, u * 2);
      }
      const R = function (x, y, w, h, col) {          // x mirrored with the facing direction
        const X = f > 0 ? x : -x - w;
        ctx.fillStyle = OUT; ctx.fillRect(cx + X * u - u * 0.6, by + y * u - u * 0.6, w * u + u * 1.2, h * u + u * 1.2);
        ctx.fillStyle = col; ctx.fillRect(cx + X * u, by + y * u, w * u, h * u);
      };
      if (wk.moving) {                                  // jetpack flame
        const fl = 2 + (Math.floor(time * 20 + i) % 2);
        ctx.fillStyle = '#ffb347'; ctx.fillRect(cx + (f > 0 ? -4 : 2) * u, by + 5 * u, u * 2, u * fl);
        ctx.fillStyle = '#fff6d8'; ctx.fillRect(cx + (f > 0 ? -3.5 : 2.5) * u, by + 5 * u, u, u * (fl - 1));
      }
      R(-4, -1, 2, 6, '#5f616c');                       // jetpack
      R(-2, 4, 1.6, 2, '#868895'); R(0.4, 4, 1.6, 2, '#868895');   // legs
      R(-2, -1, 4, 5, '#b4b6c0');                       // suit
      R(-2.5, -5, 5, 4, '#e8e8ee');                     // helmet
      R(0, -4, 2.5, 2, ACC);                            // visor
    }
  }

  // ------------------------------------------------------------- land
  function plotBox(p) {
    const r = CO.plotRect(p);
    return { x: ox + r.x0 * ts, y: oy + r.y0 * ts, w: (r.x1 - r.x0 + 1) * ts, h: (r.y1 - r.y0 + 1) * ts };
  }
  /** Land not bought yet is dimmed (its ore stays readable); a yellow line follows the edge of owned land. */
  function drawLand(x0, y0, x1, y1) {
    const land = CO.state.land, PW = CO.PLOTS_W, PH = CO.PLOTS_H;
    const p0 = CO.plotOf(x0, y0), p1 = CO.plotOf(x1, y1);
    const px0 = p0 % PW, py0 = Math.floor(p0 / PW), px1 = p1 % PW, py1 = Math.floor(p1 / PW);
    const edge = new Path2D(), frames = new Path2D();
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const p = py * PW + px, b = plotBox(p);
      if (!land[p]) {
        ctx.fillStyle = CO.plotBuyable(p) ? 'rgba(8,8,11,0.5)' : 'rgba(8,8,11,0.72)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        frames.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        continue;
      }
      if (px > 0 && !land[p - 1]) { edge.moveTo(b.x, b.y); edge.lineTo(b.x, b.y + b.h); }
      if (px < PW - 1 && !land[p + 1]) { edge.moveTo(b.x + b.w, b.y); edge.lineTo(b.x + b.w, b.y + b.h); }
      if (py > 0 && !land[p - PW]) { edge.moveTo(b.x, b.y); edge.lineTo(b.x + b.w, b.y); }
      if (py < PH - 1 && !land[p + PW]) { edge.moveTo(b.x, b.y + b.h); edge.lineTo(b.x + b.w, b.y + b.h); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke(frames);
    ctx.strokeStyle = 'rgba(255,211,127,0.6)'; ctx.lineWidth = Math.max(2, Math.round(ts / 10)); ctx.stroke(edge);
  }
  /** The plot under the cursor when it is not owned: dashed frame, and its price when it can be bought. */
  function drawPlotHover(p) {
    const b = plotBox(p), ok = CO.plotBuyable(p), lw = Math.max(2, Math.round(ts / 10));
    ctx.fillStyle = ok ? 'rgba(255,211,127,0.07)' : 'rgba(229,84,84,0.06)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([Math.max(4, ts * 0.5), Math.max(3, ts * 0.3)]);
    ctx.strokeStyle = ok ? ACC : 'rgba(229,84,84,0.75)'; ctx.lineWidth = lw;
    ctx.strokeRect(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw);
    ctx.setLineDash([]);
    const label = ok ? CO.fmt(CO.landPrice()) + ' ¢' : 'Hors d’atteinte';
    ctx.font = 'bold ' + Math.round(CO.clamp(ts * 0.9, 12, 30)) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = b.x + b.w / 2, ty = b.y + b.h / 2;
    ctx.fillStyle = OUT; ctx.fillText(label, tx + 2, ty + 2);
    ctx.fillStyle = !ok ? '#e55454' : CO.state.money >= CO.landPrice() ? ACC : '#e55454';
    ctx.fillText(label, tx, ty);
  }

  // ------------------------------------------------------ Kéora's energy beams
  /** One beam: a soft glow, a bright core and light pulses running from the source. */
  function beamLine(ax, ay, bx, by, col, time, ghost) {
    if (Math.max(ax, bx) < -ts || Math.min(ax, bx) > cw + ts || Math.max(ay, by) < -ts || Math.min(ay, by) > ch + ts) return;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    if (ghost) {
      ctx.setLineDash([ts * 0.3, ts * 0.2]); ctx.strokeStyle = 'rgba(' + col + ',0.8)'; ctx.lineWidth = Math.max(1, ts * 0.08); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    ctx.strokeStyle = 'rgba(' + col + ',0.16)'; ctx.lineWidth = ts * 0.42; ctx.stroke();
    ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = Math.max(1, ts * 0.07); ctx.stroke();
    ctx.setLineDash([ts * 0.2, ts * 0.6]); ctx.lineDashOffset = -time * ts * 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, ts * 0.06); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawBeamsTop(time) {
    const B = CO.power.beams;
    if (!B.length) return;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < B.length; i++) {
      const s = B[i];
      beamLine(ox + s.a[0] * ts, oy + s.a[1] * ts, ox + s.b[0] * ts, oy + s.b[1] * ts, Rn.beamColor(s.net), time, false);
    }
    ctx.restore();
  }

  // ------------------------------------------------------ mass drivers
  function centre(b) { return [ox + (b.x + b.w / 2) * ts, oy + (b.y + b.h / 2) * ts]; }
  /** Dashed link from every launcher to its target; brighter when one end is selected or hovered. */
  function drawDriverLinks(ov) {
    const list = world.list;
    ctx.save(); ctx.lineWidth = Math.max(1, ts / 14); ctx.setLineDash([ts * 0.3, ts * 0.25]);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if ((b.kind !== 'driver' && b.kind !== 'krelay') || !b.target) continue;
      const tg = b.kind === 'krelay' ? CO.tubes.relayTarget(b) : CO.sim.driverTarget(b);
      if (!tg) continue;
      const hot = ov && (ov.hover === b || ov.hover === tg || ov.selected.indexOf(b) >= 0 || ov.selected.indexOf(tg) >= 0);
      const a = centre(b), c = centre(tg);
      ctx.strokeStyle = b.kind === 'krelay' ? (hot ? 'rgba(94,240,255,0.85)' : 'rgba(94,240,255,0.35)') : hot ? 'rgba(255,211,127,0.75)' : 'rgba(255,211,127,0.22)';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    ctx.restore();
  }
  /** Volleys in flight: a glowing slug with a short trail, carrying the icon of its first item. */
  function drawShots(time) {
    const shots = CO.sim.shots;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], a = centre(s.from), c = centre(s.to), k = Math.min(1, s.t / s.dur);
      const arc = Math.sin(k * Math.PI) * ts * 0.6;                 // slight ballistic lift
      for (let j = 3; j >= 0; j--) {
        const kk = Math.max(0, k - j * 0.035), x = a[0] + (c[0] - a[0]) * kk, y = a[1] + (c[1] - a[1]) * kk - Math.sin(kk * Math.PI) * ts * 0.6;
        const r = Math.max(2, ts * (0.22 - j * 0.04));
        ctx.globalAlpha = j ? 0.35 - j * 0.08 : 1;
        ctx.fillStyle = j ? '#ff9d5c' : OUT; ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
      }
      ctx.globalAlpha = 1;
      const x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k - arc, r = Math.max(2, ts * 0.18);
      ctx.fillStyle = (Math.floor(time * 12) % 2) ? ACC : '#fff0c8'; ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
      drawIcon(s.items[0], x, y, ts * 0.3);
    }
  }
  function rangeCircle(b, valid) {
    const c = centre(b);
    ctx.save();
    ctx.beginPath(); ctx.arc(c[0], c[1], b.def.range * ts, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,211,127,0.05)'; ctx.fill();
    ctx.setLineDash([ts * 0.4, ts * 0.3]); ctx.lineWidth = Math.max(2, ts / 10);
    ctx.strokeStyle = valid === false ? 'rgba(229,84,84,0.7)' : 'rgba(255,211,127,0.6)'; ctx.stroke();
    ctx.restore();
  }

  function outline(b, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.strokeRect(ox + b.x * ts + width / 2, oy + b.y * ts + width / 2, b.w * ts - width, b.h * ts - width);
  }

  function drawOverlay(ov, time) {
    const lw = Math.max(2, Math.round(ts / 12));
    drawZonesTop(ov);
    const hr = Rn.hubRange(ov);
    if (hr) {
      const r = hr.def.range, x0 = hr.x + hr.w / 2 - r, y0 = hr.y + hr.h / 2 - r;
      ctx.save(); ctx.setLineDash([ts * 0.3, ts * 0.2]); ctx.fillStyle = 'rgba(132,244,145,0.05)'; ctx.strokeStyle = 'rgba(132,244,145,0.7)'; ctx.lineWidth = lw;
      ctx.fillRect(ox + x0 * ts, oy + y0 * ts, r * 2 * ts, r * 2 * ts); ctx.strokeRect(ox + x0 * ts, oy + y0 * ts, r * 2 * ts, r * 2 * ts);
      ctx.restore();
    }
    if (ov.plot >= 0) drawPlotHover(ov.plot);
    if (ov.hover) outline(ov.hover, 'rgba(255,255,255,0.7)', lw);
    for (let i = 0; i < ov.selected.length; i++) outline(ov.selected[i], ACC, lw);
    for (let i = 0; i < ov.deleting.length; i++) {
      const b = ov.deleting[i];
      ctx.fillStyle = 'rgba(229,84,84,0.42)'; ctx.fillRect(ox + b.x * ts, oy + b.y * ts, b.w * ts, b.h * ts);
      outline(b, '#e55454', lw);
    }
    if (ov.cursorCell) {                                 // plain cell cursor (inspect / delete tools)
      ctx.strokeStyle = ov.cursorColor; ctx.lineWidth = lw;
      ctx.strokeRect(ox + ov.cursorCell.x * ts + lw / 2, oy + ov.cursorCell.y * ts + lw / 2, ts - lw, ts - lw);
    }
    if (ov.link) {                                       // choosing a mass driver target
      const L = ov.link, a = centre(L.src);
      rangeCircle(L.src, true);
      const end = L.target ? centre(L.target) : [ox + L.cur.x * ts, oy + L.cur.y * ts];
      ctx.save(); ctx.setLineDash([ts * 0.3, ts * 0.2]); ctx.lineDashOffset = -time * ts;
      ctx.strokeStyle = L.valid ? ACC : '#e55454'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(end[0], end[1]); ctx.stroke(); ctx.restore();
      if (L.target) outline(L.target, L.valid ? ACC : '#e55454', lw * 1.5);
      outline(L.src, ACC, lw);
    }
    // placement ghosts
    for (let i = 0; i < ov.ghosts.length; i++) {
      const g = ov.ghosts[i], def = CO.BUILDINGS[g.type], px = ox + g.x * ts, py = oy + g.y * ts;
      if ((def.kind === 'driver' || def.kind === 'krelay') && ov.ghosts.length === 1) rangeCircle({ x: g.x, y: g.y, w: def.w, h: def.h, def: def }, g.valid);
      if (Rn.emitsBeam(def) && ov.ghosts.length <= 4) {
        ctx.save(); Rn.ghostBeams(g).forEach(function (s) { beamLine(ox + s.a[0] * ts, oy + s.a[1] * ts, ox + s.b[0] * ts, oy + s.b[1] * ts, '94,240,255', 0, true); }); ctx.restore();
      }
      const spr = sprites.building(g.type, g.dir, 0);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, px, py, def.w * ts, def.h * ts);
      ctx.globalAlpha = 1;
      if (def.w * def.h > 1 && def.kind !== 'lab' && def.kind !== 'seller' && def.kind !== 'port') drawArrowOut({ x: g.x, y: g.y, w: def.w, h: def.h, dir: g.dir });
      ctx.fillStyle = !g.valid ? 'rgba(229,84,84,0.45)' : g.ghost ? 'rgba(110,160,255,0.3)' : 'rgba(255,211,127,0.12)';
      ctx.fillRect(px, py, def.w * ts, def.h * ts);
      ctx.strokeStyle = !g.valid ? 'rgba(229,84,84,0.95)' : g.ghost ? 'rgba(150,190,255,0.95)' : 'rgba(255,211,127,0.95)'; ctx.lineWidth = lw;
      ctx.strokeRect(px + lw / 2, py + lw / 2, def.w * ts - lw, def.h * ts - lw);
    }
    // underground pieces being placed: the link they will make, or their reach when they find nothing
    for (let i = 0; i < ov.tunnels.length; i++) {
      const t = ov.tunnels[i];
      ctx.save();
      if (t.b) {
        ctx.setLineDash([ts * 0.2, ts * 0.15]); ctx.lineDashOffset = -time * ts;
        ctx.strokeStyle = ACC; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(ox + (t.a.x + 0.5) * ts, oy + (t.a.y + 0.5) * ts); ctx.lineTo(ox + (t.b.x + 0.5) * ts, oy + (t.b.y + 0.5) * ts); ctx.stroke();
        ctx.setLineDash([]); ctx.strokeRect(ox + t.b.x * ts + lw / 2, oy + t.b.y * ts + lw / 2, ts - lw, ts - lw);
      } else {
        ctx.setLineDash([ts * 0.12, ts * 0.12]); ctx.strokeStyle = 'rgba(229,84,84,0.6)'; ctx.lineWidth = Math.max(1, lw / 2);
        for (let k = 0; k < t.cells.length; k++) ctx.strokeRect(ox + t.cells[k].x * ts + ts * 0.15, oy + t.cells[k].y * ts + ts * 0.15, ts * 0.7, ts * 0.7);
      }
      ctx.restore();
    }
    if (ov.selRect) {
      const r = ov.selRect, x = ox + r.x0 * ts, y = oy + r.y0 * ts, w = (r.x1 - r.x0 + 1) * ts, h = (r.y1 - r.y0 + 1) * ts;
      const col = ov.selDelete ? '#e55454' : ACC;
      ctx.fillStyle = ov.selDelete ? 'rgba(229,84,84,0.14)' : 'rgba(255,211,127,0.12)'; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.setLineDash([ts * 0.25, ts * 0.2]); ctx.lineDashOffset = -time * ts * 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); ctx.restore();
    }
  }
})(window.CO = window.CO || {});
