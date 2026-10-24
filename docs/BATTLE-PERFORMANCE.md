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

## Software GPU and simulation follow-up (2026-10-24)

A four-CPU Linux runner uses Chromium's SwiftShader software GPU. At 1440×960 and
1× density, the starter village spent only about 4–7 ms of JavaScript per frame but
rendered at 5–7 FPS. The GPU/compositor, rather than the simulation, limited that case.

- The WebGL context no longer requests multisampling. Texture filtering stays linear;
  artwork keeps its alpha edges, while vector/polygon edges use single-sample coverage.
  Two active-village comparisons went from 5.4 → 10.9 and 6.6 → 9.6 FPS. The large
  stage-61 TH18 army's initial window went from 0.8 → 1.5 FPS. These software-renderer
  samples describe this runner, not physical phone performance; the battle populations
  also evolve during the browser measurement.
- Adaptive density can now reduce a 1× canvas, down to 0.5 pixels per CSS pixel, and
  sustained frames up to three seconds no longer reset its pressure window. Loading,
  hidden pages, pauses and held pointers remain excluded. DOM text stays native. See
  [display density](DISPLAY-DENSITY.md) for the quality tradeoff and recovery policy.
  A sustained active-village run reached a 720×480 canvas and 13.7–31.6 FPS in later
  four-second windows, compared with the original 5–7 FPS at 1440×960. Camera framing
  stayed fixed; the canvas became softer while the DOM interface stayed sharp.
- A DOM dialog caps the dimmed village background at 15 FPS. Pointer/keyboard input
  inside the dialog keeps that cap; closing restores play on the next game frame.
  Live battles and replays keep their play rate behind dialogs.
- Tesla reveal, Inferno and Air Sweeper passes use cached layout-order family lists,
  retaining fallen towers so their cleanup still runs. Replacing or growing a layout
  rebuilds the lists. The main defense phase skips attack/status calculations for
  unarmed structures after dispatching native weapons.
- Zero effects volume stops existing voices and skips new effects nodes, sample decodes
  and village sound downloads. It suspends the audio context when music is also off;
  music and haptic feedback keep their own preferences.
- Field checks now use one diamond-shaped TileSprite, with both vertex positions and
  repeating UVs taken at the rectangle's edge midpoints. This removes the two stencil
  passes without another shader, texture or per-frame allocation. Thirty-six camera/viewport
  comparisons across Chromium and WebKit differed from the previous corner-stencil
  renderer by at most one RGB level (interpolation rounding); field edges and later
  objects remain unclipped. Six alternating frozen-village samples averaged 9.32 →
  10.83 FPS on Chromium/SwiftShader (16%); WebKit was approximately unchanged. Reproduce
  the three field renderers with `scripts/performance-check.mjs --compare-field-mask`.

The simulation comparison deploys the same TH18 half-level army around stage 61 and
steps it 400 times at 50 ms, without rendering or audio. Two paired CPU-profile runs:

| Run | Before CPU total | After CPU total | Reduction |
| --- | --- | --- | --- |
| 1 | 3712 ms | 2923 ms | 21% |
| 2 | 3114 ms | 2357 ms | 24% |

All four runs produced battle hash
`30906b448032e01eb6b6b99c898361583ae150f29ec7d6e742764ed9762c37d7`.
This is one workload, not a universal speedup. Run the reproducible CPU-only scenario
with `npm run test:battle:sim`; add `-- --profile` to save a Chrome-compatible profile.
It writes `output/playtest/battle-sim.json` and optionally `battle-sim.cpuprofile`.

Both browser benchmark scripts now count actual Phaser game callbacks rather than
independent browser animation frames: a 30 FPS game cap must not report 60 FPS.
The battle benchmark reports CPU milliseconds per second and canvas dimensions too.
Use `--msaa=on|off` to compare context sampling, `--freeze` to hold the scene after
warmup and isolate rendering, or `--profile` for a CPU profile. Add `--lazyart` to use
production's on-demand art loading rather than the eager developer preload. Run benchmarks alone,
with no tests/build running, and keep viewport, canvas density, army and warmup equal.

Validation for this pass: `npm run check` passed 2,955 tests across 325 files and built
the production app. The selected rendering/audio browser checks passed in Chromium
(28) and WebKit (26, with two Chromium-only input checks skipped). The field/runtime
subset passed again after the diamond change, and the pixel comparison passed in both
engines after removing temporary argument arrays. The compiled Chromium production
check passed online and offline, including army interactions and replay playback.

### Bounding decoded village images

Village changes already release obsolete GPU pages. Their decoded image promises used to
remain cached for the rest of the session. The warm cache now keeps at most 64 MiB of
completed images, estimated from their RGBA dimensions; pending requests remain shared.
Least recently requested pages leave the cache first. Active textures keep their own image
references, including the source needed after graphics-context loss.

In a Chromium test that prefetched every level of 16 building families, retained decoded
images (including active and non-village images) fell from 118.5 MiB to 86.7 MiB after forced
garbage collection. These are pixel-footprint estimates, not measured resident allocations:
renderer RSS stayed around 510–516 MiB, so this test establishes bounded cache ownership,
not lower immediate process memory or higher FPS. The browser can retain its own decoded
surfaces. `tests/browser/village-art-release.spec.ts` exercises the same cache pressure,
checks active textures across graphics restoration, and revisits an evicted page.

Validation covered 2,962 unit tests: the full run passed 2,961 and the campaign audit hit its
timeout while competing with browser checks; that audit then passed all three cases alone
in 60 seconds with its existing timeout. Type checks, documentation links and the production
build passed. All ten selected village recovery/release cases passed in Chromium and WebKit
(the Chromium release subset was rerun alone after one slow assertion exceeded its deadline).
The compiled Chromium online/offline smoke check passed. An additional compiled-app check
visited 227 levels across the same 16 families, released their GPU pages, then loaded an
evicted Town Hall page while offline: four new image decodes completed with no page errors.

### Sharing mesh and sprite batches

Native triangle geometry now enters the sprite batch directly while preserving the original
triangle vertices, UVs, colors and order. A repeated fourth vertex fills the sprite format;
its extra triangle has zero area. This removes batch boundaries between native meshes and
images without requiring a geometry search. [Sprite rendering](SPRITE-RENDERING.md) records
the implementation, exact pixel regression and controlled draw-call comparisons.

The frozen battle benchmark accepts `--mesh-batch=quad` or `--mesh-batch=tri` with `--freeze`
to compare shared root meshes against the retained ordinary triangle handler. Frozen samples
wait for pending native page uploads and run without a frame cap. Compare matching scene
censuses and allow the renderer to warm up; software-renderer timing samples varied widely.

A follow-up upload experiment compared stock `bufferSubData`, replacing the used prefix
with `bufferData`, and orphaning full-capacity storage before upload. Both alternatives
matched the frozen scene's pixels exactly, but neither showed a steady benefit with shared
batching. A longer-warmup Chromium repeat averaged 5.99 FPS for stock uploads versus 5.60
for full-capacity orphaning, with higher callback CPU time for orphaning. The initial cold
stock sample had been misleadingly slow. Stock uploads remain in use.

### Reusing building-goal distance components

Subtile A* now caches the squared X and Y distances from cell centers to a building's
rectangle. A falling building changes the collision grid, while these geometric distances
remain valid. Each searched node adds the two cached components and takes the same square
root as before. Point targets retain their direct calculation. Coordinates and footprint
size form the exact cache key; 64 goals retain at most 96 KiB of axis arrays, and a battle
reset releases them. Heap ordering, costs, range checks and route memoization are unchanged.

The final implementation was compared with the saved original in one Node process, using
separate SSR module contexts, two warmup battles per variant and three alternating measured
runs of 400 fixed steps. Main-thread CPU means were:

| Stage 61 army, half levels | Original | Cached axes | Reduction |
| --- | --- | --- | --- |
| TH18 mixed army | 1778 ms | 1444 ms | 19% |
| Full roster | 2744 ms | 2621 ms | 4.5% |

Both variants retained the earlier TH18 battle hash and full-roster hash
`fb81b2fcba9196805dc6c881a4895a22b381c7b9b7eebdfeaecb5b141c883d87`.
These are workload-specific observations: earlier prototype trials were noisier, and a
timing gain does not establish a change in FPS on a physical device.

The 391-route witness was recorded from the original implementation. It covers four native
layouts, fractional starts, melee/ranged approaches, a falling obstacle, moving/resized goals,
point targets, more goals than the cache holds, and resets. Its SHA-256 remains
`51051fefba698e3b95134b5affb8f11e09570530d19d6ccb587fc8dc9965d583`.
The shared fixture runs in Node, Chromium and WebKit.

For repeatable CPU sampling, use `npm run test:battle:sim -- --warmup=2 --runs=3`;
add `--army=roster` for the second workload or `--profile` for the final measured battle's
CPU profile. The report includes individual runs and main-thread CPU time when Node supports
it. Warmup and setup stay outside timed steps, and repeated battle hashes must match. It also
reports active steps and their median: the full roster can finish before all 400 attempted
steps, making the overall median unrepresentative. The final run is marked when profiled;
compare performance without profiling overhead.

Validation: `npm run check` passed 2,968 tests across 327 files, type checks, documentation
links and the production build. The 391-route digest matched in Chromium and WebKit. Both
engines passed native campaign victory, persistence and replay through the UI; the WebKit
case first exposed a test reading sprites before the next canvas frame, so the test now waits
for those objects explicitly. The compiled Chromium online/offline check passed. Default
TH18 and warmed/repeated full-roster CLI runs retained their recorded battle hashes.

### Reusing heap positions for closed nodes

The pathfinder now stores closed nodes as `-2` in its existing heap-position array. This
removes a separate 9 KiB closed-state array and its initialization and close writes, while
retaining generation stamps and stable heap ordering. Starting another search resets the
first node's position, including after an unsuccessful search.

After two warmup battles per variant, six alternating measured runs per workload compared
this with the cached-axis implementation. Full-roster CPU means fell from 2706 to 2528 ms
(6.6%); mixed-army means were effectively flat, 1441 versus 1456 ms, with equal medians of
about 1437 ms. Earlier mixed-army repeats varied in both directions. Both battle hashes
matched throughout; this establishes smaller scratch storage and a workload-specific CPU
benefit, not a general FPS increase.

Validation passed all 2,970 tests across 327 files, type checks, documentation links and the
production build. Chromium and WebKit retained the original 391-route digest. The compiled
Chromium online/offline smoke check passed.

### Skipping distant melee endpoint calculations

A melee endpoint inside a cell must lie within its half-diagonal of the cell center, and
within the attack range of the target rectangle. A center farther than `max(0, range)` plus
one subtile step therefore cannot contain that endpoint. A* uses its already computed goal
distance to skip the clamps, second distance calculation and endpoint allocation in those
cells. The full-step bound is deliberately looser than the half-diagonal; the original
endpoint calculation still decides every nearby case, including fractional point targets.

With two warmup battles and six alternating measured runs per variant, full-roster CPU
means fell from 2887 to 2642 ms (8.5%), and mixed-army means from 1254 to 1237 ms (1.4%).
Medians were 2748 versus 2623 ms and 1223 versus 1158 ms respectively. Individual timings
varied; these are workload-specific CPU observations. Both recorded battle hashes matched.

An additional 512-route witness was captured before introducing the guard. It covers cell
edges, fractional building and point goals, negative and zero ranges, and ranges on either
side of a quarter tile and half tile. Its SHA-256 is
`cdfd9daccad1c548fa0caa48196443b01387700049f1689a3ebe08d7d45cbde3`.

Validation passed all 2,971 tests across 327 files, type checks, documentation links and the
production build. Both route witnesses (903 routes total) matched in Chromium and WebKit.
The compiled Chromium online/offline smoke check passed.

### Packing retained route coordinates

Route memo entries now store flat numeric arrays of X/Y pairs rather than arrays of
waypoint objects. Coordinates retain JavaScript double precision. Every caller still
receives a fresh waypoint array and fresh objects, so moving or shifting one unit's route
cannot alter another's. Empty memo entries share an internal immutable empty array;
one-point routes use small array literals when stored and returned.

In separate SSR module contexts, 2,304 route queries to 24 stage-61 goals returned 179,061
waypoints with an identical SHA-256 in both versions. After warmup, three alternating
measurements with forced garbage collection compared retained JavaScript heap:

| Route sample | Waypoint objects | Packed coordinates |
| --- | --- | --- |
| Dense layout | 14.05 MiB | 3.30 MiB |
| One-point routes on open ground | 0.68 MiB | 0.58 MiB |

These are retained heap differences after filling the cache, not process RSS or a claim
about FPS. The dense sample retained about 76% less JavaScript heap. The cache limits and
collision-grid lifecycle are unchanged.

With two warmup battles and six alternating measured runs per variant, mixed-army CPU
means were flat (1523 versus 1525 ms); full-roster means fell from 3351 to 3046 ms (9.1%).
Both recorded battle hashes matched. Timing remains workload-specific and noisy: an earlier
prototype run included a large baseline outlier, so it is not used for these figures.

Validation passed all 2,974 tests across 327 files, type checks, documentation links and the
production build. Both route witnesses (903 routes) matched in Chromium and WebKit; the
compiled Chromium online/offline smoke check passed. Mutation tests cover cached one-point,
multi-point and empty routes, including independent waypoint objects on repeated reads.

### Search experiments left out

A four-way heap preserved both recorded battle hashes but raised mixed-army CPU means
from 1524 to 1726 ms while improving the roster sample. Narrowing four index/order scratch
arrays to 16 bits would save 72 KiB on the current map; it preserved the hashes and an
exhaustive-grid search witness, but mixed-army means were slower in both trials. A repeat
with more warmup and garbage collection outside timed steps remained noisy and did not
establish a benefit. Neither experiment changes the runtime implementation.

Keeping heap priorities and insertion order beside heap slots also preserved all 909 route
cases and the exact 734,838-entry pop trace, including 192 decrease-key operations. Node
timings had large outliers. Browser-only 903-route samples were steadier: Chromium means
were 133 versus 129 ms, and WebKit 119 versus 120 ms. That small, inconsistent difference
does not justify the extra rank copies on every sift; the existing layout remains in use.

### Skipping unused support-group selection

Group-following troops now skip anchor selection when they can already attack their target.
They still capture the position snapshot at the same first follower as before: a later unit
in the tick must not measure a different cluster after allies have moved. Only the unused
scan and lazy weight lookups are omitted. Target distance is calculated once and reused.

A focused native-step probe held 32 Apprentice Wardens in attack range with 96 nearby allies
for 400 fixed steps. Instrumented comparisons confirmed 12,800 group calls in both versions;
the candidate skipped all 1,228,800 anchor visits and weight lookups. An uninstrumented
comparison, after two warmups and six alternating measured runs per variant, reduced mean
thread CPU from 257 to 34 ms in this isolated loop. Both versions retained battle SHA-256
`7cb81dc88bafa01e52f0df40491ec9a865e4448a621863e0575b9d902d76022f`.
This is a targeted unit-step result, not an end-to-end battle or FPS measurement.

The standard TH18 and roster benchmark hashes also matched. A work counter showed zero
skipped scans in that roster sample: its Wardens stayed out of attack range before victory,
so its timing differences do not establish the benefit of this guard. The shared regression
probe covers an attacking follower, an ally moving between follower calls, and a refreshed
snapshot on the next tick; movement coordinates were recorded from the original code.

Validation passed all 2,975 tests across 327 files, type checks, documentation links and the
production build. Chromium and WebKit matched the group snapshot's exact coordinates and
both route witnesses (903 routes). The compiled Chromium online/offline smoke check passed.

### Avoiding empty piercing-shot work

The defense hit pass now returns immediately when there are no piercing shots, clearing
its consumed-hit bookkeeping without allocating a live-shot set or requesting a building
index. With active shots, projectile source lookup reuses the building index already read
by the defense hit pass earlier in the frame. A regression check covers duplicate-hit
suppression and a shot returning after an empty frame.

A proposed audio source lookup change was left out. A Chromium sample of 500 frames with
589 initial units compared the existing linear lookup with eagerly requesting the shared
index for each sound event; both included the index build needed by the eventual draw.
Repeated lookups with a stable army improved, but interleaving four appended units with
32 events per frame increased the mean from about 34 to 103 ms by rebuilding the index
several times in one tick. Audio sources retain their existing lookup.

Validation passed all 2,976 tests across 327 files, type checks, documentation links and the
production build. All five defense/projectile loading and retry cases passed in both
Chromium and WebKit, including phone layouts. The compiled Chromium online/offline smoke
check passed.

### Letting phones adapt while the player interacts

The display governor previously disabled measurement whenever a pointer was down. Each
disabled frame restarted its five-second settling period, so frequent taps and pans could
keep a slow phone at full canvas density indefinitely. It now measures gesture frames and
queues a quality decision, applying it only after every pointer is released.

Requested and applied density are separate. A viewport resize during a gesture uses the
currently applied density; it cannot accidentally apply the queued change under a finger.
Only one change waits at a time, and measurement settles again after that size reaches the
canvas. This avoids repeatedly lowering quality based on a buffer that has not changed.
An explicit density ceiling or device-density change clears the pending decision.

All three new integration cases failed against the old implementation and passed after the
fix. They cover held gestures, a viewport change while held, cancellation by a density
setting, and the real governor's settling period after a long deferred adjustment. Browser
checks at 390×844 and 3× density verified that a held pan stays intact, release applies an
878×1899 buffer, camera framing and world zoom stay fixed, and Town Hall tapping still
works. A 0.75-scale step uses about 44% fewer canvas pixels than 1170×2532;
DOM layout retains its native resolution. It is a pixel-work reduction, not measured phone FPS.

Validation passed all 2,979 tests across 327 files, type checks, documentation links and the
production build. The new held-gesture case passed in Chromium and WebKit. Existing 3×
phone input/placement/rotation and framebuffer restoration passed in both engines; Chromium
also passed native multi-touch pinch and live density changes (the two CDP-only cases are
skipped in WebKit). The compiled Chromium online/offline smoke check passed.

### Responding faster to severe phone overload

After the sustained-pressure window, an average frame longer than three target intervals
now halves the current density scale; moderate pressure keeps the quarter-step reduction.
The threshold follows deliberate frame caps, and fast frames keep native quality. At 3×
phone density, the first severe reduction produces 585×1266 instead of 1170×2532: 75% fewer
canvas pixels. Recovery remains gradual. A window also needs at least two observed frames,
so one long stall followed by fast rendering does not trigger a reduction.

Phone-viewport probes at 390×844 and 3× density recorded the real governor requesting 0.5
while held, applying it on release with unchanged world zoom and no page errors. In these
software-renderer samples, Chromium's post-release phase reached 17 FPS and WebKit's 26 FPS;
the earlier quarter-step samples reached about 8 and 20 FPS. Chromium used native touch
injection; WebKit used mouse gestures in a touch-enabled viewport. These are local emulation
observations, not physical-phone frame rates. The frozen-view density comparisons were also
variable but showed substantially less rendering work at 1.5× than 3×.

Tests cover severe phone pressure, frame-cap scaling, the half-pixel floor, cautious recovery
and a single long stall. The held-gesture browser check exercises both 0.75 and 0.5 scales.

Validation passed all 2,981 tests across 327 files, type checks, documentation links and the
production build. Both held-gesture scales passed in Chromium and WebKit; the compiled
Chromium online/offline smoke check passed.

### Sharing repeated building samples within a frame

Buildings with the same graph, export sequence, integer animation frame, controls and root
transform now reuse one pose list during a village render pass. This avoids sampling an
identical animation separately for hundreds of walls. Positions, depth and opacity remain
per building. Invalid placement previews sample separately because they modify their tint.
The map clears each pass and when views are released; it never retains a timeline of samples.

A 390×844, 3× phone-viewport probe rendered 533 level-12 walls through the presentation
without GPU submission. After two warmups, six alternating pairs of 160 advancing animation
frames averaged 491→409 ms in Chromium and 782→566 ms in WebKit, about 17% and 28% less CPU
time. The reference disabled only this map. Each shared run sampled once per frame instead
of 533 times; all 533 views retained their original animation frames. These are isolated
presentation measurements on software-rendered browsers, not physical-phone FPS.

Regression checks cover independent positions, mixed wall levels, placement tint isolation,
different resource-fill controls and a control change without advancing the clock. Chromium
and WebKit produced exactly matching framebuffer bytes for shared versus independent
animated-wall samples at three clocks, including valid and invalid placement previews.

Validation passed all 2,983 tests across 327 files, type checks, documentation links and the
production build. Five village recovery/release cases also passed in each browser, covering
connectivity returns at home and while scouting, page release, and late request completion.
The compiled Chromium online/offline smoke check passed with no page errors.

### Releasing oversized animated blend buffers

An animated group reset its shrink counter on every repaint, so it could keep a large
offscreen texture indefinitely after zooming out or shrinking. The counter now survives
repaints and resets when the allocation changes or content no longer qualifies. After the
existing 120-render waiting period, both the composite and its color-filter source can shrink.
Released textures follow the pool's existing idle/byte limits.

The shrink threshold uses the same four-times-bucketed-area limit as pool reuse. Tiny content
can keep the minimum 34×34 allocation without repeatedly attempting an impossible shrink.
A large source alone also counts toward the waiting period.

Both additive regression cases failed against the old code. In Chromium and WebKit, 140 smaller,
changing animation samples reduced a 226×226 live buffer to 34×34, with the filtered case
reducing both textures. Neither shrank during the first 60 samples; the resulting framebuffer
matched a freshly allocated small render exactly. These allocation sizes describe the
regression fixture, not whole-game memory or physical-phone FPS.
The multiply-blend regression also preserves both output images after the buffer changes.

A separate phone experiment lowered minimum blend-buffer sampling density from 1 to 0.5.
It reduced painted area but gave inconsistent timings across two alternating runs on the
software GPU, so sampling density remains unchanged.

Validation passed all 2,983 tests across 327 files, type checks, documentation links and the
production build. All three shrink cases passed in Chromium and WebKit. Existing Tesla
source-pixel, alpha/lifecycle, WebGL restoration, mixed-batch and shared-wall checks passed
in both engines. The lifecycle harness resolves the running modules' URLs so a Vite update
cannot make it flush a separate copy of the buffer pool.
The compiled Chromium online/offline smoke check passed with no page errors.

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
