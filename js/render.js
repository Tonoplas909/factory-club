/*
 * render.js — draws the world on the main canvas. Everything is drawn in device pixels
 * with an integer tile size so pixel art stays crisp at every zoom level.
 * Only what is visible on screen is drawn (culling), so a few hundred buildings stay smooth.
 */
(function (CO) {
  'use strict';
  const T = CO.TILE, DX = CO.DX, DY = CO.DY, world = CO.world, sprites = CO.sprites, ITEMS = CO.ITEMS;
  const Rn = CO.render = {};
  let canvas, ctx, cw = 0, ch = 0, dpr = 1, ts = 32, ox = 0, oy = 0;
  let terrain = null, terrainKey = '', starPat = null;

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
  function geom() {
    const cam = CO.cam;
    ts = Math.max(4, Math.round(cam.zoom * dpr));
    ox = Math.round(cw / 2 - cam.x * ts);
    oy = Math.round(ch / 2 - cam.y * ts);
  }
  /** CSS pixel position (relative to the canvas) → fractional tile coordinates. */
  Rn.screenToWorld = function (sx, sy) {
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
    ctx.fillStyle = '#ffd24a'; ctx.fill();
    ctx.lineWidth = Math.max(1, ts / 16); ctx.strokeStyle = '#3a2c00'; ctx.stroke();
  }

  function ensureTerrain() {
    if (terrain && terrainKey === String(world.seed)) return;
    terrain = sprites.terrain(); terrainKey = String(world.seed);
  }

  function drawStars() {
    if (!starPat) {
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const g = c.getContext('2d'), rnd = CO.rng(7);
      g.fillStyle = '#080b16'; g.fillRect(0, 0, 200, 200);
      for (let i = 0; i < 60; i++) {
        const b = rnd(); g.fillStyle = b > 0.8 ? '#cfd8f0' : b > 0.4 ? '#5a6890' : '#2f3a58';
        g.fillRect(Math.floor(rnd() * 200), Math.floor(rnd() * 200), 2, 2);
      }
      starPat = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = starPat; ctx.fillRect(0, 0, cw, ch);
  }

  // --------------------------------------------------------------- frame
  Rn.draw = function (time, dt) {
    geom();
    ensureTerrain();
    ctx.imageSmoothingEnabled = false;
    drawStars();
    const W = world.W, H = world.H;
    const x0 = Math.max(0, Math.floor(-ox / ts)), y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(W - 1, Math.floor((cw - ox) / ts)), y1 = Math.min(H - 1, Math.floor((ch - oy) / ts));
    if (x1 < x0 || y1 < y0) return;
    ctx.drawImage(terrain, x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T,
      ox + x0 * ts, oy + y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts);

    if (ts >= 20) {                                   // strict grid, faint
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(ox + x * ts + 0.5, oy + y0 * ts); ctx.lineTo(ox + x * ts + 0.5, oy + (y1 + 1) * ts); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(ox + x0 * ts, oy + y * ts + 0.5); ctx.lineTo(ox + (x1 + 1) * ts, oy + y * ts + 0.5); }
      ctx.strokeStyle = 'rgba(160,190,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(93,224,230,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W * ts, H * ts);

    const ov = CO.input ? CO.input.getOverlay() : null;
    const list = world.list, vis = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.x + b.w <= x0 || b.x > x1 || b.y + b.h <= y0 || b.y > y1) continue;
      vis.push(b);
    }

    // 1. bodies
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i], px = ox + b.x * ts, py = oy + b.y * ts;
      let spr;
      if (b.kind === 'belt') {
        const tier = b.type === 'belt_fast' ? 1 : 0;
        spr = sprites.belt(tier, b.dir, beltShape(b), Math.floor(time * b.def.speed * 16) % 16);
      } else {
        const nf = sprites.frames[b.type] || 1;
        const f = (b.status === 'work' || b.kind === 'port') ? Math.floor(time * (b.kind === 'port' ? 1.5 : 7)) % nf : 0;
        spr = sprites.building(b.type, b.dir, f);
      }
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, px, py, b.w * ts, b.h * ts);
    }

    // tunnel links
    ctx.save(); ctx.setLineDash([ts * 0.12, ts * 0.12]); ctx.strokeStyle = 'rgba(255,210,74,0.55)'; ctx.lineWidth = Math.max(1, ts / 14);
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i];
      if (b.kind !== 'tunnel_in') continue;
      const ex = CO.sim.findExit(b);
      if (!ex) continue;
      ctx.beginPath(); ctx.moveTo(ox + (b.x + 0.5) * ts, oy + (b.y + 0.5) * ts); ctx.lineTo(ox + (ex.x + 0.5) * ts, oy + (ex.y + 0.5) * ts); ctx.stroke();
    }
    ctx.restore();

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
      } else if (b.kind === 'router' && b.slot !== null) {
        drawIcon(b.slot, ox + (b.x + 0.5) * ts, oy + (b.y + 0.5) * ts, isz);
      }
    }

    // 3. overlays: output arrows, recipe icons, status LEDs
    for (let i = 0; i < vis.length; i++) {
      const b = vis[i], px = ox + b.x * ts, py = oy + b.y * ts, cx = px + b.w * ts / 2, cy = py + b.h * ts / 2;
      const k = b.kind;
      if (k === 'machine' || k === 'drill') {
        drawArrowOut(b);
        const id = k === 'drill' ? b.ore : b.recipe;
        if (id) drawIcon(id, cx, cy, Math.min(b.w, b.h) * ts * 0.34);
        else if (k === 'machine') {
          ctx.fillStyle = '#ffd24a'; ctx.font = 'bold ' + Math.round(ts * 0.8) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, cy);
        }
        const led = b.status === 'work' ? '#5df08a' : b.status === 'blocked' ? '#ff5a5a' : '#ffb347';
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = '#10131d'; ctx.fillRect(px + ts * 0.12 - 1, py + ts * 0.12 - 1, s + 2, s + 2);
        ctx.fillStyle = led; ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
      } else if (k === 'lab') {
        const s = Math.max(3, Math.round(ts * 0.16));
        ctx.fillStyle = CO.state.research ? '#5df08a' : '#ffb347';
        ctx.fillRect(px + ts * 0.12, py + ts * 0.12, s, s);
        if (CO.state.research) {                                  // show what the lab is waiting for
          const need = CO.TECHS[CO.state.research].cost; let n = 0;
          for (const id in need) if ((CO.state.researchProg[id] || 0) < need[id]) drawIcon(id, px + ts * (0.5 + n++ * 0.45), py + b.h * ts - ts * 0.4, ts * 0.38);
        }
      } else if (k === 'router' && b.filter) {
        drawIcon(b.filter, cx, cy, ts * 0.36);
      } else if (k === 'chest') {
        const f = b.q.length / b.def.capacity;
        ctx.fillStyle = '#10131d'; ctx.fillRect(px + ts * 0.15, py + ts * 0.84, ts * 0.7, Math.max(2, ts * 0.09));
        ctx.fillStyle = f > 0.9 ? '#ff5a5a' : '#5de0e6'; ctx.fillRect(px + ts * 0.15, py + ts * 0.84, ts * 0.7 * f, Math.max(2, ts * 0.09));
      } else if (k === 'port') {
        const pulse = 0.5 + 0.5 * Math.sin(time * 2);
        ctx.strokeStyle = 'rgba(93,224,230,' + (0.25 + 0.4 * pulse) + ')'; ctx.lineWidth = Math.max(2, ts * 0.1);
        ctx.strokeRect(px + ts * 0.1, py + ts * 0.1, b.w * ts - ts * 0.2, b.h * ts - ts * 0.2);
      }
    }

    // 4. floating texts
    const fx = CO.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.age += dt;
      if (f.age > 1.6) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, 1.6 - f.age);
      ctx.font = 'bold ' + Math.round(ts * 0.42) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = ox + f.x * ts, ty = oy + (f.y - f.age * 0.7) * ts;
      ctx.fillStyle = '#10131d'; ctx.fillText(f.text, tx + 1, ty + 1);
      ctx.fillStyle = '#ffd24a'; ctx.fillText(f.text, tx, ty);
      ctx.globalAlpha = 1;
    }

    if (ov) drawOverlay(ov, time);
  };

  function outline(b, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.strokeRect(ox + b.x * ts + width / 2, oy + b.y * ts + width / 2, b.w * ts - width, b.h * ts - width);
  }

  function drawOverlay(ov, time) {
    const lw = Math.max(2, Math.round(ts / 12));
    if (ov.hover) outline(ov.hover, 'rgba(255,255,255,0.7)', lw);
    for (let i = 0; i < ov.selected.length; i++) outline(ov.selected[i], '#5de0e6', lw);
    for (let i = 0; i < ov.deleting.length; i++) {
      const b = ov.deleting[i];
      ctx.fillStyle = 'rgba(255,70,70,0.45)'; ctx.fillRect(ox + b.x * ts, oy + b.y * ts, b.w * ts, b.h * ts);
      outline(b, '#ff5a5a', lw);
    }
    if (ov.cursorCell) {                                 // plain cell cursor (inspect / delete tools)
      ctx.strokeStyle = ov.cursorColor; ctx.lineWidth = lw;
      ctx.strokeRect(ox + ov.cursorCell.x * ts + lw / 2, oy + ov.cursorCell.y * ts + lw / 2, ts - lw, ts - lw);
    }
    // placement ghosts
    for (let i = 0; i < ov.ghosts.length; i++) {
      const g = ov.ghosts[i], def = CO.BUILDINGS[g.type], px = ox + g.x * ts, py = oy + g.y * ts;
      const spr = sprites.building(g.type, g.dir, 0);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, px, py, def.w * ts, def.h * ts);
      ctx.globalAlpha = 1;
      if (def.w * def.h > 1 && def.kind !== 'lab' && def.kind !== 'seller' && def.kind !== 'port') drawArrowOut({ x: g.x, y: g.y, w: def.w, h: def.h, dir: g.dir });
      ctx.fillStyle = g.valid ? 'rgba(93,240,138,0.18)' : 'rgba(255,70,70,0.45)';
      ctx.fillRect(px, py, def.w * ts, def.h * ts);
      ctx.strokeStyle = g.valid ? 'rgba(93,240,138,0.9)' : 'rgba(255,90,90,0.95)'; ctx.lineWidth = lw;
      ctx.strokeRect(px + lw / 2, py + lw / 2, def.w * ts - lw, def.h * ts - lw);
    }
    if (ov.selRect) {
      const r = ov.selRect, x = ox + r.x0 * ts, y = oy + r.y0 * ts, w = (r.x1 - r.x0 + 1) * ts, h = (r.y1 - r.y0 + 1) * ts;
      ctx.fillStyle = 'rgba(93,224,230,0.14)'; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.setLineDash([ts * 0.25, ts * 0.2]); ctx.lineDashOffset = -time * ts * 0.5;
      ctx.strokeStyle = '#5de0e6'; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); ctx.restore();
    }
  }
})(window.CO = window.CO || {});
