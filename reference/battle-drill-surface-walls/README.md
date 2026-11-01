# Battle Drill surfacing Wall destruction

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
Battle Drill declares `BattleDrillStunOnSurface`, which activates on becoming
targetable and casts `DrillerSurfacing`. That spell has a 1.5-tile radius,
a two-second building stun, `DestroyWalls=TRUE` and `ImmunityWalls=TRUE`.
Its explicit Hero, Guardian, ordinary-character and storage immunities remain
unchanged. See the [combat tables](../full-client/combat.json) and
[pinned comparison](../official-wiki/spells-siege-super/battle-drill.md).

The Wall immunity belongs to ordinary spell effects, including stun. The
separate destruction flag removes Walls where the Drill emerges. Before version
225, the generic spell handler skipped Walls before reaching any effect, and
only honored `DestroyWalls` inside the Earthquake path. `DrillerSurfacing` has no
Earthquake damage column, so nearby Walls survived. A real level-one deployment
cast at 0.55 seconds and stunned the adjacent cannon until 2.55, while a level-18
Wall in the surfacing area retained all 13,000 HP.

Version **225** resolves this spell's Wall destruction separately, before its
ordinary building immunity checks. Living Walls inside the existing footprint
radius receive lethal damage at the spell's scheduled pulse time. They receive
no stun. Other building and defending-character immunities continue through the
existing path. Other spells, Earthquake Wall rules, movement, attack cadence,
burrowing, Freeze/stun holds and one-cast-per-emergence behavior remain unchanged.
No new hitbox convention, timing phase or artwork is introduced.

Only initial armies carrying Battle Drill enable `nativeDrillSurfaceWalls`.
Version 224 and earlier retain their complete old states. Four old recordings
covering source tiers 1/6 and near/far deployment were captured twice, imported
and compared forward/backward before the correction. Their complete state hashes
remain pinned. Current recordings run through the same portable-file checks.

Model checks cover all six tiers, an exact radius boundary and an outside Wall,
untouched storages/traps/defenders, retained cannon stun, Freeze/stun postponement
and old/new replay capability. Existing defender-spell and underground pursuit
suites check the shared immunity and emergence path. Browser cases compare full
portable states, show original surfaced Drill meshes, inspect the destroyed Wall
and cannon stun, and verify read-only rendering, rewind and reduced motion.

Current Army Info explains the two-second stun, 1.5-tile radius, Wall destruction,
healing immunity and vulnerability while surfaced. Historical battle inspection
retains its old guide. Base/maximum research checks cover phone, landscape and
desktop, text fit and the training button. Clan Castle transport/release remains
outside this correction. Screenshots stay in ignored `output/playtest/`.
