# Attacking P.E.K.K.A windup and recovery

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All thirteen `characters.PEKKA` rows declare `AttackSpeed=1800`, no `CoolDownOverride`
and no `NewTargetAttackDelay`. The source-derived split is a 1.5 s windup, 0.3 s
recovery, zero initial charge and a 1.8 s repeat period.

The older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
subtracts default recovery above 1500 ms; [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
holds the windup during recovery and strikes when it fills. This is the interpretation
already used by [defending P.E.K.K.A](../garrison/README.md).
Modern native executable timing parity remains unavailable; this is a deterministic local
adapter corroborated by source tables and older code.

A read-only deployment/HP probe found that levels 1 and 13 previously dealt damage on
their first in-range update: 0.5 s after deployment at x=11.4 and 2.75 s at x=6.9.
The next hits followed 1.8 s later. Version 164 instead starts a full fresh 1.5 s windup
on engagement, then preserves the 1.8 s period with 0.3 s recovery. The initial engagement
update contributes its active 50 ms once. Freeze/stun holds both phases; existing poison
and boost modifiers scale both. Recovery retargets preserve the unspent recovery.

P.E.K.K.A keeps its existing movement and target-selection route. Ordinary buildings,
blocking walls and ground defenders prepare the same shared split controller. An alerted
defender can interrupt a building charge; a blocking wall remains committed while the
pursued defender stays out of reach. A defender entering melee range can interrupt that
wall windup and begins a fresh defender charge. The original actor faces the committed
wall and uses its captured action-frame offset for windup and follow-through. No
animation frames are invented.

Only initial armies carrying P.E.K.K.A or Siege Barracks enable this boundary, including
P.E.K.K.As released by real Siege Barracks. Versions 163 and earlier retain their previous
first hits, cadence and state shape. Damage, levels, artwork and audio assets are unchanged.
Existing local movement, geometry and renderer projection limits remain; exact native
pixels and modern executable combat timing are not asserted.

`tests/attacking-pekka-windup.test.ts` covers all thirteen levels from near and far deployment,
source damage, fresh/repeat timing, Freeze in both phases, faster/slower attacks, recovery
retargets, defender interruption, blocking-wall attacks and wall-facing/retarget behavior.
Portable fixtures use only ordinary troop deployment or actual Siege Barracks release,
checking complete current/historical battle snapshots in forward and reverse order.
`tests/browser/attacking-pekka-windup.spec.ts` verifies complete Node/Chromium states,
original level-1/13 and spawned meshes, captured action offsets, reverse seeks,
read-only/reduced-motion rendering and WebGL health on desktop and phone.

The original Magic Practice army now finishes at 19% destruction and triggers all three
Shrink Traps for 75 pulses each. The previous version-163 army finished at 14%, with two
75-pulse traps. Current coverage verifies every saved status snapshot, final state and
home restoration; a separate version-163 witness preserves the historical outcome and
full portable forward/reverse states. Expected campaign outcomes are versioned evidence,
not proof that later combat clocks must reproduce an older fight.

The Magic Practice browser witness compares effect/body registries by key, retaining every
mesh vertex, alpha and unit scale. The additional live trap exposed different Map insertion
orders after a reverse seek; keyed poses and complete battle states match. Allocation order
is not used as a presentation identity.
