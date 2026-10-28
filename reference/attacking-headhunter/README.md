# Attacking Headhunter source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All four `characters.Headhunter` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=600`,
`AttackRange=300`, ground and air targets, jumping, Hero preference and a 4×
Hero damage multiplier. No cooldown override or initial target delay is set.
The established [older-engine split-clock adapter](../attacking-giant/README.md)
therefore gives a 0.6-second fresh windup, no post-hit recovery and a 0.6-second
repeat period. Modern executable attack timing remains unverified. The
[official-wiki comparison](../official-wiki/troops/headhunter.md) agrees with
the period, range, damage and Hero preference; the documented movement-speed
version difference is outside this change.

## Recording version 181

A carried Headhunter starts a fresh charge after reaching its target. Original
card release, native 14-tile/s flight and impact-triggered poison retain their
existing source rules. Native poses follow the captured action offset. Freeze
and stun hold the charge; attack-speed modifiers scale first and repeat phases.

The shared timer uses the existing preferred-Hero selector during a charge.
A newly available unalerted Hero interrupts an ordinary defender or building
charge and starts a fresh one. A committed valid Hero remains selected when
another comes closer; defeat starts a fresh charge at the replacement. Cards
capture 4× direct damage only for Heroes. Garrison troops and Guardians take
normal direct damage, with the existing poison class modifiers at impact.
Wall jumping, source targeting and poison behavior keep their existing rules.

Only initial armies carrying Headhunter enable the change. Version 180 and
earlier retain their immediate first release. No source stats, assets, audio,
village save format or replay envelope change.

## Validation

`tests/attacking-headhunter-windup.test.ts` checks all four tiers from near and
far, native card identity, first/repeat time, Hero damage and poison, both target
layers, normal damage to troops and Guardians, Hero interruptions and commitment,
speed modifiers, Freeze and wall jumping. Actual Freeze/deployment inputs against
King and Minion Prince, plus real Cannon and Castle fights, preserve complete
portable states in both time directions under versions 180 and 181.
Recall recordings explicitly preserve the two old immediate cards versus the
single charged card before removal, along with each version's poison expiry.
The older poison-on/off comparison stays pinned to version 180 so it isolates
that feature's historical boundary from the later first-release timing change.

`tests/browser/attacking-headhunter-windup.spec.ts` checks current and historical
recordings on phone and desktop, original charge poses and live card meshes,
exact seeking, read-only drawing, reduced motion, asset requests and WebGL health.
Screenshots go to ignored `output/playtest/`.
