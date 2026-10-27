# Meteor Staff target selection

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [archived Meteor Staff dossier](../official-wiki/heroes-pets/meteor-staff.md), revision
**624746**, specifies a periodic meteor at the nearest defense regardless of distance, then
the nearest building when no defense remains. It explicitly excludes targets under
Invisibility or Overgrowth. The [client manifest](../full-client/manifest.json) pins the source
tables; `character_items.Meteor Staff` maps 27 equipment levels to ten `MPMeteorStaff` ability
tiers, whose `CastSpellTarget` is `Defense` and `CastSpell` is `MPMeteorStaffSpell`.

| Item level from | Cooldown | Damage |
| --------------- | -------- | ------ |
| 1               | 10 s     | 250    |
| 3               | 9.5 s    | 300    |
| 6               | 9 s      | 350    |
| 9               | 8.5 s    | 400    |
| 12              | 8 s      | 450    |
| 15              | 7.5 s    | 500    |
| 18              | 7 s      | 575    |
| 21              | 6.5 s    | 650    |
| 24              | 6 s      | 750    |
| 27              | 5 s      | 850    |

Every spell tier retains radius 200 hundredths of a tile, one hit, deployment 800 ms,
charging 300 ms and hit delay zero. Area damage reaches both ground and air defenders. The
original target position stays fixed once a meteor is committed. The existing ready cooldown
is consumed only by a successful cast; this correction does not reinterpret cooldown phase
across Recall or resurrection.

Previously, the selector accepted every living static defense without checking visibility and
had no ordinary-building fallback. Version 141 checks the shared building targetability rules,
including unrevealed Teslas, Invisibility and Overgrowth. Walls and traps cannot be selected.
The shared activated-weapon classification includes a live Town Hall or Builder weapon in the
defense preference. Eligible defenses take priority at any range; ordinary buildings supply
fallback. Defending units are not a fallback target for this spell.

Nearest distance uses the established two-dimensional building-footprint adapter, with stable
building IDs breaking exact ties. The full client selector is not exposed by the source tables;
footprint distance and tie ordering remain local conventions. One scan selects the target
without allocating or sorting a target list. Version 140 and earlier retain their prior rules.

Coverage checks all 27 item levels against the cooldown/damage table, cast and impact boundaries,
visibility, unrevealed Tesla exclusion, ordinary fallback, retry after no eligible target,
activated-defense preference and exact normal-combat equality with version 140. Portable Prince
recordings use actual Invisibility inputs, with the building already hidden before selection,
and inspect complete forward/backward snapshots. Browser checks cover desktop and phone,
historical selectors, health changes, original Hero bodies and read-only reduced-motion redraws.
