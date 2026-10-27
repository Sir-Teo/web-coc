# Barbarian King Spiky Ball

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [equipment comparison](../official-wiki/heroes-pets/spiky-ball.md) checks all 27 item levels,
which map to ten `FootballBounce` ability levels.

Version 134 captures one activation and launches its source `BarbarianKingGearFootball`.
The initial shot copies a valid current building target, otherwise the nearest visible building.
Later shots select the nearest unvisited building from the last landing point, within the source
70-tile bounce distance. Remaining ground defenders are eligible only after those buildings.
Walls, traps, buried Teslas, hidden targets, repairers, future births and air defenders are excluded.
Selection follows the existing footprint-distance convention and stable IDs.

The ball hits two to eight distinct objects for 1,000–3,250 damage each. Each launch captures the
damage, remaining bounces and visited object identities. Rage Vial and ordinary attack modifiers
do not alter that damage or add splash. A selected target that dies or becomes immune after
launch still spends its slot, and the next leg starts at its retained landing point. With fewer
eligible objects the ball ends early. An activation with none still spends the ability.

Flights use the existing native homing adapter: launch distance divided by 15 tiles/second,
with a 10 ms minimum. A moving defender updates the selected endpoint without extending the
initial arrival deadline. Captured records explicitly retain the last flight/impact coordinates
after JSON snapshots break object aliases. This stores the final endpoint, rather than a full
moving-target trajectory. Damage and later bounces survive the King's Recall or defeat.

New legs enter the existing physical projectile queue in arrival order, including multiple short
contacts inside one 50 ms simulation sample. Each leg starts at its predecessor's scheduled
impact, independently of the later sample time. Earlier replay versions retain their previous
projectile queue behavior and version 133 retains its former Spiky Ball activation.

The original ball, shadow, white trail and seven-emitter impact reuse full-client packs, with
no new image files. The ball has a 22-frame timeline at 30 fps, source scale 120%, launch height
50 and ballistic height 100. The standard native ballistic presentation interprets these rows;
the source's `TrajectoryStyle=3` and `StopToTargetTime=15` have no separate motion adapter.
The trail's source emitter is grouped into the existing Thrower projectile-trail pack.

`BounceEffect` and `DestroyedEffect` both name `Air Defense Barrel Hit`. Continuing legs use
the next launch's original bounce burst; only the final leg uses the destroyed burst, avoiding
a doubled effect at the same contact. The same source root supplies `cannon_fire3.ogg` at
80% volume and 95–105% pitch. One deterministic cue plays per contact, including the final hit.
The file was already shipped, so the catalog remains at 345 Ogg files. Ordinary King hit audio
does not double these equipment contacts. `FootballBounce` declares no dedicated activation
effect; the existing readable ability feedback remains.

The full-client art importers own the reused graphs and their original texture pages. The sound
importer now includes the declared contact root and checks the unchanged audio bytes:

```sh
PYTHONPATH=scripts python scripts/import-native-projectile-art.py --check
PYTHONPATH=scripts python scripts/import-native-effect-art.py --check
python scripts/import-native-troop-sounds.py --check
```

Unit tests cover every item level, independent tier boundaries, real direct damage, source
speed, copied targets, visibility, ground/air eligibility, short chronological ricochets,
dead/immune targets, Rage Vial, moving-target snapshot restoration, Recall, defeat and portable
seeks. Art tests check the original ball timeline, shadow and effect references. Browser checks
cover desktop/phone bodies, trails, a single source bounce burst, full Node battle-state equality,
Recall, backward seeks, reduced motion, paused pack recovery, historical playback and actual
Web Audio gain/pitch.
