# Clash of Clans experience coverage

Updated September 11, 2026. This is an implementation inventory, not a claim of complete live-game parity. The current build is a local village-and-campaign game. A working menu or similar-looking sprite does not count as implementing the corresponding CoC system.

## Baseline

The target is the modern Home Village loop, with original generated artwork. Two verified rules changed the direction of this pass:

- Supercell removed troop, spell, and siege-machine preparation costs in [Home Village Changes, June 2022](https://supercell.com/en/games/clashofclans/blog/news/home-village-changes-2/).
- Supercell announced removal of troop, spell, and siege-machine training time and hero recovery time in [Troop Training: The Wait Is Over!, March 2025](https://supercell.com/en/games/clashofclans/blog/news/troop-training-the-wait-is-over/).

Those sources establish free, instant army preparation. They do not establish that this game's catalog, housing progression, economy, combat numbers, or campaign reproduce the live game. Those remain separately tracked below. Future catalog additions need their own current primary-source checks.

## Defense pass

Cannon, Archer Tower, Mortar, Air Defense and Wizard Tower now have explicit reference tables for playable health, cost, duration and normal-mode damage, with compatible handling of accepted older levels. Count limits and TH ceilings are explicit. See [Air Defense / Wizard Tower](AIR-WIZARD-PROGRESSION.md), [Cannon / Archer Tower](DEFENSE-PROGRESSION.md), and [Mortar](MORTAR-PROGRESSION.md). Mortar has six individual level sprites and walls have eight; other buildings still share artwork tiers. These audits do not establish parity for troop stats, campaign tuning or the full defense roster.

Bombs, Giant Bombs, Air Bombs, Spring Traps, and Wizard Towers are now playable, with original artwork, shop categories, correct catalog unlock labels, placement, upgrading, and save persistence. Traps are concealed in scouting, campaign miniatures, pointer picking, and the text snapshot until triggered. They never block troop paths or deployment, cannot be attacked or damaged by spells, and do not count toward destruction. Each new practice or campaign attack starts with fresh trap state; upgrading traps remain inactive. Campaign stages 2–12 include authored traps, and stages 6, 8, 10, and 12 include Wizard Towers.

Spring behavior follows Supercell’s [October 2025 update notes](https://supercell.com/en/games/clashofclans/blog/release-notes/get-ready-for-ranked-update/): one largest-housing target, ejection within capacity, a vertical toss and stun for larger survivors, and prevention of simultaneous spring stacking. Heroes take half damage and remain in the village. Explicit modern reference tables now drive all four traps’ damage, costs, timers, capacities and level-dependent blast radii; placement is instant and does not require a free builder. See [TRAP-PROGRESSION.md](TRAP-PROGRESSION.md) for source discrepancies and verification. Spring airtime/height, Giant Bomb fuse, Air Bomb flight and campaign tuning still use local values. Real asynchronous defenses and rearming between those attacks require a server.

The campaign audit still requires a viable opening and a three-star approach for a developed veteran army at every stage. The final fortress defense multiplier was reduced from 1.7339 to 1.55 to keep it reachable after adding splash and traps.

## Army and practice pass

| Experience | Implemented behavior | Verification |
| --- | --- | --- |
| Prepare an army | Troops and spells are immediately ready, without an elixir charge. Whole batches must fit. Existing paid queues complete once on load. | Zero-elixir preparation, capacity boundaries, legacy-save tests; browser add/remove flow. |
| Edit a composition | Remove individual troops or spells; clear the army; replenish the previous campaign composition atomically. Editing is blocked during battle. | Model tests for underflow, battle guards, and no partial replenishment. |
| Spell housing | Rage and Healing take two spaces; Lightning takes one. The current simplified factory provides two spaces per level. | Mixed-spell capacity tests and real browser buttons. |
| Quick armies | Three named local troop-and-spell presets. Save and equip in one tap; capacity and facility requirements checked before applying. | Reload persistence, malformed-save rejection, escaped names, rapid edits, phone layout. |
| Practice a defense | Attack a copy of the actual village layout and building levels. No army/spell consumption, loot, trophies, or campaign progress. Upgrading defenses stay inactive. | Pointer deployment and casting; full-clear simulation; village and army unchanged; repeat-attack reset. |
| Battle history | Last 20 completed campaign/practice attacks, with stars, destruction, loot, duration, and deployed composition. Stored with the village. | One-time results, record limit, reload and save validation; phone and desktop log views. |
| Attack again | Campaign results replenish the last composition and launch the same stage; a preparation failure returns to the Army drawer. Practice results launch a fresh village copy. | Browser checks for fresh scouting, restored army, empty unit list, and one result record. |

## Hero and progression pass

See [HERO-PROGRESSION.md](HERO-PROGRESSION.md) for verified reference rules, playable behavior, migrations, tests, and explicit simplifications. Original sprite sources and prompts are in [HERO-ASSETS.md](HERO-ASSETS.md).

## Remaining gaps

“Partial” means playable but incomplete or simplified. “Absent” means there is no corresponding gameplay system.

| Area | State | Concrete gap / completion criterion |
| --- | --- | --- |
| Village building and editing | Partial | Placement, wall runs, collection, builders, upgrades, undo/redo, and layout slots work. Trees and rocks now block building placement and support paid removal, cancellation, offline completion and persistent gem-cycle rewards. Trees regrow every eight hours on eligible ground with a one-tile buffer, a 45-obstacle cap and deterministic offline catch-up; saved layouts and undo/redo respect new trees. Connected wall-row selection and same-level bulk upgrades now support instant gold/elixir purchases with builder and resource checks. Connected rows can also move and rotate through a full-row preview, collision validation and atomic placement, with single-step edit undo/redo. Wall levels 1–8 now have distinct original artwork and material-specific connections shared with placement previews. Missing the full obstacle/decorations catalog, additional placement conveniences, and the live game's full building catalog. |
| Progression and economy | Partial | Town Hall 1–8 building level ceilings and a progression browser are implemented. Dark elixir drills/storage support hero upgrades. Counts, housing, prices, timers and capacities remain local; full content/unlock tables and live-value validation remain unfinished. |
| Army preparation | Partial | Instant/free preparation, weighted spell housing, and three presets work. The supported seven troops and three spells have facility-level unlocks across preparation, research and presets. Need remaining troop/spell types, richer composition editing, army sharing, and live-game housing tables. See [ARMY-UNLOCKS.md](ARMY-UNLOCKS.md). Multiple barracks and factories remain a simplified legacy model. |
| Combat targeting and movement | Partial | Ground pathfinding, flight, resource/defense preferences, wall breaches, splash, and defense target retention work. Need broader targeting/pathing audits, remaining unit behaviors, interactions, and balance across larger armies. |
| Defenses and traps | Partial | Cannons, archer towers, mortars, air defenses, Wizard Towers and four hidden trap types work. Cannon, Archer Tower and Mortar normal-mode damage, range and intervals now use explicit reference tables (see DEFENSE-PROGRESSION.md and MORTAR-PROGRESSION.md). Missing concealed attacking defenses, remaining trap/defense catalog, complete level art, exact live statistics, and asynchronous defensive attacks. |
| Heroes | Partial | King unlocks through Hero Hall at TH4, deploys independently, uses a once-per-attack ability at TH7, upgrades with dark elixir/builders, and returns next attack. Missing other heroes, defending heroes, equipment/passive abilities, pets, hero slots/presets and exact tuning. |
| Troop and spell roster | Partial | Seven troops and three spells. No complete elixir/dark-elixir roster, siege machines, donated units, super troops, or complete spell research. |
| Raid rules and rewards | Partial | Scouting, timed attacks, three-star scoring, partial resource loot, surrender, and results work. Campaign repeat loot and trophy changes use local rules; they do not reproduce live single-player/multiplayer reward rules. |
| Practice / friendly challenges | Partial | Local attacks against your own village work. No shared friendly challenges, challenge restrictions, or friend/clan interaction. |
| Attack history / replay | Partial | The latest five local campaign/practice attacks have deterministic snapshot/input playback, pause, restart, timeline seeking, and 1×/2×/4× speeds. Standalone replay files can be exported and opened without replacing a village. Twenty result records remain available. Missing defense history, revenge, hosted sharing links, and cross-version playback. See [REPLAYS.md](REPLAYS.md). |
| Matchmaking and defense | Absent | No real opponents, persistent defensive attacks, shields, revenge eligibility, matchmaking pools, ranked seasons, or competitive reward calculations. These need an authoritative service and asynchronous battle handling. |
| Accounts and durable progress | Partial | IndexedDB, backup/import/export, offline loading, and single-tab ownership work. No accounts, cloud sync, cross-device recovery, server time, or authoritative inventory. |
| Clans and social play | Absent | No clan creation/search, chat, donations, clan castle defenders, wars, leagues, games, or clan capital. No fake online activity is displayed. |
| Other bases and modes | Absent | No Builder Base, Clan Capital combat, event modes, or alternate-mode progression. |
| Live activities and inventory | Absent | No season challenges, rotating events, magic items, event currencies, trader inventory, or purchase systems. |
| Art and animation | Partial | Original isometric village artwork and readable portraits; most buildings use two broad tiers, while walls have eight level sprites and Mortars have six. Balloon, Spell Factory and Air Defense now have original dedicated silhouettes, including upgraded building variants. Need per-level silhouettes, directional movement/attack/death sets, complete destruction states, and richer environmental animation. |
| Audio and feedback | Partial | Generated effects and optional ambient tones. Need a complete music/ambience mix, distinct unit/defense cues, action timing, and audio settings for more devices. |
| Device and accessibility quality | Partial | Automated Chromium/WebKit smoke checks, touch/pointer input, portrait/landscape layouts, focus handling, and reduced motion. Physical-device performance, long suspend/resume sessions, and accessibility review remain unverified. |

## Next implementation order

1. Extend the explicit building level tables to counts, troop/spell unlocks, housing and economy. Expand troop/spell and defense catalogs together and re-audit the campaign.
2. Expand the playable King into a complete hero system: equipment and Blacksmith, defending heroes, hero slots, and additional heroes.
3. Keep combat-version compatibility explicit as the roster expands; local seeking and portable replay-file sharing now work. Hosted sharing and historical combat engines remain later work.
4. Build accounts, authoritative saves and battle outcomes, then real matchmaking/defense. Clan and war features depend on that foundation.
5. Expand remaining modes and activities while improving per-level art, directional animations, audio, and physical-device quality.

The order favors changes that can be played and verified end to end. It is not a promise that one local build pass can eliminate every gap in a long-running online game.
