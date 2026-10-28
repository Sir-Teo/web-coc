# Attacking Apprentice Warden source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All four `characters.Apprentice Warden` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=900`,
`AttackRange=500`, ground and air targets, jumping, and no cooldown override or
new-target delay. Under the established
[older-engine split-clock adapter](../attacking-giant/README.md), they give a
0.9-second fresh windup, zero post-hit recovery and a 0.9-second repeat period.
Modern executable attack timing remains unverified. The
[official-wiki comparison](../official-wiki/troops/apprentice-warden.md) agrees
with the period, range, single-target damage and health aura.

## Recording version 180

A carried Apprentice Warden starts its attack charge only after reaching range.
Building and defender engagements share the same timer. Ground and air defenders
receive the source `ApprenticeWarden_small` (levels 1–2) or
`ApprenticeWarden_small2` (levels 3–4) projectile after the charge; damage occurs
at the existing native flight's impact. The ground ranged-release helper is
shared with Witch without changing Witch's existing rules.

Freeze and stun hold the charge. Attack-speed modifiers scale it, target changes
start a fresh charge, and 20 Hz overshoot retains the repeat period. The native
body pose follows the recorded action offset. Existing wall jumping, group AI,
projectile flight and the independent 300 ms health-aura pulses retain their
rules. Only an initial army carrying Apprentice Warden enables the new clock;
version 179 and earlier retain their original timing and defender projectiles.
No source stats, assets, save format or replay envelope change.

## Validation

`tests/attacking-apprentice-windup.test.ts` covers all four source levels from
near and far approaches, release and impact separation, damage, both defender
layers, speed modifiers, Freeze alongside the unchanged health aura, target
replacement and a full wall line. Actual Cannon, Golem and Dragon fights at
the first and last tiers reconstruct complete portable replay snapshots in
both time directions under versions 179 and 180.

`tests/browser/attacking-apprentice-windup.spec.ts` checks those real recordings
on phone and desktop, original charge poses and live source projectile meshes,
exact seeking, read-only drawing, reduced motion, asset requests and WebGL
health. Screenshots go to ignored `output/playtest/`.
