# Druid friendly cast and transformation boundary

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six `characters.Druid` tiers in [the combat tables](../full-client/combat.json)
inherit `AttackSpeed=1000` and `CoolDownOverride=450`. The shared
[older-engine adapter](../attacking-giant/README.md) gives a 0.55-second
fresh cast and 0.45-second recovery within the one-second period. The
source declares five-tile range, ground/air healing, three projectile
bounces (four total recipients) and transformation into Bear after 30
seconds. Healing packets range from 80 to 115. Modern executable and
pixel parity remain unverified.

Actual version-210 deployments against live defense fire launch as soon
as they reach their recipient. The recorded near/far ground approaches
engage and launch at 1.05/2.45 seconds. Pursuit can delay subsequent
casts when a recipient moves beyond healing range.

## Recording version 211

A carried Druid enables the friendly cast controller introduced for
[Healer](../attacking-healer/README.md). The clock reads the actual caster's
source row and keeps friendly recipient IDs separate from enemy targets.
The body uses its recorded cast offset and faces the healing recipient.
Freeze, stun, action-rate modifiers, Shrink, invalid recipients and
replacement casts retain active timing and recovery. An already committed
cast may finish once before chasing an escaped recipient.

Group selection, ground routes, source healing flights, bounce selection,
healing amounts and Hero multipliers remain in use. The ordinary Healer's
version-210 complete states remain identical after generalizing the clock.
Versions 210 and earlier keep immediate arrival launches and their former
state shape.

Transformation mutates the Druid unit into a Bear in place. Previously,
that same sample could continue with the stale Druid stats and launch a
healing packet attributed to the Bear. Version 211 clears the friendly
cast and recipient when the body changes and ends the old healing step.
The Bear acts through its normal controller on the following sample.
Flights released before transformation retain their captured Druid tier
and still heal after arrival. Older recordings retain the former
transformation-frame packet. No asset, numerical stat or village-save
change is introduced.

## Validation

`tests/attacking-druid-windup.test.ts` checks all six source tiers from
near/far, source cast/repeat periods, air healing, Freeze/stun, modifiers,
Shrink, friendly facing, invalid recipients, replacement casts, recovery,
committed escape, caster defeat and roster gating. Real Cannon/Giant and
Air Defense/Hound fights compare complete portable states in both seek
directions at levels 1/6 under versions 210/211. Lifecycle checks cover
the transformation boundary, the old extra packet, an already released
flight landing after transformation, and unchanged Healer states. Actual
30-second fights against a low-tier multi Inferno also compare complete
portable states before/after transformation and the first Bear hit.

`tests/browser/attacking-druid-windup.spec.ts` checks complete Node/Chromium
states, reverse seeks, original endpoint bodies, visible cast offsets,
read-only drawing, reduced motion, asset requests and WebGL health at
phone/desktop viewport sizes with both ground and air recipients. Two
additional cases inspect the actual body swap and absence of a Bear
healing launch. Existing
native healing-projectile and routing checks retain their flight, bounce
and path coverage. Screenshots go to ignored `output/playtest/`; viewport
checks do not measure physical phone performance.
