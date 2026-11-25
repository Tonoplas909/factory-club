# Minimap and production curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clickable minimap of the 480×320 map, and produced/used/income curves over 1 min, 10 min and 1 h in the Production tab.

**Architecture:** sim.js keeps three ring buffers of samples next to its existing one-minute buckets. A new js/minimap.js owns an overlay canvas: a cached 1 px/tile base layer re-baked when the world changes, plus the camera outline each frame. ui.js draws small line charts on canvases in the Production tab.

**Tech Stack:** vanilla JS (IIFE modules on `CO`), Canvas 2D, Node headless harness (scratchpad `t/h.js`).

**Spec:** `docs/superpowers/specs/2026-11-25-minimap-courbes-design.md`

## Global Constraints
- Visible text in French, code and comments in English.
- Bump every `?v=9` to `?v=10` in index.html; add `js/minimap.js?v=10` after `iso.js`.
- History is not saved; it resets on 'loaded'.

## Review Focus
- Iso view: the camera outline must be the projected screen corners (a diamond), not a rectangle.
- Clicking the minimap must not start a build / selection on the game canvas underneath.
- Side panel collapsed / compact 1024×768: the minimap must not cover the toolbar or the side panel.
- Re-rendering the Production tab every second must keep open item curves open.
- Long sessions: ring buffers capped at 60 samples each (no unbounded growth).

---

### Task 1: Production history (sim.js)
**Files:** Modify `js/sim.js` (statistics block + rollover at the end of `sim.step`). Test: scratchpad `t/hist.js`.

**Interfaces — Produces:**
- `sim.HIST = [{ label: '1 min', step: 1 }, { label: '10 min', step: 10 }, { label: '1 h', step: 60 }]`
- `sim.history(res: 0|1|2, kind: 'p'|'u'|'m', item?: string) → number[]` per-minute values, oldest first, at most 60.

- [ ] Test: produce 1 plate per simulated second for 125 s → `history(0,'p','plate')` has 60 values all 60; `history(1,…)` has 12 values all 60; `history(2,…)` has 2 values all 60; `history(0,'m')` mirrors `countIncome`; after `CO.emit('loaded')` all are empty.
- [ ] Implement: on each 1 s rollover push the bucket into ring 0, add it into accumulators for rings 1 and 2, flush them every 10 / 60 buckets. Cap 60.
- [ ] Run `node t/hist.js` → PASS.

### Task 2: Minimap (js/minimap.js, index.html, css, input.js, ui.js toolbar)
**Interfaces — Produces:** `CO.minimap = { init(), draw(), toggle(), shown() }`; main.js calls `init()` after `CO.ui.init()` and `draw()` after `CO.render.draw`.

- [ ] `<canvas id="minimap">` in `#app`; CSS top-right of the play area (`top: 58px; right: calc(var(--side-w) + 8px)`, 8px when `body.side-collapsed`), 240×160, 180×120 under 1100px, 144×96 under 820px.
- [ ] Base layer (480×320 ImageData): unowned ground dark, owned ground lighter, ore = `ITEMS[ore].color` (dimmed off-land), buildings by `def.cat` (Transport grey, Production gold, Autres blue, Port cyan), sites faded. Re-bake when `world.version + ':' + world.oreRev + ':' + state.landBought` changes, at most every 0.5 s.
- [ ] Camera outline: the 4 corners of `#game` through `CO.render.screenToWorld`, drawn as a polygon.
- [ ] Pointer down / drag on the minimap → `CO.cam.x/y` = that tile (pointer capture, `stopPropagation`).
- [ ] Key `M` (input.js) and toolbar button `['▦', 'Carte']` toggle; stored in localStorage `chantier-orbital-minimap`. Help row added.
- [ ] Browser check: both views, collapse side panel, 1024×768.

### Task 3: Curves in the Production tab (ui.js, css)
- [ ] Window selector (3 buttons from `sim.HIST`, default 10 min) under the intro text; income chart below the Revenus line.
- [ ] Item rows clickable; module-level `openCurves` set keeps them open across re-renders; an open row is followed by a full-width row holding a chart of produced (green `--good`) and used (orange `#ffb347`).
- [ ] `drawChart(canvas, series[], colors[], stepSeconds)`: 300×70 internal size, CSS width 100%; max value label top-left, `-<window>` bottom-left, `maintenant` bottom-right; "Pas encore de données" when empty.
- [ ] Browser check, then README (Production section) and help.
