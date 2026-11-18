/*
 * sprites.js — procedural pixel art. No image files: every sprite is drawn once
 * into a small offscreen canvas (16 px per tile) and then scaled up crisply by the renderer.
 *
 *   CO.sprites.item(id)                  8×8 icon of an item
 *   CO.sprites.belt(tier, dir, shape, f) animated belt tile (shape 0 straight, 1/2 corners)
 *   CO.sprites.building(type, dir, f)    body of a building (frame f for animations)
 *   CO.sprites.terrain()                 the whole ground + ore layer as one big canvas
 */
(function (CO) {
  'use strict';
  const T = CO.TILE, shade = CO.shade, ITEMS = CO.ITEMS, BUILDINGS = CO.BUILDINGS;
  const cache = {};

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function R(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function disc(g, c, cx, cy, r) {
    g.fillStyle = c;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) g.fillRect(cx + x, cy + y, 1, 1);
  }
  function line(g, c, x0, y0, x1, y1, t) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    g.fillStyle = c;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t || 1, t || 1);
  }

  // ------------------------------------------------------------ item icons
  // o outline, b base, h highlight, s shadow, a accent
  const PATTERNS = {
    rock:    ['........', '..ooo...', '.obhbo..', 'obhbbbo.', 'obbbbsso', '.obbbso.', '..oooo..', '........'],
    bar:     ['........', '.oooooo.', 'ohhhhhbo', 'obbbbbso', 'osssssso', '.oooooo.', '........', '........'],
    brick:   ['........', 'oooooooo', 'ohhbobhb', 'obbbobbo', 'oooooooo', 'obbobhho', 'ossbosso', 'oooooooo'],
    glass:   ['.oooooo.', 'oaaahbbo', 'oaahbbbo', 'oahbbbbo', 'ohbbbbbo', 'obbbbbso', 'obbbbsso', '.oooooo.'],
    plate:   ['........', '........', '.oooooo.', 'ohhhhhbo', 'obbbbbso', '.oooooo.', '........', '........'],
    gear:    ['...oo...', '.o.bb.o.', '.obhhbo.', 'obh..hbo', 'obs..sbo', '.obssbo.', '.o.bb.o.', '...oo...'],
    coil:    ['..oooo..', '.oaaaao.', 'oabbbbao', 'oab..bao', 'oab..bao', 'oabbbbao', '.oaaaao.', '..oooo..'],
    board:   ['oooooooo', 'obbbbbbo', 'obhabhbo', 'obbabbbo', 'obabhabo', 'obbbabbo', 'obbbbbbo', 'oooooooo'],
    crystal: ['...oo...', '..ohho..', '.ohhbbo.', 'ohhbbbso', 'obbbbsso', '.obbsso.', '..obso..', '...oo...'],
    panel:   ['oooooooo', 'obhbhbbo', 'oaaaaaao', 'obhbhbbo', 'oaaaaaao', 'obhbhbbo', 'oooooooo', '...oo...'],
    cube:    ['..oooo..', '.ohhhho.', 'ohhhhhbo', 'oooooooo', 'obbbbsso', 'obbabsso', 'obbbbsso', '.oooooo.'],
    hull:    ['.oooooo.', 'ohhhhhho', 'obbbbbbo', 'obbabbbo', 'obbbbbso', '.osssso.', '..oooo..', '........'],
    nozzle:  ['..oooo..', '.obhhbo.', '.obbbso.', '..obso..', '.oobsoo.', 'oaaaaaao', '.oaaaao.', '..oooo..']
  };

  function itemIcon(id) {
    const key = 'i' + id;
    if (cache[key]) return cache[key];
    const it = ITEMS[id], pat = PATTERNS[it.shape], c = mk(8, 8), g = c.getContext('2d');
    const pal = { o: shade(it.color, -0.65), b: it.color, h: shade(it.color, 0.4), s: shade(it.color, -0.3), a: it.accent };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const ch = pat[y][x];
      if (ch !== '.') R(g, pal[ch], x, y, 1, 1);
    }
    return (cache[key] = c);
  }

  // ----------------------------------------------------------------- belts
  function chevH(g, c, u) {
    for (let j = 0; j < 4; j++) { R(g, c, u + j, 4 + j, 2, 1); R(g, c, u + j, 11 - j, 2, 1); }
  }
  function chevV(g, c, u) {
    for (let j = 0; j < 4; j++) { R(g, c, 4 + j, u + j, 1, 2); R(g, c, 11 - j, u + j, 1, 2); }
  }
  /** Canonical belt moving East. shape 1 = corner entering from the North side. */
  function drawBeltCanon(g, tier, shape, f) {
    const railD = tier ? '#4a3422' : '#3c4259', rail = tier ? '#8a6238' : '#5f6888';
    const band = tier ? '#3a2e29' : '#2f3447', chev = tier ? '#f0a24a' : '#8794bd';
    if (shape === 0) {
      R(g, railD, 0, 2, 16, 12); R(g, rail, 0, 3, 16, 10); R(g, band, 0, 4, 16, 8);
      for (let k = 0; k < 2; k++) { const u = (f + 8 * k) % 16; chevH(g, chev, u); chevH(g, chev, u - 16); }
    } else {
      R(g, railD, 2, 0, 12, 14); R(g, railD, 2, 2, 14, 12);
      R(g, rail, 3, 0, 10, 13); R(g, rail, 3, 3, 13, 10);
      R(g, band, 4, 0, 8, 12); R(g, band, 4, 4, 12, 8);
      for (let k = 0; k < 2; k++) {
        const s = (f + 8 * k) % 16;
        if (s <= 7) chevV(g, chev, s); else chevH(g, chev, s);
      }
    }
  }
  /** Rotate/flip a canonical 16×16 drawing into direction `dir`. */
  function orient(draw, dir, flip) {
    const c = mk(T, T), g = c.getContext('2d');
    g.translate(8, 8); g.rotate(dir * Math.PI / 2); g.translate(-8, -8);
    if (flip) { g.translate(0, 16); g.scale(1, -1); }
    draw(g);
    return c;
  }
  function beltSprite(tier, dir, shape, f) {
    const key = 'b' + tier + dir + shape + f;
    if (cache[key]) return cache[key];
    return (cache[key] = orient(function (g) { drawBeltCanon(g, tier, shape === 0 ? 0 : 1, f); }, dir, shape === 2));
  }

  // ------------------------------------------------------- building bodies
  function chassis(g, W, H, base) {
    R(g, '#161a28', 0, 0, W, H);
    R(g, base, 1, 1, W - 2, H - 2);
    R(g, shade(base, 0.3), 1, 1, W - 2, 1); R(g, shade(base, 0.3), 1, 1, 1, H - 2);
    R(g, shade(base, -0.3), 1, H - 2, W - 2, 1); R(g, shade(base, -0.3), W - 2, 1, 1, H - 2);
    const b = shade(base, 0.55);
    R(g, b, 3, 3, 1, 1); R(g, b, W - 4, 3, 1, 1); R(g, b, 3, H - 4, 1, 1); R(g, b, W - 4, H - 4, 1, 1);
    g.clearRect(0, 0, 1, 1); g.clearRect(W - 1, 0, 1, 1); g.clearRect(0, H - 1, 1, 1); g.clearRect(W - 1, H - 1, 1, 1);
  }

  function drawDrill(g, f, big) {
    const S = big ? 48 : 32, c = S / 2, r = big ? 15 : 9;
    chassis(g, S, S, '#c99a2e');
    for (let i = 0; i < S; i += 6) { R(g, '#3b2f10', i + 2, 2, 3, 2); R(g, '#3b2f10', i + 2, S - 4, 3, 2); }
    disc(g, '#12141d', c, c, r + 1);
    disc(g, '#242836', c, c, r - 1);
    for (let k = 0; k < 4; k++) {
      const a = f * Math.PI / 8 + k * Math.PI / 2;
      for (let d = 2; d < r - 1; d++) R(g, d % 3 === 0 ? '#ffffff' : '#cfd6ea', Math.round(c + Math.cos(a) * d) - 1, Math.round(c + Math.sin(a) * d) - 1, 2, 2);
    }
    disc(g, '#ffd24a', c, c, 2);
  }
  function drawSmelter(g, f) {
    chassis(g, 32, 32, '#8a4a3c');
    for (let y = 5; y < 30; y += 4) R(g, '#6e3a2f', 2, y, 28, 1);
    R(g, '#3b3f52', 22, 1, 7, 9); R(g, '#555a70', 22, 1, 7, 1); R(g, '#2a2d3c', 24, 3, 3, 5);
    R(g, '#1b1018', 6, 12, 20, 14);
    R(g, ['#ff8a2a', '#ffc04a', '#ff6a1a'][f % 3], 8, 14, 16, 10);
    R(g, '#ffe9a0', 11, 17, 10, 4);
    R(g, '#3a2a28', 5, 26, 22, 2);
  }
  function drawAssembler(g, f) {
    chassis(g, 32, 32, '#3f6aa8');
    R(g, '#0f1a2e', 4, 4, 24, 8); R(g, '#7fe3ff', 6, 6, 6 + (f % 4) * 4, 2); R(g, '#3a8fb0', 6, 9, 14, 1);
    const tg = [[24, 17], [16, 14], [8, 17], [16, 20]][f % 4];
    line(g, '#cfd6ea', 16, 27, tg[0], tg[1], 2);
    R(g, '#1b2438', 12, 25, 8, 5);
    R(g, '#ffd24a', tg[0] - 1, tg[1] - 1, 3, 3);
  }
  function drawSteelmill(g, f) {
    chassis(g, 48, 48, '#4a4f66');
    R(g, '#2c3042', 4, 2, 8, 14); R(g, '#2c3042', 36, 2, 8, 14); R(g, '#6a7090', 4, 2, 8, 1); R(g, '#6a7090', 36, 2, 8, 1);
    R(g, '#14161f', 9, 18, 30, 24);
    R(g, ['#ff7a2a', '#ffb040', '#ff5a1a'][f % 3], 11, 20, 26, 20);
    R(g, '#ffe9a0', 16, 26, 16, 8); R(g, '#ffffff', 20, 28, 8, 4);
    R(g, '#2c3042', 8, 43, 32, 2);
  }
  function drawFabricator(g, f) {
    chassis(g, 48, 48, '#2f7f78');
    R(g, '#10201f', 4, 22, 40, 10);
    for (let k = 0; k < 4; k++) R(g, '#5de0c0', 6 + ((k * 10 + f * 3) % 38), 25, 5, 4);
    const a = [[16, 20], [20, 16], [14, 18], [18, 22]][f % 4], b = [[34, 18], [30, 22], [36, 20], [32, 16]][f % 4];
    line(g, '#d8f5ee', 14, 5, a[0], a[1], 2); line(g, '#d8f5ee', 34, 5, b[0], b[1], 2);
    R(g, '#ffd24a', a[0] - 1, a[1] - 1, 3, 3); R(g, '#ffd24a', b[0] - 1, b[1] - 1, 3, 3);
    R(g, '#10201f', 10, 3, 8, 4); R(g, '#10201f', 30, 3, 8, 4);
    for (let i = 0; i < 5; i++) R(g, (i + f) % 2 ? '#ffd24a' : '#3a5a58', 8 + i * 8, 40, 4, 3);
  }
  function drawLab(g, f) {
    chassis(g, 32, 32, '#6a4aa8');
    R(g, '#d9f6ff', 13, 5, 6, 9); R(g, '#9fd0e0', 13, 5, 1, 9);
    disc(g, '#d9f6ff', 16, 20, 8); disc(g, '#7be0a0', 16, 22, 6);
    R(g, '#7be0a0', 11, 19, 10, 2);
    R(g, '#d9f6ff', 12, 14, 8, 3);
    const by = 17 - (f % 4) * 2;
    R(g, '#ffffff', 14 + (f % 2) * 3, by, 2, 2);
    R(g, '#2a1e4a', 4, 27, 24, 2);
  }
  function drawSeller(g) {
    chassis(g, 32, 32, '#c9a43a');
    for (let i = 0; i < 8; i++) R(g, i % 2 ? '#f4f0e0' : '#d9503a', 2 + i * 3.5 | 0, 2, 4, 7);
    disc(g, '#8a6508', 16, 20, 8); disc(g, '#ffe27a', 16, 20, 7);
    R(g, '#8a6508', 15, 14, 2, 12); R(g, '#8a6508', 12, 17, 8, 2); R(g, '#8a6508', 12, 22, 8, 2);
  }
  function drawPort(g, f) {
    chassis(g, 64, 64, '#2a3a5a');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) R(g, '#2f4264', 4 + x * 7, 4 + y * 7, 7, 7);
    disc(g, '#5de0e6', 32, 32, 25); disc(g, '#1a2640', 32, 32, 23);
    disc(g, '#2b4a7a', 32, 32, 18); disc(g, '#1a2640', 32, 32, 16);
    R(g, '#5de0e6', 24, 22, 3, 20); R(g, '#5de0e6', 37, 22, 3, 20); R(g, '#5de0e6', 24, 30, 16, 3);
    const lc = f % 2 ? '#ffd24a' : '#8a6a20';
    R(g, lc, 6, 6, 4, 4); R(g, lc, 54, 6, 4, 4); R(g, lc, 6, 54, 4, 4); R(g, lc, 54, 54, 4, 4);
  }

  // 1×1 sprites (drawn facing East, rotated by `dir`)
  function tri(g, c, x, y) { R(g, c, x, y - 2, 1, 5); R(g, c, x + 1, y - 1, 1, 3); R(g, c, x + 2, y, 1, 1); }
  function arrow(g, c, cx, cy, ang) { g.save(); g.translate(cx, cy); g.rotate(ang); tri(g, c, -1, 0); g.restore(); }
  function basePlate(g, col) {
    R(g, '#161a28', 1, 1, 14, 14); R(g, col, 2, 2, 12, 12);
    R(g, shade(col, 0.3), 2, 2, 12, 1); R(g, shade(col, -0.3), 2, 13, 12, 1);
  }
  function drawSplitter(g) {
    basePlate(g, '#454d66'); R(g, '#5de0e6', 5, 5, 6, 6); R(g, '#a8f4f8', 6, 6, 2, 2);
    arrow(g, '#ffd24a', 12, 8, 0); arrow(g, '#ffd24a', 8, 3, -Math.PI / 2); arrow(g, '#ffd24a', 8, 12, Math.PI / 2);
    R(g, '#0c0e17', 2, 6, 2, 4);
  }
  function drawMerger(g) {
    basePlate(g, '#4d4556'); R(g, '#ffb347', 5, 5, 6, 6); R(g, '#ffe0a8', 6, 6, 2, 2);
    arrow(g, '#ffd24a', 12, 8, 0);
    arrow(g, '#cfd6ea', 3, 8, 0); arrow(g, '#cfd6ea', 8, 2, Math.PI / 2); arrow(g, '#cfd6ea', 8, 13, -Math.PI / 2);
  }
  function drawChest(g) {
    R(g, '#161a28', 1, 1, 14, 14); R(g, '#a2763f', 2, 2, 12, 12);
    R(g, '#c79a5c', 2, 2, 12, 2); R(g, '#7a5428', 2, 12, 12, 2);
    R(g, '#4a3418', 5, 2, 2, 12); R(g, '#4a3418', 9, 2, 2, 12);
    R(g, '#ffd24a', 6, 7, 4, 3);
    arrow(g, '#ffd24a', 13, 8, 0);
  }
  function drawTunnelIn(g, tier) {
    drawBeltCanon(g, 0, 0, 0);
    R(g, '#2b2f40', 8, 2, 8, 12); R(g, '#454c66', 8, 2, 8, 1); R(g, '#1e2230', 8, 13, 8, 1);
    R(g, '#0a0c13', 11, 4, 5, 8); R(g, '#161a28', 12, 5, 4, 6);
    R(g, '#ffd24a', 8, 7, 2, 2);
  }
  function drawTunnelOut(g) {
    drawBeltCanon(g, 0, 0, 8);
    R(g, '#2b2f40', 0, 2, 8, 12); R(g, '#454c66', 0, 2, 8, 1); R(g, '#1e2230', 0, 13, 8, 1);
    R(g, '#0a0c13', 0, 4, 5, 8); R(g, '#161a28', 0, 5, 4, 6);
    R(g, '#ffd24a', 6, 7, 2, 2);
  }

  const BIG = { drill: [2, drawDrill], drill_heavy: [3, drawDrill], smelter: [2, drawSmelter], assembler: [2, drawAssembler],
    steelmill: [3, drawSteelmill], fabricator: [3, drawFabricator], lab: [2, drawLab], seller: [2, drawSeller], port: [4, drawPort] };
  const SMALL = { splitter: drawSplitter, merger: drawMerger, chest: drawChest, underground_in: drawTunnelIn, underground_out: drawTunnelOut };

  function buildingSprite(type, dir, f) {
    const def = BUILDINGS[type];
    if (def.kind === 'belt') return beltSprite(type === 'belt_fast' ? 1 : 0, dir, 0, f | 0);
    if (SMALL[type]) {
      const key = 's' + type + dir;
      return cache[key] || (cache[key] = orient(SMALL[type], dir, false));
    }
    const key = 'm' + type + f;
    if (cache[key]) return cache[key];
    const c = mk(def.w * T, def.h * T), g = c.getContext('2d');
    BIG[type][1](g, f, type === 'drill_heavy');
    return (cache[key] = c);
  }

  // --------------------------------------------------------------- terrain
  const GROUND = ['#2b3040', '#2e3344', '#292d3c'];
  function oreTile(g, px, py, id, x, y, seed) {
    const col = ITEMS[CO.ORE_IDS[id]].color;
    R(g, '#252a38', px, py, T, T);
    for (let k = 0; k < 5; k++) {
      const bx = px + 1 + Math.floor(CO.hash2(x, y, seed + k * 3) * 11), by = py + 1 + Math.floor(CO.hash2(x, y, seed + k * 3 + 1) * 11);
      R(g, shade(col, -0.55), bx, by + 1, 4, 3);
      R(g, col, bx, by, 4, 3);
      R(g, shade(col, 0.45), bx, by, 2, 1);
      R(g, shade(col, -0.25), bx + 2, by + 2, 2, 1);
    }
  }
  function terrain() {
    const W = CO.MAP_W, H = CO.MAP_H, world = CO.world, seed = world.seed;
    const c = mk(W * T, H * T), g = c.getContext('2d');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x * T, py = y * T;
        const ore = world.ore[y * W + x];
        if (ore) { oreTile(g, px, py, ore, x, y, seed); continue; }
        R(g, GROUND[Math.floor(CO.hash2(x, y, seed) * 3)], px, py, T, T);
        for (let k = 0; k < 4; k++) {
          const hx = CO.hash2(x, y, seed + 11 + k), hy = CO.hash2(x, y, seed + 51 + k);
          R(g, k % 2 ? '#353b50' : '#23273a', px + Math.floor(hx * 15), py + Math.floor(hy * 15), 1 + (k === 0 ? 1 : 0), 1);
        }
        if (CO.hash2(x, y, seed + 99) > 0.93) {                    // small crater / pebble
          const hx = 2 + Math.floor(CO.hash2(x, y, seed + 7) * 9), hy = 2 + Math.floor(CO.hash2(x, y, seed + 8) * 9);
          R(g, '#1f2333', px + hx, py + hy + 1, 4, 2); R(g, '#3b4258', px + hx, py + hy, 4, 1);
        }
      }
    }
    return c;
  }

  CO.sprites = { item: itemIcon, belt: beltSprite, building: buildingSprite, terrain: terrain,
    frames: { drill: 4, drill_heavy: 4, smelter: 3, assembler: 4, steelmill: 3, fabricator: 4, lab: 4, port: 2 } };
})(window.CO = window.CO || {});
