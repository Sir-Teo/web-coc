# Native transparency groups

The native Tesla graph contains seven idle-electricity subclips placed with additive blending. Their children include both normal and additive layers. Distributing the parent's additive mode to every child changes overlapping pixels, so these clips need a separate intermediate buffer.

`nativeScenePoses` retains those group boundaries, original polygons, placement order, transforms, colors and child clocks. `NativeSceneView` renders each group to a transparent GPU texture and adds the composed result to its parent. Normal leaf-only callers continue to use `nativeMeshPoses` and `NativeMeshView`; the flat sampler still rejects additive containers. Group RGB transforms fail explicitly because they require a post-composition filter. Group alpha is applied once after its children are composed.

The compositing interpretation uses premultiplied RGB, additive color and source-over alpha, with an RGBA8 boundary for each isolated group. The [AIR blend-mode reference](https://airsdk.dev/reference/actionscript/3.0/flash/display/BlendMode.html) describes additive color and temporary transparency groups. This supports the reconstruction approach; it does **not** establish equivalence to Supercell's native executable. Native-client compositing and world registration remain unverified.

Buffers are sized from transformed polygon bounds with a transparent edge texel and use the physical camera zoom, including retina density. Child meshes remain outside the world display list. Repeated updates retain the same objects; inactive groups, cleared views and destroyed views release their framebuffers and listeners. The retained draw commands redraw after context restoration without needing a new simulation event.

Two Phaser 4.2.1 compatibility fixes are limited to this renderer:

- `addBlendMode` returns the preceding slot and only creates combined RGB/alpha factors. The renderer captures the allocated slot and updates separate alpha factors. It also avoids Phaser's built-in ADD destination-alpha factor, which darkens partly transparent intermediate buffers.
- Framebuffer reconstruction attempts to delete handles from the lost context. The renderer drops its own stale framebuffer handle on context loss, allowing Phaser to recreate its attachments without `INVALID_OPERATION`.

## Verification

`scripts/native-tesla-gpu-fixtures.py` independently samples the pinned original SCTX textures and source UV coordinates. Its nineteen cases cover trapdoor emergence, all seven isolated electricity groups, secondary attack art, reveal dust, an affine shear, rotated/reflected electrical arcs with their source emitter blend flags, and impact textures. The TypeScript scene sampler is compared recursively against the source poses, including the group boundaries. All 17 setup/reveal timelines are exercised, along with long clocks, seeking, hidden controls and unsupported RGB filters.

Chromium and WebKit pass the twelve pixel comparisons at DPR 2. Maximum per-case mean maximum-channel error is below **0.58/255**; at most **0.025%** of compared pixels exceed 16/255, with a maximum difference of 35/255 at sparse polygon edges. Forced single-texture batching and context restoration change **zero** pixels. GL error checks pass before and after each phase.

A second browser scenario verifies a known two-layer transparency calculation, twelve cycles of active/quiet source frames at camera zooms 1–3, object retention, detached child meshes and complete framebuffer/listener cleanup. Existing X-Bow, Dark Elixir Storage and Goblin mesh comparisons remain regression checks for the shared sampler.

```sh
output/native-art-venv/bin/python scripts/native-tesla-gpu-fixtures.py --check
npm test -- tests/native-scene.test.ts tests/native-mesh.test.ts tests/native-tesla-reference.test.ts
npx playwright test tests/browser/native-tesla-mesh.spec.ts --config output/playtest/retina.config.ts --workers=1
npx playwright test tests/browser/native-tesla-mesh.spec.ts --config output/playtest/retina-webkit.config.ts --workers=1
```

The [live Tesla integration](HIDDEN-TESLA.md) now uses this renderer for all 17 levels, held reveals, independently animated electricity and source construction/upgrade/damaged compositions. Battle-clock sampling reconstructs the same meshes and groups after replay seeking. The native arc, coil and impact artwork and original attack/hit samples now use deterministic battle histories. Native particle trajectories, variant/audio-row selection, pickup/drop sound integration and native-client world/timeline registration remain unfinished.
