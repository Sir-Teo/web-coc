# Original Cannon source reference

This reference preserves the Cannon from public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. Seventeen inputs are pinned by SHA-256 and checked independently against the original fingerprint's SHA-1 entries. Source records come from the [fingerprint](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json), [building table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv), [projectile table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv), [effect table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/effects.csv), [particle table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/csv/particle_emitters.csv), original SC graph, SCTX textures and five Ogg samples.

This is a source foundation. Live Cannon rendering, the twelve-level retained cap, home limits, campaign gates and combat version 35 remain unchanged. High Pressure still requires Cannon level 15. Importing alternate bodies does not enable geared-up combat.

## Preserved artwork

The original graph contains **101 exports, 153 clips and 1,305 shapes**. It preserves twenty-one normal bodies, fifteen alternate bodies, named turret and gear controls, eleven bases, construction, scaffolds, rubble, eleven projectile families and source effects. Polygons, transforms, colors, timelines, instance names and normal/additive blend boundaries are retained exactly.

The import ships **32 assets / 12,251,854 bytes**: six lossless packed textures, twenty-one transparent portraits and five original Ogg files. Packing copies the original sampling regions and bilinear neighbors; it does not resize or redraw the art. Texture 18 contains 706 copied regions in a 2,552×4,056 atlas. The remaining texture sources are 2, 8, 25, 39 and 41.

Normal portraits combine the level's original base and body at source frame zero, with `turret=0` and `gearup=false`. All use conservative shared bounds **[-101, -25, 104, 148]**, producing **410×346 pixels at 2×**. These bounds enclose all source placements, including independently animated siblings, with eight native units of padding. Portrait framing is local and does not establish a native camera projection.

## Direction and animation

Every normal and alternate root retains its **360-frame, 30-fps** timeline. Levels **14–15** have 81 distinct parent placement patterns and nested animated effects. Their root animation must remain independent of the selected turret frame during future integration.

Normal turret timelines have 360 frames, except level 21, which has **365**. Most preserve 36 placement patterns, but equal ten-frame direction bins would corrupt the source: level 11 includes nine- and eleven-frame bands, level 12 has **41 patterns** including single-frame transitions, levels 17–20 have **35 patterns** with a shared twenty-frame band, and level 21 has a fifteen-frame terminal band. All normal and alternate timelines remain literal. Native engine angle selection has not been verified.

Separate named gear controls begin at source level 7. Alternate bodies `basic_turret_lvl7_down` through `basic_turret_lvl21_down` are preserved with both enabled and disabled controls. Source burst fields retain range 700, interval 1600, four shots and a 192 delay, alongside the BB Double Cannon level-3 requirement. None is presented as implemented burst behavior.

## Source progression and projectiles

Normal mode is ground-only with `GlobalID=1000008`, a 3×3 footprint, range 900 and an 800-ms attack interval. Compact values retain source units and destination-level prices and durations separately from renderer assumptions.

| Level | TH  |    HP | DPS |      Gold | Seconds |
| ----- | --- | ----: | --: | --------: | ------: |
| 1     | 1   |   300 |   7 |       250 |       5 |
| 2     | 2   |   360 |  10 |     1,000 |      30 |
| 3     | 2   |   420 |  13 |     4,000 |     120 |
| 4     | 3   |   500 |  17 |    16,000 |   1,200 |
| 5     | 4   |   600 |  23 |    50,000 |   1,800 |
| 6     | 5   |   660 |  30 |    60,000 |   3,600 |
| 7     | 6   |   730 |  40 |   100,000 |   7,200 |
| 8     | 7   |   800 |  48 |   160,000 |  10,800 |
| 9     | 8   |   880 |  56 |   250,000 |  12,600 |
| 10    | 8   |   960 |  64 |   330,000 |  14,400 |
| 11    | 9   | 1,060 |  74 |   500,000 |  16,200 |
| 12    | 10  | 1,160 |  85 |   600,000 |  18,000 |
| 13    | 10  | 1,260 |  95 |   660,000 |  21,600 |
| 14    | 11  | 1,380 | 100 | 1,000,000 |  28,800 |
| 15    | 11  | 1,500 | 105 | 1,200,000 |  36,000 |
| 16    | 12  | 1,620 | 110 | 1,300,000 |  39,600 |
| 17    | 12  | 1,740 | 115 | 1,500,000 |  43,200 |
| 18    | 13  | 1,870 | 125 | 1,800,000 |  57,600 |
| 19    | 13  | 2,000 | 135 | 2,000,000 |  72,000 |
| 20    | 14  | 2,150 | 150 | 2,600,000 |  86,400 |
| 21    | 15  | 2,250 | 160 | 3,000,000 | 129,600 |

The first twelve HP/DPS/cost/time rows match existing runtime values. The source building table lists Town Hall 2 for Cannon level 2, while the current audited home rules permit level 2 at Town Hall 1. This discrepancy is retained explicitly for investigation during live integration; this import changes neither rule nor old saved deadlines. The playable Town Hall 8 ceiling remains level 10.

Eleven projectile families retain `Speed=1200`, `IsBallistic=FALSE`, `DontTrackTarget=FALSE`, `UseRotate=TRUE` and `Scale=100`. Their start heights range from 48 to 75 and offsets from 50 to 76. No family declares a shadow export. Later levels reference the original Spark Trail, Spark Trail B or Spark Trail Jungle emitters. The current live Cannon speed remains a locally tuned 16 tiles per second; adopting the source value of 12 will require explicit replay compatibility verification.

Seven effect records preserve **20 emitters and 47 ordered particle variants**, including per-variant blend flags. The source sounds are `cannon_08.ogg`, `cannon_drop2.ogg`, `cannon_pickup3.ogg`, `generic_hit_01.ogg` and `building_destroyed_01.ogg`. Original effect attachment, offsets, timing, volume and pitch fields are retained without claiming native executable playback parity.

## Reproduction

With the native-art Python requirements installed:

```sh
PYTHONPATH=scripts python scripts/import-native-cannon.py --check
PYTHONPATH=scripts python scripts/native-cannon-gpu-fixtures.py --check
npx vitest run tests/native-cannon-reference.test.ts
npm run build
npm run test:cannon:assets
```

Independent Python pixel witnesses sample original full SCTX textures. The browser suite uses the packed textures and production mesh renderer. Eight bounded pages cover **1,332 direction compositions, 90 detail/state compositions and 107 effect compositions**: all 101 exports, every distinct turret placement pattern and terminal frame, enabled/disabled controls, animated parents, construction/base/rubble states and all 47 particle variants. Page dimensions stay within 2,400×12,000 pixels.

All 1,529 compositions pass the established mean-error and outlier-fraction thresholds in both Chromium and WebKit. Forced single-texture batching and restored graphics contexts produce zero changed bytes; all recorded GL checks are zero. Maximum per-case mean channel error is 0.663266 in Chromium and 0.852041 in WebKit. The eight direction cases with outliers have 45/46 pixels above 16/255 respectively; their original polygon edges lie within 0.000003815 pixels of the affected pixel centers. One animated level-15 detail has six such pixels per engine, each within 0.000415199 pixels of an original triangle edge. The reports retain these coverage differences; source geometry and thresholds are unchanged. Effects have no pixels above 16/255.

All 32 packaged assets decode in both engines, and Chromium loads identical bytes/dimensions/audio metadata after an offline reload. The general production check also passes both engines, with 506 cached files and offline Army/replay coverage in Chromium. Verification details and remaining limits are recorded in `docs/QA.md` and the frozen Cannon foundation manifest. Native executable timing/projection, geared-up simulation, live original Cannon integration, physical-device qualification and the broader production-clone goal remain open.
