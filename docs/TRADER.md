# Trader

The Trader's **Weekly Deals** open from his camp beside the village, which arrives at Town Hall 6 (tap his tent or him; see [Village objects](VILLAGE-OBJECTS.md)), or from the magic items list (the Town Hall card's Items button, then Weekly Deals). The title, the "New deals in …!" countdown, "Out of stock", "Storage Full" and the Town Hall messages are the client's own strings (`TID_TRADER_*`).

## Source

The client receives the deals from its server: its tables hold the Trader's texts and the unlock levels in `logic/globals.csv` (`MIN_TH_LEVEL_FOR_TRADER`, `MIN_TH_LEVEL_FOR_TRADER_GEM_OFERS`), not the offers. The pool, prices and weekly quantities therefore come from the wiki's [Trader](https://clashofclans.fandom.com/wiki/Trader) table (revision 624483, read through the MediaWiki API on October 6, 2026), in `src/game/trader.ts`:

| Deal                                | Gems  | Per week |
| ----------------------------------- | ----- | -------- |
| Research, Pet Potion                | 120   | 3        |
| Resource Potion                     | 60    | 3        |
| Builder Potion                      | 285   | 3        |
| Power, Hero Potion                  | 150   | 3        |
| Super Potion                        | 300   | 3        |
| 5 Wall Rings                        | 175   | 3        |
| Shovel of Obstacles, Book of Heroes | 500   | 1        |
| Books of Fighting, Spells, Building | 925   | 1        |
| Runes of Gold, Elixir, Dark Elixir  | 1,000 | 1        |
| 300 Shiny Ore                       | 150   | 5        |
| 60 Glowy Ore                        | 150   | 2        |
| 15 Starry Ore                       | 275   | 1        |
| 10 Glowy Ore (every week)           | Free  | 1        |

## Rules

- **Unlocks.** As the wiki states, the Trader sets up at Town Hall 6 and his Gem offers open at Town Hall 8 (the client's globals hold 5 and 7, one below each). Below Town Hall 8 every deal shows the client's unlock message. Raid Medal deals need the Clan Capital, which this game does not have.
- **Weeks.** Deals change every Tuesday (the client's "Trader Tuesday" notification) at 08:00 UTC; the hour is this game's choice, as no source states it. Each week shows the free 10 Glowy Ore and six paid deals. Which six is this game's own choice, a shuffle seeded by the week, so every village sees the same deals in a week and every deal appears over a few weeks. The live game varies prices from week to week; these use the wiki's general prices.
- **Limits.** A deal can be bought its weekly quantity, then reads "Out of stock" until the next week. A magic item that would exceed its limit, or ore beyond the Blacksmith's storage, reads "Storage Full", as in the client.
- **Saves.** `trader` keeps the week and the purchases made in it; counts above a deal's quantity or unknown deals are rejected.

## Epic equipment

The **Epic Equipment** button opens a separate catalog for heroes in the village. Its hero
tabs show the playable Epic items already offered by the Blacksmith, with their native art,
ownership level, price and a Details link to the existing equipment screen. Purchases use the
existing `buyEpicItem` command: 1,500 gems, a completed Blacksmith, a level 1 unlock, no duplicate
purchases and no purchase during a battle. Buying an item leaves the current loadout intact.

This catalog is separate from weekly quantities and rotation. Opening it or buying equipment
does not change this week's deals or purchase record; ownership is saved in the existing hero
gear record. The pinned [Spiky Ball](../reference/official-wiki/heroes-pets/spiky-ball.md) and
[Magic Mirror](../reference/official-wiki/heroes-pets/magic-mirror.md) references document the
1,500-gem Trader price. This exposes the game's existing permanent equipment catalog rather
than reproducing the live server's changing equipment offers.

Not included: Clan House parts, the Builder Base items and special event weeks.

## Tests

`tests/browser/trader-equipment.spec.ts` buys King and Queen equipment through the Trader,
checks exact gem charges, duplicate protection, unchanged weekly purchases and loadouts,
and saved ownership after reconstruction. It also checks missing Blacksmiths, insufficient
gems, hero availability, item details, native icons and footer bounds at compact breakpoints.

`tests/trader.test.ts` checks the Tuesday 08:00 UTC week boundary, that a week's deals are fixed and the free one comes first, that every deal appears within half a year, the Town Hall 6 and 8 gates, weekly quantities, "Storage Full", gem shortage, the weekly restock and save validation. `tests/browser/magic-items.spec.ts` opens the Weekly Deals from the Town Hall at phone size and claims the free Glowy Ore. `tests/browser/village-objects.spec.ts` opens them from the tent.
