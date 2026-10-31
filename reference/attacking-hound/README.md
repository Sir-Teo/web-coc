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

## Seeded death-position portability (recording version 170)

Both parents declare `RandomizeSecSpawnDist=TRUE`. The existing local adapter samples a
seeded turn and a square-root-scaled radius inside the source `SecondarySpawnDist` disk.
Its seed, source ID, child index, count and radial samples are unchanged. The geometry
remains a local interpretation; exact native-client release positions are unverified.

Host `Math.sin` / `Math.cos` could differ in their final bits. A read-only Node/Chromium
probe found 48 coordinate differences across 576 profiles using stage-derived seeds,
including Lava Hound level 3 at seed 1337: x=9.509818384904504 versus 9.509818384904506.
A separate 576-profile numerical probe across wider seed values found 62 differences.
Uniform-ring probing was not used as evidence for the actual randomized spawn rule.

Version 170 uses quarter-turn reduction and fixed binary64 Horner operations for direction.
The same seeded hashes, radial square root and source distances still determine each point.
Across 100,000 sampled turns, the largest component difference from the former Node
calculation was below 9e-16; the fixed implementation produced zero Node/Chromium differences
in the seeded probe. Only carried Hound parents enable this boundary. Older versions retain
their original host trigonometry. Counts, identity, ownership, health, birth times, source
stats, attacks, effects and assets are unchanged; coordinates can shift by rounding scale.

Model checks cover every parent level, complete child state apart from bounded coordinate
differences, source disk bounds, finite stock and current/historical portable recordings.
Real Monolith defeats provide full wave snapshots. Current browser checks compare complete
Node/Chromium battle states through birth, movement and combat, on desktop and phone.
Historical browser expectations are captured in Chromium to preserve the old host behavior;
those cases do not claim cross-engine equality. Original Pup meshes, reverse seeks,
read-only/reduced-motion rendering and WebGL health also pass. Replay seeds are derived
from stage index by the existing schema; no standalone setup seed is introduced.

## Recording version 214: Pup attack charge

Both source child rows, `Lava Pup` and `Ice Hound Pup`, declare `AttackSpeed=1000`,
`AttackRange=225`, `DPS=35`, `Hitpoints=50`, and both ground and air targets. Each has
one source tier; raising the parent level changes its finite release count, not the
child's stats. Neither row declares a cooldown override or initial target delay. The
same pinned older-engine timing adapter described above therefore gives a one-second
first charge, zero recovery, and a one-second repeat. This is a local interpretation;
modern executable timing and exact projectile aim remain unverified.

A pre-change ordinary Monolith-death probe found immediate first Pup releases at
engagement for minimum/maximum Lava Hound and Ice Hound parents. Version 214 starts
its charge only once a target is in range. Freeze/stun pauses the charge; attack-speed
modifiers and Shrink scale the first and repeat periods. Original child action meshes
use the captured phase offset. Pups still fly, cross Walls, and attack ground or air.

Their existing source projectiles (`tinyhound_projectile` and
`icy_tinyhound_projectile`) travel at `Speed=300` (three tiles per second). Building
shots retain their existing native damage and frost path. Defender shots now release
through the same source projectile adapter after charging, with Ice Pup's
`FrostOnHitTime=2000` and `FrostOnHitPercent=50` captured at launch. This keeps the
two-second, 50% chill after the shooter dies. Parent attacks, death blasts, Ice death
Freeze, seeded child positions, ownership, finite stock and art/audio assets are
unchanged. Equipment-created Lavaloon Pups use a distinct kind and retain their rules.

Only initial armies carrying Lava Hound or Ice Hound enable the new phases. Version
213 and earlier keep immediate Pup attacks and their previous state shape. Tests check
historical ordinary wave snapshots against SHA-256 digests captured before this change,
as well as full forward/reverse portable states in both versions. Source projectile
identity, flight speed, damage, ground/air defender targeting, captured Ice frost,
Freeze/stun, faster/slower clocks, Shrink, retargeting and defeated attackers have model
coverage. Ordinary recordings use actual Monolith defeats without injected combat state;
isolated damage checks freeze other bodies and the Monolith and discard their in-flight
shots, while retaining the parent's delayed death blast.
