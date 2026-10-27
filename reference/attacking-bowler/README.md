# Attacking Bowler windup and recovery

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Bowler dossier](../official-wiki/troops/bowler.md) and character rows describe a 2200 ms
attack interval and `NewTargetAttackDelay=1100`. The existing source-derived `splitTiming`
interpretation gives 700 ms recovery, 1500 ms full windup and 1100 ms initial charge, leaving
a 400 ms fresh-target wait. All ten pinned Bowler levels use those timing values.

The older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
subtracts default recovery above 1500 ms and converts the new-target field into initial
charge. This is the same interpretation used for [defending Bowler](../garrison/README.md).
The older engine corroborates the local timing rule; modern native executable parity is
unavailable.

Previously the attacking generic path treated the raw 1.1 s field as a wall-clock delay from
target acquisition, including travel. Real unarmed campaign probes at level 1 showed:

| Deployment x | First in-range update | First release | Wait after entering range |
| ------------ | --------------------- | ------------- | ------------------------- |
| 11.4 | 0.05 s | 1.15 s | 1.1 s |
| 6.9 | 1.85 s | 1.85 s | 0 |

Version 156 gives attacking Bowler a separate active-time windup/recovery controller.
A fresh target starts charging on reaching range, after recovery left. The first attack
therefore takes 0.4 s including the first 50 ms update; same-target releases stay 2.2 s apart.
An immediate target switch after release waits 0.7 + 0.4 = 1.1 s. Each active tick advances
once, preserves overshoot and uses the existing attack-interval scale. Freeze/stun holds both
phases, and poison/attack-speed boosts scale them together. A committed charge can complete
while following a retreating defender; the existing ground router handles the approach.

The original attack pose maps the remaining windup to the source one-based `ActionFrame`,
then follows through during recovery. Its captured animation offset also holds through full
Freeze and survives reverse seeks. This is a deterministic presentation alignment using the
existing source clip metadata.

The existing release handlers are retained: native boulders/bounces against buildings and
walls, and the established defender-targeted arrow path against defending units. This boundary
does not add new defender-targeted boulder flight/art or attacking Bowler throw audio. Source
stats, projectile damage and bounce rules retain their existing values. Only armies carrying
Bowler enable the controller; versions 155 and earlier keep the acquisition-time delay.

`tests/attacking-bowler-windup.test.ts` covers all ten levels and both approach distances,
first/repeat timing, Freeze in windup and recovery, retargeting, moving defenders, exact
single-hit defender damage, faster/slower clocks and complete current/historical portable
reverse seeks. Portable fixtures use actual deployment inputs with valid campaign metadata;
controlled status/retarget checks are separate isolated model tests. The browser spec
`tests/browser/attacking-bowler-windup.spec.ts` verifies full Node/Chromium states, original
meshes, read-only/reduced rendering and rewind on desktop and phone.
