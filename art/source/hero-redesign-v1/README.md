# Matching hero artwork

Generated with the built-in imagegen tool for the request to redo the other five heroes like
the Barbarian King. Each `*-prompt.txt` is the exact generation prompt. Inputs were the existing
`art/source/king-v1/front-left.png` style sheet and that hero's catalog portrait in
`public/assets/catalog-native/roster/`. No API key or CLI generation was used.

The five original RGBA outputs are retained as `*-generated.png`. They contain real alpha;
RGB-only image previews can show the hidden background colors. Preserve their alpha. Three
background-only correction attempts were inspected but not selected; the original outputs
already composite cleanly onto the battlefield.

Each sheet contains six columns and four rows: front-left, front-right, back-left, back-right.
Each row provides idle, two move contacts, windup, strike, recovery. The importer produces
24 fixed 256px cells per hero, uses one scale across each complete sheet and registers the
feet/hover point to baseline 216. Runtime motion uses the move contacts with intervening idle
poses. Attacks map strike/recovery/idle/windup to the current combat cooldown. Death uses a
stationary directional recovery pose with the game's existing fade, rather than a new fall clip.
Four authored directions are shared across the eight runtime headings without mirroring.

`node scripts/hero-redesign-assets.mjs` builds portraits, WebP sheets, runtime atlas JSON and
the source/hash/anchor manifest. `--check` rebuilds in memory and verifies byte equality.
The King's existing approved sheets are reused by a new atlas descriptor; he was not regenerated.
Native hero packs remain available as reference assets. Pets and Guardians still use their native packs.

Shipping assets: `public/assets/characters/hero-redesign-v1/{queen,warden,champion,prince,duke}/`.
Each folder contains `portrait.webp`, `poses.webp` and `atlas.json`. The matching King descriptor
is `public/assets/characters/king-v1/atlas.json`. Presentation changes do not alter combat rules.
