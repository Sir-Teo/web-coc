# Gem purchases

When a price is short, the village now offers the missing Gold, Elixir or Dark Elixir for gems, as the original does: "You need more Elixir · Buy the missing 5,000 Elixir?" with the gem price on the button. Buying pays the gems, tops the resource up to the price and goes ahead with what was refused. Speed-ups (finishing a build, upgrade, research, hero, pet or obstacle clearing) now cost the client's own prices too.

## Source

`python3 scripts/import-native-gem-costs.py` reads the pinned client's `logic/globals.csv` and `localization/texts.csv` and writes `reference/gem-costs/catalog.json`; `--check` verifies it reproduces. Every source is pinned by SHA-256 in `reference/full-client/manifest.json`.

| Prices           | Client rows                               | Points (amount → gems)                                                              |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Time (speed-ups) | `SPEED_UP_DIAMOND_COST_1_MIN` … `_1_WEEK` | 1 minute → 1, 1 hour → 20, 24 hours → 260, 1 week → 1,000                           |
| Gold and Elixir  | `RESOURCE_DIAMOND_COST_100` … `_10000000` | 100 → 1, 1,000 → 5, 10,000 → 20, 100,000 → 100, 1,000,000 → 250, 10,000,000 → 2,000 |
| Dark Elixir      | `DARK_ELIXIR_DIAMOND_COST_1` … `_100000`  | 1 → 1, 10 → 5, 100 → 20, 1,000 → 100, 10,000 → 250, 100,000 → 2,000                 |

Between two points the price follows a straight line, rounded to the nearest gem; below the first point it is the first point's price, and past the last point the last line continues. That is how [Game Developer's analysis of the game's speed-up prices](https://www.gamedeveloper.com/business/clash-of-clans-time-monetization-formulas-demistifyed) describes them ("a series of linear line segments", with 4 hours coming to 51 gems), and the resource rows have the same shape. The dialog's title, line and buttons are the client's `TID_BUY_MISSING_RESOURCES_HEADER` ("You need more <resource>"), `TID_BUY_MISSING_RESOURCES_TEXT` ("Buy the missing <count> <resource>?"), `TID_POPUP_NOT_ENOUGH_DIAMONDS_TITLE` and `TID_BUTTON_CANCEL`.

Speed-ups previously used this game's own curve, which rounded up and charged 130 gems a day past the first day. With the client's week point, two days now cost 383 gems instead of 390 and four hours 51 instead of 52.

## Rules

- **Where.** Every price that refuses for want of Gold, Elixir or Dark Elixir offers the purchase: Shop buildings and decorations, building, wall, Town Hall weapon, Guardian, Crafted Defense, merge, gear-up and supercharge upgrades, Laboratory and pet research, hero upgrades, Super Troop boosts and clearing obstacles.
- **Storages.** The offer stands only while the whole price fits the village's storages; a larger price only says what it needs. Gem prices (the gem decorations) never offer.
- **Price.** The offer is priced when taken, from what is missing then, so resources collected meanwhile lower it. Buying takes the gems, adds exactly the missing amount and retries the action. Without enough gems the button stays disabled and the client's "Not enough Gems" shows.
- **Phone input.** A tap on a Shop tile's price button or on an upgrade offers the purchase. Pressing a Shop tile to drag it out (or to scroll the sheet) never does; it only says what is missing. The dialog's buttons are at least 44 pixels tall.
- **Battles.** Nothing is offered during a battle.

Not included: the original's two-resource offer (`TID_BUY_MISSING_RESOURCES_TEXT_TWO`), which no single price here needs, and the Shop's Treasure tab that sells resource packs and storage fills.

## Tests

`tests/gem-purchases.test.ts` checks the time and resource prices at and between the client's points, the offer for a building upgrade, its pricing when taken, declining it, a short gem balance, the storage limit, gem prices, Shop drags, a Shop building put in hand after buying and a wall upgrade. `tests/browser/gem-purchases.spec.ts`, at phone size with touch, taps an unaffordable Laboratory, checks the client's wording and gem price, buys it and gets the building in hand; then declines an offer it cannot afford.
