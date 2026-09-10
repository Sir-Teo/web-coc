# Art direction and generation record

All bitmap artwork was created for this project using the built-in image-generation tool. There are no downloaded Clash of Clans assets and no runtime image-generation calls. The final source files are kept in `art/source/`; derived shipping files are in `public/assets/`.

## Visual contract

Orthographic isometric camera from the southeast, approximately 30° elevation. Chunky, readable, pre-rendered 3D silhouettes. Warm sunlight from upper left, ambient occlusion, ivory stone, terracotta roofs, honey timber, cobalt flags, purple elixir, and gold accents. Terrain is calm at the center and richly dressed around the perimeter. UI uses ivory parchment, green action buttons, orange attack buttons, Lilita One display text, and Nunito Sans body text. Both fonts ship locally through their Fontsource packages.

## Prompt set

### Base buildings — `art/source/buildings.png`

Production isometric strategy game building atlas. 1536×1024 transparent PNG, 4 columns × 3 rows, twelve isolated objects, generous margins and consistent southeast orthographic camera. Premium chunky, friendly, high-end pre-rendered mobile village-builder art. Rich terracotta roofs, ivory stone, honey timber, bright purple liquid, cobalt banners, golden trims, warm upper-left sunlight, crisp silhouettes and ambient occlusion. Row 1: orange-roof town hall keep, gold mine with ore cart, elixir collector with glass sphere and copper pipes, gold storage overflowing with coins. Row 2: purple elixir storage vat, barracks with sword and banner, black iron cannon on wooden carriage, timber archer tower. Row 3: army camp with tents and campfire, builder cottage, octagonal mortar, blue-roof laboratory with violet crystal. No words, labels, interface, grids, scenery, watermark, or background. Actual alpha transparency.

### Terrain — `art/source/terrain.png`

1536×1024 full-bleed production terrain. Premium colorful 3D pre-rendered village game environment, elevated southeast orthographic view without a horizon. A large, empty, light spring-green clearing at the center, bordered by dense rounded pines and deciduous trees. Keep the central 80% calm and almost empty, with subtle grass variation and sparse daisies. Turquoise river with foam and pale boulders at the lower-left edge, rugged rock outcrops at upper right. Warm golden sunlight and cool shadows. No buildings, walls, characters, interface, lettering, or logos.

### Character seeds and scenery — `art/source/characters.png`

1536×1024 transparent PNG, 4 columns × 2 rows. Premium chunky friendly 3D mobile strategy art, isometric southeast view, upper-left sunlight. Top row: blond mustachioed swordsman with blue sash and broad sword; magenta-haired female archer in green tunic with bow; massive bald ginger-bearded giant in brown leather tunic; blue-hooded black-bearded wizard with fireball. Full body, weapons fully visible. Bottom row: reinforced stone wall post with gold cap, three-conifer cluster, mossy boulder cluster, blue swallowtail flag. All independently isolated; no text, grid, background, or scenery beyond each prop.

### Walking animation — `art/source/walk-final.png`

Production transparent RGBA sprite atlas. Four columns × four rows; each row is a four-frame walking cycle for one character. Row 1 blond mustachioed swordsman in blue sash and leather kilt with sword. Row 2 magenta-bob-haired green-tunic archer with bow. Row 3 massive bald ginger-bearded giant in brown sleeveless leather tunic. Row 4 blue-hooded black-bearded wizard with gold belt and small fireball. Warm upper-left light, isometric three-quarter facing lower-left. Consistent scale and foot baseline within each row. Four poses: left foot forward, passing, right foot forward, passing. All figures inside their cells with transparent margins. No checkerboard, opaque background, labels, or dividing lines.

The generated usable output is 1254×1254. `scripts/walk-atlas.mjs` extracts measured cells, uses one shared scale per character, and aligns feet to a shared baseline in four 128×128 frames. The first frame supplies the matching HUD portrait. Two earlier candidates (`walk.png` and the tool-only extraction attempt) were rejected for baked-in checkerboards; only `walk-final.png` ships.

### Final-tier buildings — `art/source/buildings-tier3.png`

1536×1024 transparent PNG with 4 columns × 3 rows in the same building order as the base set. Preserve the southeast orthographic view and cheerful orange-roof, ivory-stone, blue-banner palette. All buildings are visibly upgraded: dark slate reinforced bases, gleaming gold braces, thicker foundations, gold finials, additional battlements, and royal banners. Town hall gains towers and gold ridge caps; mine gains reinforced machinery and a second ore cart; collector gains paired vats; storages gain gold framing; barracks gains crossed swords; cannon and mortar gain black-and-gold armor; tower gains reinforced stone battlements; camp gains royal tents; builder gains a gold hammer sign; laboratory gains ornate gold fittings and brighter violet magic. No text, grid, interface, scene background, or watermark. Actual RGBA transparency.

## Processing and provenance

- `scripts/assets.mjs`: measured cell extraction, alpha-preserving trim, size normalization, and WebP encoding for base assets.
- `scripts/walk-atlas.mjs`: shared-scale normalization and bottom-center anchoring for four walking strips.
- `scripts/tier3-assets.mjs`: final-tier building extraction and WebP encoding.
- `npm run assets`: rebuilds every shipping bitmap from the committed source artwork.
- Wall connections, hit particles, health bars, placement grids, and small resource glyphs are renderer-native geometry. Effects audio is synthesized locally with Web Audio.
- Lucide supplies interface glyphs; package licenses remain in dependencies. Fonts are distributed with their upstream open font licenses.

Sources stay outside `public/` and `dist/`, so rejected generations and large original PNGs are not downloaded by players.
