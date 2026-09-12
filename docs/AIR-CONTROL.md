# Air Sweeper and Seeking Air Mine audit

Implemented for the local Town Hall 1–8 catalog. Reviewed 2026-09-12. The Sweeper uses authored artwork. [Seeking Air Mines](../reference/seeking-mine/README.md) now render the original four animated families, appearance and impact effects, five sounds and original Info portrait across all eight source levels. Both run in the local simulation, with unresolved native behavior listed below.

## Primary data

Supercell public client bundle `18.400.21`, asset hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`:

- [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv): Air Sweeper progression and weapon configuration. SHA-256 `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1`.
- [traps.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/traps.csv): Seeking Air Mine damage, trigger radius, minimum housing, projectile name and activation frame. SHA-256 `757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c`. Raw and decoded copies are retained in ignored `output/playtest/air-control-*` evidence.
- [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv): `Air Blaster Ammo1` speed 600; `LargeDarkElixirBalloon` speed 350. Local map units divide these speeds by 100.

| Sweeper level | Hitpoints | Gold | Build time | Push |
| --- | ---: | ---: | --- | ---: |
| 1 | 750 | 200,000 | 4h | 1.6 tiles |
| 2 | 800 | 300,000 | 6h | 2.0 tiles |
| 3 | 850 | 450,000 | 8h | 2.4 tiles |
| 4 | 900 | 800,000 | 12h | 2.8 tiles |

The mine now uses all eight original damage/cost/time rows for campaign, retained saves and practice. Home availability remains level 1: 1,500 damage, 12,000 gold, instant placement. Every level uses a four-tile trigger, minimum five housing spaces, a single target and 3.5 tiles/s. Healers are eligible. The focused runtime projection preserves all four projectile exports, shadow, emitter, start height/offset, scale and play-once fields.

Catalog ceilings/counts were cross-checked against [Sweeper progression](https://www.gibiarena.com/en/clash-of-clans/upgrades/air-sweeper) and [mine progression](https://www.gibiarena.com/en/clash-of-clans/upgrades/seeking-air-mine): one Sweeper from TH6, levels 2/3/4 at TH6/7/8; one mine at TH7 and two at TH8. Mine level 2 requires TH9 and is outside this catalog. The trap CSV's level-one TownHallLevel field is not its unlock gate.

## Simulation and limits of the comparison

The Sweeper has no damage value. Giants and Balloons still recognize it as a defense; Lightning can interrupt its preparation. Each gust travels independently after launch, pushes each air unit at most once, crosses walls and survives destruction of its source. Displacement suspends troop movement and attacks. Both mine and gust states reconstruct from replay actions and deltas.

Native fields establish a five-second attack cycle, 0.6-second preparation and 1–15 range. The raw `TargetingConeAngle` is 105. This implementation treats that as a **105-degree total acquisition cone**. The native client's interpretation of that field has not been verified. Current community prose says 90 degrees, while older descriptions say 120; neither discrepancy is silently presented as solved. The selection sector displays the actual local cone.

The traveling front uses a 60-degree sector capped at five tiles wide, with a 0.3-tile collision tolerance. Pushes resolve over 0.6 seconds. Those collision/easing choices remain local approximations. The CSV also has `ShockwaveArcLength=700`, `ShockwaveExpandRadius=250`, `StartOffset=125` and `CoolDownOverride=4800`; their full interaction with native animation and hitboxes is not reproduced. Frame-by-frame comparison remains necessary before claiming exact combat parity.

Mine activation now divides source action frame 7 by the original `air_trap` clip’s 24 fps, replacing the former 30 fps assumption. This 7/24-second release is a source-based interpretation; native action-frame numbering and executable spawn ordering remain unverified. Combat version 33 expires older playback while keeping saved results readable. The original reveal/projectile clips also begin with empty frames; their native handoff remains unverified. Flight duration depends on distance, never a fixed arrival timer. Loss of its target consumes the mine without splash or retargeting. Native target-loss/retarget behavior still needs direct verification. Ground troops never trigger it. Fresh attacks re-arm home traps; practice cannot consume village defenses.

The campaign now supports the first 54 original layouts. Cross and Bows, Forest Outing and Skeleton Run retain all 59 original level-three mines and their 2,100 damage. Practice layouts remain local content. Source layouts and numerical records do not establish native combat parity or matchmaking balance.

## Controls and artwork

Select a built Sweeper and use **Rotate** or **R** to turn it 45 degrees. Rotation costs nothing. It is preserved in layout save/restore, layout undo/redo, village persistence, moving previews and replay exports. Older records without orientation use zero; malformed directions are rejected. Replay version 19 expires playback of older combat rules while preserving their results.

`art/source/air-control-v1/` retains accepted authored PNGs and prompts. Built-in image generation produced four eight-direction Sweeper sheets and the former three-state mine sheet. `scripts/air-control-assets.mjs` reproduces these historical assets and validates alpha. The 32 Sweeper sprites remain live. Mine setup, construction, upgrade, reveal, flight, shadow and spent states now use the original `seeking-mine-native` source graph; the former mine sprites are no longer loaded by the scene.

Mine geometry uses a locally chosen 0.8 scale and 32-unit anchor, with matching moving previews, selection bounds and progress bars. The complete ground reveal runs independently of impact; the original play-once projectile shares the activation clock. Original particle ranges, lifetimes, colors and additive layers drive deterministic effects and a bounded red smoke trail. Home pickup/place sounds use source volume/pitch, as do trigger and impact sounds. Rewinding regenerates presentation history from the replay. Reduced motion suppresses flight, particles, flashes and shake without changing combat.

The mine's 0.5-second rise to local air height, projectile clock handoff, source offset/height interpretation, particle motion equations, spawn-limit semantics and camera-strength conversion still require native executable comparison. [The source audit](../reference/seeking-mine/README.md#live-presentation-and-fidelity-limits) records these choices separately from original geometry and pixel verification.

Sweeper visual design was compared with the [official Air Sweeper announcement](https://x.com/ClashofClans/status/593626016469413889) and the [Sweeper upgrade descriptions](https://clashofclans.fandom.com/wiki/Air_Sweeper?jw_start=%7Bseek_to_second_number%7D&page=1). Its original render proportions, directional granularity, bellows animation and per-pixel native correspondence remain areas for further refinement.
