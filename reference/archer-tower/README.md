# Original Archer Tower source foundation

Captured from public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, at [the original asset host](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json).

`scripts/import-native-archer-tower-source.py` pins SHA-256 for the fingerprint, building, projectile, effect and emitter tables, and independently verifies each table's SHA-1 membership in that fingerprint. `--check` reconstructs the complete document and compares it byte for byte.

The capture preserves all 21 raw tier rows and inherited tier records, 10 referenced projectile definitions (including alternate variants), 7 effects with recursive spawned effects, and 11 particle emitters. Source fields and units remain strings, without inferred timing, projectile trajectories or alternate-mode arithmetic. Level 15 specifies 1,230 HP, 85 DPS, a 500-ms attack interval and range 1000 source units; alternate fields separately specify 200 DPS, 250 ms and range 800. The level-15 regular and alternate body exports and projectile names remain distinct.

Importer reconstruction and the focused source test pass. This is a definition capture, not an artwork or combat integration. Original scene graphs, textures, resident archers, projectiles, effects, timings and mode behavior still require implementation and qualification. Midnight Oil remains gated by Archer Tower level 15 and Inferno support. No runtime behavior or home progression changes in this commit.

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

The new browser pixel test currently fails in Chromium and WebKit. It retains the established mean-error <1 and large-pixel-fraction <0.003 thresholds. Texture-batch changes, context restoration changes and GL errors are zero; all six original isolated groups remain present. Several source/GPU edge pixels differ, especially clip 352. Its first Chromium frame has mean error about 0.979 and large-pixel fraction about 0.0202; WebKit also exceeds the mean threshold in some cases. Initial reported outliers cluster along a vertical edge where the CPU darkens pixels that the GPU leaves at background color. The cause remains unproven. Neither source geometry nor thresholds have been changed to conceal this difference.

`projectile-pixel-investigation.json` records the failing measurements. The browser regression remains active and failing until the discrepancy is resolved or characterized with sufficient evidence. This is not a passing pixel-qualification claim.
