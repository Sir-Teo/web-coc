# Original Dark Elixir Drill source definitions

Captured alongside Inferno Towers by `scripts/import-native-midnight-oil.py` from pinned client 18.400.21, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`. All source files have SHA-256 pins and fingerprint SHA-1 membership checks. `native.json` retains 11 raw base-level rows, explicitly inherited base levels, three separate raw mini-level records, three original effect records and their three referenced emitters. `catalog.json` preserves HP, size, Town Hall/build requirements, original art references and production/capacity units.

Production remains explicitly `ResourcePer100Hours`: level 1 produces 2,000 per 100 hours and holds 160, while level 11 produces 20,000 per 100 hours and holds 4,600. Mini-level values are not folded into base levels or interpreted as cumulative bonuses. Original art and live production/loot integration remain pending. Midnight Oil contains one level-1 Drill; its complete implementation, Inferno Towers and the level-15 Archer Tower tier are required before campaign access expands.

Run `PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-midnight-oil.py --check` to reconstruct the captured records. Tests cross-check all base HP values against the existing campaign catalogue and retain the village's unresolved-family gate.

The pinned scene file also resolves every building and particle export. `artInventory` records original export IDs, reachable clip/shape counts and required source texture files and dimensions. Texture payload decoding and independent pixel witnesses remain the next asset step.

The Drill inventory resolves 39 building/particle exports, 46 clips and 97 shapes across source textures 8, 25, 39 and 41. These reachable clips use normal blend mode 0. The inventory validates references only; it is not a substitute for decoding the source texture payloads and comparing rendered pixels.
