# Army recipes (Cookbook)

The Quick armies window has a second tab, **Cookbook**, as the original's army screen does. It lists the ready-made Army Recipes for the village's Town Hall, and **Use army** makes one the active army in a single tap. The wiki's [Version History/2025](https://clashofclans.fandom.com/wiki/Version_History/2025) page (revision 624584, read through the MediaWiki API on October 6, 2026) describes the Cookbook this way:

- "Starter Armies: Simple Army Recipe suggestions catered to your current Town Hall level."
- "Featured/ Creator Armies: Time-limited Army Recipe suggestions based on an on-going Event or hand-crafted by a Creator."
- "Featured and Creator Army Recipes will start appearing at Town Hall 10."

## Source

The client ships the Featured and Creator recipes in `logic/cookbook_armies.csv`. There are 37 rows, for Town Halls 10 to 17:

- **Hot Hog Summer** (by Hog Rider) and **Army of the Month** (by Dragon Rider), one per Town Hall;
- **Miner-a-rama!** and **Wicked Witches**, one per Town Hall;
- Sir Moose's and CorruptYT's creator armies: **Furnace Quake**, **Rooted Yetis**, **Root Titans**, **Root Valks** and **Mass Dragons**.

Each row's `ArmyCode` is the code a shared army link carries:

- `h` lists heroes. Each is `<hero>[m<mode>][p<pet>][e<item>_<item>]`, indexed by record order in `heroes.csv`, `pets.csv` and `character_items.csv`.
- `u` lists troops and siege machines; `s` lists spells.
- `i` and `d` list the Clan Castle's troops and spells.

A troop or spell entry is `<count>x<id>`. The id is the record's `GlobalID` less its table's base: 4000000 for `characters.csv`, 26000000 for `spells.csv`. As a check, Hot Hog Summer at Town Hall 10 reads `u16x11-16x12-8x6`: 16 Hog Riders, 16 Valkyries and 8 Wizards, the 240 spaces of a Town Hall 10 army.

`python3 scripts/import-native-army-recipes.py` decodes every row into client names in `reference/army-recipes/catalog.json`; `--check` verifies the catalog reproduces. The catalog also carries the Cookbook's own strings:

| Use                                     | String                                                                                                | Client ID                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Tab name                                | "Cookbook"                                                                                            | `TID_TRAINING_TAB_TITLE_COMMUNITY_PRESETS` |
| Subtitle                                | "Here you can view and use pre-made recipe suggestions tailor-made for your Town Hall level."         | `TID_INFO_TOOLTIP_COMMUNITY_RECIPES`       |
| Creator line                            | "by <creator>"                                                                                        | `TID_CREATOR_ARMY_NAME`                    |
| Note on heroes the village cannot match | "Unavailable Heroes, Pets, or Equipment will be swapped or removed to make this Recipe battle-ready." | `TID_POPUP_CONFIRM_AUTOFIX_RECIPE_TEXT`    |
| Message after Use                       | "Recipe <army> set as active army!"                                                                   | `TID_ARMY_PRESET_LOADED`                   |
| Refusal                                 | "You cannot train this army"                                                                          | `TID_COPY_ARMY_CANNOT_TRAIN`               |
| Save button                             | "Save"                                                                                                | `TID_BUTTON_COOKBOOK_RECIPE_SAVE`          |

`src/game/army-recipes.ts` maps the names to this game's troops, spells, heroes, items and pets.

## Using a recipe

A recipe works like a Quick army, through the same rules:

- Its troops, siege machines and spells replace the army, but only if the whole army can be trained here. That means enough troop and spell housing, unlocked troops and spells, and an active boost for any Super Troop.
- If it cannot be trained, the card's button reads "You cannot train this army" and the reason shows beneath. The army is left as it was.
- Heroes, items and pets go where the village has them. A missing hero, item, pet, Blacksmith or Pet House is listed under the client's note, both on the card and in the message after Use.

Each card shows:

- the recipe's housing and its composition;
- its heroes with their items and pets;
- a **Watch guide** link to the creator's video, when the row has one.

## Saving a recipe

The original's **Save** keeps a Cookbook recipe among the player's own recipes. Here it saves the recipe as a Quick army, with its name, army, spells, heroes, items and pets, in the first empty slot.

When all three slots are full, the card shows "Save over 1 2 3" instead. Each slot button is 44 pixels square, and Quick armies' **Undo save** restores the army it replaced.

## Choices

- **Which recipes appear.** In the original a server calendar picks which rows are live (`EnabledByCalendar`). This game has no server, so the Cookbook shows every row whose Town Hall range includes the village's.
- **Starter Armies.** Town Halls 4 to 9 have names in `texts.csv` (`TID_STARTERARMY_*`) but no rows, because their armies come from the server. Below Town Hall 10 the Cookbook says when its recipes begin.
- **Clan Castle.** Each recipe's Clan Castle troops and spells sit in a folded "Clan Castle · not used here" section. This game has no clan to send them.
- **Warden mode.** Some codes give the Grand Warden a mode (`m1`). The importer records it but the game does not apply it, since this game's Warden has no mode switch.
- **Mass Dragons.** The client's Town Hall 11 row carries the same code as Root Titans (Town Hall 16), so a Town Hall 11 village cannot train it. It stays as the client has it.

Every button and the Clan Castle toggle are at least 44 pixels tall at phone width, and the window does not scroll sideways.

## Tests

`tests/army-recipes.test.ts` checks:

- that all 37 rows decode, and that the Town Hall ranges and client strings are right;
- Hot Hog Summer's army, spells, heroes and Clan Castle against its code;
- the pets on Town Hall 14's heroes;
- Use, which replaces the army and names the missing heroes;
- refusal for lack of housing and for another Town Hall's recipe.
- saving into the first empty slot, refusal when every slot is full, saving over a chosen slot, and undo. The saved state validates, and the army loads later from its slot.

`tests/browser/army-recipes.spec.ts`, at phone size with touch:

- opens the Cookbook from Quick armies;
- checks Town Hall 10's four recipes and the creator line, the note, the guide link and the 44-pixel targets;
- uses Hot Hog Summer and checks the army and the message;
- saves three recipes, checks the 44-pixel "Save over" buttons once the slots are full, and saves over slot 2;
- returns to the Quick armies tab and finds the saved recipes and the undo button;
- checks the message shown below Town Hall 10.
