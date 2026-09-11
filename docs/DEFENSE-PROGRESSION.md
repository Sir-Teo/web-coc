# Cannon and Archer Tower progression and combat

Re-audited September 11, 2026 against the modern Home Village wiki tables and applicable Supercell release notes. This supersedes the earlier CoC Guide-only audit. See [source reconciliation](DEFENSE-SOURCE-AUDIT.md) for discrepancies, dates and remaining gaps. Prices are undiscounted gold; times apply to reaching the listed level.

Related audits: [Mortar](MORTAR-PROGRESSION.md) and [Air Defense / Wizard Tower](AIR-WIZARD-PROGRESSION.md). All five current tower types now use explicit progression and normal-mode weapon values.

Sources: [Cannon](https://clashofclans.fandom.com/wiki/Cannon) and [Archer Tower](https://clashofclans.fandom.com/wiki/Archer_Tower).

| Level | Cannon cost | Time | HP | Archer Tower cost | Time | HP |
| --- | ---: | --- | ---: | ---: | --- | ---: |
| 1 | 250 | 5s | 300 | 1,000 | 15s | 380 |
| 2 | 1,000 | 30s | 360 | 2,000 | 2m | 420 |
| 3 | 4,000 | 2m | 420 | 5,000 | 20m | 460 |
| 4 | 16,000 | 20m | 500 | 20,000 | 1h | 500 |
| 5 | 50,000 | 30m | 600 | 70,000 | 1h 30m | 540 |
| 6 | 60,000 | 1h | 660 | 80,000 | 2h | 580 |
| 7 | 100,000 | 2h | 730 | 150,000 | 3h | 630 |
| 8 | 160,000 | 3h | 800 | 200,000 | 4h | 690 |
| 9 | 250,000 | 3h 30m | 880 | 400,000 | 5h | 750 |
| 10 | 330,000 | 4h | 960 | 460,000 | 6h | 810 |

Cannon counts at TH1–8 are **2, 2, 2, 2, 3, 3, 5, 5**. Archer Tower counts are **0, 1, 1, 2, 3, 3, 4, 5**. Both defenses end at level 10 in the TH8 catalog. TH1 now permits two Cannons and upgrades through level 2; level 3 requires TH2. Both shop placement and paid upgrades enforce these limits. A new TH2 village starts with two Cannons and one Archer Tower.

## Shared behavior and compatibility

`defense-progression.ts` supplies level-1 definitions and the shared `buildingHp`, `upgradeCost` and `upgradeSeconds` helpers. Construction uses its own level-1 duration; upgrading uses the destination level's duration. Current hitpoints remain in effect until work completes. Construction and upgrades reserve a builder, complete once, and expose the same price, timer and health comparison in the HUD.

Only a new village receives the reduced starter count. Loading or importing an older village retains all building IDs, positions and levels, including excess pieces. Both starting construction and committing a placement enforce the current count. Building health is reconciled on home ticks, preserving any saved damage fraction. Existing paid upgrade timestamps are kept, so a table update does not restart a timer or charge again. The completion uses the new destination health.

Legacy levels 11–12 cost 500,000/600,000 gold and take 4h 30m/5h for Cannons, or 600,000/700,000 gold and 7h/8h for Archer Towers. They remain accepted with explicit health values: Cannon 1,060/1,160 and Archer Tower 890/970. They cannot be newly reached in the TH8 catalog. Battle snapshots retain their stored health; practice uses the home maximum, while campaign layouts continue to apply their scenario health multiplier.

## Normal-mode combat

The current reference tables provide normal-mode damage. The low-level Cannon changes also match Supercell’s June 16, 2025 release notes. Cannons reach **9 tiles**, fire every **0.8 seconds**, and target ground troops. Archer Towers reach **10 tiles**, fire every **0.5 seconds**, and target ground and air. Range is measured from the defense center, including the boundary. Existing range rings and inspection hints use these shared values.

| Level | Cannon DPS | Cannon per hit | Archer Tower DPS | Archer Tower per hit |
| --- | ---: | ---: | ---: | ---: |
| 1 | 7 | 5.6 | 11 | 5.5 |
| 2 | 10 | 8 | 15 | 7.5 |
| 3 | 13 | 10.4 | 19 | 9.5 |
| 4 | 17 | 13.6 | 25 | 12.5 |
| 5 | 23 | 18.4 | 30 | 15 |
| 6 | 30 | 24 | 35 | 17.5 |
| 7 | 40 | 32 | 42 | 21 |
| 8 | 48 | 38.4 | 48 | 24 |
| 9 | 56 | 44.8 | 56 | 28 |
| 10 | 64 | 51.2 | 63 | 31.5 |
| 11 (legacy) | 74 | 59.2 | 70 | 35 |
| 12 (legacy) | 85 | 68 | 74 | 37 |

The Info comparison shows DPS and fractional damage per hit without rounding down. Damage is captured when a shot launches and applied once on impact. Practice uses the table directly; authored campaign defense multipliers still apply to campaign attacks.

Defense cooldowns carry the fraction of a frame past their deadline to avoid losing firing time every shot. Idle defenses never build up a backlog of shots. Simulation launches remain quantized to frames; a long debug step does not simulate every missed shot. Projectile flight speeds are still local tuning. Combat version 10 marks the corrected low-level Cannon health and damage; older results remain readable with an explicit compatibility message.

## Verification and remaining work

Unit tests cover every supported destination with insufficient/exact resources, completion boundaries, current-versus-next health, builder reservations, construction, count gates, extra legacy buildings and running-save restoration. Browser tests exercise Info comparisons, paid upgrades, reload timestamps, completion and shop gates. Existing construction and Lightning tests use explicit fixtures appropriate to the new limits and health.

Normal-mode damage, range and attack intervals now use explicit reference values. Cannon, Archer Tower and Mortar now use native 3×3 footprints with legacy layout migration; see [NATIVE-GRID.md](NATIVE-GRID.md). Full per-level artwork and gear-up behavior remain unfinished. Other building prices, timers, storage capacities, production and army statistics still contain prototype values.

Combat regressions cover all twelve accepted damage levels at actual projectile impact, range boundaries, ground/air targeting, target retention, inactive construction/upgrades, idle recovery, and sustained cadence at 20/30/60 simulation frames per second. Browser Info checks cover fractional current/next damage, DPS, range, interval and the older-replay explanation. Existing campaign viability and replay reproduction suites remain required after this rules change.
