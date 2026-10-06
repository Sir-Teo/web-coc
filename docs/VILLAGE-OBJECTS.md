# Village objects

The Home Village now has two of the client's village objects, the fixed scenery it places beside the field rather than on it:

- **The Trader's camp** from Town Hall 6: his tent, the pots and rug before it, his sign and the Trader himself. Tapping any of them opens [Weekly Deals](TRADER.md), as tapping his tent does in the original.
- **The Super Troop building** (the wiki's "Super Sauna") from Town Hall 11, below the camp. Tapping it opens the army with the Super troops shown, where boosts are bought. It glows (the client's `trader_sauna_active`) while a boost runs.

Both stay home: a battle shows the defender's village without them. Weekly Deals stay reachable from the magic items list and the boosts from the army, so neither needs a tap on the map (or the keyboard map cursor, which stays on the field).

## Source

`python3 scripts/import-native-village-objects.py` (with `scripts/native_art/requirements.txt`) reads the pinned client's `logic/village_objects.csv`, `logic/globals.csv` and `localization/texts.csv` and writes `reference/village-objects/catalog.json` and `public/assets/village-objects-native/`. `--check` verifies both reproduce. Every source is pinned by SHA-256 in `reference/full-client/manifest.json`.

| Object               | Client row            | Export                                         | Tile (client) |
| -------------------- | --------------------- | ---------------------------------------------- | ------------- |
| Trader's tent        | `TraderBuilding`      | `trader_tent_01`                               | −4.5, 28.5    |
| Pots                 | `TraderDeco1`         | `trader_pot_01`                                | −2, 27        |
| Rug                  | `TraderDeco2`         | `trader_rug_01`                                | −2.5, 29      |
| Sign                 | `TraderHiddenDeco`    | `trader_sign_01`                               | −4, 27.75     |
| Trader               | `TraderCharacter`     | `trader_idle1_2`                               | −1.6, 30      |
| Super Troop building | `SuperTroopsBuilding` | `trader_sauna_inactive`, `trader_sauna_active` | −4, 33        |

The tiles are the rows' `TileX100`/`TileY100` in hundredths. The client's field starts at tile 0 and this game's at 2 (`BUILD_MIN`), so each stands two tiles further along both axes here: just past the field's upper-left edge, where the forest begins. The art is each export at frame 0, drawn at the native buildings' 1.2 scale with its registration point on that tile.

The arrival levels are one above the client's `MIN_TH_LEVEL_FOR_TRADER` (5) and `MIN_TH_LEVEL_FOR_SUPER_LICENCES` (10), which hold the level below, as the Trader's Gem offers do. The wiki's [Trader](https://clashofclans.fandom.com/wiki/Trader) page (revision 624483) says he "starts appearing in the Home Village once the player has upgraded their Town Hall to level 6" and "sets up shop to the left of the Clan Path"; its [Super Sauna](https://clashofclans.fandom.com/wiki/Super_Sauna) page (revision 624484, both read through the MediaWiki API on October 6, 2026) says the building "automatically appears in the Home Village once the Town Hall is upgraded to level 11, in between the Trader and the Loot Cart". Their names in `catalog.json` are the client's feature titles ("Trader Shop", "Super Troops"), as the rows reuse the Clan Games and Loot Cart texts.

## Ground

The client gives village objects no footprint. Here each covers a square as many tiles across as its art is wide (64 world pixels a tile), centred on its tile and widened to whole tiles. Only the pots, rug and Trader reach the map: column 0, rows 28 to 32 of the outer edge. Decorations and moved obstacles cannot be placed there, and regrowing trees and the Gem Box keep their one-tile buffer from it, from the Town Hall that brings each object.

## Not included

- The Trader's idle clip (777 frames at 24 fps, in which he shows the item in his pocket) and the troops that walk into the sauna (`trader_sauna_active_enter`). Both draw as still frames.
- The sauna's `sauna_anticipation` state, a pile of barrels; no source says when it shows.
- The other village objects: the Clan Gate, the Clan Games grounds, the Loot Cart, the Forge, the boat to the Builder Base and the Balloon Bus, whose features this game does not have.

## Tests

`tests/village-objects.test.ts` checks the catalog against the client rows and the Trader's Town Hall, the arrival levels, that every footprint stays off the building area, and that decorations and regrowth avoid the camp's edge tiles only once it arrives. `tests/browser/village-objects.spec.ts`, at phone size with touch, raises a village to Town Hall 6, taps the tent and finds Weekly Deals; then at Town Hall 11 it starts a boost, sees the sauna glow, taps it and finds the Super troops in the army.
