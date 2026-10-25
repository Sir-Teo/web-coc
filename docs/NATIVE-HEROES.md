# Heroes, equipment and pets

Every hero in the game is data. There is no hand-written King any more: the roster, its levels, its
equipment and its pets are read from client 18.400.21 (`heroes.csv`, `character_items.csv`,
`pets.csv`, `special_abilities.csv`, `tavern_levels.csv`) through
[`native-hero-data.ts`](../src/game/native-hero-data.ts), and battles run them through
[`native-heroes.ts`](../src/game/native-heroes.ts) and
[`native-hero-abilities.ts`](../src/game/native-hero-abilities.ts). Behaviour is cross-checked
against the dossiers in `reference/official-wiki/`.

Replay version 51 introduced the native roster. Recordings from versions 34–50 keep their old rules and
replay byte for byte; every rule below is gated behind the version and the battle's hero roster.

## The roster

| Hero           | Client row       | Unlock      | Level cap |
| -------------- | ---------------- | ----------- | --------- |
| Barbarian King | `Barbarian King` | Hero Hall 1 | 110       |
| Archer Queen   | `Archer Queen`   | Hero Hall 2 | 110       |
| Minion Prince  | `Minion Prince`  | Hero Hall 3 | 95        |
| Grand Warden   | `Grand Warden`   | Hero Hall 5 | 85        |
| Royal Champion | `Royal Champion` | Hero Hall 7 | 55        |
| Dragon Duke    | `Dragon Duke`    | Hero Hall 9 | 25        |

Caps are the lower of the hero's own table and the Hero Hall level, exactly as the client computes
them. How many heroes may be taken into a battle comes from `TAVERN_LEVEL_TO_HERO_SLOT_COUNT`:
halls 1, 3, 5 and 7 grant the first, second, third and fourth slot.

Town Halls 4–6 scale the King down with the client's `ScaleByTH` column (50%, 75%, 100% of
hitpoints, damage and healing). The scale applies to the hero's own numbers _and_ to its equipment
contribution, so a low Town Hall cannot import a high-level item's full value.

## Equipment

Forty-two playable items, each with its own level cap, ore prices and ability rows. An item's
passive columns apply for the whole battle:

- `HitpointsBonus` and `DPSBonus` add to the hero's own numbers before the Town Hall scale.
- `AttackSpeedBonus` divides the attack interval (`rate / (1 + bonus)`), it does not subtract from
  it; a 20% bonus is 1/1.2 of the interval, matching the wiki's listed attack speeds.
- `FrostOnHitTime`, `ChainAttackFactor` and the other combat columns are read straight from
  `special_abilities.csv` and handed to the shared troop rules. Version 71 repairs the missing
  projectile frost snapshot for equipment hits against buildings; see the follow-up below.

Ability activation is one press per battle. It triggers the hero's own ability _and_ the active
ability of both equipped items at once, which is what the wiki means by "abilities activate
together". The press heals by the hero's `HealOnActivation` plus each item's, and that heal ignores
the usual zero floor: a hero knocked to negative hitpoints is pulled back to life by it, which is
how the automatic activation (`SimulatePlayerInputOnDeath`) can save a hero.

Effects the activation can apply, all from the ability row: speed, damage and attack-speed boosts
for `DeactivateAfterTime`; `ShieldProtectionPercent`; invisibility; `ExtraDamageFlat` with its own
`AttackRange` and projectile, limited either by time or by `DeactivateAfterNumberOfHits`; splash
with `GrowthScale`; a `SelfSpell` cast at the hero's feet after `PreActivationDelayTime`; an
`AuraSpell` that follows the hero; jumping; and spawns.

Spawns follow the puppet columns rather than a fixed count: `SpawnnedTroopsPerHit` units every
`SpawnDelayBetweenHitsMS` until `TroopCount` is reached, placed by `SpawnPattern`, at the player's
own researched level when `CopySpawnnedTroopLevelFromAvatar` is set, and carrying `GivenAbility` if
the row grants one. Waves stop when the hero falls; the automatic activation still fires once.

## Pets

Twelve pets plus the Phoenix Egg, unlocked by Pet House level, researched one at a time, and
assigned to one hero each. A pet deploys with its hero and stays within `LeashLength + AttackRange`
of it, per the wiki's leash description.

## Version 52 presentation and abilities

`hero-native-scene.ts` lazy-loads the baked hero, pet and Guardian atlases, respecting their
frame rectangles, ground anchors, eight directions and clip timing. Atlas assets are shipped
but excluded from the initial offline precache; they are cached when visited. The rebuild script
and pinned manifests are tracked alongside them.

Local practice attacks snapshot the selected, available defending heroes with their levels and
positions around the Hero Hall. Defenders engage nearby attackers, return home, obey target layers
and can be damaged or frozen. They do not use attacking equipment or pets. Their setups survive
portable replay exports. Campaign layouts do not acquire invented defending heroes.

Equipment behavior now includes Monolith Arrow's housing-dependent projectile and HP bonus;
Dark Crown's highest crossed friendly-loss threshold; Meteor Staff's timed defense-targeted cast;
Snake Bracelet's cumulative-damage spawns; Revenge Deck's projectile return toward the recorded
attacking defense; and Rocket Backpack's continuous dash with one hit per crossed target.
These are local deterministic interpretations of the pinned rows, not a claim of pixel-identical
client behavior. Reflection currently covers damage sources routed through the shared native
and standard projectile damage paths; campaign-specific weapon paths need a separate audit.

## Verification

`tests/native-hero-village.test.ts` covers unlocks, slots, caps, ore prices and pet research.
`tests/heroes.test.ts`, `tests/king-combat.test.ts` and `tests/blacksmith.test.ts` cover deployment,
activation, summon timing, the automatic activation on defeat and the equipment snapshot a recording
keeps. `tests/replay.test.ts` covers the version gate and the portable file round-trip.

`tests/content-expansion.test.ts` covers all six equipment effects, local defending heroes,
new spell timing, siege production and super licences. `tests/browser/native-hero-art.spec.ts`
checks desktop/mobile rendering and missing asset requests. `tests/browser/hero-roster.spec.ts`
covers the roster panel (all six heroes, upgrades, lineup swaps), pet research/assignment, per-hero
forge tabs and multi-hero deployment/activation.

## Version 53 hero completion

Passive Life Gem, Rage Gem and Electro Boots auras now begin on deployment without spending
an ability. They follow their owner, stop after death or Recall, and restart on redeployment.
Life Gem preserves damage already absorbed instead of refilling its bonus health every pulse.

Dragon Duke's Royal Rampage now uses a single damage and attack-speed calculation: double
hit damage and a 1/1.5 attack interval while no other living air ally is within six tiles.
His own pet, ground allies, recalled units and future summons do not suppress the passive.
Other heroes' flying pets count. Rampage reduces trap damage by 20% and lights the baked
sprite with the same boost tint used for active equipment. Version 52 and older recordings
retain their previous combat calculations.

`tests/hero-passives.test.ts` exercises every hero's deployment, one-use activation, combat,
and saved replay, plus passive aura lifetime, consumed Life Gem health, Rampage's actual
hit damage/cadence, nearby-air transitions, pet exclusion and trap-only damage reduction.
`tests/browser/hero-roster.spec.ts` also deploys and activates all six heroes, verifies each
hero's own baked atlas, and captures desktop and phone screenshots of both lineups.

## Matching custom hero art

The five other heroes now use generated portraits and four directional pose sets matching the
approved Barbarian King artwork. The existing King sheets are reused through the same renderer.
Idle, movement, cooldown-driven attacks, reduced motion, ability tint, invisibility and death
fading all use the matching art. Pets and Guardians retain their native animation packs.
See [the source record and exact prompts](../art/source/hero-redesign-v1/README.md).
Run `npm run test:heroes:art` to verify the reproducible image imports. Original native hero
assets remain preserved as references; this change only replaces the presentation.

## Version 60 defending hero Poison

Defending heroes use the spell’s signed `SpeedBoost` and `AttackSpeedBoost` as slowdowns, matching native attacking units, and apply `HeroDamageMultiplier` to poison damage. In versions 60–66, level-1 Poison retains 74% movement speed; version 67 corrects this to 87% using the hero movement multiplier below. The attack clock retains 65%, and heroes take 5% of the ramping poison damage. The previous calculation subtracted negative modifiers, accelerating heroes, and applied full troop poison damage. Versions 52–59 preserve that calculation for replay compatibility. Guardians and ordinary garrison defenders retain their existing rules.

`tests/defending-hero-poison.test.ts` covers native pulse damage, attack and movement slows, the old rule, portable files and exact backward seeks. `tests/browser/defending-hero-poison.spec.ts` checks defending hero bodies and both replay paths on desktop and phone.

## Version 65 idle Hero Poison avoidance

Idle defending Heroes now leave offensive Poison clouds using the shared deterministic exit choice. They stay clear while their home point remains covered and return after the native cloud deadline. An eligible attacker takes priority; Freeze holds their escape movement. Version 64 and earlier keep their previous idle behavior. `tests/idle-defender-avoidance.test.ts` covers staying clear, returning home, combat, Freeze and exact portable seeks; `tests/browser/idle-defender-avoidance.spec.ts` checks Hero and Skeleton bodies on desktop and phone. Guardian avoidance remains unverified.

## Version 67 Hero movement under Poison spell clouds

Native spell clouds now scale attacking and defending Hero movement modifiers by the pinned client’s `HERO_RAGE_SPEED_MULTIPLIER` (50%), truncating signed percentages toward zero. Spell Tower Poison leaves a Hero at 83% movement speed, TH14 Poison at 75%, and level-1 offensive Poison at 87%. Attack slows and damage multipliers are unchanged. Earlier recordings retain their full movement slows. This applies to spell clouds; direct Hero Hunter projectile poison keeps its existing rules.

The interpretation follows the existing [Spell Tower reference](../reference/spell-tower/README.md) and the pinned reconstruction’s [LogicLevel.BoostGameObject](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Level/LogicLevel.cs) (SHA-256 `485ce9b2a5ab7eb4bc3193c93575dd4f949700e6d646f658f2372d8d880f13e7`). The reconstruction corroborates the multiplier’s use; it is not the modern client’s source code. `tests/hero-poison-speed.test.ts` checks movement, unchanged attack rates, ordinary troops and exact portable King replay seeks. `tests/browser/attacker-poison-clock.spec.ts` checks King and Giant bodies and both replay rules on desktop and phone.

## Version 69 defender combat corrections

Rocket Backpack now applies its source damage to each crossed defender once, including when several ground or air defenders share one point. It no longer applies a zero-radius area hit for every member of that stack. Unborn defenders are skipped before recording a contact, allowing a later contact after they spawn. Building hits retain their existing behavior. Defending Heroes now move and advance their cooldown/path timers only for the unstunned portion at the end of an update, matching the existing boundary handling of Skeletons and Guardians. This fixes early movement or attacks on the exact Freeze deadline and excessive action time when a larger update crosses it.

`tests/equipment-dash-defenders.test.ts` and `tests/defending-hero-freeze-time.test.ts` cover stacked units, spawning, update boundaries, actual recorded inputs and exact portable backward seeks, including the preserved version-68 rules. `tests/browser/defender-combat-timing.spec.ts` checks both mechanics and native Hero bodies on desktop and reduced-motion phone views.

## Version 70 native spell damage and immunity on defenders

Offensive native spells now honor `ImmunityHeroes`, `ImmunityOtherCharacters` and `ImmunityGuardians` before damaging or stunning defending units. Root Rider’s `TreantWallDamageAura` therefore damages walls without applying its 4000-point pulse to nearby defenders. Driller surfacing stuns eligible buildings while leaving the explicitly immune defenders unstunned. Direct spell damage also respects the pulse’s scheduled time, so a late update cannot damage a defender before it spawned.

Defending Heroes now receive each direct-damage spell’s `HeroDamageMultiplier`, as attacking Heroes already did. Electro Titan and Electro Boots auras deal 25% damage to them; Dragon Duke’s dash aura deals 10%. Level-1 Electro Boots therefore deals 13.25 damage per pulse to a defending Hero instead of 53. Ordinary troops and Guardians retain the full damage of those auras. These values and immunities come from the pinned spell rows; the [Electro Boots source comparison](../reference/official-wiki/heroes-pets/electro-boots.md) also records the hidden 25% modifier. Versions 69 and earlier preserve the previous behavior.

`tests/defender-spell-rules.test.ts` covers source values, building damage, all defender classes, spawn deadlines and exact portable seeks using actual Root Rider and Electro Boots deployments. `tests/browser/defender-spell-rules.spec.ts` checks both recorded interactions and native bodies on desktop and reduced-motion phone views.

## Version 71 Frozen Arrow building impacts

Frozen Arrow now selects the client’s `QueenFrostyProjectile` and captures its frost duration and strength when fired. The impact resolver previously reloaded the Queen’s base stats, losing the equipment effect entirely. Level 1 applies the pinned 25% building attack slow for 0.75 seconds after impact; level 27 uses 65% for three seconds. The [source comparison](../reference/official-wiki/heroes-pets/frozen-arrow.md) records the projectile and frost columns. Monolith Arrow retains its projectile override while carrying the frost effect when both items are equipped.

The captured effect survives the Queen’s Recall or disappearance. Its expiry follows the scheduled impact time, so a late update cannot extend it. Intrinsic native projectile frost uses the same snapshot path. Version 70 and earlier retain their previous projectile and frost calculation. This correction covers building impacts; frost against defending units still needs a separate behavior audit.

`tests/frozen-arrow-impact.test.ts` covers launch, impact, Recall, expiry, maximum level, Monolith Arrow and exact portable backward seeks. `tests/browser/frozen-arrow-impact.spec.ts` checks the actual native projectile on desktop and phone, plus reduced motion and the older replay rule.

## Version 72 Monolith Arrow deployment housing

Monolith Arrow now selects its stage from cumulative deployment housing instead of the current unit list. The previous count omitted Heroes and could shrink when Recall removed troops. Each first Hero deployment adds 25, each owned Siege Machine adds one, and ordinary troops add their housing cost. Pets, ability summons and spells add nothing. Losses and Recall leave the counter intact; redeploying a recalled unit keeps its original contribution, following the existing deployment-accounting rule. Deployments count before the Queen arrives as well as while she is fighting.

The [pinned source comparison](../reference/official-wiki/heroes-pets/monolith-arrow.md) defines the boundaries: exactly 180 housing keeps the highest tier, exactly 250 keeps the middle tier. At level 1, shots add 9.5%, 7% or 4% of the target building’s maximum HP; level 27 uses 14%, 10% or 5%. Versions 71 and earlier retain the original unit-list calculation. The existing defender-targeted attack path remains outside this correction.

`tests/monolith-arrow-housing.test.ts` covers both equipment levels at every boundary, pets and summons, failed deployments, losses, Recall, redeployment and exact portable backward seeks. `tests/browser/monolith-arrow-housing.spec.ts` checks all three native projectile tiers and the historical rule on desktop and phone.

## Version 73 attacking Headhunters against Heroes

Attacking Headhunters now use the parsed `PreferHeroes`, `HeroDamageMultiplier=400` and `IsJumper` columns against defending Heroes. Previously the shared defender fight path ignored all three, so a frozen, unalerted Hero could be bypassed entirely and an alerted Hero took only normal damage. The [pinned Headhunter comparison](../reference/official-wiki/troops/headhunter.md) specifies Hero-first targeting across the battlefield, four-times direct damage, ground/air targeting and wall jumping.

A valid defending Hero takes priority over nearby ordinary defenders and committed buildings, including outside the ordinary alert radius. Headhunters keep their current valid Hero target, select another after it falls and resume ordinary defender/building targeting once no valid Hero remains. They cross walls during the Hero chase. Level 1 now deals 252 direct damage to a Hero instead of 63; level 4 deals 324 instead of 81. Guardians and ordinary troops receive normal damage. Versions 72 and earlier retain the previous rules. This correction is specific to Headhunter targeting, direct damage and chase routing; native card projectiles and on-hit Poison need separate fidelity work.

`tests/headhunter-hero-rules.test.ts` covers all four troop levels, distant and unalerted Heroes, retargeting after spawn, ordinary defenders, Guardians, an unbroken wall, both Hero layers, portable backward seeks and the older rule. `tests/browser/headhunter-hero-rules.spec.ts` checks real recorded shots and native bodies on desktop and reduced-motion phone views.
