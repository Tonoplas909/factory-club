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

  // Kéora's quantum network: violet metal, cyan light.
  const KB = '#3a3550', KB2 = '#4a4466', KL = '#8a84b0', KC = '#5ef0ff', KV = '#c060f0';
  const KP = '#ff6ad8', KM = '#5fe0a8', KY = '#e6d040', KA = '#c8903a', KD = '#1a1528';
  const shade = CO.shade;
  /** Round base of Kéora's machines (the Terre's stand on square plinths). */
  function kRound(m, n) { m.cyl(n / 2, n / 2, 0, n / 2 - 0.4, 1, KB).cyl(n / 2, n / 2, 1, n / 2 - 1.2, 1, KB2); return m; }
  function kDrill(f, n) {                              // a spinning crystal bit in a ring frame
    const m = kRound(new Model(n), n), c = n / 2, big = n > 16;
    m.cyl(c, c, 2, c - 3, 2, KD).cyl(c, c, 4, c - 3, 1, KL).cyl(c, c, 4, c - 4.5, 1, null);
    for (let k = 0; k < 4; k++) {
      const a = (f % 4) * Math.PI / 8 + k * Math.PI / 2;
      for (let r = 1; r < c - 3; r++) m.set(Math.round(c - 0.5 + Math.cos(a) * r), Math.round(c - 0.5 + Math.sin(a) * r), 3, KV);
    }
    const s = big ? 3 : 2, x0 = Math.floor(c - s / 2);
    m.box(x0, x0, 3, s, s, big ? 8 : 6, KC).box(x0, x0, big ? 11 : 9, s, s, 1, '#e0ffff');
    return m;
  }

  const MODELS = {
    // ---- Kéora's machines: round violet bases, crystals, cold lights
    k_drill: function (f) { return kDrill(f, 16); },
    k_drill_heavy: function (f) { return kDrill(f, 24); },
    k_extractor: function (f) {                        // a basin on the lake and three cartridges
      const m = kRound(new Model(16), 16);
      m.cyl(6, 7, 2, 4.5, 1, '#1f5a52').set(5 + f, 6, 2, '#5fc8b0');
      for (let i = 0; i < 3; i++) m.box(11, 3 + i * 4, 2, 3, 3, 4, KM).box(11, 3 + i * 4, 6, 3, 3, 1, '#e0fff8');
      return m;
    },
    k_well: function (f) {                             // a sealed shaft with an amber cap moving up and down
      const m = kRound(new Model(16), 16);
      m.box(5, 5, 2, 6, 6, 6, KB2).box(6, 6, 8 + f, 4, 4, 2, KA).box(7, 7, 10 + f, 2, 2, 1, '#ffe0a0');
      m.box(2, 7, 2, 3, 2, 3, KL).box(11, 7, 2, 3, 2, 3, KL);
      return m;
    },
    k_forge: function (f) {                            // coil rings around a white-hot core
      const m = kRound(new Model(16), 16);
      m.cyl(8, 8, 2, 3, 8, [KP, '#ff9ad8', '#ffd0f0'][f % 3]);
      for (let z = 2; z < 10; z += 2) m.cyl(8, 8, z, 5.5, 1, (z / 2 + f) % 3 ? KC : '#2f8a9a').cyl(8, 8, z, 4.4, 1, null);
      return m;
    },
    k_workshop: function (f) {                         // a table and two laser arms over the part
      const m = kRound(new Model(16), 16);
      m.box(3, 3, 2, 10, 10, 2, '#2a2540').box(6 + (f % 4), 7, 4, 3, 2, 1, '#7f9cf0');
      m.box(2, 2, 2, 2, 2, 7, KL).box(2, 2, 9, 4, 2, 1, KC).box(12, 12, 2, 2, 2, 7, KL).box(10, 12, 9, 4, 2, 1, KP);
      return m;
    },
    k_plasma_oven: function (f) {                      // a dome with plasma glowing through its top
      const m = kRound(new Model(24), 24);
      m.cyl(12, 12, 2, 9, 5, KB2).cyl(12, 12, 7, 8, 2, KL).cyl(12, 12, 9, 6, 1, KB2).cyl(12, 12, 10, 4, 1, f % 2 ? KP : KV);
      for (let k = 0; k < 4; k++) m.box(k % 2 ? 1 : 21, 10 + (k >> 1) * 3, 3, 2, 2, 2, KP);
      return m;
    },
    k_synth: function (f) {                            // a cluster of crystal towers, one lit at a time
      const m = kRound(new Model(24), 24);
      const hs = [6, 9, 5, 8, 11, 7, 5, 8, 6];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const k = i + j * 3, x = 4 + i * 6, y = 4 + j * 6;
        m.box(x, y, 2, 4, 4, hs[k], KB2).box(x + 1, y + 1, 2 + hs[k], 2, 2, 2, k % 4 === f % 4 ? KC : KV);
      }
      return m;
    },
    k_stellar: function (f) {                          // a standing ring around a captive star
      const m = kRound(new Model(32), 32);
      for (let a = 0; a < 360; a += 6) {
        const r = a * Math.PI / 180, x = Math.round(16 + Math.cos(r) * 11), z = Math.round(14 + Math.sin(r) * 11);
        m.box(x - 1, 15, z, 2, 2, 2, a % 36 ? KL : KC);
      }
      m.cyl(16, 16, 12, 3 + (f % 2) * 0.6, 4, KY).box(15, 15, 13, 2, 2, 2, '#ffffff');
      m.box(14, 14, 2, 4, 4, 2, KB2).box(4, 4, 2, 3, 3, 6, KV).box(25, 25, 2, 3, 3, 6, KV);
      return m;
    },
    k_chem: function (f) {                             // three vats (ammonia, methane, product)
      const m = kRound(new Model(24), 24);
      [[7, 8, KM, 7], [17, 8, KA, 9], [12, 17, KC, 6]].forEach(function (v, i) {
        m.cyl(v[0], v[1], 2, 4, v[3], v[2]).cyl(v[0], v[1], 2 + v[3], 3, 1, shade(v[2], 0.3));
        if ((f + i) % 3 === 0) m.set(v[0], v[1], 3 + v[3], '#ffffff');
      });
      return m;
    },
    k_gen: function (f) {                              // a sulfur burner between two radiators
      const m = kRound(new Model(16), 16);
      m.cyl(8, 8, 2, 4, 5, KB2).cyl(8, 8, 7, 2.5, 1 + (f % 2), [KY, '#fff7a8', '#ffb347'][f % 3]);
      for (let k = 0; k < 4; k++) m.box(1, 3 + k * 3, 2, 2, 1, 6, KL).box(13, 3 + k * 3, 2, 2, 1, 6, KL);
      return m;
    },
    k_turbine: function (f) {                          // a big turbine housing with turning blades on top
      const m = kRound(new Model(24), 24);
      m.cyl(11, 12, 2, 9, 8, KB2).cyl(11, 12, 10, 8, 1, KD);
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + f * Math.PI / 6;
        for (let r = 2; r < 8; r++) m.set(Math.round(11 + Math.cos(a) * r), Math.round(12 + Math.sin(a) * r), 11, KL);
      }
      m.box(10, 11, 11, 2, 2, 1, KA).box(20, 9, 2, 3, 6, 10, '#5a3a10').box(20, 10, 12, 3, 4, 1, KA);
      return m;
    },
    k_collector: function () {                         // four tilted crystal facets around a lens
      const m = kRound(new Model(16), 16);
      [[2, 2], [9, 2], [2, 9], [9, 9]].forEach(function (p, i) {
        for (let k = 0; k < 5; k++) m.box(p[0], p[1] + k, 2 + (i < 2 ? k >> 1 : 2 - (k >> 1)), 5, 1, 1, i % 3 ? '#8a5ad8' : KV);
      });
      m.box(7, 7, 2, 2, 2, 6, KC);
      return m;
    },
    k_lab: function (f) {                              // a glass dome with a floating crystal
      const m = kRound(new Model(16), 16);
      m.cyl(8, 8, 2, 6, 3, '#5a9aa8').cyl(8, 8, 5, 5, 2, '#7fc0cc').cyl(8, 8, 7, 3.5, 1, '#9fe8f0').box(7, 7, 8, 2, 2, 1, '#e0ffff');
      m.box(7, 7, 10 + (f % 2), 2, 2, 3, KV);
      return m;
    },
    k_seller: function () {                            // an exchange kiosk and a gold coin
      const m = kRound(new Model(16), 16);
      m.box(3, 3, 2, 10, 7, 6, KB2).box(3, 3, 8, 10, 7, 1, KL).box(4, 9, 4, 8, 1, 3, KM);
      m.cyl(8, 13, 2, 2, 3, KY);
      return m;
    },
    k_port: function (f) {                             // the Spatioport: a round pad, a light ring and a beacon mast
      const m = new Model(32);
      m.cyl(16, 16, 0, 15.6, 2, KB).cyl(16, 16, 2, 14.5, 1, '#2a2540');
      for (let a = 0; a < 360; a += 30) { const r = a * Math.PI / 180; m.box(Math.round(16 + Math.cos(r) * 12), Math.round(16 + Math.sin(r) * 12), 3, 1, 1, 1, (a / 30 + f) % 2 ? KC : '#ffffff'); }
      m.box(14, 14, 3, 4, 4, 9, KL).box(13, 13, 12, 6, 6, 1, KV).box(15, 15, 13, 2, 2, 2, f % 2 ? KC : '#ffffff');
      return m;
    },
    k_prism: function () {                             // a crystal pointing East, on a small base
      const m = new Model(8);
      m.box(1, 1, 0, 6, 6, 1, KB2).box(2, 2, 1, 2, 4, 4, KV).box(4, 3, 1, 2, 2, 3, KV).box(6, 3, 1, 1, 2, 2, KC);
      return m;
    },
    k_split: function () {                             // a crystal with three points: East, North, South
      const m = new Model(8);
      m.box(1, 1, 0, 6, 6, 1, KB2).box(3, 3, 1, 2, 2, 5, KV).box(5, 3, 1, 2, 2, 2, KC).box(3, 0, 1, 2, 2, 2, KC).box(3, 6, 1, 2, 2, 2, KC);
      return m;
    },
    k_silo: function () {                              // tall capsule silo with light rings
      const m = kRound(new Model(16), 16);
      m.cyl(8, 8, 2, 6.5, 12, KB2).cyl(8, 8, 14, 5, 1, KL).cyl(8, 8, 15, 2, 1, KB);
      m.cyl(8, 8, 5, 6.55, 1, KC).cyl(8, 8, 10, 6.55, 1, KV);
      return m;
    },
    k_booster: function (f) {                          // magnetic coil around a glowing core
      const m = kRound(new Model(16), 16);
      for (let z = 2; z < 9; z += 2) m.cyl(8, 8, z, 6, 1, z === 4 + 2 * (f % 2) ? KC : KL);
      m.cyl(8, 8, 2, 3, 8, KB).cyl(8, 8, 10, 2, 2, f % 2 ? KC : '#2f8a9a');
      return m;
    },
    k_relay: function (f) {                            // crystal emitter on a tripod
      const m = kRound(new Model(16), 16);
      m.box(3, 3, 2, 2, 2, 6, KL).box(11, 3, 2, 2, 2, 6, KL).box(7, 12, 2, 2, 2, 6, KL);
      m.box(5, 5, 8, 6, 6, 2, KB2).box(6, 6, 10, 4, 4, 6, KV).box(7, 7, 16, 2, 2, 2, f % 2 ? KC : '#ffffff');
      return m;
    },
    k_accu: function (f) {                             // four battery cells with charge lights
      const m = kRound(new Model(16), 16);
      for (let k = 0; k < 4; k++) {
        const x = 2 + (k % 2) * 7, y = 2 + Math.floor(k / 2) * 7;
        m.box(x, y, 2, 5, 5, 7, KB2).box(x + 1, y + 1, 9, 3, 3, 1, KL);
        m.box(x, y, 3 + ((f + k) % 3) * 2, 5, 5, 1, '#5fe0a8');
      }
      return m;
    },
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
    pole: function () {                                // wooden post, crossbar and two glass insulators (wires hook at z 12)
      const m = new Model(8);
      m.box(2, 2, 0, 4, 4, 1, M0).box(3, 3, 1, 2, 2, 11, '#7a5a3a').box(3, 3, 12, 2, 2, 1, '#5e4630');
      m.box(0, 3, 10, 8, 2, 1, '#5e4630');
      m.box(0, 3, 11, 1, 2, 1, GLASS).box(7, 3, 11, 1, 2, 1, GLASS).box(3, 3, 13, 2, 2, 1, ACC);
      return m;
    },
    pylon: function () {                               // steel lattice tower, taller than a pole
      const m = new Model(8);
      m.box(0, 0, 0, 8, 8, 1, M0);
      for (const p of [[1, 1], [6, 1], [1, 6], [6, 6]]) m.box(p[0], p[1], 1, 1, 1, 10, M2);
      for (let z = 2; z < 18; z += 3) { m.box(1, 1, z, 6, 1, 1, M1).box(1, 6, z, 6, 1, 1, M1).box(1, 1, z, 1, 6, 1, M1).box(6, 1, z, 1, 6, 1, M1); }
      m.box(2, 2, 11, 4, 4, 7, M2).box(3, 3, 18, 2, 2, 2, M3);
      m.box(0, 3, 16, 8, 2, 1, M1).box(0, 3, 17, 1, 2, 1, GLASS).box(7, 3, 17, 1, 2, 1, GLASS).box(3, 3, 20, 2, 2, 1, ACC);
      return m;
    },
    generator: function (f) {                          // coal boiler with a glowing firebox and a tall chimney
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 9, 12, 7, '#6b5a52').box(2, 2, 9, 9, 12, 1, M1);
      m.box(10, 4, 2, 3, 8, 5, DARK).box(12, 5, 3, 1, 6, 3, HOT[f % 4]);
      m.box(11, 11, 2, 3, 3, 4, '#2a2a30').box(11, 11, 6, 3, 3, 1, '#464656');      // coal hopper
      m.box(3, 3, 10, 3, 3, 9, M0).box(3, 3, 19, 3, 3, 1, DARK);                     // chimney
      m.box(7, 7, 10, 3, 3, 1, HOT[(f + 2) % 4]);
      hazard(m, 2, 14, 2, 9, 1);
      return m;
    },
    solar_plant: function () {                         // four flat panels on short legs
      const n = 16, m = plinth(new Model(n), n, 1);
      for (const p of [[1, 1], [8, 1], [1, 8], [8, 8]]) {
        m.box(p[0] + 3, p[1] + 3, 1, 1, 1, 2, M1);
        m.box(p[0], p[1], 3, 7, 7, 1, '#2f6fe0');
        m.box(p[0] + 3, p[1], 3, 1, 7, 1, '#9fd0ff').box(p[0], p[1] + 3, 3, 7, 1, 1, '#9fd0ff');
      }
      return m;
    },
    launch_pad: function (f) {                         // concrete pad, flame trench, service tower with a beacon
      const n = 32, m = new Model(n);
      m.box(0, 0, 0, n, n, 1, M0).box(1, 1, 1, n - 2, n - 2, 1, M1);
      hazard(m, 2, 2, 2, n - 4, 2); hazard(m, 2, n - 4, 2, n - 4, 2);
      m.cyl(16, 16, 2, 7, 1, DARK).cyl(16, 16, 2, 4, 1, '#1a1a1e');
      m.box(25, 10, 2, 4, 4, 26, M1);
      for (let z = 4; z < 28; z += 4) m.box(25, 10, z, 4, 4, 1, M3);
      m.box(21, 11, 20, 4, 2, 1, M2).box(21, 11, 12, 4, 2, 1, M2);
      m.box(26, 11, 28, 2, 2, 1, f % 2 ? '#e55454' : '#7a2a2a');
      return m;
    },
    drone_hub: function (f) {                          // landing pad, cross marking, mast with a beacon
      const n = 16, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 12, 12, 1, DARK);
      m.box(4, 7, 3, 8, 2, 1, ACC).box(7, 4, 3, 2, 8, 1, ACC);
      m.box(13, 13, 2, 2, 2, 9, M1).box(13, 13, 11, 2, 2, 1, f % 2 ? '#84f491' : '#2f6a3a');
      for (const p of [[2, 2], [13, 2], [2, 13]]) m.box(p[0], p[1], 3, 1, 1, 1, f % 2 ? ACC : ACC_D);
      return m;
    },
    drone_provider: function () {                      // blue crate
      const m = new Model(8);
      m.box(1, 1, 0, 6, 6, 5, '#3f6fb8').box(1, 1, 5, 6, 6, 1, '#5f8fd8').box(3, 3, 6, 2, 2, 1, '#bfe6ff');
      return m;
    },
    drone_requester: function () {                     // orange crate with an output lip
      const m = new Model(8);
      m.box(1, 1, 0, 6, 6, 5, '#c8783a').box(1, 1, 5, 6, 6, 1, '#e8985a').box(3, 3, 6, 2, 2, 1, '#ffe0c0');
      m.box(7, 3, 1, 1, 2, 2, ACC);
      return m;
    },
    pump: function (f) {                               // pump on a lake: housing, motor, a piston going up and down
      const n = 16, m = new Model(n);
      m.box(0, 0, 0, n, n, 1, M0).box(2, 2, 1, 12, 12, 1, '#2c5fa8');
      m.cyl(8, 8, 1, 4.5, 6, M2).cyl(8, 8, 7, 3, 1, M3).box(7, 7, 8, 2, 2, 2 + (f % 2) * 2, ACC);
      for (const p of [[0, 7], [14, 7], [7, 0], [7, 14]]) m.box(p[0], p[1], 1, 2, 2, 2, M3);
      return m;
    },
    oil_well: function (f) {                           // pumpjack: A-frame and a nodding beam
      const n = 16, m = plinth(new Model(n), n, 2);
      m.cyl(4, 11, 2, 2.5, 3, '#1d1824');
      m.box(9, 6, 2, 2, 4, 9, M1);
      const up = f % 2;
      m.box(2, 7, 10 + up, 7, 2, 1, M2).box(9, 7, 11, 1, 2, 1, M2).box(10, 7, 11 - up, 5, 2, 1, M2);
      m.box(2, 7, 7 + up, 2, 2, 3, ACC).box(13, 7, 8 - up, 2, 2, 3, M0);
      hazard(m, 1, 14, 2, 14, 1);
      return m;
    },
    fluid_tank: function () {                          // big round tank with a ladder
      const n = 16, m = plinth(new Model(n), n, 1);
      m.cyl(8, 8, 1, 7, 9, '#9aa6c0').cyl(8, 8, 10, 6, 1, '#7f8aa4').cyl(8, 8, 5, 7.05, 1, ACC_D);
      m.box(14, 7, 1, 1, 2, 10, M0);
      return m;
    },
    steam_plant: function (f) {                        // brick boiler and a cooling tower
      const n = 24, m = plinth(new Model(n), n, 2);
      m.box(2, 2, 2, 9, 20, 8, '#6b5a52').box(2, 2, 10, 9, 20, 1, M1);
      m.box(10, 8, 2, 2, 8, 5, DARK).box(11, 9, 3, 1, 6, 3, HOT[f % 4]);
      m.cyl(17, 12, 2, 6, 5, '#c8ccd8').cyl(17, 12, 7, 5, 5, '#d4d8e2').cyl(17, 12, 12, 5.5, 4, '#e2e6ee').cyl(17, 12, 15, 4, 1, '#3a3b42');
      m.box(4, 4, 11, 2, 2, 6, M0);
      return m;
    },
    refinery: function (f) {                           // distillation columns, a round tank and a flare
      const n = 24, m = plinth(new Model(n), n, 2);
      m.cyl(7, 7, 2, 3.5, 16, M3).cyl(7, 7, 18, 2, 1, M2);
      for (let z = 5; z < 18; z += 4) m.cyl(7, 7, z, 3.6, 1, ACC_D);
      m.cyl(15, 6, 2, 2.5, 12, M3).cyl(15, 6, 14, 1.5, 1, M2);
      m.cyl(15, 16, 2, 5, 6, '#d8d2ea').cyl(15, 16, 8, 4, 1, '#b8b0cc');
      m.box(3, 13, 2, 6, 2, 2, M2).box(3, 17, 2, 6, 2, 2, M2);
      m.box(4, 20, 2, 1, 1, 9, M0).box(4, 20, 11, 1, 1, 1, HOT[f % 4]);
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
  V.frames = { k_booster: 2, k_relay: 2, k_accu: 3, k_drill: 4, k_drill_heavy: 4, k_extractor: 2, k_well: 2, k_forge: 3, k_workshop: 4, k_plasma_oven: 2,
    k_synth: 4, k_stellar: 2, k_chem: 3, k_gen: 3, k_turbine: 3, k_lab: 2, k_port: 2, launch_pad: 2, drone_hub: 2, pump: 2, oil_well: 2, steam_plant: 4, refinery: 4, generator: 4, drill: 2, drill_heavy: 2, smelter: 4, assembler: 4, steelmill: 4, fabricator: 4, spaceyard: 2, lab: 4, port: 2 };

  const cache = new Map();
  V.building = function (type, dir, frame) {
    if (type === 'pipe') return V.pipe(dir & 1 ? 10 : 5, null);
    if (BUILDINGS[type].kind === 'ktube') return V.tube(5, 0);
    const def = BUILDINGS[type], nf = V.frames[type] || 1, f = (frame || 0) % nf, d = def.fixed ? 0 : dir || 0;
    const k = 'b' + type + d + ':' + f;
    let s = cache.get(k);
    if (!s) {
      const fn = type === 'drill_heavy' ? function (fr) { return MODELS.drill(fr, true); } : MODELS[type];
      s = raster(rotated(fn(f), d));
      cache.set(k, s);
    }
    return s;
  };
  /** Rocket standing on a pad: `stage` parts of `total` built (it grows from the bottom), with fins and a nose. */
  V.rocket = function (stage, total) {
    const k = 'R' + stage + ':' + total;
    let s = cache.get(k);
    if (!s) {
      const m = new Model(8), hmax = 22, hh = Math.max(1, Math.round(hmax * stage / total));
      m.cyl(4, 4, 0, 2.6, Math.min(hh, 3), M2);
      for (const p of [[0, 3], [7, 3], [3, 0], [3, 7]]) if (hh >= 2) m.box(p[0], p[1], 0, 1, 2, 3, '#e55454');
      if (hh > 3) m.cyl(4, 4, 3, 2.2, hh - 3, WHITE);
      if (hh > 10) m.cyl(4, 4, 9, 2.25, 1, '#e55454');
      if (stage >= total) m.cyl(4, 4, hmax, 1.5, 2, WHITE).cyl(4, 4, hmax + 2, 0.8, 1, '#e55454');
      s = raster(m);
      cache.set(k, s);
    }
    return s;
  };
  /** Pipe piece: hub and arms towards the connected sides (mask: 1 E, 2 S, 4 W, 8 N); the hub top shows the fluid. */
  V.pipe = function (mask, fluid) {
    const k = 'P' + mask + (fluid || '');
    let s = cache.get(k);
    if (!s) {
      const m = new Model(8);
      if (mask & 1) m.box(5, 2, 1, 3, 4, 3, M2).box(7, 2, 1, 1, 4, 3, M3);
      if (mask & 2) m.box(2, 5, 1, 4, 3, 3, M2).box(2, 7, 1, 4, 1, 3, M3);
      if (mask & 4) m.box(0, 2, 1, 3, 4, 3, M2).box(0, 2, 1, 1, 4, 3, M3);
      if (mask & 8) m.box(2, 0, 1, 4, 3, 3, M2).box(2, 0, 1, 4, 1, 3, M3);
      m.box(2, 2, 0, 4, 4, 1, M0).box(2, 2, 1, 4, 4, 3, M1).box(3, 3, 4, 2, 2, 1, fluid ? ITEMS[fluid].color : DARK);
      s = raster(m);
      cache.set(k, s);
    }
    return s;
  };
  /** Tube of Kéora's network: hub and arms towards the connected sides; `glow` 1 when the network is busy. */
  V.tube = function (mask, glow) {
    const k = 'K' + mask + ':' + glow;
    let s = cache.get(k);
    if (!s) {
      const m = new Model(8), core = glow ? KC : '#3a6a78';
      if (mask & 1) m.box(5, 2, 1, 3, 4, 3, KB2).box(5, 3, 4, 3, 2, 1, core);
      if (mask & 2) m.box(2, 5, 1, 4, 3, 3, KB2).box(3, 5, 4, 2, 3, 1, core);
      if (mask & 4) m.box(0, 2, 1, 3, 4, 3, KB2).box(0, 3, 4, 3, 2, 1, core);
      if (mask & 8) m.box(2, 0, 1, 4, 3, 3, KB2).box(3, 0, 4, 2, 3, 1, core);
      m.box(2, 2, 0, 4, 4, 1, KB).box(2, 2, 1, 4, 4, 3, '#5a5480').box(3, 3, 4, 2, 2, 1, glow ? '#e0ffff' : core);
      s = raster(m);
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
  /**
   * Ground of an n×n-tile chunk whose back corner is tile (tx, ty): one flat layer of floor voxels
   * (tile edges a shade darker, so the grid reads) with ore rocks and the odd boulder lying on it.
   */
  V.chunk = function (tx, ty, n) {
    const world = CO.world, seed = world.seed, W = CO.MAP_W, H = CO.MAP_H, P = CO.planet(world.planet);
    const N = n * VT, zmax = 3;
    const ox = 2 * N + 1, oy = 2 * zmax + 1, w = 4 * N + 2, h = 2 * N + oy + 4;
    const buf = new Uint32Array(w * h);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = tx + (x >> 3), gy = ty + (y >> 3);
      if (gx >= W || gy >= H) continue;
      const fo = world.ore[gy * W + gx];
      if (fo && CO.isFluidOre(fo)) {                          // lake / oil pool: flat liquid with a few ripples
        const pool = ITEMS[CO.ORE_IDS[fo]].pool, rip = CO.hash2(gx * 8 + x, gy * 8 + y, seed + 77) > 0.93;
        paintVoxel(buf, w, x, y, -1, rip ? pool[1] : pool[0], ox, oy);
        continue;
      }
      const pal = CO.vnoise(gx * 0.06, gy * 0.06, seed + 5) > 0.55 ? P.ground[1] : P.ground[0];
      const base = pal[Math.floor(CO.hash2(gx, gy, seed) * 3)];
      const edge = (x & 7) === 0 || (y & 7) === 0;
      paintVoxel(buf, w, x, y, -1, edge ? CO.shade(base, -0.1) : base, ox, oy);
    }
    const m = new Model(N);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = tx + i, gy = ty + j;
      if (gx >= W || gy >= H) continue;
      const ore = world.ore[gy * W + gx];
      if (ore && CO.isFluidOre(ore)) continue;
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
        m.box(rx, ry, 0, 2 + (CO.hash2(gx, gy, seed + 9) > 0.5 ? 1 : 0), 2, 1, P.boulder);
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
