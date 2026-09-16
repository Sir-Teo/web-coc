# Native Town Hall 11–18 defenses

Version 45 battles (`REPLAY_VERSION` 45) run the Town Hall 11–18 defenses, Town Hall weapons,
Guardians, traps and village upgrade systems from the pinned client 18.400.21 tables in
`reference/full-client/combat.json`, cross-checked against the official Clash of Clans Wiki
dossiers in `reference/official-wiki/defenses/` (retrieved September 15, 2026). Recordings from
versions 34–44 keep their original rules byte-for-byte; none of the systems below activate in them.

Source modules:

| Module | Contents |
| --- | --- |
| `src/game/native-defense-stats.ts` | Weapon rows: buildings, weapons.csv (Town Hall, Spell Tower), Alt (gear-up) columns, Revenge Tower stage abilities, Monolith projectile bands, Builder's Hut repair character |
| `src/game/native-defenses.ts` | Battle engine: activation, weapon clock, targeting, bursts, projectiles, chains, piercing balls, Spell Tower casts, Town Hall death bombs |
| `src/game/native-traps.ts` | Client values for every trap level, Tornado Trap pull, Giga Bomb |
| `src/game/native-guardians.ts` | Longshot, Smasher and Logger |
| `src/game/defending-builder.ts` | Shared released Defending Builder repairs; duplicate native-hut module removed |
| `src/game/native-merges.ts` | Merge recipes, merged-input limits, gear-up prices |
| `src/game/native-supercharge.ts` | Linked supercharge rows (`superchargeRows` in combat.json) |

Tests: `tests/native-defenses.test.ts`, `tests/native-guardians.test.ts`,
`tests/native-village-upgrades.test.ts`.

## Shared weapon rules

- **Weapon clock.** Each defense keeps its own clock that stops while frozen, stunned or rooted by
  Overgrowth and runs slower under frost/chill (`buildingAttackIntervalScale`). All release times
  are clock deadlines mapped back to battle time, so frame length never changes cadence.
- **Wind-up.** `AttackSpeed − CoolDownOverride` is the delay between acquiring a target and the
  first release. The Spell Tower's 1.2 s trigger dwell on the wiki is exactly this value
  (70 000 − 68 800 ms), which anchors the interpretation. `NewTargetAttackDelay` (Scattershot 2.2 s)
  replaces the wind-up when switching to another target.
- **Damage per release.** `DPS × AttackSpeed`. Burst weapons (`BurstCount` > 1) start bursts on
  whole 64 ms combat steps: cycle = ceil(AttackSpeed / 64 ms) × 64 ms + (count − 1) × BurstDelay,
  per-ball damage = DPS × cycle / count. This reproduces the wiki's frame counts and in-game
  per-hit values exactly: Firespitter 2.24 s and 46.03 per ball (level 1), Multi-Gear Fast Attack
  0.96 s and 156 per ball, geared-up Cannon 2.176 s and 174.08 per ball.
- **Targets.** Live, deployed, visible attackers within `[MinAttackRange, AttackRange]` of the
  building center on the weapon's layers; a defense keeps its target while it stays eligible.
  Totems are valid targets except for the Spell Tower (`TargetingImmunityTotems`).
- **Boosts.** Spell Tower Rage and the Smasher's death Rage raise building damage by
  `BuildingDamageBoostPercent` (not the Monolith hitpoint bonus, pools or death bombs). Version 45
  also boosts the older defenses (Cannon, Mortar, Air Defense, Wizard Tower, Hidden Tesla, Bomb
  Tower, Archer Tower, X-Bow, Inferno Tower) and slows the generic-loop defenses and X-Bow under
  frost/chill; Archer Tower draws and Inferno ramps are not slowed yet. Inferno damage now passes
  through shields and immunities.
- **Invisibility.** Invisible buildings cannot be chosen by attackers but keep attacking; only
  concealment (Hidden Tesla) and Overgrowth stop a defense.

## Defenses

| Defense | Implemented rules | Interpretations / gaps |
| --- | --- | --- |
| Eagle Artillery | Dormant until 200 deployed housing (troops by housing, heroes 25, spells × `SPELL_HOUSING_COST_MULTIPLIER`); wakes after `WakeUpSpeed`. Each volley picks the unit whose `TargetGroupsRadius` (5 tiles) holds the most `EnemyGroupWeight` (Healers 30, Golems 3000, King 2500), fires 3 shells 0.75 s apart, 30 volleys of ammunition. Shells track the unit, land at the range edge if it leaves range, deal `Eagle Artillery Hit Spell` damage (225–525, 0.75 tiles) plus the building `Damage` shockwave from 0.75 to 3 tiles that pushes units of ≤ 3 housing 0.5 tiles. | Flight uses `FixedTravelTime` 5 s + `DamageDelay` 0.58 s. Siege Machine wake weight (1) and exclusions for Clan Castle/pet/equipment units apply once those systems exist. |
| Scattershot | 3–10 tiles, 403.5–613.3 per direct hit (`DPS × 3.228`), 2.2 s retarget delay, 90 shots. Fragments hit only the struck unit's layer inside a 90° cone behind the impact: from the direct hit to `Damage` within the 1-tile `DamageRadius`, then linearly to `MinDamage` at 5 tiles. | The wiki quotes a 3.2 s observed cadence; the client 3.228 s is used. Charge 1 `ProjectileSpellDamageBoost` is not applied (the wiki lists unchanged splash values). |
| Spell Tower | Rage, Poison, Invisibility, Earthquake unlocked by level and chosen in the village. Rage/Poison/Earthquake cast after a unit stays 1.2 s inside 9 tiles (Rage centered on the tower, others on the unit); Invisibility casts 1.2 s after an attacker hits a building within 4.5 tiles if one of those attackers survives. Recharge 70/70/50/50 s. A loaded spell is released on destruction. Troop earthquakes deal 30% max HP with 1/(2n − 1) on repeated casts. | Invisibility covers buildings; defending-unit invisibility has no visual yet. |
| Monolith | 225–337.5 base + 11–15% of the target's maximum hitpoints; projectile variant by target maximum hitpoints. | — |
| Multi-Archer Tower | Three arrows every 0.6 s; distinct nearest units first, doubling up when fewer than three are in range. | The wiki's same-distance tie rules are approximated by distance then unit id. |
| Ricochet Cannon | Ground only, 288–329.6 per shot, one ricochet to the nearest other ground unit within 3.5 tiles for 70%. | — |
| Multi-Gear Tower | Long Range (12 tiles, 1 s) or Fast Attack (8 tiles, 4-ball bursts), saved per building. | — |
| Firespitter | Four facings along tile edges, 150° arc, 20-ball bursts; balls fly 1 tile past the aim point and strike up to two units within 0.5 tiles of their path. The burst stops when its target dies. | `TargetPosRandomRadius` 768 is read in logic units (512 per tile), a 1.5-tile deterministic spread around the target. |
| Revenge Tower | Dormant until 5 destroyed buildings; stages at 5/25/50 use `DebrisTowerTier2–4` damage, speed and bounces (4.5 tiles, −40% per bounce). | The wiki's "~2 tiles" bounce reach is an observation; the client 4.5 tiles is used. |
| Super Wizard Tower | 377–416 primary hit, then up to 15 units within 4 tiles of the primary at 40%, 128 ms apart. Deterministic random target choice (`RandomizeTarget`). | — |
| Builder's Hut 2–8 | Turret wakes after the first deployment plus 1.6 s. The Defending Builder repairs the most damaged visible non-wall building within 7 tiles (50–95 HP/s in 0.75 s hits), cannot be attacked, stops when frozen and hides when the hut falls. Several builders on one building follow the wiki's 90%/70% stacking. | Defensive Rage does not yet raise repair speed. |

## Town Hall weapons and Guardians

- **Giga Tesla (TH12) and Giga Infernos (TH13–16).** Wake `CombatActivationDelay` 0.5 s after the
  Town Hall is damaged, or when destruction passes the hidden-building global (50%). Four distinct
  targets within 10 tiles; TH12 zaps every 0.5 s, TH13–16 hold beams ticking every 0.128 s. On
  destruction the bomb (500/700/1000/1000/1100 in 4–4.5 tiles) explodes after 1.6 s, followed by
  TH13 Frost (−50% for 8 s) or TH14–16 Poison. The client TH14 death damage (1000) differs from
  the wiki (900); the client value is used. An upgrading Town Hall neither fires nor explodes, and
  a Town Hall counts as a defense for defense-targeting troops only while its weapon is awake.
- **Inferno Artillery (TH17).** Arms one second into the battle; every 3.5 s it launches 4 homing
  fireballs (4 targets; 3 → the nearest gets two, 2 → two each, 1 → all four) for 140–210 each and
  a `TH17WeaponAreaDamage` pool (75 DPS, 6.8 s, 2.5 tiles). Overlapping pools and poisons never
  stack: a unit takes poison for the time since its previous poison tick. Weapon levels 2–5 are
  builder upgrades on the Town Hall. Fireballs keep tracking a dying target's last position
  instead of retargeting (`RetargetRadius`/`RetargetTimer` are not interpreted).
- **Guardians (TH18).** The selected Guardian waits on the Town Hall (untargetable) until an
  attacker enters its `AlertRadius` (19/14/15 tiles, matching the wiki; the stale guardians.csv
  `ActivationRadius` is ignored) or the Town Hall is destroyed, leaps down in 0.75 s, then fights
  attackers within `MaxSearchRadiusForDefender` of home. Longshot: 11-tile explosive bolt with a
  1-tile same-layer splash, 1000 death damage. Smasher: 1.25-tile swing with 2.5-tile splash that
  reaches air, enrages (+60% damage, +1.5 tiles/s) when its Town Hall falls, releases
  `SmasherRageArea` on death. Logger: 7-tile log that rolls 5–6 tiles past the target, striking and
  pushing every unit within 1.8 tiles of its path by 1.5 tiles. Poison affects Guardians at the
  client's 30%; defensive Rage applies fully. Guardians are chosen and upgraded (upgrade_data
  `GuardianGeneral`) from the Town Hall. Longshot search radius is 16 tiles in the client versus
  17 on the wiki.

## Traps

Every trap level in version 45 battles uses traps.csv damage, radius, trigger radius, spring
capacity and Skeleton Trap spawn counts, so Town Hall 9–18 trap levels are no longer empty.
Bombs and Giant Bombs push troops of ≤ 3 housing by `Pushback` (1 tile).

- **Tornado Trap** (TH11): any ground or air unit within 3 tiles starts the `Tornado Trap` spell
  (39/47/55 hits every 128 ms, 1 damage each, 4-tile radius). Each hit pulls units toward and
  around the center by weight class (housing / 3 rounded up, maximum 5; heroes 5; Siege Machines
  `TORNADO_SIEGE_FORCE_TIER`): `TornadoForceN`/`TornadoForceAirN` are read as pull speeds in
  hundredths of a tile per second, at 100% inside `TornadoInnerRadius` and 65% outside, scaled by
  `TornadoSpeedTowardsCenter`, with `TornadoRotationSpeed` degrees per second of swirl. Underground
  units are not moved. The force units are an interpretation; the wiki gives no numeric pull.
- **Giga Bomb** (TH17): always visible; explodes `ActionFrame`/24 s after the combined housing of
  trap-triggering units within 3.5 tiles reaches 18, dealing 1100–1400 to ground and air units in
  4.5 tiles, throwing them 2 tiles (Siege Machines excepted) and forcing them to retarget.

## Village systems

- **Merges.** `MergeRequirement` on the merged defense's level 1 row: Ricochet Cannon and
  Multi-Archer Tower take two non-geared level 21 inputs, Multi-Gear Tower a geared-up Archer Tower
  and Cannon, Super Wizard Tower two level 17 Wizard Towers. The merged building is constructed at
  the first input's position, the inputs disappear, and each merged defense lowers its inputs'
  building limits (townhall_levels.csv never does). Every merge available at the current Town Hall
  must be built before the next Town Hall upgrade. Upgrading to Town Hall 17 merges the level 7
  Eagle Artillery (Town Hall row `MergeRequirement`).
- **Gear-ups.** One Cannon (level 7+), Archer Tower (10+) and Mortar (8+) can gear up for
  1 M / 3 M / 6 M Gold and 2/7/14 days (client `GearUp*`, `<Name>_gearup` limit 1). This village
  has no Builder Base, so the Master Builder prerequisite (Double Cannon 4, BB Archer Tower 6,
  Multi Mortar 8) is waived. Geared defenses use the client `Alt*` attack in version 45 battles:
  burst Cannon, fast Archer Tower, burst Mortar with 1.5-tile ground splash.
- **Supercharges.** Buildings at their maximum level take the linked mini-level charges (16
  buildings). Bonuses are cumulative: DPS (normal and Alt), Inferno ramp DPS, hitpoints, collector
  production and capacity, and Revenge Tower ability levels. The unlinked Monolith and Builder's
  Hut rows predate the wiki's August 31, 2026 charges and are not offered.
- **Owner choices.** Spell Tower spell, Multi-Gear mode, Firespitter facing, Inferno Artillery
  weapon level and the TH18 Guardian are saved on the building and validated in saves and
  version 45 replays.

## Presentation status

Battle visuals for these systems are being moved to native client art (projectile timelines,
turret aim and attack frames, trap and Guardian artwork). Until that lands, projectiles use the
generic drawn graphics, Giga Tesla/Super Wizard zaps use the fallback effect and Guardians show a
health bar only.
