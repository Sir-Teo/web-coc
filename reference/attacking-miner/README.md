# Attacking Miner surfacing and melee phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve ordinary Miner rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=1700`, `AttackRange=60`, `IsUnderground=TRUE`, ground-only
targets and no cooldown override or initial charge. Under the established
[older-engine split-clock adapter](../attacking-giant/README.md), this gives a
1.5-second fresh windup and 0.2-second recovery inside a 1.7-second repeat period.
Modern executable attack timing is unverified. The
[official-wiki comparison](../official-wiki/troops/miner.md) independently records
the 1.7-second period and identifies the source's 0.6-tile range versus the
wiki's 0.5 tiles.

## Recording version 178

Ordinary Miners surface when they reach a building or ground defender, then
charge before their first hit. They are visible, damageable and trap-eligible
through the windup and recovery. Their existing underground travel still ignores
Walls and solid footprints, suppresses traps and prevents incoming damage.
Freeze holds a hidden Miner underground; a thawed arrival starts a full charge.
The defender-engagement callback surfaces before starting the shared timer.

Freeze/stun hold both melee phases, attack-speed changes scale them, and timer
overshoot preserves the source 1.7-second period at 20 Hz. Changing targets spends
remaining recovery once. A fleeing defender cancels a pending charge before the
Miner reburrows; re-emergence starts a fresh windup. A Miner cannot finish that
old strike from underground. Original attack poses follow the captured action
offset. Canceling a charge on reburrowing is an explicit local adapter rule;
modern executable handling of a moving defender is unverified. Air defenders
remain ineligible.

Only carried ordinary Miner armies enable these phases. Versions 177 and earlier
keep their immediate first hits. Super Miner's separate 250 ms damage-ramp ticks,
Diggy, Battle Drill, spells, source stats, assets, audio and save format retain
their existing rules.

## Validation

`tests/attacking-miner-windup.test.ts` covers all twelve source tiers with near
and far approaches, first/repeat damage, surface eligibility, Freeze/stun,
faster/slower clocks, Wall tunneling, recovery across retargets, moving defenders
and ground-only attacks. Actual Cannon fights and Archer-lured Castle guards
retain complete current/historical snapshots through portable backward seeks.
The existing underground chase recording uses a source level-7 Freeze to keep its
level-one Miner alive through the longer exposed charge against a maximum King.
Super Miner ramp, original roster and other burrower regressions remain covered.

`tests/browser/attacking-miner-windup.spec.ts` compares full Node/Chromium battle
states, original first/last-tier meshes and exposed charge poses on desktop and
phone. It checks historical controls, backward seeks, reduced-motion/read-only
rendering and WebGL health. The existing underground chase browser scenarios
continue to cover Miner and Diggy travel, exposure and retaliation. Screenshots
go to ignored `output/playtest/`.
