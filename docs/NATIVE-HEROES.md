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
