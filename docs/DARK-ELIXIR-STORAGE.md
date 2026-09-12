# Native Dark Elixir Storage

Updated September 12, 2026. The placed storage now uses original native polygon meshes, source textures and resource-fill clips at all 13 levels. Home construction still follows Town Hall 7–8 limits (levels 1–4); later models support imported combat snapshots and future campaign stages. No source village is enabled by clamping an unsupported building or replacing its mechanics.

## Source and rendering

[The source reference](../reference/dark-storage/README.md) records the pinned client bundle, input hashes, original sparse CSV rows, complete graph, crop maps and decoded pixel hashes. The importer preserves 27 shapes, 15 clips and 13 registered previews. One 1024×895 lossless texture retains all sampled texels and bilinear neighbours from the original 1276×1974 texture. The runtime graph is about 66 KB of JSON.

The named `resource` child has 160 control frames and nine distinct fill states. Empty uses frame 0; positive fill maps linearly to frames 1–159; full never wraps to empty. Live meshes retain the original glass/liquid ordering. A transparent registered preview remains the pointer target. Shop, selection and Info images use full-storage previews; generic high-level scaling and tint do not alter the native models. Cached poses update when level, fill frame, position or construction alpha changes. Destruction, battle changes, return home and scene shutdown remove obsolete meshes.

Home fill is the Dark Elixir balance divided by completed storage capacity, clamped to 0–1. Native campaign fill starts from remaining/original stage loot and decreases with that storage's lost health, matching the local damage-based payout approximation. Damage to another holder does not drain the same storage twice. Practice uses full storage without reading home balances, so shared playback remains independent of the viewer.

World scale 1.2 and source anchor `(0,80)` are calibrated. The exact native engine's projection, fill thresholds and payout timing remain unverified. Construction/upgrade displays, glass-pit ruins, pickup/placement effects and associated sounds still need their source implementations. Broader Town Hall resource storage and the existing gold/elixir economy remain separate fidelity work.

## Progression and existing villages

Storage hitpoints, capacity, Elixir cost, upgrade time and Town Hall requirements come from all 13 inherited source rows. First construction costs 250,000 Elixir and takes eight hours. Levels 1–4 hold 10,000, 17,500, 40,000 and 75,000 Dark Elixir. The Info panel, upgrade quote and completed-building capacity use those values. An unfinished storage adds no capacity; upgrading keeps the old capacity until completion.

Old home saves adopt source hitpoints while preserving their damage fraction. Existing Dark Elixir is retained even if a corrected capacity is lower than the saved balance; collection and new battle rewards respect available headroom. Recorded combat building health is preserved in its snapshot. Combat version 32 retains Dark Elixir inventory/headroom through export, import, playback and seeking; [campaign rules](CAMPAIGN-RULES.md) document the accounting and stage gates.

## Validation

The model suite passes 972 tests across 77 files. Storage tests cover all inherited stats and home limits, upgrade completion, preserved balances, incomplete storage, all nine fill states at every level and independent Python pose comparisons for 39 level/fill combinations.

Twelve affected browser cases pass in each of Chromium and WebKit at DPR 2: storage Info/fill/reload, per-holder depletion and cleanup, three-resource battle/result layouts at desktop/portrait/landscape, hero progression and Dark Elixir collection, and native GPU comparisons. The GPU test compares empty, half-full and full models at all 13 levels against independently rasterized original source texels. Worst per-case mean maximum-channel error is 0.458/255 in Chromium and 0.657/255 in WebKit; fewer than 0.041% of non-background pixels exceed 16/255. A few polygon-edge pixels differ by up to 49/255. Forced single-texture batching and WebGL context restoration reproduce exactly the prior browser pixels. This validates source reconstruction within stated rasterization tolerances, not pixel identity with a running native client.

Reproduce the source reference independently with:

```sh
output/native-art-venv/bin/python scripts/import-native-dark-storage.py --check
output/native-art-venv/bin/python scripts/native-dark-storage-gpu-fixtures.py --check
npm test
npm run build
npm run test:production
npm run test:heroes:production
npm run test:dark:production
```

General, hero and Dark Elixir replay production checks pass in Chromium and WebKit with no page/asset errors. The built bundle caches 264 files under `crown-clan-501ab0fbe562`; Chromium also passes offline reload and portable Dark Elixir replay import. The explicit replay fixture credits 700 Dark Elixir, reports 550 overflow, rewinds and replays to the same result, and leaves home balances unchanged. Two additional Chromium runs captured settled desktop/phone Info panels.

Evidence, screenshots and reports are in `output/playtest/dark-storage-*`, indexed with source hashes by `dark-storage-verification.json`. The full game still needs the later campaign mechanics and physical-device qualification before it can be described as production-complete.
