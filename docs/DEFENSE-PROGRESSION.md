# Cannon and Archer Tower progression and combat

Checked September 11, 2026 against the undiscounted Home Village tables for [Cannon](https://coc.guide/defense/cannon) and [Archer Tower](https://coc.guide/defense/archer-tower). Prices are gold; durations apply to reaching the destination level. No event or Gold Pass discount is applied.

| Level | Cannon cost | Time | HP | Archer Tower cost | Time | HP |
| --- | ---: | --- | ---: | ---: | --- | ---: |
| 1 | 250 | 10s | 420 | 1,000 | 1m | 380 |
| 2 | 1,000 | 2m | 470 | 2,000 | 15m | 420 |
| 3 | 4,000 | 10m | 520 | 5,000 | 45m | 460 |
| 4 | 16,000 | 45m | 570 | 20,000 | 3h | 500 |
| 5 | 50,000 | 1h | 620 | 80,000 | 4h | 540 |
| 6 | 100,000 | 2h | 670 | 150,000 | 5h | 580 |
| 7 | 150,000 | 4h | 730 | 300,000 | 6h | 630 |
| 8 | 240,000 | 6h | 800 | 480,000 | 8h | 690 |
| 9 | 360,000 | 8h | 880 | 580,000 | 10h | 750 |
| 10 | 500,000 | 10h | 960 | 760,000 | 12h | 810 |

Cannon counts at TH1–8 are **1, 2, 2, 2, 3, 3, 5, 5**. Archer Tower counts are **0, 1, 1, 2, 3, 3, 4, 5**. Existing Town Hall level ceilings already match the table, ending at level 10 for both defenses at TH8. A new TH2 village starts with two Cannons and one Archer Tower.

## Shared behavior and compatibility

`defense-progression.ts` supplies level-1 definitions and the shared `buildingHp`, `upgradeCost` and `upgradeSeconds` helpers. Construction uses its own level-1 duration; upgrading uses the destination level's duration. Current hitpoints remain in effect until work completes. Construction and upgrades reserve a builder, complete once, and expose the same price, timer and health comparison in the HUD.

Only a new village receives the reduced starter count. Loading or importing an older village retains all building IDs, positions and levels, including excess pieces. Both starting construction and committing a placement enforce the current count. Building health is reconciled on home ticks, preserving any saved damage fraction. Existing paid upgrade timestamps are kept, so a table update does not restart a timer or charge again. The completion uses the new destination health.

Legacy levels 11–12 remain accepted with explicit health values: Cannon 1,060/1,160 and Archer Tower 890/970. They cannot be newly reached in the TH8 catalog. Battle snapshots retain their stored health; practice uses the home maximum, while campaign layouts continue to apply their scenario health multiplier.

## Normal-mode combat

The same September 11 reference tables provide normal-mode damage. Cannons reach **9 tiles**, fire every **0.8 seconds**, and target ground troops. Archer Towers reach **10 tiles**, fire every **0.5 seconds**, and target ground and air. Range is measured from the defense center, including the boundary. Existing range rings and inspection hints use these shared values.

| Level | Cannon DPS | Cannon per hit | Archer Tower DPS | Archer Tower per hit |
| --- | ---: | ---: | ---: | ---: |
| 1 | 9 | 7.2 | 11 | 5.5 |
| 2 | 11 | 8.8 | 15 | 7.5 |
| 3 | 15 | 12 | 19 | 9.5 |
| 4 | 19 | 15.2 | 25 | 12.5 |
| 5 | 25 | 20 | 30 | 15 |
| 6 | 31 | 24.8 | 35 | 17.5 |
| 7 | 40 | 32 | 42 | 21 |
| 8 | 48 | 38.4 | 48 | 24 |
| 9 | 56 | 44.8 | 56 | 28 |
| 10 | 64 | 51.2 | 63 | 31.5 |
| 11 (legacy) | 74 | 59.2 | 70 | 35 |
| 12 (legacy) | 85 | 68 | 74 | 37 |

The Info comparison shows DPS and fractional damage per hit without rounding down. Damage is captured when a shot launches and applied once on impact. Practice uses the table directly; authored campaign defense multipliers still apply to campaign attacks.

Defense cooldowns carry the fraction of a frame past their deadline to avoid losing firing time every shot. Idle defenses never build up a backlog of shots. Simulation launches remain quantized to frames; a long debug step does not simulate every missed shot. Projectile flight speeds are still local tuning. Combat version 5 marks the updated damage, range and cadence rules; older results remain readable with an explicit compatibility message.

## Verification and remaining work

Unit tests cover every supported destination with insufficient/exact resources, completion boundaries, current-versus-next health, builder reservations, construction, count gates, extra legacy buildings and running-save restoration. Browser tests exercise Info comparisons, paid upgrades, reload timestamps, completion and shop gates. Existing construction and Lightning tests use explicit fixtures appropriate to the new limits and health.

Normal-mode damage, range and attack intervals now use explicit reference values. These defenses still need native-sized footprints with layout migration, full per-level artwork, and gear-up behavior. Other building prices, timers, storage capacities, production and army statistics still contain prototype values.

Combat regressions cover all twelve accepted damage levels at actual projectile impact, range boundaries, ground/air targeting, target retention, inactive construction/upgrades, idle recovery, and sustained cadence at 20/30/60 simulation frames per second. Browser Info checks cover fractional current/next damage, DPS, range, interval and the older-replay explanation. Existing campaign viability and replay reproduction suites remain required after this rules change.
