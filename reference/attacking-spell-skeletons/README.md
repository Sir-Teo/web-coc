# Attacking Skeleton Spell bodies

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The inherited `characters.Spell Shielded Skeleton` and `Spell Unshielded Skeleton`
rows in [the combat tables](../full-client/combat.json) each declare 30 HP, 25 DPS,
`AttackSpeed=1000`, 0.4-tile ground-only melee reach, ground movement and no cooldown
override or initial target delay. The shared
[older-engine split-clock adapter](../attacking-giant/README.md) gives a one-second
fresh swing, no recovery and a one-second repeat period. Modern native executable
timing parity remains unverified.

Every Skeleton Spell tier creates tier-one shielded bodies: 12–19 total, four in
the first group and the rest over 8–15 seconds. A defeated shielded body creates
one tier-one unshielded Skeleton at the retained secondary-spawn point. The new
body has its own full 30 HP. The existing source 85% resource-building damage
reduction remains; a normal 25-damage hit becomes 3.75 against those buildings.

## Recording version 218

The previous controller hit on the first in-range update, including the first
update of an unshielded replacement. Setups carrying Skeleton Spell now enable
the shared attack phase for both body kinds. Fresh swings begin after approach;
Freeze/stun hold active time, and attack-rate modifiers and Shrink scale it.
Replacement targets spend a new charge. A defeated body cannot release its
pending hit, and its replacement starts its own clock rather than inheriting
the interrupted swing.

Defenders receive direct ground-only hits, and resource damage retains its
existing reduction. The source meshes follow the recorded offset, retain a held
pose during Freeze, and draw zero-based contact frame 7 on physical release from
one-based action frame 8. The shielded attack clip runs at 30 FPS; the unshielded
clip runs at 24 FPS. Blocking-wall facing prioritizes the committed charge.

Versions 217 and earlier retain complete previous attack state and drawing.
Cast timing, full squad counts, source child tiers, scheduled births, positions,
shield-break replacement, stats and assets keep their rules. The separate
`SpawnIdle=500` fields retain the existing local spawn behavior; this boundary
does not reinterpret them as attack-only delays or claim native spawn-idle parity.

## Validation

`tests/attacking-spell-skeleton-windup.test.ts` checks both source bodies, min/max
spell tiers, approaches, first/repeat clocks and damage, freezes, partial thaw,
modifiers, Shrink, ground/air eligibility, resource reduction, replacement targets,
defeat, fresh shield-break charges, irregular samples and all eight complete
squad schedules. Six complete version-217 snapshot digests were captured twice
before this change and remain pinned.

The mixed Witch/Skeleton Spell scenario in
`tests/attacking-witch-summon-windup.test.ts` checks both the original version-213
boundary and version 218 explicitly, preserving the earlier separation while
covering the new spell-body phases alongside a carried Witch.

Portable recordings include untouched casts over a Barracks and actual Wizard
Tower attacks that break shields. Both epochs reconstruct complete samples in
forward and reverse order. `tests/native-unit-presentation.test.ts` checks both
source contact clips, historical poses, held frozen charges, reduced motion and
read-only rendering. `tests/browser/attacking-spell-skeleton-windup.spec.ts` checks
complete Node/browser states, original meshes, contacts, historical imports,
reverse seeks, assets and WebGL health on phone and desktop. Screenshots go to
ignored `output/playtest/`.
