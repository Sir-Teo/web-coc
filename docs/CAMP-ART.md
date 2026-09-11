# Army Camp artwork, levels 1–8

Eight original sprites replace the two tent-and-wall atlas tiers. The references were the [Home Village camp gallery and progression table](https://www.gibiarena.com/en/clash-of-clans/upgrades/army-camp), inspected September 11, 2026. The sequence now reads as an open fire pit, an empty cooking spit, a carrot, a small roast, a larger roast, a reinforced stone rim, dark standing rocks and volcanic rocks. Levels 7–8 serve accepted older saves; normal TH8 progression stops at level 6.

These are original generated interpretations of the native silhouettes, not pixel-identical native assets. No downloaded game artwork is shipped. The native reference images remain under the ignored `output/references/camps/` directory.

## Reproducible assets

The built-in `image_gen` tool generated each level separately. Four early transparency drafts were rejected because they baked a checkerboard into RGB pixels. Flat magenta edits of the first two camps provided clean import mattes; levels 3–8 used those originals as style references alongside the corresponding native silhouette. Level 6 returned genuine source alpha; the remaining accepted sources use a generated magenta matte.

Accepted PNGs and the complete exact prompt set, selected generation filenames, source URLs and method are saved in `art/source/camp-levels-v1/`. `provenance.json` includes the initial and rejected extraction prompts as well as the final accepted prompts. `node scripts/camp-assets.mjs` extracts the matte where present, retains opaque foreground materials and soft edges, trims, fits inside 350×350 and aligns the lower edge at y=366 inside 384×384 transparent frames. The eight lossless WebPs are in `public/assets/buildings/camp-levels-v1/`.

`--check` rebuilds and byte-compares every output and runs in CI. Normal asset builds include this importer. No image service is needed at build or runtime. Earlier camp atlas assets remain as original source-derived artifacts; selectors no longer use them for camps.

## Placement and gathering

`src/game/camp-art.ts` supplies one texture per level and measured ground origins. A cooking spit extends beyond the fire pit on one side, so its canvas center is not its ground center. Village sprites and moving previews share these origins and explicit display sizes; completed level changes keep the same model position. Generic level scaling and gold tint do not modify the new artwork. Shop, contextual and Info images use the same selected level. The placement footprint remains 4×4 at every level.

The small fire pit occupies the center of an open gathering area. Home troop routes now treat its central 2×2 tiles as occupied and allow the outer camp tiles. Other buildings, walls, constructing camps, trees and rocks block their full areas. Adding or removing an obstacle rebuilds routes without losing actor identities. Routes remain made of adjacent clear tile centers, with bounded offsets; moving camps, army edits, reduced motion and battle transitions retain their existing behavior. This presentation geometry does not change battle pathfinding or camp collision rules.

The stone rim grows at level 6, and the standing-rock camps use a larger display frame. Their destroyed state and ground shadow use the corresponding size. Standing-rock levels use stone debris; the cooking-support levels use wood debris. Upgrade and health bars use the camp’s actual sprite origin. Fire remains part of the static sprite; dedicated flame animation and closer native shape/material matching remain further work.

## Verification

Asset tests check eight distinct decoded images, transparent borders, absence of an opaque magenta matte, visible foreground bounds, opaque ground anchors and level fallback. Camp route tests sample complete walking segments near obstructions and map edges, verify troops gather within the outer camp area, and check newly added obstacles.

Browser cases inspect all eight level textures and origins, a paid upgrade through Info and reload, identical moving previews, actual phone placement with the full footprint, troop gathering and obstacle rerouting, and material-appropriate ruins followed by intact home restoration. Existing camp roster, capacity, construction, reduced-motion, battle transition, obstacle and building-preview cases run in both engines. Screenshots wait for the renderer's next completed frame before capture. The production check requires all eight texture URLs and checks offline loading; results and local performance measurements are recorded in [QA.md](QA.md).
