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
on demand. Browse `/asset-catalog.html` on the dev server to inspect catalog assets.

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
