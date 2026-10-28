# Attacking Balloon source attacks

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All thirteen `characters.Balloon` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=3000`,
`NewTargetAttackDelay=2250`, no cooldown override, `SelfAsAoeCenter=TRUE`,
ground-only targets and 1.2-tile splash. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**0.75-second fresh charge**, with 1.5-second recovery and windup inside each
three-second repeat. Modern executable first-hit timing remains unverified.

The [wiki comparison](../official-wiki/troops/balloon.md) corroborates damage,
ground splash and the 0.416-second delayed death blast. Client range remains
zero; the wiki reports half a tile. Movement is 1.3 tiles/s. The source has no
physical projectile. Local footprint geometry and fixed simulation steps
remain in use; native hitbox and executable parity are not claimed.

## Recording version 190

Carried ordinary Balloons use the native attack path. A full fresh charge
begins after arrival. Ground defenders and buildings share a self-centered
blast at release, covering eligible footprints and ground defenders within
1.2 tiles. Air defenders, traps and friendly units are excluded. No extra
flight delay is introduced. Recovery, action-speed changes, Freeze/stun,
timer remainder and replacement targets use the shared phase controller.
Original body poses follow the same phase offset.

The separate crash blast resolves 0.416 seconds after defeat, including
defeat during Freeze. It retains the source radius and per-tier damage and
does not depend on the attack clock. Native movement uses 1.3 tiles/s and
zero range; home troop information previews those same values and explains
overhead bombing and the crash delay.

Before this pass, near/far approaches released immediately at 0.95/4.55
seconds, used a locally tuned 0.33-second physical bomb flight, repeated at
3.05 seconds and applied death damage immediately. Versions 189 and earlier
retain that behavior, 1.25-tile/s movement and half-tile reach. Only an initial
army carrying ordinary Balloon enables the change. Rocket Balloon, other
troops, source assets, audio and the village save format are unchanged.

## Validation

`tests/attacking-balloon-windup.test.ts` covers all source tiers from near/far,
fresh/repeat phases, immediate blast damage, ground-only area geometry,
defense preference, Wall crossing, recovery retargets, Freeze/stun, speed
modifiers, timer remainder, delayed death damage and current/historical
movement values. Actual Cannon, lured Golem, Ice Block and Monolith fights
compare complete portable states in both directions under versions 189/190.

`tests/browser/attacking-balloon-windup.spec.ts` checks phone/desktop Info,
current/historical fights, original first/last-tier meshes, phase offsets,
Ice Block and crash states, complete forward/backward state equality,
read-only drawing, reduced motion, asset requests and WebGL health.
Screenshots go to ignored `output/playtest/`.
The older bomb-rendering browser cases explicitly select version 189 to
retain their downward-flight and ground-blast witnesses. The troop-guide
browser cases retain phone, landscape and desktop layout checks with the
new crash fact.
