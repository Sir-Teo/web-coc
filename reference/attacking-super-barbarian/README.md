# Attacking Super Barbarian engagement charges

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All nine `characters.Super Barbarian` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=800`,
`NewTargetAttackDelay=700`, no cooldown override, 0.6-tile range and ground-only
melee. The established [older split-clock adapter](../attacking-giant/README.md)
gives **0.7 seconds from fresh engagement and 0.8-second repeats**, with zero
separate recovery. The older getter converts the delay to 100 ms of elapsed
precharge; that is not a 100-ms remaining wait. Modern executable first-hit
timing remains unverified.

The referenced `Super Barbarian Ability` adds 70% damage and 1.5 tiles/s for
eight seconds, with no attack-speed bonus. Those source fields are inherited
at all nine tiers. The [wiki comparison](../official-wiki/spells-siege-super/super-barbarian.md)
records an ambiguity in the wiki's speed units; this change retains the
existing ability-row interpretation and numerical stats.

Actual version-194 Storage fights hit at 0.75 seconds from a near drop and
1.45 seconds from a far drop. The former uses a target-selection timer;
the latter arrives after it has expired and attacks immediately. Both repeat
every 0.8 seconds. Tier 1/9 boosted hits deal 163.2/367.2 damage.

## Recording version 195

Carried Super Barbarians begin the fresh charge after arrival at an eligible
building, blocking Wall or ground defender. Repeat timing, Rage damage and
movement remain unchanged. Freeze/stun hold the charge; existing action
modifiers scale it, timer remainder carries forward, and replacement targets
start a fresh 0.7-second charge. Original body poses use the captured phase.
Actual Angry Spell forced selection cancels the pending charge immediately.

Deployment Rage keeps its own lifecycle clock. The current ordinary-deployment
adapter initializes it on the first simulation update, yielding an 8.05-second
deadline for a time-zero drop at 20 Hz. Freeze does not extend that deadline.
A charge held past expiry releases with ordinary damage and speed. No new
attack-speed boost, ability refresh, numerical stat or birth-time rule is added.

Only an army carrying Super Barbarian enables the capability. Ordinary
Barbarians, defensive troops and versions 194 and earlier retain their own
rules and state shape. Saves and assets do not change. Local geometry,
pathfinding and lifecycle sampling remain adapters; modern executable and
pixel parity are not claimed.

## Validation

`tests/attacking-super-barbarian-windup.test.ts` covers all nine tiers from
near/far, boosted damage, fresh/repeat timing, ground-only direct attacks,
Freeze/stun, action modifiers, remainder, retargeting, Walls and traps.
Every tier also verifies an active Rage boost, a positive charge held through
its independent expiry, then ordinary damage and unchanged repeat cadence.

Actual Cannon and Archer-lured Golem recordings capture the physical hit
event, avoiding an assumption that a historical building attack fires on
arrival. Levels 1/9 reconstruct complete portable versions 194/195 forward
and backward. Actual Angry Spell levels 1/4 interrupt a repeat charge, retaining
earlier damage while preventing an extra hit on the old target. The shared
targeting fixture preserves existing troop inputs and sets the original
Barbarian research tier for its optional Super Barbarian.

`tests/browser/attacking-super-barbarian-windup.spec.ts` checks current/historical
Cannon and Golem fights at phone and desktop widths, original bodies, charge
offsets, reverse seeks, read-only rendering, reduced motion, asset requests
and WebGL health. Two actual Angry Spell cases verify forced retargeting.
Screenshots go to ignored `output/playtest/`.
