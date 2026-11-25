# Minimap and production curves (project 1 of 8)

## Intent
The map is 480×320 tiles: the player needs to see it whole and jump around it.
The Production tab only shows last-minute rates; the player wants to see how a
flow evolves over time, to spot bottlenecks and balance the coming features
(energy, fluids...).

## Approaches
- **Minimap**: (a) a separate canvas overlay in a screen corner, redrawn from a
  cached layer — picked; (b) drawn inside the main canvas by render.js / iso.js:
  would have to be done twice (two renderers) and redrawn every frame.
- **History**: (a) sampled buckets kept in sim.js next to the existing
  one-minute buckets — picked; (b) saved in the save file: more data, little
  value (decided: not saved, history restarts at reload).

## Design
### Minimap
- `<canvas id="minimap">` overlaid in the bottom-right corner, above the toolbar,
  1 px per 2 tiles (240×160), smaller on compact screens.
- Layers: unbought land darkened, ore colours, buildings coloured by palette
  category (Transport / Production / Autres), the Port highlighted.
- Static layer re-baked when the world or land changes (throttled), camera
  outline drawn each frame: the 4 screen corners turned into world cells
  (a diamond in iso view, a rectangle in top view).
- Left click / drag centres the camera there. Key `M` and a toolbar button
  show/hide it (remembered in localStorage).

### Production curves
- sim.js keeps, besides the 1-minute window, a history of produced / used per
  item and income, at 3 resolutions: 1 min (1 s samples), 10 min (10 s
  samples), 1 h (60 s samples).
- Production tab: a window selector (1 min / 10 min / 1 h), an income curve,
  and clicking an item row opens its produced (green) / used (orange) curve
  under the row. Values are per minute.
- Not saved; reset on new game / load.

## Builder's calls
Exact colours, minimap size on compact screens, curve styling.
