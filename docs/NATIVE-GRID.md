# Village grid and building footprints

The field has 44×44 buildable tiles. Cannon, Archer Tower, Mortar, Air Defense and Wizard Tower occupy 3×3 tiles. Army Camp and Hero Hall occupy 4×4. Placement, moving previews, selection anchors, ranges, pathfinding, deployment, obstacle growth and wall-row movement use these footprints. The simulation has 48×48 tiles, including a two-tile border on each side; that border is a local choice, not a claim about the native game's full map dimensions.

## Sources and scope

The Home Village statistics on the community [Cannon](https://clashofclans.fandom.com/wiki/Cannon), [Archer Tower](https://clashofclans.fandom.com/wiki/Archer_Tower) and [Mortar](https://clashofclans.fandom.com/wiki/Mortar) references identify 3×3 footprints. Cannon also has separate Clan Capital statistics; its 2×2 Capital size does not apply here. The 44×44 village expansion is documented in the contemporary [IBTimes report](https://www.ibtimes.com.au/clash-clans-sneak-peek-new-44x44-village-map-extended-attack-times-1487700) and [Clash of Clans Dicas announcement](https://www.clashofclans-dicas.com/2015/11/sneak-peek-6-aumento-area-da-vila-mais-tempo-de-ataque.html).

Supercell's official [December 2019 patch notes](https://supercell.com/en/games/clashofclans/blog/news/december-update-patch-notes/) document the Home Village Army Camp reduction to 4×4 and Laboratory reduction to 3×3. The current [Home Village Army Camp reference](https://clashofclans.fandom.com/wiki/Army_Camp/Home_Village) corroborates 4×4. Builder Base camp dimensions on combined reference pages do not apply. The [Hero Hall reference](https://clashofclans.fandom.com/wiki/Hero_Hall) identifies 4×4. Sources were inspected September 11, 2026. Barracks, Laboratory and Spell Factory remain 3×3; the supported catalog's remaining resources and utility structures still need a complete source audit.

Camp and Hall sprite widths increase proportionately from 133/140 to 177/187 world pixels. Camp gathering routes anchor to the actual footprint center. These are corrections to the existing presentation, not new native per-level art. Full building content, prices, capacity, per-level artwork and native scenery composition remain incomplete.

## Existing villages and layouts

Save format 4 distinguishes the army-building footprint correction. Geometry is versioned explicitly:

| Save format | Simulation field | Cannon / Archer Tower / Mortar | Camp / Hero Hall |
| --- | --- | --- | --- |
| 1–2 | 28×28 | 2×2 | 3×3 |
| 3 | 48×48 | 3×3 | 3×3 |
| 4 | 48×48 | 3×3 | 4×4 |

Old fields, bounds and non-overlap are validated before relocation. Migration operates on a clone, leaving the original input intact. Unchanged buildings and obstacles retain their coordinates where possible. Expanded buildings are processed by persistent ID; those whose full footprint is clear stay in place. Conflicts move to the nearest free position, ordered by Manhattan distance, then row and column.

A densely packed valid format-1/2 map has a guaranteed fallback: all original coordinates expand by 1.5× and shift two tiles into the new field. This accommodates both 2→3 defenses and 3→4 camps/halls. If a fragmented format-3 map has no free 4×4 site, a deterministic fallback packs all buildings and obstacles into the buildable field, largest footprints first. The fallback is a bounded greedy packing algorithm, not a general packing solver. Every resulting arrangement is checked before acceptance.

An old custom import can contain more 3×3 camps than physically fit as 4×4. If relocation and packing fail, the original save stays untouched. Startup offers downloads of both stored copies rather than starting a fresh village or silently loading an older usable copy over newer progress. A newer usable copy still wins over an older unplaceable one. Corrupt copies also remain downloadable when neither store contains a usable village. Import failure leaves the active village intact.

No accepted migration discards buildings, obstacles, resources, levels, damaged health or purchased deadlines. The first boot or import reports the count of moved buildings once and persists the consumed notice. Saved slots matching the old active village reuse the migrated result exactly; other valid layouts are checked and migrated around the current obstacles. Already blocked layouts retain their slots and the normal restoration check explains the conflict.

The original defense expansion moved the starter Cannon from (9,10) to (12,14) and adjusted sixteen authored campaign defense positions. The army pass moves the Ironclad Valley spring trap from (6,13) to (6,16), The Last Stronghold Builder's Hut from (5,7) to (5,8), and Ancient Citadel camp from (11,2) to (12,2). These clear the larger camps while preserving playable approaches. Campaign placements remain explicit, without runtime automatic rearrangement.

## Camera and replays

The original isometric origin is retained. Camera bounds span the enlarged field with an additional viewing margin; minimum zoom permits an overview while initial zoom keeps buildings readable. The [terrain pass](TERRAIN-CAMERA.md) fits a 1672×941 backdrop to the larger field and adds subtle grass tiles. Full native scenery detail is still incomplete.

Combat version 13 marks the 4×4 Camp/Hall geometry and campaign changes. Version 12 expanded the map and defense footprints. Older snapshots retain their coordinates and geometry-specific validation bounds. Their summaries remain available, but they cannot be played using changed combat rules. Current recordings accept deployments throughout the expanded field.

## Verification

Model suites cover full-footprint edge collisions, pathfinding and deployment, deterministic dense migration, paid deadlines, damaged health, hero progress, saved layouts, malformed overlap rejection, both stores' recovery behavior and all three replay geometry eras. Campaign checks audit every authored layout and viable attack compositions. Real phone shop tests place Camps and Hero Halls at (42,42), verify blocked (43,42), preview centers and scaled artwork, and reload the sixteen-tile footprint. Browser cases also cover format-2 and format-3 migration notices, import, paid progress and recovery downloads. See [QA.md](QA.md) for completed runs and visual limits.
