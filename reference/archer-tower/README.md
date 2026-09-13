# Original Archer Tower source foundation

Captured from public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, at [the original asset host](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json).

`scripts/import-native-archer-tower-source.py` pins SHA-256 for the fingerprint, building, projectile, effect and emitter tables, and independently verifies each table's SHA-1 membership in that fingerprint. `--check` reconstructs the complete document and compares it byte for byte.

The capture preserves all 21 raw tier rows and inherited tier records, 10 referenced projectile definitions (including alternate variants), 7 effects with recursive spawned effects, and 11 particle emitters. Source fields and units remain strings, without inferred timing, projectile trajectories or alternate-mode arithmetic. Level 15 specifies 1,230 HP, 85 DPS, a 500-ms attack interval and range 1000 source units; alternate fields separately specify 200 DPS, 250 ms and range 800. The level-15 regular and alternate body exports and projectile names remain distinct.

Importer reconstruction and the focused source test pass. This is a definition capture, not an artwork or combat integration. Original scene graphs, textures, resident archers, projectiles, effects, timings and mode behavior still require implementation and qualification. Midnight Oil remains gated by Archer Tower level 15 and Inferno support. No runtime behavior or home progression changes in this commit.

## Current scope

Original artwork renders in the home village and placement previews for every captured tier, with rooftop residents and source construction, upgrade and ruin states. Independent building/effect, resident and projectile frame comparisons pass in Chromium and WebKit. These checks qualify the retained source graphics within explicit pixel thresholds; native executable playback, resident world attachment, battle timing, projectile flight, alternate-mode gameplay and later-tier campaign support remain separate work. The sections below record the implementation history and supersede their earlier pending statuses as each stage completes.

## Reachable artwork inventory

`scripts/native-archer-tower-inventory.py` resolves building, alternate, construction, ruin, projectile and particle export references against pinned original scene files, verifying fingerprint membership. Its `--check` mode reconstructs the inventory byte for byte. It records export IDs, reachable shape IDs, clip frame counts, frame labels, named children, blend modes and original texture identities/dimensions, and explicitly records masks and text fields.

The building/effect graph contains 80 exports, 84 clips, 102 shapes and 6,078 frames on building textures 8, 18, 25 and 39, using blend mode 0. The projectile graph contains four exports, six clips, eight shapes and 15 frames on character texture 7, using modes 0 and 8. Neither reachable graph includes masks or text fields. Reconstruction passes.

This inventory does not yet contain graph geometry or texture pixels. The tower's separately named resident defender also needs capture: level 15 specifies `DefenderCharacter=Archer7`. That character is not a building export and is not included in these counts. World attachment and attack synchronization remain unverified.

## Exact graph and texture capture

`scripts/import-native-archer-tower-art.py` captures both inventoried scene graphs into separate building and character namespaces. Source evidence retains original polygon strips, UV coordinates, matrices, colors, clip timelines, named children, frame labels and blend modes. Runtime copies remap UVs onto tightly packed texture regions without resizing or simplifying source geometry. The five texture inputs are SHA-256 pinned and checked against the source fingerprint; metadata binds the definition and inventory hashes.

The importer `--check` reconstruction passes for every graph document and every decoded RGBA texture pixel. Three focused tests pass, checking the source bindings, inventory, unchanged geometry and transforms, UV ranges and finite poses across all 6,093 retained frames. Projectile mode-8 groups remain isolated and are traversed in the frame checks. No source blend was flattened or replaced.

This qualifies source preservation, not GPU pixel parity or native executable animation playback. Independent CPU/browser pixel comparisons and runtime presentation are still pending, as is the separately referenced resident Archer character capture.

## Resident Archer source capture

`scripts/import-native-archer-tower-defenders.py` preserves the nine animation blocks named by all 21 tower tiers, together with every original building field beginning with `Defender`. Level 15 maps to Archer7. Idle and attack each resolve to three exact directional exports, totaling 54 exports, 54 clips and 2,654 frames. Their original character texture is retained as exact cropped pixels. Source modes 0 and 8 are preserved; mode-8 groups are not flattened.

The animation table, character scene and texture are SHA-256 pinned and fingerprint-membership checked. The metadata binds the building definition hash. `--check` reconstructs all source/runtime documents and compares every decoded texture pixel. Both focused tests pass, checking all tier bindings, the original attack ActionFrame value 5, directional export resolution, timelines/transforms/colors, and finite poses through every frame including isolated groups.

Only idle and attack graphics are captured here; the complete animation records retain other named states as evidence. No combat timing, facing/mirroring, number of resident archers or world attachment is inferred in this capture. CPU/browser pixel qualification and runtime integration remain pending.

## Pixel qualification in progress: projectile discrepancy

The independent CPU witness generator now supports building, projectile and resident-defender families. The projectile sheet includes all four export frame-zero cases and every retained clip frame (19 cases). Reconstruction of that sheet passes. The building reference generation is a separate longer-running job; its output is not yet qualified.

The initial browser pixel test failed in Chromium and WebKit (resolved below). It retains the established mean-error <1 and large-pixel-fraction <0.003 thresholds. Texture-batch changes, context restoration changes and GL errors are zero; all six original isolated groups remain present. Several source/GPU edge pixels differ, especially clip 352. Its first Chromium frame has mean error about 0.979 and large-pixel fraction about 0.0202; WebKit also exceeds the mean threshold in some cases. Initial reported outliers cluster along a vertical edge where the CPU darkens pixels that the GPU leaves at background color. The cause remains unproven. Neither source geometry nor thresholds have been changed to conceal this difference.

`projectile-pixel-investigation.json` records the failing measurements. The initial failing measurements are retained as investigation history; the resolution below supersedes that failure.


## Projectile pixel discrepancy resolved

The discrepancy came from the CPU reference's affine fast path: its half-open bounds used local vertex orientation. For flipped quad 352, the vertices are (167.5,214), (167.5,86), (132.5,214), (132.5,86), so that rule incorrectly included right-edge pixel centers and excluded left-edge ones. New Archer witnesses opt into screen-space top/left-inclusive triangle coverage. The source vertices, textures, runtime renderer and comparison thresholds are unchanged. Legacy rasterizer defaults and frozen witnesses remain untouched. Two Python tests verify orientation-independent coverage and unchanged default behavior.

The corrected 19-case projectile reference reconstructs exactly. Chromium and WebKit both pass, with worst mean channel error 0.433409 / 0.625 and maximum channel error 2. Large-error fractions, texture-batch changes, context changes and GL errors are zero. The WebKit sheet was visually reviewed. `projectile-pixel-resolution.json` retains the geometry diagnosis and final measurements alongside the initial failure record. These results cover the projectile family, not the whole tower or native executable parity.

The previously running building-reference generation was stopped and restarted with the corrected explicit coverage option; those larger references remain in progress.

## Explicit source pose API

`archer-tower-art.ts` exposes the original building and resident-character graphs. Building poses compose the base with ready, construction, upgrade or ruined artwork for all 21 tiers. Alternate forms require an actual source export (tiers seven and above); missing forms throw instead of falling back. Resident poses resolve the tier's Archer variant and explicit direction 1–3, using the original idle/attack animation rows. Nonlooping attacks hold their last source frame. Some original attacks return to their first pose at the end, so start/end visual inequality is not assumed.

The caller supplies world registration, direction and sampling time. No tower attachment, shot timing, target-facing rule or gearing eligibility is inferred here. Six focused pose/source tests pass across all tiers and directions, and production build passes. Full building and resident CPU reference generation remains in progress; these APIs are not yet wired into live village/battle presentation.

## Browser state gallery

The three-page browser gallery covers all 21 tiers with normal, alternate (when present), construction, upgrade and ruined bodies, plus all three idle and attack resident directions: 225 populated cells. Chromium and WebKit each pass all three pages, with nonempty native views, adequate actual framebuffer dimensions, zero GL errors and complete view destruction. All three WebKit pages were visually reviewed. Each cell fits its own source geometry for inspection; this does not establish relative world scale or rooftop attachment. The exhaustive resident pixel comparisons are tracked separately.

## Exhaustive resident pixel witnesses

The resident source renderer has completed 2,708 cases: frame zero of all 54 idle/attack exports plus all 2,654 retained clip frames. Seventeen bounded sheets retain independent CPU pixels, source transforms and per-case RGBA hashes. A coverage test verifies every export and frame is represented. Seven focused source/pose/coverage tests pass.

Chromium passes all 17 resident sheets, plus the existing projectile sheet. Worst resident mean channel error is 0.4359244, maximum individual channel error 85, and worst large-error fraction 0.001953761, below the unchanged thresholds. Batching changes, context-restoration changes and GL errors remain zero. This is threshold-based qualification, not pixel identity. WebKit qualification is still running and must be recorded separately when complete. Building-frame source generation also remains in progress.

## Resident qualification completed and generation recovery

WebKit completed all 17 resident sheets: pages 1–14 in the initial run, then pages 15–17 after the original process disappeared. All 2,708 resident cases pass in both browsers with unchanged thresholds. Worst mean error is 0.43592437 in Chromium and 0.58385965 in WebKit; maximum channel error is 85 and worst large-error fraction is 0.001953761 in both. Batching changes, context changes and GL errors are zero. `resident-pixel-qualification.json` records the source binding, coverage, metrics and split WebKit run. This supersedes the earlier pending status, without claiming pixel identity or world-attachment accuracy.

The reference generator now writes and releases each completed sheet instead of retaining all sheets until the end. Input-bound checkpoints in ignored output permit reuse only when the generator, source metadata, source compositor/rasterizer, NumPy version, PNG and JSON hashes match. The complete index is written after all sheets finish. `--check` always reconstructs pixels independently and never uses checkpoint shortcuts. The 19-case projectile fixture was verified unchanged, valid reuse was exercised, and an invalidated checkpoint correctly forced regeneration followed by a passing independent check. The interrupted building job had not written its in-memory sheets, so it was restarted with this bounded-memory, per-sheet workflow after confirming its process and handle were gone.

## Combined rooftop preview

`archerTowerComposition` combines the original body with its resident variant for ready/upgrading states, omitting residents from construction and ruins. The source-defined single resident uses the tier's normal or alternate defender height. The explicit local projection places the three-tile platform center at source y=60 and projects vertical units at 0.5 pixels. This is a visually reviewed interpretation, not verified native executable attachment or depth ordering.

A 36-cell gallery covers all normal tiers and all available lowered forms. Chromium and WebKit pass view presence, actual framebuffer height and zero-GL-error checks; both rendered previews were reviewed, and gallery labels were moved clear of taller artwork. WebKit's first attempt failed during module import; its completed rerun passed. Three focused pose/composition tests and production build pass. The composition is still separate from live village/battle rendering and combat timing.

## Live village native artwork

`VillageArcherTowers` now preloads and renders the original tower and resident graphs in the home village, reusing separate per-building views and destroying retired views. Construction and ruin omit the resident; upgrades preserve the idle resident. Reduced motion samples time zero. The old home thumbnail is hidden. Selection and status-height calculations use bounds traversed from the actual native geometry, including resident blend groups. World registration uses the existing three-tile local convention (1.2 scale, −96 vertical offset), with the previously documented local rooftop projection.

Chromium and WebKit each pass 84 tier/state cases, resident presence/absence, inside/outside selection, 21 simultaneous native buildings, village-to-battle retirement, restored village views and removal cleanup. The WebKit live village screenshot was reviewed. Eight focused source/pose tests and production build pass. Gallery fixtures exercise all captured tiers without expanding home progression. Battle artwork/timing and placement preview integration remain separate work; the current battle path retains its prior presentation. Full building pixel witnesses are still generating.

### Placement preview

Home placement and movement use the original tower and resident graphs, preserving the moved building tier and state. The stationary preview shares the village transform, uses 72% opacity, and tints both graphs red on invalid tiles. Cancellation, changing building types, and scene cleanup retire both views. All 21 tier previews, invalid boundaries, new level-one placement, and switching to a Gold Mine pass Chromium and WebKit; the WebKit screenshot was visually reviewed. This does not change battle artwork, progression, or the locally interpreted resident attachment.

## Building pixel qualification completed

All 6,158 independent cases are retained in 39 bounded sheets: 80 original export frame-zero cases plus all 6,078 retained clip frames. Coverage checks pass for every export and frame, and all saved PNG cells match their independent RGBA hashes. The source artwork importer again passes complete geometry and decoded texture reconstruction. The first browser sheet, including all tower exports and referenced effects, was visually reviewed in both browsers.

Chromium and WebKit pass every case with the unchanged mean-error <1 and large-error fraction <0.003 thresholds. Worst mean error is 0.71655247 in Chromium and 0.85204082 in WebKit. Maximum single-channel difference is 8 in both browsers, with zero large-error pixels in both. Texture-batch changes, context-restoration changes and GL errors are zero. WebKit completed pages 1–23 before the shared server stopped after Chromium finished; pages 24–39 then passed with a WebKit-managed server. `building-pixel-qualification.json` records the source hash, every fixture file hash, metrics and split-run circumstances. This completes the previously pending building-frame qualification without claiming exact pixel identity or native executable parity.

## Original audio capture

Nine source-referenced Ogg samples (71,202 bytes) are preserved byte for byte, including all attack sound variants, pickup, placement, mode toggle, destruction and impact samples. The importer pins SHA-256 and verifies each sample against the original fingerprint's SHA-1 membership. Metadata binds the complete original effect rows and definition hash; reconstruction and sample integrity tests pass. Playback integration is separate work.

## Home handling audio and particles

Archer Tower pickup, successful placement and cancellation now flow from model events into the native village presentation. Pickup uses the original three Grass particles; placement uses three Place particles and three Grass particles, preserving source emission durations, lifetime ranges, variants and layers through the shared local particle-motion interpretation. Motion equations remain locally interpreted rather than verified against the original executable. Both original handling samples play at source volume 80%, pitch 1 and zero delay through the existing shared sample queue. Cancellation clears the building's pending events, event history is bounded, and expired/cleared views retire. Reduced motion suppresses particles while retaining audio.

The generic placement sound is suppressed for Archer Towers and Dark Elixir Drills, preventing duplicate native/generic playback. Twenty focused model, particle, audio source and shared sample-queue tests pass. Chromium and WebKit each pass five browser checks covering all nine audio decodes, handling/cancellation/reduced motion, rejected and accepted placement without duplicate sound, all-tier previews and live native village transitions. The placement screenshot waits for postrender; its WebKit image was reviewed with the HUD hidden to expose the original dust and grass. Production build passes. Attack, impact and destruction sample playback still await battle integration.
