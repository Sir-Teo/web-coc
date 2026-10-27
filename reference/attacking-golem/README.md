# Attacking Golem family windup and recovery

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All fifteen Golem and Golemite levels use the following source-derived split clocks:

| Actor | Attack interval | Recovery | Full windup | Initial charge | Fresh wait |
| --- | --- | --- | --- | --- | --- |
| Golem | 2.4 s | 0.9 s | 1.5 s | 0 | 1.5 s |
| Golemite | 3 s | 1.5 s | 1.5 s | 0 | 1.5 s |

The pinned rows declare `AttackSpeed=2400` / `3000`, no `CoolDownOverride`, and no
`NewTargetAttackDelay`. The older [LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
subtracts default recovery above 1500 ms; [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
holds windup during recovery and strikes when it fills. This is the established interpretation
used by [defending Golem/Golemite](../garrison/README.md). Native executable timing parity is
unavailable; these are explicit deterministic local combat adapters corroborated by older code.

A read-only deployment/HP probe exposed immediate attacking Golem first hits and a 2.45 s
repeat at 20 Hz, instead of the source 2.4 s period. With an unarmed Town Hall and Storage:

| Level | Deploy x | First in-range update | First damage | Next damage |
| --- | --- | --- | --- | --- |
| 1 / 8 | 11.4 | 0.5 s | 0.5 s | 2.95 s |
| 1 / 8 | 6.9 | 3.5 s | 3.5 s | 5.95 s |

Version 162 starts a full 1.5 s fresh windup on engagement, after recovery left. A hit captures
its 0.9/1.5 s recovery and preserves negative timer overshoot; repeat periods remain exact
rather than gaining a floating-point update. Freeze/stun holds both phases, including the
existing partial-thaw accounting. Poison, boosts and other existing attack-clock modifiers
scale windup and recovery together. Damage values, movement and target spacing keep their
prior source rules. A committed windup uses the existing ground pursuit route.

The shared controller reuses the existing preferred-or-committed building decision, so Golems
continue ignoring defenders while a preferred or committed building stands. A newly available
preferred defense can interrupt a defender windup. Ordinary buildings, blocking walls and
eligible defending troops all release through this timer. The defender-pursuit wall callback
begins a windup instead of delivering an immediate generic wall hit. Wall windups remain
committed while the selected enemy stays out of reach behind the obstacle; a defender entering
melee range can interrupt that wall charge and starts a fresh defender windup.

The original actor faces its committed wall while winding up, even if the pursued defender
moves behind it. Its pose uses seconds relative to its own `ActionFrame`: negative while winding
up, positive in follow-through. Full Freeze holds the captured offset. This aligns the local
pose to physical release without fabricating animation frames. Bowler uses the same extracted
controller with its original state property and audio clock; its former import API remains
available. Existing Bowler versions retain their exact behavior.

Only initial armies carrying Golem enable this boundary, covering the Golemites they spawn.
Older replays preserve their prior immediate-first-hit and repeat timing. No source stat,
artwork or sound file changes. The existing local split positions, paths, projection and
finite child counts remain in effect; native geometry/pixel parity is not asserted.

`tests/attacking-golem-windup.test.ts` checks all fifteen levels of both actors, source damage,
fresh/repeat clocks, near/far approaches, full Freeze, faster/slower action clocks, recovery
retargets, building preference, a newly available defense and a wall blocking defender pursuit.
It also verifies complete current/historical portable snapshots in both directions for live
Cannon fights, maximum-level long approaches, and an actual Monolith defeat that releases two
level-one Golemites. Controlled child/status cases are isolated model tests; portable fixtures
use only ordinary troop deployment inputs. Chromium verifies full Node/browser states,
original level-1/15 and naturally spawned child meshes, action offsets, historical playback,
reverse seeks, reduced-motion/read-only rendering and WebGL health on desktop and phone.


The Invisibility presentation comparison remains pinned to its version-120 boundary against
version 119; its historical damage is not reinterpreted as a current Golem fight. A separate
current-version test keeps full forward/reverse snapshots and checks that Invisibility cancels
a Golem charge against the hidden defender. This preserves both historical spell proof and
coverage of the new controller's visibility behavior.
