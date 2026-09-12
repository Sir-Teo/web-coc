# Starter troop progression

September 11, 2026. Barbarian and Archer levels 1–5 now use explicit Home Village health, damage, research costs, durations and laboratory requirements. These are the supported Town Hall 1–8 levels. The other five supported troop types are now audited in [the full supported troop progression pass](TROOP-PROGRESSION.md).

## References

[Supercell's June 2025 update](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/) confirms the increased Barbarian damage and Archer health/damage at levels 1–3. The complete current tables were cross-checked against the [Barbarian reference](https://goblinsfarm.com/wiki/troops/barbarian.html) and [Archer reference](https://goblinsfarm.com/wiki/troops/archer.html), dated August 26, 2026 and attributed there to client build 18.400.21. The [Barbarian wiki](https://clashofclans.fandom.com/wiki/Barbarian) and [Archer wiki](https://clashofclans.fandom.com/wiki/Archer) corroborate the laboratory thresholds and values. No active event, pass or helper discounts are applied.

| Troop | Level | HP | DPS / damage per hit | Elixir to reach level | Research | Lab required |
| --- | --- | --- | --- | --- | --- | --- |
| Barbarian | 1 | 45 | 9 | — | — | — |
| Barbarian | 2 | 54 | 12 | 10,000 | 30m | 1 |
| Barbarian | 3 | 65 | 15 | 50,000 | 1h | 3 |
| Barbarian | 4 | 85 | 18 | 130,000 | 2h | 5 |
| Barbarian | 5 | 105 | 23 | 300,000 | 4h | 6 |
| Archer | 1 | 22 | 8 | — | — | — |
| Archer | 2 | 26 | 10 | 20,000 | 1h | 1 |
| Archer | 3 | 29 | 13 | 80,000 | 2h | 3 |
| Archer | 4 | 33 | 16 | 200,000 | 3h | 5 |
| Archer | 5 | 40 | 20 | 500,000 | 8h | 6 |

Both attack once per second and occupy one housing space. Barbarian reach is 0.4 tiles and Archer range is 3.5 tiles. Movement uses **2.2** and **3** tiles per second respectively. The [movement reference](https://clashofclans.fandom.com/wiki/Troop_Movement_Speed) distinguishes the displayed speed numbers (18 and 24) from internal movement (220 and 300); simply dividing the displayed Barbarian speed by eight would give an inaccurate 2.25 tiles per second.

## Implementation

`src/game/troop-progression.ts` contains destination-level records. `troopStatsAt()` is shared by deployment, combat, King summons, troop details and the next-level research preview. The laboratory requirement is looked up by troop and destination, so Lab 1 can research these two troops to level 2; Lab 2 does not unlock their third level. Laboratory Info describes its highest supported tier as varying by troop. Details now distinguish DPS, damage per hit and attack interval, and pluralize tile ranges correctly.

The old pathfinder considered only tile centers. A point 0.5 tiles from a building cannot attack with a 0.4-tile weapon, so the search now adds a final approach point inside the last reachable cell. That short segment does not cross a new cell or cut through a solid corner. A tiny numerical margin keeps the endpoint inside the nominal attack range. Other attack ranges retain the original route construction. Crowd separation and wall collision still apply.

Normal attacks against a wall now deal their normal attack damage. The former path-obstruction branch silently multiplied every troop's damage by 1.6. The Wall Breaker's explicit wall multiplier remains in its own detonation path.

## Save and replay behavior

Saved armies, presets and research levels keep their internal keys, including `swordsman` for Barbarian. Existing paid research retains its exact deadline and completes once, even if its laboratory is below the new requirement; no repayment, timer extension or level reset is applied. New research uses the audited table. Save version remains 4.

Combat version is now 15. Version-14 and earlier records retain their result summaries, but cannot play under the changed combat rules. New recordings preserve their starting research levels and reproduce the corrected combat. The authored campaign layouts, health multipliers and rewards are unchanged by this pass.

## Verification scope

Seventeen focused cases cover all ten level records, real deployment health, current/next previews, costs and timers, laboratory gates, paid legacy deadlines, old replay summaries, eight approach directions, short final segments, obstacle avoidance, wall breach damage, movement speed and Archer range. The full model suite also exercises campaign viability, projectile impacts, saves, replay seeking and hero summons. Browser tests cover real research actions, reload, completion, gating and detail values at desktop and phone sizes, alongside gameplay, replay and repeated raid transitions.

Remaining work includes the full roster and higher Town Halls, native spell/hero balancing, native campaign layouts/rewards, detailed collision/targeting fidelity and physical-device validation. Passing the local campaign audit does not establish native game balance for the full game.
