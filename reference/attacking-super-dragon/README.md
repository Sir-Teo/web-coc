# Attacking Super Dragon bursts

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All eleven Super Dragon rows declare ten flames (`BurstCount=10`), 192 ms
spacing, 1,800 ms attack speed and 1,500 ms recovery override. Range is three
tiles, splash radius 1.6 tiles, and ground/air targets are eligible. See the
[pinned dossier](../official-wiki/spells-siege-super/super-dragon.md).

Previously the generic attacker ignored burst fields and emitted a single large
projectile every 1.8 seconds, immediately on entering range. Complete version-220
probes at native tiers 1 and 11 captured 541.8/966.6 damage at 0.05, 1.85, 3.65
and 5.45 seconds in the close lane. A longer approach first fired at 2.95 seconds.

Version **221** gives carried attacking Super Dragons a charged first flame and
up to nine following flames. The shared 64 ms burst-clock convention rounds the
1.8-second gap to 1.856 seconds. The first charge rounds to 0.32 seconds, followed
by nine 0.192-second spacings and 1.536 seconds of recovery before the next
charge. Continuous burst starts are 3.584 seconds apart. Each flame deals
`source DPS × 3.584 / 10`, retaining average source DPS: 107.8784 damage at tier 1,
144.0768 at the ordinary Dragon-7 tier, and 192.4608 at the Dragon-13 tier.
These agree with the dossier's rounded per-flame values. Historical recordings
retain their original single-release damage and interval.

The clock convention already used for native burst defenses is now a shared
helper; its arithmetic is unchanged for those defenses. The older public
[attacker data reader](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and [combat component](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
corroborate separate charge/recovery and burst timers advancing on 64 ms steps.
This is a source-derived local adapter; precise modern executable timing has not
been independently verified.

The first flame uses the shared attacker windup controller. Following flames
advance in active attack time and retain sub-step remainders/timestamps. Freeze
and stun pause future releases; attack-rate effects scale both spacing and the
full cycle, while damage boosts affect individual subsequent flames. A committed
burst finishes against a living target that retreats. A lost, hidden or replaced
target cancels its remaining flames and pays recovery before the next target's
charge. Death stops future emissions; released projectiles keep their normal
flight and impact behavior.

Each release uses the original `SuperDragonProjectile` and records its own
source/target, damage and launch time for ground or air defenders and buildings.
Flames resolve one fixed-point area pass on the captured ground or air layer,
using the existing ranged-area resolver. Each defender takes at most one hit
per flame; air blasts leave buildings and ground defenders unharmed. Released
area damage survives the loss of the shooter or primary target. The projectile's
`DontTrackTarget` field preserves its captured point when the target moves.
The supplied Super Dragon body pack uses its original single-frame flying export
for attacks, so this change introduces no replacement body animation or new art.
Existing source preload, projectile meshes and reduced-motion rendering are reused.

Army cards, troop Info and research previews use per-flame damage. Current Info
labels the burst interval, flame count, spacing and first charge; active Power
Potion previews use the effective source tier without changing Dragon research.
An old battle/replay keeps its old hit and attack-interval readout.

Only initial armies carrying Super Dragon enable `nativeSuperDragonBurst`.
Version 220 and earlier preserve complete state. This boundary changes no unit
HP, source DPS, movement/range, splash radius, save schema or portable envelope.
Defending Super Dragons retain their existing controller.

`tests/super-dragon-burst.test.ts` checks all eleven source tiers and near/far
approaches, exact launch cadence and average DPS, rate effects, partial Freeze/
stun holds, per-flame boosts, death, retarget recovery, irregular steps, real
ground/air Castle releases, exact single-hit splash and layer exclusion,
released blasts after actor removal, committed moving targets and complete portable
forward/reverse state. Four version-220 snapshot hashes were captured twice
before implementation and remain pinned. Portable witnesses use real deployments
and valid native campaign metadata; status and retarget edits stay in separate
controlled model scenarios.

Browser checks in `tests/browser/super-dragon-burst.spec.ts` compare complete
Node/browser snapshots and original body/projectile meshes on phone/desktop,
with historical controls, rewind, reduced motion and WebGL checks. Information
checks cover source tiers, layouts and active potion previews. Screenshots stay
in ignored `output/playtest/`.
