# Air Sweeper and Seeking Air Mine audit

Implemented for the local Town Hall 1–18 catalog. Reviewed 2026-09-12. The Sweeper now renders its original source bodies, independent rotating parts, loading animation, particles and four sounds across all seven levels. [Seeking Air Mines](../reference/seeking-mine/README.md) now render the original four animated families, appearance and impact effects, five sounds and original Info portrait across all eight source levels. Both run in the local simulation, with unresolved native behavior listed below.

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
| 5 | 950 | 1,200,000 | 1d | 3.2 tiles |
| 6 | 1,000 | 1,900,000 | 2d | 3.6 tiles |
| 7 | 1,050 | 3,400,000 | 3d | 4.0 tiles |

The mine now uses all eight original damage/cost/time rows for campaign, retained saves and practice. Home availability remains level 1: 1,500 damage, 12,000 gold, instant placement. Every level uses a four-tile trigger, minimum five housing spaces, a single target and 3.5 tiles/s. Healers are eligible. The focused runtime projection preserves all four projectile exports, shadow, emitter, start height/offset, scale and play-once fields.

Catalog ceilings/counts were cross-checked against [Sweeper progression](https://www.gibiarena.com/en/clash-of-clans/upgrades/air-sweeper) and [mine progression](https://www.gibiarena.com/en/clash-of-clans/upgrades/seeking-air-mine): one Sweeper from TH6, levels 2/3/4 at TH6/7/8; one mine at TH7 and two at TH8. The pinned tier tables in [reference/townhall](../reference/townhall/README.md) agree, and carry both families to the end of their original rows: two Sweepers up to level 7 by Town Hall 11, and nine mines up to level 8 by Town Hall 18. The trap CSV's level-one TownHallLevel field is not its unlock gate.

## Simulation and limits of the comparison

The Sweeper has no damage value. Giants and Balloons still recognize it as a defense; Lightning can interrupt its preparation. Each gust travels independently after launch, pushes each air unit at most once, crosses walls and survives destruction of its source. Displacement suspends troop movement and attacks. Both mine and gust states reconstruct from replay actions and deltas.

The version-34 Wizard Tower integration exposed platform-specific `Math.hypot` and `Math.atan2` rounding in portable recordings. Combat distances now use explicit squared terms and a square root within the bounded map. Sweeper states store normalized direction vectors; dot/cross products test their cones and wave width. Only rendering derives angles. This retains the acquisition tolerance and local wave dimensions below. Complete battle states are compared exactly at every 0.05-second step in Node, Chromium and WebKit for five Wizard Tower levels and four original mine/Sweeper villages; these fixtures do not qualify every possible combat scenario.

Native fields establish a five-second attack cycle, 0.6-second preparation and 1–15 range. The raw `TargetingConeAngle` is 105. This implementation treats that as a **105-degree total acquisition cone**. The native client's interpretation of that field has not been verified. Current community prose says 90 degrees, while older descriptions say 120; neither discrepancy is silently presented as solved. The selection sector displays the actual local cone.

The traveling front uses a 60-degree sector capped at five tiles wide, with a 0.3-tile collision tolerance. Pushes resolve over 0.6 seconds. Those collision/easing choices remain local approximations. The CSV also has `ShockwaveArcLength=700`, `ShockwaveExpandRadius=250`, `StartOffset=125` and `CoolDownOverride=4800`; their full interaction with native animation and hitboxes is not reproduced. Frame-by-frame comparison remains necessary before claiming exact combat parity.

Mine activation now divides source action frame 7 by the original `air_trap` clip’s 24 fps, replacing the former 30 fps assumption. This 7/24-second release is a source-based interpretation; native action-frame numbering and executable spawn ordering remain unverified. Combat version 33 expires older playback while keeping saved results readable. The original reveal/projectile clips also begin with empty frames; their native handoff remains unverified. Flight duration depends on distance, never a fixed arrival timer. Loss of its target consumes the mine without splash or retargeting. Native target-loss/retarget behavior still needs direct verification. Ground troops never trigger it. Fresh attacks re-arm home traps; practice cannot consume village defenses.

The campaign now supports the first 55 original layouts and Graduation Ceremony (stage 58), whose source level-nine Wizard Towers are supported in version 34. Magic Practice includes its original Shrink Traps. Original stage dependencies remain enforced. Cross and Bows, Forest Outing and Skeleton Run retain all 59 original level-three mines and their 2,100 damage. Practice layouts remain local content. Source layouts and numerical records do not establish native combat parity or matchmaking balance.

## Controls and artwork

Select a built Sweeper and use **Rotate** or **R** to turn it 45 degrees. Rotation costs nothing. It is preserved in layout save/restore, layout undo/redo, village persistence, moving previews and replay exports. Older records without orientation use zero; malformed directions are rejected. Replay version 19 expires playback of older combat rules while preserving their results.

`art/source/air-control-v1/` retains accepted authored PNGs and prompts. Built-in image generation produced four eight-direction Sweeper sheets and the former three-state mine sheet. `scripts/air-control-assets.mjs` reproduces these historical assets and validates alpha. The former 32 Sweeper sprites are no longer loaded; 56 original registered previews serve the shop, Info and moving placement. Mine setup, construction, upgrade, reveal, flight, shadow and spent states now use the original `seeking-mine-native` source graph; the former mine sprites are no longer loaded by the scene.

Mine geometry uses a locally chosen 0.8 scale and 32-unit anchor, with matching moving previews, selection bounds and progress bars. The complete ground reveal runs independently of impact; the original play-once projectile shares the activation clock. Original particle ranges, lifetimes, colors and additive layers drive deterministic effects and a bounded red smoke trail. Home pickup/place sounds use source volume/pitch, as do trigger and impact sounds. Rewinding regenerates presentation history from the replay. Reduced motion suppresses flight, particles, flashes and shake without changing combat.

The mine's 0.5-second rise to local air height, projectile clock handoff, source offset/height interpretation, particle motion equations, spawn-limit semantics and camera-strength conversion still require native executable comparison. [The source audit](../reference/seeking-mine/README.md#live-presentation-and-fidelity-limits) records these choices separately from original geometry and pixel verification.

## Live original Air Sweeper presentation

[The original source reference](../reference/air-sweeper/README.md) preserves all seven levels and all 360 source nozzle/sector frames. The fixed sector follows the saved eight-direction setting; the nozzle uses the current normalized target direction, rounded to a source degree. It never changes the combat cone when aiming. Base, body and shadow share the original source origin, locally scaled 1.2× and anchored at native `(0,50)` to the 2×2 footprint. Ghosts use the same 284×330 source previews and registration. Selection, health/progress bars and projectile target heights use actual geometry bounds rather than transparent canvas height. Construction, level-specific upgrade bodies/scaffolds and wood/rockwood rubble use original exports. Ruins use source variant frame zero; native random variant selection is unverified.

The source loading child has 224 idle frames, 91 loading frames and ten attack frames at 30 fps. Idle loops its labeled segment. During the existing 0.6-second preparation, the loading segment is fitted to the remaining preparation value; the attack segment starts at the actual recorded launch and advances on the battle clock. Source FPS sampling is discrete on the existing simulation/render clock. This is a local clock interpretation, not native time-scaling verification. Stun cancels the active aim/preparation pose; construction, upgrades and rubble do not run attack playback. A bounded 16-shot presentation history survives target loss, stun and destruction, without consuming RNG or changing gust creation, targeting or push arithmetic.

Original attack smoke uses all source emitter parameters through the shared deterministic particle sampler. Its 100-unit starting height maps to 80 world pixels; the effect is registered at the tower's ground center, including after destruction. This registration and the shared inertia, fade, bounce and projection equations remain local. Pickup/place use original grass and distinct source samples; destruction uses original debris, smoke, grass and audio. Native volume/pitch settings pass through the common 0.12 master gain and replay speed. Placement no longer layers the old generic build tone over the original sample. Pause, mute, rewind, cancellation and scene transitions stop or reconstruct the sample and particle history.

The original `dummy_particle` is a tiny white marker. It is retained as source evidence and is not rendered as a visible traveling projectile. The existing three curved gust lines continue to show the local collision front; their shape/color are authored and native procedural wind-wave rendering remains unresolved. Reduced motion freezes the loading mechanism and suppresses particles and gust curves while preserving aiming, combat displacement and audio controls.

All seven HP/push/cost/time rows now drive retained villages and practice, and the home ladder reaches every one of them: levels 2/3/4/5/6/7 at TH6/7/8/9/10/11. Higher retained levels are never clamped. High Pressure still requires Mortar 11 and Cannon 15; No Flight Zone still requires its garrison and Clan Castle. Supporting the Sweeper alone does not unlock either incomplete stage.

Replay format remains **34** and home save format **4**. Old viewers reject newly supported levels through their lower level limits. Two immutable pre-integration recordings were generated using actual commit `8e786b6`: all **1,371 physical states** reproduce exactly after removing only the new presentation-history field, including complete results. Five new air-army fixtures also match Node at every step in Chromium and WebKit. Current and historical tests establish local compatibility, not native client balance. See [QA.md](QA.md) for the live pixel, viewport, audio, source-reproduction and shipping/offline results.
