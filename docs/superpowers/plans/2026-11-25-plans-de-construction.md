# Construction plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghost sites paid when a worker claims them, a mirror key, and a library of named plans shared by all games.

**Architecture:** `site.paid` on world sites; history.js decides pay-or-ghost per added piece and refunds by actual paid state; sim.js workers pay ghosts at claim. A new js/plans.js stores plans in localStorage and draws thumbnails; ui.js gets a Plans tab; input.js gets mirror and `loadBlueprint`.

**Tech Stack:** vanilla JS, Canvas 2D, Node harness (scratchpad `t/h.js`).

**Spec:** `docs/superpowers/specs/2026-11-25-plans-de-construction-design.md`

## Global Constraints
- French visible text, English code. Bump `?v=10` → `?v=11`; add `js/plans.js?v=11` after `history.js`.
- Save format: site entry `o.s` (progress) + `o.g = 1` for unpaid ghosts; no SAVE_REV bump needed (old saves have no `g` → paid).

## Review Focus
- Undo / redo / cut / delete of ghosts must conserve credits exactly (refund = actual paid amount).
- A ghost placed over existing pieces must never remove them (replacements are paid or skipped).
- Workers must not get stuck on a ghost they cannot pay (claim only when money ≥ cost).
- Plans containing locked buildings: skipped at placement, red in preview.
- localStorage unavailable / corrupt plan data: library empty, no crash.

---

### Task 1: Ghost economics (world.js, history.js, sim.js) — test `t/ghost.js`
**Produces:** `world.makeSite(b, done, paid = true)`; `b.site.paid`; `CO.paidValue(b) → number` (cost, or 0 for a ghost); `CO.ghostStats() → { n, cost }`; `H.place` returns placed count and sets `H.lastGhosts`.
- [ ] Test: money 100, place 5 drills (40 ¢) → 2 paid, 3 ghosts, money 20; delete a ghost → money 20; undo → ghost again, money 20; give money, run workers → ghosts paid one at a time, money drops by 40 per claim; undo whole batch after → full refund of paid ones; save → restore keeps `paid:false`; ghost replacing a belt is skipped when unaffordable (belt stays).
- [ ] Implement; `exec` no longer refuses on money; `applyOp('add')` pays if `!op.g && money ≥ cost`, else ghost; `'del'` refunds `paidValue`; snapshots of ghosts carry `g: 1`.
- [ ] Workers: `claimNearest` skips ghosts when `money < cost`, prefers paid sites, pays on claim.
- [ ] Run all harness tests.

### Task 2: Ghost display — preview, sites, counters
- [ ] `validate`: unaffordable piece without replacements → `p.ghost = true` (valid); `lastGhostCost`. `I.getGhostCost()`.
- [ ] render.js / iso.js: ghost preview blue (`rgba(110,160,255,…)`); ghost sites: constant low alpha + blue dashed frame.
- [ ] Hint: "coût X ¢ (dont Y ¢ en fantômes)"; workers chip: "n en attente · m fantômes"; Station tab Ouvriers section: ghost count and remaining cost; minimap already fades sites.

### Task 3: Mirror
- [ ] `mirrorBlueprint(bp)`: `rx' = w − (rx + size)`, dir 0↔2, driver target mirrored. Key `F` in paste tool; hint mentions it. Node test: mirror twice = identity; E belt becomes W.

### Task 4: Library (js/plans.js, ui.js)
**Produces:** `CO.plans = { list(), add(name, bp) → plan, rename(id, name), remove(id), thumb(bp, w, h) → canvas, cost(bp) → number, locked(bp) → string[] }`; `CO.input.loadBlueprint(bp)`; `CO.input.blueprintOfSelection()`.
- [ ] Plans tab (5th tab "Plans"): save-selection button, cards newest first (thumbnail, name, pieces, cost, lock warning, Poser / Renommer / Supprimer with confirm). Name dialog with a text input (Enter validates, Échap cancels).
- [ ] "★ Garder comme plan" in Info tab selection card and single-building card.
- [ ] Browser check both views; README + help rows (F, Plans tab, fantômes).
