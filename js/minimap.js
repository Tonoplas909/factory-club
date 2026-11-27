/*
 * minimap.js — overview of the whole map in a corner of the screen.
 * A 1 pixel per tile base layer (land, ore, buildings) is cached and re-baked only when the world
 * changes (at most twice a second); the camera outline is drawn on top every frame.
 * Clicking or dragging on it moves the camera there.
 */
(function (CO) {
  'use strict';
  const MM = CO.minimap = {};
  const KEY = 'chantier-orbital-minimap';
  const W = CO.MAP_W, H = CO.MAP_H;
  const C_FREE = [16, 16, 20], C_OWNED = [48, 49, 58], C_EDGE = [190, 158, 96];
  const C_CAT = { Transport: [150, 152, 166], Production: [255, 211, 127], 'Énergie': [111, 224, 160], Fluides: [95, 176, 255], Autres: [127, 170, 255], 'Réseau': [94, 240, 255] };
  const C_PORT = [93, 224, 230];
  let cv, ctx, base, bctx, img, bakedKey = '', bakeWait = 0, shown = true, down = false;
  const oreRGB = [];

  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  MM.init = function () {
    cv = document.getElementById('minimap');
    ctx = cv.getContext('2d');
    base = document.createElement('canvas'); base.width = W; base.height = H;
    bctx = base.getContext('2d');
    img = bctx.createImageData(W, H);
    for (let i = 1; i < CO.ORE_IDS.length; i++) oreRGB[i] = hex(CO.ITEMS[CO.ORE_IDS[i]].color);
    try { shown = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* storage unavailable */ }
    cv.hidden = !shown;
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      down = true; cv.setPointerCapture(e.pointerId); jump(e);
    });
    cv.addEventListener('pointermove', function (e) { if (down) jump(e); });
    const up = function () { down = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    CO.on('loaded', function () { bakedKey = ''; });
    CO.on('land', function () { bakedKey = ''; });
  };
  MM.shown = function () { return shown; };
  MM.toggle = function () {
    shown = !shown; cv.hidden = !shown;
    try { localStorage.setItem(KEY, shown ? 'on' : 'off'); } catch (e) { /* ignore */ }
  };

  /** Centre the camera on the tile under the pointer. */
  function jump(e) {
    const r = cv.getBoundingClientRect();
    CO.cam.x = CO.clamp((e.clientX - r.left) / r.width * W, 0, W);
    CO.cam.y = CO.clamp((e.clientY - r.top) / r.height * H, 0, H);
  }

  /** True on the two outer rows of owned land (so the border survives the minimap's downscaling). */
  function edge(land, x, y) {
    for (let r = 1; r <= 2; r++) {
      if (!own(land, x + r, y) || !own(land, x - r, y) || !own(land, x, y + r) || !own(land, x, y - r)) return true;
    }
    return false;
  }
  function own(land, x, y) { return x >= 0 && y >= 0 && x < W && y < H && land[CO.plotOf(x, y)] === 1; }

  function bake() {
    const world = CO.world, land = CO.state.land, d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, owned = land[CO.plotOf(x, y)] === 1, ore = world.ore[i];
      let c = owned ? C_OWNED : C_FREE;
      if (ore) c = owned ? mix(C_OWNED, oreRGB[ore], 0.85) : mix(C_FREE, oreRGB[ore], 0.35);
      if (owned && edge(land, x, y)) c = C_EDGE;
      const k = i * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    const list = world.list;
    for (let n = 0; n < list.length; n++) {
      const b = list[n];
      let c = b.kind === 'port' ? C_PORT : C_CAT[b.def.cat] || C_CAT.Autres;
      if (b.site) c = mix(C_OWNED, c, 0.45);
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const k = ((b.y + j) * W + b.x + i) * 4;
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  MM.draw = function (dt) {
    if (!shown) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(cv.clientWidth * dpr)), ch = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    bakeWait -= dt || 0;
    const key = CO.world.version + ':' + CO.world.oreRev + ':' + CO.state.landBought;
    if (key !== bakedKey && bakeWait <= 0) { bake(); bakedKey = key; bakeWait = 0.5; }
    ctx.imageSmoothingEnabled = cw < W;                // shrinking: average the pixels; enlarging: keep them crisp
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(base, 0, 0, cw, ch);

    // Camera outline: the screen corners brought back to the map (a diamond in the isometric view).
    const game = document.getElementById('game'), gw = game.clientWidth, gh = game.clientHeight;
    const kx = cw / W, ky = ch / H;
    const pts = [[0, 0], [gw, 0], [gw, gh], [0, gh]].map(function (p) { const w = CO.render.screenToWorld(p[0], p[1]); return [w.x * kx, w.y * ky]; });
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.strokeStyle = '#ffd37f';
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath(); ctx.stroke();
  };
})(window.CO = window.CO || {});
