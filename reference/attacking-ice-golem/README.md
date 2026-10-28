# Attacking Ice Golem phases and melee frost

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All nine inherited `characters.Ice Golem` rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=2000`, `AttackRange=100`, `FrostOnHitTime=2000` and
`FrostOnHitPercent=50`, with ground-only targeting and defense preference. The
[pinned wiki comparison](../official-wiki/troops/ice-golem.md) explicitly includes
defending units among the targets chilled by a melee hit.

There is no `CoolDownOverride` or `NewTargetAttackDelay`. The older
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
corroborate the established split-clock adapter: 1.5 s fresh windup, 0.5 s recovery,
2 s period. Modern executable attack timing is unverified.

## Recording version 172

An actual level-one deployment previously removed 48 HP from a Storage on the
first in-range update. The new shared controller starts its windup on engagement,
releases one direct hit, then preserves recovery and timer overshoot. Freeze/stun
hold both phases, attack-speed modifiers scale them, and retargeting spends
remaining recovery once. Buildings, blocking walls and ground defenders use the
same clock. Existing defense/commitment preference and routing remain in place.
Original poses and wall facing follow the captured action-frame offset.

The old direct defender-hit path also discarded the source frost fields. Each
new melee contact now passes its two-second, 50% frost to the existing defender
status system. Its existing local adapter slows both movement and attack clocks,
multiplies retained Poison scales, replaces frost on a later hit and expires at
the captured deadline. Living original defender bodies use the existing blue
status tint. Exact modern engine slow composition remains unverified. Air targets
are ineligible; lethal contacts do not create a fresh frost on the dead body.

Only carried Ice Golem armies enable these rules. Versions 171 and earlier retain
their immediate first hits and absence of defender melee frost. Source damage,
HP, building frost and death spells are unchanged; no new asset or save format is
required. Local projection, movement and geometry conventions remain in effect.

## Validation

`tests/attacking-ice-golem-windup.test.ts` checks all nine source levels, near/far
engagement, first/repeat damage, building and defender frost, expiry/refresh,
ground-only direct hits, Freeze/stun, retarget recovery and defense preference.
Portable cases use actual Cannon fights or an actual Archer lure that releases
a Clan Castle Golem before the Ice Golem deploys. They compare complete current
and historical battle snapshots in both seek directions at levels 1 and 9.

`tests/browser/attacking-ice-golem-windup.spec.ts` compares full Node/Chromium states
on desktop and phone, checks original attacker/defender meshes, negative windup
offsets and the real defender's blue tint, and verifies historical playback,
reverse seeks, reduced-motion/read-only rendering and WebGL health. Screenshots
are written under ignored `output/playtest/`.
