# Goblin campaign building sprites

Created with the built-in `image_gen` tool. Exact prompts: [generation](prompt.txt), [matte correction](matte-prompt.txt). Reference URLs and source hashes: [provenance.json](provenance.json). These are generated recreations; native pixel identity is not established.

- `public/assets/buildings/goblin-townhall-v1.webp`: 141934 bytes, 512×512, real alpha.
- `public/assets/buildings/goblin-hut-v1.webp`: 128660 bytes, 512×512, real alpha.

The large round stone building is the Goblin Town Hall. The smaller timber building is the passive Goblin Hut. The tutorial Cannon reuses the player Cannon's level-one visual, as both native records use `basic_turret_lvl1`.

`node scripts/goblin-assets.mjs` rebuilds the shipped sprites from `matte.png`; `--check` compares exact output bytes. Processing keys the magenta background, preserves the green banner, crops the two subjects, and registers each to a 512-pixel canvas. Foundations occupy 430 pixels horizontally and end at y=451. Side-corner centers are measured separately for scene anchoring. Generated foundation projection is approximate; it is not evidence for changing the simulation's tile geometry.

`generated.png` retains the initial output including its unwanted checkerboard; `matte.png` is the corrected source. The original generator outputs also remain in the Codex generated-images directory.
