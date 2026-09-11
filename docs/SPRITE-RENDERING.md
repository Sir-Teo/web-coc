# Sprite rendering

The game configures Phaser 4.2.1's standard quad batch at scene creation. It keeps the engine's texture batching, shaders for tint and alpha, sprite sizes, artwork, depth order, camera transforms and full troop roster. No dependency files are patched.

## Independent triangles

The stock quad index buffer joins sprites into a triangle strip with repeated endpoints. Rendering each quad as two independent triangles removes the intervening degenerate triangles. The six indices per sprite, diagonal, vertex winding and buffer allocation stay the same. The index upload explicitly unbinds the vertex array and forces the element-buffer binding so it cannot overwrite another draw's vertex-array state. Phaser retains the updated buffer data through context restoration.

Controlled September 11 measurement: headless Chromium 153.0.8010.12 on macOS, 1440 × 960 at 1× resolution, using ANGLE's SwiftShader software renderer. With the same village and 660 visible moving Swordsmen, the original strip measured 50 FPS with a 33.4 ms 95th-percentile frame; independent triangles measured 60 FPS and 16.7 ms. The earlier investigation measured approximately 49 FPS before the renderer changes. The final normal village and battle samples also measured 60 FPS.

`node scripts/performance-check.mjs --compare-quads` reproduces the controlled topology comparison, restores the normal renderer afterward, and writes `output/playtest/performance.json`. The report records the actual browser and renderer. Each sample warms up for half a second and measures four seconds. The current runner uses native TH8 capacity (200 one-space troops) for the topology comparison; `--camps` also measures the preserved 660-actor legacy roster separately. The 660-actor figures above are historical measurements. Run it without competing browser test suites. These measurements are local evidence, not physical-device performance certification.

## Stable texture selection

The stock multi-texture sampler tests an interpolated floating-point texture index for exact equality with integers. Small interpolation errors around indices such as 3 and 5 can miss every branch and return transparent black. Enlarged, rotated troop poses made the resulting missing pieces visible; single-texture rendering preserved the complete artwork.

The replacement sampler selects texture slots at half-integer boundaries. It uses a distinct shader-addition tag so Phaser's batch-size changes retain the stable sampler. The engine's `TexCount` addition still controls the active sampler count, and preprocessing removes branches for unused texture slots. The one-texture path remains a direct sample. This preserves multi-texture batching rather than accepting extra draw calls as a workaround.

## Regression coverage

The browser fixture exercises all four frames of all seven troop types, fractional positioning, scale, flips, rotation, tint, translucency and a cluster of overlapping sprites. It compares raw framebuffer pixels against the original triangle-strip geometry and an independent single-texture reference, requiring zero differing pixels. A third case requires identical pixels after WebGL context loss and restoration. All comparisons run in Chromium and WebKit, with screenshots kept under `output/playtest/quad-renderer-*`.

The extension is specific to the pinned Phaser renderer's public buffer layout and shader-addition contracts. Keep these raster comparisons and context-restoration checks when upgrading Phaser. The changes do not address missing game content, asset fidelity, backend services or measurements on physical phones.

## Terrain and hardware follow-up

The [field stencil optimization](TERRAIN-CAMERA.md) removes two full-viewport draws without changing any tested framebuffer pixels. Sprite batching and sampler limits remain unchanged after a new comparison found no consistent gain from lowering the texture limit. On this Mac, `node scripts/performance-check.mjs --camps --compare-field-mask --metal` verifies ANGLE Metal and records the actual renderer. The September 11 Apple M5 Pro sample held 60 FPS at 1440×960 with the native 200-troop army and preserved 660-actor roster. Shared-host SwiftShader results remain variable. These hardware samples use a 1× pixel ratio and do not establish high-DPI or physical phone/tablet performance; see [QA.md](QA.md).
