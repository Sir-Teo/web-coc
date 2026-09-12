# Barbarian King artwork and directional animation

September 11, 2026. The prototype's bearded, caped fantasy king is replaced with a closer interpretation of the default Barbarian King: bronze crenellated crown, blond horseshoe mustache and clean chin, red crossed straps, bare chest, brown kilt/sandals, steel shoulder plate, bronze spiked gauntlet and broad notched sword. The portrait and battle sprite now share that identity.

## Reference and source record

The identity reference is [Supercell Make's official King render](https://make.supercell.com/img/characters/barb-king-large.png), published through its [character assets page](https://make.supercell.com/en/create/clash-of-clans/troop-design/assets). Its downloaded SHA-256 and the complete generation history are recorded in [provenance.json](../art/source/king-v1/provenance.json). The reference is used for comparison and generation input; the native image is not a shipping asset.

Nine calls to the **built-in imagegen tool** produced four directional source sheets and a replacement rear-right attack strip. Original outputs, including rejected cells, are retained under `art/source/king-v1/`. The first output drew an opaque checkerboard; a correction supplied a flat magenta matte. Further corrections fixed repeated walk strides and sword/gauntlet swaps. The rear-right attack cells remained inconsistent after a sheet correction, so a new strip was generated from a crop of the correct idle identity. The importer replaces all three rejected attack cells.

Exact prompt set:

- [Front-left](../art/source/king-v1/front-left-prompt.txt), [matte/gutter correction](../art/source/king-v1/front-left-correction.txt)
- [Front-right](../art/source/king-v1/front-right-prompt.txt), [anatomy/stride correction](../art/source/king-v1/front-right-correction.txt)
- [Back-left](../art/source/king-v1/back-left-prompt.txt), [stride correction](../art/source/king-v1/back-left-correction.txt)
- [Back-right](../art/source/king-v1/back-right-prompt.txt), [sheet correction](../art/source/king-v1/back-right-correction.txt), [replacement attack strip](../art/source/king-v1/back-right-attack-prompt.txt)

## Shipping assets

| Use | File | Format |
| --- | --- | --- |
| Hero Hall and battle card | [portrait.webp](../public/assets/characters/king-v1/portrait.webp) | Transparent lossless WebP |
| Front-left poses | [front-left.webp](../public/assets/characters/king-v1/front-left.webp) | 2304×256, nine 256px frames |
| Front-right poses | [front-right.webp](../public/assets/characters/king-v1/front-right.webp) | 2304×256, nine 256px frames |
| Rear-left poses | [back-left.webp](../public/assets/characters/king-v1/back-left.webp) | 2304×256, nine 256px frames |
| Rear-right poses | [back-right.webp](../public/assets/characters/king-v1/back-right.webp) | 2304×256, nine 256px frames |

The five files total **1,223,036 bytes**. `node scripts/king-assets.mjs` removes the chroma matte, neutralizes filtered edge spill, extracts measured cell boundaries and registers the pelvis/foot plane. Front-right sword swings require wider source cuts than exact thirds. A small blade fragment from a rejected rear-right strike is excluded from the preceding walk cell's gutter. The runtime cells retain clear outer margins, including sword travel below the feet; their ground origin is pixel 216 of 256. All poses within a directional sheet share scale. The separately generated attack strip is scaled to match the rear-right body.

`node scripts/king-assets.mjs --check` rebuilds all five files and checks byte equality. The importer is included in `npm run assets` and CI. The ordinary production build never calls an image service. Original prototype files remain available to their original generator, but `asset('king')` routes to the new portrait and combat loads the four new atlases.

## Runtime behavior

Each direction contains **idle, four walk poses, windup, strike, follow-through and recovery**. Ground navigation chooses the walking view; attacking chooses the target's center. Straight screen axes retain the previous quarter to avoid flicker. The renderer does not mirror the King, so the sword remains in his left hand and the pauldron/gauntlet on his right arm across views.

Walking cycles every 160ms of battle time. The old procedural bob and image-tilt attack recoil are removed for this hero. Sword poses follow the existing 1.2-second attack cooldown: strike when damage lands, follow-through, recovery, rest, then windup before the next hit. This does **not** add a first-hit windup to the simulation; the first strike still lands immediately under the current combat rules. Native action-frame timing remains unverified.

Reduced motion uses the directional idle frame. Pause and replay speed use the same battle clock. A reconstructed casualty chooses its view/frame at its recorded defeat time before applying the shared fall/fade; ending a battle clears it. Gold equipment tint and purple spell tint retain their existing battle-time behavior. The health bar uses a crown-height offset rather than the full padded atlas height.

No balance, permanent-save or replay-input rules change: save version remains 4 and combat version remains 23. Existing compatible replays display the new presentation.

## Validation and limits

Asset checks cover all 36 unique frames, transparent margins, sufficient silhouette coverage, filtered matte removal and the versioned portrait. Pose checks cover four navigation quarters, target-facing attacks, straight-axis stability, four strides, reduced motion and cooldown-driven attack poses. Six browser scenarios cover the actual decoded texture pixels, panels at 1440/390/320px, all directions/poses, absence of mirroring and procedural bob, pause, reduced motion, directional casualty reconstruction, repeated replay seeks and cleanup. See [QA.md](QA.md) for final run counts and production evidence.

These are generated interpretations of the reference, not pixel-identical native assets. Four quarter views leave intermediate angles approximated. Full native turntables, exact gait/action timing, level/skin variants, dedicated defeat/ability sequences, sound matching and physical-device review remain unfinished. The broader production-clone goal, full equipment system and online systems remain open.
