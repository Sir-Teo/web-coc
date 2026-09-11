# Building appearance and placement

Placed buildings and single-building moving previews share their texture, dimensions and ground anchor. Previously, moving a level-5+ building other than a Wall or Mortar reverted to its base artwork, and every generically scaled building shrank to its level-one dimensions. The preview now retains the appearance of the actual building. Completing a paid upgrade while moving also refreshes the size, including upgrades within one artwork tier.

`buildingTexture` in `src/game/data.ts` supplies both Phaser texture selection and the tier decision for DOM images. `VillageScene.styleBuilding` applies the same geometry to the village sprite and its moving preview. Walls keep their individual heights and 0.84 ground origin; Mortars keep their fixed frame. Placement tint and transparency continue to communicate valid or blocked destinations.

The progression panel selects artwork for the level displayed in each Town Hall card. The shop continues to show level one, while contextual cards and Info show the selected building's current level.

Placement resolves the pointer, snapped tile and collision result once per rendered frame for both the preview sprite and its highlighted footprint. Keyboard panning, zooming and viewport changes therefore keep the sprite over the tile that will receive the next placement, even without pointer movement or an economy refresh. Shop drags retain their DOM pointer during scene refreshes; releasing that drag returns to canvas input. Previously, a refresh could send the preview back to a stale canvas pointer (the regression fixture measured a 440-world-pixel jump).

The browser audit compares all 23 building kinds at four requested levels (clamped to each kind's maximum), checks an actual phone relocation through blocked placement, cancellation and reload, and finishes a paid upgrade during movement. Existing Wall/Mortar art, village editing, resource-bubble and progression scenarios cover the surrounding paths. Evidence is in `output/playtest/building-appearance-verification.json` and the `upgraded-building-move-*` and `progression-level-art-*` captures.

The placement follow-up checks keyboard panning, zoom, resize, DOM pointer retention across a scene refresh, and release back to canvas input. Its economy clock is held to ensure a periodic refresh cannot mask a stale preview. See `output/playtest/placement-preview-verification.json` and `placement-camera-phone-webkit.png` for results and visual evidence.

Most buildings still share two broad artwork tiers; several have only one sprite. Generic growth and warm tint remain local presentation choices. Full per-level native appearance and footprint parity remain open work.
