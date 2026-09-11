# Trap progression and spring behavior

Checked September 11, 2026. The current Home Village tables below come from the [Bomb](https://clashofclans.fandom.com/wiki/Bomb), [Giant Bomb](https://clashofclans.fandom.com/wiki/Giant_Bomb), [Air Bomb](https://clashofclans.fandom.com/wiki/Air_Bomb), and [Spring Trap](https://clashofclans.fandom.com/wiki/Spring_Trap) wiki pages, with no Gold Pass modifier. The indexed pages include the post-2025 roster and 2026 updates. Costs and times are destination-level values.

## Source reconciliation

CoC Guide's trap pages contain stale values: its Spring Trap still ends at level 5 and lists 1,000 damage at every level, whereas the modern table extends to level 13 and starts at zero damage. Its Giant Bomb availability also incorrectly lists eight at TH1–5. These entries were rejected. The newer wiki agrees with Supercell's [August 2025 rework announcement](https://supercell.com/en/games/clashofclans/blog/news/upcoming-changes-to-spring-trap-th-weapon-level-removal/) and [October 2025 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/get-ready-for-ranked-update/) on single-target spring selection, ejection capacity, larger-unit damage/stun, and half damage to heroes.

The Bomb wiki's prose says a one-tile trigger but its statistics table says 1.5; CoC Guide also says 1.5. This pass retains 1.5 and uses the documented 1.5-second fuse. Spring Trap uses the modern one-tile trigger and no activation delay, following the release notes over the wiki's older delay paragraph. Exact physical-device timing remains a verification gap.

This discrepancy prompted a [new defense source audit](DEFENSE-SOURCE-AUDIT.md). The five tower tables now use the newer costs/times, and low-level Cannon health/damage follows the official June 2025 changes. Earlier passing test counts only validate the tables implemented at that milestone.

## Bomb

| Level | Damage | Gold | Time |
| --- | ---: | ---: | --- |
| 1 | 20 | 400 | Instant |
| 2 | 24 | 1,000 | 1m |
| 3 | 29 | 10,000 | 5m |
| 4 | 35 | 40,000 | 40m |
| 5 | 42 | 100,000 | 1h |
| 6 (legacy) | 54 | 230,000 | 2h |
| 7 (legacy) | 72 | 330,000 | 3h |
| 8 (legacy) | 92 | 500,000 | 4h |

TH1–8 counts: **0, 0, 2, 2, 4, 4, 6, 6**. Level ceilings: **0, 0, 2, 2, 3, 3, 4, 5**. Ground splash radius is 3 tiles.

## Giant Bomb

| Level | Damage | Radius | Gold | Time |
| --- | ---: | ---: | ---: | --- |
| 1 | 175 | 3 | 12,500 | Instant |
| 2 | 200 | 3.5 | 75,000 | 1h |
| 3 | 225 | 3.5 | 220,000 | 3h |
| 4 (legacy) | 250 | 4 | 750,000 | 4h |
| 5 (legacy) | 275 | 4 | 900,000 | 10h |

TH1–8 counts: **0, 0, 0, 0, 0, 1, 2, 3**. Level ceilings: **0, 0, 0, 0, 0, 2, 2, 3**. Trigger radius is 2 tiles. The existing 1.5-second fuse remains local tuning.

## Air Bomb

| Level | Damage | Gold | Time |
| --- | ---: | ---: | --- |
| 1 | 100 | 4,000 | Instant |
| 2 | 120 | 20,000 | 30m |
| 3 | 144 | 75,000 | 1h |
| 4 (legacy) | 173 | 300,000 | 4h |
| 5 (legacy) | 208 | 550,000 | 8h |
| 6 (legacy) | 232 | 800,000 | 12h |

TH1–8 counts: **0, 0, 0, 0, 2, 2, 2, 4**. Level ceilings: **0, 0, 0, 0, 2, 2, 3, 3**. Trigger radius is 4 tiles and air splash is 3 tiles. The existing homing flight uses a local 0.9-second duration; this is not a verified native projectile-speed model.

## Spring Trap

| Level | Capacity | Damage to oversized troops | Gold | Time |
| --- | ---: | ---: | ---: | --- |
| 1 | 10 | 0 | 2,000 | Instant |
| 2 | 12 | 250 | 130,000 | 1h |
| 3 | 14 | 300 | 240,000 | 2h |
| 4 (legacy) | 16 | 350 | 350,000 | 3h |
| 5 (legacy) | 18 | 400 | 800,000 | 4h |

TH1–8 counts: **0, 0, 0, 2, 2, 4, 4, 6**. Level ceilings: **0, 0, 0, 1, 1, 1, 2, 3**. The largest-housing eligible ground target is selected. Units within capacity are ejected. Larger survivors stay at their ground coordinates while being lifted and stunned; heroes take half damage and are never ejected. Nearby springs cannot stack on a currently tossed survivor. Healing continues during the stun.

The original horizontal shove was replaced by a vertical sprite arc driven by battle time. Pause, replay speed and reduced motion use the same path. Airtime (0.6s) and visual height (45px) remain local presentation tuning; reduced motion suppresses the arc while preserving stun and damage.

## Placement, persistence and verification

All four traps place immediately, without a free builder, as described by the [Builder reference](https://clashofclans.fandom.com/wiki/Builder). Upgrades still reserve a builder. The shared table drives paid upgrades, Info comparisons, combat damage and Giant Bomb blast radius. Existing paid construction or upgrade timestamps remain intact and finish once; old accepted levels and excess pieces remain in saved layouts. Traps do not participate in destruction, path blocking or health-based targeting.

Combat version 9 identifies these trap and stun changes. Older summaries remain readable; incompatible replays do not play under new rules. Tests cover exact resource boundaries, occupied builders, save/reload timers, every accepted damage tier, blast edges, vertical stun, half hero damage, healing during stun, battle-end cancellation, and browser placement/upgrade/presentation flows. Campaign viability and replay reproduction remain required.

Still missing: per-level trap art, full trap roster, live asynchronous defensive re-arming, native flight/knockback measurements and physical-device comparison. This is a local battle implementation, not complete native parity.
