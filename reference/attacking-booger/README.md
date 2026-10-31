# Attacking Boogers: flying melee charge

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `Booger` rows declare `AttackSpeed=1000`, no `CoolDownOverride` or
`NewTargetAttackDelay`, `AttackRange=90`, no projectile, and both ground and air
attacks. They are flying spawned troops, not pets themselves, and do not trigger
traps. Sneezy's source summon level selects their tier.

The existing pinned older-engine
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and
[LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
adapter gives a one-second fresh charge, zero recovery and one-second repeat.
Modern native executable timing remains unverified; this is a local interpretation.

A pre-change ordinary King/Sneezy deployment probe found immediate first Booger
hits after near and far approaches, at 2.55 s and 5.5 s for minimum/maximum tiers.
Version 215 starts the first charge on engagement, retaining the one-second repeat.
Freeze/stun holds active phase time, attack-speed modifiers and Shrink scale it,
and replacing a target starts a fresh charge. Releases are direct melee hits against
buildings and ground or flying defenders, with the correct source/target air layers.

Booger uses the original baked `PetBatBubbleDefault` atlas on the Hero presentation
layer. Its attack declares action frame 9 at 15 fps. The new renderer uses the captured
charge offset relative to that frame, including the contact frame on release despite
zero recovery. A frozen pending charge retains its attack pose. Reduced-motion rendering
keeps the first frame, and repeated/backward redraws do not mutate combat state.

Only initial Hero setups carrying Sneezy enable this boundary. Version 214 and earlier
retain their immediate hits and prior state shape. Sneezy's summoning and transformation,
scheduled births, tiers, ownership, living cap, Recall rules and original artwork/audio
assets retain their behavior. The parent's separate source spawn-idle interpretation is
outside this change.

Model checks cover all ten tiers from both approaches, source direct damage, ground/air
defenders, Freeze/stun, faster/slower clocks, Shrink, Wall bypass, retargeting, defeat and
irregular update remainders. Ordinary portable recordings use only real Hero deployment
and Sneezy summons; current/historical complete states seek in both directions. Historical
snapshots also match SHA-256 digests captured before the change. Isolated damage checks
freeze the King and parent after the child is born. Presentation checks use the shipped
atlas to verify charge, frozen charge, contact and reduced-motion frames, with backward
redraws and read-only state checks.

Chromium and WebKit checks compare complete Node states for minimum/maximum tiers from
near and far approaches, current and historical versions, and both seek directions.
They verify original Booger sprite visibility and contact frames, source tier,
read-only/reduced-motion rendering, asset loads and WebGL health on desktop and phone.
