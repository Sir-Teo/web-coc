# Attacking Super Wizard charge, recovery and Chain Magic

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `characters.Super Wizard` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=2000`, no cooldown override or new-target delay, 3.5-tile
range, 2.5-tile/s movement and ground/air targets. The
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**1.5-second fresh charge, 0.5-second recovery and two-second repeat period**.
Modern native executable first-hit timing remains unverified.

Source DPS is 140/160/180/200/220/240/265/285/305/335, giving direct primary
damage 280/320/360/400/440/480/530/570/610/670. The existing Chain Magic adapter
already captures a direct primary plus up to nine branches from it, all at
128 ms after the primary, within three tiles, at 40% of captured primary damage.
Secondary hits do not create another hop. Both defender layers and structures
remain eligible; Walls may be primary but Walls and traps cannot be branches.
The source has no ordinary travel projectile for this cast.

Version-198 actual deployments cast at 0.05 seconds from a near drop or 1.1
seconds from a farther approach, immediately on arrival. Both endpoint tiers
already repeat every two seconds with the correct primary/branch values.

## Recording version 199

Carried Super Wizards start a full source charge after approaching an eligible
building, blocking Wall or ground/air defender. Release calls the existing
Chain Magic adapter once, counting one attack and retaining every captured
branch. The shared controller holds charge and recovery under Freeze/stun,
scales both with action modifiers, preserves timer remainder, spends remaining
recovery once when changing targets, and samples the original body's phase.

Angry Spell cancels a pending charge through version 197's forced-selection
rule. It retains recovery and already released branches. A branch can resolve
after forced retargeting, caster defeat or destruction of its primary; the
existing primary-position and captured fallback rules remain intact. Pending
branches keep a final caster's raid open and can award the final stars.

Only carried Super Wizards enable this capability. Versions 198 and earlier
retain their former timing and state shape. Village saves, numerical stats,
branch geometry, effect packs and samples do not change. Local routing,
selection, projection and collision conventions remain adapters; modern
executable and pixel parity are unverified. No new pre-attack effect is added.

## Validation

`tests/attacking-super-wizard-windup.test.ts` checks all ten tiers from near/far,
fresh/repeat timing, exact primary/branch metadata, both defender layers,
128-ms delayed cross-layer branches, one attack per cast, Freeze/stun, faster
and slower clocks, Shrink, timer remainder, recovery retargets, destroyed
targets, Walls, trap eligibility and final branches after caster defeat.

Actual versions 198/199 cover tiers 1/10 against Storage and live Cannon,
plus real Archer-lured Golem/Dragon reserves held by a real Freeze. The
top-tier Cannon recording uses a legal level-fourteen Cannon so it survives
both casts; the low tier retains level six. Complete states reconstruct forward
and backward through portable files. Actual Angry Spell levels 1/4 interrupt
a farther drop's fresh charge. Separate real casts arrive at 1.55 seconds,
between the 1.5-second primary and 1.628-second branches, retaining 0.45 seconds
of recovery and the committed 112-damage branch onto an adjacent Builder's Hut.

`tests/browser/attacking-super-wizard-windup.spec.ts` checks current/historical
fights, original body/bolt visibility, charge/recovery offsets, complete
Node/Chromium states, reverse seeks, read-only rendering, reduced motion,
asset requests and WebGL health at phone and desktop viewport widths. Four
actual Angry Spell cases cover pending cancellation and retained branches.
The existing original-lightning browser suite checks current branches, original
samples and historical version 109. Screenshots go to ignored `output/playtest/`.


## Recording version 200: source preparation sound

The character's `PreAttackEffect` names `Electro Dragon Pre Attack`, a
sound-only source effect with no art pack. The sound importer previously
retained only Super Wizard's release, chain and hit effects. It now also
retains the declared preparation binding, regenerated from the pinned original
character/effect tables. The sample `electro_dragon_sfx_atk_01.ogg` already
ships for Electro Dragon: volume 0.5, pitch 1, zero delay. All 360 original
sample files and 374 effect records remain unchanged; only the troop binding
is added. The importer reproduces every output from verified cached tables
and original shipped audio.

The existing Bowler audio journal now serves Super Wizard's shared phase
controller too. Each fresh or repeat charge has its own key and active
wall-time age, independent of action-speed scaling. Recovery waits before
starting a take. Freeze/stun hold its age and suppress playback until thaw;
a canceled target, Angry Spell or caster defeat suppresses an unfinished
take. Released takes keep natural one-shot tails and their bounded history.
The original sample is 2.908 seconds long, so its natural tail can overlap
recovery and the following charge. No loop, time stretch or extra particle
art is introduced.

Only carried Super Wizards enable the version-200 capability. Version 199
retains its full source phases and previous sound behavior without the new
journal. Complete old/current states match after removing only the new audio
flag and journal, including real Storage/Cannon and frozen ground/air Castle
fights. Combat values and attack timing do not change.

`tests/attacking-super-wizard-audio.test.ts` covers all ten tiers, fresh and
repeat cues, recovery, Freeze and partial thaw, action-rate independence,
replacement targets, canceled charges, caster defeat, portable forward/reverse
states and cues, actual Angry Spell cancellation/retained tails, and eight
complete physical-state comparisons. Existing Bowler audio tests retain their
original keys, state shape and samples.

`tests/browser/attacking-super-wizard-audio.spec.ts` checks source decoding,
same-roster home/battle prewarming, exact Node/Chromium states and cues, actual
Web Audio gain, playback rate and start offset, natural tails, reverse seeks,
read-only rendering, reduced motion and old version-199 behavior at phone
and desktop viewport sizes. A failed-sample case retries while paused without
advancing the recording. The existing Bowler and Super Wizard effect/audio
browser suites remain regression checks.
