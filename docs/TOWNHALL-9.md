# Town Hall 9

The home village ends at Town Hall 9. This tier raises the ceiling from Town Hall 8, unlocks the X-Bow as a buildable home defense, and takes the Barbarian King to level 30 behind a Hero Hall 3.

## Source

Every count and gate below comes from the pinned public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. The tier tables are now committed as [reference/townhall](../reference/townhall/README.md), with an importer that re-downloads the signed sources, verifies their SHA-256 values and reproduces the JSON byte for byte:

```sh
python3 scripts/import-native-townhall.py --check
```

This replaces the earlier wiki cross-check for tier data. The pinned rows agree with the Town Hall 1–8 column already in `src/game/progression.ts` for every entity the catalog gates from source, which is why this tier only had to add a ninth column.

Reading the tables needs three separate inheritance rules — per-tier carry-forward in `townhall_levels.csv`, per-record inheritance in `buildings.csv`/`traps.csv`, and the Town Hall's own one-row offset. They are described in the [reference README](../reference/townhall/README.md) and asserted by the importer.

## What the tier adds

| | Town Hall 8 | Town Hall 9 |
| --- | ---: | ---: |
| X-Bow | — | **2, up to level 3** |
| Archer Tower | 5 × 10 | 6 × 11 |
| Cannon | 5 × 10 | 5 × 11 |
| Air Defense | 3 × 6 | 4 × 7 |
| Wizard Tower | 3 × 6 | 4 × 7 |
| Hidden Tesla | 3 × 6 | 4 × 7 |
| Mortar | 4 × 6 | 4 × 7 |
| Air Sweeper | 1 × 4 | 2 × 5 |
| Bomb Tower | 1 × 2 | 1 × 3 |
| Wall | 225 × 8 | 250 × 10 |
| Seeking Air Mine | 2 × 1 | 4 × 2 |
| Giant Bomb | 3 × 3 | 4 × 3 |
| Bomb | 6 × 5 | 6 × 6 |
| Air Bomb | 4 × 3 | 4 × 4 |
| Spring Trap | 6 × 3 | 6 × 4 |
| Skeleton Trap | 2 × 2 | 2 × 3 |
| Army Camp | 4 × 6 (200 housing) | 4 × 7 (**220 housing**) |
| Spell Factory | 1 × 3 (6 housing) | 1 × 4 (**8 housing**) |
| Barracks | 1 × 10 | 1 × 11 |
| Laboratory | 1 × 6 | 1 × 7 |
| Hero Hall | 1 × 2 (King 20) | 1 × 3 (**King 30**) |
| Gold Mine / Elixir Collector | 6 × 12 | 7 × 12 |
| Gold / Elixir Storage | 3 × 11 | 4 × 11 |
| Dark Elixir Drill | 2 × 3 | 3 × 6 |
| Dark Elixir Storage | 1 × 4 | 1 × 6 |

Counts read *count × maximum level*. Gold Mine, Elixir Collector, storage and Builder's Hut counts below Town Hall 9 remain this game's own local curve and are not source-identical; at Town Hall 9 they converge on the source values above. The Town Hall's own hitpoints, price and duration still use the established local curve rather than the pinned row (4,600 hitpoints, 2,500,000 gold, two days), because changing them would rewrite the Town Hall 1–8 economy and every recorded battle that depends on it.

## The X-Bow at home

The [X-Bow](XBOW-COMBAT.md) was already implemented for campaign villages and imported recordings; this tier makes it purchasable. Two are permitted, and the source gates levels 1, 2 and 3 all at Town Hall 9, so a Town Hall 9 village can reach the level-3 X-Bow. Level 4 keeps its Town Hall 10 requirement.

A newly built X-Bow stores no targeting mode and defends the ground layer at 14 tiles; switching it to ground-and-air stores `both` and narrows it to 11.5 tiles. Modes survive saves, edit undo/redo, layout presets and replay export exactly as they already did for campaign X-Bows. Ammunition remains per battle and never becomes persistent home state.

## Heroes

`heroes.csv` gates King levels 21–30 behind Town Hall 9 and Hero Hall 3, and `src/game/king-progression.ts` now carries all thirty destination records. The same reading convention as levels 1–20 applies: a row's `UpgradeCost`/`UpgradeTimeH` buy the *next* level, so level 21 costs the 17,000 dark elixir and 24 hours stored on row 20. Activation recovery follows each row's `SpecialAbilitiesLevel` through `special_abilities.csv`: 450 at levels 21–24, 525 at 25–29 and 625 at level 30.

A Town Hall 9 village with a Hero Hall 2 still stops at King 20, and a Town Hall 8 village with an imported Hero Hall 3 also stops at 20 — both requirements have to be met. The hero panel no longer hard-codes its cap message; it names whichever requirement is actually missing.

## Held back at this tier

Three things the source tier permits are deliberately absent, and `tests/townhall-9.test.ts` asserts each gap so it cannot close or widen silently:

- **Clan Castle.** The source allows one from Town Hall 1 and level 5 here. The home Castle still needs donations, clans and a reinforcement roster; campaign Castles are unaffected.
- **Blacksmith 2.** Equipment levels 1–9 require Blacksmith 1 and level 10 requires Blacksmith 3 at Town Hall 10, so Blacksmith 2 would cost 1,200,000 elixir and unlock nothing. See [BLACKSMITH.md](BLACKSMITH.md).
- **Town Hall 10.** The catalog ends here, so the Town Hall cannot buy its own next tier.

Laboratory 7 is purchasable but changes no research ceiling: the local roster still supports five troop levels, whose requirements are met well below it. The Archer Queen, the second hero slot and Dark Barracks troops remain unimplemented, so Town Hall 9 adds no new troop.

## Compatibility

Recording version **45** carries the Town Hall 9 ceilings. No combat rule changed, and versions 34–44 remain playable. Earlier recordings keep their own ceilings, so a version-44 battle still cannot contain a Barracks 11, Laboratory 7, Hero Hall 3, a King above 20 or a Town Hall above 8; versions below 40 also keep the Dark Elixir Drill at level 3. Save version 4 is unchanged: an existing village loads untouched, and nothing in this tier is granted retroactively.

Villages that already carry levels above their tier — imported, campaign-derived or legacy — keep them. The tier raises ceilings and counts; it never removes a building or lowers a level.

## Verification

`tests/townhall-9.test.ts` checks the whole ninth column against `reference/townhall/catalog.json` rather than a transcribed copy: every count, every ceiling, monotonic tiers, nine-row tables, and the three withheld entries proven to be strictly below the source. It also exercises the tier as a village — the Town Hall 8 → 9 upgrade, X-Bow construction, count gate, mode toggle and both upgrades, the Hero Hall 3 path to King 21, army and spell housing, affordability of every Town Hall 9 purchase within Town Hall 9 storage, and the version-45 recording boundary.

`tests/king-combat.test.ts` compares all thirty King records against the pinned catalog. The Air Sweeper, Bomb Tower, Cannon, Archer Tower, Hidden Tesla, Dark Elixir Storage, Skeleton Trap, Seeking Air Mine, Army Camp, Wall and army-facility suites each gained their ninth tier entry.

Browser coverage, production smoke checks and the campaign suites were not re-run for this tier; they remain part of the standing verification work. Physical-device qualification and the full production-clone goal remain open.
