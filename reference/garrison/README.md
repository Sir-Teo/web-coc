# Campaign garrisons and Clan Castle source foundation

Pinned public client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. No Flight Zone now uses its original campaign garrison. Other garrison families and clan donations remain incomplete. The runtime now supports the passive Clan Castle building, including all fourteen source tiers, original guarding/base/construction/scaffold/ruin meshes, resource targeting and Lightning immunity. Home purchase remains unavailable until the original repair and donation flow is implemented.

Replay version 37 introduces the `clancastle` building kind; versions 34–36 remain playable and reject this new kind. The four historical garrison recordings still compare complete states without exclusions. The Castle scene integration is smoke-tested in Chromium and WebKit with all fourteen live tiers and a destroyed Castle. Its local ground registration uses the existing native-building scale of 1.2 and vertical anchor of 80 source units. These live smoke tests complement the original source-mesh pixel witnesses; they do not claim complete Castle combat or pixel parity of the combined live assembly.

The new `garrison-combat.ts` branch supports explicitly spawned Dragon 7 and Balloon 8 model defenders with their source HP, speed, range, interval, splash and target layers. Balloons retain the source 2,250-ms initial attack charge (a 750-ms windup within the 3,000-ms interval) and resolve the 268-damage, ground-only death splash once after 416 ms; units born after the death event are excluded even if a simulation step crosses both times. Spawn/stun boundaries and retained attack histories are deterministic. The campaign entry point now attaches No Flight Zone’s complete roster and matches its Castle by exact source position and level. Version 38 replay setup explicitly serializes garrisons and drives finite releases through the live model; original troop meshes now render separately from Skeletons. Current hit resolution is direct at the attack event; native action-frame alignment, the 9-tile reacquisition/return rules, original effects and final world/facing registration remain fidelity work for the enabled campaign. No executable timing parity is claimed.

`native.json` retains original nonempty level-table fields, complete ordered NPC rows, original Castle placement records, eight global records, and the two No Flight Zone animation blocks. Animation blocks have their own headers and types; empty cells are retained, including unresolved asset references. `catalog.json` contains compact Castle progression, ten campaign rosters and the focused Dragon/Balloon combat fields.

All sixteen inputs have fixed SHA-256 pins. The five CSV files also match their SHA-1 entries in the pinned fingerprint. This client fingerprint omits the entire `level/` directory; the ten public layout files have independent SHA-256 verification, not fingerprint membership. The importer verifies both kinds explicitly.

| Campaign stage           | Garrison as recorded                                                                                 | Castle                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 57, No Flight Zone       | Dragon 7 ×1; Balloon 8 ×3                                                                            | Clan Castle 5, native position (11,18) |
| 68, Goblin Capital       | Goblin 7 ×40                                                                                         | Goblin Castle                          |
| 70, The Arena            | Electro Dragon 3, Golem 8, Dragon 7, PEKKA 8, Valkyrie 7, Witch 4, Bowler 4, Baby Dragon 6; one each | Goblin Castle                          |
| 73, Grand Avenue         | Dragon 5 ×3                                                                                          | Goblin Castle                          |
| 74, Besieged             | Electro Dragon 3 ×3                                                                                  | No Castle building in source layout    |
| 75, Dragon’s Lair        | Golden Dragon 1 ×1                                                                                   | No Castle building in source layout    |
| 77, Ring of Power        | Lava Hound 6 ×1; Headhunter 3 ×2; Archer 9 ×3                                                        | Goblin Castle                          |
| 78, Suspicious Gap       | Super Minion 9 ×4; Archer 9 ×2                                                                       | Goblin Castle                          |
| 84, Path to Pain         | Electro Titan 2 ×5                                                                                   | Goblin Castle                          |
| 90, M.O.M.M.A’s Madhouse | MOMMA 1 ×1                                                                                           | Goblin Castle                          |

Stage numbers above are one-based; `stageIndex` is zero-based. Native building `lvl` is converted to one-based Castle level. Troop `AllianceUnitLevel` remains `sourceLevel`, without a universal row-index or visual-level conversion. Dragon 7 and Balloon 8 match both source row ordinal and `VisualLevel`. Later families need individual resolution: Super Minion’s source rows have visual levels 4–14 and declare a separate Defensive Super Minion. Both families remain intact. Selecting row 9 or visual level 9 without establishing the native rule would silently change the later campaign.

No Flight Zone retains **35 housing spaces**, despite its level-5 Castle having a normal capacity of **30**. Other campaigns also exceed ordinary capacity. Do not trim these rosters, clamp troop levels to the home village, or synthesize a Castle for stages 74–75. The retained raw NPC rows preserve the original roster order; that order is not asserted to be the deployment order.

Dragon 7 has **3,900 HP**, **310 DPS**, source speed **200**, attack range **250**, interval **1,250 ms**, splash radius **30** and both ground/air targeting. Balloon 8 has **840 HP**, **236 DPS**, source speed **130**, interval **3,000 ms**, self-centered splash radius **120** and ground-only targeting. Its new-target delay is **2,250 ms**; death damage is **268**, radius **120**, delay **416 ms**, effect `Dark Balloon Exposion`. Source movement/range units remain explicit.

The Dragon attack block declares `ActionFrame=2`; Balloon declares `ActionFrame=34`, non-looping. Dragon death refers to `barbarian_death_1` with an **empty SWF**. The importer does not inherit the previous event’s asset file or invent a resolution. Animation action-frame conventions, exit cadence and native executable playback remain unverified.

The globals retain `CLAN_CASTLE_RADIUS=13`, `BUNKER_SEARCH_TIME=320`, `CASTLE_DEFENDER_SEARCH_RADIUS=9` and `ALLIANCE_ALERT_RADIUS=700`, plus target-validity, defender-jumping, replay separation and obstacle-deployment flags. `BUNKER_SEARCH_TIME` is not automatically treated as a troop release interval.

Before runtime integration, `tests/fixtures/garrison-historical-witness.json` freezes 2,404 complete battle states from commit `bf79ae6b6e3dede4458a19e93c78374e3ff28def` (replay version 36). Four portable recordings cover ground and air Skeleton defenders, attacker retaliation, Obsidian and source-speed level-21 Cannon flight. Hashes include presentation histories, with no excluded fields. The scenario input is separately hashed; it was authored for this capture and is not represented as part of the archived commit. `tests/garrison-historical.test.ts` checks the immutable recordings and every state against the current player.

`src/game/garrison-reserve.ts` now implements the pure reserve/search event for the two resolved troop levels. It preserves all 35 No Flight Zone housing spaces, copies and normalizes the input roster, drains one eligible member per search in increasing housing order, and checks Castle identity, survival, guard mode, target layer, target birth time and the 13-tile radius. Destroyed or ejected attackers cannot trigger it. A stable target-ID tie break is a local deterministic choice. Unsupported families/levels fail rather than being clamped or dropped; the 700-troop input bound is a local replay limit, not Castle capacity. Equal-housing random ordering remains required before adding other families.

The helper deliberately does not own the battle clock, mutate live battles or enable campaign access. A pinned older public implementation, [LogicBunkerComponent at 52c5953](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicBunkerComponent.cs), corroborates per-search validity filtering and one-member release. Its decrement-then-search branch waits an extra tick after the countdown reaches zero, so even that implementation does not justify equating `BUNKER_SEARCH_TIME=320` with an exact 320-ms exit interval. The repository targets client 9.256.x; its timing and position conventions are not proof of 18.400.21 behavior. No old-server code is executed. Modern cadence verification, source animation events and further targeting/return evidence remain pending.

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

The spec declares device scale factor 2 directly, so these physical-pixel captures also fit when run with the default browser configuration. Only the current reference strip is uploaded to WebGL at its original size, avoiding the full 9000-pixel PNGs on GPUs with an 8192-pixel texture limit. Reports retain both image and texture dimensions alongside the GPU limit.

All 1,380 compositions pass in Chromium and WebKit at DPR 2, using the production mesh renderer and packed textures. Maximum per-case mean channel error is **0.619167 / 0.834926** on the 0–255 scale. Each engine retains 30 pixels above 16/255, all within 0.001856 pixels of an original polygon edge; no source geometry or thresholds changed. Forced single-texture batching and graphics-context restoration produce zero changed bytes, and all GL checks are zero. The 44 assets total **7,177,180 bytes**, decode and match their byte hashes in both engines, and load identically after a Chromium offline reload. This is model-rendering and delivery verification; it does not enable garrison battles or establish native executable playback parity.

```sh
PYTHONPATH=scripts python scripts/import-native-garrison-art.py --check
PYTHONPATH=scripts python scripts/native-garrison-gpu-fixtures.py --check
npx vitest run tests/native-garrison-art.test.ts
npm run build
npm run test:garrison:assets
```

The pinned older [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs) initializes an increasing hit timer from `GetNewTargetAttackDelay`, then hits when it reaches `GetAttackSpeed`. The intermediate simulation follows this interpretation: Dragon windup 1.25 s, Balloon windup 0.75 s on entering range. Its no-projectile branch resolves area damage directly and passes the selected target layer; the new branch follows that layer restriction. This is corroborating 9.256.x evidence, not a modern executable guarantee.

## Release scheduler and portable playback

Version 38 stores each Castle ID, guard/sleep mode and complete typed roster explicitly. Validation rejects duplicate/dangling Castles, unsupported troop levels, invalid counts and more than 700 total defenders across the input; it never applies normal housing capacity. Export whitelists these fields. Versions 34–37 remain playable and reject the new garrison setup field. Optional state remains absent from historical battles.

The current release schedule follows the pinned older implementation: a 320-ms countdown, then the following 64-ms search tick, yielding 384-ms search spacing. Times are calculated from integer milliseconds, never repeatedly accumulated. The first search is at battle time zero. Each eligible release consumes one reserve entry and alternates the four source exit offsets, 1.25 tiles from the center of a 3×3 Castle. Target birth time is checked at each search event. Modern executable cadence remains unverified.

Live Dragon/Balloon presentation uses the original graphs, nested wing/glow timelines and additive groups at a local 0.6 scale. Dragon up-right/right/down-right source views use local angular buckets and horizontal reflection. Balloon death clamps to original frame 10, which is empty. Balloon attack now leads into the damage event at the source 24-fps rate, using a local one-based interpretation of `ActionFrame=34` (index 33). The existing cooldown controls the windup: the precharged first attack enters at frame 15 with 750 ms remaining; repeated attacks begin at frame 0 with 1,375 ms remaining. The damage event holds frame 33 for one source frame. Stuns freeze the cooldown-driven pose and disengagement cancels the windup. This changes presentation only; native executable action-frame conventions remain unverified. Dragon death now uses the original common death export; additional death particle effects remain pending. Chromium and WebKit smoke checks cover actual releases, mesh presence, absence of substituted Skeleton sprites, terminal death removal and GL errors; these are not new pixel-comparison witnesses.

## No Flight Zone campaign entry

The first 58 villages (indices 0–57) now form a reachable path through Graduation Ceremony. No Flight Zone retains its original level-5 Castle at world (13,20), one Dragon 7 and three Balloons 8. Air-only raids release the Dragon and preserve all three Balloons in reserve. Ground, air and resource-focused armies naturally finish in the existing campaign combat sweep; a dedicated portable-replay check retains units, defenders, reserve and buildings, and both browser engines exercise normal campaign entry and the visible defending Dragon. Other unresolved source rosters stayed gated in their entirety until version 44 implemented them (see [Generalized campaign garrisons](#generalized-campaign-garrisons-version-44)).

Targeting audit: the pinned `logic/globals.csv` (SHA-256 `16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087`) contains `CASTLE_DEFENDER_SEARCH_RADIUS=9`, but has no `ALLIANCE_TROOPS_PATROL` record. The older engine only applies its 9-tile restriction after patrol search radius is enabled. Thus that conditional code does not establish a mandatory modern restriction; adding one would be an unsupported behavior change. Current global reacquisition is retained pending stronger modern evidence. Original death effects, attack alignment and final registration remain unfinished; enabling the playable stage is not a claim of complete native playback parity. Source foundation metadata is retained as captured, not rewritten to describe current integration status.

## Original garrison sound events

`import-native-garrison-sounds.py` retains nine original effect records and seven byte-identical Ogg files (80,091 bytes). Every source is SHA-256 pinned and checked against the client fingerprint’s SHA-1 membership. The original character effect bindings, volume, pitch range and empty Dragon hit-sound entry are preserved in `sounds.json`. Particle-emitter rows are retained for subsequent effect integration.

Deploy, attack, hit, death and the resolved delayed Balloon death blast feed the shared simulation-clock audio system. Pitch selection within the original ranges is a local deterministic hash, so seeks reconstruct the same cues without changing combat state. The generic random hit sound is suppressed for these original garrison events. Attack sound timing currently follows the retained damage event; full animation/action-frame alignment remains pending.

Both browser engines decode every sample and verify the exact delivery hashes; Chromium also verifies identical decoding after an offline production reload. The 1,383-test suite and production build pass. The existing 44 model/portrait assets and their frozen pixel evidence are unchanged. Reproduce with `PYTHONPATH=scripts python scripts/import-native-garrison-sounds.py --check`, `npx vitest run tests/garrison-sounds.test.ts tests/sample-audio.test.ts`, and `npm run build && npm run test:garrison:sounds`.

## Original Dragon death timeline

`import-native-dragon-death.py` imports `barbarian_death_1` from the pinned common `sc/characters.sc`, matching the Dragon7 die event’s export name. That event has an empty SWF field; the matching common-file resolution is explicit and remains distinct from verified native executable lookup. Three source pins include the fingerprint, SC file and original SCTX; both payloads also match fingerprint SHA-1 membership. No earlier graph, texture or witness is regenerated.

The original clip has 143 timeline frames at 24 fps and 138 unique placement patterns. Frame zero and frames 138–142 are structurally empty. Frame 137 retains very faint geometry whose composition rounds entirely to the witness background. The new witness records both structural and raster emptiness; the browser requires zero changed pixels for either empty case. Every frame has an independent full-SCTX composition.

All 143 frames pass in each browser engine: maximum mean channel error is 0.493110 in Chromium and 0.722046 in WebKit, maximum single-channel difference 4/255, no pixels above 16/255. The 2400×5400 comparison fits inside the verified 2500×5500 framebuffer. Forced single-texture batching and context restoration change zero bytes. Live presentation replaces the Dragon body with the common death graph, clamps to terminal frame 142, and restores the living graph on backward state reconstruction. Reduced motion uses the empty terminal pose. Existing local troop scale/air registration remains in use; original attack effects and final world registration still need refinement.

The 1,385-test suite and production build pass. Reproduce with `PYTHONPATH=scripts python scripts/import-native-dragon-death.py --check`, `npx vitest run tests/dragon-death.test.ts`, and the death case in `tests/browser/native-garrison-mesh.spec.ts`.

Balloon windup validation: all 1,387 unit tests across 126 files pass, including action-frame alignment, precharged entry, cancellation, reduced motion and pure pose reconstruction. Chromium and WebKit live-scene checks render both windup and action poses; the production build succeeds with 579 cached files. These live checks establish renderer integration, not native executable timing parity.

## Original garrison particle art

`scripts/import-native-garrison-particles.py` captures all 14 emitters referenced by the nine focused garrison effect records. The 27 original particle variants resolve explicitly to `sc/buildings.sc`: Dragon fire and sparks, Balloon cloth/wood debris, fireballs, smoke, explosion, ring, flash, grass, stones and Dragon death splats. Their 32 reachable animation clips and 62 shapes use only original texture 39. Source SHA-256 pins and fingerprint SHA-1 membership checks cover the effect table, emitter table, scene file and SCTX texture. `particles.json` preserves ordered continuation rows without inventing missing fields; `particle-art-source.json` retains original geometry/UVs and `particle-art.json` contains the losslessly packed runtime texture coordinates. The new assets live separately in `assets/garrison-effects-native`, preserving the original 44-file garrison foundation.

Dragon Attack emits 30 `dragonFire`, 20 `dragonFireAdd`, five `dragonSpark` and 80 `dragonFireAddStart` particles. The source attaches the effect to `attack_pivot`, then detaches after start. Direction, signed gravity, inertia, lifetime scaling, per-variant additive blending and the distinction between parent attachment and particle motion must be handled explicitly during live integration. In particular, variant continuation rows omit common fields; a runtime consumer must resolve those fields deliberately while preserving the raw source records. Balloon impact and delayed death-blast particles now use these assets live; Dragon attack and death particles are also now connected through the retained source effects. Source preservation and renderer comparison do not establish native particle-motion or attachment parity.

Independent witnesses sample every frame of each export, plus every otherwise unexported descendant clip as a test-only root. Each source composition uses the full original SCTX texture; live mesh tests use the packed texture. Pages stay within the actual framebuffer budget, and the shared browser harness checks pixel errors, forced single-texture batches, context restoration and GL errors. Witness aliases exist only in the test harness, not in the runtime export catalogue.

For source-over composites made entirely from multiple fractional-opacity leaves,
the harness also accepts a maximum per-channel error of one byte per leaf, capped
at three bytes. This bounds accumulated RGBA8 rounding across translucent layers;
other compositions retain the mean-error limit of 1. All cases retain the existing
16/255 significant-pixel threshold and fraction limit. The raw PNG witnesses and
their source hashes remain unchanged.

Particle-art validation: all 2,257 source compositions pass in each engine across 15 pages. Maximum mean channel error is 0.716552 in Chromium and 0.852041 in WebKit; maximum single-channel difference is 11/255, with no pixels above 16/255. Forced single-texture batching and context restoration change zero bytes, and all GL checks pass. The reproducible source check passes; all 1,389 unit tests across 127 files and the production build pass (580 cached files). These checks validate original particle art, not yet live particle placement or motion.

## Live Balloon impact and death particles

`garrison-effects.ts` reconstructs the original five impact emitters and nine delayed death-blast emitters from retained Balloon attack/death events. Impact origins remain at each attack's recorded self-centered damage position after the Balloon moves. Death particles require `deathResolved` and begin at `defeatedAt + 416 ms`. Ordered particle births, lifetime sampling and local random choices are deterministic across JSON reconstruction and backward seeks. Shared emitter fields are resolved onto alternate variants in a separate runtime copy; original records remain intact. Reduced motion keeps only the source ring. Expired effects and battle teardown destroy their mesh views.

The live scene loads the original packed effect texture and suppresses the generic melee flash for Balloon damage events. Simulation and replay schema are unchanged. Particle scale uses the existing local 0.6 troop scale; ground projection, inertia, bounce, rotation and depth use the shared local particle interpretation. Native particle-motion equations, final world registration and source instance-limit semantics remain unverified. Dragon fire and death splats are integrated below; native motion and final registration remain pending.

All 1,391 unit tests across 128 files pass, including event timing, fixed impact origins, death gating, reduced motion, expiry and pure reconstruction. Chromium and WebKit each pass the live effect and existing garrison-body checks; clear-ground screenshots were visually reviewed in both engines. The production build succeeds with 580 cached files. Original mesh pixel witnesses remain the separate art evidence; the live checks do not claim native motion parity.

## Live Dragon fire and mouth attachment

The three one-frame Dragon source roots retain distinct `attack_pivot` placements: source x/y (26.950000762939453, −91.4000015258789), (52.95000076293945, −57.400001525878906) and (25.950000762939453, −23.399999618530273). `dragonAttackOffset` applies the same local view bucket, reflection and 0.6 scale as the body. Fire originates at that locator in the recorded attack's position, with the existing local air lift. The four original emitters follow the recorded target direction using the shared local particle projection. Their origin stays detached when the Dragon moves, and `DestroyWhenParentDies` removes active fire. The original `SplatBig` death effect now accompanies the common death animation. Generic melee flashes are suppressed for both resolved garrison families.

Per-variant blending is retained: `dragonFireAdd` variant B explicitly declares `AdditiveBlend=FALSE`, while A and C are additive. Runtime variant resolution preserves that override. Source flame timelines are sampled over the emitter lifetime, and the original spark and death-splat meshes remain intact. No native executable emission or action-frame parity is claimed. Fire currently starts at the retained damage event; local ground/air projection and source shadow registration still need refinement.

All 1,393 unit tests across 129 files pass. Chromium and WebKit each pass six-orientation fire rendering, destruction/expiry, existing Balloon effects and garrison body checks. All six directions were visually reviewed in both engines; all GL checks pass. The production build succeeds with 580 cached files. Visual review also exposed duplicate Dragon shadows from the original body graph plus the local ground marker; the following shadow-layer correction addresses that duplicate.

## Original garrison ground shadows

The Dragon and Balloon source graphs both use shape 0 for black-alpha shadow texels; the common Dragon death graph uses shape 45. Inspection of their packed sampling regions confirms black RGB and nonzero alpha (maximum 188 for Dragon, 183 for Balloon/common death). Live Dragon roots place this shape at source origin with scale 2, while Balloon roots use scale 1.5. Dragon retains both original overlapping shadow commands.

`garrison-layers.ts` partitions these exact source commands into a ground layer, preserving vertices, colors, nested groups and timeline state. The live body keeps its existing local air lift; original shadows render at the projected ground origin beneath world objects, with the renderer's normal fractional ordering. The extra locally drawn garrison ellipse is removed. Shadows switch to the common death graph with the Dragon, follow original terminal removal, reconstruct after backward seeks and are destroyed on teardown. Absolute body altitude and native ground registration remain local interpretations pending executable comparison.

The partition test covers 417 samples: two wing cycles in all six Dragon orientations, all 143 Dragon death frames, 37 Balloon idle frames, 34 attack frames and 11 death frames. Every sampled source mesh command survives unchanged in exactly one layer. All 1,395 unit tests across 130 files pass; the expanded partition test also passes separately. Chromium and WebKit pass live grounded-shadow/terminal checks and six-orientation fire rendering. Reviewed screenshots show one original ground shadow instead of the previously lifted source shadow plus local ellipse. The production build succeeds with 580 cached files.

## Source Castle selection bounds

`castleBounds` now caches the exact displayed pose bounds for all 14 levels in guard, construction, upgrading and ruin states. Selection and status-bar placement use those bounds instead of the generic portrait rectangle; intact-height metadata for projectile anchors also uses the original guard pose. The source artwork and world anchor are unchanged. For No Flight Zone's level-5 Castle, the guard bounds relative to its projected center are approximately [−89.82, −151.44, 88.44, 46.38], rather than the old portrait-sized hit region. Scaffolding widens the level-5 bounds to approximately [−96.24, −151.44, 95.82, 58.56]; ruins have their own lower profile.

Independent Python source-graph compositions verify representative low, campaign and maximum-tier bounds. Chromium and WebKit each exercise all 56 level/state combinations, checking displayed-pose bounds, inside/outside hit selection and intact-height metadata; existing live Castle rendering checks also pass. All 1,396 unit tests across 131 files pass, and the final production build succeeds with 580 cached files. Selection remains rectangular around native geometry; this does not claim per-pixel alpha hit testing or native executable anchor parity.

## Generalized campaign garrisons (version 44)

Garrison kinds now form a registry (`garrison-kinds.ts`). Combat values come from the pinned character row at each roster's source level. Art, rows and resolution evidence come from the generic importer described in [the character reference](../characters/README.md). Dragon 7 and Balloon 8 remain valid from replay version 38. Goblin 7, Archer 9, Dragon 5, PEKKA 8, Valkyrie 7, Headhunter 3, Super Minion 9 and Baby Dragon 6 require version 44. Other kinds or levels fail validation and campaign resolution rather than being clamped or dropped. Replay `troops` keep the version-38 schema; `level` is the source `AllianceUnitLevel`.

**Rosters.** Every member must resolve, and the layout must contain exactly one `Bunker=TRUE` building matched by identity, source position and level (a layout without any bunker is the explicit inert case below). All ten source rosters now resolve, so no village reports "Garrison defenders"; see [Remaining defending families](#remaining-defending-families-version-44) for the eight families added last. `campaignGarrisonIssues(index)` still names any unsupported member or bunker.

**Level resolution.** `AllianceUnitLevel` is a VisualLevel, followed by any `DefensiveTroop` substitution. Evidence: the pinned `npcs.csv` includes a Rocket Balloon 10 challenge roster that a row-ordinal reading cannot resolve. Super Minion 9 is therefore Defensive Super Minion row 6 (1,600 HP, 325 DPS, three long shots), not VisualLevel 12. Details are in the character README.

**Bunkers and exits.** Clan Castle (1000014), Goblin Castle (1000061, Clan Castle archetype) and Foreboding Cave (1000062, 4×4 Army Camp archetype) all carry `Bunker=TRUE`. The pinned older [LogicBunkerComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicBunkerComponent.cs) places exits at the building middle plus `(widthInTiles << 8) - 128` internal units. That is half the footprint less a quarter tile: 1.25 tiles for 3×3 bunkers (No Flight Zone unchanged) and 1.75 for the cave. Search cadence, the 13-tile trigger and guard checks are unchanged. Fandom's [Single Player Campaign](https://clashofclans.fandom.com/wiki/Single_Player_Campaign) page says the cave also opens after enough damage. No pinned row encodes that trigger, and the pinned older engine has none either: `LogicBunkerComponent.Tick` releases only through its proximity search, and neither `LogicHitpointComponent` nor `LogicBuilding` touches the bunker on damage. The damage trigger is therefore **not implemented**. Every attacker that can damage the cave with its own attacks stands within the 13-tile radius already (the longest attacker range here is 4.5 tiles), so the only difference is a cave hit by spells alone.

**Release order.** Housing increases; different troops with equal housing use a seeded order; the lowest level leaves first within one troop type. This follows the Supercell support rule cited above. The seed is the battle seed (1337 + village index), so live battles, replays and seeks agree, but every attempt on a village uses the same order. That is a local deterministic stand-in for random order. Fandom's [Clan Castle](https://clashofclans.fandom.com/wiki/Clan_Castle) page instead breaks ties by internal troop ID; the primary Supercell text is preferred. No resolvable roster contains such a tie today. The Arena's Electro Dragon (GlobalID 4000059) and Golem (4000013), both 30 housing, are the only pair; an ID rule would release the Golem first. Rosters above normal capacity remain literal: The Arena has 141 housing in a 50-space Goblin Castle.

**Shared combat rules.** Existing global nearest-target reacquisition, the older engine's `AttackSpeed - NewTargetAttackDelay` first-hit wait and stun/birth boundaries apply to every family listed in this section (the families added later use the split attack timer described [below](#remaining-defending-families-version-44)). Rows without `Projectile` hit at the attack event. Rows with one launch a tracking shot at projectile `Speed / 100` tiles per second, the Archer Tower convention; the shot resolves once even if its shooter dies. Single-target hits never touch bystanders. `DamageRadius` splashes the struck layer, centered on the attacker when `SelfAsAoeCenter` is set. Ground defenders path around buildings, jump walls (`ENABLE_DEFENDING_ALLIANCE_TROOP_JUMP`) and repath every 0.3 s, like Skeleton defenders. Flyers keep the straight Dragon approach. Attackers retaliate against ground garrison defenders through the existing alert rules. Paths now target those defenders as troop points; a leveled defender was previously read as a building footprint and threw. Version-44 families keep their 16 most recent attack records, with stable ordinals; Dragon and Balloon keep complete histories.

| Family         | Pinned values used                                    | Special fields and interpretation                                                                                                       |
| -------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Goblin 7       | 105 HP, 52 damage / 1 s, range 0.4, speed 4, ground   | —                                                                                                                                       |
| Archer 9       | 56 HP, 31 / 1 s, range 3.5, speed 3, air+ground       | `Arrow_small_darkElixirFire2`, 14 tiles/s                                                                                               |
| Dragon 5       | 3,100 HP, 300 / 1.25 s, range 2.5, splash 0.3, flying | Shares Dragon effect rows; its own `dragon5` mouth locator                                                                              |
| PEKKA 8        | 6,300 HP, 1,098 / 1.8 s, range 0.8, speed 2, ground   | Two weighted attack rows (ActionFrame 12 and 10), picked by a deterministic local hash                                                  |
| Valkyrie 7     | 1,650 HP, 333 / 1.8 s, range 0.5, splash 1, ground    | Self-centered splash; `NewTargetAttackDelay` 600 gives a 1.2 s first hit                                                                |
| Headhunter 3   | 440 HP, 75 / 0.6 s, range 3, speed 3, air+ground      | Card at 14 tiles/s; `PreferHeroes` (King pool whenever valid); `HeroDamageMultiplier` 400; `HeadhunterPoison` 3 → Poison 7 for 3,000 ms |
| Super Minion 9 | Defensive row: 1,600 HP, 325 / 1 s, range 3.5, flying | `SuperMinionSpecialProjectiles_DEF`: first 3 attacks from 9.75 tiles with the big rocket (6 tiles/s), then a normal rocket (4 tiles/s)  |
| Baby Dragon 6  | 1,700 HP, 125 / 1 s, range 2.25, splash 0.3, flying   | Fireball at 4.75 tiles/s; Tantrum: ×2 damage and ×1.5 attack-timer rate when no other living flying defender is within 4.5 tiles        |

Headhunter poison uses the Poison spell's `PoisonDPS` 280. Its spell `HeroDamageMultiplier` of 5% gives the King 14 DPS. It also slows movement to 56% (`SpeedBoost` -44) and attack timers to 35% (`AttackSpeedBoost` -65). The older [LogicMovementSystem](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicMovementSystem.cs) treats a negative speed boost as a percentage slow. [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs) advances its hit timer by `(100 + boost)%`; Tantrum uses the same convention. Local interpretations: poison damage is constant for the duration, refreshed by each hit and ticked once per interval. The older `LogicHitpointComponent` ramp (`PoisonIncreaseSlowly`) belongs to repeated cloud pulses and is not applied. Long shots count launches. Tantrum reevaluates every step, and air Skeletons count as flying allies. Attacker slows live in `unit.late.garrison` and scale the model's movement and attack timers separately. Public descriptions agree: [Headhunter](https://clashofclans.fandom.com/wiki/Headhunter), [Baby Dragon](https://clashofclans.fandom.com/wiki/Baby_Dragon/Home_Village) (movement unchanged), [Super Minion](https://clashofclans.fandom.com/wiki/Super_Minion) (three defensive long shots) and [Valkyrie](https://clashofclans.fandom.com/wiki/Valkyrie). Pinned rows supply every value.

**Besieged (index 73).** The roster is Electro Dragon 3 ×3, but `level/npc72.json` has no `Bunker=TRUE` building. Its eight Communications Masts (1000016; shown in game as "Goblin Hut") have no `Bunker`, housing or defender fields. Community guides disagree about this roster, reporting three level-5 Dragons or level-3 Electro Dragons "from a hut". The pinned older engine settles what a bunkerless layout does: [LogicBuildingData.IsAllianceCastle](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicBuildingData.cs) is the `Bunker` column; [LogicGameObjectManager](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicGameObjectManager.cs) records the only alliance castle when such a building is added; and [LogicComponentManager.AddAvatarAllianceUnitsToCastle](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicComponentManager.cs) loads the owner's alliance units only into that castle, doing nothing when there is none. No other component reads the roster (the Guard Post `LogicDefenceUnitProductionComponent` uses building rows, not alliance units). The rule is explicit: `inertCampaignGarrison(73)` returns the recorded roster with reason "No source bunker"; `resolvedCampaignGarrison(73)` resolves it with `castle: null`; `campaignGarrisonSetup` returns no garrison. The village is no longer gated for it, and a recorded battle verifiably releases no defender. No Castle is synthesized. That engine predates campaign alliance units (its `LogicNpcData` has no `AllianceUnitType`), so this is the closest available evidence, not native parity.

The same `AddAvatarAllianceUnitsToCastle` also skips units above the castle's unused capacity. It is **not** applied to campaign rosters: M.O.M.M.A (100 housing) and the Golden Dragon (100) could then never enter their 50-space Goblin Castle and Foreboding Cave, contradicting the public descriptions of both villages (achievement "Ungrateful Child: Defeat Mega PEKKA", [Supercell, December update 2022](https://supercell.com/en/games/clashofclans/blog/release-notes/december-update-2022/); the cave releasing its dragon, [Fandom](https://clashofclans.fandom.com/wiki/Single_Player_Campaign)). Rosters stay literal, as before.

## Native character presentation

`character-poses.ts` derives every garrison pose from battle state and the source animation block. Looping rows run on the defender's age clock. Walk applies while moving toward a living target, idle otherwise. Non-looping attack rows lead into the recorded damage event using the combat cooldown, with `ActionFrame` read as one-based. After the event the clip plays its remaining frames. An action on the final frame holds for one source frame, and a new windup takes priority over follow-through. Directional rows use the three original views, with reflection on the other screen side and local ±22.5° buckets. Fixed-view rows are never mirrored. `Scale` is a percentage of the local 0.6 troop scale. Death uses the die row's export at its scale, including the common `barbarian_death_1` export, and clamps to the empty terminal frame. Super Minion's die row declares `Looping=TRUE`, which is not honored because the dead troop leaves.

Each family's original shadow shape renders on a ground layer. Ground troops sort at their projected ground point (shadow +1.05, body +1.1). Flyers keep the 46-pixel air lift above rooftops, with shadows beneath world objects. Health bars use the idle front view's source top. Projectiles draw original meshes along recorded tracking flights using `StartHeight`, `StartOffset`, `BallisticHeight`, `ScaleTimeline`, `UseRotate` (tips along +Y) and shadow exports. Arc shape and screen projection are local.

Dragon 7 and Balloon 8 now use this generic path. `tests/garrison-presentation-invariance.test.ts` freezes a digest of the previous code's poses and shadow layers across 558 sampled states: 16 target directions, last-attack and default facing, wing timelines, reduced motion, windup, action hold, death and unborn states. The generic presentation reproduces it byte-for-byte. The earlier Dragon/Balloon tests and browser checks also still pass.

**Verification.** Unit coverage includes source values for every roster level, VisualLevel evidence, seeded tie order, per-village blockers, Goblin pathing and cadence, Archer tracking and single-target hits, PEKKA and Valkyrie splash, Headhunter hero priority, damage and poison, Super Minion long shots, Baby Dragon Tantrum and JSON-restoration determinism. Replay coverage adds exact bunker matching, version gates, Foreboding Cave exits, a portable Goblin Capital recording with mixed families and backward-seek determinism across two viewers. Graph integrity, state poses and projectile poses are checked too. Chromium and WebKit browser checks (`tests/browser/garrison-families-*.spec.ts` with the standard config) release defenders in villages 67, 72, 76 and 77 and capture release, movement, attacks and deaths under `output/playtest/garrison/<engine>/`. Village 76 uses its resolved Headhunter/Archer subset only, and these fixtures give attackers durable hit points because the villages' other defenses otherwise erase the low-level local army in seconds. A clear-ground lineup renders all eight families idle, walking, attacking with projectiles and dying. The existing No Flight Zone, garrison effect, audio and Dragon fire checks still pass in Chromium. All 29 original garrison mesh pixel witnesses pass at DPR 2; on macOS this needs the Metal ANGLE backend, without which the large reference sheets fail to upload.

**Limits.** Original deploy/attack/hit/die particles, projectile trails, the Tantrum activation effect and sounds for the eight new families are pending. Their hits use the existing local melee flash, and generic hit sounds stay suppressed. Exit cadence, global reacquisition, the action-frame convention, tracking-shot arcs and on-hit poison timing remain interpretations; no native executable parity is claimed. The new families have state-matrix unit tests and live smoke screenshots in both engines, not GPU pixel witnesses. Goblin Castle body rendering belongs to its own family.

```sh
PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-characters.py --check
npx vitest run tests/garrison-families.test.ts tests/garrison-families-replay.test.ts tests/character-presentation.test.ts tests/garrison-presentation-invariance.test.ts
npx vite --host 127.0.0.1 --port 5315 --strictPort   # then:
npx playwright test tests/browser/garrison-families-live.spec.ts tests/browser/garrison-families-lineup.spec.ts
```

## Remaining defending families (version 44)

Electro Dragon 3, Golem 8, Witch 4, Bowler 4, Lava Hound 6 (Defensive Lava Hound row), Electro Titan 2, Golden Dragon 1 and MOMMA 1 complete the ten source rosters. Four spawned-only kinds follow them: Golemite 8, Lava Pup 1, the Witch's Skeleton 1 (`summonedskeleton`; `skeleton` remains the Skeleton Trap defender) and the Ghost Trap's Royal Ghost 7. Spawned-only kinds are rejected in bunker rosters and replay garrisons (`isSpawnedGarrisonKind`). Every kind's first replay version is 44, and version-43 recordings reject them. Levels are VisualLevels, as for the earlier families. Secondary troops take the parent's row ordinal, clamped to their own table: Golem row 8 gives Golemite row 8, and Lava Hound row 6 gives the single Lava Pup row. `SummonLevel`, `SpawnLvl`, `SelfSpellLevel`, `AuraSpellLevel` and `DefenceTroopLevel` are 1-based. Each has a row whose value is valid only 1-based: Witch 8 names `SummonLevel=2` of two Skeleton rows, and Skeleton Trap 5 names `SpawnLvl=2` of two Trap Skeleton rows. Ability 9 names `SelfSpellLevel=12` of twelve `ElectroDragonDie` rows, and the older `LogicDefenceUnitProductionComponent` calls `SetUpgradeLevel(level - 1)`.

All mechanics below cite the pinned older engine reconstruction [bns34/Supercell.Magic-my-turn@52c5953](https://github.com/bns34/Supercell.Magic-my-turn/tree/52c5953f5e5802c64ac36e53d5599f8700976085) (client 9.256.x; Electro Dragon, Electro Titan and the Royal Ghost postdate it). No native executable parity is claimed.

**Split attack timer (these families only).** [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs) splits `AttackSpeed` into a post-hit recovery and a hit-timer windup. The recovery is `CoolDownOverride`, else `AttackSpeed − 1500` above 1,500 ms, or `AttackSpeed − 200` for healing rows. It also turns `NewTargetAttackDelay` into an initial charge, `clamp(AttackSpeed − delay, 0, AttackSpeed)`. [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs) freezes the hit timer during recovery and strikes when the windup is full. The period stays `AttackSpeed`. A fresh target is struck after `recovery left + windup − charge`. The first hits are Electro Dragon 2.875 s (explicit 625 ms recovery), Golem/Golemite/Lava Hound/MOMMA 1.5 s, Bowler 0.4 s (1,100 ms charge, 700 ms recovery), and Witch 0.7 s. The Royal Ghost waits 1.0 s: its 2,400 ms delay exceeds `AttackSpeed`, so the clamped charge is 0. The same component keeps character targets in range up to `AttackRange + 256` units (half a tile). [LogicMovementComponent.GetAttackDist](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicMovementComponent.cs) approaches to `range − 32` units. Leaving range resets the hit timer only while it is still zero, so a windup that has started completes on its target while the unit chases. **Finding:** the earlier reading used by the frozen families (`wait = AttackSpeed − NewTargetAttackDelay`, no tolerance, cancellation on leaving range) coincides with this one for Dragon 7 and Balloon 8. It does not for PEKKA 8 (1.8 s rather than 1.5 s) or Valkyrie 7 (1.2 s rather than 0.3 s). Those two remain byte-identical in this historical boundary; recording version 152 below enables their split timing.

| Family                | Pinned values used                                                                    | Special mechanics and interpretation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electro Dragon 3      | 4,400 HP, 1,120 / 3.5 s, range 2.5, speed 1.6, flying, air+ground                     | **Chain:** a direct hit, then every `ChainAttackDelay` (128 ms) the bolt jumps to the nearest unstruck attacker within `ChainAttackDistance` (3 tiles) of the previous target, up to `ChainAttackDepth` (5) targets. Each jump deals `ChainAttackDamageReductionPercent` (20%) less than the previous hit, compounding: 1,120 → 896 → 716.8 → 573.44 → 458.75. The older `GetChainAttackTarget` picks the nearest unstruck, non-spawning enemy (one jump). Depth, delay and compounding follow [House of Clashers](https://houseofclashers.com/home-village/troops-elixir/electro-dragon) and search summaries of Fandom ("each successive hit 20% less than the previous"). Ties by attacker ID and both layers are local. **Death:** `ElectroDragonOnDeath` 3 casts `ElectroDragonDie` 6: six 85-damage hits of radius 2 tiles, the first at `DeployTimeMS + HitTimeMS` (1.9 s), then every 400 ms, on both layers. `RandomRadiusAffectsOnlyGfx=FALSE`, so hits land at `LogicSpell.CalculateRandomOffset` square offsets within 2.5 tiles (the first at the center), ported exactly with a local deterministic object seed. |
| Golem 8               | 7,500 HP, 168 / 2.4 s, range 1, speed 1.5, ground                                     | `DieDamage` 700 within 1.5 tiles, ground only (`AreaDamage` target type 1), on the first dead step (`DieDamageDelay` 0). `SecondaryTroop` Golemite ×3: `LogicCharacter.CheckSpawning` places ground spawns at the nearest passable point within 3 tiles. It pushes each at `59·globalId % 360 + 360·i/count` degrees by `SecondarySpawnDist` (1.5 tiles) over `2d / (3·PushbackSpeed)` = 512 ms, with `LogicMovementSystem.UpdatePushBack`'s ease (`1 − (t/T)²` of the way). Ground pushes stop at the first solid cell, using the battle's ground collision (client sub-tiles in version-44 native battles). Positions use the source integer sine table; the global ID is a local stand-in (the defender's negative ID, negated).                                                                                                                                                                                                                                                                                                                                                                                            |
| Golemite 8            | 1,440 HP, 42 / 3 s, range 0.5, ground                                                 | `DieDamage` 140 within 1.2 tiles. Pushed Golemites can be hit but do not act until the push ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Witch 4               | 470 HP, 115.5 / 0.7 s, range 4, splash 0.3, air+ground                                | `Witch_projectile` at 5 tiles/s with `DontTrackTarget`: the landing point is fixed at launch, and splash hits the target's layer there. **Summons:** the older timer starts at `SummonCooldown/4` (1.75 s) and resets to 7 s at zero. While below `SummonCooldown/8`, which equals the pinned `SummonTime` 875 ms, with a target, it summons `SummonTroopCount` 4 Skeletons (never above `SummonLimit` 12 living; at the limit the timer restarts). Then `SummonCooldown/6` (1.17 s) is an attack delay with no target. Summons are pushed 1.5 tiles radially over 512 ms (`SetSpawnTime`), then wait `SpawnIdle` 500 ms, inactive and untargetable. A Witch's death kills summons still being pushed (`CheckSummons`). Local: the summon check reads the target held entering the step.                                                                                                                                                                                                                                                                                                                                       |
| Skeleton 1 (summoned) | 30 HP, 25 / 1 s, range 0.4, speed 3, ground                                           | The Witch's `Skeleton` row, distinct from the Skeleton Trap's `Trap Skeleton` (700 ms). Native `chr_skeleton.sc` art with its `spawn` row during push and idle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bowler 4              | 470 HP, 211.2 / 2.2 s, range 3, splash 0.3, ground                                    | `trollBoulder_lvl3` tracks the target at 4.75 tiles/s and splashes the ground there. It then flies on at the same speed to a bounce point `ChainShootingDistance` (4 tiles) beyond the target's launch position along the throw, splashing again for full damage. Evidence is the older combat component's chained bounce positions (`CHAINED_PROJECTILE_BOUNCE_COUNT − 1` points spaced along the throw) and `LogicProjectile`'s bounce leg. That global is absent from the pinned client, so `ProjectileBounces=2` is read as total impacts (one bounce). Research's "3 tiles behind" predates the pinned 400.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Lava Hound 6          | Defensive row: 8,000 HP, 40 / 2 s, range 0.25, speed 2.5, flying, ground targets only | `hound_projectile` at 2 tiles/s. `DieDamage` 350 within 1.2 tiles, ground only. The defensive row's `SecondaryTroopCnt` is **13** (the offensive row, and this README previously, said 18). Flying pups start at the Hound plus the rotated `SecondarySpawnOffset` (1 tile). Each is pushed by `LogicRandom(globalId).Rand(d) + d/2` (d = 3.5 tiles, so 1.75–5.25 tiles) over `2d/(3·4)` ms, with the exact xorshift and a local seed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Lava Pup 1            | 50 HP, 35 / 1 s, range 2.25, speed 4, flying, air+ground                              | `tinyhound_projectile` at 3 tiles/s; spawned only by the Hound.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Electro Titan 2       | 7,700 HP, 300 / 1.5 s, range 1.25, speed 2, ground, air+ground                        | **Aura:** `AuraSpell` "Electro Titan Aura" 2 hits 40 every 400 ms (first at 400 ms after spawn) within 3.5 tiles, on both layers, with `HeroDamageMultiplier` 25%. It is centered on the living Titan and continues while she is stunned: the older aura spell is a separate object. It ends at her death. The older `LogicCharacter` creates aura spells only for team 0 (attackers), but that code predates the Titan. Defending auras damaging attackers follow the brief and public descriptions of Clan Castle Titans (search summaries of [Fandom](https://clashofclans.fandom.com/wiki/Electro_Titan), [Theria Games](https://theriagames.com/guide/clash-of-clans-electro-titans-detailed-guide/)). Uncertain.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Golden Dragon 1       | 32,000 HP, 1,750 / 1.25 s, range 2.5, splash 1, flying, air+ground                    | No other special fields; splash on the struck layer. Released from the 4×4 Foreboding Cave (no damage trigger; see Bunkers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| MOMMA 1               | 50,000 HP, 10,000 / 5 s, range 1.25, splash 3, ground, air+ground                     | 3,500 ms recovery and 1.5 s windup; splash on the struck layer. `HitEffect2 Super_Bomb` is presentation only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Royal Ghost 7         | 300 HP, 720 / 1 s, range 0.5, speed 2, ground                                         | `RoyalGhostAbility` (`IsInvisible`, `IgnoreObstacles`, `DeactivateAfterTime` 10,000 ms) is read as active from spawn (`ActiveAfterPlaceCommand`; trap spawns have no place command). While concealed it cannot be selected by attackers but still takes area damage (older `AreaDamage` skips only hidden objects), and it walks straight through walls and buildings. `FrostOnHitPercent` 50 for `FrostOnHitTime` 4,000 ms slows the struck attacker's movement and attack timers. Each hit refreshes it; poison and frost do not stack (local). [Fandom](https://clashofclans.fandom.com/wiki/Royal_Ghost) describes 12 s stealth for an older version; the pinned 10 s is used.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Ghost Trap.** See [the Ghost Trap reference](../ghost-trap/README.md).

**Defending Builder.** `src/game/defending-builder.ts` is a late-campaign family registered after the Builder's Hut turret (`stepDefendingBuilder`, `defenses` phase; state `battle.late.defendingBuilder`). It is rendered by `DefendingBuilderPresentation` in the late campaign scene. The nail turret lives in `builder-hut*.ts`; with both halves complete `BUILDER_HUT_READY` is true, so villages 80–85 and 87–89 are playable.

_Source values._ `Builders Hut` levels 2–4 name `DefenceTroopCharacter=Defending Builder`, `DefenceTroopCount=1` and `DefenceTroopLevel` 1–3. The character rows give HP 100,000–101,000, speed 2.5, `AttackRange` 50, `AttackSpeed` 750 and DPS −50/−60/−70, so each repair restores 37.5/45/52.5 HP. They also set `IsJumper`, `DeathShowTimeMS=1` and the empty `temp_dummya4` death export. The older healing split gives a 200 ms windup and 550 ms recovery. The importer now also pins `HEAL_STACK_PERCENT` (100, 100, 90, 90, 70, 40, 10, 0; the same table as `healing.ts`) and `ALLOW_REPAIR_AFTER_DAMAGE_TICKS` (0) into `catalog.json` as `repairGlobals`.

_Engine rules._ [LogicDefenceUnitProductionComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicDefenceUnitProductionComponent.cs) spawns each defence troop on its first tick in a battle state, at `(GetX(), GetY() + height << 8)` (the building's left edge, vertical middle), with no wake-up check. Each armed campaign hut (`builderHutActivation(battle, hut)` defined) therefore sends its Builder out on the first simulated step. Builders spawn in building order with positive IDs; garrison defenders use negative IDs. Campaign battles only start stepping at the first deployment or spell, which is also when [House of Clashers](https://houseofclashers.com/home-village/defenses/battle-builder) says the huts activate. The companion aura spell in `LogicBuilding.UpdateAuraSpell` waits for the combat wake-up instead (that would mean `readyAt`). Nothing ties the defence troop to it, so this choice is an interpretation. [LogicHitpointComponent.CauseDamage](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicHitpointComponent.cs) gives each healer one of eight slots per target:

- the healer keeps its slot, or moves up to an earlier free one;
- a new healer takes the first free slot, or index 8 (0%) when none is free;
- each heal holds the slot for 1,000 ms and is scaled by `HEAL_STACK_PERCENT[slot]`;
- a target at 0 HP is never healed, and HP is clamped to the maximum.

Five Builders on one building restore 90% of their sum. That matches [Fandom's Builder's Hut page](https://clashofclans.fandom.com/wiki/Builder's_Hut) (MediaWiki wikitext): "a 10% loss in repair per second".

_Public behaviour._ [Supercell, Battle Builders](https://supercell.com/en/games/clashofclans/blog/game-updates/battle-builders-2/): he cannot be damaged or targeted by troops, stops once his hut is destroyed, and a Lightning Spell resets his repair target. House of Clashers: he repairs only within 4 tiles of his hut, and runs back and hides when it collapses. The Fandom wikitext adds:

- he repairs _any_ damaged building except Walls and destroyed buildings (it even advises damaging a non-defensive building first);
- he keeps one building until it is destroyed or fully repaired;
- a defensive Rage raises the health per repair and his speed;
- Invisibility hides buildings from him.

_Implementation._ Candidates are standing, damaged, non-Wall, non-trap buildings whose footprint lies within 4 tiles of the hut center. Buildings hidden by Spell Tower Invisibility (`lateBuildingHidden`) are excluded, and a hidden target is dropped. He repairs through the split timer and the healer slots. Spell Tower Rage pulses record Builders in `defenderRage`, and `lateDefenderStats` scales each repair ×1.6 and adds the Rage speed. An attacker's Lightning resets the target of Builders inside it (`lateLightningStrike` in the earlier spell path; native offensive pulse impacts from recording version 58). Versions 52–57 preserve their previous native spell behavior. When his hut falls he walks to its footprint and hides. Repairs never return loot: `lateLootHitpoints` feeds `refreshBattleScore` the lowest HP a repaired building reached (`LogicHitpointComponent` steals resources only on HP loss). Local choices:

- the most damaged candidate first (HP fraction, then distance, then ID);
- the 4-tile radius is measured from the hut center to the footprint;
- he stands idle when nothing needs repair (no patrol);
- the looping build row plays from his spawn time.

The initial three-spell repair implementation predates the expanded spell roster. From recording version 57, full offensive freezes pause the Builder at his own position, including movement, repair/recovery timers and his original animation. From version 59, offensive native poison pulses also slow movement and repair/recovery clocks using their source percentages and duration, without damaging the invulnerable worker. Earlier recordings retain their original behavior. `ALLOW_REPAIR_AFTER_DAMAGE_TICKS=0` means no post-damage delay; the module throws if the pinned value ever changes.

**Presentation.** The generic character pipeline renders every family from its original graph (Golemite reuses the Golem graph at `Scale` 75). Summoned Skeletons play their non-looping `spawn` row while pushed out and idle. The Witch plays `attack2` (summon, 30-fps clip, `ActionFrame` 22) from each recorded summon event (local alignment). The Electro Dragon's directional die row uses its last facing. The boulder's three views (`DirectionCount` 6) follow the flight direction with reflection, and its bounce leg starts at body height without `StartOffset`. A concealed Royal Ghost walks without a path and is drawn at alpha 0.55 (local; no source value). The Electro Dragon chain now loads the original `Electro Dragon Attack Chain` effect, `electro_dragon_attack_01` emitter and complete `electro_dragon_fx_lvl1` graph on demand. Each recorded segment runs independently on the presentation clock, including its source 325–400 ms particle lifetime, fade and additive blend. The primary segment leaves the attack row's `attack_pivot` locator at the action frame; later segments connect recorded hit points at the local ground/air body height. Targeted beam stretching uses the shared local X-extent interpretation, not verified native executable attachment rules. The drawn jagged segment remains while art loads or a request fails; retry uses the shared battle-art loader. `garrison-late-effects.ts` derives attachment points and fallback shapes; `garrison-late-scene.ts` renders them. `Lightning Spell Hit`, `E_titanAreaDamage`, `Warlock Summon` and `trollBoulder_bounce` remain unimported. Death bolts with ground rings, a 3.5-tile aura ring and a summon ring retain local shapes. Seeks reproduce both paths. Sounds for these families remain pending.

**Verification.** `tests/garrison-late-families.test.ts` covers source values for every kind, the split timer, the integer sine table and LogicRandom, chain order/timing/damage, death bolts, Golem split and push, Witch summon cycle/limit/delay/kill, Bowler bounce, Lava Hound pups, Titan aura, boss splash, Royal Ghost stealth/frost and JSON-restoration determinism. `tests/garrison-late-families-replay.test.ts` replays portable recordings of The Arena, Ring of Power, Path to Pain, M.O.M.M.A's Madhouse, Dragon's Lair and Besieged. It checks backward seeks in two viewers, version-43 rejection, every mechanic occurring in the recorded Arena fight, 13 pups, and the inert Besieged roster. `tests/garrison-late-presentation.test.ts` covers graph/alias/projectile registration, state rows, boulder poses and effect shapes. `tests/garrison-chain-art.test.ts` checks source lifetime, recorded air/ground endpoints and backward seeks; `tests/browser/garrison-chain-art.spec.ts` checks lazy loading, pause/seek reconstruction, reduced detail, expiry, cleanup and failed-request recovery on desktop and phone.

`tests/defending-builder.test.ts` covers the Builder: source rows and repair globals, first-tick spawning (version 43 and practice stay passive), candidate ranking, commitment, healer slots (five Builders at 90%), Spell Tower Rage without ID collisions, Invisibility, Lightning resets, loot that is never returned, hiding and poses. `tests/defending-builder-replay.test.ts` replays village 84 (36 Builders, stacked slots) and village 88 (a Builder hiding after his hut falls), with backward seeks and version-43 rejection.

The Chromium specs (standard `playwright.config.ts`) use real deployments. `defending-troops-live.spec.ts` covers villages 69, 74, 75, 76, 83, 89 and 85 (Builders; they stand at huts and buildings, so the scene's depth sort often hides them). `defending-troops-lineup.spec.ts` renders all twelve kinds on clear ground, plus a wired Builder walking, repairing, idle and hidden. Screenshots are under `output/playtest/defending-troops/`. The earlier ten families' pose digest and tests are unchanged.

**Limits.** Apart from the Electro Dragon chain, native effect emitters for these mechanics are not imported (local shapes instead). Their sounds remain pending. The timer split, range tolerance, committed windup, chain compounding and tie order are interpretations from a 9.256 engine and public descriptions. So are summon timing, bounce count, pup randomness seeds, spawn global IDs, the defending aura, stealth activation at spawn and frost stacking. Castle exit cadence and reacquisition are shared with the earlier families. The Foreboding Cave damage trigger is not implemented. The Defending Builder's spawn timing, target choice, radius measurement and idle behaviour are interpretations. The loot model stays the existing HP-fraction approximation, only made monotonic for repairs. His repair sounds and effects are not imported. No GPU pixel witnesses were built for these families; the lineup and live screenshots were reviewed by eye.

```sh
PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-characters.py --check
npx vitest run tests/garrison-late-families.test.ts tests/garrison-late-families-replay.test.ts tests/garrison-late-presentation.test.ts tests/ghost-trap.test.ts tests/defending-builder.test.ts tests/defending-builder-replay.test.ts
npx vite --host 127.0.0.1 --port 5316 --strictPort   # then:
npx playwright test tests/browser/defending-troops-live.spec.ts tests/browser/defending-troops-lineup.spec.ts
```

## Native Poison slows (recording version 61+)

Native offensive poison already recorded its signed `SpeedBoost` and `AttackSpeedBoost` on garrison and Skeleton Trap defenders, but those combat loops did not read them. From version 61, movement and action clocks use those modifiers: level-1 Poison retains 74% movement and 65% attack-clock speed. Garrison recovery, windup and summons share the slowed action time; Baby Dragon Tantrum multiplies its existing boost into that clock. Poison leaves projectile flight, ongoing aura/death effects and spawn/push/idle timing unchanged. Expiry restores normal speed. Earlier recordings retain their original behavior. Defending hero and Builder rules have their separate version-60 and version-59 boundaries.

`tests/defender-poison.test.ts` covers actual native pulses, Dragon movement/attacks, ground and air Skeleton Trap movement, skeleton attacks, Tantrum, expiry, the version-60 boundary and exact portable replay seeks. `tests/browser/defender-poison.spec.ts` checks the original Dragon body, both replay rules and cleanup on desktop and phone.

## Poison overlap damage (recording version 62+)

The pinned [Poison reference](../official-wiki/spells-siege-super/poison-spell.md) says overlapping clouds ramp damage faster without exceeding maximum DPS. The previous defender path applied a full damage tick for every cloud, so two level-1 clouds dealt 72 HP per 400 ms at full exposure instead of the 36 HP maximum. Version 62 keeps the faster early ramp and limits combined damage to the strongest active effective DPS, after hero/Guardian scaling. Overlaps retain the strongest slow and latest expiry. Versions 61 and earlier keep their previous calculation.

Local pulse interpretation: each defender has a damage allowance of one native pulse, replenished by elapsed battle time times maximum effective DPS. This bounds simultaneous and staggered clouds while preserving discrete native pulse hits; it is not a verified reconstruction of the client’s internal poison accumulator. The allowance resets after exposure expires.

`tests/defender-poison-overlap.test.ts` covers simultaneous/staggered caps, the early ramp, spell ordering, strongest slows, hero/Guardian scaling, the version-61 boundary and portable replay reconstruction. `tests/browser/defender-poison-overlap.spec.ts` checks staggered cloud playback, original Dragon bodies and backward seeks on desktop and phone.

## Imported replay artwork

Later garrison character pages load from the replay’s roster as well as its buildings. A validated custom replay containing Dragon 5 can contain an ordinary Clan Castle and no late Goblin building; previously that setup loaded only the No Flight Zone character batch and left the Dragon’s body meshes on a missing texture. The roster now requests the existing late bundle before playback, with the same retry, seek reuse and home-time release behavior. This changes presentation only. `tests/browser/garrison-late-replay-art.spec.ts` verifies real graph textures, native bodies, backward seeks and cleanup at desktop and phone sizes.

## Poison allowance clock (recording version 63+)

A larger simulation update can cross several poison pulses from each cast. Native spells process those pulses in cast order, so a later cast can present an earlier pulse time after the first cast already advanced the shared allowance clock. Version 63 keeps that refill timestamp at the latest processed time. Earlier pulses can spend the remaining allowance but cannot refill elapsed time again. The native spell and summon processing order stays unchanged. Version 62 and earlier preserve their recorded calculation.

`tests/native-poison-clock.test.ts` checks the cap with updates from 0.05 to 10 seconds, the version-62 boundary and exact portable reconstruction of recorded one-second steps. `tests/browser/native-poison-clock.spec.ts` checks those larger-step recordings, native bodies, backward seeks and both replay rules on desktop and phone.

## Idle garrison Poison avoidance (recording version 64+)

The pinned [Poison reference](../official-wiki/spells-siege-super/poison-spell.md) says idle defenders leave the cloud, and `USE_POISON_AVOIDANCE` is true in the client globals. Released garrison troops now do so when no eligible attacker remains. Native poison pulses record each cloud’s point, radius and boost deadline; overlapping active clouds are considered together. Ground troops use their existing wall-jumping pathfinder, and flyers move directly. A surviving attacker takes priority over avoidance. Poison’s movement slow and Freeze still apply, and original character poses face the escape path. Earlier recordings keep their original idle behavior.

Local exit choice: sample sixteen directions on each cloud boundary, choose the nearest candidate outside all active clouds, keep it within the map, and reject standing building footprints for ground troops. The 0.125-tile boundary margin and tie order are deterministic local choices, not verified native navigation. This implementation covers released garrison troops; version 65 adds idle Hero and Skeleton Trap avoidance below; Guardian avoidance remains unverified. Invulnerable Defending Builders keep repairing rather than avoiding poison.

`tests/poison-avoidance.test.ts` covers actual air/ground escape, combat priority, Freeze, overlapping clouds, map/building bounds, pulse expiry and portable backward seeks. `tests/browser/poison-avoidance.spec.ts` checks original Dragon bodies leaving the cloud, seek reconstruction, the version-63 boundary and cleanup on desktop and phone.

## Idle Hero and Skeleton avoidance (recording version 65+)

The shared avoidance rule now also covers idle defending Heroes and Skeleton Trap defenders, both explicitly named by the pinned Poison reference. Heroes wait clear of a poisoned home point, then resume their existing return-home behavior after the native cloud deadline. Static cloud records last through `firstHit + (NumberOfHits - 1) × interval + max(BoostTimeMS, interval)`, so leaving the damage area does not make a Hero immediately return to the active cloud. Eligible attackers still take priority, and Freeze still holds movement. Native health and movement speeds are unchanged; weak Skeletons can die while escaping. Version 64 and earlier keep their previous behavior. Guardian avoidance is not inferred from the other classes.

`tests/idle-defender-avoidance.test.ts` covers ground/air escape, native health, home waiting and return, combat priority, Freeze and exact portable backward seeks. `tests/browser/idle-defender-avoidance.spec.ts` checks original Hero and Skeleton bodies, expiry, seeks, old playback and cleanup at desktop and phone sizes.

## Shared attacker protection (recording version 143+)

Released Clan Castle troops now pass incoming damage through the same attacker protection
rules as defenses: invulnerability, damage reduction, temporary hitpoints and actual HP damage
accounting. Previously their direct, area, chain, death, aura and poison paths subtracted HP
directly. A real Dragon 7 could therefore injure a Warden during Eternal Tome. Original source
damage, target layers, event times and the garrison engine's lethal zero floor are retained.
Poison advances its damage clock while protection is active, so blocked exposure cannot become
overdue damage after immunity expires. Continuous poison retains the existing end-of-interval
sampling convention rather than reconstructing sub-interval protection boundaries.

Primary attacks retain their negative defender ID for [Revenge Deck](../revenge-deck/README.md).
Splash bystanders, chains, death effects, aura pulses and poison do not count as direct hits.
Versions 142 and earlier preserve raw garrison damage. The capability is recorded only for a
setup containing garrisons, leaving unrelated recording state unchanged.

Coverage uses native Dragon, P.E.K.K.A, Valkyrie, Balloon, Electro Dragon, Electro Titan and
Headhunter damage, with full protection, partial shields, temporary HP and poison expiry.
An actual Castle release and Eternal Tome input verifies protection and resumed damage after
expiry. Portable forward/backward snapshots match in Node and desktop/phone Chromium, including
historical playback, original Hero art and read-only reduced-motion redraws.

## Original later-defender primary audio (recording version 146+)

The shared [troop sound importer](../../scripts/import-native-troop-sounds.py) now captures all
21 enabled garrison kinds at their 22 source VisualLevels. Each binding records its actual
character and row ordinal, including Defensive Super Minion 9 at row 6 and Defensive Lava
Hound 6. Golden Dragon, MOMMA and the trap-born Royal Ghost are included without becoming
attacking troop roster entries. All input tables and Ogg bytes use the existing pinned
[client manifest](../full-client/manifest.json).

The 19 later kinds play their declared deploy, committed attack, successful hit and death
samples. Projectile hits use captured `hitAt`, never the earlier launch time, and missed
targets produce no hit cue. Electro Dragon secondary arcs additionally play their original
chain and target-hit samples at each retained jump time. Stable attack ordinals keep cue keys
through history pruning; cue selection is read-only and reconstructs after seeks. Multiple
sound rows use the shared stable alternative-take convention. The existing Dragon/Balloon
sound path is retained exactly, and versions 145 and earlier keep later defenders silent.

Only three additional unchanged Ogg files are needed, totaling **41,338 bytes**:
`groy_dep_01.ogg`, `roysword_01.ogg` and `roysword_vo_01.ogg`. The catalog now contains **371
effects and 357 sounds (5.09 MiB)**; every other file is reused from the attacking troop pack.
An unreleased reserve warms its own source effects plus Golem/Lava Hound children and Witch
summons. An untriggered Ghost Trap warms Royal Ghost's samples. Existing sample decoding,
integrity, bounded retry, pause, seek, speed and voice limits own playback; loaded files are
shared with attacking troops. Defender-count changes also invalidate the loader's roster
cache. Unrelated setups request no additional samples.

Coverage checks all source bindings, the 19 newly sounding kinds, projectile success/misses,
chain clocks, expiry, future-event suppression, old playback and reserve/child preloading.
Actual Castle releases and a Ghost Trap/Lightning recording reconstruct complete portable
snapshots with exact version-145 physical equality after removing the audio capability flag.
Desktop/phone Chromium checks original bodies, actual Web Audio gain/pitch at replay speed,
pause, backward seeks, historical silence and reconnect recovery without advancing playback.

This version-146 boundary covers primary-event audio. Version 154 below adds Electro Dragon charge audio. Other pre-attack charging (including Bowler's
`trollAttack`), Witch summon effects, Electro Titan aura, death-spell effects and movement
still need their own source timing adapters. No native executable sound-scheduler parity is
claimed. The source profiles imported here all have zero `SoundDelay`; their existing combat
event clocks remain the local presentation alignment.

## Trap-born damage protection (recording version 147+)

Royal Ghosts use the garrison combat engine, but Ghost Traps can exist in a layout with no
Castle reserve. Version 143's protection gate checked only the reserve, leaving those Ghosts
on raw HP subtraction. A real trap release dealt 720 damage to a Giant with Eternal Tome's
100% shield active, and the same damage failed to advance a King's Snake Bracelet counter.

Version 147 enables the existing shared damage handler for a layout containing `ghost-trap`.
The same shields, invulnerability, temporary HP and actual-damage accounting now apply to a
trap-born Ghost. The defender's source stats, attack timing, frost and primary-hit identity
are retained. Existing Castle setups keep their version-143 boundary; trap-only recordings
through version 146 preserve their prior damage behavior. Ordinary layouts gain no new state.

Actual Warden/Tome and King/Snake Bracelet recordings cover a trap-only layout with no Castle.
The protected Giant retains full HP, damage resumes after Tome expires, and one unshielded
720-damage hit releases two source Snakes. Complete forward/backward portable snapshots match
in Node and desktop/phone Chromium for both versions. Browser checks inspect original Ghost,
Hero and Snake artwork, reduced motion and read-only redraws. Version 146's audio-only physical
comparison remains pinned to its own version so this subsequent combat fix is tested separately.

## Melee split timing (recording version 152)

The pinned 18.400.21 `characters.PEKKA` row 8 and `characters.Valkyrie` row 7 both declare
`AttackSpeed=1800` with no `CoolDownOverride`. Their VisualLevels are 8 and 7. PEKKA has no
`NewTargetAttackDelay`; Valkyrie declares 600 ms. Their source damage is 610 DPS × 1.8 = 1098
and 185 DPS × 1.8 = 333. The archived [PEKKA dossier](../official-wiki/troops/pekka.md),
revision **625276**, and [Valkyrie dossier](../official-wiki/troops/valkyrie.md), revision
**624089**, corroborate the troop stats; they do not establish executable first-hit timing.

The pinned older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
uses `AttackSpeed - 1500` for recovery when the override is absent and the interval exceeds
1500 ms. It turns a positive new-target delay into `clamp(interval - delay, 0, interval)`
initial charge. Applied through the existing local split controller:

| Defender | Recovery | Windup | Initial charge | Fresh first hit | Same-target period |
| -------- | -------- | ------ | -------------- | --------------- | ------------------ |
| PEKKA 8 | 0.3 s | 1.5 s | 0 | 1.5 s | 1.8 s |
| Valkyrie 7 | 0.3 s | 1.5 s | 1.2 s | 0.3 s | 1.8 s |

The former frozen path waited 1.8 and 1.2 seconds. Version 152 opts these two families into
split timing with separately cached stat variants; the unversioned source-reference API
retains its frozen values. It also uses the controller's half-tile character range tolerance
and finishes a committed windup while chasing the same target. A Valkyrie spin can still miss
when the target leaves her one-tile self-centered splash. Damage, area/layer rules, source
stats, projectiles, and other garrison families retain their prior behavior.

When a fresh target is acquired during recovery, the new melee path captures recovery at the
start of the step before applying its one attack-time advance. This avoids spending the same
tick twice. A switch immediately after a hit therefore needs 1.8 s for PEKKA or 0.6 s for
Valkyrie, including the 0.3 s recovery and the new target's initial charge. Poison/frost and
Freeze retain the existing action-clock rules. Other split families keep their historical
recovery accounting. Only carried PEKKA/Valkyrie garrisons enable the adapter; versions 151
and earlier retain their former controller. The older reconstruction corroborates the local
interpretation; native 18.400.21 executable timing remains unavailable.

`tests/garrison-melee-timing.test.ts` covers source values, first hits, same-target periods,
exact damage, recovery on retargeting, range tolerance, committed chase, Freeze, scoped
allocation and complete current/historical portable reverse seeks. Its portable fixtures use
real Castle releases, troop deployments and optional Freeze casts in a valid campaign setup.
`tests/browser/garrison-melee-timing.spec.ts` verifies full battle snapshots, original meshes,
read-only/reduced rendering and rewind on desktop and phone, including Freeze and thaw.

## Split-family recovery on retargeting (recording version 153)

The same source-derived split timer used above has two phases: post-hit recovery, then the
new target's initial windup. In the older local path, `recovery` was advanced at the start of
the tick and the reset `cooldown` then spent the tick again. A target acquired while recovery
was still running therefore released its next attack one 50 ms update early. Same-target
periods and first engagements were unaffected. Version 152 already fixed this for PEKKA and
Valkyrie; version 153 extends the single-advance accounting to the existing split families.

| Family / source VisualLevel | Recovery | Fresh target windup | Total after an immediate switch |
| --------------------------- | -------- | ------------------- | ------------------------------- |
| Electro Dragon 3 | 0.625 s | 2.875 s | 3.5 s |
| Golem 8 | 0.9 s | 1.5 s | 2.4 s |
| Golemite 8 | 1.5 s | 1.5 s | 3 s |
| Bowler 4 | 0.7 s | 0.4 s | 1.1 s |
| Defensive Lava Hound 6 | 0.5 s | 1.5 s | 2 s |
| MOMMA 1 | 3.5 s | 1.5 s | 5 s |

Values use the pinned 18.400.21 rows and the existing `splitTiming` interpretation of the
older engine cited above. This corrects local action-time accounting; modern native-executable
parity is unavailable. The clock uses recovery at the start of the update before spending its
single poison/frost-scaled attack-time increment. First-hit delays, same-target periods,
damage, paths, projectiles and source stats retain their existing rules. At a 50% poison
attack slow, the waits above double; there is still only one clock advance per update.

Only rosters carrying a split family with positive recovery allocate the adapter. Golem
children inherit it through their battle. Zero-recovery families, unrelated rosters and the
already corrected version-152 melee path need no new capability. Versions 152 and earlier
retain their historical timing for the later families.

`tests/garrison-recovery.test.ts` covers all six families, source timing, historical early
releases, ordinary periods, poison-scaled recovery, scoped allocation and complete portable
forward/reverse snapshots. Real-recording fixtures deploy a level-1 Archer and Golem, allow
actual defender fire to kill the Archer, and capture the defender acquiring and attacking its
new target. No hitpoints, damage or status is injected into portable recordings. The browser
spec `tests/browser/garrison-recovery.spec.ts` checks complete current/historical snapshots,
original meshes, rewind and read-only/reduced rendering on desktop and phone.

Actual Electro Dragon and Golem recordings restore the missing 50 ms while matching the
first attack, target death and switch time exactly. In the Bowler fixture, the projectile
kills after his recovery has ended, so the next release correctly stays unchanged. Controlled
Bowler checks separately cover a fresh target acquired while recovery is still positive.

## Electro Dragon charge audio (recording version 154)

The pinned 18.400.21 `characters.Electro Dragon` row 3 declares
`PreAttackEffect=Electro Dragon Pre Attack`. Its source effect names
`sfx/electro_dragon_sfx_atk_01.ogg`, volume 0.5, pitch 1 and delay 0. The unchanged 22,389-byte
sample is already in the shared catalog, pinned by SHA-256
`e2944a697345e194c07cf0fa3314e6c37e03ab521457d89082a028ba397bba91`.
The importer now records this extra binding for the defender's actual source row. No audio
file or effect is added, and the catalog remains 371 effects / 357 samples.

Version 154 captures the current charge's attack ordinal, target ID, active audio age and
last simulated update. The clock starts after recovery; a tick crossing recovery contributes
only its active remainder. Audio age then advances by active wall time rather than the
poison/frost-scaled attack time, matching the existing attacking Electro Dragon convention.
Full Freeze holds the age and suppresses the cue; resume reconstructs its original sample
offset. Target loss, release and death retire it. Stable ordinal/target keys distinguish
charges, and the original attack/impact/chain samples retain their own clocks.

Only carried Electro Dragon garrisons enable and warm this binding. Historical recordings
through version 153 retain their prior charge silence. Sound lookup and rendering do not
mutate combat. Normal and Freeze portable recordings match version-153 physical battles
exactly after removing the charge capability and per-defender audio metadata. The captured
clock is the local presentation alignment, not a claim of native executable sound-scheduler
parity. Original pre-attack particle coverage and Bowler's separate `trollAttack` timing
remain outside this sound binding.

`tests/garrison-pre-attack.test.ts` checks source cue gain/pitch, partial recovery crossings,
Freeze hold/resume, release silence, reserve preloading, scoped allocation, exact physical
parity and complete current/historical portable reverse seeks. The browser spec
`tests/browser/garrison-pre-attack.spec.ts` checks full Node/Chromium snapshots, actual decoded
Web Audio nodes, 0.06 mixer gain, 2× playback, sample start offsets, pause, rewind, reduced
motion and historical silence. A blocked 503 sample recovers on reconnect while the portable
replay stays paused, with unchanged battle state and no autoplay.
