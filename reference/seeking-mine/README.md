# Native Seeking Air Mine source

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, from Supercell's [original fingerprint](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json). The importer verifies all 16 input SHA-256 checksums and their SHA-1 membership in that fingerprint.

This foundation retains the original artwork and full source progression. Live combat now uses all eight source damage/cost/time rows and interprets release as 7/24 seconds from the retained action frame and clip rate. Home mines remain capped at level 1 through TH8; campaign and retained higher levels keep their exact levels and one-hitpoint trap identity. The first 54 native villages are now playable, including all 59 level-three mines in Cross and Bows, Forest Outing and Skeleton Run. Combat version 33 preserves old results while expiring incompatible playback. Live artwork, effects and audio still use the authored presentation pending integration. Source preservation and sampled pixel agreement do not establish native executable behavior.

## Source records and art

- [traps.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/traps.csv): `Seeking Air Mine`, GlobalID `12000006`, eight sparse level rows. Blank level fields inherit the preceding nonempty value.
- [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv): four `LargeDarkElixirBalloon` families. All specify speed 350, start height 0, start offset 20, homing, play once, top layer, no rotation and no ballistic arc. Local speed conversion is 3.5 tiles/s; native offset/height and projectile handoff semantics remain unverified.
- [buildings.sc](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/sc/buildings.sc): all 31 referenced world/particle exports, 36 reachable clips and 53 shapes. Four setup families have 200 frames each; four projectile families have 120 frames; `air_trap` has 75 frames. Those trap clips run at 24 fps. The separate `gen_appear_fx` appearance clip runs at 30 fps, with empty opening and closing frames; its original texture-18 sampling region is retained. Upgrade, spent and shadow clips remain separate. Trigger and projectile opening frames are intentionally empty.
- [ui.sc](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/sc/ui.sc): the original `evil_airtrap_lvl1_info` export, referenced by all eight inherited level records. Its root has one bitmap shape and one empty TextField named `bounds`. The original bounds, identity and transform are retained as nonpainting metadata. The picture uses three embedded ASTC RGBA 4×4 textures; it is not repainted from a screenshot or recreated from the world sprite.
- [effects.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/effects.csv) and [particle_emitters.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/csv/particle_emitters.csv): six effects, 15 emitters and every repeated/variant row, including grass, smoke, red projectile trail, fire, flash and force rings. The explosion requests strength 50 for 500 ms, including replays. Particle motion, row selection and camera conversion are not implemented by this foundation.

| Level | Damage | Gold | Destination time | Source TH field | Visual family |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 1,500 | 12,000 | Instant | 1 | Base |
| 2 | 1,800 | 600,000 | 6 hours | 9 | Base |
| 3 | 2,100 | 1,200,000 | 12 hours | 10 | Level 3 |
| 4 | 2,500 | 2,500,000 | 36 hours | 13 | Level 3 |
| 5 | 2,800 | 5,000,000 | 48 hours | 15 | Level 5 |
| 6 | 3,000 | 6,500,000 | 72 hours | 16 | Level 5 |
| 7 | 3,200 | 12,000,000 | 120 hours | 17 | Level 7 |
| 8 | 3,350 | 19,000,000 | 276 hours | 18 | Level 7 |

The level-one source TH field is **not** its home unlock gate. Home availability remains one mine at TH7 and two at TH8, with upgrades beyond level 1 gated. Common source fields are a 1×1 footprint, four-tile trigger, at least five housing spaces, air only and no splash. `ActionFrame=7` and the 24 fps reveal suggest 7/24 seconds; action-frame numbering and native spawn ordering require executable comparison before treating that inference as exact.

Five unchanged sounds are retained: `air_trap.ogg` (trigger, 90% volume), `cannon_fire3.ogg` (explosion, 80%, pitch 95–105%), `wall_pickup_01.ogg` and `cannon_drop2.ogg` (50%), and `bad_move_06.ogg` (appear, 80%). All except the explosion specify normal pitch.

## Files and reconstruction

`native.json` retains original sparse rows, full source graphs, texture sampling regions, source hashes and fidelity limits. `runtime.json` and `info.json` retain original geometry and transforms with UVs remapped to lossless crops. `combat.json` and `effects.json` expose focused source projections, including all four projectile records’ export, shadow, speed, height, offset, scale, play-once flag and trail emitter. Seven cropped textures, four world previews, the original Info picture and five Ogg files total **17 assets / 700,383 bytes**.

World previews render frame zero at two pixels per native unit in bounds `[-52,-70,52,60]`. The 360×420 Info image renders the actual UI root in bounds `[-90,-120,90,90]`. These output margins are local framing; original source artwork remains unchanged. Texture packing copies every required bilinear neighbour, including edge-clamp pixels, without resizing or color baking.

```sh
output/native-art-venv/bin/python scripts/import-native-seeking-mine.py --check
output/native-art-venv/bin/python scripts/native-seeking-mine-gpu-fixtures.py --check
output/native-art-venv/bin/python -m unittest discover -s scripts/native_art -p 'test_*.py'
```

The shared SC6 reader now supports explicitly declared empty text bounds and embedded single-mip KTX 1 ASTC RGBA 4×4 textures. Visible text, unsupported formats, texture layers, mipmaps and orientation metadata still fail closed. The pinned UI stream decompresses to exactly 108,270,988 bytes; only this import explicitly allows that size, retaining the normal 100 MiB limit. Format evidence comes from [SupercellFlash's TextFields schema](https://github.com/sc-workshop/SupercellFlash/blob/41e894d5a20cc17e47fe32db3106c4c1bec60a3e/supercell-flash/sc2_schemas/TextFields.fbs), its [texture loader](https://github.com/sc-workshop/SupercellFlash/blob/41e894d5a20cc17e47fe32db3106c4c1bec60a3e/supercell-flash/source/flash/objects/SWFTexture.cpp), and the [Khronos KTX 1 specification](https://registry.khronos.org/KTX/specs/1.0/ktxspec.v1.html).

Independent original-texture witnesses cover all exports, multiple setup/flight/reveal times, eleven empty frames, three explicit additive emitter cases and the original Info composition. Browser comparisons also exercise forced single-texture batching and WebGL context restoration. See [QA.md](../../docs/QA.md) for final results and limits. The next presentation step must connect source art, activation/flight/death states, effects/audio, reduced motion, home interactions and replay. Magic Practice remains gated by Wizard Tower level 11 and the campaign Shrink Trap; later unsupported mechanics remain gated.
