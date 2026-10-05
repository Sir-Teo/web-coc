# Level texture pages

A native family pack (`graph.json` under `public/assets/village-native/` or `public/assets/troops-native/`) draws every level of a building or troop from shared atlases. The Town Hall's main atlas is 3002×3066 texels, about 37 MB of GPU memory, and a Level 2 Town Hall samples about 4% of it; a Level 1 Barbarian loaded the art of all thirteen Barbarian levels. Phones paid for every level they did not draw, in download, decode time and texture memory.

`scripts/native-pages.mjs` regroups each pack's shapes by the set of levels that draw them and packs each group into its own pages. Each page records those levels, and the village and troop loaders upload only the pages of the levels they draw. Nothing is stored twice: each shape lives on exactly one page.

## Where it runs

Nothing generated is committed. `scripts/vite-native-pages.mjs` is a Vite plugin:

- The dev server answers each pack request with the paged pack and serves its pages from `/assets/native-pages/<key>/`, cached in `node_modules/.cache/native-pages` by the pack's bytes and its textures' sizes and times. The dev server and every browser spec draw what production draws.
- `vite build` rewrites each pack in `dist` and writes its pages under `dist/assets/native-pages/`, before `scripts/webp-dist.mjs` compresses them. `NATIVE_PAGES=0` skips it.
- Graphs bundled into the code are paged as they are imported. The Cannon graph (`reference/cannon/runtime.json`) and the Archer Tower body graph (`reference/archer-tower/buildings-runtime.json`) have no level rows; each export's level comes from its name (`basic_turret_lvl7`, `tower_turret_lvl10_down`), and exports without one (bases, construction, ammunition, debris, ruins, upgrade animations) land on pages every level shares.

A page every level draws carries no level tag; every loader fetches untagged pages for any level.

A pack is paged only when its average level needs at most 60% of the family's texels and no level needs more than the family atlases held. Overlapping source regions drawn at different levels are copied once per group, so heavily shared families (Battle Drill, the super troops) would cost more than they save and stay as they are.

## What stays exact

Each shape's source rectangle is copied with a two-texel border of its original neighbors; overlapping rectangles of a group merge first. Where a rectangle meets the atlas edge, the border repeats the edge texel, as the atlas's clamp-to-edge sampling did. The atlases have no mipmaps, so bilinear filtering reads exactly the texels it read before. Texture coordinates move by whole texels; positions, clips, matrices, colors and blend modes are unchanged. Shapes no level row reaches join a page every level loads.

`tests/native-pages.test.ts` pages the Town Hall, Builder's Hut, Gold Mine and Scattershot packs and the Barbarian, Archer and Giant packs. For every level, export and three clocks, each pose keeps its key, matrix, color and blend; each vertex keeps its position and moves its texture coordinate by whole texels; every texel filtering can read, borders included, equals the source texel; and every page a level draws is tagged with that level. A low level must need less than half of the family's texels, and the Super Dragon pack must stay unpaged. The Cannon and Archer Tower graphs are paged the same way by export name; a Level 1 Cannon must need under 10% of its atlas and a Level 1 Archer Tower under 30% of its own (it needs about 20%).

## Loading

- Village buildings: the pack's JSON loads once per family, then each level's pages decode and upload when a building of that level first draws; the fallback sprite covers until then. Boot prefetches the home village's levels, and a new battle prefetches its buildings' levels while scouting. Every state of a level (idle, construction, upgrade, damaged, trap) draws from the same pages.
- Troops: the carried army prefetches its pack and its research level's pages; a unit of another level loads its pages when it first draws.
- Cannons: untagged pages load with the deferred heavy art, together with the home village's Cannon levels. Opening a battle prefetches its Cannons' levels while scouting, and any other level loads when a Cannon of it first draws. Until its pages arrive, a Cannon keeps its fallback sprite and fallback shots. `CannonPresentation.prefetchLevels` lets a caller wait for levels it draws directly.
- Archer Towers: untagged pages, Level 1 (what the Shop sells) and the home village's levels load at boot. Opening a battle prefetches its towers' levels while scouting, and any other level loads when a tower of it first draws, behind its fallback sprite; a placement preview of a level not yet loaded shows the fallback ghost. `VillageArcherTowers.prefetchLevels` lets a caller wait. The rooftop Archer and the arrows are separate graphs and are not paged.
- Both use `NativeLevelPages` (`src/game/native-level-pages.ts`), which queues untagged and named levels on the scene's loader and fetches any other level's pages on first use.
- A page that fails to load is asked for again after five seconds.

`tests/browser/native-pages.spec.ts` checks that a starter village draws its buildings and a deployed Barbarian from pages without fetching the Town Hall or Barbarian family atlases. `tests/browser/troop-texture-upload.spec.ts` compares the paged troop uploads with ordinary image uploads, in both facings and after a lost graphics context.

## Effect

The production build pages 40 of the 120 village and troop packs into 564 pages, and the Cannon graph into its own. Measured October 5, 2026 on a production build at Pixel 7 size in headless Chromium (software rendering, not a physical phone):

| Starter village boot | Before | Village and troops paged | And the Cannon |
| --- | --- | --- | --- |
| Downloaded | 36.5 MB | 21.5 MB | 14.1 MB |
| Barbarian art | 3.3 MB atlas | 239 KB page | 239 KB page |
| Cannon files | 7.8 MB atlas and sprites | unchanged | 0.8 MB |
| Time to a playable village | 4.5 s | 3.1 s (three runs) | 2.2 s (two warm runs; 3.2 s cold) |
| Same at a 4× CPU slowdown | 9.8 s | 7.4 s | 5.9 s |

Paging the Archer Tower body graph was measured the same evening against the commit before it, both production builds served by `vite preview`, with a script that sums each response's encoded bytes until the network has been quiet for two seconds (so its totals differ from the table above):

| Starter village boot | Before | Archer Tower paged |
| --- | --- | --- |
| Downloaded | 15.01 MB | 13.89 MB |
| Archer Tower body art | 1.2 MB atlas (1024×1511) | Level 1 and shared pages; all 21 levels' 23 pages total 1.3 MB |
| Time to a playable village (three runs) | 1.9 s | 1.8 s |
| Same at a 4× CPU slowdown (two runs) | 5.9 s | 5.2 s |

A Level 1 tower now uploads about a fifth of the atlas's texels.

The original atlases of paged packs stay in `dist`, unrequested, so the deployed files grow; nothing a player downloads does.

Other defenses with their own renderers still draw from unpaged bundled graphs.

The Cannon browser specs that draw fixture villages or all 21 levels directly now wait with `prefetchLevels`. `cannon-effects.spec.ts` (aiming), the home-handling sound case in `cannon-handling.spec.ts` and every `native-cannon-mesh.spec.ts` case fail identically on `main` before this change; they are not regressions of paging. The Archer Tower specs that draw towers through the village presentation (`archer-tower-audio`, `-destruction`, `-facing`, `-preview`, `-windup`, `native-archer-tower-live`) now prefetch all 21 levels first. The placement-audio case of `archer-tower-audio.spec.ts`, `archer-tower-composition`, `archer-tower-preview`, `archer-tower-projectile-gallery`, the three `native-archer-tower-states` cases and every `native-archer-tower-art` pixel witness (its strips exceed the headless framebuffer) fail with the same assertions on the commit before Archer Tower paging.

This replaces the per-level idle packs committed briefly on October 5, 2026 (`public/assets/village-levels/`), which duplicated shared art in every level and covered buildings only.
