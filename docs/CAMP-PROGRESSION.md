# Army Camp progression

Audited September 11, 2026. `src/game/camp-stats.ts` holds undiscounted Home Village camp values. The same table drives training capacity, occupant distribution, building health, shop placement, upgrades and the Info panel. The playable TH1–8 catalog stops at camp level 6; levels 7–8 remain supported for older accepted saves.

| Level | Housing | Hitpoints | Elixir cost to reach level | Build / upgrade time |
| --- | ---: | ---: | ---: | --- |
| 1 | 20 | 100 | 200 | 1 minute |
| 2 | 30 | 150 | 2,000 | 5 minutes |
| 3 | 35 | 200 | 10,000 | 30 minutes |
| 4 | 40 | 250 | 100,000 | 2 hours |
| 5 | 45 | 300 | 250,000 | 6 hours |
| 6 | 50 | 330 | 500,000 | 12 hours |
| 7 | 55 | 400 | 1,500,000 | 2 days |
| 8 | 60 | 500 | 2,500,000 | 3 days |

TH1–8 camp count limits are **1, 1, 2, 2, 3, 3, 4, 4**. With the existing per-Town-Hall camp level ceilings, maximum housing is **20, 30, 70, 80, 135, 150, 200, 200**. Constructing camps contribute no housing until completion. Upgrading camps retain their current capacity until the new level completes. There is no base housing allowance independent of camps.

## Sources and scope

- [Supercell’s June 16, 2025 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/) explicitly set camp health at levels 1–6 to 100, 150, 200, 250, 300 and 330. This is the primary source for these health values.
- [The Home Village Army Camp reference](https://clashofclans.fandom.com/wiki/Army_Camp) lists housing, counts, level requirements, costs and durations, and states that camps remain usable during upgrades. The page also contains Builder Base and Clan Capital material; those tables do not apply here.
- [Gibi Arena’s Army Camp upgrade table](https://www.gibiarena.com/en/clash-of-clans/upgrades/army-camp) independently corroborates the supported health, cost, duration, count and level tables. Its footer identifies game data dated September 1, 2026, processed September 3 via the independent ClashKing project. This is a secondary reference, not an official Supercell source.

No Gold Pass, event, magic-item or other discounts are applied. These values do not establish parity for the remaining building economy, troop statistics, spell housing, campaign rewards or the complete catalog. Camp artwork is a separate unfinished pass.

## Existing progress and replay compatibility

New villages now contain one completed level-two camp at TH2, with the original 22 prepared troops fitting within 30 spaces. Existing villages keep every camp and prepared troop, including older above-count layouts and armies above the corrected capacity. Above-capacity armies can deploy or remove troops normally; new preparation must fit. The Army drawer shows a persistent explanation at phone portrait and landscape sizes. No permanent bonus capacity is attached to an old save.

Camp health is recalculated from its level while preserving the saved damage fraction. Already purchased construction and upgrade timestamps are unchanged, even when the new price or duration differs. This change does not alter save geometry or require another save-format bump. Old paid training queues still complete through the existing one-time migration.

Camp health affects combat, so new recordings use combat version 14. Older snapshots keep their original health and remain available as incompatible result summaries. They are never rewritten to pretend they were recorded with the current combat rules.

## Verification

Six dedicated model cases cover every supported level, Town Hall housing ceilings, the starter, absence of camps, construction, exact upgrade deadlines across reload, duplicate-charge prevention, legacy camps and above-capacity troops, damaged health, actual deployment and retained old replay health. The campaign matrix uses separate valid camp housing and troop research fixtures and checks all 144 attacks.

Three dedicated browser scenarios exercise real Info/Upgrade controls, paid deadline persistence and completion, TH2/TH3 shop availability, and a legacy army across reload plus real remove/add controls at 320×740 and 844×390. The existing Giant unlock scenario now also verifies capacity after reload: an unlocked five-space Giant remains unavailable at 27/30 housing until room is made. Detailed run evidence is recorded in [QA.md](QA.md).
