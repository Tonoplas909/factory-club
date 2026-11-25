# Construction plans: library and ghost plans (project 2 of 8)

## Intent
Copy / cut / paste already exists (Ctrl+C/X/V, `R` rotates, ghost preview,
partial placement, recipes / filters / driver links kept), but a copy is lost
as soon as another one is made, and pasting needs all the money at once.
Macalamar wants big factories to be comfortable to build: reuse proven
layouts, and lay out a large build in one go and watch it get built.

## Goals
- A **library** of named plans, reusable at any time and in every game.
- **Ghost plans**: a layout can be placed even without enough credits; the
  missing pieces wait as ghosts and are paid when a worker comes to build them.
- Mirror (`F`) in addition to rotation, for pastes and plans.

## Non-goals
- Sharing plans as text codes between players.
- Plan books / folders, plan parameters, auto-upgrade of belts.

## Anti-goals
- Normal play must not change: whatever can be paid is still paid at
  placement, exactly as today.
- No silent loss of credits: removing or undoing a ghost refunds what was
  actually paid for it, nothing more, nothing less.

## Approaches
- **Ghosts**: (a) pay what fits at placement, the rest become unpaid sites
  paid when a worker claims them — *picked*, it keeps today's feel;
  (b) every site paid only when a worker starts it — simpler but changes
  normal play and makes the preview cost meaningless; (c) ghost-only "plan
  mode" toggle — one more mode to learn.
- **Library storage**: (a) browser storage shared by all games — *picked*
  (a plan is a player tool); (b) inside each save — plans lost on new game.

## Design
### Ghost sites
- A site gets `site.paid` (true/false). Placement walks the batch in order
  and pays each piece while credits last; the others become ghosts
  (`paid: false`). Single-piece placement works the same way (a belt line
  without enough money: the end becomes ghosts).
- A piece that **replaces** existing pieces (belt upgrade, building over
  belts) must be paid at placement; when it cannot be, it is not placed
  (so a line is never cut while waiting for money).
- Workers only claim a ghost when credits ≥ its cost, and pay it at claim
  time. Paid sites keep priority over ghosts at equal distance (nearest
  first otherwise, as today).
- Remove / undo / cut: refund = cost if paid, 0 if ghost. Redo / undo that
  re-adds pieces goes through the same pay-or-ghost rule (no "not enough
  credits" refusal any more for additions).
- Rendering: ghosts drawn like sites but blue-tinted and more transparent,
  in both views; the minimap shows them faded.
- Preview: affordable pieces green, ghost pieces blue, invalid red; the hint
  shows "coût : X ¢ (dont Y ¢ en fantômes)".
- Top bar workers chip: "n fantômes" next to "en attente"; Station tab
  shows ghost count and remaining cost.
- Saved: `o.s` site progress plus `o.g = 1` for unpaid ghosts.

### Library
- Stored in localStorage `chantier-orbital-plans`: list of
  `{ id, name, w, h, items, created }` (items = the existing blueprint format).
  Not part of the game save / export.
- Save: "★ Garder comme plan" in the Info tab when a selection (or one
  inspected building) is active, and in the Plans tab. Asks for a name
  (default "Plan n° k").
- New side-panel tab **Plans**: one card per plan — top-down thumbnail
  (category colours, belt direction marks), name, piece count, total cost,
  warning when it contains buildings not yet unlocked. Buttons: Poser,
  Renommer, Supprimer (confirm).
- "Poser" loads a copy into the clipboard and switches to the paste tool.
  Locked buildings are skipped at placement (and shown red in preview).
- Mirror `F` (and a toolbar-free hint line): flips the clipboard
  horizontally; directions E↔W, driver targets mirrored. All buildings are
  square, so footprints are unchanged.

## Builder's calls
Thumbnail scale (fit 120×80), exact ghost tint, name dialog look, card order
(most recent first).
