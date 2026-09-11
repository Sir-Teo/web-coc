# Home Village wall progression

Wall construction, upgrades, health and purchase limits now use explicit tables. The reference is the [CoC Guide Home Village wall table](https://coc.guide/defense/wall), checked September 11, 2026. These are undiscounted base values; temporary events, Gold Pass reductions and Wall Rings are not implemented.

| Destination level | Cost per piece | Hitpoints | Required Town Hall |
| --- | ---: | ---: | ---: |
| 1 | 50 | 300 | 2 |
| 2 | 1,000 | 500 | 2 |
| 3 | 5,000 | 700 | 3 |
| 4 | 10,000 | 900 | 4 |
| 5 | 20,000 | 1,400 | 5 |
| 6 | 30,000 | 2,000 | 6 |
| 7 | 50,000 | 2,500 | 7 |
| 8 | 75,000 | 3,000 | 8 |

New pieces cost gold. The existing resource-upgrade rules allow gold or elixir from level 5 to 6 onward and require a free builder, without reserving that builder or starting a timer. Mixed selections sum each eligible piece's destination price. Ineligible pieces are disclosed and skipped; an unaffordable batch changes nothing.

The wall-piece limits at Town Halls 1–8 are 0, 25, 50, 75, 100, 125, 175 and 225. Both entering construction and committing placement enforce the limit. New TH2 villages start with 25 walls along the western boundary and two southern runs; subsequent Town Hall upgrades open room for more.

## Persistence and combat

Existing villages retain every piece, ID, coordinate and level, including pieces above the current Town Hall allowance. Extra pieces block additional purchases until a later Town Hall provides enough capacity. They remain movable and upgradeable within the normal level rules. The legacy save validator still accepts wall levels through 12; their explicit health values are retained for compatibility, while upgrades beyond the playable TH8 catalog remain locked.

`buildingHp` supplies construction, completed upgrades, developer controls and Info comparisons. Home-village ticks also reconcile stored wall health with that table, preserving the saved damage fraction. This covers normal loading and importing a backup without destroying the village or restarting pending work. Pending legacy wall timers complete normally with the destination health and no additional resource charge. Replay snapshots retain their recorded health. Practice battles use the reconciled maximum health; campaign villages still apply their existing scenario difficulty multiplier.

## Verification

Unit tests exercise every playable upgrade with one-less-than-required and exact funds, mixed elixir costs, TH count/level limits, last-slot construction, stale placement, legacy extras, damage-preserving restoration, practice health and pending legacy upgrades. Browser tests verify the Info comparison, displayed price, immediate upgrade, reload persistence and shop limits, alongside the existing row-upgrade, movement and artwork suites in Chromium and WebKit.

The remainder of the building economy still uses prototype scaling. This increment does not establish full economy parity or expand the Town Hall catalog.
