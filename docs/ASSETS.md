# Assets

The game combines authored artwork and assets reconstructed from pinned native
client data. The app has no runtime image-generation dependency. Ordinary development
uses the committed shipping assets and does not need the original native client.

## Where files belong

| Directory        | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `art/source/`    | Authoring inputs, generation prompts and source metadata                |
| `reference/`     | Pinned tables, compact runtime data, checksums and reconstruction notes |
| `public/assets/` | Browser-delivered textures, sounds, portraits and runtime packs         |
| `scripts/`       | Reproducible generators, native importers and verification tools        |
| `output/`        | Local reports, galleries and intermediate evidence; ignored by Git      |

`public/` is copied into the production build. Source sheets and downloaded client
bundles stay outside it. Some references are imported by application code; they are
not merely research notes.

## Generated artwork

```sh
npm run assets
```

This runs the authored-art pipeline and overwrites its shipping derivatives. Use a
single script when changing one family, and its `--check` mode where supported.
Source-specific prompts and accepted images live under `art/source/`; early shared
sheet prompts are preserved in [the prompt reference](ASSET-PROMPTS.md).

Do not run the full generator just to start the app. Review output changes and run
the corresponding asset and browser tests before committing them.

## Native assets

Start with [the full-client reference](../reference/full-client/README.md), then the
README in the relevant `reference/<feature>/` directory. These identify pinned
inputs, ownership, hashes, importer commands and known interpretation limits.
Python dependencies are in `scripts/native_art/requirements.txt`; source client files
must be obtained separately and are ignored by Git.

Native mesh packs preserve polygons, transforms and animation data. Runtime packs
under `public/assets/village-native/` and `public/assets/troops-native/` can be fetched
on demand. The dev server and production build split their atlases into level pages as
they serve them; nothing generated is committed (see [level texture pages](TEXTURE-PAGES.md)). Browse `/asset-catalog.html` on the dev server to inspect catalog assets.

The roster catalog lists 271 source icons, including all eight hero portraits.
Every listed portrait must ship even when the game uses a different image for its
own menus. With the pinned source inputs available, run
`python scripts/native-roster-catalog.py --check` to compare pixels and both roster
manifests. Browser tests cover the hero gallery at desktop and phone sizes;
production checks decode its converted portraits and verify them again offline.

Some identical native texture crops share one shipping file. The pinned
[shared texture aliases](../scripts/native_art/shared_assets.py) identify the supported
source importers and retain their existing shipping paths, including defense, trap,
character, garrison, village, troop, projectile, effect and portrait assets.
Each alias records its decoded RGBA hash and dimensions. The
importer validates every crop before redirecting output and reference paths, including
RGB values under transparent pixels; a different crop cannot overwrite another family's page.
Shared outputs are verified alongside owned assets, while directory membership checks
still reject unexpected files in the importing family's own folder.

The Dragon 5 and Golden Dragon/garrison Dragon 7 atlases opt into lossless region
clustering in the shared scene-graph importer. Their moved UVs use versioned
`texture-0-compact-v1.png` URLs. Keep the original pages recorded in `legacy` evidence
at their original URLs so cached modules still find matching pixels. Both importers
reconstruct and verify these compatibility files as well as the compact pages.
If the compact layout changes again, give it a new URL version and retain the prior
layout's page too; cached JavaScript can still contain its UV coordinates.

## Production texture compression

The production build converts asset PNGs to lossless WebP with exact transparent
RGB values, then rewrites shipping references. `scripts/webp-dist.mjs` caches
encoded bytes under `node_modules/.cache/webp-dist` using the source bytes and
encoder settings. Identical concurrent textures share one encode.

`scripts/webp-cache.mjs` writes a private temporary file and publishes it by atomic
rename. A different worker or build process can only read a complete cache entry.
Cached RIFF headers and declared lengths are checked before reuse, so truncated
entries from an interrupted older build are regenerated. Source PNGs and encoding
settings stay unchanged. `tests/webp-cache.test.ts` covers duplicate requests,
an interrupted write with an independent builder, truncated entries and retries.

## Changing or removing assets

1. Identify the owning generator/importer and read its reference notes.
2. Change the input or generator, regenerate the outputs and verify reproducibility.
3. Check level, direction, state and catalog variants. Runtime URLs are often assembled
   dynamically, so an absent literal filename in source does not prove an asset is unused.
4. Run relevant unit/asset tests and inspect the rendered result in the browser.
5. Confirm the production build and offline reload still request valid assets.

Retained source artwork may still be required to reproduce fallback images. Remove
it only after checking generators, runtime naming conventions, tests and provenance.
Keep source facts distinct from inferred animation or gameplay behavior.

## Attribution

Supercell owns the native Clash of Clans artwork and trademarks. Retaining a source
or checksum does not grant redistribution rights. Lucide and Fontsource packages
carry their own licenses. The repository does not currently grant a project-wide
open-source license.

## Dark Orb opaque source mask

Dark Orb uses a dedicated source pack because its crystal export contains a mask that the
general graph capture rejects. The scoped importer verifies an opaque constant-texel convex
mask and compatible source loops, then clips original mesh triangles while retaining UVs,
matrices, colors and blend groups. All 30 frames match independently masked source pixels
exactly. Other masks retain the strict guard. See [the source and verification commands](../reference/dark-orb/README.md).

## Native English fonts

The [native font reference](../reference/fonts/README.md) records the original
Supercell-Magic and CCBackBeat Light HUD families, their pinned source files and
lossless full-glyph WOFF2 builds. Source fonts stay under `art/source/native-fonts/`;
only the two compressed browser faces ship under `public/assets/fonts-native/`.

## Native campaign HUD icon

The Attack button uses the original campaign map from `hud_button_fight`'s
`icon` child at its `no_stars` frame. The [HUD reference](../reference/hud/README.md)
records its source selection, graph and pixel hashes. The static 90×74 PNG keeps
the source colors and adds no per-frame work. The parent's shape 55 supplies the
125×123 button background, with local CSS border-image slices for responsive sizes.
Labels and responsive targets remain DOM controls.

The same reference also pins `sc/ui.sc` and records the normal Shop coins/hammer
and Settings plate/gears selections from `ui_bottom_right`. Separate notification
badges are excluded; existing button actions and touch targets are retained.
