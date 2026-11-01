# Troop Launcher friendly barrels

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [pinned dossier](../official-wiki/spells-siege-super/troop-launcher.md)
describes a stationary siege that reinforces friendly troop groups, including
healthy groups. Its negative `DPS=-1` is a real, small heal: six HP per barrel
over a six-second period. It is not an ordinary attack or a placeholder to hide.

Before version 223, the native siege exception bypassed friendly healing and
fired zero-damage barrels at enemy buildings, even with no friendly troops.
Minimum/maximum probes both launched at 0.05 seconds, with impact at 2.25,
and the next shot drifted to 6.1 seconds. Barrel summons already used the
pinned HitSpell and its four payload groups; that machinery is retained.

Version **223** gives carried Troop Launchers a friendly controller. It waits
for the 0.8-second `SpawnIdle` and a qualifying living group. The existing
negative-DPS split-clock adapter supplies a 0.2-second fresh charge and
5.8-second recovery within the six-second repeat. A group present at deployment
receives the first launch at one second; one first deployed at one second gives
a 1.2-second launch. Active-time remainders, Freeze/stun and replacement groups
use the shared friendly windup. Modern executable first-hit parity is unverified.

Group selection uses source `FriendlyGroupWeight` values, including 50 for an
ordinary Barbarian/Archer, 600 for a Giant and 2,100 for the Barbarian King.
Healthy allies participate. The local adapter reuses the pinned Eagle's five-tile
neighborhood and requires weight 100, corresponding to the dossier's two small
troops. The first deployed anchor wins equal sums. This is a documented grouping
adapter; exact modern cluster boundaries, centroid aim and activation internals
have not been independently verified. Spell Skeletons/Bats, Furnaces and Firemites
are excluded, along with absent, fallen, ejected and recalled actors. A new group
is selected when recovery ends, with a short charge committed to that recipient.

Each original `CommandTower Barrel1`–`4` projectile keeps a fixed aim point,
friendly target identity, six-HP heal and 2.2-second source flight. Impact heals
eligible friendly units on the captured layer within the client's 0.01-tile
radius, then casts the pinned `TroopCatapultSummonTroopNew` at that point. It does
not damage enemy buildings or troops. Loss of the parent or recipient does not
cancel a released barrel or its troop payload. Pending barrels keep the battle
open while no other combatant survives. The tiny heal does not participate in
ordinary Healer stacking or steal the normal Healer targeting pass.

Source tiers 1–4 have **5 / 5 / 6 / 7** barrels. Each carries one Giant, two
Barbarians, **3 / 3 / 4 / 4** Archers and **1 / 2 / 2 / 2** Wall Breakers at
fixed child levels **9 / 10 / 11 / 12**, independent of village research.
All four summon groups and their source release schedules use the existing
spell controller. New launcher armies enable the established native attack
phases for these four payload families. After its last launch the parent is
spent; the last barrel still lands. Its existing 25 HP/s drain remains active.
Clan Castle payload transport and manual siege release are outside this change.

The original nine-direction attack takes use action frame nine at 30 FPS.
The friendly phase offset aligns release with original frame eight; no body or
projectile art is replaced. Info lists stock, payloads and levels, warmup/charge,
flight and health loss. It retains the legitimate heal and labels its delivery
range and interval as reinforcement/barrel values. Army cards show barrel stock.
Research and Power Potion previews share the same adapter. Historical battle
inspection retains its previous facts and labels.

Only initial armies carrying Troop Launcher enable `nativeTroopLauncherFriendly`.
Version 222 and earlier preserve complete battle state. Four version-222 snapshot
hashes were captured twice before implementation and remain pinned. No village
save schema, portable replay envelope or asset files change.

`tests/attacking-troop-launcher.test.ts` covers all source tiers, waiting and
warmup, fixed cadence, complete stock/payload counts, health drain, Freeze/stun,
source group weights, ties, Hero eligibility and participation exclusions, tiny
heal geometry and layer exclusion, released payloads after actor removal, and
complete portable states in both directions. Lifetime-isolation tests enlarge
harmless buildings only in controlled model scenarios; portable witnesses use
real recorded parent and Archer deployments with valid campaign metadata.

`tests/native-unit-presentation.test.ts` checks original first/last-tier contact
frames, historical controls, rewind, reduced motion and read-only rendering.
Browser scenarios compare full Node/browser states, original parent/barrel and
Giant meshes, Info layouts at three viewports and potion previews/expiry.
Screenshots stay under ignored `output/playtest/`.
