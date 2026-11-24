/*
 * sprites.js — procedural pixel art. No image files: every sprite is drawn once
 * into a small offscreen canvas (16 px per tile) and then scaled up crisply by the renderer.
 *
 * Art direction (inspired by Mindustry): bevelled grey metal blocks with a dark outline,
 * a warm yellow "team" accent (#ffd37f), hot orange glows for furnaces, mineral floors
 * with ore chunks lying on the ground.
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

  // ---- shared palette
  const OUT = '#1f1f25';                                       // outline
  const M0 = '#45464f', M1 = '#5f616c', M2 = '#868895', M3 = '#b4b6c0';   // metal, dark → light
  const PANEL = '#50525c', PANEL_D = '#3c3d45';
  const ACC = '#ffd37f', ACC_D = '#d9a24a', ACC_DD = '#8a5a1f';             // team accent
  const HOT = ['#ff7a3a', '#ff9d5c', '#ffbd7a'];                           // furnace glow frames

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function R(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function disc(g, c, cx, cy, r) {
    g.fillStyle = c;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) g.fillRect(cx + x, cy + y, 1, 1);
  }
  function ring(g, c, cx, cy, r, w) {
    g.fillStyle = c;
    const ri = r - (w || 1);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r + r * 0.6 && d > ri * ri + ri * 0.6) g.fillRect(cx + x, cy + y, 1, 1);
    }
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
    nozzle:  ['..oooo..', '.obhhbo.', '.obbbso.', '..obso..', '.oobsoo.', 'oaaaaaao', '.oaaaao.', '..oooo..'],
    battery: ['..oooo..', '.oaaaao.', 'oobbbboo', 'obhbbbso', 'obhabbso', 'obhbabso', 'obbbbbso', '.oooooo.'],
    chip:    ['o.o.o.o.', 'oooooooo', 'obbbbbbo', 'ohbaabbo', 'obbaahbo', 'obbbbsbo', 'oooooooo', 'o.o.o.o.'],
    tank:    ['..oooo..', '.ohhbbo.', 'ohhbbbso', 'oaaaaaao', 'obhbbbso', 'obbbbsso', '.osssso.', '..oooo..'],
    orb:     ['..oooo..', '.ohhhho.', 'ohhaabbo', 'ohabbbbo', 'obbbbbso', 'obbbbsso', '.osssso.', '..oooo..'],
    probe:   ['...oo...', '..oaao..', '.oabbao.', 'oobhbboo', '..obbo..', '.oobboo.', 'o..oo..o', '........']
  };

  function itemIcon(id) {
    const key = 'i' + id;
    if (cache[key]) return cache[key];
    const it = ITEMS[id], pat = PATTERNS[it.shape], c = mk(8, 8), g = c.getContext('2d');
    const pal = { o: shade(it.color, -0.72), b: it.color, h: shade(it.color, 0.4), s: shade(it.color, -0.3), a: it.accent };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const ch = pat[y][x];
      if (ch !== '.') R(g, pal[ch], x, y, 1, 1);
    }
    return (cache[key] = c);
  }

  // ----------------------------------------------------------------- belts
  // tier 0: grey conveyor; tier 1: "titanium" conveyor with light blue rails.
  const BELT = [
    { out: OUT, rail: '#7a7c88', railHi: '#9fa1ad', railLo: '#55565f', bed: '#34353c', rung: '#4a4b55', chev: '#6b6d7a' },
    { out: OUT, rail: '#7f93cf', railHi: '#a9bcf0', railLo: '#55639a', bed: '#33353f', rung: '#474b5c', chev: '#8da1e3' }
  ];
  function chevH(g, c, u) {
    for (let j = 0; j < 3; j++) { R(g, c, u + j, 5 + j, 2, 1); R(g, c, u + j, 10 - j, 2, 1); }
  }
  function chevV(g, c, u) {
    for (let j = 0; j < 3; j++) { R(g, c, 5 + j, u + j, 1, 2); R(g, c, 10 - j, u + j, 1, 2); }
  }
  /** Canonical belt moving East. shape 1 = corner entering from the North side. */
  function drawBeltCanon(g, tier, shape, f) {
    const p = BELT[tier ? 1 : 0];
    if (shape === 0) {
      R(g, p.out, 0, 1, 16, 14);
      R(g, p.rail, 0, 2, 16, 2); R(g, p.railHi, 0, 2, 16, 1);
      R(g, p.rail, 0, 12, 16, 2); R(g, p.railLo, 0, 13, 16, 1);
      R(g, p.bed, 0, 4, 16, 8);
      for (let k = 0; k < 4; k++) { const u = (f + 4 * k) % 16; R(g, p.rung, u, 4, 1, 8); }
      for (let k = 0; k < 2; k++) { const u = (f + 8 * k) % 16; chevH(g, p.chev, u); chevH(g, p.chev, u - 16); }
      for (let x = 1; x < 16; x += 4) { R(g, p.railLo, x, 3, 1, 1); R(g, p.railLo, x, 12, 1, 1); }   // rivets
    } else {
      // L-shaped track: from the North edge down to the centre, then out to the East edge.
      R(g, p.out, 1, 0, 14, 15); R(g, p.out, 1, 1, 15, 14);
      R(g, p.rail, 2, 0, 12, 14); R(g, p.rail, 2, 2, 14, 12);
      R(g, p.railHi, 2, 0, 1, 14); R(g, p.railLo, 2, 13, 14, 1);
      R(g, p.bed, 4, 0, 8, 12); R(g, p.bed, 4, 4, 12, 8);
      for (let k = 0; k < 2; k++) {
        const s = (f + 8 * k) % 16;
        if (s <= 7) chevV(g, p.chev, s); else chevH(g, p.chev, s);
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
  /** Bevelled metal block filling W×H, with an inner panel and corner plates. Returns the inner rect. */
  function block(g, W, H, opts) {
    opts = opts || {};
    const base = opts.base || M1;
    R(g, OUT, 0, 0, W, H);
    R(g, base, 1, 1, W - 2, H - 2);
    R(g, shade(base, 0.32), 1, 1, W - 2, 1); R(g, shade(base, 0.32), 1, 1, 1, H - 2);      // light top / left
    R(g, shade(base, -0.3), 1, H - 2, W - 2, 1); R(g, shade(base, -0.3), W - 2, 1, 1, H - 2); // dark bottom / right
    const m = opts.margin || 3;
    R(g, OUT, m, m, W - 2 * m, H - 2 * m);
    R(g, opts.panel || PANEL, m + 1, m + 1, W - 2 * m - 2, H - 2 * m - 2);
    R(g, PANEL_D, m + 1, H - m - 2, W - 2 * m - 2, 1);
    if (opts.corners !== false) {                                     // corner plates with a bolt
      const s = W >= 48 ? 6 : 5, cs = opts.cornerColor || M2;
      [[0, 0], [W - s, 0], [0, H - s], [W - s, H - s]].forEach(function (p) {
        R(g, OUT, p[0], p[1], s, s); R(g, cs, p[0] + 1, p[1] + 1, s - 2, s - 2);
        R(g, shade(cs, 0.3), p[0] + 1, p[1] + 1, s - 2, 1);
        R(g, OUT, p[0] + (s >> 1), p[1] + (s >> 1), 1, 1);
      });
    }
    g.clearRect(0, 0, 1, 1); g.clearRect(W - 1, 0, 1, 1); g.clearRect(0, H - 1, 1, 1); g.clearRect(W - 1, H - 1, 1, 1);
    return { x: m + 1, y: m + 1, w: W - 2 * m - 2, h: H - 2 * m - 2 };
  }
  /** Yellow hazard stripes in a rectangle (team accent). */
  function hazard(g, x, y, w, h) {
    R(g, OUT, x - 1, y - 1, w + 2, h + 2);
    R(g, ACC, x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let k = -h; k < w; k += 4) line(g, ACC_DD, x + k, y + h - 1, x + k + h - 1, y, 1);
    g.restore();
  }
  function vent(g, x, y, w) {                                          // dark slotted grille
    R(g, OUT, x, y, w, 4);
    for (let i = 1; i < w - 1; i += 2) R(g, '#2a2b31', x + i, y + 1, 1, 2);
  }

  function drawDrill(g, f, big) {
    const S = big ? 48 : 32, c = S / 2, r = big ? 15 : 10;
    block(g, S, S, { base: M1, margin: 3 });
    if (big) { hazard(g, 9, 3, 30, 2); hazard(g, 9, S - 5, 30, 2); }
    disc(g, OUT, c, c, r + 1); disc(g, '#2b2c33', c, c, r); ring(g, M0, c, c, r, 2);
    for (let k = 0; k < 4; k++) {                                     // rotor blades
      const a = f * Math.PI / 8 + k * Math.PI / 2;
      for (let d = 3; d < r - 1; d++) {
        const x = Math.round(c + Math.cos(a) * d) - 1, y = Math.round(c + Math.sin(a) * d) - 1;
        R(g, OUT, x - 1, y - 1, 4, 4);
      }
      for (let d = 3; d < r - 1; d++) {
        const x = Math.round(c + Math.cos(a) * d) - 1, y = Math.round(c + Math.sin(a) * d) - 1;
        R(g, d > r - 4 ? ACC : M3, x, y, 2, 2);
      }
    }
    disc(g, OUT, c, c, big ? 5 : 4); disc(g, M2, c, c, big ? 4 : 3); disc(g, M3, c - 1, c - 1, 1);
  }
  function drawSmelter(g, f) {
    const i = block(g, 32, 32, { base: '#6a5f5c', cornerColor: '#8f827c' });
    vent(g, 8, 4, 16); vent(g, 8, 24, 16);
    disc(g, OUT, 16, 16, 8); disc(g, '#3a2a26', 16, 16, 7);
    disc(g, HOT[f % 3], 16, 16, 5); disc(g, HOT[(f + 1) % 3], 16, 16, 3); disc(g, '#fff0c8', 16, 16, 1);
    R(g, ACC, i.x, 15, 2, 2); R(g, ACC, i.x + i.w - 2, 15, 2, 2);
  }
  function drawAssembler(g, f) {
    const i = block(g, 32, 32, {});
    R(g, OUT, 8, 8, 16, 16); R(g, M0, 9, 9, 14, 14); R(g, '#2f3037', 10, 10, 12, 12);
    const t = [0, 3, 6, 3][f % 4];                                    // stamping piston
    R(g, OUT, 11, 10 + t, 10, 5); R(g, M3, 12, 11 + t, 8, 3); R(g, ACC, 12, 11 + t, 8, 1);
    R(g, M2, 15, 9, 2, 1 + t);
    hazard(g, i.x + 1, i.y + i.h - 3, i.w - 2, 2);
  }
  function drawSteelmill(g, f) {
    block(g, 48, 48, { base: '#5d5a5e', cornerColor: '#8a8690' });
    [[10, 10], [38, 10]].forEach(function (p) { disc(g, OUT, p[0], p[1], 5); disc(g, '#2a2b31', p[0], p[1], 4); ring(g, ACC_D, p[0], p[1], 4, 1); disc(g, '#151519', p[0], p[1], 2); });
    R(g, OUT, 10, 18, 28, 22); R(g, '#3a2a26', 11, 19, 26, 20);
    R(g, HOT[f % 3], 13, 21, 22, 16); R(g, HOT[(f + 1) % 3], 16, 24, 16, 10); R(g, '#fff0c8', 20, 27, 8, 4);
    for (let x = 13; x < 35; x += 4) R(g, '#3a2a26', x, 21, 1, 16);    // grate bars
    vent(g, 16, 42, 16);
  }
  function drawFabricator(g, f) {
    block(g, 48, 48, { base: '#5a5f6a' });
    hazard(g, 8, 4, 32, 2);
    disc(g, OUT, 24, 25, 13); disc(g, '#2b2d36', 24, 25, 12);
    const a = f * Math.PI / 8;                                        // rotating weave frame
    for (let k = 0; k < 4; k++) {
      const ang = a + k * Math.PI / 2, x = Math.round(24 + Math.cos(ang) * 8), y = Math.round(25 + Math.sin(ang) * 8);
      R(g, OUT, x - 3, y - 3, 6, 6); R(g, M3, x - 2, y - 2, 4, 4); R(g, ACC, x - 1, y - 1, 2, 2);
    }
    disc(g, '#5d78c8', 24, 25, 4); disc(g, '#8da1e3', 24, 25, 3); disc(g, '#e0e8ff', 24, 25, 1);
    vent(g, 8, 41, 12); vent(g, 28, 41, 12);
  }
  function drawSpaceyard(g, f) {                               // 4×4: heavy hangar with a glowing core
    block(g, 64, 64, { base: '#5b5866', margin: 4 });
    hazard(g, 10, 5, 44, 3); hazard(g, 10, 56, 44, 3);
    disc(g, OUT, 32, 32, 18); disc(g, M0, 32, 32, 17); ring(g, M2, 32, 32, 17, 2);
    for (let k = 0; k < 8; k++) {                                     // rotating clamp ring
      const ang = f * Math.PI / 8 + k * Math.PI / 4, x = Math.round(32 + Math.cos(ang) * 13), y = Math.round(32 + Math.sin(ang) * 13);
      R(g, OUT, x - 2, y - 2, 5, 5); R(g, k % 2 ? ACC : M3, x - 1, y - 1, 3, 3);
    }
    disc(g, OUT, 32, 32, 8); disc(g, HOT[f % 3], 32, 32, 7); disc(g, '#ffe2a6', 32, 32, 4); disc(g, '#ffffff', 32, 32, 1);
    [[10, 32], [54, 32]].forEach(function (p) { R(g, OUT, p[0] - 3, p[1] - 8, 6, 16); R(g, M2, p[0] - 2, p[1] - 7, 4, 14); R(g, ACC, p[0] - 2, p[1] - 1, 4, 2); });
  }
  function drawLab(g, f) {
    block(g, 32, 32, { base: '#5e5a6e', cornerColor: '#8f88a6' });
    disc(g, OUT, 16, 15, 9); disc(g, '#3d4a66', 16, 15, 8);
    disc(g, '#4fbf7a', 16, 17, 6); R(g, '#3d4a66', 8, 8, 16, 6);       // liquid level
    disc(g, '#9fe8b8', 16, 18, 2);
    const by = 19 - (f % 4) * 2;
    R(g, '#e8fff0', 14 + (f % 2) * 3, by, 2, 2);
    R(g, '#c8d8ff', 11, 9, 3, 2);                                     // glass glint
    hazard(g, 9, 26, 14, 2);
  }
  function drawSeller(g) {
    block(g, 32, 32, { base: '#6b6250', cornerColor: ACC_D });
    disc(g, OUT, 16, 16, 9); disc(g, ACC_D, 16, 16, 8); disc(g, ACC, 16, 16, 6); ring(g, '#fff0c8', 16, 16, 6, 1);
    R(g, ACC_DD, 15, 11, 2, 10); R(g, ACC_DD, 12, 13, 7, 2); R(g, ACC_DD, 13, 17, 6, 2);   // ¢-ish glyph
  }
  function drawPort(g, f) {                                    // the station port: a "core" block
    block(g, 64, 64, { base: '#5f616c', margin: 4, cornerColor: ACC_D });
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if ((x + y) % 2) R(g, '#4a4c56', 8 + x * 7, 8 + y * 7, 7, 7);
    disc(g, OUT, 32, 32, 21); ring(g, ACC, 32, 32, 20, 3); disc(g, '#2f3037', 32, 32, 17);
    ring(g, f % 2 ? ACC : ACC_D, 32, 32, 14, 1);
    R(g, OUT, 22, 21, 6, 22); R(g, OUT, 36, 21, 6, 22); R(g, OUT, 22, 29, 20, 6);
    R(g, ACC, 23, 22, 4, 20); R(g, ACC, 37, 22, 4, 20); R(g, ACC, 23, 30, 18, 4);
    const lc = f % 2 ? '#fff0c8' : ACC_D;
    R(g, lc, 6, 6, 3, 3); R(g, lc, 55, 6, 3, 3); R(g, lc, 6, 55, 3, 3); R(g, lc, 55, 55, 3, 3);
  }

  /** Mass driver barrel pointing East, 16×8 (drawn rotated toward the target by render.js). */
  function drawBarrel(g, ox, oy) {
    R(g, OUT, ox, oy + 1, 15, 6); R(g, OUT, ox + 11, oy, 5, 8);
    R(g, M2, ox + 1, oy + 2, 11, 4); R(g, M3, ox + 1, oy + 2, 11, 1); R(g, M0, ox + 1, oy + 5, 11, 1);
    R(g, '#2a2b31', ox + 3, oy + 3, 8, 2);                              // rail slot
    R(g, ACC, ox + 12, oy + 1, 3, 6); R(g, ACC_DD, ox + 12, oy + 6, 3, 1);
  }
  function barrelSprite() {
    if (cache.barrel) return cache.barrel;
    const c = mk(16, 8); drawBarrel(c.getContext('2d'), 0, 0);
    return (cache.barrel = c);
  }
  /** Mass driver base: a turret pad with magnetic coils. Frame 0 also shows the barrel (palette, ghost). */
  function drawDriver(g, f) {
    block(g, 32, 32, { base: '#5d6070', cornerColor: ACC_D });
    disc(g, OUT, 16, 16, 11); disc(g, M0, 16, 16, 10); ring(g, M2, 16, 16, 10, 1);
    for (let k = 0; k < 8; k++) {                                     // coils around the turret ring
      const a = k * Math.PI / 4, x = Math.round(16 + Math.cos(a) * 8) - 1, y = Math.round(16 + Math.sin(a) * 8) - 1;
      R(g, OUT, x - 1, y - 1, 4, 4); R(g, k % 2 ? ACC_D : M3, x, y, 2, 2);
    }
    disc(g, OUT, 16, 16, 5); disc(g, '#2a2b31', 16, 16, 4); ring(g, ACC, 16, 16, 4, 1);
    if (f === 0) drawBarrel(g, 14, 12);
  }

  // 1×1 sprites (drawn facing East, rotated by `dir`)
  function tri(g, c, x, y) { R(g, c, x, y - 2, 1, 5); R(g, c, x + 1, y - 1, 1, 3); R(g, c, x + 2, y, 1, 1); }
  function arrow(g, c, cx, cy, ang) { g.save(); g.translate(cx, cy); g.rotate(ang); tri(g, OUT, -2, 0); tri(g, c, -1, 0); g.restore(); }
  function small(g, base) {                                           // 1×1 bevelled block
    R(g, OUT, 1, 1, 14, 14); R(g, base, 2, 2, 12, 12);
    R(g, shade(base, 0.32), 2, 2, 12, 1); R(g, shade(base, 0.32), 2, 2, 1, 12);
    R(g, shade(base, -0.3), 2, 13, 12, 1); R(g, shade(base, -0.3), 13, 2, 1, 12);
  }
  function drawSplitter(g) {
    small(g, M1);
    R(g, OUT, 5, 5, 6, 6); R(g, ACC, 6, 6, 4, 4); R(g, '#fff0c8', 6, 6, 2, 1);
    arrow(g, ACC, 12, 8, 0); arrow(g, ACC, 8, 3, -Math.PI / 2); arrow(g, ACC, 8, 12, Math.PI / 2);
    R(g, OUT, 2, 6, 2, 4);
  }
  function drawMerger(g) {
    small(g, '#5a5c68');
    R(g, OUT, 5, 5, 6, 6); R(g, M3, 6, 6, 4, 4); R(g, ACC, 7, 7, 2, 2);
    arrow(g, ACC, 12, 8, 0);
    arrow(g, M3, 3, 8, 0); arrow(g, M3, 8, 2, Math.PI / 2); arrow(g, M3, 8, 13, -Math.PI / 2);
  }
  function drawChest(g) {                                             // "container"
    small(g, '#6a6d78');
    R(g, OUT, 4, 4, 8, 8); R(g, M0, 5, 5, 6, 6); R(g, PANEL, 6, 6, 4, 4);
    R(g, ACC, 2, 2, 2, 2); R(g, ACC, 12, 2, 2, 2); R(g, ACC, 2, 12, 2, 2); R(g, ACC, 12, 12, 2, 2);
    arrow(g, ACC, 13, 8, 0);
  }
  function drawTunnelIn(g) {
    drawBeltCanon(g, 0, 0, 0);
    R(g, OUT, 7, 1, 9, 14); R(g, M1, 8, 2, 7, 12); R(g, M2, 8, 2, 7, 1); R(g, M0, 8, 13, 7, 1);
    R(g, OUT, 11, 4, 4, 8); R(g, '#16161a', 12, 5, 3, 6);
    arrow(g, ACC, 9, 8, 0);
  }
  function drawTunnelOut(g) {
    drawBeltCanon(g, 0, 0, 8);
    R(g, OUT, 0, 1, 9, 14); R(g, M1, 1, 2, 7, 12); R(g, M2, 1, 2, 7, 1); R(g, M0, 1, 13, 7, 1);
    R(g, OUT, 1, 4, 4, 8); R(g, '#16161a', 1, 5, 3, 6);
    arrow(g, ACC, 6, 8, 0);
  }

  const BIG = { drill: [2, drawDrill], drill_heavy: [3, drawDrill], smelter: [2, drawSmelter], assembler: [2, drawAssembler],
    steelmill: [3, drawSteelmill], fabricator: [3, drawFabricator], spaceyard: [4, drawSpaceyard], lab: [2, drawLab], seller: [2, drawSeller], port: [4, drawPort], driver: [2, drawDriver] };
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
  // Two floor materials blended by large-scale noise (dark basalt and dusty sand), each tile
  // with a little texture. Ores are chunks of rock lying on top of the floor.
  const BASALT = ['#34343b', '#313138', '#37373e'], SAND = ['#433f3b', '#403c38', '#46423d'];
  function floorTile(g, px, py, x, y, seed) {
    const n = CO.vnoise(x * 0.06, y * 0.06, seed + 5);
    const pal = n > 0.55 ? SAND : BASALT;
    R(g, pal[Math.floor(CO.hash2(x, y, seed) * 3)], px, py, T, T);
    for (let k = 0; k < 3; k++) {                                     // dark specks
      const hx = CO.hash2(x, y, seed + 11 + k), hy = CO.hash2(x, y, seed + 51 + k);
      R(g, shade(pal[0], -0.25), px + Math.floor(hx * 14), py + Math.floor(hy * 14), 2, 1);
    }
    const hx = CO.hash2(x, y, seed + 71), hy = CO.hash2(x, y, seed + 72);
    R(g, shade(pal[0], 0.18), px + Math.floor(hx * 15), py + Math.floor(hy * 15), 1, 1);
    if (CO.hash2(x, y, seed + 99) > 0.9) {                            // small boulder
      const bx = 2 + Math.floor(CO.hash2(x, y, seed + 7) * 9), by = 2 + Math.floor(CO.hash2(x, y, seed + 8) * 9);
      R(g, shade(pal[0], -0.35), bx + px, by + py + 1, 5, 3);
      R(g, shade(pal[0], 0.25), bx + px, by + py, 4, 2); R(g, shade(pal[0], 0.4), bx + px, by + py, 2, 1);
    }
  }
  function oreTile(g, px, py, id, x, y, seed) {
    const col = ITEMS[CO.ORE_IDS[id]].color, dk = shade(col, -0.6);
    const n = 3 + Math.floor(CO.hash2(x, y, seed + 31) * 2);
    for (let k = 0; k < n; k++) {
      const bx = px + 1 + Math.floor(CO.hash2(x, y, seed + k * 3) * 10), by = py + 1 + Math.floor(CO.hash2(x, y, seed + k * 3 + 1) * 10);
      const w = 3 + Math.floor(CO.hash2(x, y, seed + k * 5 + 2) * 3), h = 3;
      R(g, '#18181c', bx - 1, by, w + 2, h + 1);                      // outline + drop shadow
      R(g, dk, bx, by + 1, w, h);
      R(g, col, bx, by, w, h - 1);
      R(g, shade(col, 0.45), bx, by, Math.max(1, w - 2), 1);
    }
  }
  function terrain() {
    const W = CO.MAP_W, H = CO.MAP_H, world = CO.world, seed = world.seed;
    const c = mk(W * T, H * T), g = c.getContext('2d');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x * T, py = y * T;
        floorTile(g, px, py, x, y, seed);
        const ore = world.ore[y * W + x];
        if (ore) oreTile(g, px, py, ore, x, y, seed);
      }
    }
    return c;
  }

  CO.sprites = { item: itemIcon, belt: beltSprite, building: buildingSprite, terrain: terrain, barrel: barrelSprite,
    frames: { drill: 4, drill_heavy: 4, smelter: 3, assembler: 4, steelmill: 3, fabricator: 4, spaceyard: 4, lab: 4, port: 2 } };
})(window.CO = window.CO || {});
