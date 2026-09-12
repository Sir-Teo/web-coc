# Native Goblin campaign buildings

Updated September 12, 2026. Goblin Town Halls and Huts now use the original native building meshes, animated Hall flag, textures and foundation artwork. All eleven passive Town Hall levels used by the 90 campaign layouts have their source hitpoints. The first 50 complete native layouts remain playable; Invaders still needs Hidden Tesla 7 and Bomb Tower 3. Later unsupported mechanics remain gated. See [campaign rules](CAMPAIGN-RULES.md).

## Source identities and combat

The pinned public client is 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. [The Goblin source record](../reference/goblin-buildings/README.md) includes the original sparse building rows, full selected scene graph, texture crop maps, source hashes and decoded pixel witnesses. [Campaign NPC data](../reference/campaign/npc-buildings.json) is regenerated from the same building table and now includes every Hall level found in the source layouts.

| Identity | Global ID | Archetype | Footprint | Hitpoints | Weapon |
| --- | --- | --- | --- | --- | --- |
| Town Hall using NPC export | 1000001 | townhall | 4×4 | 400, 800, 1,600, 2,000, 2,400, 2,800, 3,300, 3,900, 4,600, 5,500, 6,800 at levels 1–11 | Passive |
| Goblin Hut | 1000018 | builder | 2×2 | 250 | Passive |
| Tutorial Cannon | 1000060 | cannon | 3×3 | 250 | Ground only, nine-tile range, 1.6 damage every 0.8 seconds |

Native layout levels are zero-based; `makeNpcBuilding` accepts one-based levels. Each Hall inherits `ExportNameNpc=goblin_townhall_lvl1`. It uses its Town Hall level's hitpoints, not the separate 750-HP `Goblin Hall` record (1000017). All 71 Town Hall placements across the source layouts fit this passive level range. The next source row, level 12, introduces `Weapon=Townhall12` and is explicitly rejected by this implementation. Home Town Hall progression remains capped at level 8.

The Hut has no DPS or housing capacity. Its saved `units` arrays do not spawn defenders, including the five Balloons in Goblin Forest's template. Goblin Castle and boss defenders remain separate unfinished mechanics. The Tutorial Cannon retains the ordinary Cannon's nine-tile range/0.8-second cadence, but its source DPS is 2, rather than 7. It is an NPC-class ordinary target for defense-preferring troops and has no authored campaign defense multiplier.

## Rendering and registration

Fourteen original shapes and seven clips are retained. The foreground Hall and Hut use texture 37; the native dirt/stone foundations and baked shadows use texture 8. Lossless packing preserves all sampled texels, bilinear neighbours, source polygons, complete affine transforms and layer order. Six assets are shipped: two packed textures, two foreground previews and two foundation previews. The Hall flag contains eight distinct states in a 24-frame, 24-fps loop. The Hut is static.

Foreground scale is uniformly 1.2, with source anchors `(0,80)` for the Hall and `(0,40)` for the Hut. Previews use matching registration and remain transparent pointer proxies while live polygon meshes supply the artwork. Generic high-level tint and size enlargement do not alter these buildings. Source foundation geometry is registered separately to the local 64×32 tile projection by fitting its bounds to the four- or two-tile diamond. Ground meshes draw below buildings, troops, ruins and deployment markers.

Flag playback follows battle time and freezes at frame zero for reduced motion. Idle scouting remains at time zero under the existing deterministic presentation convention. Render signatures avoid rebuilding static foundations or unchanged flag frames. Destruction removes the foreground mesh while retaining the foundation beneath existing generic ruins. Battle changes, replay seeks, return home and scene shutdown clean up retained meshes.

The foreground/world scale, native Hall foundation association, ground projection, scouting/flag phase convention and foundation persistence after destruction are calibrated interpretations. Exact engine registration and native destruction/effects/audio still need verification or implementation. Tutorial Cannon artwork is still the earlier generated approximation. The retired generated Goblin art remains recorded under `art/source/goblin-buildings-v1/`; it is no longer used for placed Goblin buildings.

## Persistence

`Building.npc` keeps enemy identity separate from the Home Village archetype and shop. Home saves and practice snapshots reject NPC fields. Replay validation uses the exact NPC level limit independently of the Home Village ceiling; identity, kind and level must still match. This permits native level-9–11 Hall snapshots without admitting weapon-bearing Hall 12, arbitrary NPCs or higher Home Village Hall levels. Portable export retains identity and level. Older combat records keep their version policy; this presentation/level extension does not reinterpret previous battle rules.

## Verification

The full model suite passes 987 tests across 78 files. Coverage includes every source Hall placement and level, passive Huts, Tutorial Cannon firing/target preference, rejected Home/practice NPCs, eleven-level replay export/seek/restart, all flag states and periods, grid registration, and twelve independent Python pose witnesses.

Nine affected browser cases pass in each of Chromium and WebKit at DPR 2, including desktop, phone portrait and landscape. They exercise actual Payback victory/reload/replay, large native scenery transitions, registered native building display, flag pause/reduced-motion behavior, pointer selection, destruction/return cleanup and independent GPU pixel comparisons. The lifecycle test compares source drawing order by mesh depth, rather than retained-map insertion order when a flag frame is replaced.

The GPU reference covers all eight flag states, the Hut, both foundations and a long battle clock. It uses independently rasterized original source textures and the Python graph reader. Single-texture batching and WebGL context restoration must reproduce the prior browser pixels exactly. Worst per-case mean maximum-channel error is 0.603/255 in Chromium and 0.785/255 in WebKit; maximum channel errors are 14/255 and 15/255, with no compared pixel exceeding 16/255. Mean/maximum errors and production results are indexed in `output/playtest/native-goblin-verification.json`; this tests reconstruction within stated rasterization tolerances, not equality with a running native client.

```sh
output/native-art-venv/bin/python scripts/import-native-goblin-buildings.py --check
output/native-art-venv/bin/python scripts/native-goblin-gpu-fixtures.py --check
python3 scripts/import-native-campaign.py --check
npm test
npm run build
npm run test:production
npm run test:goblin:production
```

General production checks pass in both engines with no page or asset errors. The production NPC replay verifies a level-11 Hall at 6,800 HP through import, seek and canonical export. Chromium additionally decodes both native foreground previews and reimports the recording after an offline reload. The bundle precaches 270 files under `crown-clan-459fed3dacb2`; WebKit offline operation remains unchecked.

Screenshots, logs and source/release witnesses are under `output/playtest/native-goblin-*` and `output/playtest/goblin-buildings-*`. The complete game, later campaign mechanics and physical-device qualification remain unfinished.
