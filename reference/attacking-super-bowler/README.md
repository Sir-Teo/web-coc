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
Version 201 leaves `SuptrollAttack` preparation audio and the Super Bowler
bounce sample as a separate follow-up, adding neither those samples nor a journal.

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


## Recording version 202: preparation audio

The character's source `PreAttackEffect` names sound-only `SuptrollAttack`.
The importer now retains this binding and copies its two original takes:
`sup_troll_atk_01.ogg` (18,772 bytes, 2.582 seconds) and
`sup_troll_atk_02.ogg` (18,563 bytes, 2.527 seconds). Both match their pinned
manifest hashes. Volume is 0.7, pitch varies from 0.98 to 1.02, and delay is
zero. Event keys deterministically select a take and pitch. The catalog now
contains 375 effects and 362 samples; all prior 360 files remain unchanged.
The two new files add 37,335 bytes and no new graphics. Importer generation
and `--check` reproduce the outputs from verified cached tables and samples.

The shared Bowler/Super Wizard charge audio journal now serves Super Bowler
as well. A fresh source charge already includes 1.1 seconds of precharge:
the first 50-ms update therefore starts its take at 1.15 seconds of sample
age. A near time-zero drop can have a negative cue origin, representing that
elapsed sample offset; the cue is only emitted after engagement. Repeated
takes begin after the 0.7-second recovery. This preserves the established
split-clock and sound adapter rather than claiming verified modern native
execution or sound synchronization.

Freeze/stun hold active wall-time age and suppress playback until thaw.
Action-rate changes retain normal sample age and source pitch; recovery waits
before a new take. Target cancellation and caster defeat suppress unfinished
takes, while completed one-shots retain their natural tails and bounded
history. Angry Spell can cancel a pending take or retain a released tail and
boulders already in flight. The three-bounce geometry, primary-hit exclusion,
damage and physical attack clocks remain those introduced in version 201.
Version 202 does not include the separate Super Bowler bounce sample.

`tests/attacking-super-bowler-audio.test.ts` checks all ten tiers, source take
and pitch/volume metadata, precharge and repeat ages, recovery, Freeze/partial
thaw, action-rate independence, replacement targets, canceled takes, defeat,
portable states/cues, actual Angry Spell inputs, and six complete physical-state
comparisons against version 201. Existing ordinary Bowler and Super Wizard
audio tests retain their samples, keys and source behavior.

`tests/browser/attacking-super-bowler-audio.spec.ts` checks both original takes
are decoded after same-roster home/battle prewarming, complete Node/Chromium
states and cues, actual Web Audio gain/rate/start offset, natural tails,
forward/reverse seeks, read-only rendering, reduced motion and historical
version-201 sound behavior at phone and desktop viewport sizes. A deliberate
503 case retries the sample while the replay remains paused. These are browser
viewport/audio checks, not physical-device performance or native timing claims.


## Recording version 203: bounce and final-contact audio

The source projectile names `suptrollBoulder_bounce` for a bounce and
`trollBoulder_destroyed` for final destruction. The first two contacts of a
three-landing boulder use `sup_troll_rb_01.ogg`: 11,803 unchanged original
bytes, 1.382 seconds, volume 0.5, pitch 0.96–1.04 and zero delay. The final
contact reuses the already shipped `rock_troll_explo_01.ogg`, at source volume
0.4 and pitch 0.98–1.02. The importer now includes both projectile bindings
for Super Bowler. Its output reproduces with 376 effects and 363 samples;
all previous 362 files remain unchanged.

A separate audio-only impact journal captures projectile identity, source,
level, bounce index and exact resolved impact clock. It retains ten seconds
of history and continues after the thrower falls. The first two records use
the bounce effect; the third uses the destruction effect. Keys include the
bounce index to keep contacts distinct. Rendering reads this history without
changing combat. Once the original sample is decoded, it covers the generic
contact tone and no duplicate event enters the presentation log.

This boundary does not modify damage, projectile tracking, collision,
three-bounce flight or preparation audio. The ordinary Bowler's independent
impact journal and art remain unchanged. Versions 202 and earlier have no
new journal or contact cues. No new particle art or native synchronization
claim is introduced; existing projection and sample-time adapters remain.

`tests/attacking-super-bowler-impact-audio.test.ts` covers all ten tiers,
two bounce cues plus final destruction, source gain/pitch and exact clocks,
read-only cue reconstruction, caster defeat, history retirement, twelve
portable current/historical fights, six complete physical-state comparisons,
actual Angry Spell retargeting and the conditional capability.

`tests/browser/attacking-super-bowler-impact-audio.spec.ts` checks current and
historical Storage/Cannon/frozen Golem fights, same-roster prewarming, decoded
originals, exact Node/Chromium states and cues, Web Audio gain/rate/start
offset at every contact, natural clip expiry, generated-tone coverage,
absence of duplicate log entries, reverse seeks, reduced motion, read-only
rendering and WebGL health at phone/desktop viewport sizes. A deliberate
503 retries while paused without advancing the recording.
