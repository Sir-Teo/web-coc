# Native campaign reference

Extracted September 11, 2026 from Supercell's public client bundle **18.400.21**, fingerprint `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. This is reference data for replacing the twelve authored local villages; it is **not yet the playable campaign**. No downloaded artwork or executable game code is included.

- `catalog.json`: all 90 names, loot amounts, dependency references, recommended Town Halls and original nonempty CSV fields, including continuation rows. Building/trap IDs use the explicit native GlobalID, never the table row index.
- `npc-buildings.json`: focused native stats and visual-export fields for Town Hall levels 1–8, the passive Goblin Hut and the special Tutorial Cannon.
- `layouts.jsonl`: one JSON object per campaign stage, in map order. Main-village buildings, traps, obstacles and decorations are preserved verbatim, including positions, zero-based levels, defending-unit arrays and mode fields. Alternate/war layouts and unrelated home-save metadata are excluded.
- `provenance.json`: exact source URL prefix, SHA-256 of every downloaded file and generated artifact, plus a narrowly accepted malformed JSON suffix in `level/npc22.json`. That file contains a complete root object followed by unrelated duplicate home-save fields. All other unexpected trailing content is rejected.

Reproduce with `python3 scripts/import-native-campaign.py`; verify with `python3 scripts/import-native-campaign.py --check`. Raw sources are cached under `output/native-campaign-source`, fetched with verified HTTPS, and checked against the committed hashes on every run. The regular test suite checks the committed artifacts offline.

## Interpretation boundaries

Select records by `MapInstanceName = npc1` through `npc90`, not by `SinglePlayer`: that flag also includes many challenges, events and tryouts. Keep the original record IDs; for example stage 51 is `NPC51` but loads `level/npc49.json`. Multiple dependency rows and branching links must survive import. The dependency list alone does not prove whether every link is required to unlock a branch.

The opening is **Payback**, **Goblin Forest**, **Goblin Outpost**, **Rocky Fort**. Payback contains a special Tutorial Cannon. Goblin Huts appear at stage 2. They are passive buildings: their saved unit arrays are template state, not defending troops. NPC-level alliance defenders belong to a separate mechanic. At stage 51 X-Bows appear. Later levels require Inferno Towers, Eagle Artillery, Scattershots, Spell Towers, Monoliths, Giant Dragon and M.O.M.M.A behavior. Some native levels contain more than the current replay limit of 400 buildings. Do not substitute a generic building, discard special defenders, clamp levels or rescale positions to make an unsupported level appear complete.

Current native layout files sometimes retain alternate-layout fields on individual entities. Those fields are preserved for review; a future runtime adapter must explicitly choose the active position/mode. Native `lvl` values are zero-based. Obstacle/deco IDs remain native IDs and need their own asset/footprint mapping. Client loot tables establish the initial inventory, not the exact damage-to-loot rounding algorithm or overflow behavior.

Primary sources: [Single Player Attacks](https://support.supercell.com/clash-of-clans/en/articles/single-player-attacks-2.html) documents 90 villages, unlimited attack time, no trophy changes, and star-based progression. [December 2022 update](https://supercell.com/en/games/clashofclans/blog/release-notes/december-update-2022/) added the final 15 villages for TH13–15 and the Mega PEKKA achievement. [TH14 patch notes](https://supercell.com/en/games/clashofclans/blog/release-notes/full-patch-notes-th14-update/) describe displaying the remaining single-player loot in storage buildings.
