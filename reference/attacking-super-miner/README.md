# Super Miner quarter-second attacks and damage ramp

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve `characters.Super Miner` tiers in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=250`, no cooldown/new-target override, 0.6-tile reach,
four-tile/s movement, ground-only targeting and underground travel. The
shared [older-engine clock adapter](../attacking-giant/README.md) therefore
gives a 0.25-second fresh charge and repeat period with zero recovery.
Modern native executable and pixel parity remain unverified.

The existing IncreasingDamage adapter starts at the first resolved hit on
the current target and advances at source thresholds 1.5/3 seconds. Across
the twelve tiers, its three DPS ranges are 80–265, 160–510 and 280–740,
giving 20–66.25, 40–127.5 and 70–185 damage per quarter-second hit. No
target-kill cooldown is declared. The independent death bomb deals
800–2,400 ground damage after one second in a two-tile radius.

Actual version-207 Storage deployments hit immediately on arrival: 0.3
seconds from a near drop and 1.45 seconds from the farther drop. Repeated
hits occur every 0.30 seconds because the old cooldown path waits an extra
50-ms step at the floating-point boundary. An Archer-lured, frozen Castle
Golem also uses the historical generic direct-hit path without a native
attack counter.

## Recording version 208

A carried Super Miner surfaces and spends the complete quarter-second
charge before a building or ground-defender hit. The same near/far drops
first hit at 0.5 and 1.65 seconds, then repeat exactly every 0.25 seconds.
Timer overshoot is retained across releases and action-rate changes.
The first hit still starts the existing target-specific damage ramp; later
releases retain its source tier and per-hit values. Defender targets now
record the same release counter and clock as building attacks.

Freeze holds pending charge time, action-rate modifiers and Shrink scale
the attack clock, and a replacement target starts a fresh charge and ramp.
An escaping defender cancels the exposed swing before the unit burrows
again. Angry Spell cancels a pending repeat on forced retargeting. The
source body follows the captured action offset. The existing ramp's elapsed
time interpretation, underground routing, collision, target selection,
trap eligibility and delayed death bomb remain in use. No numerical stat,
asset, audio-sample or village-save changes are introduced. Versions 207
and earlier retain their immediate first hit, 0.30-second repeat at 20 Hz
and former state shape.

## Validation

`tests/attacking-super-miner-windup.test.ts` checks every tier from near/far,
fresh/repeat clocks, exact ramp thresholds and per-hit values, Freeze,
fast/slow action rates, irregular step remainders, Shrink, replacement
targets, reburrowing, trap eligibility, delayed death damage and carried
roster gating. Real Storage, live Cannon and Archer-lured Golem fights with
an actual Freeze compare complete portable states in both directions at
tiers 1/12 under versions 207/208. Damage samples identify historical guard
hits without relying on their absent native counter. Actual Angry Spell
levels 1/4 separately verify both versions' complete retarget states.

`tests/browser/attacking-super-miner-windup.spec.ts` checks current and
historical fights, all three ramp stages, original endpoint bodies, exposed
charge offsets, complete Node/Chromium states, reverse seeks, read-only
drawing, reduced motion, asset requests and WebGL health at phone/desktop
viewport widths. Two actual Angry Spell cases verify cancellation and
reburrowing. Screenshots go to ignored `output/playtest/`. Viewport checks
do not measure physical phone performance.
