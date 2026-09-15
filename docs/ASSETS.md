# Art direction and generation record

## Complete TH8–18 source library

The complete pinned official client archive now supplies all 9,075 source files, including higher-level buildings, troops, heroes, pets, equipment, spells, effects and animation sources. A new searchable `/asset-catalog.html` library exposes 552 original building/trap level PNGs and 271 roster/equipment icons. See [the full inventory, rebuild commands and integration boundaries](../reference/full-client/README.md). The archive stays outside the shipped game; catalog PNGs load on demand. This asset acquisition does not extend the current playable Town Hall progression.

Santa Trap source assets now include the original present reveal, sleigh components and affine flight track, three gift variants, smoke/debris, shadow and four unchanged Ogg sounds. Eleven assets total 4,004,922 bytes. The importer preserves complete source evidence and a separate compact runtime reference consumed by the live combat presentation. See [the native Santa reference](../reference/santa-trap/README.md).

Skeleton Trap coffin states and ground/air skeleton animation sources are retained under `art/source/skeleton-v1/`, with exact built-in generation prompts. `scripts/skeleton-assets.mjs` builds transparent gameplay atlases and supports deterministic `--check`. See [SKELETON-TRAP.md](SKELETON-TRAP.md).

Bomb Tower now uses original client polygons, textures, directional defender clips, bombs, shadows, rubble and all 39 referenced particle exports, with thirteen source-rendered portraits and six original sounds. `scripts/import-native-bomb-tower.py --check` reproduces the pinned reference and all 27 assets. The earlier authored tower bases, four-pose Bomber and charge remain historical inputs under `art/source/bombtower-v1/`. See [BOMB-TOWER.md](BOMB-TOWER.md).

Hidden Tesla sprites for levels 1–6 are retained under `art/source/tesla-v1/` with built-in generation prompts and accepted iterations. `scripts/tesla-assets.mjs` builds six transparent 384×512 sprites and verifies repeat builds with `--check`. See [HIDDEN-TESLA.md](HIDDEN-TESLA.md).

Air-control defense art is retained under `art/source/air-control-v1/`: four eight-direction Air Sweeper sheets and armed/flying/spent Seeking Air Mine states. `scripts/air-control-assets.mjs` builds 35 alpha sprites and verifies a repeat build with `--check`. Accepted sprites have real alpha; failed checkerboard candidates were rejected. See [AIR-CONTROL.md](AIR-CONTROL.md).

The [native Seeking Air Mine foundation](../reference/seeking-mine/README.md) retains all eight source levels, four setup/projectile families, reveal/upgrade/spent states, all referenced particles, five sounds and the original Info artwork. Its 16 assets reproduce through `scripts/import-native-seeking-mine.py --check`. They are staged for live integration; the current mine presentation still uses the authored files above.

The prototype Swordsman portrait and walk frames below are superseded by [Barbarian artwork](BARBARIAN-ART.md). Exact built-in generation prompts and retained source renders are in `art/source/barbarian-v1/`.

The original camp atlas tiers described below are superseded by [eight individual Army Camp sprites](CAMP-ART.md), with source renders and exact prompts under `art/source/camp-levels-v1/`.

The project combines earlier artwork created with the built-in image-generation tool and source-preserved assets reconstructed from checksum-pinned public client bundles. Native references and importers document original pixels separately from local presentation assumptions. Authored originals remain in `art/source/`; shipping files are in `public/assets/`. There are no runtime image-generation calls.

Mortars now have six distinct playable level sprites with timber carriages, gold reinforcement and later blue supports. [MORTAR-ART.md](MORTAR-ART.md) documents the reference, original prompts, transparent-frame pipeline and measured muzzle anchors. Their earlier atlas sprites remain as legacy build inputs.

## Visual contract

Orthographic isometric camera from the southeast, approximately 30° elevation. Chunky, readable, pre-rendered 3D silhouettes. Warm sunlight from upper left, ambient occlusion, ivory stone, terracotta roofs, honey timber, cobalt flags, purple elixir, and gold accents. Terrain is calm at the center and richly dressed around the perimeter. UI uses ivory parchment, green action buttons, orange attack buttons, Lilita One display text, and Nunito Sans body text. Both fonts ship locally through their Fontsource packages.

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

### Earlier air layer and spell vials — derived, not generated

The earlier Air Defense, Spell Factory, Balloon, and the three spell vials contain **no new generated bitmaps**. The building and troop assets below have been superseded by the v2 sprites; the spell vials remain active. `scripts/derived-assets.mjs` preserves their deterministic rebuild from existing art and vector overlays:

- **Air Defense** (`airdefense.webp`, and its final tier) is `mortar.webp` hue-rotated 190° with slightly raised saturation and brightness. The mortar's up-angled barrel on an octagonal base already reads as anti-air; the recolour to cold steel-blue is what separates it from its ground-only sibling at a glance.
- **Spell Factory** (`spellfactory.webp`, and its final tier) is `laboratory.webp` hue-rotated 40°, turning its blue roof and violet glassware to the arcane magenta of brewed spells while keeping the same silhouette family.
- **Balloon** (`balloon.webp` plus a four-frame 512×128 float cycle) is the glass sphere and gold crown of `elixirstorage.webp`, masked away from the stone base it normally sits on, recoloured warm — the glass alone, so the gold fittings stay gold — and composited over a drawn burner ring, rigging lines, wicker basket, and bomb. The sphere's own bottom is occluded by its base in the source, so the mask cuts it square and the burner ring hides the seam.
- **Spell vials** (`rage.webp`, `heal.webp`, `lightning.webp`) are drawn as SVG and rasterized: a glass flask with a liquid gradient, a highlight sweep, a gold stopper, and a glyph. They read as a separate class of object from the buildings on purpose.

Because every step is a pure function of committed inputs, re-running the script produces byte-identical output. `output/assets-before.sha` and `output/assets-after.sha` record a full rebuild and are identical.

## Destruction states

Original stone and timber rubble replace compressed intact building sprites after destruction. Sources, exact built-in image-generation prompts, and alpha-preserving rebuild instructions are in [DESTRUCTION-ART.md](DESTRUCTION-ART.md). `scripts/ruins-assets.mjs` builds both material families. Weapon projectiles, muzzle flashes, impacts and ground scars use renderer-native geometry; see [COMBAT-PRESENTATION.md](COMBAT-PRESENTATION.md).

## Specialist troops

The Goblin and Wall Breaker use original transparent sprites generated with the built-in image tool. See [RAIDING-ASSETS.md](RAIDING-ASSETS.md) for exact prompts, source files, shipped paths, and current animation limits.

## Processing and provenance

- `scripts/assets.mjs`: measured cell extraction, alpha-preserving trim, size normalization, and WebP encoding for base assets.
- `scripts/walk-atlas.mjs`: shared-scale normalization and bottom-center anchoring for four walking strips.
- `scripts/tier3-assets.mjs`: final-tier building extraction and WebP encoding.
- `scripts/derived-assets.mjs`: deterministic recolours, masks, and drawn overlays for the air-layer and spell artwork.
- `scripts/raiding-assets.mjs`: alpha-preserving normalization for the Goblin and Wall Breaker.
- `scripts/air-magic-assets.mjs`: original Air Defense, Spell Factory, their upgraded variants, and stable-scale Balloon sprite/animation normalization.
- `npm run assets`: rebuilds generated artwork from committed source sheets. Native client reconstructions use the separate pinned importers below.
- Wall connections, hit particles, health bars, placement grids, and small resource glyphs are renderer-native geometry. Effects audio combines local Web Audio synthesis with attributed native samples.
- Lucide supplies interface glyphs; package licenses remain in dependencies. Fonts are distributed with their upstream open font licenses.

Sources stay outside `public/` and `dist/`, so rejected generations and large original PNGs are not downloaded by players.

## Healer, Dragon and P.E.K.K.A

Three generated transparent character sheets supply four-frame atlases and matching portraits. See [LATE-TROOPS.md](LATE-TROOPS.md) for source data, provenance, rendering limits and rebuild instructions, and [the complete prompts](../art/source/late-troops-v1/prompts.json). Run `node scripts/late-troop-assets.mjs --check` to verify all six shipping WebPs against their retained source sheets.

## Native Pumpkin Bomb

The Pumpkin Bomb atlas is reconstructed from Supercell's public client artwork. It contains the original setup sprite and 44 trigger frames with registered positions, animated nested fuse sparks and true alpha. Source hashes, reproduction commands, ownership and remaining playback interpretation limits are in [the native reference](../reference/pumpkin-bomb/README.md). This asset is regenerated separately with `scripts/import-native-pumpkin.py`; it does not require image generation.

## Native Skeleton Traps

Both coffin art tiers now use original SC6/SCTX artwork with complete ground/air trigger timelines. Source facts, per-frame hashes, registration and exact reproduction commands are in [the native Skeleton Trap reference](../reference/skeleton-trap/README.md). The source has 191 timeline frames per tier, packed as 35 unique cells. The generated coffin WebPs are retired; their originals remain in `art/source/skeleton-v1`. `scripts/skeleton-assets.mjs` now rebuilds only the two defending-character atlases.

## Native Santa Trap and X-Bow

The Santa Trap uses native trap, sleigh, present, smoke and debris assets plus four original sound samples. The [Santa reference](../reference/santa-trap/README.md) covers reproduction and the [combat record](SANTA-TRAP.md) explains implemented behavior and remaining approximations.

The [X-Bow reference](../reference/xbow/README.md) preserves all 13 home-village levels, both targeting modes, upgrade variants, 36 directional views per control, projectile animations and seven native sounds. Its source meshes retain their original polygons, transforms, color changes and additive layers. Three lossless texture PNGs preserve the sampled source pixels, with sparse projectile regions packed to reduce GPU memory. X-Bow gameplay integration remains in progress.


## TH8–18 native runtime coverage

The full [official-client reference](../reference/full-client/README.md) includes 32 new building timeline packs (348 levels) and 32 troop packs (305 levels), in addition to the 823 catalog PNGs and existing specialized defense renderers. Runtime files live under `public/assets/village-native/` and `public/assets/troops-native/`. They retain original meshes, direction roots, color transforms and animation timing; no generated substitutes fill the higher-level tiers. Resource controls use source fill frames. Native packs are fetched on demand and cached after use.
