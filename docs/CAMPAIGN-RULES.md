# Single-player campaign rules

Updated September 11, 2026. The playable campaign still uses the twelve authored valley layouts and their local health/defense multipliers. The complete native 90-village reference is now preserved separately in [reference/campaign](../reference/campaign/README.md); it has not yet replaced those layouts.

## Timing and results

Campaign scouting waits indefinitely for the first troop, hero or spell. Combat has no timeout: destruction, exhaustion of usable attackers/spells, surrender or suspending a committed attack resolves it. Trophy balances are unchanged on wins, losses and surrender. One star unlocks the next authored village; later attempts can improve saved stars. Local practice retains its 30-second preparation and 180-second attack limit and does not consume troops, spells or campaign inventory.

This follows Supercell's [Single Player Attacks](https://support.supercell.com/clash-of-clans/en/articles/single-player-attacks-2.html) rules for unlimited time, unchanged trophies and star-based progression. The native campaign's branches still need separate unlock interpretation; they must not be flattened to this local sequential progression.

## Finite loot

Each authored village now has a persistent gold/elixir inventory. Scouting shows what remains. Damage removes loot from the inventory; only the portion that fits the attacker's snapshotted storage headroom is credited. Excess is lost, reported separately in the result. Defeat and mid-attack suspension settle earned loot once. Returning from scouting costs nothing. A new attack restores building health and traps but never replenishes the remaining inventory. Depleted villages stay attackable for stars.

`Save.campaignLoot` uses the explicit `valley-v1` catalog identifier. Old saves lacking it receive one initial finite treasury per authored village when the first new result is settled. Existing resources, trophies, stars and old results are preserved. The old version allowed unlimited repeat loot and retained only 20 result summaries, so lifetime looting cannot be reconstructed reliably. This deliberate transition does not infer depletion from stars or subtract historical rewards. A future native campaign needs a distinct catalog and a migration preserving this authored progress.

Supercell's [TH14 patch notes](https://supercell.com/en/games/clashofclans/blog/release-notes/full-patch-notes-th14-update/) establish that campaign storage presentation reflects remaining level loot. [Community campaign documentation](https://clashofclans.fandom.com/wiki/Single_Player_Campaign) explicitly describes one-time resources and repaired buildings. Full-storage overflow is consistent with [reported single-player behavior](https://www.reddit.com/r/ClashOfClans/comments/dlchk5/ask_question_regarding_single_player_missions/); a current primary-source description of its precise accounting remains unavailable.

The allocation inside each authored layout is still local: storage weight 4, collector weight 1, Town Hall weight 2, paid proportionally to lost building health and rounded down per resource. Native payout intervals, storage allocation, Town Hall payout timing, overflow accounting, Dark Elixir and storage-fill artwork remain fidelity work. The finite inventory total and its source are separate from that damage-to-loot approximation.

## Replays and persistence

Combat version 25 snapshots both remaining enemy inventory and raid-limited storage headroom. Playback, seeking and standalone sharing reproduce loot and overflow without reading or changing the viewing village's inventory. Old combat versions remain readable as result records and are not reinterpreted by the new engine.

Idle campaign scouting produces no simulation changes or replay frames. Once combat begins, recordings allow 60,000 steps (50 minutes at the normal fixed 20 Hz), 2,000 actions, 700 carried troops and 100 carried spells. The live attack has no recording-related time limit; exceeding a recording budget keeps the result and marks why its replay is unavailable. Earlier recordings keep their previous 6,000-step/230-second validation limits. Playback and seeking retain the 100-step/8ms-per-update work limits; portable files remain capped at 512 KB. Save validation accepts full battle durations while rejecting malformed inventories and overflow values.

## Range-boundary correction

Removing the timer exposed a Wizard stalled indefinitely in authored stage 9. Its tile center was within range of the Town Hall, but the Wizard's actual sub-tile position was outside range. The route finder returned an empty path, leaving the troop unable to move or attack. It now keeps the final approach to the tile center for building targets as well as defending units. A focused regression reproduces the exact position and verifies that the Wizard moves into range and lands damage.

## Verification

The model suite passes 679 tests across 61 files. New cases cover unlimited scouting, attacks/replays past five minutes, full and partial depletion, overflow, defeat/suspension idempotency, older-save transition, replay isolation, invalid input, recording budgets and the range-boundary regression. The 288-battle campaign matrix now allows up to ten minutes for natural resolution and still requires a viable opening and a veteran three-star approach for every stage. It found and verified the range fix; the test does not force unfinished battles to count as complete.

Browser and production checks are in `tests/browser/campaign-rules.spec.ts` and `scripts/campaign-production-check.mjs`. Evidence is written under `output/playtest/campaign-*`. These cover the finite-loot map, no-limit scouting/combat HUD, full-storage feedback, accessible surrender, reload, long replay seeking and portable replay import/export. The production check exercises the built bundle without developer controls, including an offline Chromium reload.
