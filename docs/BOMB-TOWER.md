# Bomb Tower — native levels 1–13 and Town Hall 8–9 home progression

## Reference and numerical scope

The primary reference is Supercell's immutable public client bundle `18.400.21`, content hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`:

- [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv): `Bomb Tower`, global ID `1000032`. Download SHA-256 `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1`.
- [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv): `Bomb Tower Ammo1`. Download SHA-256 `71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc`.

Fields left blank in a level row inherit the previous nonempty value within the same named record. Combat, retained saves and imported replays support all thirteen source levels. Home purchases and upgrades follow the original ceilings, from one tower at level 2 at Town Hall 8 to two at level 13 by Town Hall 18. The values below are undiscounted; seasonal boosts and event modifiers are not modeled. The [Home Village community reference](https://clashofclans.fandom.com/wiki/Bomb_Tower/Home_Village) supplies the TH8 count/ceiling cross-check and appearance history. Its Clan Capital table describes a different building.

| Level | Hitpoints | DPS | Damage per hit | Death damage | Gold | Destination duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 650 | 24 | 26.4 | 150 | 700,000 | 12 hours |
| 2 | 700 | 28 | 30.8 | 180 | 1,000,000 | 18 hours |
| 3 | 750 | 32 | 35.2 | 220 | 1,300,000 | 24 hours |
| 4 | 850 | 40 | 44.0 | 260 | 1,800,000 | 36 hours |
| 5 | 1,050 | 48 | 52.8 | 300 | 1,900,000 | 42 hours |
| 6 | 1,300 | 56 | 61.6 | 350 | 2,000,000 | 48 hours |
| 7 | 1,600 | 64 | 70.4 | 400 | 4,000,000 | 72 hours |
| 8 | 1,900 | 72 | 79.2 | 450 | 5,000,000 | 84 hours |
| 9 | 2,300 | 84 | 92.4 | 500 | 6,000,000 | 96 hours |
| 10 | 2,500 | 94 | 103.4 | 550 | 7,000,000 | 108 hours |
| 11 | 2,700 | 104 | 114.4 | 600 | 8,500,000 | 120 hours |
| 12 | 2,900 | 114 | 125.4 | 650 | 14,500,000 | 168 hours |
| 13 | 3,050 | 122 | 134.2 | 700 | 25,000,000 | 312 hours |

TH8 permits one tower and its first two levels; TH9 keeps the single tower and adds level 3. Its footprint is 3×3, range six tiles, attack interval 1.1 seconds and splash radius 1.5 tiles. Both normal attacks and its destruction blast affect ground troops only. `DieDamageDelay=1000` and `DieDamageRadius=275` give a one-second fuse and 2.75-tile death radius. The projectile record specifies `Speed=800`, `DontTrackTarget=TRUE`, `IsBallistic=TRUE`, `UseRotate=TRUE`, no bounce and no target-position randomization.

## Implemented behavior

- A tower retains its eligible ground target until it dies or leaves range. Throws travel at eight tiles per second toward the target's position when fired; moving troops can dodge the landing point. Every living ground troop within the impact circle receives the hit. The bomb continues if its target or shooter dies.
- Destruction exposes a separate bomb at the footprint center. It waits one second, then damages ground troops within 2.75 tiles once. Troops can escape during the fuse. The normal unit-death path handles resulting Wall Breaker and other death effects. Killing-projectile timestamps start the fuse at their scheduled impact, even when a wider simulation step processes the hit later.
- Construction and upgrades disable firing. This implementation also suppresses the death charge while those activities are in progress; the public tables do not establish that behavior, so it remains an explicit assumption requiring native validation.
- An outstanding charge keeps a raid with no offensive troops from ending early. Manual end, complete destruction and the raid deadline cancel unresolved charges. Native terminal-frame ordering still needs comparison.
- Authored campaign stages 9–12 each add one level-3 tower in a previously empty 3×3 footprint. Their existing stage-level rule now reaches the supported native level instead of stopping at the former entity cap of 2. Campaign defense multipliers affect both attack and death damage. These maps and multipliers are local difficulty choices.
- Home saves remain version 4, retaining all thirteen source tower levels without allowing new upgrades beyond the current tier's ceiling. Current replay version 32 reconstructs thrown bombs, destruction fuses and results from battle snapshots and actions. Seeking and returning home clear presentation objects. Older recordings retain summaries without playback through the current rules.

## Native presentation and remaining fidelity limits

The live tower now uses the pinned client's original polygons, texture samples, colors and timelines. Separate native views draw the foundation/body, rooftop defender, construction and upgrade scaffolds, rubble, thrown bomb, ground shadow and exposed death charge. All 13 original bodies and source-selected defender/weapon families are retained; combat, save validation and replay now use all thirteen source levels. Home purchase and upgrade progression follows the original tier column to level 13 at Town Hall 18. The authored files in `art/source/bombtower-v1/` and their reproducible derivatives remain historical assets and no longer supply live Bomb Tower artwork.

Thirteen transparent 360×420 portraits are independently rasterized from the original source textures and graphs. They include the foundation and frame-zero front-facing defender at the source idle scale of 108%. They omit the additive fuse glow so they work against any interface background. Live rendering preserves the isolated additive fuse group; reduced motion freezes the defender and exposed charge at frame zero and removes moving projectiles and additive defender glow.

The local world registration uses source body scale 1.2 and ground anchor `(0, 80)`. The defender's feet align to the drawn platform at source `(0, 0)`, with the source idle scale also applied during attacks. Portraits, placement ghosts, pointer bounds and progress/health bars use the same registration. Incoming projectile attachment uses occupied native height instead of transparent portrait padding. Original-frame inspection establishes that all three Bomber views face right: targets to the right use the source orientation, and targets to the left use its mirror. The initial live mirror rule was reversed and is corrected. Native `DefenderZ=145`, exact directional boundaries, attack-scale inheritance and native engine projection are not yet verified against executable captures.

The source defender has 101 idle frames and 21 attack frames at 24 fps. Its source action frame 11 aligns with each existing launch timestamp, using a bounded derived history reconstructed by replay. The following ten frame intervals retain the launch direction even if the target dies or changes. The next eligible target's cooldown drives the preceding wind-up. A newly acquired immediate target starts at frame 11, preserving existing combat timing; this local handoff and zero-based action-frame interpretation remain unverified native engine behavior. Stun, construction, upgrading, finished battles and reduced motion suppress throwing.

Thrown bombs use the source-selected projectile and shadow with a local 42-pixel screen-space arc and one full rotation per flight. Their landing point, eight-tile speed, damage and timing are unchanged. Launch registration remains stable after source destruction. The exposed charge uses its source effect variant and 115% emitter scale, anchored at source y=40 over the original rubble. Its source fuse clip advances on battle time until the existing one-second gameplay deadline. Source emitter offsets, 2.5-second life/fade semantics and original ballistic conversion are retained as data but not implemented as native engine behavior. A 0.01-second minimum flight protects zero-distance arithmetic.

Original smoke, debris, fire, rings and crater now replace the generic Bomb Tower effects. A third native graph preserves all 39 referenced particle exports. Recorded shot and hit timestamps drive the continuous `mortar_trail`, level-selected impact bursts, collapse and the resolved charge's explosion plus its explicit spawned ground effect. Repeated emitter rows remain separate instances, including three `explosion_blast` rows. Smoke trails continue briefly at their sampled flight positions after impact. The crater retains its source 100-second lifetime and final three-second fade while the battle is active. All transient effects clear on battle finish or exit and rebuild from derived history on replay seeks; they do not consume combat randomness.

The six original Ogg files play through the shared simulation-clock sample mixer. Throw, hit and collapse use the source volume and pitch ranges. Pickup/drop use their source 80% volume and normal pitch. The explosion and its spawned ground effect each specify a sound row; both play with independently sampled 60–80% pitch. This explicit-row interpretation is local: native duplicate sound selection/combination remains unverified. Pause, mute, replay speed, seeking, cancellation and scene shutdown control actual audio source nodes. Home gestures use a bounded transient queue and the home render clock; invalid drops emit no placing feedback, and accepted placement suppresses the old generic build tone.

Source effect ranges, particle variants, timelines, additive groups, emission counts and fade fields feed a deterministic local particle sampler. Horizontal projection uses 0.32/0.16 world-pixel factors and altitude uses 0.8. Damped time is `log(1 + inertia × age) / inertia`; linear slowdown acts on that damped time. Gravity and a single 35% rebound produce local debris trajectories. Two source fade-out fields multiply as tail fades, with a separate fade-in ramp. The crater uses a local source-y anchor of 42 and suppresses the source `StartZ=200` offset for ground registration. Native inertia, slowdown, bounce, fade overlap, depth sorting, variant selection and isometric projection require executable comparison. These equations are documented interpretations, not source-proven engine behavior.

Explosion camera motion honors the source one-second duration and replay flag. A deterministic 30 Hz interpolated waveform maps strength 100 to at most 32 world pixels per axis with a linear taper, one impulse per resolved charge and bounded combined offsets. It composes with the Tesla layer and uses the same camera matrix for display and pointer projection. Native amplitude conversion, waveform and spawned-effect impulse combination remain unverified. Reduced motion removes the shake, moving smoke/debris, projectiles and additive flashes; it keeps subdued stationary ground markers and the crater.

Large simulation deltas still sample troop positions at each step instead of reproducing continuous collision and globally interleaved impacts. Full native frame-by-frame executable equivalence remains unverified.

Tests cover progression, fixed landing points, target retention, splash/air immunity, cadence, inactivity, single-use fuses, projectile timestamps, death chains, finish modes, save/replay import and seeking, all thirteen portraits and source variants, alpha/bounds, phone Info and real placement/upgrade flows. Independent source-pixel comparisons cover 84 individual compositions (45 body/defender witnesses and 39 particle exports) plus all 13 complete live assemblies. Browser checks also cover actual sound buffers, pitch/gain, empty landings, pause/mute, desktop/phone handling, camera/pointer alignment, replay reconstruction and WebGL context restoration during an additive explosion. Final browser and production results are recorded in [QA.md](QA.md).

## Campaign integration and next transitions

[The pinned native reference](../reference/bombtower/README.md) supplies the complete numerical progression. Level 3 has 750 HP, 32 DPS (35.2 per hit), a 220-damage death charge, a 1,300,000-gold destination price, a 24-hour timer and Town Hall 9 requirement. It selects `BomberTower_lvl2`, `Bomb Tower Ammo2`, `Bomb Tower Hit2` and `Bomb Tower Destroyed2`. Level 4 changes the defender/projectile/death-charge family again, level 5 adds the third hit effect, and level 6 introduces the fourth exposed charge; all remain source-selected. No unsupported level silently reuses level-2 death damage.

Invaders, native village 51, is now playable with all 272 original buildings/traps, its original level-3 Bomb Tower at simulation `(13,22)` and four level-3 X-Bows (two ground, two ground/air). It unlocks from a star in village 50 and has a source recommendation of Town Hall 9, 300,000 gold, 300,000 elixir and 2,000 Dark Elixir. Source tiles, health, defense modes and finite loot remain unchanged. The new source level support satisfies the existing campaign guard; no guard is bypassed. The catalog now supports its first 51 villages. Cross and Bows, village 52, still requires Seeking Air Mine level 3; later villages retain their remaining weapon, level and garrison gates.
