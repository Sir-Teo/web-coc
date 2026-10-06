# Magic items

The Town Hall card has an **Items** button that opens the village's magic items. Each item shows what it does, how many are held out of its limit, its use, and a Sell button that cashes one in for gems.

## Source

`python3 scripts/import-native-magic-items.py` (with `scripts/native_art/requirements.txt`) reads the pinned client's `logic/boosters.csv`, the potions' durations and rates in `logic/globals.csv`, the Wall row of `logic/buildings.csv` and `localization/texts.csv`. It writes `reference/magic-items/catalog.json` and the items' icons from `sc/ui.sc` to `public/assets/magic-items-native/`; `--check` verifies both reproduce. Every source is pinned by SHA-256 in `reference/full-client/manifest.json`.

It imports the 21 Home Village items. Limits (`MaxItems`) and sell prices (`DiamondValue`) match the wiki's [Magic Items](https://clashofclans.fandom.com/wiki/Magic_Items) table (revision 619750) and [list](https://clashofclans.fandom.com/wiki/Magic_Items/List) (revision 625211), both read through the MediaWiki API on October 6, 2026:

| Items                                                           | Limit  | Sells for |
| --------------------------------------------------------------- | ------ | --------- |
| Books of Fighting, Building, Spells, Heroes and Everything      | 1 each | 50 gems   |
| Hammers of Fighting, Building, Spells and Heroes                | 1 each | 100 gems  |
| Runes of Gold, Elixir and Dark Elixir                           | 1 each | 50 gems   |
| Builder, Research, Pet, Resource, Power, Hero and Super Potions | 5 each | 10 gems   |
| Wall Ring                                                       | 25     | 5 gems    |
| Shovel of Obstacles                                             | 5      | 50 gems   |

Left out: the Builder Base items (Clock Tower Potion, Builder Star Jar, Runes of Builder Gold and Builder Elixir), as that village is not modelled, and the Training Potion, which the live game removed in March 2025 when training became instant, as it is here.

## Rules

- **Limits.** A reward that does not fit is sold for its gems, as the client sells rewards that cannot fit. Hero's Journey says so in its notice. Villages saved before the limits may keep a larger count (up to 99), as the client let older surplus stay.
- **Books** finish a running upgrade at once: the Book of Building any building upgrade or construction (gear-ups and modules included), the Book of Fighting troop research, the Book of Spells spell research, the Book of Heroes a hero's or pet's upgrade. The Book of Everything finishes any of them, but only when no other held book can. Buttons appear on the building's card, in the Laboratory, the Hero Hall and the Pet House, and in the item list for every upgrade a book can finish.
- **Hammers** perform the next upgrade at once and free. Every other rule still holds: a free builder for buildings and heroes, the Town Hall, Laboratory and Pet House levels, and no upgrade of that target already running. The Hammer of Fighting and Hammer of Spells work while the Laboratory researches something else. Walls take Wall Rings, never Hammers. Buttons appear on the building's card, on each Laboratory card, and in the Hero Hall and Pet House.
- **Wall Ring.** A wall's next level takes one ring per million of its cost, rounded up: the client's `StartUpgradeBoosterCostDivisor` of 1,000,000. That is one ring up to level 12, two for levels 13 and 14, then 3, 4, 5, 7 and 10 for levels 15 to 19. The wiki gives 8 rings for level 18; the pinned client's 7,000,000 cost gives 7. Like gold or elixir, rings need a free builder. A single selected wall shows a Ring button.
- **Runes** fill their resource's storages to capacity; they cannot be used on full storages or without one.
- **Potions** run for the client's durations at the client's rates: Builder Potion 10× for 1 hour (building upgrades, construction and hero upgrades), Research Potion 24× for 1 hour, Pet Potion 24× for 1 hour, Resource Potion 2× collector and drill production for 1 day. Another potion of a running kind extends it instead of stacking, as the wiki describes. The extra speed adds to the Helpers' (the Builder's Apprentice and Lab Assistant), as the client's rates stack additively, and it applies offline as well: a timer finishes no sooner than its remaining work at the boosted rate allows.
- **Super Potion** boosts a troop into its Super Troop for the same three days as Dark Elixir does, with the same rules. Super Troop tiles in the army show it.

- **Power Potion** and **Hero Potion** last one hour. While one runs, every battle starts with troops, spells and siege machines (Power) or heroes and pets (Hero) at the highest level the Town Hall allows: the level its fully upgraded Laboratory researches, or its fully upgraded Hero Hall and Pet House allow. A Super Troop follows its original. Home levels, research and upgrade costs do not change. The battle records its levels, so replays match. As in the client, a potion that would raise nothing cannot be drunk, nor a Hero Potion without a hero. Army cards show the boosted level in purple and the army drawer and Hero Hall show the time left.
- **Shovel of Obstacles** makes one obstacle movable for good: its card offers Shovel, then Move, and it can be put anywhere clear on the map, the outer edge included, like a decoration. It can still be cleared as before.

Items come from Hero's Journey and the [Trader](TRADER.md)'s weekly Gem deals; there are no Clan Games or Season Challenges.

## Tests

`tests/magic-items.test.ts` checks the 21 rows against the wiki's limits and sell prices, the potions' rates, the client's descriptions and the icon sizes; overflow sales and selling; Runes on room, full and missing storages; which Book finishes which upgrade and when the Book of Everything stands in; Hammers keeping the builder rule, refusing walls and running research, and spending nothing; ring counts and their builder rule; Builder Potion timers finishing at the boosted rate offline; potions extending; doubled production; battles fielding Town Hall maximum troop, spell and King levels under the Power and Hero Potions, and a Hero Potion kept without heroes; a shoveled obstacle moving onto the edge but not onto other things; and save validation of items and boosts. `tests/browser/magic-items.spec.ts` uses a Rune, sells a Wall Ring and drinks a Builder Potion from the Town Hall's item list at phone size (44-pixel buttons), finishes and then raises a Gold Mine with a Book and a Hammer from its card, and shovels an obstacle from its card and moves it with a tap.

The browser specs around heroes, research, walls, the Helper Hut and the phone HUD (`army-unlocks`, `helper-hut`, `heroes-journey`, `heroes`, `hud-layout`, `research-layout`, `spell-progression`, `touch-targets`, `troop-progression`, `wall-progression`, `wall-upgrades`, `hero-roster`) pass on one worker except cases that fail with the same assertions on the commit before: `army-unlocks:9`, both `hero-roster:262` lineups, `heroes:27`, the 568 px cases of `research-layout:36` and `spell-progression:32`, and `wall-upgrades` 36, 116 and 230.

With the Power and Hero Potions and the Shovel, the army, replay, Hero Hall and phone HUD specs (`army-experience`, `army-roster`, `army-touch`, `replay-tools`, `replay`, `heroes`, `touch-targets`, `hud-layout`, `magic-items`, `decorations`) and `obstacles` pass on one worker except cases that fail identically on the commit before: `army-experience` 11 and 138, both `replay-tools:61` sizes, the phone case of `replay:11`, and `heroes:27`.
