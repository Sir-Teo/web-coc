# Grand Warden Fireball

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [equipment comparison](../official-wiki/heroes-pets/fireball.md) records the target preference,
27 damage/radius levels and the wiki's fallback behavior. The client projectile's explicit
`FixedTravelTime=1500` takes precedence over its `Speed=1200`.

Version 130 launches the selected equipment level's original projectile at the nearest visible
defense, including activated native weapons. If none is available, it chooses the nearest visible
ordinary building or defender; without a target it lands at its launch point. Target selection
uses the existing footprint-distance convention, then stable object IDs. Walls are splash targets.
The source `DontTrackTarget=TRUE` keeps the selected point fixed throughout the 1.5-second flight.

At impact, captured equipment damage reaches buildings and both defender layers within the source
radius: four tiles at levels 1–8, five at 9–23 and six at 24–27. Ordinary attack boosts and equipment
hit modifiers do not alter it. Traps are excluded; Overgrowth retains damage immunity and
Invisibility retains only its targeting protection. A launched Fireball survives its owner's
Recall or defeat, and cannot redirect itself when the target disappears.

`effects.json` retains the original activation and explosion references at every equipment level.
The shared pack contains the activation flash and three explosion tiers, including smoke,
expanding rings, glows, sparks and embers. Existing full-client packs supply the original flame
body, source burst, smoke trail and destroyed effect. Rendering uses the immutable launch journal
and battle time, so paused playback, cold portable imports and backward seeks reconstruct the
same art. Reduced motion keeps stationary fallback feedback and unchanged combat.

The original `FireballActivationEffect` uses `mage_attack_02.ogg` at volume 120% and pitch 70–80%.
It reuses the already shipped file. The explosion and projectile source/destroyed rows declare
no sound; the new path does not substitute the Warden's ordinary hit sound.

Rebuild and verify with the existing native-art Python environment:

```sh
PYTHONPATH=scripts python scripts/import-fireball-art.py --check
python scripts/import-native-troop-sounds.py --check
```

Omit `--check` to regenerate. The art importer verifies the original fingerprint, source graph,
decoded pixels, complete owned file set, graph checksum and byte count. The sound importer checks
its manifest pins and unchanged Ogg bytes. Unit tests cover all levels, targeting, area boundaries,
immunity, Recall, source audio and portable seeks. Browser tests cover all three tiers on desktop
and phone, reduced motion, delayed-pack recovery while paused and version-129 playback.
