# Original Dark Elixir Drill source definitions

Captured alongside Inferno Towers by `scripts/import-native-midnight-oil.py` from pinned client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. All source files have SHA-256 pins and fingerprint SHA-1 membership checks. `native.json` retains 11 raw base-level rows, explicitly inherited base levels, three separate raw mini-level records, three original effect records and their three referenced emitters. `catalog.json` preserves HP, size, Town Hall/build requirements, original art references and production/capacity units.

Production remains explicitly `ResourcePer100Hours`: level 1 produces 2,000 per 100 hours and holds 160, while level 11 produces 20,000 per 100 hours and holds 4,600. Mini-level values are not folded into base levels or interpreted as cumulative bonuses. Original art and live production/loot integration remain pending. Midnight Oil contains one level-1 Drill; its complete implementation, Inferno Towers and the level-15 Archer Tower tier are required before campaign access expands.

Run `PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-midnight-oil.py --check` to reconstruct the captured records. Tests cross-check all base HP values against the existing campaign catalogue and retain the village's unresolved-family gate.

The pinned scene file also resolves every building and particle export. `artInventory` records original export IDs, reachable clip/shape counts and required source texture files and dimensions. Texture payload decoding and independent pixel witnesses remain the next asset step.

The Drill inventory resolves 39 building/particle exports, 46 clips and 97 shapes across source textures 8, 25, 39 and 41. These reachable clips use normal blend mode 0. The inventory validates references only; it is not a substitute for decoding the source texture payloads and comparing rendered pixels.


## Original artwork capture

`scripts/import-native-dark-drill-art.py` now captures every inventoried export and reachable display object into `art-runtime.json` and preserves the uncropped source graph in `art-source.json`. The graph contains 39 exports, 46 clips, 97 shapes and 5,479 clip frames, with normal blend mode only. Four PNG texture regions retain the exact decoded source texels and remapped UVs. The source-definition SHA-256 is bound into the metadata.

Texture 41 is pinned to SHA-256 `b3382bdda1665f62f476dca4afc8896cd1251d53f2c0b533f2fa2c09dfa94260`; all six source inputs also verify membership against the original fingerprint SHA-1 records. `PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-dark-drill-art.py --check` reconstructs and compares the complete graph documents and decoded texture pixels.

The reconstruction check and three source tests pass, including every tier's art references, source geometry preservation and sampling all 5,479 clip frames with finite transforms. A temporary CPU source-rendered contact sheet of all 39 export frame-zero poses was visually reviewed. Production build passes. Independent frame-by-frame browser pixel qualification, native state composition, UI portraits and live production/loot integration remain pending. These captures do not expand campaign access or establish native executable playback parity.


## Animation-state evidence

All eleven `darkelixir_pump_lvl*` body clips have 450 frames at 24 fps, with source labels at frame 0 (`idle`), 51 (`start_drill`), 70 (`lower_drill`), 129 (`DRILL`), 279 (`rise_drill`) and 359 (`idle2`). Each contains a named `resource` child: clip 18598 for levels 1–4 and 18578 for levels 5–11. Both resource clips have 100 frames and no labels. These names and frame counts are retained evidence; mapping resource frames to stored amounts and choosing idle/working loop semantics still require integration and verification. The separate base export names its `base` and `shadow` children.

Both resource timelines resolve to four distinct source display lists: frames 0–8, 9–24, 25–49 and 50–99. A separate CPU rendering of frames 0, 25, 50, 75 and 99 for both clips was reviewed and shows the reservoir filling, with the last three samples sharing the same full display. The artwork therefore should not be treated as a continuously animated 100-state liquid surface. The gameplay amount-to-frame conversion remains unverified.


## Original UI portraits

`scripts/native-dark-drill-portraits.py` renders each of the eleven original body exports at source frame zero together with its separate base. It preserves native scale, adds two pixels of crop padding, converts the independently composed premultiplied pixels to straight-alpha RGBA and records source-coordinate bounds, normalized origins and RGBA hashes in `portraits.json`. The metadata binds the exact captured art-source document. These are static UI assets; they do not replace the retained animated world geometry.

The `--check` reconstruction reproduces every PNG pixel and registration field. All eleven portraits were visually reviewed together, including tier-specific bases, metalwork and machinery. Production build passes. Menu wiring and live building integration remain subsequent work, and the full animation browser-pixel comparison is still pending.
