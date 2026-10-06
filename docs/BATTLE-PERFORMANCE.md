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

Both governors judge frames against the loop's target interval, read from Phaser's FPS
limit. Their limits (24 ms missed frames, 22 and 11 ms of frame work, and `RenderQuality`'s
18 ms fast average) are for 60 FPS. Under a 30 FPS cap, from the idle village or the battery
saver, they double. Before this, every capped frame counted as slow. A phone left idle for
about half a minute fell to one pixel per CSS pixel and never recovered while the cap held.
A capped battle would also have dropped to minimal detail. A change of cap restarts the
current measurement window.

### Frame time on very slow devices

Phaser's frame smoothing used to hold the game back on slow devices in two ways. For 120
frames after boot, after the window regained focus, and after the page became visible again
(`panicMax`), it capped every frame's time at about 16 ms. Below 5 FPS (`min`), it replaced
each frame's time with an old value. On a device drawing three frames a second, game time
therefore advanced about 0.05 seconds per real second for most of a minute. The production
smoke test, with a 2× canvas on CI's software renderer, saw a practice raid's 30-second
countdown not move for 15 seconds. Every deploy failed on it from run 48 onward.

`main.ts` now sets `fps: { min: 1, panicMax: 0 }`, so real frame times up to a second reach the
scene. Longer ones, such as the first frame back from a hidden tab, still get a sane
substitute. `VillageScene.update` caps one frame at 0.25 s instead of 0.1 s, so a 4 FPS device
keeps battle time in step with the clock. Battles still advance in fixed `TICK` steps, now at
most five per frame, so results and replays are unchanged. At 3 FPS in local software rendering,
the countdown went from barely moving to 0.75 game seconds per real second.

### Simulation, identical results

- Target choice is one pass over the known buildings with three "nearest" trackers instead
  of three filtered lists.
- Route lists are shared per tick (`routeBuildings`), so the sub-tile collision grid
  recognizes the list without rescanning it.
- Group followers scan a per-tick anchor list with numeric cell keys.
- Native units get a three-field boosted stats object rather than a copy of the stats row;
  unit stats memoize by kind and level without building a key string.

## Second round: frame spikes and the display list

Profiling the same 589-unit battle after the work above (`scripts/battle-load-benchmark.mjs`
had been deploying only half of each troop kind: its loop re-read the shrinking `remaining`
count, so earlier "589-unit" rows measured 295 units) found the remaining time in spikes rather
than in the average frame:

- **Framebuffer creation.** Every pooled drawing context Phaser creates runs
  `gl.checkFramebufferStatus`, a pipeline sync worth ~10 ms on Metal. The Inferno Tower and
  Eagle Artillery views never opted into the GPU group tint, so each beam and glow took the
  filter pass, and the content views of nested groups inherited none of their parent's flags,
  so colored groups inside effects took it too. With the idle prune dropping contexts after 4 s,
  every intermittent effect re-created its framebuffer: 190 ms of the profile in 36 slow frames.
- **Texel bakes.** A hit flash on a unit whose color saturates bakes a recolored texel region on a
  canvas (`getImageData`, `putImageData`, `texImage2D`); several units flashing in one frame
  stalled it for 20 ms.
- **Display list size.** 7,000 objects per frame, of which 2,700 were hidden: the whole army's
  camp sprites, fallback sprites under native meshes, and hidden building images. Four Inferno
  Towers alone were 553 meshes.

What changed:

- Inferno and Eagle views carry group colors as the GPU tint (`gpuGroupColor`), and a group's
  content view inherits every flag of its parent.
- `NativeMeshView.mergeLeaves` (troop, effect and Inferno views): consecutive leaves that share
  a texture, tint, blend and alpha draw as one mesh, strips concatenated in order, so the pixels
  are unchanged and the display list shrinks (Inferno bodies from 138 meshes to a handful).
- `NativeMeshView.bakeBudget` (troop and effect views): bakes past 1.5 ms in a frame are
  deferred; the leaf clamps on the GPU until a later frame bakes it.
- Camp sprites leave the display list for the duration of a battle instead of hiding.
- The camera's visible-children scan is a plain loop (`useFastVisibleChildren`).

Headless Chromium, 1440×960 at 2×, 589 max-level units, CPU time per game step:

| Measure         | Before this round | After          |
| --------------- | ----------------- | -------------- |
| Mean / p50      | 15.6 / 10.5 ms    | 10.4 / 7.7 ms  |
| p95 / p99       | 34.0 / 39.7 ms    | 25.2 / 29.6 ms |
| Worst frame     | 108 ms            | 34 ms          |
| Display objects | 7,037             | 5,893          |

The slow frames that remain are simulation ticks (a 20 Hz tick lands on every third frame):
sub-tile A* is ~40 % of a native unit's step and is already typed-array code with a per-tick
search budget, so cutting it further means changing results, which the replay and historical
suites forbid.

## Third round: simulation stepping, view churn and the home screen

Profiling the same 589-unit battle again (Node CPU profile of the 20 Hz sim; browser CPU
profile of the frame) after the two rounds above:

- **Simulation.** The group-follower anchor search (`groupAnchor`) weighed every living unit
  every tick for twelve Apprentice Wardens; healers and the Battle Blimp filtered and sorted
  the roster per unit per tick; every unit read the `EnabledBySuperLicence` data row and
  every ability unit its alone-radius row per tick; the static super-troop licence lookup ran
  through `troopLevel` per unit step. Defenses scanned all 820 buildings per damage event
  (Invisibility towers), per queued burst shot (`eligible().includes`), per Revenge Tower tick
  and per launched shot (bomb aiming). Garrison defenders sorted the roster per tick and
  rebuilt a non-wall route list per repath, which also defeated the collision grid's
  identity check.
- **Rendering.** Views that end (a unit leaving the screen or dying, a landed shot, a finished
  particle) destroyed their meshes: an O(n) display-list splice each, hundreds per second. The
  village presentation built per-field signature strings for every visible building every sim
  tick, walls included (533 on stage 61). The scene view looked every leaf's mesh up through a
  string-keyed map per frame; troop and village level rows came from a linear `find` per unit
  per frame.
- **Idle home screen.** Profiling (2026-09-26) put the home presentation pass at about 0.14 ms
  of CPU per frame; the cost of an idle village is the full-canvas render every frame. After
  five seconds without input, a battle, a placement, an open dialog or a structural change,
  `VillageScene.updateIdleRate` caps the loop at 30 fps (15 under reduced motion, where nothing
  animates); the home clips run at 24–30 fps, and any input lifts the cap before the next frame.
  With the battery saver on, input lowers the cap to 30 FPS instead of lifting it.
- **Home screen.** Collector ticks bump the model revision every second, so the timed autosave
  ran a full `JSON.stringify` plus a localStorage and an IndexedDB write every five seconds
  while nothing structural had changed. The building card read `offsetWidth`/`offsetHeight`
  every frame right after writing its position, a forced layout per frame while panning.

What changed (results identical: replay, determinism and historical suites, and the Node
end-state hash of the 589- and 400-unit battles, are unchanged):

- `groupAnchor` snapshots living units once per tick and weighs an anchor only when a follower
  in range asks; weights read the snapshot, so they equal a full pass at that moment.
- Healer, Blimp and garrison target choice are single passes with the sort's exact tie-break
  (distance, then id); the super-licence flag and alone radius are cached on the stats rows;
  `superLicence`/`superOriginal` are memoized per kind.
- Spell Towers come from a per-battle list; burst weapons test one unit; ruins are counted;
  bombs alone look their building up; `nonWallBuildings` (`building-lists.ts`) is one shared
  array per battle for garrison, guardian and builder routes.
- `NativeSceneView.retire()` / `NativeMeshView.retire()`: an ending view parks its meshes in
  the scene-wide spare pool (hidden, still listed) and releases its group buffers. The troop,
  projectile and effect presentations retire instead of destroy.
- The village presentation keeps a numeric record per still building (all field exports
  static, no trap, defense body or resource fill) and skips the signature strings while it
  holds. The mesh view publishes `runMeshes` (the mesh per pose index) for the scene view.
- The same-sample fast path also compares texture, tint and blend (a GPU-clamp flag flip left
  a mesh on its old texture until the next tick), and a `gpuSaturate` change reaches existing
  group content views.
- Timed saves follow `structuralRevision` (non-passive changes) and write collector drift once
  a minute; the building card measures once per card and per resize.

| Measure (Node sim, stage 61, half levels)   | Before     | After      |
| ------------------------------------------- | ---------- | ---------- |
| 589 units, 35 kinds: ms per tick mean / p95 | 8.1 / 11.8 | 6.2 / 10.0 |
| 400 classic troops: ms per tick mean        | 1.69       | 1.53       |

The browser benchmark (`npm run test:battle:load`) did not resolve the render-side changes:
alternating `main` and this branch on the same machine gave the same CPU per step (17.3 ms
mean on both in one pair), and thermal throttling moved the next pair by 7 ms. Measure the
rendering changes with a CPU profile (inclusive time of `drawWorld`, `drawUnits` and the
presentations) rather than the frame benchmark.

A lesson from this round: a `WeakMap` keyed by pose objects is only free when the keys are
long-lived shared samples. The effect, projectile and village callers build fresh poses every
frame; caching merged-run indices and flattened lists by those keys fed the collector
thousands of weak keys per frame and doubled the frame time until the caches were removed
(or limited to `flattenDisjoint` views, which draw shared samples).

## Combat events and direct draws

Combat events (`FX`) are queued and drained once per frame, so the hundreds a battle raises share one building lookup. Two places did not get the drain:

- A direct `drawOverlay()` call, which tests and tools use, drew without handling the queue. So a pickup, placement or hit raised just before it never showed or sounded in that draw.
- Village events waited for the next frame and were stamped with that frame's clock.

Two changes fix this:

- A direct draw now drains the queue first.
- At home, where events come one at a time from the player's own actions, `effect()` handles them as they arrive. Their effects and sounds start at that moment, as they did before the queue.

Battle events stay batched.

With this, these cases pass again, all of which failed identically on the commit before:

- the six "home … effects respect reduced motion, mute, cancellation and battle transitions" cases (Mortar, Tesla, Bomb Tower, Wizard Tower, Cannon, Air Sweeper);
- `archer-tower-audio:74`;
- `combat-presentation` 130 and 156.

`combat-presentation:97` still fails as before: it reads battle projectiles right after `model.step()`, with no frame or draw in between.

The 1440 px placement cases of `bomb-tower-handling:71` and `wizard-tower-handling:71` fail about one run in eight, on the commit before as well. A placement's home effect lives one second, and on a slow headless frame the poll for its sound can outwait it.

## Keeping it that way

- A troop art change that adds overlapping additive leaves to a group costs an offscreen
  buffer per unit per frame; keep glow leaves disjoint where the art allows.
- Anything that bumps the model revision every sim tick during a battle restyles every
  building; prefer `changed(true)` for battle events the frame draws already cover.
- Depth writes queue a full display-list sort: guard them with `!==` comparisons.
- Never add per-frame `destroy()` of display objects in the battle layer; park and reuse
  (`NativeSceneView.retire()` for a whole view).
- Cache by object identity (`WeakMap`) only for shared, long-lived samples; fresh per-frame
  poses as weak keys cost more in the collector than the lookup saves.
- `nativeSceneStats` (`globalThis.__nativeSceneStats` in dev builds) counts renders, group
  paints, lifted groups and texel bakes per frame for quick checks in the browser console.
- A new `NativeSceneView` flag must also be copied into group content views (see
  `renderGroup`), or nested groups silently fall back to the slow path.
- A view whose leaves a spec counts (`meshes.size` lower bounds) should not enable
  `mergeLeaves` without rechecking that spec.
