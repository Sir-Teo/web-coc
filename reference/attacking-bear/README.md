# Druid Bear melee timing

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six `characters.Bear` tiers in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=1000`, `AttackRange=60`, Defense preference, ground-only
attacks and no cooldown override or initial target delay. The existing
[older-engine split-clock adapter](../attacking-giant/README.md) therefore gives
a one-second fresh charge, no post-hit recovery and a one-second repeat period.
Modern native executable timing and pixel parity remain unverified.

## Recording version 212

A carried Druid enables the Bear melee controller. Both an evolved Druid and
a Bear released on Druid defeat approach their target before starting a fresh
source charge. Direct hits retain the source 150–225 damage, with no projectile.
The original body follows the recorded charge offset and committed Wall facing.
Freeze and stun hold the charge, including partial thaw samples. Attack-rate
modifiers and Shrink scale the first and repeated swings. An invalid target
requires a fresh charge; a defeated Bear cannot finish its pending swing.

Defense preference, ground-only defender retaliation, movement, transformation
health inheritance and Druid healing retain their existing rules. Versions 211
and earlier keep immediate first Bear hits and their original state shape.
There is no village-save, asset or numerical-stat change.

## Validation

`tests/attacking-bear-windup.test.ts` covers all six tiers from near and far,
source damage and periods, modifiers, Freeze/stun, Shrink, replacement targets,
Defense preference, ground/air defenders, caster defeat, actual Wall charges
and facing, preferred-defense interruptions and irregular-step cadence.
Real inputs create Bears through natural evolution or Cannon defeat;
both routes compare complete portable states in both seek directions at tiers
1/6 under versions 211/212. A separate comparison retains identical Druid
healing before a Bear exists, apart from the new capability flag.

`tests/browser/attacking-bear-windup.spec.ts` checks full Node/Chromium states,
reverse seeks, original Bear bodies, pre-hit charge offsets, read-only drawing,
reduced motion, asset requests and WebGL health at phone/desktop sizes.
Screenshots go to ignored `output/playtest/`; viewport checks do not measure
physical-phone performance.
