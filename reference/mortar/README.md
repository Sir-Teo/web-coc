# Original Mortar source reference

This reference preserves the Mortar from public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. Sixteen inputs are pinned by SHA-256 and independently checked against the bundle fingerprint's SHA-1 membership. The original [fingerprint](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json), [building table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv), [projectile table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv), [effect table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/effects.csv) and [particle table](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/csv/particle_emitters.csv) are the source of the retained records.

The original world graph contains **78 exports, 110 clips and 346 shapes**. Five lossless crops preserve the used regions of `buildings_8`, `25`, `36`, `39` and `66`. The import ships **28 assets / 3,551,318 bytes**: five cropped textures, eighteen transparent portraits and five unchanged Ogg files. The graph keeps source polygons, strips, transforms, colors, timelines, instance names and normal/additive blend boundaries. Texture packing copies original sampling regions and bilinear neighbors; it does not resize or redraw the artwork.

This is a source foundation. The live game still uses its earlier generated Mortar interpretations and ten-level combat table. Original live rendering, the later levels and native projectile behavior remain to be integrated. The source import does not unlock High Pressure or geared-up mode.

## Bodies and controls

All eighteen `mortar_lvlN` bodies have one-frame roots at **24 fps**. Their named `turret` child selects eight original barrel views: source indices **0–44, 45–89, 90–134, 135–179, 180–224, 225–269, 270–314 and 315–359**. Levels 15–18 retain a **361st frame**, index 360, with the final view. That extra frame is preserved rather than trimmed into an assumed 360-frame format.

Levels 5–18 contain a separate named `gearup` child. The foundation retains that graph and tests both enabled and disabled controls. Normal portraits explicitly disable it. Its presence at a source level does not establish a playable gear-up unlock. The source `GearUpBuilding=BB Multi Mortar`, level requirement and alternate weapon fields remain in the building records for later investigation.

The source also supplies `mortar_base`, `mortar_const`, `mortar_upg` and all six variants of `destroyedBuilding_3s_pit_rock`. Eighteen portraits combine the original base with turret frame zero and `gearup=false`. Their shared native bounds **[-84, -22, 89, 146]** enclose all retained directional, gear-up, construction and rubble geometry with eight units of padding. Portraits are **346×336 pixels at 2×**. Their framing is local; the common source origin is preserved for later world registration.

## Normal-mode source values

The source identity is `GlobalID=1000013`, with a 3×3 footprint, ground-only targeting, `AttackRange=1100`, `MinAttackRange=400`, `AttackSpeed=5000` and `DamageRadius=150`. The compact projection retains these fields separately from renderer choices. Build prices are gold; durations refer to reaching each level.

| Level | TH  |    HP | DPS |       Gold | Build time |
| ----- | --- | ----: | --: | ---------: | ---------- |
| 1     | 3   |   400 |   4 |      5,000 | 30m        |
| 2     | 4   |   450 |   5 |     25,000 | 1h         |
| 3     | 5   |   500 |   6 |     90,000 | 2h         |
| 4     | 6   |   550 |   7 |    180,000 | 3h         |
| 5     | 7   |   600 |   9 |    300,000 | 6h         |
| 6     | 8   |   650 |  11 |    500,000 | 8h         |
| 7     | 9   |   700 |  15 |    900,000 | 12h        |
| 8     | 10  |   800 |  20 |  1,200,000 | 18h        |
| 9     | 11  |   950 |  25 |  1,600,000 | 20h        |
| 10    | 11  | 1,100 |  30 |  1,800,000 | 1d         |
| 11    | 12  | 1,300 |  35 |  2,300,000 | 1d 6h      |
| 12    | 12  | 1,500 |  38 |  2,400,000 | 1d 12h     |
| 13    | 13  | 1,700 |  42 |  2,800,000 | 2d         |
| 14    | 14  | 1,950 |  48 |  4,300,000 | 2d 12h     |
| 15    | 15  | 2,150 |  54 |  5,000,000 | 3d         |
| 16    | 16  | 2,300 |  60 |  7,000,000 | 4d         |
| 17    | 17  | 2,450 |  66 | 13,000,000 | 5d         |
| 18    | 18  | 2,550 |  72 | 21,000,000 | 12d 12h    |

The first ten rows agree with the existing audited runtime table. The TH8 home ceiling remains level six. High Pressure still requires Mortar 11 and Cannon 15.

## Shells, particles and audio

Thirteen projectile families cover the eighteen levels. All retain `Speed=500`, `StartHeight=95`, `StartOffset=20`, `IsBallistic=TRUE`, `DontTrackTarget=TRUE`, `UseRotate=FALSE` and the original `simple_shadow_small` export. Projectile and trail graphs retain their own nested animations, tint and additive groups. These records do not establish the native engine's ballistic equations or justify keeping the current locally authored 1.15-second flight.

Seven effect records refer to **24 emitters and 64 ordered particle variants**. They include launch smoke/fire, three impact tiers, debris, pickup grass and placing effects. Repeated effect rows are significant: the first hit tier includes three separate Grass rows. The `yellow_fireball_trail_emitter` has the ordered blend flags **true, false, true, false, true**; a single emitter-wide additive flag would incorrectly brighten its smoke. Source placement/attachment, heights, durations, delays and camera-shake fields are retained without asserting native playback parity.

The five source sounds are `mortar_fire_02_with_fall.ogg`, `mortar_hit_01.ogg`, `mortar_pickup_01.ogg`, `mortar_place_02.ogg` and `building_destroyed_01.ogg`. Launch uses source volume 70 and pitch range 95–105. Source effect volumes, pitch ranges and delays remain in `effects.json`; this foundation does not alter the live audio mixer.

## Reproduction and verification

With the native-art Python requirements installed:

```sh
PYTHONPATH=scripts python scripts/import-native-mortar.py --check
PYTHONPATH=scripts python scripts/native-mortar-gpu-fixtures.py --check
npx vitest run tests/native-mortar-reference.test.ts
npm run build
npm run test:mortar:assets
```

The importer checks every source fingerprint entry, original sound byte, output image pixel and graph field. The independent Python witnesses use original full SCTX textures; the browser tests use the packed runtime textures and the production mesh renderer. **173 body and 140 effect compositions per engine** cover all 78 exports, every level's eight views, optional/disabled controls, late terminal frames, all rubble variants, projectile animation samples and every ordered emitter variant. Two deliberately empty `d6` smoke endpoints remain empty.

The Chromium and WebKit tests retain the established mean-error and outlier-fraction criteria. They also test forced single-texture batching, context restoration and GL errors. Four body compositions have a total of 30 pixels above 16/255 in each engine, localized to original polygon edges on or within 0.000003815 pixels of pixel centers. These CPU/GPU coverage differences remain visible in the reports; neither source geometry nor thresholds are changed to hide them. Effect compositions have no pixels above 16/255.

Original executable projection, facing boundaries, recoil, shell trajectory, particle motion, damage/knockback handoff and sound mixing remain unverified. The source references establish retained artwork and data, not a claim that the full live Mortar is already equivalent to the original game.
