# Minion Prince Dark Orb

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [equipment comparison](../official-wiki/heroes-pets/dark-orb.md) checks all 18 item levels,
which map to seven `MinionAttackAbility` levels.

Version 135 captures 45–200 damage, a five-tile corridor radius, 20–50% frost and an 8–18 second
slow duration. The orb copies the Prince's current wall, defender or building heading. Without
an assigned target, it uses the nearest visible preferred defense, then ordinary targets; with
none it follows the actor's initial southeast heading. This is the local interpretation of the
source copy-target flag and defense preference; the pinned wiki notes an aiming ambiguity.

`vfx_projectile_DarkOrb` travels at 12.5 tiles/second with `DontTrackTarget=TRUE` and
`MaxTravelTime=1250` ms. That lifetime caps its 120-tile extra range at 15.625 tiles, shortened
at the 48-tile map boundary. The original crystal's 30 frames at 24 fps also span 1.25 seconds.
Its 65-unit launch offset remains visual and does not move the physical corridor origin.
Source height 65 adds to the existing airborne actor lift; older piercing flights keep their height.

The corridor shares the Super Archer/Giant Arrow collision adapter: expanded building footprints
and defender circles, with each object contacted once. All three enabled piercing families
resolve together in arrival order. Both defender layers and walls can be hit; repairers and
future births are excluded. Invisible collateral still takes damage. Overgrowth blocks both
damage and frost. Contact times and positions are captured for status expiry and original art.

Frost uses the existing partial-slow statuses, rather than full Freeze or a defense stop clock.
It slows real Air Defense fire while allowing attacks to continue. The latest damaging frost
contact follows the existing building/defender frost replacement convention. Damage and frost
are captured independently of ordinary attack bonuses; Noble Iron charges are neither borrowed
nor consumed. A launched orb survives Recall or defeat and holds the battle open until its path ends.
Version 134 and earlier retain their former activation without this corridor or frost.

The original portal and final impact reuse the full-client effect packs. The new contact pack
is 23,858 bytes. The crystal needs a separate 255,494-byte source pack because the full-client
catalog correctly lists its masked export as unsupported. This dedicated adapter verifies a
single convex geometric mask, a fully opaque constant texel across its bilinear footprint,
continuous root placements and compatible subclip cycles. It clips source triangles and
interpolates their original UVs, preserving matrices, colors, blend groups and cropped source
texels without rasterizing the animation. Other unsupported masks keep the strict capture guard.

`verify-dark-orb-mask.py` independently renders the original unclipped source content and then
applies the source mask. All 30 compiled frames match that reference with exact RGBA equality.
The general source-graph and static-portrait tests also remain green.

`ps_chr_DarkOrb_ProjectileSfx` is sound-only. Its unchanged `Ability_DarkOrb_Attack.ogg` adds one
original file, bringing the troop/spell catalog to 346 files (4.93 MiB). Activation uses source
volume 80% and pitch 90–100%. Ready original portal art and audio replace the generic ability
sparks and tone independently. The portal, final impact and contact particles preserve animated
descendants, source offsets and captured battle time; contact art survives the Prince leaving.
Reduced motion preserves combat and suppresses these moving/transient source effects.

Rebuild or verify with the existing native-art Python environment:

```sh
PYTHONPATH=scripts python scripts/import-dark-orb-art.py --check
python scripts/import-native-troop-sounds.py --check
PYTHONPATH=scripts python scripts/verify-dark-orb-mask.py
PYTHONPATH=scripts python -m unittest native_art.test_opaque_mask native_art.test_static_scene native_art.test_scene_graph
```

The importers verify the fingerprint, source pins, decoded pixels, complete owned file sets,
graph checksums and original Ogg bytes. Unit tests cover all item levels, independent tier
boundaries, captured frost, both defender layers, radius/lifetime boundaries, actual defense
slowing, mixed arrivals, immunity, Noble Iron, Recall, defeat and portable seeks. Art tests
cover every crystal frame, airborne height, source contacts and activation handoff. Browser
checks cover desktop/phone portal, crystal, contact and final-impact art, full Node battle-state
equality, backward seeks, Recall, reduced motion, paused pack recovery and actual Web Audio.
