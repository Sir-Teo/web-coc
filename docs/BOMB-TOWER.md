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
- Home saves remain version 4. Current replay version 32 reconstructs thrown bombs, destruction fuses and results from battle snapshots and actions. Seeking and returning home clear presentation objects. Older recordings retain summaries without playback through the current rules.

## Native presentation and remaining fidelity limits

The live tower now uses the pinned client's original polygons, texture samples, colors and timelines. Separate native views draw the foundation/body, rooftop defender, construction and upgrade scaffolds, rubble, thrown bomb, ground shadow and exposed death charge. All 13 original bodies and source-selected defender/weapon families are retained; supported gameplay still stops at level 2. The authored files in `art/source/bombtower-v1/` and their reproducible derivatives remain historical assets and no longer supply live Bomb Tower artwork.

Thirteen transparent 360×420 portraits are independently rasterized from the original source textures and graphs. They include the foundation and frame-zero front-facing defender at the source idle scale of 108%. They omit the additive fuse glow so they work against any interface background. Live rendering preserves the isolated additive fuse group; reduced motion freezes the defender and exposed charge at frame zero and removes moving projectiles and additive defender glow.

The local world registration uses source body scale 1.2 and ground anchor `(0, 80)`. The defender's feet align to the drawn platform at source `(0, 0)`, with the source idle scale also applied during attacks. Portraits, placement ghosts, pointer bounds and progress/health bars use the same registration. Incoming projectile attachment uses occupied native height instead of transparent portrait padding. Native `DefenderZ=145`, directional selection/mirroring, attack-scale inheritance and native engine projection are not yet verified against executable captures.

The source defender has 101 idle frames and 21 attack frames at 24 fps. Its source action frame 11 aligns with each existing launch timestamp, using a bounded derived history reconstructed by replay. The following ten frame intervals retain the launch direction even if the target dies or changes. The next eligible target's cooldown drives the preceding wind-up. A newly acquired immediate target starts at frame 11, preserving existing combat timing; this local handoff and zero-based action-frame interpretation remain unverified native engine behavior. Stun, construction, upgrading, finished battles and reduced motion suppress throwing.

Thrown bombs use the source-selected projectile and shadow with a local 42-pixel screen-space arc and one full rotation per flight. Their landing point, eight-tile speed, damage and timing are unchanged. Launch registration remains stable after source destruction. The exposed charge uses its source effect variant and 115% emitter scale, anchored at source y=40 over the original rubble. Its source fuse clip advances on battle time until the existing one-second gameplay deadline. Source emitter offsets, 2.5-second life/fade semantics and original ballistic conversion are retained as data but not implemented as native engine behavior. A 0.01-second minimum flight protects zero-distance arithmetic.

The six original sounds are preserved but not yet played; impacts, explosion particles and audio retain their preceding local implementation. Large simulation deltas still sample troop positions at each step instead of reproducing continuous collision and globally interleaved impacts. Full native frame-by-frame executable equivalence remains unverified.

Tests cover progression, fixed landing points, target retention, splash/air immunity, cadence, inactivity, single-use fuses, projectile timestamps, death chains, finish modes, save/replay import and seeking, all thirteen portraits and source variants, alpha/bounds, phone Info and real placement/upgrade flows. Independent source-pixel comparisons cover 45 individual compositions plus all 13 complete live assemblies. Final browser and production results are recorded in [QA.md](QA.md).

## Next source transitions

[The pinned native reference](../reference/bombtower/README.md) retains all original effect, emitter and animation-table fields separately from local interpretations. Level 3 changes the defender, projectile and hit/destruction effects as well as HP, DPS and death damage. Original impacts/explosions and audio remain to be integrated before that campaign transition is enabled. The campaign guard remains in place; the playable native catalog remains its first 50 villages.
