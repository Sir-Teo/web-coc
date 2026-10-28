# Attacking Super Bowler phases and ground-defender boulders

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `characters.Super Bowler` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=2200`, `NewTargetAttackDelay=1100`, no cooldown override,
three-tile range, 1.75-tile/s movement and ground-only targets. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**0.4-second fresh charge, 0.7-second recovery and 2.2-second repeat period**.
The raw new-target delay means 1.1 seconds of precharge, rather than a new
1.1-second wait. Modern native executable first-hit timing is unverified.

Source DPS runs from 125 to 310, giving 275 to 682 damage per boulder. Every
tier specifies `ProjectileBounces=3`, three-tile bounce distance and radius
0.6 tiles. The existing building attack already launches the original
`SuperBowlerProjectile` at 4.75 tiles/s, with ballistic height/trajectory,
source scale and a shadow. Unlike a fixed-aim projectile, its source explicitly
sets `DontTrackTarget=FALSE`. The established tracking and next-building
bounce selection remain in use.

Actual version-200 Storage deployments release at 1.15 seconds when near or
1.85 seconds after a farther approach; both repeat every 2.2 seconds. The
selected-target delay can expire during approach. Against a real frozen Castle
Golem, the same unit instead releases a generic fourteen-tile/s arrow
immediately on arrival, with no native bounces or attack counter. Endpoint
tiers deal 275/682 primary damage in that historical defender path.

## Recording version 201

Carried Super Bowlers start the source fresh charge after reaching range.
Buildings, blocking Walls and ground defenders share the controller, source
body offset and one release counter. Buildings retain their existing native
boulders. Ground defenders now receive the same original boulder and its
three bounces. The primary receives one direct hit; ground splash excludes
that primary and respects precise impact birth time. Airborne defenders are
excluded from primary selection and splash.

Freeze/stun hold charge and recovery, action modifiers scale them, timer
remainder carries across releases, and replacement targets spend remaining
recovery once before a fresh charge. Angry Spell cancels a pending charge.
Released boulders keep tracking and bouncing after retargeting or caster defeat,
and a final bounce can award the last stars. The established generic minimum
flight duration of 0.12 seconds, local collision, routing and projection remain
adapters; modern executable and pixel parity are unverified.

Only an army carrying Super Bowler enables this capability. Ordinary Bowler,
defensive Bowlers and versions 200 and earlier retain their own rules and
state shape. Village saves, numerical stats and assets do not change.
`SuptrollAttack` preparation audio and the Super Bowler bounce sample remain
a separate follow-up; this boundary adds neither those samples nor a journal.

## Validation

`tests/attacking-super-bowler-windup.test.ts` checks all ten tiers from near/far,
fresh/repeat timing, native speed/damage/radius, one ground primary hit plus
collateral, air exclusion, Freeze/stun, modifiers, Shrink, timer remainder,
recovery and charge retargets, moving tracked targets, Walls, traps, three
bounces after shooter defeat and final-star damage. Actual Angry Spell levels
1/4 use a legal farther drop and arrive during the fresh charge.

Actual versions 200/201 cover tiers 1/10 against unarmed Storage, live Cannon
and an Archer-lured Golem held by a real Freeze. Root-packet observation handles
historical defender arrows without relying on a nonexistent attack counter.
The top-tier Cannon uses legal level fourteen so it survives both primary hits.
Full states and all three native packets reconstruct through portable files and
forward/reverse seeking. Historical defender arrows retain their single packet.

`tests/browser/attacking-super-bowler-windup.spec.ts` checks current/historical
fights, original bodies and native boulders, source charge offsets, complete
Node/Chromium states, reverse seeks, read-only rendering, reduced motion,
asset requests and WebGL health at phone and desktop viewport widths. Two
actual Angry Spell cases check forced retargeting. Screenshots go to ignored
`output/playtest/`.
