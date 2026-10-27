# Snake Bracelet progress through Recall

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [archived Snake Bracelet dossier](../official-wiki/heroes-pets/snake-bracelet.md), revision
**621017**, specifies one Snake per 300 damage received and a per-battle summon limit.
`BarbarianKingSpawnOnTakeDamage.ActiveAfterTakingDamage=300` and ten `MaxActivations` tiers
agree with these limits across all 27 equipment levels.

| Item level from | Maximum summons | Snake level |
| --------------- | --------------- | ----------- |
| 1               | 11              | 1           |
| 3               | 14              | 2           |
| 6               | 17              | 3           |
| 9               | 20              | 4           |
| 12              | 24              | 5           |
| 15              | 32              | 6           |
| 18              | 40              | 7           |
| 21              | 46              | 8           |
| 24              | 50              | 9           |
| 27              | 54              | 10          |

Previously Recall replaced the King's body without retaining its accumulated incoming damage.
This lost a partial threshold and reset the existing summon ledger on the first returning
upkeep. For example, 256 Cannon damage before Recall plus 128 after redeployment produced no
Snake; a King that had already summoned his maximum could summon more after returning.

Version 144 retains the damage total on the recalled Hero and restores it on the new body
before passive upkeep. The existing summon ledger therefore remains monotonic and capped.
Only a King carrying Snake Bracelet captures this state; holding the card cannot generate
damage or summons. The total measures actual HP removed through the shared damage rules,
including shields and temporary HP, and healing does not erase earlier damage. The transient
Recall field is consumed on deployment. Versions 143 and earlier keep their original reset.

Source Snake stats, summon timing, placement, RNG and art are unchanged. `BarbKingEquipSpawn`
declares `UnitsToSpawn=1` and `SpawnFirstGroupSize=2`; the existing resolver limits the first
group to the total, retaining one Snake per trigger. This change does not reinterpret the
source's first-group ambiguity or `DeactivateAfterMasterDies` behavior through resurrection.
The saved cumulative total is a local Recall adapter, not a reconstruction of client internals.

Regression checks cover partial thresholds, two consecutive Recalls, all 27 source caps,
shield/temporary-HP damage and historical reset behavior. Actual Cannon/Recall recordings at
item levels 1 and 27 retain 256 damage and summon a level-1/level-10 Snake after the next
128-damage hit. Complete portable forward/backward snapshots match in Node and Chromium.
Desktop/phone checks inspect the original King and Snake meshes, historical playback,
read-only redraws and reduced motion. Normal combat without Recall remains exactly equal to
version 143 after removing the capability flag.
