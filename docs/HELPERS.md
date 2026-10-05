# Helper Hut

One 3×3 building per village from Town Hall 9. It costs 1,000,000 Elixir and is finished on placement, without a builder; it has one level, 500 hitpoints and no upgrades. The art is the client's own (`villager_house_lvl1_active` on `fireplace_lvl1_base`), drawn at source scale and anchored where its four tent poles meet the ground.

Its helpers are bought with gems in the hut's panel and work on the village's running jobs. The Builder's Apprentice and the Lab Assistant are in; the Alchemist and Prospector, which convert resources, are not.

## Source

`python3 scripts/import-native-helpers.py` builds `reference/helpers/catalog.json` from the pinned client's `villager_apprentices.csv`, `globals.csv` and `texts.csv` (see [reference/helpers/README.md](../reference/helpers/README.md)). The building is `Helper Hut` in `buildings.csv`; `townhall_levels.csv` counts one from Town Hall 9. Labels in the panel ("Ready to work!", "Time left", "Available in", "Ongoing upgrades:", "Keep assigned until upgrade is complete", "Stop recurrence", "Total saved time") are the client's `TID_VILLAGER_*` strings.

| Helper | Levels | Town Hall per level | Working speed | Gems per level |
| --- | --- | --- | --- | --- |
| Builder's Apprentice | 8 | 10, 10, 11, 11, 12, 12, 13, 14 | ×1 to ×8 | 500, 500, 750, 750, 1,000, 1,000, 1,000, 1,000 |
| Lab Assistant | 12 | 9, 10, 10, 11, 12, 12, 13, 13, 14, 14, 15, 16 | ×1 to ×12 | free, 500, 500, 500, 750 ×4, 1,000 ×4 |

## Rules

- **Work.** A rested helper takes one running job: the Builder's Apprentice any timed building construction or upgrade (Crafting Station modules included) or hero upgrade, the Lab Assistant the Laboratory's current research (not the Pet House). For its level's `BoostTimeSeconds` (3,600 at every level) the job's timer runs `BoostMultiplier` extra seconds each second, so a Level 4 Apprentice takes four hours off an upgrade in one hour. A job that finishes inside the hour ends the work.
- **Rest.** `VILLAGERS_COOLDOWN_TIME` is 82,800 seconds after the work hour, so a helper can be assigned once every 24 hours, as the client's help text says ("once a day, when he is fully rested").
- **Recurring jobs.** With "Keep assigned until upgrade is complete" the helper returns to the same job each time it has rested, until the job completes or the player stops the recurrence.
- **Offline.** Work and recurring days during an absence are applied exactly as live ticks would apply them (`advanceHelper` in `src/game/helpers.ts`): a job completes at the moment it would have, not at the next tick.
- **Levels.** Each level is bought with gems at its Town Hall; the first Lab Assistant level is free. A helper cannot be upgraded while it works (`TID_LAB_ASSISTANT_CANT_UPGRADE_WORKING`); resting is fine. A purchase is instant.
- **Experience.** A helped upgrade moves both ends of its timer, so its completion XP still counts its scheduled length.

The rest timing and the work stopping when a job completes follow the client's text and tables; the pinned client does not state what the live game does when a job finishes mid-hour, so that case is this game's reading.

## Interface

The hut's building card has a **Helpers** button, with a badge when a rested helper has a job it could take. The panel shows each helper's status, its working time, cooldown, speed and total saved time, the jobs it can take with the time each would save, the recurrence toggle and the gem button for its next level. A disabled button says why. On phones the stats stay in one row and each control is at least 40 px tall. `tests/browser/helper-hut.spec.ts` unlocks and assigns the Apprentice at 390 px and 1440 px.

## Replays

A Helper Hut can stand in villages recorded from replay version 55; it adds no combat rule (see [REPLAYS.md](REPLAYS.md#version-55-helper-hut)).
