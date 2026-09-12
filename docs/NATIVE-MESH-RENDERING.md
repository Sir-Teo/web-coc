# Native mesh rendering

`native-mesh.ts` samples the retained SC6 scene graph from the [X-Bow source reconstruction](../reference/xbow/README.md). `native-mesh-scene.ts` renders its original polygon strips through Phaser 4.2.1 `Mesh2D`. This renderer is validated in browser fixtures; X-Bow combat and its connection to the village scene are the next integration step.

Each child slot keeps its own identity, matrix, color, blend and placement age. The named turret and ammunition clips accept independently selected source frames. Ordinary nested clips advance from continuous placement, reset after removal and respect their own frame rate. These are the documented reconstruction clocks; native engine clock and world-direction conventions remain unverified. A cached placement table bounds lookup by source timeline size, even after a long campaign battle or a replay seek.

The renderer retains six affine values, including shear, and uses explicit triangle-strip topology. It renders source add-mode layers separately over the world. Nonempty additive groups require isolated compositing and are rejected instead of being flattened. Meshes are retained across poses, updated when topology changes and destroyed when their child instance disappears.

Source RGB multiplication and addition are applied to cached texture variants before bilinear filtering. X-Bow color changes only use the small 64×242 projectile texture; the large building texture is unchanged. Per-instance alpha stays on the mesh. Canvas color conversion and GPU sampling introduce small rounding differences from the Python source sampler; this is not a claim of native-engine pixel identity. The renderer's texture cache survives graphics-context restoration.

The native triangle batch uses the same stable texture-slot sampling fix as the existing quad batch. Half-integer slot boundaries avoid floating-point fallthrough between sampler indices. The existing quad topology and sprite behavior remain unchanged.

## Verification

`scripts/native-xbow-gpu-fixtures.py` produces a 1600×1200 source reference image and numeric pose witnesses from the pinned source textures and Python scene reader. It covers six building variants, five colored projectiles, an upgrade pose, independently selected directions, additive effects, a long clock and an additional shear. Twelve cases are arranged in the image; no native geometry may be clipped by a fixture cell.

```sh
output/native-art-venv/bin/python scripts/native-xbow-gpu-fixtures.py --check
npx vitest run tests/native-mesh.test.ts --maxWorkers=1
npx playwright test tests/browser/native-xbow-mesh.spec.ts
```

Seventeen model tests check Python pose agreement, fixed aiming controls, animation and rewind, topology, affine transforms, bounded lookup and unsupported composition. The browser compares actual WebGL pixels with the independent source image over the same opaque background, rather than comparing two calls to the renderer.

Chromium and WebKit pass at DPR 2. Across the 12 cases, mean maximum-channel error remains below one 8-bit color value (worst cases: 0.607 Chromium, 0.930 WebKit). The largest fraction of colored pixels differing by more than 16 values is about 0.101%; the gate is 0.3%. The largest isolated difference is 55, at a rasterized edge. Source-to-cropped texture comparisons remain exact; these additional differences concern browser/GPU rasterization and color conversion.

Both browsers produce exactly the same pixel bytes before and after switching to a one-texture batch and after losing/restoring the graphics context. The fixture uses 53 retained meshes and seven cached colored textures, with no GL errors. All three existing quad-renderer cases and the Santa shear comparison also pass in both browsers.
