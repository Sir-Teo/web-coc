# Persistent village obstacles

The village's original eight tree/rock decorations now have saved 2×2-tile footprints. They block construction, moves, editor drags, and saved-layout restoration. Selecting an obstacle opens an anchored removal menu. Original tree and rock artwork is reused; the surrounding forest and flags remain scenery.

## Reference rules

- Supercell's [February 2025 update](https://supercell.com/en/games/clashofclans/blog/news/get-geared-up-for-the-latest-update--3/) removed the free-builder requirement for clearing obstacles. Removal here therefore works with every builder busy and never reserves one. The [March 2025 update](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/) identifies villagers as the workers; dedicated villager animations remain unfinished.
- The small-tree and small-rock entries in [ClashMetic's obstacle reference](https://www.clashmetic.com/obstacles) list 2×2-tile footprints, ten-second removal, three XP, and costs of 2,000 elixir and 500 gold respectively. These are the two supported obstacle types. They do not cover the game's other rock sizes, groves, special obstacles, or seasonal costs.
- The [Home Village obstacle reference](https://clashofclans.fandom.com/wiki/Obstacles/Home_Village) documents full cancellation refunds. Canceling here restores the charged resource and leaves the obstacle in place.
- The regular-obstacle reward cycle is documented in [this community sequence report](https://www.reddit.com/r/ClashOfClans/comments/1bg9fdk/) and [this later removal audit](https://www.reddit.com/r/ClashOfClans/comments/1bjtlyo/): `6, 0, 4, 5, 1, 3, 2, 0, 0, 5, 1, 0, 3, 4, 0, 0, 5, 0, 1, 0`. It totals forty gems over twenty removals, consistent with [Clash Ninja's average](https://www.clash.ninja/guides/how-to-unlock-5-builders-for-free). This is a community-documented regular cycle, not a claim to reproduce the official tutorial's separate initial-obstacle sequence.

Sources inspected September 11, 2026. Some obstacle reference pages were only available through indexed excerpts; official builder behavior was independently verified from Supercell's update notes.

## Persistence and interaction

Removal charges once and runs on village time for ten seconds. Players can cancel with a full refund or spend the displayed gem amount to finish immediately. Multiple removals may run concurrently. The obstacle continues to occupy its footprint until completion.

Completion removes the saved object, frees its tiles, grants three XP and the current cycle's gem reward, advances the saved cycle position, clears its selection, and destroys its scene sprite. Expired removals settle once on load. Simultaneous/offline completions use completion time followed by obstacle ID, so array ordering cannot reshuffle rewards. Cancellation never advances the cycle.

Home obstacles remain outside combat snapshots, targeting, troop movement and destruction scoring. They are hidden while viewing battles; timers can still finish at home during an attack. Returning home restores the remaining obstacle sprites.

Older saves without an obstacle field receive the authored obstacles only where their existing buildings leave clear ground. An explicit empty array stays empty. Validation rejects unknown types, duplicate IDs, out-of-bounds or overlapping footprints, malformed timer pairs, and invalid reward-cycle indices. Existing buildings are never displaced during migration.

## Verification and remaining work

Model tests cover blocked placement/moves/layouts, busy builders, resource charging and refunds, offline completion, gem finishing, cycle persistence, battle guards, legacy saves and malformed imports. Browser tests select an actual sprite, cancel and reload removal, finish it, build on the cleared footprint, and verify battle visibility on Chromium and WebKit.

Still missing: regrowth and its placement buffer, Gem Boxes, other ordinary and seasonal obstacles, shovel/stash behavior, obstacle achievements, dedicated villager work animations, and the official tutorial's initial reward sequence. The current release completes clearing of the authored obstacles; it does not yet provide the recurring obstacle economy.
