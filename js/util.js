/*
 * util.js — small shared helpers (math, seeded random, noise, colors, DOM).
 * All game code lives in the global namespace `CO` (no ES modules, so the game
 * also runs when index.html is simply double-clicked, without a web server).
 */
(function (CO) {
  'use strict';

  // Direction convention used everywhere: 0 = East, 1 = South, 2 = West, 3 = North
  // (clockwise, so "rotate" = dir + 1).
  CO.DX = [1, 0, -1, 0];
  CO.DY = [0, 1, 0, -1];
  CO.DIR_ARROWS = ['→', '↓', '←', '↑'];

  CO.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /** Deterministic pseudo random generator (mulberry32). */
  CO.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Stateless integer-lattice hash in [0,1). */
  CO.hash2 = function (x, y, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /** Smooth value noise in [0,1). */
  CO.vnoise = function (x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = CO.hash2(xi, yi, seed), b = CO.hash2(xi + 1, yi, seed);
    const c = CO.hash2(xi, yi + 1, seed), d = CO.hash2(xi + 1, yi + 1, seed);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };

  /** Format an integer with French thousands separators. */
  CO.fmt = function (n) {
    return Math.floor(n).toLocaleString('fr-FR');
  };

  /** Lighten (f > 0) or darken (f < 0) a #rrggbb color. */
  CO.shade = function (hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  };

  /** Tiny DOM helper: h('div', {class:'x', onclick:fn}, child, child...) */
  CO.h = function (tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }     // arrays of children are flattened
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  };

  /** Minimal event bus. */
  const handlers = {};
  CO.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  CO.emit = function (name, a, b) {
    const l = handlers[name];
    if (l) for (let i = 0; i < l.length; i++) l[i](a, b);
  };
})(window.CO = window.CO || {});
