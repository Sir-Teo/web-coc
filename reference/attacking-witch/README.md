# Attacking Witch family windup and native projectiles

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All eight Witch and Super Witch levels declare `AttackSpeed=700`, no `CoolDownOverride`
and no `NewTargetAttackDelay`. The source-derived split is a 0.7 s windup, no recovery,
zero initial charge and a 0.7 s repeat period. This follows the same older
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
interpretation used by [defending Witch](../garrison/README.md). Modern native executable
timing parity remains unavailable; this is an explicit deterministic local adapter.

A read-only caster-release probe found immediate first projectiles at minimum and maximum
levels. Near deployment at x=11.4 engaged/released at 0.05 s. Far deployment at x=6.9
engaged/released at 1.55 s for Witch and 1.6 s for Super Witch. The next releases followed
0.7 s later. The probe follows the caster's own release counter, avoiding damage from
summoned Skeletons. Version 166 instead starts a full 0.7 s fresh charge on engagement;
the initial active update contributes its 50 ms once. Repeat periods stay 0.7 s.

Building, blocking-wall and eligible defender attacks prepare the same split controller.
Freeze/stun holds the windup; existing attack-speed modifiers scale it. An alerted ground
or air defender can interrupt a building charge and starts a fresh defender charge. The
controller keeps the source Witch family's air-target capability while the earlier ground-only
families retain their prior resolution and target traits. Original actor facing follows a
committed wall, and animation sampling uses the captured action-frame offset.

Building release keeps its existing native strike route. Defender release replaces the former generic arrow with the
original `Witch_projectile`, source level, damage, 0.3-tile splash and target
layer. The pinned projectile declares `DontTrackTarget=TRUE`: its landing stays at the
launch aim. A single blast resolves there on the selected ground or air layer; the primary
receives no additional direct hit. Moving targets can escape, nearby targets can be hit, and
defenders not born at the precise impact time are excluded. Air blasts leave buildings
and ground defenders untouched. The older [projectile area-damage path](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicProjectile.cs) separately corroborates
a single area pass and selected-layer behavior. The existing original projectile mesh and launch/impact audio remain in use.
Summon ownership, finite stock, spawn deadlines, Recall behavior and lifecycle timing
stay in their established path, which runs before the attack controller each update.
The attack clock does not consume or reset summon stock.

Only armies carrying Witch or Super Witch enable this boundary. Version 165 and earlier
preserve immediate first projectiles, defender arrows, homing, historical targeting and state shape. Source stats,
artwork, audio assets, movement and existing local projectile/presentation limits remain.
Exact modern executable combat timing and native pixel parity are not asserted.

Model coverage checks all eight levels of both families, near/far engagement, original
projectile identity/damage, ground and air defenders, single impact damage, minimum/maximum splash, selected-layer/radius/birth exclusions, moving targets, post-death completion, full Freeze, faster/slower
attacks, fresh defender retargeting, blocking walls, historical first release and summon-stock
parity. Portable fixtures use ordinary deployment and actual Castle releases in both layers,
with complete forward/reverse battle snapshots. Browser checks cover minimum/maximum original
caster meshes and the original projectile, captured offsets, complete Node/Chromium states,
reverse seeks, read-only/reduced-motion rendering, decoded launch cues and WebGL health on
desktop and phone.

The Recall version-147 parity comparisons remain pinned to version 148, their feature
boundary. Separate current-version portable Recall recordings and all-level ownership
checks retain coverage with the new attack state. The Super Witch fixture sets its original
Witch research level too, so maximum-level cases actually deploy their requested source
level. Real Castle recordings capture the exact first defender-projectile release, which
can follow an earlier building attack; historical arrows and current native meshes are
checked at that captured state.
