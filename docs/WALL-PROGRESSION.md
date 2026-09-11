# Home Village wall progression

Re-audited September 11, 2026 against the [modern Home Village Wall table](https://clashofclans.fandom.com/wiki/Wall) and the explicit Wall health changes in [Supercell’s June 16, 2025 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/). This supersedes the stale CoC Guide health values and 50-gold construction price. The wiki statistics and February 2025 history agree that new Wall pieces cost zero. Direct wiki retrieval was blocked; the indexed reference was crawled about two months before this audit. Temporary discounts and Wall Rings remain unimplemented.

| Destination level | Cost per piece | Hitpoints | Required Town Hall |
| --- | ---: | ---: | ---: |
| 1 | Free | 100 | 2 |
| 2 | 1,000 | 200 | 2 |
| 3 | 5,000 | 400 | 3 |
| 4 | 10,000 | 800 | 4 |
| 5 | 20,000 | 1,200 | 5 |
| 6 | 30,000 | 1,800 | 6 |
| 7 | 50,000 | 2,400 | 7 |
| 8 | 75,000 | 3,000 | 8 |

New pieces are free and the shop says “Free.” An empty treasury can place a run until the Town Hall count limit, after which the tool closes and the shop says “At limit.” Resource upgrades allow gold or elixir from level 4 to 5 onward (TH5) and require a free builder, without reserving that builder or starting a timer. Mixed selections sum each eligible piece's destination price. Ineligible pieces are disclosed and skipped; an unaffordable batch changes nothing.

The wall-piece limits at Town Halls 1–8 are 0, 25, 50, 75, 100, 125, 175 and 225. Both entering construction and committing placement enforce the limit. New TH2 villages start with 25 walls along the western boundary and two southern runs; subsequent Town Hall upgrades open room for more.

## Persistence and combat

Existing villages retain every piece, ID, coordinate and level, including pieces above the current Town Hall allowance. Extra pieces block additional purchases until a later Town Hall provides enough capacity. They remain movable and upgradeable within the normal level rules. The legacy save validator still accepts wall levels through 12; their explicit health values are retained for compatibility, while upgrades beyond the playable TH8 catalog remain locked.

`buildingHp` supplies construction, completed upgrades, developer controls and Info comparisons. Home-village ticks also reconcile stored wall health with that table, preserving the saved damage fraction. This covers normal loading and importing a backup without destroying the village or restarting pending work. Pending legacy wall timers complete normally with the destination health and no additional resource charge. Replay snapshots retain their recorded health. Practice battles use the reconciled maximum health; campaign villages still apply their existing scenario difficulty multiplier.

## Verification

Unit tests exercise every playable upgrade with one-less-than-required and exact funds, mixed elixir costs, TH count/level limits, last-slot construction, stale placement, legacy extras, damage-preserving restoration, practice health and pending legacy upgrades. Browser tests verify the Info comparison, displayed price, immediate upgrade, reload persistence and shop limits, alongside the existing row-upgrade, movement and artwork suites in Chromium and WebKit.

The remainder of the building economy still uses prototype scaling. This increment does not establish full economy parity or expand the Town Hall catalog.

The health reduction uses combat version 11. Older replay summaries remain readable but incompatible recordings cannot play under changed rules. Ground troops must break a wall before crossing it; lower-tier walls now break sooner under the same attack. Reload checks preserve the saved damage fraction at every reduced tier and leave home damage unchanged after practice.

Source discrepancy resolved: the wiki’s elixir column starts at destination level 5, while its row-upgrade prose requires every piece to already be level 5. [Supercell’s June 26, 2022 announcement](https://supercell.com/en/games/clashofclans/blog/news/home-village-changes-2/) explicitly unlocks elixir Wall upgrades at TH5, whose maximum Wall level is 5. The implementation follows that announcement and the table: current level 4 is eligible for an elixir upgrade to 5. Mixed rows containing any lower-level piece offer gold first. Same-level selection includes eligible elixir balances when calculating how many pieces can be added.
