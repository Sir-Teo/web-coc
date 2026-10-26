# Inferno Dragon beam presentation

`beam.json` retains the original client 18.400.21 character, effect and particle rows used by
the three attack stages. `scripts/import-inferno-dragon-beam.py` reads the official bundle
specified in the checked-in full-client manifest and verifies each original CSV's SHA-256
before decoding it. `--check` reproduces the reference without writing it.

The character selects `Inferno Dragon Attack 1`, `2` and `3`. Each effect is a looping,
targeted beam attached to `attack_pivot`. Its `InfernoDragonBeam_1`/`2`/`3` emitter uses the
original `sc/buildings.sc` exports `dbeam_1_light`, `dbeam_2_light` and `dbeam_3_light`.
Those exact exports and their original texels already belong to the
[Inferno source graph](../inferno/README.md); this change introduces no new textures.
The emitters declare a 128 ms fade-in, `TargetedEndZ` 50 and 100% scale.

`nativeSceneLocator` follows the same nested source timeline, named controls and transforms as
the body sampler. The troop presentation caches the locator within the retained pose and
adds the body's world position, altitude and mirror. Native attacking troop facing now uses
the actual defending unit before its building destination, and building centers use their
real footprints. A recorded blocking Wall takes priority where that metadata is available.

The renderer stretches the source beam's authored x extent between the mouth locator and
the target. Width uses the existing local 1.2 art scale; target height uses the existing 0.8
altitude projection. The 128 ms envelope is linear; native easing is not established. The
character's `TargetedEffectOffset` is retained as evidence, while the mouth locator supplies
the origin. Combat stages and beam ownership come from combat version 94 state. This is a
presentation change and does not advance the combat replay version.

Dead, ejected, recalled, frozen, idle, concealed or stale targets stop the beam. Target death
and recovery release its view; another target starts a fresh beam. Culled or still-loading
bodies do not supply a guessed mouth point. Reduced motion keeps a static source beam
timeline while retaining the correct combat stage. Older recordings without the per-target
combat state retain their existing feedback.

Validation covers source-stage selection and geometry, all attack directions and tiers,
timeline controls, locator transforms, facing, stop conditions and read-only battle access.
Native presentation checks cover the retained mouth pose, world movement, caching and
reduced motion. Browser recordings cover buildings and defending Heroes, all damage stages,
retargeting, backward seeking, reduced motion, native meshes and return-home cleanup on
desktop and phone.

The same three attack effects name `sfx/infdragon_fireloop_01.ogg` at 30% volume with fixed
100%, 120% and 140% pitch. That original sample is already imported by the troop sound
library. One sustained cue now owns each active beam stage; its key contains the unit,
target namespace/id, first-hit clock and stage. Generic per-hit attack starts are suppressed
for combat version 94, while older recordings retain them. The shared sample player wraps
seek offsets through the source loop, scales pitch with replay speed and stops it for pause,
mute, lost beam ownership or battle completion. Existing mixer voice caps still apply.
Stage transition bursts remain separate presentation work.
