/*
 * station.js — pixel art of the space station, drawn from the progress of the
 * delivery phases. Built parts are solid; the part being delivered is a blueprint
 * that fills in; later parts are faint blue silhouettes ("the vision").
 *
 *   CO.drawStation(canvas, phaseIndex, progress01, timeSeconds)
 */
(function (CO) {
  'use strict';
  const W = 192, H = 128, CX = 96, CY = 64;

  function R(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function disc(g, c, cx, cy, r) {
    g.fillStyle = c;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) g.fillRect(cx + x, cy + y, 1, 1);
  }
  function line(g, c, x0, y0, x1, y1, t) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    g.fillStyle = c;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t || 1, t || 1);
  }

  // ---- parts (each draws itself fully; `solid` enables animations)
  function partFrame(g) {                      // central truss and hub
    R(g, '#6e7080', 40, 61, 112, 6); R(g, '#a3a5b0', 40, 61, 112, 2);
    for (let x = 44; x < 150; x += 8) { line(g, '#4a4b53', x, 62, x + 4, 66); line(g, '#4a4b53', x + 4, 62, x + 8, 66); }
    disc(g, '#4a4b53', CX, CY, 12); disc(g, '#a3a5b0', CX, CY, 10); disc(g, '#6e7080', CX, CY, 6); disc(g, '#26272e', CX, CY, 3);
  }
  function partHabitat(g) {                    // pressurised cabin, left of the hub
    R(g, '#4a4b53', 50, 52, 34, 24); R(g, '#e0e1e6', 52, 53, 30, 8); R(g, '#b8bac3', 52, 61, 30, 8); R(g, '#868895', 52, 69, 30, 6);
    for (let i = 0; i < 5; i++) R(g, '#ffe2a6', 56 + i * 5, 58, 3, 4);
    R(g, '#6e7080', 46, 56, 4, 16); R(g, '#6e7080', 84, 58, 4, 12);
  }
  function partPower(g, solid, t) {            // mast, cables, nodes
    line(g, '#c4c6cf', CX, 52, CX, 30, 1); R(g, '#ffd37f', CX - 2, 28, 5, 3);
    line(g, '#c4c6cf', CX - 6, 34, CX + 6, 34, 1);
    const blink = solid && Math.floor(t * 2) % 2;
    R(g, blink ? '#ff6a6a' : '#7a3a3a', CX - 1, 26, 3, 2);
    for (let i = 0; i < 4; i++) { R(g, '#ffd37f', 112 + i * 9, 59, 3, 2); R(g, '#ffd37f', 24 + 32 + i * 0, 59, 0, 0); }
    R(g, '#8da1e3', 142, 57, 5, 10); R(g, '#8da1e3', 38, 57, 5, 10); R(g, '#5d6fa8', 143, 58, 3, 8); R(g, '#5d6fa8', 39, 58, 3, 8);
  }
  function partHull(g) {                       // armour plating
    for (let i = 0; i < 4; i++) { R(g, '#b4b6c0', 54 + i * 7, 55, 6, 5); R(g, '#868895', 54 + i * 7, 59, 6, 1); }
    disc(g, '#c4c6cf', CX, CY, 8); disc(g, '#868895', CX, CY, 5); disc(g, '#26272e', CX, CY, 2);
    for (let x = 110; x < 136; x += 8) { R(g, '#b4b6c0', x, 59, 6, 3); R(g, '#b4b6c0', x, 66, 6, 3); }
  }
  function partSolar(g) {                      // two big wings
    for (let w = 0; w < 2; w++) {
      const y0 = w ? 82 : 6;
      line(g, '#868895', CX, w ? 76 : 52, CX, w ? 82 : 46, 2);
      R(g, '#1c3f8a', 78, y0, 36, 40); R(g, '#2f6fe0', 79, y0 + 1, 34, 38);
      for (let i = 1; i < 6; i++) R(g, '#9fd0ff', 79 + i * 6 - 1, y0 + 1, 1, 38);
      for (let j = 1; j < 5; j++) R(g, '#9fd0ff', 79, y0 + j * 8, 34, 1);
      R(g, '#6fa8ff', 80, y0 + 2, 10, 2);
    }
  }
  function partRing(g, solid, t) {             // habitat ring (ellipse in perspective)
    for (let a = 0; a < 360; a += 2) {
      const r = a * Math.PI / 180, x = Math.round(CX + Math.cos(r) * 58), y = Math.round(CY + Math.sin(r) * 22);
      R(g, '#7fa0d8', x - 1, y - 1, 3, 3);
      if (a % 24 === 0) R(g, solid && Math.floor(t + a / 24) % 3 ? '#ffe2a6' : '#b8a040', x, y, 1, 1);
    }
    line(g, '#6e7080', CX - 12, CY, CX - 56, CY, 1); line(g, '#6e7080', CX + 12, CY, CX + 56, CY, 1);
  }
  function partEngines(g, solid, t) {          // thrusters with flames
    R(g, '#4a4b53', 150, 52, 6, 24);
    for (let i = 0; i < 3; i++) {
      const y = 53 + i * 8;
      R(g, '#868895', 156, y, 6, 6); R(g, '#3c3d45', 160, y - 1, 3, 8);
      if (solid) {
        const L = 8 + Math.floor((Math.sin(t * 9 + i) + 1) * 4);
        R(g, '#ff8a2a', 163, y + 1, L, 4); R(g, '#ffe2a6', 163, y + 2, L - 4, 2);
      }
    }
  }
  function partLaunch(g, solid, t) {           // orbit trail + glow
    for (let a = 0; a < 360; a += 5) {
      const r = a * Math.PI / 180;
      R(g, '#8da1e3', Math.round(CX + Math.cos(r) * 88), Math.round(CY + Math.sin(r) * 56), 1, 1);
    }
    if (solid) for (let i = 0; i < 6; i++) {
      const x = 20 + ((i * 31 + Math.floor(t * 8)) % 150), y = 10 + (i * 17) % 100;
      R(g, '#ffffff', x, y, 1, 1);
    }
  }
  function partDock(g, solid, t) {             // docking arm on the left end of the truss, with a parked shuttle
    R(g, '#4a4b53', 22, 58, 18, 12); R(g, '#a3a5b0', 22, 58, 18, 2); R(g, '#26272e', 24, 62, 6, 4);
    for (let i = 0; i < 3; i++) R(g, '#ffd37f', 33 + i * 2, 60, 1, 8);
    R(g, '#6e7080', 14, 61, 8, 6); R(g, '#868895', 8, 59, 6, 10);
    R(g, solid && Math.floor(t * 2) % 2 ? '#7bff9a' : '#2f6a40', 9, 60, 2, 2);
    R(g, '#e0e1e6', 2, 62, 8, 4); R(g, '#868895', 4, 66, 4, 2); R(g, '#8da1e3', 8, 63, 2, 2);
  }
  function partLab(g) {                        // science module with a dome, right of the hub
    line(g, '#6e7080', 108, 67, 112, 72, 1);
    R(g, '#4a4b53', 112, 70, 34, 16); R(g, '#e0e1e6', 114, 71, 30, 5); R(g, '#b8bac3', 114, 76, 30, 5); R(g, '#868895', 114, 81, 30, 3);
    disc(g, '#9fd0e0', 128, 70, 7); disc(g, '#d9f6ff', 128, 69, 5); R(g, '#7be0a0', 126, 68, 5, 3);
    for (let i = 0; i < 4; i++) R(g, '#7be0a0', 118 + i * 7, 78, 3, 2);
  }
  function partAntenna(g, solid, t) {          // mast and parabolic dish, upper right
    line(g, '#c4c6cf', 136, 61, 136, 38, 2);
    for (let i = 0; i < 16; i++) {
      const dx = i - 8, dy = Math.round(dx * dx / 10);
      R(g, '#e0e1e6', 136 + dx, 24 + dy, 2, 2); R(g, '#868895', 136 + dx, 26 + dy, 2, 1);
    }
    line(g, '#ffd37f', 136, 26, 136, 12, 1); R(g, solid && Math.floor(t * 3) % 2 ? '#ff6a6a' : '#7a3a3a', 135, 10, 3, 3);
  }
  function partRadiator(g) {                   // heat fins, upper left
    line(g, '#868895', 52, 52, 40, 36, 2);
    for (let i = 0; i < 4; i++) { R(g, '#d9e2f5', 14 + i * 9, 14, 7, 24); R(g, '#e8854a', 14 + i * 9, 14, 7, 3); R(g, '#9aa6c0', 14 + i * 9 + 3, 17, 1, 21); }
    R(g, '#4a4b53', 12, 38, 38, 3);
  }
  function partCargo(g) {                      // stacked containers under the truss, left
    const cols = ['#d9503a', '#e8c14a', '#3f86b0', '#7bb86a'];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = 28 + i * 11, y = 82 + j * 8;
      R(g, '#2a3050', x, y, 10, 7); R(g, cols[(i + j) % 4], x + 1, y + 1, 8, 5); R(g, '#ffffff', x + 1, y + 1, 8, 1);
    }
    line(g, '#6e7080', 50, 67, 50, 82, 1);
  }
  function partReactor(g, solid, t) {          // glowing core, lower right
    line(g, '#6e7080', 108, 67, 150, 92, 1);
    R(g, '#4a4b53', 138, 90, 32, 24); R(g, '#2c2d34', 140, 92, 28, 20);
    const p = solid ? 1 + Math.floor((Math.sin(t * 4) + 1) * 1.5) : 2;
    disc(g, '#ff8a3a', 154, 102, 8 + (p > 2 ? 1 : 0)); disc(g, '#ffe2a6', 154, 102, 5); disc(g, '#ffffff', 154, 102, 2);
    for (let i = 0; i < 4; i++) R(g, '#868895', 140 + i * 8, 112, 4, 3);
  }
  function partShield(g, solid, t) {           // magnetic arcs around the whole station
    for (let a = -50; a <= 50; a += 3) for (let s = -1; s <= 1; s += 2) {
      const r = a * Math.PI / 180;
      R(g, solid && Math.floor(t * 4 + a / 6) % 4 === 0 ? '#ffffff' : '#8da1e3', Math.round(CX + s * Math.cos(r) * 84), Math.round(CY + Math.sin(r) * 52), 2, 2);
    }
  }
  function partGarden(g) {                     // greenhouse dome above the habitat
    disc(g, '#2f6a40', 66, 44, 11); disc(g, '#7bd68a', 66, 44, 9); disc(g, '#bff0c8', 64, 41, 4);
    for (let i = 0; i < 5; i++) R(g, '#2f8a4a', 59 + i * 3, 46, 2, 4);
    R(g, '#868895', 62, 53, 8, 3);
  }
  const SPOTS = [[58, 30], [134, 30], [58, 96], [134, 96], [30, 46], [162, 46], [30, 82], [162, 82]];
  function partExtension(g, n) {               // extra modules for the endless extensions
    const s = SPOTS[(n - 1) % SPOTS.length];
    const x = s[0], y = s[1];
    line(g, '#6e7080', x + 7, y + 7, CX, CY, 1);
    R(g, '#4a4b53', x, y, 16, 14); R(g, '#e8c14a', x + 1, y + 1, 14, 12); R(g, '#b8922a', x + 1, y + 8, 14, 5);
    R(g, '#8da1e3', x + 3, y + 3, 4, 3); R(g, '#8da1e3', x + 9, y + 3, 4, 3);
  }

  // FUNCS[i] is drawn for phase i (same order as CO.PHASES); ORDER = painting order, back to front.
  const FUNCS = [partFrame, partHabitat, partPower, partHull, partDock, partSolar, partLab, partRing,
    partAntenna, partRadiator, partEngines, partCargo, partReactor, partShield, partGarden, partLaunch];
  const ORDER = [15, 13, 7, 5, 10, 0, 1, 2, 3, 4, 6, 8, 9, 11, 12, 14];
  let tmp = null;
  let stars = null;

  function background(g) {
    if (!stars) {
      stars = document.createElement('canvas'); stars.width = W; stars.height = H;
      const s = stars.getContext('2d');
      R(s, '#09090c', 0, 0, W, H);
      R(s, '#0d0d12', 0, 0, W, 50);
      const rnd = CO.rng(42);
      for (let i = 0; i < 90; i++) {
        const b = rnd(); R(s, b > 0.85 ? '#ffffff' : b > 0.5 ? '#9a9aa6' : '#45454f', Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1);
      }
      disc(s, '#1d3a66', 12, 128, 54); disc(s, '#2b5d8a', 12, 128, 50); disc(s, '#3f86b0', 14, 130, 44);
      disc(s, '#5aa0c8', 20, 134, 34);
      R(s, '#d8ecf5', 6, 92, 14, 2); R(s, '#d8ecf5', 26, 98, 10, 2); R(s, '#d8ecf5', 14, 104, 18, 2);
      R(s, '#3a8a5a', 34, 112, 10, 4); R(s, '#3a8a5a', 20, 118, 14, 3);
    }
    g.drawImage(stars, 0, 0);
  }

  /** Draw the station. `phase` = current phase index, `prog` = 0..1 completion of that phase. */
  CO.drawStation = function (cv, phase, prog, time) {
    if (cv.width !== W) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    background(g);
    const last = CO.PHASES.length - 1, launched = phase > last;
    const bob = launched ? Math.round(Math.sin(time * 0.9) * 2) : 0;
    if (!tmp) { tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; }
    const t = tmp.getContext('2d');

    function part(i, n) {                                   // i: part index (or -1 for extension n)
      const state = n ? (phase > last + n ? 2 : phase === last + n ? 1 : 0) : (i < phase ? 2 : i === phase ? 1 : 0);
      if (state === 0 && n) return;
      function paint(ctx, solid) { if (n) partExtension(ctx, n); else FUNCS[i](ctx, solid, time); }
      if (state === 2) { g.save(); g.translate(0, bob); paint(g, true); g.restore(); return; }
      // blueprint silhouette
      t.clearRect(0, 0, W, H); paint(t, false);
      t.globalCompositeOperation = 'source-atop'; t.fillStyle = '#ffd37f'; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'source-over';
      g.save(); g.globalAlpha = state === 1 ? 0.3 + 0.3 * prog : 0.18; g.drawImage(tmp, 0, 0);
      if (state === 1 && prog > 0) {                         // the part solidifies as items arrive
        g.globalAlpha = Math.min(0.9, prog); g.translate(0, bob); paint(g, false);
      }
      g.restore();
    }
    for (let k = 0; k < ORDER.length; k++) part(ORDER[k], 0);
    const exts = Math.max(0, phase - last);
    for (let n = 1; n <= exts; n++) part(-1, n);
  };
})(window.CO = window.CO || {});
