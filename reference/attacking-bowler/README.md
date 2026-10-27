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

## Native defender boulders and fixed landings (recording version 157)

The pinned Bowler character rows declare `ProjectileBounces=2`, `ChainShootingDistance=400`
and `DamageRadius=30`: two total impacts, a four-tile bounce extension, and 0.3-tile splash.
Their level-specific `trollBoulder_*` projectile rows use speed 475, or 4.75 tiles/s.
DPS at levels 1–10 is 60, 72, 84, 96, 102, 108, 114, 126, 140 and 160; each throw deals
that value × 2.2. These are source facts. As in the [garrison implementation](../garrison/README.md),
the second point is fixed from the original launch aim. This follows the older chained
projectile interpretation; native 18.400.21 executable geometry remains unavailable.

Before version 157, the attacker still used the legacy arrow against defending units.
The native building path's second leg could also select a building near its destination,
used a 0.5-tile radius floor and could track an attacker when its ID overlapped the original
building. Version 157 replaces the defender arrow with the actual native projectile and
captures its original aim. The primary hit tracks normally; the fixed second point extends
the original source-to-aim ray by four tiles and never reacquires a target.

Each landing uses the source 0.3-tile ground splash. The captured direct primary hit is
excluded from the accompanying area pass so it takes damage once. Impact timestamps, rather
than update-frame end time, exclude defenders not yet born. Both legs survive the thrower's
death. Windup, recovery, damage boosts and source stats keep their version-156 rules.
Only carried Bowler armies enable this boundary. Historical recordings through version 156
retain their old arrow, tracking and radius behavior. No new art/audio asset is required;
the already imported boulder and trail now cover defender-targeted flight too. Attacking
throw audio remains a separate binding.

`tests/attacking-bowler-boulders.test.ts` checks all ten levels, source flight speed and
single splash damage, air exclusion, moving targets, fixed landings, an integer-grid building
0.4 tiles outside the landing, source-ID overlap, post-death completion, exact birth/impact
ordering, scoped allocation and complete current/historical portable reverse seeks. The real
Castle-release fixture uses ordinary deployments with no injected health/status state.
`tests/browser/attacking-bowler-boulders.spec.ts` checks complete Node/Chromium snapshots,
original first-leg and second-leg meshes, historical arrows, rewind, reduced motion and
read-only rendering on desktop and phone.
