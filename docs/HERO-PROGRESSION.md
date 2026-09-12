# Heroes and Town Hall progression

Implemented September 10, 2026. This pass adds the first playable hero and explicit building level gates to the existing local game. It does not reproduce the complete live game's progression or hero system.

## Reference decisions

- Supercell's [May 2026 update](https://supercell.com/en/games/clashofclans/blog/release-notes/may-update/) moves the Barbarian King and Hero Hall to Town Hall 4. Hero Hall 2 remains a Town Hall 8 unlock. Early King strength scales with Town Hall level.
- Supercell's [Heroes & Pets support page](https://support.supercell.com/clash-of-clans/en/articles/about-heroes-pets-9.html) describes reusable heroes, Hero Hall requirements, and the early hero progression change. Permanent hero upgrades begin at Town Hall 7; the default equipment effects are available with the early King. This implementation has no recovery timer.
- Building ceilings for TH1–8 were checked against [Clash Ninja's maximum-level tables](https://www.clash.ninja/guides/max-levels-for-each-th). The catalog remains a subset. Existing building counts, housing, costs, timers, health, and damage are local values, not a verified live-data import.
- [Hero Equipment](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/) separates abilities into equipment. The current default loadout implements level-1 Barbarian Puppet and Rage Vial; there is no equipment inventory, Blacksmith, ore economy, or equipment upgrading yet.

## Updated combat reference

The initial combat estimates have been superseded by [KING-COMBAT.md](KING-COMBAT.md): explicit level 1–20 base values and upgrade prices/timers, 50%/75%/100% early Town Hall scaling, native range/movement, and level-1 Barbarian Puppet/Rage Vial effects. The defaults work from TH4; automatic activation is on lethal damage. The equipment inventory, Blacksmith and defending heroes remain unfinished.

## Playable behavior

Build the Hero Hall at TH4 to unlock a level-1 Barbarian King. Army → Heroes opens his panel. In an attack, select his card or press H, then tap clear ground outside the red boundary. Once deployed, tap his card or press H to activate both default items from TH4. They restore a fixed amount of health, grant 10 seconds of enhanced movement and damage to the King, and summon eight boosted Barbarians in two waves. Automatic activation occurs on lethal damage if the items are unused. Both items activate once per attack. Summons do not consume army housing or alter deployed-troop records.

The King uses a shared portrait identity and four directional idle/walk/attack sets; see [KING-ART.md](KING-ART.md). The King is separate from the camp army and can attack alone. Defeat never removes him from the village; each fresh attack restores his health and ability. Practice uses the same deployment and combat rules while preserving home troops, spells, and resources. Result history records the hero level and whether his ability was used. Spring Traps deal half damage to heroes and cannot eject them.

At TH7, build a Dark Elixir Drill and Storage. Drills generate 360 dark elixir per hour per level, hold 2,000 per level, pause while upgrading, and observe the existing eight-hour offline cap. Storage provides 10,000 capacity per level; uncollectable overflow remains in the drill. Hero upgrades consume dark elixir, occupy one builder, disable deployment while upgrading, and complete once even after reload. Gems can finish an upgrade immediately. The local King cap is 1 before TH7, 10 at TH7/Hero Hall 1, and 20 at TH8/Hero Hall 2.

## Progression and migration

`src/game/progression.ts` defines independent level ceilings for each building at every supported Town Hall. New construction is locked until the first nonzero ceiling; info panels show the actual Town Hall needed for the next level. Army → Progression lists unlocks and cap increases across all eight tiers.

Old villages keep their buildings, levels, army, and resources even when a newly introduced requirement would lock a new construction. The established starter village also retains its demo facilities. Old saves initialize dark elixir to zero; the King is granted only after a completed Hero Hall exists. Validation rejects invalid hero levels, malformed upgrade timers, negative dark elixir, and heroes without a completed hall.

The former linear storage curve made some newly available higher-level upgrades impossible to afford. Early storage levels retain their existing capacity. Above level 5, storage grows by 50% per level. A test checks every available construction/upgrade against its Town Hall's maximum storage, including the next Town Hall itself. These are local economy values; exact live costs/capacities remain future work.

## Verification and limits

Model tests cover unlock completion, builder/resource gates, one-time offline completion, gem finishing, legacy saves, malformed hero state, collector overflow/downtime, hero-only attacks, blocked/duplicate deployment, manual and automatic equipment activation, summons, spring immunity, defeat/reuse, result records, level tables, and upgrade affordability. Browser tests cover hero art, real pointer deployment, H activation, upgrade persistence, and portrait/landscape control reachability.

Remaining hero gaps: defending heroes, Archer Queen and other heroes, equipment inventory and upgrades, pets, multiple hero slots and presets, complete animations, and exact combat/economy tuning. Dark elixir is earned from drills; campaign villages do not yet award dark loot. Existing simplified building counts, research caps, troop unlocks and army housing still need explicit progression tables.
