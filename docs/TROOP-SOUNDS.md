# Troop and spell sounds

Inferno Dragon's combat version 94 beam uses one sustained source fire loop per active stage,
at 30% volume and 1.0/1.2/1.4 pitch. Per-hit attack starts are suppressed for that beam.
Pause, seek, replay speed, retargeting and mute use the shared sample player's loop lifecycle.
See the [pinned beam and sound reference](../reference/inferno-dragon/README.md).

Sound preloading uses the battle's carried army and Hero/pet roster, including fixed armies
and portable replays, so the viewing village's home army cannot delay the recording's first
attack or pet deployment samples.

Attacking troops and pets play the client's own sounds when they are deployed, when they attack and when they fall. Spells play theirs as the bottle falls, lands and pulses, and a destroyed building plays the client's crash. They replace the generated tones that stood in before; a tone still plays until its sound has been decoded, and vibration follows the same moments either way.

## Source

`python3 scripts/import-native-troop-sounds.py` reads the pinned client's `logic/characters.csv`, `logic/heroes.csv`, `logic/pets.csv`, `logic/projectiles.csv` and `logic/effects.csv`. It covers the 80 trainable/spawned units, heroes and thirteen pet actors (including Phoenix Egg) in `src/game/native-units.ts` (`TROOP_SOURCE`, `SPAWN_SOURCE`, `HERO_UNIT_SOURCE`, `PET_UNIT_SOURCE`). For each one it records the `DeployEffect`, the `AttackEffect`, the `HitEffect` (the impact on its target) and the `DieEffect`, and for each effect the rows that name a `Sound`, with their volume, pitch range and delay. The heroes' rows name only a hit, and only four of the six name one with a sound: the Barbarian King, Archer Queen, Grand Warden and Royal Champion. That makes 97 unit actors with sounds.

It also covers the 18 spells this game casts, from `logic/spells.csv`. For each spell it records the `PreDeployEffect` (the bottle falling), the `DeployEffect` and `DeployEffect2` (it landing), the `ChargingEffect` and the `HitEffect` (each pulse). Some of these change with level; Freeze, for example, has one deploy effect per level.

The importer copies 340 Ogg files (4.85 MiB) unchanged to `public/assets/audio/troops-native/` and writes `reference/troop-sounds/sounds.json`. `--check` verifies both against `reference/full-client/manifest.json`. An already shipped sample can supply a missing local source only when its SHA-256 matches that same source pin. Edited outputs cannot supply trusted source bytes; corrupt authoritative cache entries still fail validation.

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
- **Attack and hit.** Most attacks use the scene's log of combat events against buildings or defenders, live or replayed. Captured Electromite/Electro Dragon/Super Wizard arcs and Meteor Golem packets keep their own timelines:
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

Nothing is fetched at boot. When a battle opens with sound on, the scene fetches the sounds of the army's troops, its carried Heroes/pets, spells and the destroyed-building effect. It then fetches each new unit kind's or spell's sounds the first time one appears. A troop's sounds are about 30–60 KB (the Barbarian's eight files are 58 KB). A failed download is requested again the next time a battle needs it.

## Pet and friendly healing cues

Pet deploy/attack/hit/death effects now come from their own `pets.csv` rows. Phoenix's waiting
bird remains silent until its controller resets `spawnedAt` at hatch. Removing the Egg is
not a casualty and produces no false death sound; its row names only a death effect.
Native healing effects identify their healing weapon, so friendly casts and impacts reach
the same sound logger as attacks. Unicorn plays its original `clash_pet_horse_heal_01.ogg`
cast at 80% volume and 0.95–1.05 pitch, plus its source hit effect. Phoenix's hatch uses
`pet_phoenix_deploy_01.ogg` at 90% and fixed pitch 1. These use the existing local simulation
event times; this presentation change does not change combat or advance the replay version.

The shared sample player supplies pause, mute, speed, seek offsets and voice caps. Browser
checks verify cold carried-pet loading with no actors deployed, actual Unicorn healing and
Phoenix hatch nodes, pause/resume, speed, mute and cleanup. Unit checks cover all pet actors,
source sample parameters, lifetimes, silent waiting Phoenix and the healing effect path.
`tests/test_native_troop_sound_import.py` checks verified offline reuse, altered outputs,
corrupt cache entries and unpinned paths.

Booger adds its four unchanged source deploy/attack/hit/death samples. A carried Sneezy
warms these before deployment in combat version 102, alongside the pet's own samples.
Browser checks verify the Booger deploy cue reaches Web Audio at its recorded birth time.

Frostmite adds its original deploy and jump-death samples. A carried Frosty warms the
samples before deployment in combat version 104; the jump cue is dated at its single-use
attack launch. Its original ballistic projectile and splat replace the spent creature.

Version 105 also warms existing Yetimite and Firemite samples from carried Yetis and
Furnaces before deployment. Their single-use defender jumps play the original death cue
at launch, when the ballistic projectile replaces the creature. Desktop and phone checks
verify those cues reach actual Web Audio nodes through portable replay seeks.

Version 107 warms Electromite's four existing source events from a carried Super Yeti.
A committed chain records the original attack sound once and the original hit sound at
each reached target's scheduled time. Those cues retain the captured tier and survive
the one-use caster's disappearance, alongside its existing death cue. The ten-second
record horizon matches shared sound seeking; desktop and phone checks exercise actual
attack and hit Web Audio nodes after portable replay seeks.

Version 108 adds the three original `Meteor_Golem_Projectile_Hit` takes, named by the
Meteor Golem projectile's `DestroyedEffect`. Character `HitEffect` is empty, so these
use a separate `projectileHit` event. Carried golems warm both body families and their
samples. Captured throw packets preserve the original actor's tier and scheduled times
through its split, death and replay seeks; each cast and impact plays once. The importer
also pins `logic/projectiles.csv`, and the complete 338-file catalog reproduces unchanged
Ogg bytes. Phone/desktop checks exercise actual throw and impact Web Audio nodes.

Version 109 adds `electro_dragon_sfx_atk_01.ogg` for `Electro Dragon Pre Attack`,
bringing the catalog to 339 unchanged files. Charge audio is a source one-shot, at 50%
volume and fixed pitch, stopped on cancellation/firing and held across native Freeze.
Its offset follows active audio time independently of attack slowdown. Captured strikes
retain the primary attack, secondary chain and per-target hit cues through caster death
and reverse seeks. Primary attack uses the original 90% volume and 0.95–1.05 pitch;
chain uses 40% and 0.9–1; hit uses 20% and 0.5–0.7. Carried dragons warm all samples
before deployment. Phone/desktop checks exercise all four events in actual Web Audio.

Version 110 retains Super Wizard's original `ChainAttackEffect`, using the already shipped
`tesla_zap_01.ogg` at 40% volume and 0.9–1 pitch. Each captured secondary plays one chain
and one hit cue; the primary plays its original attack and hit. The sample count remains
339 while the effect catalog reaches 354. Captured tiers and timestamps survive caster
removal and reverse seeks, and identical-roster battle warming loads every sample before
deployment. Phone/desktop checks exercise actual primary and branch Web Audio nodes.

Version 111 captures Super Archer launches for its full piercing flight. One original
`ice_archer_fire_01.ogg` cue plays at launch, with source volume 50% and pitch 0.9–1,
through caster removal and replay seeks. Its character hit effect is silent; crossing
targets add particles without inventing an impact sound. The existing 339-file catalog
is unchanged. Node-generated phone/desktop replay checks exercise the actual firing node.

Version 113 adds the unchanged `overgrowth_spell_retract_01.ogg` sample, bringing the
catalog to 340 files (4.85 MiB) and 357 effects. The original 2×2, 3×3 and 4×4 root stop
records all use that sample at 80% volume and pitch 0.8–1. Captured root deadlines schedule
one deterministic cue per structure, retaining ten seconds of expired history for reverse
seeks. Overlapping casts extend the same deadline; later root cycles receive new keys.
Carried Overgrowth and retained roots warm the sample before it is needed. The shared
player normalizes sub-nanosecond clock roundoff at a cue boundary; future cues remain
silent. Browser checks exercise actual retraction nodes at the expiry tick.

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

Not included: the heroes' other sounds (the client's hero rows name only hits, so the rest presumably play from their animations), Siege Machine special effects, movement sounds and ability-specific effects beyond the imported ordinary event rows.
