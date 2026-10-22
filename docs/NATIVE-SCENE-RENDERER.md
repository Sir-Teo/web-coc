# Native transparency groups

The native Tesla graph contains seven idle-electricity subclips placed with additive blending. Their children include both normal and additive layers. Distributing the parent's additive mode to every child changes overlapping pixels, so these clips need a separate intermediate buffer.

`nativeScenePoses` retains group boundaries, original polygons, placement order, transforms, colors and child clocks. `NativeSceneView` renders each group to a transparent GPU texture, then applies its screen or additive blend to the parent. Leaf-only callers continue to use `nativeMeshPoses` and `NativeMeshView`; the flat sampler rejects either kind of container. Group RGB multiplication/addition uses a GPU filter after child composition, with channels clamped before premultiplication. Group alpha is applied once.

The compositing interpretation uses premultiplied RGB and source-over alpha, with an RGBA8 boundary for each isolated group. The [SupercellFlash instance enum](https://github.com/sc-workshop/SupercellFlash/blob/41e894d5a20cc17e47fe32db3106c4c1bec60a3e/supercell-flash/source/flash/display_object/MovieClip.h) assigns screen mode 4 and additive mode 8. The [W3C compositing specification](https://www.w3.org/TR/compositing-1/#blending) defines screen as `S + D − S×D`; the premultiplied form uses the same RGB expression and source-over alpha. The [AIR blend-mode reference](https://airsdk.dev/reference/actionscript/3.0/flash/display/BlendMode.html) describes temporary transparency groups. These support the reconstruction approach; they do **not** establish equivalence to Supercell's native executable. Native-client compositing and world registration remain unverified.

Buffers are sized from transformed polygon bounds with a transparent edge texel and use the physical camera zoom, including retina density. Child meshes remain outside the world display list. Repeated updates retain the same objects; inactive groups, cleared views and destroyed views release their framebuffers and listeners. The retained draw commands redraw after context restoration without needing a new simulation event.

Two Phaser 4.2.1 compatibility fixes support native rendering:

- `addBlendMode` returns the preceding slot and only creates combined RGB/alpha factors. The renderer captures the allocated slot and updates separate alpha factors. It also avoids Phaser's built-in ADD destination-alpha factor, which darkens partly transparent intermediate buffers.
- Framebuffer reconstruction attempts to delete handles from the lost context. On context loss the renderer clears invalid framebuffer handles, including pooled filter buffers, while preserving wrappers and attachment descriptions. Phaser can then recreate them without `INVALID_OPERATION`. Trace output confirmed the invalid deletes before this correction. The village scene also clears these handles when no native view remains: drawing contexts and pooled buffers can outlive their last view during a home-to-battle transition. The live context-loss case in `tests/browser/hold-deploy.spec.ts` checks recovery with no WebGL error and a working fresh deployment.

## Tint source pixels

Saturating leaf colors are clamped per source texel before bilinear filtering. Their
CPU inputs come from an unpremultiplied texture read in a reused auxiliary WebGL
context. A 2D canvas round trip can change translucent RGB values before tinting;
the direct read preserves the original PNG and lossless WebP texels. Temporary
textures and framebuffers are deleted after every read, and a lost auxiliary
context is recreated. The existing canvas path remains the fallback when a raw
read is unavailable.

The source cache keeps its 32 MB budget and 4 MB page limit. Larger pages keep the
asynchronous bitmap-crop path; they are not uploaded in full to read a small region.
Baked texels clamp straight colors, premultiply and
round once, then pack bottom-up rows. Their Phaser texture wrappers disable further
premultiplication and flipping, retain the bytes for context restoration, and use
linear filtering with edge clamping. The existing tint cache, ownership tracking
and per-frame bake budget still apply.

Additive image pages of at most 64 KiB (16,384 texels) receive a one-time raw read
and explicitly premultiplied upload when first used by an additive leaf. Browser
image premultiplication can otherwise accumulate rounding error in translucent
trails. The original image and TextureSource remain available to tint reads,
frames and page ownership; the replacement wrapper retains its bytes for context
restoration and is deleted with the source. Each source is attempted once. Larger
pages, canvases, normal-only images and unavailable raw reads keep their existing
wrappers.

The original level-3 X-Bow ammunition witness exposed this difference in WebKit:
mean maximum-channel error fell from 1.00106 to 0.78191, with maximum error reduced
from 3 to 2. The source image and the mean-error limit of 1 remain unchanged.

## Verification

`scripts/native-tesla-gpu-fixtures.py` independently samples the pinned original SCTX textures and source UV coordinates. Its twenty-three cases cover trapdoor emergence, all seven isolated electricity groups, secondary attack art, reveal dust, an affine shear, rotated/reflected electrical arcs with their source emitter blend flags, impact textures and all four grass variants. The TypeScript scene sampler is compared recursively against the source poses, including the group boundaries. All 17 setup/reveal timelines are exercised, along with long clocks, seeking, hidden controls and group colors. Alpha addition and unsupported blend modes still fail explicitly.

Chromium and WebKit pass all twenty-three pixel comparisons at DPR 2. Maximum per-case mean maximum-channel error is below **0.829/255**; fewer than **0.027%** of compared pixels exceed 16/255 in any case, with a maximum difference of 35/255 at sparse polygon edges. All four grass variants differ by at most 2/255 per channel. Forced single-texture batching and context restoration change **zero** pixels. GL error checks pass before and after each phase.

A second browser scenario verifies a known two-layer transparency calculation, twelve cycles of active/quiet source frames at camera zooms 1–3, object retention, detached child meshes and complete framebuffer/listener cleanup. Existing X-Bow, Dark Elixir Storage and Goblin mesh comparisons remain regression checks for the shared sampler.

The Wizard Tower source audit exposed screen containers with changing RGB transforms in projectile tiers 3 and 4. `native-screen-blend.spec.ts` checks two differently colored overlapping children, screen/additive group reuse, positive and negative additions, saturation clamping, zero opacity and a standalone screen leaf. Both engines produce `[74,104,113,255]` for the colored screen case, `[80,118,129,255]` for additive, and the unchanged background for zero opacity. Source-over and screen calculations are independently evaluated in the test. Single-texture batching and context restoration preserve those pixels exactly; repeated cleanup retains a stable shared framebuffer pool and no view listeners. The existing Tesla witness regenerates unchanged after the CPU compositor extension. The shared-renderer change passes 44 focused TypeScript tests, 23 Python tests and four browser scenarios per engine.

```sh
output/native-art-venv/bin/python scripts/native-tesla-gpu-fixtures.py --check
npm test -- tests/native-scene.test.ts tests/native-mesh.test.ts tests/native-tesla-reference.test.ts
npx playwright test tests/browser/native-tesla-mesh.spec.ts --workers=1
npx playwright test tests/browser/native-tesla-mesh.spec.ts --browser=webkit --workers=1
```

The [live Tesla integration](HIDDEN-TESLA.md) now uses this renderer for all 17 levels, held reveals, independently animated electricity and source construction/upgrade/damaged compositions. Battle-clock sampling reconstructs the same meshes and groups after replay seeking. The native arc, coil and impact artwork and original attack/hit samples now use deterministic battle histories; grass uses the reveal timestamp. Home pickup/drop effects and sounds use a bounded transient action queue. Native particle trajectories, variant/audio-row selection and native-client world/timeline registration remain unfinished.
