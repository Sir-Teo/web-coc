# Native league table

Pinned public client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, downloaded from `https://game-assets.clashofclans.com/`. This reference holds every league's trophy band and the daily Star Bonus it pays, which is the original's ordinary income for hero equipment ore.

- `catalog.json`: 23 leagues from Unranked to Legendary, each with its trophy band and its own gold, elixir, Dark Elixir, Shiny, Glowy and Starry Ore Star Bonus, plus the stars the bonus costs and how long it takes to come back.

| Source | SHA-256 |
| --- | --- |
| [leagues.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/leagues.csv) | `a057b99d04e1c0c8c7989dfc1f8cd4031b0c9569acea7848153ea876233211af` |
| [globals.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/globals.csv) | `16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087` |

## Reading conventions

- `PlacementLimitLow` and `PlacementLimitHigh` are the league's trophy band. The bands are contiguous — each begins one trophy above the last one's end — and the importer requires that, so every trophy count lands in exactly one league. The last band is open-ended.
- `UseStarBonus` marks a league that pays a bonus at all; every one in this table does, though Unranked pays no ore.
- `CommonOreRewardStarBonus`, `RareOreRewardStarBonus` and `EpicOreRewardStarBonus` are Shiny, Glowy and Starry Ore.
- `DemoteLimit` and `PromoteLimit` describe league movement and are not read here: this game has no league promotion, only the band its trophies fall in.
- `globals.csv` supplies `STAR_BONUS_STAR_COUNT` (five) and `STAR_BONUS_COOLDOWN_MINUTES` (1,440). `ALLOW_STARS_OVERFLOW_IN_STAR_BONUS` is TRUE, so stars past the price are kept.

Reproduce with any Python 3.11+ interpreter; this importer needs no third-party packages:

```sh
python3 scripts/import-native-leagues.py --check
```

## Scope

Only the trophy band and Star Bonus are recorded. League icons, war weights, shields, village guard and the placement and bucket machinery are deliberately absent: this game awards trophies from single-player attacks and has no matchmaking to promote or demote against.
