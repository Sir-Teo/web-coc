# Air Defense and Wizard Tower progression

Re-audited September 11, 2026 against the modern Home Village wiki tables and applicable Supercell release notes. This supersedes the earlier CoC Guide-only audit. See [source reconciliation](DEFENSE-SOURCE-AUDIT.md) for discrepancies, dates and remaining gaps. Prices are undiscounted gold; times apply to reaching the listed level.

Sources: [Air Defense](https://clashofclans.fandom.com/wiki/Air_Defense) and [Wizard Tower](https://clashofclans.fandom.com/wiki/Wizard_Tower).

September 12 source follow-up: the [pinned Wizard Tower client reference](../reference/wizard-tower/README.md) now preserves all seventeen source levels, original bodies, eleven rooftop Wizard families, four projectile tiers, particles and sounds. Its first eight numerical rows agree with the table below. Gameplay now uses all seventeen source levels and four projectile tiers. The live scene now uses all seventeen original bodies, eleven animated rooftop families, original projectiles, particles, sounds, scaffolds and rubble. The source reference distinguishes retained source facts from local projection and timing interpretations.

## Air Defense

| Level | Gold | Time | HP | DPS / damage per rocket |
| --- | ---: | --- | ---: | ---: |
| 1 | 22,000 | 1h | 800 | 80 |
| 2 | 90,000 | 2h | 850 | 110 |
| 3 | 210,000 | 6h | 900 | 140 |
| 4 | 500,000 | 12h | 950 | 160 |
| 5 | 800,000 | 18h | 1,000 | 190 |
| 6 | 1,000,000 | 1d | 1,050 | 230 |
| 7 (legacy) | 1,750,000 | 2d | 1,100 | 280 |
| 8 (legacy) | 2,300,000 | 2d 12h | 1,210 | 320 |
| 9 (legacy) | 3,400,000 | 3d | 1,300 | 360 |
| 10 (legacy) | 5,000,000 | 4d | 1,400 | 400 |

Counts at TH1–9: **0, 0, 0, 1, 1, 2, 3, 3, 4**. Level ceilings: **0, 0, 0, 2, 3, 4, 5, 6, 7**. Fires every **1 second**, has **10-tile range**, and hits a single airborne target. The existing 3×3 footprint is retained.

## Wizard Tower

| Level | Gold | Time | HP | DPS | Damage per shot |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 100,000 | 1h | 620 | 11 | 14.3 |
| 2 | 150,000 | 1h 30m | 650 | 13 | 16.9 |
| 3 | 250,000 | 4h | 680 | 16 | 20.8 |
| 4 | 400,000 | 8h | 730 | 20 | 26 |
| 5 | 550,000 | 10h | 840 | 24 | 31.2 |
| 6 | 660,000 | 12h | 960 | 32 | 41.6 |
| 7 | 1,000,000 | 18h | 1,200 | 40 | 52 |
| 8 | 1,100,000 | 20h | 1,440 | 45 | 58.5 |
| 9 | 1,300,000 | 24h | 1,600 | 50 | 65 |
| 10 | 2,000,000 | 30h | 1,900 | 62 | 80.6 |
| 11 | 2,500,000 | 36h | 2,120 | 70 | 91 |
| 12 | 2,600,000 | 42h | 2,240 | 78 | 101.4 |
| 13 | 3,000,000 | 48h | 2,500 | 84 | 109.2 |
| 14 | 4,500,000 | 72h | 2,800 | 90 | 117 |
| 15 | 5,500,000 | 96h | 3,000 | 95 | 123.5 |
| 16 | 8,000,000 | 108h | 3,150 | 102 | 132.6 |
| 17 | 14,000,000 | 132h | 3,300 | 110 | 143 |

Counts at TH1–9: **0, 0, 0, 0, 1, 2, 2, 3, 4**. Level ceilings: **0, 0, 0, 0, 2, 3, 4, 6, 7**. Fires every **1.3 seconds**, with **7-tile range** and a **1-tile splash radius**. The radius and single-layer splash behavior are also documented by the [Wizard Tower wiki](https://clashofclans.fandom.com/wiki/Wizard_Tower). It can select ground or air targets; each blast affects the chosen layer. The existing 3×3 footprint is retained. Levels 1–4 use 5-tile/s projectiles; levels 5–17 use 9 tiles/s, across four retained source effect tiers. Each projectile lands where its target stood at launch, so moving troops can leave the splash circle. The source height/offset and action-frame handoff remain unverified. The first 55 native villages and Graduation Ceremony (stage 58) now have supported mechanics; native dependencies and remaining defense/garrison mechanics still gate progression.

## Integration and verification

The shared defense table supplies construction, upgrades, health, Info comparisons and actual projectile damage. Firing cadence carries frame overshoot, and impact resolves through the battle-time projectile lifecycle. Air Defense rockets remain single-target even beside another Balloon. Wizard Tower splash includes the one-tile boundary and excludes units beyond it or on the other layer.

Existing home buildings retain their layout, levels and paid timestamps. Health reconciliation preserves the saved damage fraction; upgrades complete once and reserve a builder throughout. Excess pieces and levels from older saves remain accepted, while new construction and upgrades use the current tier's limits. Battle snapshots are not reconciled as home buildings.

Replay version **34** identifies the current source projectile rules (the earlier defense audit used version 8). Earlier results remain readable; playback requiring older rules is unavailable. Campaign multipliers remain scenario tuning and are not evidence of native multiplayer balance. The campaign viability suite remains part of the full unit run.

Tests cover every playable upgrade, exact-resource boundaries, timers, builders, saved health, counts, every accepted damage tier, range edges, 20/30/60 fps cadence, idle reacquisition, upgrade downtime, air-only rockets, one-tile splash on both layers, destruction during rocket flight, and replay fidelity. Browser checks inspect phone Info values, save/reload paid timers, shop unlocks and older replay messaging. The automatic-hero replay fixture adds a second Cannon to produce the required low-health event under the corrected defense stats.

All seventeen Wizard Tower levels now use their source artwork in the live scene, moving previews and Info. Original attack, impact, destruction and home feedback reconstruct through replay with bounded history. Air Defense per-level artwork remains unfinished and currently has two original tiers. Air Defense projectile speed, firing animations, troop statistics, authored campaign layouts and the broader economy still contain local tuning; this audit does not establish complete native combat parity.
