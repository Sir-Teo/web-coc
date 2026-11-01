# Ruin Knight attack phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Ruin Knight dossier](../official-wiki/troops/ruin-witch-ruin-knight.md)
and all four character tiers declare `AttackSpeed=1000`, `AttackRange=60`,
ground-only single-target melee, and no initial charge or recovery override.
The existing `splitTiming` adapter therefore gives a one-second first charge,
one-second repeat interval and zero post-hit recovery. The same interpretation
of the older attacker timer is documented for [Bear](../attacking-bear/README.md);
modern native executable timing has not been independently verified.

A real level-1 Wizard destroys a Gold Mine, after which a Ruin Witch completes
her ordinary vacuum and summon. This produces the Knight at 8.95 seconds in the
unarmed test lane. Before this change, it hits immediately on reaching either
near or distant Barracks:

| Barracks x | First in-range update | Version-218 first hit |
| --- | --- | --- |
| 16 | 11.35 s | 11.35 s |
| 22 | 14.35 s | 14.35 s |

Recording version **219** advances the shared melee charge only after engagement.
At 20 Hz the first hit follows one second of active in-range updates; same-target
hits remain one second apart. Retargeting starts a fresh swing. Freeze/stun holds
the charge, attack-rate effects scale it, and irregular steps retain the period
remainder. Ground defenders receive a direct melee hit; air defenders remain
ineligible. A defeated Knight cannot complete its pending swing.

The original `rubble_knight_lvl1_attack_*` export has one-based `ActionFrame=25`
at 30 FPS. Its captured charge offset aligns frame 24 with physical contact,
holds the pose while frozen and reconstructs it after forward or reverse seeks.
Reduced motion retains the existing frame-zero behavior. Facing follows a
committed blocking Wall before an incidental defender target. Rendering does not
write to the battle.

This boundary changes no summon or unit statistics. The Ruin Witch still needs
rubble and finishes her existing four-second vacuum and two-second summon. Knight
HP remains 3,100/3,400/3,700/4,000 and DPS 255/285/315/345. The pinned client's
threefold Wall damage and 40-HP loss every 500 ms (80 HP/s) remain in effect,
including health loss while frozen. That health loss predates a later wiki
balance change; this implementation continues using the pinned client.

Only initial armies carrying Ruin Witch enable `nativeRuinKnightWindup`.
Version 218 and earlier retain the instant first hit and previous state shape.
No asset, save migration or portable replay-envelope change is needed.

`tests/attacking-ruin-knight-windup.test.ts` checks all four tiers and both approach
lengths, first/repeat timing, holds and action rates, Shrink, direct ground hits,
air exclusion, Wall damage/facing, retargeting, death, irregular steps, unchanged
summons and health drain, and complete portable forward/reverse snapshots.
Four version-218 snapshot digests were captured twice before changing combat.
Portable witnesses use real deployment inputs, Wizard damage, rubble and summons;
controlled status and retarget checks are separate model scenarios.

`tests/native-unit-presentation.test.ts` checks source contact frames, frozen
poses, reduced motion and read-only rendering. The browser spec
`tests/browser/attacking-ruin-knight-windup.spec.ts` compares complete Node/browser
states for minimum/maximum tiers, current/historical playback and near/far
approaches on phone and desktop. It also checks original meshes, rewind, reduced
motion and WebGL health. Screenshots stay in ignored `output/playtest/`.
