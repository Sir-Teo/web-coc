# Hero self-regeneration clocks

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The item comparisons retain the source regeneration values and 1,000 ms pulse interval:

| Equipment                                                        | Source ability            | First level | Final level    |
| ---------------------------------------------------------------- | ------------------------- | ----------- | -------------- |
| [Giant Gauntlet](../official-wiki/heroes-pets/giant-gauntlet.md) | `Regeneration`            | 6 HP/s      | 40 HP/s at 27  |
| [Healer Puppet](../official-wiki/heroes-pets/healer-puppet.md)   | `Regeneration`            | 6 HP/s      | 35 HP/s at 18  |
| [Action Figure](../official-wiki/heroes-pets/action-figure.md)   | `Regeneration`            | 6 HP/s      | 40 HP/s at 27  |
| [Electro Boots](../official-wiki/heroes-pets/electro-boots.md)   | `RCElectroRegeneration`   | 6 HP/s      | 45 HP/s at 27  |
| [Fire Heart](../official-wiki/heroes-pets/fire-heart.md)         | `DragonCrownRegeneration` | 50 HP/s     | 150 HP/s at 18 |

Previously, an absolute next-tick counter stayed on the Hero while death or Recall removed its
upkeep. Restoration then paid one missed heal per simulation frame. A real Electro Boots/Revive
recording received 12 HP inside the first 100 ms after its 60% resurrection heal. Six seconds held
in Recall caused the same burst for all five items. Separately, large uninterrupted simulation
steps handled only one due pulse, leaving the remainder to later frames.

Version 139 bounds the next pulse by one source interval after the current body's deployment or
latest successful resurrection. Recall creates a new body with its own deployment time; Revive
and Phoenix retain the canonical restoration time on the existing body. Old debt cannot cross
either boundary. The exact client pulse phase across restoration is not independently verified;
restarting the interval follows the existing initial-deployment convention.

Continuous living time resolves all due pulses at their scheduled times. The shared healing
rules apply individually: health cannot exceed its maximum, an ineligible actor receives no heal,
and Phoenix temporary life stays at 1 HP. Every due check advances the timer even when it cannot
heal, so suppressed or full-health ticks do not become credit. Existing shared-ability combination
rules, source values, active abilities and other equipment effects are unchanged.

The capability is limited to loadouts with these five items. Version 138 and earlier keep their
previous counters and catch-up behavior. No assets, sound files or home-save changes are needed.

Independent first/final-level goldens check the table above. Dense and coarse steps agree for
continuously living Heroes, and dense uninterrupted states match version 138 apart from the
capability flag. Valid Monolith/Recall recordings check held HP, a fresh body ID, no premature
healing and the first new tick, with full portable forward/backward equality. Monolith/Revive
checks verify exactly 60% HP before the first new interval; Phoenix checks retain its healing
immunity. Full-health and unrelated-Hero cases cover timer consumption and scope. Browser checks
cover original Hero bodies, desktop/phone health, backward seeks, reduced motion, old playback
and aura-resurrection regressions.
