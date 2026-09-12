# Bomb Tower — supported Town Hall 8 levels

## Reference and numerical scope

The primary reference is Supercell's immutable public client bundle `18.400.21`, content hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`:

- [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv): `Bomb Tower`, global ID `1000032`. Download SHA-256 `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1`.
- [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv): `Bomb Tower Ammo1`. Download SHA-256 `71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc`.

Fields left blank in a level row inherit the previous nonempty value within the same named record. The values below are undiscounted; seasonal boosts and event modifiers are not modeled. The [Home Village community reference](https://clashofclans.fandom.com/wiki/Bomb_Tower/Home_Village) supplies the TH8 count/ceiling cross-check and appearance history. Its Clan Capital table describes a different building.

| Level | Hitpoints | DPS | Damage per hit | Death damage | Gold | Destination duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 650 | 24 | 26.4 | 150 | 700,000 | 12 hours |
| 2 | 700 | 28 | 30.8 | 180 | 1,000,000 | 18 hours |

TH8 permits one tower and both levels. Its footprint is 3×3, range six tiles, attack interval 1.1 seconds and splash radius 1.5 tiles. Both normal attacks and its destruction blast affect ground troops only. `DieDamageDelay=1000` and `DieDamageRadius=275` give a one-second fuse and 2.75-tile death radius. The projectile record specifies `Speed=800`, `DontTrackTarget=TRUE`, `IsBallistic=TRUE`, `UseRotate=TRUE`, no bounce and no target-position randomization.

## Implemented behavior

- A tower retains its eligible ground target until it dies or leaves range. Throws travel at eight tiles per second toward the target's position when fired; moving troops can dodge the landing point. Every living ground troop within the impact circle receives the hit. The bomb continues if its target or shooter dies.
- Destruction exposes a separate bomb at the footprint center. It waits one second, then damages ground troops within 2.75 tiles once. Troops can escape during the fuse. The normal unit-death path handles resulting Wall Breaker and other death effects. Killing-projectile timestamps start the fuse at their scheduled impact, even when a wider simulation step processes the hit later.
- Construction and upgrades disable firing. This implementation also suppresses the death charge while those activities are in progress; the public tables do not establish that behavior, so it remains an explicit assumption requiring native validation.
- An outstanding charge keeps a raid with no offensive troops from ending early. Manual end, complete destruction and the raid deadline cancel unresolved charges. Native terminal-frame ordering still needs comparison.
- Authored campaign stages 9–12 each add one tower in a previously empty 3×3 footprint. Campaign defense multipliers affect both attack and death damage. These maps and multipliers are local difficulty choices.
- Home saves remain version 4. Replay version 21 records the changed simulation; battle snapshots and actions reconstruct thrown bombs, destruction fuses and results. Seeking and returning home clear presentation objects. Older recordings retain summaries without playback through the new rules.

## Original artwork and remaining fidelity limits

`art/source/bombtower-v1/` retains the two original tower PNGs, the four-pose Bomber sheet, exposed bomb PNG and exact built-in generation prompts. `scripts/bomb-tower-assets.mjs` produces two transparent 384×512 bases, matching complete preview composites, a four-frame 256×256 Bomber atlas and a 192×192 destruction bomb. `--check` verifies byte-identical derivatives. Cropping, alpha-edge normalization, resampling and compositing are deterministic; no native game artwork is shipped.

Level 1 uses timber parapets, gold chains and dark spiked foot guards. Level 2 adds pale stone parapets and steel borders around the guards. A separate ivory skeleton wears the blue aviator helmet, gold goggles and copper gloves of the roof [Bomber](https://clashofclans.fandom.com/wiki/Bomber). The older 2016 promotional roof character is not used as the current costume reference. Idle, wind-up, release and follow-through poses follow defense cooldown. The actor's feet and projectile origin share the measured platform anchor. Destruction removes the actor and exposes the bomb over ground-level rubble, below troops.

The thrown bomb rotates through a local screen-space arc with a ground shadow. Its flight and the pulsing fuse use battle time, remain still when paused and rebuild on replay seeks. Reduced motion removes moving projectiles, throwing poses and fuse pulsing while retaining the visible charge and impact cue. Native arc geometry, exact release frames, pose alignment, rubble, audio and pixel matching remain approximations. A 0.01-second minimum flight protects zero-distance arithmetic. Simulation resolution samples troop positions at each step; a large imported delta does not reproduce continuous collision or globally interleaved impact events. No full native frame-by-frame reference capture has been completed.

Tests cover both progression records, fixed landing points, range/target retention, splash boundaries, air immunity, shot cadence, inactive upgrades, single-use fuses, projectile timestamps, death chains, all finish modes, save/replay import and seeking, alpha/atlas output, phone Info and real placement/upgrade flows. Final browser, campaign and production results are recorded in [QA.md](QA.md).
