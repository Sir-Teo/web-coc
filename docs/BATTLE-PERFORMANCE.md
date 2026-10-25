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

### Keeping static-building caches aligned with placement

The static-building fast path now also checks the projected origin, building kind and
construction opacity. Previously, moving a single static wall could leave its native body
at the old position even though the model and fallback sprite moved. An unchanged wall still
skips sampling and rendering. The regression failed before the fix and now verifies one
initial render, one render after a move, and no repeated renders at either stable position.
Phone touch checks in Chromium and WebKit verify that visible native meshes reach the
placed tile, rather than checking only saved coordinates or object counts.

Root-transform arrays are now created only when a pose sample is needed. The map hit for a
matching building does not construct an unused transform.

Broader render-description caching was rejected. It reduced export lookups from 5,330 to 10
over five passes through 533 walls, but controlled alternating runs slowed Chromium while
WebKit improved. Reusing the previously resolved level row also failed to show a portable
timing benefit. These prototypes are not part of the runtime.

Validation passed all 2,984 tests across 327 files, type checks, documentation links and the
production build. Single-wall and row touch placement and animated-wall pixel comparisons
passed in Chromium and WebKit. The row helper now distinguishes physical camera dimensions
from CSS viewport dimensions, so adaptive density cannot leave it waiting for an impossible
equality. The compiled Chromium online/offline smoke check passed with no page errors.

### Sharing strip vertices while preserving triangle order

Adjacent native strip triangles `a,b,c` and `c,b,d` now use four vertices in the shared sprite
batch. Their element indices preserve both original triangle orders. Ordinary sprites keep
their existing indices, and single triangles, odd strip tails and texture-page changes keep
the previous fallback. Two byte arrays track current and retained index choices (32 KiB at
the current batch capacity). Only changed element-buffer ranges upload, once per batch;
the managed buffer uses a dynamic allocation hint and retains its data for context restoration.
Element updates bind the batch's own VAO first.

The expanded mixed-renderer check compares exact framebuffer bytes across skewed strips,
rectangles, odd tails, page changes, tint modes, rotation, flipped UVs, rounding, capacity
crossings and context restoration. A separate index-count assertion verifies that paired
rectangles use one quad. A simpler cyclic vertex permutation was rejected because WebKit
changed pixels; a rectangle-only version saved too little data for its extra CPU work.

Frozen 390×844, 3× phone-viewport probes held each battle, camera and 195×422 canvas fixed,
alternating the original and indexed batching functions. Both engines produced zero changed
framebuffer bytes in their full battle comparison. Total upload bytes include the extra
element-buffer updates:

| Engine | Original bytes/frame | Indexed bytes/frame | Reduction | Draw calls/frame |
| --- | ---: | ---: | ---: | ---: |
| Chromium / SwiftShader | 2,041,236 | 1,436,812 | 29.6% | 113 in both modes |
| WebKit software renderer | 2,015,504 | 1,408,664 | 30.1% | 90 in both modes |

CPU timings varied substantially across alternating samples. These measurements establish
less transformed/uploaded geometry, not a general FPS or physical-phone speedup. A Chromium
timeline also recorded about five seconds of compositor pixel-readback waits during a
ten-second software-rendered battle, outside the named game functions.

Validation passed all 2,984 tests across 327 files, type checks, documentation links and the
production build. The mixed batching and Cannon, Mortar and Tesla source-sheet checks passed
in Chromium and WebKit (19 cases per engine). Source-sheet helpers now explicitly fix their
canvas density so the adaptive governor cannot change their reference-image dimensions.
The compiled Chromium online/offline check passed with no page errors.

### Removing unused ruin-layer GPU allocations

The ruin decal layer now uses the same unmasked RenderTexture factory as native blend
groups. Phaser 4.2.1's plain constructor allocated two 1536×918 RGBA textures, replaced the
first without deleting it, and added a stencil renderbuffer. Ruin stamps need neither the
orphan texture nor stencil. The layer still allocates during scouting, retains the same
dimensions and world placement, and reuses its texture across battles.

The new path owns one 5,640,192-byte RGBA texture. Removing the orphan and the nominal
8-bit stencil storage saves 7,050,240 bytes (6.72 MiB); driver allocation padding is not
included. Destroying the layer releases its sole texture. This is an allocation reduction,
not a measured phone FPS claim.

At 390×844 CSS pixels and 3× device density, Chromium and WebKit checks compare visible
ruin stamps with the original constructor at two zoom levels, with zero changed framebuffer
bytes. They also verify restoration after context loss, reuse, clearing on returning home,
texture destruction and restoration of the renderer's stencil setting. Five native blend
checks passed per engine. All 2,984 tests across 327 files, type checks, documentation links,
the production build and the compiled Chromium online/offline smoke check passed.

### Measuring again sooner after an adaptive resize

After a requested density actually reaches the canvas, the governor now waits one second
before collecting the next two-second pressure window. The previous five-second pause was
the same grace used for startup and loading; repeating it after every reduction prolonged
overload on a dense phone. Startup, loading, background-gap and frame-cap resets retain their
five-second grace. Held gestures still defer the physical resize, and recovery still requires
15 seconds of fast measurements and raises density gradually.

The display integration test holds a 3× phone under 80 ms frames: it retains native density
during initial settling and reaches the half-pixel CSS floor within 13.5 seconds. The former
post-resize pause took about 21 seconds in the controlled driver.

Frozen-home browser probes used 390×844 CSS pixels at 3× device density, alternating the
original and shortened pause in old/new/new/old order, with 30 seconds per run. The only
override changed settling after an applied resize. Time-weighted mean canvas area was:

| Engine | Original pixels | Shorter-pause pixels | Reduction |
| --- | ---: | ---: | ---: |
| Chromium / SwiftShader | 1,055,772 | 958,857 | 9.2% |
| WebKit software renderer | 1,549,399 | 1,399,463 | 9.7% |

Initial stalls varied, and one shortened-pause run had a higher mean area than its first
reference run. These averages measure canvas allocation over the transition, not total GPU
work or a physical-phone FPS improvement. Every run reported no page errors.

The combined rendering changes passed all 2,989 tests across 328 files, type checks,
documentation links and the production build. Density/input checks passed 12 Chromium cases
and 10 WebKit cases (two native-gesture cases are skipped there), including held-drag requests
at both reduction sizes. The compiled Chromium online/offline check passed with no page errors.
The pixel-test helper now waits for the first rendered camera matrix after a density change.

### Sizing ruin textures for the current layout

Scouting now allocates the ruin target around every building's potential stamps, including
intact buildings and families whose art is still loading. This avoids growth on the first
kill. Bounds keep the original physical pixel grid, guard texels, even dimensions and world
clipping. A later battle resizes and repositions the same target during scouting; a smaller
layout releases the larger allocation. Used targets avoid Phaser's power-of-two repeat mode.

| Layout | Previous RGBA bytes | Cropped RGBA bytes | Reduction |
| --- | ---: | ---: | ---: |
| Starter practice village | 5,640,192 | 567,728 | 89.9% |
| Large campaign stage 61 | 5,640,192 | 1,545,280 | 72.6% |

These are the ruin layer's nominal color-storage bytes, after removing its orphan and stencil;
they exclude driver padding and other game textures. They do not establish a phone FPS gain.

Phone-viewport checks compare the entire original texture with the cropped contents, including
regions outside the camera. Every pixel outside the crop remains transparent. Chromium's
source comparison is exact; WebKit differs by at most one channel level. Final framebuffer
samples at four zooms, including the lowest supported phone scale, differ by at most two levels
from the old texture. Context restoration of the same cropped target is exact in both engines.
The checks also cover reuse through small/larger/small layouts, higher-level camp geometry,
clearing on return home and texture destruction.

Both layout cases passed in Chromium and WebKit. The bounds unit tests and full 2,989-test
suite, type checks, documentation links, production build and compiled online/offline smoke
check passed alongside the adaptive-resize change.

### Keeping battle defender textures out of the home village

Home villages now load late building art without the later defender-character and projectile
pages. A battle or replay that needs them holds its clock and deployment until that payload
has settled. A pending home request can extend to the full battle load; the extension is
discarded if the originating battle has already ended. Explicit full-preload calls keep their
previous behavior.

Defender pages owned by this loader are released after the existing 20-second home grace,
including when the village owns a Monolith or another late building. Building textures stay
loaded. Shared death-effect pages remain available to the smaller garrison art family.
Previously, owning any late building kept the entire character payload resident indefinitely.
Higher-level home Builder huts also stop triggering this combat batch: their home body uses
the village renderer, and the combat hut renderer only handles them in battle.

At a 390×844, 3× phone viewport, a home village with one added Monolith retained the following
new nominal RGBA texture storage. The reference forced the old full-load behavior; the new
run used the implemented loader. Chromium and WebKit reported the same totals:

| Load | Texture bytes |
| --- | ---: |
| Building and battle-character art | 210,526,336 |
| Home building art | 96,065,472 |
| Reduction | 114,460,864 (109.16 MiB; 54.4%) |

The Monolith rendered in both modes, with no WebGL or page errors. These are managed texture
dimensions, including other newly requested home art and small render targets, rather than
process RSS or a phone FPS measurement. Driver padding and browser image-cache retention are
outside the calculation.

The loader keeps module-failure backoff after clearing a completed request, retains ownership
of partially loaded pages for retries, and can retry a failed character page after returning
home. Browser coverage checks both settled and in-flight home-to-battle transitions, cleanup
and fresh GPU texture creation on the next battle, obsolete queued requests, and upgraded-hut
home rendering without the late batch.

All five new lifecycle cases passed in Chromium and WebKit, together with module-retry and
higher-tier hut upgrade/preview/reload checks. The full 2,989-test suite across 328 files, type
checks, documentation links and production build passed. The compiled Chromium online/offline
smoke check passed with no page errors.

### Loading defender bodies for the battle that uses them

Automatic battle loads now select defender animation graphs from the reserve and existing
defenders, recursively including Golemites, Lava Pups and Witch summons. Concealed Ghost Traps
and armed huts add their future Ghost and Builder bodies before either can spawn. Shared
death and projectile graphs retain their existing loading behavior; the smaller boot-garrison
family still owns its Dragon 7 and Balloon 8 bodies. A battle with no possible defenders skips
the character payload entirely, including shared projectiles.

The battle's animation demand is cached by battle identity, and its readiness by loaded-art
revision. Frames do not rebuild the set. Requested animations remain reusable across a quick
roster change, while missing bodies hold the new battle. Home cleanup clears their coverage
and demand cache. Retries include previously attempted animations, including after returning
home. An explicit full-preload call waits for the remaining bodies even when a selective
request is already in flight.

A 390×844, 3× phone-viewport probe entered a practice battle after the Monolith's home building
art had loaded. It staged a Witch 4, Golem 8 and Lava Hound 6, together with their Skeleton,
Golemite and Lava Pup. The reference forced full character loading; the new run used the
implemented automatic demand:

| Engine | Full-load new texture bytes | Selected new texture bytes | Reduction |
| --- | ---: | ---: | ---: |
| Chromium / SwiftShader | 116,208,232 | 12,431,488 | 89.3% |
| WebKit software renderer | 116,208,232 | 12,423,592 | 89.3% |

All six bodies had visible native objects and no missing-texture placeholders in both modes.
The runs reported no drawing, WebGL or page errors. These incremental nominal RGBA allocations
include shared projectiles, the battle's ruin target and small render buffers; they exclude
already-loaded home textures and driver padding. The roughly 99 MiB battle saving is a
separate comparison from the earlier cold-home saving, and does not establish a phone FPS gain.

Six planner tests cover the dependency closure, every supported defender level, trap/worker
requirements, deduplication and unchanged combat state. Nine browser cases check different
successive rosters, explicit full-load upgrades, visible Ghost/Builder bodies, cancellation,
retries, empty defender demand and texture ownership across home/battle transitions.

Validation: `npm run check` passed (2,995 tests in 329 files). The nine lifecycle cases and
six existing art-recovery cases passed in both Chromium and WebKit. The compiled Chromium
online/offline release check passed with no page errors (cache `41a34c63248b`).

### Deferring defender graph data until a defender needs it

Building-only late-art requests now leave the character graph module unloaded. An empty
defender demand also skips that import, including when the battle itself first loads the
building bundle. Real defender demand and explicit full preloads still fetch the graphs before
queuing their textures. The graph module contains 30 source JSON files totaling 4,037,148 bytes;
source bytes describe the data set, rather than its compiled transfer size or retained heap.

A late presentation created at home can meet an already-spawned Builder in a replay while its
first character-module request is pending. The Builder presentation now waits for graph
readiness, as the garrison presentation already does. A browser case holds that request, draws
the pre-existing worker, checks that frames continue and the battle clock stays held, then
releases the request and verifies visible Builder and Archer bodies. The empty-demand case
serves the unused module as an error and verifies that it is never requested. The module
recovery fixture stages an actual Archer so it continues to exercise a required dependency.
Module failures also keep their retry backoff after the building phase is already ready;
concurrent refreshes share that delay. Image failures retain their existing fallback behavior.
Browser-only controls that disabled the two guards reproduced the original problems: five
module downloads instead of one, and a pre-existing Builder throwing before its graph loaded.

A compiled 390×844, 3× viewport comparison against the previous build requested the defender
graph chunk once at home (1,817,507 uncompressed JavaScript response bytes). The new build
requested it zero times. Chromium and WebKit both loaded the Monolith village without page or
HTTP errors. These are decoded response bytes; hosting compression and retained JavaScript
heap have different sizes. The earlier development probes also confirmed that a subsequent
Archer battle loads the graphs successfully.

Validation covered all 11 lifecycle cases and six existing recovery cases in both engines.
`npm run check` passed with two CPUs available (2,995 tests in 329 files), and the compiled
Chromium online/offline check passed with no page errors (cache `9e77ef3d56be`). An earlier
parallel run exceeded two air-campaign sweeps' existing 60-second limits; both passed in an
isolated run and the complete repeat. No timeout limit was changed.

### Loading and releasing individual late building families

Automatic late-art requests now select the building families used by the current village or
battle. The nine-family mask is cached with the existing home revision and battle identity.
Its coverage is separate from character readiness. An in-flight request satisfies identical
callers; a request for an additional family waits for it, then loads the missing art. Explicit
full preloads still include all families. The existing campaign loading trigger is preserved,
including its distinction between level-one huts and the hut renderer available in late battles.

The scene records texture ownership per family. After the home grace period it releases
unused battle building families even if that battle had no defenders, while retaining home
and placement artwork. It rebuilds the presentation against the remaining textures so a later
battle cannot draw an unloaded family's stale view. Failed pages keep their fallback and retry
coverage; reconnect and bounded retry behavior apply to extended loads too.

Late placement portraits now load individually, including each supported Spell Tower level
and weapon. An unavailable higher-level portrait waits for its own image instead of requesting
an unsupported level-one Earthquake portrait. A batch shares a portrait already being decoded
and waits for it before settling, so a failed native body has its fallback available without
duplicating the preview upload.

Phone-viewport probes (390×844, 3× device scale, fixed 0.5 canvas density) reported identical
nominal new texture allocations in Chromium/SwiftShader and WebKit's software renderer:

| Fixture | Full building batch | Selected building families | Reduction |
| --- | ---: | ---: | ---: |
| Add one Monolith at home | 96,065,472 B | 11,487,664 B | 88.0% |
| Practice village with an Archer 9 garrison reserve | 120,950,588 B | 26,962,416 B | 77.7% |

The Monolith comparison forced a full building request against the implemented automatic
loader. The reserve comparison used the same staged Clan Castle and visible Archer before
and after the change. The original foundation garrison batch remains included in both reserve
runs. Both engines retained visible bodies and reported no page or WebGL errors. These are
incremental `width × height × 4` texture allocations, including shared art and small render
buffers, rather than total device memory or a physical-phone FPS measurement. The two rows
are different workloads and their savings should not be added together.

Six selector tests cover the family union, hidden NPCs, hut rules, all building kinds, and
unchanged input state. Five browser cases exercise family extension without reuploading the
original atlases, release/reload with no defenders, queued preview sharing, all 13 supported
cold Spell Tower portraits, and fallback/reconnect behavior with the preview held in flight.

Validation: `npm run check` passed all 3,001 tests in 330 files. The new browser cases and
existing character lifecycle/recovery coverage passed in Chromium and WebKit. The compiled
online/offline release check passed in Chromium, and the compiled late-campaign replay passed
in both engines with matching results and no page errors (cache `5ac717ae8ad0`).

## Loading foundation garrison bodies independently

Dragon 7 and Balloon 8 previously shared one deferred family with Clan Castle effects and
sounds. Any garrison reserve, including an Archer-only reserve, loaded both large body pages.
They now have separate family identities and load from the battle's defender demand. That
includes unspawned reserve troops and existing defenders in recordings without a reserve.
A warm scene can extend from Archer to Dragon to Balloon without reuploading earlier bodies;
the home idle grace releases their source pages and resets each family's readiness.

The shared death effect, particles and samples remain in their own family. If late character
art loaded the common death pages first, the shared family takes release ownership when it
borrows them. Releasing late art cannot delete those pages beneath a loaded foundation
family. Deferred-family completion also clears garrison views that sampled missing pages,
so a newly loaded body appears even when its pose is still unchanged.

In isolated phone-viewport probes (390×844, 3× device scale, fixed 0.5 canvas density), an
Archer 9 reserve allocated **4,336,336 B** of new textures instead of **26,962,416 B** in both
Chromium/SwiftShader and WebKit's software renderer: **83.9% less**, or **21.6 MiB** avoided.
The comparison forced both foundation bodies against the implemented automatic selection;
all other requested families stayed the same. Dragon/Balloon source pages account for the
entire 22,626,080 B difference. Both runs retained the visible Archer and reported no missing
body textures, page errors or WebGL errors. These are nominal incremental RGBA allocations,
not a measurement of total phone memory or physical-phone frame rate.

For the same staged reserve fixture, the building selection and foundation-body selection
steps together reduce new texture allocations from 120,950,588 B to 4,336,336 B (96.4%). This
compares the same workload across the two changes; it does not add the separate Monolith
fixture's savings.

Four phone-sized browser cases cover roster extension, retained source textures, release and
reload, recording defenders, independent failed-body recovery, and shared death ownership.

Validation: `npm run check` passed all 3,001 tests in 330 files. Fifteen related browser cases
passed in both engines, including live Dragon/Balloon death animations and replay seeks at
1440px and 390px. Production checks passed online in Chromium and WebKit and offline in
Chromium; the compiled late-campaign replay matched its recorded result in both engines
(cache `8a20977f7d21`).

## Keeping building presentation code out of ordinary garrisons

An automatic character-only request no longer imports the late building presentation bundle.
The ordinary garrison renderer already draws those troops; its texture and character-graph
requests continue independently. A nonzero building mask, or existing recorded Defending
Builder workers, still loads the late presentation. If an earlier village already loaded a
presentation factory, character-only completion rebuilds from that factory instead of losing
its home building views.

Three phone-sized browser cases cover a cold Archer reserve followed by the first home
Monolith, recorded workers with no building families, and a warm Monolith village visiting a
garrison-only enemy before returning home. The compiled baseline uses a validated Archer
replay through the normal replay-import UI at 390×844 with 3× device scale, without developer
hooks. Both engines fetch 4,785,328 B of late-building presentation JavaScript and 1,817,507 B
of character graphs before this change. The camera is panned to keep the living Archer visible
above the replay controls.

After the change, both engines fetch **zero** late-building presentation modules (**0 B**),
while the character-graph request stays at 1,817,507 B. The replay retains the same living
Archer, with matching position and HP, no page errors, and no exposed developer surface.
The captured phone view still shows its native body. These are decoded JavaScript response
bytes, not total process memory or a physical-phone frame-rate measurement.

Validation: strict type checking and `npm run check` passed all 3,001 tests in 330 files.
Twenty-seven relevant browser cases passed in each engine (three new transitions plus 24
existing loading/recovery cases). The standard production check passed online in both engines
and offline in Chromium, and the compiled late-campaign replay matched its recorded result
in both engines (cache `eaef932c17e9`).

## Fetching presentation graphs by building family

The late presentation entry now prepares only requested building modules. Successful module
loads stay shared, failed loads can be retried, and the presentation uses the prepared families
in its original rendering order. Recorded or armed-hut workers prepare their separate presenter.
Explicit full preloads retain every family. The existing building mask still controls texture
loading and home release; this change also keeps unrelated render graphs out of JavaScript
parsing and retained module data.

The import retry plugin wraps the new family chunks in development and production. A focused
case holds Scattershot code at HTTP 503 while a loaded Monolith stays visible, checks bounded
backoff, then recovers on reconnect. Separate compiled probes verify a successful retry through
a fresh `art-retry=1` URL in both engines without developer hooks or page errors.

For a cold home village with one Monolith at 390×844 and 3× device scale, both engines report:

| Decoded JavaScript responses | Before | Selected presentation modules |
| --- | ---: | ---: |
| Whole page | 12,419,769 B | 8,204,057 B |
| Late building code and its shared helper | 4,785,328 B | 569,532 B |

That is 34.0% less JavaScript across the page and 88.1% less late presentation code. The selected
requests comprise the small entry, Monolith and a generic effect helper; other building
presenters and character graphs stay unfetched. Both runs retain the Monolith and report no
page errors. The numbers measure decoded script responses, rather than process memory or
physical-phone frame rate.

Validation: strict type checking, the production build and `npm run check` passed all 3,001
tests in 330 files. Thirty relevant browser cases passed in each engine, including both new
module checks and existing garrison, worker, Ghost Trap, loading and recovery behavior. The
standard production checks passed online in both engines and offline in Chromium; compiled
late-campaign replays matched their recorded results in both engines (cache `57d689d7db3c`).

## Compact Dragon texture pages

Dragon 5 and Golden Dragon/Dragon 7 now pack overlapping source sampling regions into
versioned atlases. Bounded clustering retains nearby pieces together for compression,
while exact pixel copies, sampling guards and UV translations preserve the native art.
No polygons, transforms, animation clips or simulation data change. The importers retain
the byte-identical original pages for cached modules whose UVs use the previous layout.

| Atlas | Original decoded RGBA | Compact decoded RGBA | Reduction |
| --- | ---: | ---: | ---: |
| Dragon 5 | 21,404,320 B | 13,329,792 B | 37.7% |
| Golden Dragon / Dragon 7 (shared) | 22,313,760 B | 15,955,328 B | 28.5% |

The production lossless WebP cost increases by 6,660 B (0.5%) and 38,438 B (2.8%)
respectively. These measurements describe atlas storage and decoded image size, rather
than device memory usage or physical-phone FPS. The importer checks every source region's
RGBA hash after packing, including transparent RGB. Regression checks compare both
compact and legacy layouts against those regions, preserve graph data and mesh coordinates,
and verify that Dragon 7 and Golden Dragon still share their atlas.

A live Dragon 7 reserve at 390×844 and 3× device scale, with canvas density fixed at
0.5 for comparison, produced the same allocation result in Chromium and WebKit: the
atlas fell from 22,313,760 to 15,955,328 B. All newly allocated texture wrappers in this
fixture fell from 24,784,416 to 18,425,984 B (25.7%), with eight visible native body parts,
no missing textures, zero GL errors and no page errors in both runs. The original-pixel
witness checks passed all 181 troop poses in both engines, including 99 Dragon 7 poses;
forcing single-texture batching and restoring a lost graphics context changed zero
framebuffer bytes. Source PNGs and comparison thresholds remain unchanged.
The frozen Dragon/Balloon presentation digest also remains unchanged: its test translates
only Dragon UVs back to the legacy layout before hashing, while retaining the actual
posed geometry, transforms, colors, blend groups, timing and shadow separation.

Validation: both source importers reproduce the generated JSON/PNG files byte-for-byte;
25 Python importer tests pass. `npm run check` passes all 3,004 tests in 331 files, strict
types and the production build. Five relevant rendering/lineup browser cases pass per
engine. Production delivery checks decode 47 current and compatibility images in both
engines, compare WebP pixels with the source PNGs and reload identically offline in
Chromium. Standard production checks pass online in both engines and offline in Chromium.
A compiled phone-sized replay containing Dragon 5, Dragon 7 and Golden Dragon requests
both compact WebP pages and reaches the same recorded defender state in both engines,
with no page errors or developer hooks (cache `2bfb804b9a64`).

## Sharing the Dragon atlas between presenters

A phone-sized battle containing both Dragon 7 and Golden Dragon uploaded their identical
compact page twice, under separate presenter keys. Their page now resolves to one Phaser
texture key. Each presenter retains its own graph, prefix, transforms, colors and shadow
identification. The Dragon foundation family owns the page while either character needs it;
if the late batch uploaded it first, ownership transfers out of both late release lists.
An unused late-only preload can still release it, and returning home releases the foundation
page after its existing grace period.

At 390×844 and 3× device scale with canvas density fixed at 0.5, the Chromium probe reports
one atlas allocation instead of two, saving 15,955,328 B (15.2 MiB) of nominal RGBA storage.
All newly allocated texture wrappers in this fixture fall from 35,631,668 to 19,676,336 B
(44.8%); a redundant four-byte color texture also disappears. Both native Dragons remain
visible, with no missing textures, page errors or GL errors. These are allocation counts
and dimensions, not driver memory or physical-phone frame-rate measurements.

Phone regression checks exercise simultaneous Dragons with separate shadows, context
restoration, late-first ownership transfer, complete home release and reload, late cleanup
beside a retained home Monolith, and recovery after an atlas request returns HTTP 503.

Validation: all 15 relevant browser cases pass in each engine (four new sharing cases,
seven garrison-loading regressions and four recovery regressions). `npm run check` passes
all 3,004 tests in 331 files, strict types and the production build. The compiled
three-Dragon phone replay reaches exactly the earlier build's recorded defender state in
both engines, with no page errors or developer hooks. Standard production checks pass
online in both engines and offline in Chromium (cache `1b3b6a1bcd77`).

## Sharing the common siege page

The full-roster phone probe found five GPU copies of a single 950×958 characters page,
one for each of Battle Drill, Flame Flinger, Log Launcher, Troop Launcher and Wall Wrecker.
Their source metadata already referenced the same pinned PNG; separate per-kind keys
caused the uploads. These five references now use one texture key, while each machine's
body pages remain separate. Troop cleanup collects retained keys before releasing packs,
so dropping one machine preserves any page another retained machine still references.

That page drops from 18,202,000 to 3,640,400 nominal RGBA bytes when all five packs are warm:
14,561,600 B (13.9 MiB) saved, or 80% of this page's previous allocation. The 589-unit
390×844/DPR-3 roster probe confirms a single upload after the change and reports no errors.
Its animation snapshot changes other buffers' footprints, so the comparison uses this
immutable page rather than attributing the entire texture-memory difference to sharing.

Phone browser cases verify one GPU allocation for all five packs, preserving it while
different retained machines replace one another, context restoration, complete release and
reload, and cancelled late decodes. The source test checks the complete page's pinned
RGBA hash, dimensions and path, and ensures other scene/page keys remain independent.

A compiled phone-sized replay carries the normal three-machine reserve (Flame Flinger,
Log Launcher and Wall Wrecker), deploys one machine and reaches its recorded endpoint.
Instrumenting `texImage2D` on the game canvas confirms three uploads of the shared page
in the previous build and one in the updated build, in both Chromium and WebKit. That is
7,280,800 B (6.9 MiB) less nominal storage in this reserve case. Both engines retain exactly
the earlier troop state and remaining reserve, with no page errors or developer hooks.

Validation: `npm run check` passes all 3,005 tests in 332 files, strict types and the
production build. Five relevant browser cases pass per engine: two new sharing/lifetime
cases and three existing troop-release regressions. The compiled replay comparison passes
in both engines. Standard production checks pass online in both engines and offline in
Chromium (cache `16583ef3499b`). No source artwork, UVs or simulation data change.

## Releasing obsolete home armies

Army prefetch refreshed when the home army changed, but troop-pack cleanup ran only on a
mode or battle transition. Repeated home recipe changes therefore accumulated old graphs
and GPU pages. The scene now clears obsolete troop views and releases packs outside the
new home army before warming it. Pending loads keep their existing ownership guards;
obsolete metadata and image decodes cannot recreate the released pages. This cleanup
runs only at home, preserving the active battle's views and retained army.

At 390×844 and 3× device scale, switching home armies through Electro Dragon, Flame
Flinger, Archer and then empty produced these identical results in Chromium and WebKit:

| Selected home army | Before (RGBA bytes) | After (RGBA bytes) |
| --- | ---: | ---: |
| Electro Dragon | 88,203,616 | 86,187,200 |
| Flame Flinger | 143,832,368 | 55,628,752 |
| Archer | 143,832,368 | 762,184 |
| Empty | 143,832,368 | 0 |

The Archer-only case uses 99.5% less troop-page storage, and emptying the army releases
all 137.2 MiB previously retained by these troop packs. The counters sum actual unique
Phaser texture-wrapper dimensions at four RGBA bytes per texel; they exclude village and
other textures and do not measure process memory or physical-phone FPS. Canvas density
was fixed at 0.5 for comparison. No artwork, animation or simulation data changes.

Phone checks cover returning to an earlier army, emptying it, cancelling obsolete graph
and texture loads, and preserving the same active native view when a home-army update
arrives during battle. Existing troop-release and Cookbook UI behavior are also exercised.

Compiled phone checks repeat the sequence through saved-army buttons in both engines.
Tracking uploads and deletions on the game canvas confirms that obsolete large body
atlases are deleted and the selected army stays correct, with no page errors or developer
hooks. These production counters omit small textures replaced by typed-array color
corrections; the complete wrapper-based measurements are in the table above.

Validation: all nine relevant browser cases pass per engine (four new home-cleanup cases,
three troop-release regressions and two Cookbook UI checks). `npm run check` passes all
3,005 tests in 332 files, strict types and the production build with three workers within
the runner's four-CPU quota. The initially timed-out simulation checks also pass isolated;
no timeout limits change. Standard production checks pass online in both engines and
offline in Chromium (cache `76ae7fe35bdb`).

## Releasing obsolete home heroes and pets

Hero and pet prefetch had the same home-only retention gap: changing a four-slot lineup
or reassigning a pet fetched replacements while keeping every previously loaded baked
atlas until the mode changed. The scene now clears obsolete hero sprites and releases
unneeded baked packs when the required home hero/pet set changes. The existing partial
request ownership drops already-uploaded pages and prevents late responses from recreating
them. Battle updates retain their existing actor views and battle pet requirements.

The phone probe rotates through all six heroes using legal four-slot lineups, returns to
King/Queen/Prince/Warden, then assigns L.A.S.S.I, Unicorn and Diggy to the King and removes
the assignment. Before cleanup, the final four-hero/no-pet selection retained all six
heroes and all three pets: 58,548,840 nominal RGBA bytes across 20 textures. The updated
selection retains only its four heroes: 28,311,552 B across seven textures. That releases
30,237,288 B (28.8 MiB), or 51.6% of the prior storage in this sequence.

Individual pets retain only their current pages: King/Queen/Prince/Warden with L.A.S.S.I
uses 33,040,400 B, with Unicorn 32,692,444 B, with Diggy 36,856,188 B, and with no pet
28,311,552 B. These counters sum unique actual texture-wrapper dimensions at four bytes
per texel; they do not describe browser RSS or physical-phone FPS. The viewport is
390×844 at 3× device scale with canvas density fixed at 0.5. No atlas pixels, animations,
equipment rules or simulation data change.

Compiled phone checks repeat legal lineup and pet changes through saved-army buttons,
tracking image uploads and texture deletion on the game canvas. The baseline retains
58,548,840 B after returning to King/Queen/Prince/Warden with L.A.S.S.I. Both engines now retain
33,040,400 B for that selection, releasing 25,508,440 B (24.3 MiB, 43.6%). The selected
army remains correct, with no page errors or developer hooks.

Validation: all ten relevant browser cases pass per engine (four new home-cleanup cases,
three hero-release regressions, two hero/pet UI checks and one baked-art smoke check).
`npm run check` passes all 3,005 tests in 332 files, strict types and the production build.
Standard production checks pass online in both engines and offline in Chromium
(cache `5796a2d4ced3`).

## Reusing support-group snapshot storage

The refreshed phone battle profile still shows group-following support selection as CPU
work. Each tick previously allocated a new snapshot object, three position/housing arrays,
three maps, an anchor list and arrays for occupied cells. The cache now reuses that storage
within its battle. Typed buffers grow when living units exceed capacity; empty cell lists
return to a pool. Every refresh clears the old cells, indices, weights and anchor references
before rebuilding the same snapshot in unit order. The first-follower capture time, distance
arithmetic and tie order stay unchanged.

A focused moving-support probe runs 32 Apprentice Wardens with 96 Giant allies for 1,000
fixed steps. After 20 warmups per variant, six alternating samples per variant averaged
177.1 to 157.6 ms in Chromium (11.0% less) and 102.2 to 93.7 ms in WebKit (8.3% less).
These are isolated loop timings on the runner, not physical-phone FPS. All samples retain
SHA-256 `ca8df6ca1101b71bd368ebffde2c0cfb1664264dbaf3a94945091369ed2b4115`.
The standard TH18 and full-roster fixed-step battle hashes also remain unchanged; their
timing variation does not establish a whole-game improvement.

The shared lifecycle witness records movement from the original implementation. It checks
an arrival wave within the current tick and the following tick, buffer growth, deaths that
shrink the living set, and replacement anchors in different cells. Both browser engines
pass it and the existing first-follower snapshot witness with exact coordinates.

A separate indexed-weight lookup experiment was discarded. It helped Node and WebKit,
but the longer Chromium run regressed from 167.3 to 175.6 ms. Plain-array weights also
regressed, so the existing map-based lookup remains.

Validation: `npm run check` passes 3,006 tests across 332 files, strict types, documentation
links and the production build. Both exact-coordinate group browser cases pass in Chromium
and WebKit.
Standard production checks pass online in both engines and offline in Chromium
(cache `b1614d3641dc`).

## Cancelling obsolete troop downloads and decodes

Home army changes and returns from battle previously retired stale pack identities, but
their metadata fetches and image decodes continued. Troop metadata now has an abort signal;
level requests track their pending image elements and switch them to a local transparent
pixel when released. This settles the old decode promise in both engines without another
network request; simply removing the source can leave Chromium's promise pending.
Shutdown does the same. Completed texture sources remain intact for drawing and graphics
restoration. Request identity guards also cover level completion, so cancellation and a
fresh selection cannot clear each other's work. A failed page cancels the other pending
decodes in its batch before the existing retry path runs.

This matters for large packs: the Electro Dragon source graph is 2,002,659 bytes, and its
two source PNGs total 18,523,712 bytes. Savings depend on what is still pending and what the
browser has already cached; these source sizes are not measured transfer savings.

An actual streaming-image probe sends 1 KiB before withholding the remaining body. WebKit
rejects the original image decode promise after source removal, but keeps fetching the
image for its cache; empty and data-URL replacements behave the same. An aborted fetch
closes the streaming response at 1 KiB. Chromium also closes image transfers at 1 KiB; a
local replacement settles its pending decode promise. Browser tests check early decode
rejection in both engines, metadata request cancellation in both, and image request cancellation in
Chromium. They retain the GPU cleanup and immediate-reselection checks and exercise a
shared siege page while one pending pack is cancelled and another is retained.

Validation: all fifteen relevant browser cases pass per engine, including metadata/image
retry, pending shared ownership, context restoration, phone fallbacks and scouting prefetch.
`npm run check` passes all 3,006 tests across 332 files, strict types, documentation links
and the production build.

Compiled phone checks use the saved-army buttons to select Electro Dragon, switch to Archer
while metadata or a body page is held, then select Electro Dragon again. Both engines keep
the selected army correct, drop obsolete uploads and load the reselected troop without
page errors or developer hooks. The response stays held until scene cleanup has occurred;
the UI selection alone can update before the scene's next frame.
Standard production checks pass online in both engines and offline in Chromium
(cache `462aa6b907ee`).

### Hero packing experiment

A temporary lossless packing experiment would reduce all six heroes' nominal texture
storage from 40,894,464 to 25,186,432 B (15.0 MiB, 38.4%), with compressed images growing
1.6%. Every nontransparent source pixel reconstructs exactly, and all 156 unique frames
render identically at native size in Chromium. Cropping the quad bounds changes scaled rasterization,
however: the fractional-scale Chromium sample differs by up to 46/255 in individual
channels; WebKit differences stay within 1/255. The experiment is not applied. Shipping
hero sheets and their frame geometry remain unchanged.

## Loading only requested character graphs

Texture loading already selected the required defender bodies, but the first character
request still imported every character graph. A compiled phone replay with one Archer 9
downloaded a 1,819,883-byte character module in both engines, plus the required 177,876-byte
castle module. The character module held 30 source JSON files totaling 4,039,524 bytes.

The loader catalog now imports each of its 22 body graphs independently. Shared death and
projectiles remain one lazy module; these eight JSON files total 458,386 source bytes, and
the Archer body adds 54,530. Automatic battle requests use their transitive defender demand;
the foundation families request shared data, Dragon 7 or Balloon 8 explicitly. An omitted
roster retains the full preload. Successful entries retain identity and catalog order;
concurrent body requests share their promise and failed requests remain retryable.

Readiness is per body as well as shared data. A ready shared module cannot make a pending
worker or Archer graph look available. The pose and bar-height guards keep rendering frames
while the battle clock waits for all required art. Shared and body graph imports retain the
retry wrapper, including a production-build assertion for the new shared module. Captured
graph contents, texture namespaces, shadow sets and simulation data do not change.

The same compiled Archer replay now loads a 4,354-byte loader catalog, a 183,216-byte shared
module and a 25,165-byte Archer graph: 212,735 bytes of character JavaScript, 88.3% less.
Including the unchanged castle module, newly loaded replay JavaScript falls from 1,997,759
to 390,611 bytes (80.4%). Both engines report the same payload sizes and exactly matching
defender identifiers, positions, health, targets and finished state, with no page errors or
developer hooks. These are decoded JavaScript payload sizes, not compressed network bytes
or physical-phone FPS. The character path uses three small requests instead of one large
request; startup precaching remains 15 files and 7.4 MB.

All 22 loading cases pass per browser engine. They cover the requested raw graph URLs,
roster extension, full preload during a selective load, held bodies after shared data is
ready, worker presentation, backoff/reconnect, returns home and recordings without reserves.
Unit coverage preserves alias entry identity and catalog order and retains the frozen
character and garrison presentation witnesses.
`npm run check` passes all 3,009 tests across 333 files, strict types, documentation links
and the production build, including the required shared-module retry wrapper.
Standard production checks pass online in both engines and offline in Chromium
(cache `5d87fe0ca84f`). A separate compiled phone check reloads offline and imports the
same cached Archer replay: its battle state matches exactly and its body texture uploads
from cached assets, with no page errors or developer hooks.

## Cancelling obsolete hero and pet work

Baked hero and pet requests had the same pending-work gap as troops. Changing a home lineup
or leaving a battle dropped stale request identities and partial uploads, but the metadata
fetch and pending image decodes still completed. Each baked request now owns an abort
controller, its pending image elements and the texture keys it uploaded. Release or shutdown
invalidates that request before cancelling its fetch and decodes and removing its partial
textures. An old completion cannot clear a fresh request for the same actor.

Troops and baked actors share the local-image cancellation helper. Only unregistered image
elements are replaced; completed texture sources remain intact for drawing and context
restoration. A genuine failed atlas still backs off and retries, while cancelling the other
pending pages in the batch. WebKit's image-cache transfer limitation remains: decode work
stops immediately, but the browser may complete the image transfer for its cache.

The stronger King metadata and image checks both fail against the original loader. They now
require a cancelled metadata request or a rejected decode before the held image body arrives,
retain the partial-upload byte checks, and reselect the King immediately. Its four source
strips total 9,437,184 nominal RGBA bytes; actual avoided work depends on which pages were
pending and which the browser already cached. No atlas pixels or simulation values change.

The full check passes all 3,009 tests across 333 files, with 26 relevant browser checks per
engine covering cancellation, retries, shared pages and retained battle actors. A production
phone-viewport probe switches saved lineups through normal preset controls while metadata or
an image body is held. Both engines reject obsolete decode work, leave no obsolete King atlas
uploads and reload the King when reselected, with no page errors or developer hooks. Chromium
also aborts the held image transfer; WebKit may finish that transfer for its cache.
Standard production checks pass online in both engines and offline in Chromium with cache
`ac69fd388156`.

### Further pathfinding experiments

A fresh 589-unit phone-viewport profile still identifies subtile A* as the largest single
simulation function. Precomputed grid neighbors preserve all 903 recorded routes, but add
90 KiB of scratch storage for only about 1–2% improvement in the paired whole-battle CPU
samples; that experiment is not applied. Moving heuristic initialization to first discovery
also preserves the routes and whole-battle hashes. Variants that remove redundant predecessor
and cost initialization improve some Node and WebKit samples but slow Chromium's mixed-army
workload. They are not applied. The existing pathfinder remains unchanged.

## Loading later projectile graphs with their characters

The first character request still imported the Bowler, Witch and Lava Hound projectile graphs
inside the shared module, even for an Archer-only roster. These three graphs now import
independently. Catalog character rows determine which groups each requested animation uses;
the existing transitive roster includes summons and secondary troops. Common death and the
original projectile files remain shared. An explicit full character preload still loads all
three groups.

Concurrent requests share each group's promise; successful entries retain their identity and
the original group order, and failures clear their pending marker for the existing retry
policy. Body readiness includes its required groups. Recorded shots independently guard
their projectile and shadow graphs while loading is held. No graph contents, texture keys,
projectile timing or simulation values change.

The compiled phone-viewport Archer replay loads a 71,788-byte common module instead of
183,216 bytes. Including the unchanged 4,354-byte catalog and 25,165-byte Archer body,
character JavaScript falls from 212,735 to 101,307 bytes (52.4%). Including the unchanged
177,876-byte castle module, newly loaded replay JavaScript falls from 390,611 to 279,183
bytes (28.5%). Chromium and WebKit report identical payload sizes and exactly matching
defender identifiers, positions, health, targets and finished state, with no page errors or
developer hooks. These are decoded JavaScript payload bytes, not compressed transfers or
physical-phone FPS. Startup still precaches 15 files and 7.4 MB.

All 26 loading cases pass per browser engine, including held projectile graphs and recorded
shots for each group, projectile reconnect recovery, body failures, roster extension and
explicit full preload. The full check passes 3,011 tests across 333 files, strict types,
documentation links and the production build. Unit coverage checks independent group
extension, retained entry identity and projectile demand for every supported defender level.
Standard production checks pass online in both engines and offline in Chromium (cache
`726080d8b5d7`). A separate cached Archer replay also reloads and completes offline with an
exact state match and an uploaded body texture, with no page errors or developer hooks.

## Sharing the troop skull page

All 59 troop `characters` graphs that declare texture 2 reference the same 128×43 skull,
ghost and blur page. They now use one canonical texture key, so the texture manager uploads
it once while any retained pack needs it. Other scene namespaces and texture numbers keep
their own keys. Source images, UVs and graph geometry do not change.

The fixed 589-unit roster scene previously held 31 GPU copies of this 22,016-byte page:
682,496 nominal RGBA bytes. The shared variant holds one copy (22,016 bytes), removing
660,480 bytes, or 645 KiB, in both engines. Draw calls remain 110 per frame in this scene;
this is a storage reduction, with no measured FPS claim.

Within one frozen scene per engine, a baseline/shared/restored comparison redirects the 31
source wrappers to one identical uploaded page and then restores them. All three raw canvas
RGBA hashes match exactly, with zero changed channels and no page errors. Holding simulation,
detail, tweens and sprite animations avoids time-based frame changes; independent cold loads
still have small initial-presentation differences, so their pixel hashes are not compared as
evidence for this change.

The source regression checks every affected pack's path and dimensions and pins all 22,016
RGBA bytes. Browser coverage checks shared ownership across troop changes, context restore,
release after the last owner, cancelled decodes and a retained pack still waiting on the page.
The served-graph check also verifies every remaining texture-2 slot after development paging,
so a generated page cannot silently share the wrong image. All 15 relevant browser cases
pass per engine. The full check passes 3,012 tests across 334 files, strict types, documentation
links and the production build.

Compiled phone checks load five troops through saved army presets, retain Witch alone, switch
to Miner and clear the army through the normal toolbar. Both engines keep one 22,016-byte
page, preserve its handle while Witch stays selected and remove it after clearing the army,
with no page errors or developer hooks.

Standard production checks pass online in both engines and offline in Chromium (cache
`4b48a9d4a3e0`).

### Group distance precheck experiment

A bounding-box rejection before the existing exact group-following distance checks preserves
the focused support-unit battle hash, but slows both Chromium and WebKit in the warmed
32-Warden/96-Giant workload. The extra comparisons are not applied; the existing distance
checks remain unchanged.

## Sharing the level-one wall upload

The base `wall` texture and `wall-level-1` both uploaded the same 192×256 image with identical
single-frame definitions, premultiplied alpha and Y orientation. Level-one walls and placement
previews now use the existing `wall` key. Their per-level preload owns that image, and the
generic building-base preload skips walls. Levels 2–8 keep their distinct keys and artwork.

The duplicate previously held two GPU textures totaling 393,216 nominal RGBA bytes. One
upload uses 196,608 bytes, removing 192 KiB. A baseline/shared/restored comparison within
the same frozen scene in each browser redirects the level-one source to the base upload
and restores it. All raw canvas hashes match exactly, with no page or WebGL errors. No
image bytes, frame geometry, material colors or wall positions change.

Unit coverage checks canonical level-one and invalid-level keys alongside the existing
eight-image pixel checks. Browser coverage checks all materials, instant upgrades, mixed
movement, destruction, high-level movement, new-wall placement, deferred fallback sprites
and the single upload before and after WebGL context restoration on a phone viewport.
All 11 relevant browser cases pass per engine, including native wall movement and placing
a free wall run that survives reload. The full check passes 3,012 tests across 334 files,
strict types, documentation links and the production build.

A compiled phone probe uses the normal Shop and placement controls. Startup, new-wall
preview, cancellation and reload each retain one 196,608-byte wall source in both engines,
with no page errors or developer hooks.

Standard production checks pass online in both engines and offline in Chromium (cache
`e8c86bf838ab`).

## Phone previews load artwork on demand

The default development page previously preloaded every deferred defense family and walk
sheet even on a phone. Coarse-pointer previews now use the same demand loading and idle
release policy as production. Desktop development keeps its visual gallery preload;
`?eagerart` explicitly enables it on a phone, and `?lazyart` overrides either default.

Fresh 390×844, 3×-density browser contexts show 391 GPU textures and about 290.8 MiB of
nominal RGBA storage with the old eager preload, versus 92 textures and 33.4 MiB with demand
loading in both Chromium and WebKit. This avoids 299 unused uploads and about 257.4 MiB
(88.5%) of texture storage in a starter village. The same probes report no page errors or
context loss. These are software-browser resource counts, not physical-phone FPS or total
process-memory measurements. Production already uses demand loading; this change improves
the phone development preview.

The actual default page after the change holds the same 92 textures in both engines.
Four loading cases per engine cover phone startup, a newly requested battle defense,
the explicit gallery, lazy-over-eager precedence and the desktop default. Adjacent checks
pass for army touch controls, battery saver and village objects, plus Chromium's two
momentum-pan cases and WebKit's three browser-gesture cases (14 cases in Chromium and
15 in WebKit overall). The pan checks compare the visible world center, since adaptive
density changes physical camera offsets while preserving that view.

The full check passes 3,012 tests across 334 files, strict types, documentation links and
the production build. All 3,743 compiled files are byte-identical to the preceding validated
wall checkpoint, including offline cache `e8c86bf838ab`; the production online checks in
both engines and Chromium's offline checks therefore cover the exact same build.

## Linear animation age setup

The native pose sampler records how long each child has been present in a looping source
timeline. Its first request previously walked backward from every visible frame, taking
quadratic work for a continuously present child. It now finds an absence once and makes one
circular pass. A child present throughout the loop keeps the existing `-1` marker and its
continuous clock; disappearing children retain their wrapped ages and initial-frame clamp.
The graph/clip/slot cache and every sampled pose stay unchanged.

An exhaustive comparison covers all 8,191 binary presence patterns of lengths 0–12. Real
asset coverage compares 339 exports across 160 troop and defense graphs at six timestamps,
including 1,000 seconds: all 2,034 complete poses match in Node, Chromium and WebKit. The
Node pose hash is `cf4121fdcf26320ab62738d45ab212f50eacee0c6b2c7c11e8739c9a90162527`.

Warmed JavaScript engines sample each export at three times using a fresh graph wrapper,
so its age tables are cold. Alternating baseline/candidate runs report these mean setup and
sampling totals; image loading and rendering are excluded:

| Engine | Backward scans | Circular pass | Reduction |
| --- | ---: | ---: | ---: |
| Node, six samples | 24.18 ms | 12.36 ms | 48.9% |
| Chromium, eight samples | 21.73 ms | 6.79 ms | 68.8% |
| WebKit, eight samples | 12.38 ms | 6.63 ms | 46.5% |

This removes first-use setup work; cached frame sampling already reuses the table. These
isolated CPU timings do not establish a physical-phone FPS gain. The regression case checks
continuous and reappearing nested children, mismatched parent/child loop lengths, a very old
clock and rewinding. All 47 focused source-pose and composition cases pass before and after.

Repeated sampling with already-cached tables was checked separately. Chromium's longer,
alternating runs varied around parity; WebKit's samples were lower with the circular pass.
An alternate packed-table allocation did not establish a portable improvement and is not
applied. No warmed-sampling speedup is claimed.

All eight relevant browser cases pass per engine: exact mixed triangle/sprite pixels across
pages, flushes and WebGL restoration; shared animated-wall pixels and preview tints; failed
X-Bow and Wizard Tower graphs; and failed troop/hero metadata and images recovering in place.

The full check passes 3,013 tests across 334 files, strict types, documentation links and
the production build.

Compiled phone checks import an Archer-garrison recording through the normal battle log,
seek to completion and pan the field. Both engines reproduce the preceding build's exact
defender positions, health, targets and completion state, with no page errors or developer
hooks.

Standard production checks pass online in both engines and offline in Chromium (cache
`8449f6ef7353`).

## Reusing complete animation loops

Shared pose keys previously kept increasing with the source clock even when the complete
animation repeated. The sampler now reuses the frame key after the parent and every
continuously present child complete their independent loops. Removed children retain their
placement-age reset; a warmup keeps the first loop's initial clamp distinct. The sampler
still receives the original clock and returns the same read-only geometry and colors.

Period metadata has weak graph ownership and bounded analysis: integer FPS up to 240,
periods up to 4,096 source frames, warmup up to 65,536 frames and depth up to 32. Unsupported
graphs and source frames above one billion retain their raw keys. First-loop draws bypass
analysis, as do clamped non-looping animations. Cached lookups allocate no traversal set.
The existing 512-entry pose-cache limit, control keys and root-transform keys are unchanged.

The typed implementation matches 100,996 complete source-pose comparisons across 337 real
animation exports, plus 18,306 cached-pose comparisons covering named controls, flipped and
sheared roots, old clocks and rewinds. Seven unit cases cover nested loop periods, initial
placement clocks, different FPS, controls and transforms, raw-key fallbacks, cyclic metadata
and the existing cache bound.

In an isolated repeated-sampling workload (59 troop exports, 600 source frames, two warmups
and eight alternating samples), Chromium's mean falls from 170.26 to 27.26 ms and WebKit's
from 242.25 to 42.88 ms. Both browser probes compare 2,034 cached outputs with the baseline.
A separate first-draw check across 339 exports reports 5.87 ms mean for the baseline and
5.30 ms for deferred analysis; first-use period analysis had cost extra work before it was
deferred.

A fixed 589-unit scene advances only its animation clock for 600 presentation calls, keeping
simulation positions and the camera fixed. Alternating runs retain 24,806 pose arrays and
97,269 top-level poses with raw keys, versus 4,706 arrays and 27,250 poses with repeat keys
in both engines. That is 81.0% fewer arrays and 72.0% fewer top-level poses. Presentation CPU
means remain close and variable (Chromium 11.90 versus 11.68 seconds, WebKit 26.17 versus
26.07 seconds), so this does not establish a whole-game FPS gain.

In the same Chromium scene, clearing the previous probe cache and collecting garbage before
each variant, then collecting again before measuring retained heap, gives 167.5 MB with raw
keys, 149.4 and 149.5 MB with repeat keys, and 169.1 MB after restoring raw keys. This is
about 18–20 MB less retained JavaScript heap, not total browser or physical-phone memory.

Settled framebuffer comparisons at 2, 7, 15 and 30 animation seconds match exactly when
switching raw/repeat/raw keys in both engines. Initial repeated baseline draws had small
one-byte differences before settling; the probe waits for complete staggered updates and
compares pixel bytes inside the page. The real-Archer regression also checks visible output,
shared array identity, immutability, independent sampling and context restoration.

All nine relevant browser cases pass per engine, including the real-Archer regression,
mixed batching pixels, shared animated walls and failed graph/image recovery. The full
suite passes 3,020 tests across 335 files alongside strict test typing and documentation
validation.

The production build passes. Compiled phone checks import an Archer-garrison recording
through the normal battle log, seek to completion and pan the field. Both engines match the
preceding build's exact defender positions, health, targets and completion state, with no
page errors or developer hooks.

Standard production checks pass online in both engines and offline in Chromium (cache
`be29162c6180`).

## Dropping obsolete queued family loads

A deferred family could finish preparing its graph after the player left a battle, then
fetch, decode and upload every image even though the home village did not draw it. Families
now recheck current demand before preparation, after preparation and before starting a batch
that waited for the Phaser loader. Obsolete requests are removed without setting loaded or
failure flags. Later uses request them normally; home buildings, new battles and extra
`needed` demand retain their families. Eager development galleries retain their full preload.

A 390×844, 3×-density probe scouts stage 40 while holding the Mortar graph request, returns
home through the normal button and then releases the graph. Both engines previously started
54 image requests after returning home. The unneeded Mortar family alone uploaded 23 textures
totaling 20,882,148 nominal RGBA bytes (about 19.9 MiB). After the demand checks, both engines
start zero image requests and retain zero Mortar uploads in that scenario, with no page errors.
This avoids queued work; already-started image batches retain their existing loading policy.

Browser regressions cover loading the canceled family in a later battle, a retained home
building, a new battle retaining an old request, a prepared family waiting for the loader and
a canceled placement queued behind another graph skipping its own import entirely.

All 16 relevant browser cases pass per engine, including the existing first-use, retry,
release/reload, garrison and explicit eager/lazy gallery cases.

The full suite passes 3,020 tests across 335 files, strict test typing and documentation
validation.

The production build passes. In both engines, a compiled phone probe opens a Mortar preview
through the Shop while its graph chunk is held, cancels it and releases the chunk: no Mortar
upload follows. Opening the preview again then uploads 21 Mortar image sources totaling
19,502,336 nominal RGBA bytes normally, with no page errors or developer hooks.

Standard production navigation and replay checks pass in Chromium and WebKit. Chromium also
passes the offline reload and replay checks using cache `539ce27b6967`.

## Loading Mortar portraits for the levels in use

The native Mortar family previously uploaded all eighteen level portraits alongside its
mesh pages. Ordinary play now batches only the current village's levels and the Level 1
placement portrait. A later level fetches its portrait through `LazyTextures`; the full eager
development gallery retains all eighteen. The first family batch owns its initial portraits,
and idle release waits for any later portrait decode before removing the family's textures.

In the same fresh 390×844, DPR 3 phone scenario in Chromium and WebKit, scouting stage 40
draws two level-6 Mortars. The family drops from 23 textures / 20,882,148 nominal RGBA bytes
to seven textures / 13,441,764 bytes. Its portraits drop from eighteen to two, saving
7,440,384 bytes (about 7.1 MiB), with both native towers still drawn and no page errors.
These are texture-storage measurements in software browsers, not physical-phone FPS.

All 31 selected browser cases pass per engine, covering owned boot levels, individual later
portraits, move-preview refresh, pending-decode release/reload, the eager phone/desktop
gallery, deferred-family cancellation/retry and every Mortar level's original pixels and
construction states, including WebGL context restoration.

The full check passes 3,020 tests across 335 files, strict source/test typing, documentation
validation and the production build.

A compiled phone probe in both engines boots a valid village with level-6 and level-18
Mortars. WebGL upload tracking sees only portraits 1, 6 and 18, totaling six sources /
12,526,976 bytes in the Mortar URL namespace (two shared pages live under Bomb Tower URLs).
Restoring a starter village through the normal import UI releases all six; restoring the
Mortars reloads the same six, with no page errors or development game hooks.

The dedicated Mortar production check passes in both engines, including level-18 modern
replay, version-34 level-1/6/10 replays, export/reseek equality and Chromium offline replay.
Its asset probe now requests the shipped WebP paths instead of the removed PNG copies.

Standard production navigation and replay pass in Chromium and WebKit, including Chromium's
offline reload/replay using cache `2bd738f1ed0e`.

## Loading X-Bow and Wizard Tower portraits for the levels in use

X-Bow and Wizard Tower batches now select the current village's levels plus placement Level 1.
X-Bow includes both ground and ground-and-air modes for each selected level; later lazy
portraits use the requested mode's URL. The eager development gallery retains every level.
Both families own their possible later portrait keys and use the decode-aware idle release
policy already used by Mortars.

Fresh 390×844, DPR 3 phone probes each boot a valid village with one level-6 defense. In
Chromium and WebKit, the X-Bow family drops from 29 textures / 40,374,876 nominal RGBA bytes
to seven / 28,406,876 bytes: four portraits replace 26, saving 11,968,000 bytes (11.4 MiB).
The Wizard Tower probe in both engines drops from 23 textures / 15,934,492 bytes to eight /
7,726,492 bytes: one higher-level portrait replaces sixteen, saving 8,208,000 bytes (7.8 MiB).
These counts cover family-owned native pages and per-level portraits; existing separate base
sprites are outside that census. They measure texture storage,
not physical-phone FPS.

All 42 selected browser cases pass per engine, covering current-level boot, later move-preview
portraits, pending-decode release/reload, eager galleries, mode persistence, failed graph/page
recovery, village restore/undo, battle timing and replay rewind. Native X-Bow source-pixel
and context-restoration checks and all seventeen Wizard Tower assembly comparisons pass.

The full check passes 3,020 tests across 335 files, strict source/test typing, documentation
validation and the production build.

Compiled phone probes in both engines boot owned levels 6 and 13 for X-Bow, or 6 and 17 for
Wizard Tower. WebGL portrait tracking sees seven X-Bow uploads / 3,808,000 bytes (six selected
level/mode portraits and the existing base sprite), or three Wizard Tower uploads / 1,641,600
bytes (two higher-level portraits and its base). Normal village imports to a starter release
all family portraits, leaving one base sprite per kind. Restoring the defenses reloads the
same counts and paths, without page errors or development game hooks.

The dedicated Wizard Tower production check passes modern levels 1/5/8/10/17, the campaign
fixture and the pinned version-34 recording in both engines, including projectile state,
final result, export and reseek equality. Chromium also passes offline replay. WebKit's
dedicated online replay context blocks service workers to keep update banners from covering
replay controls. Asset delivery is explicitly decoded from the shipped WebP URLs, and the
historical reference comes from headless playback of the unchanged, checksum-pinned recording.
End-of-replay assertions wait for bounded seeking to finish before checking the result.

Standard production navigation/replay pass in both engines under their usual worker
configuration. Chromium also passes offline reload/replay using cache `50a96dca4ba1`.

## Reusing trap search storage

Trap trigger queries previously built a new position map and bucket arrays every phase,
then a fresh result array for every nearby-unit query. The trap index now retains its map
cells, bucket storage and query storage per battle, with explicit active counts. Rebuilds
clear old unit references; in-phase movement still invalidates the grid before a later query.
An unusually wide map clears its cached cells on the next rebuild instead of growing forever.

A controlled stage-61 simulation runs 400 steps with the normal-capacity mixed army. After
eight warmups per variant, an alternating-order Chromium repeat averages 1,007.25 ms before
and 883.98 ms after (12.2% lower); WebKit averages 758.25 ms before and 670.25 ms after (11.6%
lower). A first Chromium run was noisier. These isolate simulation CPU in software browsers;
they do not measure physical-phone frame rate.

Counting collection creation over those same steps gives 400 maps → one, 18,759 bucket arrays
→ 62 and 57,499 nearby-result arrays → one. Both versions perform 57,499 queries and produce
the same complete final battle state. Four army/layout scenarios match the original
at all 1,600 individually hashed simulation steps. Five regressions cover shrinking/empty
buckets, cross-cell ties, in-phase invalidation, alternating battles/replaced layouts and the
wide-map cache bound; all 75 focused trap tests pass.

All 23 selected browser cases pass per engine, including complete combat-state comparisons
against Node in villages 64/66/81, native trap presentation, paid upgrade/reload, status recovery
and replay/audio rewind. The visual fixtures explicitly preload their pose gallery, include
the second source Shrink cast's status linger, compare keyed presentation maps in key order
and wait for decoded audio buffers rather than treating sample-name sets as promises.

The full check passes 3,025 tests across 336 files, strict source/test typing, documentation
validation and the production build.

The compiled Shrink Trap production check passes in both engines: active trap/troop status,
final result, portable export and reseek equality, home-state isolation and source-asset
decoding. Chromium also passes offline replay; the dedicated WebKit online check blocks
service workers so update banners cannot cover replay controls. The delivery check uses the
shipped WebP paths and waits for bounded seeking before asserting completion.

Standard production navigation/replay pass in both engines under their usual worker
configuration, with Chromium offline reload/replay using cache `56b0636f2a58`.

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
