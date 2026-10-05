# Per-level building art

A native building family pack (`public/assets/village-native/<kind>/graph.json`) draws every level of the family from shared atlases. The Town Hall's main atlas is 3002×3066 texels, about 37 MB of GPU memory, and a Level 2 Town Hall samples about 4% of it. A starter village therefore downloaded and uploaded every level's art to draw two.

`scripts/split-village-art.mjs` writes a small idle pack for each building level:

- `public/assets/village-levels/<kind>/<level>.json`: the level's `ExportName` and `ExportNameBase` exports, the clips and shapes they reach, and only the matrices and colors those clips place.
- `public/assets/village-levels/<kind>/<level>-<scene>-<page>.png`: atlases holding only the source texels those shapes sample.
- `reference/full-client/village-levels.json`: the levels that have a pack.

## What stays exact

Each shape's source rectangle is copied with a two-texel border of its original neighbors. Overlapping rectangles merge first. Where a rectangle meets the atlas edge, the border repeats the edge texel, as the atlas's clamp-to-edge sampling did. The atlases have no mipmaps, so bilinear filtering reads exactly the texels it read before. Texture coordinates move by whole texels; positions, matrices, colors, blend modes and timelines are unchanged.

`tests/village-level-packs.test.ts` samples twelve families at four clocks against their family packs. Every pose has the same key, matrix, color and blend, every vertex the same position and a whole-texel coordinate shift, and every texel filtering can read, borders included, equals the source texel. `node scripts/split-village-art.mjs --check` compares the committed packs and decoded atlas pixels with a fresh split.

## When a level pack is used

- Only at home, and only for a building showing its idle exports: not under construction, not upgrading. Battles keep family packs, because their buildings switch to damaged exports as they fall.
- Once a family pack is loaded, every building of that family draws from it, so nothing is held twice.
- Starting an upgrade or construction loads the family pack for its animations. Until it arrives, the building keeps its idle look from the level pack.
- A level gets a pack only when it needs at most half of its family's texels. Levels drawn as a Spell Tower mode or a Town Hall weapon, and families with variant packs, keep family packs.
- A level pack that fails to download falls back to the family pack.

## Effect

304 level packs cover 27 families. A drawn level needs 58.0 million texels where the family atlases it would otherwise load hold 411.6 million. For the starter village, building atlases fall from 17.3 MB of PNG and 20 million texels (about 80 MB of GPU memory) to 2.4 MB and 3.9 million texels. In the production build at phone size in Chromium, first-visit downloads fell from 36.5 MB to 25.4 MB and time to a playable village from 4.5 s to 2.7 s, or from 9.8 s to 7.6 s at a 4× CPU slowdown. These are single runs on a software-rendered headless browser, not physical-device measurements.

The cannon, Archer Tower and troop atlases use other loaders and are not split yet; the cannon's 2552×4056 atlas is now the largest download at boot.

`tests/browser/village-level-packs.spec.ts` checks that a starter village requests level packs and no Town Hall family atlas, that its buildings draw, and that starting an upgrade loads the family pack while the hall stays drawn.
