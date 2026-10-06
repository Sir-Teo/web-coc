# Persistent village obstacles

## Client obstacles and the Gem Box

`python3 scripts/import-native-obstacles.py` (with `scripts/native_art/requirements.txt`) reads the pinned client's `logic/obstacles.csv` and renders each row's `sc/buildings.sc` export, writing `reference/obstacles/catalog.json` and `public/assets/obstacles-native/`. It imports 21 Home Village obstacles:

| Group | Obstacles | Clearing |
| --- | --- | --- |
| Regrow (weight) | Pine Tree (20), Square Bush (20), Fallen Tree (20), Tree Trunk 1 and 2 (10 each), Mushrooms (10), Square Tree and Square Tree 2 (5 each, 3×3) | 100–10,000 Elixir, 10–15 s, gems from the reward cycle |
| Starting stones | Small Stone 1–4, Stone Pillar, Large Stone 1–2 (3×3), Sharp Stone 1–5 | 500–20,000 Gold, 10–15 s; Sharp Stones pay no gems |
| Gem Box | Bonus Gembox | 1,000 Elixir, 30 s, 25 gems |

- **Regrowth.** Each eight-hour opportunity picks a kind by the client's `RespawnWeight` among the kinds with room, then a free site for its footprint (2×2 or 3×3) with the one-tile buffer. A field with room only for 2×2 growth never grows a 3×3 tree.
- **Gem Box.** One appears per `AppearancePeriodHours` (168: weekly) on a free 2×2 site, never two at a time; clearing one schedules the next no sooner than `MinRespawnTimeHours` (24) later. It pays its own 25 gems and leaves the reward cycle where it was. Its appearances run in the same time-ordered pass as regrowth and removals, so offline catch-up matches live ticks. Saves from before the Gem Box schedule their first one a week after loading. The client gives the period and minimum but not how it picks the moment within the week; one exactly per period is this game's reading.
- **Starting village.** A new village's eight 2×2 obstacles are now a mix of the client's kinds (Pine Trees, Square Bush, Fallen Tree, Mushrooms, three Small Stones) where the first village had trees and rocks. Older saves keep `trees` and `rocks`, which name the Pine Tree and Small Stone 1 rows.
- **Art.** Each obstacle draws the client portrait at source scale, centered on its export's origin line and anchored 88% down like the earlier sprites; the village's own kinds load at boot and a regrown kind's portrait when it first draws.

`tests/obstacle-catalog.test.ts` covers the imported rows, the regrowth weights (within 3% over 4,000 seeds), 3×3 sites, the Gem Box schedule and reward, Sharp Stones and save validation.

## Earlier obstacles

The village's original eight tree/rock decorations now have saved 2×2-tile footprints. They block construction, moves, editor drags, saved-layout restoration, and undo/redo into occupied ground. Selecting an obstacle opens an anchored removal menu. Original tree and rock artwork is reused; the surrounding forest and flags remain scenery.

## Reference rules

- Supercell's [February 2025 update](https://supercell.com/en/games/clashofclans/blog/news/get-geared-up-for-the-latest-update--3/) removed the free-builder requirement for clearing obstacles. Removal here therefore works with every builder busy and never reserves one. The [March 2025 update](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/) identifies villagers as the workers; dedicated villager animations remain unfinished.
- The small-tree and small-rock entries in [ClashMetic's obstacle reference](https://www.clashmetic.com/obstacles) list 2×2-tile footprints, ten-second removal, three XP, and costs of 2,000 elixir and 500 gold respectively. These are the two supported obstacle types. They do not cover the game's other rock sizes, groves, special obstacles, or seasonal costs.
- The [Home Village obstacle reference](https://clashofclans.fandom.com/wiki/Obstacles/Home_Village) documents full cancellation refunds. Canceling here restores the charged resource and leaves the obstacle in place.
- The [Home Village obstacle reference](https://clashofclans.fandom.com/wiki/Obstacles/Home_Village) also describes one vegetation spawn opportunity every eight hours, a 45-obstacle cap, a one-tile gap from buildings and other obstacles, and rocks never regrowing. The current implementation grows the supported small tree only; it does not reproduce the full vegetation distribution.
- The regular-obstacle reward cycle is documented in [this community sequence report](https://www.reddit.com/r/ClashOfClans/comments/1bg9fdk/) and [this later removal audit](https://www.reddit.com/r/ClashOfClans/comments/1bjtlyo/): `6, 0, 4, 5, 1, 3, 2, 0, 0, 5, 1, 0, 3, 4, 0, 0, 5, 0, 1, 0`. It totals forty gems over twenty removals, consistent with [Clash Ninja's average](https://www.clash.ninja/guides/how-to-unlock-5-builders-for-free). This is a community-documented regular cycle, not a claim to reproduce the official tutorial's separate initial-obstacle sequence.

Sources inspected September 11, 2026. Some obstacle reference pages were only available through indexed excerpts; official builder behavior was independently verified from Supercell's update notes.

## Persistence and interaction

Removal charges once and runs on village time for ten seconds. Players can cancel with a full refund or spend the displayed gem amount to finish immediately. Multiple removals may run concurrently. The obstacle continues to occupy its footprint until completion.

Completion removes the saved object, frees its tiles, grants three XP and the current cycle's gem reward, advances the saved cycle position, clears its selection, and destroys its scene sprite. Expired removals settle once on load. Simultaneous/offline completions use completion time followed by obstacle ID, so array ordering cannot reshuffle rewards. Cancellation never advances the cycle.

Home obstacles remain outside combat snapshots, targeting, troop movement and destruction scoring. They are hidden while viewing battles; timers can still finish at home during an attack. Returning home restores the remaining obstacle sprites.

Older saves without an obstacle field receive the authored obstacles only where their existing buildings leave clear ground. An explicit empty array starts clear and can receive new trees at future growth opportunities. Validation rejects unknown types, duplicate IDs, out-of-bounds or overlapping footprints, malformed timer pairs, and invalid reward-cycle indices. Existing buildings are never displaced during migration.

## Recurring growth

A saved schedule offers one new tree every eight hours. Each tree occupies a free 2×2 footprint with a one-tile buffer from every building (including walls, traps and construction) and obstacle (including removals in progress). The buffer applies to natural growth; players can still build directly beside an existing tree. The map edge does not require an additional tile outside the village. Trees and rocks both count toward the 45-obstacle limit; only trees regrow.

Eligible positions are enumerated and chosen with a saved local random state. A monotonically increasing saved ID prevents a new tree from inheriting a cleared tree's selection or sprite. These choices make live ticks, reloads and offline catch-up equivalent; they are local implementation decisions, not a reproduction of Supercell's private random algorithm.

Offline processing interleaves growth opportunities with removal completions in timestamp order. Simultaneous removals settle by ID before a spawn at that instant. An opportunity blocked by the cap or lack of space is skipped, never banked for instant spawning after clearing. Fully blocked intervals jump directly to the next event instead of iterating over every missed eight-hour period. Work is bounded by available obstacle capacity and pending removals, even after years away.

Legacy saves start their first growth interval when loaded or imported, without retroactively filling the village. Existing schedules survive reloads, and moving the clock backward does not reset them. Imports reject invalid schedule timestamps, random states and counters that could reuse an existing ID. Undo, redo and saved-layout restoration refuse positions covered by new trees while retaining the history for use after clearing.

New trees render with the existing original artwork and support the same selection/removal flow as authored trees. Growth continues at home during battles, but home obstacles remain absent from battle visuals and structured battle observations.

## Verification and remaining work

Model tests cover blocked placement/moves/layouts, busy builders, resource charging and refunds, offline completion, gem finishing, cycle persistence, battle guards, legacy saves and malformed imports. Regrowth tests cover exact timing, spacing, cap enforcement, long offline equivalence, removal/growth ordering, skipped opportunities, persistent IDs, schedule validation, imported-state initialization and undo/redo collisions. Browser tests select an actual sprite, cancel and reload removal, finish it, build on the cleared footprint, and verify battle visibility on Chromium and WebKit. Additional browser cases reload an overdue schedule, inspect/select/remove the resulting tree, verify its persistent identity, and confirm growth during an attack appears only on returning home.

Still missing: seasonal obstacles and their tombstones, shovel/stash behavior, dedicated villager work animations, and the official tutorial's initial reward sequence.
