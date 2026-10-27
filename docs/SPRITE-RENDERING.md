# Sprite rendering

The game configures Phaser 4.2.1's standard quad batch at scene creation. It keeps the engine's texture batching, shaders for tint and alpha, sprite sizes, artwork, depth order, camera transforms and full troop roster. No dependency files are patched.

## Independent triangles

The stock quad index buffer joins sprites into a triangle strip with repeated endpoints. Rendering each quad as two independent triangles removes the intervening degenerate triangles. The six indices per sprite, diagonal, vertex winding and buffer allocation stay the same. The index upload explicitly unbinds the vertex array and forces the element-buffer binding so it cannot overwrite another draw's vertex-array state. Phaser retains the updated buffer data through context restoration.

Controlled September 11 measurement: headless Chromium 153.0.8010.12 on macOS, 1440 × 960 at 1× resolution, using ANGLE's SwiftShader software renderer. With the same village and 660 visible moving Swordsmen, the original strip measured 50 FPS with a 33.4 ms 95th-percentile frame; independent triangles measured 60 FPS and 16.7 ms. The earlier investigation measured approximately 49 FPS before the renderer changes. The final normal village and battle samples also measured 60 FPS.

`node scripts/performance-check.mjs --compare-quads` reproduces the controlled topology comparison, restores the normal renderer afterward, and writes `output/playtest/performance.json`. The report records the actual browser and renderer. Each sample warms up for half a second and measures four seconds. The current runner uses native TH8 capacity (200 one-space troops) for the topology comparison; `--camps` also measures the preserved 660-actor legacy roster separately. The 660-actor figures above are historical measurements. Run it without competing browser test suites. These measurements are local evidence, not physical-device performance certification.

## Shared native triangle batches

Native mesh triangles now use the same batch as sprite images. The writer stores each
triangle as `b, a, c, c` in the sprite buffer: its indexed triangles become the original
`a, b, c` followed by a zero-area `a, c, c`. Positions, UVs, packed color words and blend
order remain intact. Each source vertex is transformed once; the last vertex's seven words
are copied in place. There is no mesh-to-quad search or per-frame allocation. The ordinary
triangle handler remains available as an independent rendering reference.

This adds one vertex per native triangle, but interleaved native meshes and sprite images
can stay in the same batch. In a fully loaded frozen 589-unit scene, Chromium draw calls
fell from 478 to 127 per frame and program switches from 338 to 54. WebKit measured
478 to 128 draws and 335 to 55 program switches. Callback timings improved in the later
pairs, but the software renderers' warmup and shared-host variability were substantial;
these draw counts do not establish a universal FPS gain.

The new [triangle batch comparison](../tests/browser/native-triangle-batching.spec.ts) requires identical pixels against
the ordinary triangle handler, with interleaved images, multiple texture pages, alpha,
native color modes, rotations, flips, pixel rounding, a full-buffer flush, and graphics
restoration. The benchmark accepts `--freeze --mesh-batch=quad|tri`; it waits for pending
native page uploads and removes the frame cap before measuring the frozen root meshes.

Village guards at 1440×960 and 1× density used six alternating frozen samples. After waiting
for image decodes and draining queued GPU work, the developed Chromium village averaged
12.1 FPS with the ordinary triangle handler and 12.5 FPS with shared batching; callback time
fell from 2.23 to 1.49 ms. The starter Chromium village measured 13.7 versus 14.2 FPS and
1.57 versus 1.41 ms. The developed WebKit village measured 41.7 versus 42.3 FPS and 4.07
versus 2.75 ms. These are callback wall times and shared-host observations, not GPU timings
or physical-device certification. Early samples that overlapped outstanding work stalled;
they are not evidence of steady-state performance.

Validation: the new visibility/pixel/buffer/restoration regression passed in both engines.
The broader rendering subset passed 17 Chromium cases and 15 WebKit cases (two expected
Chromium-only gesture skips), including the native Tesla source references. `npm run check`
passed all 2,962 tests across 326 files, type checks, documentation links and the production
build. The compiled Chromium online/offline smoke check and the legacy-batch benchmark
switch passed with no page errors.

## Stable texture selection

The stock multi-texture sampler tests an interpolated floating-point texture index for exact equality with integers. Small interpolation errors around indices such as 3 and 5 can miss every branch and return transparent black. Enlarged, rotated troop poses made the resulting missing pieces visible; single-texture rendering preserved the complete artwork.

The replacement sampler selects texture slots at half-integer boundaries. It uses a distinct shader-addition tag so Phaser's batch-size changes retain the stable sampler. The engine's `TexCount` addition still controls the active sampler count, and preprocessing removes branches for unused texture slots. The one-texture path remains a direct sample. This preserves multi-texture batching rather than accepting extra draw calls as a workaround.

## Regression coverage

The browser fixture exercises all four frames of all seven troop types, fractional positioning, scale, flips, rotation, tint, translucency and a cluster of overlapping sprites. It compares raw framebuffer pixels against the original triangle-strip geometry and an independent single-texture reference, requiring zero differing pixels. A third case requires identical pixels after WebGL context loss and restoration. All comparisons run in Chromium and WebKit, with screenshots kept under `output/playtest/quad-renderer-*`.

The extension is specific to the pinned Phaser renderer's public buffer layout and shader-addition contracts. Keep these raster comparisons and context-restoration checks when upgrading Phaser. The changes do not address missing game content, asset fidelity, backend services or measurements on physical phones.

## Terrain and hardware follow-up

The earlier corner-stencil optimization removed two full-viewport draws without changing tested pixels. The current [diamond field geometry](TERRAIN-CAMERA.md) removes two more stencil draws; tested interpolation differences stay within one RGB level. Sprite batching and sampler limits remain unchanged after a comparison found no consistent gain from lowering the texture limit. On a Mac, `node scripts/performance-check.mjs --camps --compare-field-mask --metal` verifies ANGLE Metal and records the actual renderer. The September 11 Apple M5 Pro sample held 60 FPS at 1440×960 with the native 200-troop army and preserved 660-actor roster. Shared-host SwiftShader results remain variable. These hardware samples use a 1× pixel ratio and do not establish high-DPI or physical phone/tablet performance; see [QA.md](QA.md).


## Display density

The canvas now uses native display pixels within a bounded buffer allocation, with CSS-independent camera and pointer coordinates. [DISPLAY-DENSITY.md](DISPLAY-DENSITY.md) covers the Phaser scale configuration, fractional densities, display switching and graphics restoration. The benchmark accepts `--density=2` and `--viewport=390x844` and records the actual physical buffer alongside its CSS dimensions. Historical 1× measurements above describe earlier runs; current density-specific measurements are in [QA.md](QA.md).
