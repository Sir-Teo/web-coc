# Defense source reconciliation

Checked September 11, 2026. The previous CoC Guide-only audit reproduced older values despite recent crawl dates. This pass replaces costs and durations for all five implemented towers with the undiscounted Home Village tables and corrects low-level Cannon health/damage. Source freshness is assessed from the actual entries and release history, not the search engine's crawl timestamp.

## Accepted evidence

- [Cannon wiki](https://clashofclans.fandom.com/wiki/Cannon): normal-mode levels 1–12, including costs and times after the March 2025 reductions.
- [Archer Tower wiki](https://clashofclans.fandom.com/wiki/Archer_Tower): normal-mode levels 1–12. Its March 24 history documents each relevant cost/time reduction.
- [Mortar wiki](https://clashofclans.fandom.com/wiki/Mortar): normal-mode levels 1–10.
- [Air Defense wiki](https://clashofclans.fandom.com/wiki/Air_Defense): levels 1–10.
- [Wizard Tower wiki](https://clashofclans.fandom.com/wiki/Wizard_Tower): levels 1–8.
- Supercell's [March 24, 2025 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/) confirm the broader economy reductions. They do not provide the individual prices/times; those come from the wiki tables.
- Supercell's [June 16, 2025 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/) explicitly supply the corrected Cannon levels 1–6 health and damage. These agree with the wiki normal-mode table.

The wiki pages were available through indexed search content; direct page retrieval was blocked. The accepted tables include post-2025 updates. Their underlying crawl dates range from roughly two to five months before this audit, so this is not a live client capture or a guarantee against subsequent changes.

## Conflicts resolved

The Cannon wiki's burst-mode section retains obsolete health at levels 1–6 and the old level-6 price. Those levels cannot be geared up, and its normal-mode table agrees with the official Cannon health changes. Use the normal-mode values. Cannon level 6 uses 30 DPS; the official June notes also show 30, while the older guide shows 31.

Air Defense's history contains a mislabeled early-level time entry. Its statistics table gives level 1 a one-hour build and level 2 two hours; those are the accepted values. Other defenses retain their existing health and normal-mode combat values because the newer tables agree.

The corrected full tables are in [Cannon / Archer Tower](DEFENSE-PROGRESSION.md), [Mortar](MORTAR-PROGRESSION.md), and [Air Defense / Wizard Tower](AIR-WIZARD-PROGRESSION.md). Examples of the corrections:

| Destination | Previous gold / time | Corrected gold / time |
| --- | --- | --- |
| Cannon 6 | 100,000 / 2h | 60,000 / 1h |
| Archer Tower 2 | 2,000 / 15m | 2,000 / 2m |
| Mortar 6 | 560,000 / 18h | 500,000 / 8h |
| Air Defense 3 | 270,000 / 10h | 210,000 / 6h |
| Wizard Tower 6 | 1,000,000 / 1d | 660,000 / 12h |

## Save and combat behavior

New purchases use the corrected values. Existing paid construction and upgrade deadlines survive reload unchanged, even when their remaining duration exceeds the new table. Completing a job does not charge again. Current home health is reconciled while preserving the saved damage fraction; destination health applies on completion.

Combat version 10 marks the Cannon health/damage correction. Incompatible recordings retain their result summaries. Practice, campaign simulation and replay reproduction use the updated damage; campaign difficulty multipliers remain authored local values.

## Remaining fidelity work

The June notes also demonstrate obsolete low-level Wall health in the earlier wall audit. Wall health and economy require the same reconciliation next: the modern Wall table also lists free placement. Cannon TH1 limits must become two pieces and level 2; the current initial village starts at TH2, so this discrepancy does not affect its starting count. Town Hall, resource buildings, army facilities and troop progression still need complete modern tables. Full footprints, level-specific art, the missing catalog and multiplayer remain unfinished. These corrected tower tables do not establish overall production parity.
