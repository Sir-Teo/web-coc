# Mortar progression and normal-mode combat

The September 12 [original-client reference](../reference/mortar/README.md) confirms these ten rows and retains all eighteen source levels, thirteen projectile families and their original artwork. This foundation does not yet change live progression or the local shell trajectory described below.

Re-audited September 11, 2026 against the modern Home Village wiki tables and applicable Supercell release notes. This supersedes the earlier CoC Guide-only audit. See [source reconciliation](DEFENSE-SOURCE-AUDIT.md) for discrepancies, dates and remaining gaps. Prices are undiscounted gold; times apply to reaching the listed level.

Source: [Mortar](https://clashofclans.fandom.com/wiki/Mortar).

| Level | Gold | Time | HP | DPS | Damage per shell |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 5,000 | 30m | 400 | 4 | 20 |
| 2 | 25,000 | 1h | 450 | 5 | 25 |
| 3 | 90,000 | 2h | 500 | 6 | 30 |
| 4 | 180,000 | 3h | 550 | 7 | 35 |
| 5 | 300,000 | 6h | 600 | 9 | 45 |
| 6 | 500,000 | 8h | 650 | 11 | 55 |
| 7 (legacy) | 900,000 | 12h | 700 | 15 | 75 |
| 8 (legacy) | 1,200,000 | 18h | 800 | 20 | 100 |
| 9 (legacy) | 1,600,000 | 20h | 950 | 25 | 125 |
| 10 (legacy) | 1,800,000 | 1d | 1,100 | 30 | 150 |

Counts at TH1–8 are **0, 0, 1, 1, 1, 2, 3, 4**. The existing level ceilings already match: **0, 0, 1, 2, 3, 4, 5, 6**. Normal mode fires every **5 seconds** at ground targets from **4 through 11 tiles**, including the boundary. The **1.5-tile splash radius** is also described by the [Mortar wiki](https://clashofclans.fandom.com/wiki/Mortar).

## Shared behavior

`defense-progression.ts` supplies health, gold, duration and DPS. Construction, paid upgrades, Info comparisons and combat share those values. Running buildings retain their current level until the timer completes. Home ticks reconcile older health while preserving the saved damage fraction and existing paid timestamps. Older excess Mortars and accepted levels 7–10 remain in the village, although they cannot be newly built or upgraded through the TH8 catalog.

Shells retain their launch damage and land at the selected location, so moving troops can escape. Flying units are unaffected. Destroying the Mortar does not cancel an airborne shell; ending the battle does. Practice uses the table directly; campaign defense multipliers remain scenario tuning. Replay version 6 identified the table change; version 7 aligns shell impact rounding with other projectiles. Older result summaries remain readable.

## Verification and limits

Tests cover exact-resource upgrades through every playable level, timer boundaries, builder reservations, saved health/timestamps, count gates, legacy levels, actual shell damage at every accepted level, blind-spot/range boundaries, ground/air targeting, 20/30/60 fps cadence and the battle deadline. Existing tests also cover splash, dodging, destroyed launchers, campaign viability and replay reproduction. Browser checks inspect the Info panel, restore paid upgrade timers after reload, and select a Mortar's range rings without ending scouting.

Mortars have distinct original artwork for playable levels 1–6; accepted legacy levels 7–10 share level 6. See [MORTAR-ART.md](MORTAR-ART.md). The footprint is now 3×3 with legacy layout migration; see [NATIVE-GRID.md](NATIVE-GRID.md). Artwork beyond level 6 and geared-up burst mode remain unfinished. Shell flight duration (1.15s) remains local tuning; this audit does not establish native projectile speed, animation or knockback parity.

## Shell presentation

Mortar fire now emits a flash at the visible barrel and a launch sound. The iron shell arcs from that same point while its shadow follows the ground beneath it. Shells use the shared projectile effect lifecycle, so pause holds the complete pose, playback speed follows battle time, seeking rebuilds the correct shell, and leaving a battle clears it. Impacts use a ground-aligned splash effect with the simulation radius instead of a blast floating above the target. The previous warning ellipse at the target has been removed.

Reduced motion suppresses shell flight and launch flashes, including when enabled while a shell is airborne. A brief static ground burst still appears when damage lands. A one-nanosecond comparison tolerance, shared with the other projectile path, prevents accumulated rounding from delaying an otherwise due shell by a full simulation frame. Browser regressions exercise these transitions and compare visual impact with actual damage.
