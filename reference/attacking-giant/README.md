# Attacking Giant family windup and recovery

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The inherited `Giant` and `Super Giant` rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=2000`, `AttackRange=100`, defense preference, and no
`CoolDownOverride` or `NewTargetAttackDelay`. This holds across all fourteen Giant
and ten Super Giant source levels. Super Giant's displayed level uses the existing
`VisualLevel` offset.

The older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
subtracts default recovery above 1500 ms; [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
holds windup during recovery. Under the same deterministic adapter used for
[Golem](../attacking-golem/README.md), both Giants therefore have a 1.5 s fresh
windup and a 0.5 s recovery within their 2 s period. This is source-table evidence
plus older-engine corroboration; modern native executable timing is unverified.

An actual deployment against an unarmed Storage reproduced an immediate first hit
for both actors. The level-one Storage fell from 4200 to 4176 HP for Giant and to
4020 HP for Super Giant on the first in-range update, before a full swing could play.

## Recording version 171

Both actors now start their windup after approaching the target. Release resolves
one direct ground hit, then retains recovery and negative timer overshoot for an
exact two-second repeat at 20 Hz. Target changes spend remaining recovery once.
Freeze and stun hold both phases; existing attack-speed modifiers scale both.
Giant keeps the established legacy movement/selection path and shares P.E.K.K.A's
extracted direct-hit adapter. Super Giant keeps its native route and source damage
modifiers, including its Wall multiplier. No numerical stat changes are introduced.

Buildings, blocking walls and eligible defenders share the release clock. Defense
preference still ignores nearby defenders while a preferred or committed building
stands. A committed wall supplies the original actor's facing. The existing native
pose sampler uses the captured offset relative to `ActionFrame`, so the swing and
follow-through align with release and remain stable while paused or seeking.

Only carried Giant/Super Giant armies enable the new capability. Versions 170 and
earlier retain their prior immediate hits and original state shape; save version
and assets do not change. Local pathfinding, geometry and projection conventions
remain in effect; native pixel or executable parity is not claimed.

## Validation

`tests/attacking-giant-windup.test.ts` checks every source level, near/far approaches,
damage, fresh/repeat periods, Freeze, faster/slower action clocks, recovery retargets,
defense preference, ground-only direct attacks, wall damage and committed facing.
Portable recordings use actual deployment inputs against a live Cannon and compare
complete forward/backward snapshots under versions 170 and 171. The existing
P.E.K.K.A and Golem regression suites verify the shared controller's other users.
Historical presentation parity tests now select their own feature's engine version;
`tests/giant-spell-replays.test.ts` separately retains complete current-engine
Clone, Healing, Recall, Ice Block and resurrected-aura recordings with Giants.

`tests/browser/attacking-giant-windup.spec.ts` compares full Node/Chromium battle
states, first/last-level original meshes, native action offsets, reverse seeks,
historical recordings, reduced-motion/read-only rendering and WebGL health at
desktop and phone widths. Screenshots are written under ignored `output/playtest/`.
