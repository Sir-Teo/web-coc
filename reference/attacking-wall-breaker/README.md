# Wall Breaker source charges and separate explosions

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All fourteen `characters.Wall Breaker` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=1000`, no cooldown/new-target override, half-tile reach,
three-tile/s movement and one attack. Attack damage is 10–126 in a 0.8-tile
ground splash. Separate death damage is 6–78 in a 1.5-tile radius without a
declared delay. Both receive the 40-fold Wall preference multiplier.
The retained [wiki comparison](../official-wiki/troops/wall-breaker.md)
corroborates the damage, Wall bonus and split source radii; its summary
range/radius conventions differ from the client columns.

The shared [older-engine clock adapter](../attacking-giant/README.md)
gives a one-second fresh charge, zero recovery and zero precharge. The
[Super Wall Breaker casualty reference](../attacking-super-wall-breaker/README.md)
documents the separate attack-count death lifecycle. Source tables and the
older reconstruction support the local adapter; modern executable and
pixel parity are unverified.

Actual version-205 deployments hit immediately after reaching their legacy
one-tile range: 0.3 seconds from the near drop and 1.8 seconds from the farther
drop. They combine attack and death damage into one two-tile blast, producing
16 damage at tier 1 or 204 at tier 14 against an unarmed Storage.

## Recording version 206

A carried ordinary Wall Breaker uses the native route and shared charge
controller. It reaches half-tile range and spends the complete one-second
charge. The same near/far drops release at 1.4 and 2.9 seconds. The source
body follows the captured charge offset. One contact attack then defeats the
unit and enters the shared casualty pass; the next combat update resolves
the separate death blast once. Primary Storage totals remain 16–204 damage.
Walls receive the source multiplier on both attacks and casualty damage.

The attack uses the target's existing native center and 0.8-tile splash;
the death blast is centered on the caster with radius 1.5. Ground defenders
inside each radius receive that attack's damage, while airborne defenders
are excluded. This boundary also fixes Super Wall Breaker's existing
0.8-tile contact attack, which previously damaged nearby buildings but
omitted ground defenders. Its version-205 charge and version-204 death
behavior otherwise remain in use. The new family splash capability is
enabled only by a carried ordinary or Super Wall Breaker.

Freeze holds a pending charge, action-rate modifiers and Shrink scale it,
and damage boosts affect the contact attack while death damage stays
separate. Defeat before release deals only death damage. Ejected casualties
do not detonate. Pending last-unit death damage can award the final stars.
Home/current troop information now uses source reach and both radii.
Versions 205 and earlier retain their legacy ordinary attacks, reach,
combined radius and unit state, plus Super Wall Breaker's former contact
collateral behavior. The village save format remains unchanged.

The native contact event uses the existing original attack and impact sound
bindings. No new textures or sound files are required. Movement, collision,
target selection, local projection and the native target-center convention
remain local adapters rather than claims of modern executable parity.

## Validation

`tests/attacking-wall-breaker-windup.test.ts` checks all fourteen tiers from
near/far, direct versus death damage, 40-fold Wall damage, exact ground/air
splash boundaries, pending defeat, ejection, final stars, Freeze, fast/slow
action clocks, Shrink, damage boosts, traps and carried-roster gating.
Super Wall Breaker tiers 1/10 compare old/new contact splash separately.
Real Storage, Cannon and full Wall-barrier fights at endpoint tiers compare
complete portable states in both directions under versions 205/206.

`tests/browser/attacking-wall-breaker-windup.spec.ts` covers current and
historical fights, original living bodies, pending charge offsets, full
Node/Chromium state equality, reverse seeks, read-only drawing, reduced
motion, asset requests and WebGL health at phone/desktop viewport widths.
Screenshots go to ignored `output/playtest/`. These viewport checks do not
measure physical phone performance.


## Recording version 207: contact audio

Both Wall Breaker families already carry original attack, impact and death
bindings in [the sound catalog](../troop-sounds/sounds.json). The existing
`native.lastAttackAt` and single-attack count now reconstruct the attack and
impact cues directly. Keys match their former live event identities, so
selection and pitch remain deterministic. The live log ignores these same
contacts under the new capability, preventing duplicate entries. No extra
journal or sound files are introduced. Early defeat and an Angry Spell
canceling a pending charge produce no contact cue.

The existing death clock continues to supply the original casualty sample.
A decoded original covers the generated explosion tone and retains its
feedback. A missing clip keeps the generated tone until loading recovers.
The standard ten-second cue horizon retires old contacts, while the sample
player retains its normal clip duration, effects gain, source pitch and
playback-speed offset behavior. Versions 206 and earlier retain their live
log and generated-tone path. Physical state, damage, routing, clocks and
all imported assets remain unchanged.

`tests/wall-breaker-audio.test.ts` checks all fourteen ordinary and ten Super
tiers, exact source samples/volume/pitch, no cues during pending charges,
duplicate-free live logs, natural contact retention and expiry, real Cannon
casualties, carried-roster gating and actual Angry Spell cancellation.
Portable Storage, Cannon and Wall-barrier fights reconstruct full states and
cues in both directions under versions 206/207. Six comparisons remove only
the new capability to verify complete physical-state equality.

`tests/browser/wall-breaker-audio.spec.ts` checks same-roster home/battle
prewarming, decoded originals, complete Node/Chromium states and cues, actual
Web Audio gain/rate/start offset, duplicate prevention, death-tone coverage,
reverse seeks, reduced motion, WebGL health and paused 503 recovery.
