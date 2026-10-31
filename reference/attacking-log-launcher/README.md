# Attacking Log Launcher rolling corridors

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The six Log Launcher rows in [the combat tables](../full-client/combat.json)
specify 140–230 DPS, a three-second period and a 4× Wall multiplier. Each log
therefore deals 420–690 damage before boosts. `RollingLog` travels at 4.2 tiles/s
and declares `MaxHitBuildings=4`. Character range plus `PenetratingExtraRange`
gives a 20-tile corridor, with character `PenetratingRadius=1.2`.
See the [pinned comparison](../official-wiki/spells-siege-super/log-launcher.md).

Before version 224, the generic impact handler already pierced buildings, but
resolved the whole corridor when a projectile reached its selected target.
Its corridor length was target distance plus 19 tiles and it had no four-building
limit or ground-defender contacts. A corridor probe first applied all damage
around 7.91 seconds, including a Town Hall more than 30 tiles away. The source
`Damage2` blast was omitted.

Version **224** captures a 20-tile ray at release and applies contacts as the log
travels. It uses the existing Super Archer expanded-building-footprint collision
adapter with the character's 1.2-tile radius. Standing structures, including
Walls, consume its four-building budget; ground defenders take damage once
without consuming that budget. Air defenders, traps, concealed Teslas and future
births are excluded. Overgrowth-covered buildings absorb the log without damage;
Invisibility does not remove a structure from an already released corridor.
Walls receive their 4× multiplier once. Released logs survive caster death and
keep the battle open until their range or structure budget is exhausted.

The source does not independently settle whether Walls consume the modern
executable's building budget, nor exact modern hitbox geometry. Counting Walls
and reusing the existing footprint adapter are explicit local conventions.
The projectile's separate `PenetratingHitBoxWidth` is not substituted for the
character radius. Exact modern executable parity is not claimed.

Each release also resolves the source immediate, one-tile blast around the
launcher, hitting ground defenders and buildings. Its source damage rises from
2,900 to 3,600, takes the same attack damage boost and receives the Wall multiplier
once. The caster-centered interpretation agrees with the pinned wiki comparison;
this adds no new collision convention. The existing moving-fire cooldown,
three-second source period, quantized release clock, movement and discrete
156-HP health-loss ticks remain unchanged. No new windup is invented.

Original body takes and the original `RollingLog` flight pack are reused. When a
log stops early, cached presentation receives the shortened endpoint. Rewind,
read-only rendering and reduced motion retain the captured combat state. Current
Info separates log DPS/hit from the nearby blast, and explains range, structure
budget, Wall bonus and health drain. Historical battle inspection retains its
previous facts and labels. Clan Castle transport/release is outside this change.

Only initial armies carrying Log Launcher enable `nativeLogLauncherPiercing`.
Version 223 and earlier retain their complete old state. Four complete old-state
hashes, spanning tiers 1/6 and two deployment distances, were captured twice
before implementation. Portable recordings compare complete states forward and
backward. Model tests cover all six tiers, physical arrival, limited range,
structure limits, ground/air contacts, Overgrowth, Freeze/stun, caster death and
battle completion. Shared Super Archer, Giant Arrow and Dark Orb tests cover the
extended collision path. Browser checks cover original meshes, early-stop
presentation, replay states and base/maximum Info at phone, landscape and desktop
sizes. Screenshots remain in ignored `output/playtest/`.
