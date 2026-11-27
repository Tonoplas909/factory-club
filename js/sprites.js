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
 *   CO.sprites.terrainChunk(tx, ty, n)   ground + ore layer of an n×n-tile chunk
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
    drop:    ['...oo...', '..ohbo..', '.ohbbbo.', '.ohbbbo.', 'ohabbbso', 'obbbbsso', '.osssso.', '..oooo..'],
    probe:   ['...oo...', '..oaao..', '.oabbao.', 'oobhbboo', '..obbo..', '.oobboo.', 'o..oo..o', '........'],
    // ---- Kéora's items: their own shapes (nuggets, shards, hexagonal bars, capsules, cartridges...)
    k_nugget: ['........', '..oooo..', '.ohhbbo.', 'ohhbbaso', 'obbbbbso', 'obbbbsso', '.osssso.', '..oooo..'],
    k_shard: ['.....oo.', '....oho.', '...ohbo.', '..ohbbo.', '.ohbbso.', 'ohbbsso.', 'oabsso..', '.oooo...'],
    k_powder: ['........', '........', '...oo...', '..ohho..', '.ohbbbo.', 'ohbabbso', 'obbbbsso', 'oooooooo'],
    k_hexbar: ['..oooo..', '.ohhhbo.', 'ohhhbbbo', 'obbbbbso', 'obbbbbso', 'osbbbsso', '.osssso.', '..oooo..'],
    k_flask: ['...oo...', '...oo...', '..ohbo..', '.ohbbbo.', 'ohaaaaso', 'obaaaaso', '.osssso.', '..oooo..'],
    k_pane: ['oooooooo', 'ohaabbbo', 'oahbbbbo', 'obbbbbao', 'obbbbaso', 'obbbasso', 'obbbbsso', 'oooooooo'],
    k_tile: ['........', '.oooooo.', 'ohhhhhbo', 'ohbbbbso', 'ohbaabso', 'obbbbsso', '.oooooo.', '........'],
    k_sheet: ['........', '.ooooooo', 'ohhhhhbo', 'obbbbbo.', 'ohhhhbo.', 'obbbbso.', 'oooooo..', '........'],
    k_rotor: ['..oaao..', '.obbbbo.', 'abooooba', 'abo..oba', 'abo..oba', 'abooooba', '.obbbbo.', '..oaao..'],
    k_spool: ['oooooooo', 'obbbbbbo', '.oaaaao.', '.ohahao.', '.oaaaao.', '.ohahao.', 'obbbbbbo', 'oooooooo'],
    k_pchip: ['.o.o.o..', 'oooooooo', 'obbbbbbo', 'obbaabbo', 'obaahabo', 'obbaabbo', 'oooooooo', '.o.o.o..'],
    k_capsule: ['........', '.oooooo.', 'ohhhhhao', 'obbbbbao', 'obbbbbao', 'osssssao', '.oooooo.', '........'],
    k_layers: ['........', '.oooooo.', 'ohhhhhho', 'oaaaaaao', 'obbbbbbo', 'oaaaaaao', 'osssssso', '.oooooo.'],
    k_blob: ['........', '...ooo..', '..ohhbo.', '.ohhbbbo', 'ohbbbbso', 'obbbbsso', '.ossso..', '..ooo...'],
    k_vial: ['..oooo..', '..oaao..', '..obbo..', '.ohbbbo.', '.ohbbbo.', '.ohbbso.', '.osssso.', '..oooo..'],
    k_dome: ['........', '...oo...', '.oohhoo.', 'ohhbbbbo', 'ohbbbbbo', 'obbbbbso', 'oaaaaaao', 'oooooooo'],
    k_lens: ['..oooo..', '.oaaaao.', 'oahhbbao', 'oahbbbao', 'oabbbbao', 'oabbbsao', '.oaaaao.', '..oooo..'],
    k_module: ['.oooooo.', 'ohhhhhho', 'obabbabo', 'obbbbbbo', 'obabbabo', 'osssssso', '.oooooo.', '..o..o..'],
    k_qchip: ['o.o.o.o.', 'oooooooo', 'obaaaabo', 'oabhhbao', 'oabhhbao', 'obaaaabo', 'oooooooo', '.o.o.o.o'],
    k_capa: ['..oooo..', '.ohhhbo.', 'oaaaaaao', 'ohbbbbso', 'oaaaaaao', 'ohbbbbso', '.osssso.', '..o..o..'],
    k_engine: ['.oooo...', 'ohhbbo..', 'obbbbooo', 'obbbbaaa', 'obbbbaaa', 'obbssooo', 'osssso..', '.oooo...'],
    k_star: ['...oo...', '.aohhoa.', '.ohhhbo.', 'ohhbbbbo', 'obbbbbso', '.obbsso.', '.aossoa.', '...oo...'],
    k_gate: ['..oooo..', '.ohhhbo.', 'oho..obo', 'oa....ao', 'oa....ao', 'obo..oso', '.osssso.', '..oooo..'],
    k_cart: ['..oooo..', '..oaao..', '.oooooo.', '.ohbbbo.', '.ohbbbo.', '.ohbbso.', '.osssso.', '.oooooo.'],
    k_slag: ['........', '.oo..oo.', 'obbooabo', 'obsbbbso', '.obbabo.', 'obssbbso', '.oooooo.', '........'],
    k_wool: ['..o.oo..', '.ohohho.', 'ohhbhbho', 'obhbbhbo', 'ohbbbbbo', 'obbsbbso', '.osssso.', '..o..o..'],
    k_catalyst: ['...oo...', '..oaao..', '.oahhao.', 'oahhbbao', 'oabbbsao', '.oabsao.', '..oaao..', '...oo...']
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
    { out: OUT, rail: '#7f93cf', railHi: '#a9bcf0', railLo: '#55639a', bed: '#33353f', rung: '#474b5c', chev: '#8da1e3' },
    { out: OUT, rail: '#c9a24a', railHi: '#ffd37f', railLo: '#8a6a2a', bed: '#2e2c2a', rung: '#4a443a', chev: '#e8c070' }
  ];
  function chevH(g, c, u) {
    for (let j = 0; j < 3; j++) { R(g, c, u + j, 5 + j, 2, 1); R(g, c, u + j, 10 - j, 2, 1); }
  }
  function chevV(g, c, u) {
    for (let j = 0; j < 3; j++) { R(g, c, 5 + j, u + j, 1, 2); R(g, c, 10 - j, u + j, 1, 2); }
  }
  /** Canonical belt moving East. shape 1 = corner entering from the North side. */
  function drawBeltCanon(g, tier, shape, f) {
    const p = BELT[tier || 0];
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
  function drawOverflow(g) {                                          // front first, then the sides
    small(g, M1);
    R(g, OUT, 4, 5, 8, 6); R(g, '#2b2c33', 5, 6, 6, 4);
    arrow(g, ACC, 12, 8, 0); arrow(g, M3, 8, 3, -Math.PI / 2); arrow(g, M3, 8, 12, Math.PI / 2);
    R(g, ACC, 6, 7, 4, 2);
  }
  function drawUnderflow(g) {                                         // the sides first, then the front
    small(g, M1);
    R(g, OUT, 5, 4, 6, 8); R(g, '#2b2c33', 6, 5, 4, 6);
    arrow(g, M3, 12, 8, 0); arrow(g, ACC, 8, 3, -Math.PI / 2); arrow(g, ACC, 8, 12, Math.PI / 2);
    R(g, ACC, 7, 6, 2, 4);
  }
  function drawJunction(g) {                                          // a cross of two tracks
    small(g, M0);
    R(g, OUT, 2, 6, 12, 4); R(g, OUT, 6, 2, 4, 12);
    R(g, '#34353c', 3, 7, 10, 2); R(g, '#34353c', 7, 3, 2, 10);
    R(g, M3, 6, 6, 4, 4); R(g, ACC, 7, 7, 2, 2);
  }
  function drawSorterInv(g) {                                         // filtered item to the sides
    small(g, '#5a5c68');
    R(g, OUT, 5, 5, 6, 6); R(g, M3, 6, 6, 4, 4); R(g, '#e55454', 6, 6, 2, 1);
    arrow(g, M3, 12, 8, 0); arrow(g, ACC, 8, 3, -Math.PI / 2); arrow(g, ACC, 8, 12, Math.PI / 2);
    R(g, OUT, 2, 6, 2, 4);
  }
  function drawUnloader(g) {                                          // a pump: claws on three sides, outlet in front
    small(g, '#6a6d78');
    R(g, OUT, 4, 4, 8, 8); R(g, M0, 5, 5, 6, 6); R(g, ACC_D, 6, 6, 4, 4);
    R(g, M3, 2, 3, 2, 2); R(g, M3, 2, 11, 2, 2); R(g, M3, 7, 2, 2, 2); R(g, M3, 7, 12, 2, 2);
    arrow(g, ACC, 13, 8, 0);
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

  // ---- energy
  function drawPole(g) {                                              // post seen from above: base, crossbar, insulators
    R(g, OUT, 5, 5, 6, 6); R(g, M1, 6, 6, 4, 4); R(g, M3, 6, 6, 4, 1);
    R(g, OUT, 1, 7, 14, 3); R(g, '#7a5a3a', 2, 8, 12, 1);
    R(g, OUT, 1, 6, 3, 3); R(g, '#8fdcec', 2, 7, 1, 1); R(g, OUT, 12, 6, 3, 3); R(g, '#8fdcec', 13, 7, 1, 1);
    R(g, ACC, 7, 7, 2, 2);
  }
  function drawPylon(g) {                                             // lattice tower
    R(g, OUT, 2, 2, 12, 12); R(g, M0, 3, 3, 10, 10);
    line(g, M2, 3, 3, 12, 12, 1); line(g, M2, 12, 3, 3, 12, 1);
    R(g, M3, 3, 3, 2, 2); R(g, M3, 11, 3, 2, 2); R(g, M3, 3, 11, 2, 2); R(g, M3, 11, 11, 2, 2);
    R(g, OUT, 6, 6, 4, 4); R(g, ACC, 7, 7, 2, 2);
  }
  function drawGenerator(g, f) {                                      // coal boiler: firebox, chimney, coal hopper
    block(g, 32, 32, { base: '#5a5550', cornerColor: '#8a8078' });
    R(g, OUT, 5, 5, 14, 14); R(g, '#3a2a26', 6, 6, 12, 12);
    R(g, HOT[f % 3], 8, 8, 8, 8); R(g, HOT[(f + 1) % 3], 10, 10, 4, 4); R(g, '#fff0c8', 11, 11, 2, 2);
    for (let x = 8; x < 16; x += 3) R(g, '#3a2a26', x, 8, 1, 8);
    disc(g, OUT, 24, 9, 5); disc(g, M0, 24, 9, 4); disc(g, '#1a1a1e', 24, 9, 2);
    R(g, OUT, 20, 19, 9, 9); R(g, '#2a2a30', 21, 20, 7, 7); R(g, '#464656', 22, 21, 2, 2); R(g, '#464656', 25, 23, 2, 2); R(g, '#8a8aa0', 23, 24, 1, 1);
    hazard(g, 5, 25, 12, 2);
  }
  function drawSolarPlant(g) {                                        // four panels on a frame
    block(g, 32, 32, { base: '#4a4c56', cornerColor: '#6a6d78' });
    [[4, 4], [17, 4], [4, 17], [17, 17]].forEach(function (p) {
      R(g, OUT, p[0], p[1], 11, 11); R(g, '#1c3f8a', p[0] + 1, p[1] + 1, 9, 9); R(g, '#2f6fe0', p[0] + 1, p[1] + 1, 9, 8);
      R(g, '#9fd0ff', p[0] + 5, p[1] + 1, 1, 9); R(g, '#9fd0ff', p[0] + 1, p[1] + 5, 9, 1); R(g, '#6fa8ff', p[0] + 2, p[1] + 2, 2, 1);
    });
  }

  // ---- orbital program
  function drawLaunchPad(g, f) {                                      // concrete pad, flame trench, service tower
    block(g, 64, 64, { base: '#5a5c66', margin: 3, cornerColor: ACC_D });
    hazard(g, 6, 6, 52, 3); hazard(g, 6, 55, 52, 3);
    disc(g, OUT, 32, 32, 16); disc(g, '#3a3b42', 32, 32, 15); disc(g, '#26272e', 32, 32, 9);
    R(g, OUT, 48, 14, 10, 36); R(g, M1, 49, 15, 8, 34);
    for (let y = 17; y < 48; y += 5) R(g, M3, 49, y, 8, 1);
    R(g, (f % 2) ? '#e55454' : '#7a2a2a', 52, 12, 2, 2);
  }

  // ---- drones
  function drawDroneHub(g, f) {                                       // landing pad with corner lights and a mast
    block(g, 32, 32, { base: '#4a4c56', cornerColor: ACC_D });
    R(g, OUT, 5, 5, 22, 22); R(g, '#2b2c33', 6, 6, 20, 20);
    R(g, ACC, 9, 15, 14, 2); R(g, ACC, 15, 9, 2, 14);                 // cross marking
    ring(g, ACC_D, 16, 16, 8, 1);
    [[3, 3], [27, 3], [3, 27], [27, 27]].forEach(function (p, i) { R(g, (f + i) % 2 ? '#84f491' : '#2f6a3a', p[0], p[1], 2, 2); });
  }
  function drawDroneProvider(g) {                                     // blue crate, arrow up (items leave)
    small(g, '#3f6fb8');
    R(g, OUT, 4, 4, 8, 8); R(g, '#2a4a80', 5, 5, 6, 6);
    R(g, '#bfe6ff', 7, 6, 2, 5); R(g, '#bfe6ff', 6, 7, 4, 1); R(g, '#bfe6ff', 5, 8, 6, 1);
  }
  function drawDroneRequester(g) {                                    // orange crate, output arrow
    small(g, '#c8783a');
    R(g, OUT, 4, 4, 8, 8); R(g, '#8a4a20', 5, 5, 6, 6);
    R(g, '#ffe0c0', 7, 5, 2, 5); R(g, '#ffe0c0', 6, 9, 4, 1); R(g, '#ffe0c0', 5, 8, 6, 1);
    arrow(g, ACC, 13, 8, 0);
  }

  // ---- fluids
  function drawPump(g, f) {                                           // pump on a lake: blue well, motor, outlet flanges
    block(g, 32, 32, { base: '#4f5a6a', cornerColor: '#7f8fa8' });
    disc(g, OUT, 16, 16, 9); disc(g, '#2c5fa8', 16, 16, 8); ring(g, '#5f9fe8', 16, 16, 8, 1);
    disc(g, OUT, 16, 16, 5); disc(g, M2, 16, 16, 4); R(g, ACC, 15, 12 + (f % 2) * 2, 2, 2);
    [[1, 14], [27, 14], [14, 1], [14, 27]].forEach(function (p) { R(g, OUT, p[0], p[1], 4, 4); R(g, M3, p[0] + 1, p[1] + 1, 2, 2); });
  }
  function drawOilWell(g, f) {                                        // pumpjack seen from above
    block(g, 32, 32, { base: '#4a4450', cornerColor: '#6a6070' });
    disc(g, OUT, 9, 23, 5); disc(g, '#1d1824', 9, 23, 4);
    const hx = 6 + (f % 2) * 2;
    R(g, OUT, hx, 7, 22, 6); R(g, M1, hx + 1, 8, 20, 4); R(g, ACC, hx + 1, 8, 4, 4);
    R(g, OUT, 20, 12, 6, 14); R(g, M2, 21, 13, 4, 12);
    hazard(g, 4, 28, 24, 2);
  }
  function drawFluidTank(g) {                                         // round tank
    block(g, 32, 32, { base: '#4f5a6a', margin: 2 });
    disc(g, OUT, 16, 16, 13); disc(g, '#9aa6c0', 16, 16, 12); ring(g, '#c8d2e8', 16, 16, 12, 1);
    disc(g, '#7f8aa4', 16, 16, 7); ring(g, ACC_D, 16, 16, 9, 1); R(g, OUT, 15, 4, 2, 6);
  }
  function drawSteamPlant(g, f) {                                     // boiler (left) and cooling tower (right)
    block(g, 48, 48, { base: '#5a5550', cornerColor: '#8a8078' });
    R(g, OUT, 4, 6, 18, 36); R(g, '#6b5a52', 5, 7, 16, 34);
    for (let y = 9; y < 40; y += 4) R(g, '#5a4a44', 5, y, 16, 1);
    R(g, OUT, 8, 18, 10, 12); R(g, HOT[f % 3], 9, 19, 8, 10); R(g, '#fff0c8', 12, 23, 2, 2);
    disc(g, OUT, 33, 24, 12); disc(g, '#c8ccd8', 33, 24, 11); disc(g, '#9aa0b0', 33, 24, 7); disc(g, '#2a2b31', 33, 24, 5);
    ring(g, '#e8ecf4', 33, 24, 11, 1);
  }
  function drawRefinery(g, f) {                                       // distillation columns, tank, flare
    block(g, 48, 48, { base: '#55505e', cornerColor: '#7a7088' });
    disc(g, OUT, 13, 13, 7); disc(g, M3, 13, 13, 6); disc(g, M2, 13, 13, 3);
    disc(g, OUT, 30, 12, 5); disc(g, M3, 30, 12, 4); disc(g, M2, 30, 12, 2);
    disc(g, OUT, 31, 32, 10); disc(g, '#d8d2ea', 31, 32, 9); ring(g, '#ffffff', 31, 32, 9, 1); disc(g, '#b8b0cc', 31, 32, 4);
    R(g, OUT, 6, 26, 12, 4); R(g, M2, 7, 27, 10, 2); R(g, OUT, 6, 34, 12, 4); R(g, M2, 7, 35, 10, 2);
    disc(g, OUT, 10, 42, 3); disc(g, HOT[f % 3], 10, 42, 2);
  }

  // ---- Kéora's quantum network (violet metal, cyan light)
  const KB = '#3a3550', KB2 = '#4a4466', KC = '#5ef0ff', KV = '#c060f0';
  function drawKSilo(g) {                                             // capsule silo: a ring of slots around a hatch
    kHull(g, 32, 32, 1);
    disc(g, OUT, 16, 16, 12); disc(g, '#5a5480', 16, 16, 11); ring(g, '#8a84b0', 16, 16, 11, 1);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, x = Math.round(16 + Math.cos(a) * 7), y = Math.round(16 + Math.sin(a) * 7);
      R(g, OUT, x - 2, y - 2, 4, 4); R(g, k % 2 ? KV : KC, x - 1, y - 1, 2, 2);
    }
    disc(g, OUT, 16, 16, 3); disc(g, '#2a2540', 16, 16, 2);
  }
  function drawKBooster(g, f) {                                       // magnetic coil around a pulsing core
    kHull(g, 32, 32, f);
    ring(g, OUT, 16, 16, 12, 2); ring(g, '#8a7ad8', 16, 16, 11, 2);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + f * 0.5; R(g, KC, Math.round(16 + Math.cos(a) * 10) - 1, Math.round(16 + Math.sin(a) * 10) - 1, 2, 2); }
    disc(g, OUT, 16, 16, 5); disc(g, f % 2 ? KC : '#2f8a9a', 16, 16, 4); disc(g, '#e0ffff', 16, 16, 1);
  }
  function drawKRelay(g, f) {                                         // crystal emitter on a tripod
    kHull(g, 32, 32, f);
    line(g, OUT, 6, 26, 16, 16, 2); line(g, OUT, 26, 26, 16, 16, 2); line(g, OUT, 16, 5, 16, 16, 2);
    line(g, '#8a84b0', 7, 25, 15, 17, 1); line(g, '#8a84b0', 25, 25, 17, 17, 1);
    R(g, OUT, 12, 10, 8, 12); R(g, KV, 13, 11, 6, 10); R(g, '#f0c8ff', 13, 11, 2, 6);
    R(g, f % 2 ? KC : '#ffffff', 15, 6, 2, 3);
  }
  function drawKAccu(g, f) {                                          // four cells with charge marks
    kHull(g, 32, 32, f);
    for (let k = 0; k < 4; k++) {
      const x = 5 + k * 6;
      R(g, OUT, x, 6, 5, 20); R(g, '#2a2540', x + 1, 7, 3, 18); R(g, '#8a84b0', x + 1, 5, 3, 1);
      for (let j = 0; j < 4; j++) R(g, j < 2 + (f + k) % 3 ? '#5fe0a8' : '#2a5a4a', x + 1, 22 - j * 4, 3, 3);
    }
  }
  // ---- Kéora's machines: octagonal violet hulls, crystals and cold lights (nothing like the Terre's blocks)
  const KP = '#ff6ad8', KM = '#5fe0a8', KY = '#e6d040', KA = '#c8903a', KD = '#1a1528', KL = '#8a84b0';
  /** Filled octagon: a w×h rectangle whose corners are cut by k pixels. */
  function octo(g, c, x, y, w, h, k) {
    for (let j = 0; j < h; j++) {
      const cut = j < k ? k - j : j >= h - k ? j - (h - k) + 1 : 0;
      R(g, c, x + cut, y + j, w - 2 * cut, 1);
    }
  }
  /** Kéora hull filling W×H: outline, lit rim, inner panel, a cyan light on each cut corner. */
  function kHull(g, W, H, f) {
    const k = W >= 48 ? 8 : 6;
    octo(g, OUT, 0, 0, W, H, k); octo(g, '#6a6290', 1, 1, W - 2, H - 2, k - 1); octo(g, KB2, 2, 2, W - 3, H - 3, k - 1);
    octo(g, OUT, 3, 3, W - 6, H - 6, k - 2); octo(g, KB, 4, 4, W - 8, H - 8, k - 3);
    const on = (f || 0) % 2 ? KC : '#3a8a9a';
    R(g, on, k - 2, 2, 2, 1); R(g, on, W - k, 2, 2, 1); R(g, on, k - 2, H - 3, 2, 1); R(g, on, W - k, H - 3, 2, 1);
  }
  /** Crystal (rhombus) centred on (cx, cy), half-size s. */
  function gem(g, c, cx, cy, s, hi) {
    for (let j = -s; j <= s; j++) { const w = s - Math.abs(j); R(g, OUT, cx - w - 1, cy + j, 2 * w + 3, 1); }
    for (let j = -s + 1; j <= s - 1; j++) { const w = s - Math.abs(j) - 1; if (w >= 0) R(g, c, cx - w, cy + j, 2 * w + 1, 1); }
    if (hi) R(g, hi, cx - 1, cy - s + 2, 2, 2);
  }
  function drawKDrill(g, f, heavy) {                                  // a spinning crystal bit in a well
    const W = heavy ? 48 : 32, c = W / 2, r = heavy ? 14 : 10;
    kHull(g, W, W, f);
    disc(g, OUT, c, c, r); disc(g, KD, c, c, r - 1); ring(g, KL, c, c, r - 1, 1);
    for (let k = 0; k < 4; k++) {
      const a = (f % 4) * Math.PI / 8 + k * Math.PI / 2;
      line(g, KV, Math.round(c + Math.cos(a) * 3), Math.round(c + Math.sin(a) * 3), Math.round(c + Math.cos(a) * (r - 3)), Math.round(c + Math.sin(a) * (r - 3)), heavy ? 2 : 1);
    }
    gem(g, KC, c, c, heavy ? 5 : 3, '#e0ffff');
  }
  function drawKDrillHeavy(g, f) { drawKDrill(g, f, true); }
  function drawKExtractor(g, f) {                                     // a window on the lake and a rack of cartridges
    kHull(g, 32, 32, f);
    disc(g, OUT, 16, 13, 8); disc(g, '#1f5a52', 16, 13, 7); R(g, '#5fc8b0', 11 + (f % 2) * 3, 11, 5, 1); R(g, '#5fc8b0', 14 - (f % 2) * 2, 15, 4, 1);
    for (let i = 0; i < 3; i++) { R(g, OUT, 7 + i * 6, 22, 6, 7); R(g, KM, 8 + i * 6, 23, 4, 5); R(g, '#e0fff8', 8 + i * 6, 23, 4, 1); }
  }
  function drawKWell(g, f) {                                          // a sealed shaft, amber methane rising
    kHull(g, 32, 32, f);
    disc(g, OUT, 16, 16, 9); disc(g, '#2e2210', 16, 16, 8); disc(g, KA, 16, 16, 4 + (f % 2)); R(g, '#ffe0a0', 15, 13, 2, 2);
    R(g, OUT, 4, 14, 6, 4); R(g, KL, 5, 15, 4, 2); R(g, OUT, 22, 14, 6, 4); R(g, KL, 23, 15, 4, 2);
  }
  function drawKForge(g, f) {                                         // induction coil around a white-hot core
    kHull(g, 32, 32, f);
    disc(g, OUT, 16, 16, 11); disc(g, KD, 16, 16, 10);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; R(g, (k + f) % 3 ? KC : '#2f8a9a', Math.round(16 + Math.cos(a) * 8) - 1, Math.round(16 + Math.sin(a) * 8) - 1, 2, 2); }
    disc(g, OUT, 16, 16, 5); disc(g, [KP, '#ff9ad8', '#ffd0f0'][f % 3], 16, 16, 4); disc(g, '#ffffff', 16, 16, 1);
  }
  function drawKGrower(g, f) {                                       // six glass pods, crystals growing inside
    kHull(g, 32, 32, f);
    R(g, OUT, 5, 6, 22, 20); R(g, '#1a2a3a', 6, 7, 20, 18);
    for (let k = 0; k < 6; k++) {
      const x = 8 + (k % 3) * 6, y = 9 + Math.floor(k / 3) * 8, on = (k + f) % 4 === 0;
      R(g, OUT, x - 1, y - 1, 6, 7); R(g, '#3a6a78', x, y, 4, 5);
      gem(g, on ? '#ffe0ff' : KV, x + 2, y + 3, 2);
    }
  }
  function drawKCrusher(g, f) {                                       // two toothed rollers over a slag bin
    kHull(g, 32, 32, f);
    R(g, OUT, 6, 20, 20, 7); R(g, '#3a3040', 7, 21, 18, 5); R(g, '#6a5a6a', 9, 22, 4, 2); R(g, '#c45a3c', 18, 23, 2, 1);
    [[11, 13], [21, 13]].forEach(function (c, i) {
      disc(g, OUT, c[0], c[1], 6); disc(g, KL, c[0], c[1], 5); disc(g, KB2, c[0], c[1], 2);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + (i ? -1 : 1) * f * 0.5; R(g, OUT, Math.round(c[0] + Math.cos(a) * 5), Math.round(c[1] + Math.sin(a) * 5), 1, 1); }
    });
  }
  function drawKWorkshop(g, f) {                                      // two laser heads cutting a part on a table
    kHull(g, 32, 32, f);
    R(g, OUT, 7, 9, 18, 15); R(g, '#2a2540', 8, 10, 16, 13);
    for (let y = 12; y < 22; y += 3) R(g, '#3a3060', 8, y, 16, 1);
    const tx = 11 + (f % 4) * 3, ty = 17;
    R(g, OUT, 5, 5, 5, 5); R(g, KL, 6, 6, 3, 3); R(g, OUT, 22, 5, 5, 5); R(g, KL, 23, 6, 3, 3);
    line(g, KC, 8, 9, tx, ty, 1); line(g, KP, 24, 9, tx + 1, ty, 1);
    R(g, OUT, tx - 2, ty - 1, 5, 4); R(g, '#7f9cf0', tx - 1, ty, 3, 2); R(g, '#ffffff', tx, ty, 1, 1);
  }
  function drawKPlasmaOven(g, f) {                                    // a round chamber of swirling plasma
    kHull(g, 48, 48, f);
    disc(g, OUT, 24, 24, 16); disc(g, '#2a1a40', 24, 24, 15); ring(g, KL, 24, 24, 15, 1);
    for (let k = 0; k < 14; k++) {
      const a = k * 0.9 + f * 0.7, r = 3 + (k % 5) * 2.4;
      R(g, k % 2 ? KP : KV, Math.round(24 + Math.cos(a) * r) - 1, Math.round(24 + Math.sin(a) * r) - 1, 2, 2);
    }
    disc(g, '#ffd0f0', 24, 24, 2);
    for (let i = 0; i < 3; i++) { R(g, OUT, 3, 16 + i * 6, 4, 4); R(g, KP, 4, 17 + i * 6, 2, 2); R(g, OUT, 41, 16 + i * 6, 4, 4); R(g, KP, 42, 17 + i * 6, 2, 2); }
  }
  function drawKSynth(g, f) {                                         // a grid of assembly cells lighting in turn
    kHull(g, 48, 48, f);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x = 9 + i * 10, y = 9 + j * 10, on = (i + j * 3) % 4 === f % 4;
      R(g, OUT, x, y, 9, 9); R(g, on ? KC : '#3a3060', x + 1, y + 1, 7, 7);
      gem(g, on ? '#e0ffff' : KV, x + 4, y + 4, 2);
    }
  }
  function drawKStellar(g, f) {                                       // a ring around a captive star
    kHull(g, 64, 64, f);
    disc(g, OUT, 32, 32, 24); disc(g, KD, 32, 32, 23);
    ring(g, KL, 32, 32, 21, 3); ring(g, KC, 32, 32, 18, 1);
    [[32, 8], [56, 32], [32, 56], [8, 32]].forEach(function (p) { R(g, OUT, p[0] - 4, p[1] - 4, 8, 8); R(g, KV, p[0] - 3, p[1] - 3, 6, 6); R(g, '#f0c8ff', p[0] - 3, p[1] - 3, 2, 2); });
    const r = 6 + (f % 2);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + f * 0.2; line(g, '#fff7a8', 32, 32, Math.round(32 + Math.cos(a) * (r + 5)), Math.round(32 + Math.sin(a) * (r + 5)), 1); }
    disc(g, KY, 32, 32, r); disc(g, '#ffffff', 32, 32, r - 3);
  }
  function drawKChem(g, f) {                                          // three vats joined by pipes
    kHull(g, 48, 48, f);
    line(g, OUT, 15, 17, 33, 17, 3); line(g, OUT, 15, 17, 24, 33, 3); line(g, OUT, 33, 17, 24, 33, 3);
    line(g, KL, 15, 17, 33, 17, 1); line(g, KL, 15, 17, 24, 33, 1); line(g, KL, 33, 17, 24, 33, 1);
    [[15, 17, KM], [33, 17, KA], [24, 33, KC]].forEach(function (v, i) {
      disc(g, OUT, v[0], v[1], 7); disc(g, v[2], v[0], v[1], 6); disc(g, shade(v[2], -0.35), v[0], v[1] + 2, 3);
      R(g, '#ffffff', v[0] - 2 + ((f + i) % 3), v[1] - 3, 1, 1);
    });
  }
  function drawKGen(g, f) {                                           // a sulfur burner between two radiators
    kHull(g, 32, 32, f);
    for (let y = 8; y < 24; y += 3) { R(g, OUT, 5, y, 5, 2); R(g, KL, 6, y, 3, 1); R(g, OUT, 22, y, 5, 2); R(g, KL, 23, y, 3, 1); }
    disc(g, OUT, 16, 16, 7); disc(g, '#3a2a10', 16, 16, 6); disc(g, [KY, '#fff7a8', '#ffb347'][f % 3], 16, 16, 3); R(g, '#ffffff', 16, 15, 1, 1);
  }
  function drawKTurbine(g, f) {                                       // a big fan and an amber exhaust
    kHull(g, 48, 48, f);
    disc(g, OUT, 22, 24, 15); disc(g, KD, 22, 24, 14); ring(g, KL, 22, 24, 14, 1);
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + f * Math.PI / 6; line(g, KL, 22, 24, Math.round(22 + Math.cos(a) * 12), Math.round(24 + Math.sin(a) * 12), 3); }
    disc(g, OUT, 22, 24, 4); disc(g, KA, 22, 24, 3);
    R(g, OUT, 38, 14, 7, 20); R(g, '#5a3a10', 39, 15, 5, 18); R(g, [KA, '#ffe0a0', KA][f % 3], 40, 16 + (f % 3) * 4, 3, 4);
  }
  function drawKCollector(g) {                                        // four crystal facets around a lens
    kHull(g, 32, 32, 1);
    const tri = function (x0, y0, dx, dy, c) { for (let i = 0; i < 11; i++) R(g, c, dx > 0 ? x0 : x0 - i, y0 + dy * i, i + 1, 1); };
    tri(6, 6, 1, 1, KV); tri(26, 6, -1, 1, '#8a5ad8'); tri(6, 26, 1, -1, '#8a5ad8'); tri(26, 26, -1, -1, KV);
    gem(g, KC, 16, 16, 5, '#e0ffff');
  }
  function drawKLab(g, f) {                                           // a glass dome with a floating crystal
    kHull(g, 32, 32, f);
    disc(g, OUT, 16, 16, 11); disc(g, '#3a6a78', 16, 16, 10); disc(g, '#5a9aa8', 15, 15, 8); R(g, '#e0ffff', 10, 9, 4, 2);
    gem(g, KV, 16, 17 - (f % 2), 4, '#f0c8ff');
    for (let k = 0; k < 4; k++) R(g, (k + f) % 4 ? '#2f8a9a' : KC, 7 + k * 6, 27, 2, 2);
  }
  function drawKSeller(g) {                                           // an exchange screen and a coin slot
    kHull(g, 32, 32, 1);
    R(g, OUT, 6, 6, 20, 12); R(g, '#2a2540', 7, 7, 18, 10);
    R(g, KM, 9, 13, 3, 3); R(g, KM, 13, 11, 3, 5); R(g, KM, 17, 9, 3, 7); R(g, KC, 21, 8, 2, 8);
    disc(g, OUT, 16, 23, 4); disc(g, KY, 16, 23, 3); R(g, '#8a6a10', 15, 22, 2, 3);
  }
  function drawKPort(g, f) {                                          // the Spatioport: a landing ring of lights
    kHull(g, 64, 64, f);
    disc(g, OUT, 32, 32, 25); disc(g, '#2a2540', 32, 32, 24);
    ring(g, KC, 32, 32, 21, 1); ring(g, KV, 32, 32, 15, 1);
    line(g, '#3a3060', 32, 9, 32, 55, 2); line(g, '#3a3060', 9, 32, 55, 32, 2);
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; R(g, (k + f) % 2 ? '#ffffff' : KC, Math.round(32 + Math.cos(a) * 18) - 1, Math.round(32 + Math.sin(a) * 18) - 1, 2, 2); }
    gem(g, KV, 32, 32, 8, '#f0c8ff'); gem(g, KC, 32, 32, 4);
  }
  /** Prism (1×1, drawn facing East): a crystal that turns the beam towards its point. */
  function drawKPrism(g) {
    octo(g, OUT, 1, 1, 14, 14, 3); octo(g, KB2, 2, 2, 12, 12, 2);
    for (let i = 0; i < 9; i++) { const h = 9 - i; R(g, OUT, 4 + i, 8 - (h >> 1) - 1, 1, h + 2); }
    for (let i = 0; i < 8; i++) { const h = 8 - i; R(g, i < 3 ? '#f0c8ff' : KV, 4 + i, 8 - (h >> 1), 1, h); }
    R(g, KC, 12, 7, 2, 2);
  }
  /** Diffractor (1×1, facing East): a crystal with three points (front, left, right). */
  function drawKSplit(g) {
    octo(g, OUT, 1, 1, 14, 14, 3); octo(g, KB2, 2, 2, 12, 12, 2);
    gem(g, KV, 8, 8, 4, '#f0c8ff');
    R(g, KC, 12, 7, 2, 2); R(g, KC, 7, 2, 2, 2); R(g, KC, 7, 12, 2, 2);
  }
  /** Tube of the quantum network: a hub and an arm towards each connected side; `glow` 0 idle, 1 busy. */
  function tubeSprite(mask, glow) {
    const key = 'k' + mask + ':' + glow;
    if (cache[key]) return cache[key];
    const c = mk(T, T), g = c.getContext('2d'), core = glow ? KC : '#3a6a78';
    if (mask & 1) { R(g, OUT, 8, 4, 8, 8); R(g, KB2, 8, 5, 8, 6); R(g, core, 8, 7, 8, 2); }
    if (mask & 2) { R(g, OUT, 4, 8, 8, 8); R(g, KB2, 5, 8, 6, 8); R(g, core, 7, 8, 2, 8); }
    if (mask & 4) { R(g, OUT, 0, 4, 8, 8); R(g, KB2, 0, 5, 8, 6); R(g, core, 0, 7, 8, 2); }
    if (mask & 8) { R(g, OUT, 4, 0, 8, 8); R(g, KB2, 5, 0, 6, 8); R(g, core, 7, 0, 2, 8); }
    R(g, OUT, 3, 3, 10, 10); R(g, '#5a5480', 4, 4, 8, 8); R(g, '#8a84b0', 4, 4, 8, 1);
    R(g, glow ? '#e0ffff' : core, 6, 6, 4, 4);
    return (cache[key] = c);
  }

  const BIG = { k_silo: [2, drawKSilo], k_booster: [2, drawKBooster], k_relay: [2, drawKRelay], k_accu: [2, drawKAccu],
    k_grower: [2, drawKGrower], k_crusher: [2, drawKCrusher], k_drill: [2, drawKDrill], k_drill_heavy: [3, drawKDrillHeavy], k_extractor: [2, drawKExtractor], k_well: [2, drawKWell], k_forge: [2, drawKForge],
    k_workshop: [2, drawKWorkshop], k_plasma_oven: [3, drawKPlasmaOven], k_synth: [3, drawKSynth], k_stellar: [4, drawKStellar], k_chem: [3, drawKChem],
    k_gen: [2, drawKGen], k_turbine: [3, drawKTurbine], k_collector: [2, drawKCollector], k_lab: [2, drawKLab], k_seller: [2, drawKSeller], k_port: [4, drawKPort],
    launch_pad: [4, drawLaunchPad], drone_hub: [2, drawDroneHub], pump: [2, drawPump], oil_well: [2, drawOilWell], fluid_tank: [2, drawFluidTank], steam_plant: [3, drawSteamPlant], refinery: [3, drawRefinery],
    generator: [2, drawGenerator], solar_plant: [2, drawSolarPlant], drill: [2, drawDrill], drill_heavy: [3, drawDrill], smelter: [2, drawSmelter], assembler: [2, drawAssembler],
    steelmill: [3, drawSteelmill], fabricator: [3, drawFabricator], spaceyard: [4, drawSpaceyard], lab: [2, drawLab], seller: [2, drawSeller], port: [4, drawPort], driver: [2, drawDriver] };
  const SMALL = { splitter: drawSplitter, merger: drawMerger, chest: drawChest, underground_in: drawTunnelIn, underground_out: drawTunnelOut,
    overflow: drawOverflow, underflow: drawUnderflow, junction: drawJunction, sorter_inv: drawSorterInv, unloader: drawUnloader,
    pole: drawPole, pylon: drawPylon, drone_provider: drawDroneProvider, drone_requester: drawDroneRequester, k_prism: drawKPrism, k_split: drawKSplit };

  function buildingSprite(type, dir, f) {
    const def = BUILDINGS[type];
    if (def.kind === 'belt') return beltSprite(def.tier || 0, dir, 0, f | 0);
    if (def.kind === 'pipe') return pipeSprite(dir & 1 ? 10 : 5, null);     // palette / ghost: a straight piece
    if (def.kind === 'ktube') return tubeSprite(5, 0);
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
  // The two palettes come from the planet (CO.PLANETS[].ground: basalt then sand on the Terre).
  function floorTile(g, px, py, x, y, seed) {
    const n = CO.vnoise(x * 0.06, y * 0.06, seed + 5), ground = CO.planet(CO.world.planet).ground;
    const pal = n > 0.55 ? ground[1] : ground[0];
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
    if (CO.isFluidOre(id)) {                                          // lake / oil pool: flat liquid with ripples
      const pool = ITEMS[CO.ORE_IDS[id]].pool;
      R(g, pool[0], px, py, T, T);
      const hi = pool[1];
      for (let k = 0; k < 2; k++) {
        const bx = px + 1 + Math.floor(CO.hash2(x, y, seed + 70 + k) * 10), by = py + 2 + Math.floor(CO.hash2(x, y, seed + 80 + k) * 11);
        R(g, hi, bx, by, 4, 1);
      }
      return;
    }
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
  /** Ground + ore of an n×n-tile chunk whose top-left tile is (tx, ty) (the map is too big for one canvas). */
  function terrainChunk(tx, ty, n) {
    const W = CO.MAP_W, H = CO.MAP_H, world = CO.world, seed = world.seed;
    const c = mk(n * T, n * T), g = c.getContext('2d');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = tx + i, y = ty + j;
      if (x >= W || y >= H) continue;
      floorTile(g, i * T, j * T, x, y, seed);
      const ore = world.ore[y * W + x];
      if (ore) oreTile(g, i * T, j * T, ore, x, y, seed);
    }
    return c;
  }

  /** Pipe tile: a hub and an arm towards each connected side (mask bits: 1 E, 2 S, 4 W, 8 N); the hub shows the fluid. */
  function pipeSprite(mask, fluid) {
    const key = 'p' + mask + (fluid || '');
    if (cache[key]) return cache[key];
    const c = mk(T, T), g = c.getContext('2d');
    if (mask & 1) { R(g, OUT, 8, 4, 8, 8); R(g, M2, 8, 5, 8, 6); R(g, M3, 8, 5, 8, 1); R(g, M0, 14, 4, 1, 8); }
    if (mask & 2) { R(g, OUT, 4, 8, 8, 8); R(g, M2, 5, 8, 6, 8); R(g, M3, 5, 8, 1, 8); R(g, M0, 4, 14, 8, 1); }
    if (mask & 4) { R(g, OUT, 0, 4, 8, 8); R(g, M2, 0, 5, 8, 6); R(g, M3, 0, 5, 8, 1); R(g, M0, 1, 4, 1, 8); }
    if (mask & 8) { R(g, OUT, 4, 0, 8, 8); R(g, M2, 5, 0, 6, 8); R(g, M3, 5, 0, 1, 8); R(g, M0, 4, 1, 8, 1); }
    R(g, OUT, 3, 3, 10, 10); R(g, M1, 4, 4, 8, 8); R(g, M3, 4, 4, 8, 1);
    R(g, fluid ? ITEMS[fluid].color : '#2a2b31', 6, 6, 4, 4);
    return (cache[key] = c);
  }

  CO.sprites = { item: itemIcon, belt: beltSprite, building: buildingSprite, terrainChunk: terrainChunk, barrel: barrelSprite, pipe: pipeSprite, tube: tubeSprite,
    frames: { k_grower: 4, k_crusher: 4, k_booster: 2, k_relay: 2, k_accu: 3, k_drill: 4, k_drill_heavy: 4, k_extractor: 2, k_well: 2, k_forge: 3, k_workshop: 4, k_plasma_oven: 3,
      k_synth: 4, k_stellar: 2, k_chem: 3, k_gen: 3, k_turbine: 3, k_lab: 4, k_port: 2, launch_pad: 2, drone_hub: 2, pump: 2, oil_well: 2, steam_plant: 3, refinery: 3, generator: 3, drill: 4, drill_heavy: 4, smelter: 3, assembler: 4, steelmill: 3, fabricator: 4, spaceyard: 4, lab: 4, port: 2 } };
})(window.CO = window.CO || {});
