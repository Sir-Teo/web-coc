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


## Retained flight art (recording version 167)

The already shipped source `witch_trail_emitter` emits `looping_witch_sparks1` every 75 ms,
with 450–550 ms particle life, additive blending and the retained source scale/rotation/gravity
fields. Its original graph is `assets/effects-native/emitter-witch-trail-emitter/graph.json`,
38,419 bytes, SHA-256 `417bf0ff2a4227d1be58966619a8eeb41b97b68f627583cbb59e62da4265f646`.
Flight already uses this emitter through the shared effect library; an empty emitter map in
the separate projectile-body pack does not mean the trail is missing.

The missing case was a cold seek after physical impact. The renderer retained tails for a
flight it had seen, but no live packet remained to reconstruct an unseen, landed flight.
Version 167 captures immutable Witch/Super Witch flight packets at launch and retains them
for three seconds after impact, matching the existing renderer window. Fixed launch aim
means no tracking updates are needed. Records expire during normal simulation; they also
survive caster defeat and battle completion for the established presentation window.
Reduced motion follows its existing particle suppression path. Damage, release and impact
times, target selection, source stats and audio keep their version-166 behavior.

`tests/witch-flight-history.test.ts` covers all eight levels of both casters, immutable packet
identity, post-landing availability, bounded expiry, caster defeat/finish, exact physical
version-166 parity, ground/air defender packets and complete portable forward/reverse states.
Browser recordings compare actual visible original mesh geometry, transforms and alpha for
a seen flight and a cold seek after explicitly clearing renderer history. Historical cases
preserve the missing cold tail. Desktop/phone minimum/maximum casters also check expiration,
reduced-motion/read-only rendering and WebGL health. A real emitter-graph 503 recovers online
while the replay stays paused and its complete battle state stays unchanged. No source art,
audio file or particle parameters change; modern native-engine particle parity remains
unverified.


## Original launch and impact audio after seeks (recording version 168)

Live Witch shots already bind the pinned character `AttackEffect` / `HitEffect` records.
The missing case was a replay seek: transient scene events were suppressed while rebuilding
battle state, so an unseen recent shot had no original launch/impact cue to resume.
Version 168 keeps a bounded physical-event journal, capturing the launch immediately and
adding the exact impact time only when the fixed-point blast actually resolves. An ended
battle never invents an impact for a cancelled flight. Records expire ten seconds after
their latest event; the sample player independently stops each original clip at its decoded
end. The journal does not depend on the caster remaining alive or visible.

| Source effect | Original sample | Volume | Pitch | Delay | Decoded duration |
| --- | --- | --- | --- | --- | --- |
| `Warlock Attack` | `slimeball_fire_05.ogg` | 0.5 / 0.4 / 0.4 alternative rows | 0.95–1.05 | 0 | 0.817052 s |
| `SW Attack` | `super_witch_deploy_01.ogg` | 0.5 | 0.95–1.05 | 0 | 1.505782 s |
| `Warlock Hit` | `wizard_hit_01.ogg` | 0.4 | 0.8–1 | 0 | 0.690068 s |

The Super Witch attack deliberately uses the source-bound file whose name contains
`deploy`; the binding is `SW Attack`. All three Ogg files already ship unchanged:

- `slimeball_fire_05.ogg`: 8,903 bytes, SHA-256 `4e922606665365afa9e52f045485bb86da7dcf47e0bd5cd64fa7ca38175e83bf`.
- `super_witch_deploy_01.ogg`: 12,052 bytes, SHA-256 `459ecb7fed5baf8b84bbcceb4cef039d2daef4601ed18c3093aedb3c87188a70`.
- `wizard_hit_01.ogg`: 8,139 bytes, SHA-256 `c0ed0e6d5b0781f70d5962034493b23e9ce17d45939e52f873df9566cda28cdf`.

Stable event keys choose the source alternative row and pitch. Impact cues use the actual
projectile impact timestamp rather than the end of its 50 ms update; that precise time
can change the deterministic take/offset from the older live transient path. Released
one-shots retain their natural tails through caster Freeze or defeat. Earlier versions
keep their original live-only event path. No combat rule, trail geometry or audio asset
changes, and only carried Witch/Super Witch armies enable the journal. Exact modern
native-engine sample startup parity remains unverified.

Model coverage checks all eight levels of both casters, source cue identity, actual event
times, read-only generation, duplicate suppression, caster removal/Freeze, cancelled
landings, bounded expiry, complete physical version-167 parity and portable forward/reverse
states. Desktop/phone browser recordings decode the original samples and check actual
gain, playback rate and seek offset; spent clips stay silent even while their journal entry
remains inside the ten-second horizon. Original impact-sample HTTP 503 recovery happens
while playback stays paused and complete battle state remains unchanged.
