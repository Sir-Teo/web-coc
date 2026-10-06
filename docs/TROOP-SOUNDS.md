# Troop and spell sounds

Attacking troops play the client's own sounds when they are deployed, when they attack and when they fall. Spells play theirs as the bottle falls, lands and pulses, and a destroyed building plays the client's crash. They replace the generated tones that stood in before; a tone still plays until its sound has been decoded, and vibration follows the same moments either way.

## Source

`python3 scripts/import-native-troop-sounds.py` reads the pinned client's `logic/characters.csv`, `logic/heroes.csv` and `logic/effects.csv`. It covers the 78 trainable and spawned units in `src/game/native-units.ts` (`TROOP_SOURCE` and `SPAWN_SOURCE`) and the heroes (`HERO_UNIT_SOURCE`). For each one it records the `DeployEffect`, the `AttackEffect`, the `HitEffect` (the impact on its target) and the `DieEffect`, and for each effect the rows that name a `Sound`, with their volume, pitch range and delay. The heroes' rows name only a hit, and only four of the six name one with a sound: the Barbarian King, Archer Queen, Grand Warden and Royal Champion. That makes 82 units with sounds.

It also covers the 18 spells this game casts, from `logic/spells.csv`. For each spell it records the `PreDeployEffect` (the bottle falling), the `DeployEffect` and `DeployEffect2` (it landing), the `ChargingEffect` and the `HitEffect` (each pulse). Some of these change with level; Freeze, for example, has one deploy effect per level.

The importer copies the 292 Ogg files (4.2 MB) unchanged to `public/assets/audio/troops-native/` and writes `reference/troop-sounds/sounds.json`. `--check` verifies both against `reference/full-client/manifest.json`.

| Troop     | Deploy                                                     | Attack                                                                                          | Death                                           |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Barbarian | Barbarian Deploy: `barb_deploy_11` and two more takes, 40% | Barbarian Attack: `barbarian_sword_swing_hit_14` and two more takes, 40%, pitch 0.9–1.1         | Barbarian Die: `barbarian_death_01`, `_02`, 50% |
| Archer    | Archer Deploy: `archer_deploy_09` and two more takes, 70%  | Archer Attack                                                                                   | Archer Die                                      |
| Wizard    | Wizard Deploy                                              | One effect per level: `ps_chr_WizardAttack_01` at levels 1–3, then `_Lvl2`, `_Lvl3` and `_Lvl4` | Wizard Die                                      |

Units created by other units, such as Golemites and Lava Pups, have only the effects their rows name. A level row names an effect only when it changes, so the import carries the last one forward; the Wizard's and Valkyrie's attacks change with level.

All of the client's Home Village destroy effects (Building Destroyed, Town Hall Destroyed and the wall levels) use the same sound, `building_destroyed_01` at 80% and pitch 0.85–0.95, so a destroyed building plays Building Destroyed.

## Takes

An effect's rows that name a sound are read as alternative takes, and one plays per event. They are numbered takes of one line, such as `barb_deploy_11`, `barb_deploy_11v2` and `barb_deploy_11v3`; playing all three together would be a chorus. This is an interpretation, because no column of `effects.csv` says how the rows combine. The Clan Castle garrison's sounds, imported earlier, still play every row.

The take and its pitch come from a hash of the event's key: the unit's id and the event, plus the battle time for attacks. So a replay chooses the same take as the battle it records.

## When they play

- **Deploy.** A deployed troop carries no deploy time, so the scene notes the battle time of the first frame that shows each unit. Units already on the field when the sound log starts, or after a seek, are noted silently, so seeking through a replay doesn't fire a burst of deploys. Units that another unit, a spell or an ability summons play no deploy sound.
- **Attack and hit.** The battle does not keep attack times, so the scene logs each troop's combat events against a building or defender as they arrive, live or replayed:
  - a melee blow is the attack and the hit at once;
  - a shot attacks at its launch and hits at its impact;
  - a breath attacks.

  A seek starts the log afresh.

- **Death.** A unit's `defeatedAt`, which every fallen unit carries.
- **Destroyed building.** Logged from its `destroy` event, like attacks.
- **Spells.** The game's own spell casts record when they were cast, their first pulse, the time between pulses and how many have resolved. The fall plays at the cast. The landing and charge play after the row's `DeployTimeMS`, as the client's spell timeline runs. Each resolved pulse plays the hit, so a Lightning Spell's bolts and every Healing Spell pulse sound.
  - A battle drops a cast as soon as it ends, while its last pulse may still be sounding, so the log keeps each cast's timeline until it has played out.
  - Older battles without cast records have their fall and landing logged from the cast event instead.

The cues join the defenses' cues in the shared battle-clock player (`SampleAudio.sync`). So they follow pause, battle speed and replay seeking, and at most four voices of one sample play at once, out of 32 in total.

## Loading

Nothing is fetched at boot. When a battle opens with sound on, the scene fetches the sounds of the army's troops, its spells and the destroyed-building effect. It then fetches each new unit kind's or spell's sounds the first time one appears. A troop's sounds are about 30–60 KB (the Barbarian's eight files are 58 KB). A failed download is requested again the next time a battle needs it.

## Tests

`tests/troop-sounds.test.ts` checks:

- the client rows and the per-level Wizard attack;
- that every shipped file matches its pin;
- that a take is chosen stably, with its pitch in range, and that keys spread over all of the takes;
- deploy and death cues, and their silence after a seek;
- attack and ruin logging;
- each spell's effects and their per-level variants;
- a Lightning Spell's fall, landing, charge and bolt, which keep sounding after the battle drops the cast;
- the logged casts of older battles.

`tests/browser/troop-sounds.spec.ts` runs at phone size. It checks that boot fetches no troop sound and that a Barbarian-only battle fetches only the Barbarian's sounds. It then checks that the deploy, hit and death sounds and a Rage Spell's falling bottle actually start playing.

Not included: the heroes' other sounds and the pets' (the client's hero rows name only hits, so the rest presumably play from their animations), the Siege Machines' special effects, and the movement and ability effects.
