# Campaign scenery sprites

Generated using the built-in image_gen tool. The original 1254×1254 PNG and exact prompt are retained here. [Provenance](provenance.json) records the source hash, reference and known limitations.

Sixteen sprites cover pine, rock, sharp rock, stump, log, mushrooms, tombstone, torch, goblin pole, windmeter, campfire, statue, skull flag, arrow flag, flowers and Christmas tree. The runtime preserves each native object ID and tile position, while some export variants share these generated silhouettes. These are visual approximations, not verified native pixels.

`node scripts/campaign-scenery-assets.mjs` extracts the magenta matte, slices and trims the sheet, fits each subject inside 212×208 pixels and registers its bottom at y=225 on a 256×256 alpha canvas. Output is lossless WebP under `public/assets/environment/campaign/`. `--check` verifies exact derived bytes.

Native client combat flags make all campaign scenery passable; most objects fade. Rendering uses 50% alpha for flagged objects. This opacity and the sprite sizes remain visual calibration choices, not extracted native animation parameters.
