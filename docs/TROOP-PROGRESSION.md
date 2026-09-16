# Home Village troop progression

September 14, 2026. Every troop now runs to its own original ceiling, read from the pinned [troop reference](../reference/troops/README.md) rather than transcribed: 129 levels across the ten troops this game trains, from the Goblin's ten to the Archer's, Giant's, Wizard's and Wall Breaker's fourteen.

One value correction came out of the switch. The Barbarian's research carries a trailing 30 minutes at every level, which the earlier transcription dropped from levels 3 to 5: they take 1h30, 2h30 and 4h30, not 1h, 2h and 4h. Nothing else moved.

Otherwise the tables the roster replaces were correct. Every value the importer produces for the levels this game already shipped — the seven earlier types through level 5, and the Healer, Dragon and P.E.K.K.A through level 3 — reproduces the previous records exactly apart from those three durations, so extending the roster changed no combat value and no recorded battle. The prototype 30% upgrade multiplier remains removed. Barbarian and Archer values are documented in [the starter troop audit](STARTER-TROOP-PROGRESSION.md); the Healer, Dragon and P.E.K.K.A expansion in [LATE-TROOPS.md](LATE-TROOPS.md), including engine version 18.

This is what makes the Laboratory worth raising. Its last level now reaches the last level of every troop, where the roster used to run out far below it.

## References and values

[Supercell's June 2025 balance update](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/) confirms Giant health at levels 1–5, Giant damage at levels 1–3 and Wall Breaker hit damage at levels 1–4. Current full records were cross-checked against the [Giant](https://goblinsfarm.com/wiki/troops/giant.html), [Wizard](https://goblinsfarm.com/wiki/troops/wizard.html), [Balloon](https://goblinsfarm.com/wiki/troops/balloon.html), [Goblin](https://goblinsfarm.com/wiki/troops/goblin.html) and [Wall Breaker](https://goblinsfarm.com/wiki/troops/wall-breaker.html) tables, updated August 26, 2026 and attributed there to game client 18.400.21. These are undiscounted values, with no active event, pass or helper boost.

The indexed [Giant](https://clashofclans.fandom.com/wiki/Giant), [Wizard](https://clashofclans.fandom.com/wiki/Wizard), [Balloon](https://clashofclans.fandom.com/wiki/Balloon), [Goblin](https://clashofclans.fandom.com/wiki/Goblin) and [Wall Breaker](https://clashofclans.fandom.com/wiki/Wall_Breaker?page=2) wiki statistics corroborate laboratory requirements, attack intervals, ranges, hit values and death damage. Movement follows internal tile units: Giant 150 → 1.5 tiles/s, Wizard 200 → 2, Balloon 125 → 1.25, Goblin 400 → 4 and Wall Breaker 300 → 3. See the [movement conversion table](https://clashofclans.wiki.gg/es/wiki/Troop_Movement_Speed); its displayed Balloon tile speed is rounded to one decimal, so the internal 125 value is used directly.

| Troop | Level | HP | DPS | Per hit | Elixir to reach level | Research | Lab |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Giant | 1 | 400 | 12 | 24 | — | — | — |
| Giant | 2 | 500 | 15 | 30 | 40,000 | 2h | 2 |
| Giant | 3 | 600 | 20 | 40 | 150,000 | 4h | 4 |
| Giant | 4 | 700 | 24 | 48 | 400,000 | 6h | 5 |
| Giant | 5 | 900 | 31 | 62 | 800,000 | 12h | 6 |
| Wizard | 1 | 75 | 50 | 75 | — | — | — |
| Wizard | 2 | 90 | 70 | 105 | 120,000 | 4h | 3 |
| Wizard | 3 | 108 | 90 | 135 | 300,000 | 5h | 4 |
| Wizard | 4 | 135 | 125 | 187.5 | 600,000 | 12h | 5 |
| Wizard | 5 | 165 | 170 | 255 | 1,200,000 | 18h | 6 |
| Balloon | 1 | 150 | 25 | 75 | — | — | — |
| Balloon | 2 | 180 | 32 | 96 | 100,000 | 4h | 2 |
| Balloon | 3 | 216 | 48 | 144 | 400,000 | 6h | 4 |
| Balloon | 4 | 280 | 72 | 216 | 720,000 | 18h | 5 |
| Balloon | 5 | 390 | 108 | 324 | 1,300,000 | 1d | 6 |
| Goblin | 1 | 25 | 11 | 11 | — | — | — |
| Goblin | 2 | 30 | 14 | 14 | 45,000 | 2h | 1 |
| Goblin | 3 | 36 | 19 | 19 | 100,000 | 3h | 3 |
| Goblin | 4 | 50 | 24 | 24 | 500,000 | 6h | 5 |
| Goblin | 5 | 65 | 32 | 32 | 700,000 | 12h | 6 |
| Wall Breaker | 1 | 20 | 10 | 10 | — | — | — |
| Wall Breaker | 2 | 24 | 20 | 20 | 80,000 | 3h | 2 |
| Wall Breaker | 3 | 29 | 25 | 25 | 200,000 | 4h | 4 |
| Wall Breaker | 4 | 35 | 30 | 30 | 450,000 | 12h | 5 |
| Wall Breaker | 5 | 53 | 43 | 43 | 1,000,000 | 16h | 6 |

| Troop | Speed, tiles/s | Reach, tiles | Attack interval | Attack splash | Death damage, levels 1–5 | Death radius |
| --- | --- | --- | --- | --- | --- | --- |
| Giant | 1.5 | 1 | 2s | — | — | — |
| Wizard | 2 | 3 | 1.5s | 0.3 tiles | — | — |
| Balloon | 1.25 | 0.5 | 3s | 1.2 tiles | 25 / 32 / 48 / 72 / 108 | 1.2 tiles |
| Goblin | 4 | 0.4 | 1s | — | — | — |
| Wall Breaker | 3 | 1 | 1s | 2 tiles | 6 / 9 / 13 / 16 / 23 | 2 tiles |

## Combat and presentation

`src/game/troop-progression.ts` now requires records for every supported troop key. `troopStatsAt()` supplies the same values to deployment, combat, research previews and Info. Fractional hits are retained: a level-four Wizard deals 187.5 damage every 1.5 seconds, giving 125 DPS. Unsupported next upgrades return no cost or time; the model's maximum-level guard rejects them.

Wizard splash shrinks from the prototype's three tiles to 0.3 tiles. Collateral damage is full attack damage within that radius, measured from the impact point to the neighboring footprint. The prototype's 35% damage branch is removed. The subsequent [defending-unit audit](SKELETON-TRAP.md) changes Wizard fireballs to the native five tiles/s with a fixed landing point (`DontTrackTarget=TRUE`). Other projectile flight details retain local choices.

Balloon death damage now follows the battle's recorded research level and uses a 1.2-tile radius. It formerly dealt a fixed 120 damage within 1.8 tiles. A defeated Balloon resolves its blast once, without a Rage multiplier.

A Wall Breaker that reaches its target deals attack damage plus death damage; a defeated one deals only death damage. Both components apply the 40× wall multiplier. For example, level one's successful contact deals (10 + 6) × 40 = 640 wall damage, while an early defeat deals 6 × 40 = 240. The distinction is corroborated by [the community explanation of both components](https://www.reddit.com/r/ClashOfClans/comments/mf1gc1/). The configured Rage boost affects attack damage only. Both resolution paths mark the unit spent, preventing a duplicate explosion on subsequent frames. Info distinguishes damage per hit, damage on destruction and total wall damage on contact.

Goblin targeting and double damage now include Dark Elixir Drills and Storages. Previously these resource buildings were absent from the shared resource predicate. The existing short-melee approach handling supports the Goblin's 0.4-tile reach. Giant defense preference and fallback targeting remain intact. Troop details also show movement speed, attack interval and the relevant explosion radius.

## Compatibility and validation

Save version remains 4. Internal troop keys, prepared armies, existing research levels and paid research deadlines are retained. The current battle's research snapshot controls all combat values even if the home village changes. Combat version is 16; older recordings retain their summaries but cannot play with the new rules. No historical engine is bundled.

Thirty-two new model/replay cases cover all 25 added level records, actual deployment health, research gates and payment, offline completion, legacy deadlines, recorded levels, movement, Giant cadence, Goblin Dark Elixir preference, Wizard fractional impacts and splash boundaries, and all five Balloon/Wall Breaker death-damage levels. Wall Breaker tests cover both contact and defeat, with and without Rage, and repeat-frame idempotence. A recorded level-four Wizard hit retains exactly 187.5 damage through JSON save and playback.

The campaign audit now retains the previous level-three 160-space army as a mid-research scenario and adds a native TH8 200-space army with level-five troops from all seven types. Each scenario uses compatible barracks, laboratory and camp progression. The 192-battle matrix covers four armies and four approaches to all 12 stages. The first raid remains winnable with the actual untouched starter army. Campaign layouts, health/defense multipliers and rewards are unchanged.

This completes the core stat tables for the supported seven-troop, five-level subset. The full native roster, higher Town Halls, spells and hero balancing, native enemy layouts, detailed target selection/hitboxes, attack windups, directional art and level-specific artwork remain unfinished. Cross-browser and desktop Retina checks do not establish physical-phone performance or complete native combat parity.

The repeatable mixed-roster benchmark is `node scripts/performance-check.mjs --metal --density=2 --army=mixed` on macOS (`--metal` is optional elsewhere). It deploys the capacity-valid 200-space, 84-unit TH8 army used by the veteran campaign case and reports composition, levels and surviving units alongside frame times. The default `--army=starter` remains available. Neither sample is a physical-phone benchmark.
