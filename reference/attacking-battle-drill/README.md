# Surfaced Battle Drill attack phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six [Battle Drill rows](../full-client/combat.json) specify `AttackSpeed`
1,700 ms, no `CoolDownOverride` and no new-target charge offset. In the existing
[split-clock adapter](../attacking-giant/README.md), an attack interval above
1,500 ms without an explicit recovery override uses a 1,500 ms windup and the
remaining interval as recovery. This gives a **1.5-second fresh/repeat charge**,
**0.2-second recovery** and **1.7-second repeat period**. Modern executable
first-hit timing is not independently verified.

Before version 230, a Drill could damage its target immediately on surfacing.
Version **230** connects the surfaced single-target attack to the shared native
controller. Arrival still makes it visible to defenses and releases its
intrinsic surfacing spell at the existing time. The Drill then charges before
the first hit. Freeze/stun pause the charge; attack slowdown stretches it;
loss of the target cancels the hit. A committed defender retreating out of
range ends the exposed swing before the unit burrows and chases again, using
the existing Miner-family cancellation behavior.

Each ground-defender hit resolves once as a direct melee event, without an
empty native projectile. Air defenders remain ineligible. Damage is unchanged:
731–1,088 per hit at source tiers 1–6. The existing building attack adapter
and defense preference remain in place. Destroying one defense sends the Drill
underground toward another; arrival starts a fresh charge after recovery has
elapsed during travel.

The [version-225 surfacing correction](../battle-drill-surface-walls/README.md)
is retained: its fixed-point spell destroys nearby Walls and stuns eligible
defenses for two seconds in a 1.5-tile area. It does not repeat on every drill
hit. A spell already released still pulses if the caster dies before it lands;
the dead caster cannot complete its pending melee attack. Spawn warmup and
dig-up/dig-down presentation are outside this boundary, as are Clan Castle
cargo and manual release. See the [pinned mechanic comparison](../official-wiki/spells-siege-super/battle-drill.md).

All six original `SM_drill1..6_attack1_*` takes have **19 timeline frames at
30 FPS**, with action frame **four**. The shared phase offset places source
frame **three** at first and repeat contact. Backward/read-only sampling and
reduced motion retain their existing guarantees. Current Army Info shows the
fresh charge and recovery alongside the unchanged interval, damage, surfacing
stun, Wall destruction and healing immunity.

Only initial armies carrying Battle Drill enable `nativeBattleDrillWindup`.
Version 229 and earlier retain their complete prior states and omit the new
phase facts. Four version-229 recordings, spanning source tiers 1/6 and two
deployment distances, were captured twice and reconstructed through portable
forward/backward seeks before implementation. Full-state hashes remain pinned.

Model coverage exercises every tier, approach, fresh/repeat timing, surfacing
effects, interruption, slowdown, target/caster loss, a second defense, real
ground/air Castle encounters and retreating defenders. Shared Miner, Super
Miner, underground chase and surfacing-spell tests retain their historical
versions. Original-body sampling verifies both contacts and reduced motion.
Browser scenarios cover full replay states, historical phase/surfacing controls,
the original contact pose, read-only inspection, rewind and mobile/desktop
layouts; Army Info checks cover three viewports.
