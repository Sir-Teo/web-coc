# Royal Champion Frost Flake

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The client item is `Frost Charm`; its display name is Frost Flake.
The [equipment comparison](../official-wiki/heroes-pets/frost-flake.md) checks the 27 item levels,
which map to ten `FrostBlast` ability levels.

Version 133 captures one activation and launches a separate projectile at each selected target.
The ability prioritizes visible defenses, including activated weapons, then ordinary buildings
and defending ground/air troops. It uses the existing footprint-distance rule and stable IDs.
Walls and repairers are excluded. Four flakes launch at item levels 1–8, five at 9–17, six at
18–26 and seven at 27. With fewer valid objects, only those objects receive a packet. A wasted
activation still retains its source art, sound and spent ability.

Each packet captures 105–294 damage and 5.2–7 seconds of full freeze. Arrival follows the existing
native homing adapter: launch distance divided by the source 15-tile/second speed, retaining its
selected target's position without redirecting to a replacement. Short flights use a 10 ms floor.
The activation survives Recall or defeat; damage and duration do not reload from the caster.
Moving-target records retain their latest flight/impact point even after a snapshot has broken
object aliases. Rage and Rocket Spears do not alter this damage or spend spear charges.

`FrostOnHitPercent=100` uses the full freeze statuses and defense stop clock, rather than partial
frost's minimum action rate. Expiry is measured from scheduled impact, not the later simulation
sample. An already longer freeze is preserved. Overgrowth blocks both damage and freeze; a dead
target receives neither. Frozen defenses resume their existing attack clock after expiry.

The original half-second activation is stationary and independent of its parent. It uses a new
65,161-byte source pack; the projectile body and two-variant snowflake/spark trail reuse the
full-client catalogs. The body's one-frame outer clip has a twelve-frame child, which now fits
the projectile's source-scaled flight timeline. Earlier projectile clocks retain their behavior.
Ready original art replaces generic activation sparks while preserving the readable ability label.

The four original Ogg files add the activation sample and three alternative impact takes.
Activation uses volume 100% and pitch 100%; impact uses volume 50% and pitch 90–110%, selected
deterministically by packet key. The generic activation tone and ordinary Champion hit sample
do not double these cues when ready. Audio follows the existing native sample lifecycle.

Rebuild and verify with the existing native-art Python environment:

```sh
PYTHONPATH=scripts python scripts/import-frost-flake-art.py --check
python scripts/import-native-troop-sounds.py --check
```

The art importer verifies the fingerprint, source graphs, decoded pixels and complete file set.
The sound importer verifies the pinned bytes of every Ogg file. Unit tests cover all 27 item
levels, independent tier boundaries, real Cannon freeze/thaw, both defender layers, moving
targets, immunity, Recall, defeat, spear charges, original geometry/audio and portable seeks.
Browser checks cover all four target counts on desktop/phone, Node battle-state equality,
reduced motion, Recall, paused asset recovery, historical playback and actual Web Audio gain.
