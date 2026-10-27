# Electro Boots original passive activation

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [effect index](effects.json) records every consumed source fingerprint; the parent
[manifest](../full-client/manifest.json) pins the source files and original Ogg.

All ten levels of `Electro Boots Aura`, mapped from 27 equipment levels, name
`Ability_Electro_Boots` as their activation effect. This passive does not consume manual ability
input. The effect uses one `Deploy` particle, independent of its parent, with no orientation,
attachment or destruction when the parent dies. Its emitter has a 1 ms emission interval,
300 ms lifetime, scale 1 to 120, a final 100 ms particle fade and no velocity. The original
`sc/buildings.sc` export is a static one-frame clip, so no nested animation override is needed.
The 2,231-byte graph and unchanged source texture total 5,209 bytes under
`public/assets/electro-boots-native/activation/`.

The same effect names `sfx/ability_electro_boots.ogg`, volume 100%, fixed pitch 100% and zero sound
delay. The sound importer copies that original sample unchanged and verifies its SHA-256.
The raw camera row is strength 20 for 200 ms with `CameraShakeInReplay=FALSE`; presentation uses
the established local 0.32 world-pixel mapping, deterministic 30 Hz knots and smooth decay.
Reduced motion disables the moving art and impulse. Replays retain art and sound but no impulse.

Version 140 captures the initial passive activation and each new Recall deployment. Successful
Revive and Phoenix restoration resume the passive aura under version 138 rules and retain an
activation at that canonical restoration point before movement. Aura upkeep deduplicates the
same event rather than overwriting its origin. The exact original client's resurrection
activation behavior is not independently verified; replaying the activation when restarting its
passive follows this implementation's aura lifecycle. Death, movement or a same-sample Recall
cannot move or prematurely cancel an already captured stationary effect. Manual ability input
and ordinary passive upkeep create no further activation.

The history is deterministic and portable. Rendering and sound sample it without mutating combat
or consuming RNG. Version 139 and earlier retain their previous presentation. Original art and
decoded audio replace generated deployment sparks and tones independently, with existing missing
asset retries and paused recovery. Recall keeps its separate original return effects as well.

`scripts/import-electro-boots-art.py --check` verifies the complete source graph and index;
`scripts/import-native-troop-sounds.py --check` verifies the original sound catalog and bytes.
Unit coverage checks source rows, fingerprints, all 27 levels against version 139 combat,
stationary origin, canonical Revive/Phoenix events, real Recall, portable backward seeks, cue
volume/pitch and camera bounds. Browser coverage checks original art on desktop and phone,
resurrection and Recall, historical playback, reduced motion, real sample gain, deployment
fallback, paused asset recovery and camera picking.
