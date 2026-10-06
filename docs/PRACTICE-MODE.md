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

## The guide

The wiki says: "At the first attempt at each Practice Mode level, a player will be given a tutorial which is a step-by-step guide to performing the attack; players will be told when and where to deploy each unit, or when to perform a certain action such as activating a hero ability. This tutorial can be skipped and subsequently re-triggered again if the player so desires."

The client stores each level's guide as the record's `DeploySteps` column, in order. These are names of rows in `csv/deploy_steps.csv`, which the importer adds to the catalog with each step's words. All 13 fielded levels have a guide, 253 steps in all. Giant Smash has seven:

1. "Deploy a Giant to shield the Wall Breakers." (one Giant, on the marked spot)
2. Half a second's wait.
3. "Quickly destroy Walls before the Giant dies." (two Wall Breakers on their spot, the battle slowed to a tenth)
4. A five-second wait.
5. "Now deploy Giants to destroy all defenses." (twelve Giants)
6. A five-second wait.
7. "After Mortar is destroyed, deploy Goblins to help clean up." (shown for 25 seconds)

A level with no star yet starts with its guide. On a level with a star, the scout page offers **Guided attack** to take it again. A banner under the battle's top bar shows the step's words in the client's colours, with **Skip guide**, and the guide follows the step's flags:

- **Units.** A deploy step puts its unit in hand. With `ForceType` it refuses any other unit, and while a waiting step runs it refuses every deploy ("Wait for the guide's next step."). With `ForceLocation` it refuses a tap outside its circle. With `ForceExactLocation` the unit lands on the spot itself.
- **The battle's pace.** A step with `PauseGame` holds the battle until it is met: frozen, or at `SlowdownPercentage` of its speed (the Wall Breakers' 10%). A gold ring marks its spot, and the camera brings a new step's spot into view.
- **Waits.** A wait runs its `Duration` in battle time, also during scouting, so opening words like Hot Stuff's Air Sweeper note play before the first deploy. A `WaitUntilDestroyed` step waits for the building with its `ObjectGID`; `ShowObject` rings the building it points out.
- **Abilities.** A `UseAbility` step waits for the hero's ability.
- **Moving on.** A step ends once its units are down, or when none of its unit is left to deploy. An ability step also ends when its hero cannot use the ability. When the last step ends, the player plays on freely.

An `ObjectGID` is not a row index: it is the instance id the level file gives the building (`500000200` in Hog Rush is a level 7 Cannon at 35, 20), resolved by the importer to the building's tile. A step's spot is the client's tile plus `BUILD_MIN`, as for the buildings, and its radius is `Radius` in hundredths of a tile.

The guide sits beside the battle, not in its replay setup. A frozen moment is simply not simulated, and a slowed one is recorded at its slowed length, so a recording holds exactly the time fought and replays without the guide.

## Choices

- **Spots off the board.** Some levels use the client's larger board. Of the 75 troop and hero spots, 10 fall past this game's 48 tiles (Bowling with Bats' Archer Queen at the client's 20, 47) and 9 inside its red boundary, which keeps 1.5 tiles round each building. A troop or hero step's spot becomes the deployable tile nearest the client's. A spell's spot is clamped to the board.
- **Waits that cannot end.** The original's scripted attack always brings a step's building down, but a player's may not. A `WaitUntilDestroyed` step therefore also ends when no attacker is alive or after 60 battle seconds (`GUIDE_WAIT_LIMIT`). Without that, a step refusing deploys could hold the player until they skip.
- **Ability timing.** `KingHealthLow` asks for the King's ability straight away; the client presumably waits for his health to drop.
- **The ending question.** The client's closing question ("You did perfectly! Would you like to practice without deployment steps?") is not asked. Later attacks are free, and the scout page's Guided attack brings the guide back.

- **Clan Castle units.** Four levels send units in the Clan Castle: Bowling with Bats, Electro Surgery, Lava & More Loons and Bowling with Witches. This game's attacks have no Clan Castle to release them (siege machines carry nothing), so they join the army's tray. A kind's level is the army's own, ahead of the castle's (Bowling with Bats sends P.E.K.K.A 6 in the army and P.E.K.K.A 8 in the castle).
- **Withheld levels.** The six withheld Challenges stay out, for the reasons in [CAMPAIGN-RULES.md](CAMPAIGN-RULES.md). Their armies are in the catalog all the same.

## Tests

`tests/practice-guide.test.ts` checks:

- Giant Smash's seven steps and their flags;
- the guide itself on Giant Smash: the unit in hand, refusals of the wrong unit, of a tap outside the circle and of a deploy during a wait, the exact spot, the slowed and frozen battle, and Skip;
- every fielded level's guide played through to its end;
- that first attempts only are guided, unless asked;
- that a guided battle's recording holds only the time fought.

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
- attacks under the guide, checking its banner and Skip (44 pixels), the Giant in hand and a tap in the ring landing on the spot;
- skips the guide, and checks the tray and that deploying leaves the camps alone;
- confirms the level is locked at Town Hall 3.
