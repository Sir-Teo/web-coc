# Attacking Valkyrie family swings

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve levels of each family use the following source-derived split:

| Actor | Period | Recovery | Windup | Initial charge | Fresh wait |
| --- | --- | --- | --- | --- | --- |
| Valkyrie | 1.8 s | 0.3 s | 1.5 s | 1.2 s | 0.3 s |
| Super Valkyrie | 1.1 s | 0 | 1.1 s | 0.5 s | 0.6 s |

Both declare `NewTargetAttackDelay=600`. The older
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
turns that delay into initial charge, `clamp(AttackSpeed − delay, 0, AttackSpeed)`, and
subtracts default recovery above 1500 ms. The corresponding
[LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
holds the windup during recovery. This is the interpretation already used by
[defending Valkyrie](../garrison/README.md). Modern native executable timing parity is
unavailable; the adapter is corroborated by source tables and older code.

The former attacking path waited 0.6 s from building acquisition, spending that delay while
walking. Near deployment at x=11.4 entered range at 0.45 s and first hit at 0.65 s;
a farther x=6.9 deployment entered range and immediately hit at 1.95 s. These results
occurred at minimum and maximum levels of both families. Defender-targeted attacks could
hit on their first update and damaged only the primary target. A controlled probe with two
ground Golems, an airborne Dragon and an adjacent wall confirmed primary-only damage.

Version 165 starts the fresh windup on engagement and preserves each source period.
Freeze/stun holds both phases; attack-speed modifiers scale both. Recovery retargets
spend remaining recovery once. Building and defender-pursuit walls enter the same timer;
a pursued enemy entering melee range can interrupt the wall charge. Original actor facing
follows the committed wall, and source animation sampling uses the captured action-frame
offset. Existing movement and target selection remain in place.

The pinned `SelfAsAoeCenter=TRUE`, `AttackMultipleBuildings=TRUE`, `DamageRadius=100`,
`AirTargets=FALSE` and `GroundTargets=TRUE` define a one-tile sweep around the attacker.
Both building and defender releases now use that same geometry. Every eligible building
and ground defender inside it takes damage once. The primary receives no extra direct
hit; air units, out-of-radius units and defenders not yet born at release are excluded.
The existing building-targetability policy is retained. The archived
[Valkyrie mechanics dossier](../official-wiki/troops/valkyrie.md) separately describes the
ground-only, one-tile self-centered spin. Native gap-positioning and reduced Army Camp
hitboxes remain unverified and are not newly claimed.

Only initial armies carrying Valkyrie or Super Valkyrie enable this boundary. Version 164
and earlier preserve their acquisition-based building delay, immediate defender attacks,
primary-only defender damage and historical state shape. Source damage, levels, artwork,
original audio assets and Super Valkyrie's existing death spell remain unchanged.

Model checks cover all twelve levels of both families, near/far first engagement, exact
periods and damage, full Freeze, faster/slower attacks, wall commitment and retargeting,
self-centered ground sweeps, radius/air/birth exclusions and historical behavior. Portable
fixtures use ordinary deployment or actual Castle releases with full forward/reverse
snapshots. Browser recordings check minimum/maximum original meshes, complete Node/browser
states, action offsets, reverse seeks, read-only/reduced-motion rendering and WebGL health
on desktop and phone.

Each new sweep carries an explicit presentation marker for one original melee swing and
impact cue. This preserves defender-route audio while making the self-centered release
identifiable without an extra damage/visual hit. The browser witness advances through an
actual release, decodes both original samples, checks source cue identity, gain and playback
rate, and confirms pause cleanup. Front-side deployment keeps the short original bodies
visible in screenshots; the all-level model matrix also covers the former near/far lane.
