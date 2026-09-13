# Campaign garrisons and Clan Castle source foundation

Pinned public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. Campaign garrisons and clan donations are not yet enabled. The runtime now supports the passive Clan Castle building, including all fourteen source tiers, original guarding/base/construction/scaffold/ruin meshes, resource targeting and Lightning immunity. Home purchase remains unavailable until the original repair and donation flow is implemented.

Replay version 37 introduces the `clancastle` building kind; versions 34–36 remain playable and reject this new kind. The four historical garrison recordings still compare complete states without exclusions. The Castle scene integration is smoke-tested in Chromium and WebKit with all fourteen live tiers and a destroyed Castle. Its local ground registration uses the existing native-building scale of 1.2 and vertical anchor of 80 source units. These live smoke tests complement the original source-mesh pixel witnesses; they do not claim complete Castle combat or pixel parity of the combined live assembly.

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

Before runtime integration, `tests/fixtures/garrison-historical-witness.json` freezes 2,404 complete battle states from commit `bf79ae6b6e3dede4458a19e93c78374e3ff28def` (replay version 36). Four portable recordings cover ground and air Skeleton defenders, attacker retaliation, Obsidian and source-speed level-21 Cannon flight. Hashes include presentation histories, with no excluded fields. The scenario input is separately hashed; it was authored for this capture and is not represented as part of the archived commit. `tests/garrison-historical.test.ts` checks the immutable recordings and every state against the current player.

`src/game/garrison-reserve.ts` now implements the pure reserve/search event for the two resolved troop levels. It preserves all 35 No Flight Zone housing spaces, copies and normalizes the input roster, drains one eligible member per search in increasing housing order, and checks Castle identity, survival, guard mode, target layer, target birth time and the 13-tile radius. Destroyed or ejected attackers cannot trigger it. A stable target-ID tie break is a local deterministic choice. Unsupported families/levels fail rather than being clamped or dropped; the 700-troop input bound is a local replay limit, not Castle capacity. Equal-housing random ordering remains required before adding other families.

The helper deliberately does not own the battle clock, mutate live battles or enable campaign access. A pinned older public implementation, [LogicBunkerComponent at 52c5953](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicBunkerComponent.cs), corroborates per-search validity filtering and one-member release. Its decrement-then-search branch waits an extra tick after the countdown reaches zero, so even that implementation does not justify equating `BUNKER_SEARCH_TIME=320` with an exact 320-ms exit interval. The repository targets client 9.256.x; its timing and position conventions are not proof of 18.400.21 behavior. No old-server code is executed. Scheduling, movement/combat, source animation events, replay schema validation and live assembly remain the next integration work.

Supercell documents that guarding defenders deploy only for targets they can attack, leave in increasing housing-space order, and use random ordering for different troops of equal housing; same-kind troops leave from lowest level upward. Surviving troops return after defense. These behavioral constraints come from [Clan Castle Troops & Spells](https://support.supercell.com/clash-of-clans/en/articles/clan-castle-troops-and-spells-2.html), separate from the pinned client tables. In particular, Balloons must remain inside against an air-only attack.

Reproduce or verify without modifying existing campaign artifacts:

```sh
PYTHONPATH=scripts python scripts/import-native-garrison.py --check
PYTHONPATH=scripts python -m unittest native_art.test_source_csv
npx vitest run tests/native-garrison-reference.test.ts
```

## Original models and animation foundation

`art.json` records ten additional pinned art inputs and the hashes of the source catalogue it was built from. The `castle.json`, `dragon7.json` and `balloon8.json` graphs preserve **27 exports, 51 clips and 89 shapes**. Six PNG textures copy the original SCTX sampling regions without scaling, recoloring or geometry simplification. Original additive container boundaries remain intact.

The Castle graph includes all fourteen home tiers, Goblin Castle, home/NPC/war bases, scaffolding, construction and ruins. Every home body has a **94-frame, 24-fps** root with **73 distinct placement patterns**. Visual inspection of the source compositions identifies rising **Z sleep markers** in that timeline. A guarding Castle must not simply loop the root as an idle animation. Frame zero is used for the guarding portrait; native state/clock selection remains unverified. Six named full/half treasury controls and both 35-frame nested glint animations are preserved independently. Empty badge and clan-name text fields retain their original metadata and placements.

Dragon 7 retains three original source views, one-frame roots, nested 16-frame wing/glow timelines and the empty `attack_pivot` locator. These are not expanded into invented evenly spaced directions. Balloon 8 retains its 37-frame nested glow animation, 34-frame attack and 11-frame death timeline. The original animation blocks remain separate from raw looping graph sampling: the non-looping attack/death completion rules and `ActionFrame` convention still need explicit runtime handling. The separate Dragon death export, attack/death effects and sounds are not covered by these model graphs.

Nineteen portraits use two pixels per native unit and conservative per-family bounds: Castle `[-105,-100,94,142]`, Dragon `[-72,-152,94,28]`, Balloon `[-60,-188,61,19]`. Nineteen icons crop those exact pixels with eight pixels of transparent padding. Framing is local. Transparent flattened previews cannot reproduce additive light on every background; the browser witnesses compare live meshes and independent original-texture compositions on the same backdrop.

The independent Python witnesses contain **1,380 compositions** across seven source-image pages. They cover every Castle root pattern and terminal frame, combined and individual treasury controls, all nested gold glints, bases/construction/scaffolding/ruins, two Dragon wing cycles in every view, mirrored locator controls, and every Balloon idle-glow/attack/death frame. Browser tests draw thirteen row-aligned strips of at most 2400×6000 pixels and explicitly check the actual framebuffer dimensions. This avoids the game's 16-million-pixel render-budget cap; the larger original Python witness textures remain intact.

All 1,380 compositions pass in Chromium and WebKit at DPR 2, using the production mesh renderer and packed textures. Maximum per-case mean channel error is **0.619167 / 0.834926** on the 0–255 scale. Each engine retains 30 pixels above 16/255, all within 0.001856 pixels of an original polygon edge; no source geometry or thresholds changed. Forced single-texture batching and graphics-context restoration produce zero changed bytes, and all GL checks are zero. The 44 assets total **7,177,180 bytes**, decode and match their byte hashes in both engines, and load identically after a Chromium offline reload. This is model-rendering and delivery verification; it does not enable garrison battles or establish native executable playback parity.

```sh
PYTHONPATH=scripts python scripts/import-native-garrison-art.py --check
PYTHONPATH=scripts python scripts/native-garrison-gpu-fixtures.py --check
npx vitest run tests/native-garrison-art.test.ts
npm run build
npm run test:garrison:assets
```
