# Mortar progression and normal-mode combat

Audited September 11, 2026 against the undiscounted [Mortar reference](https://coc.guide/defense/mortar). Prices and times apply to reaching the listed level. No event or Gold Pass discount is included.

| Level | Gold | Time | HP | DPS | Damage per shell |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 5,000 | 2h | 400 | 4 | 20 |
| 2 | 25,000 | 3h | 450 | 5 | 25 |
| 3 | 100,000 | 4h | 500 | 6 | 30 |
| 4 | 200,000 | 6h | 550 | 7 | 35 |
| 5 | 300,000 | 12h | 600 | 9 | 45 |
| 6 | 560,000 | 18h | 650 | 11 | 55 |
| 7 (legacy) | 1,300,000 | 1d | 700 | 15 | 75 |
| 8 (legacy) | 1,900,000 | 1d 12h | 800 | 20 | 100 |
| 9 (legacy) | 2,500,000 | 1d 18h | 950 | 25 | 125 |
| 10 (legacy) | 3,500,000 | 2d | 1,100 | 30 | 150 |

Counts at TH1–8 are **0, 0, 1, 1, 1, 2, 3, 4**. The existing level ceilings already match: **0, 0, 1, 2, 3, 4, 5, 6**. Normal mode fires every **5 seconds** at ground targets from **4 through 11 tiles**, including the boundary. The **1.5-tile splash radius** is also described by the [Mortar wiki](https://clashofclans.fandom.com/wiki/Mortar).

## Shared behavior

`defense-progression.ts` supplies health, gold, duration and DPS. Construction, paid upgrades, Info comparisons and combat share those values. Running buildings retain their current level until the timer completes. Home ticks reconcile older health while preserving the saved damage fraction and existing paid timestamps. Older excess Mortars and accepted levels 7–10 remain in the village, although they cannot be newly built or upgraded through the TH8 catalog.

Shells retain their launch damage and land at the selected location, so moving troops can escape. Flying units are unaffected. Destroying the Mortar does not cancel an airborne shell; ending the battle does. Practice uses the table directly; campaign defense multipliers remain scenario tuning. Replay version 6 identified the table change; version 7 aligns shell impact rounding with other projectiles. Older result summaries remain readable.

## Verification and limits

Tests cover exact-resource upgrades through every playable level, timer boundaries, builder reservations, saved health/timestamps, count gates, legacy levels, actual shell damage at every accepted level, blind-spot/range boundaries, ground/air targeting, 20/30/60 fps cadence and the battle deadline. Existing tests also cover splash, dodging, destroyed launchers, campaign viability and replay reproduction. Browser checks inspect the Info panel, restore paid upgrade timers after reload, and select a Mortar's range rings without ending scouting.

Mortars have distinct original artwork for playable levels 1–6; accepted legacy levels 7–10 share level 6. See [MORTAR-ART.md](MORTAR-ART.md). They still use the prototype 2×2 footprint. Native 3×3 layout migration, artwork beyond level 6 and geared-up burst mode remain unfinished. Shell flight duration (1.15s) remains local tuning; this audit does not establish native projectile speed, animation or knockback parity.

## Shell presentation

Mortar fire now emits a flash at the visible barrel and a launch sound. The iron shell arcs from that same point while its shadow follows the ground beneath it. Shells use the shared projectile effect lifecycle, so pause holds the complete pose, playback speed follows battle time, seeking rebuilds the correct shell, and leaving a battle clears it. Impacts use a ground-aligned splash effect with the simulation radius instead of a blast floating above the target. The previous warning ellipse at the target has been removed.

Reduced motion suppresses shell flight and launch flashes, including when enabled while a shell is airborne. A brief static ground burst still appears when damage lands. A one-nanosecond comparison tolerance, shared with the other projectile path, prevents accumulated rounding from delaying an otherwise due shell by a full simulation frame. Browser regressions exercise these transitions and compare visual impact with actual damage.
