# Chief experience

The chief level beside the village name now follows the client's own experience curve, and XP comes from the same actions as in the live game. The [native table](../reference/experience/README.md) gives each of the 500 levels the XP it needs to reach the next: 30 for level 1, then 50 more per level to level 200, 500 more per level to 300 and 1,000 more after that. Level 500 is the cap.

## What pays XP

| Action | XP | Source |
| --- | --- | --- |
| Finishing a build, upgrade, merge, gear-up, supercharge, Guardian, weapon or module upgrade | ⌊√ scheduled seconds⌋ | [clash-wiki Experience](https://clash-wiki.com/progress/experience/): "convert the building's build time into seconds, take the square root of that number, and round down". A one-minute build pays 7, a 14-day upgrade 1,099 and a 20-day upgrade 1,314. |
| Finishing a hero upgrade | ⌊√ scheduled seconds⌋ | Hero upgrades hold a builder like a building upgrade; this build pays them the same way. |
| Destroying a Town Hall in a campaign attack or ladder match | The hall's level | clash-wiki Experience: destroying a Town Hall "gives experience equal to the level of the Town Hall", in multiplayer and in the single-player campaign. |
| Clearing a tree or rock | 3 | See [obstacles](OBSTACLES.md). |
| Claiming one of the eight local quests | 20 | This build's own stand-in for achievements. |

Instant work earns nothing because its square root is zero: walls, trap placement and a gem-bought Builder's Hut. Laboratory and Pet House research, practice attacks and stars earn nothing either; none of them appears among the original's XP sources. Finishing early with gems or a Book of Heroes still pays the whole scheduled duration, because the original derives the award from the level's build time, not from the time waited. Older saves whose timers carry no start time finish without XP.

Each level crossed shows a "Chief level N!" toast, and a completion toast names the XP it paid. The level shield fills from the bottom with the XP earned toward the next level; its label reads, for example, "Chief level 10, 20 of 450 XP to level 11". The profile shows the same progress as a bar.

## Saves

The save keeps one lifetime XP total, so nothing is migrated: the level is derived from it on the native curve. A village that earned XP under the old XP ÷ 100 rule now shows a lower level for the same total. A new village still starts with 1,850 XP, which is level 10 with 20 XP toward level 11; the original starts a new account at level 1 with none, but this village opens already built.

## Not implemented

Donations (1 XP per housing space), tiered achievements and their 10–1,000 XP rewards, and decorations, the only thing the original gates on chief level.

Verified October 5, 2026: `tests/experience.test.ts` covers the curve and its cap, the square-root rule, normal and gem-finished upgrades, instant walls, research, the level-up toast, and Town Hall XP in raids and practice.
