# Royal Champion Seeking Shield

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [equipment comparison](../official-wiki/heroes-pets/seeking-shield.md) checks all 18 item levels,
which map to seven `RoyalChampionShieldBounce` ability levels.

Version 136 captures four distinct contacts at 1,000–2,500 damage each. Defenses take priority;
a valid copied target within that preference group can keep its selection. Remaining slots use
visible ordinary buildings and both ground and air defenders. Walls, traps, buried Teslas,
hidden objects, repairers and future births are excluded. Later contacts select unvisited objects
within the source 70-tile bounce distance, using the existing footprint distance and stable IDs.

The client specifies `PreActivationDelayTime=933`, `DeactivateAfterTime=1200` and
`DisableAttacking=TRUE`. Manual activation therefore releases after a fixed 933 ms and pauses
ordinary attacks for 1.2 seconds without consuming their cooldown. Animation slowing does not
extend those clocks. The pinned wiki describes immediate normal throwing without animation tying;
this implementation follows the explicit client timing. Knockout-triggered activation releases
immediately, following the wiki's explicit automatic-activation exception. A portable recording
uses real Monolith fire to verify that path without a manual ability input.

Pending throws retain the caster's last observed position and survive Recall or defeat before
release. Flights capture their damage and visited identities independently of Rocket Spear charges
and ordinary attack modifiers. A selected target that dies or becomes immune spends its slot;
the next leg starts at the retained landing point. With fewer eligible targets the shield ends
early. With none, it still flies toward the map's top corner `(0, 0)` and deals no damage.

The existing native homing adapter uses launch distance divided by 20 tiles/second, with a 10 ms
minimum. Moving defenders update the selected endpoint without extending the initial arrival
deadline. Captured records explicitly retain those coordinates after JSON snapshots break object
aliases. Version 136 stores the last endpoint; version 137 additionally captures fixed-step
defender aims for consistent original trail births across live rendering and cold seeks. The
existing flight physics and initial arrival deadline remain unchanged. New short legs
join the physical arrival queue within the same 50 ms sample and launch at the previous scheduled
impact. Pending releases and unfinished physical flights keep the battle alive.

The original `AmazonQueen_shield` pack supplies the 16-frame `shield_projectile` timeline at
24 fps, a ground shadow, scale 120%, launch height 50 and ballistic height 100. Spin keeps its
original launch clock across bounces. Later legs start on the previous ground or air landing plane.
The standard native ballistic presentation interprets these rows; `TrajectoryStyle=3` and
`StopToTargetTime=15` have no separate motion adapter. Original `shield_trail_glow` is grouped in
the existing Javelin trail-glow pack. No new image assets are required.

The projectile declares `DestroyedEffect=trollBoulder_destroyed` and no `BounceEffect`.
Continuing legs therefore produce no invented intermediate burst or sound; the final, early-ended
or wasted leg uses the original destroyed root. Its source sample is `sfx/rock_troll_explo_01.ogg`
at 40% volume and 98–102% pitch, emitted once at the scheduled landing. The importer adds the
unchanged original Ogg file and effect root: 97 troop profiles, 18 spell profiles, 364 effects and
347 sound files (4.94 MiB). Ordinary Champion hit audio is suppressed for shield packets. The
ability declares no dedicated activation effect, so existing readable activation feedback remains.

The full-client importers own the reused graphs and original texture pages. Source checks use:

```sh
PYTHONPATH=scripts python scripts/import-native-projectile-art.py --check
PYTHONPATH=scripts python scripts/import-native-effect-art.py --check
python scripts/import-native-troop-sounds.py --check
```

Unit coverage includes every item level, independent damage-tier goldens, targeting and visibility,
short chronological contacts, both defender layers, immune/dead targets, manual timing, real
knockout activation, ordinary attack resumption, Recall, defeat, wasted throws and moving-target
snapshot restoration. Browser checks cover desktop/phone original bodies and trails, continuous
spin across bounces, full Node battle-state equality, backward seeks, reduced motion, paused asset
recovery, historical playback and actual Web Audio gain/pitch.

See [version 137 moving-target history](../../docs/NATIVE-HEROES.md#version-137-moving-equipment-flight-history)
for dense/sparse rendering and real Clan Castle Dragon replay checks. Building-targeted legs
carry no additional history arrays.
