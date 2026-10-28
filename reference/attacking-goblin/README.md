# Attacking Goblin source charges and resource bonus

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All ten `characters.Goblin` tiers in [the combat tables](../full-client/combat.json)
specify `AttackSpeed=1000`, no cooldown override or new-target delay, 0.4-tile
range, four-tile/s movement, ground-only melee and a resource preference with
`PreferedTargetDamageMod=2`. The [wiki comparison](../official-wiki/troops/goblin.md)
corroborates the damage, period, movement, range and resource classification.
The established [older-engine split-clock adapter](../attacking-giant/README.md)
gives **one-second fresh and repeat charges with zero recovery**. Modern
executable first-hit timing remains unverified.

An actual version-192 Storage fight releases immediately on arrival: 0.4 seconds
from the near drop or 1.5 seconds from the far drop. Level 1/10 hits deal 22/164
damage, repeat every second and create no projectile. Those numerical values
and the repeat period are retained.

## Recording version 193

Carried ordinary Goblins spend the full charge after arriving at a building,
blocking Wall or eligible defender. Release deals one direct hit. Resource
buildings retain the source multiplier; normal buildings, Walls and defenders
receive normal damage. Resource classification includes the Town Hall and
Clan Castle, all storages, mines, collectors and drills. Builder's Huts do not
receive the bonus. Resource priority still ignores nearby defenders until no
eligible resource remains, then resumes ordinary defender combat. Legacy
movement, selection and campaign exceptions remain in use.

Freeze/stun, action modifiers, sub-step remainder, replacement targets and
original body phase offsets share the attack controller. Actual Angry Spell
forced selection cancels the committed charge and immediately redirects to
defenses without a late hit on the former resource target. Only a carried
ordinary Goblin enables this capability. Sneaky Goblins and defensive Goblins
retain their separate rules. Versions 192 and earlier keep immediate first
release and their former state shape. Saves, numerical stats and assets do
not change. Geometry, crowd separation and pathfinding remain local adapters;
native pixel or executable parity is not claimed.

## Validation

`tests/attacking-goblin-windup.test.ts` covers all ten tiers from near/far,
resource damage, every resource class, non-resource damage, ground-only
defender attacks, resource priority, Freeze/stun, action modifiers, timer
remainder, retargeting, blocking Walls and trap eligibility.

Actual Storage recordings compare complete portable states forward/backward
at research levels 1/10 under versions 192/193. Another recording uses actual
Overgrowth to make the last resource target unavailable and a real Freeze
cast to protect the fragile Goblin while it attacks a Cannon. It checks both
normal hit damage and spell deadlines, with no injected health or status.
Actual Angry Spell levels 1/4 land during the fresh charge and verify immediate
retargeting, no old-target hit and complete portable states under both versions.
The targeting fixture's optional Goblin kind leaves its ordinary Barbarian
callers unchanged.

`tests/browser/attacking-goblin-windup.spec.ts` checks current/historical
Storage and spell-controlled Cannon fights, first/last-tier original bodies,
phase offsets, reverse seeks, read-only rendering, reduced motion, asset
requests and WebGL health at phone and desktop widths. Two actual Angry
Spell cases verify the forced retargeting in Chromium. Screenshots go to
ignored `output/playtest/`.
