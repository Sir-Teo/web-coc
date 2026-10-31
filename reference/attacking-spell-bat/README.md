# Attacking spell-created Bats

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The inherited `characters.Spell Bat` row in [the combat tables](../full-client/combat.json)
has 20 HP, 30 DPS, a two-second attack period, 0.3-tile melee range, flight,
ground/air targeting and Defense preference. Every Bat Spell tier creates this
same tier-one child. The eight spell tiers retain 7/9/11/16/21/22/23/25 Bats,
an initial group of two and their existing scheduled spawn durations.

`AttackSpeed=2000` has no cooldown override. The shared
[older-engine split-clock adapter](../attacking-giant/README.md) assigns
0.5 seconds of recovery and 1.5 seconds of windup. `NewTargetAttackDelay=1500`
provides 0.5 seconds of initial charge, leaving a one-second fresh attack after
approach. Repeated attacks retain the two-second period. Modern native executable
timing parity remains unverified; these are the same source/adapter conventions
used for the other phased attackers.

## Recording version 217

The previous initial delay ran from building/defender acquisition, overlapping
travel. In the captured near and far approaches, the first hit occurred 1.5 and
0.9 seconds after the first in-range update, respectively. New setups carrying
a Bat Spell instead spend the source attack phase after approach, preserve
remaining recovery on replacement targets, and retain fractional repeat time.
Freeze/stun hold the charge; attack-rate modifiers and Shrink scale active time.

Bats keep Defense preference and commitment. When defending troops become valid
targets, they receive a charged, direct melee hit on either layer. Original hit
feedback identifies the flying attacker and defender layer. No projectile is
invented for this melee row. The original source attack mesh follows the captured
phase and draws zero-based contact frame 5 from its one-based action frame 6;
held charges keep their pose while frozen. Reduced motion retains a static pose.

Versions 216 and earlier preserve their complete attack state and drawing. Spell
cast timing, counts, tiers, birth times, movement, stock, assets and numerical
stats remain unchanged. Spell-created Skeletons retain their separate behavior;
this boundary does not interpret their `SpawnIdle` field.

## Validation

`tests/attacking-spell-bat-windup.test.ts` checks near/far casts at both spell tier
ends, first/repeat clocks, damage, direct ground/air hits, Defense preference,
Freeze/stun, partial thaw, modifiers, Shrink, replacement recovery, defeat,
irregular samples and every source birth tier. Real untouched casts retain
complete portable forward/backward replay samples. Four complete version-216
snapshot digests were captured twice before the change and remain pinned.

`tests/native-unit-presentation.test.ts` checks first/repeated original contact
frames, historical drawing, paused/reverse redraws, frozen charges, reduced motion
and read-only rendering. `tests/browser/attacking-spell-bat-windup.spec.ts` checks
complete Node/browser states, real source meshes, physical contact frames,
historical portable imports, reverse seeks, asset requests and WebGL health on
phone/desktop viewports. Screenshots go to ignored `output/playtest/`.
