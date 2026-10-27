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

Defending Hero attack clips normalize against the Hero's source interval, matching the interval
used to reset its combat cooldown. The former one-second rendering constant delayed the King and
Warden's windup and advanced the Queen's. Poison and frost advance the same cooldown more slowly,
so their body poses follow it without another speed multiplier. The correction changes presentation
only; old recordings keep their combat rules. `tests/native-unit-presentation.test.ts` checks all
six Hero atlases, slowed clocks, paused redraws and reduced motion. The real King/Queen exchanges
in `tests/browser/defending-hero-animation.spec.ts` check first and repeat attack frames, portable
backward seeks and motion-mode switching on desktop and phone.

Guardian attack clips use their combat action clock and next strike deadline. Their native
non-looping clips hold their final follow-through pose during the remaining cooldown, then restart
for the next windup instead of holding that pose indefinitely. Poison and ranged frost slow the
same action clock, so animation and damage stay together. Walk, leap and death clips retain their
existing clocks. `tests/native-unit-presentation.test.ts` checks all three Guardians over three
cycles at normal, Poison and frost speeds. `tests/browser/guardian-animation.spec.ts` checks real
recorded attacks, uploaded bodies, Poison, portable backward seeks and reduced-motion toggles.

Native attacking Hero/Pet IDs remain positive render keys, while defending Hero/Guardian IDs stay
negative. The former sign-flipping defender key mapped Guardian `-1001` onto attacker `1000`, and
defending Hero `-10000` onto attacker `9999`. The two actors could reuse one sprite and corrupt each
other's pose/motion history. Each now owns its own body through removal and replay reconstruction.
The presentation regression covers both collisions; the recorded Guardian test also uses attacker
`1000` and verifies the real distinct Guardian body.

Attacking pet clips use the status-scaled interval that combat assigned to their cooldown, as
attacking Heroes and native troops already did. Using only the pet's base interval held a poisoned
pet on its first attack frame until the long cooldown fell below that base; attack-speed boosts
could skip ahead instead. `tests/native-unit-presentation.test.ts` checks Frosty, L.A.S.S.I,
Electro Owl and Mighty Yak under Poison, chill and an attack-speed boost. A real Spell Tower Poison
attack in `tests/pet-animation.test.ts` and `tests/browser/pet-animation.spec.ts` checks source
cooldowns, uploaded Frosty poses and green tint, portable backward seeks and reduced-motion toggles
on desktop and phone. The correction changes presentation only.

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

The captured effect survives the Queen’s Recall or disappearance. Its expiry follows the scheduled impact time, so a late update cannot extend it. Intrinsic native projectile frost uses the same snapshot path. Version 70 and earlier retain their previous projectile and frost calculation. This correction covers building impacts; version 77 below adds ranged frost against defending units.

`tests/frozen-arrow-impact.test.ts` covers launch, impact, Recall, expiry, maximum level, Monolith Arrow and exact portable backward seeks. `tests/browser/frozen-arrow-impact.spec.ts` checks the actual native projectile on desktop and phone, plus reduced motion and the older replay rule.

## Version 72 Monolith Arrow deployment housing

Monolith Arrow now selects its stage from cumulative deployment housing instead of the current unit list. The previous count omitted Heroes and could shrink when Recall removed troops. Each first Hero deployment adds 25, each owned Siege Machine adds one, and ordinary troops add their housing cost. Pets, ability summons and spells add nothing. Losses and Recall leave the counter intact; redeploying a recalled unit keeps its original contribution, following the existing deployment-accounting rule. Deployments count before the Queen arrives as well as while she is fighting.

The [pinned source comparison](../reference/official-wiki/heroes-pets/monolith-arrow.md) defines the boundaries: exactly 180 housing keeps the highest tier, exactly 250 keeps the middle tier. At level 1, shots add 9.5%, 7% or 4% of the target building’s maximum HP; level 27 uses 14%, 10% or 5%. Versions 71 and earlier retain the original unit-list calculation. The existing defender-targeted attack path remains outside this correction.

`tests/monolith-arrow-housing.test.ts` covers both equipment levels at every boundary, pets and summons, failed deployments, losses, Recall, redeployment and exact portable backward seeks. `tests/browser/monolith-arrow-housing.spec.ts` checks all three native projectile tiers and the historical rule on desktop and phone.

## Version 73 attacking Headhunters against Heroes

Attacking Headhunters now use the parsed `PreferHeroes`, `HeroDamageMultiplier=400` and `IsJumper` columns against defending Heroes. Previously the shared defender fight path ignored all three, so a frozen, unalerted Hero could be bypassed entirely and an alerted Hero took only normal damage. The [pinned Headhunter comparison](../reference/official-wiki/troops/headhunter.md) specifies Hero-first targeting across the battlefield, four-times direct damage, ground/air targeting and wall jumping.

A valid defending Hero takes priority over nearby ordinary defenders and committed buildings, including outside the ordinary alert radius. Headhunters keep their current valid Hero target, select another after it falls and resume ordinary defender/building targeting once no valid Hero remains. They cross walls during the Hero chase. Level 1 now deals 252 direct damage to a Hero instead of 63; level 4 deals 324 instead of 81. Guardians and ordinary troops receive normal damage. Versions 72 and earlier retain the previous rules. This correction covers Headhunter targeting, direct damage and chase routing. Version 74 below adds native card projectiles; version 76 adds on-hit Poison.

`tests/headhunter-hero-rules.test.ts` covers all four troop levels, distant and unalerted Heroes, retargeting after spawn, ordinary defenders, Guardians, an unbroken wall, both Hero layers, portable backward seeks and the older rule. `tests/browser/headhunter-hero-rules.spec.ts` checks real recorded shots and native bodies on desktop and reduced-motion phone views.

## Version 74 native Headhunter cards against defenders

Headhunters now use their level-specific `Headhunter_Card_lvl1` through `lvl4` projectile against defending troops, Heroes and Guardians, matching their existing building attacks. The [pinned client projectile](../reference/full-client/README.md) travels at `Speed=1400`, or 14 tiles per second. The previous shared defender path substituted a generic arrow at 18 tiles per second. All four rows share the shipped native card artwork.

The native impact resolver now delivers the captured direct hit to its original ground or air defender. A missing shooter does not cancel the card, and a fallen target cannot transfer its damage to a replacement. Versions 73 and earlier retain their generic arrow and earlier impact time. Version 76 below adds on-hit Poison.

`tests/headhunter-cards.test.ts` checks all four projectile rows, source speed, retained art, impact timing on both layers, a missing shooter and a fallen target. `tests/browser/headhunter-cards.spec.ts` checks uploaded native card textures and the flight/impact boundary on desktop and phone, including backward seeks and version 73.

## Version 76 intrinsic attacker poison-on-hit

Attacking Headhunters and Poison Lizard now apply their intrinsic `PoisonOnHitSpell` for the
source's three-second duration when a projectile hits a living defender. The [Headhunter
comparison](../reference/official-wiki/troops/headhunter.md) maps levels 1–4 to Poison levels 5–8;
the [Poison Lizard comparison](../reference/official-wiki/heroes-pets/poison-lizard.md) maps its pet
tiers to `PoisonLizardAttack`. Hit poison uses the existing local continuous on-hit interpretation
used by defending Headhunters. Area Poison retains its separate pulse/ramp mechanism.

Level-1 Headhunter poison uses 220 DPS before class modifiers: 11 DPS against a defending Hero
and 66 against a Guardian. Its direct on-hit slow is 40% movement and 55% attack speed. Level-1
Poison Lizard uses 80 DPS, 26% movement slow and 35% attack slow; its spell row has no Hero damage
reduction. Guardian slow resistance still applies through the existing action-clock rules.
Hits refresh the deadline and keep the strongest active on-hit damage and slow components.
Area and on-hit slows use the stronger component, and full Freeze keeps its visual priority.

Poison Lizard uses `fireIguanaProto` at the source speed, prefers nearby defending units even when
unalerted, and jumps walls during that chase. Repairing Builders remain untargetable. Effects are
resolved from the projectile's captured source kind/level, so a final spit can poison its target
after Recall removes both pet and Hero. Damage clocks do not rewind; expiry clips damage to the
scheduled deadline. Versions 75 and earlier retain their previous direct-only hits and Lizard path.

`tests/attacker-hit-poison.test.ts` covers source levels, all defender classes, actual Hero/Guardian
action clocks, overlap, exact expiry and real ground/air attacks through Recall and portable backward
seeks. The older direct-hit fixtures stay on version 75. `tests/browser/attacker-hit-poison.spec.ts`
checks native projectile names, damage after Recall, green status bodies and historical playback on
desktop and reduced-motion phone views.

## Version 77 ranged frost against defenders

Frozen Arrow and intrinsic ranged frost now carry their native projectile and launch-time frost
values into hits on defending troops, Heroes and Guardians. The [Frozen Arrow source
comparison](../reference/official-wiki/heroes-pets/frozen-arrow.md) explicitly includes defending
troops and Heroes; [Frosty](../reference/official-wiki/heroes-pets/frosty.md) supplies four-second,
50% frost on his own attacks. Ice Hound Pups use their intrinsic two-second, 50% frost as well.
Previously these defender attacks substituted a generic arrow and discarded frost entirely.
Monolith Arrow keeps its projectile override when paired with Frozen Arrow; its building %-HP
damage is not added to a defender hit.

Partial frost has its own deadline and blue body cue, independent of full Freeze/stun. It uses
the existing local native-unit chill interpretation for movement and attack clocks, multiplying
the retained Poison scales. The wiki's generic “slow down” wording does not establish the modern
client's exact attack-clock implementation or overlapping slow rules. As with building frost,
the latest hit replaces the frost deadline and strength. No Poison-specific Hero or Guardian
resistance is applied to frost. Impact uses its scheduled time and captured values after Recall;
dead or unborn targets cannot receive or transfer the effect. Versions 76 and earlier keep their
generic defender shots and direct-only damage. Melee frost and slowed death animation remain
outside this ranged-hit correction.

`tests/defender-frost.test.ts` checks equipment levels, source projectiles, Monolith pairing,
Frosty, Ice Hound Pups, all four defender action paths with Poison overlap, expiry, missing owners and real ground/air Queen shots
through Recall and portable backward seeks. `tests/browser/defender-frost.spec.ts` checks the
uploaded native arrow, blue Hero bodies, expiry and historical playback on desktop and a
reduced-motion phone.

## Version 78 Royal Champion Haste Vial combat intervals

Haste Vial now changes the Royal Champion's actual attack interval against buildings and both
defender layers. The ability previously recorded an interval used by animation while combat kept
the passive base rate. The [Haste Vial source comparison](../reference/official-wiki/heroes-pets/haste-vial.md)
matches the active override divided by the equipped passive attack-speed bonus: level 1 uses
750 ms / 1.05 = 0.714 s; level 18 uses 600 ms / 1.16 = 0.517 s. Intermediate tiers use the source
666 ms override. Native Poison/chill and other attack-speed modifiers still apply afterward.

Damage per hit keeps its existing passive value throughout activation and expiry. Each newly
fired attack resets to the applicable interval; expiry returns subsequent attacks to the passive
base rate. The existing target-acquisition delay remains in force. Versions 77 and earlier keep
their original combat rate and uncombined animation override. Stick Horse deployment timing,
extra-damage/limited-hit equipment remain separate follow-up work. Version 79 below adds life steal.

`tests/champion-haste.test.ts` covers all override tiers, passive speed, unchanged hit damage,
Poison, both defender layers, actual attacks through expiry and exact portable backward seeks.
`tests/browser/champion-haste.spec.ts` checks level 1 and 18 attack poses, cooldowns, expiry and
the historical rule on desktop and phone.

## Version 79 Vampstache healing on actual attacks

Equipped Hero life steal now runs after a completed building, wall or defender attack. The existing
helper was never called by combat. The [Vampstache source comparison](../reference/official-wiki/heroes-pets/vampstache.md)
maps its seven healing tiers to `SelfDamagePerHit`: 60, 90, 120, 160, 200, 250 and 300 HP. Each
actual swing heals once, capped at maximum HP. Approach steps, held cooldowns, ability spell hits
and fallen Heroes cannot generate healing. Damage and attack intervals retain their existing rules.
Versions 78 and earlier preserve their no-life-steal attacks.

`tests/vampstache.test.ts` covers all tiers, buildings, walls, defenders, health caps, held/dead
units, real King duels and portable backward seeks. `tests/browser/vampstache.spec.ts` checks
level 1 and 18 duels with two distinct bodies and their health bars on desktop and a reduced-motion
phone, including exact health differences against version 78.

## Version 80 Invisibility Vial shot damage

The Queen's ordinary attacks now add the active Invisibility Vial's `ExtraDamageFlat` value to
their existing boosted base damage. The [source comparison](../reference/official-wiki/heroes-pets/invisibility-vial.md)
gives +340 per shot for 4.2 seconds at level 1 and +1,740 for 7.8 seconds at level 18. Invisibility
was already applied, but combat never called the flat-damage helper. Buildings and already-acquired
ground/air defenders receive the launch-time bonus. Ability spell hits and unrostered Queen copies
do not gain it. Frozen Arrow keeps its captured frost when paired with the Vial.

Projectiles keep their damage after the Vial expires or Recall removes the Queen; new shots after
expiry return to ordinary damage. Versions 79 and earlier retain their invisibility without the
Vial shot bonus. This correction covers damage; target acquisition, extra-damage boost ordering
against other modern client effects and the boosted orange-arrow visual remain separate audits.

`tests/queen-vial.test.ts` checks source tiers, committed defender targets, Frozen Arrow pairing,
copy exclusion, expiry and shots landing after Recall through portable backward seeks.
`tests/browser/queen-vial.spec.ts` checks native arrow art, invisibility opacity, captured damage,
expiry/Recall and historical playback on desktop and a reduced-motion phone.

## Version 81 Royal Champion charged spear attacks

Rocket Spear now uses its source `AttackRange=1005` (10.05 tiles), native `RocketSpearProjectile`,
flat shot bonus and finite throw count. Activation previously stored these fields without combat
reading them or spending a charge. The [source comparison](../reference/official-wiki/heroes-pets/rocket-spear.md)
maps level 1/9/18/27 to 7/8/9/10 throws and +350/+560/+770/+980 damage. The pinned client uses
`DamageRadius=90`, or 0.9 tiles; the wiki lists 0.8. Each actual throw spends one charge. Approach,
target-acquisition waits and held cooldowns spend none. The final rocket keeps its launch snapshot;
the next throw returns to the ordinary spear, range and damage without clearing Haste Vial.

Royal Champion shots against defenders now use native spear packets throughout charged and ordinary
combat, and her source wall jumping remains available during that chase. Rocket splash damages
the primary defender once and nearby defenders on the struck layer. Buildings keep the existing
native splash footprint rule. Birth checks and lethal defender timestamps use the scheduled impact
time, including an overdue sample. A missing shooter cannot cancel the captured rocket.
The layer convention is corroborated by the pinned [older client reconstruction's projectile
damage path](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicProjectile.cs);
it is not modern client source code. Flat-bonus ordering against other modern boosts retains the
local interpretation described for the Vial. Versions 80 and earlier preserve the previous behavior.

`tests/rocket-spear.test.ts` checks all four count tiers, range, damage, depletion, Haste pairing,
wall jumping, both defender layers, birth/death times, missing shooters and real portable backward
seeks. `tests/browser/rocket-spear.spec.ts` checks uploaded rocket and ordinary spear art, charge
depletion, captured final throws and historical playback on desktop and phone.

## Version 82 Noble Iron deployment attacks and charged Recall

Noble Iron now grants its finite attack effect immediately on the Prince's first deployment,
without using the ability button. Combat reads the captured range, flat damage and native
`TurboStartProjectile`, spending one charge per actual attack against a building or a ground/air
defender. The final charged projectile keeps its launch snapshot; subsequent attacks use
`MinionHeroAttackProjectile` and ordinary range/damage. The [source comparison](../reference/official-wiki/heroes-pets/noble-iron.md)
gives +350 to +770 damage, 10 to 12 tiles and five to ten attacks. Levels 15–17 follow the pinned
client's nine attacks rather than the wiki's eight. Existing passive attack speed remains in effect.

Recall now retains remaining finite-hit Hero equipment effects, including Noble Iron and Rocket
Spear, and restores those charges on redeployment. The [Recall reference](../reference/official-wiki/spells-siege-super/recall-spell.md)
says recalled units keep their status effects; this implementation interprets that rule as retaining
unspent equipment charges. Noble Iron's source `MaxActivations=1` is tracked on the Hero roster:
redeployment never grants a fresh batch, including after all shots have been spent. This correction
does not change timed buff retention, timer pausing or other Recall status rules. Versions 81 and
earlier retain their previous deployment and Recall behavior.

`tests/noble-iron.test.ts` covers source tiers, both defender layers, depletion, ability independence,
spent and partially spent Recall, historical behavior and real portable backward seeks.
`tests/browser/noble-iron.spec.ts` checks native Hero/projectile art, charged and ordinary shots,
reduced-motion parity, Recall redeployment and historical playback on desktop and phone.

## Version 83 Stick Horse combat and wall traversal

Stick Horse now starts before the King's first simulation sample, without an ability input.
Its stored attack interval previously affected presentation alone; combat now uses the same
interval for building and defender attacks. The [source comparison](../reference/official-wiki/heroes-pets/stick-horse.md)
gives 1.170 to 0.900 seconds, a 12 to 30 second duration, and +1.2 to +3 tiles/second. Movement
already used those additive speed values after the first sample. Poison and frost continue to
scale the temporary interval. Hit damage is unchanged by this correction.

With Vampstache, the interval follows the pinned override divided by passive equipment speed,
consistent with Haste Vial: maximum Stick Horse and Vampstache use `0.900 / 1.22`, approximately
0.738 seconds. The wiki instead adds rounded percentages and gives 0.774 seconds; this remains
a documented interpretation difference rather than a claim about modern client stacking.

The King's personal `IsJumper` effect now allows routes through intact walls toward buildings
and defending units. A change in personal jump mode discards the cached path, so expiry cannot
leave him following a route through a wall he can no longer cross. This correction uses the
existing movement presentation; it does not add a separate horse or wall-leap animation.
The once-per-roster deployment key prevents the ability button or Recall from granting a new
boost. Timed buff retention through Recall remains outside this change. Versions 82 and earlier
retain the delayed initial boost, ordinary combat interval and previous wall blocking.

`tests/stick-horse.test.ts` covers all ten source tiers, first-sample movement, Vampstache pairing,
status scaling, building/defender wall routes, exact expiry and real portable backward seeks.
`tests/browser/stick-horse.spec.ts` checks native attack frames and actual cooldowns, expiry,
intact-wall traversal, reduced-motion parity and historical playback on desktop and phone.

## Version 84 passive attack speed preserves hit damage

Passive equipment attack speed now shortens the interval without reducing damage per hit.
Previously `heroStatsFor` multiplied the additive DPS by the already-shortened interval, cancelling
that passive's nominal DPS gain. The [Vampstache comparison](../reference/official-wiki/heroes-pets/vampstache.md)
supports retaining `(base DPS + item DPS) × base interval` as hit damage. This is a local engine
interpretation supported by the wiki's combined-item DPS example; the table columns alone do not
encode that multiplication order. Additive item speed, Town Hall strength and temporary/status
interval rules keep their existing behavior.

The correction covers Vampstache, Snake Bracelet, Haste Vial, Rage Gem, Dark Crown and Noble Iron,
including paired items. At level 1 with maximum Vampstache, the King keeps 266.4 damage per hit
and a `1.2 / 1.22` second interval. His nominal DPS is 270.84. Noble Iron's flat charged-shot bonus
is added separately. The normal Hero panel now shows matching per-hit damage and nominal DPS;
the fixed 20 Hz simulation still quantizes actual attack times. Unrostered copies and Heroes
without passive equipment speed keep their existing stats. Versions 83 and earlier preserve the
previous damage calculation through both the model and native combat stats paths.

`tests/hero-passive-speed.test.ts` checks all six items, stacked speed, Town Hall scaling, ground
Hero combat under Poison/frost, real building hits/projectiles and exact portable backward seeks.
`tests/browser/hero-passive-speed.spec.ts` checks actual King/Champion combat, native art, reduced
motion, historical playback and the normal Hero stats panel on desktop and phone.

## Version 85 Giant Gauntlet ground splash

The King's active Giant Gauntlet now applies its stored 2.5-tile splash radius to actual melee
hits. The [source comparison](../reference/official-wiki/heroes-pets/giant-gauntlet.md) specifies
14 to 19 seconds of ground splash, with 20% to 60% damage reduction. Shielding and regeneration
keep their existing behavior. A building hit now reaches nearby buildings and ground defenders;
a defender hit reaches nearby ground defenders and building footprints. The primary target is
hit once, airborne and unborn defenders are excluded, and Vampstache heals once per swing.

Splash uses the primary target's center and the existing local building-footprint distance rule.
The target-centered convention is corroborated by the pinned [older client reconstruction's
melee area-damage path](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs);
it is not modern client code. Splash reaches invisible buildings, leaves buried Teslas and traps
intact, and respects Overgrowth immunity. Hits can reach over a wall without changing the King's
movement. The incorrect stored `jumper` metadata is omitted for new Gauntlet activations;
Stick Horse still owns its independent personal jump timer and expiry.

Held cooldowns and Freeze cause no area hit. The exact ability deadline restores ordinary hits.
Unrostered King copies receive no equipment splash. Versions 84 and earlier preserve their
primary-only combat. This correction covers splash combat and its existing impact effect;
Gauntlet growth scaling and the prolonged enlarged knockout pose are described below.

`tests/giant-gauntlet.test.ts` covers all ten duration/shield tiers, both hit origins, ground/air and
birth checks, invisibility, immunity, Vampstache, Stick Horse expiry, copy exclusion and real
portable backward seeks. `tests/browser/giant-gauntlet.spec.ts` checks native King art, actual
adjacent-building damage, expiry, reduced-motion parity and historical playback on desktop and phone.

## Gauntlet growth and knockout presentation

The native King and his portrait fallback now grow during Giant Gauntlet. The pinned ability's
`GrowthScale` 70 to 115 is interpreted as an added percentage, giving 1.70× to 2.15× normal size.
This is a local visual interpretation of that source field; exact modern client transition curves
are not available. Shrinking multiplies the enlarged body scale, and the health bar follows its
height. Growth ends at the existing ability deadline, including during pause/resume and seeks.

A King knocked out while Gauntlet is active keeps the enlarged final knockout pose until that
original deadline, as described by the [Gauntlet reference](../reference/official-wiki/heroes-pets/giant-gauntlet.md).
The approved King atlas aliases `die` to an upright attack-recovery frame, so this held frame uses
the same static 70-degree collapse as its portrait fallback. This is a local pose approximation;
an authored knockout animation remains an art improvement. The existing native 1.5-second fade
then runs at normal size. The fallback portrait holds its
static defeat pose and uses the same fade. Reduced motion holds a static final native pose.
A later knockout, a copy outside the Hero roster, and a redeployed unit without the timed effect
keep ordinary presentation. All decisions use battle time; no combat state or replay version changes.

`tests/native-unit-presentation.test.ts` checks all ten growth tiers, reduced motion, Shrink
composition, expiry, prolonged knockout, fade and backward rendering without battle mutation.
`tests/hero-growth.test.ts` uses real cannon-fire knockouts through portable backward seeks.
`tests/browser/gauntlet-growth.spec.ts` checks uploaded native poses and a deliberately unavailable
atlas that exercises the portrait fallback on desktop and phone, with reduced motion and backward seeks.

## Version 86 source jumpers retain defender-chase routing

Native units with `IsJumper=TRUE` now retain their wall-bypassing route when pursuing a defending
unit. The building chase already read that flag, but defender pursuit enabled it only for a few
named units. This left Lassi, ground Warden and other source jumpers attacking blocking walls.
The [Lassi reference](../reference/official-wiki/heroes-pets/lassi.md) explicitly includes buildings
and ground troops behind walls; the [Warden reference](../reference/official-wiki/heroes-pets/grand-warden.md)
allows wall traversal in ground mode. Target preferences, ordinary ground routing and the existing
special wall interactions keep their previous rules. Underground movement is a separate mechanism.

An actual Lassi deployment now reaches a defending King across the barrier. The Warden recording
first lures a defender into acquisition range, then hides its targets with Invisibility; the Warden
retains the retreating target and follows it home across the wall. This uses recorded troop, Hero
and spell inputs, without assigning a defender target in the live recording. The barrier stays
standing; other attackers may still hit it. Versions 85 and earlier keep their previous routes,
including the existing Headhunter, Poison Lizard, Champion and Stick Horse exceptions.

`tests/jumper-defender-chase.test.ts` covers pets, ground Warden, Apprentice Warden and Hog Riders,
ordinary ground controls, defense preference, earlier exceptions and exact portable backward seeks.
`tests/browser/jumper-defender-chase.spec.ts` checks native actors, actual damage after crossing,
reduced-motion parity and historical playback on desktop and phone. This correction changes
routing, without adding a wall-leap animation or changing pet leash/target-selection rules.

## Version 87 Diggy defender-chase exposure

Diggy now uses underground movement during defender pursuit and surfaces before a defender hit.
It no longer remains invulnerable while attacking a defender because of the missing transition. On leaving range it burrows again; source ground targeting and existing
master-selection rules remain unchanged. Defending troops and Heroes receive no surfacing stun.
See [underground defender pursuit](NATIVE-GRID.md#version-87-underground-defender-pursuit) for
scope, source references, replay compatibility and verification.

## Version 88 Hero attacks against defenders

Hero attacks against defending troops, Heroes and Guardians now use the same source projectile
selection as building combat. The Queen fires her level-specific native arrow at 16.5 tiles per
second; Monolith Arrow selects its current housing-stage projectile even without Frozen Arrow.
Captured frost and damage survive Recall. The Warden and Dragon Duke have no `Projectile` in
the pinned Hero rows and now hit directly, instead of launching generic arrows or bombs.
The King stays ground-only; existing Prince and Champion projectiles retain their source rules.
Hero copies receive their base attack shape without borrowing roster equipment.

These shapes follow the pinned [Hero tables](../reference/full-client/README.md). Version 88
left Monolith Arrow's percentage-HP defender bonus for the version 89 audit below.
Native Hero lethal impacts use their scheduled deadline, including when the
resolver samples later; versions 87 and earlier preserve their previous packets and timestamps.

`tests/hero-defender-attacks.test.ts` checks all six Heroes, ground and air targets, arrow tiers,
Recall, copies, birth/death timing and exact portable backward seeks. The matching browser spec
checks native Queen arrows and Hero bodies, direct Warden/Duke damage, reduced motion and
historical playback on desktop and phone.

## Version 89 Monolith Arrow defender damage

Monolith Arrow now adds its percentage of the primary defender's maximum HP when the Queen
fires, including against ground and airborne Heroes, garrison troops, Skeletons and Guardians.
The [pinned equipment reference](../reference/official-wiki/heroes-pets/monolith-arrow.md)
describes the bonus as target-max-HP damage without a building-only restriction; the three
source abilities supply `DamagePermilHp`, projectile and deployment thresholds. At level 1,
the bonus is 9.5%, 7% or 4%; level 27 uses 14%, 10% or 5%. Exactly 180 and 250 housing retain
the higher stage, using the version 72 cumulative counter.

The bonus adds after ordinary attack damage boosts, so Rage and difficulty damage scaling
do not multiply it. An airborne arrow keeps its captured bonus, stage and frost after Recall,
equipment removal or a later housing change. Copies outside the Hero roster receive no item
bonus. Version 88 and earlier retain their previous defender damage.

`tests/monolith-defender-damage.test.ts` checks both housing boundaries, both Hero layers,
actual defender families, damage scaling, capture, copies, legacy damage and real Recall inputs
through portable backward seeks. `tests/browser/monolith-defender-damage.spec.ts` verifies
native Monolith projectiles, post-Recall damage, frost, reduced motion and historical playback
on desktop and phone.

## Version 90 Diggy's Stunning Surprise

Diggy now stuns its building target once when it surfaces, using the pinned
`DiggyStunOnSurface.StunTargetOnActivateTime`: two seconds at pet levels 1–4, 2.5 at 5–9
and three at level 10. The [Diggy reference](../reference/official-wiki/heroes-pets/diggy.md)
records the `ActiveOnBecomingTargetable` trigger and the ten-level client ceiling; the newer
wiki's levels 11–15 remain outside this source snapshot.

The stun applies to defenses, including a Town Hall with an active weapon. Resource buildings,
defending troops, Heroes and Guardians receive no Diggy stun. It uses the existing defense stun
clock without adding Freeze status, preserves longer existing stuns and expires normally.
Repeated attacks while surfaced do not refresh it. Diggy burrows again on leaving building
attack range and may stun on its next emergence, including when retargeting an adjacent defense.
Freeze holds a burrowed Diggy below ground until it can emerge. Versions 89 and earlier retain
their previous defense activity and building-range exposure.

`tests/diggy-surface-stun.test.ts` checks source tiers, repeated hits, re-emergence, held attacks,
Freeze, target classes, active Town Hall weapons, expiry and actual pet deployment through
portable backward seeks. The matching browser spec checks native Diggy art, paused defense
clocks, recovery, reduced motion and legacy playback on desktop and phone.

## Version 91 Diggy follows its Hero's target

While its assigned Hero lives, Diggy now prefers that Hero's eligible building or ground defender
target. The [Diggy reference](../reference/official-wiki/heroes-pets/diggy.md) describes attacking
the Hero's target, including a Wall the Hero attacks; the pinned pet row declares
`PreferMasterTarget=TRUE`. A current Hero building target takes priority over Diggy's independent
defender scan. Ground-only targeting and the shared defender concealment/birth checks still apply.
Without a living assigned Hero or eligible target, Diggy uses independent target selection.
Copies outside the roster do not borrow another pet's master.

Hero routes keep their destination building or defender while hitting a blocking Wall, so new
recordings track that actual blocker separately. Diggy follows the Wall until it is destroyed
or the Hero resumes another target. Changing master targets discards the pet's old path and
starts its underground approach again. Ordinary wall bypass and the version 90 surfacing stun
retain their existing target rules. Versions 90 and earlier preserve independent pet selection.
Other pet controllers and automatic master changes after Hero defeat remain separate audits.

`tests/diggy-master-target.test.ts` checks conflicting targets, Walls in both chase paths,
ground/air restrictions, dead/hidden/unborn targets, copies and unavailable Heroes. Actual King
and Champion deployments, plus a recorded Freeze to hold an enemy behind a Wall, reconstruct
through portable backward seeks. The matching browser spec checks native Diggy art, actual
Wall and defense damage, reduced motion and historical playback on desktop and phone.

### Facing a blocking Wall

Native Hero attack directions and fallback target selection now use the recorded blocker before
the route's building or defender destination. A Hero hitting a nearby Wall faces that actual
impact point, including when its destination lies at another angle. Missing blocker metadata
retains destination-facing behavior. This is presentation only and uses version 91's existing
metadata without a combat-version change. Unit presentation checks cover distinct directions,
missing blockers, paused and backward redraws, reduced motion and simulation-state invariance.
The real Wall recording includes a diagonal destination to verify the rendered attack atlas.

## Version 92 Invisibility on defending units

Native Invisibility pulses now conceal present, living defending troops, Heroes and Guardians.
The player's [Invisibility Spell](../reference/official-wiki/spells-siege-super/invisibility-spell.md)
covers both armies and eligible buildings; [Spell Tower Invisibility](../reference/spell-tower/README.md)
covers defending units and buildings under the project's documented defensive team rule.
Walls, Siege Machines, traps and buried Teslas retain their immunity/visibility rules.
Overgrowth's source `InvisibilityTime` does not conceal defenders.

The shared defender target checks reject concealed units and select another eligible target.
Each in-range pulse refreshes the pinned 600 ms linger, including overlapping casts; leaving
the area permits that linger to expire. Hidden units keep attacking, take indirect damage and
receive projectiles launched before concealment. Player casts now also conceal building targets
without disabling their weapons. Expiry restores eligibility without forcing a return to the
previous target. Versions 91 and earlier keep their original native coverage.

Heroes and Guardians now share the existing local 0.35 opacity cue used by garrison troops and
Skeletons. This alpha is a local readability choice; it is not an authored client transparency
value. Defeated bodies retain their normal fade. `tests/native-invisibility-targets.test.ts`
checks source tiers, both cast sides, target classes, immunities, birth and radius boundaries,
overlap, retargeting, damage and real portable backward seeks. Native presentation tests check
opacity, expiry, reduced motion and state invariance. Browser checks cover real player casts,
ground/air Heroes, airborne impacts and a Spell Tower triggered by Champion hits, plus historical
playback on desktop and phone.

## Version 93 Rage coverage and expiry

The [Rage Spell](../reference/official-wiki/spells-siege-super/rage-spell.md) and
[Rage Gem](../reference/official-wiki/heroes-pets/rage-gem.md) now increase healing as well as
damage. Native defensive Rage covers present, living defending Heroes, garrison troops,
Skeletons and Guardians; it respects spell immunity and leaves the opposing army unaffected.
Defenders share the existing local orange boost tint, below Freeze and Poison in priority.

The pinned spell rows provide both `SpeedBoost` and `SpeedBoost2`. Preferred-target characters
use the latter; Heroes use the normal speed value with `HERO_RAGE_SPEED_MULTIPLIER` (50%),
including the defense-preferring Royal Champion. Hero damage bonuses use
`HERO_RAGE_MULTIPLIER` (50%). Guardians receive full strength. The older
`LogicLevel.BoostGameObject` reconstruction at
[52c5953](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Level/LogicLevel.cs#L2784)
supports the preferred-character versus Hero branch; it is supporting historical evidence,
not a claim to modern client code. The pinned [Spell Tower reference](../reference/spell-tower/README.md)
provides defensive boost values and the Hero globals. Rage does not add attack speed.

Each spell, aura, ability, deployment boost and Dark Crown stage retains its own deadline.
Readers choose the strongest currently active damage, movement and attack-speed component.
A continuing weak aura therefore cannot extend an expired Rage Spell or Rage Vial bonus,
and a permanent Dark Crown boost does not erase a temporary movement bonus. Guardian home
Rage still takes the strongest component. Versions 92 and earlier keep their original combat
coverage, healing, movement and shared-expiry behavior.

`tests/native-rage.test.ts` checks source tiers, preferred targets, all six physical Hero kinds,
defender classes, actual attacks, healing, overlapping expiry, Dark Crown and historical rules.
Real army deployments, casts and an automatically triggered Spell Tower reconstruct through
portable replay files and backward seeks. Browser checks cover healing on desktop and aura
expiry and defending Hero art on phone, including reduced motion and old-version playback.

## Version 94 increasing troop damage

[Inferno Dragon](../reference/official-wiki/spells-siege-super/inferno-dragon.md) and
[Super Miner](../reference/official-wiki/spells-siege-super/super-miner.md) now use their pinned
`IncreasingDamage`, `DPS`/`DPSLv2`/`DPSLv3` and switch times against defending troops and Heroes
as well as buildings. Inferno Dragon switches after 1.7 and 3.2 seconds; Super Miner after 1.5
and 3 seconds. Each source tier supplies its own damage values, including Super Miner's
nonuniform final-stage ratios. Existing damage boosts apply once to the selected stage.

Heat belongs to the actual target and its building/defender namespace. A new target starts at
base damage even when it is already in range. Pursuit clears heat; travel never warms the
next attack. The first successful hit starts the new target's clock. Inferno Dragon's
`TargetKilledCooldownTimer` adds the pinned 0.6-second recovery after a direct killing hit;
Super Miner retains its normal source attack interval. A target killed by another attacker
also clears the previous heat when that death is observed.

Both source character rows omit `Projectile`. Their attacks against defenders now resolve
directly instead of creating the shared fighter's generic ranged/flying projectile. Existing
native troop bodies, hit feedback and target-height restrictions remain in use. This pass
does not add a new beam visual or change the existing Freeze clock treatment. Versions 93
and earlier retain flat defender damage and the old building heat and projectile behavior.

`tests/native-damage-ramp.test.ts` verifies all stages and threshold boundaries, inherited
tiers, boosts, in-range target changes, pursuit, direct kills, recovery and old rules. Real
deployment/Freeze recordings reach each stage, kill their first target and restart on another,
then reproduce through portable replay files and backward seeks. Browser checks cover both
units against buildings and defending Heroes on desktop and phone, native body art, reduced
motion and historical defender playback.

## Native Inferno Dragon beam presentation

The [pinned beam reference](../reference/inferno-dragon/README.md) supplies the three authored
attack effects and their `dbeam_1_light`/`2`/`3` scene exports. These meshes and textures were
already imported with the Inferno family. The beam now follows the actual body's
`attack_pivot` locator, including nested animation timing, source direction, mirroring and
world movement. It switches artwork with combat version 94's damage stage and uses the
source 128 ms fade-in with a local linear envelope.

Native troop bodies now face defending targets before building destinations; structure
centers follow their real footprints. The beam disappears when ownership or target validity
ends, during Freeze, while pursuing, and when returning home. Reduced motion keeps a static
beam timeline with the current combat stage. Rendering does not modify combat state or bump
the replay version.

Inferno Dragon's attack audio now follows the same beam ownership. The original fire sample
loops once per active stage at the pinned 30% volume and 1.0/1.2/1.4 pitches, rather than
restarting at every damage tick. Source stage timestamps and stable target keys make pause,
seek and replay-speed changes use the shared sample player's normal lifecycle. Generic
per-hit attack sounds remain for recordings before combat version 94. Transition bursts
remain separate presentation work.

## Phoenix Egg source artwork

The internal `phoenixegg` actor now has its own original eight-direction atlas at
`public/assets/heroes-native/phoenixegg/`, independently pinned in
[`phoenix-egg-art.json`](../reference/full-client/phoenix-egg-art.json). `PetPhoenixEggDefault`
uses `sc3d/pheonix_default_geo.glb` and the `PhoenixEggDefault` animation block. Its authored
walk and attack rows both use `pheonix_default_walk1.glb`; it declares no idle or death row.
The renderer reuses walk when idle. Both states share one 111,139-byte texture sheet, with
22 frames per direction at the source 30 fps. The egg stays on the ground, matching
`Phoenix Egg.IsFlying=FALSE`; `DepthBias=50` is retained as metadata rather than treated as
physical altitude.

The existing baker supports `--set phoenix_egg` without rewriting any other hero, pet or
Guardian assets. `--download-missing` explicitly permits missing inputs to be downloaded
from the pinned client bundle: the fingerprint is SHA-256 checked and every source is checked
against its SHA-1 membership before it enters the cache. The default remains an offline
source read. `NATIVE_ART_CHROMIUM_PATH` optionally selects a system Chromium for the WebGL
baker; otherwise Playwright chooses its normal executable.

```sh
PYTHONPATH=scripts python scripts/native3d/bake_hero_art.py --set phoenix_egg --check --download-missing
```

An independent source rerender matches every checked egg pixel exactly. Hash/bounds tests,
native presentation tests and desktop/phone browser previews verify the original frames,
ground registration, reduced motion and unchanged battle state. This artwork prepares the
Phoenix egg and revival controller; it does not itself change pet deployment or combat rules.

## Version 95 Phoenix Egg and revival

The [Phoenix dossier](../reference/official-wiki/heroes-pets/phoenix.md) and pinned client rows
now drive its waiting, hatch and revival controller. The bird (`SpawnDelay=400000`) waits
without attacking or drawing; `SpawnPhoenixEggAbility` creates the separate ground Egg.
The Egg's `PhoenixEggInvulnerableAbility` makes it untargetable and invulnerable. It follows
its Hero using the Egg's source speed and local leash/range interpretation. The waiting
pair do not take part in local crowd separation. On hatch, removing the Egg does not count
as lost troop housing for Dark Crown.

Only its assigned Hero can trigger the hatch, once per raid. The existing automatic Hero
ability runs first and can prevent the knockout. `PhoenixResurrect.FixedTravelTime=500`
delays the Hero's return by 0.5 seconds. `PhoenixSpawnAbility` protects the bird for
6.5/7.5/8.5 seconds at pet levels 1–4/5–9/10. `TroopImmortality` protects the revived Hero
for 6/7/8 seconds after impact, so both windows end together. This distinguishes the source
projectile transition from the dossier's combined duration. Existing active abilities
continue; a newly activated ability cannot restore health during temporary life.

The runtime uses one positive hitpoint to represent an acting, temporarily revived Hero;
it is not recovered health. Shared healing, legacy Healer projectiles and direct ability
recovery are blocked during that life. The controller forces knockout at its deadline even
without damage. A local pale life bar shows remaining time instead of that implementation
hitpoint, and the Hero card says **Reviving** during flight and **Phoenix revival** afterward.
These are local readability cues, not a claim to the client's exact HUD styling.

The [Recall reference](../reference/official-wiki/spells-siege-super/recall-spell.md) explicitly
pauses Phoenix revival timers in the bar. Recall returns the waiting Egg with its Hero, or
preserves a revived Hero's remaining life and the bird's remaining protection. Redeployment
restores those timers and their original countdown scale without creating a second Egg.
The pet keeps its used hatch even if the Hero is later revived again. A pending Phoenix
resurrection is not selected by a separate Revive Spell.

The Egg itself retains `TriggersTraps=FALSE`; the waiting bird retains its separate air-unit
`TriggersTraps=TRUE`. Thus the source two-actor model can trip an air mine without exposing
the Egg to ground traps or damage. The dossier flags the Egg/air-trap wording as ambiguous;
this implementation follows the distinct source rows. Ordinary defenses cannot select
either waiting actor. After hatching the bird follows its living Hero's eligible target and
uses the original `PhoenixProjectile`, including same-layer splash without a duplicate
primary hit against defending units. It continues fighting when temporary Hero life ends.

The [Clone reference](../reference/official-wiki/spells-siege-super/clone-spell.md) excludes
all pets. Version 95 repairs that eligibility rule for every pet, including the new Egg:
an ineligible pet consumes no Clone housing, so nearby eligible troops keep the budget.
Version 94 and earlier retain their previous Clone selection.

Original Egg and resurrection flight art warm with a carried Phoenix. The bird's deploy
sound is delayed until hatch. Rendering, reduced motion and paused frames do not mutate the
controller. `tests/native-phoenix.test.ts` checks source tiers, all six Hero kinds, immunity,
traps, automatic ability ordering, healing, projectile/splash rules, Recall, historical rules
and real portable backward seeks. Desktop/phone browser recordings verify native actors,
the life bar and card states, expiry, Recall-paused time, reduced motion and version 94
playback. Versions 94 and earlier keep their previous immediate-bird behavior.

## Version 96 friendly participation and healing immunity

The waiting Phoenix bird is not an active flying ally. It no longer cancels Baby Dragon
Tantrum or another Hero's Dragon Duke Royal Rampage. Recalled, ejected and not-yet-spawned
actors also stay out of these nearby-ally checks. A hatched, living bird counts normally.
Friendly invisibility and burrowing still allow allied support; enemy visibility rules
are not used to discard those allies.

Native group followers also ignore waiting and recalled actors. The source Egg has zero
`FriendlyGroupWeight`, so its untargetable ground actor does not supply a follow anchor or
housing cluster. This repairs eligibility within the existing local housing-based group
algorithm; it does not replace that algorithm with the client's full group-weight system.

The [Healer](../reference/official-wiki/troops/healer.md) and
[Druid](../reference/official-wiki/troops/druid.md) references exclude Siege Machines from
healing, matching their native `ImmuneToHealing` rows. Shared recovery and Healer projectile
impacts now honor the initialized immunity flag. A pulse can still heal an eligible neighbor
inside its splash while leaving an immune siege untouched. Healer primary/cluster selection
and native healing chains skip immune, waiting, recalled and not-yet-spawned actors, so they
do not consume a lock, cluster threshold or chain hop. No eligible ground patient clears a
stale Healer target. The Phoenix temporary-life recovery block introduced in version 95
continues to apply; this change does not infer a different following policy for that life.

`tests/friendly-eligibility.test.ts` covers every siege, shared and projectile healing,
primary/chain selection, group following, both innate rage checks, friendly invisibility
and burrowing, and version 95 behavior. Actual Cannon deployments record an idle Healer
beside a damaged siege, its later Giant target, and Tantrum before/after a Phoenix hatch.
Portable files, reverse seeks, desktop/phone rendering and reduced motion reproduce those
states. Versions 95 and earlier retain their original eligibility rules.

## Version 97 Mighty Yak Hero-death rage

The [Mighty Yak reference](../reference/official-wiki/heroes-pets/mighty-yak.md) specifies
one rage after its assigned Hero falls, with none for Recall and none for a later knockout
after Revive. The pinned pet row names `HeroDeathAbilityType=BoostSelf`, `TroopRage` level 2.
That inherited spell row supplies eight seconds, +70% damage and +16 in-game speed units
(+2 tiles/second), without an attack-speed bonus. All pet levels use the source ability tier.

The Hero's automatic ability runs first and can prevent the knockout. A living, present Yak
then receives the boost directly; coincident allies do not receive an area spell. The source
joins the existing independent boost ledger: stronger Rage wins while active, then the
Yak's weaker boost remains until its own original deadline. The existing 20x Wall damage
multiplier combines with rage once. Existing native boost tint supplies the local feedback.

The spent trigger belongs to the raid's Hero/pet association, so Revive, Recall and a new
deployment body do not grant another use. This preserves the current Recall treatment of
temporary buffs; it does not introduce a new paused rage timer. Dead, ejected and recalled
pets receive no boost. Sneezy's separate transform and Diggy's `SwitchHero` row are outside
this rule.

`tests/native-pet-rage.test.ts` covers source tiers, all six Hero assignments, automatic
ability rescue, ownership, self-only coverage, Recall/Revive persistence, expiry, overlapping
Rage and Wall damage. Real Cannon attacks knock out the Hero while the Yak survives through
the source boost window. Portable reverse seeks and desktop/phone browser checks reproduce
the native pet, active/expired tint, reduced motion and historical version 96 behavior.
Versions 96 and earlier retain their previous unboosted Yak behavior.

## Version 99 Unicorn ownership and support rules

The [Unicorn reference](../reference/official-wiki/heroes-pets/unicorn.md) describes healing
its assigned Hero, on the ground or in the air, at full rate within 2.5 tiles. Unicorn now
keeps that living eligible Hero even at full HP, overriding a cached injured ally. It
rebinds when the Hero returns through Revive or Recall/redeployment. When no eligible living
master exists, the existing generic healing fallback remains; this does not claim the
client's full fallback selection algorithm.

The pet's single-target healing now uses the existing shared diminishing curve. Unicorn
contributes to that allocation only for its actual recipient within its own 2.5-tile range;
it no longer occupies a neighboring unit's splash-healing slot. Recalled or waiting sources
do not count as active sources. Launched ordinary Healer pulses retain their independent
contribution after caster death. The existing local source-ID allocation remains a
deterministic interpretation, rather than a reconstruction of native allocation timing.

Unlike ordinary Healers, a surviving Unicorn no longer ends a raid just because it is the
last unit. The normal battle deadline and manual end still apply. This follows the dossier's
explicit distinction between Unicorn and ordinary Healers.

`tests/native-unicorn.test.ts` checks all Hero assignments, source healing tiers, invisible
masters, full-health priority, generic fallback, Revive/Recall rebinding, single-target/range
allocation, shared diminishing returns, recalled sources and last-pet completion. Actual
Cannon wounds to another ally reproduce ownership priority with a ground King and airborne
Warden through portable files, reverse seeks, reduced motion and desktop/phone rendering.
Versions 98 and earlier retain their previous selection, allocation and completion rules.

## Version 100 native healing flights

The pinned client rows give Unicorn `UnicornHealEnergy` and Druid
`BattleDruidProjectile`, both at `Speed=1200` (12 tiles/second). Recovery now happens
when those friendly projectiles arrive. Druid's `ProjectileBounces=3` allows four
distinct recipients, with each next injured eligible ally selected at impact within
`MaxBounceDistance=450` (4.5 tiles). Ground and air recipients remain supported.
The caster and previously visited recipients cannot receive a later hop.

Flights capture the caster kind, tier and outgoing healing, including its launch-time
Rage multiplier. Caster death, removal or Druid's transformation does not cancel a
launched pulse or substitute Bear stats. Hero recovery uses the captured healer tier.
A dead, removed, recalled, ejected, waiting or healing-immune recipient receives no
recovery and ends that chain. A full-health recipient can still pass on a Druid chain.
These are friendly recovery packets; they never enter enemy damage or splash handling.

The existing projectile adapter tracks the original recipient's location while retaining
its launch-distance arrival time. Short healing flights use its 10-ms minimum rather
than the ordinary native attack's 120-ms minimum. A continuation is dated from the
preceding impact, then processed on a subsequent simulation sample like other native
ricochets. Those adapter timing choices do not reconstruct the client's full tracking
integrator. Unicorn retains version 99's contribution allocation, evaluated at impact;
Druid's existing healing amounts and allocation remain unchanged.

The presentation uses the already imported original `healerenergy` and
`battledruidprojectile` packs. Captured friendly event identity preserves the original
cast/hit samples after the caster changes or disappears. Continuations produce hit
samples without inventing another caster attack.

`tests/native-healing-projectiles.test.ts` checks source speed, short flights, tracking,
invalid recipients, captured tiers and boosts, Hero scaling, air chains, four-recipient
limits, impact-time selection and exact bounce reach. Real Cannon wounds in
`tests/fixtures/native-healing.ts` reproduce recovery and a Druid bounce through portable
files and reverse seeks. Phone/desktop browser checks verify original visible art,
read-only rendering and reduced motion; pet audio checks remain covered separately.
Combat versions 99 and earlier retain immediate native healing.

## Version 101 ground healer routes

Unicorn and Druid are ground units with source `IsJumper=TRUE`. Their ally-following
movement now uses the existing point-target pathfinder, avoiding standing building
footprints while crossing walls. Flying healing units retain direct flight. Selection,
source movement speed and healing range remain unchanged.

Routes refresh every 0.3 seconds for a moving ally, following the existing defender-chase
adapter. Changing or losing the recipient drops the old route immediately; entering
healing range clears leftover waypoints. Searches share the per-sample A* budget and
reuse the normal route grids. This is the game's existing collision/path adapter, rather
than a reconstruction of all client path-choice heuristics.

`tests/native-healer-routing.test.ts` covers both ground healers, tile and native half-tile
collision, jumping, moving and lost recipients, shared search budgets, stopping at range
and historical movement. A real deployment in `tests/fixtures/native-healer-route.ts`
follows an airborne Lava Hound around an untouched storage, with portable reverse seeks.
Phone/desktop browser checks verify its visible original body, reduced motion and
version 100 movement alongside the healing-flight regression.
Versions 100 and earlier retain their former straight-line native healer following.

## Version 102 Sneezy modes and Boogers

The [Sneezy reference](../reference/official-wiki/heroes-pets/sneezy.md) and pinned
`FlyingSpawnerTransformAbility` give its living-master mode `DPS=0`, a five-tile range
and `pet_sneezy_void_attack`. Sneezy now approaches its existing selected building to
that standoff distance without firing damaging attacks or drawing fake void bolts.
This uses the existing building-selection adapter; it does not add a general pet leash
or reconstruct the client's complete target-choice logic.

After its own Hero's automatic ability has had a chance to save the Hero, a real knockout
retires the spawner transform. Sneezy uses its base defense preference, 2.5-tile range,
270–450 DPS, 0.8-second interval and original shockwave projectile. Its `BoostSelf`
`VisualRage` adds 1% damage without movement or attack-speed bonuses. The pinned spell
says **300 seconds**, whereas the wiki says 30 seconds; the source row wins here, as it
does for the source five/2.5-tile ranges instead of the wiki's 5.5/1.5. The boost joins
the independent source ledger and does not leak to allies. Its spent trigger and the
one-use transform retirement remain on the Hero/pet association through Revive and
Recall, following the existing once-per-raid pet controller adapter. Recall alone does
not retire the transform.

Booger was absent from the spawned-unit catalog, so the old summon lookup produced no
unit. It now uses all ten original `characters.Booger` tiers: 1,100–2,000 HP,
105–150 DPS, one-second attacks, 0.9-tile range, two tiles/second and four housing,
with both ground and air targets. It cannot trigger traps or pull a Clan Castle reserve;
it can fight released defenders and reveal Hidden Teslas after arrival. Each Sneezy
counts its own living and already scheduled Boogers toward the source limit of two.

The existing summon adapter uses the source one-second initial delay, 1.5-second
wind-up and ten-second cooldown after that wind-up. Sneezy pauses movement and attacks
while the summon completes, before or after transformation. A full Booger roster holds
its next summon ready; a later vacancy starts a fresh wind-up instead of backdating a
spawn. As with the existing summon adapter, a committed future arrival survives its
creator and lifecycle timers continue while frozen. These timing choices are explicit
adapter behavior, rather than a reconstruction of every client summoning transition.

The `PetBatDefault` skin's `AirSplitPetNoAttack` rows reuse the same fly, idle and
attack2 clips as `AirSplitPet`, at source scale 120 instead of 100. Presentation reuses
those original frames at 1.2x scale and uses the original 45-frame attack2 clip for the
summon, with its own battle-clock origin. Transformation restores base scale and the
ordinary attack clip. Existing reduced-motion behavior remains read-only.

Booger uses the original `PetBatBubbleDefault` geometry, textures and four-state
`AirSplitPetSpawn` animation block. Its eight-direction atlas is reproduced with
`PYTHONPATH=scripts NATIVE_ART_CHROMIUM_PATH=/usr/bin/chromium python3 scripts/native3d/bake_hero_art.py --set booger --check`
(with the baker's Python dependencies installed). Source hashes, clip timing and the
existing approximate character-shader limitations are retained in
[booger-art.json](../reference/full-client/booger-art.json). Its four original Ogg samples
use the shared importer and are warmed, with its atlas, by the carried Sneezy roster.

`tests/native-sneezy.test.ts` covers tiers, source modes, standoff, silent void attacks,
Hero assignments and rescue, ownership, rage expiry, stronger boosts, Recall/Revive,
wind-up, summon limits, replenishment, traps, Tesla birth gating and Castle release.
Real Cannon knockouts in `tests/fixtures/native-sneezy.ts` record the first summon,
Booger arrival and boosted shockwave through portable reverse seeks. Phone/desktop
browser checks verify original clips, mode scale, the Booger body, projectile art,
actual Web Audio birth cues, reduced motion and historical playback. Versions 101 and
earlier retain their prior Sneezy attacks, missing Booger lookup, summon presentation
and absent Sneezy Hero-death boost.

## Version 103 pet summon ownership after Recall

Recall gives the redeployed pet a new local unit ID. Previously, Sneezy's earlier
Boogers still belonged to the old ID, so the new body counted an empty summon family
and could exceed its source two-living-Booger limit. The raid's Hero/pet association
now retains the original summoner ID and uses it for both living and queued children.
This ID is local ownership bookkeeping; it is not a reconstruction of client object IDs.

The existing Recall timing adapter still governs the new body, and replacement summons
use that body's current location. When a pre-Recall Booger falls, the vacancy permits
one replacement in the same family. Living Boogers remain on the battlefield while
their pet is recalled.

`tests/native-sneezy.test.ts` reproduces the extra pending Booger, checks version 102
behavior and replacement after a pre-Recall child falls. Actual deployment/Recall
inputs in `tests/fixtures/pet-summon-recall.ts` keep both children alive against an
unarmed Town Hall, then redeploy their pet. Portable reverse seeks and phone/desktop
browser checks preserve their original bodies, the cap and reduced motion. Versions
102 and earlier retain their former per-body summon ownership.

## Version 104 Frosty Frostmites

The pinned `pets.Frosty` row summons `characters.Icemite`, which was missing from the
spawned-unit mapping. Frosty now releases its original Frostmites: one per wave at
levels 1–4, two at 5–14, and three at 15. The source eight-second schedule and limits
of 4/8/10/12 follow the existing concurrent-summon adapter; the wiki does not distinguish
an alive limit from a lifetime limit. The zero-delay first wave uses the existing
immediate-summon adapter. Pet summon ownership also follows version 103 through Recall.

Frostmites use the source 450 HP, 15 damage, three tiles/second, two-tile range, defense
preference, wall jumping, trap immunity and `DoesNotOpenCC` exclusion. They can fight
released defenders on either layer. Acquiring a new target starts the source 0.5-second
attack delay. The one-use attack spends the creature at launch and hands its body to
the original ballistic `FrostmiteJump`, at four tiles/second. A committed leap retains
its outgoing damage after the caster disappears or a boost expires.

At impact, the 0.8-tile blast hits its primary defender once, damages both defender
layers and nearby buildings, and applies the source four-second, 50% slow to affected
living defenders and structures. Storage damage reduction applies separately to each
structure. Future defenders are excluded at impact time. The existing two-dimensional
splash adapter governs coverage; this does not reconstruct vertical collision volumes.

The original `IceSpirit` movement/idle/attack/death timelines, direction roots and 130%
scale are imported from `sc/chr_frostmite.sc`; the jump and `Frostmite Splat` particle art
were already retained. A carried Frosty now warms its summon body, projectile and two
original audio samples. The source deploy effect uses `frostmite_atk_01.ogg` at 80%; its
jump-death effect uses `frostmite_die_01.ogg` at 70%, both at 0.95–1.05 pitch.

`PYTHONPATH=scripts python3 scripts/import-native-unit-art.py --only frostmite --check`
reproduces the selected unit while preserving the other indexed units. `--download-missing`
can fetch fingerprint-verified source files into the existing client cache. A full import
still reproduces the complete index. Fingerprints may come from the source archive or the
pinned client cache. The shared troop-sound importer verifies the unchanged Ogg bytes.

`tests/native-frostmite.test.ts` checks all wave/cap breakpoints, replenishment, target
delay, one-use ownership, wall crossing, captured boosts, primary-once damage, ground/air
splash, radius, storage reduction, slow expiry, future targets, traps and Castle release.
Real deployments in `tests/fixtures/native-frostmite.ts` cross a standing wall line and
chill a Cannon through portable reverse seeks. Phone/desktop browser checks verify
original body, leap, impact art, actual Web Audio, reduced motion and historical playback.
Versions 103 and earlier retain the missing Frostmite lookup and their original results.

## Version 105 Yetimite and Firemite defender jumps

Yetimites and Firemites previously used repeated direct melee hits against released
defenders. They now retain their source single-use bodies: acquiring a target starts
the 0.5-second delay, then the creature spends itself and launches its original ballistic
projectile at four tiles/second. Both ground and air defenders receive the captured
damage at arrival, even after the caster disappears. The original attack timeline uses
the target acquisition clock before handing the body to the jump projectile.

The blast hits its primary once and splashes both defender layers, including when a
building was the primary target. Coverage uses the existing two-dimensional radius;
future defenders are excluded at impact time. Each building retains its own preferred
target and resource damage modifiers. Source trap immunity remains, and `DoesNotOpenCC`
now also excludes these two summons from pulling Castle reserves.

Firemite retains the existing `FireSpiritBurn` adapter at its captured tier: the first
pulse arrives 0.5 seconds after impact, with 25 total hits at 0.4-second intervals.
This change does not alter the burn's boost or overlap rules. Furnace has four
source tiers although the standalone Firemite source table has five.

All three mite jump families now use the shared 0.01-second simulation floor, so short
leaps retain their source four-tiles/second speed. This floor is an adapter; the source
projectile tables do not specify a minimum duration. Version 104 preserves Frostmite's
former 0.12-second
minimum; Yetimite and Firemite retain their previous repeated melee and Castle-pull
behavior in that version. Older recordings keep their existing rules.

Carried Yetis and Furnaces warm their summons' existing original body, projectile and
audio assets before deployment, using the parent's tier. No new art or sound substitutes
are introduced. `tests/native-mite-jumps.test.ts` covers acquisition delay, one-use
attacks, captured boosts, ground/air splash, primary-once damage, dead and future targets,
burn timing, trap/Castle immunity, building modifiers and historical flight timing.
Real Yeti wound-spawns and Furnace timer-spawns in `tests/fixtures/native-mite-jumps.ts`
fight a defending Queen through portable forward and reverse seeks. Desktop and phone
browser checks verify cold roster warming, original bodies and ballistic art, actual
Web Audio at launch, burn arrival, reduced motion and version 104 playback.

## Version 106 activated defense preference

Native troops previously checked only static building kinds for their Defense preference.
They now include activated Town Hall weapons and armed Builder's Huts, using the existing
source weapon and activation state. Sleeping, unarmed, constructing or upgrading buildings
do not acquire this class. A troop with a named favorite such as Air Defense uses the same
classification for its fallback defense pool. Existing building commitments remain intact.

Defense-first troops also ignore released defenders while an eligible activated building
stands. The shared preference index includes potential Town Hall and Builder's Hut weapons
before they wake, then checks their current eligibility at use time. This preserves the
live behavior without rescanning every building for every attacker.

Preferred-target damage uses the same classification, independently for each building in
an area hit. Projectile damage checks activation at the packet's impact time. A Yetimite's
fourfold defense bonus and 50% resource reduction therefore produce twice its base damage
against an activated Town Hall; a dormant Hall retains only the resource reduction.
Versions 105 and earlier preserve their static native preference and damage results.

`tests/native-activated-preference.test.ts` covers source weapon tiers, sleeping and armed
buildings, upgrades, named-favorite fallback, defender priority, live index activation and
impact timing. An actual Earthquake input wakes a Town Hall in
`tests/fixtures/native-activated-preference.ts`: a newly deployed Super Giant chooses it while
the first Super Giant keeps its committed storage target. Portable forward/reverse seeks and
phone/desktop browser checks verify the original bodies, read-only rendering, reduced
motion and historical version 105 targeting.

## Version 107 Electromite chain lightning

The pinned `characters.Electromite` row names `ElectromiteStunAbility`; its chain and
stun columns were not being read. Electromites now acquire a target for 0.5 seconds,
cast once, and dissipate. The source has no projectile for this attack. Its `Any Building`
preference keeps the initial cast on eligible structures; when none are targetable it
can fight a released defender. Live Electromites retain trap immunity and now honor the
source `DoesNotOpenCC` flag.

Super Yeti also now releases children while alive: its ability declares one per 400
lost HP, capped at 7–14 by tier, but its character row omits `SpawnWhenDamaged`. The
former character-column guard therefore skipped every wound-spawn and left only the
death release. The existing damage-spawn adapter now reads this ability in version 107;
death releases only the remaining children. This uses the pinned 400-HP interval where
the wiki's parent and child pages disagree between 400 and 800. Earlier versions retain
their death-only release.

The cast reaches up to three unvisited targets, with three-tile hops, a 0.128-second
delay and 20% damage loss per hop. Buildings receive the character's fourfold multiplier
once, including resource buildings and Town Halls. The ability repeats this multiplier;
it does not add a second fourfold bonus. Defenders on either layer receive the captured
base damage. Each reached living target receives the source 0.1-second full slow through
the existing stun clocks, preserving a longer stun. Committed hops retain the original
tier and outgoing damage after the caster disappears or a boost expires. Pending hops
keep the last attacker's raid open until they resolve.

The existing local chain adapter selects the nearest eligible target at each hop,
measuring building-edge and defender-point distances. Equal distances prefer buildings,
then lower ids. Walls, traps, dead or hidden targets, visited targets and not-yet-spawned
defenders are excluded. This deterministic ordering and two-dimensional coverage are
adapters; the client tables do not provide its full target selection or vertical geometry.
Late updates process committed hops in time order at their scheduled timestamps.

`scripts/import-electromite-art.py --check` reproduces two original lazy effect packs
from verified client files, checking graph bytes and decoded texture pixels. Together
they add 72,026 bytes: `Zappies Attack` retains both `Zappies_Lightning` variants;
`SuperYetimite Hit` retains `Golem_hit`, `DefenceHit` and `Stone debris`. The shared native
targeted-particle stretch and ground/air lift adapters place these effects between the
captured endpoints; the client attachment code is not in the tables. Original body
timelines remain unchanged, with the pre-cast attack clock dated from target acquisition.

Carried Super Yetis warm the correct-tier Electromite body, both effect packs and the
four existing original sound events before deployment. The recorded cast plays the
original attack sound once; each reached target plays its original hit sound, and the
consumed actor keeps its original death cue. Captured events survive source removal and
remain for the shared ten-second sound seek horizon. Reduced motion suppresses particles
without changing combat.

`tests/native-electromite.test.ts` covers source damage/timing, one-use casts, mixed
ground/air chains, stun, preference, captured boosts, visibility, radius, future targets,
late updates, raid completion and trap/Castle immunity. A Queen naturally wounds a
level-1 or level-8 Super Yeti in `tests/fixtures/native-electromite.ts`; its child chains
through structures and the defender in portable forward/reverse seeks. Asset tests verify
pins, complete pack sizes, deterministic particles and captured sound parameters.
Phone/desktop browser checks verify cold roster warming, original bodies and lightning
meshes, actual Web Audio, reduced motion, read-only rendering and historical playback.
Version 106 and earlier preserve their former direct hits, missing chain/bonus/stun and
Castle-pull behavior.

## Version 108 Meteor Golem defender throws

Meteor Golems previously used the shared ranged defender attack, launching a generic
arrow and remaining unsplit. They now launch their original tier's ballistic projectile
against ground or air defenders, leave one Meteormite behind, and materialize the thrown
half after the packet's direct damage and one-tile splash resolve. A blocking Wall on
the defender route uses the same native building throw, including its fivefold Wall
damage. Each affected structure receives its own modifier; the primary defender is hit
once and splash reaches both defender layers, excluding future defenders at impact time.

Both halves retain half the golem's current health at launch, rounded down to a 1% step
of that tier's Meteormite health. Below one step only the thrown 1-HP half survives.
The landing is bound to the actual packet id and impact timestamp, so a newborn half
cannot attack before the original impact. It starts acting on the following simulation
update. Captured tier and outgoing damage survive the staying half's defeat or removal.

Cloned golems now split too. Both halves retain the parent's clone deadline and cannot
merge. A clone that expires in flight still has its committed impact, but no expired
living half appears at landing. Keeping the parent's deadline is a local clock adapter:
the Clone and Meteor Golem references specify expiration and prohibit cloned merges,
but do not expose a separate split-child timer. Earlier versions retain their unsplit
cloned building attacker and generic defender shots.

The three original projectiles use the source eight-tiles/second speed. Version 108
applies the shared 0.01-second simulation floor and uses the packet's arrival for
building throws too; version 107 retains its 0.12-second floor and independently dated
pending birth. The floor, attack-start timing and fixed launch aim remain adapters;
this change does not reconstruct the client's full wind-up or moving-target tracking.

Carried Meteor Golems warm the matching Meteormite body and samples before deployment.
When an actor changes kind within `chr_split_golem`, the renderer now replaces its
texture namespace rather than reusing the old kind's view, including under reduced
detail. This also corrects the visual handoff in historical building throws without
altering their combat. Original body, projectile, trail and impact art were already
imported and remain unchanged.

The impact sound belongs to `projectiles.DestroyedEffect`, not the character's empty
`HitEffect`. The sound importer now retains `Meteor_Golem_Projectile_Hit` and its three
unchanged Ogg takes, bringing the catalog to 338 files. Captured packets retain the
original golem's tier and timestamps after its id becomes a Meteormite. A ten-second
record supplies one throw cue and one projectile-hit cue through reverse seeks, and
also reconstructs original flight/impact art when seeking directly past the landing.
The live effect log skips these recorded cues to avoid duplicates.

`tests/native-meteor-throws.test.ts` covers all three tiers, ground/air targets, health
rounding, the 1-HP case, captured boosts, primary-once splash, Wall blockers, short-flight
timing, clone expiry, no merge, packet ordering, source effect metadata and retained
sound cues. Actual deployment and Clone Spell inputs in
`tests/fixtures/native-meteor-throws.ts` fight a Queen through portable forward/reverse
seeks. Phone/desktop checks verify cold tier warming, original body namespaces and
ballistic meshes, real throw/impact Web Audio, exact landing, clone deadlines, reduced
motion, read-only rendering and historical version 107 playback.

## Version 109 Electro Dragon charge and mixed-target lightning

Electro Dragons previously hit buildings immediately and used a generic ranged packet
against defenders. The native controller now charges either primary target for 2.875
seconds, then strikes directly and chains through up to five eligible targets across
buildings and ground/air defenders. The pinned character rows supply a 3.5-second attack
period, 625-ms cooldown override, three-tile hops, 0.128-second hop delay and 20% damage
loss per hop. The older captured `LogicAttackerItemData` split-timing adapter interprets
the override as recovery, leaving 2.875 seconds for windup; the current original attack
clip independently places its action at frame 69 of 24 fps, the same 2.875 seconds.
The simulation resolves the first hit on its next 20-Hz update and retains the full
3.5-second period without accumulating that update's rounding error.

Charge and recovery use active action time: native Freeze/stun pauses them, and chill,
shrink and poison retain their existing attack-clock scaling. The original attack pose
samples that same clock. Dead or concealed primary targets cancel the charge; an alerted
defender interrupts a building charge through the existing retaliation selector. A
committed defender that moves out of range is chased while the charge completes, matching
the existing garrison commitment adapter. This does not reconstruct the client's full
retargeting code. The existing Electro Dragon death-lightning ability is unchanged.

Each hop selects the nearest unvisited eligible target. Equal distances prefer highest
maximum health, as described by the pinned Electro Dragon reference, then use stable
building/id ordering. The shared two-dimensional adapter measures building-edge and
defender-point distance; walls, traps, hidden/dead/future targets and visited targets are
excluded. A surviving previous target supplies its current position at the next hop;
otherwise the captured endpoint remains. Committed hops retain outgoing damage and tier
after the caster disappears and keep the last attacker's raid open until resolution.
Electromite reuses this selector without the maximum-health tie rule, preserving version
107's ordering. Version 108 and earlier retain their former Electro Dragon combat.

`scripts/import-electro-dragon-art.py --check` verifies pinned source files, graph bytes
and decoded texture pixels. Two lazy packs add 280,941 bytes for `Electro Dragon Attack`
and `Mega Tesla Hit`. The 227,161-byte original `Electro Dragon Attack Chain` pack is
reused. Sound-only `Electro Dragon Pre Attack` adds no texture pack. Original targeted
particles follow the living caster or previous target, using the original `attack_pivot`
attachment when available. Shared endpoint stretching and fixed ground/air lifts remain
presentation adapters because the client placement code is not in the tables. Each pack's
actual particle duration controls retention, and reduced motion suppresses particles.

The importer adds the original pre-attack sample, bringing the catalog to 339 files.
Charge audio uses active, unscaled audio time with the original pitch; Freeze omits its
cue and resumes from the held offset, while cancellation and firing stop it. Captured
zaps retain one primary attack cue, one chain cue per secondary target and a hit cue per
target through the ten-second seek horizon. Original volume and pitch ranges apply.
Carried dragons warm the body, all three effect packs and samples before deployment,
including when entering battle with an already warmed home army.

Unit tests cover both end tiers, charge/recovery clocks, interruptions, mixed chains,
maximum-health ties, visibility, moving origins, captured damage, clone expiration and
pending-attack completion. Actual deployed dragons in
`tests/fixtures/native-electro-dragon.ts` supply portable forward/reverse replay checks.
Asset tests verify pins, pack sizes, deterministic particles, attachment placement,
independent effect lifetimes and retained sound parameters. Phone/desktop browser checks
exercise original lightning, actual charge/attack/chain/hit Web Audio, cold battle warming,
read-only rendering, reduced motion and historical version 108 playback.

## Version 110 Super Wizard Chain Magic

Super Wizard's `ChainAttackDepth` is one, so the former hop-only controller never
scheduled a secondary hit. Version 110 reads `ChainAttackFactor` as ten total targets:
one primary and up to nine branches from that primary. The pinned Super Wizard dossier
(revision 624748) confirms this topology and the source character supplies a three-tile
radius, 128-ms delay and 60% damage reduction. Every secondary receives 40% of captured
primary damage once; secondary hits do not become new origins or accumulate reduction.
Building and defender primaries use this same direct native attack instead of a generic
arrow against defenders. A blocking Wall may be primary, but Walls and traps cannot be
secondary targets. Both defender layers are eligible.

The existing attack-start timing and two-second period remain adapters. This correction
does not yet drive the attacker from the source clip's action frame or `PreAttackEffect`.
Branches resolve together at one source delay, selecting the nearest unvisited eligible
targets from the primary's current position if it survives, otherwise its captured point.
Building-edge/defender-point distances, stable building/id tie ordering and selection at
resolution time are explicit local adapters; the tables do not expose the full client
selector. Dead, hidden and future targets are excluded. Captured tier and outgoing damage
survive caster removal, and pending branches keep a final clone's raid open until they
resolve. Version 109 and earlier retain their former primary-only and generic-shot combat.

`scripts/import-super-wizard-art.py --check` reproduces three exact source effect packs,
523,646 bytes in total, checking graph hashes and decoded pixels. These are `Super Wizard
Attack`, `Super Wizard Attack Chain` and `Super Wizard Hit`; existing `ps_chr_` variants
have different offsets, layers or gun-bone flags and are not substituted. Native targeted
particles follow the surviving caster/primary and use the original `attack_pivot` when
available, with the shared endpoint-stretch and lift adapters. Original effect lifetimes
control sampling; reduced motion suppresses particles without changing combat. The shared
pure effect-event builder also preserves version 109 Electro Dragon presentation and
avoids allocating a duration map per frame.

Captured strikes retain one primary attack sound, one chain sound per secondary and one
hit sound per reached target through the ten-second seek horizon. All Ogg files already
ship; the catalog stays at 339 samples and now includes 354 effects. Carried Super Wizards
warm all three packs and actor samples before deployment even with the same home roster.

Unit tests cover both end tiers, the nine-branch cap, constant secondary damage, mixed
layers, primary-only radius, moving origins, captured boosts, exclusions, Wall primaries,
clone expiry and historical behavior. Real deployment fixtures set the base Wizard's
research too, preserving the derived Super Troop tier through portable forward/reverse
seeks. Asset tests verify source pins, pack sizes, deterministic particles, attachments,
independent lifetimes and captured sound parameters. Phone/desktop browser checks cover
original primary/branch art, actual attack/chain/hit Web Audio, identical-roster warming,
read-only rendering, reduced motion and historical version 109 playback.

## Version 111 Super Archer piercing flight

Super Archer previously launched a normal packet at a building, then damaged the entire
penetrating line at that packet's arrival. Defender primaries used a generic arrow and
never pierced. Version 111 captures one original `magic_archer_projectile` for either
primary type and advances it at the source 14 tiles/second. It strikes each crossed
building or ground/air defender once, then continues beyond the aim point. Captured tier,
damage and line survive the caster's defeat, Recall or clone expiry; a final attacker's
arrow keeps the raid open until its flight ends. Version 110 and earlier retain their
former packet and instant-line behavior.

The pinned character specifies radius 0.3 tiles and four tiles of extra travel beyond
the captured aim point. Its target-acquisition range is six tiles, measured at building
edges by the existing selector; the aim point is the building center. This differs from
the pinned wiki's stated 12-tile projectile range, so the implementation does not claim
to reconstruct that reach. Attack-start timing remains the existing adapter. The source
`DontTrackTarget` flag fixes the direction at launch: a moving primary can leave the line
while an enemy farther along still receives the arrow.

Collision uses explicit `distance2D` arithmetic, expanded axis-aligned building footprints
and circular defender bounds. These two-dimensional hitboxes, fixed source flight height,
and current simulation-sample positions are local adapters; client vertical collision and
continuous moving-target geometry are not in the tables. Entry timestamps follow traveled
distance, and crossing events from all arrows resolve together in arrival order, with
stable tie ordering. Future defenders cannot be hit before birth; newly revealed Teslas
cannot be struck before reveal. Point-blank shots use a deterministic fallback direction
and still hit an overlapping primary once. Unlimited piercing applies no damage decay.

Invisibility blocks acquisition but does not protect collateral from indirect damage,
as the pinned Invisibility Spell reference specifies. Overgrowth absorbs crossings without
damage through the existing immunity rules. Buried Teslas, traps, dead enemies and allies
are excluded. Walls can receive collateral damage. A moving enemy's position is sampled
at the current 20-Hz update; an arrow cannot retroactively hit a target behind its previous
front after that target appears or moves into the line.

Original projectile and trail art already ship. The renderer now samples the complete
straight flight through `nativePiercingFlight`, retaining source `StartOffset` 25 and
`StartHeight` 30 through the existing projection adapter. Captured records reconstruct
flight/trail art after direct seeks and keep ten seconds of audio history. Two new lazy
packs retain exact `IceArcher_attack` and `IceArcher Hit` particles, totaling 26,754 bytes;
`scripts/import-super-archer-art.py --check` verifies graph bytes and decoded pixels. The
legacy Ice Archer effect names do not add frost gameplay. The hit effect is silent, and
no impact audio is invented. Each captured launch plays the original firing sample once,
including after source removal and replay seeks. Carried archers warm the arrow, both
packs and existing samples before deployment, including with an identical home roster.

Unit tests cover end tiers, progressive timestamps, full reach, primary-once collisions,
both layers, moving misses, captured boosts, visibility, immunity, birth timing, radius,
allies, negative axes, point-blank shots, inter-arrow arrival order, clone expiry and old
combat. Actual deployment fixtures retain the base Archer research needed to derive the
Super Troop tier. Portable recordings and browser checks compare Node-generated battle
states with Chromium after the arrow passes its aim point, then repeat reverse seeks.
Phone/desktop checks also verify original body/arrow meshes, actual firing Web Audio,
read-only rendering, reduced motion and historical version 110 playback.

## Version 112 Overgrowth chain absorption and consistent geometry

The pinned Overgrowth dossier specifies that rooted buildings still absorb chain-lightning
hops without taking damage. The shared native selector previously excluded them as
untargetable. Version 112 allows a present, living overgrown building to receive a
secondary Electromite, Electro Dragon or Super Wizard hit. It consumes its normal hop or
branch slot; the existing damage immunity prevents health loss, and subsequent chain
hops retain their normal damage decay. Original captured lightning, hit particles and
sound still mark the absorbed hit. Rooted buildings do not become primary targets:
acquisition stays unchanged, and Overgrowth still cancels a charging dragon's primary.
Walls, traps, dead buildings and buried Teslas remain outside secondary chain eligibility.

Chain distance and committed Electro Dragon chase calculations now use the existing
`distance2D` arithmetic with an explicit square-root operation order. Browser `Math.hypot`
implementations can differ in their final bits; a captured diagonal movement witness
shows the one-bit position difference. The version gate preserves the historical
`Math.hypot` path and rooted-target exclusion in version 111 and earlier. This keeps the
existing building-edge/defender-point geometry and tie rules; it does not reconstruct
client vertical hitboxes or continuous moving-target geometry.

`tests/native-chain-overgrowth.test.ts` covers absorption, unchanged rooted health,
continued decay, secondary caps and historical exclusion for all three chain families.
It also verifies primary rejection, charge cancellation, immunity at scheduled timestamps
through a late update, and exact old/new chase coordinates. A real Electro Dragon and
Overgrowth cast in `tests/fixtures/native-chain-overgrowth.ts` place the spell's source
1.5-second fall between the primary hit and first committed hop. Both end tiers retain
all five hits while the four rooted structures keep their health. Portable forward/reverse
checks and Node-generated phone/desktop browser recordings verify those states, original
lightning and actual absorbed-hop Web Audio, read-only rendering, reduced motion and
historical version 111 behavior. Existing Electromite and Super Wizard browser checks
cover the shared selector. No assets or sound files are added.

## Version 113 original Overgrowth roots

Overgrowth now draws the client's original roots around 2×2, 3×3 and 4×4 structures,
replacing the green status footprint once native art is ready. The source provides
separate `entangle_spell_start`, `entangle_spell_deployed` and `entangle_spell_stop`
effects for each footprint. Their original offsets, meshes, particles and textures remain
unchanged. Unsupported footprints, historical recordings and pending/failed downloads
keep the existing status fallback. Reduced motion holds a static deployed root without
playing the growth or retraction animation.

`scripts/import-overgrowth-art.py --check` reproduces three lazy packs, one per footprint,
with graph-byte and decoded-pixel verification against client 18.400.21. Together they
add 1,002,214 bytes. Growth lasts 18 frames at 30 fps (0.6 seconds); deployed clips cycle
for 24, 25 and 24 frames respectively; retraction lasts 23 frames. The raw effects mark
`Looping` false, so an explicit caller-owned sustain adapter repeats the deployed source
clip and emitters until the captured root deadline. This external lifecycle control is
an adapter, not a change to the source rows. Existing particle projection and fade
adapters still apply, including the original size-specific effect offsets.

The new presentation flag captures a root's building, position, footprint, start and end
at the actual spell pulse. An overlapping cast extends the active root without restarting
its growth. A cast landing after expiry starts a new cycle. Ended records remain for the
ten-second sound seek horizon, preserving retraction through direct and reverse seeks.
Version 112 and earlier omit these records and keep their former presentation. Immunity,
targeting and spell duration are unchanged. The root phases use the same deadline tolerance
as immunity; sample playback normalizes tiny negative clock roundoff to zero offset while
keeping genuinely future cues silent.

The original `overgrowth_spell_retract_01.ogg` adds one unchanged sample, bringing the
catalog to 340 files and 357 effects. Each footprint's stop effect retains its own source
record, all naming that sample at 80% volume and 0.8–1 pitch. Captured root keys select
stable cues at expiry through the shared sample player's pause, speed, seek and voice-cap
rules. Carried Overgrowth warms all root packs and existing spell/retraction samples before
casting, including with no deployed actors. Retained roots also request their sounds when
a viewer arrives after the spell's live cast record has ended.

`tests/native-overgrowth.test.ts` covers source pulse timing, all footprints, overlapping
and expired recasts, history retirement and identical physical spell behavior against
version 112. Asset checks cover pins, complete pack sizes, original cycles, sustained
visibility, static reduced-motion poses, exact expiry boundaries and original cue parameters.
Actual level-1 and level-5 casts provide portable forward/reverse recordings through expiry.
Node-to-Chromium phone/desktop checks verify original grow/deployed/retract meshes, long
steady visibility, actual retract Web Audio on the expiry tick, read-only rendering and
historical fallback. Held and failed downloads verify the status-to-native handoff and
reconnection recovery without changing combat.

## Version 114 original Overgrowth cast and field

The same pinned importer now retains a separate cast pack: `Entangle_predeploy`,
`Entangle_area_deploy` and the five `entangle_spell_circle_radius` level variants.
The pack adds 49,601 bytes, bringing all Overgrowth art to 1,051,815 bytes. Original
bottle, grass, landing circle, ground ring and smoke exports keep their source rows,
meshes and textures. Reproduction checks verify graph bytes and decoded source pixels.
The cast pack warms only for version 114 battles carrying Overgrowth or retaining a cast.
The three root packs keep their existing bytes and historical loading behavior.

The bottle begins at cast time and lands after the source `DeployTimeMS` of 800 ms.
Landing grass/circle and the selected level's field start then. The existing combat
adapter still applies roots after deployment, charging and hit delays total 1.5 seconds;
this change does not retime immunity. Source field rings last 22–26 seconds from landing,
with their original two-second fade; smoke lasts up to two seconds longer. Their lifetimes
therefore differ from the physical root deadline. Source particle projection and fade
adapters remain in use. Reduced motion omits moving cast particles and retains the static
root presentation and existing aura fallback.

`nativeOvergrowthCasts` holds the same live cast object through resolution, then retains
its completed timeline until the physical duration plus the ten-second sound horizon.
This also covers casts with no eligible buildings. The existing vial and field samples
reconstruct after direct seeks beyond the live pulse, with their original cue keys,
volume and pitch. Carried spells, retained casts and roots request their audio even
with no deployed actors. The catalog remains at 340 files and 357 effects.

Original art replaces the generic spell ring and aura when ready. Pending or failed
cast downloads keep the fallback; a successful load retires a pending fallback ring at
the current battle time. Shared pack retries recover on reconnect. Historical version
113 retains original roots without the new cast capture or field; physical state is
identical after removing the new presentation fields.

Pure checks cover all five level fields, bottle/landing boundaries, smoke retirement,
read-only deterministic poses, history retention and absence of duplicate sound cues.
Actual level-1 and level-5 portable recordings include bottle, landing, live-pulse removal,
steady roots, expiry and field retirement through forward/reverse seeks. Phone/desktop
Chromium checks verify the original meshes, actual field Web Audio after a direct seek,
reduced motion, historical behavior and loading/failure/reconnect handoff.

## Version 115 original Freeze Spell casts

Freeze now uses the original falling bottle, frost stars, crystals, dot flakes and blue
glow for all eight levels. `scripts/import-freeze-spell-art.py --check` reproduces the
17 effect records, their emitters and original building-scene exports from client
18.400.21, verifying source pins, graph bytes and decoded texture pixels. A single lazy
cast pack adds 376,406 bytes. Source rows, meshes and textures remain unchanged; the
shared native particle projection, fade and timeline adapters apply.

The source bottle lasts 800 ms; both deployment effects begin at that deadline.
Level-specific glow lasts 2.5–6 seconds and the accompanying particles fade according
to their source rows. Combat continues to apply the snapshot Freeze after deployment,
charging and hit delays total 1.5 seconds. Existing building and defender frozen cues,
immunities, durations and targeting remain unchanged. `FreezeOuterTimeMS` remains
uninterpreted; art is not evidence for assigning its undocumented secondary duration.

`nativeFreezeCasts` retains each live cast object through resolution, then through its
physical freeze duration plus the ten-second sound horizon. This also captures casts
without eligible targets. Original `magic_bottle_fall_05.ogg` and `freeze_spell_01.ogg`
samples reconstruct after a direct seek beyond the live pulse, retaining source keys,
volume and pitch. Captured casts bypass the scene's live cast log to avoid duplicates.
Retained casts request their samples even when there are no deployed actors, live spells
or remaining Freeze spells. No sounds or effects are added to the catalog: 340 files
and 357 effects remain.

The original art replaces generic spell rings and auras once loaded. Pending and failed
downloads keep the existing fallback; reconnecting retries the pack and retires the
pending fallback ring at the current battle time. Reduced motion omits moving cast
particles while keeping existing frozen status cues. Version 114 and earlier retain
their former live-only Freeze presentation. A shared pure source-cast sampler also
preserves Overgrowth's version-114 timing, keys and original art.

Pure tests cover all levels, source pins and complete pack size, tolerant landing
deadlines, particle retirement, read-only deterministic rendering and unchanged physical
state against version 114. Actual level-1 and level-8 portable recordings reconstruct
exactly through forward/reverse bottle, landing, freeze and expiry checkpoints. Chromium
phone/desktop checks cover cold post-pulse sample loading, original meshes and Web Audio,
reduced motion, historical replay fallback and held/failed/reconnected art downloads.

## Version 116 original Jump Spell fields

Jump now draws its original bottle, range markers, green glow, rising particles and
light rays for all five levels. `scripts/import-jump-spell-art.py --check` reproduces
11 source effect records and their emitter/export dependencies from client 18.400.21,
verifying source pins, graph bytes and decoded texture pixels. The lazy cast pack adds
172,747 bytes; no source rows, meshes or textures are modified.

The bottle lasts 800 ms and both level-specific deployment effects start then. Native
fields last 20, 40, 60, 80 or 100 seconds, with final emitted particles extending beyond
the live spell's last pulse. These are finite, non-looping source lifetimes. Jump opts
out of the shared effect-duration helper's default 30-second cap; other callers retain
that safeguard for persistent emitters. Shared source projection, particle fade and
timeline adapters still apply, including oversized source fade fields. Physical Jump
still begins at 1.5 seconds and uses its existing pulse, wall-crossing and expiry rules.

`nativeSpellArt` is a versioned list of additional source spell names to present; version
116 enables only Jump. `nativeSpellCastHistory` shares each selected live cast object,
then retains its completed timeline until ten seconds after its last scheduled pulse.
This supports late final particles and portable backward/forward seeks without adding
another per-spell capture array. Original Overgrowth and Freeze histories retain their
prior fields and version gates. The cast sound log skips additionally captured spells,
so original cue keys do not play twice. Retained history also requests samples and art
with no live or remaining Jump spells and no deployed actors.

Original art replaces generic rings and auras after loading. Pending or failed downloads
keep the fallback, then hand off at the same battle time after a successful retry.
Reduced motion keeps the previous stationary fallback instead of moving particles.
Version 115 and earlier omit the new list/history and retain their former presentation.
Existing `magic_bottle_fall_05.ogg` and `bottle_jump_spell_01.ogg` samples retain their
source volume and pitch; the catalog remains at 340 files and 357 effects.

Checks cover all five source levels, long-duration rendering past the generic cap,
final-particle retirement, captured history bounds, overlapping cast keys, unchanged
wall rules against version 115 and original source cue parameters. Actual level-1 and
level-5 portable recordings reconstruct exactly through forward/reverse seeks past
100 seconds. Phone/desktop Chromium checks cover cold late-history loading, original
bottle/field meshes and Web Audio, reduced motion, historical fallback and held/failed/
reconnected downloads. Shared-renderer regressions cover Freeze and Overgrowth.

## Version 117 original Rage and Haste fields

Rage and Haste now use original bottles, range markers, glows, smoke, lines and sparks
for all seven levels of each spell. `scripts/import-field-spell-art.py --check` verifies
source pins, graph bytes and decoded texture pixels against client 18.400.21. New Rage
and Haste packs add 262,068 and 169,017 bytes respectively (431,085 combined). Rage's
upper effect reuses the existing 54,656-byte `rage-deploy-top` pack; the importer also
reproduces that pack read-only against source and verifies its existing pins. Existing
effect lookup order and historical troop-art paths remain unchanged.

Source profiles keep their exact level mappings. Haste levels 5 and 6 share deployment
effects; level 7 uses the next effect, which reuses level-5 emitters at 125% scale.
Rage's field phases are shared across levels. Bottles start at cast time and deployment
art starts after 800 ms. Original finite emission, lifetime, fade, scale and layer rows
remain unchanged under the existing native particle adapters. Finite fields use source
duration bounds, including Haste particles beyond the generic 30-second safety cap.
Physical pulses still start after 1.5 seconds; boosts, movement, damage and expiry keep
their prior rules.

Version 117 extends `nativeSpellArt` to Jump, Rage and Haste. The existing shared cast
history preserves resolving objects and retains them until ten seconds after their
last scheduled pulse. Native cast cues bypass the scene's live log and keep their
original keys once each. Retained history warms art and samples with no live or remaining
spells and no deployed actors. Existing Rage and Haste deployment samples retain source
volume/pitch (Rage 90% at 0.75 pitch; Haste 70% at 0.97 pitch). The catalog remains at
340 files and 357 effects.

A common finite-field presenter serves Jump, Rage and Haste. It warms one representative
effect per unique pack, avoiding repeated phase/level requests and unused spell art.
All phase packs must be ready before source art draws and replaces generic rings/auras.
This matters for Rage's separate reused upper pack: either pack can remain pending or
fail without a partial handoff. Reconnect retries recover at the current battle time
and retire the fallback ring. Completed packs and newly due retry deadlines invalidate
the cached paused battle frame once; recovery needs no simulation tick, camera movement
or forced draw. Reduced motion keeps stationary fallbacks. Earlier recordings retain
their previous capabilities and exact physical state.

Tests cover every source level, reused pack pins/sizes, original source cue parameters,
late Haste particles, bounded/mixed cast history and identical boosts/movement against
version 116 using actual deployed units. Actor-free level-1 and level-7 casts produce
portable recordings with exact forward/reverse checkpoints. Chromium phone/desktop
checks verify cold late-history loading, original meshes and Web Audio, unused-art
laziness, reduced motion and historical behavior. Held/failed/reconnected downloads test
each Rage pack independently and Haste's pack during a genuinely paused replay without
forcing presentation draws. Loader tests cover complete-upload revisions and one-shot
backoff/reconnect invalidation; shared regressions cover Jump, Freeze,
Overgrowth, projectile loading and troop audio.

## Version 118 original Healing and Poison fields

Healing and Poison now use their original bottle and field phases for all 12 levels of
each spell. The shared importer adds a 119,741-byte Healing pack and a 292,020-byte Poison
pack (411,761 bytes combined), preserving earlier Rage/Haste packs and the reused upper
Rage effect unchanged. `scripts/import-field-spell-art.py --check` verifies source pins,
graph bytes and decoded texture pixels for both new and existing packs.

Profiles retain the source mappings exactly. Healing uses `Heal predeploy`, `Heal area`
and `Heal area top`. Poison's pinned row names `toxic_Predeploy`, `Toxic deploy ground
halloween` and `Toxic deploy halloween`; alternate records are not substituted. Source
rings, light rays, clouds, bubbles and skull particles keep their original finite
lifetimes, scales, layers and fade fields under the existing native adapters. The source
Healing field has 20-second emitter lives from deployment, longer than its 41 physical
pulses at 300 ms spacing. Captured history lets those visuals fade without extending
healing. The separate `Heal spell` pulse graphics remain outside this field-art pass;
existing healing feedback and original pulse audio are preserved.

Version 118 also enables `nativeSpellEffectTimelines` for original spell particles.
A static outer export can contain a long animated child: Poison's cloud wraps 153 frames
at 24 fps inside a one-frame root. Scaling only the root kept that child on its transparent
first frame. The new sampler scales the complete descendant span over particle life,
matching the existing Spell Tower interpretation. Durations and samplers are cached by
graph and scale, with separate legacy and corrected caches. Source clips and rows remain
unchanged, and earlier recordings retain their former sampling path.

Version 118 adds Healing and Poison to the shared `nativeSpellArt` list; no new Battle
history field is needed. Source art starts at 800 ms while physical pulses retain their
1.5-second first-hit delay. Healing amounts, Poison damage/ramp, avoidance, immunities
and expiry remain unchanged. Headhunter's `PoisonOnHitSpell` lookup reads scalar status
values and never creates an ordinary cast, so enabling Poison field art does not spawn
bottles or fields on Headhunter hits.

Cold retained-history views request only the carried/captured spell's packs and samples.
All required phase packs must be ready before replacing generic rings and auras. The
shared loader's revision signal handles reconnect recovery in paused replays without a
forced draw or simulation tick. Reduced motion keeps stationary fallbacks, and version
117 and earlier retain their former capabilities and presentation.

Original sound keys are reconstructed once from captured history. Healing keeps its
bottle/landing sounds and per-pulse `healer_attack_01.ogg` cues (30% volume, 0.8–0.9 pitch).
Poison keeps its `deploy2` landing cue (80% volume, 0.97 pitch). The catalog remains at
340 files and 357 effects; no samples or effects are added.

Checks cover all 24 source level profiles, cast phases, original cue parameters,
read-only rendering and field retirement. Recorded Cannon wounds followed by Freeze and
Healing verify real health recovery and exact physical equivalence with version 117;
actual garrison Poison inputs verify damage and avoidance. Headhunter recordings guard
the separate on-hit status path. Portable source-field recordings reconstruct through
forward/reverse seeks. Phone/desktop Chromium checks cover original meshes and Web Audio,
unused-art loading, cold late-history seeks, reduced motion, historical fallback and
natural paused-replay recovery after held/failed downloads. Existing Rage/Haste, troop
audio and projectile-loading checks cover the shared presentation path.

## Version 119 original Healing pulse graphics

All 12 Healing levels now include the source `Heal spell` pulse effect. The source row
declares `RandomRadius=200` and `RandomRadiusAffectsOnlyGfx=TRUE`: light beams and sparks
scatter within two map tiles while healing still uses its five-tile logical area. The
existing seeded point calculation reconstructs each location from captured cast metadata;
rendering consumes no simulation RNG and needs no per-target history. This is a visual
scatter adapter, independent of which units receive healing.

`heal_ring_effect` emits ten particles over 300 ms with 700–800 ms lives;
`heal_ring_effect2` emits two over 2 ms with 800–1,500 ms lives. The source maximum tail
is 1.502 seconds. Sampling uses resolved hit counts, keeps stable `spell:<id>:hit:<index>`
keys and skips expired pulses before iterating. The retained cast covers the final tail
after pulse 41. Reduced motion omits these moving particles. Version 119 enables this
path through `nativeSpellPulsePresentation`; version 118 keeps its earlier field art.

Both particle exports already exist in the Healing pack. Importing the effect adds
2,526 bytes of records, bringing that pack to 122,267 bytes without adding textures.
Other field packs and the reused Rage upper pack remain byte-identical. The importer
checks pinned source graphs and decoded pixels. Existing Healing pulse audio uses the
same keys, original sample, volume and pitch; drawing the effect adds no audio voices.

Tests cover all 12 level profiles, seeded scatter, exact pulse boundaries, resolved-hit
limits, short tails, reduced motion and read-only sampling. Actual Cannon wounds verify
unchanged health and combat state against version 118 and portable forward/reverse seeks.
Browser checks cover cold history loading, original meshes and Web Audio on phone and
desktop, version-118 field-only playback, and paused recovery after a held/failed pack.

## Version 120 original Clone and Invisibility fields

Clone's nine levels use the source `Clone_Predeploy`, `Clone deploy` and `Clone deploy top`
phases. The original bottle, range ring and dark mist share a 43,494-byte pack.
The pinned `clone_twirl01` export is empty and remains a source placeholder.
The three field emitters live for 20 seconds from the 800 ms deployment phase. Physical
cloning still begins at 1.5 seconds and resolves 60 pulses at 300 ms spacing; capturing
the ended cast lets the source particles finish without extending cloning or copy life.

Invisibility's four levels use `Invisibility_Predeploy` and their own `Invisibility area
lvl1` through `lvl4` effects in a 150,035-byte pack. The source declares no `DeployEffect2`.
The shared profile, sampler and prefetch path now omit absent phases, so a missing upper
phase cannot keep a complete pack in fallback. Original rings, flashes, sparks and light
rays keep their level-specific source lifetimes and finite emission tails. Source
deployment still starts at 800 ms while concealment retains its existing 1.5-second
first hit, 250 ms pulse interval and 600 ms linger. Rendering does not alter targets or
projectiles already in flight.

The shared `nativeSpellArt` capability list enables both spells in version 120. No new
Battle history structure is needed. `Spell Tower Invisibility` remains a separate spell
name and continues through its own presentation. Version 119 retains its earlier list
and Healing pulse capability. Reduced motion uses stationary fallback presentation.
Carried or captured casts warm only their required pack, with atomic fallback handoff
and paused reconnect recovery through the existing loader revision.

Complete new packs total 193,529 bytes, including textures. Existing field packs and the
reused Rage top remain unchanged. The importer verifies pinned source graphs, decoded
pixels and exact file sets. Audio uses existing original cast keys and samples: Clone
deployment is 95% volume at 0.97 pitch; Invisibility is 90% volume at 1.0 pitch. The
catalog remains at 340 files and 357 effects.

Tests sample all 13 level profiles, declared phases, finite tails, original audio and
reduced motion. Actual Giant deployment and Clone inputs verify copy housing and expiry,
and actual Invisibility inputs verify concealment of buildings and defenders with
committed projectiles. Spell Tower inputs guard the separate defensive path. These
recordings reconstruct through portable forward/reverse seeks and match version-119
physical states after removing presentation metadata. Browser cases cover phone and
desktop meshes, original Web Audio, cold retained history and failed-pack recovery.

## Version 121 original Recall cast effects

Recall's seven levels now use `Recall_Predeploy`, `RecallDeployAuraGround` and
`RecallDeployAuraTop` from the pinned client. The 54,956-byte pack contains the original
bottle, ground circle, upper circle and two sparkle variants. Source scene timelines
retain the brief upper circle and shrinking ground ring. Both circle emitters have
2,000 ms lives and 1 ms emission; the source effect scale is 111%, and particle scale
shrinks from 100% to 60%. The top phase also emits 20 sparks over 500 ms with 1,500–3,000
ms lives, giving a maximum 3.5-second tail from deployment.

Original deployment begins at 800 ms. The physical Recall still resolves its one pulse
at 900 ms, so the captured ended cast is required to finish the source particles and
audio after troops return to the deployment bar. Version 121 adds `Recall` to
`nativeSpellArt`; existing history, duration culling and nested timeline sampling handle
the short cast without a new Battle structure. Reduced motion omits moving particles.
Version 120 keeps its earlier capability list and presentation. The distinct per-unit
disappearance and redeployment effects need unit event positions; this cast-phase path
uses the fixed cast center.

The original bottle cue remains 80% volume at 0.95 pitch. The landing sound belongs to
`deploy2`, at 100% volume and 1.0 pitch, with its existing stable cast key. Cold views warm
the pack and samples from retained history even when no live or carried Recall remains.
The audio catalog stays at 340 files and 357 effects, and existing field packs are
unchanged. The importer verifies source pins, graph bytes, decoded pixels and file sets.

Tests cover all seven levels, visible source phases, final sparkle tails, original
audio, read-only sampling and reduced motion. Portable recordings reconstruct through
forward and reverse seeks. Actual Recall and redeployment with Sneezy verify living
summon ownership, and actual Queen arrows verify impacts committed before Recall against
ground and air defenders. These physical states match version 120 after presentation
metadata is removed. Browser cases verify phone/desktop meshes and original Web Audio,
cold ended-cast loading, old playback and paused recovery after a failed pack.

## Version 122 original unit Recall transitions

Primary bodies now play the named source `Recall Disappear`, `RecallRedeployAuraGround`
and `RecallRedeployAuraTop` effects at their actual transition positions. This is an
explicit adapter from the model's existing Recall and redeployment events to those
source records. The 104,436-byte lazy pack remains separate from the 54,956-byte cast
pack, so version 121 does not request the new art. The importer verifies the pinned
effect/emitter records, original graphs, decoded pixels and exact file set.

The disappearance wave uses the source `recall_unit_wave` timeline: 40 frames at 24 fps,
70% effect scale and the Top layer. Redeployment uses the reverse ground/top circles
and 30 sparks with two original variants. Both effect records specify `LifeTimeScale`
111%; the transition presenter maps battle age to source age by dividing by 1.11 and
scales the duration bound accordingly. Raw duration caches and legacy sampling remain
unchanged. The reverse ground effect can last 5.55111 seconds, and the top sparkle tail
can last 6.105 seconds. Imported source limits remain in the records; this adapter uses
the shared renderer rather than reconstructing the client's global effect budget.

Version 122 adds `nativeRecallPresentation` and a short `nativeRecallEvents` journal.
Each entry captures the primary unit ID, phase, time and map position, using stable
`recall:<body-id>:<phase>` keys. A recalled Hero's pet retains the existing owner-driven
removal/redeployment behavior; it does not create another primary return cue. Stored
health, troop counts, Hero state, Phoenix handling and living summon ownership are
unchanged. Events retire after ten seconds, covering every declared source tail.

The source `recall_spell_back_01.ogg` adds one 13,999-byte original sample and one sound
effect. A primary redeployment plays it once at 100% volume and 1.0 pitch. It is warmed
from carried Recall, captured transitions or troops waiting in the bar; the ordinary
Recall cast sound list remains unchanged. The catalog now contains 341 files and 358
effects. Version 121 requests neither this sample nor the transition pack.

Reduced motion omits the moving source effects. Generic spawn feedback covers a pending
or failed pack; a completed upload or reconnect redraws paused history through the
shared art revision. Rendering reads captured events without moving units or consuming
simulation RNG. Cold replay views can show return effects after the original cast
history has already expired.

Tests use actual Cannon wounds, Freeze, Recall and Giant redeployment, including an
11-second wait in the bar. Health restoration, history retirement and exact physical
equivalence with version 121 survive portable forward/reverse seeks. Hero/pet records
guard primary event counts and summon ownership. Browser cases verify phone/desktop
meshes, original Web Audio gain/pitch, cold transition-only history, reduced motion,
version-121 requests and natural paused recovery from a held/failed pack.

## Version 123 direct Hero Revive targeting

Fallen Heroes now show the original `hero_revive_indicator` while a Revive Spell remains
available. Tapping its winged heart casts Revive on that Hero without changing the
previous troop, spell or Hero selection. Selecting Revive also enables an eligible
fallen Hero's deployment-bar button, labelled `Revive Queen`, `Revive King`, and so on.
The button supports Enter, and H targets the first eligible Hero while Revive is
selected; its displayed shortcut follows that Hero. Queued direct casts show `Reviving`
and refuse repeat clicks without spending another spell. A Hero restored by an earlier
cast leaves the busy state immediately, even if a later cast is still queued.

The source emitter `hero_revivable` plays `sc/characters.sc:revivable_hero`: one particle
with a 200-second life, 80% particle scale, 200% effect scale and the original Top-layer
offset. The 52,689-byte lazy pack preserves the original graph and decoded pixels. It
is shown only for an eligible roster body while inventory remains, and disappears on
revival, ejection, Phoenix-pending revival, a queued direct cast, or battle completion.
No new event history is needed: retained Hero bodies already carry their knockout
time and position. Reduced motion freezes a visible source pose at full source opacity.
Hit bounds come from the original graph and use at least 44 screen pixels for touch.
Loading this optional art does not block the deployment-bar control.

Direct controls record a version-123 spell action with `targetHero`. The cast resolves
the chosen roster body and stores its ID as `reviveTargetId`, so Hero copies and two
fallen bodies at the same coordinates cannot steal the target. If the selected body
is no longer eligible, the cast does not switch to another Hero. Ordinary tile casts
retain the existing nearest-target and ID tie ordering. Guide constraints, inventory
consumption and recording use the normal cast path. Cast and health-restoration timing
are unchanged in this control update; the separate targeted projectile remains an
independent source audit.

The replay codec requires a Revive command and a valid recorded Hero for `targetHero`,
rejects it before version 123, and preserves it in portable files. The new
`nativeReviveTargets` capability gates the marker and controls. Earlier recordings
request no marker pack. New recordings show the marker during playback with all
casting controls read-only. No audio catalog entries change.

Tests cover exact selection when bodies overlap, roster identity, queued-click
deduplication, inventory/selection preservation, ejection and Phoenix guards, ordinary
tile ordering and strict portable action validation. Actual Cannon knockout and Freeze
inputs verify direct Queen revival through portable forward/reverse seeks. Source
asset tests check pins, full file sizes, read-only projection, reduced-motion opacity
and hit bounds against every drawn vertex. Browser cases cover Enter, H and real touch,
selection preservation, concurrent casts, older playback and natural paused recovery
from an unavailable marker pack.

## Version 124 original Lightning cast and impact effects

All thirteen source Lightning levels declare `Lightning predeploy`, `Lightning area
small`, `Lightning Spell` charging and `Lightning Spell Hit`. The 491,070-byte lazy pack
retains those effect records, emitter variants, original `sc/buildings.sc` timelines
and decoded textures. The importer now includes optional charging phases and records
whether their source effect is targeted. Existing field packs remain byte-identical;
no sound files or sound catalog entries change.

The bottle begins at the cast time. Deployment winds, range rings and charging start
at 800 ms, independently of the unchanged 900-ms damage/stun pulse. `LightningSky`
emits three additive bolts over one millisecond, each with a 300-ms lifetime, a source
altitude of 4000 and an 80-unit spawn radius. Charging events supply the projected
ground target. An opt-in adapter preserves static emitter origin offsets using the
same visual random slots as ordinary particles; legacy targeted callers retain their
former origins. The shared targeted renderer stretches the full bolt to the ground
while source scaling changes its width and its timeline advances over its lifetime.

The resolved hit uses the captured cast seed and zero graphics-only scatter radius.
Its explosions, debris, grass and smoke retain their source motion and layers. The
crater's 6500-ms lifetime and one-millisecond emission window bound the final source
tail at 7.401 seconds after casting. Existing ten-second history retention covers the
entire sequence after the live cast disappears. Source records retain their instance
limits; the renderer does not reconstruct a client-wide effect budget.

The original fall, bottle break, Tesla zap and impact ambience keep stable predeploy,
deploy, charging and hit sound keys. Rendering consumes no combat RNG and changes no
health, stun deadlines or defending Builder repair behavior. Reduced motion omits the
moving captured effects. Pending/failed art uses the existing ring and bolt feedback;
both are removed together once all phase art is ready, including paused reconnects.
Version 123 and earlier request no Lightning pack and keep their previous sampling.

Tests sample every level, validate distinct projected source origins and the full
sky-to-ground geometry, and exercise exact hit boundaries, crater retirement, original
audio keys and legacy targeted cache stability. Actual spell inputs and Builder repair
retargeting reconstruct through portable forward/reverse seeks with version-123
physical equivalence. Browser cases cover phone/desktop source meshes and Web Audio,
cold history, reduced motion, older asset requests and natural paused recovery after
a held/failed pack.

## Version 125 original Earthquake fields and persistent scars

Earthquake now uses its original bottle, ground/top rings, airborne debris, dust,
stones and cracked ground. The 196,132-byte lazy pack preserves the eight source levels'
effect mappings and their emitter variants, source graphs and decoded pixels. Levels
one through five use their respective ring sizes; levels six through eight inherit
level five's presentation. All prior field packs remain byte-identical.

Both deployment phases begin at 800 ms. The unchanged five physical damage pulses
start at 1.5 seconds and end at 3.1 seconds. The ground phase contains seven crack
particles, one central crack, eight darkening particles and fifty small stones, each
with a 300-second source lifetime. Their source motion, random variants, scale and
layers use the existing sampler. The final stones' 2500-ms emission window establishes
a conservative ground tail of 302.5 seconds after deployment.

The importer derives `retainSeconds` from the finite particle rows, including emitter
delay, emission and maximum lifetime, and checks that this durable field has particle-only
effects with the supported 100% lifetime scale. `fieldSpellHistoryUntil` uses that small
profile metadata to retain the cast until 303.3 seconds after casting. Combat code does
not load mesh graphs. Other source fields preserve their previous last-pulse-plus-ten-
seconds retirement. Only version 125's presentation list captures Earthquake in this
history, so earlier recordings retain their former behavior. Normal battle completion
clears the displayed field; the long source tail grants no additional damage pulses.

The original vial fall and landing sounds keep their existing two cue keys. Cold views
of old scars warm the art from history even when all Earthquake inventory is spent,
without replaying expired sounds. Reduced motion omits the source effects. Failed or
pending art uses the existing ring feedback; natural paused recovery removes that
fallback once the complete source pack is available. Camera-shake columns remain
retained source metadata; this field adapter does not reconstruct the client's camera
motion.

Tests sample every level, check all 66 ground particles beyond the former history and
30-second rendering bounds, verify source-derived tail retirement and preserve original
audio keys. Four real casts verify diminishing building damage and fourth-cast wall
destruction through portable forward/reverse seeks with version-124 physical equivalence.
Browser coverage includes phone/desktop meshes and original Web Audio, cold 45-second
scars, reduced motion, battle completion, old-version asset requests and natural paused
recovery after a held/failed pack.

## Version 126 original Skeleton and Bat spell summon fields

Skeleton and Bat spells now use their original falling bottles, skull rays, rings,
colored glows and summon-area edges at every source level. Their separate lazy packs
contain 53,289 and 53,155 bytes respectively, preserving the declared effect/emitter
records, source graphs and decoded pixels. Both have a predeployment and deployment
phase; missing upper, charging and hit phases are omitted. Existing field packs and
the sound catalog remain unchanged.

Deployment and the first physical release still occur at 800 ms. Skeleton spells
release four initial shielded Skeletons, with the remaining units over the unchanged
8–15-second source spawn duration. Bat spells release two initial Bats, then the rest
over 3–13.8 seconds. The presentation does not change the existing release schedule,
unit count, shield state, level, random positions, targeting or damage.

The source Skeleton field lives 11–18 seconds after deployment, retaining a three-second
visual tail after the final release. Bat fields live 6.2–17 seconds, retaining 3.2 seconds.
The existing source-derived history bound now covers these particle-only fields too,
including the one-millisecond emission window. Skeleton's longest bound is 18.801
seconds after casting; Bat's is 17.801 seconds. Earlier versions do not capture these
spell names, so their histories remain unchanged. A cast's physical pulse deadline
remains 800 ms even while its pending summons keep the live cast active; presentation
retention does not alter that combat rule.

The existing vial fall and per-level landing cues keep their two stable cast keys.
Skeleton's original landing uses 50% volume and 0.95–1.05 pitch; Bat's uses 60% volume
and 1.0 pitch. Late cold views warm the field from captured history after inventory is
spent and the live cast ends. They do not replay expired audio. Reduced motion omits
the moving source fields, and pending/failed packs retain the existing feedback until
all phase art recovers. Rendering remains read-only and consumes no combat RNG.

Tests sample all sixteen spell/level combinations, first-group counts, the final release,
full source tails and retirement. Actual summons reconstruct identical version-125
bodies, shields, positions and combat through portable forward/reverse seeks. Browser
coverage includes phone/desktop source meshes, original Web Audio, cold post-spawn
fields, reduced motion, old-version requests and natural paused recovery from a
held/failed pack.

## Version 127 original Totem and delayed Angry spell effects

Totem and Angry spells now use the original effects declared by all four source levels.
The separate 689,232-byte Totem and 259,331-byte Angry packs retain their source records,
`sc/vfx_spells.sc` graphs and decoded texture pixels. Every referenced export passes the
strict graph importer. Existing spell packs, unit body packs and sound files remain
unchanged.

Totem's vial starts at casting; its ground rocks, smoke, shockwaves and ring begin at
800 ms. The effect uses the original 83% row scale, emitter variants, particle motion
and fades. The longest impact particle bound ends at 1.451 seconds after casting.
The physical 200-ms defense stun still begins at 800 ms. `TotemSummon` remains a separate
600-ms chained cast, creating the existing native Totem body at 1.4 seconds. Its health
drain and defense interactions are unchanged.

The importer checks the chained spell's source levels for the absence of declared
spell effects and records `TotemSummon` under `silentChildren`. The scene maps its
readiness and temporary feedback to the parent Totem presentation, so the original
impact hands over without an extra generic spell ring. Pending/failed art retains the
existing feedback; once the parent pack recovers, primary and chained fallback rings
clear together. Original unit deployment effects keep their existing pipeline. Earlier
recordings lack the parent capability and preserve their former feedback and requests.

Angry deploys its original flash, fresnel, splash and growing central splat at 800 ms.
The source `DeployEffect2Delay` adds 300 ms before the upper phase. Its two long-lived
paint emitters begin at 1.1 seconds, with the second emitter's own 99-ms delay preserved.
Their 200-second particle lifetimes and emission windows give the upper phase a
200.1-second bound, ending at 201.2 seconds after casting. Source-derived retention now
includes per-phase delays. The normal battle end clears the displayed paint.

The upper phase's original sound shares the 1.1-second timestamp. Captured source cues
use the profile delay, while legacy cue reconstruction retains its former 800-ms upper
sound. Keys and sound takes stay stable, avoiding duplicate playback. Every previously
captured spell has zero declared upper-phase delay, preserving its timing. Totem keeps
its 100% volume and 0.9–1.1 landing pitch; Angry's landing and upper sounds use 80%
volume and 1.0 pitch. Late cold views reconstruct art without replaying expired cues.

Angry continues to give friendly troops their existing defense-target preference. Its
fifty 100-ms pulses still run from 1.5 to 6.4 seconds; field lifetime does not extend
those pulses or the granted ability. Rendering remains read-only, consumes no combat
RNG, and omits moving source fields under reduced motion.

Tests cover all eight spell/level combinations, exact upper-phase boundaries, emitter
delays, source-tail retirement and old/new audio clocks. Real Swordsman deployments
verify the Gold Mine-to-Cannon target switch; actual Totem casts verify defense stuns,
chained spawning and health drain against an Air Defense. Portable forward/reverse
seeks preserve version-126 physical state. Browser cases cover phone/desktop meshes,
original Web Audio, chained feedback, cold persistent paint, reduced motion, legacy
requests and natural paused recovery from held/failed packs.

## Version 128 original Ice Block platform and melting sequence

All six Ice Block levels now use their original falling bottle, snowburst, ice clouds,
shards, frosted surface, floating rocks and melting effects. The 1,109,185-byte lazy pack
retains the declared source records, `sc/buildings.sc` and `sc/vfx_spells.sc` graphs,
original decoded pixels, particle variants and layers. Earlier spell packs remain
byte-identical.

Impact begins at 800 ms. The declared 100-ms upper-phase delay starts the platform at
900 ms, with its own 300-ms surface-emitter delay preserved. Source snow, rocks, wind,
sparks and decals use their original finite lifetimes. Captured history reconstructs
the field after the live primary cast disappears.

The declared `EndEffect` starts only after the captured final pulse resolves, at 1.5
seconds. Its own emitter delays remain authoritative: clouds, shards, snow and glow
burst at that event, while the main melt waits another 6300 ms and plays at 7.8 seconds.
This preserves the original sequence without applying a second arbitrary delay to the
entire effect. The end effect's conservative duration is 6.501 seconds; the platform's
longest bound ends at 8.401 seconds after casting. Existing last-pulse-plus-ten-second
history retention covers every tail.

Optional end phases share the existing finite-effect loader and renderer. Unresolved
pulses cannot show their end art, exact boundaries normalize the presentation clock,
and default profiles without an end effect retain their prior sampling. The importer
also verifies that a captured end effect has no unbound source sound. Ice Block's end
record is silent; the existing bottle and complete original impact audio keep their
two stable keys, volume and pitch. No sound catalog entries or files change.

The model still resolves its single pulse at 1.5 seconds and gives the same seven-second
freeze and protection. Shield protection remains 86–96% by source level; visuals do not
change incoming damage, positions, expiry or defense targeting. Reduced motion omits
moving source effects. Pending/failed art keeps existing feedback until the complete
pack recovers, including paused playback.

Tests sample every level, resolved/end boundaries, the delayed melt, finite tails and
original audio. A real Giant under continuing fire from a Cannon outside the spell
area verifies stationary protection, reduced incoming damage and movement after expiry.
Portable forward/reverse seeks preserve version-127 physical state. Browser cases cover
phone/desktop meshes, original Web Audio, cold post-pulse fields, the late melt, reduced
motion, legacy requests and natural paused recovery from a held/failed pack.

## Version 129 original Revive success presentation

All five Revive levels now use the original potion bottle, flash, rays, aura, swirls,
sparkles, wings, ground symbol and startup rings. The 138,941-byte lazy pack preserves
the three declared source effect records, emitter variants, `sc/buildings.sc` graphs
and decoded pixels. These detached effects keep their original Top/Bottom layers,
offsets, scale, finite lifetimes and nested timelines. Existing spell packs and the
separate fallen-Hero indicator pack remain unchanged.

Revive differs from an ordinary area field: its successful target may be up to eight
tiles from the selected tile. The source bottle has a 1500-ms particle lifetime and
remains at the caster-selected position. The presentation adapter binds the two success
phases to the actual restoration result, at the model's unchanged 1.5-second pulse.
Their wings and ground effects stay at that captured point as the revived Hero moves,
matching the source's detached, non-parent-attached records.

A successful `reviveHero` records `revivePresentation` on the captured cast: Hero body
ID, restoration position and scheduled pulse timestamp. Recording this metadata does
not change restored health, target selection, ability state or movement. Direct Hero
commands keep their version-123 identity; ordinary tile commands keep nearest-target
and ID tie ordering. A cast without an eligible target records no successful result.
An earlier restoration also prevents a later queued cast from generating duplicate
success effects.

Source profiles mark this result-bound presentation. Before resolution, sampling plays
only the bottle. After success, the original top and ground phases use the captured
Hero position and time. The activation sound shares that timestamp; its existing key,
100% volume and 1.0 pitch remain stable. Wasted casts retain their bottle sound and
omit activation audio. Legacy version-128 reconstruction keeps its former deployment
clock. No sound files or catalog entries change.

The longest conservative top tail is 2.8 seconds after restoration; the ground tail is
2.6 seconds. Existing history retention covers the entire sequence after the primary
cast ends. Cold replay views can warm the pack from that history after Revive inventory
is spent. Reduced motion omits the moving source effects; failed/pending packs retain
existing feedback until natural paused recovery completes. Rendering remains read-only
and consumes no simulation RNG.

The source also declares a separate `Hero Revive Projectile`. Its flight is an
independent integration; this change preserves the current health-restoration timing
and binds the declared cast/success effects without guessing a new projectile clock.

Tests cover all five levels, distinct cast/target origins, original layers, static
success positions, finite tails, exact metadata and original audio keys. Real Cannon
knockout, Freeze and ordinary/direct Revive inputs reconstruct version-128 physical
state through portable forward/reverse seeks. Wasted and superseded casts cannot emit
success feedback. Browser cases cover phone/desktop source meshes, actual activation
Web Audio, cold spent-inventory history, reduced motion, old-version requests and
natural paused recovery after a held/failed pack.

## Version 130 Warden Fireball

All 27 Fireball equipment levels now launch the original tiered projectile and deal their source
area damage at its fixed 1.5-second impact. The selected point remains fixed, the blast reaches
buildings and ground/air defenders, and launched damage survives Recall or defeat. Original
activation, smoke trails and three explosion tiers reconstruct from a captured launch packet.
The source activation cue replaces ordinary Warden attack/hit sounds for this equipment shot.
Versions 129 and earlier retain their former activation. See [source pins, mechanics and validation](../reference/fireball/README.md).

## Version 131 Queen Giant Arrow

All 18 Giant Arrow levels now launch the original piercing projectile, retaining equipment damage
independently of Rage, a one-tile collision radius and the source Air Defense bonus. Direction
copies the Queen's existing target rather than automatically aiming at an Air Defense. The ray
survives Recall and defeat, contacts each object once, and finishes at the map edge. Original
body and trail sampling remains deterministic through paused playback and portable seeks.
See [source details, validation and the construct interaction limit](../reference/giant-arrow/README.md).

## Version 132 Giant Arrow construct identity

Native Invisibility Spell Towers now recognize a still-flying Giant Arrow as an indestructible
construct when it damages a covered building. Its capture survives the Queen's removal, expires
at the existing ray endpoint and cannot trigger a tower from an immune contact. The tower still
uses its own release clock, so Freeze can outlast the projectile. Actual Recall recordings verify
the original bottle, field, portable seeks and historical cancellation. See the [Giant Arrow reference](../reference/giant-arrow/README.md).

## Version 133 Royal Champion Frost Flake

All 27 Frost Flake item levels now use their mapped source ability levels, with four to seven
distinct targets, 105–294 damage and 5.2–7 seconds of full freeze. Actual Cannon fire stops and
resumes at the source expiry. Projectiles retain their original targets after Recall or defeat
and do not consume Rocket Spears charges. Original activation, flight, trail and audio follow
captured battle time. See [the Frost Flake reference](../reference/frost-flake/README.md).

## Version 134 Barbarian King Spiky Ball

All 27 Spiky Ball item levels use their mapped source ability levels, with two to eight distinct
contacts dealing 1,000–3,250 damage each. The initial leg copies a valid building target; later
legs prefer unvisited buildings and fall back to ground defenders. Damage and later ricochets
survive Recall or defeat. The original ball, shadow, trail, contact bursts and audio reuse existing
assets. See [the Spiky Ball reference](../reference/spiky-ball/README.md).

## Version 135 Minion Prince Dark Orb

All 18 Dark Orb levels capture 45–200 damage and 20–50% frost for 8–18 seconds in the source
five-tile corridor. Its 12.5-tile/second path is bounded by the source 1.25-second maximum. Real
air-defense fire slows without stopping completely, and the path survives Recall or defeat. The
original crystal now retains its opaque source mask through verified mesh clipping. Portal,
contact and impact particles and original activation audio follow battle time. See [the Dark Orb reference](../reference/dark-orb/README.md).

## Version 136 Royal Champion Seeking Shield

All 18 Seeking Shield levels use seven mapped source ability levels, dealing 1,000–2,500 damage
across four distinct contacts. Defense preference, copied targets, ground/air defenders, short
chronological bounces and wasted top-corner throws use captured state. Manual release follows the
fixed source windup; a real knockout releases immediately. Ordinary attacks pause for 1.2 seconds
without spending their cooldown or Rocket Spear charges. Original shield spin continues across legs,
with its shadow, glow trail and final landing particles/audio. See [the Seeking Shield reference](../reference/seeking-shield/README.md).

## Version 137 moving equipment flight history

A real Clan Castle Dragon exposed different trail positions during live rendering and cold seeks:
the live particle cache kept earlier aims, while a cold view rebuilt those births from the latest
endpoint. Frost Flake, Spiky Ball and Seeking Shield now capture optional `nativeAim` observations
for defender-targeted packets at launch and each physical simulation sample. The captured journal
reattaches the updated history after JSON restoration. Other projectiles and stationary building
targets allocate no new arrays.

Presentation samples those observations by time, interpolating between adjacent fixed steps and
clamping outside the recorded interval. Stationary observations are retained, and landing captures
the canonical impact time. Thus adding future observations never changes an already rendered birth.
This preserves the existing homing adapter's initial deadline and endpoint updates; it does not
replace its flight physics. Original art, trail emission and sound timing remain unchanged.

Unit checks compare complete combat state with version 136 after removing the added history,
including real hits, RNG, cooldowns and moving-target restoration for all three controllers.
Portable browser recordings with a real released Dragon reproduce the former discrepancy and now
match dense rendering, sparse rendering, a fresh presentation and backward seeking exactly.
Rendering leaves battle state unchanged. Version 136 and earlier retain endpoint-only behavior.

## Fireball shake and finishing effects

The original Fireball explosion now supplies its source 800 ms live camera impulse. The source
disables it in replays; reduced motion also suppresses it. Live pause preserves the same offset,
zoom scales it with the world, and pointer picking uses the same camera transform. The local
30 Hz displacement adapter follows the existing native-shake convention.

Native projectile bodies, trails and captured impacts use the shared presentation grace after
victory, so the winning Fireball's original explosion can finish. Its camera impulse follows that
presentation clock too, then returns to rest while battle state stays frozen. Cold finished
imports remain settled, and a cancelled airborne packet produces no area-hit shake. This changes
presentation only, with no replay-version bump or new assets. See [source values and validation](../reference/fireball/README.md).

## Version 138 passive auras after Revive and Phoenix

A real Monolith knockout exposed a shared guard bug: Electro Boots, Rage Gem and Life Gem stopped
when their owner died, then stayed off after resurrection because the owner's unit ID was the
same. Successful Revive and Phoenix restoration now reset only the passive-aura deployment guards.
The next upkeep creates exactly one fresh field for each passive aura, anchored to the revival's
canonical time. Superseded casts end before overdue pulses can catch up through the knockout.

The pending clock includes its body ID. If Recall removes that body before upkeep, a later
redeployment starts at its own time. Active abilities remain spent, Rocket Spear charges stay
spent, and naturally exhausted fields do not restart while their owner stays alive. Native aura
radii, pulse intervals, health/damage modifiers and eligibility rules remain unchanged.

Portable Monolith/Revive/Phoenix recordings verify all three items, actual buffs on a newly
introduced Giant, forward/backward snapshots and historical version 137 behavior. Additional
coverage checks simultaneous Revive/Recall pulses, body replacement, charged equipment and stale
fields. Browser checks retain original living Hero art, phone/desktop playback, reduced motion,
Revive touch controls and Recall during Phoenix revival. See [source notes and phase conventions](../reference/hero-aura-revival/README.md).

## Version 139 self-regeneration after Revive and Recall

A real Monolith/Revive case exposed 12 HP of immediate Electro Boots healing inside 100 ms,
despite its level-1 source rate of 6 HP per second. The passive's next-tick guard still pointed
into the knockout. A similar debt accumulated while the Hero waited in Recall, and large living
steps resolved only one overdue pulse before catching up on later frames.

The five regeneration items now use a body-scoped start boundary. Recall redeployment uses the
new body's spawn time; successful Revive and Phoenix restoration retain their canonical time on
that body. Its first regeneration pulse follows one full source interval. While continuously
alive, every due pulse resolves at its own scheduled time. Existing healing eligibility, Phoenix
protection and maximum health apply to each pulse. Suppressed or full-health checks still advance
the clock. Active abilities, equipment damage and other passive state remain unchanged.

Source-rate checks cover the first and last level of Giant Gauntlet, Healer Puppet, Action Figure,
Electro Boots and Fire Heart, with equivalent dense/coarse steps. Real Monolith/Recall recordings
verify no stored healing, the first new tick, complete portable snapshots and historical behavior.
Browser checks cover live-looking original Hero bodies, phone/desktop HP, backward seeks, reduced
motion and existing aura resurrection. See [the regeneration reference](../reference/hero-regeneration/README.md).

## Version 140 Electro Boots passive activation

The Champion's passive aura now retains its source activation, independent of manual ability
input. All 27 item levels share the same original effect across ten mapped ability tiers. Initial
deployment and Recall capture the new body's position. Revive and Phoenix capture the canonical
restoration point before movement; subsequent aura upkeep deduplicates that event. The original
stationary 300 ms burst persists through its owner's movement or removal.

The pinned 100% sound and 200 ms camera impulse use existing playback, pause, replay and reduced
motion rules. The source disables camera shake in replays. Original art and decoded sound each
replace their deployment fallback when ready; missing assets recover during paused playback.
The presentation-only capability preserves version 139 combat and RNG at every item level, with
older replay behavior retained. See [source evidence, interpretation limits and validation](../reference/electro-boots/README.md).

## Version 141 Meteor Staff visibility and fallback

The old periodic selector considered every living static defense, even while hidden, and stopped
casting when only ordinary buildings remained. Meteor Staff now uses the shared targetability
and activated-defense classification, prefers defenses at any distance, and then chooses an
ordinary building. Walls, traps, concealed Teslas, Invisibility and Overgrowth are excluded.
Nearest-target distance uses the established building-footprint adapter and equal distances use
stable identifiers. A single scan avoids sorting the entire layout for this one-target selection.

All 27 equipment levels retain their source cooldowns and spell tiers, 250–850 damage, two-tile
radius and 1.1-second cast-to-damage delay. A cast keeps its original target position; no eligible
building leaves the existing ready cooldown available for a later target. Version 140 playback
keeps the former selector. Real Prince/Invisibility and ordinary-building recordings verify exact
portable seeks, original Hero art, health changes, reduced motion and desktop/phone playback.
See [the source and validation reference](../reference/meteor-staff/README.md).

## Finishing source spell fields and frame cleanup

The shared finite field renderer now uses the presentation grace clock for a finishing spell,
matching the existing finishing-projectile convention. Winning Lightning retains its original
bolt, impact and crater instead of disappearing on the sample that ends combat. New phases
remain bounded by the last actual simulation time, so cancelled spells cannot acquire later
deployment, charging or hit effects. A live battle's two-second grace ends with one full cleanup
frame before frame skipping resumes; otherwise a stale final effect could remain on screen.
Cold finished imports stay settled. No combat, replay schema, art or sound changes are required.
See [the field lifecycle and validation reference](../reference/field-spells/README.md).
