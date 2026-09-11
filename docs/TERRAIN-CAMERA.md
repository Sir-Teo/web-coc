# Village scenery and camera coverage

The original terrain rectangle matched the world bounds, but the supported camera view could be taller or wider than that rectangle. At phone zoom levels this exposed horizontal strips of the solid camera background; minimum zoom exposed additional edges on desktop. Moving the camera could not repair a view larger than the painted terrain.

The village uses a wider original forest-and-river backdrop displayed at 1.6 times the world width and height. The later [native-grid pass](NATIVE-GRID.md) expands the buildable field to 44×44 inside a 48×48 simulation map, preserving the isometric origin and building pixel sizes. Pan bounds include a 224-world-pixel viewing margin; minimum zoom permits an overview while the initial zoom keeps the village readable. The same scenery source now covers a larger world, so fine detail is softer. The original terrain source and derived asset remain available.

## Artwork and rebuild

- Original edit reference: `art/source/terrain.png` (1536×1024).
- Accepted source: `art/source/terrain-expanded-v2.png` (1536×1024), generated with the built-in image tool on September 11, 2026.
- Shipping asset: `public/assets/environment/terrain-expanded-v2.webp`, encoded at quality 90 by `node scripts/terrain-assets.mjs`; also included in `npm run assets`.
- The generated image expands the forest, rocky outcrops and turquoise river. Its composition is not a pixel-registered outpaint of the original; the 1.6 display scale was selected by inspecting the village and its playable footprint in the browser. The source is not upscaled to claim additional detail.
- The background remains one opaque image and one sprite. There are no repeated tiles, mirrored river banks, feathered overlapping forests or additional background effects.

Generation request: expand the attached terrain with dense rounded pines and deciduous forest, continue the turquoise river beyond the lower-left edge, preserve the warm upper-left sun and elevated orthographic style, keep the clearing empty, and omit buildings, characters, UI, text and borders. The request asked for a larger pixel canvas; the actual accepted output is the 1536×1024 source recorded above.

## Rotation and resize

Viewport changes preserve the camera's current world center and absolute zoom, subject to the new viewport's zoom limits and the existing playable-world pan limits. Phaser updates camera dimensions before the scene resize listener; the old viewport dimensions are retained so the previous world center can be recovered from its scroll offsets. Recenter is still an explicit action that restores the fitted starting view. Battle transitions retain their deliberate starting framing.

A resize cancels any unfinished pan or pinch gesture, since its previous screen coordinates no longer describe the playfield. Resource-flight particles are also cleared as before. The exact world midpoint replaces the earlier half-pixel vertical rounding in camera clamping.

## Verification

`tests/browser/village-camera.spec.ts` reads the actual WebGL framebuffer borders against a magenta sentinel background with foreground sprites hidden. It checks six viewports (narrow and tall phones, phone landscape, desktop and ultrawide), both village and battle modes, three zoom levels, and five pan positions: 180 rendered views. No sentinel pixel may be exposed. Each viewport/mode also hides the terrain for a negative control and requires every border pixel to show the sentinel, proving the readback can detect uncovered canvas. Separate tests verify focus/zoom preservation through rotation, pointer selection after recentering, and cancellation of a pan interrupted by resizing.

Screenshots are inspected with the normal HUD and scene objects visible. Chromium and WebKit run the camera suite; CI includes it in the WebKit selection. The shipping terrain is included in the generated offline manifest and production loading checks.

This addresses terrain coverage and camera continuity. It does not complete the broader per-level artwork catalog, character animation, scenery animation, or physical-device performance certification.
