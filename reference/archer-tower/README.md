# Original Archer Tower source foundation

Captured from public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, at [the original asset host](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json).

`scripts/import-native-archer-tower-source.py` pins SHA-256 for the fingerprint, building, projectile, effect and emitter tables, and independently verifies each table's SHA-1 membership in that fingerprint. `--check` reconstructs the complete document and compares it byte for byte.

The capture preserves all 21 raw tier rows and inherited tier records, 10 referenced projectile definitions (including alternate variants), 7 effects with recursive spawned effects, and 11 particle emitters. Source fields and units remain strings, without inferred timing, projectile trajectories or alternate-mode arithmetic. Level 15 specifies 1,230 HP, 85 DPS, a 500-ms attack interval and range 1000 source units; alternate fields separately specify 200 DPS, 250 ms and range 800. The level-15 regular and alternate body exports and projectile names remain distinct.

Importer reconstruction and the focused source test pass. This is a definition capture, not an artwork or combat integration. Original scene graphs, textures, resident archers, projectiles, effects, timings and mode behavior still require implementation and qualification. Midnight Oil remains gated by Archer Tower level 15 and Inferno support. No runtime behavior or home progression changes in this commit.

## Reachable artwork inventory

`scripts/native-archer-tower-inventory.py` resolves building, alternate, construction, ruin, projectile and particle export references against pinned original scene files, verifying fingerprint membership. Its `--check` mode reconstructs the inventory byte for byte. It records export IDs, reachable shape IDs, clip frame counts, frame labels, named children, blend modes and original texture identities/dimensions, and explicitly records masks and text fields.

The building/effect graph contains 80 exports, 84 clips, 102 shapes and 6,078 frames on building textures 8, 18, 25 and 39, using blend mode 0. The projectile graph contains four exports, six clips, eight shapes and 15 frames on character texture 7, using modes 0 and 8. Neither reachable graph includes masks or text fields. Reconstruction passes.

This inventory does not yet contain graph geometry or texture pixels. The tower's separately named resident defender also needs capture: level 15 specifies `DefenderCharacter=Archer7`. That character is not a building export and is not included in these counts. World attachment and attack synchronization remain unverified.
