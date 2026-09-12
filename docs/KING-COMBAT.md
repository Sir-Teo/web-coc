# Barbarian King combat and default equipment

## Source snapshot

Numerical values come from Supercell's immutable public client bundle **18.400.21**, content hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. Raw download SHA-256 values:

| File | SHA-256 |
| --- | --- |
| [heroes.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/heroes.csv) | `658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197` |
| [townhall_levels.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/townhall_levels.csv) | `2d596bcd08433924c3e566f79f380eb2260076f87c5b5dd30c9ab6f2c3f41472` |
| [character_items.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/character_items.csv) | `66e644c62331a026aec3795980d9a37af95e2120d67dfbad380c729f3645ebad` |
| [special_abilities.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/special_abilities.csv) | `c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb` |

The signed files have a 68-byte signature header followed by the client LZMA payload. Blank fields inherit within each named record. Source files and decoded copies are retained in `output/playtest/reference-*.csv`; the game ships transcribed numerical constants, not native artwork. Supercell's [May 2026 announcement](https://supercell.com/en/games/clashofclans/blog/release-notes/may-update/) confirms the TH4 unlock. The [Hero Equipment announcement](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/) establishes separate equipment abilities and passive bonuses.

## Base progression

`src/game/king-progression.ts` contains all twenty supported base-health, DPS, recovery and upgrade records. Heroes use **two tiles/s movement**, **one-tile melee range**, and a **1.2-second attack interval**. Damage per hit is DPS × 1.2. The King attacks ground targets only and uses no army housing.

`heroes.csv` stores the next upgrade's price and duration on the current-level row. The implementation converts these to destination-level records: level 2 costs **5,000 dark elixir / 2 hours**, level 10 costs **10,000 / 20 hours**, level 11 costs **10,500 / 22 hours**, and level 20 costs **15,000 / 24 hours**. [The community King table](https://clashofclans.fandom.com/wiki/Barbarian_King?page=2) corroborates this offset; reading those fields as destination-level values would misprice every upgrade.

TH4–6 retain level 1. TH7/Hero Hall 1 permits level 10; TH8/Hero Hall 2 permits level 20. Missing halls permit no hero levels. Already paid legacy upgrades keep their original cost and deadline, complete once, and do not charge again. New upgrades use the corrected table.

`ScaleByTH=TRUE` and `ScaleByTHPercent` specify **50% at TH4, 75% at TH5, and 100% from TH6**. Health, damage and recovery include that scaling; movement, range and the equipment's percentage/flat movement boosts do not. Fractional health and damage are retained by the simulation; exact native integer/fixed-point rounding is not proven.

## Equipped items

Every attacking King currently carries **level 1 Barbarian Puppet and level 1 Rage Vial**, the native defaults. This implements those two items' effects; it is not a complete equipment inventory or Blacksmith system. Hero upgrades do not silently upgrade equipment.

| Item | Passive bonus before early-TH scaling | Activation |
| --- | --- | --- |
| Barbarian Puppet | +309 health; +110 activation recovery | 8 Barbarians, five immediately and three after 0.5s. Each receives +100% damage and +1.2 tiles/s movement for 20s. |
| Rage Vial | +17 DPS; +150 activation recovery | King receives +120% damage and +2.25 tiles/s movement for 10s. Attack interval is unchanged. |

The King also has intrinsic activation recovery: 200 at levels 1–4, 250 at 5–9, 310 at 10–14, 375 at 15–19, and 450 at level 20. Combined default recovery is therefore 460 at level 1 and 710 at level 20 before early-TH scaling. Recovery is a fixed amount, capped by maximum health, not a percentage of maximum health.

At TH6+ a level-1 attacking King has **1,754 health, 119 DPS, and 142.8 damage per hit** with these defaults. At TH4 these become **877, 59.5, and 71.4**, with 230 activation recovery. A level-20 King has **2,618 health, 165 DPS, and 198 damage per hit**. The panel shows equipped totals, the two items, recovery, movement, attack timing, early scaling and the next upgrade.

Both items activate together once per attack, including TH4–6. The King card and H key activate them. The native `SimulatePlayerInputOnDeath=TRUE` moves automatic activation from the former estimated 20% threshold to lethal damage. The local simulation applies recovery against remaining damage, so overkill greater than recovery can still defeat him. That overkill ordering remains a native-engine verification gap.

Puppet Barbarians inherit the battle's researched Barbarian level. They have independent scheduled birth times and boost deadlines, do not consume camp troops, and are absent from deployed-army accounting. A wide simulation step retains the second wave's 0.5s birth timestamp and limits its movement time accordingly. Projectile impacts, Bomb Tower destruction blasts, Mortar shells and spell pulses ignore a summon whose recorded birth is later than that effect. Remaining waves stop if the King dies or the battle finishes. Spawn positions and cancellation on owner death are local interpretations of the native ability record and still need direct client comparison.

A Rage spell and item boost use the stronger damage and movement bonus independently. Hero spell modifiers still apply; summoned Barbarians use ordinary troop spell modifiers. Gold tint identifies a King or Puppet Barbarian with an active equipment boost; spell tint takes precedence. Tint expiration, pause and reduced motion follow battle time.

## Persistence and limits

Combat version **23** records the numerical and ability changes. No new permanent save fields are required; save version remains 4. Replay inputs reconstruct the default loadout, intrinsic recovery, both summon waves and separate boost deadlines. Older recordings retain their result summaries but require their original combat rules for playback.

Hero Hall construction/early appearance, banners and defending heroes, Archer Queen and later heroes, equipment selection/upgrading, ores, Blacksmith, pets, complete directional art, attack action-frame timing, native target scoring, precise damage/activation order and physical-device performance remain unfinished. The subsequent [King art pass](KING-ART.md) replaces the prototype with a matching portrait and four directional idle/walk/attack sets; it does not establish pixel matching. See [QA.md](QA.md) for the actual validation scope.
