# Barbarian presentation

September 11, 2026. The starter melee troop is now named Barbarian throughout Army, research, troop details, battle cards, history compositions and the guide. Its portrait and four-frame walk atlas replace the prototype's tunic, blue sash and boots with the bare chest, yellow flat-top hair and horseshoe mustache, studded wristbands, leather kilt and sandals.

## Reference and generation

The visual reference is [Supercell's Barbarian illustration](https://support.supercell.com/images/Barbarian-Triumphant.png?v=1676029959), linked from its [Store receipt support article](https://support.supercell.com/supercell-store/en/articles/finding-your-supercell-store-receipt-2.html). [Supercell's Barbarian costume announcement](https://supercell.com/en/games/clashofclans/blog/news/barbarian-look-alike-online-competition/) also identifies the blond hair, sword and mustache. The downloaded reference is used for comparison and image generation; it is not a runtime asset.

Two calls to the built-in image-generation tool produced the new sheet. The first established the character but drew an opaque checkerboard and repeated strides. A targeted second call corrected the legs and replaced the checkerboard with a flat magenta matte. Both generated sources and exact prompts are retained under `art/source/barbarian-v1/`; provenance records the reference and output hashes. These are newly generated interpretations, not a claim of pixel-identical native sprite frames.

## Shipping pipeline

`node scripts/barbarian-assets.mjs` extracts the matte, removes edge color spill and splits the sheet at measured gutters. It registers each frame by the yellow hair and applies one shared scale across all four poses. Feet sit at pixel 122 of each 128px frame. Lossless WebP preserves the resulting alpha and small sprite details.

| Use | File | Dimensions |
| --- | --- | --- |
| Army, details, guide, research and battle cards | `public/assets/characters/barbarian-v1.webp` | 360×377 |
| Camps and combat | `public/assets/characters/walk/barbarian-v1.webp` | 512×128, four frames |

The atlas faces left natively, uses 140ms battle frames and a 1.6 display multiplier to account for its wider sword silhouette. The passing frame is used for idle, attacking and reduced motion. Walking uses the drawn stride without added body bob. Mirroring, battle-time pause, playback speed, camp pathing and procedural attack recoil continue through the existing presentation system.

The internal `swordsman` identifier is intentionally retained in armies, queues, laboratory levels, presets, hero summons and replay actions. Combat stats and save/replay versions are unchanged. Original prototype assets remain available to the original atlas-build scripts; `asset()` and `walkAsset()` route the retained key to the new versioned files. `npm run assets` includes the new importer; `--check` verifies exact rebuilds in CI. Production checks require both assets to load.

## Verification and remaining work

Asset checks require four distinct frames, real transparent margins, no visible magenta matte, sufficient silhouette coverage and aligned feet. Browser scenarios exercise the player-facing name, card/detail portraits, adding and reloading troops, the actual camp texture pixels, idle poses, left/right facing, four walking poses, frozen battle time and reduced motion. Existing army and replay scenarios cover the shared paths.

This pass covers one low-level Barbarian appearance. Level-specific weapons/armor, full directional sprites and dedicated idle/attack/death animation sets remain open, while the subsequent [starter troop progression pass](STARTER-TROOP-PROGRESSION.md) supplies native Barbarian and Archer values through level 5. Physical-phone visual/thermal QA remains separate from browser emulation.
