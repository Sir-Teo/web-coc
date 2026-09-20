# Battle performance

Large late-game battles (300–600 units on the biggest campaign layouts, at retina density)
used to run at 13 fps. The work recorded here brought the worst case to a 16.7 ms median
frame and the common large cases to a locked 60 fps, without changing a single simulation
result: the replay, historical-witness and determinism suites pass unchanged, and the
native-art pixel specs still match their source pixels.

## Measurements

Headless Chromium (Metal) at 1440×960 and 2× density, stage 61 "Underground Workaround"
(820 buildings, 533 walls), armies deployed along all four edges, measured after a 3 s warm-up.

| Battle                                       | Before               | After                                |
| -------------------------------------------- | -------------------- | ------------------------------------ |
| 12 of every troop kind (589 units, 35 kinds) | 13 fps, 66 ms median | 41–43 fps, 16.7 ms median, 33 ms p95 |
| 400 classic troops (10 kinds)                | ~30 fps              | 60 fps, 16.8 ms p95                  |
| 320-housing army, Town Hall 18 defenses      | ~50 fps              | 60 fps, 16.8 ms p95                  |
| Draw calls per frame (589 units)             | ~1,500               | ~360                                 |
| CPU per frame (589 units)                    | ~60 ms               | 16–18 ms mean                        |
| Sim tick, 589 units (Node)                   | 9.5 ms               | 7.5 ms                               |

`npm run test:battle:load` reproduces the first row (`scripts/battle-load-benchmark.mjs`;
`--army=mixed|th18`, `--level=max|half`, `--gl` for WebGL counters). The report includes the
CPU time of each game step separately from the frame interval, which vsync quantizes.

## Where the time went

Profiling the 589-unit battle (CPU profile plus per-frame WebGL call counts) found that no
single system dominated; the frame was lost to churn between systems:

- **Draw calls.** Phaser's list compositor finishes the batch twice at every blend-mode
  change between depth-order neighbours, and once at every program change (sprite quads
  versus meshes). Interleaved glow parts, hidden-but-drawn fallback sprites and troop meshes
  produced ~1,500 draws per frame, each with its own vertex upload.
- **Fallback sprites drawn under the meshes.** On level-of-detail frames the troop presentation
  did not hide the unit's fallback sprite, so ~370 sprites drew every frame between the meshes,
  breaking the batch each time.
- **Blend-group buffers.** Every screen/additive group of every animated unit repainted its
  offscreen buffer each frame (~220 paints), and colored groups took a filter pass through
  Phaser's drawing-context pool, whose exact-size buckets churned framebuffers.
- **Mesh churn.** An animation that swaps parts destroyed and rebuilt ~880 meshes per frame
  (each destroy is an O(n) display-list splice).
- **Deploy boundary.** Every destroyed building rebuilt the red no-deploy outline by asking
  `deployBlocked` (an O(buildings) scan) for every tile and its neighbours.
- **Simulation.** Target selection filtered the building list three times per retarget,
  every path search filtered the route list, and group followers scanned all units.

## What changed

### Rendering, exact

- **Additive tint mode** (`native-tint-modes.ts`, `quad-renderer.ts`). Additive leaves and
  additive group images draw with premultiplied color and zero alpha under the normal
  source-over blend: `ONE, ONE_MINUS_SRC_ALPHA` then adds the color and leaves destination
  alpha alone, which on the opaque backbuffer is the native additive mode pixel for pixel.
  Nested content composing into transparent buffers keeps the real blend mode. A frozen part's
  screen tint restores the real additive blend for as long as the status lasts.
- **Disjoint group flattening** (`native-scene-flatten.ts`). A screen/additive group whose
  leaves never overlap is lifted into plain leaves with the group's blend, alpha and color
  folded in: with at most one leaf per pixel, compositing the group first changes nothing.
  Cached per shared pose sample. Troop views opt in (`flattenDisjoint`).
- **Group color as a tint** (`gpuGroupColor`, troop views). Group multiply/add ride on the
  buffer image as the native color tint instead of a filter pass. Within half a step per
  channel of the float filter; building presentations keep the filter, whose source-pixel
  comparisons need it.
- **Mesh recycling.** Vanished leaf keys park their meshes in a scene-wide spare pool
  (hidden, still on the display list, so no splice) and new keys take from it. Troop views
  also park vanished blend groups for a while (`parkGroups`), so blinking effects keep their
  buffers and content.
- **Same-sample fast path.** A shared pose sample drawn again (the frames between 20 Hz sim
  ticks) skips vertex transforms, texture rebinds and group hashing: only origin, depth and
  alpha are written, and the base tint is restored under whatever a status tint combined.
- **Fallback sprites.** Hidden on level-of-detail frames too; a unit with a live native view
  gets only its shadow, health bar and status tint from the sprite pass.
- **Deploy boundary.** The no-deploy zone rasterizes once per change into a tile grid.
- **Sparks** are baked-dot images (Arc shapes flushed the batch per dot); the ruin layer is
  allocated during scouting rather than on the first destroyed building.
- **Sprung traps** are a passive change: only trap sprites restyle, and the HUD patches its
  live counters instead of rebuilding its markup.

### Adaptive detail (`render-detail.ts`)

`RenderDetail` is the larger of a unit-count step (260 and 440 living units) and a pressure
step measured from the CPU time of each frame and from missed vsyncs; pressure rises after a
window of mostly slow frames and eases only after a long calm. The simulation never changes.

| Level | Troop animation                                                         | Trails           | Flash colors |
| ----- | ----------------------------------------------------------------------- | ---------------- | ------------ |
| 0     | Every frame; distant units at a reduced rate past 180 units at low zoom | All              | Baked texels |
| 1     | LOD at any zoom, smaller close radius, near units every other frame     | Every other shot | GPU clamp    |
| 2     | Every unit at the reduced, staggered rate                               | None             | GPU clamp    |

`RenderQuality` (canvas density) is unchanged and still lowers the backbuffer resolution under
sustained pressure.

### Simulation, identical results

- Target choice is one pass over the known buildings with three "nearest" trackers instead
  of three filtered lists.
- Route lists are shared per tick (`routeBuildings`), so the sub-tile collision grid
  recognizes the list without rescanning it.
- Group followers scan a per-tick anchor list with numeric cell keys.
- Native units get a three-field boosted stats object rather than a copy of the stats row;
  unit stats memoize by kind and level without building a key string.

## Keeping it that way

- A troop art change that adds overlapping additive leaves to a group costs an offscreen
  buffer per unit per frame; keep glow leaves disjoint where the art allows.
- Anything that bumps the model revision every sim tick during a battle restyles every
  building; prefer `changed(true)` for battle events the frame draws already cover.
- Depth writes queue a full display-list sort: guard them with `!==` comparisons.
- Never add per-frame `destroy()` of display objects in the battle layer; park and reuse.
- `nativeSceneStats` (`globalThis.__nativeSceneStats` in dev builds) counts renders, group
  paints, lifted groups and texel bakes per frame for quick checks in the browser console.
