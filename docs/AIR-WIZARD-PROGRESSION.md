# Air Defense and Wizard Tower progression

Source freshness follow-up: newer trap references expose stale CoC Guide economy data. These implemented defense tables need a current cross-source price/time re-audit; see [TRAP-PROGRESSION.md](TRAP-PROGRESSION.md#source-reconciliation).

Audited September 11, 2026 using the undiscounted [Air Defense](https://coc.guide/defense/air-defense) and [Wizard Tower](https://coc.guide/defense/wizard-tower) tables. Costs and times apply to reaching the listed level. No event or Gold Pass reduction is applied.

## Air Defense

| Level | Gold | Time | HP | DPS / damage per rocket |
| --- | ---: | --- | ---: | ---: |
| 1 | 22,000 | 3h | 800 | 80 |
| 2 | 90,000 | 6h | 850 | 110 |
| 3 | 270,000 | 10h | 900 | 140 |
| 4 | 500,000 | 16h | 950 | 160 |
| 5 | 800,000 | 1d | 1,000 | 190 |
| 6 | 1,000,000 | 1d 12h | 1,050 | 230 |
| 7 (legacy) | 1,750,000 | 2d | 1,100 | 280 |
| 8 (legacy) | 2,300,000 | 2d 12h | 1,210 | 320 |
| 9 (legacy) | 3,400,000 | 3d | 1,300 | 360 |
| 10 (legacy) | 5,800,000 | 4d | 1,400 | 400 |

Counts at TH1–8: **0, 0, 0, 1, 1, 2, 3, 3**. Level ceilings: **0, 0, 0, 2, 3, 4, 5, 6**. Fires every **1 second**, has **10-tile range**, and hits a single airborne target. The existing 3×3 footprint is retained.

## Wizard Tower

| Level | Gold | Time | HP | DPS | Damage per shot |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 120,000 | 2h | 620 | 11 | 14.3 |
| 2 | 220,000 | 3h | 650 | 13 | 16.9 |
| 3 | 400,000 | 6h | 680 | 16 | 20.8 |
| 4 | 540,000 | 12h | 730 | 20 | 26 |
| 5 | 700,000 | 18h | 840 | 24 | 31.2 |
| 6 | 1,000,000 | 1d | 960 | 32 | 41.6 |
| 7 (legacy) | 1,500,000 | 1d 12h | 1,200 | 40 | 52 |
| 8 (legacy) | 1,600,000 | 1d 18h | 1,440 | 45 | 58.5 |

Counts at TH1–8: **0, 0, 0, 0, 1, 2, 2, 3**. Level ceilings: **0, 0, 0, 0, 2, 3, 4, 6**. Fires every **1.3 seconds**, with **7-tile range** and a **1-tile splash radius**. The radius and single-layer splash behavior are also documented by the [Wizard Tower wiki](https://clashofclans.fandom.com/wiki/Wizard_Tower). It can select ground or air targets; each blast affects the chosen layer. The existing 3×3 footprint is retained.

## Integration and verification

The shared defense table supplies construction, upgrades, health, Info comparisons and actual projectile damage. Firing cadence carries frame overshoot, and impact resolves through the battle-time projectile lifecycle. Air Defense rockets remain single-target even beside another Balloon. Wizard Tower splash includes the one-tile boundary and excludes units beyond it or on the other layer.

Existing home buildings retain their layout, levels and paid timestamps. Health reconciliation preserves the saved damage fraction; upgrades complete once and reserve a builder throughout. Excess pieces and levels from older saves remain accepted, while new construction and upgrades use the TH8 limits. Battle snapshots are not reconciled as home buildings.

Replay version **8** identifies these combat and health changes. Earlier results remain readable; playback requiring older rules is unavailable. Campaign multipliers remain scenario tuning and are not evidence of native multiplayer balance. The campaign viability suite remains part of the full unit run.

Tests cover every playable upgrade, exact-resource boundaries, timers, builders, saved health, counts, every accepted damage tier, range edges, 20/30/60 fps cadence, idle reacquisition, upgrade downtime, air-only rockets, one-tile splash on both layers, destruction during rocket flight, and replay fidelity. Browser checks inspect phone Info values, save/reload paid timers, shop unlocks and older replay messaging. The automatic-hero replay fixture adds a second Cannon to produce the required low-health event under the corrected defense stats.

Per-level artwork remains unfinished: Air Defense has two original tiers and Wizard Tower has one. Projectile speeds, firing animations, troop statistics, campaign layouts and the broader economy still contain local tuning; this audit does not establish complete native combat parity.
