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
| Minion Prince  | `Minion Prince`  | Hero Hall 1 | 95        |
| Grand Warden   | `Grand Warden`   | Hero Hall 4 | 85        |
| Royal Champion | `Royal Champion` | Hero Hall 6 | 55        |
| Dragon Duke    | `Dragon Duke`    | Hero Hall 8 | 25        |

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
  `special_abilities.csv` and handed to the shared troop rules, so a hero freezes or chains exactly
  as a troop with those columns would.

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
checks desktop/mobile rendering and missing asset requests.
