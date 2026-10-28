# Healer friendly cast timing

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All eleven `characters.Healer` tiers in [the combat tables](../full-client/combat.json)
inherit `AttackSpeed=700`, negative DPS, 4.5-tile reach, flight and ground-only
healing eligibility. The [retained older-engine adapter](../attacking-giant/README.md)
uses a 200-ms threshold for healing rows, giving a 0.2-second fresh cast,
0.5-second recovery and 0.7-second period. Modern native executable and
pixel parity remain unverified.

Actual version-209 Healers launch immediately upon reaching their friendly
recipient: 0.05 seconds from a near drop or 1.8 seconds from the farther
recorded approach. Repeats already use the source 0.7-second period. The
change introduces the missing fresh cast without changing healing amounts,
group selection, projectile speed, area radius or stacking rules.

## Recording version 210

A carried Healer or an equipped Queen Healer Puppet enables the cast clock.
Friendly recipient IDs live in `unit.native.healerWindup`, separate from
enemy building/defender attack references. A near Healer now launches at
0.2 seconds; the farther deployment launches at 1.95 seconds. Repeats keep
source recovery and timer remainder. The original body uses the recorded
cast offset and faces its friendly recipient.

Freeze and stun hold the cast, including partial thaw samples. Action-rate
modifiers and Shrink scale the clock. A recipient that dies, leaves, is
recalled or becomes ineligible cancels the pending cast. A replacement
recipient spends a fresh cast after recovery left. An already committed
cast may finish once if its recipient moves away; subsequent recovery
returns to the chase. Caster defeat cannot launch an unfinished cast.

The established group targeting, twelve-tile/s healing flights, 1.5-tile
landing area, marginal Healer stacking curve and tier-specific Hero healing
ratios remain in use. Puppet levels 1/18 still create source Healers 4/8
independently of trained Healer research. Existing body artwork, projectile feedback
and sound bindings remain in use. Versions 209 and earlier keep immediate
arrival launches and their former state shape. No numerical stat, asset
or village-save change is introduced.

## Validation

`tests/attacking-healer-windup.test.ts` checks all eleven tiers from near/far,
source cast/repeat clocks, healing packet values and captured Hero ratios,
Freeze/stun, modifiers, Shrink, friendly facing, invalid recipients,
replacement casts, recovery, committed escape, caster defeat, irregular
steps, roster and Puppet gating. Real King/Healer inputs against a live
Cannon compare complete portable states at tiers 1/11 from both distances
under versions 209/210. Actual Queen activations separately verify Puppet
levels 1/18, source Healer tiers and both seek directions.

`tests/browser/attacking-healer-windup.spec.ts` compares full Node/Chromium
states, backward seeks, original endpoint and Puppet bodies, visible cast
offsets before launch, read-only drawing, reduced motion, asset requests
and WebGL health at phone/desktop viewport sizes. Existing Hero-scaling
browser checks explicitly select their version-98 boundary so their
version-97 comparison retains matching launch times. Current cast tests
separately retain tier-specific healing packets and impacts.
Screenshots go to ignored `output/playtest/`; viewport checks do not
measure physical phone performance.
