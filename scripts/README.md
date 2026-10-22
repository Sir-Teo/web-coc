# Maintenance scripts

Run scripts from the repository root. Start with the named commands in `package.json`;
ordinary development needs only `npm ci` and `npm run dev`.

| Family                                        | Purpose                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `build-sw.mjs`                                | Generate the production service worker and content manifest after Vite |
| `release-check.mjs`                           | Own a preview server and run the general production smoke suite        |
| `*-production-check.mjs`                      | Feature-specific browser checks against a preview or configured origin |
| `*-assets.mjs`, `*-assets-check.mjs`          | Build or verify authored artwork and shipping assets                   |
| `import-native-*.py`                          | Reconstruct a feature's data/art from pinned client inputs             |
| `native-*-fixtures.py`, `native-*-catalog.py` | Reference renders, catalogs and verification fixtures                  |
| `native_art/`, `native3d/`                    | Shared native format readers and rendering utilities                   |
| `check-doc-links.mjs`                         | Local documentation links, checked by `npm run check`                  |
| `native-pages.mjs`, `vite-native-pages.mjs`   | Level texture pages for village and troop packs (dev server and build) |
| `vite-import-retry.mjs`                       | Preserve lazy art imports while allowing failed module URLs to retry   |
| `late-art-production-check.mjs`               | Own a preview and test built art-import retries in Chromium and WebKit |
| `previous-art-release.mjs`                    | Create the in-memory previous-release fixture for worker update checks |
| `app-icons.mjs`                               | Render the home-screen icons from `public/favicon.svg` (`--check`)     |
| `content-inventory.py`                        | Generate/check the content inventory                                   |

Do not infer that a script is unused because it is absent from `package.json`.
Reference READMEs and feature guides also invoke standalone tools.

## Asset tooling

Read [the asset guide](../docs/ASSETS.md) and the feature's `reference/` README first.
Native reconstruction needs the pinned source client, Python and the listed Python
dependencies. Use a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/native_art/requirements.txt
```

Use that interpreter for the importer commands. Native 3D tooling may have additional
requirements documented with its source. A `--check` flag is available on many, but
not all, generators; inspect the script before assuming it is read-only.

The decoration timeline exporter supplements the static Shop portrait importer:

```sh
.venv/bin/python scripts/import-native-decoration-timelines.py --report
.venv/bin/python scripts/import-native-decoration-timelines.py --check
```

Omit both flags to regenerate the four animation packs and their source index. See
[Decorations](../docs/DECORATIONS.md) for loading, registration and coverage.

Shared native texture aliases are pinned by decoded pixels in `native_art/shared_assets.py`.
Its focused checks run without downloading source bundles:

```sh
PYTHONPATH=scripts .venv/bin/python -m unittest native_art.test_shared_assets
```

Run the affected importers' `--check` commands as well to compare full source reconstructions,
including owned-file membership, shared pages and generated reference paths.
The aliases also cover character and garrison pages and the Drill and Inferno portraits
shared with the native catalog. Portrait manifests hash the current source manifest;
when its paths change, regenerate the portrait manifest even if every pixel stays identical.

The expanded village timeline importer preserves shared pages and established scene order
before serializing each graph and its index hash. With the source archive fingerprint and
source files available in the archive or source cache:

```sh
.venv/bin/python scripts/import-native-village-art.py --check
.venv/bin/python scripts/import-native-village-art.py --check --only goldmine
```

The troop, projectile and effect importers use the same alias pins:

```sh
.venv/bin/python scripts/import-native-troop-art.py --check
.venv/bin/python scripts/import-native-unit-art.py --check
.venv/bin/python scripts/import-native-projectile-art.py --check
.venv/bin/python scripts/import-native-effect-art.py --check
```

Projectile and effect pack byte counts include the graph and owned images. Shared
pages are checked at their canonical paths and excluded from each pack's file list
and byte count. Each catalog's `totalBytes` is the sum of its pack byte counts.

## Browser tooling

Install Playwright browsers before running browser scripts. `npm run test:production`
starts its own isolated preview; most feature runners expect a preview already
running. Inspect environment variables such as `PRODUCTION_BASE_URL` and
`PRODUCTION_BROWSER` in the relevant runner. Reports belong in `output/`.
