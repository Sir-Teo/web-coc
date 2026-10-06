# Decorations

The Home Village Shop now has the client's **Decorations** tab. Decorations are purely ornamental: they never fight, produce, need a builder or take build time, and they stay home when the village goes to battle.

## Source

`python3 scripts/import-native-decorations.py` (with `scripts/native_art/requirements.txt`) reads the pinned client's `logic/decos.csv` and `localization/texts.csv` and writes `reference/decorations/catalog.json` and `public/assets/decorations-native/`. `--check` verifies both reproduce. Every source is pinned by SHA-256 in `reference/full-client/manifest.json`.

It imports the twelve decorations the Shop sells for resources, the rows the [wiki's Home Village decorations page](https://clashofclans.fandom.com/wiki/Decorations/Home_Village) (revision 625323, read through the MediaWiki API on October 6, 2026) lists as permanently available. Price, limit, level and footprint come from the client rows (`BuildResource`, `BuildCost`, `MaxCount`, `RequiredExpLevel`, `Width`) and match the wiki's table:

| Decoration                                     | Price          | Limit  | Experience level |
| ---------------------------------------------- | -------------- | ------ | ---------------- |
| Torch                                          | 500 Elixir     | 4      | 1                |
| White Flag                                     | 5,000 Elixir   | 1      | 5                |
| Cornflower Bed, Sunflower Bed                  | 2,500 Elixir   | 4 each | 8                |
| Weather Vane                                   | 10,000 Elixir  | 1      | 10               |
| Rally Flag, Point Flag                         | 15,000 Elixir  | 1 each | 12               |
| Ancient Skull                                  | 500,000 Gold   | 1      | 30               |
| Statue of P.E.K.K.A                            | 1,000,000 Gold | 1      | 75               |
| Pirate Flag, Mighty Statue, Mighty Hero Statue | 500 Gems       | 1 each | 1                |

All twelve are 2×2. The tab's name, the Stash button and its confirmation ("Stash Decoration?" / "<item> will be moved to the Shop and can be placed again at no cost.") are the client's own strings (`TID_SHOP_CATEGORY_DECOS`, `TID_BUTTON_STORE_DECO`, `TID_POPUP_STORE_DECORATION`, `TID_POPUP_TEXT_STORE_DECORATION`).

Left out: event, pass and purchase rewards (`NotInShop`), the national flags (removed from the game on June 27, 2022), the League-Medal statues (no Clan War Leagues here), the Crafted Statue and Builder Bust (bought with Sparky Stones, which this game does not have) and the free Town Hall 17 Eagle Monument (its art uses masks the compositor does not draw).

## Rules

- **Buying.** A tile shows owned/limit, counting placed and stashed decorations together; one below its experience level shows the level it needs. Tapping it picks the decoration up; the tap that places it pays.
- **Placement.** Anywhere on the map that is clear of buildings, obstacles and other decorations, including the two-tile edge outside the building area, which (as the wiki says) only obstacles and decorations may use. Buildings, edit-mode drags and wall-row moves cannot be put on a decoration.
- **Move and Stash.** Selecting a decoration offers Move and the client's Stash. A stashed decoration returns to the Shop, where its tile reads "n in Shop" and places it again at no cost, even below its level or without the resources to buy another.
- **Layouts.** Restoring a saved layout, undo and redo place buildings where the layout says; any decoration under them is stashed and the toast says so.
- **Obstacles.** Regrowing trees and the Gem Box keep their one-tile buffer from decorations, as from buildings.
- **Saves.** `decorations` (id, kind, tile) and `stashedDecorations` (count by kind) are saved with the village. A save is rejected if a kind is unknown, a decoration leaves the map or overlaps a building, obstacle or another decoration, a stash count is not a positive integer, or a kind is owned past its limit. Only current-grid saves may hold decorations.

## Art

Each portrait draws the row's `ExportNameBase` (plinth, flagpole foot or patch of ground) under its `ExportName` at frame 0, at the native buildings' 1.2 scale. The client's ground pieces (`statue_base`, `deco_flowerbox1_base`, …) centre about 40 source pixels below the export's origin, so that point stands on the footprint's centre (`DECORATION_GROUND`). A placed kind's portrait loads at boot; a kind bought later loads when it first draws. The placement ghost turns red over occupied ground and the footprint shows under it, as for buildings.

The client animates the Torch flame, the waving White and Pirate Flags and the turning Weather Vane; these draw as still portraits. Decorations cannot be dragged in edit mode yet; use Move.

## Tests

`tests/decorations.test.ts` checks the Shop rows, the client strings and the portrait sizes; buying, edge placement, overlaps, limits and experience levels; moving and stashing with free re-placement; save validation; the starting obstacles an older save is given kept off its decorations; regrowth around decorations; layouts stashing covered decorations; and wall rows kept off them. `tests/browser/decorations.spec.ts` buys a Torch at phone size, places it on the edge with a tap, waits for its portrait, stashes it through the confirmation, places it again for free and finds it after a reload.

The other browser specs that touch the Shop, placement, obstacles, layouts, wall moves and the phone HUD pass with this change, run on one worker, except `camp-progression:10`, `native-grid:4`, `wall-movement:66` and `game.spec` 48, 162 and 268, which fail with the same assertions on the commit before it.
