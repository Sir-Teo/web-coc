# Campaign garrisons and Clan Castle source foundation

Pinned public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. This foundation preserves source data for the next combat integration. Campaign garrisons, the Clan Castle and clan donations are not yet enabled.

`native.json` retains original nonempty level-table fields, complete ordered NPC rows, original Castle placement records, eight global records, and the two No Flight Zone animation blocks. Animation blocks have their own headers and types; empty cells are retained, including unresolved asset references. `catalog.json` contains compact Castle progression, ten campaign rosters and the focused Dragon/Balloon combat fields.

All sixteen inputs have fixed SHA-256 pins. The five CSV files also match their SHA-1 entries in the pinned fingerprint. This client fingerprint omits the entire `level/` directory; the ten public layout files have independent SHA-256 verification, not fingerprint membership. The importer verifies both kinds explicitly.

| Campaign stage | Garrison as recorded | Castle |
| --- | --- | --- |
| 57, No Flight Zone | Dragon 7 ×1; Balloon 8 ×3 | Clan Castle 5, native position (11,18) |
| 68, Goblin Capital | Goblin 7 ×40 | Goblin Castle |
| 70, The Arena | Electro Dragon 3, Golem 8, Dragon 7, PEKKA 8, Valkyrie 7, Witch 4, Bowler 4, Baby Dragon 6; one each | Goblin Castle |
| 73, Grand Avenue | Dragon 5 ×3 | Goblin Castle |
| 74, Besieged | Electro Dragon 3 ×3 | No Castle building in source layout |
| 75, Dragon’s Lair | Golden Dragon 1 ×1 | No Castle building in source layout |
| 77, Ring of Power | Lava Hound 6 ×1; Headhunter 3 ×2; Archer 9 ×3 | Goblin Castle |
| 78, Suspicious Gap | Super Minion 9 ×4; Archer 9 ×2 | Goblin Castle |
| 84, Path to Pain | Electro Titan 2 ×5 | Goblin Castle |
| 90, M.O.M.M.A’s Madhouse | MOMMA 1 ×1 | Goblin Castle |

Stage numbers above are one-based; `stageIndex` is zero-based. Native building `lvl` is converted to one-based Castle level. Troop `AllianceUnitLevel` remains `sourceLevel`, without a universal row-index or visual-level conversion. Dragon 7 and Balloon 8 match both source row ordinal and `VisualLevel`. Later families need individual resolution: Super Minion’s source rows have visual levels 4–14 and declare a separate Defensive Super Minion. Both families remain intact. Selecting row 9 or visual level 9 without establishing the native rule would silently change the later campaign.

No Flight Zone retains **35 housing spaces**, despite its level-5 Castle having a normal capacity of **30**. Other campaigns also exceed ordinary capacity. Do not trim these rosters, clamp troop levels to the home village, or synthesize a Castle for stages 74–75. The retained raw NPC rows preserve the original roster order; that order is not asserted to be the deployment order.

Dragon 7 has **3,900 HP**, **310 DPS**, source speed **200**, attack range **250**, interval **1,250 ms**, splash radius **30** and both ground/air targeting. Balloon 8 has **840 HP**, **236 DPS**, source speed **130**, interval **3,000 ms**, self-centered splash radius **120** and ground-only targeting. Its new-target delay is **2,250 ms**; death damage is **268**, radius **120**, delay **416 ms**, effect `Dark Balloon Exposion`. Source movement/range units remain explicit.

The Dragon attack block declares `ActionFrame=2`; Balloon declares `ActionFrame=34`, non-looping. Dragon death refers to `barbarian_death_1` with an **empty SWF**. The importer does not inherit the previous event’s asset file or invent a resolution. Animation action-frame conventions, exit cadence and native executable playback remain unverified.

The globals retain `CLAN_CASTLE_RADIUS=13`, `BUNKER_SEARCH_TIME=320`, `CASTLE_DEFENDER_SEARCH_RADIUS=9` and `ALLIANCE_ALERT_RADIUS=700`, plus target-validity, defender-jumping, replay separation and obstacle-deployment flags. `BUNKER_SEARCH_TIME` is not automatically treated as a troop release interval.

Supercell documents that guarding defenders deploy only for targets they can attack, leave in increasing housing-space order, and use random ordering for different troops of equal housing; same-kind troops leave from lowest level upward. Surviving troops return after defense. These behavioral constraints come from [Clan Castle Troops & Spells](https://support.supercell.com/clash-of-clans/en/articles/clan-castle-troops-and-spells-2.html), separate from the pinned client tables. In particular, Balloons must remain inside against an air-only attack.

Reproduce or verify without modifying existing campaign artifacts:

```sh
PYTHONPATH=scripts python scripts/import-native-garrison.py --check
PYTHONPATH=scripts python -m unittest native_art.test_source_csv
npx vitest run tests/native-garrison-reference.test.ts
```
