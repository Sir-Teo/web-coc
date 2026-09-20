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

## Browser tooling

Install Playwright browsers before running browser scripts. `npm run test:production`
starts its own isolated preview; most feature runners expect a preview already
running. Inspect environment variables such as `PRODUCTION_BASE_URL` and
`PRODUCTION_BROWSER` in the relevant runner. Reports belong in `output/`.
