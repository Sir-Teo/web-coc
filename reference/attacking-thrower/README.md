# Attacking Thrower source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All four `characters.Thrower` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=2500`,
`CoolDownOverride=1250`, no new-target delay, six-tile range and ground/air
targets. The explicit override gives **1.25 seconds of fresh windup and 1.25
seconds of recovery** within the 2.5-second period under the established
[older-engine split-clock adapter](../attacking-giant/README.md). Modern
executable first-hit timing remains unverified. The
[official-wiki comparison](../official-wiki/troops/thrower.md) agrees with the
period, range and single-target hit values 475/525/575/600. Its documented
movement-speed difference is outside this change.

## Recording version 183

Carried Throwers charge after reaching a building, blocking Wall or defending
unit. The source `ThrowerProjectile1`–`4` releases after the charge and travels
at seven tiles per second. Ground and air defenders now receive that native
projectile instead of the generic arrow; damage lands at impact and remains
single-target. A released shot survives removal of its shooter.

Freeze/stun hold the phases, attack-speed modifiers scale them, and the timer
carries sub-step overshoot. Changing targets spends remaining recovery once
before a fresh charge. Original body poses follow the recorded action offset.
Only an initial army carrying Thrower enables the change. Versions 182 and
earlier keep their immediate first release and original defender projectiles.
No source stats, movement, assets, audio, village save format or replay envelope
change.

## Validation

`tests/attacking-thrower-windup.test.ts` covers all four source tiers from near
and far, the explicit override, release/impact separation and flight speed,
both defender layers, no neighboring splash, Freeze through charge/recovery,
speed scaling and overshoot, replacement targets, blocking Walls and shots
whose shooter has left. Actual Cannon, Golem and Dragon fights reconstruct
complete portable states in both time directions under versions 182 and 183.

`tests/browser/attacking-thrower-windup.spec.ts` checks current and historical
recordings on phone and desktop, original charge and projectile meshes, exact
seeking, read-only drawing, reduced motion, asset requests and WebGL health.
Screenshots go to ignored `output/playtest/`.
