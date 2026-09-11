# Village scenery and camera coverage

The active scenery frames the 44×44 buildable field with a continuous forest and stream. The field uses subtle alternating grass tiles aligned to the same 2:1 isometric coordinates as buildings. Fixed dirt strips from the prototype have been removed. The original background remains available as an earlier source.

The previous expanded backdrop was displayed at 1.6× world size. After the grid expansion, that stretched its detail and put parts of the painted forest, dirt and river under valid building tiles. The new composition fits the field at 1.35× world size while retaining coverage of every supported camera edge. The isometric origin, camera limits, building positions and sprite sizes are unchanged by this artwork pass.

## Artwork and rebuild

- Active source: `art/source/terrain-field-v4.png`, 1672×941, generated with the built-in image tool on September 11, 2026.
- Shipping asset: `public/assets/environment/terrain-field-v4.webp`, encoded at quality 90 by `node scripts/terrain-assets.mjs`; also included in `npm run assets`.
- Exact generation and refinement prompts, generated filenames and dimensions: `art/source/terrain-field-v4.json`.
- Style reference: `art/source/terrain-expanded-v2.png` (1536×1024). The first new candidate retained conspicuous angular grass patches; the accepted refinement makes the lawn quieter while preserving the surrounding composition.
- The request asked for 3840×2160. Both actual outputs are 1672×941. No upscaling is used and this is not a 4K source.
- At the tighter display scale, the new source supplies approximately 29% more horizontal and 9% more vertical source pixels per world unit than the previous backdrop. This is a sampling-density comparison, not a claim of native-game pixel parity.
- `node scripts/terrain-assets.mjs --check` verifies that the committed WebP exactly matches the current source and encoder. CI performs this check and requires the active terrain in the production loading audit.

The scene uses one opaque backdrop. The subtle turf overlay is a separate 64×32 repeating texture, clipped to the exact buildable diamond. It has no painted flowers, paths or obstacles. Real trees and rocks remain independent selectable world objects. The forest-and-stream composition and turf colors remain original artwork/local styling; the native [Classic scenery reference](https://clashofclans.fandom.com/wiki/Scenery) also includes scenery details and a beach not fully reproduced here.

## Turf rendering

A small transparent texture repeats at the isometric tile spacing. Four corner triangles mask the parts of its bounding rectangle outside the buildable diamond; a matching subtract operation removes that stencil before later world objects draw. This preserves the previous inverted-diamond coverage while eliminating the two full-viewport draws used to apply and remove an inverted stencil. These objects share one container so hiding the turf cannot leave its stencil active. This avoids rebuilding 968 static grass polygons each frame or allocating a full-field overlay texture.

The implementation uses the installed Phaser 4.2.1 stencil API. The older `setMask` API is Canvas-only in Phaser 4, as described in the [Phaser mask documentation](https://docs.phaser.io/api-documentation/4.0.0/namespace/gameobjects-components-mask); a framebuffer regression caught its ineffective WebGL clipping during development. Stencil references do not inherit the target’s settings, so the release explicitly repeats its non-inverted and composition options. Runtime checks verify edge clipping, post-stencil drawing and graphics-context restoration.

## Rotation and resize

Viewport changes preserve the camera's current world center and absolute zoom, subject to the new viewport's zoom limits and playable-world pan limits. Phaser updates camera dimensions before the scene resize listener; the old viewport dimensions are retained so the previous world center can be recovered from its scroll offsets. Recenter is still an explicit action that restores the fitted starting view. Battle transitions retain their deliberate starting framing.

A resize cancels any unfinished pan or pinch gesture, since its previous screen coordinates no longer describe the playfield. Resource-flight particles are also cleared. The exact world midpoint is used in camera clamping.

## Verification

`tests/browser/village-camera.spec.ts` reads the actual WebGL framebuffer borders against a magenta sentinel with foreground objects hidden. It checks six viewports (narrow and tall phones, phone landscape, desktop and ultrawide), both village and battle modes, three zoom levels, and five pan positions: 180 rendered views. No sentinel pixel may be exposed. Each viewport/mode also hides the terrain for a negative control and requires every border pixel to show the sentinel. Separate tests verify focus/zoom preservation through rotation, pointer selection after recentering, and cancellation of a pan interrupted by resizing.

`tests/browser/terrain-field.spec.ts` samples all 1,936 buildable tile centers from the shipping texture through its actual world transform. Its grass-palette check found 18 non-grass centers in the previous backdrop and none in the accepted replacement. This is a targeted palette check, not an exhaustive proof that every painted pixel is unobstructed. Screenshots are also inspected with normal world objects and HUD visible.

A second framebuffer test compares turf-on and turf-off pixels at fixed alternate cells and outside all four field edges. It repeats after WebGL context restoration and verifies that a later magenta probe remains visible outside the clipped field. This checks alignment, clipping and stencil cleanup using rendered output. The turf tile is 64×32 pixels. CI runs these cases in Chromium and WebKit; the shipping artwork is included in the offline manifest.

A third test compares every RGBA framebuffer pixel against the previous inverted-diamond implementation at five fractional camera/zoom settings across phone portrait, phone landscape and desktop viewports. It also counts WebGL draw calls and requires exactly two fewer calls per frame. `node scripts/performance-check.mjs --camps --compare-field-mask` alternates the previous mask and the shipping mask twice on the same frozen 200-troop village, restores the renderer afterward, and also measures normal gameplay plus the legacy roster. On macOS, add `--metal` to request hardware-backed ANGLE Metal explicitly; the benchmark checks the reported renderer and refuses a silent fallback. The default run retains Chromium’s normal renderer selection. See the latest QA entry for separate hardware and software timing evidence and their limits.

Full native scenery composition, per-level building artwork, character/scenery animation and physical-device performance certification remain incomplete. See [QA.md](QA.md) for completed checks and visual evidence.
