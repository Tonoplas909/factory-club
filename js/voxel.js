/*
 * voxel.js — "3D pixel" art for the isometric view.
 *
 * Every model is a handful of boxes on a grid of 8 voxels per tile. A model is rasterised once (per
 * direction and animation frame) into a small canvas where each voxel is a 4×4-pixel cube: light top,
 * medium left side, dark right side, a faint per-voxel jitter for texture and a dark outline around the
 * whole silhouette. The renderer then scales those canvases crisply (32 px per tile at zoom 1).
 *
 * Voxel point (x, y, z) lands on canvas pixel (2(x − y) + ox, (x + y) − 2z + oy): x goes down-right,
 * y down-left, z up. Models are written facing East (output on the x = n − 1 side) and rotated.
 *
 *   CO.voxel.building(type, dir, frame)   {c, ox, oy, buf, w, h, top}   (top = height in tiles)
 *   CO.voxel.belt(tier, dir, shape, frame)
 *   CO.voxel.item(id)                     small cube of an item colour
 *   CO.voxel.worker(dir, flame)           tiny astronaut
 *   CO.voxel.chunk(cx, cy, n)             ground + ore of an n×n-tile chunk
 */
(function (CO) {
  'use strict';
  const VT = 8, ITEMS = CO.ITEMS, BUILDINGS = CO.BUILDINGS;
  const V = CO.voxel = { VT: VT };

  // --------------------------------------------------------------- palette
  const OUT = '#1f1f25';
  const M0 = '#45464f', M1 = '#5f616c', M2 = '#868895', M3 = '#b4b6c0', WHITE = '#dcdde4';
  const DARK = '#2b2c33';
  const ACC = '#ffd37f', ACC_D = '#d9a24a';
  const HOT = ['#ff7a3a', '#ff9d5c', '#ffbd7a', '#ff9d5c'];
  const GLASS = '#8fdcec';

  const rgbCache = new Map();
  function rgb(hex) {
    let v = rgbCache.get(hex);
    if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v); }
    return v;
  }
  function px(c, f) {                                   // packed ABGR (little-endian ImageData)
    const r = Math.min(255, Math.max(0, Math.round(c[0] * f))), g = Math.min(255, Math.max(0, Math.round(c[1] * f))),
      b = Math.min(255, Math.max(0, Math.round(c[2] * f)));
    return (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  }
  const OUTPX = px(rgb(OUT), 1);
  function jit(x, y, z) {                               // small deterministic brightness jitter per voxel
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return 0.95 + ((h >>> 0) % 1000) / 1000 * 0.1;
  }

  // ------------------------------------------------------------- model
  /** A voxel model on an nx × ny footprint (voxels). */
  function Model(nx, ny) { this.nx = nx; this.ny = ny || nx; this.m = new Map(); }
  function key(x, y, z) { return ((z + 8) * 1024 + (y + 8)) * 1024 + (x + 8); }
  Model.prototype.set = function (x, y, z, c) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny) return;
    if (c) this.m.set(key(x, y, z), c); else this.m.delete(key(x, y, z));
  };
  Model.prototype.box = function (x, y, z, w, d, h, c) {
    for (let k = z; k < z + h; k++) for (let j = y; j < y + d; j++) for (let i = x; i < x + w; i++) this.set(i, j, k, c);
    return this;
  };
  /** Vertical cylinder centred on (cx, cy) (voxel coordinates, may be fractional). */
  Model.prototype.cyl = function (cx, cy, z, r, h, c) {
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) for (let k = z; k < z + h; k++) this.set(i, j, k, c);
    }
    return this;
  };
  /** Rotate the model by `dir` quarter turns (0 = facing East). Only for square footprints. */
  function rotated(m, dir) {
    if (!dir) return m;
    const n = m.nx, r = new Model(n, n);
    m.m.forEach(function (c, k) {
      const x = k % 1024 - 8, y = Math.floor(k / 1024) % 1024 - 8, z = Math.floor(k / 1048576) - 8;
      let nx = x, ny = y;
      if (dir === 1) { nx = n - 1 - y; ny = x; }
      else if (dir === 2) { nx = n - 1 - x; ny = n - 1 - y; }
      else if (dir === 3) { nx = y; ny = n - 1 - x; }
      r.set(nx, ny, z, c);
    });
    return r;
  }

  // ---------------------------------------------------------- rasterise
  /**
   * Paint the voxels of `m` into a new canvas. Faces hidden by a neighbour are skipped; voxels are
   * painted back to front (x + y + z), which is exact for this projection.
   */
  function raster(m, opts) {
    opts = opts || {};
    const list = [];
    let zmax = 1, zmin = 0;
    m.m.forEach(function (c, k) {
      const x = k % 1024 - 8, y = Math.floor(k / 1024) % 1024 - 8, z = Math.floor(k / 1048576) - 8;
      const top = !m.m.has(key(x, y, z + 1)), right = !m.m.has(key(x + 1, y, z)), left = !m.m.has(key(x, y + 1, z));
      if (!top && !right && !left) return;
      list.push([x + y + z, x, y, z, c]);
      if (z + 1 > zmax) zmax = z + 1;
      if (z < zmin) zmin = z;
    });
    list.sort(function (a, b) { return a[0] - b[0] || a[3] - b[3]; });
    const nx = m.nx, ny = m.ny;
    const ox = 2 * ny + 1, oy = 2 * zmax + 1;
    const w = 2 * nx + 2 * ny + 2, h = nx + ny - 2 * zmin + oy + 2;
    const buf = new Uint32Array(w * h);
    for (let i = 0; i < list.length; i++) paintVoxel(buf, w, list[i][1], list[i][2], list[i][3], list[i][4], ox, oy, opts.light);
    if (opts.outline !== false) outline(buf, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), id = g.createImageData(w, h);
    new Uint32Array(id.data.buffer).set(buf);
    g.putImageData(id, 0, 0);
    return { c: c, ox: ox, oy: oy, buf: buf, w: w, h: h, top: zmax / VT };
  }
  /** One 4×4 cube: rows ".TT." "TTTT" "LLRR" ".LR." (T top, L the +y side, R the +x side). */
  function paintVoxel(buf, w, x, y, z, col, ox, oy, light) {
    const c = rgb(col), j = jit(x, y, z) * (light || 1);
    const ao = z === 0 ? 0.88 : 1;                      // a touch darker where it meets the ground
    const T = px(c, 1.04 * j), L = px(c, 0.8 * j * ao), R = px(c, 0.62 * j * ao);
    const X = 2 * (x - y) - 2 + ox, Y = (x + y) - 2 * z - 2 + oy;
    let o = Y * w + X;
    buf[o + 1] = T; buf[o + 2] = T;
    o += w; buf[o] = T; buf[o + 1] = T; buf[o + 2] = T; buf[o + 3] = T;
    o += w; buf[o] = L; buf[o + 1] = L; buf[o + 2] = R; buf[o + 3] = R;
    o += w; buf[o + 1] = L; buf[o + 2] = R;
  }
  function outline(buf, w, h) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x;
      if (buf[o]) continue;
      if ((x > 0 && buf[o - 1] && buf[o - 1] !== OUTPX) || (x < w - 1 && buf[o + 1] && buf[o + 1] !== OUTPX) ||
        (y > 0 && buf[o - w] && buf[o - w] !== OUTPX) || (y < h - 1 && buf[o + w] && buf[o + w] !== OUTPX)) add.push(o);
    }
    for (let i = 0; i < add.length; i++) buf[add[i]] = OUTPX;
  }

  // -------------------------------------------------------- building kit
  /** Plinth common to every machine: dark base with a lighter rim. */
  function plinth(m, n, h) {
    m.box(0, 0, 0, n, n, 1, M0);
    m.box(1, 1, 1, n - 2, n - 2, (h || 2) - 1, M1);
    return m;
  }
  function hazard(m, x, y, z, w, d) {                     // yellow/dark stripes on a top surface
    for (let j = y; j < y + d; j++) for (let i = x; i < x + w; i++) m.set(i, j, z, ((i + j) >> 1) % 2 ? ACC : DARK);
  }
  /** Output marker: a yellow lip on the East face. */
  function lip(m, n, z) { m.box(n - 1, (n >> 1) - 2, z, 1, 4, 1, ACC); }

  const MODELS = {
    drill: function (f, heavy) {
      const n = heavy ? 24 : 16, m = new Model(n), c = n / 2;
      plinth(m, n, 2);
      m.box(2, 2, 2, n - 4, n - 4, heavy ? 6 : 5, M2);
      for (const p of [[1, 1], [n - 4, 1], [1, n - 4], [n - 4, n - 4]]) m.box(p[0], p[1], 2, 3, 3, heavy ? 10 : 8, M1).box(p[0], p[1], heavy ? 12 : 10, 3, 3, 1, ACC);
      const zt = heavy ? 8 : 7;
      m.cyl(c, c, zt, heavy ? 6 : 4, 1, DARK);
      // rotating rotor: a cross that turns 45° every other frame
      const r = heavy ? 6 : 4, diag = f % 2;
      for (let k = -r; k < r; k++) {
        if (!diag) { m.set(c + k, c - 1, zt + 1, ACC); m.set(c + k, c, zt + 1, ACC); m.set(c - 1, c + k, zt + 1, ACC_D); m.set(c, c + k, zt + 1, ACC_D); }
        else { m.set(c + k, c + k, zt + 1, ACC); m.set(c + k, c - 1 - k, zt + 1, ACC_D); }
      }
      m.box(c - 1, c - 1, zt + 1, 2, 2, heavy ? 4 : 3, M3);
      lip(m, n, 2);
      return m;
    },
    smelter: function (f) {
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 7, '#6b5a52').box(2, 2, 9, 12, 12, 1, M1);
      for (let j = 2; j < 14; j += 3) m.box(2, j, 5, 12, 1, 1, '#5a4a44');      // brick courses
      m.box(13, 5, 2, 2, 6, 5, DARK).box(14, 6, 3, 1, 4, 3, HOT[f % 4]);       // glowing mouth on the output side
      m.box(3, 3, 10, 3, 3, 6, M0).box(3, 3, 16, 3, 3, 1, DARK);                // chimney
      m.box(8, 8, 10, 4, 4, 1, HOT[(f + 1) % 4]);
      return m;
    },
    assembler: function (f) {
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 5, M2).box(3, 3, 7, 10, 10, 1, M1);
      hazard(m, 2, 2, 6, 12, 1);
      const ax = 4 + (f % 4) * 2;                                               // crane head sliding back and forth
      m.box(3, 7, 8, 10, 2, 1, M3).box(ax, 6, 8, 3, 4, 3, ACC).box(ax + 1, 7, 6, 1, 2, 2, DARK);
      m.box(3, 3, 8, 2, 2, 4, M0).box(11, 3, 8, 2, 2, 4, M0);
      lip(m, n, 2);
      return m;
    },
    steelmill: function (f) {
      const n = 24, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 20, 20, 9, '#5d4f49').box(2, 2, 11, 20, 20, 1, M1);
      for (let j = 3; j < 22; j += 4) m.box(2, j, 6, 20, 1, 1, '#4c403b');
      m.box(21, 8, 2, 2, 8, 6, DARK).box(22, 9, 3, 1, 6, 4, HOT[f % 4]);
      m.box(4, 4, 12, 4, 4, 9, M0).box(4, 4, 21, 4, 4, 1, DARK);
      m.box(4, 15, 12, 4, 4, 7, M0).box(4, 15, 19, 4, 4, 1, DARK);
      m.box(12, 9, 12, 6, 6, 2, HOT[(f + 2) % 4]);
      return m;
    },
    fabricator: function (f) {
      const n = 24, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 20, 20, 6, M2).box(3, 3, 8, 18, 18, 2, M1);
      m.cyl(12, 12, 10, 7, 2, M3).cyl(12, 12, 12, 5, 2, M2).cyl(12, 12, 14, 3, 2, GLASS);
      for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; m.set(Math.round(12 + Math.cos(t) * 6.5 - 0.5), Math.round(12 + Math.sin(t) * 6.5 - 0.5), 12, a % 4 === f % 4 ? ACC : ACC_D); }
      hazard(m, 2, 2, 7, 20, 1);
      lip(m, n, 2);
      return m;
    },
    spaceyard: function (f) {
      const n = 32, m = new Model(n);
      m.box(0, 0, 0, n, n, 1, M0).box(1, 1, 1, n - 2, n - 2, 2, M1);
      hazard(m, 1, 1, 2, n - 2, 1); hazard(m, 1, n - 2, 2, n - 2, 1);
      for (const p of [[2, 2], [n - 5, 2], [2, n - 5], [n - 5, n - 5]]) m.box(p[0], p[1], 3, 3, 3, 20, M2).box(p[0], p[1], 23, 3, 3, 1, f % 2 ? ACC : '#e55454');
      m.box(2, 2, 22, n - 4, 2, 1, M0).box(2, n - 4, 22, n - 4, 2, 1, M0);
      // the rocket being assembled
      m.cyl(16, 16, 3, 5, 3, M1).cyl(16, 16, 6, 4, 12, WHITE).cyl(16, 16, 18, 3, 3, WHITE).cyl(16, 16, 21, 2, 2, ACC);
      m.cyl(16, 16, 11, 4.2, 1, ACC_D);
      for (const p of [[10, 15], [21, 15], [15, 10], [15, 21]]) m.box(p[0], p[1], 3, 2, 2, 5, '#e55454');
      lip(m, n, 3);
      return m;
    },
    lab: function (f) {
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 6, WHITE).box(2, 2, 8, 12, 12, 1, M2);
      m.cyl(8, 8, 9, 4.5, 2, GLASS).cyl(8, 8, 11, 3, 2, GLASS).cyl(8, 8, 13, 1.5, 1, '#c8f4ff');
      const lights = ['#84f491', ACC, GLASS, '#84f491'];
      m.box(3, 13, 4, 2, 1, 2, lights[f % 4]).box(11, 13, 4, 2, 1, 2, lights[(f + 2) % 4]);
      m.box(13, 3, 4, 1, 2, 2, lights[(f + 1) % 4]).box(13, 11, 4, 1, 2, 2, lights[(f + 3) % 4]);
      return m;
    },
    seller: function () {
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 3, M2).box(3, 3, 5, 10, 10, 1, DARK);
      m.cyl(8, 8, 6, 4, 2, ACC).cyl(8, 8, 8, 3, 1, '#ffe2a6');
      m.box(7, 6, 8, 2, 4, 1, ACC_D);
      return m;
    },
    port: function (f) {
      const n = 32, m = new Model(n);
      m.box(0, 0, 0, n, n, 2, M0).box(2, 2, 2, n - 4, n - 4, 1, M1);
      hazard(m, 2, 2, 3, n - 4, 2); hazard(m, 2, n - 4, 3, n - 4, 2); hazard(m, 2, 2, 3, 2, n - 4); hazard(m, n - 4, 2, 3, 2, n - 4);
      m.cyl(16, 16, 3, 10, 1, DARK).cyl(16, 16, 3, 8.5, 1, M1);
      // a big yellow "H" (seen from the camera the letter reads diagonally, like a helipad)
      m.box(11, 10, 3, 3, 12, 1, ACC).box(18, 10, 3, 3, 12, 1, ACC).box(14, 15, 3, 4, 2, 1, ACC);
      for (const p of [[1, 1], [n - 3, 1], [1, n - 3], [n - 3, n - 3]]) m.box(p[0], p[1], 2, 2, 2, 3, f % 2 ? ACC : '#e55454');
      return m;
    },
    splitter: function () {
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 3, M1).box(2, 2, 4, 4, 4, 1, M2);
      m.box(5, 3, 4, 2, 2, 1, ACC).box(3, 1, 4, 2, 1, 1, ACC_D).box(3, 6, 4, 2, 1, 1, ACC_D);
      return m;
    },
    merger: function () {
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 3, M1).box(2, 2, 4, 4, 4, 1, M2);
      m.box(5, 3, 4, 2, 2, 1, ACC).box(1, 3, 4, 1, 2, 1, ACC_D);
      return m;
    },
    underground_in: function () {                         // a ramp diving down towards its output side
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0);
      for (let i = 0; i < 8; i++) m.box(i, 1, 1, 1, 6, Math.max(1, 5 - (i >> 1)), M1);
      m.box(6, 2, 1, 2, 4, 2, DARK).box(0, 1, 1, 1, 6, 1, ACC_D);
      return m;
    },
    underground_out: function () {                        // the same ramp, rising
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0);
      for (let i = 0; i < 8; i++) m.box(i, 1, 1, 1, 6, Math.max(1, 2 + (i >> 1)), M1);
      m.box(0, 2, 1, 2, 4, 2, DARK).box(7, 1, 1, 1, 6, 1, ACC);
      return m;
    },
    overflow: function () {                               // front first: big yellow nose, grey side vents
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 3, M1).box(2, 2, 4, 4, 4, 1, M2);
      m.box(5, 2, 4, 2, 4, 1, ACC).box(3, 1, 4, 2, 1, 1, M3).box(3, 6, 4, 2, 1, 1, M3);
      return m;
    },
    underflow: function () {                              // the sides first: yellow side vents, grey nose
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 3, M1).box(2, 2, 4, 4, 4, 1, M2);
      m.box(5, 3, 4, 2, 2, 1, M3).box(2, 1, 4, 4, 1, 1, ACC).box(2, 6, 4, 4, 1, 1, ACC);
      return m;
    },
    junction: function () {                               // a low cross of two tracks
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0);
      m.box(0, 2, 1, 8, 4, 1, DARK).box(2, 0, 1, 4, 8, 1, DARK);
      m.box(0, 1, 1, 2, 1, 2, M2).box(6, 1, 1, 2, 1, 2, M2).box(0, 6, 1, 2, 1, 2, M2).box(6, 6, 1, 2, 1, 2, M2);
      m.box(3, 3, 1, 2, 2, 1, ACC);
      return m;
    },
    sorter_inv: function () {
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 3, '#5a5c68').box(2, 2, 4, 4, 4, 1, M3);
      m.box(3, 1, 4, 2, 1, 1, ACC).box(3, 6, 4, 2, 1, 1, ACC).box(5, 3, 4, 2, 2, 1, M2).set(3, 3, 5, '#e55454');
      return m;
    },
    unloader: function () {                               // squat pump with claws on three sides and a front spout
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 4, '#6a6d78').box(2, 2, 5, 4, 4, 1, ACC_D);
      m.box(0, 1, 1, 1, 2, 2, M3).box(0, 5, 1, 1, 2, 2, M3).box(3, 0, 1, 2, 1, 2, M3).box(3, 7, 1, 2, 1, 2, M3);
      m.box(7, 3, 1, 1, 2, 3, ACC);
      return m;
    },
    chest: function () {
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0).box(1, 1, 1, 6, 6, 5, '#7a6a52').box(1, 1, 6, 6, 6, 1, '#8c7b60');
      m.box(1, 3, 1, 6, 2, 6, ACC_D).box(7, 3, 2, 1, 2, 2, ACC);
      return m;
    },
    driver: function () {                                 // the base and turret ring (the barrel is drawn aimed)
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 2, M2);
      hazard(m, 2, 2, 3, 12, 1); hazard(m, 2, 13, 3, 12, 1);
      m.cyl(8, 8, 4, 5, 1, M1).cyl(8, 8, 5, 3.5, 1, DARK);
      return m;
    }
  };
  V.frames = { drill: 2, drill_heavy: 2, smelter: 4, assembler: 4, steelmill: 4, fabricator: 4, spaceyard: 2, lab: 4, port: 2 };

  const cache = new Map();
  V.building = function (type, dir, frame) {
    const nf = V.frames[type] || 1, f = (frame || 0) % nf, d = BUILDINGS[type].fixed ? 0 : dir || 0;
    const k = 'b' + type + d + ':' + f;
    let s = cache.get(k);
    if (!s) {
      const fn = type === 'drill_heavy' ? function (fr) { return MODELS.drill(fr, true); } : MODELS[type];
      s = raster(rotated(fn(f), d));
      cache.set(k, s);
    }
    return s;
  };
  /** Belt piece: bed, side rails on the closed sides and chevrons sliding towards the output. */
  V.belt = function (tier, dir, shape, frame) {
    const k = 'L' + tier + dir + shape + ':' + frame;
    let s = cache.get(k);
    if (!s) {
      const m = new Model(8), rail = ['#868895', '#7d8fb3', '#c9a24a'][tier], chev = ['#7a7c88', '#9fb2ee', '#e8c070'][tier];
      m.box(0, 0, 0, 8, 8, 1, DARK);
      for (let y = 1; y < 7; y++) for (let x = 0; x < 8; x++) {          // chevrons ">" sliding one voxel per frame
        if (((x + Math.floor(Math.abs(y - 3.5)) - frame) % 4 + 4) % 4 === 0) m.set(x, y, 0, chev);
      }
      // closed sides get a rail: straight → y = 0 and y = 7; corner fed from y = 0 (shape 1) or y = 7 (shape 2)
      if (shape !== 1) m.box(0, 0, 1, 8, 1, 1, rail);
      if (shape !== 2) m.box(0, 7, 1, 8, 1, 1, rail);
      if (shape) m.box(0, 0, 1, 1, 8, 1, rail);
      s = raster(rotated(m, dir));
      cache.set(k, s);
    }
    return s;
  };
  V.item = function (id) {
    const k = 'i' + id;
    let s = cache.get(k);
    if (!s) {
      const it = ITEMS[id], m = new Model(3);
      m.box(0, 0, 0, 3, 3, 2, it.color).set(1, 1, 2, it.accent || it.color);
      m.set(0, 0, 2, it.color); m.set(2, 2, 2, it.color);
      s = raster(m);
      cache.set(k, s);
    }
    return s;
  };
  /** Tiny astronaut (3×3 voxels, 9 tall) facing `dir`; flame 0 = none, 1/2 = jetpack flicker. */
  V.worker = function (dir, flame) {
    const k = 'w' + dir + ':' + flame;
    let s = cache.get(k);
    if (!s) {
      const m = new Model(4);
      m.set(1, 1, 0, M2); m.set(1, 2, 0, M2);                                 // legs
      m.box(1, 1, 1, 2, 2, 2, M3);                                            // suit
      m.box(0, 1, 1, 1, 2, 2, M1);                                            // jetpack (behind)
      m.box(1, 1, 3, 2, 2, 2, WHITE).box(2, 1, 4, 1, 2, 1, ACC);               // helmet + visor
      if (flame) m.box(0, 1, 0, 1, 2, 1, flame === 1 ? '#ffb347' : '#fff0c8');
      s = raster(rotated(m, dir));
      cache.set(k, s);
    }
    return s;
  };

  // --------------------------------------------------------------- ground
  const BASALT = ['#34343b', '#313138', '#37373e'], SAND = ['#433f3b', '#403c38', '#46423d'];
  /**
   * Ground of an n×n-tile chunk whose back corner is tile (tx, ty): one flat layer of floor voxels
   * (tile edges a shade darker, so the grid reads) with ore rocks and the odd boulder lying on it.
   */
  V.chunk = function (tx, ty, n) {
    const world = CO.world, seed = world.seed, W = CO.MAP_W, H = CO.MAP_H;
    const N = n * VT, zmax = 3;
    const ox = 2 * N + 1, oy = 2 * zmax + 1, w = 4 * N + 2, h = 2 * N + oy + 4;
    const buf = new Uint32Array(w * h);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = tx + (x >> 3), gy = ty + (y >> 3);
      if (gx >= W || gy >= H) continue;
      const pal = CO.vnoise(gx * 0.06, gy * 0.06, seed + 5) > 0.55 ? SAND : BASALT;
      const base = pal[Math.floor(CO.hash2(gx, gy, seed) * 3)];
      const edge = (x & 7) === 0 || (y & 7) === 0;
      paintVoxel(buf, w, x, y, -1, edge ? CO.shade(base, -0.1) : base, ox, oy);
    }
    const m = new Model(N);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = tx + i, gy = ty + j;
      if (gx >= W || gy >= H) continue;
      const ore = world.ore[gy * W + gx];
      if (ore) {
        const it = ITEMS[CO.ORE_IDS[ore]], k = 2 + Math.floor(CO.hash2(gx, gy, seed + 31) * 3);
        for (let r = 0; r < k; r++) {
          const rx = i * 8 + 1 + Math.floor(CO.hash2(gx, gy, seed + r * 3) * 5), ry = j * 8 + 1 + Math.floor(CO.hash2(gx, gy, seed + r * 3 + 1) * 5);
          const tall = CO.hash2(gx, gy, seed + r * 7 + 2) > 0.6 ? 2 : 1;
          m.box(rx, ry, 0, 2, 2, tall, it.color);
          m.set(rx, ry, tall, CO.hash2(gx, gy, seed + r * 11) > 0.5 ? it.accent || it.color : null);
        }
      } else if (CO.hash2(gx, gy, seed + 99) > 0.93) {
        const rx = i * 8 + 2 + Math.floor(CO.hash2(gx, gy, seed + 7) * 3), ry = j * 8 + 2 + Math.floor(CO.hash2(gx, gy, seed + 8) * 3);
        m.box(rx, ry, 0, 2 + (CO.hash2(gx, gy, seed + 9) > 0.5 ? 1 : 0), 2, 1, '#4a4a52');
      }
    }
    const list = [];
    m.m.forEach(function (c, k) {
      const x = k % 1024 - 8, y = Math.floor(k / 1024) % 1024 - 8, z = Math.floor(k / 1048576) - 8;
      list.push([x + y + z, x, y, z, c]);
    });
    list.sort(function (a, b) { return a[0] - b[0] || a[3] - b[3]; });
    for (let i = 0; i < list.length; i++) paintVoxel(buf, w, list[i][1], list[i][2], list[i][3], list[i][4], ox, oy);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), id = g.createImageData(w, h);
    new Uint32Array(id.data.buffer).set(buf);
    g.putImageData(id, 0, 0);
    return { c: c, ox: ox, oy: oy, w: w, h: h };
  };
  V.clear = function () { cache.clear(); };
})(window.CO = window.CO || {});
