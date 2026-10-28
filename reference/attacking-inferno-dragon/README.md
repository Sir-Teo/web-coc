# Inferno Dragon beam cadence

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve `characters.Inferno Dragon` tiers in [the combat tables](../full-client/combat.json)
inherit `AttackSpeed=128`, 3.5-tile range, 2.25-tile/s flight and both air
and ground targeting. IncreasingDamage uses thresholds 1.7/3.2 seconds and
a 600-ms target-kill cooldown. DPS ranges across the twelve tiers are
55–91, 110–182 and 1,100–1,820. Multiplying by the source 0.128-second
period gives 7.04–11.648, 14.08–23.296 and 140.8–232.96 per hit.
The pinned older [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
retains `m_hitTime - attackSpeed` after an in-line attack. The local 20-Hz
adapter carries that remainder rather than rounding each source period up.
Modern executable and pixel parity remain unverified.

Actual version-208 near/far Storage deployments start their beams at
0.05/1.25 seconds. The former cooldown reset repeats at 0.15-second
intervals in the 20-Hz simulation. Discarding each fractional remainder
makes the sustained hit rate lower than the declared source cadence.

## Recording version 209

A carried Inferno Dragon retains fractional cooldown time while repeatedly
hitting the same building or defender. At 20 Hz the 0.128-second period
uses a deterministic mixture of 0.10- and 0.15-second gaps. For example,
the first four pulses occur at offsets 0, 0.15, 0.30 and 0.40 seconds.
The existing immediate beam startup is retained; no melee charge is added.

Unused time while walking does not credit repeated hits on a fresh target.
Target identity includes the building/defender namespace. A killing hit
still clears the ramp and starts the 0.6-second source recovery. Freeze
and stun hold cooldown time, including the active fraction of a thawing
sample, so the next attack cannot spend a bank of frozen timer debt.
Existing action modifiers and Shrink retain their separate scaling.

The existing heat ramp still starts at the first resolved hit and uses
elapsed battle time. In particular, this change does not establish a new
native interpretation of heat during Freeze; the retained behavior can
resume at a stronger stage after thawing. Source beams, stage transitions
and sustained original sound loops keep their existing ownership and
presentation clocks. See [the presentation reference](../inferno-dragon/README.md).
No asset, numerical stat or village-save changes are introduced. Versions
208 and earlier retain their former cooldown reset and Freeze behavior.

## Validation

`tests/inferno-dragon-cadence.test.ts` checks all twelve tiers from near/far,
every pulse through all damage stages, both defender modes, partial Freeze
and stun recovery, kill recovery, approach reset, native attack modifiers,
Shrink, irregular samples, roster gating, colliding numeric target IDs and historical controls. Actual
Storage and Archer-lured, frozen Castle Golem/Dragon fights compare complete
portable states in both seek directions at levels 1/12 under versions
208/209. An army without this troop retains identical state across versions.

`tests/browser/inferno-dragon-cadence.spec.ts` checks complete Node/Chromium
states, backward seeks, endpoint bodies, all three source beam stages and
loop cues, read-only drawing, reduced motion, asset requests and WebGL
health on phone/desktop viewport sizes. Existing original-loop and detached
transition browser checks cover actual Web Audio playback. Screenshots go
to ignored `output/playtest/`; these checks do not measure physical phone
performance.
