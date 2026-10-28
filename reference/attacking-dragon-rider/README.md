# Attacking Dragon Rider source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six `characters.DragonRider` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1200`,
no cooldown override or new-target delay, flying movement and ground/air
targets. The established [older-engine split-clock adapter](../attacking-giant/README.md)
therefore gives **1.2 seconds of fresh and repeat windup, with zero recovery**.
Modern executable first-hit timing remains unverified.

The [official-wiki comparison](../official-wiki/troops/dragon-rider.md) agrees
with the period and single-hit damage 408/444/480/516/564/588. The pinned client
range is 3.5 tiles; the wiki reports four. This change retains the client range.

## Recording version 184

Carried Dragon Riders charge after reaching a building or eligible defender.
The source `DragonRiderProjectile`, `DragonRiderProjectile 2` and
`DragonRiderProjectile 3` travel at 9.6 tiles per second. Defender shots now
retain their native projectile and flying origin; damage lands at impact.
Building shots retain their existing native flight. Ground and air targets
receive single-target damage.

Defense preference remains active during a charge. Riders ignore defending
units while defenses remain, and a committed ordinary building remains selected
until it falls. Flying movement crosses Walls. Freeze/stun hold the charge,
attack-speed modifiers scale it, and original poses use its recorded offset.

The existing delayed crash blast remains independent: 700–1200 damage by tier,
two-tile radius, 0.6 seconds after defeat, including defeat during a frozen
charge. Its existing ground-only layer is retained; the modern executable's
blast-layer behavior is not verified by this timing work.

Only an initial army carrying Dragon Rider enables the change. Versions 183
and earlier preserve their previous first release and defender shots. Source
stats, assets, audio, village save format and replay envelope are unchanged.

## Validation

`tests/attacking-dragon-rider-windup.test.ts` covers all six source tiers from
near and far, release and impact separation, flight speed and origin, both
defender layers, defense preference, committed building targets, Wall crossing,
Freeze and speed scaling. Separate cases retain the delayed crash blast at
every tier without suppressing it during Freeze. Actual Air Defense, Golem,
Dragon and two-Monolith fights reconstruct complete portable states in both
time directions under versions 183 and 184.

`tests/browser/attacking-dragon-rider-windup.spec.ts` checks current and
historical recordings on phone and desktop, original body and projectile
meshes, charge pose offsets, exact seeking, read-only drawing, reduced motion,
asset requests and WebGL health. It also seeks both ways across actual
Monolith defeats and delayed crash blasts. Screenshots go to ignored
`output/playtest/`.
