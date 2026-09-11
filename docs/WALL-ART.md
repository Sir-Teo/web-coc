# Wall artwork and material connections

The supported Home Village wall levels 1–8 now have separate artwork: sharpened wood and rope, rough fieldstone, cut masonry, dark iron, gold, bright pink crystal, dark violet crystal, and black stone with an ivory skull. Placed walls, Info/upgrade cards, new construction ghosts, individual moves and mixed-level row previews resolve the same level-specific assets. The catalog label is now Wall, since its early form is wooden.

## Source and export

The visual reference was the [Home Village wall gallery on CoC Guide](https://coc.guide/defense/wall), checked September 11, 2026, with the [community Home Village wall reference](https://clashofclans.fandom.com/wiki/Wall/Home_Village?page=3) supporting the material progression. The downloaded low-resolution reference images stay in ignored verification output and are not shipped. The project sprites were generated as original artwork in the existing chunky isometric style.

The accepted master is `art/source/walls-levels-v1-chroma.png`, a 1536×1024 four-column/two-row sheet. Two initial exports baked a transparency checkerboard into RGB pixels and were rejected. The final ImageGen edit replaced that background with a cyan production matte while retaining the eight designs. `scripts/wall-assets.mjs` converts the matte to alpha, cleans residual edge spill after resampling, and places each trimmed sprite in a lossless 192×256 WebP frame with its lowest point at the same baseline. The eight shipping files live in `public/assets/environment/walls-v1/`. The script is part of `npm run assets` and requires no network access or image-generation call to rebuild.

The image-generation prompt specified eight independently isolated posts, a shared southeast orthographic camera, warm upper-left light, generous cell gutters, no labels/scenery, and the eight material/silhouette descriptions above. The cyan edit was limited to the background. Earlier masters remain in the tool's generated-image history; only the accepted chroma master is part of the repository.

## Rendering

`src/game/wall-art.ts` holds asset keys, display heights and connection palettes. Frames retain their aspect ratio and use a shared origin; posts no longer stretch the old wall bitmap or receive a generic gold tint at level 5. Placement validity is shown by footprint color and red invalid previews while valid wall previews retain their material colors.

Connections have material-specific faces, highlights and details: timber bindings, stone courses, metal seams, and jagged crystal/obsidian tops. A connection is split into two material halves, so neighbouring levels meet without recoloring each other. Connection caching includes the wall level as well as ID and position, allowing an instant upgrade to refresh a link without a move. The same painter supplies movement previews. Removed/destroyed walls lose their connections, and cancellation restores the original visible wall sprites.

## Verification and remaining fidelity

Asset tests verify eight distinct RGBA frames, transparent margins, aligned bottom pixels, absence of residual cyan matte, and safe level fallback. Browser checks cover the complete rendered gallery, level-change cache invalidation and HUD artwork, mixed-level previews, single-wall movement, new wooden-wall placement, and destruction of linked pieces. Existing wall interaction suites run alongside them in Chromium and WebKit. Production/offline checks include the eight additional cached files.

These are original recreations with procedural connection geometry, not extracted native wall sprites or a claim of pixel-identical rendering. Higher imported wall levels currently use level-8 artwork; the playable Town Hall catalog ends at level 8. Remaining work includes higher-level art, closer native connection geometry/ornament placement, and live price/HP tables. Other buildings still need their own complete per-level visual progression.
