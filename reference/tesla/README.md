# Native Hidden Tesla source

Pinned client **18.400.21**, asset bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
Inputs come from the [public client bundle](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/fingerprint.json).
Every input has a SHA-256 pin in `native.json` and is checked against the fingerprint's SHA-1 record.

- `native.json` preserves the 17 original sparse building rows, reveal globals, 12 Tesla effect groups, 12 particle emitter records, original scene graph, texture sampling evidence, sound hashes and preview hashes.
- `runtime.json` retains all 54 exports, 124 shapes and 65 clips. It changes only UV coordinates to address four tightly packed textures; original source texels and bilinear neighbours are copied without rescaling.
- `combat.json` contains inherited HP, DPS, upgrade costs/times and Town Hall requirements for all 17 levels, plus the 600 ms cadence, 6-tile trigger and 7-tile attack radius.
- `public/assets/buildings/tesla-native` contains four textures, 17 portraits and five original Ogg files. The graph also includes trapdoors, construction and upgrade scaffolds, the source damaged export, reveal dust, electrical arcs, impact sparks and grass.

Reproduce and verify with the pinned Python dependencies:

```sh
output/native-art-venv/bin/python scripts/import-native-tesla.py
output/native-art-venv/bin/python scripts/import-native-tesla.py --check
output/native-art-venv/bin/python -m unittest discover -s scripts/native_art -p 'test_*.py'
npm test -- tests/native-tesla-reference.test.ts
```

The 18-frame reveal runs at 24 fps and first places `idle_electricity` at frame 17. Setup exports have one root frame with independent 150–192-frame idle clips. Several levels apply additive blending to the **whole idle group**, which must be isolated before compositing onto the world. Seven such subclips are recorded explicitly; treating their children as independently additive changes overlapping pixels. The shared flat mesh player currently rejects these groups.

DOM portraits include original normal-blend foreground polygons at density 2. Named idle electricity and additive leaves are omitted because one transparent PNG cannot encode their appearance over arbitrary backgrounds. Complete live effects remain in the graph.

This import is a source preservation milestone. The game still uses its previous Tesla presentation and six-level catalog pending native renderer integration. Captured values do not establish native executable behavior: reveal-to-idle handoff, world registration, random particle choice and trajectories, sound-row selection and instantaneous damage remain separately unverified. No later campaign level is unlocked by this asset-only change.
