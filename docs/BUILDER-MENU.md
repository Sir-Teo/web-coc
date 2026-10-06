# Builder menu

Tapping the builder counter at the top of the village ("2/2 Builders") opens the builder menu, as in the original. It lists:

- **Upgrades in progress:** each building under construction or upgrade, each obstacle being cleared and each hero being upgraded, soonest first, with its time left counting down. A building's row selects it and shows its card (with Finish); a hero's opens the Hero Hall.
- **Suggested upgrades:** the five cheapest upgrades and new buildings the village can pay for now.
- **Other upgrades:** everything else it could start, cheapest first, with prices it cannot yet meet in red. Tapping one still shows the building, where its Upgrade offers the missing resources for gems (see [Gem purchases](GEM-PURCHASES.md)).

Buildings of one kind at one level share a row (for instance "Cannon ×2 · Level 2 → 3"). As the wiki's [Builder](https://clashofclans.fandom.com/wiki/Builder) page (revision 625022, read through the MediaWiki API on October 6, 2026) describes, "Clicking on an upgrade shows the location of the structure (or if there are more than one of the same suggested upgrade available, the location of one of said structure; repeatedly clicking on the upgrade cycles between all such structures in this case)": each tap centres the next building of the row and opens its card. A new building's row opens the Shop on its tab, and **More builders** (the original's "+" on the builder interface) opens the Shop where Builder's Huts are sold.

The headings and the hint under the title are the client's strings (`TID_RESEARCHER_MENU_IN_PROGRESS`, `TID_INFOBUBBLE_BUILDER_SUGGESTION`, `TID_INFOBUBBLE_BUILDER_EXTRA_SUGGESTION`, `TID_SPECIAL_FTUE_TUTORIAL_BUILDER_MENU`), imported by `python3 scripts/import-native-builder-menu.py` into `reference/builder-menu/catalog.json` (`--check` verifies it reproduces).

## Choices

The client's tables do not say which upgrades its menu suggests; these rules are this game's:

- Suggested are affordable rows only, cheapest first, at most five; a gem price counts as dearer than any resource price.
- Rows include every building that could start an upgrade once resources or a builder are free: ones at their Town Hall's ceiling, at their last level, or held by a Town Hall merge are left out.
- Walls upgrade at once, without a builder, and are not listed. New traps, Builder's Huts, the Crafting Station and the Helper Hut are built without a builder and are not offered as new buildings (trap upgrades, which take one, are listed); nor are kinds made by merging (their upgrades are).

Every row is at least 44 pixels tall at phone width. Before this menu the counter opened the Shop, or the achievements while a builder was busy.

## Tests

`tests/builder-menu.test.ts` checks the client headings, the work list and its order, suggestions (affordable, cheapest first, at most five), grouping by kind and level, new buildings, and the exclusions. `tests/browser/builder-menu.spec.ts`, at phone size with touch, opens the menu with a Gold Storage upgrading, checks the three headings and row heights, taps the shared Cannon row twice and lands on each Cannon in turn, opens the upgrading storage from its row and the Shop from More builders.
