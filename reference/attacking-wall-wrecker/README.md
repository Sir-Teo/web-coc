# Attacking Wall Wrecker ram phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six [Wall Wrecker rows](../full-client/combat.json) specify `AttackSpeed`
1,300 ms and `CoolDownOverride` 550 ms, without a new-target charge offset.
The established [split-clock adapter](../attacking-giant/README.md) gives a
**0.75-second fresh/repeat windup** and **0.55-second recovery**. Its repeat
period remains 1.3 seconds. Modern executable timing is not independently
verified; this is the local interpretation of the pinned columns.

Before version 229, Wall Wrecker used the generic immediate-hit controller.
An arriving ram could damage its target on the engagement sample. Version
**229** connects it to the shared native attack controller: reaching a building
or blocking Wall begins a full charge before contact. Freeze/stun pause active
attack time without resetting progress, attack-rate slowdown stretches the
charge, and loss of the committed target cancels the pending hit. Recovery and
fractional-step accounting use the existing controller.

The source body uses `Siege_Machine_Ram1..6_attack1_*` takes in
`chr_siege_machine_ram`: **32 timeline frames at 30 FPS**, action frame **21**.
The presentation phase offset aligns source frame **20** with ram contact,
including the second attack and backward sampling. Reduced motion keeps the
existing still pose. Facing follows the committed Wall when the Town Hall
remains the unit's movement destination.

The existing ram damage shape and routing remain in place. Ordinary source
hits are 325–871; Walls take the existing separate 10× multiplier once,
3,250–8,710. The shared windup retains Wall Wrecker's existing exclusion from
defender retaliation, matching the native route's Wall-breaker fight trait.
This boundary does not add Clan Castle cargo, manual release, objective
self-destruction or new Overgrowth/pathing behavior. Source mechanics and
remaining distinctions are recorded in the [pinned comparison](../official-wiki/spells-siege-super/wall-wrecker.md).

Only initial armies carrying Wall Wrecker enable `nativeWallWreckerWindup`.
Version 228 and earlier retain the generic immediate ram and omit the new
fresh-charge/recovery Info rows. Current Info lists the two phases alongside
the existing interval, Wall damage, Town Hall destination and healing immunity.

Before implementation, four complete version-228 recordings were captured
twice and reconstructed through portable forward/backward seeks: source tiers
1/6, deployed at two distances. Full-state SHA-256 hashes remain pinned.
Model coverage exercises all six tiers, approach/engagement, repeat timing,
Freeze/stun, slowdown, target loss, real blocking Walls and version capability
scope. Original-body tests verify first/second contact poses, read-only sampling
and reduced motion. Browser scenarios cover current/historical complete replay
states, source poses, inspection and phone/desktop rendering; the existing siege
Army preview scenarios cover phase values and navigation at three viewports.
