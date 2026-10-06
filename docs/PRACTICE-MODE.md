# Practice Mode

The original's Practice Mode is a set of single-player villages for Town Halls 4 to 13. Each one teaches an attack strategy and comes with its own army. The wiki's [Practice Mode](https://clashofclans.fandom.com/wiki/Practice_Mode) page (revision 616129, read through the MediaWiki API on October 6, 2026) describes it:

- "The player does not need to train any troops for each level; instead an army will be given for each level. Any heroes provided for the practice level do not affect your own heroes in any way."
- "No Trophies are won or lost, and there is also no time limit. Every level contains a set amount of loot that can be won once, just like in the Single Player Campaign."
- "Players can play Practice levels relevant to Town Halls up their Town Hall level."

Its villages were already campaign stages 91 to 103: 13 of the client's 19, the other six withheld as [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md) explains. They were attacked with the player's own army and were open from the start. They now play as Practice levels.

## Source

`python3 scripts/import-native-practice.py` reads the 19 `TUTORIAL` rows named `CHALLENGE_TH<level>_<army>` in `logic/npcs.csv` into `reference/practice/catalog.json`; `--check` verifies the catalog reproduces. For each level the catalog holds:

- its name, its Town Hall (`TutorialUnlockTHLevel`) and its loot;
- its campaign stage, or none for a withheld one;
- its army, from the record's continuation rows. `FixedArmyUnitType`, `FixedArmyUnitLevel` and `FixedArmyUnitCountOrStage` give each troop, siege machine, spell or hero; `FixedArmyUnitAlliance` marks the Clan Castle's units.

It also holds three client strings: "Practice" (`TID_TRAINING_LEVELS`), its description (`TID_TRAINING_LEVELS_DESCRIPTION`) and "Practice mode unlocks at Town Hall 4" (`TID_PRACTICE_MODE_UNLOCKS_LATER`).

For example, Giant Smash (Town Hall 4) brings 13 Giants, 2 Wall Breakers and 11 Goblins, all level 2, the army the wiki lists. Hot Stuff (Town Hall 7) brings 10 level 2 Dragons, 6 level 4 Lightning Spells and a level 5 Barbarian King.

`src/game/practice-mode.ts` maps the names to this game's troops, spells and heroes.

## Playing a level

- **Town Hall.** A level opens at its Town Hall. Below it, the campaign card reads "Opens at Town Hall N." and its Attack button is locked; attacking anyway is refused with the same message.
- **Army.** The battle carries the level's army, at the level's own troop and spell levels and with its heroes, instead of the camps'. Deploying spends the level's units, and a recalled troop returns to the level's tray. The player's army, spells and Last army are untouched, and no army needs to be trained to attack.
- **Heroes.** A hero comes at the level the row names, with its two default items at level 1 (the Barbarian King's Barbarian Puppet and Rage Vial, as the wiki shows). No row in this client sets a pet or other gear.
- **Results.** Loot, stars and the "no time limit, no trophies" rules are the campaign's own, so each level's loot is won once and its stars stay on the map.
- **Cards.** The campaign card is labelled "PRACTICE" and says what the level brings ("Fought with its own army: 26 troops. Yours stays home."). The scout page lists the army, troop by troop, under "Army provided". The section picker calls the part of the list "Practice".
- **Starter Challenges.** Their two Practice tasks ("Win 3x/9x total Stars from Practice Levels") now count the best stars on each level (see [STARTER-CHALLENGES.md](STARTER-CHALLENGES.md)).

A battle fought this way is marked `fixedArmy` in its replay setup. Its army and levels are recorded as fought, so the replay plays back the level's army. A replay may carry `fixedArmy` only for a campaign village, not with `practice` (your own village) or a ladder match.

## Choices

- **Clan Castle units.** Four levels send units in the Clan Castle: Bowling with Bats, Electro Surgery, Lava & More Loons and Bowling with Witches. This game's attacks have no Clan Castle to release them (siege machines carry nothing), so they join the army's tray. A kind's level is the army's own, ahead of the castle's (Bowling with Bats sends P.E.K.K.A 6 in the army and P.E.K.K.A 8 in the castle).
- **Tutorial.** The step-by-step tutorial on a level's first attempt (`DeploySteps`) is not imported. Its steps name deploy points that are not in the client tables read here.
- **Withheld levels.** The six withheld Challenges stay out, for the reasons in [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md). Their armies are in the catalog all the same.

## Tests

`tests/practice-mode.test.ts` checks:

- the 19 levels and the 13 fielded as stages 91 to 103, each with a known army;
- Giant Smash's, Hot Stuff's and Bowling with Bats' armies, levels, heroes and Clan Castle units;
- the Town Hall gate;
- a battle fought with the level's army while the camps' army and Last army stay put, with loot and stars recorded;
- the replay's setup and validation;
- the Starter Challenges' practice stars.

`tests/browser/practice-mode.spec.ts`, at phone size with touch:

- opens the campaign with no army trained;
- finds Giant Smash labelled "PRACTICE" and opens its scout page with the army provided;
- attacks, and checks the tray and that deploying leaves the camps alone;
- confirms the level is locked at Town Hall 3.
