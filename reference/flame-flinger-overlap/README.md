# Shared Flame Flinger building poison

The [pinned Flame Flinger comparison](../official-wiki/spells-siege-super/flame-flinger.md)
identifies `FireSpiritExplosion` as the projectile's persistent burn. The existing
defender-poison adapter shares a highest-strength damage cap across overlapping
clouds. Building pools previously tracked exposure per cast and applied every
pool's full poison damage independently.

A real level-one Flame Flinger released two projectiles, then died. Once both
pools had reached full exposure, a 0.4-second window dealt 66 damage to a storage:
two flat hits plus twice the 32-point poison pulse. A Wall took 114: two 25-point
flat hits plus both poison pulses. Version **227** shares the poison budget,
reducing these steady windows to **34** and **82**. Flat hits remain per area;
the [version-226 Wall preference](../flame-flinger-wall-pulse/README.md) is retained.

The older public native reference supports a shared poison state for buildings:
[`LogicLevel.AreaPoison`](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Level/LogicLevel.cs#L2366)
allows building hitpoint components, and
[`LogicHitpointComponent.SetPoisonDamage`](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicHitpointComponent.cs#L59)
keeps a shared strongest damage value and exposure clock. This reference predates
Flame Flinger; exact modern executable timing remains unverified. The local
implementation follows the game's existing defender-poison allowance, ramp and
six-second exposure-reset convention, rather than introducing another clock.

Only new initial armies carrying Flame Flinger enable
`nativeFlameFlingerBurnOverlap`. A building stores shared exposure, expiry and a
refilling poison budget. The strongest active rate limits sustained damage;
one discrete pulse of allowance preserves staggered hits. The clock never moves
backward. Other building poisons keep their prior per-cast path.

Eligible fixed attacking `FireSpiritExplosion` areas resolve their due pulses
in scheduled-time order, breaking ties by cast ID. This happens when their first
entry reaches the spell phase; unrelated casts retain the surrounding cast-order
path. A small scan chooses the next due pool without per-frame event arrays.
This keeps shared budgets consistent across reversed cast storage, staggered
areas and overdue updates. The existing defender damage cap also receives these
Flame Flinger events in physical order. Ordinary cleanup, first-pulse effects,
flat damage, source levels, area geometry, immunity and expiry remain in place.

Version 226 and earlier retain their complete states and prior guide. Four old
recordings, covering tiers 1/5 from two distances through real overlapping pools,
were captured twice and compared through portable forward/backward seeks before
implementation. Their full-state hashes remain pinned. New recordings run the
same comparisons. Model checks cover every tier, single-pool lifetime damage,
simultaneous/staggered/mixed-level pools, expired exposure, caster loss, large and
irregular updates, reversed storage order and defender-poison chronology.
Single-pool cross-version health comparisons allow floating-point rounding;
each version's portable state still reconstructs exactly.

Current Info adds the source 80–130 sustained burn DPS cap and explains that
areas share it while their small flat hits remain additive. The three-projectile
burst, flight scatter and attack phases remain outside this correction.
Browser checks compare old/new portable states, original bodies, read-only
rendering, rewind and historical/current guide labels. The normal Info matrix
covers both research extremes at phone, landscape and desktop sizes.
