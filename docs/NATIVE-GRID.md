# Village grid and defense footprints

The buildable field is 44×44 tiles. Cannon, Archer Tower and Mortar now occupy 3×3 tiles, matching the existing Air Defense and Wizard Tower geometry. Placement, moving previews, selection anchors, ranges, pathfinding, deployment, obstacle growth and wall-row movement use the expanded grid. The simulation has 48×48 tiles, including a two-tile border on each side; that border is a local choice, not a claim about the native game’s full map dimensions.

## Sources and scope

The Home Village statistics on the community [Cannon](https://clashofclans.fandom.com/wiki/Cannon), [Archer Tower](https://clashofclans.fandom.com/wiki/Archer_Tower) and [Mortar](https://clashofclans.fandom.com/wiki/Mortar) references identify 3×3 footprints. Cannon also has separate Clan Capital statistics; its 2×2 Capital size does not apply here. The 44×44 village expansion is documented in the contemporary [IBTimes report](https://www.ibtimes.com.au/clash-clans-sneak-peek-new-44x44-village-map-extended-attack-times-1487700) and [Clash of Clans Dicas announcement](https://www.clashofclans-dicas.com/2015/11/sneak-peek-6-aumento-area-da-vila-mais-tempo-de-ataque.html). These are secondary references, inspected September 11, 2026.

This pass corrects those three defense footprints. Other catalog dimensions still require an audit, including Army Camps. Full building content, per-level artwork and native scenery composition remain incomplete.

## Existing villages and layouts

Save format 3 distinguishes the expanded grid. Version-1/2 saves are checked under their original 28×28 bounds and 2×2 defense sizes before migration. Overlapping buildings, invalid fields and out-of-bounds input are rejected rather than rearranged into an apparently valid backup.

Unchanged buildings and obstacles retain their coordinates. Expanded defenses are processed by persistent building ID; those whose full footprint is clear stay in place. Conflicts move to the nearest free 3×3 position, ordered by Manhattan distance, then row and column. A densely packed valid legacy map has a deterministic fallback: all original coordinates expand by 1.5× and shift two tiles into the new field. No building, obstacle, resource, level, damaged-health fraction or purchased deadline is discarded. The first boot or import reports any moved buildings once, then persists the consumed notice.

Saved layout slots undergo the same geometric migration, including current buildings added since the layout was saved. A layout already blocked by those additions retains its old slots; the normal restoration check still refuses it. Existing obstacles can also block a restored layout, as before.

The starter Cannon moves from (9,10) to (12,14) to clear the Town Hall. Sixteen authored defense coordinates across the campaign were adjusted to avoid new overlaps. These remain explicit scenario placements, not runtime automatic rearrangement.

## Camera and replays

The original isometric origin and building pixel sizes are retained. Camera pan bounds span the enlarged field with an additional viewing margin, and minimum zoom permits an overview while the initial zoom keeps buildings readable. The subsequent [terrain pass](TERRAIN-CAMERA.md) fits a new 1672×941 backdrop to this larger field at a tighter display scale and adds subtle grass tiles. Full native scenery detail is still incomplete.

Combat version 12 marks the new geometry and pathfinding field. Older snapshots retain their original coordinates and validation bounds. Their result summaries remain available, but they cannot be played using changed combat geometry. Current recordings accept deployments throughout the expanded field.

## Verification

The native-grid model suite covers full-footprint edge collisions, movement and deployment beyond the former boundary, deterministic dense-save migration, paid deadline and damaged-health preservation, saved layouts, malformed overlap rejection and both replay versions. Campaign checks audit every authored layout and viable attack compositions. Browser cases use actual phone shop placement at (43,43), reload persistence, a version-2 village’s one-time relocation notice, and invalid file import without replacing the current village. See [QA.md](QA.md) for completed run counts and remaining visual limits.
