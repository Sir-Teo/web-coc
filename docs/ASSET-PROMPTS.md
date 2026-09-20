# Early asset prompts

Authoring reference for the original shared sheets. These prompts describe source
inputs, not current runtime coverage. See [the asset guide](ASSETS.md) for rebuilds.

## Prompt set

### Base buildings — `art/source/buildings.png`

Production isometric strategy game building atlas. 1536×1024 transparent PNG, 4 columns × 3 rows, twelve isolated objects, generous margins and consistent southeast orthographic camera. Premium chunky, friendly, high-end pre-rendered mobile village-builder art. Rich terracotta roofs, ivory stone, honey timber, bright purple liquid, cobalt banners, golden trims, warm upper-left sunlight, crisp silhouettes and ambient occlusion. Row 1: orange-roof town hall keep, gold mine with ore cart, elixir collector with glass sphere and copper pipes, gold storage overflowing with coins. Row 2: purple elixir storage vat, barracks with sword and banner, black iron cannon on wooden carriage, timber archer tower. Row 3: army camp with tents and campfire, builder cottage, octagonal mortar, blue-roof laboratory with violet crystal. No words, labels, interface, grids, scenery, watermark, or background. Actual alpha transparency.

### Terrain — `art/source/terrain.png`

1536×1024 full-bleed production terrain. Premium colorful 3D pre-rendered village game environment, elevated southeast orthographic view without a horizon. A large, empty, light spring-green clearing at the center, bordered by dense rounded pines and deciduous trees. Keep the central 80% calm and almost empty, with subtle grass variation and sparse daisies. Turquoise river with foam and pale boulders at the lower-left edge, rugged rock outcrops at upper right. Warm golden sunlight and cool shadows. No buildings, walls, characters, interface, lettering, or logos.

### Expanded terrain — `art/source/terrain-expanded-v2.png`

This earlier 1536×1024 background expanded the original forest and river beyond the playable world. It remains the style reference for the current terrain.

### Village field terrain — `art/source/terrain-field-v4.png`

The active 1672×941 terrain follows the expanded village field with a calmer lawn and a closer forest surround. It is displayed at 1.35× world size, with a separate subtle turf pattern aligned to the buildable tiles. It rebuilds through `scripts/terrain-assets.mjs`; `--check` verifies the derivative. Exact built-in generation/refinement prompts are in `art/source/terrain-field-v4.json`. See [TERRAIN-CAMERA.md](TERRAIN-CAMERA.md) for dimensions, provenance, rendering and remaining fidelity limits.

### Character seeds and scenery — `art/source/characters.png`

1536×1024 transparent PNG, 4 columns × 2 rows. Premium chunky friendly 3D mobile strategy art, isometric southeast view, upper-left sunlight. Top row: blond mustachioed swordsman with blue sash and broad sword; magenta-haired female archer in green tunic with bow; massive bald ginger-bearded giant in brown leather tunic; blue-hooded black-bearded wizard with fireball. Full body, weapons fully visible. Bottom row: reinforced stone wall post with gold cap, three-conifer cluster, mossy boulder cluster, blue swallowtail flag. All independently isolated; no text, grid, background, or scenery beyond each prop.

### Wall level progression — `art/source/walls-levels-v1-chroma.png`

Eight original generated wall designs cover levels 1–8, with level-specific material connections in the renderer. The accepted sheet uses a cyan production matte because the initial generated transparency was a baked checkerboard. `scripts/wall-assets.mjs` exports clean RGBA frames with aligned feet and no matte spill; it runs in the normal asset pipeline. See [WALL-ART.md](WALL-ART.md) for references, export details and scope. The old wall post remains as an unused legacy asset; runtime walls now use the versioned `walls-v1/` directory.

### Walking animation — `art/source/walk-final.png`

Production transparent RGBA sprite atlas. Four columns × four rows; each row is a four-frame walking cycle for one character. Row 1 blond mustachioed swordsman in blue sash and leather kilt with sword. Row 2 magenta-bob-haired green-tunic archer with bow. Row 3 massive bald ginger-bearded giant in brown sleeveless leather tunic. Row 4 blue-hooded black-bearded wizard with gold belt and small fireball. Warm upper-left light, isometric three-quarter facing lower-left. Consistent scale and foot baseline within each row. Four poses: left foot forward, passing, right foot forward, passing. All figures inside their cells with transparent margins. No checkerboard, opaque background, labels, or dividing lines.

The generated usable output is 1254×1254. `scripts/walk-atlas.mjs` extracts measured cells, uses one shared scale per character, and aligns feet to a shared baseline in four 128×128 frames. The first frame supplies the matching HUD portrait. Two earlier candidates (`walk.png` and the tool-only extraction attempt) were rejected for baked-in checkerboards; only `walk-final.png` ships.

### Final-tier buildings — `art/source/buildings-tier3.png`

1536×1024 transparent PNG with 4 columns × 3 rows in the same building order as the base set. Preserve the southeast orthographic view and cheerful orange-roof, ivory-stone, blue-banner palette. All buildings are visibly upgraded: dark slate reinforced bases, gleaming gold braces, thicker foundations, gold finials, additional battlements, and royal banners. Town hall gains towers and gold ridge caps; mine gains reinforced machinery and a second ore cart; collector gains paired vats; storages gain gold framing; barracks gains crossed swords; cannon and mortar gain black-and-gold armor; tower gains reinforced stone battlements; camp gains royal tents; builder gains a gold hammer sign; laboratory gains ornate gold fittings and brighter violet magic. No text, grid, interface, scene background, or watermark. Actual RGBA transparency.

### Air layer — original replacement sprites, September 11

The active Balloon, Air Defense and Spell Factory use the original artwork documented in [AIR-MAGIC-ART.md](AIR-MAGIC-ART.md). The Balloon has a fabric envelope and skeleton bomber; Air Defense uses three upright rockets; Spell Factory uses an open purple cauldron. Both buildings have separate reinforced level 5+ variants. Versioned `-v2.webp` paths preserve the earlier assets. The accepted sources have real RGBA transparency and rebuild through `scripts/air-magic-assets.mjs`.
