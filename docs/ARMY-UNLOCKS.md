# Army unlock progression

The supported roster now unlocks through completed army facilities. One shared table drives training, spell preparation, research eligibility, saved army validation, troop information, building upgrade previews, and the Town Hall progression sheet.

| Barracks level | Troop | Earliest local Town Hall |
| --- | --- | --- |
| 1 | Swordsman (Barbarian role) | 1 |
| 2 | Archer | 2 |
| 3 | Giant | 2 |
| 4 | Goblin | 2 |
| 5 | Wall Breaker | 3 |
| 6 | Balloon | 4 |
| 7 | Wizard | 5 |

| Spell Factory level | Spell | Earliest local Town Hall |
| --- | --- | --- |
| 1 | Lightning | 5 |
| 2 | Healing | 6 |
| 3 | Rage | 7 |

The troop sequence and early Barracks caps were checked against [ClashDaddy's Barracks table](https://clashdaddy.com/barracks-max-levels-and-upgrade-cost-clash-of-clans). Its article is dated December 2023; its later roster and historical prices are not adopted here. The spell sequence and Town Hall requirements were checked against [CoC Guide's Spell Factory table](https://coc.guide/army/spell-forge). Sources inspected September 11, 2026. [Facility upgrade behavior](FACILITY-UPGRADES.md) separately documents the official production changes.

## Behavior

- Initial construction grants no unlock. During an upgrade, the facility retains its completed level's unlocks; the new troop or spell becomes available when the upgrade finishes.
- Multiple imported facilities use the highest completed level.
- Train, brew, repeat preparation, and saved armies check unlocks before adding units. A failed composition changes neither troops nor spells.
- Existing saves retain prepared troops and spells, including units above their facility's present level. Players may deploy or remove these units and retain them in a preset. Replenishing them requires the appropriate unlock. No save migration deletes an army.
- Research requires both an unlocked troop and the existing Laboratory requirements.
- Locked cards show the required facility level. Building information identifies the next unlock, and Progression shows which Town Hall tier permits each unlock.
- Phone building menus wrap all actions into a second row, keeping Upgrade, Finish, Train, and other building actions reachable.

## New villages

New games start at Town Hall 2 with Barracks level 2, twelve Swordsmen and ten Archers, and no spells. The former prototype's Mortar, Air Defense, Laboratory, and level-2 Spell Factory are no longer prebuilt above their Town Hall requirements. Existing villages are unchanged. Advanced combat and presentation tests use an explicit developed-village fixture; initial village and onboarding tests continue to use the real starter.

The starter's building counts and levels are checked against the progression tables. Its unmodified army can earn a victory in the first campaign raid without upgrades or spells.

## Verification and limits

Unit coverage checks every supported troop and spell threshold, upgrade completion, first construction, research, atomic preset/repeat rejection, existing prepared units, starter legality, and opening-raid viability. Browser coverage walks the phone Barracks upgrade through reload and completes all three factory levels. The Chromium regression suite, selected WebKit checks, and production/offline checks cover the surrounding experience.

This closes the unlock gap for the current seven troops and three spells. Later troops, later spells, the complete building catalog, exact live-game economic values, and networked village progression remain unfinished. The local starter is a playable early village, not a recreation of the official tutorial or its initial economy.
