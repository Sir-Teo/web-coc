# Attacking Wizard source charges and fixed-aim fireballs

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All fourteen `characters.Wizard` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=1500`, no cooldown override or new-target delay, three-tile
range, two-tile/s movement, ground/air targets and 0.3-tile splash. The
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**1.5-second fresh and repeat charge with zero recovery**. Modern executable
first-hit timing remains unverified.

Projectiles are `ps_chr_WizardAttack_Projectile` at levels 1–3 (five tiles/s),
`_lvl2` at 4–5, `_lvl3` at 6–7 and `_lvl4` at 8–14 (nine tiles/s for all three
later variants). Every row sets `StartHeight=25`, `IsBallistic=FALSE` and
`DontTrackTarget=TRUE`, with no random target offset. The existing native
minimum flight duration of 0.12 seconds remains a local adapter.

Version-193 recordings already have fixed-aim generic fireballs and 0.3-tile
splash. Actual near/far building fights release immediately on arrival at
0.05/1.65 seconds, repeat every 1.5 seconds and use five-tile/s generic shots
at every tier. Damage is already correct, including fractional 187.5 at
level four and 465 at level fourteen.

## Recording version 194

Carried ordinary Wizards and Wizards released by a carried Siege Barracks
spend the full charge after arrival. They retain legacy movement, selection
and damage while releasing their own tier's original projectile. Blocking
Walls and eligible ground/air defenders share the clock. Freeze/stun, action
modifiers, timer remainder, replacement targets and original body phase
offsets use the shared controller. Angry Spell forced selection cancels the
pending charge immediately. Siege Barracks research tiers, roster, stock,
spawn deadlines and ownership remain in their established path.

Every fireball keeps its release aim and applies one area pass on the captured
layer at impact. A moving primary can escape; nearby eligible targets can be
hit. Ground shots reach building footprints and ground defenders, while air
shots leave those targets untouched. The primary receives no extra direct
hit, traps and friendly units are excluded, and defenders born after the
precise impact time are excluded. The [older area-damage path](../attacking-witch/README.md)
corroborates the fixed-point, selected-layer adapter. Witch impact resolution
calls the same extracted area helper with its existing gates and sound journal.
Released shots survive the caster's defeat.

Only carried Wizards or Siege Barracks enable this capability. Super Wizards,
defensive Wizards and versions 193 and earlier retain their separate rules.
Village saves, numerical stats and assets do not change. Local geometry,
pathfinding, projection and minimum flight duration remain in use; native
pixel or executable parity is not claimed.

## Validation

`tests/attacking-wizard-windup.test.ts` covers every source tier from near/far,
source projectile identity/speed, fresh/repeat charges, impact damage,
selected-layer splash, escaping targets, radius/birth exclusions, ground
building collateral, Freeze/stun, action modifiers, remainder, retargeting,
Walls, traps and a final fireball awarding the last stars after caster defeat.

Portable versions 193/194 use actual Storage deployments and real Archer-lured
Golem/Dragon reserves held by Freeze. Separate release, arrival and next-release
checkpoints prevent slow historical fireballs from being mistaken for a second
attack. Actual Siege Barracks levels 1/6 release research-level 1/14 Wizards with
none carried. Their charges, source projectiles and complete states reconstruct
forward and backward. Combat feedback now carries a Wizard and waits for its
source release; progression verifies fractional damage and the level-four
nine-tile/s shot. Shrink cases double the fresh charge while retaining damage
and health. Actual Angry Spell levels 1/4 interrupt a fresh Wizard
charge using a slightly farther legal drop and earlier cast; ordinary Barbarian
and Goblin targeting fixtures retain their established inputs.

`tests/browser/attacking-wizard-windup.spec.ts` checks current/historical
Storage, frozen Golem/Dragon and Siege Barracks fights at phone and desktop
widths, original meshes and fireballs, phase offsets, reverse seeks, read-only
rendering, reduced motion, asset requests and WebGL health. Two actual Angry
Spell cases verify forced retargeting. Screenshots go to ignored `output/playtest/`.
