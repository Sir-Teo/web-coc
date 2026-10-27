# Attacking Hound parents: windup and Lava projectile

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All eight Lava Hound and Ice Hound levels declare `AttackSpeed=2000`, no
`CoolDownOverride` and no `NewTargetAttackDelay`. The source-derived split is a 1.5 s
windup, 0.5 s recovery, zero initial charge and a 2 s repeat period. This is the older
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
interpretation used by [defending Lava Hound](../garrison/README.md). Modern native
executable timing parity remains unavailable; this is an explicit local adapter.

A read-only release probe found immediate first attacks for minimum/maximum parents:
0.6 s after deployment at x=11.4, and 2.4 s at x=6.9. Repeats followed 2 s later.
Version 169 starts a full 1.5 s first windup on engagement and preserves that period with
0.5 s recovery. Each active update spends its time once; Freeze/stun holds both phases,
and existing attack-speed modifiers scale both. Recovery retargets preserve unspent time.
Original actor meshes use the captured action-frame offset for windup/follow-through.

Lava Hound declares `Projectile=hound_projectile` even though `AttackRange=25` (0.25 tile).
The former native strike branch required range at least one tile and therefore delivered
an immediate direct hit. The new boundary releases the already shipped original projectile
at its source `Speed=200` (2 tiles/s), with source level/damage and ground target layer.
Its row allows tracking (`DontTrackTarget=FALSE`). Impact, including after caster defeat,
uses the existing native projectile path. The current local center-aim/flight projection
adapter remains; exact native footprint aim, offsets and executable geometry are unverified.

Ice Hound declares no projectile. It keeps a direct hit after the windup and applies its
source `FrostOnHitTime=2000`, `FrostOnHitPercent=50`: a two-second, 50% chill. If no
building is eligible, its ground-defender attack uses the same direct chill; Lava Hound
uses its original spit. Both parents retain ground-only targeting and their existing
Air Defense preference and movement. A standing committed building continues to take
precedence over alerted defenders.

Only initial armies carrying Lava Hound or Ice Hound enable this boundary. Version 168
and earlier preserve immediate first hits, direct Lava building damage and historical
states. Pup attack behavior, finite release counts/positions, death effects, source damage,
artwork and audio assets are unchanged. No new art or sound file is added.

Model checks cover all eight levels of both parents from near/far approaches, exact
fresh/repeat timing, source damage/flight speed, Ice chill, Freeze, faster/slower clocks,
recovery retargets, building commitment and ground-only defender releases. Separate all-level
death checks preserve complete Pup states against version 168, and an in-flight Lava
projectile resolves once after parent defeat and normal Pup release. Portable
recordings deploy against an actual armed Air Defense, preserving complete forward/reverse
current/historical states. Browser checks verify complete Node/Chromium state, original
minimum/maximum parent meshes and Lava flight art, action offsets, reverse seeks,
read-only/reduced-motion rendering and WebGL health on desktop and phone.
