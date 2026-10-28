# Attacking Super Archer engagement charge

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `characters.Super Archer` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=1500`, no cooldown override or new-target delay, six-tile
range, three-tile/s movement and ground/air targets. The
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**1.5-second fresh and repeat charge with zero separate recovery**. Modern
native executable first-hit timing remains unverified.

Source DPS is 84/96/108/120/132/144/156/162/166/170, giving per-arrow damage
126/144/162/180/198/216/234/243/249/255. The existing piercing adapter already
uses `magic_archer_projectile` at 14 tiles/s, radius 0.3 tiles and four extra
tiles beyond the captured aim point. Its source projectile fixes direction
at launch (`DontTrackTarget=TRUE`, `IsBallistic=FALSE`, `StartHeight=30`).
This arrow has its own physical crossing journal and no generic projectile
minimum-flight-duration rule.

Version-197 actual deployments fire at 0.05 seconds when in range or 1.45
seconds after a farther approach, immediately on arrival. Both first and
last tiers already repeat every 1.5 seconds with correct damage and piercing
geometry. Version 198 changes the engagement charge while retaining those
established projectile and routing rules.

## Recording version 198

Carried Super Archers begin a full source charge after reaching range.
Buildings, blocking Walls and eligible ground/air defenders share the same
clock. Release captures one existing piercing arrow and counts one attack.
It crosses both enemy layers and structures progressively, each target at
most once, then continues beyond its original aim. A primary can move away
while collateral farther along the line remains vulnerable. Released arrows
survive the shooter's defeat; a final hit can finish the village.

Freeze/stun hold the charge, action modifiers and Shrink scale it, timer
remainder survives repeat releases, and replacement targets start a fresh
charge. Angry Spell uses version 197's forced-selection cancellation. Original
body animation samples use the shared phase offset during charge/release.
Versions 197 and earlier retain their prior timing and state shape. Only
armies carrying Super Archer enable this capability; numerical stats, saved
villages and assets do not change. Local pathfinding, two-dimensional collision
and projection remain adapters; pixel or modern executable parity is unverified.

## Validation

`tests/attacking-super-archer-windup.test.ts` checks all ten tiers from near/far,
fresh/repeat timing, source speed/radius/extra range, one attack and hit per
release, both primary layers and collateral layers, fixed direction, Freeze,
stun, action modifiers, Shrink, timer remainder, destroyed targets, Walls,
traps, shooter defeat and a final arrow awarding the last stars.

Actual version-197/198 recordings cover tiers 1/10 against Storage and live
Cannon, plus real Archer-lured Golem/Dragon reserves held by a real Freeze.
Complete release, crossing, end-of-flight and repeat states reconstruct forward
and backward through portable files. Angry Spell levels 1/4 arrive during a
farther legal approach's fresh charge and cancel the obsolete mine target.
Existing piercing geometry, presentation, portable and art suites remain in use.

`tests/browser/attacking-super-archer-windup.spec.ts` checks current/historical
fights, original body/arrow visibility, phase offsets, complete Node/Chromium
states, reverse seeks, read-only rendering, reduced motion, asset requests and
WebGL health at phone and desktop viewport widths. Two actual Angry Spell cases
check cancellation. The existing original-arrow browser suite exercises current
multi-target flight, samples and historical version 110. Screenshots go to
ignored `output/playtest/`.
