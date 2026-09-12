# Single-player campaign rules

Updated September 12, 2026. The campaign screen now lists the native 90 villages from the pinned public client bundle. The runtime enables the first 50 layouts and marks missing mechanics Coming soon. Names, initial loot, buildings, traps, levels, hitpoints and scenery positions come from [reference/campaign](../reference/campaign/README.md). There is no authored health or defense multiplier in native attacks.

Goblin Picnic now includes its hidden Santa Trap, original animated components and five timed strikes; [the Santa implementation](SANTA-TRAP.md) separates source facts from engine and particle interpretations. Obsidian Tower includes its five level-three Skeleton Traps and all twenty defending skeletons. Rat Valley, Brute Force, Bouncy Castle and Full Frontal include their native Pumpkin Bomb placements, damage and reconstructed animation. All first 50 stages are reachable under the current alternative-dependency interpretation. Stages 51–90 need later defenses, levels, additional modes or garrison behavior. Unsupported entities are never replaced, dropped or level-clamped to enable a map. Completing these mechanics remains required for a complete campaign.

Pumpkin Bombs deal 25 ground splash damage, trigger within 1.5 tiles and affect a three-tile radius. Their two-second fuse is inferred from native action frame 48 divided by the clip's 24 fps; the 44-frame animation is held at its last frame until damage resolves. Source facts and unverified timing/playback details are retained in [the Pumpkin Bomb reference](../reference/pumpkin-bomb/README.md). The Pumpkin Bomb pass verified 847 model tests, including 144 native battles, eight affected browser cases per engine at DPR 2, and production checks in both engines. See [QA.md](QA.md) for evidence and limits.

## Timing and results

Campaign scouting waits indefinitely for the first troop, hero or spell. Combat has no timeout: destruction, exhaustion of usable attackers/spells, surrender or suspending a committed attack resolves it. Trophy balances are unchanged on wins, losses and surrender. Native dependency edges determine unlocks; Payback and Goblin Forest are always open. Later attempts can improve saved stars. Local practice retains its 30-second preparation and 180-second attack limit and does not consume troops, spells or campaign inventory.

This follows Supercell's [Single Player Attacks](https://support.supercell.com/clash-of-clans/en/articles/single-player-attacks-2.html) rules for unlimited time, unchanged trophies and star-based progression. Multiple native dependencies are interpreted as alternative paths (OR). This matches the branching map interpretation but still needs direct native-client interaction verification; the source records alone do not establish the Boolean rule.

## Finite loot

Each village has a persistent gold/elixir/Dark Elixir inventory. Villages without a Dark Elixir reward keep their two-resource battle display. Scouting shows what remains. Damage removes loot from the inventory; only the portion that fits the attacker's snapshotted storage headroom is credited. Excess is lost, reported separately in the result. Defeat and mid-attack suspension settle earned loot once. Returning from scouting costs nothing. A new attack restores building health and traps but never replenishes the remaining inventory. Depleted villages stay attackable for stars.

`Save.nativeCampaign` has the explicit `goblin-v1` identifier, 90 star entries and 90 remaining-resource entries, including reserved Dark Elixir balances. It is initialized when a native result settles. The old twelve-village `Save.campaignLoot` (`valley-v1`), stars and result history remain intact. Old progress is never reassigned to a similarly numbered native village. Old results retain their original names; prior incompatible recordings remain summaries. The campaign UI now opens native villages, while legacy internal fixtures preserve the authored catalog.

Quest eligibility uses the larger of native or legacy total stars to preserve prior eligibility without double-counting both campaigns. Profile progress shows the native 270-star total.

Supercell's [TH14 patch notes](https://supercell.com/en/games/clashofclans/blog/release-notes/full-patch-notes-th14-update/) establish that campaign storage presentation reflects remaining level loot. [Community campaign documentation](https://clashofclans.fandom.com/wiki/Single_Player_Campaign) explicitly describes one-time resources and repaired buildings. Full-storage overflow is consistent with [reported single-player behavior](https://www.reddit.com/r/ClashOfClans/comments/dlchk5/ask_question_regarding_single_player_missions/); a current primary-source description of its precise accounting remains unavailable.

Native allocation gives equal shares to the Town Hall and matching resource storages; collectors contain no single-player loot. This follows community campaign documentation. Payout remains proportional to lost building health with local integer rounding. Legacy snapshots retain storage weight 4, collector weight 1 and Town Hall weight 2. Native payout intervals, exact rounding, Town Hall payout timing, overflow accounting and storage-fill artwork remain fidelity work. Dark Elixir now follows the same finite-inventory, matching-storage/Town-Hall allocation, capacity and overflow rules. Explicit zero inventory stays depleted after save/load; practice and replay viewing never credit the home village. The finite inventory total and its source are separate from that damage-to-loot approximation.

## Replays and persistence

Combat version 32 snapshots all three resources and preserves Dark Elixir in standalone replay files. New snapshots for villages with a Dark Elixir reward require bounded integer inventory and headroom, including explicit zero. Version 31 added native X-Bow targeting, ammunition and projectiles. Version 30 added campaign-only Santa Trap identity and deterministic timed strikes. Version 29 added level-three/four Skeleton Traps and distinct spawn positions for each full burst. Version 28 added the campaign-only Pumpkin Bomb identity and its damage/fuse rules. Version 27 added native catalog identity, scenery and layouts up to 600 entities to the version-25 inventory/headroom snapshot. Playback, seeking and standalone sharing reproduce loot and overflow without reading or changing the viewing village's inventory. Old combat versions remain readable as result records and are not reinterpreted by the new engine.

Idle campaign scouting produces no simulation changes or replay frames. Once combat begins, recordings allow 60,000 steps (50 minutes at the normal fixed 20 Hz), 2,000 actions, 700 carried troops and 100 carried spells. The live attack has no recording-related time limit; exceeding a recording budget keeps the result and marks why its replay is unavailable. Earlier recordings keep their previous 6,000-step/230-second validation limits. Playback and seeking retain the 100-step/8ms-per-update work limits; portable files remain capped at 512 KB. Save validation accepts full battle durations while rejecting malformed inventories and overflow values.

## Range-boundary correction

Removing the timer exposed a Wizard stalled indefinitely in authored stage 9. Its tile center was within range of the Town Hall, but the Wizard's actual sub-tile position was outside range. The route finder returned an empty path, leaving the troop unable to move or attack. It now keeps the final approach to the tile center for building targets as well as defending units. A focused regression reproduces the exact position and verifies that the Wizard moves into range and lands damage.

## Earlier verification (authored catalog)

The model suite passes 679 tests across 61 files. New cases cover unlimited scouting, attacks/replays past five minutes, full and partial depletion, overflow, defeat/suspension idempotency, older-save transition, replay isolation, invalid input, recording budgets and the range-boundary regression. The 288-battle campaign matrix now allows up to ten minutes for natural resolution and still requires a viable opening and a veteran three-star approach for every stage. Two cases naturally finish beyond three minutes; the longest finishes at 527 seconds. It found and verified the range fix; the test does not force unfinished battles to count as complete.

Browser and production checks are in `tests/browser/campaign-rules.spec.ts` and `scripts/campaign-production-check.mjs`. Evidence is written under `output/playtest/campaign-*`. These cover the finite-loot map, no-limit scouting/combat HUD, full-storage feedback, accessible surrender, reload, long replay seeking and portable replay import/export. The production check exercises the built bundle without developer controls, including an offline Chromium reload.

Final browser validation passed **31 scenarios per engine** in Chromium and WebKit at DPR 2, plus four settled Chromium capture reruns. Campaign views cover 1440×960, 390×844 and 844×390. The new production check passed in both engines with exact five-minute replay results, saved inventory reload and portable sharing; Chromium also passed these flows after an offline reload. WebKit offline behavior was not checked. The landscape army tray no longer overlaps Surrender, and the control remains at least 44 CSS pixels high.

## Native scenery and targeting

`logic/obstacles.csv` and `logic/decos.csv` identify all used scenery as passable in combat. A base `Passable = FALSE` is overridden by `IsFadedAndPassableInCombat = TRUE`. These objects never create deployment exclusions or pathfinding barriers. Their IDs and positions survive save/replay sharing. Generated visual recreations cover 16 silhouettes; several native variants share artwork. Faded objects render at 50% alpha, an authored approximation. Neither this opacity nor native pixel identity is verified.

The special Tutorial Cannon retains its 1.6 damage every 0.8 seconds but its native BuildingClass is Npc. Defense-preferring troops therefore treat it as an ordinary target. Goblin Huts remain passive; their saved army arrays do not spawn hostile troops.

## Dense-layout pathfinding

The native combat matrix exposed expensive route searches in Chimp in Armor and Choose Wisely. Their resource armies resolved naturally, but each simulation consumed tens of seconds of CPU. A stable binary heap replaces the A* frontier's linear scans and computes each node's distance heuristic once. First-in tie ordering is preserved. A golden route digest covers dense native layouts and both melee/ranged approaches; the same routes survive the optimization. Both slow cases then simulated in under one second on this workstation, and all 132 native army/layout combinations passed. This is local CPU evidence, not a physical-phone performance certification.

## Native verification

825 model tests pass, including all 132 native battle combinations and full-layout/replay/save checks. Twelve final affected browser scenarios pass per engine at DPR 2. General and campaign production checks pass in Chromium and WebKit; Chromium additionally verifies offline reload and portable sharing with exact remaining loot. The source, runtime data, build cache, logs and known gaps are captured in `output/playtest/native-campaign-verification.json`. The complete game, remaining campaign mechanics, native pixel identity and physical-device qualification remain unfinished.


## Dark Elixir and defense mode groundwork

The native adapter now recognizes X-Bows and Dark Elixir Storage, maps current X-Bow ground/air and Skeleton Trap air modes by source ID, coordinates and level, and rejects unmatched/duplicate modes. An independent comparison against all 90 original layouts verifies all 125 X-Bow ammunition values (1,500) and current attack modes. War/draft flags do not replace current modes.

This does not unlock stage 51. Invaders still requires Town Hall 9, Hidden Tesla 7 and Bomb Tower 3; subsequent villages add more unsupported levels and mechanics. Dark Elixir settlement and browser tests use explicit supported-entity fixtures with the catalog reward, without weakening the real village guards. They cover half-damage allocation, full-storage loss, suspension, idempotent settlement, depletion after reload, portable replay/rewind, old-record compatibility and invalid snapshot rejection.

The groundwork pass verified 928 model tests across 76 files, TypeScript compilation, and three Dark Elixir browser cases per engine (Chromium and WebKit, DPR 2) at desktop, portrait and landscape sizes. Captures/logs are under `output/playtest/dark-loot-*`. These fixture checks establish resource handling and layout, not implementation of the gated source villages.
